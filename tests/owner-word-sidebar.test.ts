import { describe, expect, it, vi } from "vitest";
import { getOwnerWordSidebarData } from "@/lib/owner-word-sidebar";

interface MaybeSingleResult {
  data: unknown;
  error: { code?: string; message?: string } | null;
}

interface ListResult {
  data: unknown[] | null;
  error: { code?: string; message?: string } | null;
}

interface TableResponses {
  user_word_progress?: MaybeSingleResult;
  notes?: MaybeSingleResult;
  note_revisions?: ListResult;
  review_logs?: ListResult;
}

interface ChainCallLog {
  table: string;
  select?: string;
  eq: Array<[string, unknown]>;
  order?: { column: string; ascending: boolean };
  limit?: number;
}

interface MockHandle {
  client: { from: (table: string) => unknown };
  callsByTable: Record<string, ChainCallLog>;
}

/**
 * Builds a Supabase-like fluent mock that:
 * - records every chain method invocation per table for assertions
 * - intentionally differentiates terminal shape so misuse fails loudly:
 *     * single-row chains expose `.maybeSingle()` only (no thenable)
 *     * list chains expose thenable only (no `.maybeSingle()`)
 *   This catches regressions like "forgot maybeSingle on a single-row query"
 *   or "called maybeSingle on a list query" — both would silently work with
 *   a unified mock that exposes both terminals.
 */
