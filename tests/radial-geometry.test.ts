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
    const { dx, dy } = at(R_INNER, 0);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("good");
  });
});

describe("hitTest · main rating centers", () => {
  const mid = (R_INNER + R_OUTER) / 2;

  it("right (0°) → good", () => {
    const { dx, dy } = at(mid, 0);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("good");
  });
  it("up (+π/2) → easy", () => {
    const { dx, dy } = at(mid, Math.PI / 2);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("easy");
  });
  it("left (π) → again", () => {
    const { dx, dy } = at(mid, Math.PI);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("again");
  });
  it("down (-π/2) → hard", () => {
    const { dx, dy } = at(mid, -Math.PI / 2);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("hard");
  });
});

describe("hitTest · utility centers", () => {
  const mid = (R_INNER + R_OUTER) / 2;

  it("upper-right diagonal (π/4) → speak", () => {
    const { dx, dy } = at(mid, Math.PI / 4);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("speak");
  });
  it("upper-left diagonal (3π/4) → history", () => {
    const { dx, dy } = at(mid, (3 * Math.PI) / 4);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("history");
  });
});

describe("hitTest · segment boundaries", () => {
  const mid = (R_INNER + R_OUTER) / 2;
  // good spans (-π/6, π/6); speak spans (π/4 - π/12, π/4 + π/12).
  // Between them (π/6, π/4 - π/12) = (π/6, π/6) → exactly zero gap at
  // π/6. Boundary case: slightly inside good, slightly inside speak.

  it("just inside good's upper edge → good", () => {
    const { dx, dy } = at(mid, Math.PI / 6 - 0.01);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("good");
  });
  it("just inside speak's lower edge → speak", () => {
    const { dx, dy } = at(mid, Math.PI / 4 - Math.PI / 12 + 0.01);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("speak");
  });

  // hard spans (-π/2 - π/6, -π/2 + π/6) = (-2π/3, -π/3). No sector is
  // defined between -π/3 and 0 - π/6 = -π/6 except the gap. Pointing
  // at the middle of that gap (-π/4) should return null.
  it("falls into lower-right gap between hard and good → null", () => {
    const { dx, dy } = at(mid, -Math.PI / 4);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })).toBeNull();
  });
  it("falls into lower-left gap between again and hard → null", () => {
    // again's lower edge is at -5π/6 (after wrap), hard's upper edge is at
    // -2π/3 = -4π/6. The gap spans (-5π/6, -4π/6), width π/6; midpoint
    // is -3π/4.
    const { dx, dy } = at(mid, -(3 * Math.PI) / 4);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })).toBeNull();
  });
});

describe("hitTest · π wrap-around correctness", () => {
  const mid = (R_INNER + R_OUTER) / 2;

  it("a tiny bit clockwise of +π still lands in again (wrap to -π side)", () => {
    // again's center is π; near-boundary on the "below" side maps to
    // -π + ε after normalize. The hitTest must handle the wrap.
    const { dx, dy } = at(mid, -Math.PI + 0.01);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("again");
  });
  it("a tiny bit counter-clockwise of +π also lands in again", () => {
    const { dx, dy } = at(mid, Math.PI - 0.01);
    expect(hitTest(dx, dy, { innerRadius: R_INNER, outerRadius: R_OUTER })?.id).toBe("again");
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
  it("has six segments", () => {
    expect(DEFAULT_LAYOUT).toHaveLength(6);
  });
  it("includes all four ratings plus history and speak", () => {
    const ids = DEFAULT_LAYOUT.map((s) => s.id).sort();
    expect(ids).toEqual(["again", "easy", "good", "hard", "history", "speak"]);
  });
  it("total angular coverage leaves strict gaps (sum < 2π)", () => {
    const total = DEFAULT_LAYOUT.reduce((acc, s) => acc + s.spread, 0);
    expect(total).toBeLessThan(2 * Math.PI);
    // Specifically: 4·(π/3) + 2·(π/6) = 5π/3
    expect(total).toBeCloseTo((5 * Math.PI) / 3, 9);
  });
  it("no two segments overlap at interior points", () => {
    // Adjacent segments (good↔speak, speak↔easy, easy↔history, history↔again)
    // share exact boundary points (e.g., π/6 rad = 30° belongs to both good
    // and speak by the closed-interval convention). hitTest resolves this
    // deterministically via the first-match rule in DEFAULT_LAYOUT order,
    // so the practical contract is "no interior overlap". We sample at
    // 0.5° offsets to stay clear of any integer-degree segment boundary.
    for (let tenths = -1795; tenths <= 1800; tenths += 10) {
      const a = (tenths / 10) * (Math.PI / 180);
      let hits = 0;
      for (const seg of DEFAULT_LAYOUT) {
        if (Math.abs(normalize(a - seg.centerAngle)) < seg.spread / 2) hits++;
      }
      expect(hits, `overlap at ${tenths / 10}°`).toBeLessThanOrEqual(1);
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
