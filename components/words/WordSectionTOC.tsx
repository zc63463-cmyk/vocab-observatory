"use client";

import { useEffect, useState } from "react";
import {
  pickActiveSectionId,
  resolveInitialActiveId,
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
  // Read the URL hash on mount so a shared link like
  // `/words/foo#word-notes` highlights the right chip immediately
  // instead of flashing the default first chip until the observer
  // catches up.
  const [activeId, setActiveId] = useState<string | null>(() =>
    resolveInitialActiveId(
      sections,
      typeof window !== "undefined" ? window.location.hash : "",
    ),
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

    // Vestibular safety: skip the smooth animation when the user has
    // requested reduced motion at the OS level.
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    el.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
    setActiveId(id);

    // Preserve the existing history.state object — Next.js App Router
    // stores its segment cache and route tree there. Replacing it with
    // null would clobber that data and break Back/Forward.
    if (
      typeof window !== "undefined" &&
      typeof window.history?.replaceState === "function"
    ) {
      window.history.replaceState(window.history.state, "", `#${id}`);
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
        {/*
          Plain list of nav buttons — NOT a tablist. Tabs in ARIA
          imply tabpanels and arrow-key navigation between siblings;
          here each chip just scrolls the page, so `aria-current=
          "location"` on the active button is the correct semantic
          for in-page navigation. `[&::-webkit-scrollbar]:hidden`
          plus `scrollbarWidth: none` keeps both Firefox and Chromium
          from showing a horizontal scrollbar when chips overflow.
        */}
        <ul
          className="flex gap-1 overflow-x-auto p-1.5 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {sections.map((section) => {
            const isActive = activeId === section.id;
            return (
              <li key={section.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={isActive ? "location" : undefined}
                  onClick={() => handleClick(section.id)}
                  className={
                    isActive
                      ? "rounded-full border border-[rgba(15,111,98,0.22)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-accent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
                      : "rounded-full border border-transparent px-3 py-1 text-xs font-medium text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-surface-glass-hover)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
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
