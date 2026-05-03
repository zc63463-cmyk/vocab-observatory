"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  DEFAULT_REVIEW_PREFERENCES,
  REVIEW_PROMPT_MODES,
  type ReviewPromptMode,
  type UserReviewPreferences,
} from "@/lib/review/settings";
import {
  useReviewPreferencesContext,
} from "./ReviewPreferencesProvider";

const MODE_DESCRIPTIONS: Record<
  ReviewPromptMode,
  { label: string; description: string }
> = {
  forward: {
    label: "正向（词→义）",
    description: "经典默认：看词，回想释义。第一次出现的新词只走这种。",
  },
  reverse: {
    label: "反向（义→词）",
    description: "看释义，回想词。强化产出导向的提取。",
  },
  cloze: {
    label: "完形（句中挖空）",
    description: "在例句里挖空目标词，按上下文推断。需要例句包含本词。",
  },
};

interface ReviewPreferencesFormProps {
  /**
   * Density variant. `"panel"` is the dashboard embed (full padding +
   * descriptive labels); `"popover"` is the gear-popover variant (tighter
   * spacing, single-column mode chips, smaller text).
   */
  density?: "panel" | "popover";
  /** Optional callback invoked after a successful save (e.g. close the popover). */
  onSaved?: (next: UserReviewPreferences) => void;
}

/**
 * Chrome-less, context-driven preferences form. Both the dashboard
 * `ReviewPreferencesPanel` and the in-app `ReviewPreferencesPopover`
 * render this same component — keeping the actual form logic / validation
 * / save behaviour single-sourced.
 *
 * Source of truth:
 *   - Reads `preferences` from `ReviewPreferencesProvider` context.
 *   - Mirrors them into a local `draft` state so users can stage multi-
 *     toggle changes before pressing Save (matches the retention-settings
 *     UX pattern; deliberate to give the user one explicit commit gesture
 *     rather than auto-saving on every keystroke).
 *   - Save fires `ctx.save(diff)` which optimistically updates the
 *     provider — the live zen review session sees the new modes / slider
 *     state on the very next render.
 *
 * Validation:
 *   - At least one prompt mode must remain selected. Clicking the last
 *     enabled chip is treated as a no-op so the renderer always has a
 *     defined fallback path (see `resolvePrompt` in lib/review/prompt-mode).
 */
