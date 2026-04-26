"use client";

import { Badge } from "@/components/ui/Badge";
import { WordCardShell } from "@/components/motion/WordCardShell";
import { formatDateTime } from "@/lib/utils";
import type { PublicWordSummary } from "@/lib/words";

interface WordCardProps {
  word: PublicWordSummary;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (wordId: string) => void;
}

export function WordCard({ word, selectable, selected, onToggleSelect }: WordCardProps) {
  const semanticField =
    typeof word.metadata === "object" &&
    word.metadata &&
    "semantic_field" in word.metadata
      ? String(word.metadata.semantic_field)
      : null;
  const wordFrequency =
    typeof word.metadata === "object" &&
    word.metadata &&
    "word_freq" in word.metadata
      ? String(word.metadata.word_freq)
      : null;
  const isDue = word.progress?.is_due ?? false;
  const isTracked = word.progress !== null;

  return (
    <WordCardShell href={`/words/${word.slug}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {selectable && !isTracked ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleSelect?.(word.id);
              }}
              className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors"
              style={{
                borderColor: selected
                  ? "var(--color-accent)"
                  : "var(--color-border)",
                backgroundColor: selected
                  ? "var(--color-accent)"
                  : "transparent",
              }}
              aria-label={selected ? "取消选择" : "选择"}
              aria-pressed={selected}
            >
              {selected ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  className="text-white"
                >
                  <path
                    d="M2.5 6L5 8.5L9.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </button>
          ) : null}
          <div className="min-w-0">
            <p className="section-title text-3xl font-semibold">{word.lemma}</p>
            {word.ipa ? (
              <p className="mt-2 text-sm tracking-wide text-[var(--color-ink-soft)]">{word.ipa}</p>
            ) : null}
          </div>
        </div>
        {wordFrequency ? <Badge tone="warm">{wordFrequency}</Badge> : null}
      </div>

      <p className="mt-5 text-sm leading-7 text-[var(--color-ink-soft)]">
        {word.short_definition ?? "尚未解析核心释义。"}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {semanticField ? <Badge>{semanticField}</Badge> : null}
        {word.progress ? (
          <Badge tone={isDue ? "warm" : "default"}>
            {isDue ? "今日到期" : `已加入 · ${word.progress.review_count}次`}
          </Badge>
        ) : null}
      </div>

      {word.progress?.due_at ? (
        <p className="mt-4 text-xs text-[var(--color-ink-soft)]">
          下次复习：{formatDateTime(word.progress.due_at)}
        </p>
      ) : null}
    </WordCardShell>
  );
}
