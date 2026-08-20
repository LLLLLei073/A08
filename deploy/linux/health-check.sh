#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${1:-/etc/ai-party-school/server.env}"

read_env_value() {
  local key="$1"
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
  ' "$CONFIG_FILE"
}

PORT="$(read_env_value SERVER_PORT)"
PREFIX="$(read_env_value SERVER_PREFIX)"
PORT="${PORT:-3000}"
PREFIX="${PREFIX:-/api}"
PREFIX="/${PREFIX#/}"
PREFIX="${PREFIX%/}"

URL="http://127.0.0.1:${PORT}${PREFIX}/health"
BODY="$(curl --fail --silent --show-error --max-time 10 "$URL")"
printf '%s\n' "$BODY"

if ! printf '%s' "$BODY" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then
  printf 'Health check did not return status=ok: %s\n' "$URL" >&2
  exit 1
fi
