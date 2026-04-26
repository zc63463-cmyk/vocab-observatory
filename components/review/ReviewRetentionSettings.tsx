"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

interface ReviewRetentionSettingsProps {
  averageDesiredRetention: number;
  initialDesiredRetention: number;
  trackedWords: number;
}

const presetOptions = [85, 90, 95, 97];

function toPercent(value: number) {
  return Math.round(value * 100);
}

function getRetentionModeLabel(percent: number) {
  if (percent >= 95) {
    return "Conservative";
  }

  if (percent >= 90) {
    return "Balanced";
  }

  if (percent >= 80) {
    return "Faster";
  }

  return "Aggressive";
}

export function ReviewRetentionSettings({
  averageDesiredRetention,
  initialDesiredRetention,
  trackedWords,
}: ReviewRetentionSettingsProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [pending, setPending] = useState(false);
  const [retentionPercent, setRetentionPercent] = useState(() =>
    String(toPercent(initialDesiredRetention)),
  );
  const [retuneExisting, setRetuneExisting] = useState(false);

  const parsedPercent = Number(retentionPercent);
  const isValidPercent =
    Number.isFinite(parsedPercent) && parsedPercent >= 70 && parsedPercent <= 99;
  const desiredRetention = isValidPercent
    ? parsedPercent / 100
    : initialDesiredRetention;
  const averagePercent = toPercent(averageDesiredRetention);
  const hasMixedRetention =
    Math.abs(averageDesiredRetention - initialDesiredRetention) >= 0.005;
  const hasChanges =
    (isValidPercent &&
      Math.abs(desiredRetention - initialDesiredRetention) >= 0.0005) ||
    retuneExisting;
  const modeLabel = useMemo(
    () => getRetentionModeLabel(isValidPercent ? parsedPercent : averagePercent),
    [averagePercent, isValidPercent, parsedPercent],
  );

  function handleSave() {
    if (!isValidPercent || pending) {
      return;
    }

    setPending(true);
    startTransition(async () => {
      try {
        const response = await fetch("/api/review/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            desiredRetention,
            retuneExisting,
          }),
        });
        const payload = (await response.json()) as {
          desiredRetention?: number;
          error?: string;
          retunedCount?: number;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to save review settings.");
        }

        setRetuneExisting(false);
        addToast(
          retuneExisting && payload.retunedCount
            ? `Saved retention and retuned ${payload.retunedCount} review cards.`
            : "Saved review retention.",
          "success",
        );
        router.refresh();
      } catch (error) {
        addToast(
          error instanceof Error
            ? error.message
            : "Failed to save review settings.",
          "error",
        );
      } finally {
        setPending(false);
      }
    });
  }

  return (
    <div className="mt-5 rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            Review Target
          </p>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {modeLabel} mode, default {toPercent(initialDesiredRetention)}%.
            {hasMixedRetention
              ? ` Active cards average ${averagePercent}%.`
              : " Active cards are aligned."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {presetOptions.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              size="sm"
              active={parsedPercent === option}
              onClick={() => setRetentionPercent(String(option))}
            >
              {option}%
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,220px)_1fr]">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-[var(--color-ink)]">
            Desired retention (%)
          </span>
          <Input
            type="number"
            min={70}
            max={99}
            step={1}
            value={retentionPercent}
            onChange={(event) => setRetentionPercent(event.target.value)}
            inputMode="numeric"
            aria-invalid={!isValidPercent}
          />
        </label>

        <div className="flex flex-col justify-between gap-4 rounded-[1.1rem] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <label className="flex items-start gap-3 text-sm text-[var(--color-ink-soft)]">
            <input
              type="checkbox"
              checked={retuneExisting}
              disabled={trackedWords === 0}
              onChange={(event) => setRetuneExisting(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border border-[var(--color-border)] accent-[var(--color-accent)]"
            />
            <span>
              Recompute current due dates now for mature review cards.
              {trackedWords > 0 ? ` Tracked cards: ${trackedWords}.` : " No tracked cards yet."}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              disabled={!isValidPercent || !hasChanges || pending}
              onClick={handleSave}
            >
              {pending ? "Saving..." : "Save Target"}
            </Button>
            {!isValidPercent ? (
              <span className="text-xs text-[var(--color-accent-2)]">
                Enter a value between 70 and 99.
              </span>
            ) : (
              <span className="text-xs text-[var(--color-ink-soft)]">
                Higher targets shorten intervals and reduce tolerated forgetting.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
