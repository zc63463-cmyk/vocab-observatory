import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_DESIRED_RETENTION,
  normalizeDesiredRetention,
} from "@/lib/review/fsrs-adapter";
import type { Database, Json } from "@/types/database.types";
import { asJson } from "@/types/database.types";

/**
 * Serializable payload for user-trained FSRS weights. Kept minimal and
 * versioned so we can evolve the shape without breaking existing profiles.
 *
 * - `weights`: the 17–21 parameters returned by the FSRS optimizer. We do
 *   not constrain the length here because FSRS v4 (17), v5 (19), and v6 (21)
 *   all use different array sizes; validation happens at read time.
 * - `trainedAt`: ISO timestamp of when these weights were fit, for UI display
 *   and invalidation policies.
 * - `sampleSize`: number of review logs fed to the optimizer. Consumers can
 *   use this to gate confidence ("trained on 2000 reviews" vs "120 reviews").
 * - `version`: schema version for forward compatibility. Start at 1.
 */
export interface FsrsWeightsSetting {
  sampleSize: number;
  trainedAt: string;
  version: number;
  weights: readonly number[];
}

/** FSRS w-array sane length window: v4 has 17, v5 has 19, v6 has 21. */
const FSRS_WEIGHTS_MIN_LENGTH = 17;
const FSRS_WEIGHTS_MAX_LENGTH = 25;
export const FSRS_WEIGHTS_SETTING_VERSION = 1;

/**
 * Shape-validates a raw weights array before we either persist it or hand it
 * to the scheduler. Single source of truth for both the read path (inside
 * `readFsrsWeightsSetting`) and the write path (inside the train-weights
 * route handler) — keeping them in sync prevents the silent failure mode
 * where training completes, writes a malformed array, and the next read
 * quietly falls back to defaults without the user knowing.
 *
 * Returns a finite-number array on success; `null` when the input is not a
 * plausible FSRS w-vector.
 */
export function validateFsrsWeightsArray(
  weights: unknown,
): number[] | null {
  if (!Array.isArray(weights)) return null;
  if (
    weights.length < FSRS_WEIGHTS_MIN_LENGTH ||
    weights.length > FSRS_WEIGHTS_MAX_LENGTH
  ) {
    return null;
  }
  const out: number[] = [];
  for (const w of weights) {
    if (typeof w !== "number" || !Number.isFinite(w)) return null;
    out.push(w);
  }
  return out;
}

/**
 * Minimum review count we require before offering training. FSRS optimizer
 * docs suggest ≥1000 reviews for a good fit; we pick a slightly looser 500
 * so personal users don't have to wait forever to try it.
 *
 * Lives in this binding-free module so dashboard server components can read
 * it without dragging the @open-spaced-repetition/binding NAPI artifact
 * through the bundler. Only the route handler that actually trains needs to
 * import the optimizer.
 */
export const MIN_REVIEWS_FOR_TRAINING = 500;

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

/**
 * Reads a stored FSRS weights payload out of the settings JSON, returning
 * null for any malformed / missing / corrupt variant. Callers pass the
 * result directly into `getScheduler(...)`'s optional `weights` argument;
 * returning null there disables personalisation and falls back to library
 * defaults, which is the safe behaviour for a never-trained user.
 */
export function readFsrsWeightsSetting(
  settings: Json | null | undefined,
): FsrsWeightsSetting | null {
  if (!isJsonObject(settings)) return null;
  const reviewSettings = settings.review;
  if (!isJsonObject(reviewSettings)) return null;
  const raw = reviewSettings.fsrs_weights;
  if (!isJsonObject(raw)) return null;

  const { weights, trained_at, sample_size, version } = raw;
  const parsed = validateFsrsWeightsArray(weights);
  if (!parsed) return null;
  if (typeof trained_at !== "string" || trained_at.length === 0) return null;
  if (
    typeof sample_size !== "number" ||
    !Number.isFinite(sample_size) ||
    sample_size < 0
  ) {
    return null;
  }
  const v = typeof version === "number" && Number.isFinite(version) ? version : 1;

  return {
    sampleSize: sample_size,
    trainedAt: trained_at,
    version: v,
    weights: parsed,
  };
}

/**
 * Writes (or clears) the FSRS weights payload on the settings JSON. Passing
 * `null` clears the saved weights, reverting the user to library defaults.
 * The "review" sub-object is preserved so we don't stomp on desired_retention
 * or other review settings stored alongside it.
 */
export function writeFsrsWeightsSetting(
  settings: Json | null | undefined,
  payload: FsrsWeightsSetting | null,
) {
  const baseSettings = isJsonObject(settings) ? settings : {};
  const reviewSettings = isJsonObject(baseSettings.review)
    ? baseSettings.review
    : {};

  const nextReview = { ...reviewSettings };
  if (payload === null) {
    delete nextReview.fsrs_weights;
  } else {
    nextReview.fsrs_weights = {
      sample_size: payload.sampleSize,
      trained_at: payload.trainedAt,
      version: payload.version,
      weights: [...payload.weights],
    };
  }

  return asJson({
    ...baseSettings,
    review: nextReview,
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

/**
 * Async fetcher for user-trained FSRS weights. Mirrors `getUserDesiredRetention`
 * so consumers (answer route, queue route, dashboard builder) read both
 * personalisation knobs through a single supabase call pattern.
 */
export async function getUserFsrsWeights(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<FsrsWeightsSetting | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return readFsrsWeightsSetting(data?.settings ?? null);
}

export async function updateUserFsrsWeightsSetting(
  supabase: AppSupabaseClient,
  userId: string,
  payload: FsrsWeightsSetting | null,
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

  const nextSettings = writeFsrsWeightsSetting(
    profile?.settings ?? null,
    payload,
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

  return readFsrsWeightsSetting(data.settings);
}
