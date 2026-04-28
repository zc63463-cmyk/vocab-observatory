"use client";

interface OmniSectionProps {
  title: string;
}

export function OmniSection({ title }: OmniSectionProps) {
  return (
    <div className="px-4 pt-3 pb-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
        {title}
      </span>
    </div>
  );
}
