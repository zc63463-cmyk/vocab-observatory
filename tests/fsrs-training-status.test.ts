import { describe, expect, it } from "vitest";
import { MIN_REVIEWS_FOR_TRAINING } from "@/lib/review/fsrs-optimizer";
import type { FsrsWeightsSetting } from "@/lib/review/settings";
import { buildFsrsTrainingStatus } from "@/lib/review/training-status";

const SAMPLE_WEIGHTS: FsrsWeightsSetting = {
  sampleSize: 1234,
  trainedAt: "2026-04-15T12:00:00.000Z",
  version: 1,
  weights: Array.from({ length: 19 }, (_, i) => 0.1 + i * 0.01),
};

describe("buildFsrsTrainingStatus", () => {
  it("returns canTrain=false and zero count for an untouched user", () => {
    const status = buildFsrsTrainingStatus(null, 0);
    expect(status.weights).toBeNull();
    expect(status.eligibility.canTrain).toBe(false);
    expect(status.eligibility.totalReviews).toBe(0);
    expect(status.eligibility.minRequired).toBe(MIN_REVIEWS_FOR_TRAINING);
  });

  it("flips canTrain at the minimum threshold inclusive", () => {
    expect(
      buildFsrsTrainingStatus(null, MIN_REVIEWS_FOR_TRAINING - 1).eligibility
        .canTrain,
    ).toBe(false);
    expect(
      buildFsrsTrainingStatus(null, MIN_REVIEWS_FOR_TRAINING).eligibility
        .canTrain,
    ).toBe(true);
    expect(
      buildFsrsTrainingStatus(null, MIN_REVIEWS_FOR_TRAINING + 100).eligibility
        .canTrain,
    ).toBe(true);
  });

  it("preserves weights payload verbatim when present", () => {
    const status = buildFsrsTrainingStatus(SAMPLE_WEIGHTS, 5_000);
    expect(status.weights).toEqual(SAMPLE_WEIGHTS);
    expect(status.eligibility.canTrain).toBe(true);
    expect(status.eligibility.totalReviews).toBe(5_000);
  });

  it("clamps non-finite or negative counts to zero", () => {
    expect(buildFsrsTrainingStatus(null, -1).eligibility.totalReviews).toBe(0);
    expect(buildFsrsTrainingStatus(null, Number.NaN).eligibility.totalReviews).toBe(
      0,
    );
    expect(
      buildFsrsTrainingStatus(null, Number.POSITIVE_INFINITY).eligibility
        .totalReviews,
    ).toBe(0);
  });

  it("never reports canTrain=true with a clamped count", () => {
    // Even though the user "has weights", a corrupted count should not unlock
    // re-training prematurely.
    expect(buildFsrsTrainingStatus(SAMPLE_WEIGHTS, -50).eligibility.canTrain).toBe(
      false,
    );
  });
});
