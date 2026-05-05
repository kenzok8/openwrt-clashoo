#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
IPRULES="$ROOT_DIR/clashoo/files/usr/share/clashoo/runtime/iprules.sh"

grep -q 'TMP_PREFIX="/tmp/clashoo_iprules.$$"' "$IPRULES" || {
	echo "iprules.sh does not use a PID-scoped tmp prefix" >&2
	exit 1
}

grep -q "trap 'rm -f" "$IPRULES" || {
	echo "iprules.sh does not clean temporary files with a trap" >&2
	exit 1
}

if grep -q 'r/tmp/ipadd.conf' "$IPRULES"; then
	echo "iprules.sh still reads a hardcoded /tmp/ipadd.conf" >&2
	exit 1
fi
