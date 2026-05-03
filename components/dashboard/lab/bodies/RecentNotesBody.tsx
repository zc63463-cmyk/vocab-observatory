"use client";

import Link from "next/link";
import { excerpt, formatDateTime } from "@/lib/utils";
import type { DashboardSummary } from "../types";

interface RecentNotesBodyProps {
  summary: Pick<DashboardSummary, "notes">;
}

/**
 * Pure body for the recent-notes section.
 * Compact card list of the 8 most recently-edited notes.
 */
export function RecentNotesBody({ summary }: RecentNotesBodyProps) {
  const notes = summary.notes;

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-[var(--color-ink-soft)]">还没有笔记。</p>
        <Link
          href="/notes"
          className="text-sm font-semibold text-[var(--color-accent)] hover:underline"
        >
          打开笔记区 →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          href="/notes"
          className="text-xs font-semibold text-[var(--color-accent)] hover:underline"
        >
          查看全部笔记 →
        </Link>
      </div>

      {notes.map((note, index) => (
        <div
          key={`${note.updated_at}-${index}`}
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            {note.words ? (
              <Link
                href={`/words/${note.words.slug}`}
                className="font-semibold text-[var(--color-accent)] hover:underline"
              >
                {note.words.lemma}
              </Link>
            ) : (
              <span className="font-semibold text-[var(--color-ink-soft)]">已删除词条</span>
            )}
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)] opacity-70">
              v{note.version}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--color-ink-soft)]">
            {excerpt(note.content_md, 140) || "（空笔记）"}
          </p>
          <p className="mt-2 text-[11px] text-[var(--color-ink-soft)] opacity-60">
            {formatDateTime(note.updated_at)}
          </p>
        </div>
      ))}
    </div>
  );
}
