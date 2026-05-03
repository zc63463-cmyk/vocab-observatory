/**
 * Leech detection — flags cards the FSRS scheduler keeps re-introducing
 * because the user can't get them to stick. The threshold mirrors the
 * commonly-cited Anki/FSRS heuristic: ≥8 lapses on a single card means
 * something about the encoding (sentence, mnemonic, ambiguity) is broken
 * and the user needs intervention rather than more repetitions.
 *
 * This module is pure — no DB access, no React. The detector takes a
 * narrow shape so both server (dashboard aggregator) and client (sidebar
 * panel) can call it with the same answer.
 */

/** A card crosses into "leech" territory once it has lapsed this many times. */
export const LEECH_LAPSE_THRESHOLD = 8;

/**
 * Severe-leech threshold — at this point the card is so resistant that we
 * actively suggest suspending it rather than keep grinding on it. Mirrors
 * the heuristic Anki uses for its automatic card-suspend feature.
 */
export const LEECH_LAPSE_SEVERE_THRESHOLD = 12;

export type LeechSeverity = "watch" | "leech" | "severe";

export interface LeechProgressInput {
  again_count: number;
  lapse_count: number;
  review_count: number;
  state: string;
}

export interface LeechAssessment {
  again_count: number;
  /** True iff `lapse_count >= LEECH_LAPSE_THRESHOLD` and the card is not suspended. */
  isLeech: boolean;
  lapse_count: number;
  /**
   * Ratio of "again" answers among all reviews — gives a finer signal than
   * raw lapse_count. A card with 9 lapses out of 10 reviews is much worse
   * than one with 9 lapses out of 50. Null when there are no reviews yet.
   */
  recallFailureRate: number | null;
  severity: LeechSeverity;
}

/**
 * Returns null for cards that don't qualify as leeches yet. Returning a
 * structured assessment otherwise lets callers branch on `severity` for
 * UI tone (warn vs danger) without re-deriving thresholds.
 *
 * Suspended cards are intentionally not flagged — they're already out of
 * rotation, and re-flagging them would invite the user to suspend twice.
 */
export function assessLeech(progress: LeechProgressInput): LeechAssessment | null {
  if (progress.state === "suspended") return null;

  const lapseCount = Math.max(0, progress.lapse_count | 0);
  const againCount = Math.max(0, progress.again_count | 0);
  const reviewCount = Math.max(0, progress.review_count | 0);

  if (lapseCount < LEECH_LAPSE_THRESHOLD) return null;

  const severity: LeechSeverity =
    lapseCount >= LEECH_LAPSE_SEVERE_THRESHOLD ? "severe" : "leech";

  // Use the larger of again_count and lapse_count as the failure numerator
  // — historical schemas sometimes only tracked one or the other, and we
  // never want to under-report the failure rate when the data is patchy.
  const failures = Math.max(againCount, lapseCount);
  const recallFailureRate =
    reviewCount > 0 ? Math.min(1, failures / reviewCount) : null;

  return {
    again_count: againCount,
    isLeech: true,
    lapse_count: lapseCount,
    recallFailureRate,
    severity,
  };
}

export interface LeechSuggestion {
  /** Stable ID for React keys / analytics. */
  id: "rewrite-example" | "add-mnemonic" | "split-sense" | "suspend";
  /** Short button-style label (Chinese). */
  label: string;
  /** One-line explanation of *why* this remediation should help. */
  description: string;
  /** True for the destructive action so the UI can style it warning-toned. */
  destructive?: boolean;
}

/**
 * Curated remediation playbook surfaced when a card crosses the leech
 * threshold. Order is rough priority: cheap edits first, then suspension
 * as the last resort. Severity-specific filtering happens client-side.
 */
export const LEECH_SUGGESTIONS: readonly LeechSuggestion[] = [
  {
    id: "rewrite-example",
    label: "换造句",
    description:
      "现有例句对你不工作。挑一句更具体、更贴近你日常的语境重写，激活已有记忆锚点。",
  },
  {
    id: "add-mnemonic",
    label: "加助记 / 图像",
    description:
      "用一张画面、一个谐音或一个故事把这个词钉在感官记忆里。比单纯重复有效得多。",
  },
  {
    id: "split-sense",
    label: "拆分含义",
    description:
      "如果这个词有多个义项，把它们拆成独立卡片再各自练习。混在一起常常导致互相干扰。",
  },
  {
    id: "suspend",
    label: "暂时挂起",
    description: "先冻结这张卡，等你完成一次重写或助记后再手动恢复。避免每天空耗精力。",
    destructive: true,
  },
];
