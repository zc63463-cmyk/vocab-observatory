"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface MasteryCell {
  cefr: string;
  lemma: string;
  metadata: unknown;
  slug: string;
  retrievability: number;
  dueAt: string | null;
}

interface MasteryHeatmapProps {
  cells: MasteryCell[];
  relationGraph?: Record<string, { slug: string; lemma: string; relation: string }[]>;
}

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "unknown"];
const CEFR_LABELS: Record<string, string> = {
  A1: "A1",
  A2: "A2",
  B1: "B1",
  B2: "B2",
  C1: "C1",
  C2: "C2",
  unknown: "?",
};

function getRetrievabilityColor(r: number): string {
  if (r >= 0.9) return "#16a34a"; // green-600 牢固
  if (r >= 0.75) return "#84cc16"; // lime-500 较好
  if (r >= 0.6) return "#eab308"; // yellow-500 一般
  if (r >= 0.4) return "#f97316"; // orange-500 薄弱
  return "#ef4444"; // red-500 濒危
}

function getRetrievabilityLabel(r: number): string {
  if (r >= 0.9) return "牢固";
  if (r >= 0.75) return "较好";
  if (r >= 0.6) return "一般";
  if (r >= 0.4) return "薄弱";
  return "濒危";
}

function PreviewCard({
  cell,
  neighbors,
}: {
  cell: MasteryCell;
  neighbors?: { slug: string; lemma: string; relation: string }[];
}) {
  return (
    <div className="pointer-events-none w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-3 shadow-xl">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: getRetrievabilityColor(cell.retrievability) }}
        />
        <span className="text-sm font-semibold text-[var(--color-ink)]">{cell.lemma}</span>
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--color-ink-soft)]">
        {CEFR_LABELS[cell.cefr] ?? cell.cefr} · 记忆概率{" "}
        <span className="font-semibold" style={{ color: getRetrievabilityColor(cell.retrievability) }}>
          {Math.round(cell.retrievability * 100)}%
        </span>
        <span className="ml-1 opacity-70">({getRetrievabilityLabel(cell.retrievability)})</span>
      </p>
      {cell.dueAt ? (
        <p className="mt-0.5 text-[10px] text-[var(--color-ink-soft)] opacity-60">
          到期 {cell.dueAt.slice(0, 10)}
        </p>
      ) : null}
      {neighbors && neighbors.length > 0 && (
        <div className="mt-2 border-t border-[var(--color-border)] pt-2">
          <p className="mb-1 text-[10px] text-[var(--color-ink-soft)] opacity-60">关联词汇</p>
          <div className="flex flex-wrap gap-1">
            {neighbors.map((n) => (
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
      <p className="mt-2 text-[10px] text-[var(--color-ink-soft)] opacity-40">点击打开词条页</p>
    </div>
  );
}

function DotNode({
  cell,
  onHover,
  isHighlighted,
}: {
  cell: MasteryCell;
  onHover: (cell: MasteryCell | null, rect: DOMRect | null) => void;
  isHighlighted?: boolean;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  return (
    <Link
      ref={ref}
      href={`/words/${cell.slug}`}
      className={`inline-block h-2 w-2 rounded-sm transition hover:scale-150 hover:z-10 hover:shadow-sm ${
        isHighlighted ? "ring-[1.5px] ring-white/80 scale-125" : ""
      }`}
      style={{ backgroundColor: getRetrievabilityColor(cell.retrievability) }}
      onMouseEnter={() => onHover(cell, ref.current?.getBoundingClientRect() ?? null)}
      onMouseLeave={() => onHover(null, null)}
      onFocus={() => onHover(cell, ref.current?.getBoundingClientRect() ?? null)}
      onBlur={() => onHover(null, null)}
    />
  );
}

function CEFRRow({
  label,
  level,
  items,
  defaultOpen = true,
  onHover,
  highlightedSlugs,
}: {
  label: string;
  level: string;
  items: MasteryCell[];
  defaultOpen?: boolean;
  onHover: (cell: MasteryCell | null, rect: DOMRect | null) => void;
  highlightedSlugs?: Set<string>;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const avgR = items.reduce((s, c) => s + c.retrievability, 0) / items.length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-1 flex w-full items-center gap-2 text-left"
      >
        <span className="w-10 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-[var(--color-ink-soft)] opacity-60">
          {items.length} 词
        </span>
        <span
          className="ml-auto text-[11px] font-medium tabular-nums"
          style={{ color: getRetrievabilityColor(avgR) }}
        >
          均 {Math.round(avgR * 100)}%
        </span>
        <span className="text-[10px] text-[var(--color-ink-soft)] opacity-50">
          {open ? "−" : "+"}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-10 flex flex-wrap gap-[3px]">
              {items.map((cell) => (
                <DotNode
                  key={cell.slug}
                  cell={cell}
                  onHover={onHover}
                  isHighlighted={highlightedSlugs?.has(cell.slug)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MasteryHeatmap({ cells, relationGraph = {} }: MasteryHeatmapProps) {
  const [hovered, setHovered] = useState<{ cell: MasteryCell; rect: DOMRect } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => {
    const map = new Map<string, MasteryCell[]>();
    for (const cell of cells) {
      const key = CEFR_ORDER.includes(cell.cefr) ? cell.cefr : "unknown";
      const list = map.get(key) ?? [];
      list.push(cell);
      map.set(key, list);
    }
    return CEFR_ORDER.map((level) => ({
      level,
      label: CEFR_LABELS[level] ?? level,
      items: map.get(level) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [cells]);

  const stats = useMemo(() => {
    const total = cells.length;
    const atRisk = cells.filter((c) => c.retrievability < 0.4).length;
    const solid = cells.filter((c) => c.retrievability >= 0.9).length;
    return { atRisk, solid, total };
  }, [cells]);

  if (cells.length === 0) {
    return null;
  }

  return (
    <section className="panel relative rounded-[1.75rem] p-6" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            词汇掌握度
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--color-ink)]">记忆热力图</h2>
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
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {/* Mini stats */}
      <div className="mt-4 flex gap-4 text-[11px] text-[var(--color-ink-soft)]">
        <span>
          总 <strong className="text-[var(--color-ink)]">{stats.total}</strong> 词
        </span>
        <span style={{ color: "#ef4444" }}>
          濒危 <strong>{stats.atRisk}</strong>
        </span>
        <span style={{ color: "#16a34a" }}>
          牢固 <strong>{stats.solid}</strong>
        </span>
      </div>

      {/* Compact CEFR rows */}
      <div className="mt-4 space-y-3">
        {groups.map((group) => (
          <CEFRRow
            key={group.level}
            label={group.label}
            level={group.level}
            items={group.items}
            highlightedSlugs={
              hovered
                ? new Set([
                    hovered.cell.slug,
                    ...(relationGraph[hovered.cell.slug] ?? []).map((n) => n.slug),
                  ])
                : undefined
            }
            onHover={(cell, rect) => {
              if (cell && rect) setHovered({ cell, rect });
              else setHovered(null);
            }}
          />
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--color-ink-soft)] opacity-60">
        每个节点 = 一个词条，颜色 = FSRS 记忆概率，悬浮预览详情，点击跳转词条页。
      </p>

      {/* Floating preview */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none fixed z-50"
            style={{
              left: hovered.rect.left + hovered.rect.width / 2 - 104,
              top: hovered.rect.top - 110,
            }}
          >
            <PreviewCard cell={hovered.cell} neighbors={relationGraph[hovered.cell.slug]} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
