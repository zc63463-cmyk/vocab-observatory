import { NextResponse, type NextRequest } from "next/server";
import {
  derivePublicContentScope,
  revalidatePublicContent,
} from "@/lib/cache/public";
import { env } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { canRunImport, jsonError } from "@/lib/request-auth";
import { syncGitHubWords } from "@/lib/sync/upsertWord";

// Multi-prefix imports (L0_单词集合 + L0_基础词 + L0_超纲词 = ~5000 files)
// can exceed Vercel's proxy-level response window even when the underlying
// function runs within maxDuration, because the browser keeps the connection
// open waiting for a single JSON body. 300s matches the Pro-plan ceiling and
// helps the cron path; manual callers should prefer the `?prefix=` query
// param documented below to stay well inside the window.
export const maxDuration = 300;

// Resolves a caller-supplied prefix (full e.g. `Wiki/L0_超纲词`, or just the
// trailing segment `L0_超纲词`) against the configured whitelist. Returns the
// full prefix if matched, otherwise null. Keeping this strict prevents the
// endpoint from becoming an arbitrary-path scanner for the GitHub archive.
function matchConfiguredPrefix(requested: string): string | null {
  const needle = requested.trim();
  if (!needle) {
    return null;
  }
  const direct = env.wordsPrefixes.find((prefix) => prefix === needle);
  if (direct) {
    return direct;
  }
  return (
    env.wordsPrefixes.find((prefix) => prefix.endsWith(`/${needle}`)) ?? null
  );
}

async function runImport(request: NextRequest) {
  const authorization = await canRunImport(request);
  if (!authorization.authorized) {
    return jsonError(authorization.reason, authorization.status);
  }

  // Optional `?prefix=<name>` narrows this run to a single configured prefix.
  // Useful for batching a full-vault import across three sequential calls
  // when the combined payload would otherwise exceed Vercel's response
  // window. The daily cron omits the param and syncs everything.
  const prefixParam = request.nextUrl.searchParams.get("prefix");
  let prefixesOverride: string[] | undefined;
  if (prefixParam) {
    const matched = matchConfiguredPrefix(prefixParam);
    if (!matched) {
      return jsonError(
        `Unknown prefix "${prefixParam}". Configured: ${env.wordsPrefixes.join(", ")}`,
        400,
      );
    }
    prefixesOverride = [matched];
  }

  const admin = createAdminSupabaseClient();
  const result = await syncGitHubWords(admin, {
    prefixesOverride,
    triggerType: "api",
  });

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
    prefixes: prefixesOverride ?? env.wordsPrefixes,
    revalidatedTags,
  });
}

export async function GET(request: NextRequest) {
  return runImport(request);
}

export async function POST(request: NextRequest) {
  return runImport(request);
}
