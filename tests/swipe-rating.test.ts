import { describe, expect, it } from "vitest";
import {
  SWIPE_DISTANCE_THRESHOLD,
  SWIPE_VELOCITY_THRESHOLD,
  previewSwipeRating,
  resolveSwipeRating,
} from "@/lib/review/swipe-rating";

// Shorthand: zero velocity, zero offset. Most tests only care about one axis.
const STILL = { x: 0, y: 0 };

describe("resolveSwipeRating — distance-triggered commits", () => {
  it("returns null when the gesture is below the distance threshold with no velocity", () => {
    expect(
      resolveSwipeRating({ x: SWIPE_DISTANCE_THRESHOLD - 1, y: 0 }, STILL),
    ).toBeNull();
  });

  it("commits 'again' on a sufficient leftward drag", () => {
    expect(
      resolveSwipeRating({ x: -SWIPE_DISTANCE_THRESHOLD, y: 0 }, STILL),
    ).toBe("again");
  });

  it("commits 'good' on a sufficient rightward drag", () => {
    expect(
      resolveSwipeRating({ x: SWIPE_DISTANCE_THRESHOLD, y: 0 }, STILL),
    ).toBe("good");
  });

  it("commits 'easy' on a sufficient upward drag", () => {
    expect(
      resolveSwipeRating({ x: 0, y: -SWIPE_DISTANCE_THRESHOLD }, STILL),
    ).toBe("easy");
  });

  it("commits 'hard' on a sufficient downward drag", () => {
    expect(
      resolveSwipeRating({ x: 0, y: SWIPE_DISTANCE_THRESHOLD }, STILL),
    ).toBe("hard");
  });
});

describe("resolveSwipeRating — velocity-triggered commits", () => {
  it("commits on a fast flick even when the distance is small", () => {
    expect(
      resolveSwipeRating(
        { x: 20, y: 0 },
        { x: SWIPE_VELOCITY_THRESHOLD, y: 0 },
      ),
    ).toBe("good");
  });

  it("does not commit when both distance and velocity are below threshold", () => {
    expect(
      resolveSwipeRating(
        { x: 20, y: 0 },
        { x: SWIPE_VELOCITY_THRESHOLD - 1, y: 0 },
      ),
    ).toBeNull();
  });

  it("commits vertical flick for easy", () => {
    expect(
      resolveSwipeRating(
        { x: 0, y: -10 },
        { x: 0, y: -SWIPE_VELOCITY_THRESHOLD },
      ),
    ).toBe("easy");
  });

  it("commits vertical flick for hard", () => {
    expect(
      resolveSwipeRating(
        { x: 0, y: 10 },
        { x: 0, y: SWIPE_VELOCITY_THRESHOLD },
      ),
    ).toBe("hard");
  });
});

describe("resolveSwipeRating — dominant axis & tie-breaking", () => {
  it("picks the horizontal direction when |x| > |y|", () => {
    expect(
      resolveSwipeRating(
        { x: 150, y: 80 },
        { x: 0, y: 0 },
      ),
    ).toBe("good");
  });

  it("picks the vertical direction when |y| > |x|", () => {
    expect(
      resolveSwipeRating(
        { x: 80, y: -150 },
        { x: 0, y: 0 },
      ),
    ).toBe("easy");
  });

  it("tie-breaks to horizontal when |x| === |y|", () => {
    expect(
      resolveSwipeRating(
        { x: -100, y: -100 },
        { x: 0, y: 0 },
      ),
    ).toBe("again");
  });

  it("evaluates the dominant axis threshold, not the smaller axis", () => {
    // Large-enough horizontal distance + small vertical — must commit.
    expect(
      resolveSwipeRating(
        { x: SWIPE_DISTANCE_THRESHOLD, y: 10 },
        STILL,
      ),
    ).toBe("good");
  });
});

describe("resolveSwipeRating — edge cases", () => {
  it("returns null when offset and velocity are both zero", () => {
    expect(resolveSwipeRating(STILL, STILL)).toBeNull();
  });

  it("respects custom thresholds passed via options", () => {
    expect(
      resolveSwipeRating(
        { x: 40, y: 0 },
        STILL,
        { distanceThreshold: 30 },
      ),
    ).toBe("good");
  });

  it("negative velocity respects abs when thresholding", () => {
    // Very small offset but high |velocity| — still commits by direction sign.
    expect(
      resolveSwipeRating(
        { x: -5, y: 0 },
        { x: -SWIPE_VELOCITY_THRESHOLD, y: 0 },
      ),
    ).toBe("again");
  });

  it("does not mistake a vertical scroll-like gesture for a rating when it's tiny", () => {
    expect(
      resolveSwipeRating({ x: 0, y: 20 }, { x: 0, y: 50 }),
    ).toBeNull();
  });
});

describe("previewSwipeRating", () => {
  it("returns null for barely-there offsets below 8px on both axes", () => {
    expect(previewSwipeRating({ x: 7, y: 7 })).toBeNull();
  });

  it("surfaces direction much earlier than resolveSwipeRating", () => {
    // 20px rightward is nowhere near the commit threshold but should preview.
    expect(previewSwipeRating({ x: 20, y: 0 })).toBe("good");
  });

  it("tie-breaks to horizontal like the commit helper", () => {
    expect(previewSwipeRating({ x: -50, y: -50 })).toBe("again");
  });

  it("surfaces vertical preview when y dominates", () => {
    expect(previewSwipeRating({ x: 5, y: -30 })).toBe("easy");
    expect(previewSwipeRating({ x: 5, y: 30 })).toBe("hard");
  });
});
