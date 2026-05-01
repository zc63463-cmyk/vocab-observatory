import { describe, expect, it } from "vitest";
import {
  FSRS_WEIGHTS_SETTING_VERSION,
  getNearestReviewRetentionPreset,
  readDesiredRetentionSetting,
  readFsrsWeightsSetting,
  validateFsrsWeightsArray,
  writeDesiredRetentionSetting,
  writeFsrsWeightsSetting,
  type FsrsWeightsSetting,
} from "@/lib/review/settings";

/** Canonical 19-element FSRS-5 weights array (just sample values; not real trained). */
const SAMPLE_W_19 = [
  0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05,
  0.34, 1.26, 0.29, 2.61, 0, 0,
];

describe("review settings", () => {
  it("reads desired retention from nested profile settings", () => {
    expect(
      readDesiredRetentionSetting({
        review: {
          desired_retention: 0.95,
        },
      }),
    ).toBe(0.95);
  });

  it("falls back to the default retention when settings are missing", () => {
    expect(readDesiredRetentionSetting(null)).toBe(0.9);
    expect(readDesiredRetentionSetting({})).toBe(0.9);
  });

  it("merges desired retention without dropping unrelated settings", () => {
    expect(
      writeDesiredRetentionSetting(
        {
          appearance: {
            theme: "dark",
          },
          review: {
            desired_retention: 0.8,
          },
        },
        0.93,
      ),
    ).toEqual({
      appearance: {
        theme: "dark",
      },
      review: {
        desired_retention: 0.93,
      },
    });
  });

  it("maps configured values to the nearest preset", () => {
    expect(getNearestReviewRetentionPreset(0.965).id).toBe("sprint");
    expect(getNearestReviewRetentionPreset(0.905).id).toBe("balanced");
    expect(getNearestReviewRetentionPreset(0.84).id).toBe("conservative");
  });

  it("falls back to the balanced preset when the value is missing", () => {
    expect(getNearestReviewRetentionPreset(null).id).toBe("balanced");
  });
});

