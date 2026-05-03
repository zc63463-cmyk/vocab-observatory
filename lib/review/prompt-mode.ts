import type { ReviewQueueItem } from "@/lib/review/types";
import type { ReviewPromptMode } from "@/lib/review/settings";

/**
 * Front-face placeholder used when redacting the target lemma in a cloze
 * sentence. Picked from the Geometric Shapes block (U+25A2) for high
 * visual contrast against the rest of the sentence regardless of font.
 * Three glyphs read as "blank" without leaking the actual letter count
 * via raw underscore width — the explicit length hint is shown
 * separately as a number, never as N underscores.
 */
export const CLOZE_BLANK_TOKEN = "▢▢▢";

export interface ResolvedPrompt {
  mode: ReviewPromptMode;
  /** Cloze sentence with the lemma replaced by `CLOZE_BLANK_TOKEN`. */
  clozeText: string | null;
  /** Letter count of the matched form. Surfaced as a faint length hint. */
  clozeLength: number | null;
  /** Raw source sentence pre-redaction. Useful for debugging / analytics. */
  clozeSource: string | null;
}

const FORWARD_PROMPT: ResolvedPrompt = {
  mode: "forward",
  clozeText: null,
  clozeLength: null,
  clozeSource: null,
};

export interface ResolvePromptOptions {
  allowedModes: ReadonlyArray<ReviewPromptMode>;
  /** Returns 0 ≤ x < 1. Inject `() => 0.5` (or similar) for deterministic tests. */
  random?: () => number;
}

/**
 * Picks the actual prompt mode for a card given the user's allowed-modes
 * setting. Hard rules (override randomness):
 *
 *   1. First-ever exposure (item.is_new) → always forward. The user must
 *      see the word at least once before being asked to retrieve it from a
 *      definition or sentence; otherwise the first review degenerates into
 *      "guess what English word fits this gloss" with no prior anchor.
 *
 *   2. reverse needs a non-empty short_definition / definition_md. Should
 *      be true for every well-formed word, but defensive in case of broken
 *      upstream parse.
 *
 *   3. cloze needs at least one preview example whose text contains the
 *      lemma in a redactable form (whole-word or basic morphology).
 *      Otherwise the cloze would be unsolvable or trivially the source
 *      sentence with no redaction.
 *
 * After hard-rule filtering, the function picks uniformly at random from
 * the surviving candidates. If the candidate list collapses to empty, we
 * fall back to forward — never throw.
 */
export function resolvePrompt(
  item: ReviewQueueItem,
  options: ResolvePromptOptions,
): ResolvedPrompt {
  const random = options.random ?? Math.random;

  if (item.is_new) {
    return FORWARD_PROMPT;
  }

  // Pre-compute the cloze candidate once so we don't redact twice if
  // cloze ends up being the picked mode.
  const clozeCandidate = options.allowedModes.includes("cloze")
    ? findClozeFromExamples(item)
    : null;

  const candidates = options.allowedModes.filter((mode) => {
    if (mode === "forward") return true;
    if (mode === "reverse") {
      const hasDefinition = Boolean(
        (item.short_definition ?? "").trim() ||
          (item.definition_md ?? "").trim(),
      );
      return hasDefinition;
    }
    if (mode === "cloze") return clozeCandidate !== null;
    return false;
  });

  if (candidates.length === 0) {
    return FORWARD_PROMPT;
  }

  const idx = Math.min(
    candidates.length - 1,
    Math.max(0, Math.floor(random() * candidates.length)),
  );
  const pick = candidates[idx] ?? "forward";

  if (pick === "cloze" && clozeCandidate) {
    return {
      mode: "cloze",
      clozeText: clozeCandidate.text,
      clozeLength: clozeCandidate.matchedLength,
      clozeSource: clozeCandidate.source,
    };
  }

  if (pick === "reverse") {
    return { mode: "reverse", clozeText: null, clozeLength: null, clozeSource: null };
  }

  return FORWARD_PROMPT;
}

