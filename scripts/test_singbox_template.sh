#!/bin/sh
set -eu

ROOT_DIR=${ROOT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
TPL=${TPL:-$ROOT_DIR/clashoo/files/usr/share/clashoo/lib/templates/default.json}

if ! command -v jq >/dev/null 2>&1; then
  echo "SKIP: jq not installed" >&2
  exit 0
fi

jq -e '
  .outbounds[]
  | select(.type == "selector" and .tag == "🚀 节点选择")
  | .default == "♻️ 自动选择" and .outbounds[0] == "♻️ 自动选择"
' "$TPL" >/dev/null

printf 'sing-box template tests passed\n'
