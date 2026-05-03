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
  // Atomic jsonb_set via RPC — prevents a concurrent fsrs_weights write
  // from clobbering this desired_retention update (the old read-modify-write
  // pattern would lose one of them when both fired in the same window).
  const normalized = normalizeDesiredRetention(desiredRetention);
  const { data, error } = await supabase.rpc("upsert_profile_review_setting", {
    p_user_id: userId,
    p_key: "desired_retention",
    p_value: asJson(normalized),
    p_now: nowIso,
  });

  if (error) {
    throw error;
  }

  return readDesiredRetentionSetting(data ?? null);
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
  // Same atomic RPC pattern as desired_retention — the DB merge guarantees
  // we never overwrite a concurrently-changed desired_retention value. A
  // null payload deletes the `fsrs_weights` key; a non-null value upserts.
  const jsonValue: Json | null = payload
    ? asJson({
        sample_size: payload.sampleSize,
        trained_at: payload.trainedAt,
        version: payload.version,
        weights: [...payload.weights],
      })
    : null;

  const { data, error } = await supabase.rpc("upsert_profile_review_setting", {
    p_user_id: userId,
    p_key: "fsrs_weights",
    p_value: jsonValue,
    p_now: nowIso,
  });

  if (error) {
    throw error;
  }

  return readFsrsWeightsSetting(data ?? null);
}

// ── Prompt mode + self-calibration prediction preferences ────────────────
// Stored under settings.review.{prompt_modes, prediction_enabled}. These are
// pure UX preferences — they do NOT change scheduling math; the FSRS core
// stays untouched. They DO get logged into review_logs.metadata for later
// analytics (which mode was actually shown / how confident the user said
// they were), so the data path is one-way: preferences pick the front-face
// rendering, the rendering result + user prediction get attached to the
// rating log.

/**
 * Canonical prompt-mode enum — covers everything the renderer layer knows
 * about. Used by `resolvePrompt`, schema validation for review_logs metadata,
 * and the drill self-test page.
 *
 * `cloze` belongs here but INTENTIONALLY does NOT belong in the Zen FSRS
 * flow (see `ZEN_PROMPT_MODES` below). Cloze is fact-retrieval — right vs
 * wrong — while FSRS ratings are metacognitive self-assessments of recall
 * strength. Mixing the two biases the scheduler: a user who blanks on the
 * cloze but would have self-rated "Good" on a forward prompt gets
 * systematically penalised. Cloze lives in the separate drill mode where
 * no review_logs are written at all.
 */
export const REVIEW_PROMPT_MODES = ["forward", "reverse", "cloze"] as const;

export type ReviewPromptMode = (typeof REVIEW_PROMPT_MODES)[number];

/**
 * Subset of modes exposed to the Zen review preferences UI and actually
 * served to FSRS-rated cards. Kept as a separate const so the type system
 * catches any accidental attempt to reintroduce cloze into zen (e.g. a
 * future refactor calling `REVIEW_PROMPT_MODES.filter(...)`) — the form
 * iteration and persisted-prefs normalization both key off ZEN_PROMPT_MODES
 * exclusively. Drill mode continues to pull from REVIEW_PROMPT_MODES so it
 * can still tag its resolved prompts as `cloze`.
 */
export const ZEN_PROMPT_MODES = ["forward", "reverse"] as const;

export type ZenPromptMode = (typeof ZEN_PROMPT_MODES)[number];

const ZEN_PROMPT_MODE_SET = new Set<ZenPromptMode>(ZEN_PROMPT_MODES);

export interface UserReviewPreferences {
  /** When true the front face shows a 0–100% confidence slider before flip. */
  predictionEnabled: boolean;
  /**
   * Allowed front-face prompt modes for the Zen FSRS flow. Per-card the
   * renderer picks one at random from this list, with a guaranteed fallback
   * to "forward" so a never-defined / cleared list is still recoverable.
   * Note: `cloze` is intentionally absent from the type — it lives in the
   * drill self-test only. See the comment on `ZEN_PROMPT_MODES`.
   */
  promptModes: ZenPromptMode[];
}

export const DEFAULT_REVIEW_PREFERENCES: UserReviewPreferences = {
  predictionEnabled: false,
  promptModes: ["forward"],
};

function isZenPromptMode(value: unknown): value is ZenPromptMode {
  return typeof value === "string" && ZEN_PROMPT_MODE_SET.has(value as ZenPromptMode);
}

