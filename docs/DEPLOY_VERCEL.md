# Vercel Deployment

## GitHub

1. Create a new private GitHub repository.
2. Push the current `vocab-app` directory to that repository.
3. Keep `.env.local` out of git. Sensitive values must stay in Vercel and Supabase only.

## Vercel Project

1. Import the GitHub repository into Vercel.
2. Keep the default `vercel.app` domain for the first release.
3. Copy all environment variables from local `.env.local`.
4. Override only:

```env
NEXT_PUBLIC_SITE_URL=https://<project>.vercel.app
```

## Required Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OWNER_EMAIL=
NEXT_PUBLIC_SITE_URL=
IMPORT_SECRET=
CRON_SECRET=
OBSIDIAN_REPO_OWNER=zc63463-cmyk
OBSIDIAN_REPO_NAME=Obsidian-Eg
OBSIDIAN_REPO_BRANCH=main
OBSIDIAN_WORDS_PREFIX=Wiki/L0_单词集合
```

## Supabase Auth

Update `Authentication -> URL Configuration`:

- `Site URL=https://<project>.vercel.app`
- Add redirect URL:

```text
https://<project>.vercel.app/auth/callback
```

## First Production Validation

1. Deploy successfully.
2. Trigger one manual production import:

```bash
curl -X POST https://<project>.vercel.app/api/imports/github \
  -H "Authorization: Bearer <IMPORT_SECRET>"
```

3. Open `/words` and verify public content loads.
4. Use owner email magic link login on the production domain.
5. Verify `/dashboard`, `/review`, `/notes`.
6. Verify the dashboard shows the latest import status.
