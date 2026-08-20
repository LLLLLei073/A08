# 数智党校学习系统 - 阿里云 Windows Server 部署指南

服务器：阿里云 ECS 2核 2G，Windows Server 2022 数据中心版 64位中文版
公网 IP：120.26.229.95
数据库：MySQL（已部署）

---

## 一、服务器环境准备

### 1.1 安装 Node.js 20+

1. 访问 https://nodejs.org/zh-cn/download 下载 **Node.js 20.x LTS Windows Installer (.msi)**
2. 双击安装，勾选「Add to PATH」，一路下一步完成安装
3. 打开 PowerShell 验证：
   ```powershell
   node -v   # 应显示 v20.x.x
   npm -v
   ```

### 1.2 安装 pnpm 和 PM2

```powershell
npm install -g pnpm@latest
npm install -g pm2@latest
pnpm -v
pm2 -v
```

### 1.3 安装 Git（用于克隆代码）

访问 https://git-scm.com/download/win 下载并安装，全部默认即可。

### 1.4 配置 PM2 开机自启

以**管理员身份**打开 PowerShell：
```powershell
pm2 startup
# 按提示执行类似下面的命令（PM2 会输出具体指令）：
# pm2 save
```

---

## 二、MySQL 数据库准备

### 2.1 创建数据库

打开 MySQL 命令行（或 Navicat / MySQL Workbench），执行：

```sql
CREATE DATABASE IF NOT EXISTS party_school
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
```

### 2.2 确认 root 密码

记下你的 MySQL root 密码，后续会填入 `.env`。

---

## 三、上传代码

### 方式 A：Git 克隆（推荐）

```powershell
cd D:\
git clone <你的仓库地址> A08
cd A08
```

### 方式 B：打包上传（推荐，保证可移植）

> ⚠️ **关键点**：`node_modules` 内含 pnpm 软链接与平台相关的原生二进制（Prisma / esbuild），
> 多数压缩工具（含 Windows 资源管理器自带压缩）**不会保留软链接**，且跨 CPU 架构会失效。
> 因此请**不要打包 `node_modules`**，目标机上用 `pnpm install` 重新安装即可。

1. 在本地用 7-Zip 打包（排除以下内容）：
   ```
   A08.zip 排除: node_modules, **/node_modules, dist, **/dist,
                    packages/server/public, logs, *.db, *.db-journal,
                    packages/server/uploads/*, *.timestamp-*.mjs
   ```
   即保留：源码、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`package.json`、
   `.npmrc`、`.env.production`、各包 `package.json`、`scripts/`、未编译的 `dist` 可带可不带。
2. 上传并解压到目标机（如 `D:\A08` 或任意目录）。
3. 在目标机执行：
   ```powershell
   cd <项目目录>
   pnpm install        # 按 lockfile 安装，并自动 approve prisma/esbuild 原生构建
   pnpm run setup      # 构建 shared、生成 Prisma Client、建表、灌种子数据
   pnpm start          # 启动服务（node packages/server/dist/main.js）
   ```
   > 若只需跑后端 API 调试，可跳过前端构建，直接 `pnpm dev:server`。

### 方式 B 备选：完整拷贝整个文件夹

若目标机与源机**操作系统与 CPU 架构完全相同**（如都是 Windows x64），且你使用 **7-Zip**
（勾选「压缩时保存符号链接 / symbolic links」）打包，也可连同 `node_modules` 一起拷贝。
拷贝后请确保：

- `packages/server/.env` 中的 `DATABASE_URL` 仍是相对路径 `file:./dev.db`
  （已在本仓库修正，不再含本机绝对路径）。
- 直接 `pnpm start` 或 `pnpm dev:server` 即可，无需 `pnpm install`。
- 若换架构 / 系统，务必改回「方式 B 推荐」重新安装。

---

## 四、配置环境变量

### 4.1 创建 server 端 .env

```powershell
cd D:\A08
copy .env.production packages\server\.env
notepad packages\server\.env
```

按以下内容修改：

