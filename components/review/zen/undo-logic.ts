import type { ZenReviewedItem } from "./types";

/**
 * Recomputes the `canUndo` flag for every item in the session history.
 *
 * Mirrors the backend rule enforced by the `undo_review_log` RPC:
 *   "a review log may be undone iff it is the latest non-undone log for its card."
 *
 * From the user's perspective, this means: any rating can be undone as long
 * as that specific card has not been rated again afterwards — with any order
 * across different cards.
 *
 * This is a pure function; callers should invoke it after every mutation
 * to the session history (rate / undo / batch reset) to keep the UI flag
 * in sync with what the server will actually accept.
 *
 * Guarantees:
 * - Does not mutate the input array or its items.
 * - An undone item always gets `canUndo = false`.
 * - At most one item per `cardId` gets `canUndo = true`.
 * - An empty / all-undone history returns an array with no `canUndo = true`.
 * - Tie-breaker on equal `answeredAt`: the item appearing earlier in the
 *   input wins. Since `ZenReviewProvider` prepends the newest item, the
 *   earliest-in-array item IS the most recent; this matches real ordering.
 */
export function recomputeCanUndo(history: ZenReviewedItem[]): ZenReviewedItem[] {
  // Pass 1: for each card, identify the id of its latest non-undone log.
  // Uses `answeredAt` as the primary sort key; falls back to array order
  // (which in practice is newest-first) on ties.
  const latestByCard = new Map<string, { id: string; index: number; t: number }>();

  history.forEach((item, index) => {
    if (item.undone) return;
    const parsed = Date.parse(item.answeredAt);
    const t = Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
    const existing = latestByCard.get(item.cardId);
    if (!existing) {
      latestByCard.set(item.cardId, { id: item.id, index, t });
      return;
    }
    // Prefer later answeredAt; on tie, prefer earlier index (newest-prepended convention).
    if (t > existing.t || (t === existing.t && index < existing.index)) {
      latestByCard.set(item.cardId, { id: item.id, index, t });
    }
  });

  // Pass 2: produce a new array with canUndo set accordingly.
  return history.map((item) => {
    const canUndo = !item.undone && latestByCard.get(item.cardId)?.id === item.id;
    // Preserve object identity when nothing changed — lets React skip rerenders.
    if (item.canUndo === canUndo) return item;
    return { ...item, canUndo };
  });
}
