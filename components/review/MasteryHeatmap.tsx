"use client";

import * as d3 from "d3";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

interface MasteryCell {
  cefr: string;
  lemma: string;
  metadata: unknown;
  slug: string;
  retrievability: number;
  dueAt: string | null;
  ipa: string | null;
  shortDefinition: string | null;
  pos: string | null;
  title: string | null;
}

interface MasteryHeatmapProps {
  cells: MasteryCell[];
  relationGraph?: Record<string, { slug: string; lemma: string; relation: string }[]>;
}

function getRetrievabilityColor(r: number): string {
  if (r >= 0.9) return "#16a34a";
  if (r >= 0.75) return "#84cc16";
  if (r >= 0.6) return "#eab308";
  if (r >= 0.4) return "#f97316";
  return "#ef4444";
}

function getRetrievabilityLabel(r: number): string {
  if (r >= 0.9) return "牢固";
  if (r >= 0.75) return "较好";
  if (r >= 0.6) return "一般";
  if (r >= 0.4) return "薄弱";
  return "濒危";
}

const MAX_NODES = 150;
const GRAPH_HEIGHT = 420;

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  slug: string;
  lemma: string;
  retrievability: number;
  cefr: string;
  dueAt: string | null;
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  relation: string;
}

type SimEdge = Omit<GraphEdge, "source" | "target"> & { source: GraphNode; target: GraphNode };

