# 批量加入复习功能审查报告

审查时间：2026-04-28

审查对象：`docs/batch-review-execution-review.md` 所描述的本轮实现，包括词条列表页批量加入、词条详情页相关词批量加入、`/api/review/add-batch` 非破坏性语义，以及拓扑图收窄到近义词 / 反义词 / 同根词后的联动。

## 结论

本轮核心实现方向正确，`typecheck`、核心 Vitest、`build` 均通过；批量 API 已具备非破坏性插入语义，详情页也能避免提交 orphan node。

但审查发现 2 个需要优先处理的问题：

1. `/words` 列表页“全选加入”可能一次提交超过 API schema 的 100 个 ID 上限。
2. 当前仓库 `npm run lint` 仍失败，虽然失败点不在本轮批量复习文件内，但会阻断验收标准中的 lint 通过。

另有 2 个中低优先级 UX / 可访问性改进项，建议后续优化。

## Findings

### P2：列表页全选可能超过 add-batch 的 100 个 ID 上限

相关文件：

- `components/words/WordsSearchShell.tsx`
- `lib/validation/schemas.ts`

`WordsSearchShell` 的 `selectAllUntracked` 会把当前已加载的全部未追踪词条放入选择集：

```ts
setSelectedWordIds(new Set(untrackedWords.map((word) => word.id)));
```

提交时也会把全部 `visibleSelectedWordIds` 一次性发给 `/api/review/add-batch`：

```ts
body: JSON.stringify({ wordIds: [...visibleSelectedWordIds] }),
```

但 `batchAddToReviewSchema` 限制：

```ts
wordIds: z.array(z.string().uuid()).min(1).max(100),
```

当 owner 在 `/words` 连续“加载更多”后，当前可见未追踪词条可能超过 100 个。此时点击“全选加入 / 批量加入复习”会得到 400 校验失败，用户无法批量处理已加载列表。

建议修复方向：

- 前端限制一次最多选择 / 提交 100 个，并给出提示；或
- 前端按 100 个一组 chunk 调用 API；或
- 如果业务允许，调整 API 上限并评估数据库写入成本。

### P2：`npm run lint` 当前失败，验收标准未完全满足

相关文件：

- `components/omni/useOmniSearch.ts`

本轮执行：

```bash
npm run lint
```

结果失败：

```text
components/omni/useOmniSearch.ts
17:11 warning  'ApiPlazaNote' is defined but never used
47:7  error    react-hooks/set-state-in-effect
```

该问题看起来不属于本轮批量加入改动范围，但它会让“运行 `npm run lint` 通过”的验收项失败。后续合入前需要单独处理或确认基线策略。

建议修复方向：

- 移除未使用的 `ApiPlazaNote`。
- 将空 query 时的同步 `setState` 调整为派生状态、初始化状态策略，或异步/事件驱动更新，避免触发 React hooks lint。

### P3：详情页相关词批量入口无法预先区分“已在复习中”的候选词

相关文件：

- `components/words/OwnerWordSidebar.tsx`
- `app/(public)/words/[slug]/page.tsx`

详情页目前从 `graphData.nodes` 提取真实 `wordId` 并传给 owner 侧边栏。侧边栏只要存在候选 ID 就显示“加入相关词复习”按钮。

这能依赖 API 的非破坏性逻辑保证不会重置已有进度，但 UI 层无法预先知道这些相关词是否已经全部在复习中。因此可能出现“按钮显示，但点击后新增 0 个，只提示已有若干个”的体验。

建议修复方向：

- 继续保留当前 API 兜底；
- 后续可让 owner-sidebar API 一并返回相关词 progress 状态；
- 或在按钮文案上明确“处理相关词复习状态”，减少“必然新增”的预期。

### P3：列表卡片选择按钮移动端点击目标偏小

相关文件：

- `components/words/WordCard.tsx`

选择按钮当前为 `h-5 w-5`，约 20px。它已从整卡 Link 中拆出，能避免点击被导航吞掉，也有 `aria-pressed` 与 `aria-label`；但在移动端上点击目标偏小，容易误触卡片主体。

建议修复方向：

- 保持视觉 checkbox 为 20px；
- 外层按钮命中区扩大到 36px 或 40px；
- 增加明显的 `focus-visible` 样式。

## 验证记录

已通过：

```bash
npx vitest run tests/review-add-batch.test.ts tests/vocab-graph.test.ts
npm run typecheck
npm run build
```

结果摘要：

- Vitest：2 个测试文件通过，7 个用例通过。
- Typecheck：`next typegen && tsc --noEmit` 通过。
- Build：Next.js 16.2.4 production build 通过。

未通过：

```bash
npm run lint
```

失败原因见 Finding P2：`components/omni/useOmniSearch.ts` 中已有 lint error。

## 正向确认

- `/api/review/add-batch` 会先查当前用户已有 `user_word_progress`，只插入尚未追踪的词条。
- API 返回中包含 `ok`、`addedCount`、`notFound`、`alreadyTrackedCount`。
- `buildBatchReviewInsertPlan` 对重复 ID、notFound、已有进度跳过等行为已有纯函数测试。
- 详情页相关词 ID 来自 `VocabGraphNode.wordId`，orphan node 没有 `wordId`，不会进入批量提交。
- `buildLocalVocabGraph` 当前已收窄为 `root-family`、`synonym`、`antonym`，未继续生成 semantic/backlink/related 边。
- `WordCard` 的选择控件已从卡片 Link 内拆出，结构上降低了“点击选择导致导航”的风险。

## 后续建议

优先级建议：

1. 修复 `/words` 批量提交超过 100 个 ID 的边界问题。
2. 清理 `components/omni/useOmniSearch.ts` lint error，让 `npm run lint` 回到可验收状态。
3. 为 `/words` 增加浏览器交互测试，覆盖“点击选择控件不跳转”和“批量加入后刷新列表”。
4. 为 `/api/review/add-batch` 增加 route-level mock 测试，确认已存在进度不会被覆盖。
5. 优化详情页相关词批量按钮的文案或候选状态展示。
