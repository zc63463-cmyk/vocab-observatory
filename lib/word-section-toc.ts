/**
 * Pure helpers for the mobile word-detail in-page TOC.
 *
 * Extracted from `components/words/WordSectionTOC.tsx` so the data shape and
 * the active-section selection algorithm are testable without a DOM.
 *
 * Owner of UX invariants:
 *  - 释义 always first (it's the entry point of the page),
 *  - 笔记 always last (jump-to-notes is the original feature driver),
 *  - prototype/body chips only render when the underlying section is in
 *    the DOM (otherwise the chip would be a dead anchor).
 */

export interface WordTOCSection {
  /** Anchor id of the target `<section>` / `<aside>`. */
  id: string;
  /** Visible chip label (Chinese, terse). */
  label: string;
}

export interface WordTOCSectionsInput {
  /** Whether the prototype block is rendered (= word has prototype_text). */
  hasPrototype: boolean;
  /** Whether the body block is rendered (= word.body_md.trim() non-empty). */
  hasBody: boolean;
}

/**
 * Build the mobile TOC chip list for a word detail page.
 *
 * Order matches the visual scroll order of the rendered sections so the
 * IntersectionObserver-driven active highlight follows reading direction.
 */
export function buildWordTOCSections(
  input: WordTOCSectionsInput,
): WordTOCSection[] {
  const sections: WordTOCSection[] = [
    { id: "word-definitions", label: "释义" },
  ];

  if (input.hasPrototype) {
    sections.push({ id: "word-prototype", label: "原型" });
  }

  sections.push(
    { id: "word-collocations", label: "搭配" },
    { id: "word-corpus", label: "语料" },
    { id: "word-topology", label: "拓扑" },
    { id: "word-synonyms", label: "同义" },
    { id: "word-antonyms", label: "反义" },
  );

  if (input.hasBody) {
    sections.push({ id: "word-body", label: "正文" });
  }

  sections.push({ id: "word-notes", label: "笔记" });

  return sections;
}

/**
 * Minimal shape of an `IntersectionObserverEntry` used by
 * {@link pickActiveSectionId}. Defined explicitly so tests can pass plain
 * objects without faking the full Web API surface.
 */
export interface ObservedSection {
  id: string;
  isIntersecting: boolean;
  /** Equivalent to `entry.boundingClientRect.top`. Smaller = closer to top. */
  top: number;
}

/**
 * Decide which section's chip should be highlighted given the current
 * IntersectionObserver entries. Returns:
 *  - the id of the topmost intersecting section (smallest `top`), or
 *  - `null` when nothing is intersecting — callers should treat this as
 *    "no change" and keep the previous active id, so users who scroll past
 *    the last section don't see the highlight blink off.
 */
export function pickActiveSectionId(
  observed: readonly ObservedSection[],
): string | null {
  const visible = observed.filter((entry) => entry.isIntersecting);
  if (visible.length === 0) return null;

  let topmost = visible[0]!;
  for (let i = 1; i < visible.length; i += 1) {
    const current = visible[i]!;
    if (current.top < topmost.top) {
      topmost = current;
    }
  }
  return topmost.id;
}

/**
 * Pick the initial chip to highlight when the page first mounts.
 *
 * If the URL hash matches a known section id (e.g. shared link to
 * `/words/foo#word-notes`), highlight that chip immediately so users
 * don't see a brief flash of the default first chip before the
 * IntersectionObserver corrects it. Otherwise default to the first
 * chip, or null if the section list is empty.
 *
 * `hash` is `window.location.hash` verbatim — including the leading
 * `#`. Empty string and missing `#` both fall back to the first chip.
 */
export function resolveInitialActiveId(
  sections: readonly WordTOCSection[],
  hash: string,
): string | null {
  if (sections.length === 0) return null;
  const candidate = hash.startsWith("#") ? hash.slice(1) : "";
  if (candidate && sections.some((section) => section.id === candidate)) {
    return candidate;
  }
  return sections[0]!.id;
}

/**
 * Visual height (in rem) of the chip bar itself. Used both for CSS layout
 * (where rem is the natural unit) and as the source of truth for deriving
 * the IntersectionObserver rootMargin.
 */
export const TOC_BAR_HEIGHT_REM = 3;

/**
 * Pixels-per-rem assumed when converting rem → px for the
 * IntersectionObserver. The browser default root font-size is 16px; users
 * who change it via accessibility settings will get a slightly off trigger
 * zone but never a crash. We can NOT read getComputedStyle here because
 * this module loads before any DOM exists.
 */
const PX_PER_REM = 16;

/**
 * `rootMargin` for the IntersectionObserver. Top inset = chip bar height +
 * a 4rem breathing gap so a section that just slid below the bar doesn't
 * keep the previous chip highlighted; bottom inset = -55% so we don't flip
 * to the next chip until the previous section has genuinely scrolled past
 * the middle of the viewport.
 *
 * IMPORTANT: the IntersectionObserver constructor only accepts `px` and
 * `%` for rootMargin per spec — `rem` / `em` throw SyntaxError at
 * construction time and crash the entire page. We pre-compute the rem→px
 * conversion here. See `tests/word-section-toc.test.ts` for the regression
 * guard.
 */
export const TOC_OBSERVER_ROOT_MARGIN = `-${(TOC_BAR_HEIGHT_REM + 4) * PX_PER_REM}px 0px -55% 0px`;
