# Vocab App Health Check - 2026-04-26

Checked from `E:\Notes\Vocab_demo\vocab-app` on 2026-04-26.

## Overall

- Repository state: clean working tree on `main`
- Git remote sync: local `HEAD` matches `origin/main`
- Environment file readiness: `.env.local` contains the same key set as `.env.example`
- Type safety: passing
- Lint: failing
- Tests: failing
- Local production build: failing
- Vercel project linkage: healthy
- Production site reachability: healthy when verified through local proxy

## Verified State

### Git

- Branch: `main`
- HEAD: `d4aeeb8 feat: review card transition, dashboard counter animation, detail scroll reveal`
- Remote: `https://github.com/zc63463-cmyk/vocab-observatory.git`
- Remote check: `git ls-remote origin HEAD refs/heads/main` returned the same commit hash as local `HEAD`

### Runtime / Tooling

- Node: `v24.15.0`
- npm: `11.12.1`
- PowerShell note: direct `npm` invocation is blocked by execution policy on this machine; `npm.cmd` works

### Environment / Data

- `.env.example` keys: 11
- `.env.local` keys: 11
- Missing keys: none
- Extra keys: none
- Supabase migrations present through `0008_word_filter_facets.sql`

### Vercel

- Linked project: `vocab-observatory`
- Project id: `prj_jgzJ3RH7aTYI3sarihsuDxt00Mwl`
- Latest observed production deployment:
  - URL: `https://vocab-observatory-jsfe7gd9r-zc63463-8447s-projects.vercel.app`
  - Created: `2026-04-26 16:11:27 +08:00`
  - Status: `Ready`
- Recent deployment history shows repeated successful production deploys, with a few intermittent `Error` entries mixed in

### Production Headers

Verified through `curl.exe --proxy http://127.0.0.1:7897 -I ...` because direct outbound access to the Vercel domain times out on this machine.

- `/`: `200 OK`, `X-Nextjs-Prerender: 1`, `X-Vercel-Cache: STALE`
- `/words`: `200 OK`, `X-Nextjs-Prerender: 1`, `X-Vercel-Cache: STALE`
- `/words/abandon`: `200 OK`, `X-Nextjs-Prerender: 1`, `X-Vercel-Cache: STALE`

This is consistent with the intended prerendered public-page setup.

## Failing Checks

### 1. Lint does not pass

- File: `components/motion/DecodingText.tsx:43`
- Issue: `react-hooks/set-state-in-effect`
- Symptom: `setDisplayed(text)` is called synchronously inside `useEffect`

- File: `components/words/WordsSearchShell.tsx:256`
- Issue: hooks dependency list is not a simple expression
- Symptom: `useMemo` depends on a computed `.map(...).join(",")` expression and is rejected by the React hooks lint rule

### 2. Test suite does not pass

- Command: `npm.cmd run test`
- Result: `1 failed | 43 passed`
- Failing test: `tests/dashboard-retention.test.ts`
- Failure shape:
  - expected first bucket date `2026-05-01`
  - actual first bucket date `2026-04-30`

This points to a date-bucketing mismatch in `buildRetentionGapSeries()` in `lib/dashboard.ts`, likely around local-time normalization vs UTC-derived day keys.

### 3. Local production build does not pass

- Command: `npm.cmd run build`
- Result: static generation aborts during page generation
- Failure: `Next.js build worker exited with code: 3221226505`

This is a real release risk for local reproducibility. It is not yet clear whether the failure is caused by Windows-only worker instability, a data-dependent route issue, or a recent code regression.

## Additional Signals

- Old local dev logs contain one `EADDRINUSE` on `127.0.0.1:3000`
- Another old dev error shows `PGRST205` (`public.words` missing from schema cache), which suggests at least one earlier session ran before the expected database schema was available
- Recent dev request logs show the app serving pages successfully, including `/`, `/words`, `/dashboard`, `/review`, and API routes

## Current Health Assessment

The project is not release-clean locally because lint, tests, and local build are all failing. At the same time, the deployed production surface is currently alive, recent production deployments are mostly succeeding, and the public routes still return prerender headers as expected.

In practical terms:

- Codebase health: degraded
- Deployment linkage: healthy
- Production availability: healthy
- Ship confidence for a new local change: low until lint/test/build are repaired

## Recommended Next Fix Order

1. Fix the two lint failures in `DecodingText.tsx` and `WordsSearchShell.tsx`
2. Repair the retention gap date-bucketing bug and get `npm.cmd run test` green
3. Reproduce the build-worker crash with tighter diagnostics and make `npm.cmd run build` pass on this machine