/**
 * Tries to redact `lemma` (and basic morphological variants) inside a
 * sentence. Returns `null` when the sentence does not contain the lemma
 * in any redactable form — caller should drop cloze for that example and
 * (if no other example matches) fall back to a different mode.
 *
 * Strategy, in priority order:
 *   1. Strip simple markdown emphasis so `**runs**` is treated as `runs`.
 *   2. Whole-word match for the literal lemma (case-insensitive).
 *   3. Basic English suffix variants (s, es, ed, ied, ing, er, est),
 *      including the "drop final -e before -ed/-ing" rule (love → loved).
 *   4. Literal substring match (case-insensitive) — handles non-ASCII
 *      languages where `\b` is unreliable.
 *
 * NOT a real lemmatiser. We prefer recall over precision here: if a
 * morphological variant we don't catch slips through, the cloze mode for
 * that one card just falls back to forward. This is acceptable because
 * the scheduling math is unchanged regardless of mode.
 */
export function redactLemmaInSentence(
  sentence: string,
  lemma: string,
): { text: string; matchedLength: number } | null {
  if (!sentence || !lemma) return null;
  const stripped = stripSimpleMarkdown(sentence);
  if (!stripped) return null;

  const lemmaLc = lemma.toLowerCase();
  const escaped = escapeRegExp(lemmaLc);

  const exactRegex = new RegExp(`\\b${escaped}\\b`, "i");
  const exactMatch = stripped.match(exactRegex);
  if (exactMatch) {
    return {
      text: stripped.replace(exactMatch[0], CLOZE_BLANK_TOKEN),
      matchedLength: exactMatch[0].length,
    };
  }

  const suffixes = ["es", "ed", "ied", "ing", "er", "est", "s"];
  for (const suffix of suffixes) {
    const variant = new RegExp(`\\b${escaped}${suffix}\\b`, "i");
    const m = stripped.match(variant);
    if (m) {
      return {
        text: stripped.replace(m[0], CLOZE_BLANK_TOKEN),
        matchedLength: m[0].length,
      };
    }

    if (
      lemmaLc.endsWith("e") &&
      (suffix === "ed" || suffix === "ing" || suffix === "es")
    ) {
      const base = lemmaLc.slice(0, -1);
      const variantNoE = new RegExp(`\\b${escapeRegExp(base)}${suffix}\\b`, "i");
      const m2 = stripped.match(variantNoE);
      if (m2) {
        return {
          text: stripped.replace(m2[0], CLOZE_BLANK_TOKEN),
          matchedLength: m2[0].length,
        };
      }
    }
  }

  const lcSentence = stripped.toLowerCase();
  const idx = lcSentence.indexOf(lemmaLc);
  if (idx >= 0) {
    return {
      text:
        stripped.slice(0, idx) +
        CLOZE_BLANK_TOKEN +
        stripped.slice(idx + lemma.length),
      matchedLength: lemma.length,
    };
  }

  return null;
}

function stripSimpleMarkdown(input: string): string {
  // Drops `**bold**`, `*italic*`, `_emph_` / `__bold__` markers without
  // disturbing internal punctuation. Intentionally simple — we don't try
  // to handle code spans / links / images, since those rarely appear in
  // example sentences and would require a full markdown pass.
  return input
    .replace(/\*+([^*]+)\*+/g, "$1")
    .replace(/_+([^_]+)_+/g, "$1")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findClozeFromExamples(
  item: ReviewQueueItem,
): { text: string; matchedLength: number; source: string } | null {
  const examples = item.previewExamples;
  if (!examples || examples.length === 0) return null;

  for (const ex of examples) {
    if (!ex.text) continue;
    const redacted = redactLemmaInSentence(ex.text, item.lemma);
    if (redacted) {
      return {
        text: redacted.text,
        matchedLength: redacted.matchedLength,
        source: ex.text,
      };
    }
  }
  return null;
}
