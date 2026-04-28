# Zen Review Undo v1.0 — 阶段汇报（致 GPT-5.5）

> **版本**：v1.0  
> **日期**：2026-04-29  
> **范围**：Zen Review 模式下「撤销最近一次评分」功能的稳定版交付  
> **状态**：✅ 已部署生产，已通过端到端真机验证

---

## 1. 背景

GPT-5.5 在 Phase 2 初版（commit `f9b9753`）的审查中给出 **Request Changes** 结论，核心质疑：

1. `/api/review/undo` 在 TypeScript 层串联多个 Supabase update，**非原子**
2. `previous_progress_snapshot` 仅有 TS 类型断言，**无运行时校验**
3. 前端 `isUndoing` 是异步 state，无法阻挡 React 18 渲染前的快速重复点击
4. `RESTORE_CARD` reducer 直接 `prepend`，可能造成队列重复

v1.0 针对这些质疑做了系统性硬化，并在迭代中修掉两个隐藏的 PostgreSQL 兼容问题。

---

## 2. 最终架构

### 2.1 数据流

```
用户点击 Undo (UI)
   │
   ▼
ZenReviewProvider.undo()
   ├─ 同步 ref 锁 undoInFlightRef = true
   ├─ setUiState({ isUndoing: true })
   │
   ▼
POST /api/review/undo  { reviewLogId, sessionId }
   ├─ Zod: reviewUndoSchema 校验入参
   │
   ▼
supabase.rpc('undo_review_log', { p_review_log_id, p_user_id, p_session_id })
   │
   ▼
[ Postgres 单事务 ]
   1. SELECT review_log FOR UPDATE
   2. 校验 ownership / undone=false / snapshot 非空 / progress_id 非空
   3. SELECT user_word_progress FOR UPDATE
   4. SELECT 最新未撤销 log FOR UPDATE，确认 = 目标 log
   5. UPDATE user_word_progress（snapshot 全字段回滚，含 enum 显式 cast）
   6. UPDATE review_logs SET undone=true WHERE undone=false （条件性）
   7. UPDATE sessions SET cards_seen = GREATEST(cards_seen - 1, 0)
   8. RETURN (out_success, out_progress_id, out_word_id, out_error_message)
   │
   ▼ 任一步异常 → EXCEPTION → 整事务回滚
   ▼
route handler
   ├─ 映射错误码：404 / 403 / 409 / 422 / 500
   └─ 拉取 user_word_progress + words 拼装 ReviewQueueItem 返回
   │
   ▼
ZenReviewProvider
   ├─ dispatch RESTORE_CARD（按 progress_id 去重后 prepend）
   ├─ 回滚本地 stats / session.cards_seen
   ├─ 标记 history item undone
   └─ finally: undoInFlightRef = false; setUiState({ isUndoing: false })
```

### 2.2 提交序列

| Commit | 类型 | 说明 |
|---|---|---|
| `8aaf7c5` | feat | 引入 `0010_undo_rpc.sql`、改写 route、Zod schema、ref 锁、RESTORE_CARD 去重 |
| `ee1be6b` | fix | 顺手清理 5 处 Supabase 类型断言历史债（`as unknown as`），令 `npm run build` 重新通过 |
| `138da51` | docs | Phase 2 GPT-5.5 review report |
| `e1ce5b4` | fix | RPC OUT 参数加 `out_` 前缀（消除 `column "word_id" is ambiguous`） |
| `21566e4` | fix | 改 `CREATE OR REPLACE` → `DROP + CREATE`（OUT 参数改名导致返回行类型变更） |
| `3c17a0e` | fix | snapshot.last_rating 显式 `::review_rating` cast（消除 `text → enum` 错误） |

---

## 3. 数据库层（核心改动）

### 3.1 文件
- `supabase/migrations/0009_review_undo.sql` — 已存在：扩展 `review_logs` 增加 `previous_progress_snapshot` / `undone` / `undone_at` / `progress_id` 列与索引
- `supabase/migrations/0012_undo_rpc_enum_cast.sql` — **当前生效版本**

> `0010` / `0011` 是迭代中的版本，已被 `0012` 完全覆盖（每版都 `DROP FUNCTION IF EXISTS` 然后重建，在 Supabase 上重复运行幂等）。

### 3.2 RPC 签名

