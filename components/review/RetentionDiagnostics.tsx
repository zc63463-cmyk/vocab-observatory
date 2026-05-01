import {
  RETENTION_DIAGNOSTIC_MIN_SAMPLES,
  type RetentionDiagnostic,
} from "@/lib/review/retention-diagnostics";

interface RetentionDiagnosticsProps {
  diagnostic: RetentionDiagnostic;
}

function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatSignedPoints(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}pp`;
}

/**
 * Maps suggestion kind to a headline + explanation. Kept deliberately
 * observational — no "do this" prescriptions, because disagreement between
 * observed and target retention may stem from unfitted FSRS w-parameters
 * rather than a wrong desired_retention setting.
 */
function getSuggestionContent(
  diagnostic: RetentionDiagnostic,
): { body: string; headline: string; tone: "info" | "warm" | "cool" } {
  const desiredPct = formatPercent(diagnostic.desiredRetention, 0);

  switch (diagnostic.suggestionKind) {
    case "insufficient-data":
      return {
        body: `Need at least ${RETENTION_DIAGNOSTIC_MIN_SAMPLES} due reviews over the last ${diagnostic.windowDays} days to make the estimate trustworthy. So far ${diagnostic.dueReviews} qualifying reviews are available.`,
        headline: "Collect more data to diagnose",
        tone: "info",
      };
    case "on-target":
      return {
        body: `Observed retention and the ${desiredPct} target are statistically indistinguishable over the last ${diagnostic.windowDays} days. The current setting looks well aligned with your actual memory behavior.`,
        headline: "On target",
        tone: "cool",
      };
    case "above-target":
      return {
        body: `Observed retention is reliably higher than the ${desiredPct} target. This often means scheduled intervals are shorter than needed — you could lower desired_retention to reduce workload, but the more precise fix is running an FSRS optimizer to refit the w-parameters.`,
        headline: "Retention consistently above target",
        tone: "info",
      };
    case "below-target":
      return {
        body: `Observed retention is reliably lower than the ${desiredPct} target. Before raising desired_retention, consider whether the w-parameters need re-fitting — an under-fit model can produce low observed retention even when the desired value is reasonable.`,
        headline: "Retention consistently below target",
        tone: "warm",
      };
  }
}

function ToneBadge({ tone }: { tone: "info" | "warm" | "cool" }) {
  const cls = {
    info: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    warm: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    cool: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  }[tone];
  const label = { info: "Info", warm: "Attention", cool: "Healthy" }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {label}
    </span>
  );
}

export function RetentionDiagnostics({ diagnostic }: RetentionDiagnosticsProps) {
  const suggestion = getSuggestionContent(diagnostic);
  const hasObservation = diagnostic.observedRetention != null;

  return (
    <div className="mt-4 rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            Retention diagnostic · last {diagnostic.windowDays} days
          </p>
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            {suggestion.headline}
          </p>
        </div>
        <ToneBadge tone={suggestion.tone} />
      </div>

      <p className="mt-2 text-sm leading-6 text-[var(--color-ink-soft)]">
        {suggestion.body}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DiagnosticStat
          label="Due reviews"
          value={String(diagnostic.dueReviews)}
          hint={`of ${diagnostic.totalReviews} total in window`}
        />
        <DiagnosticStat
          label="Observed retention"
          value={
            hasObservation
              ? formatPercent(diagnostic.observedRetention!, 1)
              : "—"
          }
          hint={
            diagnostic.confidenceInterval
              ? `95% CI ${formatPercent(diagnostic.confidenceInterval.low, 1)} – ${formatPercent(diagnostic.confidenceInterval.high, 1)}`
              : "Insufficient due reviews"
          }
        />
        <DiagnosticStat
          label="Desired retention"
          value={formatPercent(diagnostic.desiredRetention, 0)}
          hint="Your current target"
        />
        <DiagnosticStat
          label="Gap vs target"
          value={
            diagnostic.gap != null
              ? formatSignedPoints(diagnostic.gap, 1)
              : "—"
          }
          hint={
            diagnostic.gapSignificant
              ? "Statistically distinguishable"
              : "Within noise"
          }
        />
      </div>

      <p className="mt-3 text-[11px] leading-5 text-[var(--color-ink-soft)]">
        Methodology: only counts reviews where <code>elapsed_days ≥ scheduled_days</code>
        {" "}and <code>scheduled_days ≥ 1</code>, excluding early reviews and learning-state cards
        that would inflate the estimate. Confidence interval uses the Wilson score method.
      </p>
    </div>
  );
}

function DiagnosticStat({
  hint,
  label,
  value,
}: {
  hint: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-[var(--color-ink)]">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-[var(--color-ink-soft)]">{hint}</p>
    </div>
  );
}
