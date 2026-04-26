import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { ReviewQueueItem } from "@/lib/review/types";
import { formatDateTime } from "@/lib/utils";

export function ReviewCard({ item }: { item: ReviewQueueItem }) {
  const semanticField =
    typeof item.metadata === "object" &&
    item.metadata &&
    "semantic_field" in item.metadata
      ? String(item.metadata.semantic_field)
      : null;

  return (
    <section className="panel-strong rounded-[2rem] p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {semanticField ? <Badge>{semanticField}</Badge> : null}
          <Badge>{item.queue_label}</Badge>
          <Badge tone="warm">Due {formatDateTime(item.due_at)}</Badge>
        </div>
        <Link
          href={`/words/${item.slug}`}
          className="text-sm font-semibold text-[var(--color-accent)]"
        >
          查看词条详情
        </Link>
      </div>

      <h1 className="section-title mt-6 text-5xl font-semibold">{item.lemma}</h1>
      {item.ipa ? <p className="mt-3 text-lg text-[var(--color-ink-soft)]">{item.ipa}</p> : null}
      <p className="mt-4 text-sm text-[var(--color-ink-soft)]">{item.queue_reason}</p>

      <div className="mt-8 rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface-glass-hover)] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-soft)]">
          核心释义
        </p>
        <p className="mt-3 text-base leading-8">{item.short_definition ?? item.definition_md}</p>
      </div>
    </section>
  );
}
