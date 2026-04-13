#!/bin/sh

REAL_LOG="/usr/share/clash/clash_real.txt"
UPDATE_LOG="/tmp/clash_update.txt"
LIST_FILE="/usr/share/clashbackup/confit_list.conf"
SUB_DIR="/usr/share/clash/config/sub"
TMP_FILE="/tmp/clash_update_$$.yaml"
TEMPLATE_DIR="/usr/share/clash/config/custom"
TEMPLATE_BIND_FILE="/usr/share/clashbackup/template_bindings.conf"

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

log_update() {
	printf '  %s - %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$UPDATE_LOG"
}

cleanup_tmp() {
	rm -f "$TMP_FILE" >/dev/null 2>&1
}

trap cleanup_tmp EXIT INT TERM

sanitize_part() {
	printf '%s' "$1" | sed -e 's/\.[Yy][Aa][Mm][Ll]$//' -e 's/\.[Yy][Mm][Ll]$//' -e 's/[^A-Za-z0-9._-]/-/g'
}

template_output_name() {
	local sub tpl s t
	sub="$1"
	tpl="$2"
	s="$(sanitize_part "$sub")"
	t="$(sanitize_part "$tpl")"
	[ -n "$s" ] || s="sub"
	[ -n "$t" ] || t="template"
	printf '_merged_%s__%s.yaml' "$s" "$t"
}

[ -n "$config_name" ] || exit 1
[ -f "$LIST_FILE" ] || exit 1

line="$(awk -F '#' -v n="$config_name" '$1 == n { print $0; exit }' "$LIST_FILE")"
[ -n "$line" ] || exit 1

url="$(printf '%s' "$line" | awk -F '#' '{print $2}')"
typ="$(printf '%s' "$line" | awk -F '#' '{print $3}')"

[ "$typ" = "clash" ] || [ "$typ" = "meta" ] || exit 0
[ -n "$url" ] || exit 1

target_file="$SUB_DIR/$config_name"

log_update "开始更新订阅：${config_name}"
log_text "Updating configuration..." "开始更新配置"

if ! wget -q -c4 --no-check-certificate --user-agent="Clash/OpenWRT" "$url" -O "$TMP_FILE"; then
	log_update "更新失败（下载失败）：${config_name}"
	log_text "Configuration update failed" "更新配置失败"
	exit 1
fi

if ! grep -Eq '^(proxies|proxy-providers):' "$TMP_FILE" 2>/dev/null; then
	log_update "更新失败（YAML 校验失败）：${config_name}"
	log_text "Configuration update failed" "更新配置失败"
	exit 1
fi

mv "$TMP_FILE" "$target_file" >/dev/null 2>&1 || exit 1

need_restart=0
new_use_config=""
new_config_type=""

if [ -f "$TEMPLATE_BIND_FILE" ] && [ -x /usr/share/clash/update/template_merge.sh ]; then
	template_name="$(awk -F '#' -v n="$config_name" '$1==n && ($3=="1" || $3=="true") {print $2; exit}' "$TEMPLATE_BIND_FILE" 2>/dev/null)"
	if [ -n "$template_name" ] && [ -f "${TEMPLATE_DIR}/${template_name}" ]; then
		merged_name="$(template_output_name "$config_name" "$template_name")"
		merged_path="${TEMPLATE_DIR}/${merged_name}"
		if sh /usr/share/clash/update/template_merge.sh "$target_file" "${TEMPLATE_DIR}/${template_name}" "$merged_path" >/dev/null 2>&1; then
			log_update "模板生成成功：${merged_name}"
			if [ "$use_config" = "$target_file" ] || [ "$use_config" = "$merged_path" ]; then
				new_use_config="$merged_path"
				new_config_type="3"
				need_restart=1
			fi
		else
			log_update "模板生成失败：${config_name} <- ${template_name}"
		fi
	fi
fi

if [ -z "$new_use_config" ] && [ "$c_type" = "1" ] && [ "$target_file" = "$use_config" ]; then
	need_restart=1
fi

if [ -n "$new_use_config" ]; then
	uci set clash.config.use_config="$new_use_config" >/dev/null 2>&1
	uci set clash.config.config_type="$new_config_type" >/dev/null 2>&1
	uci commit clash >/dev/null 2>&1 || true
fi

if [ "$need_restart" = "1" ]; then
	if pidof clash >/dev/null 2>&1 || pidof mihomo >/dev/null 2>&1 || pidof clash-meta >/dev/null 2>&1; then
		/etc/init.d/clash restart >/dev/null 2>&1
		log_update "已重启服务以应用更新配置：${config_name}"
	fi
fi

log_update "更新完成：${config_name}"
log_text "Configuration update completed" "更新配置完成"
sleep 1
log_text "Clash for OpenWRT" "Clash for OpenWRT"
exit 0
