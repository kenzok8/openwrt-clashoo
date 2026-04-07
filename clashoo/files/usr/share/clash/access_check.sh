#!/bin/sh

url="$1"
[ -n "$url" ] || exit 1

proxy_port="$(uci get clash.config.http_port 2>/dev/null)"
[ -z "$proxy_port" ] && proxy_port=8080

attempts=1
ok=0
sum_ms=0
last_code=000

i=1
while [ "$i" -le "$attempts" ]; do
	out="$(curl -m 2 -s -o /dev/null -w '%{http_code} %{time_total}' -x "http://127.0.0.1:${proxy_port}" "$url" 2>/dev/null || true)"
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
