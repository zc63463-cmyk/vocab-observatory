import { NextResponse, type NextRequest } from "next/server";
import {
  derivePublicContentScope,
  revalidatePublicContent,
} from "@/lib/cache/public";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { canRunImport, jsonError } from "@/lib/request-auth";
import { syncGitHubWords } from "@/lib/sync/upsertWord";

// Multi-prefix imports (L0_单词集合 + L0_基础词 + L0_超纲词 = ~5000 files)
// take several minutes end-to-end. Vercel's default 10s/60s function caps
// trip well before that, surfacing as a generic HTTP 500 to the caller and
// leaving the run half-finished. 300s matches the Pro-plan ceiling and gives
// headroom for the full-vault upsert path; the cron worker uses the same
// route so this also keeps daily sync stable as the corpus grows.
export const maxDuration = 300;

async function runImport(request: NextRequest) {
  const authorization = await canRunImport(request);
  if (!authorization.authorized) {
    return jsonError(authorization.reason, authorization.status);
  }

  const admin = createAdminSupabaseClient();
  const result = await syncGitHubWords(admin, { triggerType: "api" });

  // Only invalidate the ISR tags whose underlying content actually changed.
  // A cron run where every file matched the stored content_hash returns a
  // scope of `null`, letting the existing cache continue to serve visitors —
  // this prevents the daily cron from triggering a full cold-start of every
  // public page (and the Supabase fan-out that comes with it).
  const scope = derivePublicContentScope(result);
  const revalidatedTags = scope ? revalidatePublicContent(scope) : [];

  return NextResponse.json({
    ok: true,
    ...result,
    revalidatedTags,
  });
}

export async function GET(request: NextRequest) {
  return runImport(request);
}

export async function POST(request: NextRequest) {
  return runImport(request);
}
