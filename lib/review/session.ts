import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

type OwnerSupabaseClient = SupabaseClient<Database>;

function startOfTodayIso() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
}

export async function getOrCreateReviewSession(
  supabase: OwnerSupabaseClient,
  userId: string,
) {
  const todayIso = startOfTodayIso();
  const { data: existingSession, error } = await supabase
    .from("sessions")
    .select("id, started_at, cards_seen, mode, ended_at")
    .eq("user_id", userId)
    .eq("mode", "review")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (existingSession && existingSession.started_at >= todayIso) {
    return {
      cards_seen: existingSession.cards_seen,
      id: existingSession.id,
      started_at: existingSession.started_at,
    };
  }

  if (existingSession) {
    const { error: endError } = await supabase
      .from("sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", existingSession.id);

    if (endError) {
      throw endError;
    }
  }

  const { data: session, error: createError } = await supabase
    .from("sessions")
    .insert({
      mode: "review",
      user_id: userId,
    })
    .select("id, started_at, cards_seen")
    .single();

  if (createError) {
    throw createError;
  }

  return session;
}

export async function getActiveReviewSession(
  supabase: OwnerSupabaseClient,
  userId: string,
) {
  const todayIso = startOfTodayIso();
  const { data, error } = await supabase
    .from("sessions")
    .select("id, started_at, cards_seen")
    .eq("user_id", userId)
    .eq("mode", "review")
    .is("ended_at", null)
    .gte("started_at", todayIso)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function incrementSessionCardsSeen(
  supabase: OwnerSupabaseClient,
  sessionId: string,
) {
  const { data: session, error } = await supabase
    .from("sessions")
    .select("cards_seen")
    .eq("id", sessionId)
    .single();

  if (error) {
    throw error;
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      cards_seen: session.cards_seen + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (updateError) {
    throw updateError;
  }
}
