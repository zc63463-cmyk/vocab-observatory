# Zen Review V3.0 — 总体执行方案

**作者**: Cascade (Kimi 2.6)
**日期**: 2026-04-29
**目的**: 为 Zen Review V3.0 增强（C 类四项功能）提供可执行的总体方案，便于下一位 Kimi 2.6 接手。
**前置版本**: Phase 1 (skip 移除 + 卡片机) + Phase 2 (Undo + Session Summary v0.1) 已上线。
**约束**: 不修改 FSRS 调度、不修改 Undo RPC、不破坏现有快捷键。

---

## 〇、范围声明

### 本次目标（C 类 — Zen Review 增强）

| # | 功能 | 简述 |
|---|---|---|
| C1 | **示例句子展示** | 评分页面 (back phase) 除定义外可展开 1-2 条例句（来源：词条已有的 `examples` / `corpus_items` / `collocations`） |
| C2 | **音频发音** | 点击词条 lemma 触发浏览器原生 `SpeechSynthesis` TTS；`P` 键也可触发 |
| C3 | **"再来一组"** | done 阶段在结算面板上加按钮，立即拉取下一批，不退出 Zen |
| C4 | **快捷定位词条** | back/rating phase 按 `D` 在新标签页打开 `/words/[slug]` |

### 明确不做

- 不新增后端 API（C1/C2 用现有数据；C3 复用 `fetchQueue`；C4 纯前端跳转）
- 不修改 FSRS 调度逻辑
- 不修改 Undo RPC、`/api/review/undo` 路由
- 不修改 Session Summary 的派生算法
- 不引入新依赖（TTS 用浏览器原生 API，无需 npm 包）
- 不做笔记/AI 生成例句（暂不接入 GPT API）

---

## 一、当前代码事实（已核实）

### 1.1 Zen 数据流

| 文件 | 角色 |
|------|------|
| `app/api/review/queue/route.ts` | GET 队列：`SELECT ... words!inner(slug, title, lemma, ipa, short_definition, definition_md, metadata)` |
| `lib/review/types.ts` | `ReviewQueueItem` 字段定义（**目前不含 examples**） |
| `components/review/zen/ZenReviewProvider.tsx` | 状态机 + Undo + 历史 + 时长计时；新阶段无需引入新 reducer |
| `components/review/zen/ZenFlashcard.tsx` | 翻面卡 UI；展示 lemma / ipa / definition |
| `components/review/zen/useZenShortcuts.ts` | 键盘路由，**新增 `D` / `P` 在此处接入** |
| `components/review/zen/ZenSessionSummary.tsx` | 结算面板；**C3 加按钮在此** |

### 1.2 词条数据形状

- DB `words` 表已有 `examples Json` 列（runtime 是 `ParsedExample[]`）
- 结构化 `collocations` / `corpus_items` 是新字段，与 legacy `examples` 互补
- 现有 `/words/[slug]/page.tsx` 把 `examples` 强转成 `ParsedExample[]` 使用
- Zen Review 当前 **未** 拉取这些字段 → C1 需扩展 query

### 1.3 现有快捷键（不可冲突）

| 键 | 作用 | 阶段 |
|---|---|---|
| `Space` | 翻面 | front |
| `1/2/3/4`, `J/K/L/;` | 评分 | back |
| `H` | 切换历史抽屉 | 所有非 loading/error |
| `Esc` | 关 drawer / 退出 | 所有 |
| `Enter` | done 阶段退出 | done |
| `U` | 撤销最新 | 所有（UI 暴露在 drawer 内） |

### 1.4 待新增快捷键

| 键 | 作用 | 阶段 |
|---|---|---|
| `D` | 在新标签页打开 `/words/[slug]` | back / rating |
| `P` | TTS 朗读 lemma | front / back |

注：`P` 不与现有键冲突；`D` 不与现有键冲突。

---

## 二、分功能实现细则

### C1 — 示例句子展示

#### 数据来源决策

优先级顺序：

1. `words.collocations`（结构化 `CollocationItem[]`）
2. `words.corpus_items`（结构化 `CorpusItem[]`）
3. `words.examples`（legacy `ParsedExample[]`，filter `source === "corpus"` 优先）

**取最多 2 条**（取前 2 条，简单 slice，不做随机）。

#### 后端改动

文件：`app/api/review/queue/route.ts`

- 扩展 `SELECT`：加 `collocations, corpus_items, examples`
- 扩展 inline `rawRows` 类型：加三个字段
- 在 mapping 处计算 `previewExamples: { text: string; note?: string | null }[]`
- 把 `previewExamples` 加到 `ReviewQueueItem`

