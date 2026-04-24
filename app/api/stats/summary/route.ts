import { NextResponse } from "next/server";
import { getDashboardSummary } from "@/lib/dashboard";
import { requireOwnerApiSession } from "@/lib/request-auth";

export async function GET() {
  const ownerSession = await requireOwnerApiSession();
  if (ownerSession.response) {
    return ownerSession.response;
  }

  return NextResponse.json(await getDashboardSummary());
}
