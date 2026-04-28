# Omni-Search 全局命令面板

Vocab Observatory 的全局搜索与命令面板，提供接近 Raycast / Spotlight 的键盘驱动体验。

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+K` / `Cmd+K` | 打开 / 关闭命令面板 |
| `↑` / `↓` | 上下选择结果项 |
| `Enter` | 执行当前选中项 |
| `Escape` | 关闭命令面板 |

> 中文输入法安全：在输入法组词（isComposing）期间，Enter 不会误触发选择。

## 支持的 Item Type

| Type | 说明 | 来源 |
|---|---|---|
| `action` | 快速动作（导航、设置等） | 静态定义 |
| `word` | 词条 | `/api/words?q=` 动态搜索 |
| `semantic-field` | 语义场 / 集合 | `/api/plaza?q=` 动态搜索 |
| `collection` | 集合笔记 | 预留 |
| `navigation` | 页面导航 | 预留 |
| `setting` | 设置项 | 预留 |

## 如何新增一个静态命令

编辑 `components/omni/omni-actions.ts`，在 `omniActions` 数组中添加新项：

```ts
{
  id: "action:my-command",       // 唯一标识，格式 action:xxx
  type: "action",
  title: "我的命令",              // 显示名称
  href: "/my-page",              // 跳转路由（与 action 二选一）
  icon: "Compass",               // lucide-react 图标名
  keywords: ["my", "命令", "自定义"], // 搜索关键词
  // action: () => { ... },      // 或自定义 action 函数
}
```

可用的 icon 名称参考 [lucide-react](https://lucide.dev/icons/)，需在 `OmniResultItem.tsx` 的 `ICON_MAP` 中注册。

## 如何接入词条搜索数据

目前词条搜索通过 `/api/words?q=xxx&limit=12` API 实现，语义场搜索通过 `/api/plaza?q=xxx` 实现。

如需自定义搜索逻辑，修改 `components/omni/useOmniSearch.ts`：

1. **替换 API 端点**：修改 `fetch` URL 即可对接不同后端。
2. **本地索引模式**：如需更快体验，可在 `useOmniSearch` 中导入预构建的词条索引，使用 `useMemo` 过滤，避免网络请求。
3. **结果格式**：API 返回的 `words` 数组每项需包含 `slug`、`title`、`lemma`（可选）、`short_definition`（可选）。

## 文件结构

```
components/omni/
├── types.ts            # 类型定义 (OmniItem, OmniSection)
├── useOmniStore.tsx    # Context + Provider 状态管理
├── omni-actions.ts     # 静态命令 + scoreOmniItem 评分
├── useOmniSearch.ts    # 搜索逻辑 hook
├── useOmniHotkeys.ts   # 快捷键 hook
├── OmniSearchInput.tsx # 搜索输入框
├── OmniResultItem.tsx  # 结果项组件
├── OmniSection.tsx     # 分组标题
├── OmniFooter.tsx      # 底部键盘提示
└── OmniPalette.tsx     # 主面板组件
```

## 后续升级方向

### 最近访问
- 在 localStorage 维护最近访问的词条/命令列表
- 空查询时优先显示最近访问

### Fuse.js 模糊搜索
- `npm install fuse.js`
- 替换 `scoreOmniItem` 为 Fuse.js 的 fuzzy matching
- 支持拼写容错和部分匹配

### Typesense
- 部署 Typesense 搜索服务器
- 词条入索引后实现毫秒级搜索
- 支持中英文分词、同义词扩展

### Upstash Vector
- 使用 Upstash Vector 实现语义搜索
- 词条 embedding 入向量库
- 支持自然语言查询（如"形容短暂的词"）

### AI Semantic Search
- 接入 LLM 生成词条 embedding
- 支持跨语言语义检索
- 结合词条定义、例句做深层语义匹配
