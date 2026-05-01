import { describe, expect, it } from "vitest";
import { recomputeCanUndo } from "@/components/review/zen/undo-logic";
import type { ZenReviewedItem } from "@/components/review/zen/types";

function mkItem(over: Partial<ZenReviewedItem> & {
  id: string;
  cardId: string;
  answeredAt: string;
}): ZenReviewedItem {
  return {
    canUndo: false,
    definition: null,
    durationMs: 1000,
    rating: "good",
    ratingLabel: "Good",
    undone: false,
    word: "stub",
    wordId: `word-${over.cardId}`,
    ...over,
  };
}

describe("recomputeCanUndo", () => {
  it("returns empty array for empty history", () => {
    expect(recomputeCanUndo([])).toEqual([]);
  });

  it("marks a single non-undone item as canUndo", () => {
    const item = mkItem({ id: "log1", cardId: "cardA", answeredAt: "2026-04-15T10:00:00Z" });
    const [result] = recomputeCanUndo([item]);
    expect(result.canUndo).toBe(true);
  });

  it("marks a single undone item as NOT canUndo", () => {
    const item = mkItem({
      id: "log1",
      cardId: "cardA",
      answeredAt: "2026-04-15T10:00:00Z",
      undone: true,
    });
    const [result] = recomputeCanUndo([item]);
    expect(result.canUndo).toBe(false);
  });

  it("marks ALL latest-per-card as canUndo when cards differ", () => {
    // Three different cards, each rated once. All three should be undoable.
    const history = [
      mkItem({ id: "logC", cardId: "cardC", answeredAt: "2026-04-15T10:02:00Z" }),
      mkItem({ id: "logB", cardId: "cardB", answeredAt: "2026-04-15T10:01:00Z" }),
      mkItem({ id: "logA", cardId: "cardA", answeredAt: "2026-04-15T10:00:00Z" }),
    ];
    const result = recomputeCanUndo(history);
    expect(result.every((r) => r.canUndo)).toBe(true);
  });

  it("marks only the latest for the SAME card as canUndo", () => {
    // Card A rated twice. Only the later one is undoable.
    const history = [
      mkItem({ id: "logA2", cardId: "cardA", answeredAt: "2026-04-15T10:05:00Z" }),
      mkItem({ id: "logA1", cardId: "cardA", answeredAt: "2026-04-15T10:00:00Z" }),
    ];
    const result = recomputeCanUndo(history);
    expect(result.find((r) => r.id === "logA2")!.canUndo).toBe(true);
    expect(result.find((r) => r.id === "logA1")!.canUndo).toBe(false);
  });

  it("restores canUndo on the older log once the newer one is undone", () => {
    // After user undoes logA2, logA1 becomes the latest non-undone for cardA.
    const history = [
      mkItem({
        id: "logA2",
        cardId: "cardA",
        answeredAt: "2026-04-15T10:05:00Z",
        undone: true, // user just undid this
      }),
      mkItem({ id: "logA1", cardId: "cardA", answeredAt: "2026-04-15T10:00:00Z" }),
    ];
    const result = recomputeCanUndo(history);
    expect(result.find((r) => r.id === "logA2")!.canUndo).toBe(false);
    expect(result.find((r) => r.id === "logA1")!.canUndo).toBe(true);
  });

  it("keeps canUndo false when ALL logs for a card are undone", () => {
    const history = [
      mkItem({
        id: "logA2",
        cardId: "cardA",
        answeredAt: "2026-04-15T10:05:00Z",
        undone: true,
      }),
      mkItem({
        id: "logA1",
        cardId: "cardA",
        answeredAt: "2026-04-15T10:00:00Z",
        undone: true,
      }),
    ];
    const result = recomputeCanUndo(history);
    expect(result.every((r) => !r.canUndo)).toBe(true);
  });

  it("handles mixed-card interleaving correctly", () => {
    // Realistic session: A → B → A → C → B (B rated twice, A rated twice, C once).
    // Expected undoable: latest A (logA2), latest B (logB2), C (logC1).
    const history = [
      mkItem({ id: "logB2", cardId: "cardB", answeredAt: "2026-04-15T10:05:00Z" }),
      mkItem({ id: "logC1", cardId: "cardC", answeredAt: "2026-04-15T10:04:00Z" }),
      mkItem({ id: "logA2", cardId: "cardA", answeredAt: "2026-04-15T10:03:00Z" }),
      mkItem({ id: "logB1", cardId: "cardB", answeredAt: "2026-04-15T10:02:00Z" }),
      mkItem({ id: "logA1", cardId: "cardA", answeredAt: "2026-04-15T10:01:00Z" }),
    ];
    const result = recomputeCanUndo(history);
    const undoable = new Set(result.filter((r) => r.canUndo).map((r) => r.id));
    expect(undoable).toEqual(new Set(["logA2", "logB2", "logC1"]));
  });

  it("ignores undone logs when picking the latest per card", () => {
    // logA3 undone → logA2 should be canUndo, not logA1.
    const history = [
      mkItem({
        id: "logA3",
        cardId: "cardA",
        answeredAt: "2026-04-15T10:03:00Z",
        undone: true,
      }),
      mkItem({ id: "logA2", cardId: "cardA", answeredAt: "2026-04-15T10:02:00Z" }),
      mkItem({ id: "logA1", cardId: "cardA", answeredAt: "2026-04-15T10:01:00Z" }),
    ];
    const result = recomputeCanUndo(history);
    expect(result.find((r) => r.id === "logA2")!.canUndo).toBe(true);
    expect(result.find((r) => r.id === "logA1")!.canUndo).toBe(false);
    expect(result.find((r) => r.id === "logA3")!.canUndo).toBe(false);
  });

  it("falls back to array order for equal answeredAt timestamps", () => {
    // Same cardId, same timestamp → earlier index wins (newest-prepended convention).
    const ts = "2026-04-15T10:00:00Z";
    const history = [
      mkItem({ id: "logA_new", cardId: "cardA", answeredAt: ts }),
      mkItem({ id: "logA_old", cardId: "cardA", answeredAt: ts }),
    ];
    const result = recomputeCanUndo(history);
    expect(result.find((r) => r.id === "logA_new")!.canUndo).toBe(true);
    expect(result.find((r) => r.id === "logA_old")!.canUndo).toBe(false);
  });

  it("treats unparseable answeredAt as infinitely old", () => {
    const history = [
      mkItem({ id: "logA_bad", cardId: "cardA", answeredAt: "not-a-date" }),
      mkItem({ id: "logA_good", cardId: "cardA", answeredAt: "2026-04-15T10:00:00Z" }),
    ];
    const result = recomputeCanUndo(history);
    expect(result.find((r) => r.id === "logA_good")!.canUndo).toBe(true);
    expect(result.find((r) => r.id === "logA_bad")!.canUndo).toBe(false);
  });

  it("does not mutate input array or items", () => {
    const history = [
      mkItem({ id: "logA", cardId: "cardA", answeredAt: "2026-04-15T10:00:00Z" }),
      mkItem({ id: "logB", cardId: "cardB", answeredAt: "2026-04-15T10:01:00Z" }),
    ];
    const snapshot = JSON.stringify(history);
    recomputeCanUndo(history);
    expect(JSON.stringify(history)).toBe(snapshot);
  });

  it("preserves object identity when canUndo flag is unchanged", () => {
    // Input already has correct flags → output items should be referentially equal.
    const history = [
      mkItem({
        id: "logA",
        cardId: "cardA",
        answeredAt: "2026-04-15T10:00:00Z",
        canUndo: true,
      }),
      mkItem({
        id: "logB",
        cardId: "cardB",
        answeredAt: "2026-04-15T10:01:00Z",
        canUndo: true,
      }),
    ];
    const result = recomputeCanUndo(history);
    expect(result[0]).toBe(history[0]);
    expect(result[1]).toBe(history[1]);
  });

  it("produces at most one canUndo per cardId", () => {
    // Stress-style: 10 logs for the same card, none undone. Only one should be canUndo.
    const history = Array.from({ length: 10 }, (_, i) =>
      mkItem({
        id: `log${i}`,
        cardId: "cardA",
        answeredAt: `2026-04-15T10:0${i}:00Z`,
      }),
    );
    const result = recomputeCanUndo(history);
    expect(result.filter((r) => r.canUndo)).toHaveLength(1);
    expect(result.find((r) => r.canUndo)!.id).toBe("log9");
  });
});
