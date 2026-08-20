#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

PACKAGE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
CONFIG_SOURCE="${CONFIG_SOURCE:-$PACKAGE_DIR/server.env}"
APP_ROOT=/opt/ai-party-school
CONFIG_ROOT=/etc/ai-party-school
NODE_VERSION=24.18.1
PNPM_VERSION=11.15.0
CADDY_VERSION=2.11.4

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

die() {
  printf '错误：%s\n' "$*" >&2
  exit 1
}

on_error() {
  local line="$1"
  printf '\n安装在第 %s 行失败。最近日志：\n' "$line" >&2
  if command -v journalctl >/dev/null 2>&1; then
    journalctl -u ai-party-school --no-pager -n 30 2>/dev/null || true
  fi
}
trap 'on_error "$LINENO"' ERR

read_env_value() {
  local key="$1"
  local file="${2:-$CONFIG_SOURCE}"
  awk -v wanted="$key" '
    $0 !~ /^[[:space:]]*#/ {
      line=$0
      sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      pos=index(line, "=")
      if (pos > 0) {
        name=substr(line, 1, pos-1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
        if (name == wanted) {
          value=substr(line, pos+1)
          gsub(/\r$/, "", value)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
          if (value ~ /^".*"$/ || value ~ /^\047.*\047$/) value=substr(value, 2, length(value)-2)
          print value
          exit
        }
      }
    }
  ' "$file"
}

set_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"
  local temp_file
  temp_file="$(mktemp "${file}.tmp.XXXXXX")"
  awk -v wanted="$key" -v replacement="$value" '
    BEGIN { updated=0 }
    {
      line=$0
      test=line
      sub(/^[[:space:]]*export[[:space:]]+/, "", test)
      pos=index(test, "=")
      name=pos > 0 ? substr(test, 1, pos-1) : ""
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name == wanted) {
        print wanted "=" replacement
        updated=1
      } else {
        print line
      }
    }
    END { if (!updated) print wanted "=" replacement }
  ' "$file" > "$temp_file"
  chmod --reference="$file" "$temp_file" 2>/dev/null || chmod 0640 "$temp_file"
  mv -f "$temp_file" "$file"
}

is_true() {
  case "${1,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

random_hex() {
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

install_base_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl xz-utils tar redis-server
    REDIS_SERVICE=redis-server
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl xz tar
    if dnf install -y redis; then
      REDIS_SERVICE=redis
    elif dnf install -y redis6; then
      REDIS_SERVICE=redis6
    else
      die "无法从当前 dnf 软件源安装 Redis；请配置云 Redis，并将 INSTALL_LOCAL_REDIS=false"
    fi
  else
    die "仅支持 Ubuntu/Debian（apt）或 Alibaba Cloud Linux/RHEL 系（dnf）"
  fi
}

install_without_redis() {
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl xz-utils tar
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl xz tar
  else
    die "仅支持 Ubuntu/Debian（apt）或 Alibaba Cloud Linux/RHEL 系（dnf）"
  fi
}

install_node() {
  local node_home="$APP_ROOT/runtime/node"
  local archive="node-v${NODE_VERSION}-linux-x64.tar.xz"
  local temp_dir

  if [[ -x "$node_home/bin/node" ]] && [[ "$($node_home/bin/node --version)" == "v${NODE_VERSION}" ]]; then
    return
  fi

  temp_dir="$(mktemp -d)"
  trap 'rm -rf -- "${temp_dir:?}"' RETURN
  curl -fsSLo "$temp_dir/$archive" "https://nodejs.org/dist/v${NODE_VERSION}/$archive"
  curl -fsSLo "$temp_dir/SHASUMS256.txt" "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  (
    cd "$temp_dir"
    grep "  ${archive}$" SHASUMS256.txt | sha256sum -c -
  )

  install -d -m 0755 "$APP_ROOT/runtime"
  rm -rf -- "${node_home:?}.new"
  mkdir -m 0755 "$node_home.new"
  tar -xJf "$temp_dir/$archive" --strip-components=1 -C "$node_home.new"
  if [[ -e "$node_home" ]]; then
    mv "$node_home" "$node_home.previous.$(date +%s)"
  fi
  mv "$node_home.new" "$node_home"
  trap - RETURN
  rm -rf -- "${temp_dir:?}"
}

install_pnpm() {
  local node_home="$APP_ROOT/runtime/node"
  export PATH="$node_home/bin:$PATH"
  if [[ ! -x "$node_home/bin/pnpm" ]] || [[ "$($node_home/bin/pnpm --version 2>/dev/null || true)" != "$PNPM_VERSION" ]]; then
    "$node_home/bin/npm" install --global "pnpm@${PNPM_VERSION}"
  fi
}

