# Zen Review Phase 2 — GPT-5.5 Review Request

**提交者**: Cascade (Kimi 2.6)  
**日期**: 2026-04-29  
**分支**: main (Zen Review Phase 1 + Phase 2 + Session Summary v0.1)  
**范围**: 安全 Undo 最近一次评分功能完整实现 + 会话结算面板 + UI 修复

---

## 一、本次改动概要

### 1.1 新增文件

| 文件 | 目的 |
|------|------|
| `supabase/migrations/0009_review_undo.sql` | DB 迁移：添加 `previous_progress_snapshot`, `undone`, `undone_at`, `progress_id` 到 `review_logs`，含部分索引 |
| `app/api/review/undo/route.ts` | 撤销评分 API：5 步安全校验 + 完整回滚 + stats 递减 |
| `components/review/zen/ZenHistoryDrawer.tsx` | Phase 1 新增，但本次集成 Undo 功能 |
| `components/review/zen/ZenHistoryItem.tsx` | Phase 1 新增，但本次启用 Undo 按钮 |
| `components/review/zen/derive-session-summary.ts` | Session Summary 纯前端派生：从 `sessionHistory` 计算统计指标 |
| `components/review/zen/ZenSessionMetric.tsx` | 单指标展示组件（支持不同语气样式） |
| `components/review/zen/ZenRatingDistribution.tsx` | 评分分布细条组件（支持动画和无障碍标签） |
| `components/review/zen/ZenSessionSummary.tsx` | 会话结算面板：淡入动画、响应式布局、键盘支持 |
| `tests/zen-session-summary.test.ts` | Session Summary 派生逻辑单元测试（9 个场景） |

### 1.2 修改文件

| 文件 | 改动 |
|------|------|
| `types/database.types.ts` | `review_logs` Row/Insert 类型添加 `previous_progress_snapshot`, `progress_id`, `undone`, `undone_at` |
| `app/api/review/answer/route.ts` | 扩展 select 捕获完整评分前状态；写入快照；返回 `reviewLogId` |
| `lib/validation/schemas.ts` | 新增 `reviewUndoSchema` + `previousProgressSnapshotSchema` |
| `components/review/zen/useZenReview.ts` | `submitRating` 返回 `reviewLogId`；新增 `submitUndo` |
| `components/review/zen/types.ts` | 新增 `RESTORE_CARD` action；`ZenReviewedItem` 包含 `durationMs` |
| `components/review/zen/ZenReviewProvider.tsx` | 新增 `undo()` 回调 + `RESTORE_CARD` reducer + stats 回退 + `durationMs` 计算 + `undoInFlightRef` 防重入锁 |
| `components/review/zen/ZenReviewPage.tsx` | 透传 `onUndo` + `isUndoing` 到 Drawer；`done` 阶段渲染 `ZenSessionSummary` |
| `components/review/zen/useZenShortcuts.ts` | done 阶段禁用评分键；新增 `Enter/Esc` 退出、`H` 切换历史抽屉；保留 `U` 撤销 |
| `components/review/zen/ZenHistoryDrawer.tsx` | z-index 和定位修复（`z-[100]` + `top-[calc(...)]`）防止被 header 遮挡 |
| `docs/zen-review-gpt55-review.md` | 更新反映 skip 移除（Phase 1 已完成）|

### 1.3 验证结果

```
✅ npm run typecheck - PASS
✅ npm run lint - PASS (0 errors, 0 warnings)
✅ npm run build - PASS
✅ npm run test - PASS (86 tests + 新增 Session Summary 测试)
```

---

## 二、需要 GPT-5.5 重点审查的风险点

### 🔴 高风险：Undo 的数据一致性

**文件**: `app/api/review/undo/route.ts` (第 6-132 行)

**架构**: route handler 仅做轻量代理，所有原子操作在 Postgres RPC 中完成。

1. **鉴权** (第 7-10 行): `requireOwnerApiSession()` 验证身份
2. **输入校验** (第 12-18 行): Zod schema 校验 `reviewLogId`, `sessionId`
3. **调用 RPC** (第 25-32 行): `supabase.rpc("undo_review_log", { p_review_log_id, p_user_id, p_session_id })`
4. **错误映射** (第 34-59 行): 读取 `out_success` / `out_error_message`，按关键词映射 HTTP status (404/403/409/422)
5. **恢复数据拼装** (第 62-131 行): RPC 成功后按 `out_progress_id` 查询 `user_word_progress`，拼回 `ReviewQueueItem`

