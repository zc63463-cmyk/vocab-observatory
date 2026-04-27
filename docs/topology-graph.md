# 词条局部拓扑图

Vocab Observatory 的第一版拓扑图只在词条详情页生成局部图谱，不维护全局图谱索引。页面会以当前词条为中心，从当前词条 metadata、结构化同反义词、正文 Obsidian 双链和公开词条索引中生成一阶关系。

## 数据结构

```ts
type VocabGraphNode = {
  id: string;
  label: string;
  type: "current" | "root" | "synonym" | "antonym" | "semantic" | "backlink" | "related";
  href?: string;
  weight?: number;
};

type VocabGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: "root-family" | "synonym" | "antonym" | "semantic-field" | "backlink" | "related";
  label?: string;
  weight?: number;
};

type VocabGraphData = {
  centerId: string;
  nodes: VocabGraphNode[];
  edges: VocabGraphEdge[];
};
```

构建入口是 `buildLocalVocabGraph(entry, allEntries)`。它保证当前词条是 `current` 节点；同一个目标只生成一个节点，但可以有多条不同关系边。目标词条不存在时仍会显示 orphan 节点，只是不带 `href`。

## Relation 类型

- `root-family`：同根词或 root family。
- `synonym`：近义词，优先使用结构化 `synonym_items`，也兼容 frontmatter `synonyms`。
- `antonym`：反义词，优先使用结构化 `antonym_items`，也兼容 frontmatter `antonyms`。
- `semantic-field`：语义场。会显示当前 metadata 中的语义场标签，也会关联公开索引中同语义场的词条。
- `backlink`：Obsidian 双链或引用关系，来自 `backlinks` 等 metadata 字段和正文 `[[wiki links]]`。
- `related`：手动维护的泛相关词。

## 推荐 Frontmatter 字段

现有字段仍可继续使用；新增字段都写入 `metadata`，不会改变数据库列结构。推荐使用：

- `semanticFields`
- `synonyms`
- `antonyms`
- `roots`
- `backlinks`
- `related`

兼容别名包括 `semantic_field`、`semantic_fields`、`rootFamily`、`relatedWords`、`wikiLinks`、`references` 等。

## 示例

```yaml
---
word: resilient
semanticFields:
  - adversity
  - recovery
synonyms:
  - tenacious
  - robust
antonyms:
  - fragile
roots:
  - resilient
related:
  - antifragile
---
```

正文里的 `[[robust]]` 或 `[[robust|robustness]]` 也会被读取为引用关系。

## 后续扩展

- 全局图谱：可以在构建或同步阶段预计算所有词条的节点和边，写入单独的 graph cache，而不是每个详情页临时扫描公开索引。
- Collection notes：root/affix 和 semantic field collection 已经有 `related_word_slugs`，后续可把 collection notes 作为二级中心节点接入。
- Sigma.js：当节点数增长到数千级时，可把 SVG 组件替换为 Sigma.js/WebGL。`VocabGraphData` 可以保留为上层通用协议，只替换渲染器。
- 关系权重：后续可从复习频次、引用次数、同现次数或人工评分中生成 `weight`，用于节点大小和边强度。
