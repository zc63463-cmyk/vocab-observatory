"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { DrillCandidate } from "./types";
import { DRILL_MODES, type DrillMode } from "@/lib/review/drill";

const STATE_CHIPS: Array<{ id: string; label: string }> = [
  { id: "all", label: "全部" },
  { id: "learning", label: "学习中" },
  { id: "review", label: "复习" },
  { id: "relearning", label: "重学" },
];

interface DrillWordPickerProps {
  candidates: ReadonlyArray<DrillCandidate>;
  onStart: (selected: DrillCandidate[], mode: DrillMode) => void;
  onExit: () => void;
}

/**
 * Multi-select word picker for drill mode.
 *
 * Design:
 *   - Search + state filter drive a derived visible list. Selection is
 *     stored as a Set<progressId> so toggling is O(1) and selection
 *     survives filter changes. The "select all visible" / "clear" actions
 *     only touch rows in the current filter, so a user can layer filter
 *     passes (e.g. select all 'learning', then add specific 'review' rows).
 *   - No hard cap. A gentle hint appears above 50 selections because
 *     that's the size where drill sessions become >20 min of focused work.
 *   - Cards without usable examples were already filtered out at the API
 *     boundary, so every item shown is drillable.
 */
export function DrillWordPicker({ candidates, onStart, onExit }: DrillWordPickerProps) {
  const [mode, setMode] = useState<DrillMode>("cloze");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return candidates.filter((c) => {
      if (stateFilter !== "all" && c.state !== stateFilter) return false;
      if (needle === "") return true;
      return (
        c.lemma.toLowerCase().includes(needle) ||
        c.title.toLowerCase().includes(needle) ||
        (c.shortDefinition ?? "").toLowerCase().includes(needle)
      );
    });
  }, [candidates, stateFilter, search]);

  const toggle = useCallback((progressId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(progressId)) next.delete(progressId);
      else next.add(progressId);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of visible) next.add(c.progressId);
      return next;
    });
  }, [visible]);

  const clearVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of visible) next.delete(c.progressId);
      return next;
    });
  }, [visible]);

  const clearAll = useCallback(() => setSelected(new Set()), []);

  const selectedCount = selected.size;

  const handleStart = useCallback(() => {
    if (selectedCount === 0) return;
    // Preserve the user's filter-order (most recent due first since the
    // server already ordered by due_at asc) for a consistent session.
    const chosen = candidates.filter((c) => selected.has(c.progressId));
    onStart(chosen, mode);
  }, [candidates, selected, selectedCount, mode, onStart]);

  if (candidates.length === 0) {
    return (
      <EmptyState
        title="暂无可自测的词"
        description="测试模式需要词条有可用例句或释义。你可以先在复习队列里积累一些词汇再过来。"
        action={
          <Button type="button" variant="secondary" size="sm" onClick={onExit}>
            返回复习页
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Mode selector ───────────────────────────────────────────── */}
      <div className="panel rounded-[1.75rem] p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
          测试方案
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DRILL_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`flex flex-col items-start rounded-2xl border px-4 py-3 text-left transition ${
                mode === m.id
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/8"
                  : "border-[var(--color-border)] bg-[var(--color-panel)] hover:bg-[var(--color-surface-soft)]"
              }`}
              style={{
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <span
                className={`text-sm font-semibold ${
                  mode === m.id ? "text-[var(--color-accent)]" : "text-[var(--color-ink)]"
                }`}
              >
                {m.label}
              </span>
              <span className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                {m.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Filter / search row ─────────────────────────────────────── */}
      <div className="panel rounded-[1.75rem] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="搜索词 / 释义"
            aria-label="搜索词"
            className="flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {STATE_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setStateFilter(chip.id)}
                aria-pressed={stateFilter === chip.id}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  stateFilter === chip.id
                    ? "border-transparent bg-[var(--color-accent)] text-white"
                    : "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-soft)]"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-ink-soft)]">
          <span>
            可选 {candidates.length} 个 · 当前过滤后 {visible.length} 个 · 已选{" "}
            <strong className="text-[var(--color-ink)]">{selectedCount}</strong>
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={selectAllVisible}
              disabled={visible.length === 0}
            >
              全选当前
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearVisible}
              disabled={visible.length === 0}
            >
              取消当前
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={selectedCount === 0}
            >
              清空全部
            </Button>
          </div>
        </div>
      </div>

      {/* ── Word list ───────────────────────────────────────────────── */}
      <div className="panel rounded-[1.75rem] p-2 sm:p-3">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-[var(--color-ink-soft)]">
            没有匹配当前筛选的词条。
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {visible.map((c) => {
              const checked = selected.has(c.progressId);
              return (
                <li key={c.progressId}>
                  <button
                    type="button"
                    onClick={() => toggle(c.progressId)}
                    aria-pressed={checked}
                    className={`flex w-full items-start gap-3 px-3 py-3 text-left transition ${
                      checked
                        ? "bg-[var(--color-accent)]/8"
                        : "hover:bg-[var(--color-surface-soft)]"
                    }`}
                    style={{
                      touchAction: "manipulation",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                          : "border-[var(--color-border-strong)] bg-transparent"
                      }`}
                    >
                      {checked && (
                        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                          <path
                            d="M2 6L5 9L10 3"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="font-semibold text-[var(--color-ink)]">
                          {c.lemma}
                        </span>
                        <span className="text-xs text-[var(--color-ink-soft)]">
                          {c.title !== c.lemma ? c.title : ""}
                        </span>
                      </span>
                      {c.shortDefinition && (
                        <span className="mt-0.5 block truncate text-xs text-[var(--color-ink-soft)]">
                          {c.shortDefinition}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--color-ink-soft)]">
                      {c.state}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Sticky footer: start / exit ─────────────────────────────── */}
      <div className="sticky bottom-4 z-10">
        <div className="panel-strong rounded-full p-2 pl-4 shadow-lg backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[var(--color-ink-soft)]">
              {selectedCount > 50
                ? `已选 ${selectedCount} 个 · 会是一场长途`
                : `已选 ${selectedCount} 个`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onExit}
              >
                返回
              </Button>
              <Button
                type="button"
                disabled={selectedCount === 0}
                onClick={handleStart}
              >
                开始自测 →
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