**RPC 内部事务** (`supabase/migrations/0010_undo_rpc.sql` → `0012_undo_rpc_enum_cast.sql`):
- `BEGIN` → `FOR UPDATE` 锁定 `review_logs` 和 `user_word_progress`
- 5 步校验（user_id / undone / snapshot / progress_id / 最新一条）
- `UPDATE user_word_progress` 用 snapshot 回滚全部 FSRS 字段
- `UPDATE review_logs SET undone=true WHERE undone=false`（仅匹配当前行，受行锁保护）
- `UPDATE sessions SET cards_seen = GREATEST(cards_seen - 1, 0)`
- `COMMIT`

**疑问**: 
- RPC 内部事务失败时 route handler 是否能正确区分 SQL 错误与业务校验错误？
- `out_success = false` 时是否总是带有 `out_error_message`？

---

### 🔴 高风险：Snapshot 序列化/反序列化

**文件**: `app/api/review/answer/route.ts` (第 105-122 行, 第 133 行)

```typescript
const previousSnapshot = {
  scheduler_payload: progress.scheduler_payload,  // Json (jsonb)
  difficulty: progress.difficulty,                  // number | null
  // ...其他字段
};

previous_progress_snapshot: previousSnapshot as unknown as Json,
```

**问题**:
- `Json` 类型来自 `database.types.ts`，实际为 `string | number | boolean | null | Json[] | { [key: string]: Json }`
- `previousSnapshot` 是一个普通对象，通过 `as unknown as Json` 强制转换是否符合预期？
- 反序列化时 (`undo/route.ts:104`) 使用 `as unknown as PreviousProgressSnapshot` 是否安全？

**需确认**: 这种「服务端序列化 → 数据库 jsonb → 服务端反序列化」的往返是否会导致类型丢失（如 Date 字符串化）？目前字段都是 string/number/null 所以应该安全。

---

### 🟡 中风险：Undo 期间的竞态保护

**文件**: `components/review/zen/ZenReviewProvider.tsx`

**保护点**:
1. **评分时** (第 243 行): `uiState.isUndoing` 为 true 时禁止新评分
2. **Undo 时** (第 348-350 行): 再次检查 `isUndoing` 防止重复提交
3. **动画锁** (第 246 行): `setAnimationLock(true)` 与 `isUndoing` 独立

**问题**:
- `animationLock` 和 `isUndoing` 是两个独立的锁，是否存在竞态？
- 撤销成功后卡片恢复到 `back` phase（第 367 行 `RESTORE_CARD`），此时 `animationLock` 已被 finally 释放（第 322-325 行），是否正确？

---

### 🟡 中风险：History 状态管理

**文件**: `components/review/zen/ZenReviewProvider.tsx` (第 266-272 行, 第 356-364 行)

**评分时**:
```typescript
setUiState((prev) => ({
  sessionHistory: [
    { ...historyItem, canUndo: true },
    ...prev.sessionHistory.map((h) => ({ ...h, canUndo: false })),
  ],
}));
```

**撤销时**:
```typescript
setUiState((prev) => ({
  sessionHistory: prev.sessionHistory.map((h) =>
    h.id === reviewLogId ? { ...h, undone: true, canUndo: false } : h
  ),
}));
```

**问题**:
- `sessionHistory` 只存在于前端内存（符合设计），刷新即丢失
- 撤销后该条目 `undone: true`，但后续评分不会给它 `canUndo: true`（因为只有最新一条可以有）
- 如果撤销的是较早的条目（不应该发生，因为 API 会拒绝），UI 会显示 "已撤销" 但卡片不会回退

---

### 🟡 中风险：restoredItem 构建

**文件**: `app/api/review/undo/route.ts` (第 110-131 行)

```typescript
const restoredItem: ReviewQueueItem = {
  queue_bucket: "learning",
  queue_label: "撤销恢复",
  queue_reason: "已撤销上次评分",
  retrievability: null,
  // ...其他字段
};
```

**问题**:
- `queue_bucket` 和 `queue_label` 是硬编码的占位值，是否合理？
- `retrievability: null` 是因为快照中保存的是评分前的值，而评分后可能已经变化？

