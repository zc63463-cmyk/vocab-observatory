import { NextResponse, type NextRequest } from "next/server";
import { getPlazaOverview, type PlazaFilterKind } from "@/lib/plaza";

export async function GET(request: NextRequest) {
  const result = await getPlazaOverview({
    kind: (request.nextUrl.searchParams.get("kind") as PlazaFilterKind | null) ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
