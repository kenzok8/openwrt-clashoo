#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
LUCI_RPC="$ROOT_DIR/luci-app-clashoo/root/usr/share/rpcd/ucode/luci.clashoo"

grep -Fq 'match(name, /^[A-Za-z0-9][A-Za-z0-9._-]*$/)' "$LUCI_RPC" || {
	echo "safe_name does not enforce the expected filename whitelist" >&2
	exit 1
}

grep -Fq "unlink(target + '.info')" "$LUCI_RPC" || {
	echo "delete_config does not remove mihomo .info sidecar" >&2
	exit 1
}

grep -Fq "unlink(target + '.url')" "$LUCI_RPC" || {
	echo "delete_config does not remove mihomo .url sidecar" >&2
	exit 1
}
