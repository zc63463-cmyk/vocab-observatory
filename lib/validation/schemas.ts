import { z } from "zod";

export const reviewRatingSchema = z.enum(["again", "hard", "good", "easy"]);

export const addToReviewSchema = z.object({
  wordId: z.string().uuid(),
});

export const reviewAnswerSchema = z.object({
  progressId: z.string().uuid(),
  rating: reviewRatingSchema,
});

export const noteSchema = z.object({
  contentMd: z.string().max(20_000),
});
