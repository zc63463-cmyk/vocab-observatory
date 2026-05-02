"use client";

import { useEffect, useState } from "react";
import {
  pickActiveSectionId,
  TOC_OBSERVER_ROOT_MARGIN,
  type WordTOCSection,
} from "@/lib/word-section-toc";

export type { WordTOCSection } from "@/lib/word-section-toc";

/**
 * Sticky in-page table of contents shown ABOVE lg breakpoint only —
 * desktop already has the persistent OwnerWordSidebar on the right and
 * doesn't need this. On mobile / tablet the sidebar collapses to the
 * bottom of the page, which makes reaching `WordNotes` painful when the
 * user is scrolling through definitions / collocations / topology /
 * synonyms / antonyms / body text. This component renders a horizontal
 * scrollable chip bar that lets the reader jump anywhere on the page —
 * crucially including the personal note section — with a single tap.
 *
 * Scroll positioning:
 *  - Sticky `top` reads from `--toc-sticky-top` CSS var, default 5rem
 *    (= the SiteHeader height on the standalone /words/[slug] page).
 *  - The intercepted modal route overrides `--toc-sticky-top` to 0 so
 *    the bar pins to the top of the modal's own scroll container instead
 *    of leaving a fake gap where the sticky header would have been.
 *  - Each target section pairs with `scroll-margin-top:
 *    calc(var(--toc-sticky-top,5rem) + 3.5rem)` so smooth-scroll lands
 *    flush below the TOC bar instead of underneath it.
 *
 * Active highlighting uses a single IntersectionObserver — the topmost
 * intersecting section in the upper 45% of the viewport wins. The
 * picking algorithm lives in `lib/word-section-toc.ts` so it's tested
 * without a DOM. We deliberately don't mutate `activeId` on click
 * directly: letting the observer drive it keeps the pill state honest
 * with the actual scroll position, including momentum scroll on iOS.
 */

export function WordSectionTOC({ sections }: { sections: WordTOCSection[] }) {
  const [activeId, setActiveId] = useState<string | null>(
    sections[0]?.id ?? null,
  );

  useEffect(() => {
    if (typeof window === "undefined" || sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const next = pickActiveSectionId(
          entries.map((entry) => ({
            id: entry.target.id,
            isIntersecting: entry.isIntersecting,
            top: entry.boundingClientRect.top,
          })),
        );
        // pickActiveSectionId returns null when nothing is intersecting,
        // which we treat as "no change" so the highlight doesn't blink
        // off when the user scrolls past the final section.
        if (next) setActiveId(next);
      },
      {
        rootMargin: TOC_OBSERVER_ROOT_MARGIN,
        threshold: 0,
      },
    );

    sections.forEach((section) => {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections]);

  function handleClick(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
    if (
      typeof window !== "undefined" &&
      typeof window.history?.replaceState === "function"
    ) {
      window.history.replaceState(null, "", `#${id}`);
    }
  }

  if (sections.length === 0) return null;

  return (
    <nav
      aria-label="词条页内导航"
      className="sticky z-30 mb-4 lg:hidden"
      style={{ top: "var(--toc-sticky-top, 5rem)" }}
    >
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/85 shadow-sm backdrop-blur-md backdrop-saturate-150">
        <ul
          role="tablist"
          className="flex gap-1 overflow-x-auto p-1.5"
          style={{ scrollbarWidth: "none" }}
        >
          {sections.map((section) => {
            const isActive = activeId === section.id;
            return (
              <li key={section.id} className="shrink-0">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleClick(section.id)}
                  className={
                    isActive
                      ? "rounded-full border border-[rgba(15,111,98,0.22)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-accent)] transition-colors"
                      : "rounded-full border border-transparent px-3 py-1 text-xs font-medium text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-surface-glass-hover)] hover:text-[var(--color-ink)]"
                  }
                  style={{
                    touchAction: "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {section.label}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
