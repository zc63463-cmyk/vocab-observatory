/**
 * Drill mode: a client-only self-test engine, intentionally separated from
 * the FSRS review flow. Supports multiple test variants (cloze fill-in,
 * definition + masked-lemma recall) but shares the same queue / retry loop.
 *
 * Why a separate engine vs reusing the Zen review flow?
 *   - FSRS rating is metacognitive ("how well did I recall") and its four
 *     buckets feed stability / difficulty math. Cloze is binary (right or
 *     wrong) and the user's subjective recall-strength for the cloze blank
 *     is undefined — they either filled it in or not. Collapsing binary
 *     results onto the FSRS rating scale biases the scheduler.
 *   - The drill loop (wrong → back to tail, keep going until the deck is
 *     empty) is a different game-loop shape from "one shot per card, move
 *     to the next card". Trying to reuse the Zen reducer would mean
 *     either forking it or polluting it with a mode flag on every action.
 *   - Drill MUST NOT write `review_logs`. The entire state machine is
 *     kept in-memory; nothing here touches Supabase.
 *
 * The engine is a pure, reducer-like module so it's trivial to unit-test
 * the queue / correctness logic without mounting React.
 */

/** Supported drill test modes. */
export type DrillMode = "cloze" | "definition";

export const DRILL_MODES: Array<{
  id: DrillMode;
  label: string;
  description: string;
}> = [
  {
    id: "cloze",
    label: "完形填空",
    description: "根据上下文例句，填入缺失的单词",
  },
  {
    id: "definition",
    label: "词汇填空",
    description: "根据释义和字母提示，写出完整单词",
  },
];

export interface DrillCard {
  /** The user_word_progress row id — used as the drill key. */
  progressId: string;
  wordId: string;
  lemma: string;
  title: string;
  slug: string;
  langCode: string;
  shortDefinition: string | null;
  /** Progress.state ("learning" / "review" / "relearning"). */
  state: string;
  /** Sentence with the lemma replaced by `▢▢▢` (CLOZE_BLANK_TOKEN). */
  clozeText: string;
  /** Length of the matched redacted token, useful as a faint length hint. */
  clozeLength: number;
  /** Original (unredacted) sentence — shown in feedback after submission. */
  clozeSource: string;
}

export interface DrillQueueState {
  /** Head of the queue is the current card. */
  queue: DrillCard[];
  /** Unique cards seeded at session start. Does not shrink. */
  totalUnique: number;
  /** Wrong-attempt count keyed by progressId. */
  attemptsByCard: Record<string, number>;
  /** Cards that have been passed at least once. Counted, not shown. */
  passedByCard: Record<string, true>;
  phase: "playing" | "done";
}

/**
 * Build the initial drill state from a candidate deck. Order is preserved
 * exactly as-given — the caller (the picker) owns the shuffle decision.
 * An empty deck yields a terminal `"done"` state so the UI doesn't render
 * a broken session.
 */
export function createDrillQueue(cards: ReadonlyArray<DrillCard>): DrillQueueState {
  const queue = cards.slice();
  return {
    queue,
    totalUnique: queue.length,
    attemptsByCard: {},
    passedByCard: {},
    phase: queue.length === 0 ? "done" : "playing",
  };
}

export interface DrillSubmitResult {
  correct: boolean;
  /** The expected lemma, shown in feedback regardless of correctness. */
  correctAnswer: string;
  next: DrillQueueState;
}

/**
 * Submit an answer for the current card.
 *
 * Rules:
 *   - Normalises both sides before comparing so capitalisation / wrapping
 *     whitespace / trailing punctuation don't trip a correct attempt.
 *   - On correct: card leaves the queue and is marked passed.
 *   - On wrong: attempts counter increments and the card moves to the
 *     tail. The user sees feedback showing the correct answer before the
 *     next card advances (the UI is responsible for the delay; this fn is
 *     synchronous).
 *   - Calling with an empty queue is a no-op: returns `correct: false`,
 *     correctAnswer = "" and leaves state in `"done"`.
 */