export function ReviewPreferencesForm({
  density = "panel",
  onSaved,
}: ReviewPreferencesFormProps) {
  const ctx = useReviewPreferencesContext();
  const { addToast } = useToast();
  const isPopover = density === "popover";

  // Baseline is the last-known authoritative value (what the server has
  // committed). Reading it directly from ctx makes dirty-state derivation
  // trivial and stays correct across optimistic save flows because ctx
  // updates synchronously when ctx.save resolves.
  const baseline = ctx?.preferences ?? DEFAULT_REVIEW_PREFERENCES;

  // Lazy-init the draft from whatever ctx has at first render; clone the
  // arrays so mutating draft can never leak into the context's state.
  const [draft, setDraft] = useState<UserReviewPreferences>(() => ({
    predictionEnabled: baseline.predictionEnabled,
    promptModes: [...baseline.promptModes],
  }));
  const [saving, setSaving] = useState(false);

  // One-shot "adopt server values" effect. When the form mounts before
  // the provider's initial fetch resolves, the lazy init above seeds
  // draft with defaults; this effect swaps in the real values exactly
  // once when ctx finishes loading. After that we never auto-sync —
  // user gestures are the only thing that mutates draft, so a cross-tab
  // change won't yank text out from under their fingers.
  const adoptedRef = useRef(false);
  useEffect(() => {
    if (adoptedRef.current) return;
    if (!ctx || ctx.loading) return;
    adoptedRef.current = true;
    setDraft({
      predictionEnabled: ctx.preferences.predictionEnabled,
      promptModes: [...ctx.preferences.promptModes],
    });
  }, [ctx]);

  const dirty = useMemo(
    () => !preferencesEqual(baseline, draft),
    [baseline, draft],
  );

  function toggleMode(mode: ReviewPromptMode) {
    setDraft((prev) => {
      const has = prev.promptModes.includes(mode);
      const next = has
        ? prev.promptModes.filter((m) => m !== mode)
        : [...prev.promptModes, mode];
      if (next.length === 0) return prev; // Always keep ≥1 mode selected.
      return {
        ...prev,
        promptModes: REVIEW_PROMPT_MODES.filter((m) => next.includes(m)),
      };
    });
  }

  function togglePrediction(checked: boolean) {
    setDraft((prev) => ({ ...prev, predictionEnabled: checked }));
  }

  async function handleSave() {
    if (!dirty || saving || !ctx) return;
    setSaving(true);
    try {
      const partial: Partial<UserReviewPreferences> = {};
      if (draft.predictionEnabled !== baseline.predictionEnabled) {
        partial.predictionEnabled = draft.predictionEnabled;
      }
      if (!arraysEqual(draft.promptModes, baseline.promptModes)) {
        partial.promptModes = draft.promptModes;
      }
      const next = await ctx.save(partial);
      // Provider has already updated `ctx.preferences` (the baseline)
      // optimistically + reconciled with the server's reply. Pulling
      // draft up to `next` snaps it back to clean — no separate
      // baseline state to maintain.
      setDraft({
        predictionEnabled: next.predictionEnabled,
        promptModes: [...next.promptModes],
      });
      addToast("已保存复习体验偏好", "success");
      onSaved?.(next);
    } catch (err) {
      addToast(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={isPopover ? "space-y-3" : "space-y-4"}>
      <fieldset>
        <legend
          className={
            isPopover
              ? "text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]"
              : "text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]"
          }
        >
          正面模式 · Prompt Modes
        </legend>
        {!isPopover && (
          <p className="mt-1 text-xs leading-5 text-[var(--color-ink-soft)] opacity-80">
            每张卡随机抽一种允许的模式；新卡（第一次出现）始终走正向。
          </p>
        )}
        <div
          className={
            isPopover
              ? "mt-2 grid gap-1.5"
              : "mt-3 grid gap-2 md:grid-cols-3"
          }
        >
          {REVIEW_PROMPT_MODES.map((mode) => {
            const meta = MODE_DESCRIPTIONS[mode];
            const checked = draft.promptModes.includes(mode);
            return (
              <button
                key={mode}
                type="button"
                onClick={() => toggleMode(mode)}
                aria-pressed={checked}
                className={`flex flex-col items-start gap-1 rounded-2xl border ${
                  isPopover ? "p-2.5" : "p-3"
                } text-left transition-colors ${
                  checked
                    ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/8"
                    : "border-[var(--color-border)] bg-[var(--color-panel)]"
                }`}
                style={{
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span className="flex w-full items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 items-center justify-center rounded-sm border ${
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
                  <span
                    className={`${
                      isPopover ? "text-xs" : "text-sm"
                    } font-semibold text-[var(--color-ink)]`}
                  >
                    {meta.label}
                  </span>
                </span>
                {!isPopover && (
                  <span className="text-xs leading-5 text-[var(--color-ink-soft)]">
                    {meta.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div
        className={`rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] ${
          isPopover ? "p-3" : "p-4"
        }`}
      >
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <span className={isPopover ? "space-y-0.5" : "space-y-1"}>
            <span
              className={`block ${
                isPopover ? "text-xs" : "text-sm"
              } font-semibold text-[var(--color-ink)]`}
            >
              翻面前自评把握度
            </span>
            <span
              className={`block ${
                isPopover ? "text-[11px]" : "text-xs"
              } leading-5 text-[var(--color-ink-soft)]`}
            >
              {isPopover
                ? "0–100% 滑块；翻面前必填，作为校准信号。"
                : "先给出 0–100% 把握度再翻面。系统会比对预测与实际评分，培养元认知，每张卡的差值都会进入会话总结。"}
            </span>
          </span>
          <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={draft.predictionEnabled}
              onChange={(e) => togglePrediction(e.currentTarget.checked)}
            />
            <span
              className="absolute inset-0 rounded-full transition-colors bg-[var(--color-border)] peer-checked:bg-[var(--color-accent)]"
              aria-hidden="true"
            />
            <span
              className="absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"
              aria-hidden="true"
            />
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() =>
              setDraft({
                predictionEnabled: baseline.predictionEnabled,
                promptModes: [...baseline.promptModes],
              })
            }
          >
            放弃改动
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}

function preferencesEqual(
  a: UserReviewPreferences,
  b: UserReviewPreferences,
): boolean {
  return (
    a.predictionEnabled === b.predictionEnabled &&
    arraysEqual(a.promptModes, b.promptModes)
  );
}

function arraysEqual<T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
