# 数智党校 Windows Server 生产部署实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将当前数智党校系统安全、可验证、可回滚地部署到阿里云 Windows Server 生产环境，并建立 HTTPS、进程自恢复、备份、监控和后续发布流程。

**Architecture:** 默认采用“单台 Windows Server ECS 运行 Caddy + PM2/NestJS，阿里云 RDS MySQL 与云数据库 Redis 提供状态服务”的同源架构。Caddy 只公开 80/443 并反向代理到本机 `127.0.0.1:3000`；NestJS 同时托管 API、`/admin/` 管理端、`/` 移动端和 `/uploads/` 文件。源码按 release 目录保留至少两个版本，上传文件放在 release 目录外，数据库变更通过 Prisma Migrate 管理。

**Tech Stack:** Windows Server 2022、Node.js 24 LTS、pnpm 11.15.0、PM2、Caddy 2、NestJS 10、Prisma 5、MySQL 8、Redis、阿里云 ECS/RDS/Redis/DNS/云监控。

---

## 0. 适用范围、假设和上线红线

本计划基于仓库当前实现：

- 根目录 `package.json` 要求 Node.js `>=20.19.0`，但截至 2026-08-13 Node.js 20 已结束官方支持，因此生产机使用 Node.js 24 LTS。
- `scripts/deploy-windows.ps1` 已实现依赖安装、MySQL Prisma Client 生成、四个 workspace 构建、`migrate deploy`、seed、PM2 启动和 `pm2 save`。
- `ecosystem.config.cjs` 当前只启动一个 fork 进程，单次切换会有短暂重启，不承诺零停机。
- `packages/server/src/main.ts` 支持 `SERVER_HOST`，生产环境必须显式设为 `127.0.0.1`，避免 3000 端口直接暴露。
- `packages/server/src/health.controller.ts` 在 MySQL 或 Redis 不可用时返回 HTTP 503；Redis 虽可业务降级，但不能通过本计划的生产就绪验收。
- 生产 MySQL 当前只有一条初始迁移：`packages/server/prisma/migrations/20260813130000_init_mysql/migration.sql`。已有数据库不可直接执行这条迁移。
- 当前上传目录默认位于代码目录，生产环境必须改成 release 目录之外的持久化路径。

以下任一项未满足时停止上线：

- 中国内地 ECS 使用的域名尚未完成 ICP 备案，或 DNS 未指向目标 ECS。
- 未明确数据库属于“全新空库”还是“已有业务库”。
- 没有数据库和上传文件备份，或未验证备份可读。
- `pnpm test`、lint、完整生产构建或 MySQL schema 差异检查失败。
- `packages/server/.env` 仍含 `YOUR_PASSWORD`、`CHANGE_ME`、`please-change` 或 `sk-your`。
- 3000、3306、6379 任一端口可从公网访问。
- 健康检查不是 HTTP 200 且 `status=ok`、`db=connected`、`redis=connected`。

## 1. 目标拓扑

```text
Internet
   |
   | TCP 80/443
   v
Windows Server ECS
   |
   +-- Caddy Windows Service
   |      |
   |      +-- HTTP 127.0.0.1:3000
   |             |
   |             +-- PM2 -> NestJS
   |                    +-- /api/*
   |                    +-- /admin/*
   |                    +-- /*
   |                    +-- /uploads/*
   |
   +-- D:/data/ai-party-school/uploads
   +-- D:/apps/ai-party-school/releases/<release-id>

NestJS -- VPC --> RDS MySQL 8
NestJS -- VPC --> Redis
NestJS -- HTTPS --> DeepSeek API
```

最终入口：

- 移动端：`https://<DOMAIN>/`
- 管理端：`https://<DOMAIN>/admin/`
- API：`https://<DOMAIN>/api`
- 健康检查：`https://<DOMAIN>/api/health`

推荐资源：

- ECS：4 vCPU、8 GiB RAM、Windows Server 2022、系统盘 80 GiB，另配 100 GiB 以上数据盘。
- RDS MySQL 8：至少 2 vCPU、4 GiB，开启自动备份；与 ECS 同一 VPC/地域。
- Redis：至少 1 GiB，开启密码，白名单仅允许 ECS 私网地址。
- 若首期仅为低并发演示，可降低规格，但数据库和 Redis 仍不得对公网开放。

