# 词条页 · 移动端 TOC chip 导航

mobile/tablet 端在词条详情页顶部提供一条**水平滚动的 sticky chip 条**，让读者一键跳到任意子区块——核心驱动需求是直达 `WordNotes`，无需穿过释义/搭配/语料/拓扑/同义/反义/正文整页内容。

桌面端（≥ `lg`）用 `OwnerWordSidebar` 替代，TOC chip 条 `lg:hidden` 不渲染。

## 用户感知

```
┌─ 释义 · 原型 · 笔记 · 拓扑 · 同义 · 反义 · 搭配 · 语料 · 正文 ─┐  ← sticky chip 条（mobile）
│                                                                  │
│  词条标题 + 词性 + 音标 ...                                       │
│                                                                  │
│  释义                                                             │
│  原型（条件）                                                     │
│  搭配                                                             │
│  ... ...                                                          │
│  正文（条件）                                                     │
│  笔记                                                             │
└──────────────────────────────────────────────────────────────────┘
```

- 点击 chip → smooth scroll 到对应 `<section id="word-...">`
- 滚动过程中，**屏幕中实际进入视口顶部的区块**所对应的 chip 自动高亮
- 分享链接 `/words/foo#word-notes` 首次加载即高亮笔记 chip

## 架构 · 纯函数 + 薄壳

UX 不变量、数据顺序、活动段挑选算法都封在 `lib/word-section-toc.ts` 里——**零 DOM 依赖，可在 Node vitest 中测**。React 组件 `WordSectionTOC.tsx` 只负责 IntersectionObserver 接线和 ARIA 渲染。

| 文件 | 职责 |
|---|---|
| `lib/word-section-toc.ts` | `WordTOCSection` 类型 / `buildWordTOCSections` chip 列表构建 / `pickActiveSectionId` 活动段算法 / `resolveInitialActiveId` 首次 hash 解析 / `TOC_OBSERVER_ROOT_MARGIN` 等观察器常量 |
| `components/words/WordSectionTOC.tsx` | client component；observer 接线、smooth scroll、ARIA |
| `app/(public)/words/[slug]/page.tsx` | 调用 `buildWordTOCSections`；给每个 `<section>` 加 `scrollMt` class |
| `tests/word-section-toc.test.ts` | 29 个用例覆盖以上纯函数 + 观察器约束守卫 |

## UX 不变量（chip 顺序）

```
释义 → [原型?] → 笔记 → 拓扑 → 同义 → 反义 → 搭配 → 语料 → [正文?]
```

| 规则 | 理由 |
|---|---|
| `释义` 永远 slot 0 | 词条入口 |
| `原型` slot 1（条件） | 紧跟释义，承接语义解析 |
| `笔记` 紧跟原型（无原型时紧跟释义） | jump-to-notes 是核心驱动需求；放在拇指最易触及位置 |
| `拓扑/同义/反义` 中段 | 中等优先级浏览 |
| `搭配/语料` 倒数第二段 | 长内容，多用滚动而非跳转 |
| `正文` 绝对末位（条件） | 最长内容，线性阅读为主 |

**chip 顺序 ≠ DOM 渲染顺序**——刻意如此。代价：滚动过程中活动 chip 会在 chip 条上"跳"（不再单调左→右推进）。可接受，因为 chip 条的首要职责是导航而非进度条。

页面 `<section>` DOM 顺序在 `app/(public)/words/[slug]/page.tsx` 中保持视觉顺序，未参与本重排——动 DOM 顺序会牵涉桌面 `OwnerWordSidebar` 的 grid 布局，超出本功能边界。

## Sticky 定位 · CSS 变量协议

两条路由（独立页 / 拦截 modal）使用同一组 CSS 变量协调高度，无 component-side `useMedia` / `useEffect`：

| 变量 | 默认 | 作用 |
|---|---|---|
| `--toc-sticky-top` | `5rem` | chip 条吸附位置（站点 header 高度） |
| `--header-height` | `5rem` | hash 跳转 scroll-margin-top 用 |

- **独立页 `/words/[slug]`**：变量取默认 → chip 条吸顶在 SiteHeader 下方
- **拦截 modal `/(...)words/[slug]`**：路由 segment 在 wrapper 上覆写 `--toc-sticky-top: 0` → chip 条吸附在 modal 内容区顶部，无虚假空白

每个 `<section>` 标 `scrollMt` 响应式 class：

```tsx
"scroll-mt-[calc(var(--toc-sticky-top,5rem)+3.5rem)] lg:scroll-mt-[var(--header-height,5rem)]"
```

- mobile / tablet：吸顶位置 + chip 条自身高度（3.5rem 含呼吸 gap）
- desktop（≥ `lg`）：仅站点 header 高度，因为 chip 条 `lg:hidden` 不存在

## 活动 chip 算法

`pickActiveSectionId` 接收 `IntersectionObserverEntry[]` 的精简形 `ObservedSection[]`：

```ts
{ id, isIntersecting, top }
```

挑选**所有正交叉区块中 `top` 最小（最靠上，含负值）**的那一个 → 高亮其 chip。返回 `null` 表示"无变化，保持上一活动"，避免读者滚到末页时高亮闪灭。

观察器 `rootMargin = "-112px 0px -55% 0px"`：

- 顶部内缩 7rem (= 3rem chip 条 + 4rem 呼吸) → 一个区块刚滑过 chip 条下沿就交出活动权
- 底部内缩 55% → 区块至少进入视口中线才认领活动权

## 边界与防御

