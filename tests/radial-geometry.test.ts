import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  angle,
  arcPath,
  hitTest,
  normalize,
  polar,
  radius,
  type RadialSegment,
} from "@/lib/review/radial-geometry";

const R_INNER = 50;
const R_OUTER = 120;

// Helper: convert (distance, math-angle in rad) → DOM delta (dx, dy).
// Matches the `polar` helper but named for test readability.
function at(distance: number, theta: number) {
  const { x, y } = polar(distance, theta);
  return { dx: x, dy: y };
}

describe("radius", () => {
  it("returns 0 at origin", () => {
    expect(radius(0, 0)).toBe(0);
  });
  it("is symmetric", () => {
    expect(radius(3, 4)).toBe(5);
    expect(radius(-3, -4)).toBe(5);
    expect(radius(3, -4)).toBe(5);
  });
});

describe("angle", () => {
  it("returns 0 at origin without NaN", () => {
    expect(angle(0, 0)).toBe(0);
  });
  it("right is 0", () => {
    expect(angle(1, 0)).toBeCloseTo(0, 5);
  });
  it("up (DOM -y) is +π/2", () => {
    expect(angle(0, -1)).toBeCloseTo(Math.PI / 2, 5);
  });
  it("left is ±π (atan2 returns +π here)", () => {
    expect(Math.abs(normalize(angle(-1, 0) - Math.PI))).toBeLessThan(1e-9);
  });
  it("down (DOM +y) is -π/2", () => {
    expect(angle(0, 1)).toBeCloseTo(-Math.PI / 2, 5);
  });
});

describe("normalize", () => {
  it("leaves values in range untouched", () => {
    expect(normalize(0)).toBeCloseTo(0);
    expect(normalize(Math.PI / 4)).toBeCloseTo(Math.PI / 4);
    expect(normalize(-Math.PI / 4)).toBeCloseTo(-Math.PI / 4);
  });
  it("folds values above π back into range", () => {
    expect(normalize(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1, 9);
    expect(normalize(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
  });
  it("folds values below -π back into range", () => {
    expect(normalize(-Math.PI - 0.1)).toBeCloseTo(Math.PI - 0.1, 9);
  });
  it("maps +π to +π (not -π), the canonical representative", () => {
    expect(normalize(Math.PI)).toBeCloseTo(Math.PI);
  });
});

describe("hitTest · dead zones", () => {
  it("returns null for pointer at center", () => {
    expect(hitTest(0, 0, { innerRadius: R_INNER, outerRadius: R_OUTER })).toBeNull();
  });
  it("returns null just inside the inner radius", () => {
    const { dx, dy } = at(R_INNER - 1, 0);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })).toBeNull();
  });
  it("returns null just outside the outer radius", () => {
    const { dx, dy } = at(R_OUTER + 1, 0);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })).toBeNull();
  });
  it("returns a segment exactly at the inner radius boundary", () => {
    // Pointing right (math angle 0°) at exactly the inner radius lands
    // inside Hard's range (-11.25°, +22.5°).
    const { dx, dy } = at(R_INNER, 0);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("hard");
  });
});

describe("hitTest · rating segment centers (right half)", () => {
  const mid = (R_INNER + R_OUTER) / 2;

  // Right half hosts the 4 ratings stacked top → bottom: Easy, Good,
  // Hard, Again. Each segment is 33.75° wide and the four together
  // tile from -π/4 (gap edge) up to +π/2 (top).

  it("top of right half (just below π/2) → easy", () => {
    const { dx, dy } = at(mid, Math.PI / 2 - 0.01);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("easy");
  });
  it("easy center (13π/32) → easy", () => {
    const { dx, dy } = at(mid, (13 * Math.PI) / 32);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("easy");
  });
  it("good center (7π/32) → good", () => {
    const { dx, dy } = at(mid, (7 * Math.PI) / 32);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("good");
  });
  it("hard center (π/32) → hard", () => {
    const { dx, dy } = at(mid, Math.PI / 32);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("hard");
  });
  it("horizontal right (0°) → hard", () => {
    // 0° falls inside hard's range (-11.25°, +22.5°).
    const { dx, dy } = at(mid, 0);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("hard");
  });
  it("again center (-5π/32) → again", () => {
    const { dx, dy } = at(mid, (-5 * Math.PI) / 32);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("again");
  });
});

