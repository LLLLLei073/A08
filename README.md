# 基于 AI 的数智党校学习系统

面向党委管理员、支部书记和党员的双端学习平台。管理端提供组织、人员、内容、任务、题库、试卷、考试、统计、AI 查询、AI 报告、群聊和通知管理；移动端提供学习、答题、错题、报告、消息与通知能力。

## 技术架构

- 服务端：NestJS 10、Prisma 5、MySQL（生产）/ SQLite（本地）、Redis、DeepSeek/OpenAI 兼容接口
- 管理端：Vue 3、Vite、Pinia、Element Plus、ECharts
- 移动端：Vue 3、Vite、Pinia、Vant
- Monorepo：pnpm workspace，共享 DTO、枚举和接口位于 `packages/shared`

## 环境要求

- Node.js 20.19+
- pnpm 9+（仓库锁定版本见 `packageManager`）
- 本地开发可只使用 SQLite；推荐启动 Redis 以验证缓存、推荐和报告调度
- 生产环境使用 MySQL 8+ 与 Redis

## 本地启动

```bash
pnpm install
copy packages\server\.env.example packages\server\.env
pnpm db:init
pnpm dev
```

默认地址：

- 管理端：`http://localhost:5173/admin/`
- 移动端：`http://localhost:5174/`
- API：`http://localhost:3000/api`
- 健康检查：`http://localhost:3000/api/health`

开发 seed 会创建 `admin`、`secretary1` 和 `member1`～`member6`。演示密码只用于本地环境，首次登录必须修改；生产部署必须通过 `SEED_ADMIN_PASSWORD`、`SEED_SECRETARY_PASSWORD`、`SEED_MEMBER_PASSWORD` 提供至少 12 位的独立密码。

## 常用命令

```bash
pnpm dev                 # 同时启动服务端、管理端和移动端
pnpm build               # 构建全部包
pnpm test                # 运行 Vitest
pnpm lint                # 运行 ESLint
pnpm format              # 格式化源码
pnpm db:init             # 本地 SQLite 建表并写入演示数据
```

单独检查类型：

```bash
packages/server/node_modules/.bin/tsc -p packages/server/tsconfig.json --noEmit
packages/shared/node_modules/.bin/tsc -p packages/shared/tsconfig.json --noEmit
packages/admin/node_modules/.bin/vue-tsc -p packages/admin/tsconfig.json --noEmit
packages/mobile/node_modules/.bin/vue-tsc -p packages/mobile/tsconfig.json --noEmit
```

## 配置

本地模板在 `packages/server/.env.example`，生产模板在 `.env.production`。生产环境至少需要配置：

- `DATABASE_URL`
- `JWT_SECRET`（随机、至少 32 位）
- `CORS_ORIGINS`（跨域部署时填写明确白名单；同源部署可留空）
- 三个 `SEED_*_PASSWORD`（首次执行 seed 时）
- AI 服务的 API Key、地址和模型名

访问令牌默认 15 分钟，刷新令牌默认 30 天，均只写入 HttpOnly Cookie。修改密码、后台重置密码、角色或组织变化会让旧令牌失效。

## 数据库与部署

本地开发使用 `packages/server/prisma/schema.prisma`（SQLite），生产迁移使用 `schema.mysql.prisma`。全新生产环境：

```bash
pnpm --filter server prisma:generate:mysql
pnpm --filter server prisma:deploy
pnpm --filter server prisma:seed
```

Windows Server 可执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-windows.ps1
```

已有但未纳入 Prisma Migrate 的数据库不能直接执行初始迁移；请先备份，并按 Prisma baseline 流程将初始迁移标记为已应用。

## 安全与数据口径

- 支部书记的数据查询、统计和 AI 报告严格限制在本支部。
- 考试开始时间由服务端持久化，刷新页面不会重置倒计时。
- 学习时长按服务端观察到的心跳增量累计，趋势使用每日增量表。
- 生产环境未配置 CORS 白名单时只允许同源请求。
- 上传同时校验扩展名、文件头和解压后大小。

更详细的操作说明见 `docs/用户使用手册.md`；本轮生产化设计与实施清单位于 `docs/plans/`。