## 2. 时间线和责任

| 时间 | 工作 | 产出/门槛 |
|---|---|---|
| T-7～T-3 天 | 域名、ICP、ECS、RDS、Redis、预算确认 | 资源可用，域名具备上线资格 |
| T-2 天 | 在测试库完整演练部署和恢复 | 演练记录、实际耗时、问题清单 |
| T-1 天 | 冻结发布版本，完成测试和生产构建 | 唯一 Git commit/tag |
| T-2 小时 | 生产备份、RDS 手工快照、变更通知 | 备份路径和快照 ID |
| T0 | 构建新 release、迁移、切换 PM2、启用 HTTPS | 健康检查通过 |
| T+30 分钟 | 业务和安全验收 | Go/No-Go 签字 |
| T+24 小时 | 观察错误率、资源、备份任务 | 关闭变更窗口 |

至少明确：

- 发布执行人：操作 Windows、PM2、Caddy。
- 数据库负责人：确认空库/已有库路径、备份和迁移。
- 业务验收人：验证管理员、书记、党员三种角色。
- 回退决策人：门槛失败时决定应用回退或数据库恢复。

## 3. Task 1：补齐仓库部署资产

**Files:**

- Modify: `package.json`
- Modify: `.env.production`
- Modify: `scripts/deploy-windows.ps1`
- Modify: `ecosystem.config.cjs`
- Create: `ops/windows/Caddyfile.example`
- Create: `ops/windows/backup-production.ps1`
- Create: `ops/windows/health-check.ps1`
- Create: `docs/DEPLOY_WINDOWS.md`
- Test: `scripts/deploy-windows.ps1` 在临时 MySQL 8 数据库上的演练

这一步在正式连接服务器前完成，不直接改生产环境。

### Step 1：收紧运行时版本

将 `package.json` 的生产运行时基线改为：

```json
"engines": {
  "node": ">=22.0.0 <25",
  "pnpm": ">=11.15.0 <12"
},
"packageManager": "pnpm@11.15.0"
```

在 `scripts/deploy-windows.ps1` 中解析 `node -v` 和 `pnpm -v`，不在范围内时退出，不要只检查命令是否存在。

Expected: Node 24.x、pnpm 11.15.0 通过；Node 20/26 或 pnpm 12 被拒绝。

### Step 2：扩充生产模板

在 `.env.production` 中加入：

```dotenv
SERVER_HOST="127.0.0.1"
UPLOAD_DIR="D:/data/ai-party-school/uploads"
```

保留 `CORS_ORIGINS=""`，因为本计划采用同源部署。

### Step 3：让脚本支持可控 seed

为 `scripts/deploy-windows.ps1` 增加：

```powershell
param(
    [switch]$SkipSeed,
    [switch]$SkipRestart
)
```

行为要求：

- 第一次部署不传 `-SkipSeed`。
- 后续发布传 `-SkipSeed`，避免重复做生产 seed。
- 演练构建传 `-SkipRestart`，不切换在线进程。
- PM2 使用明确的 start/reload 流程，健康检查通过后才 `pm2 save`。
- 任一步骤失败都返回非零退出码，不继续切换 PM2。

### Step 4：增加外部健康检查

`ops/windows/health-check.ps1` 接收 `-Url`，最多重试 12 次，每次 5 秒；只有 HTTP 200 且响应包含下列状态才返回 0：

```json
{
  "code": 0,
  "data": {
    "status": "ok",
    "db": "connected",
    "redis": "connected"
  }
}
```

### Step 5：增加 Caddy 配置模板

`ops/windows/Caddyfile.example`：

```caddyfile
party-school.example.com {
    reverse_proxy 127.0.0.1:3000

    log {
        output file C:/caddy/logs/access.json {
            roll_size 100MiB
            roll_keep 10
            roll_keep_for 720h
        }
        format json
    }
}
```

Node 已负责压缩和安全响应头，Caddy 只做 TLS、HTTP→HTTPS、反代和访问日志。

### Step 6：独立提交

```powershell
git add package.json .env.production scripts/deploy-windows.ps1 ecosystem.config.cjs ops/windows docs/DEPLOY_WINDOWS.md
git commit -m "ops: harden Windows production deployment"
```

