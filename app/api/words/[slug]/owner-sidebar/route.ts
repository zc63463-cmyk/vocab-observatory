import { NextResponse, type NextRequest } from "next/server";
import { getOwnerWordSidebarData } from "@/lib/owner-word-sidebar";
import { requireOwnerApiSession } from "@/lib/request-auth";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const { slug: wordId } = await context.params;

  return NextResponse.json(
    await getOwnerWordSidebarData(
      ownerSession.supabase!,
      ownerSession.user!.id,
      wordId,
    ),
  );
}
