# @ai-party-school/mobile

数智党校学习系统 - 党员移动端（H5）。

## 职责
面向 MEMBER 党员的移动学习端：登录、内容学习、测验/考试答题、
学习任务、AI 个性化推荐、AI 综合评价报告、个人中心。

## 技术栈
- Vue 3.5 + TypeScript + Vite 5（ESM）
- Vant 4 组件库 + @vant/auto-import-resolver 自动导入
- Pinia 状态管理、Vue Router 4
- ECharts 5 图表、md-editor-v3 + highlight.js 内容渲染
- axios 调用后端 API

## 开发命令
- `pnpm dev:mobile` 从根目录启动开发服务器
- `pnpm --filter mobile dev` 单独启动
- `pnpm --filter mobile build` 构建（vue-tsc 类型检查 + vite build）
- `pnpm --filter mobile preview` 预览构建产物

## 依赖关系
- 依赖 `@ai-party-school/shared`（workspace）的 DTO/枚举/实体类型。
- 通过 axios 调用 server 提供的 REST API。
