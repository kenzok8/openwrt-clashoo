#!/bin/sh

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
RULESET_DIR="${ROOT_DIR}/clashoo/files/usr/share/clashoo/ruleset"
TMP_DIR="$(mktemp -d)"
GEOSITE_BASE="${GEOSITE_BASE:-https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite}"
GEOIP_BASE="${GEOIP_BASE:-https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip}"

cleanup() {
	rm -rf "$TMP_DIR"
}

trap cleanup EXIT INT TERM

fetch_ruleset() {
	tag="$1"
	base="$2"
	remote_name="${3:-$tag}"
	url="${base}/${remote_name}.srs"
	tmp_file="${TMP_DIR}/${tag}.srs"
	out_file="${RULESET_DIR}/${tag}.srs"

	echo "fetch ${tag}.srs"
	curl -fsSL --retry 3 --retry-delay 2 "$url" -o "$tmp_file"
	[ -s "$tmp_file" ] || {
		echo "empty ruleset: $url" >&2
		exit 1
	}
	mv "$tmp_file" "$out_file"
}

mkdir -p "$RULESET_DIR"
rm -f "${RULESET_DIR}"/*.srs

# Minimal built-in set:
# - geolocation-!cn: required by fake-ip DNS and broad non-CN routing.
# - geosite-cn: local alias for subscription tags geolocation-cn/cn.
# - cn-ip/private-ip: keep China/private IP direct without remote downloads.
fetch_ruleset "geolocation-!cn" "$GEOSITE_BASE"
fetch_ruleset "geosite-cn" "$GEOSITE_BASE" geolocation-cn
fetch_ruleset "private-ip" "$GEOIP_BASE" private
fetch_ruleset "cn-ip" "$GEOIP_BASE" cn

echo "generated sing-box rule sets in ${RULESET_DIR}"
