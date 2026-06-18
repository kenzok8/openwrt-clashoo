#!/bin/sh

set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
CHECK="$ROOT/clashoo/files/usr/share/clashoo/net/access_check.sh"
CACHE="$ROOT/clashoo/files/usr/share/clashoo/net/access_check_cache.sh"
OVERVIEW="$ROOT/luci-app-clashoo/htdocs/luci-static/resources/view/clashoo/overview.js"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM

mkdir -p "$TMP/bin"
cat >"$TMP/bin/uci" <<'EOF'
#!/bin/sh
printf '7890\n'
EOF
cat >"$TMP/bin/curl" <<'EOF'
#!/bin/sh
fmt=''
[ -n "${TEST_CURL_ARGS:-}" ] && printf '%s\n' "$*" >"$TEST_CURL_ARGS"
while [ "$#" -gt 0 ]; do
	if [ "$1" = '-w' ]; then
		fmt="$2"
		break
	fi
	shift
done
case "$fmt" in
	*time_starttransfer*) printf '200 0.100' ;;
	*) printf '200 0.900' ;;
esac
EOF
chmod +x "$TMP/bin/uci" "$TMP/bin/curl"

out="$(PATH="$TMP/bin:$PATH" sh "$CHECK" https://example.test proxy)"
printf '%s\n' "$out" | grep -F 'avg_ms=100' >/dev/null || {
	echo "FAIL: access check measures full download time: $out" >&2
	exit 1
}

cat >"$TMP/bin/ip" <<'EOF'
#!/bin/sh
case "$*" in
	'route show default') echo 'default via 192.168.3.254 dev br-lan proto static' ;;
	'route get 223.5.5.5') echo '223.5.5.5 via 198.18.0.2 dev Meta table 2022' ;;
esac
EOF
cat >"$TMP/bin/nslookup" <<'EOF'
#!/bin/sh
echo 'Address: 116.55.241.188'
EOF
chmod +x "$TMP/bin/ip" "$TMP/bin/nslookup"

TEST_CURL_ARGS="$TMP/curl.args" PATH="$TMP/bin:$PATH" \
	sh "$CHECK" https://www.douyin.com/generate_204 direct >/dev/null
grep -F -- '--interface br-lan' "$TMP/curl.args" >/dev/null || {
	echo 'FAIL: direct probe did not bind the physical default interface' >&2
	exit 1
}

grep -F 'https://www.douyin.com/generate_204' "$CACHE" >/dev/null || {
	echo 'FAIL: ByteDance probe is not using the zero-byte HTTPS endpoint' >&2
	exit 1
}

grep -F 'return normalizeItems(ac.proxy)' "$OVERVIEW" >/dev/null || {
	echo 'FAIL: access-check UI does not show core-routed probe results' >&2
	exit 1
}

echo 'PASS: access check latency behavior'