Expected: 一个只包含部署资产的提交。

## 4. Task 2：冻结并验证发布版本

### Step 1：确保发布来自干净提交

当前工作区存在大量未提交修改，禁止直接复制当前目录到服务器。先审查、提交，再执行：

```powershell
git status --short
git rev-parse HEAD
git log -1 --oneline
```

Expected: `git status --short` 无输出，并记录完整 SHA。

### Step 2：锁定依赖

```powershell
pnpm install --frozen-lockfile
```

Expected: 退出码 0，`pnpm-lock.yaml` 不变。

### Step 3：测试和静态检查

```powershell
pnpm test
pnpm lint
```

Expected: Vitest 全通过；ESLint 无 error。warning 登记但不自动阻断。

### Step 4：按生产 MySQL 路径完整构建

```powershell
pnpm --filter shared build
pnpm --filter server prisma:generate:mysql
pnpm --filter server build
pnpm --filter admin build
pnpm --filter mobile build
```

Expected:

- 五个命令退出码均为 0。
- `packages/server/dist/main.js` 存在。
- `packages/server/public/admin/index.html` 存在。
- `packages/server/public/mobile/index.html` 存在。
- Vite 体积 warning 可登记，构建 error 必须阻断。

### Step 5：创建发布 tag

```powershell
git tag -a production-2026-08-13.1 -m "Production release 2026-08-13.1"
git show --stat production-2026-08-13.1
```

只有仓库已有远端且团队批准时才执行：

```powershell
git push origin production-2026-08-13.1
```

Expected: 部署记录唯一映射到 tag 和 commit SHA。

## 5. Task 3：准备阿里云资源、域名和网络

### Step 1：备案和 DNS

- 中国内地 ECS 上线前完成 ICP 备案；网站开通后按要求办理公安联网备案。
- 为 `<DOMAIN>` 创建 A 记录指向 ECS 公网 IP。
- 上线前将 TTL 调到 600 秒，稳定 24 小时后再调高。

在外部工作站执行：

```powershell
Resolve-DnsName <DOMAIN>
```

Expected: A 记录解析到目标 ECS。

### Step 2：ECS 安全组

| 端口 | 来源 | 用途 |
|---|---|---|
| TCP 80 | `0.0.0.0/0`，需要时 `::/0` | HTTP 跳转和证书签发 |
| TCP 443 | `0.0.0.0/0`，需要时 `::/0` | HTTPS |
| TCP 3389 | 管理员固定公网 IP/32 | RDP |

明确不开放：3000、3306、6379、PM2 或数据库管理端口。

### Step 3：RDS MySQL

- 创建 MySQL 8 实例和 `party_school` 数据库，字符集 `utf8mb4`。
- 创建账号 `party_school_app`，仅授权 `party_school` 库。
- RDS 白名单只允许 ECS 私网 IP/应用安全组。
- 开启每日自动备份和日志备份，保留至少 7 天。
- 使用内网连接地址。

### Step 4：Redis

- 与 ECS 同 VPC/地域。
- 设置独立强密码。
- 白名单只允许 ECS 私网 IP。
- 使用内网 host/port，不启用公网访问。

### Step 5：出方向

保证 ECS 可经 TCP 443 访问依赖源、DeepSeek、ACME 证书服务和启用的阿里云备份/监控端点。

## 6. Task 4：初始化 Windows Server

所有命令在管理员 PowerShell 中执行。先安装 Windows Update 并重启。

### Step 1：时区

```powershell
Set-TimeZone -Id "China Standard Time"
w32tm /resync
Get-Date
Get-TimeZone
```

Expected: 时区正确，系统时间准确。

### Step 2：目录

将数据盘初始化为 GPT/NTFS 并分配 `D:`，然后：

```powershell
New-Item -ItemType Directory -Force -Path "D:\apps\ai-party-school\releases"
New-Item -ItemType Directory -Force -Path "D:\data\ai-party-school\uploads"
New-Item -ItemType Directory -Force -Path "D:\backups\ai-party-school\mysql"
New-Item -ItemType Directory -Force -Path "D:\backups\ai-party-school\uploads"
New-Item -ItemType Directory -Force -Path "C:\caddy\logs"
```