/**
 * Reads and normalises the prompt-mode list. Unknown / non-string entries
 * are dropped silently (forward-compat with future modes); duplicates are
 * collapsed; the result is ordered to match ZEN_PROMPT_MODES so the
 * settings UI stays stable across reloads. Empty result → forward fallback.
 *
 * Forward-migration: if a user's persisted prompt_modes array contains
 * "cloze" from before cloze was excised from Zen, it's silently filtered
 * out here. The stored JSON may still have cloze until the next save, but
 * no consumer ever sees it.
 */
export function readReviewPromptModes(
  settings: Json | null | undefined,
): ZenPromptMode[] {
  if (!isJsonObject(settings)) return [...DEFAULT_REVIEW_PREFERENCES.promptModes];
  const reviewSettings = settings.review;
  if (!isJsonObject(reviewSettings)) return [...DEFAULT_REVIEW_PREFERENCES.promptModes];
  const raw = reviewSettings.prompt_modes;
  if (!Array.isArray(raw)) return [...DEFAULT_REVIEW_PREFERENCES.promptModes];

  const valid = new Set<ZenPromptMode>();
  for (const entry of raw) {
    if (isZenPromptMode(entry)) valid.add(entry);
  }
  if (valid.size === 0) return [...DEFAULT_REVIEW_PREFERENCES.promptModes];

  return ZEN_PROMPT_MODES.filter((mode) => valid.has(mode));
}

export function readReviewPredictionEnabled(
  settings: Json | null | undefined,
): boolean {
  if (!isJsonObject(settings)) return DEFAULT_REVIEW_PREFERENCES.predictionEnabled;
  const reviewSettings = settings.review;
  if (!isJsonObject(reviewSettings)) return DEFAULT_REVIEW_PREFERENCES.predictionEnabled;
  const raw = reviewSettings.prediction_enabled;
  return typeof raw === "boolean" ? raw : DEFAULT_REVIEW_PREFERENCES.predictionEnabled;
}

export function readReviewPreferences(
  settings: Json | null | undefined,
): UserReviewPreferences {
  return {
    predictionEnabled: readReviewPredictionEnabled(settings),
    promptModes: readReviewPromptModes(settings),
  };
}

export async function getUserReviewPreferences(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<UserReviewPreferences> {
  const { data, error } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return readReviewPreferences(data?.settings ?? null);
}

/**
 * Partial-update preferences: only keys present on `update` are persisted.
 * Each key writes via the existing upsert_profile_review_setting RPC, so
 * concurrent writes against unrelated review settings (desired_retention,
 * fsrs_weights) cannot clobber us. Two RPCs run in parallel when both keys
 * are present; either failing surfaces as a thrown error and the caller is
 * expected to refetch authoritative state.
 */
export async function updateUserReviewPreferences(
  supabase: AppSupabaseClient,
  userId: string,
  update: Partial<UserReviewPreferences>,
  nowIso: string,
): Promise<UserReviewPreferences> {
  // The supabase rpc builder returns PromiseLike, which Promise.all rejects.
  // Wrap each call in an async IIFE so we get a real Promise back without
  // losing the parallel-write benefit (still two concurrent network calls
  // when both keys are present).
  const ops: Array<Promise<void>> = [];

  if (update.predictionEnabled !== undefined) {
    const value = update.predictionEnabled;
    ops.push(
      (async () => {
        const { error } = await supabase.rpc("upsert_profile_review_setting", {
          p_user_id: userId,
          p_key: "prediction_enabled",
          p_value: asJson(value),
          p_now: nowIso,
        });
        if (error) throw error;
      })(),
    );
  }

  if (update.promptModes !== undefined) {
    // Normalise against ZEN_PROMPT_MODES (not REVIEW_PROMPT_MODES) so any
    // cloze values slipping through (from stale clients, mismatched schema,
    // or a future code path that forgets the subset) are dropped at the
    // persistence boundary. Matches the read-path narrowing in
    // readReviewPromptModes: cloze never reaches the Zen UI.
    const requested = update.promptModes;
    const normalised = ZEN_PROMPT_MODES.filter((mode) =>
      requested.includes(mode),
    );
    const finalList: ZenPromptMode[] = normalised.length > 0
      ? [...normalised]
      : [...DEFAULT_REVIEW_PREFERENCES.promptModes];

    ops.push(
      (async () => {
        const { error } = await supabase.rpc("upsert_profile_review_setting", {
          p_user_id: userId,
          p_key: "prompt_modes",
          p_value: asJson(finalList),
          p_now: nowIso,
        });
        if (error) throw error;
      })(),
    );
  }

  if (ops.length === 0) {
    return getUserReviewPreferences(supabase, userId);
  }

  await Promise.all(ops);
  return getUserReviewPreferences(supabase, userId);
}