install_caddy() {
  local archive="caddy_${CADDY_VERSION}_linux_amd64.tar.gz"
  local checksum_file="caddy_${CADDY_VERSION}_checksums.txt"
  local expected
  local temp_dir

  if [[ -x /usr/local/bin/caddy ]] && /usr/local/bin/caddy version | grep -q "^v${CADDY_VERSION} "; then
    return
  fi

  temp_dir="$(mktemp -d)"
  trap 'rm -rf -- "${temp_dir:?}"' RETURN
  curl -fsSLo "$temp_dir/$archive" "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/$archive"
  curl -fsSLo "$temp_dir/$checksum_file" "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/$checksum_file"
  expected="$(awk -v wanted="$archive" '$2 == wanted || $2 == "*" wanted || $2 == "./" wanted { print $1; exit }' "$temp_dir/$checksum_file")"
  case "${#expected}" in
    64) printf '%s  %s\n' "$expected" "$temp_dir/$archive" | sha256sum -c - ;;
    128) printf '%s  %s\n' "$expected" "$temp_dir/$archive" | sha512sum -c - ;;
    *) die "无法从 Caddy 校验清单读取 $archive" ;;
  esac
  tar -xzf "$temp_dir/$archive" -C "$temp_dir" caddy
  install -m 0755 "$temp_dir/caddy" /usr/local/bin/caddy
  trap - RETURN
  rm -rf -- "${temp_dir:?}"
  /usr/local/bin/caddy version
}

[[ "${EUID:-$(id -u)}" -eq 0 ]] || die "请使用 sudo bash install.sh 运行"
[[ "$(uname -s)" == Linux ]] || die "此安装包仅支持 Linux"
case "$(uname -m)" in
  x86_64|amd64) ;;
  *) die "此发布包仅支持 x86_64/amd64 架构" ;;
esac
[[ -d "$PACKAGE_DIR/app/packages/server/dist" ]] || die "发布包不完整：缺少 app/packages/server/dist"
[[ -f "$CONFIG_SOURCE" ]] || die "缺少 server.env。请先运行：cp server.env.example server.env，然后填写配置"

DATABASE_URL="$(read_env_value DATABASE_URL)"
APP_DOMAIN="$(read_env_value APP_DOMAIN)"
LOCAL_REDIS="$(read_env_value INSTALL_LOCAL_REDIS)"
RUN_MIGRATION="$(read_env_value RUN_DATABASE_MIGRATION)"
RUN_SEED="$(read_env_value RUN_SEED)"
WITH_CADDY="$(read_env_value INSTALL_CADDY)"
SERVER_PORT="$(read_env_value SERVER_PORT)"

