#!/bin/sh

REAL_LOG="/usr/share/clash/clash_real.txt"
LIST_FILE="/usr/share/clashbackup/confit_list.conf"
SUB_DIR="/usr/share/clash/config/sub"
TMP_PREFIX="/tmp/clash_sub_$$"

subtype="$(uci -q get clash.config.subcri 2>/dev/null)"
config_name_raw="$(uci -q get clash.config.config_name 2>/dev/null)"
lang="$(uci -q get luci.main.lang 2>/dev/null)"

log_text() {
	if [ "$lang" = "zh_cn" ]; then
		echo "$2" >"$REAL_LOG"
	else
		echo "$1" >"$REAL_LOG"
	fi
}

sanitize_name() {
	local name
	name="$1"
	name="$(printf '%s' "$name" | tr 'A-Z' 'a-z')"
	name="$(printf '%s' "$name" | sed -e 's/\.yaml$//' -e 's/\.yml$//')"
	name="$(printf '%s' "$name" | tr ' /' '--')"
	name="$(printf '%s' "$name" | sed -e 's/[^a-z0-9._-]/-/g' -e 's/--\+/-/g' -e 's/^[._-]*//' -e 's/[._-]*$//')"
	printf '%s' "$name"
}

sanitize_custom_name() {
	local name
	name="$1"
	name="$(printf '%s' "$name" | sed -e 's/\.yaml$//' -e 's/\.yml$//')"
	name="$(printf '%s' "$name" | tr ' /' '--')"
	name="$(printf '%s' "$name" | sed -e 's/[\\]//g' -e 's/\.\.+/-/g' -e 's/--\+/-/g' -e 's/^[._-]*//' -e 's/[._-]*$//')"
	printf '%s' "$name"
}

url_to_name() {
	local url host qname
	url="$1"

	qname="$(printf '%s' "$url" | sed -n 's/.*[?&]filename=\([^&#]*\).*/\1/p')"
	[ -n "$qname" ] || qname="$(printf '%s' "$url" | sed -n 's/.*[?&]name=\([^&#]*\).*/\1/p')"
	qname="$(sanitize_name "$qname")"
	if [ -n "$qname" ]; then
		printf '%s' "$qname"
		return
	fi

	host="$(printf '%s' "$url" | sed -e 's#^[a-zA-Z0-9+.-]*://##' -e 's#/.*$##' -e 's/:.*$//')"
	host="$(sanitize_name "$host")"
	[ -n "$host" ] || host="sub"
	printf '%s' "$host"
}

next_available_name() {
	local base try idx
	base="$1"
	base="$(printf '%s' "$base" | sed -e 's/\.yaml$//' -e 's/\.yml$//')"
	base="$(printf '%s' "$base" | tr ' /' '--')"
	base="$(printf '%s' "$base" | sed -e 's/[\\]//g' -e 's/\.\.+/-/g' -e 's/--\+/-/g' -e 's/^[._-]*//' -e 's/[._-]*$//')"
	[ -n "$base" ] || base="sub"

	if [ ! -f "$SUB_DIR/${base}.yaml" ]; then
		printf '%s' "$base"
		return
	fi

	idx=2
	while :; do
		try="${base}-${idx}"
		if [ ! -f "$SUB_DIR/${try}.yaml" ]; then
			printf '%s' "$try"
			return
		fi
		idx=$((idx + 1))
	done
}

get_subscription_urls() {
	uci -q show clash.config 2>/dev/null | awk -F"'" '
		/^clash.config.clash_url=/ {
			if (NF >= 3) {
				for (i = 2; i <= NF; i += 2) {
					if (length($i) > 0) print $i
				}
			} else {
				sub(/^clash.config.clash_url=/, "", $0)
				if (length($0) > 0) print $0
			}
		}
	'
}

ensure_system_dns() {
	local test_host
	test_host="github.com"
	if nslookup "$test_host" 127.0.0.1 >/dev/null 2>&1 || nslookup "$test_host" >/dev/null 2>&1; then
		return 0
	fi

	uci delete dhcp.@dnsmasq[0].server >/dev/null 2>&1
	uci set dhcp.@dnsmasq[0].noresolv='0' >/dev/null 2>&1
	uci del_list dhcp.@dnsmasq[0].server='127.0.0.1#' >/dev/null 2>&1
	uci del_list dhcp.@dnsmasq[0].server='127.0.0.1#5300' >/dev/null 2>&1
	uci add_list dhcp.@dnsmasq[0].server='119.29.29.29' >/dev/null 2>&1
	uci add_list dhcp.@dnsmasq[0].server='223.5.5.5' >/dev/null 2>&1
	uci commit dhcp >/dev/null 2>&1
	/etc/init.d/dnsmasq restart >/dev/null 2>&1
	sleep 2
}

