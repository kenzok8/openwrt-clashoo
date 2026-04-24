#!/bin/sh

set -eu

RUNDIR="/tmp/clashoo"
PID_FILE="${RUNDIR}/access_check_daemon.pid"
LOCK_DIR="${RUNDIR}/access_check_daemon.lock"
INTERVAL="${ACCESS_CHECK_INTERVAL:-60}"

mkdir -p "$RUNDIR"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
	exit 0
fi

cleanup() {
	rm -rf "$LOCK_DIR" "$PID_FILE"
}
trap cleanup EXIT INT TERM

echo "$$" >"$PID_FILE"

while :; do
	/usr/share/clashoo/net/access_check_cache.sh >/dev/null 2>&1 || true
	sleep "$INTERVAL"
done
