import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWordMarkdown } from "@/lib/sync/parseMarkdown";

function fixture(name: string) {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

describe("parseWordMarkdown", () => {
  it("parses the ability fixture into a normalized word", () => {
    const word = parseWordMarkdown(fixture("ability.md"), "Wiki/L0_words/ability.md");

    expect(word.slug).toBe("ability");
    expect(word.lemma).toBe("ability");
    expect(word.ipa).toBeTruthy();
    expect(word.pos).toBe("n");
    expect(word.examples.length).toBeGreaterThanOrEqual(2);
    expect(word.shortDefinition).toBeTruthy();
  });

  it("extracts structured fields from the ability fixture", () => {
    const word = parseWordMarkdown(fixture("ability.md"), "Wiki/L0_words/ability.md");

    expect(word.coreDefinitions.length).toBeGreaterThan(0);
    expect(word.coreDefinitions[0]?.partOfSpeech.toLowerCase()).toContain("n");
    expect(word.coreDefinitions[0]?.senses.length).toBeGreaterThan(0);
    expect(word.prototypeText).toBeTruthy();
    expect(word.collocations.length).toBeGreaterThan(0);
    expect(word.corpusItems.length).toBeGreaterThan(0);
    expect(word.antonymItems.length).toBeGreaterThanOrEqual(0);
  });

  it("extracts multiple parts of speech and example groups", () => {
    const word = parseWordMarkdown(fixture("abandon.md"), "Wiki/L0_words/abandon.md");

    expect(word.pos).toBe("vt");
    expect(word.examples.some((entry) => entry.source === "collocation")).toBe(true);
    expect(word.examples.some((entry) => entry.source === "corpus")).toBe(true);
    expect(word.collocations.length).toBeGreaterThan(0);
    expect(word.corpusItems.length).toBeGreaterThan(0);
    expect(word.coreDefinitions.length).toBeGreaterThan(0);
  });

  it("keeps primary metadata for abstract", () => {
    const word = parseWordMarkdown(fixture("abstract.md"), "Wiki/L0_words/abstract.md");

    expect(word.metadata.semantic_field).toBeTruthy();
    expect(word.metadata.word_freq).toBeTruthy();
    expect(word.ipa).toBeTruthy();
  });

  it("parses synonym tables nested inside callouts", () => {
    const word = parseWordMarkdown(
      `---
title: "demo"
tags: []
---

# demo

## 核心释义

**v.** ①测试；②验证；

## 同义词辨析

> [!example]- 同义词辨析
> > **"增"标记**：强调程度更强
> >
> > | 词 | 核心语义差异 | 方式特点 | 常见对象 | 情感色彩 |
> > | --- | --- | --- | --- | --- |
> > | test | 基础测试 | 中性 | 系统 | 中性 |
> > | verify | 强调核验 | 更正式 | 数据 | 严谨 |
`,
      "Wiki/L0_words/demo.md",
    );

    expect(word.synonymItems).toHaveLength(2);
    expect(word.synonymItems[0]).toMatchObject({
      word: "test",
      semanticDiff: "基础测试",
      usage: "中性",
      object: "系统",
      tone: "中性",
      delta: "强调程度更强",
    });
    expect(word.warnings).toHaveLength(0);
  });
});
