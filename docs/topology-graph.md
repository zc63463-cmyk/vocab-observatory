# 词条局部拓扑图

Vocab Observatory 的当前拓扑图只在词条详情页生成局部图谱，不维护全局图谱索引。MVP 仅展示三类词条关系：

- 同根词
- 近义词
- 反义词

语义场、Obsidian 双链和泛相关词可以继续作为词条正文或 metadata 信息存在，但当前拓扑图不会把它们渲染成节点或边。

## 数据结构

```ts
type VocabGraphNode = {
  id: string;
  label: string;
  type: "current" | "root" | "synonym" | "antonym";
  href?: string;
  weight?: number;
};

type VocabGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: "root-family" | "synonym" | "antonym";
  label?: string;
  weight?: number;
};

type VocabGraphData = {
  centerId: string;
  nodes: VocabGraphNode[];
  edges: VocabGraphEdge[];
};
```

构建入口是 `buildLocalVocabGraph(entry, allEntries)`。它保证当前词条是 `current` 节点；同一个目标只生成一个节点，但可以带多条不同关系边。目标词条不存在时仍会显示 orphan 节点，只是不带 `href`。

## Relation 类型

- `root-family`：同根词或 root family。来自 frontmatter `roots` 等字段，也会根据公开词条索引中共享 root 的词条补全同根节点。
- `synonym`：近义词。优先使用结构化 `synonym_items` / `resolved_synonym_items`，也兼容 frontmatter `synonyms`。
- `antonym`：反义词。优先使用结构化 `antonym_items` / `resolved_antonym_items`，也兼容 frontmatter `antonyms`。

## 推荐 Frontmatter 字段

现有字段仍可继续使用；新增字段会写入 `metadata`，不会改变数据库列结构。当前拓扑图推荐维护：

- `roots`
- `synonyms`
- `antonyms`

兼容别名包括 `root`、`rootFamily`、`root_family`、`wordRoots`、`synonymWords`、`synonym_words`、`antonymWords`、`antonym_words`。

## 示例

```yaml
---
word: resilient
synonyms:
  - tenacious
  - robust
antonyms:
  - fragile
roots:
  - resil
---
```

## 后续扩展

- 全局图谱：可以在构建或同步阶段预计算所有词条的节点和边，写入单独的 graph cache。
- 语义场/双链：如果后续重新放开关系类型，可以在 `buildLocalVocabGraph` 中恢复 `semantic-field`、`backlink`、`related` 候选生成。
- Sigma.js：当节点数增长到数千级时，可把 SVG 组件替换为 Sigma.js/WebGL。`VocabGraphData` 可以保留为上层通用协议，只替换渲染器。
- 关系权重：后续可从复习频次、引用次数、同现次数或人工评分中生成 `weight`，用于节点大小和边强度。
