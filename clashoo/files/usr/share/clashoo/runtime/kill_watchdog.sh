#!/bin/sh

enable=$(uci get clashoo.config.enable 2>/dev/null)
if [ "${enable:-0}" -eq 0 ]; then
	for pid in $(pidof clash-watchdog.sh 2>/dev/null); do
		[ "$pid" = "$$" ] && continue
		kill -9 "$pid" >/dev/null 2>&1
	done
fi