### Step 3：基础软件

安装 x64 正式版本：

- Git for Windows。
- Node.js 24 LTS 标准 MSI，不使用 Node 20 或 Current。
- MySQL Shell/Client 8。
- Caddy 2 官方 Windows 二进制。

验证：

```powershell
git --version
node --version
npm --version
C:\caddy\caddy.exe version
mysql --version
mysqldump --version
```

Expected: Node 为 24.x，其余命令正常。

### Step 4：PM2 Windows Service

PM2 在 Windows 上没有内建的 `pm2 startup`。按 PM2 官方指向的 `pm2-installer` 使用固定 release 安装，不用仅登录后启动的 registry 方案。

在 pm2-installer 目录执行：

```powershell
npm run configure
npm run configure-policy
npm run setup
npm install -g pnpm@11.15.0
```

验证：

```powershell
pnpm --version
pm2 --version
Get-Service | Where-Object { $_.Name -match "pm2" -or $_.DisplayName -match "pm2" }
```

Expected: pnpm 为 11.15.0；PM2 服务 Running；重启后无需登录。

### Step 5：Caddy Windows Service

将 `caddy.exe` 与正式 `Caddyfile` 放在 `C:\caddy`。先验证：

```powershell
C:\caddy\caddy.exe validate --config C:\caddy\Caddyfile --adapter caddyfile
```

首次创建服务：

```powershell
sc.exe create caddy start= auto binPath= "C:\caddy\caddy.exe run --environ --config C:\caddy\Caddyfile --adapter caddyfile"
sc.exe failure caddy reset= 0 actions= restart/5000
sc.exe start caddy
sc.exe query caddy
```

Expected: Caddy 为 RUNNING。若已存在，不再 create，只 validate/reload。

### Step 6：Windows 防火墙

```powershell
New-NetFirewallRule -DisplayName "Party School HTTP" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 80
New-NetFirewallRule -DisplayName "Party School HTTPS" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443
Get-NetFirewallRule -DisplayName "Party School HTTP","Party School HTTPS"
```

不要创建 3000、3306、6379 放行规则；RDP 只允许可信来源。

## 7. Task 5：创建 release 和生产配置

### Step 1：不可变 release

示例目录：

```text
D:\apps\ai-party-school\releases\20260813-2000-1f2b2ee
```

从受控远端 clone 或上传干净发布包：

```powershell
git clone <REPOSITORY_URL> "D:\apps\ai-party-school\releases\20260813-2000-1f2b2ee"
Set-Location "D:\apps\ai-party-school\releases\20260813-2000-1f2b2ee"
git checkout --detach production-2026-08-13.1
git status --short
git rev-parse HEAD
```

Expected: 工作区无修改，SHA 与冻结记录一致，服务器不保存可写远端凭据。

### Step 2：生成密钥

在密码管理器保存：

- MySQL 应用账号密码。
- Redis 密码。
- 至少 48 随机字节的 JWT secret。
- 三个互不相同、至少 16 位的 seed 初始密码。
- DeepSeek API Key。

JWT secret 可在隔离终端生成：

```powershell
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

不得写入 Git、聊天记录或部署日志。

### Step 3：创建 `packages/server/.env`

```dotenv
DATABASE_URL="mysql://party_school_app:<URL_ENCODED_DB_PASSWORD>@<RDS_PRIVATE_HOST>:3306/party_school"
NODE_ENV="production"

REDIS_HOST="<REDIS_PRIVATE_HOST>"
REDIS_PORT="6379"
REDIS_PASSWORD="<REDIS_PASSWORD>"

JWT_SECRET=CHANGE_ME_generate_a_random_secret_at_least_32_characters
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="30d"

SERVER_HOST="127.0.0.1"
SERVER_PORT=3000
SERVER_PREFIX="/api"
CORS_ORIGINS=""

SEED_ADMIN_PASSWORD=CHANGE_ME_set_a_unique_admin_password_at_least_12_characters
SEED_SECRETARY_PASSWORD=CHANGE_ME_set_a_unique_secretary_password_at_least_12_characters
SEED_MEMBER_PASSWORD=CHANGE_ME_set_a_unique_member_password_at_least_12_characters

