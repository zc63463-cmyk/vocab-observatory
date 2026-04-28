# 本轮执行审查：批量加入复习恢复与拓扑相关词入口

更新时间：2026-04-28

本文档用于交给 GPT-5.5 或后续维护者复审本轮实现，重点覆盖“恢复批量加入复习功能”以及此前拓扑图范围收窄到“近义词 / 反义词 / 同根词”的联动影响。

## 1. 本轮目标

恢复并加固两处批量加入复习入口：

- 词条列表页 `/words`：支持 owner 对未加入复习的词条进行单选、多选、全选后批量加入复习。
- 词条详情页：从当前局部拓扑图中提取近义词、反义词、同根词，将真实存在的相关词批量加入复习，不包含当前词条本身。

同时调整 `/api/review/add-batch` 为非破坏性接口：已经在 `user_word_progress` 中的词条不应被重置，也不应覆盖 `state`、`due_at`、`review_count` 或 scheduler payload。

## 2. 变更范围

主要涉及文件：

- `components/words/WordsSearchShell.tsx`
  - 恢复列表页批量选择状态和批量工具条。
  - 批量加入成功后刷新当前列表数据，而不是依赖整页 reload。
  - 仅对当前可见且未加入复习的词条显示选择能力。

- `components/words/WordCard.tsx`
  - 将选择控件从整卡 Link 内拆出，避免点击 checkbox/button 被卡片导航吞掉。
  - 选择控件作为卡片外层的独立交互区域，保留卡片主体跳转。

- `components/motion/WordCardShell.tsx`
  - 增加 `className` 支持，以便 `WordCard` 在不重构动画组件的前提下调整布局。

- `app/api/review/add-batch/route.ts`
  - 先查询目标词条是否存在。
  - 再查询当前用户已有的 `user_word_progress`。
  - 只为尚未加入复习的词条创建初始进度。
  - 返回 `ok`、`addedCount`、`notFound`，并新增 `alreadyTrackedCount`。

- `lib/review/batch-add.ts`
  - 新增纯函数辅助批量加入计划生成。
  - 测试重点落在去重、notFound、已有进度跳过、初始进度 rows 构建。

- `tests/review-add-batch.test.ts`
  - 覆盖批量加入计划的关键行为。

- `lib/vocab-graph.ts`
  - `VocabGraphNode` 增加可选 `wordId`，用于区分真实词条节点与 orphan node。
  - 拓扑关系范围已收窄为近义词、反义词、同根词。

- `app/(public)/words/[slug]/page.tsx`
  - 从 `graphData` 中提取可批量加入复习的相关词 ID。
  - 排除当前词条、无真实 `wordId` 的 orphan node、以及非近义 / 反义 / 同根关系节点。
  - 将结果传给 owner 侧边栏。

- `components/words/OwnerWordSidebar.tsx`
  - 新增“批量加入相关词复习”入口。
  - 仅在存在相关可加入词 ID 时显示。
  - 调用 `/api/review/add-batch`，依赖 API 的非破坏性行为跳过已追踪词条。

## 3. 当前行为快照

### `/words` 列表页

- owner 且当前列表中存在未加入复习词条时，显示“全选加入”入口。
- 选择一个或多个词条后，显示“批量加入复习 / 取消选择”。
- 点击选择控件不应跳转到词条详情页。
- 批量成功后清空选择，并刷新当前过滤条件下的列表数据。

### 词条详情页

- 局部拓扑只保留：
  - `synonym`
  - `antonym`
  - `root`
- 详情页只把这些拓扑相关节点中的真实词条 ID 传给 owner 侧边栏。
- orphan node 没有 `wordId`，不会被提交给批量加入 API。
- 当前词条本身不会被包含在“相关词批量加入”中。

### `/api/review/add-batch`

- 请求中的重复 `wordIds` 会被去重。
- 不存在或已删除的词条返回在 `notFound`。
- 已经有 `user_word_progress` 的词条计入 `alreadyTrackedCount`。
- 只有未追踪且真实存在的词条会创建初始复习进度。
- 使用 `upsert(..., { ignoreDuplicates: true, onConflict: "user_id,word_id" })` 作为并发兜底。

## 4. 已执行验证

本轮执行记录中已通过：

```bash
npx vitest run tests/review-add-batch.test.ts tests/vocab-graph.test.ts
npm run lint
npm run typecheck
npm test
npm run build
```

本地开发服务器曾验证 `/words` 返回 HTTP 200：

```text
http://localhost:3000/words
```