文件：`app/api/review/undo/route.ts`

- 同步扩展 `restoredItem` 拼装（保持队列与 undo 字段一致）
- **或者**：在 `restoredItem` 里 `previewExamples: []`（撤销恢复时不展示例句，保守策略）→ **推荐这个**，避免再做一次复杂派生

文件：`lib/review/types.ts`

```ts
export interface ReviewQueueItem {
  // ... existing fields
  previewExamples: Array<{ text: string; note: string | null }>;
}
```

**风险**：
- `examples` 列存的是 `Json`，访问时需 `as unknown as ParsedExample[]`
- 老数据可能 `null` → 必须做 `?? []` 兜底
- 撤销恢复路径要决定是否复用同一派生函数（建议抽到 `lib/review/word-examples.ts` 共用）

#### 前端改动

文件：`components/review/zen/ZenFlashcard.tsx`

- `FlashcardBack` 内、释义下方加一个折叠区
- 默认折叠 → 展示按钮 `查看例句`
- 展开后：每条例句一行，`text` 主体 + `note` 灰色（如果有）
- 折叠状态用 React `useState` 本地保存（不需要进 reducer）
- 切换卡时自动重置（用 `key={item.progress_id}` 已经会重新 mount，OK）

#### 设计约束

- **保持安静**：例句区使用现有 `var(--color-border)` 细线分隔，不要加色块
- 字号 `text-sm`，行间距 `leading-relaxed`
- 最多 2 条；超出折叠（实际只渲染前 2 条）
- 不打断翻面动画（动画期不响应展开点击）

---

### C2 — 音频发音

#### 实现方式

使用浏览器原生 `window.speechSynthesis`：

```ts
// utils/tts.ts (new)
export function speakWord(text: string, lang = "en-US") {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  
  // 取消正在朗读的，避免叠加
  window.speechSynthesis.cancel();
  
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.95; // 略慢
  utter.pitch = 1.0;
  
  window.speechSynthesis.speak(utter);
}
```

**不需要 React Hook**，直接函数即可。

#### 触发点

1. **lemma 区域可点击**（front 和 back 都可）
   - 文件：`ZenFlashcard.tsx`
   - lemma `<h1>` 加 `onClick`，并包一层 `button` 提升可访问性
   - 加视觉提示（hover 时小喇叭图标淡入）
   
2. **快捷键 `P`**
   - 文件：`useZenShortcuts.ts`
   - 在 phase === "front" || phase === "back" 时响应
   - 与现有键不冲突

#### 边界处理

- **iOS Safari**：`speechSynthesis` 只能在用户交互回调内首次激活（点击/按键已满足，✓）
- **不支持 TTS 的浏览器**：silent fail（不报错，不 toast）
- **快速连续触发**：`cancel()` 后再 `speak()`，避免叠加
- **页面卸载时**：不需要清理（浏览器自动停止）

#### 语言探测

- 当前默认 `en-US`
- 后续可读 `words.lang_code`，但 V3.0 写死 `en-US`，避免引入字段

#### 安静模式

- 不要默认自动朗读，必须用户主动触发（点击或按键）
- 不要朗读释义/例句（只朗读 lemma）

---

### C3 — "再来一组"

#### 行为定义

done 阶段，结算面板上加一个 **新一组（Next batch）** 按钮：
- 点击后调用 `fetchQueue()` 重新拉队列
- 如果有新卡 → 切到 `front` phase，开始下一批
- 如果空队列 → toast 提示"暂无新卡"，停留在 done

#### 实现

文件：`components/review/zen/ZenReviewProvider.tsx`

```ts
const startNextBatch = useCallback(async () => {
  // 防重入
  if (state.pending) return;
  dispatch({ type: "SET_PENDING", pending: true });
  
  try {
    const data = await fetchQueue();
    if (!mountedRef.current) return;
    
    if (data.items.length === 0) {
      addToast("暂无新卡片", "info");
      dispatch({ type: "SET_PENDING", pending: false });
      return;
    }
    
    setItems(data.items);
    setSession(data.session);
    setStats(data.stats);
    
    // 清空 sessionHistory？— 决策点见下
    setUiState((prev) => ({
      ...prev,
      sessionHistory: [], // 视为新会话
    }));
    
    dispatch({
      type: "REFRESH_QUEUE",
      items: data.items,
      session: data.session,
      stats: data.stats,
    });
  } catch (err) {
    addToast("加载失败", "error");
    dispatch({ type: "SET_PENDING", pending: false });
  }
}, [state.pending, fetchQueue, setItems, setSession, setStats, addToast]);
```

