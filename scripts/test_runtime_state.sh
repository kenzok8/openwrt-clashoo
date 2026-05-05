#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
INITD="$ROOT_DIR/clashoo/files/etc/init.d/clashoo"
LUCI_RPC="$ROOT_DIR/luci-app-clashoo/root/usr/share/rpcd/ucode/luci.clashoo"

if grep -q 'sed -i "s|^\${key}=.*|\${key}=\${value}|g"' "$INITD"; then
	echo "runtime_state_set still writes unescaped sed replacement values" >&2
	exit 1
fi

if grep -q 'popen(cmd)' "$LUCI_RPC" && grep -q 'awk -F=' "$LUCI_RPC"; then
	echo "runtime_state_get still builds a shell awk command" >&2
	exit 1
fi

tmp="${TMPDIR:-/tmp}/clashoo_runtime_state.$$"
trap 'rm -f "$tmp" "${tmp}.new"' EXIT

runtime_state_set_file() {
	file="$1"
	key="$2"
	value="$3"
	value="$(printf '%s' "$value" | tr '\r\n' '  ')"
	safe_value="$(printf '%s' "$value" | sed 's/[\/&|\\]/\\&/g')"
	if grep -q "^${key}=" "$file" 2>/dev/null; then
		sed "s|^${key}=.*|${key}=${safe_value}|g" "$file" > "${file}.new"
		mv "${file}.new" "$file"
	else
		echo "${key}=${value}" >> "$file"
	fi
}

: > "$tmp"
runtime_state_set_file "$tmp" "health_detail" 'a|b&c\d'
runtime_state_set_file "$tmp" "health_detail" 'x|y&z\q'
actual="$(cat "$tmp")"

[ "$actual" = 'health_detail=x|y&z\q' ] || {
	echo "actual: $actual" >&2
	exit 1
}
