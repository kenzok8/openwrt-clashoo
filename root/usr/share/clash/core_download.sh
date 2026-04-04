#!/bin/sh

LOG_FILE="/tmp/clash_update.txt"
MODELTYPE=$(uci get clash.config.download_core 2>/dev/null)
CORETYPE=$(uci get clash.config.dcore 2>/dev/null)
MIRROR_PREFIX=$(uci get clash.config.core_mirror_prefix 2>/dev/null)
CUSTOM_CORE_URL=$(uci get clash.config.core_download_url 2>/dev/null)
CONNECT_TIMEOUT=15
REQUEST_TIMEOUT=30
DOWNLOAD_TIMEOUT=150
ATTEMPTS_PER_MIRROR=1
MAX_TOTAL_SECONDS=300
TAG_FETCH_RETRIES=2
START_TS=$(date +%s)

write_log() {
	echo "  $(date "+%Y-%m-%d %H:%M:%S") - $1" >> "$LOG_FILE"
}

timed_out() {
	now_ts=$(date +%s)
	[ $((now_ts - START_TS)) -ge "$MAX_TOTAL_SECONDS" ]
}

ensure_not_timed_out() {
	if timed_out; then
		write_log "Core download timeout (${MAX_TOTAL_SECONDS}s exceeded)"
		return 1
	fi
	return 0
}

normalize_prefix() {
	p="$1"
	[ -z "$p" ] && return
	case "$p" in
		*/) printf '%s\n' "$p" ;;
		*) printf '%s/\n' "$p" ;;
	esac
}

mirror_prefixes() {
	custom="$(normalize_prefix "$MIRROR_PREFIX")"
	if [ -n "$custom" ]; then
		echo "$custom https://gh-proxy.com/ https://mirror.ghproxy.com/"
	else
		echo "https://gh-proxy.com/ https://mirror.ghproxy.com/"
	fi
}

prefixed_url() {
	prefix="$1"
	base_url="$2"
	if [ -z "$prefix" ]; then
		echo "$base_url"
	else
		echo "${prefix}${base_url}"
	fi
}

fetch_url_try() {
	url="$1"
	if command -v wget >/dev/null 2>&1; then
		wget -qO- --timeout="$CONNECT_TIMEOUT" --tries=1 --no-check-certificate --user-agent="Clash/OpenWRT" "$url"
		return $?
	fi
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL --connect-timeout "$CONNECT_TIMEOUT" --max-time "$REQUEST_TIMEOUT" -A "Clash/OpenWRT" "$url"
		return $?
	fi
	return 127
}

download_file_try() {
	url="$1"
	out="$2"
	if command -v curl >/dev/null 2>&1; then
		curl -fL --connect-timeout "$CONNECT_TIMEOUT" --max-time "$DOWNLOAD_TIMEOUT" --retry 0 -A "Clash/OpenWRT" "$url" -o "$out"
		return $?
	fi
	if command -v wget >/dev/null 2>&1; then
		wget -q --timeout="$REQUEST_TIMEOUT" --tries=1 --no-check-certificate --user-agent="Clash/OpenWRT" "$url" -O "$out"
		return $?
	fi
	return 127
}

head_url_try() {
	url="$1"
	if command -v curl >/dev/null 2>&1; then
		curl -fsSIL --connect-timeout "$CONNECT_TIMEOUT" --max-time "$REQUEST_TIMEOUT" -A "Clash/OpenWRT" "$url" >/dev/null 2>&1
		return $?
	fi
	wget -q --spider --timeout="$CONNECT_TIMEOUT" --tries=1 --no-check-certificate --user-agent="Clash/OpenWRT" "$url"
}

map_mihomo_arch() {
	case "$1" in
		x86_64) echo "linux-amd64" ;;
		aarch64_cortex-a53|aarch64_generic) echo "linux-arm64" ;;
		arm_cortex-a7_neon-vfpv4) echo "linux-armv7" ;;
		mipsel_24kc) echo "linux-mipsle-softfloat" ;;
		mips_24kc) echo "linux-mips-softfloat" ;;
		riscv64) echo "linux-riscv64" ;;
		*) echo "linux-amd64" ;;
	esac
}

