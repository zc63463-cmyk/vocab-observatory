/**
 * Pure layout + graph-pruning helpers for the Mastery Network visualization.
 *
 * Separated from the React / WebGL layer so it stays trivially testable in
 * the node vitest environment and so the render layer (r3f) can focus only
 * on shovelling Float32Array buffers onto the GPU.
 *
 * Three kinds of outputs this module produces from raw `MasteryCell[]` and
 * a `relationGraph`:
 *
 *   1. `positions2D[i]`  — structured CEFR-banded grid  (x, y, 0)
 *   2. `positions3D[i]`  — Fibonacci sphere distribution (x, y, z)
 *   3. `edgeIndices[]`   — top-K pruned, deduped, visible-subset edges
 *      (flat pairs of node indices so the renderer can build one merged
 *      LineSegments geometry with no per-frame lookup).
 *
 * Plus `buildAdjacency` which produces an O(1) neighbor lookup structure
 * replacing the O(N·E) `simEdges.some(...)` scans used by the legacy
 * SVG heatmap.
 */

export interface MasteryNetworkNode {
  slug: string;
  lemma: string;
  cefr: string;
  retrievability: number;
  dueAt: string | null;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * CEFR ordering. Unknown parks at the far right so it doesn't break the
 * ordered "A1 → C2" intuition on the X axis. Anything not in this list
 * also lands in the Unknown column.
 */
export const CEFR_COLUMNS = ["A1", "A2", "B1", "B2", "C1", "C2", "unknown"] as const;
export type CefrColumn = (typeof CEFR_COLUMNS)[number];

export function cefrColumnIndex(cefr: string | null | undefined): number {
  if (!cefr) return CEFR_COLUMNS.length - 1;
  const idx = CEFR_COLUMNS.indexOf(cefr as CefrColumn);
  return idx === -1 ? CEFR_COLUMNS.length - 1 : idx;
}

/**
 * Deterministic 32-bit hash from a string. We need a stable pseudo-random
 * value per slug for jitter + longitude scrambling so the layout doesn't
 * reshuffle visually every time the summary refetches.
 */
export function hashSlug(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Map to [0, 1)
  return ((h >>> 0) % 1_000_003) / 1_000_003;
}

export interface Grid2DOptions {
  /** Total width of the 2D plane in world units. Grid is centered on origin. */
  width: number;
  /** Total height of the 2D plane in world units. Grid is centered on origin. */
  height: number;
  /**
   * Legacy jitter knob from the old CEFR-column layout. The GitHub-contribution
   * style grid is intentionally regular so this is now ignored; kept on the
   * interface to avoid churning every call site.
   */
  jitter?: number;
}

export interface GridDims {
  cols: number;
  rows: number;
  /** World-space width of a single cell (= `width / cols`). */
  cellX: number;
  /** World-space height of a single cell (= `height / rows`). */
  cellY: number;
}

/**
 * Pick an aspect-balanced (cols × rows) grid that holds `N` nodes inside a
 * `width × height` world rectangle with cells as close to square as possible.
 *
 *   cols ≈ sqrt(N · width/height)
 *   rows = ceil(N / cols)
 *
 * Exported separately so the WebGL layer can size node radii against the
 * resulting cell spacing without duplicating the formula.
 */
export function computeGridDims(N: number, width: number, height: number): GridDims {
  if (N <= 0) return { cols: 0, rows: 0, cellX: width, cellY: height };
  const aspect = width / height;
  const cols = Math.max(1, Math.round(Math.sqrt(N * aspect)));
  const rows = Math.max(1, Math.ceil(N / cols));
  return { cols, rows, cellX: width / cols, cellY: height / rows };
}

/**
 * GitHub-contribution-style dense grid.
 *
 *   - All nodes sorted globally by retrievability ASC (weak / red-orange
 *     first, strong / green last), tiebreaking on slug for stability.
 *   - Packed row-major into a cols × rows grid sized by `computeGridDims`
 *     so cells stay roughly square.
 *   - Row 0 is at the top (positive y), col 0 is on the left (negative x);
 *     with a retrievability-ascending sort this puts the weakest, reddest
 *     nodes in the top-left and the strongest, greenest nodes in the
 *     bottom-right — a continuous color gradient flowing in reading order.
 *   - No jitter. Regularity is the point: it mirrors the GitHub contribution
 *     heatmap that inspired this layout and makes the color gradient
 *     instantly legible.
 *
 * CEFR is no longer used for positioning; tooltips and the preview modal
 * still surface it, so nothing is lost semantically.
 *
 * Deterministic given the same (nodes, width, height) input.
 */
export function computeStructuredGrid(
  nodes: MasteryNetworkNode[],
  options: Grid2DOptions,
): Vec3[] {
  const { width, height } = options;
  const N = nodes.length;
  if (N === 0) return [];

  // Stable sort: retrievability ASC, then slug ASC. The slug tiebreak
  // guarantees that two words with identical R land in the same spot on
  // every refetch — without it, Map iteration order + Array.sort stability
  // could shuffle neighbors on the grid.
  const order = nodes.map((_, i) => i);
  order.sort((a, b) => {
    const dr = nodes[a].retrievability - nodes[b].retrievability;
    if (dr !== 0) return dr;
    return nodes[a].slug.localeCompare(nodes[b].slug);
  });

  const { cols, cellX, cellY } = computeGridDims(N, width, height);

  const out: Vec3[] = new Array(N);
  const halfW = width / 2;
  const halfH = height / 2;
  for (let rank = 0; rank < N; rank++) {
    const nodeIdx = order[rank];
    const col = rank % cols;
    const row = Math.floor(rank / cols);
    // Origin-centered: add cellX/2 to put the first column's center at
    // -halfW + cellX/2 (so the grid's outer edges sit on ±halfW / ±halfH).
    const x = -halfW + cellX * (col + 0.5);
    const y = halfH - cellY * (row + 0.5);
    out[nodeIdx] = { x, y, z: 0 };
  }
  return out;
}

export interface SphereOptions {
  radius: number;
}

/**
 * Golden-ratio Fibonacci sphere. Produces a nearly-uniform spherical
 * distribution. Index → (lat, lon) is deterministic so every caller
 * agrees on where node `i` lives.
 *
 * We deliberately re-sort nodes by retrievability before indexing so
 * weak (red) nodes cluster spatially rather than being scattered
 * randomly across the globe — this gives the morph a pleasing "risk
 * cluster bands" feel when the sphere settles.
 */
export function computeSphereLayout(
  nodes: MasteryNetworkNode[],
  options: SphereOptions,
): Vec3[] {
  const { radius } = options;
  const N = nodes.length;
  if (N === 0) return [];

  // Sort indices by retrievability ascending so the first slots on the
  // sphere (north pole outward) are the weakest.
  const order = nodes.map((_, i) => i);
  order.sort((a, b) => {
    const dr = nodes[a].retrievability - nodes[b].retrievability;
    if (dr !== 0) return dr;
    return nodes[a].slug.localeCompare(nodes[b].slug);
  });

  const out: Vec3[] = new Array(N);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < N; k++) {
    const nodeIdx = order[k];
    // y ∈ [1, -1] as k goes 0 → N-1 (equally spaced latitudes).
    const y = N === 1 ? 0 : 1 - (k / (N - 1)) * 2;
    const rAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * k;
    const x = Math.cos(theta) * rAtY;
    const z = Math.sin(theta) * rAtY;
    out[nodeIdx] = { x: x * radius, y: y * radius, z: z * radius };
  }
  return out;
}

