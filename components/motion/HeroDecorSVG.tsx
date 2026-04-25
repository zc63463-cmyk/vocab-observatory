"use client";

import { motion } from "framer-motion";

/**
 * Decorative SVG background for the Hero section.
 * Abstract network/constellation pattern — echoes the "observatory" theme.
 * Gentle perpetual float animation, respects reduced-motion.
 */
export function HeroDecorSVG() {
  return (
    <svg
      className="pointer-events-none absolute -right-8 -top-8 h-[110%] w-[60%] opacity-[0.07] dark:opacity-[0.05]"
      viewBox="0 0 400 400"
      fill="none"
      aria-hidden="true"
    >
      {/* Nodes */}
      <motion.circle
        cx="80" cy="60" r="4" fill="currentColor"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle
        cx="200" cy="40" r="5" fill="currentColor"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />
      <motion.circle
        cx="320" cy="80" r="3" fill="currentColor"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
      <motion.circle
        cx="140" cy="150" r="4" fill="currentColor"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
      />
      <motion.circle
        cx="280" cy="180" r="3.5" fill="currentColor"
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
      />
      <motion.circle
        cx="60" cy="260" r="3" fill="currentColor"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
      />
      <motion.circle
        cx="180" cy="280" r="5" fill="currentColor"
        animate={{ y: [0, -9, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
      />
      <motion.circle
        cx="340" cy="300" r="4" fill="currentColor"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      />
      <motion.circle
        cx="100" cy="360" r="3" fill="currentColor"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.9 }}
      />
      <motion.circle
        cx="260" cy="370" r="4" fill="currentColor"
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
      />

      {/* Edges connecting nodes */}
      <line x1="80" y1="60" x2="200" y2="40" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <line x1="200" y1="40" x2="320" y2="80" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <line x1="80" y1="60" x2="140" y2="150" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="200" y1="40" x2="140" y2="150" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="140" y1="150" x2="280" y2="180" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
      <line x1="320" y1="80" x2="280" y2="180" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="60" y1="260" x2="180" y2="280" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="280" y1="180" x2="340" y2="300" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      <line x1="180" y1="280" x2="340" y2="300" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="180" y1="280" x2="100" y2="360" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      <line x1="340" y1="300" x2="260" y2="370" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
      <line x1="100" y1="360" x2="260" y2="370" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      <line x1="140" y1="150" x2="60" y2="260" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      <line x1="280" y1="180" x2="180" y2="280" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
    </svg>
  );
}
