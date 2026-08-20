# @ai-party-school/server

数智党校学习系统 - 后端服务。

## 职责
提供 REST API，覆盖组织/用户/内容/任务/试卷/测验/学习记录/统计/AI 等全部业务领域，
含 JWT 鉴权、权限分层（ADMIN/SECRETARY/MEMBER）、文件上传、限流等通用能力。

## 技术栈
- NestJS 10 + TypeScript（CommonJS）
- Prisma 5（本地 SQLite，生产可切 MySQL）
- Passport-JWT 鉴权、bcryptjs 密码哈希
- ioredis 缓存、openai SDK 接入 DeepSeek
- exceljs 导出、multer 文件上传、helmet/throttler 安全加固

## 开发命令
- `pnpm dev` 从根目录启动（watch）
- `pnpm --filter server dev` 单独启动
- `pnpm --filter server build` 构建（输出 dist/）
- `pnpm --filter server prisma:dbpush` 推送 schema
- `pnpm --filter server prisma:seed` 灌种子数据
- `pnpm --filter server start` 运行 dist/main.js

## 依赖关系
- 依赖 `@ai-party-school/shared`（workspace）提供的 DTO、枚举与实体类型。
- 被 admin / mobile 前端通过 HTTP 调用。
