import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getServerSupabaseClientOrNull } from "@/lib/supabase/server";

export function isOwnerEmail(email: string | null | undefined) {
  return Boolean(email && env.ownerEmail && email.toLowerCase() === env.ownerEmail);
}

export async function getOwnerUser() {
  const supabase = await getServerSupabaseClientOrNull();
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isOwnerEmail(user?.email)) {
    return null;
  }

  return user;
}

export async function requireOwnerUser() {
  const user = await getOwnerUser();
  if (!user) {
    redirect("/auth/login");
  }

  return user;
}

export function requireOwnerEmailConfigured() {
  if (!env.ownerEmail) {
    throw new Error("OWNER_EMAIL is not configured.");
  }

  return env.ownerEmail;
}

export function serializeUser(user: User | null) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
  };
}
