# Vocab App Deep Health Check - 2026-04-26

Checked from `E:\Notes\Vocab_demo\vocab-app` after the initial repair pass.

## Current Status

- `lint`: passing
- `typecheck`: passing
- `test`: passing (`45/45`)
- `build`: passing
- Static generation: completed cleanly for 274 pages

## What Was Optimized

### 1. Public detail SSG reads now retry once on transient network failures

Added a narrow retry helper in `lib/supabase/public.ts` and applied it only to:

- public word detail fetches
- public plaza detail fetches

The retry only triggers for transient network-style failures such as:

- `ECONNRESET`
- `ETIMEDOUT`
- `socket hang up`
- `fetch failed`
- `TypeError: terminated`

This keeps the existing graceful-degradation behavior, but reduces false-negative detail misses during high-concurrency static generation.

### 2. Build output is now clean

Earlier builds completed with non-fatal detail fetch errors logged during SSG.

After the retry optimization:

- `npm.cmd run build` completed successfully
- the previous detail-fetch `ECONNRESET` warnings did not reappear in the validation run

## Deep Findings

### Stable now

- The prior React hook lint failures are fixed.
- The dashboard day-bucketing bug is fixed with local-calendar normalization.
- The public SSG route strategy remains intact:
  - `/words/[slug]` prerenders a hot subset
  - `/plaza/[slug]` prerenders a smaller subset
  - public routes still use static/SSG as intended

### Remaining risk, but not blocking

- Public data reads still use graceful degradation in several places and log errors instead of failing hard.
- Test coverage remains modest overall, especially in:
  - `lib/words.ts`
  - `lib/plaza.ts`
  - `lib/supabase/public.ts`
  - `lib/imports.ts`
- The new retry helper itself is not yet directly unit-tested.

## Recommended Next Targets

1. Add focused tests for `withTransientPublicReadRetry()`:
   - retries once on transient read errors
   - does not retry non-transient errors
   - returns immediately on first success

2. Add narrow read-path tests for public detail fetch behavior:
   - preserves `null`/empty fallback on exhausted failures
   - does not treat “not found” as retryable

3. Consider extending retry coverage only where build-time/public-read stability matters:
   - public word slug list
   - public word count
   - public collection summaries

## Bottom Line

The app is now locally healthy and materially more stable under SSG load than it was before this pass. The highest-value remaining work is test coverage around the new retry path and other public-read fallback surfaces, not architectural changes.
