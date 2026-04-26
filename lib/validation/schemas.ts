import { z } from "zod";
import {
  MAX_DESIRED_RETENTION,
  MIN_DESIRED_RETENTION,
} from "@/lib/review/fsrs-adapter";

export const reviewRatingSchema = z.enum(["again", "hard", "good", "easy"]);

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
});

export const reviewSkipSchema = z.object({
  progressId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export const reviewSuspendSchema = z.object({
  progressId: z.string().uuid(),
  sessionId: z.string().uuid(),
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

export const noteSchema = z.object({
  contentMd: z.string().max(20_000),
});

export const noteRestoreSchema = z.object({
  revisionId: z.string().uuid(),
});
