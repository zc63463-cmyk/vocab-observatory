import { NextResponse } from "next/server";
import { redactLemmaInSentence } from "@/lib/review/prompt-mode";
import { requireOwnerApiSession } from "@/lib/request-auth";
import type { ParsedExample } from "@/lib/sync/parseMarkdown";

/**
 * Drill candidate API — returns the list of already-reviewed words whose
 * examples contain a redactable occurrence of the lemma.
 *
 * Filters:
 *   - state !== "new"        : never-reviewed words shouldn't be drilled;
 *                              the user hasn't had a first exposure yet
 *   - state !== "suspended"  : respect the user's suspension
 *   - review_count >= 1      : defensive — a row might be "learning" with
 *                              zero reps if the state machine was odd;
 *                              skip those too
 *   - at least one example sentence that redacts successfully
 *
 * The response includes a pre-resolved cloze (`clozeText` + length + source)
 * so the client doesn't have to round-trip parseMarkdown again. If a word
 * has multiple usable examples, we pick the first one — deterministic and
 * good enough for a drill (the user can re-roll by re-entering the picker).
 *
 * No scheduling side-effects: drill never writes review_logs or mutates
 * scheduler_payload. This route is purely read-only.
 */

interface DrillCandidateResponseItem {
  progressId: string;
  wordId: string;
  lemma: string;
  title: string;
  slug: string;
  langCode: string;
  shortDefinition: string | null;
  state: string;
  dueAt: string | null;
  reviewCount: number;
  /** Sentence with ▢▢▢ in place of the lemma. */
  clozeText: string;
  clozeLength: number;
  clozeSource: string;
}

export async function GET() {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const supabase = ownerSession.supabase!;
  const userId = ownerSession.user!.id;

  // Pull everything that's eligible in one query; we filter client-side
  // for "has a usable cloze" because the logic lives in TS, not SQL.
  // Size cap is generous (500) — a single user usually has O(hundreds) of
  // reviewable words, and the shape per row is small.
  const { data, error } = await supabase
    .from("user_word_progress")
    .select(
      "id, word_id, state, review_count, due_at, words!inner(slug, title, lemma, lang_code, short_definition, examples)",
    )
    .eq("user_id", userId)
    .neq("state", "new")
    .neq("state", "suspended")
    .gte("review_count", 1)
    .order("due_at", { ascending: true })
    .limit(500);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as unknown as Array<{
    due_at: string | null;
    id: string;
    review_count: number;
    state: string;
    word_id: string;
    words: {
      examples: unknown;
      lang_code: string;
      lemma: string;
      short_definition: string | null;
      slug: string;
      title: string;
    };
  }>;

  const items: DrillCandidateResponseItem[] = [];

  for (const row of rows) {
    const examples = Array.isArray(row.words.examples)
      ? (row.words.examples as ParsedExample[])
      : null;
    if (!examples || examples.length === 0) continue;

    // First successful redaction wins. Mirrors `findClozeFromExamples`
    // in lib/review/prompt-mode.ts but inlined to keep that module free
    // of the ReviewQueueItem coupling (examples here come from the
    // words table, not a queue item).
    let resolved: {
      text: string;
      matchedLength: number;
      source: string;
    } | null = null;

    for (const ex of examples) {
      if (!ex?.text) continue;
      const redacted = redactLemmaInSentence(ex.text, row.words.lemma);
      if (redacted) {
        resolved = {
          text: redacted.text,
          matchedLength: redacted.matchedLength,
          source: ex.text,
        };
        break;
      }
    }

    if (!resolved) continue;

    items.push({
      progressId: row.id,
      wordId: row.word_id,
      lemma: row.words.lemma,
      title: row.words.title,
      slug: row.words.slug,
      langCode: row.words.lang_code ?? "en",
      shortDefinition: row.words.short_definition,
      state: row.state,
      dueAt: row.due_at,
      reviewCount: row.review_count,
      clozeText: resolved.text,
      clozeLength: resolved.matchedLength,
      clozeSource: resolved.source,
    });
  }

  return NextResponse.json({ items });
}
