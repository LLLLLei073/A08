# Vercel 静态前端部署

本仓库将党员端与管理端作为两个独立的 Vercel 项目部署；NestJS、MySQL 和 Redis 不包含在本部署中。

| Vercel 项目 | Root Directory | Framework | 输出目录 |
| --- | --- | --- | --- |
| 党员端 | `packages/mobile` | Vite | `dist` |
| 管理端 | `packages/admin` | Vite | `dist` |

## 创建项目

1. 在 Vercel 导入 GitHub 仓库 `LLLLLei073/A08-AI-Party-School-Learning-System`。
2. 创建第一个项目，Root Directory 选择 `packages/mobile`。
3. 创建第二个项目，Root Directory 选择 `packages/admin`。
4. Vercel 会读取各目录中的 `vercel.json`，使用对应构建命令、输出目录和 SPA 路由回退规则。

## 环境变量

分别在两个 Vercel 项目的 Production 与 Preview 环境中设置：

| 项目 | 变量 | 示例 |
| --- | --- | --- |
| 党员端 | `VITE_MOBILE_API_BASE` | `https://api.example.com/api` |
| 管理端 | `VITE_ADMIN_API_BASE` | `https://api.example.com/api` |

`VITE_` 前缀变量会打包到浏览器，只能填写公开 API 地址，不能填写 JWT 密钥、数据库密码或第三方模型密钥。

## 验证

部署完成后检查：

1. 首页、`/login` 与 `/path` 刷新后不会出现 404。
2. 管理端 `/login`、`/knowledge` 与 `/engagement` 刷新后不会出现 404。
3. 未设置线上 API 时，静态页面可以加载，但登录、答题和动态数据无法使用。
4. 设置线上 NestJS API 后，确认其 CORS 白名单包含两个 Vercel 域名。