## 5. 建议 GPT-5.5 重点复审的问题

### 5.1 列表页交互

- `WordCard` 的选择控件是否在所有点击区域中都不会触发 `Link` 导航。
- checkbox/button 的可访问性是否足够，包括 label、tab 顺序和键盘切换。
- 批量成功后的 `refreshCurrentWords` 是否能正确覆盖当前过滤条件、分页和“加载更多”后的列表状态。
- `visibleSelectedWordIds` 是否会在过滤条件变化、分页变化、列表刷新后保持合理行为。

### 5.2 详情页相关词批量入口

- `graphData` 中 `wordId` 的来源是否严格代表真实存在的词条，orphan node 是否一定不会带入提交列表。
- 是否需要在 UI 层预先过滤“已经加入复习”的相关词，还是继续依赖 API 非破坏性处理。
- 入口文案和反馈是否需要展示 `alreadyTrackedCount`、`notFound` 的更清晰说明。
- 当前只包含近义词 / 反义词 / 同根词，是否符合最新产品边界。

### 5.3 API 非破坏性语义

- `buildBatchReviewInsertPlan` 是否覆盖了所有输入边界：空数组、重复 ID、全部不存在、全部已追踪、部分已追踪。
- Supabase 的 `.upsert(...).select("id, word_id")` 在 `ignoreDuplicates: true` 时，`data.length` 是否稳定等于实际新增数量。
- 并发情况下被唯一键忽略的 rows 目前会被追加计入 `alreadyTrackedCount`，该语义是否符合产品预期。
- `notFound` 当前基于请求去重后的 ID 返回，复审时可确认是否需要保持原请求顺序。

### 5.4 编码与文案

- 建议在编辑器中确认新增或改动的中文文案均为正常 UTF-8，避免 PowerShell 输出编码造成误判。
- 如果仍有历史 mojibake 文案，应另起独立清理任务，避免和本轮功能修复混在同一个变更中。

## 6. 已知残留风险

- 本轮没有新增浏览器 E2E 测试；列表选择控件“不跳转”的行为主要依赖代码结构和手动验证。
- 详情页“批量加入相关词复习”按钮不会预先知道哪些相关词已经在复习中，因此按钮数量是候选数量，不等于最终新增数量。
- API 的 `addedCount` 依赖 Supabase 对 `upsert + ignoreDuplicates + select` 的返回行为；若生产 SDK 或数据库策略不同，建议补一层集成测试。
- 侧边栏批量入口提交的是拓扑候选词 ID，未在前端按关系类型展示明细；后续若要增强信任感，可以展示近义 / 反义 / 同根分组。
- 当前工作区存在 `.workbuddy/memory/2026-04-28.md` 的既有改动，复审和提交时应确认它是否属于本轮范围；本轮功能变更不依赖该文件。

## 7. 后续优化建议

1. 为 `/words` 添加 Playwright 或组件级交互测试，覆盖：
   - 点击选择控件不导航；
   - 多选后批量加入；
   - 成功后列表状态刷新；
   - 已追踪词条不再显示选择控件。

2. 为 `/api/review/add-batch` 增加 route-level 测试或 Supabase mock 集成测试，覆盖：
   - 已有进度不重置；
   - 并发重复插入被忽略；
   - `alreadyTrackedCount` 和 `addedCount` 的实际返回一致性。

3. 考虑让 `useFilteredSearch` 暴露正式的 `refresh` 能力，替代 `WordsSearchShell` 内部维护 `refreshedResult/sourceResult`。

4. 详情页相关词批量入口可以升级为小型候选列表，展示：
   - 近义词数量；
   - 反义词数量；
   - 同根词数量；
   - 已加入 / 可加入状态。

5. 若后续继续拓展拓扑图，建议保持当前 MVP 边界：
   - 局部图优先；
   - 不一次性引入全局图谱；
   - 非真实词条 orphan node 只展示，不进入复习系统。

## 8. 给复审模型的建议结论格式

建议 GPT-5.5 复审后输出：

- Blocker：是否存在会导致 build、核心 API 或列表页交互失败的问题。
- High：是否存在破坏复习状态、误重置进度或错误提交当前词条的问题。
- Medium：是否存在 UX、可访问性、文案反馈或状态刷新不足。
- Low：代码组织、命名、测试补强和后续重构建议。

若没有阻塞问题，建议优先推进：

1. 浏览器交互测试；
2. add-batch route 级测试；
3. 详情页相关词候选展示优化。
