import { describe, expect, it } from "vitest";
import {
  buildWordTOCSections,
  pickActiveSectionId,
  resolveInitialActiveId,
  TOC_BAR_HEIGHT_REM,
  TOC_OBSERVER_ROOT_MARGIN,
  type ObservedSection,
} from "@/lib/word-section-toc";

/* ── buildWordTOCSections ────────────────────────────────────────── */

describe("buildWordTOCSections", () => {
  it("renders the minimal 7-chip set when neither prototype nor body exist", () => {
    const sections = buildWordTOCSections({
      hasPrototype: false,
      hasBody: false,
    });

    // New ordering: 笔记 is hoisted right after 释义 (no prototype slot
    // here), and 搭配 / 语料 are demoted to the tail.
    expect(sections.map((s) => s.id)).toEqual([
      "word-definitions",
      "word-notes",
      "word-topology",
      "word-synonyms",
      "word-antonyms",
      "word-collocations",
      "word-corpus",
    ]);
  });

  it("inserts 原型 right after 释义 and slots 笔记 immediately after 原型", () => {
    const sections = buildWordTOCSections({
      hasPrototype: true,
      hasBody: false,
    });

    // 笔记 follows 原型 directly so the high-priority jump targets are
    // packed at the head of the chip bar.
    expect(sections.map((s) => s.id)).toEqual([
      "word-definitions",
      "word-prototype",
      "word-notes",
      "word-topology",
      "word-synonyms",
      "word-antonyms",
      "word-collocations",
      "word-corpus",
    ]);
  });

  it("appends 正文 as the absolute final chip when hasBody is true", () => {
    const sections = buildWordTOCSections({
      hasPrototype: false,
      hasBody: true,
    });

    expect(sections.map((s) => s.id)).toEqual([
      "word-definitions",
      "word-notes",
      "word-topology",
      "word-synonyms",
      "word-antonyms",
      "word-collocations",
      "word-corpus",
      "word-body",
    ]);
    expect(sections[sections.length - 1]?.label).toBe("正文");
  });

  it("includes both optional chips in the right slots when hasPrototype and hasBody are true", () => {
    const sections = buildWordTOCSections({
      hasPrototype: true,
      hasBody: true,
    });

    expect(sections).toHaveLength(9);
    expect(sections[0]?.id).toBe("word-definitions");
    expect(sections[1]?.id).toBe("word-prototype");
    expect(sections[2]?.id).toBe("word-notes");
    expect(sections[sections.length - 1]?.id).toBe("word-body");
  });

  it("always anchors 释义 as the first chip regardless of optional flags", () => {
    const cases: Array<{ hasPrototype: boolean; hasBody: boolean }> = [
      { hasPrototype: false, hasBody: false },
      { hasPrototype: true, hasBody: false },
      { hasPrototype: false, hasBody: true },
      { hasPrototype: true, hasBody: true },
    ];

    for (const input of cases) {
      const sections = buildWordTOCSections(input);
      expect(sections[0]).toEqual({ id: "word-definitions", label: "释义" });
    }
  });

  it("places 笔记 immediately after the prototype slot (or after 释义 when no prototype)", () => {
    const withPrototype = buildWordTOCSections({
      hasPrototype: true,
      hasBody: false,
    });
    const notesIdxA = withPrototype.findIndex((s) => s.id === "word-notes");
    expect(notesIdxA).toBe(2);
    expect(withPrototype[notesIdxA - 1]?.id).toBe("word-prototype");

    const withoutPrototype = buildWordTOCSections({
      hasPrototype: false,
      hasBody: false,
    });
    const notesIdxB = withoutPrototype.findIndex((s) => s.id === "word-notes");
    expect(notesIdxB).toBe(1);
    expect(withoutPrototype[notesIdxB - 1]?.id).toBe("word-definitions");
  });

  it("ends with 正文 when hasBody is true, otherwise 语料 closes the bar", () => {
    const ended = buildWordTOCSections({ hasPrototype: true, hasBody: true });
    expect(ended[ended.length - 1]).toEqual({
      id: "word-body",
      label: "正文",
    });

    const noBody = buildWordTOCSections({ hasPrototype: true, hasBody: false });
    expect(noBody[noBody.length - 1]).toEqual({
      id: "word-corpus",
      label: "语料",
    });
  });

  it("emits unique anchor ids", () => {
    const sections = buildWordTOCSections({
      hasPrototype: true,
      hasBody: true,
    });
    const ids = sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prefixes every anchor id with `word-` so they live in one namespace", () => {
    const sections = buildWordTOCSections({
      hasPrototype: true,
      hasBody: true,
    });
    for (const section of sections) {
      expect(section.id.startsWith("word-")).toBe(true);
    }
  });

  it("provides a Chinese label for every chip (no fallback strings)", () => {
    const sections = buildWordTOCSections({
      hasPrototype: true,
      hasBody: true,
    });
    for (const section of sections) {
      expect(section.label.length).toBeGreaterThan(0);
      // All labels are CJK; assert they contain at least one CJK Unified
      // Ideograph rather than ASCII fallback like "TODO".
      expect(/[\u4e00-\u9fff]/.test(section.label)).toBe(true);
    }
  });
});

