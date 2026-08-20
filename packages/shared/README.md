# @ai-party-school/shared

数智党校学习系统 - 跨端共享类型包。

## 职责
集中定义前后端共用的类型与常量，保证三端（server/admin/mobile）类型一致：
- 枚举：Role / ContentType / QType / QuizType
- 实体接口：UserEntity / ContentEntity / PaperEntity / QuizEntity 等
- DTO（class + class-validator 装饰器）：LoginDto / CreatePaperDto / SubmitQuizDto 等
  （DTO 必须是 class，NestJS ValidationPipe 才能运行时校验）
- AI / 统计相关接口与配置类型

## 技术栈
- TypeScript 5（tsc 编译为 CommonJS dist）
- class-validator + class-transformer（DTO 运行时校验）
- reflect-metadata

## 开发命令
- `pnpm --filter shared build` 编译到 dist/
- `pnpm --filter shared dev` watch 模式编译

## 依赖关系
- 无业务依赖；被 server / admin / mobile 三个包以 `workspace:*` 引用。
- 修改后需重新 build（或 dev watch）才能被 server 的 CommonJS 引用解析到最新 dist。