export function submitDrillAnswer(
  state: DrillQueueState,
  answer: string,
): DrillSubmitResult {
  if (state.queue.length === 0) {
    return { correct: false, correctAnswer: "", next: state };
  }
  const current = state.queue[0];
  const expected = normalizeDrillAnswer(current.lemma);
  const received = normalizeDrillAnswer(answer);
  const correct = expected.length > 0 && received === expected;

  if (correct) {
    const remaining = state.queue.slice(1);
    return {
      correct: true,
      correctAnswer: current.lemma,
      next: {
        ...state,
        queue: remaining,
        passedByCard: { ...state.passedByCard, [current.progressId]: true },
        phase: remaining.length === 0 ? "done" : "playing",
      },
    };
  }

  // Wrong answer: move the card to the tail, bump the attempt counter.
  // The session stays in `"playing"` because the queue length can only
  // increase-or-hold on a wrong answer; there's always a next card.
  const tail = [...state.queue.slice(1), current];
  const prevAttempts = state.attemptsByCard[current.progressId] ?? 0;
  return {
    correct: false,
    correctAnswer: current.lemma,
    next: {
      ...state,
      queue: tail,
      attemptsByCard: {
        ...state.attemptsByCard,
        [current.progressId]: prevAttempts + 1,
      },
    },
  };
}

/**
 * Move the current card to the tail without recording an attempt. Used
 * by the "晚点再看" button to defer a card the user isn't ready for.
 * A single-card queue becomes a one-card loop, which is fine — they
 * either answer or exit the session.
 */
export function deferDrillCard(state: DrillQueueState): DrillQueueState {
  if (state.queue.length <= 1) return state;
  const [head, ...rest] = state.queue;
  return { ...state, queue: [...rest, head] };
}

/** Number of cards still on deck. Handy for the session progress row. */
export function remainingInDrill(state: DrillQueueState): number {
  return state.queue.length;
}

/**
 * Cards that cleared on the first attempt ever. Derived metric for the
 * summary panel. A card passed is counted as first-try-pass iff it has
 * zero recorded wrong attempts.
 */
export function countFirstTryPasses(state: DrillQueueState): number {
  let count = 0;
  for (const progressId of Object.keys(state.passedByCard)) {
    if ((state.attemptsByCard[progressId] ?? 0) === 0) count += 1;
  }
  return count;
}

/**
 * Normalise an answer for comparison. Intentionally lenient enough to
 * tolerate surrounding whitespace / case / trailing punctuation but
 * strict enough that "cat" ≠ "cats" — the drill is supposed to build
 * exact-recall reflexes. If you want lemma morphology leniency, feed
 * the lemma array in pre-normalised variants instead of relaxing this.
 *
 * Matches on:
 *   - lowercased + trimmed
 *   - collapses runs of internal whitespace to a single space (for
 *     multi-word lemmas like "give up")
 *   - strips trailing punctuation: . , ! ? : ; ) ] } " '
 */
/**
 * Masks a lemma for the "definition" drill mode.
 *
 * Rules ("as few letters as possible"):
 *   - length ≤ 3: show the full word (nothing meaningful to mask).
 *   - length 4: show first + last, one ▢ in the middle.
 *   - length ≥ 5: show first + last, everything in between is ▢.
 *
 * The ▢ glyph is the same CLOZE_BLANK_TOKEN character used in cloze
 * mode so the visual language stays consistent across drill variants.
 */
export function maskLemma(lemma: string): string {
  if (lemma.length <= 3) return lemma;
  const first = lemma[0];
  const last = lemma[lemma.length - 1];
  const blanks = "▢".repeat(Math.max(1, lemma.length - 2));
  return `${first}${blanks}${last}`;
}

export function normalizeDrillAnswer(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?:;)\]}"']+$/u, "");
}
