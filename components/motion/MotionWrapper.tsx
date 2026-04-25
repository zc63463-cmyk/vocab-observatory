"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { springs, fadeSlideUp } from "./presets";

function subscribeReducedMotion(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Respect the user's `prefers-reduced-motion` setting.
 * When active, all framer-motion animations are skipped (instant transitions).
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );
}

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delayChildren?: number;
}

/**
 * Wraps children with staggered fade+slide-up animation.
 * Each direct child must be a `StaggerItem`.
 */
export function StaggerContainer({
  children,
  className,
  stagger = 0.07,
  delayChildren = 0.1,
}: StaggerContainerProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: { delayChildren, staggerChildren: stagger },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

/** Individual item inside a StaggerContainer. */
export function StaggerItem({ children, className }: StaggerItemProps) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: fadeSlideUp.hidden,
        visible: {
          ...fadeSlideUp.visible,
          transition: { type: "spring", ...springs.smooth },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/** Page-level fade-in wrapper. Drop into route layouts. */
export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", ...springs.smooth, duration: 0.5 }}
    >
      {children}
    </motion.div>
  );
}

interface PresenceSwitchProps {
  children: ReactNode;
  routeKey: string;
  className?: string;
}

/**
 * AnimatePresence wrapper for content switches.
 * Uses `mode="wait"` so exit completes before enter begins.
 */
export function PresenceSwitch({
  children,
  routeKey,
  className,
}: PresenceSwitchProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={routeKey}
        className={className}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
