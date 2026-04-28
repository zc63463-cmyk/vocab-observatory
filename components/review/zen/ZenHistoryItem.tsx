"use client";

import type { ZenReviewedItem, RatingKey } from "./types";
import { RATING_CONFIG } from "./types";
import { Undo2 } from "lucide-react";

interface ZenHistoryItemProps {
  item: ZenReviewedItem;
  onUndo?: (id: string) => void;
  isUndoing?: boolean;
}

function RatingDot({ rating }: { rating: RatingKey }) {
  const color = RATING_CONFIG[rating].color;
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: color }}
      aria-label={RATING_CONFIG[rating].label}
    />
  );
}

function RatingLabel({ rating }: { rating: RatingKey }) {
  const { label, key, vimKey } = RATING_CONFIG[rating];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-soft)] opacity-70">
      <RatingDot rating={rating} />
      {label}
      <span className="text-[10px] opacity-50">({key}/{vimKey})</span>
    </span>
  );
}

function formatRelativeTime(answeredAt: string): string {
  const diff = Date.now() - new Date(answeredAt).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function ZenHistoryItem({ item, onUndo, isUndoing }: ZenHistoryItemProps) {
  const isUndone = item.undone;

  return (
    <div
      className={`
        group relative flex items-start gap-3 rounded-lg border px-3 py-2.5
        transition-colors
        ${isUndone
          ? "border-[var(--color-surface-muted)] bg-[var(--color-surface-muted)] opacity-60"
          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]/30"
        }
      `}
    >
      <div className="mt-0.5 flex-shrink-0">
        <RatingDot rating={item.rating} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p
            className="truncate text-sm font-semibold text-[var(--color-ink)]"
            style={{ fontFamily: "var(--font-heading), Georgia, serif" }}
          >
            {item.word}
          </p>
          {item.canUndo && !isUndone && onUndo && (
            <button
              type="button"
              onClick={() => onUndo(item.id)}
              disabled={isUndoing}
              className="flex-shrink-0 rounded-md p-1 text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-30"
              title={isUndoing ? "撤销中..." : "撤销此次评分"}
              aria-label="撤销此次评分"
            >
              <Undo2 className={`h-3.5 w-3.5 ${isUndoing ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        {item.definition && (
          <p className="mt-0.5 line-clamp-1 text-xs text-[var(--color-ink-soft)] opacity-80">
            {item.definition}
          </p>
        )}

        <div className="mt-1 flex items-center gap-2">
          <RatingLabel rating={item.rating} />
          <span className="text-[10px] text-[var(--color-ink-soft)] opacity-50">
            {formatRelativeTime(item.answeredAt)}
          </span>
          {isUndone && (
            <span className="text-[10px] text-[var(--color-ink-soft)] opacity-50">
              已撤销
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
