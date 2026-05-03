import { describe, expect, it } from "vitest";
import {
  LEECH_LAPSE_SEVERE_THRESHOLD,
  LEECH_LAPSE_THRESHOLD,
  LEECH_SUGGESTIONS,
  assessLeech,
} from "@/lib/review/leech";

function progress(overrides: Partial<Parameters<typeof assessLeech>[0]> = {}) {
  return {
    again_count: 0,
    lapse_count: 0,
    review_count: 0,
    state: "review",
    ...overrides,
  };
}

describe("assessLeech", () => {
  it("returns null when lapse_count is below the threshold", () => {
    expect(assessLeech(progress({ lapse_count: LEECH_LAPSE_THRESHOLD - 1 }))).toBeNull();
  });

  it("flags cards at exactly the threshold as 'leech'", () => {
    const result = assessLeech(
      progress({ lapse_count: LEECH_LAPSE_THRESHOLD, again_count: 7, review_count: 10 }),
    );
    expect(result).not.toBeNull();
    expect(result?.isLeech).toBe(true);
    expect(result?.severity).toBe("leech");
  });

  it("escalates to 'severe' when lapse_count crosses the severe threshold", () => {
    const result = assessLeech(
      progress({ lapse_count: LEECH_LAPSE_SEVERE_THRESHOLD, review_count: 20 }),
    );
    expect(result?.severity).toBe("severe");
  });

  it("skips suspended cards entirely", () => {
    expect(
      assessLeech(progress({ lapse_count: LEECH_LAPSE_SEVERE_THRESHOLD, state: "suspended" })),
    ).toBeNull();
  });

  it("computes recall failure rate using the larger of again/lapse counts", () => {
    const result = assessLeech(
      progress({ again_count: 5, lapse_count: 9, review_count: 10 }),
    );
    // failures = max(5, 9) = 9, rate = 9/10
    expect(result?.recallFailureRate).toBeCloseTo(0.9);
  });

  it("clamps failure rate to at most 1.0", () => {
    const result = assessLeech(
      progress({ again_count: 20, lapse_count: 9, review_count: 10 }),
    );
    expect(result?.recallFailureRate).toBe(1);
  });

  it("returns null rate when review_count is zero", () => {
    const result = assessLeech(
      progress({ lapse_count: LEECH_LAPSE_THRESHOLD, review_count: 0 }),
    );
    expect(result?.recallFailureRate).toBeNull();
  });

  it("coerces negative or fractional inputs into safe integers", () => {
    const result = assessLeech(
      progress({ lapse_count: 8.9, again_count: -3, review_count: 10 }),
    );
    expect(result?.lapse_count).toBe(8);
    expect(result?.again_count).toBe(0);
  });

  it("exposes a suspend suggestion as the destructive action", () => {
    const suspend = LEECH_SUGGESTIONS.find((s) => s.id === "suspend");
    expect(suspend?.destructive).toBe(true);
  });
});
