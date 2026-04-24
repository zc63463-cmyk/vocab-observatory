import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import type { PublicWordSummary } from "@/lib/words";

export function WordCard({ word }: { word: PublicWordSummary }) {
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

  return (
    <Link
      href={`/words/${word.slug}`}
      className="panel group flex h-full flex-col rounded-[1.75rem] p-6 transition duration-200 hover:-translate-y-1 hover:border-[var(--color-border-strong)] hover:shadow-[0_22px_54px_rgba(71,50,20,0.14)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-title text-3xl font-semibold">{word.lemma}</p>
          {word.ipa ? (
            <p className="mt-2 text-sm tracking-wide text-[var(--color-ink-soft)]">{word.ipa}</p>
          ) : null}
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
    </Link>
  );
}
