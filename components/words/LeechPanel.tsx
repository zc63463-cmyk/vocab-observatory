"use client";

import { AlertTriangle, Pause } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  LEECH_SUGGESTIONS,
  assessLeech,
  type LeechAssessment,
} from "@/lib/review/leech";
import type { OwnerWordProgressSummary } from "@/lib/words";

interface LeechPanelProps {
  /** Notified when the card transitions to suspended so the parent can refresh derived UI. */
  onSuspended?: () => void;
  progress: OwnerWordProgressSummary;
  /** Word title for the toast — falls back to a generic message. */
  wordLabel?: string;
}

function severityCopy(assessment: LeechAssessment) {
  if (assessment.severity === "severe") {
    return {
      badge: "顽固卡",
      headline: "这张卡看起来已经无法靠重复修复",
      tone: "border-[rgba(178,87,47,0.35)] bg-[rgba(178,87,47,0.08)]",
      badgeTone: "bg-[rgba(178,87,47,0.18)] text-[var(--color-accent-2)]",
    };
  }
  return {
    badge: "老大难",
    headline: "这张卡反复不过——值得换种打法",
    tone: "border-[rgba(212,140,40,0.35)] bg-[rgba(212,140,40,0.08)]",
    badgeTone: "bg-[rgba(212,140,40,0.18)] text-[#a96a14] dark:text-amber-300",
  };
}

function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function LeechPanel({ onSuspended, progress, wordLabel }: LeechPanelProps) {
  const assessment = assessLeech(progress);
  const [pendingSuspend, setPendingSuspend] = useState(false);
  const { addToast } = useToast();

  // Render nothing for healthy cards. Lifting this gate to the parent would
  // force every word page to import this module + run the detector — keeping
  // it here means the cost is only paid when the panel actually exists.
  if (!assessment) return null;

  const copy = severityCopy(assessment);

  async function handleSuspend() {
    if (pendingSuspend) return;
    setPendingSuspend(true);
    try {
      const response = await fetch("/api/review/suspend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progressId: progress.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "挂起失败");
      }
      addToast(
        wordLabel ? `已挂起「${wordLabel}」` : "已挂起该词条，复习队列不再自动出现",
        "success",
      );
      onSuspended?.();
    } catch (error) {
      addToast(error instanceof Error ? error.message : "挂起失败", "error");
    } finally {
      setPendingSuspend(false);
    }
  }

  return (
    <section
      className={`rounded-[1.75rem] border p-5 ${copy.tone}`}
      aria-labelledby="leech-panel-headline"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.6)] dark:bg-[rgba(0,0,0,0.2)]"
          aria-hidden="true"
        >
          <AlertTriangle className="h-4 w-4 text-[var(--color-accent-2)]" />
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${copy.badgeTone}`}
            >
              {copy.badge}
            </span>
            <span className="text-[11px] text-[var(--color-ink-soft)]">
              已 lapse {assessment.lapse_count} 次 · again {assessment.again_count} ·
              失败率 {formatRate(assessment.recallFailureRate)}
            </span>
          </div>
          <h3 id="leech-panel-headline" className="mt-2 text-base font-semibold leading-snug">
            {copy.headline}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--color-ink-soft)]">
            继续复习只会让队列更拥挤。试一个非重复型补救：
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {LEECH_SUGGESTIONS.map((suggestion) => {
          const isSuspend = suggestion.id === "suspend";
          return (
            <li
              key={suggestion.id}
              className="rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold">{suggestion.label}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-ink-soft)]">
                    {suggestion.description}
                  </p>
                </div>
                {isSuspend ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleSuspend}
                    disabled={pendingSuspend}
                    icon={<Pause />}
                  >
                    {pendingSuspend ? "处理中…" : "挂起"}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
