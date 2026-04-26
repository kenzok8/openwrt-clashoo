#!/bin/sh

REAL_LOG="/usr/share/clashoo/clashoo_real.txt"
UPDATE_LOG="/tmp/clash_update.txt"
LIST_FILE="/usr/share/clashbackup/confit_list.conf"
SUB_DIR="/usr/share/clashoo/config/sub"
TMP_FILE="/tmp/clash_update_$$.yaml"
TEMPLATE_DIR="/usr/share/clashoo/config/custom"
TEMPLATE_BIND_FILE="/usr/share/clashbackup/template_bindings.conf"

config_name="$(uci -q get clashoo.config.config_update_name 2>/dev/null)"
lang="$(uci -q get luci.main.lang 2>/dev/null)"
c_type="$(uci -q get clashoo.config.config_type 2>/dev/null)"
use_config="$(uci -q get clashoo.config.use_config 2>/dev/null)"

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

HDR_FILE="/tmp/clash_update_$$.hdr"
ERR_FILE="/tmp/clash_update_$$.err"

cleanup_tmp() {
	rm -f "$TMP_FILE" "$HDR_FILE" "$ERR_FILE" >/dev/null 2>&1
}

trap cleanup_tmp EXIT INT TERM

sanitize_part() {
	printf '%s' "$1" | sed -e 's/\.[Yy][Aa][Mm][Ll]$//' -e 's/\.[Yy][Mm][Ll]$//' -e 's/[^A-Za-z0-9._-]/-/g'
}

extract_host() {
	printf '%s' "$1" | sed -e 's#^[a-zA-Z0-9+.-]*://##' -e 's#/.*$##' -e 's#:.*$##' -e 's#.*@##'
}

resolve_via() {
	local host dns
	host="$1"
	dns="$2"
	nslookup "$host" "$dns" 2>/dev/null | awk '
		/^Address/ {
			ip = $NF
			if (ip ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/ &&
				ip !~ /^127\./ &&
				ip !~ /^0\./ &&
				ip !~ /^198\.18\./ &&
				ip != "8.8.8.8" && ip != "8.8.4.4" &&
				ip != "1.1.1.1" && ip != "1.0.0.1" &&
				ip != "223.5.5.5" && ip != "223.6.6.6" &&
				ip != "119.29.29.29" && ip != "114.114.114.114") {
				print ip
				exit
			}
		}'
}

curl_with_resolve() {
	local url tmp hdr err ua extra http_code
	url="$1"
	tmp="$2"
	hdr="$3"
	err="$4"
	ua="$5"
	extra="$6"

	rm -f "$tmp" "$hdr" "$err" >/dev/null 2>&1
	# shellcheck disable=SC2086
	http_code="$(curl -sSL --connect-timeout 15 --max-time 60 \
		--speed-time 30 --speed-limit 1 --retry 2 \
		-H "User-Agent: ${ua}" -D "$hdr" -o "$tmp" \
		$extra \
		-w '%{http_code}' "$url" 2>"$err")"
	local rc=$?
	printf '%s\n' "$http_code"
	return "$rc"
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

ua="$(uci -q get clashoo.config.sub_ua 2>/dev/null)"
[ -n "$ua" ] || ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

if command -v curl >/dev/null 2>&1; then
	_http="$(curl_with_resolve "$url" "$TMP_FILE" "$HDR_FILE" "$ERR_FILE" "$ua" "")"
	_rc=$?

	if [ "$_rc" -ne 0 ] || [ "$_http" = "000" ]; then
		_host="$(extract_host "$url")"
		if [ -n "$_host" ]; then
			for _dns in 223.5.5.5 119.29.29.29 1.1.1.1 8.8.8.8; do
				_ip="$(resolve_via "$_host" "$_dns")"
				[ -n "$_ip" ] || continue
				log_update "DNS 回退：${_host} -> ${_ip} (@${_dns})"
				_extra="--resolve ${_host}:443:${_ip} --resolve ${_host}:80:${_ip}"
				_http="$(curl_with_resolve "$url" "$TMP_FILE" "$HDR_FILE" "$ERR_FILE" "$ua" "$_extra")"
				_rc=$?
				[ "$_rc" -eq 0 ] && [ "$_http" = "200" ] && break
			done
		fi
	fi
else
	wget -q --tries=4 --timeout=20 --user-agent="$ua" "$url" -O "$TMP_FILE" 2>"$ERR_FILE"
	_rc=$?
	_http=""
fi

if [ "$_rc" -ne 0 ]; then
	_msg="$(grep -a 'curl:' "$ERR_FILE" 2>/dev/null | tail -1)"
	[ -z "$_msg" ] && _msg="$(tail -1 "$ERR_FILE" 2>/dev/null)"
	log_update "更新失败（下载失败 rc=${_rc}）：${config_name} ${_msg}"
	log_text "Configuration update failed" "更新配置失败"
	exit 1
fi

if [ -n "$_http" ] && [ "$_http" != "200" ]; then
	log_update "更新失败（HTTP ${_http}）：${config_name}"
	log_text "Configuration update failed" "更新配置失败"
	exit 1
fi

if ! grep -Eq '^(proxies|proxy-providers):' "$TMP_FILE" 2>/dev/null; then
	log_update "更新失败（内容不含 proxies/proxy-providers）：${config_name}"
	log_text "Configuration update failed" "更新配置失败"
	exit 1
fi

_info_line="$(grep -i 'subscription-userinfo:' "$HDR_FILE" 2>/dev/null | head -1 | \
	sed 's/^[Ss]ubscription-[Uu]serinfo:[[:space:]]*//' | tr -d '\r')"
[ -n "$_info_line" ] && printf '%s\n' "$_info_line" > "${target_file}.info" || \
	rm -f "${target_file}.info" >/dev/null 2>&1
rm -f "$HDR_FILE" >/dev/null 2>&1

mv "$TMP_FILE" "$target_file" >/dev/null 2>&1 || exit 1

need_restart=0
new_use_config=""
new_config_type=""

if [ -f "$TEMPLATE_BIND_FILE" ] && [ -x /usr/share/clashoo/update/template_merge.sh ]; then
	template_name="$(awk -F '#' -v n="$config_name" '$1==n && ($3=="1" || $3=="true") {print $2; exit}' "$TEMPLATE_BIND_FILE" 2>/dev/null)"
	if [ -n "$template_name" ] && [ -f "${TEMPLATE_DIR}/${template_name}" ]; then
		merged_name="$(template_output_name "$config_name" "$template_name")"
		merged_path="${TEMPLATE_DIR}/${merged_name}"
		if sh /usr/share/clashoo/update/template_merge.sh "$target_file" "${TEMPLATE_DIR}/${template_name}" "$merged_path" >/dev/null 2>&1; then
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
	uci set clashoo.config.use_config="$new_use_config" >/dev/null 2>&1
	uci set clashoo.config.config_type="$new_config_type" >/dev/null 2>&1
	uci commit clashoo >/dev/null 2>&1 || true
fi

if [ "$need_restart" = "1" ]; then
	if pidof clash >/dev/null 2>&1 || pidof mihomo >/dev/null 2>&1 || pidof clash-meta >/dev/null 2>&1; then
		/etc/init.d/clashoo restart >/dev/null 2>&1
		log_update "已重启服务以应用更新配置：${config_name}"
	fi
fi

log_update "更新完成：${config_name}"
log_text "Configuration update completed" "更新配置完成"
sleep 1
log_text "Clash for OpenWRT" "Clash for OpenWRT"
exit 0
