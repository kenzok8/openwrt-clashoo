#!/bin/sh

set -eu

LOG_FILE="/usr/share/clash/clash.txt"
TARGET_V4="/usr/share/clash/china_ip.txt"
TARGET_V6="/usr/share/clash/china_ipv6.txt"
TMP_V4="/tmp/china_ip.txt.$$"
TMP_V6="/tmp/china_ipv6.txt.$$"

log() {
	printf '  %s - %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"
}

download_with_fallback() {
	local url="$1"
	local output="$2"
	local ip

	if curl -fsSL "$url" -o "$output"; then
		return 0
	fi

	case "$url" in
		https://ispip.clang.cn/*)
			for ip in 182.247.248.127 103.220.64.183; do
				if curl -fsSL --resolve "ispip.clang.cn:443:${ip}" "$url" -o "$output"; then
					log "DNS 异常，已使用 --resolve(${ip}) 回源下载"
					return 0
				fi
			done
			;;
	esac

	return 1
}

cleanup() {
	rm -f "$TMP_V4" "$TMP_V6"
}

trap cleanup EXIT INT TERM

url4="$(uci -q get clash.config.china_ip_url 2>/dev/null || true)"
url6="$(uci -q get clash.config.china_ipv6_url 2>/dev/null || true)"
bypass_china="$(uci -q get clash.config.bypass_china 2>/dev/null || true)"

[ -n "$url4" ] || url4='https://ispip.clang.cn/all_cn.txt'
[ -n "$url6" ] || url6='https://ispip.clang.cn/all_cn_ipv6.txt'

log '开始更新大陆白名单'

download_with_fallback "$url4" "$TMP_V4"
[ -s "$TMP_V4" ] || {
	log '大陆 IPv4 白名单下载失败：返回为空'
	exit 1
}
mv "$TMP_V4" "$TARGET_V4"
chmod 644 "$TARGET_V4" >/dev/null 2>&1 || true
log '大陆 IPv4 白名单更新完成'

if download_with_fallback "$url6" "$TMP_V6"; then
	if [ -s "$TMP_V6" ]; then
		mv "$TMP_V6" "$TARGET_V6"
		chmod 600 "$TARGET_V6" >/dev/null 2>&1 || true
		log '大陆 IPv6 白名单更新完成'
	else
		log '大陆 IPv6 白名单下载为空，保留原文件'
	fi
else
	log '大陆 IPv6 白名单下载失败，保留原文件'
fi

case "$bypass_china" in
	1|true|TRUE|yes|on)
		if /usr/share/clash/fw4.sh apply >/dev/null 2>&1; then
			log '大陆白名单规则已重载'
		else
			log '大陆白名单规则重载失败'
			exit 1
		fi
		;;
	*)
		log 'bypass_china 未启用，仅更新白名单文件'
		;;
esac

log '大陆白名单更新流程完成'
