# Zen Review Undo v1.0 — Maintenance Note

> **Status**: GPT-5.5 审查 ✅ Approved (2026-04-29)  
> **Owner**: Zen Review feature  
> **Production HEAD**: `22d7664`  
> **生产 RPC 来源**: `supabase/migrations/0012_undo_rpc_enum_cast.sql`

⚠️ **修改禁令**：除非发现线上 bug，不再调整 Undo 主流程。后续优化项放在 §6。

---

## 1. RPC 名称与签名

| 项 | 值 |
|---|---|
| Schema | `public` |
| Name | `undo_review_log` |
| Args | `p_review_log_id uuid, p_user_id uuid, p_session_id uuid` |
| Returns | `TABLE (out_success boolean, out_progress_id uuid, out_word_id uuid, out_error_message text)` |
| Language | `plpgsql` |
| Security | 默认 `SECURITY INVOKER`（依赖调用方身份 + RLS）|

OUT 参数全部以 `out_` 前缀命名，避免与 `progress_id` / `word_id` 列名歧义。

调用方（route）必须使用 `result.out_success` / `result.out_progress_id` / `result.out_word_id` / `result.out_error_message`。`types/database.types.ts` 已反映此契约。

---

## 2. 关键字段（按表）

### 2.1 `review_logs`
- `previous_progress_snapshot jsonb` — 评分前 progress 的 17 字段快照
- `progress_id uuid` — 反向 FK，便于 RPC 直接定位 progress 行
- `undone boolean default false`
- `undone_at timestamptz`
- `idx_review_logs_progress_undone (progress_id, reviewed_at desc) WHERE undone=false` — 加速「最新未撤销 log」查询

### 2.2 Snapshot JSON 形状（17 字段）

```
scheduler_payload         jsonb
difficulty                numeric | null
due_at                    timestamptz | null
interval_days             numeric | null
lapse_count               integer
last_rating               review_rating | null   ← jsonb ->> 取出后必须 ::review_rating cast
last_reviewed_at          timestamptz | null
retrievability            numeric | null
review_count              integer
stability                 numeric | null
state                     text
again_count, hard_count, good_count, easy_count   integer
content_hash_snapshot     text | null
```

### 2.3 `sessions`
- `cards_seen` — RPC 内 `GREATEST(COALESCE(cards_seen, 0) - 1, 0)` 原子递减

---

## 3. 事务边界

整个 RPC 函数体即事务。**任一步失败 → 自动 ROLLBACK**，不会留下半成品。

锁顺序（防 TOCTOU + 死锁）：
```
1. SELECT review_logs.id FOR UPDATE         -- 锁定目标 log
2. SELECT user_word_progress.id FOR UPDATE  -- 锁定 progress
3. SELECT review_logs.id FOR UPDATE         -- 锁定后再查最新未撤销 log
4. UPDATE user_word_progress                -- 回滚 17 字段
5. UPDATE review_logs SET undone=true WHERE undone=false  -- 条件性，配合 IF NOT FOUND 防 race
6. UPDATE sessions SET cards_seen=...       -- session 不存在不阻断
```

`EXCEPTION WHEN OTHERS` 捕获兜底，结构化返回 `(false, NULL, NULL, SQLERRM)`。

---

## 4. 已知限制

| # | 项 | 现状 | 风险等级 |
|---|---|---|---|
| L1 | `previousProgressSnapshotSchema` 仅定义未强制调用 | route 不显式 `parse`；malformed snapshot 由 RPC 内 `(text)::numeric` 等强制 cast 触发异常间接拒绝 | 低（已落库的合法数据不会受影响；EXCEPTION 自动 ROLLBACK） |
| L2 | 错误码映射依赖中文文案 `includes()` | route 用 `message.includes("找不到")` 等映射 404/403/409/422 | **中**（修改 RPC 文案会破坏 status code）|
| L3 | 前端 stats 乐观回退 | `stats.completed-1` / `stats.remaining+1` / `session.cards_seen-1` 由前端自行估算，与服务端 `GREATEST` 不严格同步 | 低（极端情况短暂数字差，下次 fetchQueue 即矫正）|
| L4 | Session 不存在不阻断 undo | 设计选择：核心一致性是 progress + log；`cards_seen` 是显示侧统计 | 低（无功能影响）|
| L5 | 撤销范围 | 仅最新一条 progress 维度的未撤销 log | 已按 forbidden 列表确认，非限制 |

### L1 在代码中的说明位置
`docs/zen-review-undo-v1.0-report.md` §4.2 + §8 已注明。`lib/validation/schemas.ts` 注释 `// Schema for validating previous_progress_snapshot at runtime (Fix-4)` 描述意图，但实际未在 `app/api/review/undo/route.ts` 中调用。

### L2 缓解建议
建议下一阶段把 RPC 错误返回从纯文案改成 `(error_code text, error_message text)` 双字段，例如：
```
out_error_code text  -- e.g. 'LOG_NOT_FOUND' | 'NOT_OWNER' | 'ALREADY_UNDONE' | 'NOT_LATEST' | 'NO_SNAPSHOT'
```
route 据 code 映射 status 即可，文案变化不再影响 HTTP 行为。