---

### 🟡 中风险：Session Summary 纯前端派生

**文件**: `components/review/zen/derive-session-summary.ts`

**设计决策**:
- 所有统计完全从 `sessionHistory` 数组派生，不调用后端 API
- `durationMs` 由 `ZenReviewProvider.tsx` 在每次评分时计算（`Date.now() - cardShownAt`）

**问题**:
- 刷新页面后 `sessionHistory` 重置，结算面板消失（符合设计，但用户可能困惑）
- `durationMs` 包含用户犹豫时间，不代表实际思考时间
- Undo 操作会删除历史条目，导致结算数据回退（正确行为）

**需确认**:
- 派生逻辑是否在边界条件（空数组、单条记录）下正确？
- 单元测试 `tests/zen-session-summary.test.ts` 是否覆盖足够？

---

### � 中风险：done 阶段键盘快捷键冲突

**文件**: `components/review/zen/useZenShortcuts.ts`

**改动**:
- `done` 阶段禁用 `1-4` 评分键和 `Space` 翻转键（防止误触）
- 保留 `Enter` / `Esc` 退出结算回到 `/review`
- 保留 `H` 切换历史抽屉，`U` 撤销（如果 history 非空）

**问题**:
- 用户在结算面板按 `1-4` 是否会有任何反馈？（当前是静默忽略）
- 如果 history drawer 打开时按 `Enter`，会同时关闭 drawer 并退出结算吗？

---

### � 低风险：UI 交互细节

**文件**: `components/review/zen/ZenHistoryItem.tsx` (第 72-82 行)

- Undo 按钮使用 `animate-spin` 在 `isUndoing` 时旋转
- 已撤销条目有视觉区分（opacity 降低 + "已撤销" 标签）

### 🟢 低风险：历史抽屉 z-index 修复

**文件**: `components/review/zen/ZenHistoryDrawer.tsx:66`

- `z-[70]` → `z-[100]` 确保层级高于 sticky header (`z-40`)
- `top-0` → `top-[calc(var(--header-height,4rem))]` 物理避开 header 区域
- `h-full` → `h-[calc(100%-var(--header-height,4rem))]` 动态调整高度

---

## 三、已知问题 (已接受)

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| Snapshot 类型断言 | 中 | 使用 `as unknown as Json` 和反向转换，依赖字段类型兼容性 |
| Undo 全在 Postgres 事务内 | 低 | `undo_review_log` RPC 内完成，但 route handler 未再包外层事务（RPC 失败即回滚，无需外层） |
| `queue_bucket` 硬编码 | 低 | 撤销恢复卡片的 bucket 标签为 "learning"，不影响功能 |
| 刷新后无法 Undo | 低 | 符合设计：session-local history，刷新后只能看到新评分的卡 |
| 刷新后无结算面板 | 低 | 符合设计：session-local summary，刷新后 sessionHistory 重置 |
| `durationMs` 含犹豫时间 | 低 | 从卡片显示到评分的总时长，非纯思考时间 |

---

## 四、建议审查重点

### 4.1 API 安全审查

请检查 `app/api/review/undo/route.ts`:

1. [ ] RPC 参数 `p_review_log_id` 是否存在枚举或类型注入风险？（已用 Zod 前置校验）
2. [ ] `out_success = false` 时的错误消息是否可能泄露敏感信息？
3. [ ] `previous_progress_snapshot` 在 RPC 内部反序列化时是否安全？（字段均为 string/number/null）
4. [ ] RPC 事务内 `FOR UPDATE` 顺序是否合理（先 logs 后 progress），是否可能死锁？

### 4.2 前端状态审查

请检查 `components/review/zen/ZenReviewProvider.tsx`:

1. [ ] `RESTORE_CARD` 是否正确地恢复了 `items` 队列（队首插入）？
2. [ ] stats 回退逻辑 (`completed - 1`, `remaining + 1`) 是否与真实数据一致？
3. [ ] `mountedRef` 检查在 Undo 错误处理中是否有效（第 405-406 行）？
4. [ ] `undoInFlightRef` 是否在 finally 中正确重置（第 411 行），`isUndoing` state 是否在错误路径恢复（第 407 行）？

### 4.3 数据库设计审查