export interface RawEdge {
  source: string;
  target: string;
  relation: string;
}

/**
 * Convert the dashboard `relationGraph` (adjacency-list keyed by slug)
 * into a deduped, undirected edge list restricted to `visibleSlugs`.
 * Self-loops and dup edges (A→B and B→A) are collapsed.
 */
export function flattenRelationGraph(
  relationGraph: Record<string, { slug: string; lemma: string; relation: string }[]>,
  visibleSlugs: Iterable<string>,
): RawEdge[] {
  const visible = visibleSlugs instanceof Set ? visibleSlugs : new Set(visibleSlugs);
  const seen = new Set<string>();
  const out: RawEdge[] = [];
  for (const source of visible) {
    const neighbors = relationGraph[source];
    if (!neighbors) continue;
    for (const n of neighbors) {
      if (n.slug === source || !visible.has(n.slug)) continue;
      const [a, b] = source < n.slug ? [source, n.slug] : [n.slug, source];
      const key = `${a}|${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ source: a, target: b, relation: n.relation });
    }
  }
  return out;
}

/**
 * Score an edge for top-K pruning. Lower = keep.
 *
 * Pedagogically useful: prefer edges whose neighbor is *weak* (low
 * retrievability) because that's the connection the user should
 * practice. Tiebreak on relation priority so "synonym" beats "root".
 */
const RELATION_PRIORITY: Record<string, number> = {
  近义: 0,
  反义: 1,
  词根: 2,
};

function edgeScore(
  edge: RawEdge,
  slug: string,
  neighborRetrievability: number,
): number {
  // Which end is "us"? We want the score from `slug`'s perspective —
  // the neighbor's retrievability is what matters.
  void slug;
  const relScore = RELATION_PRIORITY[edge.relation] ?? 3;
  // Weight: dominate by retrievability, tie-break on relation.
  return neighborRetrievability * 10 + relScore;
}

/**
 * Degree-capped greedy edge selection. Globally sorts edges by their
 * "best" (lowest) endpoint score, then admits each edge only if
 * *both* endpoints still have budget under K. Guarantees:
 *
 *   - No node ends up with more than K visible edges.
 *   - When a hub node competes with leaves, the hub's best-scoring
 *     (weakest-neighbor) edges win — the leaf's sole edge gets
 *     dropped rather than forcing the hub over budget.
 *
 * Naive "per-node top-K then union" is wrong: leaves always win their
 * own single-edge top-K, which collectively push the hub's visible
 * degree far above K.
 */
export function pruneTopKEdges(
  edges: RawEdge[],
  nodes: MasteryNetworkNode[],
  k: number,
): RawEdge[] {
  if (k <= 0 || edges.length === 0) return [];
  const retrMap = new Map<string, number>();
  for (const n of nodes) retrMap.set(n.slug, n.retrievability);

  // Per-edge score: take the MIN of the two endpoint-oriented scores —
  // that's the edge's value from its most-interested endpoint.
  const scored = edges.map((e) => {
    const sourceR = retrMap.get(e.target) ?? 1;
    const targetR = retrMap.get(e.source) ?? 1;
    const sScore = edgeScore(e, e.source, sourceR);
    const tScore = edgeScore(e, e.target, targetR);
    return { edge: e, score: Math.min(sScore, tScore) };
  });
  // Lower score = keep sooner. Stable sort on (score, source, target)
  // so identical-score ties are deterministic across runs.
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.edge.source !== b.edge.source) return a.edge.source < b.edge.source ? -1 : 1;
    return a.edge.target < b.edge.target ? -1 : a.edge.target > b.edge.target ? 1 : 0;
  });

  const degree = new Map<string, number>();
  const kept: RawEdge[] = [];
  for (const { edge } of scored) {
    const ds = degree.get(edge.source) ?? 0;
    const dt = degree.get(edge.target) ?? 0;
    if (ds >= k || dt >= k) continue;
    kept.push(edge);
    degree.set(edge.source, ds + 1);
    degree.set(edge.target, dt + 1);
  }
  return kept;
}

/**
 * Compact flat edge-index buffer: `[a0, b0, a1, b1, ...]` where each
 * value is an index into `nodes`. This is exactly the shape the
 * WebGL LineSegments consumer wants (writes 2 vertex positions per
 * pair per frame during morph).
 *
 * Edges referencing slugs not present in `nodes` are silently skipped.
 */
export function toEdgeIndexBuffer(
  edges: RawEdge[],
  nodes: MasteryNetworkNode[],
): Uint32Array {
  const slugToIndex = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) slugToIndex.set(nodes[i].slug, i);
  const out = new Uint32Array(edges.length * 2);
  let write = 0;
  for (const e of edges) {
    const a = slugToIndex.get(e.source);
    const b = slugToIndex.get(e.target);
    if (a === undefined || b === undefined) continue;
    out[write++] = a;
    out[write++] = b;
  }
  // If some edges were skipped, hand back a tight slice.
  return write === out.length ? out : out.slice(0, write);
}

/**
 * `slug → Set<neighborSlug>` lookup. Used for O(1) "is this neighbor?"
 * checks in the hover-highlight path, replacing the O(E) `some()`
 * scan the legacy SVG heatmap does on every mouse move.
 */
export function buildAdjacency(edges: RawEdge[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!map.has(e.source)) map.set(e.source, new Set());
    if (!map.has(e.target)) map.set(e.target, new Set());
    map.get(e.source)!.add(e.target);
    map.get(e.target)!.add(e.source);
  }
  return map;
}

/**
 * Five-band retrievability palette — matches the legacy heatmap so
 * existing legends and screenshots remain accurate.
 */
export function getRetrievabilityColor(r: number): string {
  if (r >= 0.9) return "#16a34a";
  if (r >= 0.75) return "#84cc16";
  if (r >= 0.6) return "#eab308";
  if (r >= 0.4) return "#f97316";
  return "#ef4444";
}

export function getRetrievabilityLabel(r: number): string {
  if (r >= 0.9) return "牢固";
  if (r >= 0.75) return "较好";
  if (r >= 0.6) return "一般";
  if (r >= 0.4) return "薄弱";
  return "濒危";
}
