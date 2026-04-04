#!/bin/sh

LIST_FILE="/usr/share/clashbackup/confit_list.conf"

[ -f "$LIST_FILE" ] || exit 0

while IFS='#' read -r filename _url _type; do
	[ -n "$filename" ] || continue
	uci set clash.config.config_update_name="$filename"
	uci commit clash
	sh /usr/share/clash/update.sh >/dev/null 2>&1
done < "$LIST_FILE"

exit 0