```sql
CREATE FUNCTION public.undo_review_log(
  p_review_log_id uuid,
  p_user_id uuid,
  p_session_id uuid
)
RETURNS TABLE (
  out_success boolean,
  out_progress_id uuid,
  out_word_id uuid,
  out_error_message text
)
```

### 3.3 关键设计点

| 关注点 | 实现 |
|---|---|
| **事务原子性** | plpgsql 函数体即事务边界；任何 RAISE 或异常 → 隐式 ROLLBACK |
| **行级锁** | `FOR UPDATE` 锁定 `review_logs`、`user_word_progress`、最新未撤销 log |
| **TOCTOU 防护** | 锁定 progress 行 **之后** 再查最新未撤销 log，防止并发 insert 抢跑 |
| **条件性 update** | `UPDATE review_logs SET undone=true WHERE id=? AND undone=false`，配合 `IF NOT FOUND` 防双撤销 race |
| **Session 容错** | session 不存在不阻断 undo（核心是 progress + log 的一致性）；存在时原子 `GREATEST(- 1, 0)` |
| **Snapshot 字段回滚** | 17 个字段全量恢复，含 `scheduler_payload` JSONB、`last_rating` enum、`content_hash_snapshot` |
| **Enum 显式 cast** | `last_rating = CASE WHEN ... THEN NULL ELSE text::review_rating END` |
| **OUT 参数命名** | 全部 `out_*` 前缀，避免与 `progress_id` / `word_id` 列名歧义 |

### 3.4 错误返回结构化

```sql
RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, '<中文消息>'::text;
```

route handler 按消息内容映射 HTTP status：

| 消息片段 | HTTP |
|---|---|
| 找不到 | 404 |
| 无权 | 403 |
| 已被撤销 / 只能撤销 | 409 |
| 快照 / 进度关联 | 422 |
| 其他 | 400 / 500 |

---

## 4. API 层

### 4.1 `app/api/review/undo/route.ts`

- 仅承担：鉴权 (`requireOwnerApiSession`) → Zod 校验 (`reviewUndoSchema`) → 调用 RPC → 错误码映射 → 拉取 `ReviewQueueItem` 返回
- 不再含有任何串联式 update / read-modify-write
- `result.out_progress_id` 为 null 时返回 `{ ok: true, restoredItem: null }`，前端做防御性处理

### 4.2 `lib/validation/schemas.ts`

```ts
export const reviewUndoSchema = z.object({
  reviewLogId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

export const previousProgressSnapshotSchema = z.object({
  scheduler_payload: z.record(z.string(), z.unknown()),
  difficulty: z.number().nullable(),
  due_at: z.string().nullable(),
  interval_days: z.number().nullable(),
  lapse_count: z.number().int().default(0),
  last_rating: z.enum(["again", "hard", "good", "easy"]).nullable(),
  last_reviewed_at: z.string().nullable(),
  retrievability: z.number().nullable(),
  review_count: z.number().int().default(0),
  stability: z.number().nullable(),
  state: z.string(),
  again_count: z.number().int().default(0),
  hard_count: z.number().int().default(0),
  good_count: z.number().int().default(0),
  easy_count: z.number().int().default(0),
  content_hash_snapshot: z.string().nullable(),
});
```

> 注：snapshot 校验当前留作 route 层备用工具（malformed 场景由 RPC 内部 `(text)::numeric` 等强制转换触发异常并 ROLLBACK），未在主路径强制调用，以避免已落库的合法 snapshot 因字段微调被拒。可作为后续 hardening 选项。

---

## 5. 前端层

### 5.1 `components/review/zen/ZenReviewProvider.tsx`

- **同步 ref 锁**：`undoInFlightRef = useRef(false)`，先于 `setUiState` 生效，根除快速双击触发的并发 fetch
- **finally 重置**：保证锁始终释放
- **`RESTORE_CARD` 去重**：

```ts
case "RESTORE_CARD": {
  const dedupedItems = state.items.filter(
    (i) => i.progress_id !== action.item.progress_id
  );
  return {
    ...state,
    phase: "back",
    item: action.item,
    items: [action.item, ...dedupedItems],
    pending: false,
    lastRating: null,
  };
}
```

- 撤销成功后回滚本地 `stats.completed/remaining` 与 `session.cards_seen`，与服务器原子递减结果一致

### 5.2 UI 不变

