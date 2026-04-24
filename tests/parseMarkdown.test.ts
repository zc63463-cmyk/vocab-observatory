import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWordMarkdown } from "@/lib/sync/parseMarkdown";

function fixture(name: string) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

describe("parseWordMarkdown", () => {
  it("parses the ability fixture into a normalized word", () => {
    const word = parseWordMarkdown(fixture("ability.md"), "Wiki/L0_单词集合/ability.md");

    expect(word.slug).toBe("ability");
    expect(word.lemma).toBe("ability");
    expect(word.ipa).toContain("əˈbɪləti");
    expect(word.pos).toBe("n");
    expect(word.tags).toContain("语义场/能力特质");
    expect(word.examples).toHaveLength(3);
    expect(word.shortDefinition).toContain("能力，本领");
  });

  it("parses multiple parts of speech and examples", () => {
    const word = parseWordMarkdown(fixture("abandon.md"), "Wiki/L0_单词集合/abandon.md");

    expect(word.pos).toBe("vt");
    expect(word.shortDefinition).toContain("抛弃");
    expect(word.examples.some((entry) => entry.text.includes("弃船"))).toBe(true);
  });

  it("keeps primary metadata for abstract", () => {
    const word = parseWordMarkdown(fixture("abstract.md"), "Wiki/L0_单词集合/abstract.md");

    expect(word.metadata.semantic_field).toBe("抽象关系");
    expect(word.metadata.word_freq).toBe("高频");
    expect(word.ipa).toContain("ˈæbstrækt");
  });
});