加到 context value 暴露给 ZenSessionSummary。

#### 决策点：sessionHistory 是否清空？

| 方案 | 优点 | 缺点 |
|------|------|------|
| **A. 清空**（推荐） | 第二批的 history 干净，summary 重置 | 第一批的 Undo 链失效（用户主观上也不该撤第一批的卡） |
| B. 保留 | Undo 仍可用 | 结算面板第一次进 done 时累计第一批+第二批 |

**推荐 A**，符合"再来一组"的语义即"开始新一段"。

#### 文件改动

- `ZenReviewProvider.tsx` — 加 `startNextBatch`
- `ZenSessionSummary.tsx` — 加按钮（在"返回复习页"左侧）
- `useZenShortcuts.ts` — 可选：done 阶段加 `N` 键触发 next batch

#### UI

- 按钮文案：`新一组` 或 `继续复习`
- 样式：与现有"返回复习页"按钮风格一致（边框版，不是填充版，作为次级 action）
- 加载中时 disable + spinner

---

### C4 — 快捷定位词条

#### 行为

back / rating phase 按 `D` 键 → `window.open('/words/' + item.slug, '_blank')`

- 用 `_blank` 避免离开 Zen
- 不展示 toast（保持安静）
- 不在 front phase 触发（front 时词条还没翻面，不该提前看完整释义）
- done / loading / error 不触发

#### 实现

文件：`useZenShortcuts.ts`

```ts
// in handleKeyDown, after H handler, before drawer-open guard:
if (e.key === "d" || e.key === "D") {
  if (phase !== "back" && phase !== "rating") return;
  e.preventDefault();
  onOpenWordPage(); // new callback
  return;
}
```

文件：`ZenReviewProvider.tsx`

```ts
const openWordPage = useCallback(() => {
  if (!state.item) return;
  window.open(`/words/${state.item.slug}`, "_blank", "noopener,noreferrer");
}, [state.item]);

// pass to useZenShortcuts
useZenShortcuts({
  // ...existing
  onOpenWordPage: openWordPage,
});
```

#### UI 提示

- 在 back phase 底部 hint 区加一行小字：`<kbd>D</kbd> 查看完整词条`
- 不加按钮，避免污染卡面（鼠标用户可能错过，可以接受）

---

## 三、改动清单（建议提交结构）

### 提交 1: C1 — 例句展示

```
M lib/review/types.ts                           +1 line  (previewExamples)
A lib/review/word-examples.ts                   +40 lines (派生函数)
M app/api/review/queue/route.ts                 +15 lines
M app/api/review/undo/route.ts                  +1 line  (previewExamples: [])
M components/review/zen/ZenFlashcard.tsx        +30 lines (折叠区)
A tests/word-examples-derive.test.ts            +50 lines
```

### 提交 2: C2 — TTS

```
A lib/tts.ts                                    +25 lines
M components/review/zen/ZenFlashcard.tsx        +15 lines (lemma 包按钮 + hover icon)
M components/review/zen/useZenShortcuts.ts      +10 lines (P 键)
M components/review/zen/ZenReviewProvider.tsx   +5 lines  (onSpeak callback)
```

### 提交 3: C3 — 再来一组

```
M components/review/zen/ZenReviewProvider.tsx   +25 lines (startNextBatch)
M components/review/zen/types.ts                (无改动，复用 REFRESH_QUEUE)
M components/review/zen/ZenSessionSummary.tsx   +15 lines (按钮)
M components/review/zen/useZenShortcuts.ts      可选 +5 lines (N 键)
```

### 提交 4: C4 — 快捷定位

```
M components/review/zen/ZenReviewProvider.tsx   +5 lines  (openWordPage)
M components/review/zen/useZenShortcuts.ts      +10 lines (D 键)
M components/review/zen/ZenFlashcard.tsx        +3 lines  (hint 文案)
```

### 提交 5: 文档 + 验证

```
M docs/zen-review-v3.0-report.md
```

---

## 四、测试计划

### 单元测试

| 文件 | 测试点 |
|------|--------|
| `tests/word-examples-derive.test.ts` | collocations 优先 / corpus 兜底 / legacy 兜底 / 空值 / 超 2 条只取前 2 |
| `tests/zen-shortcuts.test.ts`（已存在则扩展） | D 键 only in back/rating；P 键 only in front/back；N 键 only in done |

### 手动测试 Checklist

#### C1
- [ ] 有 collocations 的词显示结构化例句
- [ ] 只有 legacy examples 的词显示 legacy
- [ ] 完全无例句的词不显示折叠区
- [ ] 切换卡片时折叠状态自动重置
- [ ] 翻面动画期间点击不爆炸

