const ratings = [
  { key: "again", label: "Again", className: "bg-[rgba(178,87,47,0.12)] text-[var(--color-accent-2)]" },
  { key: "hard", label: "Hard", className: "bg-[rgba(243,220,162,0.55)] text-[var(--color-ink)]" },
  { key: "good", label: "Good", className: "bg-[var(--color-surface-muted)] text-[var(--color-accent)]" },
  { key: "easy", label: "Easy", className: "bg-[rgba(15,111,98,0.2)] text-[var(--color-accent)]" },
] as const;

export function RatingButtons({
  disabled,
  onRate,
}: {
  disabled?: boolean;
  onRate: (rating: "again" | "hard" | "good" | "easy") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {ratings.map((rating) => (
        <button
          key={rating.key}
          type="button"
          disabled={disabled}
          onClick={() => onRate(rating.key)}
          className={`rounded-2xl px-4 py-4 text-sm font-semibold transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-70 ${rating.className}`}
        >
          {rating.label}
        </button>
      ))}
    </div>
  );
}
