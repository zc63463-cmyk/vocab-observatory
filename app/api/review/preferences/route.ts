import { NextResponse, type NextRequest } from "next/server";
import {
  getUserReviewPreferences,
  updateUserReviewPreferences,
} from "@/lib/review/settings";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { reviewPreferencesSchema } from "@/lib/validation/schemas";

/**
 * Read or update the user's review-experience preferences:
 *   - predictionEnabled  (self-calibration slider before flip)
 *   - promptModes        (allowed front-face modes: forward / reverse / cloze)
 *
 * Stored under profiles.settings.review.{prediction_enabled, prompt_modes}.
 * Writes use the existing upsert_profile_review_setting RPC so concurrent
 * updates against unrelated review settings cannot clobber each other.
 *
 * Contract:
 *   GET  → { predictionEnabled, promptModes }
 *   POST { predictionEnabled?, promptModes? } → returns the resulting state.
 *   POST {} is a valid no-op that returns the current state — useful for the
 *   client to reload after a separate flow modified the settings row.
 */
export async function GET() {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const prefs = await getUserReviewPreferences(
    ownerSession.supabase!,
    ownerSession.user!.id,
  );

  return NextResponse.json(prefs);
}

export async function POST(request: NextRequest) {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const parsed = reviewPreferencesSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = ownerSession.supabase!;
  const userId = ownerSession.user!.id;
  const nowIso = new Date().toISOString();

  const prefs = await updateUserReviewPreferences(
    supabase,
    userId,
    parsed.data,
    nowIso,
  );

  return NextResponse.json(prefs);
}
