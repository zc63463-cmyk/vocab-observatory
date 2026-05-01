import { NextResponse, type NextRequest } from "next/server";
import {
  derivePublicContentScope,
  revalidatePublicContent,
} from "@/lib/cache/public";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { canRunImport, jsonError } from "@/lib/request-auth";
import { syncGitHubWords } from "@/lib/sync/upsertWord";

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
