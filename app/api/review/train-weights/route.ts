import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  MIN_REVIEWS_FOR_TRAINING,
  trainFsrsWeights,
  type OptimizerLog,
} from "@/lib/review/fsrs-optimizer";
import {
  getUserFsrsWeights,
  updateUserFsrsWeightsSetting,
  type FsrsWeightsSetting,
  FSRS_WEIGHTS_SETTING_VERSION,
} from "@/lib/review/settings";
import { requireOwnerApiSession } from "@/lib/request-auth";
import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Training is heavier than other review endpoints — the WASI optimizer in
 * @open-spaced-repetition/binding can take several seconds for a few thousand
 * reviews. Force the Node runtime (Edge can't load native modules) and bump
 * the per-invocation timeout enough that realistic histories finish in time.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

/** Hard cap on rows pulled to keep training memory bounded. */
const MAX_LOGS_TO_FETCH = 50_000;
const PAGE_SIZE = 1_000;

const trainBodySchema = z
  .object({
    /** Forwarded to the optimizer; defaults to ts-fsrs's preferred behaviour. */
    enableShortTerm: z.boolean().optional(),
  })
  .strict()
  .optional();

type AppSupabaseClient = SupabaseClient<Database>;

/**
 * Pages through `review_logs` for the given user, returning rows in the
 * exact shape the optimizer expects. Skips undone logs since those have
 * been reverted by the undo flow and do not represent real recall events.
 */
async function fetchOptimizerLogs(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<OptimizerLog[]> {
  const out: OptimizerLog[] = [];
  let offset = 0;

  while (out.length < MAX_LOGS_TO_FETCH) {
    const { data, error } = await supabase
      .from("review_logs")
      .select("progress_id, rating, reviewed_at")
      .eq("user_id", userId)
      .eq("undone", false)
      .order("reviewed_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    out.push(
      ...data.map((row) => ({
        progress_id: row.progress_id,
        rating: row.rating,
        reviewed_at: row.reviewed_at,
      })),
    );

    if (data.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return out;
}

async function countUserReviewLogs(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("review_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("undone", false);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

interface EligibilityPayload {
  canTrain: boolean;
  minRequired: number;
  totalReviews: number;
}

/**
 * Common GET-style payload also used by POST/DELETE responses so the UI can
 * re-render against a single shape.
 */
interface TrainStatusPayload {
  eligibility: EligibilityPayload;
  weights: FsrsWeightsSetting | null;
}

async function buildStatus(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<TrainStatusPayload> {
  const [weights, totalReviews] = await Promise.all([
    getUserFsrsWeights(supabase, userId),
    countUserReviewLogs(supabase, userId),
  ]);

  return {
    eligibility: {
      canTrain: totalReviews >= MIN_REVIEWS_FOR_TRAINING,
      minRequired: MIN_REVIEWS_FOR_TRAINING,
      totalReviews,
    },
    weights,
  };
}

export async function GET() {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const status = await buildStatus(
    ownerSession.supabase!,
    ownerSession.user!.id,
  );
  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const supabase = ownerSession.supabase!;
  const userId = ownerSession.user!.id;

  // Body is optional — POST with no body is the common "train with defaults" path.
  let bodyOptions: z.infer<typeof trainBodySchema> = undefined;
  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      const parsed = trainBodySchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      bodyOptions = parsed.data;
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const logs = await fetchOptimizerLogs(supabase, userId);
  if (logs.length < MIN_REVIEWS_FOR_TRAINING) {
    return NextResponse.json(
      {
        error: "Not enough review history to train.",
        eligibility: {
          canTrain: false,
          minRequired: MIN_REVIEWS_FOR_TRAINING,
          totalReviews: logs.length,
        },
      },
      { status: 422 },
    );
  }

  let trained: { sampleSize: number; weights: number[] };
  try {
    trained = await trainFsrsWeights(logs, {
      enableShortTerm: bodyOptions?.enableShortTerm ?? true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Training failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const payload: FsrsWeightsSetting = {
    sampleSize: trained.sampleSize,
    trainedAt: nowIso,
    version: FSRS_WEIGHTS_SETTING_VERSION,
    weights: trained.weights,
  };

  await updateUserFsrsWeightsSetting(supabase, userId, payload, nowIso);

  // Re-build status from DB so we return the exact persisted shape — guards
  // against any silent normalisation in the read path.
  const status = await buildStatus(supabase, userId);
  return NextResponse.json(status);
}

export async function DELETE() {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const supabase = ownerSession.supabase!;
  const userId = ownerSession.user!.id;
  const nowIso = new Date().toISOString();

  await updateUserFsrsWeightsSetting(supabase, userId, null, nowIso);
  const status = await buildStatus(supabase, userId);
  return NextResponse.json(status);
}
