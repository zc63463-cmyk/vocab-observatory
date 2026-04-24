"use server";

import { redirect } from "next/navigation";
import { getServerSupabaseClientOrNull } from "@/lib/supabase/server";

export async function signOutAction() {
  const supabase = await getServerSupabaseClientOrNull();
  await supabase?.auth.signOut();
  redirect("/");
}
