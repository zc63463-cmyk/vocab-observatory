import { describe, expect, it } from "vitest";
import {
  countFirstTryPasses,
  createDrillQueue,
  deferDrillCard,
  maskLemma,
  normalizeDrillAnswer,
  remainingInDrill,
  submitDrillAnswer,
  type DrillCard,
  type DrillQueueState,
} from "@/lib/review/drill";

function mk(over: Partial<DrillCard> & { progressId: string; lemma: string }): DrillCard {
  return {
    progressId: over.progressId,
    wordId: over.wordId ?? `w-${over.progressId}`,
    lemma: over.lemma,
    title: over.title ?? over.lemma,
    slug: over.slug ?? over.lemma,
    langCode: over.langCode ?? "en",
    shortDefinition: over.shortDefinition ?? null,
    state: over.state ?? "review",
    clozeText: over.clozeText ?? `A ▢▢▢ sentence for ${over.lemma}.`,
    clozeLength: over.clozeLength ?? over.lemma.length,
    clozeSource: over.clozeSource ?? `A ${over.lemma} sentence for ${over.lemma}.`,
  };
}

describe("normalizeDrillAnswer", () => {
  it("returns empty string on nullish/empty input", () => {
    expect(normalizeDrillAnswer("")).toBe("");
  });

  it("lowercases and trims whitespace", () => {
    expect(normalizeDrillAnswer("  Fox  ")).toBe("fox");
  });

  it("collapses internal runs of whitespace", () => {
    expect(normalizeDrillAnswer("give   up")).toBe("give up");
  });

  it("strips trailing punctuation but preserves middle", () => {
    expect(normalizeDrillAnswer("well-being!")).toBe("well-being");
    expect(normalizeDrillAnswer("co-op?!")).toBe("co-op");
  });

  it("does not strip leading punctuation (intentional)", () => {
    // Leading quote or bracket is almost always a typo not worth mangling.
    expect(normalizeDrillAnswer('"fox"')).toBe('"fox');
  });

  it("does not trim letters that look like morphology", () => {
    // cat vs cats must remain distinct — drill demands exact recall.
    expect(normalizeDrillAnswer("cats")).toBe("cats");
    expect(normalizeDrillAnswer("cat")).toBe("cat");
  });
});

describe("maskLemma", () => {
  it("shows the full word when length ≤ 3", () => {
    expect(maskLemma("a")).toBe("a");
    expect(maskLemma("at")).toBe("at");
    expect(maskLemma("cat")).toBe("cat");
  });

  it("shows first + last with one blank for length 4", () => {
    expect(maskLemma("test")).toBe("t▢▢t");
  });

  it("shows first + last with all blanks in between for length ≥ 5", () => {
    expect(maskLemma("running")).toBe("r▢▢▢▢▢g");
    expect(maskLemma("vocabulary")).toBe("v▢▢▢▢▢▢▢▢y");
  });

  it("preserves Unicode characters", () => {
    expect(maskLemma("学习")).toBe("学习");
    expect(maskLemma("学习ing")).toBe("学▢▢▢g");
  });
});

describe("createDrillQueue", () => {
  it("seeds totalUnique and starts in playing when non-empty", () => {
    const q = createDrillQueue([mk({ progressId: "p1", lemma: "fox" })]);
    expect(q.totalUnique).toBe(1);
    expect(q.phase).toBe("playing");
    expect(q.queue).toHaveLength(1);
    expect(q.attemptsByCard).toEqual({});
    expect(q.passedByCard).toEqual({});
  });

  it("starts in done when given an empty deck", () => {
    const q = createDrillQueue([]);
    expect(q.phase).toBe("done");
    expect(q.totalUnique).toBe(0);
  });

  it("does not mutate the caller's array", () => {
    const deck: DrillCard[] = [mk({ progressId: "p1", lemma: "fox" })];
    const q = createDrillQueue(deck);
    q.queue.push(mk({ progressId: "extra", lemma: "extra" }));
    expect(deck).toHaveLength(1);
  });
});

