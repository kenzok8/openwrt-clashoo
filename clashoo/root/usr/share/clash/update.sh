#!/bin/sh

REAL_LOG="/usr/share/clash/clash_real.txt"
LIST_FILE="/usr/share/clashbackup/confit_list.conf"
SUB_DIR="/usr/share/clash/config/sub"
TMP_FILE="/tmp/clash_update_$$.yaml"

config_name="$(uci -q get clash.config.config_update_name 2>/dev/null)"
lang="$(uci -q get luci.main.lang 2>/dev/null)"
c_type="$(uci -q get clash.config.config_type 2>/dev/null)"
use_config="$(uci -q get clash.config.use_config 2>/dev/null)"

log_text() {
	if [ "$lang" = "zh_cn" ]; then
		echo "$2" >"$REAL_LOG"
	else
		echo "$1" >"$REAL_LOG"
	fi
}

cleanup_tmp() {
	rm -f "$TMP_FILE" >/dev/null 2>&1
}

trap cleanup_tmp EXIT INT TERM

[ -n "$config_name" ] || exit 1
[ -f "$LIST_FILE" ] || exit 1

line="$(awk -F '#' -v n="$config_name" '$1 == n { print $0; exit }' "$LIST_FILE")"
[ -n "$line" ] || exit 1

url="$(printf '%s' "$line" | awk -F '#' '{print $2}')"
typ="$(printf '%s' "$line" | awk -F '#' '{print $3}')"

[ "$typ" = "clash" ] || [ "$typ" = "meta" ] || exit 0
[ -n "$url" ] || exit 1

target_file="$SUB_DIR/$config_name"

log_text "Updating configuration..." "开始更新配置"

if ! wget -q -c4 --no-check-certificate --user-agent="Clash/OpenWRT" "$url" -O "$TMP_FILE"; then
	log_text "Configuration update failed" "更新配置失败"
	exit 1
fi

if ! grep -Eq '^(proxies|proxy-providers):' "$TMP_FILE" 2>/dev/null; then
	log_text "Configuration update failed" "更新配置失败"
	exit 1
fi

mv "$TMP_FILE" "$target_file" >/dev/null 2>&1 || exit 1

if [ "$c_type" = "1" ] && [ "$target_file" = "$use_config" ]; then
	if pidof clash >/dev/null 2>&1 || pidof mihomo >/dev/null 2>&1 || pidof clash-meta >/dev/null 2>&1; then
		/etc/init.d/clash restart >/dev/null 2>&1
	fi
fi

log_text "Configuration update completed" "更新配置完成"
sleep 1
log_text "Clash for OpenWRT" "Clash for OpenWRT"
exit 0
