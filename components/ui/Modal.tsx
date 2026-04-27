"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { X } from "lucide-react";

export function Modal({ children }: { children: React.ReactNode }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const onDismiss = useCallback(() => {
    router.back();
  }, [router]);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current || e.target === wrapperRef.current) {
        if (onDismiss) onDismiss();
      }
    },
    [onDismiss, overlayRef, wrapperRef]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    },
    [onDismiss]
  );

  useEffect(() => {
    // Prevent scrolling on body when modal is open
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onKeyDown]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6 md:p-8"
      onClick={onClick}
    >
      <div ref={wrapperRef} className="absolute inset-0 z-0" />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative z-10 w-full max-w-6xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl rounded-[2.5rem] flex flex-col max-h-[100dvh]"
      >
        <div className="absolute top-6 right-6 z-50">
          <button
            onClick={onDismiss}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-soft)] text-[var(--color-ink-soft)] border border-[var(--color-border)] hover:text-[var(--color-ink)] hover:bg-[var(--color-border)] transition-all shadow-sm"
            aria-label="关闭"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
        <div className="overflow-y-auto p-6 md:p-10 lg:p-12 h-full">
          {children}
        </div>
      </motion.div>
    </div>
  );
}
