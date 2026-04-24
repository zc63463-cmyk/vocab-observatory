import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planWordSync } from "@/lib/sync/import-plan";
import { parseWordMarkdown } from "@/lib/sync/parseMarkdown";

function parseFixture(name: string) {
  const content = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  return parseWordMarkdown(content, `Wiki/L0_单词集合/${name}`);
}

describe("planWordSync", () => {
  it("treats identical imports as unchanged", () => {
    const ability = parseFixture("ability.md");
    const plan = planWordSync(
      [
        {
          content_hash: ability.contentHash,
          is_deleted: false,
          slug: ability.slug,
          source_path: ability.sourcePath,
        },
      ],
      [ability],
    );

    expect(plan.create).toHaveLength(0);
    expect(plan.update).toHaveLength(0);
    expect(plan.unchanged).toHaveLength(1);
    expect(plan.softDelete).toHaveLength(0);
  });

  it("marks changed content as update and missing files as soft delete", () => {
    const abandon = parseFixture("abandon.md");
    const abstract = parseFixture("abstract.md");
    const changedAbandon = {
      ...abandon,
      contentHash: `${abandon.contentHash.slice(0, 63)}0`,
    };

    const plan = planWordSync(
      [
        {
          content_hash: "older",
          is_deleted: false,
          slug: abandon.slug,
          source_path: abandon.sourcePath,
        },
        {
          content_hash: abstract.contentHash,
          is_deleted: false,
          slug: abstract.slug,
          source_path: abstract.sourcePath,
        },
      ],
      [changedAbandon],
    );

    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].slug).toBe("abandon");
    expect(plan.softDelete).toHaveLength(1);
    expect(plan.softDelete[0].slug).toBe("abstract");
  });
});
