"use client";

import { motion } from "framer-motion";
import Link from "next/link";

interface CompletionCelebrationProps {
  completedCount: number;
  sessionCardsSeen: number;
  className?: string;
}

interface ConfettiParticle {
  color: string;
  delay: number;
  duration: number;
  id: number;
  rotate: number;
  x: number;
  xOffset: number;
  yOffset: number;
}

const CONFETTI_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
const CONFETTI_PARTICLES: ConfettiParticle[] = Array.from({ length: 30 }, (_, i) => ({
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: (i % 10) * 0.05,
  duration: 1.5 + (i % 6) * 0.18,
  id: i,
  rotate: 180 + (i % 8) * 72,
  x: (i * 17) % 100,
  xOffset: ((i * 29) % 200) - 100,
  yOffset: -200 - (i % 7) * 18,
}));

function ConfettiBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {CONFETTI_PARTICLES.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute h-2 w-2 rounded-sm"
          style={{
            backgroundColor: particle.color,
            left: `${particle.x}%`,
            top: "40%",
          }}
          initial={{ opacity: 1, y: 0, scale: 1 }}
          animate={{
            opacity: 0,
            rotate: particle.rotate,
            scale: 0.3,
            x: particle.xOffset,
            y: particle.yOffset,
          }}
          transition={{ duration: particle.duration, delay: particle.delay, ease: "easeOut" }}
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
          今日复习已全部完成
        </h2>

        <p className="mt-4 text-base text-[var(--color-ink-soft)]">
          本次会话共复习了{" "}
          <span className="font-semibold text-[var(--color-ink)]">{sessionCardsSeen}</span>{" "}
          张卡片，累计完成{" "}
          <span className="font-semibold text-[var(--color-ink)]">{completedCount}</span>{" "}
          个词条的评分。
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
