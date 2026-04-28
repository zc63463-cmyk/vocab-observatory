"use client";

import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { springs } from "@/components/motion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const MotionLink = motion.create(Link);

interface WordCardShellProps {
  children: ReactNode;
  className?: string;
  href: string;
}

const TILT_STRENGTH = 12; // max degrees of rotation
const SPRING_CONFIG = { damping: 25, stiffness: 200 };

/**
 * Client-side animation shell for WordCard.
 * Separated so the card body stays a server component.
 *
 * Animates:
 * - Hover: lift + shadow + 3D perspective tilt (mouse-tracking)
 * - Tap: subtle scale-down feedback
 * - Reduced-motion: disables tilt, keeps lift
 */
export function WordCardShell({ children, className, href }: WordCardShellProps) {
  const prefersReduced = useReducedMotion();
  const [shouldPrefetch, setShouldPrefetch] = useState(false);

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRotateX = useSpring(rotateX, SPRING_CONFIG);
  const springRotateY = useSpring(rotateY, SPRING_CONFIG);

  function handleMouseMove(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!shouldPrefetch) {
      setShouldPrefetch(true);
    }
    
    if (prefersReduced) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const normalX = (e.clientX - centerX) / (rect.width / 2);
    const normalY = (e.clientY - centerY) / (rect.height / 2);

    rotateX.set(-normalY * TILT_STRENGTH);
    rotateY.set(normalX * TILT_STRENGTH);
  }

  function handleMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  const tiltStyle = prefersReduced
    ? undefined
    : {
        rotateX: springRotateX,
        rotateY: springRotateY,
        perspective: 800,
      };

  return (
    <MotionLink
      href={href as Route}
      prefetch={shouldPrefetch || undefined}
      className={cn(
        "panel group flex h-full flex-col rounded-[1.75rem] p-6 transition-colors duration-200 hover:border-[var(--color-border-strong)]",
        className,
      )}
      style={tiltStyle}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={{
        y: -4,
        boxShadow: "0 22px 54px rgba(71,50,20,0.14)",
        transition: { type: "spring", ...springs.smooth },
      }}
      whileTap={{ scale: 0.985 }}
    >
      {children}
    </MotionLink>
  );
}