| 场景 | 行为 |
|---|---|
| `sections.length === 0` | 组件早返回 `null` |
| 目标 id 在 DOM 中找不到 | `handleClick` 静默 no-op |
| 用户启用 `prefers-reduced-motion` | scroll behavior 退化为 `auto`，跳过 smooth 动画 |
| URL 已带 hash 加载（如分享链接） | `resolveInitialActiveId` 在 `useState` 初值阶段读取 `location.hash`，目标 id 存在则首帧即高亮 |
| hash 指向已被条件门控掉的 chip（如分享 `#word-body` 但词无正文） | `resolveInitialActiveId` 静默回退到首位 chip |
| `history.state` 被 Next.js App Router 占用 | `replaceState(window.history.state, "", '#id')` 保留原 state，不破坏 Back/Forward |

## 测试纪律

29 用例分四组：

| 分组 | 数量 | 焦点 |
|---|---|---|
| `buildWordTOCSections` | 11 | 4 种 (hasPrototype × hasBody) 排列断言完整顺序；笔记/正文位置不变量；id 唯一/命名空间；CJK 标签完整性 |
| `pickActiveSectionId` | 8 | 空集 / 单交叉 / 多交叉 / 负 top / 非交叉项忽略 / 同 top 稳定 / 输入不可变 |
| `resolveInitialActiveId` | 7 | 空 hash / 无 `#` 前缀 / 已知 id / 未知 id / 门控 id / 单 `#` |
| 观察器常量 | 4 | 结构化守卫：每个 token 必须 `^-?\d+(?:px\|%)$`，禁 `rem`/`em` ；像素值反推 |

## 教训 · `rootMargin` 单位 P0

初版 `TOC_OBSERVER_ROOT_MARGIN = "-7rem 0px -55% 0px"` 在浏览器抛 `Failed to construct 'IntersectionObserver': rootMargin must be specified in pixels or percent.`——整个词条页崩溃到错误边界。

更糟的是 **首版回归测试用 `toBe(\`-${...}rem 0px -55% 0px\`)` 把 bug 锁死成"正确"**。CI 全绿，bug 直上生产。

修复双层：

1. 实现层：`lib/word-section-toc.ts` 引入 `PX_PER_REM = 16`，模块加载时预算出 `-112px 0px -55% 0px`。
2. 测试层：把"字面值断言"换成"结构化守卫"——`tokens.split(/\s+/)` 后每个必须正则 `/^-?\d+(?:px|%)$/`。再有人写 `rem` 立刻 CI 红屏。

**结论**：测试断言不能只 mirror 实现字面值；涉及外部 spec（浏览器 API / SQL grammar / 网络协议）时，必须把 spec 约束本身写成断言。

## 可访问性

| 维度 | 实现 |
|---|---|
| 语义 | `<nav aria-label="词条页内导航">` + 普通 `<button>` + `aria-current="location"`（**不是** `role="tab"`，那个语义暗含 tabpanel，本场景不存在） |
| 焦点指示 | 全部 chip 加 `focus-visible:ring-2 ring-offset-2` 配合主题色 |
| 减少动画 | `matchMedia('(prefers-reduced-motion: reduce)')` 命中时切 `behavior: 'auto'` |
| 触摸调优 | `touchAction: 'manipulation'` + `WebkitTapHighlightColor: 'transparent'` 避免 iOS 双击放大与点击灰罩 |
| 滚动条 | Firefox `scrollbarWidth: 'none'` + Chromium `[&::-webkit-scrollbar]:hidden` 双重隐藏 |

## 已知 trade-off

- **活动高亮跳跃**：见 UX 不变量节，刻意接受。
- **`scrollIntoView` 在 iOS Safari 嵌套 `overflow:auto` 中可能跳一下没动**：拦截 modal 内若实测命中需切到手算 `scrollTo()`，目前先观望。
- **chip 间方向键导航缺失**：当前只 Tab，无 Arrow Left/Right 快捷。低优先。
- **dark theme chip 配色未实测**：`text-[var(--color-accent)]` on `bg-[var(--color-surface-muted)]` 在 dark mode 下需肉眼校。
- **桌面 hash 跳转上方剩 0 空隙**：scroll-mt 已响应式覆盖；移动端 hash 跳转下方因 chip 条仍占 3.5rem。

## 后续升级方向

### 方向键 chip 导航
mobile chip 条普遍只用拇指点击，但桌面端键盘用户访问 `/words/[slug]?theme=lg-down` 测试时无法 Arrow 导航。可加 `useKeyboardNav`：
- `ArrowRight` / `ArrowLeft` 在 chip 间循环
- 焦点跟随 `tabindex={0}` / `-1` 翻转

### iOS smooth scroll polyfill
若 modal 内 scroll bug 命中：换用 `seamless-scroll-polyfill` 或手算 `getBoundingClientRect()` + `scrollContainer.scrollTo({ top, behavior })`。

### 活动 chip 自动滚入视口
chip 条横向溢出时，活动 chip 可能在视野外。可加：
```ts
chipBarRef.current?.querySelector(`[data-id="${activeId}"]`)?.scrollIntoView({
  inline: "nearest", behavior: "smooth",
});
```

### 加载状态承接
`Suspense` fallback 期间渲染一条 skeleton chip 条，避免页面 hydration 时短暂闪烁。

## 提交历史（forensic 索引）

| commit | 主题 |
|---|---|
| `255f24e` | feat(words): mobile in-page TOC for word detail with sticky chip nav |
| `423bc57` | test(words): regression coverage for word-detail TOC helpers |
| `77e18aa` | fix(words): harden mobile TOC chip nav (a11y + history-state + reduced-motion) |
| `9aa5c81` | fix(words): IntersectionObserver rootMargin must be px/% not rem |
| `a5159ce` | feat(words): reorder TOC chips for priority access (notes hoisted, body trails) |
