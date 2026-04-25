import { NextResponse, type NextRequest } from "next/server";
import { getOwnerUser } from "@/lib/auth";
import { getServerSupabaseClientOrNull } from "@/lib/supabase/server";
import { getPublicWords } from "@/lib/words";

export async function GET(request: NextRequest) {
  const [owner, ownerSupabase] = await Promise.all([
    getOwnerUser(),
    getServerSupabaseClientOrNull(),
  ]);
  const result = await getPublicWords({
    freq: request.nextUrl.searchParams.get("freq") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
    review:
      (request.nextUrl.searchParams.get("review") as
        | "all"
        | "tracked"
        | "due"
        | "untracked"
        | null) ?? undefined,
    semantic: request.nextUrl.searchParams.get("semantic") ?? undefined,
  }, owner && ownerSupabase ? {
    ownerSupabase,
    ownerUserId: owner.id,
  } : undefined);

  const headers: Record<string, string> = {};

  if (!owner) {
    headers["Cache-Control"] = "public, s-maxage=300, stale-while-revalidate=600";
  }

  return NextResponse.json(result, { headers });
}
