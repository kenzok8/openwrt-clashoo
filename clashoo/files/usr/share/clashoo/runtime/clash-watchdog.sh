#!/bin/sh

enable="$(uci -q get clashoo.config.enable 2>/dev/null)"
[ "$enable" = "1" ] || exit 0

core_type="$(uci -q get clashoo.config.core_type 2>/dev/null)"

if [ "$core_type" = "singbox" ]; then
    if ! pidof sing-box >/dev/null 2>&1; then
        /etc/init.d/clashoo restart >/dev/null 2>&1 &
    fi
else
    if ! pidof mihomo clash-meta clash >/dev/null 2>&1; then
        /etc/init.d/clashoo restart >/dev/null 2>&1 &
    fi
fi
