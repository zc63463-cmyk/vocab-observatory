import { describe, expect, it } from "vitest";
import {
  CLOZE_BLANK_TOKEN,
  redactLemmaInSentence,
  resolvePrompt,
} from "@/lib/review/prompt-mode";
import type { ReviewQueueItem } from "@/lib/review/types";
import type { ParsedExample } from "@/lib/sync/parseMarkdown";

function mkItem(over: Partial<ReviewQueueItem> & {
  lemma: string;
}): ReviewQueueItem {
  return {
    content_hash_snapshot: null,
    definition_md: "**adj.** dignified, sedate.",
    due_at: null,
    ipa: null,
    is_new: false,
    metadata: {},
    progress_id: "p1",
    queue_bucket: "overdue",
    queue_label: "Overdue",
    queue_reason: "due",
    review_count: 1,
    retrievability: 0.85,
    short_definition: "calm and serious",
    lang_code: "en",
    previewExamples: null,
    slug: "stub",
    state: "review",
    title: over.lemma,
    word_id: "w1",
    ...over,
  };
}

function ex(text: string, label: string | null = null): ParsedExample {
  return { label, source: "corpus", text };
}

describe("redactLemmaInSentence", () => {
  it("returns null on empty input", () => {
    expect(redactLemmaInSentence("", "run")).toBeNull();
    expect(redactLemmaInSentence("the cat ran", "")).toBeNull();
  });

  it("redacts whole-word match preserving surroundings", () => {
    const r = redactLemmaInSentence("The fox runs swiftly.", "runs");
    expect(r).not.toBeNull();
    expect(r!.text).toBe(`The fox ${CLOZE_BLANK_TOKEN} swiftly.`);
    expect(r!.matchedLength).toBe(4);
  });

  it("matches case-insensitively", () => {
    const r = redactLemmaInSentence("RUN home now.", "run");
    expect(r!.text).toBe(`${CLOZE_BLANK_TOKEN} home now.`);
  });

  it("strips simple markdown emphasis before matching", () => {
    const r = redactLemmaInSentence("She **runs** every day.", "runs");
    expect(r!.text).toBe(`She ${CLOZE_BLANK_TOKEN} every day.`);
  });

  it("matches plural -s suffix", () => {
    const r = redactLemmaInSentence("Two cats slept.", "cat");
    expect(r!.text).toBe(`Two ${CLOZE_BLANK_TOKEN} slept.`);
    expect(r!.matchedLength).toBe(4);
  });

  it("matches -ed past tense", () => {
    const r = redactLemmaInSentence("They walked home.", "walk");
    expect(r!.text).toBe(`They ${CLOZE_BLANK_TOKEN} home.`);
  });

  it("matches -ing form with drop-final-e rule", () => {
    const r = redactLemmaInSentence("She is loving the show.", "love");
    expect(r!.text).toBe(`She is ${CLOZE_BLANK_TOKEN} the show.`);
  });

  it("falls back to literal substring for non-ASCII when boundary fails", () => {
    const r = redactLemmaInSentence("我喜欢学习汉语。", "学习");
    expect(r).not.toBeNull();
    expect(r!.text).toContain(CLOZE_BLANK_TOKEN);
    expect(r!.text).toBe(`我喜欢${CLOZE_BLANK_TOKEN}汉语。`);
  });

  it("returns null when lemma is absent", () => {
    expect(redactLemmaInSentence("The fox is fast.", "elephant")).toBeNull();
  });

  it("does not match partial substrings on whole-word path", () => {
    // "set" should match "sets" via the suffix pass, not via partial-substring
    // inside "subset". Check the matched form is "sets" not "set" in "subset".
    const r = redactLemmaInSentence("These are subset of items, sets matter.", "set");
    expect(r).not.toBeNull();
    // The first word-boundary candidate is "sets" because "subset" has no
    // boundary between "sub" and "set". So our blank should land on "sets".
    expect(r!.text).toBe(
      `These are subset of items, ${CLOZE_BLANK_TOKEN} matter.`,
    );
  });
});

describe("resolvePrompt", () => {
  const fixedRandom = (value: number) => () => value;

  it("forces forward for new cards regardless of allowed modes", () => {
    const item = mkItem({
      lemma: "compound",
      is_new: true,
      previewExamples: [ex("This is a compound word.")],
    });
    const r = resolvePrompt(item, {
      allowedModes: ["forward", "reverse", "cloze"],
      random: fixedRandom(0.99), // would pick last candidate normally
    });
    expect(r.mode).toBe("forward");
    expect(r.clozeText).toBeNull();
  });

  it("returns forward when only forward is allowed", () => {
    const item = mkItem({ lemma: "fox", previewExamples: [ex("A red fox.")] });
    const r = resolvePrompt(item, { allowedModes: ["forward"] });
    expect(r.mode).toBe("forward");
  });

  it("falls back to forward when allowedModes is empty", () => {
    const item = mkItem({ lemma: "fox" });
    const r = resolvePrompt(item, { allowedModes: [] });
    expect(r.mode).toBe("forward");
  });

  it("excludes cloze when no example contains the lemma", () => {
    const item = mkItem({
      lemma: "fox",
      previewExamples: [ex("The cat slept on the mat.")],
    });
    // With random forced to last candidate, would pick cloze if it survived.
    const r = resolvePrompt(item, {
      allowedModes: ["forward", "cloze"],
      random: fixedRandom(0.99),
    });
    expect(r.mode).toBe("forward");
  });

  it("excludes reverse when definition is empty", () => {
    const item = mkItem({
      lemma: "fox",
      short_definition: null,
      definition_md: "",
    });
    const r = resolvePrompt(item, {
      allowedModes: ["forward", "reverse"],
      random: fixedRandom(0.99),
    });
    expect(r.mode).toBe("forward");
  });

  it("returns cloze with redacted text when example contains the lemma", () => {
    const item = mkItem({
      lemma: "voracious",
      previewExamples: [ex("The voracious child refused to nap.")],
    });
    const r = resolvePrompt(item, {
      allowedModes: ["cloze"],
      random: fixedRandom(0),
    });
    expect(r.mode).toBe("cloze");
    expect(r.clozeText).toBe(`The ${CLOZE_BLANK_TOKEN} child refused to nap.`);
    expect(r.clozeLength).toBe("voracious".length);
    expect(r.clozeSource).toBe("The voracious child refused to nap.");
  });

  it("picks reverse when allowed and random points there", () => {
    const item = mkItem({
      lemma: "voracious",
      previewExamples: [ex("She is voracious.")],
    });
    // Candidates after filtering: forward, reverse, cloze (3 items).
    // random=0.5 → idx 1 → reverse.
    const r = resolvePrompt(item, {
      allowedModes: ["forward", "reverse", "cloze"],
      random: fixedRandom(0.5),
    });
    expect(r.mode).toBe("reverse");
    expect(r.clozeText).toBeNull();
  });

  it("picks forward when random hits the first slot", () => {
    const item = mkItem({
      lemma: "voracious",
      previewExamples: [ex("She is voracious.")],
    });
    const r = resolvePrompt(item, {
      allowedModes: ["forward", "reverse", "cloze"],
      random: fixedRandom(0),
    });
    expect(r.mode).toBe("forward");
  });
});