```env
# MySQL 数据库（替换 YOUR_PASSWORD 为你的 root 密码）
DATABASE_URL="mysql://root:YOUR_PASSWORD@localhost:3306/party_school"

# JWT 密钥（改成 32+ 位随机字符串，可用 PowerShell 生成：
#   -join ((48..122) | Get-Random -Count 40 | % {[char]$_})
JWT_SECRET="your-random-32-chars-or-longer-string"
JWT_EXPIRES_IN="7d"
JWT_REFRESH_EXPIRES_IN="30d"

# 服务器
SERVER_PORT=3000
SERVER_PREFIX="/api"
CORS_ORIGINS=""

# 上传
UPLOAD_DIR="uploads"
UPLOAD_MAX_SIZE="200MB"

# DeepSeek AI（在 https://platform.deepseek.com 申请）
DEEPSEEK_API_KEY="sk-your-real-deepseek-api-key"
DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"
DEEPSEEK_CHAT_MODEL="deepseek-chat"
DEEPSEEK_REASONER_MODEL="deepseek-reasoner"
```

保存关闭。

---

## 五、执行部署脚本

```powershell
cd D:\A08
powershell -ExecutionPolicy Bypass -File scripts\deploy-windows.ps1
```

脚本会自动完成：
1. 检查 Node/pnpm/PM2 环境
2. 安装项目依赖
3. 切换 schema 到 MySQL 版本
4. 构建 shared / server / admin / mobile
5. 应用数据库迁移并灌入种子数据
6. 启动 PM2 进程

**首次执行预计耗时 5-10 分钟**（依赖安装 + 构建）。

---

## 六、安全组配置

在阿里云控制台 → ECS → 网络与安全组 → 安全组规则，添加以下入方向规则：

| 协议 | 端口范围 | 授权对象 | 说明 |
|------|---------|---------|------|
| TCP | 80 | 0.0.0.0/0 | HTTP（可选，用于反代到 3000） |
| TCP | 3000 | 0.0.0.0/0 | Web + API |
| TCP | 22 | 你的 IP | 远程桌面（建议限定来源 IP） |

> 最低开放 3000 端口即可访问。80 端口可选（用于 IIS/Nginx 反代）。

---

## 七、访问验证

部署完成后，在浏览器打开：

| 入口 | 地址 |
|------|------|
| 移动端学习平台 | http://120.26.229.95:3000/ |
| 管理后台 | http://120.26.229.95:3000/admin/ |
| API 健康检查 | http://120.26.229.95:3000/api/health |

默认账号：
- 系统管理员：`admin` / `admin123`（管理后台）
- 支部书记：`secretary1` / `admin123`（管理后台 + 移动端）
- 党员：`member1` ~ `member6` / `Party@123456`（仅移动端）

---

## 八、常用运维命令

```powershell
# 查看 PM2 进程状态
pm2 status

# 查看实时日志
pm2 logs party-school-api

# 查看最近 100 行日志
pm2 logs party-school-api --lines 100

# 重启服务
pm2 restart party-school-api

# 停止服务
pm2 stop party-school-api

# 删除进程
pm2 delete party-school-api
```

---

## 九、更新代码

```powershell
cd D:\A08

# 1. 拉取最新代码
git pull

# 2. 重新执行部署脚本
powershell -ExecutionPolicy Bypass -File scripts\deploy-windows.ps1
```

> 脚本会自动跳过数据库种子（如果数据已存在），不会覆盖线上数据。

---

## 十、故障排查

### 10.1 启动失败：`Environment variable not found: DATABASE_URL`

检查 `packages/server/.env` 文件是否存在且内容正确：
```powershell
type packages\server\.env
```

### 10.2 数据库连接失败：`ECONNREFUSED` 或 `Access denied`

1. 确认 MySQL 服务已启动：
   ```powershell
   Get-Service *mysql*
   ```
2. 测试连接：
   ```powershell
   mysql -u root -p -e "SHOW DATABASES;"
   ```
3. 检查 `.env` 中 `DATABASE_URL` 的用户名/密码/端口是否正确。

### 10.3 端口 3000 被占用

```powershell
# 查看占用进程
netstat -ano | findstr :3000
# 按 PID 杀进程（替换 PID）
taskkill /PID <PID> /F
```

### 10.4 前端页面空白

打开浏览器 F12 控制台，检查：
- 静态资源 404 → 确认 `packages/server/public/admin` 和 `public/mobile` 目录存在
- API 跨域错误 → 已通过同源部署规避，不应出现

### 10.5 内存不足（2G 服务器）

