import { describe, expect, it } from "vitest";
import {
  detectCollectionNoteKind,
  shouldSkipCollectionNote,
} from "@/lib/collection-notes";
import { parseCollectionNoteMarkdown } from "@/lib/sync/parseCollectionNote";

describe("parseCollectionNoteMarkdown", () => {
  it("parses root-affix notes and only keeps derived-word links as related words", () => {
    const note = parseCollectionNoteMarkdown(
      `---
title: "vis-vid"
tags:
  - 学习/英语/词汇/词根词缀
---

# vis-vid

**类型**：词根
**核心含义**：看，观察
**来源**：拉丁语

## 派生词族

- [[visible]]：看得见的
- [[vision]]：视觉

## 相关词根

- [[spect]]：表示“看”
`,
      "Wiki/词根词缀/vis-vid.md",
      "root_affix",
    );

    expect(note.slug).toBe("root-vis-vid");
    expect(note.summary).toBe("看，观察");
    expect(note.relatedWordSlugs).toEqual(["visible", "vision"]);
    expect(note.metadata).toMatchObject({
      coreMeaning: "看，观察",
      kind_label: "词根词缀",
      origin: "拉丁语",
      rootType: "词根",
    });
  });

  it("parses semantic-field notes from callout definitions", () => {
    const note = parseCollectionNoteMarkdown(
      `---
date: 2025-01-01
---

# 人体动作

> [!info] 语义场定义
> 表示人体动作、姿态变化以及肢体行为的词汇集合。

## 词汇索引

\`\`\`dataview
TABLE file.name
\`\`\`
`,
      "Wiki/语义场/人体动作.md",
      "semantic_field",
    );

    expect(note.slug).toBe("semantic-人体动作");
    expect(note.relatedWordSlugs).toEqual([]);
    expect(note.summary).toContain("人体动作");
    expect(note.metadata).toMatchObject({
      definition: "表示人体动作、姿态变化以及肢体行为的词汇集合。",
      kind_label: "语义场",
    });
    expect(note.sourceUpdatedAt).toBe("2025-01-01T00:00:00.000Z");
  });

  it("detects collection-note directories and skips templates", () => {
    expect(detectCollectionNoteKind("Wiki/词根词缀/vis-vid.md")).toBe("root_affix");
    expect(detectCollectionNoteKind("Wiki/语义场/人体动作.md")).toBe("semantic_field");
    expect(shouldSkipCollectionNote("Wiki/词根词缀/_模板-词根笔记.md")).toBe(true);
    expect(shouldSkipCollectionNote("Wiki/语义场/人体动作.md")).toBe(false);
  });
});
