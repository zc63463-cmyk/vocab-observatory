"use client";

import { motion } from "framer-motion";
import { springs } from "@/components/motion";
import type { ReactNode } from "react";

/**
 * Wraps page content with a fade+slide-up entrance animation.
 * Drop this inside server-rendered layouts (SiteFrame) for
 * seamless page transitions without converting the layout to a client component.
 */
export function PageTransitionMain({ children }: { children: ReactNode }) {
  return (
    <motion.main
      className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-16 pt-8 sm:px-6 lg:px-8"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", ...springs.smooth, duration: 0.5 }}
    >
      {children}
    </motion.main>
  );
}
