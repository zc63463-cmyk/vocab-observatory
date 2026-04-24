export function EmptyState({
  title,
  description,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="panel rounded-[1.5rem] p-8 text-center">
      <h3 className="section-title text-2xl font-semibold">{title}</h3>
      <p className="mt-3 text-sm text-[var(--color-ink-soft)]">{description}</p>
    </div>
  );
}
