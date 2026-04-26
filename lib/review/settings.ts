import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_DESIRED_RETENTION,
  normalizeDesiredRetention,
} from "@/lib/review/fsrs-adapter";
import type { Database, Json } from "@/types/database.types";
import { asJson } from "@/types/database.types";

type AppSupabaseClient = SupabaseClient<Database>;
type JsonObject = { [key: string]: Json | undefined };

export interface ReviewRetentionPreset {
  description: string;
  desiredRetention: number;
  id: "sprint" | "balanced" | "conservative";
  label: string;
}

export const REVIEW_RETENTION_PRESETS: ReviewRetentionPreset[] = [
  {
    description: "Exam prep mode. Shorter intervals, heavier daily load, fewer misses.",
    desiredRetention: 0.97,
    id: "sprint",
    label: "Sprint",
  },
  {
    description: "Everyday mode. Keeps recall stable without overloading the queue.",
    desiredRetention: 0.9,
    id: "balanced",
    label: "Balanced",
  },
  {
    description: "Lighter mode. Longer intervals and a smaller queue, with more tolerated forgetting.",
    desiredRetention: 0.85,
    id: "conservative",
    label: "Conservative",
  },
];

function isJsonObject(value: Json | null | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readDesiredRetentionSetting(settings: Json | null | undefined) {
  if (!isJsonObject(settings)) {
    return DEFAULT_DESIRED_RETENTION;
  }

  const reviewSettings = settings.review;
  if (!isJsonObject(reviewSettings)) {
    return DEFAULT_DESIRED_RETENTION;
  }

  const desiredRetention = reviewSettings.desired_retention;
  return normalizeDesiredRetention(
    typeof desiredRetention === "number" ? desiredRetention : null,
  );
}

export function writeDesiredRetentionSetting(
  settings: Json | null | undefined,
  desiredRetention: number,
) {
  const baseSettings = isJsonObject(settings) ? settings : {};
  const reviewSettings = isJsonObject(baseSettings.review)
    ? baseSettings.review
    : {};

  return asJson({
    ...baseSettings,
    review: {
      ...reviewSettings,
      desired_retention: normalizeDesiredRetention(desiredRetention),
    },
  });
}

export function getNearestReviewRetentionPreset(value?: number | null) {
  const normalized = normalizeDesiredRetention(value);

  return REVIEW_RETENTION_PRESETS.reduce((closest, preset) => {
    const currentDistance = Math.abs(preset.desiredRetention - normalized);
    const closestDistance = Math.abs(closest.desiredRetention - normalized);
    return currentDistance < closestDistance ? preset : closest;
  });
}

export async function getUserDesiredRetention(
  supabase: AppSupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return readDesiredRetentionSetting(data?.settings ?? null);
}

export async function updateUserDesiredRetentionSetting(
  supabase: AppSupabaseClient,
  userId: string,
  desiredRetention: number,
  nowIso: string,
) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  const nextSettings = writeDesiredRetentionSetting(
    profile?.settings ?? null,
    desiredRetention,
  );

  const { data, error } = await supabase
    .from("profiles")
    .update({
      settings: nextSettings,
      updated_at: nowIso,
    })
    .eq("id", userId)
    .select("settings")
    .single();

  if (error) {
    throw error;
  }

  return readDesiredRetentionSetting(data.settings);
}
