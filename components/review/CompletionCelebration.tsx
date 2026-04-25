"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";

interface CompletionCelebrationProps {
  completedCount: number;
  sessionCardsSeen: number;
  className?: string;
}

/** Simple CSS-based confetti burst (no heavy canvas library) */
function ConfettiBurst() {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; color: string; delay: number; duration: number }>>([]);

  useEffect(() => {
    const colors = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
    const items = Array.from({ length: 30 }, (_, i) => ({
      color: colors[i % colors.length],
      delay: Math.random() * 0.5,
      duration: 1.5 + Math.random() * 1.5,
      id: i,
      x: Math.random() * 100,
    }));
    setParticles(items);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute h-2 w-2 rounded-sm"
          style={{
            backgroundColor: p.color,
            left: `${p.x}%`,
            top: "40%",
          }}
          initial={{ opacity: 1, y: 0, scale: 1 }}
          animate={{ opacity: 0, y: -200 - Math.random() * 100, x: (Math.random() - 0.5) * 200, rotate: Math.random() * 720, scale: 0.3 }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

export function CompletionCelebration({
  completedCount,
  sessionCardsSeen,
  className,
}: CompletionCelebrationProps) {
  return (
    <motion.div
      className={`relative overflow-hidden rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-10 text-center ${className ?? ""}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <ConfettiBurst />

      <div className="relative">
        <motion.div
          className="text-6xl"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.2 }}
        >
          &#x1F389;
        </motion.div>

        <h2 className="section-title mt-6 text-3xl font-semibold">
          今日复习已全部完成！
        </h2>

        <p className="mt-4 text-base text-[var(--color-ink-soft)]">
          本次会话共复习了 <span className="font-semibold text-[var(--color-ink)]">{sessionCardsSeen}</span> 张卡片，
          累计完成 <span className="font-semibold text-[var(--color-ink)]">{completedCount}</span> 个词条的评分。
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-full border border-[rgba(15,111,98,0.2)] bg-[var(--color-surface-muted)] px-6 py-3 font-semibold text-[var(--color-accent)] transition hover:bg-[rgba(15,111,98,0.14)]"
          >
            查看仪表盘
          </Link>
          <Link
            href="/words"
            className="rounded-full bg-[var(--color-accent)] px-6 py-3 font-semibold text-white transition hover:opacity-90"
          >
            继续浏览词条
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