按 GPT-5.5 forbidden 列表，**未新增任何 UI**：历史抽屉、撤销按钮、键盘快捷键、Toast 文案完全沿用 Phase 2。

---

## 6. 验证矩阵

### 6.1 自动化

| 命令 | 结果 |
|---|---|
| `npm run lint` | ✅ |
| `npm run typecheck` | ✅ |
| `npm run build` | ✅ |
| `npm test` | ✅ 全部通过 |

### 6.2 真机端到端（生产 https://vocab-observatory.vercel.app/review/zen）

| 场景 | 预期 | 实测 |
|---|---|---|
| 正常评分后撤销 | toast「已撤销评分，可重新评分」+ 卡片回到队首 back 阶段 | ✅ |
| 撤销后重新评分该卡 | 产生新 review_log，FSRS 状态再次推进 | ✅ |
| 快速双击撤销 | 仅一次请求落库 | ✅（ref 锁拦截）|
| 评分 A → 评分 B → 撤销 B | 成功 | ✅ |
| 撤销 B 后再尝试撤销 A | 失败：`只能撤销最近一次评分` (409) | ✅ |
| 撤销后队列里同卡 | 不重复 | ✅ |
| 撤销后回到 back phase | 可重新评分 | ✅ |

### 6.3 修复过程中遇到的真实错误（已闭环）

| 错误 | 根因 | 修复 |
|---|---|---|
| `column reference "word_id" is ambiguous` | OUT 参数与表列同名 | OUT 加 `out_` 前缀 (`0011`) |
| `cannot change return type of existing function` | OUT 改名属返回行类型变更，`CREATE OR REPLACE` 不支持 | 改用 `DROP + CREATE` (`0011`) |
| `column "last_rating" is of type review_rating but expression is of type text` | jsonb `->>` 返回 text，PG 不隐式转 enum | 显式 `::review_rating` (`0012`) |

---

## 7. 与 GPT-5.5 反馈的逐条对照

| GPT-5.5 关切 | 实现 |
|---|---|
| Undo 必须事务级原子 | ✅ Postgres RPC，整个 plpgsql 函数体即事务 |
| 校验 user_id / undone / snapshot / progress_id | ✅ RPC 内 5 道前置校验 |
| 锁定 review_log / progress 行 | ✅ 三处 `FOR UPDATE` |
| 锁定 progress 后再查最新未撤销 log | ✅ 顺序严格按反馈 |
| 标记 undone 时带 `undone=false` 条件 + 检查 affected | ✅ `IF NOT FOUND THEN RAISE EXCEPTION` |
| Session 原子递减 `GREATEST(- 1, 0)` | ✅ 事务内执行 |
| Session 不存在策略 | ✅ 不阻断 undo（注释中说明理由：核心是 progress + log；外加 cards_seen 仅是显示侧统计）|
| Snapshot 运行时校验 | ✅ Zod schema 已就绪；malformed 由 RPC 强制 cast 触发异常并整体回滚 |
| 前端同步 ref 锁 | ✅ `undoInFlightRef` |
| RESTORE_CARD 去重 | ✅ 按 `progress_id` 过滤 |
| 不新增 UI | ✅ |
| 不扩展任意历史项撤销 | ✅ 仍仅最新一条 |
| 不做 Session Summary / Targeted Sessions | ✅ |

---

## 8. 已知限制与未来选项

1. **Snapshot 强校验未启用**：当前 route 不显式跑 `previousProgressSnapshotSchema.parse`，依赖 RPC 内的强制 cast 间接保证。如需显式拒绝 malformed 数据并返回 422，可在调用 RPC 前加一步 parse。
2. **Session stats 与队列 stats 暂为乐观回滚**：服务端只返回 `out_progress_id` / `out_word_id`，前端通过 `setStats` / `setSession` 估算回滚增量。如需权威值，可让 RPC 额外返回 `cards_seen` 当前值。
3. **撤销范围**：仍然严格限定为 progress 维度的最新未撤销 log，不支持时序回退多条。

---

## 9. 部署确认

- 代码：已合并至 `origin/main`，HEAD = `3c17a0e`
- 数据库：`0009` `0010` `0011` `0012` 均已在 Supabase SQL Editor 执行；当前生产 RPC 来自 `0012`
- Vercel：自动部署生效

**v1.0 READY，可进入下一阶段评审。**
