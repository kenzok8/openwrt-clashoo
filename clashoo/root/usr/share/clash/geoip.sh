#!/bin/sh

LOG_FILE="/tmp/geoip_update.txt"
TMP_DIR="/tmp/clash_geoip_$$"

geoip_source="$(uci -q get clash.config.geoip_source 2>/dev/null)"
license_key="$(uci -q get clash.config.license_key 2>/dev/null)"

cfg_mmdb_url="$(uci -q get clash.config.geoip_mmdb_url 2>/dev/null)"
cfg_geosite_url="$(uci -q get clash.config.geosite_url 2>/dev/null)"
cfg_geoip_dat_url="$(uci -q get clash.config.geoip_dat_url 2>/dev/null)"
cfg_geoip_asn_url="$(uci -q get clash.config.geoip_asn_url 2>/dev/null)"

DEFAULT_MMDB_URL="https://raw.githubusercontent.com/alecthw/mmdb_china_ip_list/release/Country.mmdb"
DEFAULT_GEOSITE_URL="https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat"
DEFAULT_GEOIP_DAT_URL="https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat"
DEFAULT_GEOIP_ASN_URL="https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb"

OPENCLASH_MMDB_URL="https://raw.githubusercontent.com/Loyalsoldier/geoip/release/Country.mmdb"
OPENCLASH_GEOSITE_URL="https://raw.githubusercontent.com/Loyalsoldier/v2ray-rules-dat/release/geosite.dat"
OPENCLASH_GEOIP_DAT_URL="https://raw.githubusercontent.com/Loyalsoldier/v2ray-rules-dat/release/geoip.dat"

log() {
	echo "  $(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

cleanup() {
	rm -rf "$TMP_DIR" >/dev/null 2>&1
}

download_to() {
	url="$1"
	target="$2"
	if [ -z "$url" ]; then
		return 1
	fi
	wget -q -c4 --timeout=300 --no-check-certificate --user-agent="Clash/OpenWRT" "$url" -O "$target"
}

download_optional() {
	url="$1"
	target="$2"
	name="$3"
	if [ -z "$url" ]; then
		log "$name skip (url empty)"
		return 0
	fi
	if download_to "$url" "$target"; then
		chmod 644 "$target" >/dev/null 2>&1
		log "$name updated"
		return 0
	fi
	log "$name update failed"
	return 0
}

trap cleanup EXIT INT TERM
mkdir -p "$TMP_DIR" /etc/clash >/dev/null 2>&1

rm -f /var/run/geoip_down_complete >/dev/null 2>&1
: > "$LOG_FILE"

mmdb_url=""
geosite_url=""
geoip_dat_url=""
geoip_asn_url=""

case "$geoip_source" in
	1)
		if [ -z "$license_key" ]; then
			log "MaxMind source selected but license key is empty"
			exit 1
		fi
		log "Updating Country.mmdb from MaxMind"
		if ! download_to "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=${license_key}&suffix=tar.gz" "$TMP_DIR/geoip.tar.gz"; then
			log "MaxMind download failed"
			exit 1
		fi
		if ! tar zxf "$TMP_DIR/geoip.tar.gz" -C "$TMP_DIR" >/dev/null 2>&1; then
			log "MaxMind archive extract failed"
			exit 1
		fi
		mmdb_file="$(ls "$TMP_DIR"/GeoLite2-Country_*/GeoLite2-Country.mmdb 2>/dev/null | head -n 1)"
		if [ -z "$mmdb_file" ] || [ ! -f "$mmdb_file" ]; then
			log "MaxMind Country.mmdb not found in archive"
			exit 1
		fi
		cp -f "$mmdb_file" /etc/clash/Country.mmdb
		chmod 644 /etc/clash/Country.mmdb >/dev/null 2>&1
		log "Country.mmdb updated"
		;;
	3)
		mmdb_url="$OPENCLASH_MMDB_URL"
		geosite_url="$OPENCLASH_GEOSITE_URL"
		geoip_dat_url="$OPENCLASH_GEOIP_DAT_URL"
		;;
	4)
		mmdb_url="$cfg_mmdb_url"
		geosite_url="$cfg_geosite_url"
		geoip_dat_url="$cfg_geoip_dat_url"
		geoip_asn_url="$cfg_geoip_asn_url"
		;;
	*)
		mmdb_url="${cfg_mmdb_url:-$DEFAULT_MMDB_URL}"
		geosite_url="${cfg_geosite_url:-$DEFAULT_GEOSITE_URL}"
		geoip_dat_url="${cfg_geoip_dat_url:-$DEFAULT_GEOIP_DAT_URL}"
		geoip_asn_url="${cfg_geoip_asn_url:-$DEFAULT_GEOIP_ASN_URL}"
		;;
esac

if [ "$geoip_source" != "1" ]; then
	log "Updating Country.mmdb"
	if ! download_to "$mmdb_url" /etc/clash/Country.mmdb; then
		log "Country.mmdb download failed"
		exit 1
	fi
	chmod 644 /etc/clash/Country.mmdb >/dev/null 2>&1
	log "Country.mmdb updated"

	download_optional "$geosite_url" /etc/clash/geosite.dat "geosite.dat"
	download_optional "$geoip_dat_url" /etc/clash/geoip.dat "geoip.dat"
	download_optional "$geoip_asn_url" /etc/clash/GeoLite2-ASN.mmdb "GeoLite2-ASN.mmdb"
fi

touch /var/run/geoip_down_complete >/dev/null 2>&1
rm -f /var/run/geoip_update >/dev/null 2>&1

if pidof clash >/dev/null 2>&1 || pidof mihomo >/dev/null 2>&1 || pidof clash-meta >/dev/null 2>&1; then
	/etc/init.d/clash restart >/dev/null 2>&1
	log "Clash restarted"
fi

log "GeoIP update completed"
exit 0
