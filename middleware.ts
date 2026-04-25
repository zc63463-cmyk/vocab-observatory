import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isOwnerEmail } from "@/lib/auth";
import { hasSupabasePublicEnv } from "@/lib/env";
import { updateSession } from "@/lib/supabase/middleware";

const protectedPrefixes = ["/review", "/dashboard", "/notes"];

export async function middleware(request: NextRequest) {
  if (!hasSupabasePublicEnv()) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !isOwnerEmail(user?.email)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (pathname === "/auth/login" && isOwnerEmail(user?.email)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/auth/login", "/dashboard/:path*", "/review/:path*", "/notes/:path*"],
};
