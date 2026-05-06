#!/bin/sh
set -eu

ROOT_DIR=${ROOT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}
INITD="$ROOT_DIR/clashoo/files/etc/init.d/clashoo"
GEOIP="$ROOT_DIR/clashoo/files/usr/share/clashoo/update/geoip.sh"

fail=0

if ! awk '/^_config_needs_geosite\(\)/,/^}/ {print}' "$INITD" | grep -Fq 'geosite:[[:space:]]*'; then
	echo "FAIL: _config_needs_geosite must match geosite: without requiring a trailing space" >&2
	fail=1
fi

if ! awk '/^_has_valid_local_geosite\(\)/,/^}/ {print}' "$INITD" | grep -q '/etc/clashoo/GeoSite.dat'; then
	echo "FAIL: startup must validate mihomo GeoSite.dat before keeping geosite rules" >&2
	fail=1
fi

if ! grep -q '/etc/clashoo/GeoSite.dat' "$GEOIP"; then
	echo "FAIL: GeoIP updater must refresh mihomo GeoSite.dat, not only lowercase geosite.dat" >&2
	fail=1
fi

[ "$fail" -eq 0 ] || exit 1
echo "PASS: mihomo GeoSite bootstrap checks passed"
