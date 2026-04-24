# Vocab App

一个基于 `Next.js + Supabase + Vercel` 的 Obsidian 词汇知识库 MVP。

## 功能范围

- 公开词条浏览：`/`、`/words`、`/words/[slug]`
- Owner 登录：Supabase Magic Link
- 私有学习层：`/review`、`/dashboard`、`/notes`
- GitHub 仓库同步：`/api/imports/github`
- Markdown 解析：面向 `Obsidian-Eg/Wiki/L0_单词集合/*.md`
- 复习调度：`ts-fsrs`

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 复制环境变量

```bash
cp .env.example .env.local
```

3. 至少填写以下变量

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OWNER_EMAIL=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
IMPORT_SECRET=
CRON_SECRET=
```

4. 在 Supabase 执行迁移

- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0002_rls.sql`
- `supabase/migrations/0003_import_tracking.sql`
- `supabase/migrations/0004_note_revisions.sql`

5. 启动开发环境

```bash
npm run dev
```

6. 首次导入词条

```bash
curl -X POST http://localhost:3000/api/imports/github \
  -H "Authorization: Bearer <IMPORT_SECRET>"
```

也可以直接运行脚本：

```bash
npm run sync:vault
```

## 主要接口

- `GET /api/words`
- `GET /api/words/[slug]`
- `POST /api/review/add`
- `GET /api/review/queue`
- `POST /api/review/answer`
- `GET|PUT /api/notes/[wordId]`
- `GET /api/stats/summary`
- `GET|POST /api/imports/github`

## Vercel 部署说明
- 详见 [docs/DEPLOY_VERCEL.md](./docs/DEPLOY_VERCEL.md)
- 日常维护文档：
  - [人工版](./docs/维护-操作指导-人工版.md)
  - [AI Agent 版](./docs/维护-操作指导-AI-Agent版.md)
- 在 Vercel 配置与本地一致的环境变量
- `vercel.json` 已内置每日一次的 Cron
- 如果设置了 `CRON_SECRET`，Vercel Cron 会携带 `Authorization: Bearer <CRON_SECRET>`
- 内容主库默认是公开仓库
  - `OBSIDIAN_REPO_OWNER=zc63463-cmyk`
  - `OBSIDIAN_REPO_NAME=Obsidian-Eg`
  - `OBSIDIAN_REPO_BRANCH=main`

## 测试

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