PM2 已配置 `max_memory_restart: '512M'`，超限自动重启。
如频繁重启，可降低构建内存占用：
```powershell
cd D:\A08
$env:NODE_OPTIONS="--max-old-space-size=1024"
pnpm --filter admin build
```

---

## 十一、备份建议

### 11.1 数据库备份

每天定时导出 MySQL：
```powershell
# 创建备份目录
mkdir D:\backup\mysql

# 手动备份
mysqldump -u root -p party_school > D:\backup\mysql\party_school_$(Get-Date -Format yyyyMMdd).sql

# 配置 Windows 任务计划程序每天凌晨 3 点自动备份
```

### 11.2 上传文件备份

```powershell
# 备份上传目录
Copy-Item D:\A08\packages\server\uploads D:\backup\uploads_$(Get-Date -Format yyyyMMdd) -Recurse
```

---

## 十二、可移植性说明（换机器运行本项目）

本项目已针对「拷贝到另一台电脑仍能用 pnpm 跑起来」做了如下加固：

1. **数据库路径可移植**：`packages/server/.env` 的 `DATABASE_URL` 改为相对路径
   `file:./dev.db`，SQLite 文件自动落在 `packages/server/prisma/dev.db`，
   不再绑定本机绝对路径。模板见 `packages/server/.env.example`。
2. **构建产物路径与启动脚本一致**：`nest build` 现在输出到
   `packages/server/dist/main.js`，与 `package.json` 的 `start` 脚本、
   `ecosystem.config.cjs` 的 `script` 完全一致，`pnpm start` 可直接运行。
3. **安装即可运行**：server 包加了 `postinstall` 自动执行 `prisma generate`，
   干净安装后 Prisma Client 立即可用；根 `package.json` 的 `pnpm.onlyBuiltDependencies`
   作为 `allowBuilds` 的跨版本兜底，确保 prisma/esbuild 原生二进制在新机器被构建。
4. **无残留绝对路径**：已删除内含本机路径的 Vite 临时缓存 `*.timestamp-*.mjs`
   （已加入 `.gitignore`）。

### 标准运行流程（推荐）

```powershell
# 1. 安装依赖（需 Node 20+ / pnpm 9+，推荐 11.x）
pnpm install

# 2. 首次运行初始化数据库（建表 + 种子数据，仅 SQLite 本地开发需要）
pnpm run db:init

# 3. 启动后端
pnpm start                 # 生产式：node packages/server/dist/main.js
# 或开发模式（热重载，无需先 build）：
pnpm dev:server

# 4.（可选）构建并托管前端
pnpm build                 # 构建 shared/server/admin/mobile，前端产物进 packages/server/public
```

### 端口与入口

| 入口 | 地址 |
|------|------|
| 移动端学习平台 | http://localhost:3000/ |
| 管理后台 | http://localhost:3000/admin/ |
| API 健康检查 | http://localhost:3000/api/health |

> 未构建前端时，仅 API 与 `/uploads` 可用；`main.ts` 已对缺失的
> `public/admin`、`public/mobile` 做 `existsSync` 容错，不会因缺少前端产物而崩溃。

---

## 附录：架构说明

```
阿里云 ECS (120.26.229.95)
└── D:\A08
    ├── packages/
    │   ├── server/                # NestJS 后端
    │   │   ├── dist/main.js       # 编译产物（PM2 运行此文件）
    │   │   ├── public/
    │   │   │   ├── admin/         # admin vite build 输出
    │   │   │   └── mobile/        # mobile vite build 输出
    │   │   ├── uploads/           # 用户上传文件
    │   │   └── .env               # 环境变量
    │   ├── admin/                 # 源码（仅构建时用）
    │   ├── mobile/                # 源码（仅构建时用）
    │   └── shared/                # 共享类型（仅构建时用）
    ├── ecosystem.config.cjs       # PM2 配置
    ├── logs/                      # 运行日志
    └── scripts/
        ├── deploy-windows.ps1     # 一键部署脚本
        └── init-mysql.sql         # 建库脚本
```

**端口 3000 同时提供**：
- `/api/*` → NestJS API
- `/admin/*` → 管理后台静态文件
- `/` → 移动端静态文件
- `/uploads/*` → 用户上传文件

无需 Nginx/IIS，单端口单进程即可对外服务。