---

## 5. 迁移文件序列（重要）

```
0009_review_undo.sql          -- 表结构扩展（一次性）
0010_undo_rpc.sql             -- RPC v1（已被覆盖）
0011_undo_rpc_fix.sql         -- RPC v2：DROP+CREATE，OUT 参数加 out_ 前缀
0012_undo_rpc_enum_cast.sql   -- RPC v3（生产）：DROP+CREATE，last_rating ::review_rating cast
```

**新环境部署**：按序号执行即可，最终状态 = `0012`。每个 RPC 迁移都以 `DROP FUNCTION IF EXISTS public.undo_review_log(uuid, uuid, uuid)` 开头，**幂等**，可任意重跑。

**不要合并/重排**：保持历史文件不动，新修复继续追加 `0013_*` 等新文件。

---

## 6. 后续可选优化（不影响 v1.0 稳定性）

按优先级：

### P1 — 错误码结构化（缓解 L2）
在 `0013_undo_rpc_error_code.sql` 中将返回扩展为：
```sql
RETURNS TABLE (
  out_success boolean,
  out_progress_id uuid,
  out_word_id uuid,
  out_error_code text,    -- 新增
  out_error_message text
)
```
route 改用 `out_error_code` 做 switch。
**触发条件**：发现 RPC 文案需要 i18n 或修改时立即做。

### P2 — RPC 返回权威 stats
让 RPC 在成功路径多返回：
```sql
out_session_cards_seen integer  -- 递减后的最新值
```
前端用此值替代 `setSession((s) => ({ ...s, cards_seen: s.cards_seen - 1 }))`。  
**收益**：消除 L3 的乐观回退；前后端绝对一致。  
**成本**：RPC 返回签名变化，需 `0013_*` + 同步 TS 类型 + route + provider。

### P3 — Snapshot 强校验
在 route 层调用 `previousProgressSnapshotSchema.safeParse(logEntry.previous_progress_snapshot)`，malformed 时直接 422，不进 RPC。
**收益**：缺陷数据被显式拒绝，错误信息更友好。  
**成本**：需先确保所有历史 snapshot 都符合 schema；建议先跑一次扫描确认。

### P4 — 监控埋点
在 route 中记录：
- `undo_attempt_total` / `undo_success_total` / `undo_failure_by_code`
- p50/p95 RPC 耗时（log 查询 + RPC + 后续 fetch）

---

## 7. 验证指令清单（回归测试用）

```bash
# 本地静态检查
npm run lint
npm run typecheck
npm run build
npm test

# 真机回归（已通过）
1. 正常评分后 Undo
2. 快速双击 Undo
3. 双标签页同时 Undo 同一条
4. 评分 A → 评分 B → 撤销 B（成功）
5. 撤销 B 后再撤销 A（应失败：只能撤销最近一次评分）
6. Undo 后重新评分该卡
7. Malformed snapshot（人工 SQL 改）→ Undo 应失败 + progress 不变
8. Session 删除后 Undo（应仍成功，progress + log 一致）
9. Undo 后队列不重复
10. Undo 后回到 back phase 可重新评分
```

---

## 8. 守则

- ❌ 不新增 UI
- ❌ 不做 Session Summary
- ❌ 不做 Targeted Sessions
- ❌ 不扩展任意历史项撤销
- ❌ 不再调整 Undo 主流程（除非线上 bug）
- ✅ 后续优化项 P1-P4 单独立项，每项独立 PR
- ✅ 文档先行：每次修改先更新本 maintenance note 的「已知限制」与「迁移序列」

---

## Appendix A — 本轮收尾审查结论

| # | 审查项 | 结论 |
|---|---|---|
| 1 | 生产 RPC 来自 `0012` | ✅ 已确认（用户在 SQL Editor 手动执行 + RPC `RETURNS` 与 `database.types.ts` 一致）|
| 2 | `0010/0011/0012` 不影响新环境 migration 顺序 | ✅ 全部 `DROP IF EXISTS + CREATE`，按序执行最终状态 = `0012` |
| 3 | `previousProgressSnapshotSchema` 暂未强制调用已说明 | ✅ `docs/zen-review-undo-v1.0-report.md` §4.2 + §8 + 本文件 L1 |
| 4 | 错误消息映射稳定 | ⚠️ **当前依赖中文文案 `includes()`**，建议 P1 优化为 error code |
| 5 | RPC 返回 cards_seen | 暂不实施（避免修改主流程）；列入 P2 备选 |
| 6 | 禁止项遵守 | ✅ 本轮零 UI / 零功能扩展 |
| 7 | Maintenance note 输出 | ✅ 即本文件 |

### 本轮额外发现并修复（非 Undo 主流程）
- 工作区 `app/api/review/undo/route.ts` 存在未提交的反向修改（`out_*` 被改回旧名），**已 `git restore` 恢复**。生产 HEAD `22d7664` 始终正确，无线上影响。
