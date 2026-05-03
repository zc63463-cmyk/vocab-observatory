/**
 * Front-face placeholder used when redacting the target lemma in a cloze
 * sentence. Picked from the Geometric Shapes block (U+25A2) for high
 * visual contrast against the rest of the sentence regardless of font.
 * Three glyphs read as "blank" without leaking the actual letter count
 * via raw underscore width — the explicit length hint is shown
 * separately as a number, never as N underscores.
 */
export const CLOZE_BLANK_TOKEN = "▢▢▢";

/**
 * Tries to redact `lemma` (and basic morphological variants) inside a
 * sentence. Returns `null` when the sentence does not contain the lemma
 * in any redactable form.
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
