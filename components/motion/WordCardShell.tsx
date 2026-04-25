"use client";

import { motion } from "framer-motion";
import { springs } from "@/components/motion";
import type { ReactNode } from "react";

interface WordCardShellProps {
  children: ReactNode;
  href: string;
}

/**
 * Client-side animation shell for WordCard.
 * Separated so the card body stays a server component.
 *
 * Animates:
 * - Hover: lift + shadow (replaces CSS `hover:-translate-y-1 hover:shadow-...`)
 * - Tap: subtle scale-down feedback
 */
export function WordCardShell({ children, href }: WordCardShellProps) {
  return (
    <motion.a
      href={href}
      className="panel group flex h-full flex-col rounded-[1.75rem] p-6 transition-colors duration-200 hover:border-[var(--color-border-strong)]"
      whileHover={{
        y: -4,
        boxShadow: "0 22px 54px rgba(71,50,20,0.14)",
        transition: { type: "spring", ...springs.smooth },
      }}
      whileTap={{ scale: 0.985 }}
    >
      {children}
    </motion.a>
  );
}
