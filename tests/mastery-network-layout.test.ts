import { describe, expect, it } from "vitest";
import {
  CEFR_COLUMNS,
  buildAdjacency,
  cefrColumnIndex,
  computeGridDims,
  computeSphereLayout,
  computeStructuredGrid,
  flattenRelationGraph,
  hashSlug,
  pruneTopKEdges,
  toEdgeIndexBuffer,
  type MasteryNetworkNode,
} from "@/lib/mastery-network-layout";

function mk(over: Partial<MasteryNetworkNode> & { slug: string }): MasteryNetworkNode {
  return {
    slug: over.slug,
    lemma: over.lemma ?? over.slug,
    cefr: over.cefr ?? "A1",
    retrievability: over.retrievability ?? 0.5,
    dueAt: over.dueAt ?? null,
  };
}

describe("cefrColumnIndex", () => {
  it("maps known CEFR bands to their canonical index", () => {
    expect(cefrColumnIndex("A1")).toBe(0);
    expect(cefrColumnIndex("C2")).toBe(5);
  });

  it("sends missing / unknown values to the unknown column", () => {
    expect(cefrColumnIndex(null)).toBe(CEFR_COLUMNS.length - 1);
    expect(cefrColumnIndex(undefined)).toBe(CEFR_COLUMNS.length - 1);
    expect(cefrColumnIndex("Z9")).toBe(CEFR_COLUMNS.length - 1);
    expect(cefrColumnIndex("unknown")).toBe(CEFR_COLUMNS.length - 1);
  });
});

