import { describe, expect, it } from "vitest";
import {
  RATING_TO_PERCENT,
  computeCalibrationDelta,
  gradeCalibration,
  summarizeSessionCalibration,
} from "@/lib/review/calibration";

describe("RATING_TO_PERCENT", () => {
  it("uses the canonical 0/33/67/100 quartile spacing", () => {
    expect(RATING_TO_PERCENT.again).toBe(0);
    expect(RATING_TO_PERCENT.hard).toBe(33);
    expect(RATING_TO_PERCENT.good).toBe(67);
    expect(RATING_TO_PERCENT.easy).toBe(100);
  });
});

describe("computeCalibrationDelta", () => {
  it("returns positive delta when overconfident", () => {
    const r = computeCalibrationDelta(80, "again");
    expect(r.delta).toBe(80);
    expect(r.absDelta).toBe(80);
  });

  it("returns negative delta when underconfident", () => {
    const r = computeCalibrationDelta(10, "easy");
    expect(r.delta).toBe(-90);
    expect(r.absDelta).toBe(90);
  });

  it("returns zero delta when prediction matches actual percent", () => {
    expect(computeCalibrationDelta(67, "good").delta).toBe(0);
    expect(computeCalibrationDelta(0, "again").delta).toBe(0);
    expect(computeCalibrationDelta(100, "easy").delta).toBe(0);
  });

  it("clamps prediction below 0 to 0", () => {
    const r = computeCalibrationDelta(-25, "good");
    expect(r.predicted).toBe(0);
    expect(r.delta).toBe(-67);
  });

  it("clamps prediction above 100 to 100", () => {
    const r = computeCalibrationDelta(150, "again");
    expect(r.predicted).toBe(100);
    expect(r.delta).toBe(100);
  });

  it("treats NaN/infinite predictions as 0", () => {
    expect(computeCalibrationDelta(Number.NaN, "good").predicted).toBe(0);
    expect(computeCalibrationDelta(Number.POSITIVE_INFINITY, "good").predicted)
      .toBe(100);
    expect(computeCalibrationDelta(Number.NEGATIVE_INFINITY, "good").predicted)
      .toBe(0);
  });
});

describe("gradeCalibration", () => {
  it("good severity for delta < 17", () => {
    expect(gradeCalibration(0).severity).toBe("good");
    expect(gradeCalibration(16).severity).toBe("good");
  });
  it("ok severity for 17 ≤ delta < 34", () => {
    expect(gradeCalibration(17).severity).toBe("ok");
    expect(gradeCalibration(33).severity).toBe("ok");
  });
  it("warn severity for delta ≥ 34", () => {
    expect(gradeCalibration(34).severity).toBe("warn");
    expect(gradeCalibration(100).severity).toBe("warn");
  });
});

describe("summarizeSessionCalibration", () => {
  it("returns zero stats for empty history", () => {
    expect(summarizeSessionCalibration([])).toEqual({
      count: 0,
      avgAbsDelta: 0,
      overconfidentCount: 0,
      underconfidentCount: 0,
    });
  });

  it("ignores entries without prediction", () => {
    const result = summarizeSessionCalibration([
      { predictedRecall: null, rating: "good" },
      { predictedRecall: null, rating: "again" },
    ]);
    expect(result.count).toBe(0);
    expect(result.avgAbsDelta).toBe(0);
  });

  it("ignores undone entries", () => {
    const result = summarizeSessionCalibration([
      { predictedRecall: 80, rating: "again", undone: true },
      { predictedRecall: 50, rating: "hard", undone: false },
    ]);
    expect(result.count).toBe(1);
    expect(result.avgAbsDelta).toBe(17);
  });

  it("aggregates over and under separately", () => {
    const result = summarizeSessionCalibration([
      { predictedRecall: 80, rating: "again" }, // over by 80
      { predictedRecall: 10, rating: "easy" }, // under by 90
      { predictedRecall: 67, rating: "good" }, // perfect, no over/under
    ]);
    expect(result.count).toBe(3);
    expect(result.overconfidentCount).toBe(1);
    expect(result.underconfidentCount).toBe(1);
    expect(result.avgAbsDelta).toBeCloseTo((80 + 90 + 0) / 3, 5);
  });
});