describe("fsrs weights settings", () => {
  const baseRead = (ws: FsrsWeightsSetting) =>
    readFsrsWeightsSetting({
      review: {
        fsrs_weights: {
          sample_size: ws.sampleSize,
          trained_at: ws.trainedAt,
          version: ws.version,
          weights: [...ws.weights],
        },
      },
    });

  it("returns null when settings are missing or malformed", () => {
    expect(readFsrsWeightsSetting(null)).toBeNull();
    expect(readFsrsWeightsSetting({})).toBeNull();
    expect(readFsrsWeightsSetting({ review: null })).toBeNull();
    expect(readFsrsWeightsSetting({ review: { fsrs_weights: null } })).toBeNull();
    expect(readFsrsWeightsSetting({ review: { fsrs_weights: "not-an-object" } })).toBeNull();
  });

  it("returns null when weights array is too short or too long", () => {
    const tooShort = {
      review: {
        fsrs_weights: {
          sample_size: 1000,
          trained_at: "2026-05-01T00:00:00Z",
          version: 1,
          weights: Array(10).fill(0.5),
        },
      },
    };
    const tooLong = {
      review: {
        fsrs_weights: {
          sample_size: 1000,
          trained_at: "2026-05-01T00:00:00Z",
          version: 1,
          weights: Array(30).fill(0.5),
        },
      },
    };
    expect(readFsrsWeightsSetting(tooShort)).toBeNull();
    expect(readFsrsWeightsSetting(tooLong)).toBeNull();
  });

  it("returns null when any weight is non-finite", () => {
    const corrupt = {
      review: {
        fsrs_weights: {
          sample_size: 1000,
          trained_at: "2026-05-01T00:00:00Z",
          version: 1,
          weights: [...SAMPLE_W_19.slice(0, 18), Number.NaN],
        },
      },
    };
    expect(readFsrsWeightsSetting(corrupt)).toBeNull();
  });

  it("returns null when trained_at is missing or empty", () => {
    expect(
      readFsrsWeightsSetting({
        review: {
          fsrs_weights: {
            sample_size: 1000,
            trained_at: "",
            version: 1,
            weights: SAMPLE_W_19,
          },
        },
      }),
    ).toBeNull();
  });

  it("returns null when sample_size is negative or non-finite", () => {
    expect(
      readFsrsWeightsSetting({
        review: {
          fsrs_weights: {
            sample_size: -1,
            trained_at: "2026-05-01T00:00:00Z",
            version: 1,
            weights: SAMPLE_W_19,
          },
        },
      }),
    ).toBeNull();
  });

  it("round-trips a valid payload via write + read", () => {
    const payload: FsrsWeightsSetting = {
      sampleSize: 2500,
      trainedAt: "2026-05-01T00:00:00.000Z",
      version: FSRS_WEIGHTS_SETTING_VERSION,
      weights: SAMPLE_W_19,
    };
    const stored = writeFsrsWeightsSetting(null, payload);
    const read = readFsrsWeightsSetting(stored);
    expect(read).toEqual(payload);
  });

  it("preserves desired_retention and unrelated settings when writing weights", () => {
    const base = {
      appearance: { theme: "dark" },
      review: { desired_retention: 0.92 },
    };
    const payload: FsrsWeightsSetting = {
      sampleSize: 1200,
      trainedAt: "2026-05-01T00:00:00Z",
      version: 1,
      weights: SAMPLE_W_19,
    };
    const out = writeFsrsWeightsSetting(base, payload) as {
      appearance: unknown;
      review: Record<string, unknown>;
    };
    expect(out.appearance).toEqual({ theme: "dark" });
    expect(out.review.desired_retention).toBe(0.92);
    expect(out.review.fsrs_weights).toBeDefined();
  });

  it("clears weights when writing null but preserves sibling settings", () => {
    const base = {
      review: {
        desired_retention: 0.88,
        fsrs_weights: {
          sample_size: 500,
          trained_at: "2026-04-01T00:00:00Z",
          version: 1,
          weights: SAMPLE_W_19,
        },
      },
    };
    const out = writeFsrsWeightsSetting(base, null);
    // Re-cast only for field access, not when passing back through the library.
    const review = (out as { review: Record<string, unknown> }).review;
    expect(review.fsrs_weights).toBeUndefined();
    expect(review.desired_retention).toBe(0.88);
    expect(readFsrsWeightsSetting(out)).toBeNull();
  });

  it("baseRead reads the payload it was given", () => {
    const payload: FsrsWeightsSetting = {
      sampleSize: 2500,
      trainedAt: "2026-05-01T00:00:00.000Z",
      version: FSRS_WEIGHTS_SETTING_VERSION,
      weights: SAMPLE_W_19,
    };
    const read = baseRead(payload);
    expect(read?.weights.length).toBe(19);
    expect(read?.trainedAt).toBe(payload.trainedAt);
  });
});

describe("validateFsrsWeightsArray", () => {
  it("accepts a canonical 19-element finite array", () => {
    expect(validateFsrsWeightsArray(SAMPLE_W_19)).toEqual(SAMPLE_W_19);
  });

  it("rejects non-arrays", () => {
    expect(validateFsrsWeightsArray(null)).toBeNull();
    expect(validateFsrsWeightsArray(undefined)).toBeNull();
    expect(validateFsrsWeightsArray("foo")).toBeNull();
    expect(validateFsrsWeightsArray({ length: 19 })).toBeNull();
  });

  it("rejects arrays outside the length window (17..25)", () => {
    expect(validateFsrsWeightsArray(new Array(16).fill(0.5))).toBeNull();
    expect(validateFsrsWeightsArray(new Array(26).fill(0.5))).toBeNull();
  });

  it("accepts arrays at the length window boundaries", () => {
    expect(validateFsrsWeightsArray(new Array(17).fill(0.5))).toHaveLength(17);
    expect(validateFsrsWeightsArray(new Array(25).fill(0.5))).toHaveLength(25);
  });

  it("rejects arrays containing non-finite numbers", () => {
    const withNaN = [...SAMPLE_W_19];
    withNaN[0] = Number.NaN;
    expect(validateFsrsWeightsArray(withNaN)).toBeNull();

    const withInf = [...SAMPLE_W_19];
    withInf[1] = Number.POSITIVE_INFINITY;
    expect(validateFsrsWeightsArray(withInf)).toBeNull();
  });

  it("rejects arrays with non-number entries (string, object, null)", () => {
    expect(
      validateFsrsWeightsArray([...SAMPLE_W_19.slice(0, 18), "0.5"]),
    ).toBeNull();
    expect(
      validateFsrsWeightsArray([...SAMPLE_W_19.slice(0, 18), null]),
    ).toBeNull();
  });
});
