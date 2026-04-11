#!/bin/sh

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/clashoo/files/usr/share/clash/nftables"
TMP_DIR="$(mktemp -d)"
V2DAT_BIN="${V2DAT_BIN:-}"
GEOIP_DAT_URL="${GEOIP_DAT_URL:-https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat}"
V2DAT_PKG="${V2DAT_PKG:-github.com/urlesistiana/v2dat}"

cleanup() {
	rm -rf "$TMP_DIR"
}

trap cleanup EXIT INT TERM

ensure_v2dat() {
	if [ -n "$V2DAT_BIN" ] && [ -x "$V2DAT_BIN" ]; then
		return 0
	fi
	if command -v v2dat >/dev/null 2>&1; then
		V2DAT_BIN="$(command -v v2dat)"
		return 0
	fi
	export GOBIN="${TMP_DIR}/bin"
	mkdir -p "$GOBIN"
	go install "${V2DAT_PKG}@latest"
	V2DAT_BIN="${GOBIN}/v2dat"
}

render_nft_set() {
	local family="$1"
	local input_file="$2"
	local output_file="$3"
	local set_name="$4"

	awk -v set_name="$set_name" -v set_type="$family" '
	BEGIN {
		print "set " set_name " {"
		print "\ttype " set_type ";"
		print "\tflags interval;"
		print "\tauto-merge;"
		print "\telements = {"
		first = 1
	}
	!/^[[:space:]]*$/ && !/^[[:space:]]*#/ {
		gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
		if ($0 == "")
			next
		if (!first)
			print ","
		printf "\t\t%s", $0
		first = 0
	}
	END {
		if (!first)
			print ""
		print "\t}"
		print "}"
	}
	' "$input_file" > "$output_file"
}

mkdir -p "$OUT_DIR" "${TMP_DIR}/out"
ensure_v2dat

curl -fsSL "$GEOIP_DAT_URL" -o "${TMP_DIR}/geoip.dat"
"$V2DAT_BIN" unpack geoip -o "${TMP_DIR}/out" -f cn "${TMP_DIR}/geoip.dat"

CN_TXT="$(find "${TMP_DIR}/out" -type f -name '*_cn.txt' | head -1)"
[ -n "${CN_TXT}" ] && [ -f "${CN_TXT}" ] || {
	echo "failed to unpack CN CIDRs from geoip.dat" >&2
	exit 1
}

awk 'index($0, ":") == 0 { print }' "${CN_TXT}" > "${TMP_DIR}/cn_ipv4.txt"
awk 'index($0, ":") != 0 { print }' "${CN_TXT}" > "${TMP_DIR}/cn_ipv6.txt"

render_nft_set ipv4_addr "${TMP_DIR}/cn_ipv4.txt" "${OUT_DIR}/geoip_cn.nft" clash_china
render_nft_set ipv6_addr "${TMP_DIR}/cn_ipv6.txt" "${OUT_DIR}/geoip6_cn.nft" clash_china6

echo "generated:"
echo "  ${OUT_DIR}/geoip_cn.nft"
echo "  ${OUT_DIR}/geoip6_cn.nft"
