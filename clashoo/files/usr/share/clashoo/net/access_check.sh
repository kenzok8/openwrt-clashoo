#!/bin/sh
# clashoo access check
# 用法: access_check.sh <url> [mode]
#   mode = direct | proxy（默认 proxy）
#     direct: 经 252 主干直连，不走任何代理
#     proxy:  走 clashoo 本地代理端口，验证核心出站

url="$1"
mode="${2:-proxy}"
[ -n "$url" ] || exit 1

attempts=1
ok=0
sum_ms=0
last_code=000

set -- -4 -L -m 4 -s -o /dev/null -w '%{http_code} %{time_total}'
if [ "$mode" = "direct" ]; then
	# 强制不走任何代理，避免误读 http_proxy 环境变量
	set -- "$@" --noproxy '*'
else
	proxy_port="$(uci get clashoo.config.mixed_port 2>/dev/null)"
	[ -z "$proxy_port" ] && proxy_port="$(uci get clashoo.config.http_port 2>/dev/null)"
	[ -z "$proxy_port" ] && proxy_port=7890
	set -- "$@" -x "http://127.0.0.1:${proxy_port}"
fi
set -- "$@" "$url"

i=1
while [ "$i" -le "$attempts" ]; do
	out="$(curl "$@" 2>/dev/null || true)"
	code="$(printf '%s' "$out" | awk '{print $1}')"
	time_s="$(printf '%s' "$out" | awk '{print $2}')"
	[ -n "$code" ] || code=000
	[ -n "$time_s" ] || time_s=0
	ms="$(awk -v t="$time_s" 'BEGIN{printf "%d", t*1000}')"
	last_code="$code"
	if [ "$code" = "200" ] || [ "$code" = "204" ] || [ "$code" = "301" ] || [ "$code" = "302" ]; then
		ok=$((ok + 1))
		sum_ms=$((sum_ms + ms))
	fi
	i=$((i + 1))
done

loss=$((attempts - ok))
avg_ms=0
if [ "$ok" -gt 0 ]; then
	avg_ms=$((sum_ms / ok))
fi

echo "ok=$ok attempts=$attempts loss=$loss avg_ms=$avg_ms code=$last_code"
