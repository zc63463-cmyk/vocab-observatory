import { describe, expect, it } from "vitest";
import type { PublicCollectionNoteSummary } from "@/lib/collection-notes";
import {
  createCollectionNotePath,
  getCollectionNoteSlugLookupValues,
} from "@/lib/collection-notes";
import {
  filterCollectionNotes,
  findCompatibleCollectionNote,
  normalizePlazaFilters,
} from "@/lib/plaza";

const notes: PublicCollectionNoteSummary[] = [
  {
    id: "1",
    kind: "root_affix",
    metadata: {
      coreMeaning: "离开、脱离",
    },
    related_word_slugs: ["abandon", "abstract"],
    slug: "root-ab-abs-离开",
    summary: "表示离开、脱离。",
    tags: ["学习/英语/词汇/词根词缀"],
    title: "ab-/abs-（离开）",
    updated_at: "2026-04-25T00:00:00.000Z",
  },
  {
    id: "2",
    kind: "semantic_field",
    metadata: {
      definition: "表示人体动作、姿态变化以及肢体行为的词汇集合。",
    },
    related_word_slugs: [],
    slug: "semantic-人体动作",
    summary: "和动作相关的词汇集合。",
    tags: ["学习/英语/词汇/语义场"],
    title: "人体动作",
    updated_at: "2026-04-25T00:00:00.000Z",
  },
];

describe("plaza helpers", () => {
  it("matches legacy and encoded plaza slugs against canonical records", () => {
    expect(findCompatibleCollectionNote(notes, "root-ab-abs-离开")?.slug).toBe(
      "root-ab-abs-离开",
    );
    expect(findCompatibleCollectionNote(notes, "root-ab-/abs-（离开）")?.slug).toBe(
      "root-ab-abs-离开",
    );
    expect(
      findCompatibleCollectionNote(notes, encodeURIComponent("root-ab-abs-离开"))?.slug,
    ).toBe("root-ab-abs-离开");
  });

  it("builds encoded plaza paths and rich lookup values", () => {
    expect(createCollectionNotePath("root-ab-abs-离开")).toBe(
      "/plaza/root-ab-abs-%E7%A6%BB%E5%BC%80",
    );
    expect(getCollectionNoteSlugLookupValues("root-ab-/abs-（离开）")).toContain(
      "root-ab-abs-离开",
    );
  });

  it("filters plaza notes by q and kind", () => {
    expect(filterCollectionNotes(notes, { q: "离开", kind: "all" })).toHaveLength(1);
    expect(filterCollectionNotes(notes, { q: "人体动作", kind: "semantic_field" })).toHaveLength(
      1,
    );
    expect(filterCollectionNotes(notes, { q: "人体动作", kind: "root_affix" })).toHaveLength(0);
    expect(filterCollectionNotes(notes, { q: "词根词缀", kind: "all" })).toHaveLength(1);
  });

  it("normalizes unsupported plaza filters back to defaults", () => {
    expect(normalizePlazaFilters({ kind: "bad" as "all", q: "  test  " })).toEqual({
      kind: "all",
      q: "test",
    });
  });
});
