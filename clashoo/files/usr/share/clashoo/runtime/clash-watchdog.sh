#!/bin/sh

enable="$(uci -q get clashoo.config.enable 2>/dev/null)"
[ "$enable" = "1" ] || exit 0

if ! pidof mihomo clash-meta >/dev/null 2>&1; then
    /etc/init.d/clashoo restart >/dev/null 2>&1 &
fi
