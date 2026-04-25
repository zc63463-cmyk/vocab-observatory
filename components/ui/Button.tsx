import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

// ── Variant styles ──────────────────────────────────────────────────────────

const variantStyles = {
  primary: `
    rounded-2xl bg-[var(--color-accent)] px-4 py-3
    text-sm font-semibold text-white
    transition hover:opacity-90
    disabled:cursor-not-allowed disabled:opacity-70
  `.replace(/\n/g, " "),

  secondary: `
    rounded-full border border-[var(--color-border)] px-4 py-2
    text-sm font-semibold text-[var(--color-ink)]
    transition hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-soft)]
    disabled:cursor-not-allowed disabled:opacity-70
  `.replace(/\n/g, " "),

  ghost: `
    rounded-full px-4 py-2
    text-sm font-semibold text-[var(--color-ink-soft)]
    transition hover:bg-[var(--color-surface-soft)]
    disabled:cursor-not-allowed disabled:opacity-70
  `.replace(/\n/g, " "),

  danger: `
    rounded-full border border-[rgba(178,87,47,0.2)]
    bg-[var(--color-surface-muted-warm)] px-4 py-2
    text-sm font-semibold text-[var(--color-accent-2)]
    transition hover:bg-[rgba(178,87,47,0.14)]
    disabled:cursor-not-allowed disabled:opacity-70
  `.replace(/\n/g, " "),

  icon: `
    inline-flex items-center justify-center rounded-full
    text-[var(--color-ink-soft)] transition
    hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-ink)]
    disabled:cursor-not-allowed disabled:opacity-70
  `.replace(/\n/g, " "),
} as const;

// ── Size presets ────────────────────────────────────────────────────────────

const sizeStyles = {
  sm: "px-3 py-1.5 text-xs",
  md: "", // default — variant already includes sizing
  lg: "px-6 py-4 text-sm",
} as const;

// ── Active state styles for ghost-toggle buttons ────────────────────────────

const activeToggleStyle =
  "bg-[var(--color-accent)] text-white border-transparent hover:opacity-90";

// ── Component props ─────────────────────────────────────────────────────────

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant */
  variant?: keyof typeof variantStyles;
  /** Size preset — overrides default padding/font */
  size?: keyof typeof sizeStyles;
  /** For ghost toggle buttons — renders as "active" accent pill */
  active?: boolean;
  /** Full width */
  fullWidth?: boolean;
  /** Icon to render before children */
  icon?: ReactNode;
  /** Icon to render after children */
  iconRight?: ReactNode;
}

// ── Component ───────────────────────────────────────────────────────────────

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      active = false,
      children,
      className = "",
      fullWidth = false,
      icon,
      iconRight,
      size = "md",
      variant = "primary",
      ...rest
    },
    ref,
  ) {
    const baseVariant = variantStyles[variant] ?? variantStyles.primary;
    const sizeClass = sizeStyles[size] ?? "";
    const activeClass =
      active && variant === "ghost" ? activeToggleStyle : "";
    const widthClass = fullWidth ? "w-full" : "";

    return (
      <button
        ref={ref}
        className={`${baseVariant} ${sizeClass} ${activeClass} ${widthClass} ${className}`.replace(/\s+/g, " ").trim()}
        {...rest}
      >
        {icon ? (
          <span className="inline-flex shrink-0 items-center [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        ) : null}
        {children}
        {iconRight ? (
          <span className="inline-flex shrink-0 items-center [&>svg]:h-4 [&>svg]:w-4">
            {iconRight}
          </span>
        ) : null}
      </button>
    );
  },
);
