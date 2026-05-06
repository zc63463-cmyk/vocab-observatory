# Vocab Observatory Dogfood 测试报告

**测试时间**: 2026-05-06
**测试目标**: https://vocab-observatory-git-dev-zc63463-8447s-projects.vercel.app/
**测试类型**: 深度功能测试 + 性能兼容性测试

---

## 1. 执行摘要

本次测试按照dogfood技能工作流程（初始化、定向、探索、记录问题、生成报告）对词汇知识库应用进行了全面测试。测试覆盖公开浏览层和私有学习层的核心功能。

**总体评估**: 功能完整性良好，主要功能正常运行，发现若干次要问题需要关注。

---

## 2. 功能完整性测试结果

### 2.1 公开浏览层（访客功能）

| 功能模块 | 测试状态 | 结果 |
|---------|---------|------|
| 首页加载 | 已测试 | 通过 |
| 词条搜索 | 已测试 | 通过 |
| 语义场筛选 | 已测试 | 通过 |
| 词频筛选 | 已测试 | 通过 |
| 词条详情页 | 已测试 | 通过 |
| 词汇拓扑图谱 | 已测试 | 通过 |
| Bento卡片展开/收起 | 已测试 | 通过 |
| 词汇广场 | 已测试 | 通过 |
| 广场搜索 | 已测试 | 通过 |
| 广场类型筛选 | 已测试 | 通过 |
| Omni搜索（Ctrl+K） | 已测试 | 通过 |
| 移动端菜单 | 已测试 | 通过 |
| 面包屑导航 | 已测试 | 通过 |
| 页内导航（TOC） | 已测试 | 通过 |

### 2.2 私有学习层（Owner功能）

| 功能模块 | 测试状态 | 结果 |
|---------|---------|------|
| 登录页面 | 已测试 | 通过 |
| 邮箱验证码发送 | 已测试 | 通过 |
| 权限控制（复习页重定向） | 已测试 | 通过 |

---

## 3. 性能和兼容性评估

### 3.1 加载性能

| 页面 | 首屏加载 | 交互响应 |
|-----|---------|---------|
| 首页 | 快速 | 良好 |
| 词条列表 | 快速 | 良好 |
| 词条详情 | 中等 | 良好 |
| 词汇广场 | 快速 | 良好 |
| 登录页 | 快速 | 良好 |

### 3.2 浏览器兼容性

- **Next.js 15**: 使用App Router，支持现代浏览器
- **React 19**: 使用最新特性
- **响应式设计**: 支持移动端和桌面端

---

## 4. 发现的问题

### 4.1 高优先级问题

**无**

### 4.2 中优先级问题

1. **React Hydration错误**
   - 错误信息: `Minified React error #418`
   - 影响: 可能导致客户端渲染不一致
   - 建议: 检查服务端和客户端渲染差异

2. **请求取消错误（ERR_ABORTED）**
   - 多个RSC请求被取消
   - 影响: 可能是页面切换时的正常行为，但需确认
   - 建议: 检查请求取消逻辑

### 4.3 低优先级问题

1. **Vercel Live反馈脚本错误**
   - `.well-known/vercel/jwe` 404错误
   - 影响: 仅影响预览环境功能
   - 建议: 生产环境可忽略

2. **主题颜色获取错误**
   - `getThemeColors` TypeError
   - 影响: 可能影响主题切换
   - 建议: 检查主题配置

### 4.4 修订记录（2026-05-06，代码审查后）

经全仓代码审查，对上述四条问题的真实根因与处置如下：

