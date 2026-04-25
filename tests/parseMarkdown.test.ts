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

  it("parses unbolded parts of speech in core definitions", () => {
    const word = parseWordMarkdown(
      `---
title: "acquire"
tags: []
---

# acquire

## 核心释义

v. ①==**获得；取得**==；②学到；养成；
n. ①习得；②获得物；

> [!tip] 原型义
> **原型义**：通过努力获得某物
`,
      "Wiki/L0_words/acquire.md",
    );

    expect(word.pos).toBe("v");
    expect(word.coreDefinitions).toEqual([
      {
        partOfSpeech: "v",
        senses: ["获得；取得", "学到；养成"],
      },
      {
        partOfSpeech: "n",
        senses: ["习得", "获得物"],
      },
    ]);
    expect(word.warnings).toHaveLength(0);
  });

  it("cleans corpus text and preserves gloss plus trailing note", () => {
    const word = parseWordMarkdown(
      `---
title: "ability"
tags: []
---

# ability

## 核心释义

**n.** ①能力；

## 真题/语料关联

> [!example]- 语料
> - "the ability to communicate effectively"（有效沟通的能力）——考研写作和阅读中极高频搭配
`,
      "Wiki/L0_words/ability.md",
    );

    expect(word.corpusItems).toEqual([
      {
        text: "the ability to communicate effectively",
        note: "有效沟通的能力；考研写作和阅读中极高频搭配",
      },
    ]);
  });

  it("keeps antonym notes intact when the note itself contains colons", () => {
    const word = parseWordMarkdown(
      `---
title: "ability"
tags: []
---

# ability

## 核心释义

**n.** ①能力；

## 反义词

> [!note]- 反义词
> - [[inability]]：无能，无力（ability 的精确反义：有能力↔无能力）
`,
      "Wiki/L0_words/ability.md",
    );

    expect(word.antonymItems).toEqual([
      {
        word: "inability",
        note: "无能，无力（ability 的精确反义：有能力↔无能力）",
      },
    ]);
  });

  it("parses combined parts of speech such as v./n. and n./num.", () => {
    const word = parseWordMarkdown(
      `---
title: "forecast"
tags: []
---

# forecast

## 核心释义

**v./n.** ①==**预测，预报**==；②预示；
**n./num.** ①==**十亿**==；②（英式旧用法）万亿；
`,
      "Wiki/L0_words/forecast.md",
    );

    expect(word.pos).toBe("v./n");
    expect(word.coreDefinitions).toEqual([
      {
        partOfSpeech: "v./n",
        senses: ["预测，预报", "预示"],
      },
      {
        partOfSpeech: "n./num",
        senses: ["十亿", "（英式旧用法）万亿"],
      },
    ]);
  });
});
