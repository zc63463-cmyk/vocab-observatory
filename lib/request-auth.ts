import { NextResponse, type NextRequest } from "next/server";
import { isOwnerEmail } from "@/lib/auth";
import { env, hasSupabaseAdminEnv, hasSupabasePublicEnv } from "@/lib/env";
import { getServerSupabaseClientOrNull } from "@/lib/supabase/server";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireOwnerApiSession() {
  if (!hasSupabasePublicEnv()) {
    return {
      response: jsonError("Supabase is not configured.", 503),
      supabase: null,
      user: null,
    };
  }

  const supabase = await getServerSupabaseClientOrNull();
  const {
    data: { user },
  } = await supabase!.auth.getUser();

  if (!isOwnerEmail(user?.email)) {
    return {
      response: jsonError("Unauthorized.", 401),
      supabase,
      user: null,
    };
  }

  return {
    response: null,
    supabase,
    user,
  };
}

function extractBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export async function canRunImport(request: NextRequest) {
  if (!hasSupabaseAdminEnv()) {
    return {
      authorized: false,
      reason: "Supabase admin environment is not configured.",
      status: 503,
    };
  }

  const bearer = extractBearerToken(request);
  const headerSecret = request.headers.get("x-import-secret");
  const providedSecret = bearer ?? headerSecret;
  const secrets = [env.importSecret, env.cronSecret].filter(Boolean);

  if (providedSecret && secrets.includes(providedSecret)) {
    return {
      authorized: true,
      reason: "",
      status: 200,
    };
  }

  const ownerSession = await requireOwnerApiSession();
  if (!ownerSession.response) {
    return {
      authorized: true,
      reason: "",
      status: 200,
    };
  }

  return {
    authorized: false,
    reason: "Missing valid import credentials.",
    status: 401,
  };
}
