"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { springs } from "@/components/motion";
import type { DrillCard, DrillQueueState } from "@/lib/review/drill";
import { DrillWordPicker } from "./DrillWordPicker";
import { DrillSession } from "./DrillSession";
import { DrillSummary } from "./DrillSummary";
import type { DrillAppPhase, DrillCandidate, DrillCandidatesResponse } from "./types";

/**
 * Top-level client orchestrator for /review/drill.
 *
 * Responsibilities:
 *   - Fetches the candidate list once on mount.
 *   - Tracks overall phase: loading → picker → session → summary → (loop).
 *   - Retains the last played deck so the "再来一轮" summary button can
 *     replay without forcing a re-selection round-trip.
 *   - Never writes to the server. Drill is a pure client experience.
 *
 * Routing: uses next/navigation's `useRouter().push("/review")` for exits
 * so the browser back stack stays clean — drill is a leaf destination,
 * not a modal.
 */
export function DrillApp() {
  const router = useRouter();
  const { addToast } = useToast();

  const [phase, setPhase] = useState<DrillAppPhase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DrillCandidate[]>([]);
  const [activeDeck, setActiveDeck] = useState<DrillCard[]>([]);
  const [finalState, setFinalState] = useState<DrillQueueState | null>(null);

  const fetchCandidates = useCallback(async () => {
    setPhase("loading");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/review/drill/candidates", {
        cache: "no-store",
      });
      if (!res.ok) {
        const msg = (await safeErr(res)) ?? "加载候选词失败";
        throw new Error(msg);
      }
      const payload = (await res.json()) as DrillCandidatesResponse;
      setCandidates(payload.items ?? []);
      setPhase("picker");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "加载候选词失败");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void fetchCandidates();
  }, [fetchCandidates]);

  const handleStart = useCallback((selected: DrillCandidate[]) => {
    if (selected.length === 0) return;
    // Shed the picker-only fields (`dueAt`, `reviewCount`) implicitly:
    // TS structural typing lets the wider candidate shape satisfy
    // DrillCard, so no mapping needed at runtime — but we copy the
    // array so a later picker mutation cannot mutate the live session.
    setActiveDeck(selected.slice());
    setFinalState(null);
    setPhase("session");
  }, []);

  const handleDone = useCallback((state: DrillQueueState) => {
    setFinalState(state);
    setPhase("summary");
  }, []);

  const handleExitSession = useCallback(() => {
    setActiveDeck([]);
    setFinalState(null);
    setPhase("picker");
    addToast("已退出本轮自测", "info");
  }, [addToast]);

  const handleReplay = useCallback(() => {
    if (activeDeck.length === 0) {
      setPhase("picker");
      return;
    }
    setFinalState(null);
    setPhase("session");
  }, [activeDeck]);

  const handlePickAgain = useCallback(() => {
    setActiveDeck([]);
    setFinalState(null);
    setPhase("picker");
  }, []);

  const handleExit = useCallback(() => {
    router.push("/review");
  }, [router]);

  if (phase === "loading") {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center">
        <motion.div
          className="h-8 w-8 rounded-full border-2 border-[var(--color-accent)] border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <p className="mt-4 text-sm text-[var(--color-ink-soft)] opacity-60">
          正在准备候选词…
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="panel rounded-[1.75rem] p-6 text-center">
        <p className="text-sm text-[var(--color-accent-2)]">
          {errorMessage ?? "发生错误"}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={fetchCandidates}>
            再试一次
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleExit}>
            返回复习页
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {phase === "picker" && (
        <motion.div
          key="picker"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", ...springs.smooth }}
        >
          <DrillWordPicker
            candidates={candidates}
            onStart={handleStart}
            onExit={handleExit}
          />
        </motion.div>
      )}

      {phase === "session" && activeDeck.length > 0 && (
        <motion.div
          key="session"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", ...springs.smooth }}
        >
          <DrillSession
            initialCards={activeDeck}
            onDone={handleDone}
            onExit={handleExitSession}
          />
        </motion.div>
      )}

      {phase === "summary" && finalState && (
        <motion.div
          key="summary"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: "spring", ...springs.smooth }}
        >
          <DrillSummary
            state={finalState}
            deck={activeDeck}
            onReplay={handleReplay}
            onPickAgain={handlePickAgain}
            onExit={handleExit}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Read a server-returned error without throwing on non-JSON bodies. */
async function safeErr(res: Response): Promise<string | null> {
  try {
    const payload = (await res.json()) as { error?: unknown };
    if (typeof payload.error === "string") return payload.error;
    if (payload.error && typeof payload.error === "object")
      return JSON.stringify(payload.error);
    return null;
  } catch {
    return null;
  }
}