/* ── pickActiveSectionId ─────────────────────────────────────────── */

describe("pickActiveSectionId", () => {
  it("returns null when no entries are intersecting", () => {
    const observed: ObservedSection[] = [
      { id: "word-definitions", isIntersecting: false, top: -200 },
      { id: "word-corpus", isIntersecting: false, top: 800 },
    ];
    expect(pickActiveSectionId(observed)).toBeNull();
  });

  it("returns null for an empty input array", () => {
    expect(pickActiveSectionId([])).toBeNull();
  });

  it("returns the only intersecting section when there's a single hit", () => {
    const observed: ObservedSection[] = [
      { id: "word-definitions", isIntersecting: false, top: -300 },
      { id: "word-collocations", isIntersecting: true, top: 50 },
      { id: "word-corpus", isIntersecting: false, top: 600 },
    ];
    expect(pickActiveSectionId(observed)).toBe("word-collocations");
  });

  it("returns the topmost intersecting id when several sections overlap the trigger zone", () => {
    // Two sections in the trigger zone: collocations is higher up, so its
    // chip should win — that mirrors the reading order: the chip for the
    // section the user is *finishing* leads the chip for the section they
    // are *starting*.
    const observed: ObservedSection[] = [
      { id: "word-collocations", isIntersecting: true, top: 40 },
      { id: "word-corpus", isIntersecting: true, top: 220 },
    ];
    expect(pickActiveSectionId(observed)).toBe("word-collocations");
  });

  it("treats negative tops (sections partially scrolled off-screen) as 'most topmost'", () => {
    // A section with top: -100 has scrolled past the viewport top edge but
    // is still intersecting (its bottom is on-screen). It should beat a
    // section with top: 50.
    const observed: ObservedSection[] = [
      { id: "word-definitions", isIntersecting: true, top: -100 },
      { id: "word-collocations", isIntersecting: true, top: 50 },
    ];
    expect(pickActiveSectionId(observed)).toBe("word-definitions");
  });

  it("ignores non-intersecting entries even when they have smaller `top` values", () => {
    const observed: ObservedSection[] = [
      { id: "word-definitions", isIntersecting: false, top: -500 },
      { id: "word-collocations", isIntersecting: true, top: 80 },
      { id: "word-corpus", isIntersecting: false, top: 10 },
    ];
    expect(pickActiveSectionId(observed)).toBe("word-collocations");
  });

  it("is stable when two intersecting sections share the same `top` (first wins)", () => {
    // Tie-break: keep the first occurrence so the highlight doesn't
    // oscillate during identical observer payloads.
    const observed: ObservedSection[] = [
      { id: "word-collocations", isIntersecting: true, top: 100 },
      { id: "word-corpus", isIntersecting: true, top: 100 },
    ];
    expect(pickActiveSectionId(observed)).toBe("word-collocations");
  });

  it("does not mutate the input array", () => {
    const observed: ObservedSection[] = [
      { id: "word-corpus", isIntersecting: true, top: 200 },
      { id: "word-collocations", isIntersecting: true, top: 50 },
    ];
    const snapshot = observed.map((entry) => ({ ...entry }));
    pickActiveSectionId(observed);
    expect(observed).toEqual(snapshot);
  });
});

