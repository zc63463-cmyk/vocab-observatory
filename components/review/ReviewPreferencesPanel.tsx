"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  DEFAULT_REVIEW_PREFERENCES,
  REVIEW_PROMPT_MODES,
  type ReviewPromptMode,
  type UserReviewPreferences,
} from "@/lib/review/settings";

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

/**
 * Read-write settings panel for the two front-face UX preferences:
 *
 *   - **prompt modes** — which front-face flavours the per-card resolver
 *     is allowed to pick from. At least one mode must remain selected;
 *     deselecting the last one snaps back to forward to keep the renderer
 *     defined.
 *
 *   - **prediction-enabled** — gates the pre-flip self-calibration slider.
 *     When on, the user must commit a 0–100 % confidence before each flip.
 *     When off the slider isn't rendered at all and submitRating sends no
 *     prediction key.
 *
 * Mirrors the structural pattern used by `ReviewRetentionSettings`: client-
 * side optimistic state + a single Save button that hits the dedicated API
 * endpoint and then replays the server-confirmed state back into local
 * preferences. We deliberately don't auto-save on every toggle: the user
 * may want to toggle several preferences in one session and only commit
 * once, mirroring how retention settings are persisted.
 */
export function ReviewPreferencesPanel() {
  const { addToast } = useToast();
  const [initial, setInitial] = useState<UserReviewPreferences>(
    DEFAULT_REVIEW_PREFERENCES,
  );
  const [draft, setDraft] = useState<UserReviewPreferences>(
    DEFAULT_REVIEW_PREFERENCES,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/review/preferences", { method: "GET" });
        if (!res.ok) throw new Error("无法读取偏好设置");
        const payload = (await res.json()) as UserReviewPreferences;
        if (!cancelled) {
          setInitial(payload);
          setDraft(payload);
        }
      } catch (err) {
        if (!cancelled) {
          addToast(
            err instanceof Error ? err.message : "无法读取偏好设置",
            "error",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addToast]);

  const dirty = useMemo(
    () => !preferencesEqual(initial, draft),
    [initial, draft],
  );

  function toggleMode(mode: ReviewPromptMode) {
    setDraft((prev) => {
      const has = prev.promptModes.includes(mode);
      const next = has
        ? prev.promptModes.filter((m) => m !== mode)
        : [...prev.promptModes, mode];
      // At least one mode must stay selected; clicking the last one
      // is treated as a no-op so the renderer always has a valid path.
      if (next.length === 0) return prev;
      return { ...prev, promptModes: REVIEW_PROMPT_MODES.filter((m) => next.includes(m)) };
    });
  }

  function togglePrediction(checked: boolean) {
    setDraft((prev) => ({ ...prev, predictionEnabled: checked }));
  }

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const body: Partial<UserReviewPreferences> = {};
      if (draft.predictionEnabled !== initial.predictionEnabled) {
        body.predictionEnabled = draft.predictionEnabled;
      }
      if (!arraysEqual(draft.promptModes, initial.promptModes)) {
        body.promptModes = draft.promptModes;
      }
      const res = await fetch("/api/review/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as UserReviewPreferences & {
        error?: unknown;
      };
      if (!res.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "保存失败",
        );
      }
      setInitial(payload);
      setDraft(payload);
      addToast("已保存复习体验偏好", "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
          Review Experience
        </p>
        <p className="text-sm text-[var(--color-ink-soft)]">
          调节卡片正面的呈现方式与翻面前的自我校准。{loading ? "（加载中...）" : ""}
        </p>
      </div>

      <fieldset className="mt-4">
        <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
          正面模式 · Prompt Modes
        </legend>
        <p className="mt-1 text-xs leading-5 text-[var(--color-ink-soft)] opacity-80">
          每张卡随机抽一种允许的模式；新卡（第一次出现）始终走正向。
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {REVIEW_PROMPT_MODES.map((mode) => {
            const meta = MODE_DESCRIPTIONS[mode];
            const checked = draft.promptModes.includes(mode);
            return (
              <button
                key={mode}
                type="button"
                disabled={loading}
                onClick={() => toggleMode(mode)}
                aria-pressed={checked}
                className={`flex flex-col items-start gap-1.5 rounded-2xl border p-3 text-left transition-colors ${
                  checked
                    ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/8"
                    : "border-[var(--color-border)] bg-[var(--color-panel)]"
                } disabled:cursor-not-allowed disabled:opacity-60`}
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
                  <span className="text-sm font-semibold text-[var(--color-ink)]">
                    {meta.label}
                  </span>
                </span>
                <span className="text-xs leading-5 text-[var(--color-ink-soft)]">
                  {meta.description}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <span className="space-y-1">
            <span className="block text-sm font-semibold text-[var(--color-ink)]">
              翻面前自评把握度
            </span>
            <span className="block text-xs leading-5 text-[var(--color-ink-soft)]">
              先给出 0–100% 把握度再翻面。系统会比对预测与实际评分，培养元认知，每张卡的差值都会进入会话总结。
            </span>
          </span>
          <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              disabled={loading}
              checked={draft.predictionEnabled}
              onChange={(e) => togglePrediction(e.currentTarget.checked)}
            />
            <span
              className="absolute inset-0 rounded-full transition-colors bg-[var(--color-border)] peer-checked:bg-[var(--color-accent)] peer-disabled:opacity-50"
              aria-hidden="true"
            />
            <span
              className="absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"
              aria-hidden="true"
            />
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => setDraft(initial)}
          >
            放弃改动
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving || loading}
          onClick={handleSave}
        >
          {saving ? "保存中..." : "保存偏好"}
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
