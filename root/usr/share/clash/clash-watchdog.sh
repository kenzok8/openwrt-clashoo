#!/bin/sh

enable="$(uci -q get clash.config.enable 2>/dev/null)"
[ "$enable" = "1" ] || exit 0

if ! pidof mihomo clash-meta clash >/dev/null 2>&1; then
    /etc/init.d/clash restart >/dev/null 2>&1 &
fi