/* ── resolveInitialActiveId ──────────────────────────────────────── */

describe("resolveInitialActiveId", () => {
  const sections = buildWordTOCSections({
    hasPrototype: true,
    hasBody: true,
  });

  it("returns null when section list is empty", () => {
    expect(resolveInitialActiveId([], "")).toBeNull();
    expect(resolveInitialActiveId([], "#word-notes")).toBeNull();
  });

  it("returns the first chip id when hash is empty", () => {
    expect(resolveInitialActiveId(sections, "")).toBe("word-definitions");
  });

  it("returns the first chip id when hash has no leading `#`", () => {
    // Defensive: location.hash always carries the `#`, but if a caller
    // passes a stripped value we treat it as 'no hash' rather than
    // silently doing a string match — unambiguous behavior.
    expect(resolveInitialActiveId(sections, "word-notes")).toBe(
      "word-definitions",
    );
  });

  it("returns the matching chip id when hash points at a known section", () => {
    expect(resolveInitialActiveId(sections, "#word-notes")).toBe("word-notes");
    expect(resolveInitialActiveId(sections, "#word-corpus")).toBe(
      "word-corpus",
    );
  });

  it("falls back to the first chip when hash points at an unknown id", () => {
    // Old shared link surviving a section rename, third-party link with a
    // typo, etc. We don't error out — just default to the entry point.
    expect(resolveInitialActiveId(sections, "#does-not-exist")).toBe(
      "word-definitions",
    );
  });

  it("falls back to the first chip when hash points at a chip that's been gated out", () => {
    // The body chip only exists when result.word.body_md is non-empty.
    // A shared link to `#word-body` for a word that has no body should
    // not highlight a non-existent chip.
    const noBody = buildWordTOCSections({
      hasPrototype: false,
      hasBody: false,
    });
    expect(resolveInitialActiveId(noBody, "#word-body")).toBe(
      "word-definitions",
    );
  });

  it("treats `#` alone (empty fragment) as no hash", () => {
    expect(resolveInitialActiveId(sections, "#")).toBe("word-definitions");
  });
});

/* ── observer constants ──────────────────────────────────────────── */

describe("TOC observer constants", () => {
  it("expresses every margin value in px or % only — never rem/em", () => {
    // Regression guard: the IntersectionObserver constructor throws
    // SyntaxError if rootMargin contains rem/em, which crashed the
    // entire word detail page. Tokens must look like `0px`, `-112px`,
    // or `-55%` (signed integer + px|%).
    const tokens = TOC_OBSERVER_ROOT_MARGIN.split(/\s+/);
    expect(tokens).toHaveLength(4);
    for (const token of tokens) {
      expect(token).toMatch(/^-?\d+(?:px|%)$/);
    }
  });

  it("derives the top inset from TOC_BAR_HEIGHT_REM + 4rem of breathing room (in pixels)", () => {
    // (3 + 4) * 16 = 112 at the browser default root font-size.
    const expectedTopInsetPx = (TOC_BAR_HEIGHT_REM + 4) * 16;
    expect(TOC_OBSERVER_ROOT_MARGIN).toBe(
      `-${expectedTopInsetPx}px 0px -55% 0px`,
    );
  });

  it("uses a 55% bottom inset so the highlight flips around viewport mid-line", () => {
    expect(TOC_OBSERVER_ROOT_MARGIN.endsWith("-55% 0px")).toBe(true);
  });

  it("keeps TOC_BAR_HEIGHT_REM aligned with the visual chip bar height", () => {
    // Locked-in value: the page-side scroll-margin-top class hardcodes
    // "+3.5rem" against the same bar; if you bump TOC_BAR_HEIGHT_REM
    // you must also update that class in
    // `app/(public)/words/[slug]/page.tsx`.
    expect(TOC_BAR_HEIGHT_REM).toBe(3);
  });
});
