#!/bin/sh

set -eu

fail() {
  echo "[FAIL] $1" >&2
  exit 1
}

pass() {
  echo "[PASS] $1"
}

sh -n /etc/init.d/clash || fail "init script syntax"
pass "init script syntax"

/etc/init.d/clash restart >/dev/null 2>&1 || fail "service restart"
sleep 3
pass "service restart"

api_code="$(curl -m 8 -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer 123456' http://127.0.0.1:9090/version || true)"
[ "$api_code" = "200" ] || fail "controller api status=$api_code"
pass "controller api"

netstat -lntup 2>/dev/null | grep -q ':9090' || fail "port 9090 listen"
netstat -lntup 2>/dev/null | grep -q ':5300' || fail "port 5300 listen"
pass "key ports listen"

grep -q "o.default = 'tproxy';" /www/luci-static/resources/view/clash/app.js || fail "udp default not tproxy"
pass "app.js udp default"

grep -q "o.value('2'" /www/luci-static/resources/view/clash/app.js || fail "core value 2 missing"
grep -q "o.value('3'" /www/luci-static/resources/view/clash/app.js || fail "core value 3 missing"
grep -q "o.value('1'" /www/luci-static/resources/view/clash/app.js && fail "core value 1 should be removed"
pass "app.js core mapping"

grep -q '^  listen: 0.0.0.0:5300' /etc/clash/config.yaml || fail "dns listen missing"
grep -q '^  nameserver:' /etc/clash/config.yaml || fail "dns nameserver missing"
grep -q 'https://https://' /etc/clash/config.yaml && fail "malformed dns upstream"
pass "generated dns section"

nft list table inet fw4 2>/dev/null | grep -q 'redirect to :7891' || fail "fw4 tcp redirect missing"
pass "fw4 redirect rule"

echo "[DONE] clash smoke verify"
