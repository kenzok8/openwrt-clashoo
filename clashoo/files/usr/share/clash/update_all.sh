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
	uci set clash.config.config_update_name="$filename"
	uci commit clash
	log_update "自动更新订阅：${filename}"
	sh /usr/share/clash/update.sh >/dev/null 2>&1
done < "$LIST_FILE"
log_update "自动更新任务完成"

exit 0
