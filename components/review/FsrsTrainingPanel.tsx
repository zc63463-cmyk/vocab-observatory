"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { FsrsTrainingStatus } from "@/lib/review/training-status";

interface FsrsTrainingPanelProps {
  initialStatus: FsrsTrainingStatus;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString();
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

/**
 * Owner-only control for personalised FSRS w-parameters.
 *
 * Shows current training status and lets the user retrain or revert. Initial
 * status is server-rendered so we don't flash a "loading" state on first
 * paint; subsequent state updates come from the API responses themselves.
 */
export function FsrsTrainingPanel({ initialStatus }: FsrsTrainingPanelProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [status, setStatus] = useState<FsrsTrainingStatus>(initialStatus);
  const [pending, setPending] = useState<"train" | "reset" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const { eligibility, weights } = status;
  const isTraining = pending === "train";
  const isResetting = pending === "reset";

  function applyStatusFromResponse(payload: unknown): FsrsTrainingStatus | null {
    // Defensive parse: the route returns FsrsTrainingStatus on success, but
    // we never want a malformed body to corrupt local UI state.
    if (!payload || typeof payload !== "object") return null;
    const candidate = payload as Partial<FsrsTrainingStatus> & {
      eligibility?: Partial<FsrsTrainingStatus["eligibility"]>;
    };
    if (!candidate.eligibility) return null;
    const elig = candidate.eligibility;
    if (
      typeof elig.canTrain !== "boolean" ||
      typeof elig.minRequired !== "number" ||
      typeof elig.totalReviews !== "number"
    ) {
      return null;
    }
    return {
      eligibility: {
        canTrain: elig.canTrain,
        minRequired: elig.minRequired,
        totalReviews: elig.totalReviews,
      },
      weights: candidate.weights ?? null,
    };
  }

  function handleTrain() {
    if (pending) return;
    if (!eligibility.canTrain) return;

    setPending("train");
    startTransition(async () => {
      try {
        const response = await fetch("/api/review/train-weights", {
          method: "POST",
        });
        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          const message =
            (payload as { error?: string } | null)?.error ??
            "Training failed.";
          throw new Error(message);
        }
        const next = applyStatusFromResponse(payload);
        if (next) setStatus(next);
        addToast(
          next?.weights
            ? `Trained on ${formatNumber(next.weights.sampleSize)} reviews.`
            : "Training completed.",
          "success",
        );
        // Refresh server data so dashboard charts pick up the new weights.
        router.refresh();
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Training failed.",
          "error",
        );
      } finally {
        setPending(null);
      }
    });
  }

  function handleReset() {
    if (pending) return;

    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }

    setPending("reset");
    setConfirmReset(false);
    startTransition(async () => {
      try {
        const response = await fetch("/api/review/train-weights", {
          method: "DELETE",
        });
        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          const message =
            (payload as { error?: string } | null)?.error ??
            "Failed to clear weights.";
          throw new Error(message);
        }
        const next = applyStatusFromResponse(payload);
        if (next) setStatus(next);
        addToast("Reverted to default FSRS weights.", "success");
        router.refresh();
      } catch (error) {
        addToast(
          error instanceof Error
            ? error.message
            : "Failed to clear weights.",
          "error",
        );
      } finally {
        setPending(null);
      }
    });
  }

  const progressPercent = Math.min(
    100,
    Math.max(
      0,
      Math.round((eligibility.totalReviews / eligibility.minRequired) * 100),
    ),
  );

  return (
    <div className="mt-5 rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            Personalised FSRS weights
          </p>
          {weights ? (
            <p className="text-sm text-[var(--color-ink-soft)]">
              Trained on {formatNumber(weights.sampleSize)} reviews,{" "}
              {formatDateTime(weights.trainedAt)}.
            </p>
          ) : (
            <p className="text-sm text-[var(--color-ink-soft)]">
              Using ts-fsrs defaults. Train once you have at least{" "}
              {formatNumber(eligibility.minRequired)} reviews to switch to a
              personalised forgetting curve.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!eligibility.canTrain || pending !== null}
            onClick={handleTrain}
          >
            {isTraining
              ? "Training..."
              : weights
                ? "Retrain"
                : "Train weights"}
          </Button>
          {weights ? (
            <Button
              type="button"
              variant={confirmReset ? "danger" : "ghost"}
              size="sm"
              disabled={pending !== null}
              onClick={handleReset}
              onBlur={() => setConfirmReset(false)}
            >
              {isResetting
                ? "Reverting..."
                : confirmReset
                  ? "Click again to confirm"
                  : "Revert"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-[var(--color-ink-soft)]">
          <span>
            Reviews available: {formatNumber(eligibility.totalReviews)} /{" "}
            {formatNumber(eligibility.minRequired)}
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--color-panel)]">
          <div
            className="h-full rounded-full transition-all"
            style={{
              backgroundColor: eligibility.canTrain
                ? "var(--color-accent)"
                : "var(--color-ink-soft)",
              width: `${progressPercent}%`,
            }}
          />
        </div>
      </div>

      {weights ? (
        <details className="mt-4 text-xs text-[var(--color-ink-soft)]">
          <summary className="cursor-pointer select-none font-semibold uppercase tracking-[0.16em]">
            Inspect weights ({weights.weights.length})
          </summary>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
            {weights.weights.map((value, index) => (
              <div
                key={index}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 font-mono text-[11px] tabular-nums text-[var(--color-ink)]"
                title={`w[${index}] = ${value}`}
              >
                <span className="text-[var(--color-ink-soft)]">w{index}</span>{" "}
                {value.toFixed(4)}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
