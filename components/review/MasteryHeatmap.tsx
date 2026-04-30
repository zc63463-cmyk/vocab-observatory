"use client";

import Link from "next/link";
import { useMemo } from "react";

interface MasteryCell {
  cefr: string;
  lemma: string;
  slug: string;
  retrievability: number;
  dueAt: string | null;
}

interface MasteryHeatmapProps {
  cells: MasteryCell[];
}

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2", "unknown"];
const CEFR_LABELS: Record<string, string> = {
  A1: "初级 A1",
  A2: "初级 A2",
  B1: "中级 B1",
  B2: "中高级 B2",
  C1: "高级 C1",
  C2: "精通 C2",
  unknown: "未分级",
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

export function MasteryHeatmap({ cells }: MasteryHeatmapProps) {
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

  if (cells.length === 0) {
    return null;
  }

  return (
    <section className="panel rounded-[1.75rem] p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
            词汇掌握度
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--color-ink)]">
            记忆热力图
          </h2>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[var(--color-ink-soft)]">
          {[
            { color: "#16a34a", label: "牢固" },
            { color: "#84cc16", label: "较好" },
            { color: "#eab308", label: "一般" },
            { color: "#f97316", label: "薄弱" },
            { color: "#ef4444", label: "濒危" },
          ].map((item) => (
            <span key={item.label} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {groups.map((group) => (
          <div key={group.level}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
                {group.label}
              </span>
              <span className="text-[11px] text-[var(--color-ink-soft)] opacity-60">
                {group.items.length} 词
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {group.items.map((cell) => {
                const color = getRetrievabilityColor(cell.retrievability);
                const label = getRetrievabilityLabel(cell.retrievability);
                return (
                  <Link
                    key={cell.slug}
                    href={`/words/${cell.slug}`}
                    className="group relative inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md px-1.5 text-[11px] font-medium text-white transition hover:scale-110 hover:shadow-md"
                    style={{ backgroundColor: color }}
                    title={`${cell.lemma} — 记忆概率 ${Math.round(cell.retrievability * 100)}% (${label})${cell.dueAt ? ` · 到期 ${cell.dueAt.slice(0, 10)}` : ""}`}
                  >
                    {cell.lemma.slice(0, 3)}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-[var(--color-ink-soft)] opacity-60">
        每个色块代表一个复习词条，颜色深浅反映 FSRS 算法计算的记忆概率（retrievability）。
        点击可跳转词条详情页。
      </p>
    </section>
  );
}
