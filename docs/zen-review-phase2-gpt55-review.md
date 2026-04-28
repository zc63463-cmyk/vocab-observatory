# Zen Review Phase 2 — GPT-5.5 Review Request

**提交者**: Cascade (Kimi 2.6)  
**日期**: 2026-04-28  
**分支**: main (Zen Review Phase 1 + Phase 2)  
**范围**: 安全 Undo 最近一次评分功能完整实现

---

## 一、本次改动概要

### 1.1 新增文件

| 文件 | 目的 |
|------|------|
| `supabase/migrations/0009_review_undo.sql` | DB 迁移：添加 `previous_progress_snapshot`, `undone`, `undone_at`, `progress_id` 到 `review_logs`，含部分索引 |
| `app/api/review/undo/route.ts` | 撤销评分 API：5 步安全校验 + 完整回滚 + stats 递减 |
| `components/review/zen/ZenHistoryDrawer.tsx` | Phase 1 新增，但本次集成 Undo 功能 |
| `components/review/zen/ZenHistoryItem.tsx` | Phase 1 新增，但本次启用 Undo 按钮 |

### 1.2 修改文件

| 文件 | 改动 |
|------|------|
| `types/database.types.ts` | `review_logs` Row/Insert 类型添加 `previous_progress_snapshot`, `progress_id`, `undone`, `undone_at` |
| `app/api/review/answer/route.ts` | 扩展 select 捕获完整评分前状态；写入快照；返回 `reviewLogId` |
| `lib/validation/schemas.ts` | 新增 `reviewUndoSchema` |
| `components/review/zen/useZenReview.ts` | `submitRating` 返回 `reviewLogId`；新增 `submitUndo` |
| `components/review/zen/types.ts` | 新增 `RESTORE_CARD` action |
| `components/review/zen/ZenReviewProvider.tsx` | 新增 `undo()` 回调 + `RESTORE_CARD` reducer + stats 回退 |
| `components/review/zen/ZenReviewPage.tsx` | 透传 `onUndo` + `isUndoing` 到 Drawer |
| `docs/zen-review-gpt55-review.md` | 更新反映 skip 移除（Phase 1 已完成）|

### 1.3 验证结果

```
✅ npm run typecheck - PASS
✅ npm run lint - PASS (0 errors, 0 warnings)
✅ npm run build - PASS
```

---

## 二、需要 GPT-5.5 重点审查的风险点

### 🔴 高风险：Undo 的数据一致性

**文件**: `app/api/review/undo/route.ts` (第 26-218 行)

**关键校验链**:

1. **用户归属** (第 49-61 行): `logEntry.user_id === userId` 防止跨用户撤销
2. **已撤销检查** (第 65-70 行): `logEntry.undone === false` 防止重复撤销
3. **快照存在** (第 72-77 行): `previous_progress_snapshot` 非空检查
4. **Progress 关联** (第 79-84 行): `progress_id` 非空检查
5. **最近一条** (第 86-101 行): 查询该 progress_id 最新未撤销 log，比对 ID

**回滚操作** (第 106-128 行):
- 完整恢复 `user_word_progress` 所有 FSRS 字段 + 计数器 + 时间戳
- `last_rating` 需要 `as ReviewRating | null` 类型断言

**Stats 递减** (第 146-161 行):
- `sessions.cards_seen` 递减（有下限保护 `Math.max(0, ...)`）
- 即使 session 查询失败也不阻断主流程

**疑问**: 
- 第 86-101 行的「最近一条」检查是否足够？是否存在并发窗口？
- 是否应该用数据库事务包裹全部操作（select + update + update）？

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

**文件**: `app/api/review/undo/route.ts` (第 196-217 行)

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

### 🟢 低风险：UI 交互细节

**文件**: `components/review/zen/ZenHistoryItem.tsx` (第 72-82 行)

- Undo 按钮使用 `animate-spin` 在 `isUndoing` 时旋转
- 已撤销条目有视觉区分（opacity 降低 + "已撤销" 标签）

---

## 三、已知问题 (已接受)

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| Snapshot 类型断言 | 中 | 使用 `as unknown as Json` 和反向转换，依赖字段类型兼容性 |
| 非事务性 Undo | 中 | 5 步校验后分步执行，理论上存在 partial failure 可能 |
| `queue_bucket` 硬编码 | 低 | 撤销恢复卡片的 bucket 标签为 "learning"，不影响功能 |
| 刷新后无法 Undo | 低 | 符合设计：session-local history，刷新后只能看到新评分的卡 |

---

## 四、建议审查重点

### 4.1 API 安全审查

请检查 `app/api/review/undo/route.ts`:

1. [ ] 5 步校验是否遗漏了什么攻击向量？
2. [ ] 是否应该用 `FOR UPDATE` 或事务锁定 progress 行？
3. [ ] `previous_progress_snapshot` 反序列化时是否有注入风险？
4. [ ] `cards_seen` 递减是否应该在事务中保证原子性？

### 4.2 前端状态审查

请检查 `components/review/zen/ZenReviewProvider.tsx`:

1. [ ] `RESTORE_CARD` 是否正确地恢复了 `items` 队列（队首插入）？
2. [ ] stats 回退逻辑 (`completed - 1`, `remaining + 1`) 是否与真实数据一致？
3. [ ] `mountedRef` 检查在 Undo 错误处理中是否有效（第 386 行）？
4. [ ] `isUndoing` 锁是否在错误时正确释放（第 387 行）？

### 4.3 数据库设计审查

请检查 `0009_review_undo.sql`:

1. [ ] `idx_review_logs_progress_undone` 部分索引是否最优？
2. [ ] `undone` 默认 `false` + `not null` 是否合理？
3. [ ] `progress_id` 使用 `on delete set null` 是否合适（ vs CASCADE）？

---

## 五、测试建议

### 5.1 必须测试场景

1. **正常撤销**: 评分 → H 打开 drawer → 撤销 → 卡片回到 back 面 → 可重新评分
2. **连续撤销**: 评分 A → 评分 B → 撤销 B（应成功）→ 尝试撤销 A（应失败）
3. **重复撤销**: 快速双击撤销按钮（第二次应因 `isUndoing` 被忽略）
4. **撤销后评分**: 撤销后重新评分同一张卡 → 新 log 写入正常
5. **并发模拟**: 两个标签页同时操作同一卡（验证 "最近一条" 校验）

### 5.2 边界条件

- 网络中断：API 失败时 toast 提示，history 状态不变
- 空队列撤销：理论上不会发生（必须有评分才能撤销）
- 刷新后：撤销按钮消失（session history 重置）

---

## 六、关键代码引用

### Undo API — 5 步安全校验
```typescript@app/api/review/undo/route.ts:43-101
```

### Undo API — 回滚操作
```typescript@app/api/review/undo/route.ts:103-128
```

### Rating API — 保存快照
```typescript@app/api/review/answer/route.ts:105-133
```

### Provider — Undo 逻辑
```typescript@components/review/zen/ZenReviewProvider.tsx:346-393
```

### Provider — RESTORE_CARD
```typescript@components/review/zen/ZenReviewProvider.tsx:133-141
```

---

**请 GPT-5.5 审查后输出**:
1. 🟢 Approve - 可以部署
2. 🟡 Approve with comments - 可以部署，但有建议
3. 🔴 Request changes - 发现阻塞性问题

并附简短理由。
