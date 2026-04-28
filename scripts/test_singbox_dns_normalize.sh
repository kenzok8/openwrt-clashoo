#!/bin/sh
set -eu

ROOT_DIR=${ROOT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
UCODE=${UCODE:-$ROOT_DIR/clashoo/files/usr/share/clashoo/lib/normalize_singbox_config.uc}

if ! command -v ucode >/dev/null 2>&1; then
  echo "SKIP: ucode not installed" >&2
  exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/config.json" <<'JSON'
{
  "dns": {
    "servers": [
      { "type": "udp", "tag": "old", "server": "8.8.8.8" }
    ],
    "rules": [],
    "final": "old",
    "independent_cache": true
  },
  "route": {
    "rule_set": [
      { "tag": "geolocation-cn", "type": "remote", "format": "binary", "url": "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/geolocation-cn.srs", "download_detour": "DIRECT" },
      { "tag": "cn", "type": "remote", "format": "binary", "url": "https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/cn.srs", "download_detour": "DIRECT" }
    ],
    "rules": [
      { "rule_set": ["geolocation-cn", "cn"], "outbound": "DIRECT" }
    ]
  },
  "inbounds": [],
  "outbounds": [
    { "type": "direct", "tag": "direct" }
  ]
}
JSON

cat > "$tmp/clashoo" <<'UCI'
config clashoo 'config'
  option enhanced_mode 'fake-ip'
  option fake_ip_range '198.18.0.1/16'
  list default_nameserver '223.5.5.5'
  option dns_ecs '223.5.5.0/24'
  option singbox_independent_cache '0'

config dnsservers
  option enabled '1'
  option ser_type 'direct-nameserver'
  option ser_address '223.5.5.5'
  option protocol 'udp://'

config dnsservers
  option enabled '1'
  option ser_type 'proxy-server-nameserver'
  option ser_address '1.1.1.1'
  option protocol 'tls://'
  option ser_port '853'

UCI

ucode "$UCODE" "$tmp/config.json" 7891 7982 7890 1 6666 1053 9191 secret "$tmp/clashoo" >/dev/null

grep -q '\"client_subnet\": \"223.5.5.0/24\"' "$tmp/config.json"
! grep -q '\"independent_cache\"' "$tmp/config.json"
grep -q '\"tag\": \"dns_direct\"' "$tmp/config.json"
grep -q '\"type\": \"tls\", \"tag\": \"dns_proxy\", \"server\": \"1.1.1.1\", \"server_port\": 853' "$tmp/config.json"
grep -q '\"inbound\": \"dns-in\", \"action\": \"hijack-dns\"' "$tmp/config.json"
grep -q '\"tag\": \"dns_resolver\", \"server\": \"223.5.5.5\", \"detour\": \"direct\"' "$tmp/config.json"
grep -q '\"tag\": \"geolocation-cn\", \"type\": \"remote\", \"format\": \"binary\", \"url\": \"https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/geolocation-cn.srs\", \"download_detour\": \"direct\"' "$tmp/config.json"
grep -q '\"tag\": \"cn\", \"type\": \"remote\", \"format\": \"binary\", \"url\": \"https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/cn.srs\", \"download_detour\": \"direct\"' "$tmp/config.json"
grep -q '\"rule_set\": \[ \"geolocation-cn\", \"cn\" \], \"outbound\": \"DIRECT\"' "$tmp/config.json"

printf 'sing-box DNS normalize tests passed\n'
