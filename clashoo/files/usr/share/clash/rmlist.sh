#!/bin/sh

name="$(uci -q get clash.config.config_name_remove 2>/dev/null)"
LIST_FILE="/usr/share/clashbackup/confit_list.conf"

[ -n "$name" ] || exit 0
[ -f "$LIST_FILE" ] || exit 0

tmp_file="/tmp/clash_rmlist_$$.tmp"
awk -F '#' -v n="$name" '$1 != n { print $0 }' "$LIST_FILE" > "$tmp_file"
mv "$tmp_file" "$LIST_FILE"
sed -i '/^$/d' "$LIST_FILE"

rm -f "/usr/share/clash/config/sub/$name" >/dev/null 2>&1

exit 0
