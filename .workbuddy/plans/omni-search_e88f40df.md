---
name: omni-search
overview: 为 Vocab Observatory 实现全局命令面板 Omni-Search，提供 Raycast/Spotlight 级别的键盘驱动搜索体验。使用 React Context 替代 Zustand（无需新增依赖），复用已有 framer-motion / lucide-react / CSS 变量，通过 /api/words 和 /api/plaza 接口获取动态搜索数据，注入到 app/layout.tsx 根布局。
design:
  architecture:
    framework: react
    component: shadcn
  styleKeywords:
    - Glassmorphism
    - Raycast-like
    - Warm academic tones
    - Soft multi-layer shadows
  fontSystem:
    fontFamily: Manrope
    heading:
      size: 18px
      weight: 600
    subheading:
      size: 14px
      weight: 500
    body:
      size: 14px
      weight: 400
  colorSystem:
    primary:
      - "#0f6f62"
      - "#3ec9b4"
    background:
      - rgba(247,240,227,0.95)
      - rgba(48,43,36,0.95)
    text:
      - "#231a12"
      - "#e8e0d4"
      - rgba(35,26,18,0.72)
    functional:
      - rgba(15,111,98,0.08)
      - rgba(103,77,44,0.16)
todos:
  - id: create-types-and-store
    content: 创建 omni 类型定义 types.ts 和状态管理 useOmniStore.tsx (Context + Provider)
    status: completed
  - id: create-actions-and-search
    content: 创建 omni-actions.ts 静态命令 + scoreOmniItem，以及 useOmniSearch.ts 搜索 hook
    status: completed
    dependencies:
      - create-types-and-store
  - id: create-hotkeys
    content: 创建 useOmniHotkeys.ts 快捷键 hook (Ctrl+K/Escape/isComposing)
    status: completed
    dependencies:
      - create-types-and-store
  - id: create-ui-components
    content: 创建 OmniSearchInput、OmniResultItem、OmniSection、OmniFooter 四个 UI 组件
    status: completed
    dependencies:
      - create-types-and-store
  - id: create-omni-palette
    content: 创建 OmniPalette.tsx 主面板组件 (overlay+panel+AnimatePresence+键盘导航)
    status: completed
    dependencies:
      - create-actions-and-search
      - create-hotkeys
      - create-ui-components
  - id: inject-layout-and-tests
    content: 修改 app/layout.tsx 注入 OmniPalette，创建 tests/omni-search.test.ts 测试，创建 docs/omni-search.md 文档
    status: completed
    dependencies:
      - create-omni-palette
---

## 产品概述

为 Vocab Observatory 实现 Omni-Search 全局命令面板，提供接近 Raycast/Spotlight 的键盘驱动体验。

## 核心功能

- **全局快捷键打开**: Ctrl/Cmd+K 打开/关闭，Escape 关闭，点击遮罩关闭
- **居中浮层面板**: Glassmorphism 质感，桌面端 640-760px，移动端自适应
- **多类型搜索**: 快速动作(Actions)、词条(Words)、语义场(Semantic Fields)、导航(Navigation)
- **键盘导航**: ArrowUp/Down 选择，Enter 执行，selectedIndex 自动校正
- **鼠标交互**: hover 设置选中，click 执行
- **搜索评分排序**: 精确匹配 > 前缀匹配 > 包含匹配 > keywords > subtitle
- **动态数据源**: debounce 150ms 调用已有 /api/words 和 /api/plaza 接口
- **静态命令**: 回到首页、开始复习、打开词条列表、打开词汇广场、切换深色模式
- **空/加载/错误状态**: API 失败时保留静态命令可用
- **中文输入法安全**: 检查 isComposing 避免误触发
- **SSR 安全**: next/dynamic 懒加载，不引用 client-only 对象
- **可访问性**: role=dialog/listbox/option, aria-modal, aria-selected
- **结果分组限制**: Actions 最多6, Words 最多12, Semantic Fields 最多6, 总数不超过24
- **文档**: docs/omni-search.md 功能说明与扩展指南
- **测试**: useOmniSearch 搜索逻辑 + 键盘导航逻辑

## 技术栈

- **框架**: Next.js 16 (App Router) + React 19 + TypeScript
- **样式**: Tailwind CSS v4 + 已有 CSS 变量体系 (--color-panel-strong, --color-surface-input 等)
- **动画**: framer-motion v12 (已安装，复用 AnimatePresence + springs 预设)
- **图标**: lucide-react (已安装)
- **状态管理**: React Context + useReducer (无 Zustand，不新增依赖)
- **测试**: Vitest (已安装)
- **数据源**: 已有 /api/words?q=&limit=12 和 /api/plaza?q= 接口

## 实现方案

### 状态管理

使用 React Context + useReducer 实现轻量 store。状态仅包含 isOpen、query、selectedIndex，逻辑简单，不值得引入 Zustand 新依赖。OmniProvider 包裹 OmniPalette，palette 内部消费 context。

### 搜索逻辑

