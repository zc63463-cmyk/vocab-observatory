import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Heading text */
  title: string;
  /** Description text */
  description?: string;
  /** Optional icon (rendered in a subtle circle) */
  icon?: ReactNode;
  /** Optional action (e.g. a button or link) */
  action?: ReactNode;
  /** Visual size variant */
  size?: "sm" | "md" | "lg";
}

const sizeStyles = {
  sm: "p-6",
  md: "p-8",
  lg: "p-10",
} as const;

const titleSizeStyles = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
} as const;

export function EmptyState({
  action,
  description,
  icon,
  size = "md",
  title,
}: EmptyStateProps) {
  return (
    <div className={`panel rounded-[1.5rem] text-center ${sizeStyles[size]}`}>
      {icon ? (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface-soft)]">
          <span className="text-[var(--color-ink-soft)] [&>svg]:h-5 [&>svg]:w-5">
            {icon}
          </span>
        </div>
      ) : null}
      <h3 className={`section-title font-semibold ${titleSizeStyles[size]} ${icon ? "mt-4" : ""}`}>
        {title}
      </h3>
      {description ? (
        <p className="mt-3 text-sm leading-7 text-[var(--color-ink-soft)]">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-5">{action}</div>
      ) : null}
    </div>
  );
}
