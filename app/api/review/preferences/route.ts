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

  // ── TEMPORARY DIAGNOSTIC ─────────────────────────────────────────────
  // The user reports "click save → toast 已保存 → state reverts to defaults".
  // To pinpoint whether the write was lost or the read returned stale data,
  // we capture the raw settings.review JSON both before the update and after,
  // and echo the full trace back in the response. Remove once the bug is
  // localized.
  const trace: Record<string, unknown> = {
    received: parsed.data,
    userId,
    nowIso,
  };

  try {
    const { data: beforeRow, error: beforeError } = await supabase
      .from("profiles")
      .select("settings, id")
      .eq("id", userId)
      .maybeSingle();
    trace.before_row_id = beforeRow?.id ?? null;
    trace.before_review = (beforeRow?.settings as { review?: unknown })?.review ?? null;
    trace.before_select_error = beforeError?.message ?? null;
  } catch (e) {
    trace.before_select_throw = e instanceof Error ? e.message : String(e);
  }

  let prefs;
  try {
    prefs = await updateUserReviewPreferences(
      supabase,
      userId,
      parsed.data,
      nowIso,
    );
    trace.update_ok = true;
    trace.update_returned = prefs;
  } catch (e) {
    trace.update_ok = false;
    trace.update_throw = e instanceof Error ? e.message : String(e);
    console.error("[REVIEW_PREFS_DEBUG] update threw:", trace);
    return NextResponse.json(
      { error: trace.update_throw, _debug: trace },
      { status: 500 },
    );
  }

  try {
    const { data: afterRow, error: afterError } = await supabase
      .from("profiles")
      .select("settings, id")
      .eq("id", userId)
      .maybeSingle();
    trace.after_row_id = afterRow?.id ?? null;
    trace.after_review = (afterRow?.settings as { review?: unknown })?.review ?? null;
    trace.after_select_error = afterError?.message ?? null;
  } catch (e) {
    trace.after_select_throw = e instanceof Error ? e.message : String(e);
  }

  console.log("[REVIEW_PREFS_DEBUG]", JSON.stringify(trace));

  return NextResponse.json({ ...prefs, _debug: trace });
}
