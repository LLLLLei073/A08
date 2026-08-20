# AI 党建学习平台 Linux 一键部署包

这个包面向 Ubuntu 24.04 LTS、Debian 12 和 Alibaba Cloud Linux 3 的 x86_64 服务器。安装器会自动完成 Node.js、pnpm、依赖、Prisma MySQL 客户端、数据库迁移、初始化数据、Redis、systemd 和 Caddy HTTPS 配置。

## 部署前准备

- 推荐最低配置：2 核 CPU、4 GB 内存、40 GB ESSD；低并发试用可用 2 核 2 GB 并增加 2 GB swap。
- 一个已备案并解析到服务器公网 IP 的域名；仅临时用 IP 时，`APP_DOMAIN` 填 `http://公网IP`。
- 一个 MySQL 8.0 空数据库，字符集建议 `utf8mb4`。
- 安全组只开放 `22`、`80`、`443`；不要开放 `3000`、`3306`、`6379` 到公网。
- 首次安装需要服务器能访问 Node.js、npm 和 Caddy 下载站点。

数据库管理员可先执行：

```sql
CREATE DATABASE party_school CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'party_school'@'%' IDENTIFIED BY '替换为强密码';
GRANT ALL PRIVILEGES ON party_school.* TO 'party_school'@'%';
FLUSH PRIVILEGES;
```

生产环境建议在云数据库白名单中仅允许应用服务器内网 IP，并在初始化完成后按实际需要收紧 DDL 权限。

## 三步安装

```bash
tar -xzf ai-party-school-server-*-linux-x64.tar.gz
cd ai-party-school-server-*-linux-x64
cp server.env.example server.env
nano server.env
sudo bash install.sh
```

至少修改：`APP_DOMAIN`、`DATABASE_URL` 和三个 `SEED_*_PASSWORD`。`JWT_SECRET`、`ENCRYPT_KEY` 保持 `GENERATE_ON_INSTALL` 即可，安装器会生成 64 位十六进制随机密钥。

安装完成后访问 `https://你的域名`。初始账号为 `admin`、`secretary1`、`member1` 至 `member6`，密码分别来自配置文件中的三个 `SEED_*_PASSWORD`，首次登录会要求修改密码。

## 运维命令

```bash
# 查看实时日志
sudo journalctl -u ai-party-school -f

# 查看服务状态
sudo systemctl status ai-party-school caddy

# 本机健康检查
sudo bash /opt/ai-party-school/current/health-check.sh

# 修改配置后重启
sudo nano /etc/ai-party-school/server.env
sudo systemctl restart ai-party-school

# 验证并重载 Caddy
sudo /usr/local/bin/caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

主要目录：

- 程序版本：`/opt/ai-party-school/releases/`
- 当前版本：`/opt/ai-party-school/current`
- 生产配置：`/etc/ai-party-school/server.env`
- 上传文件：`/var/lib/ai-party-school/uploads`
- 应用日志：systemd journal
- Caddy 访问日志：`/var/log/caddy/access.log`

## 已有数据库或外部基础设施

- 已有正式数据库：先备份，并确认它已经由本项目的 Prisma migrations 管理；把 `RUN_SEED=false`。若迁移历史缺失，不要直接运行安装器，请先进行 migration baseline。
- 云 Redis：设置 `INSTALL_LOCAL_REDIS=false`，填写 `REDIS_HOST`、`REDIS_PORT`、`REDIS_PASSWORD`。
- 已有 Nginx/Caddy：设置 `INSTALL_CADDY=false`，由现有网关反向代理到 `127.0.0.1:3000`。
- 不需要 AI：`DEEPSEEK_API_KEY` 可留空，其他业务功能仍可运行。

## 更新版本

备份数据库和 `/var/lib/ai-party-school/uploads` 后，在新包中复制并调整原配置：

```bash
sudo cp /etc/ai-party-school/server.env ./server.env
sudo chown "$(id -u):$(id -g)" ./server.env
sudo bash install.sh
```

安装器会创建新的带时间戳版本目录，并原子切换 `current` 软链接。若新版本异常，可把 `/opt/ai-party-school/current` 重新指向上一版本并重启服务；数据库发生不可逆迁移时仍需从备份恢复。
