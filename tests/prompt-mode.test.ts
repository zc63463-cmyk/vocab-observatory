import { describe, expect, it } from "vitest";
import {
  CLOZE_BLANK_TOKEN,
  redactLemmaInSentence,
} from "@/lib/review/prompt-mode";

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
