"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OmniItem, OmniSection } from "./types";
import { omniActions, scoreOmniItem } from "./omni-actions";

/* ─── API response shapes (matching /api/words and /api/plaza) ─── */

interface ApiWord {
  slug: string;
  title: string;
  lemma?: string;
  short_definition?: string;
}

interface ApiPlazaNote {
  slug: string;
  title: string;
  kind?: string;
  summary?: string;
}

/* ─── Slug safety helper ─── */

function safeSlug(slug: string | undefined | null): string {
  if (!slug) return "";
  return encodeURIComponent(slug);
}

/* ─── Hook ─── */

const MAX_ACTIONS = 6;
const MAX_WORDS = 12;
const MAX_SEMANTIC_FIELDS = 6;
const MAX_TOTAL = 24;

export function useOmniSearch(query: string) {
  const [words, setWords] = useState<OmniItem[]>([]);
  const [plazaNotes, setPlazaNotes] = useState<OmniItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Debounced API search */
  useEffect(() => {
    // Clear previous timer
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Abort previous request
    abortRef.current?.abort();

    const q = query.trim();
    if (!q) {
      setWords([]);
      setPlazaNotes([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    debounceRef.current = setTimeout(async () => {
      try {
        const [wordsRes, plazaRes] = await Promise.allSettled([
          fetch(`/api/words?q=${encodeURIComponent(q)}&limit=12`, {
            signal: controller.signal,
          }),
          fetch(`/api/plaza?q=${encodeURIComponent(q)}`, {
            signal: controller.signal,
          }),
        ]);

        // Guard: skip state updates if this request is stale
        if (controller.signal.aborted || abortRef.current !== controller) return;

        // Parse words (independent — one failure must not block the other)
        if (wordsRes.status === "fulfilled" && wordsRes.value.ok) {
          try {
            const data = await wordsRes.value.json();
            if (controller.signal.aborted || abortRef.current !== controller) return;
            const items: OmniItem[] = (data?.words ?? [])
              .filter((w: ApiWord) => w.slug)
              .map((w: ApiWord) => ({
                id: `word:${w.slug}`,
                type: "word" as const,
                title: w.title ?? w.lemma ?? w.slug,
                subtitle: w.short_definition ?? undefined,
                href: `/words/${safeSlug(w.slug)}`,
                icon: "BookOpen",
                keywords: [w.slug, w.lemma, w.title].filter(Boolean),
              }));
            setWords(items);
          } catch {
            if (!controller.signal.aborted && abortRef.current === controller) {
              setWords([]);
            }
          }
        } else {
          if (!controller.signal.aborted && abortRef.current === controller) {
            setWords([]);
          }
        }

        // Parse plaza (independent)
        if (plazaRes.status === "fulfilled" && plazaRes.value.ok) {
          try {
            const data = await plazaRes.value.json();
            if (controller.signal.aborted || abortRef.current !== controller) return;
            const groups = data?.groups ?? [];
            const items: OmniItem[] = [];
            for (const group of groups) {
              for (const note of group.notes ?? []) {
                if (!note.slug) continue;
                items.push({
                  id: `sf:${note.slug}`,
                  type: "semantic-field" as const,
                  title: note.title ?? note.slug,
                  subtitle: note.summary ?? undefined,
                  href: `/plaza/${safeSlug(note.slug)}`,
                  icon: "Grid3X3",
                  keywords: [note.slug, note.title, note.kind].filter(Boolean),
                });
              }
            }
            setPlazaNotes(items);
          } catch {
            if (!controller.signal.aborted && abortRef.current === controller) {
              setPlazaNotes([]);
            }
          }
        } else {
          if (!controller.signal.aborted && abortRef.current === controller) {
            setPlazaNotes([]);
          }
        }
      } catch {
        // AbortError or network failure — keep static commands usable
        if (!controller.signal.aborted && abortRef.current === controller) {
          setWords([]);
          setPlazaNotes([]);
        }
      } finally {
        // Only clear loading if this is still the active controller
        if (!controller.signal.aborted && abortRef.current === controller) {
          setIsLoading(false);
        }
      }
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [query]);

  /* Build sections */
  const sections = useMemo<OmniSection[]>(() => {
    const q = query.trim().toLowerCase();

    // Score & filter actions
    const scoredActions = omniActions
      .map((item) => ({ item, score: scoreOmniItem(item, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ACTIONS)
      .map((x) => x.item);

    const scoredWords = q
      ? words
          .map((item) => ({ item, score: scoreOmniItem(item, q) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_WORDS)
          .map((x) => x.item)
      : [];

    const scoredPlaza = q
      ? plazaNotes
          .map((item) => ({ item, score: scoreOmniItem(item, q) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_SEMANTIC_FIELDS)
          .map((x) => x.item)
      : [];

    const result: OmniSection[] = [];

    if (scoredActions.length > 0) {
      result.push({ id: "actions", title: "快速动作", items: scoredActions });
    }
    if (scoredWords.length > 0) {
      result.push({ id: "words", title: "词条", items: scoredWords });
    }
    if (scoredPlaza.length > 0) {
      result.push({
        id: "semantic-fields",
        title: "语义场",
        items: scoredPlaza,
      });
    }

    // Enforce total cap
    let total = 0;
    for (const section of result) {
      const remaining = MAX_TOTAL - total;
      if (remaining <= 0) {
        section.items = [];
      } else if (section.items.length > remaining) {
        section.items = section.items.slice(0, remaining);
      }
      total += section.items.length;
    }

    return result.filter((s) => s.items.length > 0);
  }, [query, words, plazaNotes]);

  /* Flat item list for keyboard navigation */
  const flatItems = useMemo(
    () => sections.flatMap((s) => s.items),
    [sections],
  );

  return { sections, flatItems, isLoading };
}
