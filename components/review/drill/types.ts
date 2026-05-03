import type { DrillCard } from "@/lib/review/drill";

/**
 * Wire shape of `/api/review/drill/candidates`. Superset of DrillCard:
 * includes picker-only metadata (`dueAt`, `reviewCount`) so the UI can
 * sort/filter. The session engine downcasts — any superset satisfies
 * DrillCard thanks to structural typing.
 */
export interface DrillCandidate extends DrillCard {
  dueAt: string | null;
  reviewCount: number;
}

export interface DrillCandidatesResponse {
  items: DrillCandidate[];
}

/** Phases of the overall drill page flow. */
export type DrillAppPhase = "loading" | "picker" | "session" | "summary" | "error";