describe("hitTest · utility segment centers (left half)", () => {
  const mid = (R_INNER + R_OUTER) / 2;

  // Left half hosts 3 utilities stacked top → bottom: Detail, History,
  // Speak. Each segment is 45° wide; they tile from +π/2 up to (and
  // wrapping past) the gap on the lower-left at -3π/4.

  it("detail center (5π/8) → detail", () => {
    const { dx, dy } = at(mid, (5 * Math.PI) / 8);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("detail");
  });
  it("history center (7π/8) → history", () => {
    const { dx, dy } = at(mid, (7 * Math.PI) / 8);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("history");
  });
  it("just inside history's lower edge (π - ε) → history", () => {
    // The exact ±π point is a knife-edge between History and Speak
    // whose resolution depends on last-bit floating-point rounding of
    // `Math.PI - 7*Math.PI/8 === Math.PI/8`. We don't bother pinning
    // that down — real pointer input never lands on a sub-ULP angle.
    // Instead we test just inside History's lower half.
    const { dx, dy } = at(mid, Math.PI - 0.01);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("history");
  });
  it("speak center (-7π/8) → speak", () => {
    const { dx, dy } = at(mid, (-7 * Math.PI) / 8);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("speak");
  });
});

describe("hitTest · bottom gap (open mouth)", () => {
  const mid = (R_INNER + R_OUTER) / 2;

  // The bottom 90° (-3π/4 to -π/4) carries no segment by design — it
  // sits where the FAB lives, so any pointer release here is treated
  // as a cancel.

  it("straight down (-π/2) → null", () => {
    const { dx, dy } = at(mid, -Math.PI / 2);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })).toBeNull();
  });
  it("lower-right (-π/3) → null (between Again and gap edge)", () => {
    const { dx, dy } = at(mid, -Math.PI / 3);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })).toBeNull();
  });
  it("lower-left (-2π/3) → null (between Speak and gap edge)", () => {
    const { dx, dy } = at(mid, (-2 * Math.PI) / 3);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })).toBeNull();
  });
  it("just inside the right gap edge (-π/4 + ε) → again", () => {
    const { dx, dy } = at(mid, -Math.PI / 4 + 0.01);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("again");
  });
  it("just inside the left gap edge (-3π/4 - ε) → speak", () => {
    // Speak spans (-π, -3π/4). -3π/4 is its UPPER edge (closer to
    // the gap). A point at -3π/4 - ε is a hair below that edge,
    // meaning inside the Speak segment.
    const { dx, dy } = at(mid, (-3 * Math.PI) / 4 - 0.01);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("speak");
  });
});

describe("hitTest · custom layout", () => {
  const custom: RadialSegment[] = [
    { id: "good", centerAngle: 0, spread: 2 * Math.PI - 0.001, label: "One ring to rule them all" },
  ];
  it("respects the injected layout", () => {
    const { dx, dy } = at(80, Math.PI / 3);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER, layout: custom })?.id).toBe("good");
  });

  const empty: RadialSegment[] = [];
  it("returns null when layout is empty", () => {
    const { dx, dy } = at(80, 0);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER, layout: empty })).toBeNull();
  });
});

