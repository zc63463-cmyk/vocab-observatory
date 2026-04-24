import { z } from "zod";

export const reviewRatingSchema = z.enum(["again", "hard", "good", "easy"]);

export const addToReviewSchema = z.object({
  wordId: z.string().uuid(),
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

export const noteSchema = z.object({
  contentMd: z.string().max(20_000),
});
