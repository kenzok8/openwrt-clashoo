#!/bin/sh

MIRROR_PREFIX=$(uci -q get clash.config.core_mirror_prefix 2>/dev/null)
CONNECT_TIMEOUT=10
REQUEST_TIMEOUT=20
FETCH_RETRIES=2

normalize_prefix() {
	local p="$1"
	[ -z "$p" ] && return
	case "$p" in
		*/) printf '%s\n' "$p" ;;
		*) printf '%s/\n' "$p" ;;
	esac
}

mirror_prefixes() {
	local custom
	custom="$(normalize_prefix "$MIRROR_PREFIX")"
	if [ -n "$custom" ]; then
		echo "$custom https://gh-proxy.com/ https://mirror.ghproxy.com/"
	else
		echo "https://gh-proxy.com/ https://mirror.ghproxy.com/"
	fi
}

prefixed_url() {
	local prefix="$1"
	local base_url="$2"
	if [ -z "$prefix" ]; then
		echo "$base_url"
	else
		echo "${prefix}${base_url}"
	fi
}

fetch_url() {
	local url="$1"
	local p u i

	for p in $(mirror_prefixes) ""; do
		u="$(prefixed_url "$p" "$url")"
		i=1
		while [ "$i" -le "$FETCH_RETRIES" ]; do
			if command -v wget >/dev/null 2>&1; then
				if wget -qO- --timeout="$CONNECT_TIMEOUT" --tries=1 --no-check-certificate "$u"; then
					return 0
				fi
			elif command -v curl >/dev/null 2>&1; then
				if curl -fsSL --connect-timeout "$CONNECT_TIMEOUT" --max-time "$REQUEST_TIMEOUT" "$u"; then
					return 0
				fi
			else
				return 127
			fi
			i=$((i + 1))
		done
	done

	return 1
}

extract_tag_name() {
	sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
}

extract_stable_tag_name() {
	awk '
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
	'
}

write_release_tag() {
	local repo="$1"
	local output="$2"
	local api_url="https://api.github.com/repos/${repo}/releases/latest"
	local tag body list_api

	tag="$(fetch_url "$api_url" | extract_tag_name)"
	if [ -z "$tag" ]; then
		list_api="https://api.github.com/repos/${repo}/releases"
		body="$(fetch_url "$list_api")"
		tag="$(printf '%s' "$body" | extract_stable_tag_name)"
	fi
	rm -f "$output"

	if [ -n "$tag" ]; then
		printf '%s\n' "$tag" > "$output"
	else
		printf '0\n' > "$output"
	fi
}

extract_prerelease_tag_name() {
	awk '
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
	'
}

extract_prerelease_commitish() {
	awk '
		/"target_commitish"[[:space:]]*:/ {
			t=$0
			sub(/.*"target_commitish"[[:space:]]*:[[:space:]]*"/, "", t)
			sub(/".*/, "", t)
			commit=t
		}
		/"prerelease"[[:space:]]*:[[:space:]]*true/ {
			if (commit != "") {
				print commit
				exit
			}
		}
	'
}

resolve_short_sha() {
	local repo="$1"
	local ref="$2"
	local commit_api sha

	case "$ref" in
		[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]*)
			printf '%s\n' "${ref}" | cut -c1-7
			return 0
			;;
	esac

	commit_api="https://api.github.com/repos/${repo}/commits/${ref}"
	sha="$(fetch_url "$commit_api" | sed -n 's/.*"sha"[[:space:]]*:[[:space:]]*"\([0-9a-fA-F]\{7,\}\)".*/\1/p' | head -n 1)"
	if [ -n "$sha" ]; then
		printf '%s\n' "${sha}" | cut -c1-7
		return 0
	fi

	return 1
}

write_prerelease_tag() {
	local repo="$1"
	local output="$2"
	local api_url="https://api.github.com/repos/${repo}/releases"
	local body tag commit_ref short_sha

	body="$(fetch_url "$api_url")"
	tag="$(printf '%s' "$body" | extract_prerelease_tag_name)"
	commit_ref="$(printf '%s' "$body" | extract_prerelease_commitish)"
	rm -f "$output"

	if [ -n "$tag" ]; then
		printf '%s\n' "$tag" > "$output"
	elif [ -n "$commit_ref" ]; then
		short_sha="$(resolve_short_sha "$repo" "$commit_ref")"
		if [ -n "$short_sha" ]; then
			printf '%s\n' "$short_sha" > "$output"
		else
			printf '%s\n' "$commit_ref" | cut -c1-7 > "$output"
		fi
	else
		# 若暂无 prerelease，回退到 stable
		write_release_tag "$repo" "$output"
	fi
}

fetch_expanded_assets() {
	local repo="$1"
	local tag="$2"
	local url="https://github.com/${repo}/releases/expanded_assets/${tag}"

	fetch_url "$url" | sed -n "s#.*releases/download/${tag}/\\([^\\\"?]*\\)\\\".*#\\1#p"
}

write_alpha_identifier() {
	local repo="$1"
	local output="$2"
	local assets sha

	assets="$(fetch_expanded_assets "$repo" "Prerelease-Alpha")"
	sha="$(printf '%s\n' "$assets" | sed -n 's#^mihomo-.*-alpha-\([0-9a-fA-F]\{7,\}\)\.gz$#\1#p' | head -n 1 | cut -c1-7)"
	rm -f "$output"

	if [ -n "$sha" ]; then
		printf '%s\n' "$sha" > "$output"
	else
		: > "$output"
	fi
}
