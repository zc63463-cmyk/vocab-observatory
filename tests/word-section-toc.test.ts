import { describe, expect, it } from "vitest";
import {
  buildWordTOCSections,
  pickActiveSectionId,
  TOC_BAR_HEIGHT_REM,
  TOC_OBSERVER_ROOT_MARGIN,
  type ObservedSection,
} from "@/lib/word-section-toc";

/* ── buildWordTOCSections ────────────────────────────────────────── */

describe("buildWordTOCSections", () => {
  it("renders the minimal 8-chip set when neither prototype nor body exist", () => {
    const sections = buildWordTOCSections({
      hasPrototype: false,
      hasBody: false,
    });

    expect(sections.map((s) => s.id)).toEqual([
      "word-definitions",
      "word-collocations",
      "word-corpus",
      "word-topology",
      "word-synonyms",
      "word-antonyms",
      "word-notes",
    ]);
  });

  it("inserts the prototype chip in fixed slot when hasPrototype is true", () => {
    const sections = buildWordTOCSections({
      hasPrototype: true,
      hasBody: false,
    });

    // Prototype must sit between definitions and collocations — that's
    // the visual reading order on the page, and the IntersectionObserver
    // active-highlight depends on chip order matching DOM order.
    expect(sections.map((s) => s.id)).toEqual([
      "word-definitions",
      "word-prototype",
      "word-collocations",
      "word-corpus",
      "word-topology",
      "word-synonyms",
      "word-antonyms",
      "word-notes",
    ]);
  });

  it("appends the body chip just before notes when hasBody is true", () => {
    const sections = buildWordTOCSections({
      hasPrototype: false,
      hasBody: true,
    });

    expect(sections.map((s) => s.id)).toEqual([
      "word-definitions",
      "word-collocations",
      "word-corpus",
      "word-topology",
      "word-synonyms",
      "word-antonyms",
      "word-body",
      "word-notes",
    ]);
  });

  it("includes both optional chips when hasPrototype and hasBody are true", () => {
    const sections = buildWordTOCSections({
      hasPrototype: true,
      hasBody: true,
    });

    expect(sections).toHaveLength(9);
    expect(sections[0]?.id).toBe("word-definitions");
    expect(sections[sections.length - 1]?.id).toBe("word-notes");
    expect(sections.find((s) => s.id === "word-prototype")).toBeDefined();
    expect(sections.find((s) => s.id === "word-body")).toBeDefined();
  });

  it("always anchors 释义 first and 笔记 last regardless of optional flags", () => {
    const cases: Array<{ hasPrototype: boolean; hasBody: boolean }> = [
      { hasPrototype: false, hasBody: false },
      { hasPrototype: true, hasBody: false },
      { hasPrototype: false, hasBody: true },
      { hasPrototype: true, hasBody: true },
    ];

    for (const input of cases) {
      const sections = buildWordTOCSections(input);
      expect(sections[0]).toEqual({ id: "word-definitions", label: "释义" });
      expect(sections[sections.length - 1]).toEqual({
        id: "word-notes",
        label: "笔记",
      });
    }
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

/* ── observer constants ──────────────────────────────────────────── */

describe("TOC observer constants", () => {
  it("derives rootMargin from TOC_BAR_HEIGHT_REM with a 4rem breathing gap", () => {
    // Top inset = bar height + 4rem so a section that just slid below the
    // chip bar isn't still treated as the active one.
    expect(TOC_OBSERVER_ROOT_MARGIN).toBe(
      `-${TOC_BAR_HEIGHT_REM + 4}rem 0px -55% 0px`,
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
