import { NextResponse, type NextRequest } from "next/server";
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

  return NextResponse.json({
    ok: true,
    ...result,
  });
}

export async function GET(request: NextRequest) {
  return runImport(request);
}

export async function POST(request: NextRequest) {
  return runImport(request);
}
