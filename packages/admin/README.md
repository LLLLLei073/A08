# @ai-party-school/admin

数智党校学习系统 - 管理后台（PC 端）。

## 职责
面向 ADMIN/SECRETARY 的后台管理界面：组织与用户管理、内容发布、任务下发、
试卷题库维护、测验/考试管理、学习统计看板、AI 配置等。

## 技术栈
- Vue 3.5 + TypeScript + Vite 5（ESM）
- Element Plus + @element-plus/icons-vue
- Pinia 状态管理、Vue Router 4
- ECharts 5 数据可视化、md-editor-v3 + highlight.js 富文本
- unplugin-auto-import / unplugin-vue-components 自动导入

## 开发命令
- `pnpm dev:admin` 从根目录启动开发服务器
- `pnpm --filter admin dev` 单独启动
- `pnpm --filter admin build` 构建（vue-tsc 类型检查 + vite build）
- `pnpm --filter admin preview` 预览构建产物

## 依赖关系
- 依赖 `@ai-party-school/shared`（workspace）的 DTO/枚举/实体类型。
- 通过 axios 调用 server 提供的 REST API。
