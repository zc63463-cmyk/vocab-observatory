"use client";

import * as d3 from "d3";
import { LocateFixed } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  VocabGraphData,
  VocabGraphEdge,
  VocabGraphNode,
  VocabGraphNodeType,
  VocabGraphRelation,
} from "@/lib/vocab-graph";

export type VocabTopologyGraphProps = {
  data: VocabGraphData;
  className?: string;
  maxNodes?: number;
  onNodeClick?: (node: VocabGraphNode) => void;
};

type SimulationNode = VocabGraphNode & d3.SimulationNodeDatum;
type SimulationEdge = Omit<VocabGraphEdge, "source" | "target"> & {
  source: string | SimulationNode;
  target: string | SimulationNode;
};

const DEFAULT_MAX_NODES = 60;
const MIN_GRAPH_WIDTH = 320;
const MIN_GRAPH_HEIGHT = 320;
const NODE_PRIORITY: Record<VocabGraphNodeType, number> = {
  antonym: 3,
  current: 0,
  related: 3,
  root: 1,
  synonym: 2,
};

const RELATION_LABELS: Array<{ relation: VocabGraphRelation; label: string }> = [
  { relation: "root-family", label: "同根" },
  { relation: "synonym", label: "近义" },
  { relation: "antonym", label: "反义" },
  { relation: "related", label: "笔记" },
];

function limitGraphData(data: VocabGraphData, maxNodes: number): VocabGraphData {
  if (data.nodes.length <= maxNodes) {
    return data;
  }

  const sortedNodes = [...data.nodes].sort((left, right) => {
    const priorityDelta = NODE_PRIORITY[left.type] - NODE_PRIORITY[right.type];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return (right.weight ?? 0) - (left.weight ?? 0);
  });
  const includedIds = new Set(sortedNodes.slice(0, Math.max(1, maxNodes)).map((node) => node.id));
  includedIds.add(data.centerId);

  return {
    centerId: data.centerId,
    edges: data.edges.filter((edge) => includedIds.has(edge.source) && includedIds.has(edge.target)),
    nodes: data.nodes.filter((node) => includedIds.has(node.id)),
  };
}