1. **React Hydration #418** —— **真实 bug，已修复**。
   - 根因：`@/lib/utils.ts` 的 `formatDate` / `formatDateTime`、`@/components/words/WordReviewTimeline.tsx` 的本地 `formatDate` 与 weekgrid `dateLabel` 调用 `Intl.DateTimeFormat("zh-CN", {...})` 与 `Date.prototype.getFullYear/Month/Date()` 时 **未传 `timeZone`**，运行时 TZ 即作为格式化时区。
   - 触发：服务端在 Vercel 上以 UTC 运行，客户端在用户本地 TZ（中国大陆即 Asia/Shanghai = UTC+8）渲染；同一 ISO 时间戳跨 UTC 0 点时，两端格式化得到不同的日历日，触发 React #418 文本不一致。
   - 修复：将 `timeZone: "Asia/Shanghai"` 显式注入所有 `Intl.DateTimeFormat` 调用，并以同一时区的 `Intl.DateTimeFormat("en-CA", ...)` 替换 `getFullYear/Month/Date` 字符串拼接。`@/components/motion/AnimatedCounter.tsx` 的 `toLocaleString()` 同步显式传入 `"zh-CN"`，关闭潜在的 locale 漂移路径。
   - 回归保险：新增 `@/tests/format-date-hydration.test.ts`，用 `process.env.TZ` 切换三个时区，断言输出字节级一致。

2. **请求取消（ERR_ABORTED）** —— **误报，无需修复**。
   - 这些是 Next.js App Router 在路由切换时主动取消旧 RSC fetch 留下的 DevTools Network 行，并不会以 JS 异常的形式抛到运行时。代码库中所有用户态 fetch（`@/components/omni/useOmniSearch.ts`、`@/components/words/WordsSearchShell.tsx`、`@/hooks/useFilteredSearch.ts` 等）都已在 `controller.signal.aborted` 后短路状态写入，不存在悬挂 Promise 或竞态。

3. **`getThemeColors` TypeError** —— **误报，无对应符号**。
   - 全仓 `grep getThemeColors` 仅命中本报告自身，源代码中并不存在该函数；最相近的真实导出是 `@/lib/mastery-network-layout.ts:367` 的 `getRetrievabilityColor`。判定为 dogfood agent 在解析压栈轨迹时对符号名做了不准确的还原。需要真实栈轨迹方能进一步处理，暂关闭此条。

4. **Vercel Live `.well-known/vercel/jwe` 404** —— **误报，预览环境特性**。
   - 该端点仅存在于 Vercel Preview 注入的 Live 反馈脚本，生产部署不受影响，无需调整。

---

## 5. 功能亮点

1. **丰富的词条信息展示**
   - 核心释义、词根词缀、记忆锚点
   - 原型、语义链路、词性转换
   - 搭配、语料、同义辨析、反义
   - 派生词、词汇拓扑图谱

2. **优秀的交互设计**
   - Bento卡片式布局
   - 平滑的展开/收起动画
   - 词汇拓扑图可视化

3. **完善的搜索功能**
   - 全局Omni搜索（Ctrl+K）
   - 多维度筛选（语义场、词频）
   - 广场内容搜索

4. **清晰的权限分离**
   - 公开浏览层和私有学习层分离
   - 未登录用户正确重定向到登录页

---

## 6. 截图记录

1. `01-homepage-initial.png` - 首页初始状态
2. `02-search-results.png` - 搜索结果页
3. `03-word-detail-abandon.png` - 词条详情页（abandon）
4. `04-topology-expanded.png` - 词汇拓扑图谱展开
5. `05-plaza-page.png` - 词汇广场页
6. `06-login-page.png` - 登录页面
7. `07-omni-search-open.png` - Omni搜索打开状态

---

## 7. 建议

1. **修复React Hydration错误** - 优先处理
2. **优化请求取消逻辑** - 减少不必要的错误日志
3. **添加加载状态指示器** - 提升用户体验
4. **完善错误边界处理** - 增强应用稳定性

---

## 8. 结论

Vocab Observatory应用整体功能完整，用户体验良好。主要功能模块运行正常，发现的次要问题不影响核心功能使用。建议在下次迭代中修复中优先级问题。

**测试完成时间**: 2026-05-06
**测试执行者**: Dogfood Agent
