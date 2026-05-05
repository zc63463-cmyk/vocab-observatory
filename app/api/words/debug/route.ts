import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseClientOrNull } from "@/lib/supabase/public";
import { canRunImport, jsonError } from "@/lib/request-auth";

// Diagnostic endpoint mirroring the three flat queries that the public /words
// page depends on, but bypassing every unstable_cache wrapper so we can tell
// whether a bug is in the cache, the query, or the data. Auth-gated to the
// import secret to avoid exposing internals.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authorization = await canRunImport(request);
  if (!authorization.authorized) {
    return jsonError(authorization.reason, authorization.status);
  }

  const supabase = getPublicSupabaseClientOrNull();
  if (!supabase) {
    return jsonError("Supabase public client not configured.", 503);
  }

  const semanticParam =
    request.nextUrl.searchParams.get("semantic")?.trim() ?? "";
  const freqParam = request.nextUrl.searchParams.get("freq")?.trim() ?? "";

  // 1) Global count of public+active rows — what the homepage shows.
  const totalQuery = await supabase
    .from("words")
    .select("id", { count: "exact" })
    .eq("is_published", true)
    .eq("is_deleted", false)
    .limit(1);

  // 2) First 5 rows ordered by lemma, no filters — the default /words list.
  const firstFiveQuery = await supabase
    .from("words")
    .select("id, slug, lemma, metadata")
    .eq("is_published", true)
    .eq("is_deleted", false)
    .order("lemma")
    .range(0, 4);

  // 3) word_filter_facets contents — the dropdown options.
  const facetsQuery = await supabase
    .from("word_filter_facets")
    .select("dimension, value, count")
    .gt("count", 0)
    .order("dimension")
    .order("value");

  // 4) Optional: try a semantic_field filter and report match count + first 3.
  type FilteredAttempt = {
    error: string | null;
    matched: number;
    rows: Array<{ lemma: string; metadata: unknown }>;
  } | null;
  let filteredAttempt: FilteredAttempt = null;
  if (semanticParam || freqParam) {
    let q = supabase
      .from("words")
      .select("lemma, metadata", { count: "exact" })
      .eq("is_published", true)
      .eq("is_deleted", false)
      .range(0, 2);
    if (semanticParam) {
      q = q.contains("metadata", { semantic_field: semanticParam });
    }
    if (freqParam) {
      q = q.contains("metadata", { word_freq: freqParam });
    }
    const { data, count, error } = await q;
    filteredAttempt = {
      error: error?.message ?? null,
      matched: count ?? 0,
      rows: (data ?? []).map((row) => ({
        lemma: String(row.lemma),
        metadata: row.metadata,
      })),
    };
  }

  return NextResponse.json({
    deployedAt: new Date().toISOString(),
    facets: {
      error: facetsQuery.error?.message ?? null,
      sample: (facetsQuery.data ?? []).slice(0, 20),
      total: facetsQuery.data?.length ?? 0,
    },
    filteredAttempt,
    firstFive: {
      error: firstFiveQuery.error?.message ?? null,
      rows: (firstFiveQuery.data ?? []).map((row) => ({
        lemma: row.lemma,
        metadata_semantic_field: (row.metadata as { semantic_field?: unknown })
          ?.semantic_field,
        metadata_word_freq: (row.metadata as { word_freq?: unknown })
          ?.word_freq,
        slug: row.slug,
      })),
    },
    inputs: {
      freq: freqParam,
      semantic: semanticParam,
    },
    total: {
      count: totalQuery.count,
      error: totalQuery.error?.message ?? null,
    },
  });
}