function endpointId(endpoint: string | SimulationNode) {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

function getNodeRadius(node: VocabGraphNode) {
  if (node.type === "current") {
    return 20;
  }

  return 8 + Math.min(8, node.weight ?? 2);
}

function getNodeLabel(node: VocabGraphNode) {
  return node.label.length > 24 ? `${node.label.slice(0, 22)}...` : node.label;
}

function getPrefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function buildNeighborMap(edges: SimulationEdge[]) {
  const neighbors = new Map<string, Set<string>>();

  for (const edge of edges) {
    const source = endpointId(edge.source);
    const target = endpointId(edge.target);
    if (!neighbors.has(source)) {
      neighbors.set(source, new Set());
    }
    if (!neighbors.has(target)) {
      neighbors.set(target, new Set());
    }

    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }

  return neighbors;
}

export function VocabTopologyGraph({
  className,
  data,
  maxNodes = DEFAULT_MAX_NODES,
  onNodeClick,
}: VocabTopologyGraphProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const [size, setSize] = useState({ height: 0, width: 0 });
  const graphData = useMemo(
    () => limitGraphData(data, Math.max(1, Math.min(maxNodes, 80))),
    [data, maxNodes],
  );

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = () => {
      setSize({
        height: container.clientHeight,
        width: container.clientWidth,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement || graphData.nodes.length <= 1 || graphData.edges.length === 0) {
      return;
    }

    const reducedMotion = getPrefersReducedMotion();
    const width = Math.max(MIN_GRAPH_WIDTH, size.width || MIN_GRAPH_WIDTH);
    const height = Math.max(MIN_GRAPH_HEIGHT, size.height || MIN_GRAPH_HEIGHT);
    const nodes: SimulationNode[] = graphData.nodes.map((node) => ({
      ...node,
      fx: node.id === graphData.centerId ? width / 2 : undefined,
      fy: node.id === graphData.centerId ? height / 2 : undefined,
      x: width / 2 + (node.type === "current" ? 0 : (Math.random() - 0.5) * 80),
      y: height / 2 + (node.type === "current" ? 0 : (Math.random() - 0.5) * 80),
    }));
    const edges: SimulationEdge[] = graphData.edges.map((edge) => ({ ...edge }));
    const neighborMap = buildNeighborMap(edges);
    const svg = d3.select(svgElement);
    svg.selectAll("*").remove();

    const viewport = svg.append("g").attr("class", "vocab-topology__viewport");
    const edgeLayer = viewport.append("g").attr("class", "vocab-topology__edges");
    const nodeLayer = viewport.append("g").attr("class", "vocab-topology__nodes");

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.55, 2.5])
      .on("zoom", (event) => {
        viewport.attr("transform", event.transform.toString());
      });

    svg.call(zoomBehavior).on("dblclick.zoom", null);

    const simulation = d3
      .forceSimulation<SimulationNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimulationNode, SimulationEdge>(edges)
          .id((node) => node.id)
          .distance(105)
          .strength((edge) => (edge.relation === "root-family" ? 0.45 : 0.32)),
      )
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide<SimulationNode>().radius((node) => getNodeRadius(node) + 16),
      )
      .alpha(reducedMotion ? 0.18 : 0.9)
      .alphaDecay(reducedMotion ? 0.16 : 0.045);

    const edgeSelection = edgeLayer
      .selectAll<SVGLineElement, SimulationEdge>("line")
      .data(edges)
      .join("line")
      .attr("class", (edge) => `vocab-topology__edge relation-${edge.relation}`)
      .attr("stroke-width", (edge) => Math.max(1.2, edge.weight ?? 1.4));

    const nodeSelection = nodeLayer
      .selectAll<SVGGElement, SimulationNode>("g")
      .data(nodes, (node) => node.id)
      .join("g")
      .attr("class", (node) =>
        cn(
          "vocab-topology__node",
          `node-${node.type}`,
          node.href ? "is-clickable" : "is-orphan",
        ),
      )
      .attr("role", (node) => (node.href ? "link" : "button"))
      .attr("tabindex", 0)
      .attr("aria-label", (node) => `${node.label} ${node.href ? "词条" : "未收录词条"}`);

    nodeSelection
      .append("circle")
      .attr("class", "vocab-topology__node-circle")
      .attr("r", getNodeRadius);

    nodeSelection
      .append("text")
      .attr("class", "vocab-topology__node-label")
      .attr("dy", (node) => (node.type === "current" ? 34 : 26))
      .attr("text-anchor", "middle")
      .text(getNodeLabel);

    const setActiveNode = (activeId: string | null) => {
      edgeSelection
        .classed("is-active", (edge) => {
          if (!activeId) {
            return false;
          }

          return endpointId(edge.source) === activeId || endpointId(edge.target) === activeId;
        })
        .classed("is-muted", (edge) => {
          if (!activeId) {
            return false;
          }

          return endpointId(edge.source) !== activeId && endpointId(edge.target) !== activeId;
        });

      nodeSelection
        .classed("is-active", (node) => node.id === activeId)
        .classed("is-neighbor", (node) => Boolean(activeId && neighborMap.get(activeId)?.has(node.id)))
        .classed("is-muted", (node) => {
          if (!activeId) {
            return false;
          }

          return node.id !== activeId && !neighborMap.get(activeId)?.has(node.id);
        });
    };

    const activateNode = (node: SimulationNode) => {
      onNodeClickRef.current?.(node);
      if (node.href) {
        router.push(node.href as Route);
      }
    };

    nodeSelection
      .on("mouseenter", (_event, node) => setActiveNode(node.id))
      .on("mouseleave", () => setActiveNode(null))
      .on("focus", (_event, node) => setActiveNode(node.id))
      .on("blur", () => setActiveNode(null))
      .on("click", (_event, node) => activateNode(node))
      .on("keydown", (event, node) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        activateNode(node);
      });

    const dragBehavior = d3
      .drag<SVGGElement, SimulationNode>()
      .on("start", (event, node) => {
        if (!event.active) {
          simulation.alphaTarget(reducedMotion ? 0.08 : 0.25).restart();
        }
        node.fx = node.x;
        node.fy = node.y;
      })
      .on("drag", (event, node) => {
        node.fx = event.x;
        node.fy = event.y;
      })
      .on("end", (event, node) => {
        if (!event.active) {
          simulation.alphaTarget(0);
        }

        if (node.id !== graphData.centerId) {
          node.fx = null;
          node.fy = null;
        }
      });

    nodeSelection.call(dragBehavior);

    simulation.on("tick", () => {
      edgeSelection
        .attr("x1", (edge) => (edge.source as SimulationNode).x ?? width / 2)
        .attr("y1", (edge) => (edge.source as SimulationNode).y ?? height / 2)
        .attr("x2", (edge) => (edge.target as SimulationNode).x ?? width / 2)
        .attr("y2", (edge) => (edge.target as SimulationNode).y ?? height / 2);

      nodeSelection.attr(
        "transform",
        (node) => `translate(${node.x ?? width / 2},${node.y ?? height / 2})`,
      );
    });

    resetViewRef.current = () => {
      const centerNode = nodes.find((node) => node.id === graphData.centerId);
      if (centerNode) {
        centerNode.fx = width / 2;
        centerNode.fy = height / 2;
      }

      svg.call(zoomBehavior.transform, d3.zoomIdentity);
      simulation.force("center", d3.forceCenter(width / 2, height / 2));
      simulation.alpha(reducedMotion ? 0.12 : 0.5).restart();
    };

    if (reducedMotion) {
      window.setTimeout(() => simulation.stop(), 700);
    }

    return () => {
      resetViewRef.current = null;
      simulation.stop();
      svg.on(".zoom", null);
      svg.selectAll("*").remove();
    };
  }, [graphData, router, size.height, size.width]);

  if (graphData.nodes.length <= 1 || graphData.edges.length === 0) {
    return (
      <section className={cn("vocab-topology panel rounded-[1.75rem] p-6", className)}>
        <div className="flex min-h-[320px] items-center justify-center text-center text-sm leading-7 text-[var(--color-ink-soft)]">
          暂无足够关联数据生成拓扑图。
        </div>
      </section>
    );
  }

  return (
    <section className={cn("vocab-topology panel rounded-[1.75rem] p-5 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="section-title text-2xl font-semibold">局部拓扑</h2>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            {graphData.nodes.length} 个节点 · {graphData.edges.length} 条关系
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-ink-soft)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
          aria-label="重置并居中拓扑图"
          title="重置并居中"
          onClick={() => resetViewRef.current?.()}
        >
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div
        ref={containerRef}
        className="vocab-topology__canvas mt-4 h-[360px] overflow-hidden rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] md:h-[560px]"
      >
        <svg
          ref={svgRef}
          role="img"
          aria-label="当前词条的局部动态拓扑图"
          className="h-full w-full"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2" aria-label="关系图例">
        {RELATION_LABELS.map((item) => (
          <span
            key={item.relation}
            className={cn("vocab-topology__legend-item", `relation-${item.relation}`)}
          >
            <span className="vocab-topology__legend-mark" aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>
    </section>
  );
}

export default VocabTopologyGraph;