[[ "$DATABASE_URL" == mysql://* ]] || die "DATABASE_URL 必须是 mysql:// 连接串"
[[ "$DATABASE_URL" != *CHANGE_ME* ]] || die "请先填写 DATABASE_URL"
if is_true "${RUN_SEED:-true}"; then
  for key in SEED_ADMIN_PASSWORD SEED_SECRETARY_PASSWORD SEED_MEMBER_PASSWORD; do
    value="$(read_env_value "$key")"
    [[ ${#value} -ge 12 && "$value" != *CHANGE_ME* ]] || die "$key 必须设置为至少 12 位的密码"
  done
fi
if is_true "${WITH_CADDY:-true}"; then
  [[ -n "$APP_DOMAIN" && "$APP_DOMAIN" != *example.com* ]] || die "启用 Caddy 时必须填写 APP_DOMAIN"
fi

log "安装系统依赖"
if is_true "${LOCAL_REDIS:-true}"; then
  install_base_packages
else
  install_without_redis
fi

log "创建运行账户与目录"
NOLOGIN_SHELL="$(command -v nologin || printf '/sbin/nologin')"
getent group party-school >/dev/null 2>&1 || groupadd --system party-school
id party-school >/dev/null 2>&1 || useradd --system --gid party-school --home-dir /var/lib/ai-party-school --shell "$NOLOGIN_SHELL" party-school
install -d -m 0755 "$APP_ROOT" "$APP_ROOT/releases" "$CONFIG_ROOT"
install -d -o party-school -g party-school -m 0750 /var/lib/ai-party-school /var/lib/ai-party-school/uploads

if [[ ! -f "$CONFIG_ROOT/server.env" ]]; then
  install -o root -g party-school -m 0640 "$CONFIG_SOURCE" "$CONFIG_ROOT/server.env"
else
  log "保留已有配置：$CONFIG_ROOT/server.env"
fi

if [[ "$(read_env_value JWT_SECRET "$CONFIG_ROOT/server.env")" == GENERATE_ON_INSTALL ]]; then
  set_env_value JWT_SECRET "$(random_hex)" "$CONFIG_ROOT/server.env"
fi
if [[ "$(read_env_value ENCRYPT_KEY "$CONFIG_ROOT/server.env")" == GENERATE_ON_INSTALL ]]; then
  set_env_value ENCRYPT_KEY "$(random_hex)" "$CONFIG_ROOT/server.env"
fi
chown root:party-school "$CONFIG_ROOT/server.env"
chmod 0640 "$CONFIG_ROOT/server.env"

log "安装 Node.js ${NODE_VERSION} 与 pnpm ${PNPM_VERSION}"
install_node
install_pnpm
export PATH="$APP_ROOT/runtime/node/bin:$PATH"

PACKAGE_VERSION="$(tr -d '\r\n' < "$PACKAGE_DIR/VERSION")"
RELEASE_ID="${PACKAGE_VERSION}-$(date '+%Y%m%d%H%M%S')"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
[[ ! -e "$RELEASE_DIR" ]] || die "发布目录已存在：$RELEASE_DIR"

log "部署应用版本 $RELEASE_ID"
install -d -m 0750 "$RELEASE_DIR"
cp -a "$PACKAGE_DIR/app/." "$RELEASE_DIR/"
install -m 0750 "$PACKAGE_DIR/health-check.sh" "$RELEASE_DIR/health-check.sh"
ln -s "$CONFIG_ROOT/server.env" "$RELEASE_DIR/packages/server/.env"
(
  cd "$RELEASE_DIR"
  pnpm install --frozen-lockfile --prod=false
  pnpm --filter @ai-party-school/server exec prisma generate --schema prisma/schema.mysql.prisma
)

if is_true "${RUN_MIGRATION:-true}"; then
  log "执行数据库迁移"
  (
    cd "$RELEASE_DIR"
    pnpm --filter @ai-party-school/server exec prisma migrate deploy --schema prisma/schema.mysql.prisma
  )
fi

if is_true "${RUN_SEED:-true}"; then
  log "初始化组织、账号与演示数据"
  (
    cd "$RELEASE_DIR"
    pnpm --filter @ai-party-school/server exec prisma db seed --schema prisma/schema.mysql.prisma
  )
fi

chown -R root:party-school "$RELEASE_DIR"
chmod -R g+rX,o-rwx "$RELEASE_DIR"
ln -sfn "$RELEASE_DIR" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"

log "配置并启动应用服务"
install -m 0644 "$PACKAGE_DIR/systemd/ai-party-school.service" /etc/systemd/system/ai-party-school.service
systemctl daemon-reload
if is_true "${LOCAL_REDIS:-true}"; then
  systemctl enable --now "$REDIS_SERVICE"
fi
systemctl enable --now ai-party-school

if is_true "${WITH_CADDY:-true}"; then
  log "安装并启动 Caddy"
  install_caddy
  getent group caddy >/dev/null 2>&1 || groupadd --system caddy
  id caddy >/dev/null 2>&1 || useradd --system --gid caddy --home-dir /var/lib/caddy --shell "$NOLOGIN_SHELL" caddy
  install -d -o caddy -g caddy -m 0750 /var/lib/caddy /var/log/caddy
  install -d -m 0755 /etc/caddy
  install -m 0644 "$PACKAGE_DIR/Caddyfile" /etc/caddy/Caddyfile
  printf 'APP_DOMAIN=%s\nSERVER_PORT=%s\n' "$APP_DOMAIN" "${SERVER_PORT:-3000}" > "$CONFIG_ROOT/caddy.env"
  chown root:caddy "$CONFIG_ROOT/caddy.env"
  chmod 0640 "$CONFIG_ROOT/caddy.env"
  install -m 0644 "$PACKAGE_DIR/systemd/caddy.service" /etc/systemd/system/caddy.service
  /usr/local/bin/caddy validate --config /etc/caddy/Caddyfile
  systemctl daemon-reload
  systemctl enable --now caddy
fi

log "等待健康检查"
for attempt in $(seq 1 30); do
  if bash "$PACKAGE_DIR/health-check.sh" "$CONFIG_ROOT/server.env" >/tmp/ai-party-school-health.json 2>/dev/null; then
    cat /tmp/ai-party-school-health.json
    printf '\n安装完成：%s\n' "$APP_DOMAIN"
    printf '应用日志：journalctl -u ai-party-school -f\n'
    printf '健康检查：bash %s/health-check.sh\n' "$APP_ROOT/current"
    exit 0
  fi
  sleep 2
done

systemctl status ai-party-school --no-pager || true
die "应用未在 60 秒内通过健康检查，请查看 journalctl -u ai-party-school -n 100"
