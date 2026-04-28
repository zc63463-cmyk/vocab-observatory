"use client";

import type { OmniItem } from "./types";
import {
  LayoutDashboard,
  Brain,
  BookOpen,
  Grid3X3,
  SunMoon,
  Compass,
  Settings,
  Hash,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Brain,
  BookOpen,
  Grid3X3,
  SunMoon,
  Compass,
  Settings,
  Hash,
};

interface OmniResultItemProps {
  item: OmniItem;
  index: number;
  selected: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}

export function OmniResultItem({
  item,
  index,
  selected,
  onMouseEnter,
  onClick,
}: OmniResultItemProps) {
  const IconComponent = item.icon ? ICON_MAP[item.icon] : Hash;

  return (
    <button
      type="button"
      role="option"
      id={`omni-option-${index}`}
      aria-selected={selected}
      data-omni-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`
        group flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-colors
        ${
          selected
            ? "bg-[var(--color-surface-muted)] border-l-2 border-l-[var(--color-accent)]"
            : "border-l-2 border-l-transparent hover:bg-[var(--color-surface-soft-deep)]"
        }
      `}
    >
      {/* Icon */}
      <span
        className={`
          flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
          ${
            selected
              ? "text-[var(--color-accent)]"
              : "bg-[var(--color-surface-soft)] text-[var(--color-ink-soft)]"
          }
        `}
        style={
          selected
            ? { backgroundColor: "color-mix(in srgb, var(--color-accent) 12%, transparent)" }
            : undefined
        }
      >
        <IconComponent className="h-4 w-4" />
      </span>

      {/* Title + Subtitle */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-[var(--color-ink)]">
          {item.title}
        </span>
        {item.subtitle && (
          <span className="truncate text-xs text-[var(--color-ink-soft)]">
            {item.subtitle}
          </span>
        )}
      </span>

      {/* Badge / Shortcut */}
      {item.shortcut && (
        <kbd className="ml-auto shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-soft)] font-mono">
          {item.shortcut}
        </kbd>
      )}
      {item.badge && (
        <span className="pill ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold">
          {item.badge}
        </span>
      )}
    </button>
  );
}
