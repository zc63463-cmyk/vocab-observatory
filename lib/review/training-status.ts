import type { SupabaseClient } from "@supabase/supabase-js";
import { MIN_REVIEWS_FOR_TRAINING } from "@/lib/review/fsrs-optimizer";
import {
  getUserFsrsWeights,
  type FsrsWeightsSetting,
} from "@/lib/review/settings";
import type { Database } from "@/types/database.types";

/**
 * Aggregate the user-facing inputs the training UI needs:
 *   - Have they trained? (weights payload — null when never trained)
 *   - Can they train *right now*? (sample-size gate)
 *
 * Kept in its own module so both the API route and the server-side dashboard
 * loader can project the same shape without a circular dep through
 * fsrs-optimizer's binding import.
 */
export interface FsrsTrainingEligibility {
  canTrain: boolean;
  minRequired: number;
  totalReviews: number;
}

export interface FsrsTrainingStatus {
  eligibility: FsrsTrainingEligibility;
  weights: FsrsWeightsSetting | null;
}

/**
 * Pure projection. Both the route handler and the dashboard summary already
 * have the inputs in hand — they call this to avoid duplicating the
 * eligibility math.
 */
export function buildFsrsTrainingStatus(
  weights: FsrsWeightsSetting | null,
  totalReviews: number,
): FsrsTrainingStatus {
  const safeTotal = Math.max(0, Number.isFinite(totalReviews) ? totalReviews : 0);
  return {
    eligibility: {
      canTrain: safeTotal >= MIN_REVIEWS_FOR_TRAINING,
      minRequired: MIN_REVIEWS_FOR_TRAINING,
      totalReviews: safeTotal,
    },
    weights,
  };
}

type AppSupabaseClient = SupabaseClient<Database>;

/**
 * Async fetcher used by the train-weights API route. Reads weights and the
 * total non-undone review log count in parallel so a status request stays
 * cheap even on large histories (the count is HEAD-only).
 */
export async function getFsrsTrainingStatus(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<FsrsTrainingStatus> {
  const [weights, countResult] = await Promise.all([
    getUserFsrsWeights(supabase, userId),
    supabase
      .from("review_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("undone", false),
  ]);

  if (countResult.error) {
    throw countResult.error;
  }

  return buildFsrsTrainingStatus(weights, countResult.count ?? 0);
}