describe("submitDrillAnswer", () => {
  it("correct answer drops the card and marks passed", () => {
    const initial = createDrillQueue([
      mk({ progressId: "p1", lemma: "fox" }),
      mk({ progressId: "p2", lemma: "cat" }),
    ]);
    const r = submitDrillAnswer(initial, "fox");
    expect(r.correct).toBe(true);
    expect(r.correctAnswer).toBe("fox");
    expect(r.next.queue.map((c) => c.progressId)).toEqual(["p2"]);
    expect(r.next.passedByCard).toEqual({ p1: true });
    expect(r.next.phase).toBe("playing");
  });

  it("wrong answer moves current to tail and increments attempts", () => {
    const initial = createDrillQueue([
      mk({ progressId: "p1", lemma: "fox" }),
      mk({ progressId: "p2", lemma: "cat" }),
    ]);
    const r = submitDrillAnswer(initial, "wolf");
    expect(r.correct).toBe(false);
    expect(r.correctAnswer).toBe("fox");
    expect(r.next.queue.map((c) => c.progressId)).toEqual(["p2", "p1"]);
    expect(r.next.attemptsByCard).toEqual({ p1: 1 });
    expect(r.next.phase).toBe("playing");
  });

  it("wrong on a single-card queue keeps the session playing", () => {
    const initial = createDrillQueue([mk({ progressId: "p1", lemma: "fox" })]);
    const r = submitDrillAnswer(initial, "");
    expect(r.correct).toBe(false);
    expect(r.next.queue.map((c) => c.progressId)).toEqual(["p1"]);
    expect(r.next.attemptsByCard).toEqual({ p1: 1 });
    expect(r.next.phase).toBe("playing");
  });

  it("correct on the last card transitions to done", () => {
    const initial = createDrillQueue([mk({ progressId: "p1", lemma: "fox" })]);
    const r = submitDrillAnswer(initial, "fox");
    expect(r.next.phase).toBe("done");
    expect(r.next.queue).toHaveLength(0);
  });

  it("treats the answer comparison case-insensitively with punctuation slack", () => {
    const initial = createDrillQueue([mk({ progressId: "p1", lemma: "Fox" })]);
    const r = submitDrillAnswer(initial, "  fox.");
    expect(r.correct).toBe(true);
  });

  it("does not treat morphological variants as correct", () => {
    // Exact-recall discipline: cat !== cats.
    const initial = createDrillQueue([mk({ progressId: "p1", lemma: "cat" })]);
    const r = submitDrillAnswer(initial, "cats");
    expect(r.correct).toBe(false);
    expect(r.next.attemptsByCard.p1).toBe(1);
  });

  it("no-ops on an empty queue", () => {
    const empty = createDrillQueue([]);
    const r = submitDrillAnswer(empty, "whatever");
    expect(r.correct).toBe(false);
    expect(r.next).toBe(empty);
  });

  it("preserves attempt counts across multiple wrong-and-retry rounds", () => {
    let state: DrillQueueState = createDrillQueue([
      mk({ progressId: "p1", lemma: "fox" }),
      mk({ progressId: "p2", lemma: "cat" }),
    ]);
    // Wrong p1 → tail
    state = submitDrillAnswer(state, "wolf").next;
    // Wrong p2 → tail (now p1 back at head)
    state = submitDrillAnswer(state, "dog").next;
    // Wrong p1 again
    state = submitDrillAnswer(state, "nope").next;
    expect(state.attemptsByCard).toEqual({ p1: 2, p2: 1 });
  });

  it("drives the loop-until-perfect contract to completion", () => {
    // User eventually gets both right; drill ends in done.
    let state: DrillQueueState = createDrillQueue([
      mk({ progressId: "p1", lemma: "fox" }),
      mk({ progressId: "p2", lemma: "cat" }),
    ]);
    state = submitDrillAnswer(state, "wolf").next; // p1 wrong → [p2, p1]
    state = submitDrillAnswer(state, "cat").next;  // p2 correct → [p1]
    state = submitDrillAnswer(state, "fox").next;  // p1 correct → []
    expect(state.phase).toBe("done");
    expect(state.passedByCard).toEqual({ p1: true, p2: true });
    expect(state.attemptsByCard).toEqual({ p1: 1 });
  });
});

describe("deferDrillCard", () => {
  it("moves head to tail without touching attempts", () => {
    const initial = createDrillQueue([
      mk({ progressId: "p1", lemma: "fox" }),
      mk({ progressId: "p2", lemma: "cat" }),
    ]);
    const next = deferDrillCard(initial);
    expect(next.queue.map((c) => c.progressId)).toEqual(["p2", "p1"]);
    expect(next.attemptsByCard).toEqual({});
  });

  it("is a no-op on a single-card queue", () => {
    const initial = createDrillQueue([mk({ progressId: "p1", lemma: "fox" })]);
    const next = deferDrillCard(initial);
    expect(next).toBe(initial);
  });
});

describe("summary metrics", () => {
  it("counts only passed cards with zero wrong attempts as first-try", () => {
    let state = createDrillQueue([
      mk({ progressId: "p1", lemma: "fox" }),
      mk({ progressId: "p2", lemma: "cat" }),
      mk({ progressId: "p3", lemma: "bat" }),
    ]);
    state = submitDrillAnswer(state, "fox").next; // p1 first-try pass
    state = submitDrillAnswer(state, "wolf").next; // p2 wrong
    state = submitDrillAnswer(state, "bat").next;  // p3 first-try pass
    state = submitDrillAnswer(state, "cat").next;  // p2 second-try pass
    expect(state.phase).toBe("done");
    expect(countFirstTryPasses(state)).toBe(2);
    expect(remainingInDrill(state)).toBe(0);
  });
});