UPLOAD_DIR="D:/data/ai-party-school/uploads"
UPLOAD_MAX_SIZE="200MB"

DEEPSEEK_API_KEY="<DEEPSEEK_API_KEY>"
DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"
DEEPSEEK_CHAT_MODEL="deepseek-chat"
DEEPSEEK_REASONER_MODEL="deepseek-reasoner"
```

数据库密码中的 `@`、`:`、`/`、`?#`、`%` 等必须 URL 编码。

### Step 4：ACL

```powershell
icacls "D:\apps\ai-party-school\releases\20260813-2000-1f2b2ee\packages\server\.env" /inheritance:r
icacls "D:\apps\ai-party-school\releases\20260813-2000-1f2b2ee\packages\server\.env" /grant:r "Administrators:F" "SYSTEM:F" "LOCAL SERVICE:R"
icacls "D:\data\ai-party-school\uploads" /grant "LOCAL SERVICE:(OI)(CI)M"
```

Expected: 普通用户不能读 `.env`，PM2 可读配置和写上传目录。

### Step 5：占位符扫描

```powershell
Select-String -Path "packages\server\.env" -Pattern "YOUR_PASSWORD|please-change|CHANGE_ME|sk-your"
```

Expected: 无输出。不要打印整个 `.env`。

## 8. Task 6：备份和数据库迁移决策

数据库负责人必须只选择一条路径。

### 公共 Step：备份

在阿里云创建 RDS 手工备份，记录备份 ID。再创建不暴露明文密码的 login path：

```powershell
mysql_config_editor set --login-path=party-school-prod --host=<RDS_PRIVATE_HOST> --user=party_school_backup --password
```

交互输入密码，然后：

```powershell
mysqldump --login-path=party-school-prod --single-transaction --routines --triggers --events --set-gtid-purged=OFF party_school --result-file="D:\backups\ai-party-school\mysql\predeploy-20260813-2000.sql"
Get-Item "D:\backups\ai-party-school\mysql\predeploy-20260813-2000.sql" | Select-Object FullName,Length,LastWriteTime
```

Expected: 文件存在且 Length 大于 0。

### 路径 A：全新空库

```powershell
mysql --login-path=party-school-prod -e "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema='party_school';"
```

Expected: `table_count=0`。不执行 baseline，后续正常 `migrate deploy` 和首次 seed。

### 路径 B：已有、未纳入 Prisma Migrate 的库

先安装依赖和生成客户端，不运行部署脚本：

```powershell
Set-Location "D:\apps\ai-party-school\releases\20260813-2000-1f2b2ee"
pnpm install --prod=false --frozen-lockfile
pnpm --filter server prisma:generate:mysql
Set-Location "packages\server"
```

执行只读 schema diff：

```powershell
node_modules\.bin\prisma.CMD migrate diff --exit-code --from-schema-datasource prisma/schema.mysql.prisma --to-schema-datamodel prisma/schema.mysql.prisma
```

Expected:

- 退出码 0：完全一致，可以 baseline。
- 退出码 2：存在差异，立即停止，禁止直接标记已应用。
- 退出码 1：连接/配置错误，修复后重试。

只有 diff 为 0 时：

```powershell
node_modules\.bin\prisma.CMD migrate resolve --applied 20260813130000_init_mysql --schema prisma/schema.mysql.prisma
node_modules\.bin\prisma.CMD migrate status --schema prisma/schema.mysql.prisma
```

Expected: 初始迁移已应用，schema up to date。

若 diff 为 2：

1. 从备份恢复隔离测试库。
2. 生成“现有库 → `schema.mysql.prisma`”差异 SQL。
3. 人工审查 DROP、ALTER、默认值、非空列。
4. 将确认后的 SQL 作为 follow-up migration 提交。
5. 在恢复库演练通过后重新安排生产变更。

禁止：

- 对已有生产库执行 `prisma db push`。
- 为让状态变绿盲目执行 `migrate resolve --applied`。
- 编辑任何已在生产应用的 `migration.sql`。

## 9. Task 7：构建、迁移、启动