function createMockSupabase(responses: TableResponses): MockHandle {
  const callsByTable: Record<string, ChainCallLog> = {};

  function makeChain(table: string, terminal: MaybeSingleResult | ListResult, isList: boolean) {
    const log: ChainCallLog = { eq: [], table };
    callsByTable[table] = log;

    const chain: Record<string, unknown> = {};
    chain.select = vi.fn((columns: string) => {
      log.select = columns;
      return chain;
    });
    chain.eq = vi.fn((column: string, value: unknown) => {
      log.eq.push([column, value]);
      return chain;
    });

    if (isList) {
      chain.order = vi.fn((column: string, opts: { ascending: boolean }) => {
        log.order = { column, ascending: opts.ascending };
        return chain;
      });
      chain.limit = vi.fn((n: number) => {
        log.limit = n;
        return chain;
      });
      chain.then = (
        onFulfilled?: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(terminal).then(onFulfilled, onRejected);
    } else {
      chain.maybeSingle = vi.fn(async () => terminal);
    }

    return chain;
  }

  const client = {
    from: vi.fn((table: string) => {
      switch (table) {
        case "user_word_progress":
          return makeChain(
            table,
            responses.user_word_progress ?? { data: null, error: null },
            false,
          );
        case "notes":
          return makeChain(
            table,
            responses.notes ?? { data: null, error: null },
            false,
          );
        case "note_revisions":
          return makeChain(
            table,
            responses.note_revisions ?? { data: [], error: null },
            true,
          );
        case "review_logs":
          return makeChain(
            table,
            responses.review_logs ?? { data: [], error: null },
            true,
          );
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    }),
  };

  return { client, callsByTable };
}

describe("getOwnerWordSidebarData", () => {
  it("queries the four expected tables in parallel", async () => {
    const mock = createMockSupabase({});
    await getOwnerWordSidebarData(
      mock.client as Parameters<typeof getOwnerWordSidebarData>[0],
      "user-1",
      "word-1",
    );
    expect(Object.keys(mock.callsByTable).sort()).toEqual([
      "note_revisions",
      "notes",
      "review_logs",
      "user_word_progress",
    ]);
  });

  it("filters review_logs by user_id, word_id, and undone=false", async () => {
    const mock = createMockSupabase({});
    await getOwnerWordSidebarData(
      mock.client as Parameters<typeof getOwnerWordSidebarData>[0],
      "user-42",
      "word-99",
    );
    expect(mock.callsByTable.review_logs.eq).toEqual([
      ["user_id", "user-42"],
      ["word_id", "word-99"],
      ["undone", false],
    ]);
  });

  it("orders review_logs ascending by reviewed_at and limits to 60 entries", async () => {
    const mock = createMockSupabase({});
    await getOwnerWordSidebarData(
      mock.client as Parameters<typeof getOwnerWordSidebarData>[0],
      "u",
      "w",
    );
    expect(mock.callsByTable.review_logs.order).toEqual({
      column: "reviewed_at",
      ascending: true,
    });
    expect(mock.callsByTable.review_logs.limit).toBe(60);
  });

  it("selects the FSRS columns needed for the timeline analytics", async () => {
    const mock = createMockSupabase({});
    await getOwnerWordSidebarData(
      mock.client as Parameters<typeof getOwnerWordSidebarData>[0],
      "u",
      "w",
    );
    const cols = mock.callsByTable.review_logs.select ?? "";
    for (const required of [
      "rating",
      "reviewed_at",
      "scheduled_days",
      "elapsed_days",
      "stability",
      "difficulty",
      "state",
    ]) {
      expect(cols).toContain(required);
    }
  });

  it("returns reviewLogs as the array from the supabase result", async () => {
    const sampleLogs = [
      {
        difficulty: 5,
        elapsed_days: 0,
        rating: "good",
        reviewed_at: "2026-04-01T00:00:00.000Z",
        scheduled_days: 1,
        stability: 1.5,
        state: "review",
      },
      {
        difficulty: 5.2,
        elapsed_days: 1,
        rating: "easy",
        reviewed_at: "2026-04-02T00:00:00.000Z",
        scheduled_days: 4,
        stability: 4.1,
        state: "review",
      },
    ];
    const mock = createMockSupabase({
      review_logs: { data: sampleLogs, error: null },
    });
    const result = await getOwnerWordSidebarData(
      mock.client as Parameters<typeof getOwnerWordSidebarData>[0],
      "u",
      "w",
    );
    expect(result.reviewLogs).toEqual(sampleLogs);
  });

  it("returns reviewLogs as empty array when supabase returns null data", async () => {
    const mock = createMockSupabase({
      review_logs: { data: null, error: null },
    });
    const result = await getOwnerWordSidebarData(
      mock.client as Parameters<typeof getOwnerWordSidebarData>[0],
      "u",
      "w",
    );
    expect(result.reviewLogs).toEqual([]);
  });

  it("throws when review_logs query errors", async () => {
    const mock = createMockSupabase({
      review_logs: {
        data: null,
        error: { code: "500", message: "internal" },
      },
    });
    await expect(
      getOwnerWordSidebarData(
        mock.client as Parameters<typeof getOwnerWordSidebarData>[0],
        "u",
        "w",
      ),
    ).rejects.toMatchObject({ code: "500" });
  });

  it("returns history=[] when note_revisions table is missing (PGRST205)", async () => {
    const mock = createMockSupabase({
      note_revisions: {
        data: null,
        error: {
          code: "PGRST205",
          message: "Could not find the table 'public.note_revisions'",
        },
      },
    });
    const result = await getOwnerWordSidebarData(
      mock.client as Parameters<typeof getOwnerWordSidebarData>[0],
      "u",
      "w",
    );
    expect(result.history).toEqual([]);
  });

  it("returns history=[] when note_revisions table is missing (42P01)", async () => {
    const mock = createMockSupabase({
      note_revisions: {
        data: null,
        error: { code: "42P01", message: "relation does not exist" },
      },
    });
    const result = await getOwnerWordSidebarData(
      mock.client as Parameters<typeof getOwnerWordSidebarData>[0],
      "u",
      "w",
    );
    expect(result.history).toEqual([]);
  });

  it("throws when note_revisions returns a non-relation error", async () => {
    const mock = createMockSupabase({
      note_revisions: {
        data: null,
        error: { code: "500", message: "internal" },
      },
    });
    await expect(
      getOwnerWordSidebarData(
        mock.client as Parameters<typeof getOwnerWordSidebarData>[0],
        "u",
        "w",
      ),
    ).rejects.toMatchObject({ code: "500" });
  });

  it("returns null progress when user has no row in user_word_progress", async () => {
    const mock = createMockSupabase({
      user_word_progress: { data: null, error: null },
    });
    const result = await getOwnerWordSidebarData(
      mock.client as Parameters<typeof getOwnerWordSidebarData>[0],
      "u",
      "w",
    );
    expect(result.progress).toBeNull();
  });

  it("returns serialized progress when row exists", async () => {
    const futureDue = new Date(Date.now() + 86_400_000).toISOString();
    const mock = createMockSupabase({
      user_word_progress: {
        data: {
          id: "prog-1",
          due_at: futureDue,
          last_reviewed_at: null,
          review_count: 3,
          state: "review",
        },
        error: null,
      },
    });
    const result = await getOwnerWordSidebarData(
      mock.client as Parameters<typeof getOwnerWordSidebarData>[0],
      "u",
      "w",
    );
    expect(result.progress).not.toBeNull();
    expect(result.progress!.id).toBe("prog-1");
    expect(result.progress!.review_count).toBe(3);
  });

  it("returns empty note when there is no row in notes", async () => {
    const mock = createMockSupabase({
      notes: { data: null, error: null },
    });
    const result = await getOwnerWordSidebarData(
      mock.client as Parameters<typeof getOwnerWordSidebarData>[0],
      "u",
      "w",
    );
    expect(result.note).toEqual({
      contentMd: "",
      updatedAt: null,
      version: 0,
    });
  });
});