download_subscription() {
	local url target tmp
	url="$1"
	target="$2"
	tmp="${TMP_PREFIX}.yaml"

	rm -f "$tmp" >/dev/null 2>&1
	wget -q --tries=4 --timeout=20 --no-check-certificate --user-agent="Clash/OpenWRT" "$url" -O "$tmp"
	if [ "$?" -ne 0 ]; then
		rm -f "$tmp" >/dev/null 2>&1
		return 1
	fi

	if ! grep -Eq '^(proxies|proxy-providers):' "$tmp" 2>/dev/null; then
		rm -f "$tmp" >/dev/null 2>&1
		return 1
	fi

	mv "$tmp" "$target" >/dev/null 2>&1 || {
		rm -f "$tmp" >/dev/null 2>&1
		return 1
	}

	return 0
}

upsert_meta() {
	local filename url typ tmpf
	filename="$1"
	url="$2"
	typ="$3"
	tmpf="${TMP_PREFIX}.list"

	[ -f "$LIST_FILE" ] || touch "$LIST_FILE"
	awk -F '#' -v n="$filename" '$1 != n { print $0 }' "$LIST_FILE" >"$tmpf"
	printf '%s#%s#%s\n' "$filename" "$url" "$typ" >>"$tmpf"
	mv "$tmpf" "$LIST_FILE"
}

cleanup_tmp() {
	rm -f "${TMP_PREFIX}.yaml" "${TMP_PREFIX}.urls" "${TMP_PREFIX}.list" >/dev/null 2>&1
}

trap cleanup_tmp EXIT INT TERM

[ "$subtype" = "clash" ] || [ "$subtype" = "meta" ] || subtype="clash"

mkdir -p "$SUB_DIR" /usr/share/clashbackup >/dev/null 2>&1
[ -f "$LIST_FILE" ] || touch "$LIST_FILE"

URLS_FILE="${TMP_PREFIX}.urls"
get_subscription_urls | sed '/^[[:space:]]*$/d' | awk '!seen[$0]++' >"$URLS_FILE"

url_count="$(wc -l <"$URLS_FILE" 2>/dev/null | tr -d ' ')"
if [ -z "$url_count" ] || [ "$url_count" -eq 0 ]; then
	log_text "No subscription URL found" "未找到订阅链接"
	sleep 2
	log_text "Clash for OpenWRT" "Clash for OpenWRT"
	exit 1
fi

ensure_system_dns
log_text "Downloading subscription..." "开始下载订阅..."

base_name="$(sanitize_custom_name "$config_name_raw")"
timestamp="$(date +%Y%m%d%H%M%S)"

success=0
failed=0
idx=0
first_file=""

while IFS= read -r url; do
	[ -n "$url" ] || continue
	idx=$((idx + 1))

	if [ -n "$base_name" ]; then
		if [ "$url_count" -gt 1 ]; then
			name_candidate="$(sanitize_name "${base_name}-${idx}")"
			file_base="$(next_available_name "$name_candidate")"
		else
			file_base="$base_name"
		fi
	else
		name_candidate="$(url_to_name "$url")-${timestamp}"
		if [ "$url_count" -gt 1 ]; then
			name_candidate="${name_candidate}-${idx}"
		fi
		file_base="$(next_available_name "$name_candidate")"
	fi

	target_file="$SUB_DIR/${file_base}.yaml"
	if download_subscription "$url" "$target_file"; then
		upsert_meta "${file_base}.yaml" "$url" "$subtype"
		[ -n "$first_file" ] || first_file="$target_file"
		success=$((success + 1))
	else
		failed=$((failed + 1))
	fi
done <"$URLS_FILE"

if [ "$success" -gt 0 ]; then
	use_config="$(uci -q get clash.config.use_config 2>/dev/null)"
	if [ -z "$use_config" ] || [ ! -f "$use_config" ]; then
		uci set clash.config.use_config="$first_file"
		uci set clash.config.config_type='1'
		uci commit clash
	fi
	log_text "Subscription download completed: ${success} success, ${failed} failed" "订阅下载完成：成功 ${success} 个，失败 ${failed} 个"
	ret=0
else
	log_text "All subscription downloads failed" "订阅下载失败"
	ret=1
fi

sleep 2
log_text "Clash for OpenWRT" "Clash for OpenWRT"
exit "$ret"