### Step 1：端口和服务检查

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 80,443,3000,3306,6379 }
Get-Service caddy
pm2 list
```

Expected: Caddy 监听 80/443；首次部署时 3000 未监听；本机不为公网用途监听 3306/6379。

### Step 2：执行部署脚本

首次部署：

```powershell
Set-Location "D:\apps\ai-party-school\releases\20260813-2000-1f2b2ee"
powershell -ExecutionPolicy Bypass -File scripts\deploy-windows.ps1
```

Expected:

- 依赖安装、构建、`migrate deploy`、seed、PM2 start、save 全成功。
- `party-school-api` online。
- 3000 只绑定 `127.0.0.1`。

### Step 3：本机健康检查

```powershell
curl.exe -sS -w "\nHTTP %{http_code}\n" http://127.0.0.1:3000/api/health
pm2 logs party-school-api --lines 100 --nostream
```

Expected:

- HTTP 200。
- `code=0`、`status=ok`、`db=connected`、`redis=connected`。
- 无 Prisma 连接错、Redis 重连风暴、未捕获异常或 secret 输出。

失败时不要保存新 PM2 状态；修复或停止新进程。

### Step 4：保存状态

```powershell
pm2 save
pm2 list
```

Expected: saved list 只包含预期应用。

## 10. Task 8：域名和 HTTPS

### Step 1：部署 Caddyfile

把模板复制到 `C:\caddy\Caddyfile`，替换真实域名：

```powershell
C:\caddy\caddy.exe validate --config C:\caddy\Caddyfile --adapter caddyfile
C:\caddy\caddy.exe reload --config C:\caddy\Caddyfile --adapter caddyfile
```

Expected: validate/reload 成功，Caddy 自动申请证书。

### Step 2：TLS 和跳转

从外部工作站：

```powershell
curl.exe -I http://<DOMAIN>/
curl.exe -I https://<DOMAIN>/
curl.exe -I https://<DOMAIN>/admin/
curl.exe -sS https://<DOMAIN>/api/health
```

Expected: HTTP 跳转 HTTPS；证书可信；两个入口和 health 正常。

### Step 3：公网端口

```powershell
Test-NetConnection <DOMAIN> -Port 443
Test-NetConnection <ECS_PUBLIC_IP> -Port 3000
Test-NetConnection <ECS_PUBLIC_IP> -Port 3306
Test-NetConnection <ECS_PUBLIC_IP> -Port 6379
```

Expected: 443 为 True；3000、3306、6379 为 False。

## 11. Task 9：业务和安全验收

测试数据使用 `DEPLOY-CHECK-<date>` 前缀，验收后删除。

### Step 1：登录 Cookie

```powershell
$loginBody = '{"username":"admin","password":"<INITIAL_ADMIN_PASSWORD>"}'
curl.exe -i -c "$env:TEMP\party-school-cookies.txt" -H "Content-Type: application/json" -H "X-Client: admin" --data $loginBody https://<DOMAIN>/api/auth/login
```

Expected:

- HTTP 200。
- 响应体不返回 access/refresh token。
- `Set-Cookie` 包含 `HttpOnly`、`Secure`、`SameSite=Strict`。
- seed 用户首次登录强制改密。

### Step 2：三角色

管理员：

- 登录 `/admin/` 并改密。
- 查看组织、用户、内容、任务、题库、试卷、考试、统计。
- 创建临时内容/通知。
- 调用一次 AI 查询。

支部书记：

- 只看到本支部数据。
- 无法访问其他支部用户、统计、报告。
- 能完成本支部允许操作。

党员：

- 登录移动端并改密。
- 学习、心跳、答题、查看结果。
- 查看聊天和通知。

### Step 3：安全

- 未登录访问受保护 API 返回 401。
- 非白名单 Origin 的 credentialed 请求不能通过浏览器 CORS。
- 管理端和移动端 Cookie 不串用。
- 强制改密期间其他业务接口被拒绝。
- HTML/SVG/JS 上传不能以内联脚本执行。

### Step 4：静态资源和上传

- `/admin/` 和移动端路由刷新不 404。
- hash 资源长期缓存，`index.html` 为 `no-cache`。
- 小文件上传后重启 PM2 仍存在。
- 超过 `UPLOAD_MAX_SIZE` 被拒绝。
- 文件实际位于 `D:\data\ai-party-school\uploads`。

### Step 5：迁移状态

```powershell
Set-Location "D:\apps\ai-party-school\releases\20260813-2000-1f2b2ee\packages\server"
node_modules\.bin\prisma.CMD migrate status --schema prisma/schema.mysql.prisma
```

Expected: `Database schema is up to date!`。

## 12. Task 10：重启和恢复演练

### Step 1：PM2

```powershell
pm2 restart party-school-api
Start-Sleep -Seconds 10
curl.exe -sS http://127.0.0.1:3000/api/health
```

Expected: 10 秒内恢复，数据和上传不丢失。

### Step 2：Caddy

```powershell
Restart-Service caddy
Start-Sleep -Seconds 5
curl.exe -I https://<DOMAIN>/
```

Expected: HTTPS 恢复。

### Step 3：整机

维护窗口重启 ECS。无需 RDP 登录，等待 2 分钟，从外部执行：

```powershell
curl.exe -sS -w "\nHTTP %{http_code}\n" https://<DOMAIN>/api/health
```

服务器内：

```powershell
Get-Service caddy
Get-Service | Where-Object { $_.Name -match "pm2" -or $_.DisplayName -match "pm2" }
pm2 list
```

Expected: Caddy/PM2 自动运行，应用 online，health 200。

### Step 4：依赖故障

只在测试环境短暂断开 Redis：

- 断连时 health 为 503/degraded。
- 应用不崩溃或无限重启。
- Redis 恢复后自动重连，health 回到 200/ok。

不在生产通过“停止 RDS”演练故障。

## 13. Task 11：备份、监控、日志

### Step 1：数据库

- RDS 自动备份每天执行，保留至少 7 天。
- 每次发布前创建手工快照。
- 每周一次逻辑 `mysqldump`，加密后同步到不同故障域 OSS。
- 每季度恢复到临时实例并做 health/核心业务验证。

目标：RPO 24 小时内，重要阶段收紧到 1 小时；RTO 4 小时内。

### Step 2：上传文件

每日增量备份，不使用 `/MIR`：

```powershell
robocopy "D:\data\ai-party-school\uploads" "D:\backups\ai-party-school\uploads" /E /COPY:DAT /DCOPY:DAT /R:2 /W:5 /LOG+:"D:\backups\ai-party-school\upload-backup.log"
if ($LASTEXITCODE -ge 8) { throw "Upload backup failed with robocopy exit code $LASTEXITCODE" }
```

robocopy 0～7 为成功/存在差异，8 以上才失败。

### Step 3：日志

- PM2 使用 `pm2-logrotate`，单文件 50～100 MiB，保留 14～30 天。
- Caddy access log 按模板轮转。
- 日志不得出现 `DATABASE_URL`、JWT、Redis 密码、seed 密码、DeepSeek Key、Cookie。

### Step 4：告警

- `/api/health` 每分钟检测，连续 3 次失败告警。
- ECS CPU 连续 10 分钟 >80%。
- 内存连续 10 分钟 >85%。
- D: 盘 >75% 预警，>85% 紧急。
- PM2 restart count 异常增长。
- RDS 连接数、CPU、磁盘、慢 SQL。
- Redis 内存、连接数、命中率和拒绝连接。
- TLS 续期失败。
- 每日备份无成功记录。

### Step 5：计划任务

Windows Task Scheduler：

- 每分钟执行 health check。
- 每日低峰备份上传文件。
- 每周逻辑数据库备份。
- 每日检查磁盘和备份新鲜度。

使用低权限账号、`Run whether user is logged on or not`、失败重试 3 次；任务参数不放明文密码。

## 14. Task 12：后续常规发布

1. 本地测试和 MySQL 构建通过。
2. 创建唯一 tag/commit。
3. 新 release 目录部署，不覆盖在线目录。
4. 复制受保护 `.env`，确认外部 `UPLOAD_DIR`。
5. `pnpm install --frozen-lockfile`。
6. 构建 shared、Prisma、server、admin、mobile。
7. RDS 手工快照和上传增量备份。
8. `prisma migrate status` 并审查待执行迁移。
9. `prisma migrate deploy`。
10. 常规发布使用 `-SkipSeed`。
11. 维护窗口切换 PM2。
12. 本机/公网 health 通过后 `pm2 save`。
13. 三角色 smoke test。
14. 当前和上一 release 保留至少 7 天。

迁移规则：

- 使用 expand → deploy → contract。
- 同一发布不做不可逆 DROP、批量重写或长时间锁表。
- 每条迁移先在生产备份恢复库计时。
- 应用回退必须兼容已经执行的新迁移。

## 15. 回退方案

### 构建失败、迁移前

不切 PM2，在线版本不受影响。失败 release 后续归档处理，不在变更窗口强删。

### 迁移后、切换前

保持旧应用；迁移向后兼容时修复并重发。若影响旧应用，进入数据库恢复评估，不能只切代码。

### 新应用失败、迁移向后兼容

```powershell
Set-Location "D:\apps\ai-party-school\releases\<PREVIOUS_RELEASE_ID>"
pm2 delete party-school-api
pm2 start ecosystem.config.cjs
Start-Sleep -Seconds 10
curl.exe -sS http://127.0.0.1:3000/api/health
pm2 save
```

Expected: 上一版本恢复 online，health 200。

### 迁移破坏兼容或数据

1. 临时让 Caddy 返回维护页，停止写入。
2. 保留日志和 migration 现场。
3. 从上线前 RDS 手工备份恢复到新实例。
4. 验证表、关键数据量和 health。
5. 将应用 `DATABASE_URL` 指向恢复实例。
6. 重启 PM2，业务验收通过后恢复流量。

Prisma `migrate deploy` 没有自动 down migration；不要在生产手写反向 SQL 碰运气。使用经过演练的 forward-fix 或快照恢复。

### 立即回退/停止门槛

- 迁移失败或 schema status 不一致。
- health 连续 3 次不是 200/ok。
- 登录、改密、核心查询或写入阻断。
- 5xx 持续 5 分钟或明显超基线。
- PM2 重启循环。
- 数据越权、Cookie 属性缺失、3000/3306/6379 公网可达。

## 16. Go/No-Go 清单

### 发布前

- [ ] commit/tag 唯一，工作区干净
- [ ] test、lint、MySQL 生产构建通过
- [ ] 域名、ICP、DNS、80/443 就绪
- [ ] RDP 只允许可信 IP
- [ ] RDS/Redis 只走 VPC
- [ ] secrets 已保存到密码管理器
- [ ] `SERVER_HOST=127.0.0.1`
- [ ] `UPLOAD_DIR` 位于外部目录
- [ ] 已选择空库或已有库 baseline 路径
- [ ] RDS 手工备份和逻辑备份已记录
- [ ] 上传文件备份已完成

### 发布后

- [ ] PM2 online，重启次数稳定
- [ ] 本机和公网 health 200/ok
- [ ] HTTP 跳转 HTTPS，证书可信
- [ ] 3000、3306、6379 公网不可达
- [ ] Cookie 为 HttpOnly + Secure + SameSite=Strict
- [ ] 三角色验收通过
- [ ] Prisma schema up to date
- [ ] 上传文件跨重启保留
- [ ] Caddy/PM2 整机重启自恢复
- [ ] 监控、轮转、备份任务启用
- [ ] 上一 release 和备份仍保留

## 17. 工时

不含 ICP 等待：

- 仓库部署资产：0.5～1 天。
- 阿里云资源/安全组：2～4 小时。
- Windows 环境：2～3 小时。
- 测试环境演练：0.5 天。
- 首次生产部署/验收：2～4 小时。
- 备份、监控、重启演练：2～4 小时。

建议总计 2～3 个工作日，生产切换窗口 2 小时。实际中断目标 1～3 分钟，但当前单实例 fork 架构不承诺零停机。

## 18. 官方参考

- Node.js 支持周期：https://nodejs.org/en/about/previous-releases
- Caddy 反代与自动 HTTPS：https://caddyserver.com/docs/quick-starts/reverse-proxy
- Caddy Windows Service：https://caddyserver.com/docs/running
- PM2 Startup/Windows：https://pm2.keymetrics.io/docs/usage/startup/
- Prisma baseline：https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining
- 阿里云 ECS 安全组：https://help.aliyun.com/zh/ecs/user-guide/start-using-security-groups
- 阿里云 ICP：https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview
