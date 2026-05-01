import { NextResponse, type NextRequest } from "next/server";
import { retuneScheduledReviewCard } from "@/lib/review/fsrs-adapter";
import {
  getUserDesiredRetention,
  getUserFsrsWeights,
  updateUserDesiredRetentionSetting,
} from "@/lib/review/settings";
import type { StoredSchedulerCard } from "@/lib/review/types";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { reviewSettingsSchema } from "@/lib/validation/schemas";
import { asJson } from "@/types/database.types";

export async function GET() {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const desiredRetention = await getUserDesiredRetention(
    ownerSession.supabase!,
    ownerSession.user!.id,
  );

  return NextResponse.json({
    desiredRetention,
  });
}

export async function POST(request: NextRequest) {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const parsed = reviewSettingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const supabase = ownerSession.supabase!;
  const userId = ownerSession.user!.id;
  const now = new Date();
  const nowIso = now.toISOString();
  const desiredRetention = await updateUserDesiredRetentionSetting(
    supabase,
    userId,
    parsed.data.desiredRetention,
    nowIso,
  );

  const { error: progressError } = await supabase
    .from("user_word_progress")
    .update({
      desired_retention: desiredRetention,
      updated_at: nowIso,
    })
    .eq("user_id", userId);

  if (progressError) {
    throw progressError;
  }

  let retunedCount = 0;
  if (parsed.data.retuneExisting) {
    // Personalised weights are baked into every retune call so the new
    // intervals reflect both the new desired retention AND the user's fitted w.
    const fsrsWeights = await getUserFsrsWeights(supabase, userId);
    const { data: progressRows, error: progressRowsError } = await supabase
      .from("user_word_progress")
      .select("id, scheduler_payload")
      .eq("user_id", userId)
      .neq("state", "suspended");

    if (progressRowsError) {
      throw progressRowsError;
    }

    for (const row of progressRows ?? []) {
      const retuned = retuneScheduledReviewCard(
        row.scheduler_payload as StoredSchedulerCard | null,
        desiredRetention,
        now,
        fsrsWeights?.weights ?? null,
      );

      if (!retuned) {
        continue;
      }

      const { error: retuneError } = await supabase
        .from("user_word_progress")
        .update({
          desired_retention: desiredRetention,
          due_at: retuned.dueAt,
          interval_days: retuned.scheduledDays,
          retrievability: retuned.retrievability,
          scheduler_payload: asJson(retuned.nextPayload),
          updated_at: nowIso,
        })
        .eq("id", row.id)
        .eq("user_id", userId);

      if (retuneError) {
        throw retuneError;
      }

      retunedCount += 1;
    }
  }

  return NextResponse.json({
    desiredRetention,
    ok: true,
    retunedCount,
  });
}
