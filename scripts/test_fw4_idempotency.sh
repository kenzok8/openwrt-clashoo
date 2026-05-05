#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
FW4="$ROOT_DIR/clashoo/files/usr/share/clashoo/net/fw4.sh"

grep -q 'ip rule show' "$FW4" || {
	echo "fw4.sh does not check existing ip rules before adding" >&2
	exit 1
}

grep -q '_route_table_dec="$((PROXY_ROUTE_TABLE))"' "$FW4" || {
	echo "fw4.sh does not normalize hex route table id for ip rule output" >&2
	exit 1
}

grep -q 'ip route show table' "$FW4" || {
	echo "fw4.sh does not check existing route table entries before adding" >&2
	exit 1
}
