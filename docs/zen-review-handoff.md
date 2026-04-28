# Zen Review Mode — Handoff Report for gpt5.5

## TL;DR

Zen Review (`/review/zen`) is a keyboard-first, immersive flashcard review mode.
It reuses existing FSRS logic (`lib/review/fsrs-adapter.ts`) and API endpoints
(`/api/review/queue`, `/api/review/answer`, `/api/review/skip`).
All Zen components live under `components/review/zen/` and are fully wired up.
Build and typecheck pass.

---

## What was built

### New files

| File | Purpose |
|------|---------|
| `app/(app)/review/zen/page.tsx` | Route entry point (Server Component) |
| `components/review/zen/types.ts` | ZenState, ZenAction, RatingKey, RATING_CONFIG, ZenPhase union |
| `components/review/zen/useZenReview.ts` | Data hook: fetches queue, submits rating, skip item. Returns typed `setState` dispatchers so parent can pass functional updates to reducer. |
| `components/review/zen/useZenShortcuts.ts` | Keyboard listener. Handles `Space`(flip), `1-4`/`J-K-L-;`(rate), `S`(skip), `Esc`(exit). Guards: input focus, `e.metaKey/ctrlKey/altKey`, `e.repeat`, `omni.isOpen`. |
| `components/review/zen/ZenReviewProvider.tsx` | State machine (`loading→front→back→rating→front…done|error`). Integrates `useZenReview` + `useZenShortcuts`. Animation lock (`isAnimating`) prevents double-submit during 350ms card-exit delay. |
| `components/review/zen/ZenFlashcard.tsx` | 3D flip card (`transform-style: preserve-3d`, `rotateY`). Front: word + IPA. Back: definition + review metadata. Uses `framer-motion` spring. Respects `prefers-reduced-motion`. |
| `components/review/zen/ZenProgress.tsx` | Minimal progress bar (completed / total + new count). |
| `components/review/zen/ZenRatingButtons.tsx` | Visual rating buttons with color coding (Again=orange, Hard=yellow, Good=teal, Easy=teal-strong). Disabled when `phase !== "back"` or `isAnimating`. |
| `components/review/zen/ZenExitButton.tsx` | Fixed-position close button, exits via `window.location.href = "/review"`. |
| `components/review/zen/RatingFeedback.tsx` | Full-screen weak color ripple overlay per rating key. |
| `components/review/zen/useAutoHideCursor.ts` | Hides cursor after 2s inactivity; shows on mouse/keyboard/touch. |
| `components/review/zen/ZenReviewPage.tsx` | Orchestrates all sub-components. Mounts `zen-mode` class on `document.body` and restores on unmount. Fixed-position full-screen container. |

### Modified files

| File | Change |
|------|--------|
| `components/review/ReviewQueue.tsx` | Added "禅意模式" entry button (top-right of metric cards). Uses `<a href="/review/zen">` to avoid Next.js typed-route issue. Imports `Sparkles` from `lucide-react`. |
| `app/globals.css` | Added `.zen-mode` styles: `header`/`[role="banner"]`/`.back-to-top` hidden, `body` overflow hidden, `.zen-ambient-bg` radial gradients, `.backface-hidden`, `.zen-review-container` fixed inset. Includes `prefers-reduced-motion` overrides. |

---

## Architecture notes

### State machine (ZenReviewProvider)

```
INIT(items, session, stats)
  → if empty: phase = "done"
  → else: phase = "front", item = items[0]

REVEAL
  → phase = "back"

RATE(rating)
  → phase = "rating" (animation lock)
  → API POST /api/review/answer
  → 350ms delay for exit animation
  → NEXT: shift items, phase = "front" (or "done" if empty)

SKIP
  → API POST /api/review/skip
  → NEXT immediately

EXIT
  → window.location.href = "/review"
```

### Data types used from existing codebase

- `ReviewQueueItem` — fields: `lemma`, `ipa`, `definition_md`, `short_definition`, `metadata`, `queue_label`, `queue_reason`, `review_count`, `is_new`, `progress_id`
- `ReviewQueueStats` — `dueToday`, `newCards`, `completed`, `remaining`, `deferredNewCards`
- `ReviewSessionSummary` — `started_at`, `cards_seen`
- `ReviewRating` — mapped via `RATING_CONFIG`: `again→1`, `hard→2`, `good→3`, `easy→4`

### Shortcut mapping (useZenShortcuts)

| Key | Rating |
|-----|--------|
| `1` or `J` | again |
| `2` or `K` | hard |
| `3` or `L` | good |
| `4` or `;` | easy |

`;` bound to `e.code === "Semicolon" || e.key === ";"` for keyboard-layout safety.

### Anti-conflict guards

- `isInputElement(e.target)` — rejects when focus is in `<input>`, `<textarea>`, `<select>`, or `contenteditable`
- `e.metaKey || e.ctrlKey || e.altKey` — rejects modified keys (preserves browser/OS shortcuts)
- `e.repeat` — rejects long-press repeats
- `omni.isOpen` — rejects when Omni-Search palette is open

---

## Known issues / lint noise

The following warnings/errors existed **before** this session and are **unrelated** to Zen Review:

- `components/omni/useOmniSearch.ts:33` — "Cannot update ref during render" (react-hooks/refs). This was a pre-existing refactor attempt that failed lint.
- `.workbuddy/memory/` and `.windsurf/` files are local workspace artifacts and **should not be committed**.

**Zen Review itself**: zero type errors, zero build errors. One unused-var warning in `ZenFlashcard.tsx` (`rate` assigned but not used in the component, passed from context but only `reveal` is used directly). Safe to ignore or clean up later.

---

## Verification commands

```bash
npm run typecheck   # passes
npm run build       # passes (includes /review/zen static page)
```

---

## Next steps (optional)

1. **SSR data pre-fetch**: `ZenReviewPage` currently loads queue client-side. You can convert `page.tsx` to fetch the queue server-side and pass as initial props, but watch for hydration mismatch if `useZenReview` re-fetches.
2. **Session stat sync**: After Zen mode exits back to `/review`, the ReviewQueue stats may be stale until refresh. Consider invalidating SWR or triggering a re-fetch on mount.
3. **Onboarding overlay**: First-time users may not know shortcuts. A dismissible "Space to flip, 1-4 to rate" tooltip could help.
4. **Clean up unused variable** in `ZenFlashcard.tsx:146` (`const { rate, reveal, ... }`) if you want a perfectly clean lint run.
5. **Commit the unrelated `useOmniSearch.ts` changes separately** or revert them — they are not part of Zen Review and currently fail lint.

---

## File inventory (Zen Review)

```
app/(app)/review/zen/page.tsx
components/review/zen/types.ts
components/review/zen/useZenReview.ts
components/review/zen/useZenShortcuts.ts
components/review/zen/ZenReviewProvider.tsx
components/review/zen/ZenFlashcard.tsx
components/review/zen/ZenProgress.tsx
components/review/zen/ZenRatingButtons.tsx
components/review/zen/ZenExitButton.tsx
components/review/zen/RatingFeedback.tsx
components/review/zen/useAutoHideCursor.ts
components/review/zen/ZenReviewPage.tsx
```

And the two modified files:

```
app/globals.css
components/review/ReviewQueue.tsx
```
