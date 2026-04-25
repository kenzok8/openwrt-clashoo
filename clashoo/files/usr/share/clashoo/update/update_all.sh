#!/bin/sh

LIST_FILE="/usr/share/clashbackup/confit_list.conf"
UPDATE_LOG="/tmp/clash_update.txt"

log_update() {
	printf '  %s - %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$UPDATE_LOG"
}

[ -f "$LIST_FILE" ] || exit 0

log_update "自动更新任务启动"
while IFS='#' read -r filename _url _type; do
	[ -n "$filename" ] || continue
	uci set clashoo.config.config_update_name="$filename"
	uci commit clashoo
	log_update "自动更新订阅：${filename}"
	sh /usr/share/clashoo/update/update.sh >/dev/null 2>&1
done < "$LIST_FILE"
log_update "自动更新任务完成"

log_update "更新大陆白名单"
sh /usr/share/clashoo/update/update_china_ip.sh >> "$UPDATE_LOG" 2>&1

exit 0