describe("DEFAULT_LAYOUT integrity", () => {
  it("has seven segments", () => {
    expect(DEFAULT_LAYOUT).toHaveLength(7);
  });
  it("includes all four ratings plus the three utility actions", () => {
    const ids = DEFAULT_LAYOUT.map((s) => s.id).sort();
    expect(ids).toEqual([
      "again",
      "detail",
      "easy",
      "good",
      "hard",
      "history",
      "speak",
    ]);
  });
  it("total angular coverage equals 3π/2, leaving a 90° bottom gap", () => {
    const total = DEFAULT_LAYOUT.reduce((acc, s) => acc + s.spread, 0);
    // 4 ratings × (3π/16) + 3 utilities × (π/4) = 3π/4 + 3π/4 = 3π/2.
    expect(total).toBeCloseTo((3 * Math.PI) / 2, 9);
    // → the unused arc is exactly 2π - 3π/2 = π/2 (90°).
    expect(2 * Math.PI - total).toBeCloseTo(Math.PI / 2, 9);
  });
  it("all rating segments live in the right half (math angle in (-π/2, π/2))", () => {
    const ratingIds = new Set(["again", "hard", "good", "easy"]);
    for (const seg of DEFAULT_LAYOUT) {
      if (!ratingIds.has(seg.id)) continue;
      expect(seg.centerAngle).toBeGreaterThan(-Math.PI / 2);
      expect(seg.centerAngle).toBeLessThan(Math.PI / 2);
    }
  });
  it("all utility segments live in the left half (math angle |a| > π/2)", () => {
    const utilityIds = new Set(["detail", "history", "speak"]);
    for (const seg of DEFAULT_LAYOUT) {
      if (!utilityIds.has(seg.id)) continue;
      expect(Math.abs(seg.centerAngle)).toBeGreaterThan(Math.PI / 2);
    }
  });
  it("no two segments overlap at interior points", () => {
    // Adjacent segments share exact boundary points by the closed-
    // interval convention. hitTest resolves them deterministically via
    // the first-match rule. Here we sample strictly interior angles —
    // the v2 layout has boundaries at the half-degree marks 22.5°,
    // 56.25°, 90°, 135°, ±180°, -45°, -11.25°, so we use a 0.7°
    // step starting at -179.3° to avoid every one of them.
    for (let tenths = -1793; tenths <= 1790; tenths += 7) {
      const a = (tenths / 10) * (Math.PI / 180);
      let hits = 0;
      for (const seg of DEFAULT_LAYOUT) {
        if (Math.abs(normalize(a - seg.centerAngle)) < seg.spread / 2) hits++;
      }
      expect(hits, `overlap at ${tenths / 10}°`).toBeLessThanOrEqual(1);
    }
  });
  it("the bottom 90° arc is empty", () => {
    // Every angle strictly inside (-3π/4, -π/4) should fall outside
    // every segment. We sample finely to catch tiling errors.
    for (let tenths = -1349; tenths <= -451; tenths += 5) {
      const a = (tenths / 10) * (Math.PI / 180);
      const hit = DEFAULT_LAYOUT.find(
        (seg) => Math.abs(normalize(a - seg.centerAngle)) <= seg.spread / 2,
      );
      expect(hit, `segment at ${tenths / 10}°`).toBeUndefined();
    }
  });
});

describe("arcPath", () => {
  it("starts with M and ends with Z", () => {
    const path = arcPath(0, Math.PI / 3, R_INNER, R_OUTER);
    expect(path.startsWith("M ")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });
  it("contains exactly two A (arc) commands", () => {
    const path = arcPath(0, Math.PI / 3, R_INNER, R_OUTER);
    const arcs = path.match(/\bA\b/g) ?? [];
    expect(arcs).toHaveLength(2);
  });
  it("uses large-arc flag only when spread exceeds π", () => {
    const small = arcPath(0, Math.PI / 3, R_INNER, R_OUTER);
    const big = arcPath(0, Math.PI + 0.1, R_INNER, R_OUTER);
    // The flag is the fourth token after each A command.
    expect(small).toMatch(/A \d+(\.\d+)? \d+(\.\d+)? 0 0 /);
    expect(big).toMatch(/A \d+(\.\d+)? \d+(\.\d+)? 0 1 /);
  });
});

describe("polar <-> angle round-trip", () => {
  it("polar(r,θ) produces a delta whose angle() returns θ", () => {
    for (const theta of [0, 0.3, Math.PI / 4, Math.PI / 2, 2, -0.7, -Math.PI / 2]) {
      const { x, y } = polar(80, theta);
      expect(angle(x, y)).toBeCloseTo(theta, 9);
    }
  });
});
