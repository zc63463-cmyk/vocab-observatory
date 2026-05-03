"use client";

import { ReviewPreferencesForm } from "./ReviewPreferencesForm";

/**
 * Dashboard-embedded variant of the review-experience preferences UI.
 *
 * Used by `components/dashboard/lab/bodies/ReviewLoadBody.tsx` inside
 * the 9-dot lab modal next to `ReviewRetentionSettings`. This is a
 * thin chrome wrapper around `ReviewPreferencesForm` — all the actual
 * form state, validation, and save plumbing lives there so the same
 * single source covers both this dashboard panel and the in-app
 * gear-button popovers (`/review` header + zen mode).
 *
 * Both surfaces talk to the shared `ReviewPreferencesProvider` context
 * mounted in `app/(app)/layout.tsx`, so a save in either place is
 * immediately visible to the other.
 */
export function ReviewPreferencesPanel() {
  return (
    <div className="mt-5 rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-soft)]">
          Review Experience
        </p>
        <p className="text-sm text-[var(--color-ink-soft)]">
          调节卡片正面的呈现方式与翻面前的自我校准。
        </p>
      </div>

      <div className="mt-4">
        <ReviewPreferencesForm density="panel" />
      </div>
    </div>
  );
}
