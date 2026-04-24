import { NextResponse, type NextRequest } from "next/server";
import { getPublicWords } from "@/lib/words";

export async function GET(request: NextRequest) {
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
  });
  return NextResponse.json(result);
}