- 静态命令在 omni-actions.ts 中定义，含 title/href/keywords/action
- 动态数据通过 debounce 150ms + AbortController 调用已有 API
- /api/words?q=xxx&limit=12 获取词条，/api/plaza?q=xxx 获取集合
- 两请求并行，任一失败不影响另一
- 搜索评分函数: title 精确=100, 前缀=80, 包含=60, keywords=40, subtitle=20
- 结果按类型分组，每组有数量上限

### 主题切换命令

ThemeToggle 逻辑封装在组件内部无法导出。在 omni-actions.ts 中实现独立 toggleTheme action: 读取 localStorage('theme') → 计算 next → 写入 + setAttribute('data-theme')，与 ThemeToggle.cycleTheme 逻辑一致，无需重构主题架构。

### SSR 安全

- OmniPalette 通过 next/dynamic({ ssr: false }) 懒加载
- 所有 hooks 中 typeof window 检查
- 组件顶部加 "use client"

### 动画

- 复用 framer-motion AnimatePresence + 项目已有 springs 预设
- 打开: opacity 0→1, y -12→0, scale 0.98→1
- 关闭: opacity 1→0, y 0→-8, scale 1→0.98
- 结果项使用 LayoutGroup + layout 动画避免闪烁
- ReducedMotionProvider 已全局处理 prefers-reduced-motion

### 性能

- OmniPalette 懒加载，不影响首屏
- useMemo 缓存搜索结果
- debounce + AbortController 防止重复/过期请求
- 结果总数上限 24，避免大量 DOM

## 目录结构

```
d:\Notes\app\新建文件夹\vocab-observatory\
├── app/
│   └── layout.tsx                    # [MODIFY] 注入动态导入的 OmniPalette
├── components/
│   └── omni/
│       ├── types.ts                  # [NEW] OmniItemType, OmniItem, OmniSection 类型定义
│       ├── useOmniStore.tsx          # [NEW] Context + Provider (isOpen/query/selectedIndex)
│       ├── omni-actions.ts           # [NEW] 静态命令定义 + toggleTheme action + scoreOmniItem
│       ├── useOmniSearch.ts          # [NEW] 搜索逻辑 hook (静态+动态+分组+评分)
│       ├── useOmniHotkeys.ts         # [NEW] 快捷键 hook (Ctrl+K/Escape/isComposing)
│       ├── OmniSearchInput.tsx       # [NEW] 受控搜索输入框 (composition事件+自动focus)
│       ├── OmniResultItem.tsx        # [NEW] 结果项组件 (selected/icon/badge/role=option)
│       ├── OmniSection.tsx           # [NEW] 分组标题组件
│       ├── OmniFooter.tsx            # [NEW] 底部键盘提示 (↑↓ ↵ Esc)
│       └── OmniPalette.tsx           # [NEW] 主面板组件 (overlay+panel+AnimatePresence)
├── tests/
│   └── omni-search.test.ts           # [NEW] useOmniSearch + 键盘导航测试
└── docs/
    └── omni-search.md                # [NEW] 功能文档与扩展指南
```

## 实现注意事项

- 复用已有 CSS 变量，不写死颜色值；面板背景用 --color-panel-strong，输入框用 --color-surface-input
- 复用 .panel / .panel-strong 工具类样式作为 glassmorphism 基础
- 主题切换 action 直接操作 localStorage + data-theme，不依赖 ThemeToggle 组件实例
- 导航跳转使用 next/navigation 的 useRouter().push()，不整页 reload
- OmniProvider 放在 OmniPalette 内部而非根 layout，减少全局 context 开销
- API 请求的 AbortController 在 effect cleanup 中 abort，防止内存泄漏

## 设计风格

采用 Premium Glassmorphism / Raycast-like 风格，与项目已有的暖色调学术氛围融合。面板使用项目已有 .panel-strong 类的 glassmorphism 效果，叠加柔和多层阴影和低透明度边框。

## 布局结构

- Overlay: fixed 全屏，半透明暗色遮罩 + backdrop-blur-sm，点击关闭
- Panel: 居中偏上(top 12vh)，max-w-[720px]，移动端 w-[calc(100vw-24px)]
- 输入区: 大尺寸输入框，左侧 Search 图标，右侧 Esc 提示 badge
- 结果区: role=listbox，max-h-[60vh] overflow-y-auto，分组显示
- 底栏: 固定显示 ↑↓ 选择 / ↵ 打开 / Esc 关闭

## 交互细节

- selected 状态: 柔和 bg-[var(--color-surface-muted)] + 左侧 2px accent 色条
- 结果项: icon(左) + title/subtitle(中) + badge/shortcut(右)
- 空状态: 居中灰色提示文字 "未找到匹配结果"
- 加载状态: 静态命令仍显示，动态区域显示脉冲 skeleton

## SubAgent

- **code-explorer**
- Purpose: 在实施阶段探索具体文件内容和依赖关系，验证实现细节
- Expected outcome: 确认 API 响应格式、组件 props 类型、CSS 变量具体值等