export function MasteryHeatmap({ cells, relationGraph = {} }: MasteryHeatmapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [dims, setDims] = useState({ width: 800, height: GRAPH_HEIGHT });
  const [tooltip, setTooltip] = useState<{
    cell: MasteryCell;
    neighbors: { slug: string; lemma: string; relation: string }[];
    x: number;
    y: number;
  } | null>(null);
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const prefetchedRef = useRef<Set<string>>(new Set());

  const prefetchWord = useCallback(
    (slug: string) => {
      if (!slug || prefetchedRef.current.has(slug)) return;
      prefetchedRef.current.add(slug);
      router.prefetch(`/words/${slug}`);
    },
    [router],
  );

  const navigateToWord = useCallback(
    (slug: string) => {
      setPreviewSlug(null);
      startTransition(() => {
        router.push(`/words/${slug}`);
      });
    },
    [router],
  );

  useEffect(() => {
    if (!previewSlug) return;
    const neighbors = relationGraph[previewSlug] ?? [];
    if (neighbors.length === 0) return;
    const win = typeof window !== "undefined" ? window : null;
    const schedule =
      win && "requestIdleCallback" in win
        ? (cb: () => void) => (win as Window & typeof globalThis).requestIdleCallback(cb, { timeout: 1500 })
        : (cb: () => void) => window.setTimeout(cb, 200);
    const cancel =
      win && "cancelIdleCallback" in win
        ? (id: number) => (win as Window & typeof globalThis).cancelIdleCallback(id)
        : (id: number) => window.clearTimeout(id);
    const handle = schedule(() => {
      neighbors.forEach((n) => prefetchWord(n.slug));
    });
    return () => cancel(handle as number);
  }, [previewSlug, relationGraph, prefetchWord]);

  const { nodes, edges } = useMemo(() => {
    const sorted = [...cells]
      .filter((c) => c.lemma && c.lemma.trim().length > 0)
      .sort((a, b) => a.retrievability - b.retrievability);
    const visible = sorted.slice(0, MAX_NODES);
    const visibleSet = new Set(visible.map((c) => c.slug));

    const nodes: GraphNode[] = visible.map((c) => ({
      id: c.slug,
      slug: c.slug,
      lemma: c.lemma,
      retrievability: c.retrievability,
      cefr: c.cefr,
      dueAt: c.dueAt,
    }));

    const edgeMap = new Map<string, GraphEdge>();
    for (const cell of visible) {
      const neighbors = relationGraph[cell.slug] ?? [];
      for (const n of neighbors) {
        if (!visibleSet.has(n.slug) || n.slug === cell.slug) continue;
        const key = [cell.slug, n.slug].sort().join("--");
        if (!edgeMap.has(key)) {
          edgeMap.set(key, { source: cell.slug, target: n.slug, relation: n.relation });
        }
      }
    }

    return { nodes, edges: Array.from(edgeMap.values()) };
  }, [cells, relationGraph]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDims({ width: entry.contentRect.width, height: GRAPH_HEIGHT });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = dims.width;
    const height = dims.height;
    svg.attr("width", width).attr("height", height);

    const viewport = svg.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 3])
      .on("zoom", (event) => {
        viewport.attr("transform", event.transform.toString());
      });
    svg.call(zoom).on("dblclick.zoom", null);

    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<GraphNode, GraphEdge>(edges)
          .id((d) => d.id)
          .distance(55)
          .strength(0.35),
      )
      .force("charge", d3.forceManyBody().strength(-220))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<GraphNode>().radius((d) => 6 + (1 - d.retrievability) * 6 + 4))
      .alpha(0.9)
      .alphaDecay(0.04);

    const simEdges = edges as unknown as SimEdge[];

    const edgeLayer = viewport.append("g").attr("class", "edges");
    const linkSel = edgeLayer
      .selectAll<SVGLineElement, SimEdge>("line")
      .data(simEdges)
      .join("line")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-opacity", 0.35)
      .attr("stroke-width", 1);

    const nodeLayer = viewport.append("g").attr("class", "nodes");
    const circleSel = nodeLayer
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => 4 + (1 - d.retrievability) * 5)
      .attr("fill", (d) => getRetrievabilityColor(d.retrievability))
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.8)
      .attr("cursor", "pointer")
      .style("transition", "filter 0.15s")
      .on("mouseenter", (event, d) => {
        prefetchWord(d.slug);
        d3.selectAll<SVGCircleElement, GraphNode>("circle").style("filter", (n) =>
          n.id === d.id || simEdges.some((e) =>
            (e.source.id === d.id && e.target.id === n.id) ||
            (e.target.id === d.id && e.source.id === n.id)
          )
            ? "none"
            : "opacity(0.25)",
        );
        const neighbors = (relationGraph[d.slug] ?? []).filter((n) =>
          nodes.some((node) => node.slug === n.slug),
        );
        setTooltip({
          cell: d as unknown as MasteryCell,
          neighbors,
          x: event.clientX,
          y: event.clientY,
        });
      })
      .on("mousemove", (event, d) => {
        setTooltip((prev) =>
          prev && prev.cell.slug === d.slug ? { ...prev, x: event.clientX, y: event.clientY } : prev,
        );
      })
      .on("mouseleave", () => {
        d3.selectAll("circle").style("filter", null);
        setTooltip(null);
      })
      .on("click", (_event, d) => {
        setTooltip(null);
        prefetchWord(d.slug);
        setPreviewSlug(d.slug);
      });

    const drag = d3
      .drag<SVGCircleElement, GraphNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    circleSel.call(drag as any);

    const labelLayer = viewport.append("g").attr("class", "labels");
    const labelSel = labelLayer
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text((d) => d.lemma)
      .attr("font-size", (d) => (d.retrievability < 0.45 || simEdges.some((e) => e.source.id === d.id || e.target.id === d.id) ? "10px" : "9px"))
      .attr("fill", "#475569")
      .attr("text-anchor", "middle")
      .attr("opacity", (d) => (d.retrievability < 0.45 || simEdges.some((e) => e.source.id === d.id || e.target.id === d.id) ? 1 : 0.45))
      .attr("dy", (d) => 4 + (1 - d.retrievability) * 5 + 10)
      .attr("pointer-events", "none");

    simulation.on("tick", () => {
      linkSel
        .attr("x1", (d) => d.source.x!)
        .attr("y1", (d) => d.source.y!)
        .attr("x2", (d) => d.target.x!)
        .attr("y2", (d) => d.target.y!);
      circleSel.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);
      labelSel.attr("x", (d) => d.x ?? 0).attr("y", (d) => d.y ?? 0);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, dims, relationGraph, router, prefetchWord]);

  const stats = useMemo(() => {
    const total = cells.length;
    const atRisk = cells.filter((c) => c.retrievability < 0.4).length;
    const solid = cells.filter((c) => c.retrievability >= 0.9).length;
    return { atRisk, solid, total, visible: nodes.length };
  }, [cells, nodes.length]);

  const previewCell = useMemo(() => {
    if (!previewSlug) return null;
    return cells.find((c) => c.slug === previewSlug) ?? null;
  }, [previewSlug, cells]);

  if (cells.length === 0) return null;

  return (
    <section className="panel relative rounded-[1.75rem] p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            词汇掌握度
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--color-ink)]">词汇网络图</h2>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-ink-soft)]">
          {[
            { color: "#16a34a", label: "牢固" },
            { color: "#84cc16", label: "较好" },
            { color: "#eab308", label: "一般" },
            { color: "#f97316", label: "薄弱" },
            { color: "#ef4444", label: "濒危" },
          ].map((item) => (
            <span key={item.label} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex gap-4 text-[11px] text-[var(--color-ink-soft)]">
        <span>
          总 <strong className="text-[var(--color-ink)]">{stats.total}</strong> 词
          {stats.visible < stats.total ? (
            <span className="ml-1 opacity-60">（显示 {stats.visible} 个节点）</span>
          ) : null}
        </span>
        <span style={{ color: "#ef4444" }}>
          濒危 <strong>{stats.atRisk}</strong>
        </span>
        <span style={{ color: "#16a34a" }}>
          牢固 <strong>{stats.solid}</strong>
        </span>
      </div>

      <div
        ref={wrapRef}
        className="relative mt-4 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)]"
      >
        <svg ref={svgRef} className="block w-full" />
      </div>

      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-3 shadow-xl"
          style={{ left: tooltip.x + 12, top: tooltip.y - 100 }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: getRetrievabilityColor(tooltip.cell.retrievability) }}
            />
            <span className="text-sm font-semibold text-[var(--color-ink)]">{tooltip.cell.lemma}</span>
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--color-ink-soft)]">
            {tooltip.cell.cefr} · 记忆概率{" "}
            <span
              className="font-semibold"
              style={{ color: getRetrievabilityColor(tooltip.cell.retrievability) }}
            >
              {Math.round(tooltip.cell.retrievability * 100)}%
            </span>
            <span className="ml-1 opacity-70">({getRetrievabilityLabel(tooltip.cell.retrievability)})</span>
          </p>
          {tooltip.cell.dueAt ? (
            <p className="mt-0.5 text-[10px] text-[var(--color-ink-soft)] opacity-60">
              到期 {tooltip.cell.dueAt.slice(0, 10)}
            </p>
          ) : null}
          {tooltip.neighbors.length > 0 && (
            <div className="mt-2 border-t border-[var(--color-border)] pt-2">
              <p className="mb-1 text-[10px] text-[var(--color-ink-soft)] opacity-60">关联词汇</p>
              <div className="flex flex-wrap gap-1">
                {tooltip.neighbors.map((n) => (
                  <span
                    key={n.slug}
                    className="rounded bg-[var(--color-surface-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-soft)]"
                  >
                    {n.lemma}
                    <span className="ml-0.5 opacity-60">({n.relation})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-ink-soft)] opacity-60">
        每个圆点 = 一个词条，颜色 = FSRS 记忆概率，大小反比于记忆强度（濒危更大）。连线表示近义/反义/词根关联。可拖拽节点、滚轮缩放。点击节点预览详情。
      </p>

      {previewSlug && previewCell && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            onClick={() => setPreviewSlug(null)}
          />
          <div className="fixed left-1/2 top-1/2 z-[61] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[2rem] bg-[var(--color-surface-strong)] p-8 shadow-2xl ring-1 ring-[var(--color-border)]">
            <button
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface-soft)] text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
              onClick={() => setPreviewSlug(null)}
              aria-label="关闭"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-soft)] opacity-60">
              {previewCell.cefr}
            </div>
            <h3 className="text-2xl font-bold text-[var(--color-ink)]">{previewCell.lemma}</h3>

            <div className="mt-4 flex items-center gap-3">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: getRetrievabilityColor(previewCell.retrievability) }}
              />
              <span className="text-sm text-[var(--color-ink-soft)]">
                记忆概率{" "}
                <strong className="text-[var(--color-ink)]">
                  {Math.round(previewCell.retrievability * 100)}%
                </strong>
                <span className="ml-1 opacity-70">({getRetrievabilityLabel(previewCell.retrievability)})</span>
              </span>
            </div>

            {previewCell.dueAt && (
              <p className="mt-1 text-xs text-[var(--color-ink-soft)] opacity-60">
                下次复习：{previewCell.dueAt.slice(0, 10)}
              </p>
            )}

            {(() => {
              const neighbors = relationGraph[previewCell.slug] ?? [];
              return neighbors.length > 0 ? (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-semibold text-[var(--color-ink-soft)]">关联词汇</p>
                  <div className="flex flex-wrap gap-2">
                    {neighbors.map((n) => (
                      <button
                        key={n.slug}
                        className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-1.5 text-xs text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
                        onMouseEnter={() => prefetchWord(n.slug)}
                        onFocus={() => prefetchWord(n.slug)}
                        onClick={() => {
                          prefetchWord(n.slug);
                          setPreviewSlug(n.slug);
                        }}
                      >
                        {n.lemma}
                        <span className="ml-1 opacity-60">({n.relation})</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            <div className="mt-6 flex gap-3">
              <button
                className="rounded-xl bg-[var(--color-surface-soft)] px-5 py-2.5 text-sm font-medium text-[var(--color-ink-soft)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]"
                onClick={() => setPreviewSlug(null)}
              >
                关闭
              </button>
              <button
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                style={{ backgroundColor: getRetrievabilityColor(previewCell.retrievability) }}
                onMouseEnter={() => prefetchWord(previewCell.slug)}
                onFocus={() => prefetchWord(previewCell.slug)}
                onClick={() => navigateToWord(previewCell.slug)}
              >
                查看完整详情 →
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
