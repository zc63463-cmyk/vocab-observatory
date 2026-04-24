export function MetricCard({
  label,
  tone = "cool",
  value,
}: {
  label: string;
  tone?: "cool" | "warm";
  value: number | string;
}) {
  return (
    <div
      className={`panel rounded-[1.5rem] p-5 ${
        tone === "cool"
          ? "border-[rgba(15,111,98,0.18)]"
          : "border-[rgba(178,87,47,0.18)]"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p className="mt-3 section-title text-4xl font-semibold">{value}</p>
    </div>
  );
}
