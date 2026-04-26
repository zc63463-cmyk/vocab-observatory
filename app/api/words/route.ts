import { NextResponse, type NextRequest } from "next/server";
import { getOwnerUser } from "@/lib/auth";
import { getServerSupabaseClientOrNull } from "@/lib/supabase/server";
import { getPublicWords } from "@/lib/words";

function parseIntegerSearchParam(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const [owner, ownerSupabase] = await Promise.all([
    getOwnerUser(),
    getServerSupabaseClientOrNull(),
  ]);
  const pagination = {
    limit: parseIntegerSearchParam(request.nextUrl.searchParams.get("limit")),
    offset: parseIntegerSearchParam(request.nextUrl.searchParams.get("offset")),
  };
  const result = await getPublicWords(
    {
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
    },
    owner && ownerSupabase
      ? {
          ownerSupabase,
          ownerUserId: owner.id,
          pagination,
        }
      : {
          pagination,
        },
  );

  const headers: Record<string, string> = {};

  if (!owner) {
    headers["Cache-Control"] = "public, s-maxage=300, stale-while-revalidate=600";
  }

  return NextResponse.json(result, { headers });
}