fetch_latest_tag() {
	repo="$1"
	api_url="https://api.github.com/repos/${repo}/releases/latest"
	list_api="https://api.github.com/repos/${repo}/releases"
	web_url="https://github.com/${repo}/releases/latest"

	for p in $(mirror_prefixes) ""; do
		ensure_not_timed_out || return 1
		u="$(prefixed_url "$p" "$api_url")"
		i=1
		while [ "$i" -le "$TAG_FETCH_RETRIES" ]; do
			ensure_not_timed_out || return 1
			tag="$(fetch_url_try "$u" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
			[ -n "$tag" ] && echo "$tag" && return 0
			sleep 1
			i=$((i + 1))
		done
	done

	for p in $(mirror_prefixes) ""; do
		ensure_not_timed_out || return 1
		u="$(prefixed_url "$p" "$list_api")"
		i=1
		while [ "$i" -le "$TAG_FETCH_RETRIES" ]; do
			ensure_not_timed_out || return 1
			tag="$({ fetch_url_try "$u" || true; } | awk '
				/"tag_name"[[:space:]]*:/ {
					t=$0
					sub(/.*"tag_name"[[:space:]]*:[[:space:]]*"/, "", t)
					sub(/".*/, "", t)
					tag=t
				}
				/"prerelease"[[:space:]]*:[[:space:]]*false/ {
					if (tag != "") {
						print tag
						exit
					}
				}
			')"
			[ -n "$tag" ] && echo "$tag" && return 0
			sleep 1
			i=$((i + 1))
		done
	done

	for p in $(mirror_prefixes) ""; do
		ensure_not_timed_out || return 1
		u="$(prefixed_url "$p" "$web_url")"
		i=1
		while [ "$i" -le "$TAG_FETCH_RETRIES" ]; do
			ensure_not_timed_out || return 1
			tag="$(wget -S --spider --max-redirect=0 --timeout="$CONNECT_TIMEOUT" --tries=1 --no-check-certificate --user-agent="Clash/OpenWRT" "$u" 2>&1 | sed -n 's#^  Location: .*/releases/tag/\([^[:space:]]*\).*#\1#p' | head -n 1)"
			[ -n "$tag" ] && echo "$tag" && return 0
			sleep 1
			i=$((i + 1))
		done
	done

	releases_url="https://github.com/${repo}/releases"
	for p in $(mirror_prefixes) ""; do
		ensure_not_timed_out || return 1
		u="$(prefixed_url "$p" "$releases_url")"
		tag="$(fetch_url_try "$u" | sed -n 's#.*releases/tag/\(v[0-9][^\"/?]*\).*#\1#p' | head -n 1)"
		[ -n "$tag" ] && echo "$tag" && return 0
	done

	return 1
}

fetch_prerelease_tag() {
	repo="$1"
	api_url="https://api.github.com/repos/${repo}/releases"

	for p in $(mirror_prefixes) ""; do
		ensure_not_timed_out || return 1
		u="$(prefixed_url "$p" "$api_url")"
		i=1
		while [ "$i" -le "$TAG_FETCH_RETRIES" ]; do
			ensure_not_timed_out || return 1
			tag="$({ fetch_url_try "$u" || true; } | awk '
				/"tag_name"[[:space:]]*:/ {
					t=$0
					sub(/.*"tag_name"[[:space:]]*:[[:space:]]*"/, "", t)
					sub(/".*/, "", t)
					tag=t
				}
				/"prerelease"[[:space:]]*:[[:space:]]*true/ {
					if (tag != "") {
						print tag
						exit
					}
				}
			')"
			[ -n "$tag" ] && echo "$tag" && return 0
			sleep 1
			i=$((i + 1))
		done
	done

	return 1
}

fetch_expanded_asset_names() {
	repo="$1"
	tag="$2"
	url="https://github.com/${repo}/releases/expanded_assets/${tag}"

	for p in $(mirror_prefixes) ""; do
		ensure_not_timed_out || return 1
		u="$(prefixed_url "$p" "$url")"
		assets="$(fetch_url_try "$u" | sed -n "s#.*releases/download/${tag}/\\([^\\\"?]*\\)\\\".*#\\1#p")"
		[ -n "$assets" ] && printf '%s\n' "$assets" && return 0
	done

	return 1
}

pick_reachable_release_url() {
	base_url="$1"
	for p in $(mirror_prefixes) ""; do
		ensure_not_timed_out || return 1
		u="$(prefixed_url "$p" "$base_url")"
		if head_url_try "$u"; then
			echo "$u"
			return 0
		fi
	done
	return 1
}

pick_mihomo_asset_by_url() {
	repo="$1"
	tag="$2"
	arch="$3"
	channel="$4"
	ver="${tag#v}"
	candidates=""

	if [ "$channel" = "alpha" ]; then
		if [ "$arch" = "linux-amd64" ]; then
			candidates="mihomo-linux-amd64-alpha-*.gz mihomo-linux-amd64-compatible-alpha-*.gz"
		else
			candidates="mihomo-${arch}-alpha-*.gz"
		fi
		assets_html="$(fetch_expanded_asset_names "$repo" "$tag")"
		if [ -n "$assets_html" ]; then
			for a in $(printf '%s\n' "$assets_html"); do
				case "$a" in
					mihomo-linux-amd64-alpha-*.gz|mihomo-linux-amd64-compatible-alpha-*.gz|mihomo-${arch}-alpha-*.gz)
						u="https://github.com/${repo}/releases/download/${tag}/${a}"
						if pick_reachable_release_url "$u" >/dev/null 2>&1; then
							echo "$a"
							return 0
						fi
						;;
				esac
			done
		fi
		return 1
	fi

	if [ "$arch" = "linux-amd64" ]; then
		candidates="mihomo-linux-amd64-v${ver}.gz mihomo-linux-amd64-compatible-v${ver}.gz"
	else
		candidates="mihomo-${arch}-v${ver}.gz"
	fi

	for a in $candidates; do
		u="https://github.com/${repo}/releases/download/${tag}/${a}"
		if pick_reachable_release_url "$u" >/dev/null 2>&1; then
			echo "$a"
			return 0
		fi
	done

	return 1
}

download_with_mirrors() {
	base_url="$1"
	outfile="$2"
	for p in $(mirror_prefixes) ""; do
		ensure_not_timed_out || return 1
		u="$(prefixed_url "$p" "$base_url")"
		i=1
		while [ "$i" -le "$ATTEMPTS_PER_MIRROR" ]; do
			ensure_not_timed_out || return 1
			write_log "Downloading from ${u} (try ${i})"
			rm -f "$outfile" 2>/dev/null
			if download_file_try "$u" "$outfile"; then
				if gzip -t "$outfile" >/dev/null 2>&1; then
					return 0
				fi
				write_log "Downloaded file is invalid gzip from ${u}"
			fi
			sleep 1
			i=$((i + 1))
		done
	done
	return 1
}

pick_mihomo_asset() {
	repo="$1"
	tag="$2"
	arch="$3"
	channel="$4"
	ver="${tag#v}"
	candidates=""
	release_assets="$(fetch_expanded_asset_names "$repo" "$tag")"
	[ -z "$release_assets" ] && pick_mihomo_asset_by_url "$repo" "$tag" "$arch" "$channel" && return 0
	[ -z "$release_assets" ] && return 1

	if [ "$channel" = "alpha" ]; then
		if [ "$arch" = "linux-amd64" ]; then
			asset="$(printf '%s\n' "$release_assets" | sed -n 's#^\(mihomo-linux-amd64-alpha-[0-9a-fA-F]\{7,\}\.gz\)$#\1#p' | head -n 1)"
			[ -z "$asset" ] && asset="$(printf '%s\n' "$release_assets" | sed -n 's#^\(mihomo-linux-amd64-compatible-alpha-[0-9a-fA-F]\{7,\}\.gz\)$#\1#p' | head -n 1)"
		else
			asset="$(printf '%s\n' "$release_assets" | sed -n "s#^\\(mihomo-${arch}-alpha-[0-9a-fA-F]\\{7,\\}\\.gz\\)$#\\1#p" | head -n 1)"
		fi
		[ -n "$asset" ] && echo "$asset" && return 0
		pick_mihomo_asset_by_url "$repo" "$tag" "$arch" "$channel"
		return $?
	fi

	if [ "$arch" = "linux-amd64" ]; then
		candidates="mihomo-linux-amd64-v${ver}.gz mihomo-linux-amd64-compatible-v${ver}.gz"
	else
		candidates="mihomo-${arch}-v${ver}.gz"
	fi

	for a in $candidates; do
		if printf '%s\n' "$release_assets" | grep -qx "$a"; then
			echo "$a"
			return 0
		fi
	done

	pick_mihomo_asset_by_url "$repo" "$tag" "$arch" "$channel"
	return $?

}

install_binary() {
	tmpfile="$1"
	target="$2"
	mkdir -p "$(dirname "$target")"
	rm -f "$target"
	mv "$tmpfile" "$target"
	chmod 755 "$target"
}

backup_binary() {
	target="$1"
	bak="${target}.bak"
	if [ -x "$target" ]; then
		cp -f "$target" "$bak" 2>/dev/null || true
	fi
}

restore_binary() {
	target="$1"
	bak="${target}.bak"
	if [ -f "$bak" ]; then
		cp -f "$bak" "$target" 2>/dev/null || return 1
		chmod 755 "$target" 2>/dev/null || true
		return 0
	fi
	return 1
}

verify_binary() {
	target="$1"
	[ -x "$target" ] || return 1
	"$target" -v >/dev/null 2>&1 && return 0
	"$target" version >/dev/null 2>&1 && return 0
	return 1
}

install_with_rollback() {
	tmpfile="$1"
	target="$2"

	backup_binary "$target"
	if ! install_binary "$tmpfile" "$target"; then
		write_log "Core install failed, restoring previous binary"
		restore_binary "$target" >/dev/null 2>&1 || true
		return 1
	fi

	if ! verify_binary "$target"; then
		write_log "Core verify failed, rolling back to previous binary"
		restore_binary "$target" >/dev/null 2>&1 || true
		return 1
	fi

	return 0
}

rm -f /tmp/clash.gz /tmp/clash /usr/share/clash/core_down_complete 2>/dev/null
: > "$LOG_FILE"

if [ -n "$CUSTOM_CORE_URL" ]; then
	write_log "Using custom core URL"
	URL="$CUSTOM_CORE_URL"
	if [ "$CORETYPE" = "3" ]; then
		TARGET="/usr/bin/mihomo"
		VERSION_FILE="/usr/share/clash/mihomo_version"
	else
		TARGET="/usr/bin/clash-meta"
		VERSION_FILE="/usr/share/clash/clash_meta_version"
	fi
	TAG="custom"
	ASSET="custom"
	VERSION_VALUE="custom-url"

	if ! download_file_try "$URL" /tmp/clash.gz; then
		write_log "Custom core URL download failed"
		exit 1
	fi

	if ! gunzip -f /tmp/clash.gz; then
		write_log "Custom core unzip failed"
		exit 1
	fi

	if ! install_with_rollback /tmp/clash "$TARGET"; then
		exit 1
	fi
	printf '%s\n' "${VERSION_VALUE}" > "$VERSION_FILE"
	touch /usr/share/clash/core_down_complete
	write_log "Core update successful (custom URL)"
	exit 0
fi

if [ "$CORETYPE" = "1" ]; then
	write_log "Clash core source is not configured (no dedicated release repo)"
	exit 1
elif [ "$CORETYPE" = "2" ]; then
	write_log "Selected core channel: stable"
	TAG=$(fetch_latest_tag "MetaCubeX/mihomo")
	[ -z "$TAG" ] && write_log "Stable tag lookup failed" && exit 1
	ASSET=$(pick_mihomo_asset "MetaCubeX/mihomo" "$TAG" "$(map_mihomo_arch "$MODELTYPE")" "stable")
	URL="https://github.com/MetaCubeX/mihomo/releases/download/${TAG}/${ASSET}"
	TARGET="/usr/bin/clash-meta"
	VERSION_FILE="/usr/share/clash/clash_meta_version"
 	VERSION_VALUE="$TAG"
else
	write_log "Selected core channel: beta/alpha"
	TAG="Prerelease-Alpha"
	ASSET=$(pick_mihomo_asset "MetaCubeX/mihomo" "$TAG" "$(map_mihomo_arch "$MODELTYPE")" "alpha")
	[ -z "$ASSET" ] && TAG=$(fetch_prerelease_tag "MetaCubeX/mihomo")
	[ -z "$TAG" ] && TAG=$(fetch_latest_tag "MetaCubeX/mihomo")
	[ -z "$TAG" ] && write_log "Beta/alpha tag lookup failed" && exit 1
	[ -z "$ASSET" ] && ASSET=$(pick_mihomo_asset "MetaCubeX/mihomo" "$TAG" "$(map_mihomo_arch "$MODELTYPE")" "alpha")
	[ -z "$ASSET" ] && ASSET=$(pick_mihomo_asset "MetaCubeX/mihomo" "$TAG" "$(map_mihomo_arch "$MODELTYPE")" "stable")
	URL="https://github.com/MetaCubeX/mihomo/releases/download/${TAG}/${ASSET}"
	TARGET="/usr/bin/mihomo"
	VERSION_FILE="/usr/share/clash/mihomo_version"
	VERSION_VALUE="$(printf '%s\n' "$ASSET" | sed -n 's#^mihomo-.*-alpha-\([0-9a-fA-F]\{7,\}\)\.gz$#\1#p' | head -n 1)"
	[ -z "$VERSION_VALUE" ] && VERSION_VALUE="$TAG"
fi

if [ -z "$TAG" ]; then
	write_log "Core version check failed"
	exit 1
fi

if [ -z "$ASSET" ]; then
	write_log "Core asset not found for selected architecture"
	exit 1
fi

write_log "Starting core download"
if ! download_with_mirrors "$URL" /tmp/clash.gz; then
	write_log "Core download failed"
	exit 1
fi

if ! gunzip -f /tmp/clash.gz; then
	write_log "Core unzip failed"
	exit 1
fi

if ! install_with_rollback /tmp/clash "$TARGET"; then
	exit 1
fi
printf '%s\n' "${VERSION_VALUE:-$TAG}" > "$VERSION_FILE"
touch /usr/share/clash/core_down_complete
write_log "Core update successful"
