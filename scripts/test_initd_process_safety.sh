#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
INITD="$ROOT_DIR/clashoo/files/etc/init.d/clashoo"

grep -q '^shell_quote()' "$INITD" || {
	echo "init.d does not provide shell_quote for procd command construction" >&2
	exit 1
}

if grep -q "\$CLASH -d '\$CLASH_CONFIG'" "$INITD"; then
	echo "procd command still embeds unescaped CLASH/CLASH_CONFIG values" >&2
	exit 1
fi

grep -q '/proc/${_pid}/comm' "$INITD" || {
	echo "_kill_core does not verify process identity before SIGKILL" >&2
	exit 1
}
