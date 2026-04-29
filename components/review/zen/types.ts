import type { ReviewQueueItem, ReviewQueueStats, ReviewSessionSummary } from "@/lib/review/types";

export type RatingKey = "again" | "hard" | "good" | "easy";

export type ZenPhase =
  | "loading"
  | "front"
  | "back"
  | "rating"
  | "done"
  | "error";

export interface ZenState {
  phase: ZenPhase;
  item: ReviewQueueItem | null;
  items: ReviewQueueItem[];
  session: ReviewSessionSummary | null;
  stats: ReviewQueueStats | null;
  message: string;
  pending: boolean;
  lastRating: RatingKey | null;
}

export type ZenAction =
  | { type: "INIT"; items: ReviewQueueItem[]; session: ReviewSessionSummary | null; stats: ReviewQueueStats | null }
  | { type: "REVEAL" }
  | { type: "RATE"; rating: RatingKey }
  | { type: "NEXT_CARD"; item: ReviewQueueItem | null }
  | { type: "SET_MESSAGE"; message: string }
  | { type: "SET_ERROR"; message: string }
  | { type: "SET_PENDING"; pending: boolean }
  | { type: "REFRESH_QUEUE"; items: ReviewQueueItem[]; session: ReviewSessionSummary | null; stats: ReviewQueueStats | null }
  | { type: "RESTORE_BACK" }
  | { type: "RESTORE_CARD"; item: ReviewQueueItem }
  | { type: "EXIT" }
  | { type: "NEXT_BATCH"; items: ReviewQueueItem[]; session: ReviewSessionSummary | null };

export interface ZenReviewedItem {
  id: string;
  cardId: string;
  wordId: string;
  word: string;
  definition?: string | null;
  rating: RatingKey;
  ratingLabel: string;
  answeredAt: string;
  durationMs?: number;
  canUndo: boolean;
  undone?: boolean;
}

export interface ZenUiState {
  isHistoryOpen: boolean;
  isUndoing: boolean;
  sessionHistory: ZenReviewedItem[];
}

export const RATING_CONFIG: Record<RatingKey, { label: string; key: string; vimKey: string; color: string }> = {
  again: { label: "Again", key: "1", vimKey: "j", color: "var(--color-accent-2)" },
  hard: { label: "Hard", key: "2", vimKey: "k", color: "#f3dca2" },
  good: { label: "Good", key: "3", vimKey: "l", color: "var(--color-accent)" },
  easy: { label: "Easy", key: "4", vimKey: ";", color: "#0f6f62" },
};
