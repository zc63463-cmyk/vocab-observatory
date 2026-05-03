import { z } from "zod";
import {
  MAX_DESIRED_RETENTION,
  MIN_DESIRED_RETENTION,
} from "@/lib/review/fsrs-adapter";
import { REVIEW_PROMPT_MODES } from "@/lib/review/settings";

export const reviewRatingSchema = z.enum(["again", "hard", "good", "easy"]);

// REVIEW_PROMPT_MODES is declared `as const` in lib/review/settings, so zod
// reads its literal types directly and `z.infer` of this schema is the same
// `ReviewPromptMode` union — no manual cast needed at call sites.
export const reviewPromptModeSchema = z.enum(REVIEW_PROMPT_MODES);

export const addToReviewSchema = z.object({
  wordId: z.string().uuid(),
});

export const batchAddToReviewSchema = z.object({
  wordIds: z.array(z.string().uuid()).min(1).max(100),
});

export const reviewAnswerSchema = z.object({
  progressId: z.string().uuid(),
  rating: reviewRatingSchema,
  sessionId: z.string().uuid(),
  // Self-calibration prediction in [0, 100]; null/undefined = not provided.
  // Stored into review_logs.metadata.predicted_recall for analytics.
  predictedRecall: z.number().min(0).max(100).nullable().optional(),
  // Front-face prompt mode actually shown for this card. Stored into
  // review_logs.metadata.prompt_mode so we can later analyse recall by mode.
  promptMode: reviewPromptModeSchema.optional(),
});

export const reviewSkipSchema = z.object({
  progressId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export const reviewUndoSchema = z.object({
  reviewLogId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

// Schema for validating previous_progress_snapshot at runtime (Fix-4)
export const previousProgressSnapshotSchema = z.object({
  scheduler_payload: z.record(z.string(), z.unknown()),
  difficulty: z.number().nullable(),
  due_at: z.string().nullable(),
  interval_days: z.number().nullable(),
  lapse_count: z.number().int().default(0),
  last_rating: z.enum(["again", "hard", "good", "easy"]).nullable(),
  last_reviewed_at: z.string().nullable(),
  retrievability: z.number().nullable(),
  review_count: z.number().int().default(0),
  stability: z.number().nullable(),
  state: z.string(),
  again_count: z.number().int().default(0),
  hard_count: z.number().int().default(0),
  good_count: z.number().int().default(0),
  easy_count: z.number().int().default(0),
  content_hash_snapshot: z.string().nullable(),
});

export const reviewSuspendSchema = z.object({
  progressId: z.string().uuid(),
  // Optional so the leech panel on the word detail page can suspend a card
  // without an active review session. The route handler only updates the
  // progress row's state and never reads sessionId, so making it optional
  // is purely a schema relaxation, not a behavioural change.
  sessionId: z.string().uuid().optional(),
});

export const reviewRejoinSchema = z.object({
  progressId: z.string().uuid(),
});

export const reviewSettingsSchema = z.object({
  desiredRetention: z
    .number()
    .min(MIN_DESIRED_RETENTION)
    .max(MAX_DESIRED_RETENTION),
  retuneExisting: z.boolean().default(false),
});

// PATCH-style preferences payload: any subset of keys is acceptable, an
// empty object is a no-op (returns current state). promptModes constraints:
// at least one mode required; duplicates allowed but normalised server-side.
export const reviewPreferencesSchema = z
  .object({
    predictionEnabled: z.boolean().optional(),
    promptModes: z.array(reviewPromptModeSchema).min(1).max(3).optional(),
  })
  .strict();

export const noteSchema = z.object({
  contentMd: z.string().max(20_000),
});

export const noteRestoreSchema = z.object({
  revisionId: z.string().uuid(),
});