#### C2
- [ ] 桌面 Chrome：点击 lemma 朗读
- [ ] 桌面 Chrome：按 P 朗读
- [ ] iOS Safari：首次点击/按键能朗读
- [ ] 快速连续触发不叠加（cancel 生效）
- [ ] 不支持 TTS 的浏览器静默失败

#### C3
- [ ] 队列耗尽 → done → 点"新一组" → 拉到新卡 → 进入 front
- [ ] 队列耗尽 → done → 点"新一组" → 仍空 → toast + 停留 done
- [ ] 第二批的 sessionHistory 是干净的
- [ ] 加载中按钮 disabled

#### C4
- [ ] back 阶段按 D → 新标签页打开 `/words/[slug]`
- [ ] front 阶段按 D → 无反应
- [ ] done 阶段按 D → 无反应
- [ ] 输入框聚焦时按 D → 无反应
- [ ] drawer 打开时按 D → 无反应

### 回归测试

- [ ] Phase 1 评分流程仍正常
- [ ] Phase 2 Undo 仍正常（特别注意 `restoredItem.previewExamples`）
- [ ] Session Summary v0.1 显示正常

### 自动化

```powershell
npm run typecheck
npm run lint
npm run build
npm test
```

---

## 五、风险与注意事项

### 高风险

| 风险 | 缓解 |
|------|------|
| `restoredItem` 缺 `previewExamples` 字段导致 TS 报错 | 显式 `previewExamples: []` 兜底 |
| `examples Json` 列在生产可能是 `null` | `?? []` 防御 |
| TS 类型 `Json` 强转 `ParsedExample[]` | 抽到 `lib/review/word-examples.ts` 内集中收口 |

### 中风险

| 风险 | 缓解 |
|------|------|
| iOS Safari TTS 偶尔不发声 | 文档化已知问题，不阻塞发布 |
| "再来一组"清空 sessionHistory 用户反感 | 文档说明，必要时加二次确认 |
| `D` 键被某些浏览器扩展拦截 | 不可控，文档化 |

### 低风险

| 风险 | 缓解 |
|------|------|
| 例句过长破坏卡片布局 | CSS `line-clamp-3`；超出 `…` |
| TTS 朗读非英语词条 | V3.0 写死 en-US；后续按 `lang_code` 读 |

---

## 六、不要做的事（红线）

- ❌ 不要修改 `applyReviewAnswer` 或 FSRS 任何逻辑
- ❌ 不要修改 `undo_review_log` RPC
- ❌ 不要在 `/api/review/answer` 加新 SELECT 字段（保持热路径精简）
- ❌ 不要引入 OpenAI / GPT 调用
- ❌ 不要引入新的 npm 依赖（TTS 用原生 API）
- ❌ 不要把 `previewExamples` 写进 `previous_progress_snapshot`
- ❌ 不要破坏 done 阶段现有的 Enter/Esc 退出
- ❌ 不要让 `D` / `P` / `N` 在 input 聚焦时触发
- ❌ 不要在 front phase 暴露完整释义（C1/C4 只在 back 才生效）

---

## 七、推荐执行顺序

```
1. C4 快捷定位 (最简单，半小时)
   ↓
2. C2 TTS (中等，1-2 小时)
   ↓
3. C1 例句 (最复杂，2-3 小时；涉及 API + 类型 + UI)
   ↓
4. C3 再来一组 (中等，1 小时；依赖 fetchQueue 已有)
   ↓
5. 文档 + 验证 + 提交
```

**推荐做法**：每个功能独立 commit，便于回滚。

---

## 八、最终交付

完成后输出：

1. 4 个 feature commit + 1 个 doc commit（共 5 commit）
2. 所有 typecheck / lint / build / test 通过
3. 手动 checklist 全绿
4. 推送到 `main`，等 Netlify 部署完确认线上正常
5. 更新 `docs/zen-review-v3.0-report.md` 给下一轮 GPT-5.5 审查

---

## 九、给下一位 Kimi 2.6 的建议

- **优先读这两个文件理解状态机**：
  - `components/review/zen/ZenReviewProvider.tsx`
  - `components/review/zen/types.ts`
- **不要先写代码**，先把本文档过一遍，确认每个改动点
- **每完成一个 C 项就跑一次 typecheck + 手动测**，不要积压
- **有疑问就问用户**，特别是关于 sessionHistory 清空策略（C3 决策点）
- **commit message 用中文**，与现有项目风格一致
- **不要在本轮做 V3.0 之外的事**（比如优化、重构、文档其他章节）

---

**当前状态**：方案已就绪，等待开始执行。
