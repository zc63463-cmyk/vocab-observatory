import { NextResponse, type NextRequest } from "next/server";
import { getPublicWordBySlug } from "@/lib/words";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const result = await getPublicWordBySlug(slug);

  if (result.configured && !result.word) {
    return NextResponse.json({ error: "Word not found." }, { status: 404 });
  }

  return NextResponse.json(result);
}
