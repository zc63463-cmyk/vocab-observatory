# 维护-操作指导（AI Agent 版）

## 1. System Contract

- Repo root: current workspace `vocab-app`
- Git remote: `origin -> https://github.com/zc63463-cmyk/vocab-observatory.git`
- Primary branch: `main`
- Production app: `https://vocab-observatory.vercel.app`
- Vercel project: `vocab-observatory`
- Content source repo: `zc63463-cmyk/Obsidian-Eg`
- Auth model: owner-only private layer
- Owner email comes from environment variable `OWNER_EMAIL`

## 2. Do / Don’t

### Do

- Treat Vercel production as the primary multi-device access path
- Keep `.env.local` out of git
- Run local validation before any release:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`
- Use `npm run sync:vault` for local import validation
- Use `/api/imports/github` for production import validation
- Check `/dashboard` after import-related changes

### Don’t

- Don’t commit secrets
- Don’t edit old migration intent retroactively; add a new migration instead
- Don’t assume production uses localhost callback URLs
- Don’t break owner-only gating on `/review`, `/dashboard`, `/notes`

## 3. Critical Environment Variables

Required in local and Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OWNER_EMAIL`
- `NEXT_PUBLIC_SITE_URL`
- `IMPORT_SECRET`
- `CRON_SECRET`
- `OBSIDIAN_REPO_OWNER`
- `OBSIDIAN_REPO_NAME`
- `OBSIDIAN_REPO_BRANCH`
- `OBSIDIAN_WORDS_PREFIX`

Production-specific expectation:

- `NEXT_PUBLIC_SITE_URL=https://vocab-observatory.vercel.app`

## 4. Supabase Contract

Expected migrations already exist:

- `0001_init.sql`
- `0002_rls.sql`
- `0003_import_tracking.sql`

Auth URL configuration must include:

- `Site URL=https://vocab-observatory.vercel.app`
- `https://vocab-observatory.vercel.app/auth/callback`

Import observability tables:

- `public.import_runs`
- `public.import_errors`

## 5. Release Procedure

### Local

```bash
git pull origin main
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

If content parsing or import logic changed:

```bash
npm run sync:vault
```

### Publish

```bash
git add -A
git commit -m "your message"
git push origin main
```

Expected outcome:

- Vercel auto-deploy triggers from `main`
- New production deployment appears in Vercel

## 6. Production Validation Checklist

After each deployment:

1. Open `/`
2. Open `/words`
3. Open one real word detail page, e.g. `/words/abandon`
4. Verify owner login still works
5. Verify `/dashboard`, `/review`, `/notes`

If import-related change:

1. Trigger production import

```bash
curl -X POST https://vocab-observatory.vercel.app/api/imports/github \
  -H "Authorization: Bearer <IMPORT_SECRET>"
```

2. Verify dashboard import panel shows:
   - latest run
   - counts
   - errors if any

   The import panel (`id="import-run"`) is inline on desktop (right
   side of the "Review Load + Import" row). On mobile it is gated
   behind the 9-dot pattern lock — draw the middle-row horizontal
   line (left-middle → centre → right-middle) to open the modal. See
   `components/dashboard/lab/sections.ts` for the canonical pattern
   → section mapping.

## 7. Import Maintenance Procedure

### Local import check

```bash
npm run sync:vault
```

Expected:

- JSON output with `created`, `updated`, `unchanged`, `errorCount`, `latestRunId`

### Production import check

```bash
curl -X POST https://vocab-observatory.vercel.app/api/imports/github \
  -H "Authorization: Bearer <IMPORT_SECRET>"
```

Then verify `/dashboard`.

### Failure handling

If import fails:

1. Inspect latest `import_runs`
2. Inspect latest `import_errors`
3. Check for malformed frontmatter in source markdown
4. Re-run local import to reproduce

Do not silently suppress production import failures without recording them in `import_errors`.

## 8. Auth Maintenance Procedure

If owner login breaks:

1. Check Vercel `OWNER_EMAIL`
2. Check Vercel `NEXT_PUBLIC_SITE_URL`
3. Check Supabase `URL Configuration`
4. Check SMTP / Resend config
5. Test `/auth/login` on production domain

Expected behavior:

- Unauthenticated access to `/review`, `/dashboard`, `/notes` redirects to `/auth/login?next=...`
- After successful login, user returns to original target page

## 9. Search / Review UX Contract

`GET /api/words` supports:

- `q`
- `semantic`
- `freq`
- `review=all|tracked|due|untracked`

Owner-only behavior:

- `review` filter is meaningful only for authenticated owner
- anonymous requests must degrade safely to public behavior

Word detail page must show:

- add/review status
- due state
- next review time
- review count

## 10. When GitHub Automation Needs Attention

Current intended flow:

- GitHub private repo connected to Vercel
- `git push origin main` triggers production deploy

If this breaks:

1. Check repo remote

```bash
git remote -v
```

2. Check branch

```bash
git branch --show-current
```

3. Check Vercel project linkage
4. Check latest deployment list in Vercel

## 11. Secret Handling

Never print or commit:

- Supabase service role key
- GitHub PAT
- Resend API key
- import secret
- cron secret

If any of these appeared in chat, screenshots, or terminal history, recommend rotation.

Priority order:

1. GitHub PAT
2. `SUPABASE_SERVICE_ROLE_KEY`
3. Resend SMTP/API key
4. `IMPORT_SECRET`
5. `CRON_SECRET`
