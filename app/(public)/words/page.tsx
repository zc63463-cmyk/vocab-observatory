import type { Metadata } from "next";
import { WordsSearchShell } from "@/components/words/WordsSearchShell";
import { getOwnerUser } from "@/lib/auth";
import { getServerSupabaseClientOrNull } from "@/lib/supabase/server";
import { getPublicWords } from "@/lib/words";

// Page is intentionally dynamic so signed-in owners get their per-account
// progress overlay (batch-add UI, review-state filter) on the same URL the
// public list lives at. Heavy DB queries inside getPublicWords() are still
// wrapped in unstable_cache (see getCachedDefaultPublicWordRows etc.), so
// anonymous visitors still hit the cached path; the only added cost per
// request is React render + a cookie read.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "搜索和浏览公开词条库，涵盖释义、搭配、语料、同反义词等结构化信息。",
  openGraph: {
    description: "搜索和浏览公开词条库，涵盖释义、搭配、语料、同反义词等结构化信息。",
    title: "公开词条库 - 词汇知识库",
  },
  title: "公开词条库 - 词汇知识库",
};

export default async function WordsPage() {
  const owner = await getOwnerUser();
  const ownerSupabase = owner ? await getServerSupabaseClientOrNull() : null;
  const result = await getPublicWords(
    undefined,
    owner && ownerSupabase
      ? { ownerSupabase, ownerUserId: owner.id }
      : undefined,
  );

  return <WordsSearchShell initialResult={result} />;
}
