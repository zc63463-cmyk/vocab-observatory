import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

// ── Shared base styles ──────────────────────────────────────────────────────

const inputBase = `
  rounded-2xl border border-[var(--color-border)]
  bg-[var(--color-surface-input)]
  text-sm outline-none transition
  focus:border-[var(--color-accent)]
  disabled:cursor-not-allowed disabled:opacity-70
`.replace(/\n/g, " ");

// ── Input ────────────────────────────────────────────────────────────────────

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visual size variant */
  inputSize?: "sm" | "md" | "lg";
}

const inputSizeStyles = {
  sm: "px-3 py-2 text-xs",
  md: "px-4 py-3",
  lg: "px-5 py-4",
} as const;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ className = "", inputSize = "md", ...rest }, ref) {
    const sizeClass = inputSizeStyles[inputSize] ?? inputSizeStyles.md;
    return (
      <input
        ref={ref}
        className={`${inputBase} ${sizeClass} ${className}`.replace(/\s+/g, " ").trim()}
        {...rest}
      />
    );
  },
);

// ── Select ───────────────────────────────────────────────────────────────────

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Visual size variant */
  inputSize?: "sm" | "md";
}

const selectSizeStyles = {
  sm: "px-3 py-2 text-xs",
  md: "px-4 py-3",
} as const;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className = "", inputSize = "md", ...rest }, ref) {
    const sizeClass = selectSizeStyles[inputSize] ?? selectSizeStyles.md;
    return (
      <select
        ref={ref}
        className={`${inputBase} ${sizeClass} ${className}`.replace(/\s+/g, " ").trim()}
        {...rest}
      />
    );
  },
);

// ── TextArea ─────────────────────────────────────────────────────────────────

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea({ className = "", ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={`${inputBase} rounded-[1.5rem] p-4 leading-7 ${className}`.replace(/\s+/g, " ").trim()}
        {...rest}
      />
    );
  },
);
