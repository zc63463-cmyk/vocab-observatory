import type { ReviewQueueItem } from "@/lib/review/types";
import { formatDateTime } from "@/lib/utils";

export function describeQueueItem(item: ReviewQueueItem) {
  return {
    ...item,
    dueLabel: formatDateTime(item.due_at),
    semanticField:
      typeof item.metadata === "object" &&
      item.metadata &&
      "semantic_field" in item.metadata
        ? String(item.metadata.semantic_field)
        : null,
  };
}
