import { NextResponse, type NextRequest } from "next/server";
import { requireOwnerApiSession } from "@/lib/request-auth";
import { reviewSuspendSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  const parsed = reviewSuspendSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = ownerSession.supabase!;
  const { error } = await supabase
    .from("user_word_progress")
    .update({
      state: "suspended",
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.progressId)
    .eq("user_id", ownerSession.user!.id);

  if (error) {
    throw error;
  }

  return NextResponse.json({ ok: true });
}
