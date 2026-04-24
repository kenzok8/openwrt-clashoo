#!/bin/sh
set -eu

ROOT_DIR=${ROOT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
HELPER=${HELPER:-$ROOT_DIR/clashoo/files/usr/share/clashoo/runtime/dns_helpers.sh}

if [ ! -f "$HELPER" ]; then
  echo "missing helper: $HELPER" >&2
  exit 1
fi

. "$HELPER"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_eq() {
  name=$1
  expected=$2
  actual=$3
  [ "$expected" = "$actual" ] || fail "$name: expected [$expected], got [$actual]"
}

assert_eq 'udp address gets scheme' 'udp://223.5.5.5' "$(dns_normalize_server '223.5.5.5' 'udp://' '')"
assert_eq 'legacy udp token gets scheme' 'udp://119.29.29.29' "$(dns_normalize_server '119.29.29.29' 'udp' '')"
assert_eq 'tls port is appended' 'tls://dns.alidns.com:853' "$(dns_normalize_server 'dns.alidns.com' 'tls://' '853')"
assert_eq 'dot token maps to tls' 'tls://1.1.1.1:853' "$(dns_normalize_server '1.1.1.1' 'dot' '853')"
assert_eq 'https url is preserved' 'https://doh.pub/dns-query' "$(dns_normalize_server 'https://doh.pub/dns-query' '' '')"
assert_eq 'quic address gets port' 'quic://dns.adguard.com:784' "$(dns_normalize_server 'dns.adguard.com' 'quic://' '784')"
assert_eq 'none protocol preserves host port' '8.8.8.8:53' "$(dns_normalize_server '8.8.8.8' 'none' '53')"

printf 'dns helper tests passed\n'