请检查 `0009_review_undo.sql`:

1. [ ] `idx_review_logs_progress_undone` 部分索引是否最优？
2. [ ] `undone` 默认 `false` + `not null` 是否合理？
3. [ ] `progress_id` 使用 `on delete set null` 是否合适（ vs CASCADE）？

---

## 五、测试建议

### 5.1 必须测试场景（Undo）

1. **正常撤销**: 评分 → H 打开 drawer → 撤销 → 卡片回到 back 面 → 可重新评分
2. **连续撤销**: 评分 A → 评分 B → 撤销 B（应成功）→ 尝试撤销 A（应失败）
3. **重复撤销**: 快速双击撤销按钮（第二次应因 `isUndoing` 被忽略）
4. **撤销后评分**: 撤销后重新评分同一张卡 → 新 log 写入正常
5. **并发模拟**: 两个标签页同时操作同一卡（验证 "最近一条" 校验）

### 5.2 必须测试场景（Session Summary）

1. **正常结算**: 完成所有卡片 → 显示结算面板 → 统计数据正确
2. **Undo 后结算**: 完成评分 → 撤销 → 结算数据回退 → 重新评分后更新
3. **快捷键测试**: done 阶段 `Enter/Esc` 退出；`1-4` 评分键被禁用；`H` 打开历史抽屉
4. **空历史结算**: 直接进入 done 阶段（如空队列）→ 应显示空状态而非结算
5. **移动端适配**: 结算面板在窄屏下布局正确，按钮可点击

### 5.3 边界条件

- 网络中断：API 失败时 toast 提示，history 状态不变
- 空队列撤销：理论上不会发生（必须有评分才能撤销）
- 刷新后：撤销按钮消失，结算面板消失（session history 重置）
- 快速评分：验证 `durationMs` 计算合理（不应为负值或极大值）

---

## 六、关键代码引用

### Undo API — Route handler (轻量代理)
```typescript@app/api/review/undo/route.ts:6-132
```

### Undo API — Postgres RPC 事务
```sql@supabase/migrations/0012_undo_rpc_enum_cast.sql
```

### Rating API — 保存快照
```typescript@app/api/review/answer/route.ts:105-133
```

### Provider — Undo 逻辑
```typescript@components/review/zen/ZenReviewProvider.tsx:364-414
```

### Provider — RESTORE_CARD
```typescript@components/review/zen/ZenReviewProvider.tsx:133-141
```

### Provider — durationMs 跟踪
```typescript@components/review/zen/ZenReviewProvider.tsx:263-294
```

### Provider — undoInFlightRef 防重入锁
```typescript@components/review/zen/ZenReviewProvider.tsx:156-176
```

### Session Summary — 派生逻辑
```typescript@components/review/zen/derive-session-summary.ts:1-74
```

### Session Summary — 面板组件
```typescript@components/review/zen/ZenSessionSummary.tsx:1-178
```

### ZenReviewPage — done 阶段渲染
```typescript@components/review/zen/ZenReviewPage.tsx:95-145
```

### useZenShortcuts — done 阶段键盘处理
```typescript@components/review/zen/useZenShortcuts.ts:70-145
```

### ZenHistoryDrawer — z-index 修复
```typescript@components/review/zen/ZenHistoryDrawer.tsx:56-66
```

---

## 七、done 阶段快捷键优先级规则

**文件**: `components/review/zen/useZenShortcuts.ts`

```
IF phase === "done":
  ├─ drawer open + Esc     → 关闭 drawer，不退出
  ├─ drawer open + H       → 关闭 drawer
  ├─ drawer open + Enter   → 关闭 drawer（不退出到 /review）
  ├─ drawer closed + Enter → 退出到 /review
  ├─ drawer closed + Esc   → 退出到 /review
  ├─ U (且 history 非空)    → 撤销最新 canUndo=true 的条目
  └─ Space / 1 / 2 / 3 / 4 / J / K / L / ;
     → 静默忽略（无 toast，无操作）
```

**注意**: `isUndoing || animationLock` 时所有按键均被忽略。

---

**请 GPT-5.5 审查后输出**:
1. 🟢 Approve - 可以部署
2. 🟡 Approve with comments - 可以部署，但有建议
3. 🔴 Request changes - 发现阻塞性问题

并附简短理由。
