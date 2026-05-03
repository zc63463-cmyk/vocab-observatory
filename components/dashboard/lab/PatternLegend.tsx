"use client";

import { useId, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PATTERNS, SECTION_META, type SectionId } from "./sections";

const RECENT_KEY = "vocab-lab-recent-patterns";
const RECENT_CHANGE_EVENT = "vocab-lab-recent-update";
const MAX_RECENT = 3;

/* ── Recent-patterns external store ────────────────────────────────────
 * Implements the `useSyncExternalStore` contract instead of the more
 * obvious `useState + useEffect` pattern, because the project lint
 * config forbids `react-hooks/set-state-in-effect` (see `AGENTS.md`
 * and the canonical implementation in `@/components/layout/MobileNav.tsx`).
 *
 * Cross-tab updates already flow through the native `storage` event;
 * intra-tab updates dispatch the custom `RECENT_CHANGE_EVENT` after
 * `setItem` so any other component using this store re-renders too.
 *
 * Snapshot stability: we cache by raw JSON string. While the underlying
 * storage value is unchanged, `getRecentSnapshot` returns the same
 * array reference, satisfying React's strict-equality requirement.
 */
let cachedRaw: string | null | undefined = undefined; // undefined = never read
let cachedValue: SectionId[] = [];
const EMPTY_SECTION_ARRAY: SectionId[] = [];

function getRecentSnapshot(): SectionId[] {
  if (typeof window === "undefined") return EMPTY_SECTION_ARRAY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(RECENT_KEY);
  } catch {
    return EMPTY_SECTION_ARRAY;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  if (!raw) {
    cachedValue = EMPTY_SECTION_ARRAY;
    return cachedValue;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      cachedValue = parsed.filter((s): s is SectionId => typeof s === "string");
    } else {
      cachedValue = EMPTY_SECTION_ARRAY;
    }
  } catch {
    cachedValue = EMPTY_SECTION_ARRAY;
  }
  return cachedValue;
}

function getRecentServerSnapshot(): SectionId[] {
  return EMPTY_SECTION_ARRAY;
}

function subscribeRecent(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(RECENT_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(RECENT_CHANGE_EVENT, callback);
  };
}

function pushRecent(sectionId: SectionId) {
  if (typeof window === "undefined") return;
  const current = getRecentSnapshot();
  const next = [sectionId, ...current.filter((s) => s !== sectionId)].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    // Same-tab listeners don't get the native `storage` event, so we
    // dispatch a synthetic one to wake `useSyncExternalStore` subscribers.
    window.dispatchEvent(new Event(RECENT_CHANGE_EVENT));
  } catch {
    /* localStorage quota or disabled — non-fatal, recent ranking just
       won't persist across sessions. */
  }
}

/**
 * Collapsible legend listing every registered pattern.
 *
 * Serves three purposes:
 *   1. **Discoverability** — first-time users learn which gestures unlock
 *      which sections.
 *   2. **Accessibility fallback** — each row is a real `<button>`, so
 *      keyboard / screen-reader users get equivalent access without
 *      drawing patterns.
 *   3. **Power-user shortcut** — the most-recent N patterns float to
 *      the top via localStorage, so frequent destinations are always
 *      one tap away.
 *
 * Visual: each row shows a 48×48 SVG miniature of the pattern, the
 * Chinese name, the section title it opens, and the eyebrow / English
 * label as secondary text.
 */
export interface PatternLegendProps {
  onSelect: (sectionId: SectionId) => void;
  /** Whether the legend is open; controlled by parent. */
  open: boolean;
  onToggle: () => void;
}

export function PatternLegend({ onSelect, open, onToggle }: PatternLegendProps) {
  const recent = useSyncExternalStore(
    subscribeRecent,
    getRecentSnapshot,
    getRecentServerSnapshot,
  );
  /* Unique id per legend instance — the dashboard mounts two
     PatternLegend components (one in MobileLayout, one in DesktopLayout)
     simultaneously via CSS toggle; hand-coded string ids would collide
     and confuse screen readers. `useId` gives each its own SSR-safe id. */
  const regionId = useId();

  const handleSelect = (sectionId: SectionId) => {
    pushRecent(sectionId);
    onSelect(sectionId);
  };

  // Sort so recent patterns appear first
  const sortedPatterns = [...PATTERNS].sort((a, b) => {
    const aIdx = recent.indexOf(a.sectionId);
    const bIdx = recent.indexOf(b.sectionId);
    if (aIdx === -1 && bIdx === -1) return 0;
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={regionId}
        className="flex w-full items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3 text-sm font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
        style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
      >
        <span>{open ? "收起图案图例" : "查看图案图例"}</span>
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={regionId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              {recent.length > 0 && (
                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)] opacity-70">
                  最近使用
                </p>
              )}

              {sortedPatterns.map((pattern, idx) => {
                const meta = SECTION_META[pattern.sectionId];
                const isRecent = recent.includes(pattern.sectionId);
                const isFirstNonRecent =
                  recent.length > 0 && !isRecent && idx === recent.length;

                return (
                  <div key={pattern.key}>
                    {isFirstNonRecent && (
                      <p className="mt-3 mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)] opacity-70">
                        全部图案
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSelect(pattern.sectionId)}
                      className="group flex w-full items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-3 text-left transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)] active:scale-[0.99]"
                      style={{
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      <PatternMiniature dots={pattern.key.split("-").map(Number)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-semibold text-[var(--color-ink)]">
                            {meta.title}
                          </span>
                          <span className="text-xs text-[var(--color-ink-soft)] opacity-70">
                            {pattern.glyph} {pattern.name}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-[var(--color-ink-soft)] opacity-70">
                          {meta.eyebrow} · {pattern.description}
                        </p>
                      </div>
                      <span
                        aria-hidden
                        className="text-[var(--color-ink-soft)] opacity-40 transition-opacity group-hover:opacity-80"
                      >
                        →
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Miniature pattern preview ────────────────────────────────────────── */

const MINI_SIZE = 48;
const MINI_PAD = 8;
const MINI_STEP = (MINI_SIZE - 2 * MINI_PAD) / 2;
const MINI_DOT_R = 2.4;
const MINI_DOT_R_ACTIVE = 3.6;

/**
 * Tiny SVG showing a pattern's shape. Reuses the same coordinate system
 * as `PasswordPatternLock` so visual identity is preserved.
 */
function PatternMiniature({ dots }: { dots: number[] }) {
  const visited = new Set(dots);
  const points = dots.map((idx) => {
    const i = idx - 1;
    const col = i % 3;
    const row = Math.floor(i / 3);
    return { x: MINI_PAD + col * MINI_STEP, y: MINI_PAD + row * MINI_STEP };
  });
  const linePath =
    points.length > 0
      ? `M ${points[0].x} ${points[0].y} ${points
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(" ")}`
      : null;

  return (
    <svg
      viewBox={`0 0 ${MINI_SIZE} ${MINI_SIZE}`}
      className="h-12 w-12 flex-shrink-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
      aria-hidden
    >
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
      )}
      {Array.from({ length: 9 }, (_, i) => {
        const idx = i + 1;
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = MINI_PAD + col * MINI_STEP;
        const y = MINI_PAD + row * MINI_STEP;
        const isVisited = visited.has(idx);
        return (
          <circle
            key={idx}
            cx={x}
            cy={y}
            r={isVisited ? MINI_DOT_R_ACTIVE : MINI_DOT_R}
            fill={isVisited ? "var(--color-accent)" : "var(--color-ink-soft)"}
            opacity={isVisited ? 1 : 0.35}
          />
        );
      })}
    </svg>
  );
}