describe("hashSlug", () => {
  it("is deterministic for the same slug", () => {
    expect(hashSlug("abandon")).toBe(hashSlug("abandon"));
  });
  it("returns a value in [0, 1)", () => {
    for (const s of ["a", "ability", "quixotic", "🎉"]) {
      const h = hashSlug(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
  it("produces distinct outputs for distinct inputs (probabilistic)", () => {
    const set = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => hashSlug(`s-${i}`)));
    // Collisions extraordinarily unlikely for 10 distinct ascii strings
    expect(set.size).toBe(10);
  });
});

describe("computeGridDims", () => {
  it("returns a zero-sized grid for empty input", () => {
    expect(computeGridDims(0, 10, 4)).toEqual({ cols: 0, rows: 0, cellX: 10, cellY: 4 });
  });

  it("picks cols and rows so cells are roughly square", () => {
    // 100 nodes in a 2:1 rectangle → ~14 cols × 8 rows, cells ≈ 0.71 × 0.5.
    const d = computeGridDims(100, 10, 5);
    expect(d.cols).toBeGreaterThan(d.rows);
    // Aspect should track the container aspect within a fudge factor.
    const cellAspect = d.cellX / d.cellY;
    expect(cellAspect).toBeGreaterThan(0.8);
    expect(cellAspect).toBeLessThan(1.25);
    // Grid must have enough capacity for every node.
    expect(d.cols * d.rows).toBeGreaterThanOrEqual(100);
  });

  it("clamps to at least 1×1 for a single node", () => {
    expect(computeGridDims(1, 7, 4)).toMatchObject({ cols: 1, rows: 1 });
  });
});

describe("computeStructuredGrid", () => {
  it("packs nodes row-major into a grid centered on origin, z=0", () => {
    const nodes = Array.from({ length: 9 }, (_, i) =>
      mk({ slug: `n${i}`, retrievability: i / 8 }),
    );
    const pos = computeStructuredGrid(nodes, { width: 9, height: 4 });
    // Center of mass of every corner cell averages to origin.
    const xs = pos.map((p) => p.x);
    const ys = pos.map((p) => p.y);
    const xCenter = (Math.min(...xs) + Math.max(...xs)) / 2;
    const yCenter = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(xCenter).toBeCloseTo(0, 5);
    expect(yCenter).toBeCloseTo(0, 5);
    for (const p of pos) expect(p.z).toBe(0);
  });

  it("orders globally by retrievability ascending (weak nodes fill top-left first)", () => {
    const nodes = [
      mk({ slug: "strong", retrievability: 0.9 }),
      mk({ slug: "weak", retrievability: 0.1 }),
    ];
    const pos = computeStructuredGrid(nodes, { width: 4, height: 2 });
    const weak = pos[1];
    const strong = pos[0];
    // Weak must appear earlier in reading order: higher y, or equal y with lower x.
    if (Math.abs(weak.y - strong.y) < 1e-6) {
      expect(weak.x).toBeLessThan(strong.x);
    } else {
      expect(weak.y).toBeGreaterThan(strong.y);
    }
  });

  it("ignores CEFR for positioning — retrievability alone drives the sort", () => {
    // Same retrievability, different CEFR: slug tiebreak decides order, CEFR must not.
    const a = mk({ slug: "a", cefr: "C2", retrievability: 0.5 });
    const b = mk({ slug: "b", cefr: "A1", retrievability: 0.5 });
    const pos = computeStructuredGrid([a, b], { width: 4, height: 2 });
    // With equal R, the slug tiebreak puts "a" before "b" → "a" is at rank 0.
    // Rank 0 must be at a smaller (row, col) than rank 1 in reading order.
    if (Math.abs(pos[0].y - pos[1].y) < 1e-6) {
      expect(pos[0].x).toBeLessThan(pos[1].x);
    } else {
      expect(pos[0].y).toBeGreaterThan(pos[1].y);
    }
  });

  it("centers a lone node on the origin", () => {
    const pos = computeStructuredGrid([mk({ slug: "a", retrievability: 0.5 })], {
      width: 7,
      height: 4,
    });
    expect(pos[0].x).toBeCloseTo(0, 5);
    expect(pos[0].y).toBeCloseTo(0, 5);
  });

  it("is deterministic across repeat calls with the same input", () => {
    const nodes = [
      mk({ slug: "a", cefr: "A1", retrievability: 0.3 }),
      mk({ slug: "b", cefr: "A2", retrievability: 0.7 }),
    ];
    const a = computeStructuredGrid(nodes, { width: 7, height: 4 });
    const b = computeStructuredGrid(nodes, { width: 7, height: 4 });
    expect(a).toEqual(b);
  });
});

describe("computeSphereLayout", () => {
  it("places every node on the sphere (|p| ≈ radius)", () => {
    const nodes = Array.from({ length: 50 }, (_, i) =>
      mk({ slug: `n${i}`, retrievability: Math.random() }),
    );
    const pos = computeSphereLayout(nodes, { radius: 2 });
    for (const p of pos) {
      const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      expect(r).toBeCloseTo(2, 5);
    }
  });

  it("returns an empty array for empty input", () => {
    expect(computeSphereLayout([], { radius: 1 })).toEqual([]);
  });

  it("centers a sole node (y = 0) so it faces the camera", () => {
    const pos = computeSphereLayout([mk({ slug: "only" })], { radius: 1 });
    expect(pos[0].y).toBeCloseTo(0, 5);
  });
});

describe("flattenRelationGraph", () => {
  it("dedupes undirected edges and drops invisible neighbors + self-loops", () => {
    const graph = {
      a: [
        { slug: "b", lemma: "b", relation: "近义" },
        { slug: "a", lemma: "a", relation: "近义" }, // self-loop
        { slug: "ghost", lemma: "ghost", relation: "近义" }, // not visible
      ],
      b: [{ slug: "a", lemma: "a", relation: "近义" }], // mirror of a→b
      c: [],
    };
    const edges = flattenRelationGraph(graph, new Set(["a", "b", "c"]));
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe("a");
    expect(edges[0].target).toBe("b");
  });
});

describe("pruneTopKEdges", () => {
  it("keeps at most K edges per node, preferring neighbors with lower retrievability", () => {
    const nodes = [
      mk({ slug: "hub", retrievability: 0.5 }),
      mk({ slug: "weak1", retrievability: 0.1 }),
      mk({ slug: "weak2", retrievability: 0.2 }),
      mk({ slug: "mid", retrievability: 0.5 }),
      mk({ slug: "strong", retrievability: 0.95 }),
    ];
    const edges = [
      { source: "hub", target: "weak1", relation: "近义" },
      { source: "hub", target: "weak2", relation: "近义" },
      { source: "hub", target: "mid", relation: "近义" },
      { source: "hub", target: "strong", relation: "近义" },
    ];
    const kept = pruneTopKEdges(edges, nodes, 2);
    const targets = kept.map((e) => e.target).sort();
    expect(targets).toEqual(["weak1", "weak2"]);
  });

  it("never lets any node exceed K visible edges, even when it means orphaning leaves", () => {
    const nodes = [
      mk({ slug: "hub", retrievability: 0.5 }),
      mk({ slug: "a", retrievability: 0.5 }),
      mk({ slug: "b", retrievability: 0.5 }),
      mk({ slug: "c", retrievability: 0.5 }),
    ];
    // hub has 3 edges; each leaf has 1. With K=1 the hub may keep exactly one.
    // The leaves each want to keep their only edge, but only one of them
    // can (the rest are orphaned). This is the correct degree-capped
    // outcome — naive union-of-top-K would leave hub with degree 3.
    const edges = [
      { source: "hub", target: "a", relation: "近义" },
      { source: "hub", target: "b", relation: "近义" },
      { source: "hub", target: "c", relation: "近义" },
    ];
    const kept = pruneTopKEdges(edges, nodes, 1);
    expect(kept).toHaveLength(1);
    // Every node in the kept subgraph must be at-or-below K=1 visible edges.
    const degree = new Map<string, number>();
    for (const e of kept) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    for (const d of degree.values()) expect(d).toBeLessThanOrEqual(1);
  });

  it("returns [] for k <= 0 or empty input", () => {
    expect(pruneTopKEdges([], [], 3)).toEqual([]);
    expect(pruneTopKEdges([{ source: "a", target: "b", relation: "近义" }], [], 0)).toEqual([]);
  });
});

describe("toEdgeIndexBuffer", () => {
  it("produces a flat [a0, b0, a1, b1, ...] Uint32Array", () => {
    const nodes = [mk({ slug: "a" }), mk({ slug: "b" }), mk({ slug: "c" })];
    const buf = toEdgeIndexBuffer(
      [
        { source: "a", target: "b", relation: "近义" },
        { source: "b", target: "c", relation: "反义" },
      ],
      nodes,
    );
    expect(buf).toBeInstanceOf(Uint32Array);
    expect(Array.from(buf)).toEqual([0, 1, 1, 2]);
  });

  it("silently drops edges whose endpoints aren't in nodes", () => {
    const nodes = [mk({ slug: "a" }), mk({ slug: "b" })];
    const buf = toEdgeIndexBuffer(
      [
        { source: "a", target: "b", relation: "近义" },
        { source: "a", target: "ghost", relation: "近义" },
      ],
      nodes,
    );
    expect(buf.length).toBe(2);
    expect(Array.from(buf)).toEqual([0, 1]);
  });
});

describe("buildAdjacency", () => {
  it("is symmetric (a→b also implies b→a)", () => {
    const adj = buildAdjacency([
      { source: "a", target: "b", relation: "近义" },
      { source: "b", target: "c", relation: "词根" },
    ]);
    expect(adj.get("a")?.has("b")).toBe(true);
    expect(adj.get("b")?.has("a")).toBe(true);
    expect(adj.get("b")?.has("c")).toBe(true);
    expect(adj.get("c")?.has("b")).toBe(true);
    expect(adj.get("a")?.has("c")).toBe(false);
  });
});
