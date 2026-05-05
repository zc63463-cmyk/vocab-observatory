import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { canRunImport, jsonError } from "@/lib/request-auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

// Read-only diagnostic endpoint. Auth-gated identically to the import route so
// it can be hit from the browser by the operator. Returns a per-prefix
// breakdown of `words` rows along with the global is_published/is_deleted
// counts that drive the public landing/index pages — useful when the public
// homepage shows a count that disagrees with the importer's `unchanged`
// totals (almost always a stale ISR cache vs an actual DB regression).
export const maxDuration = 30;

async function countWhere(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  build: (
    query: ReturnType<ReturnType<typeof createAdminSupabaseClient>["from"]>,
  ) => unknown,
) {
  // The Supabase JS builder narrows after each chained call, so we type the
  // input loosely and rely on the caller's usage of the same chain that the
  // public read paths use. We always request `count: exact` with no rows
  // returned (`limit(0)` would be ideal but PostgREST requires `range`).
  const initial = admin.from("words").select("id", { count: "exact", head: true });
  const finalQuery = build(initial as never) as {
    then: (
      onfulfilled?: (value: {
        count: number | null;
        error: { message: string } | null;
      }) => unknown,
    ) => Promise<{ count: number | null; error: { message: string } | null }>;
  };
  const { count, error } = await finalQuery;
  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

async function runSnapshot(request: NextRequest) {
  const authorization = await canRunImport(request);
  if (!authorization.authorized) {
    return jsonError(authorization.reason, authorization.status);
  }

  const admin = createAdminSupabaseClient();

  const totalAll = await countWhere(admin, (q) => q);
  const totalPublic = await countWhere(admin, (q) =>
    (q as { eq: (col: string, val: unknown) => unknown })
      .eq("is_published", true),
  );
  const totalActive = await countWhere(admin, (q) =>
    ((q as { eq: (col: string, val: unknown) => unknown })
      .eq("is_published", true) as { eq: (col: string, val: unknown) => unknown })
      .eq("is_deleted", false),
  );
  const totalDeleted = await countWhere(admin, (q) =>
    (q as { eq: (col: string, val: unknown) => unknown })
      .eq("is_deleted", true),
  );

  const perPrefix: Array<{
    prefix: string;
    rows: number;
    active: number;
    deleted: number;
  }> = [];
  for (const prefix of env.wordsPrefixes) {
    const rows = await countWhere(admin, (q) =>
      (q as { like: (col: string, val: string) => unknown })
        .like("source_path", `${prefix}/%`),
    );
    const active = await countWhere(admin, (q) => {
      const a = (q as { like: (col: string, val: string) => unknown }).like(
        "source_path",
        `${prefix}/%`,
      ) as { eq: (col: string, val: unknown) => unknown };
      return (
        a.eq("is_published", true) as { eq: (col: string, val: unknown) => unknown }
      ).eq("is_deleted", false);
    });
    const deleted = await countWhere(admin, (q) => {
      const a = (q as { like: (col: string, val: string) => unknown }).like(
        "source_path",
        `${prefix}/%`,
      ) as { eq: (col: string, val: unknown) => unknown };
      return a.eq("is_deleted", true);
    });
    perPrefix.push({ active, deleted, prefix, rows });
  }

  return NextResponse.json({
    ok: true,
    perPrefix,
    totals: {
      all: totalAll,
      deleted: totalDeleted,
      publicActive: totalActive,
      publicAll: totalPublic,
    },
  });
}

export async function GET(request: NextRequest) {
  return runSnapshot(request);
}
