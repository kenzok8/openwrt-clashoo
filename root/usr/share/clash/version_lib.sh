#!/bin/sh

fetch_url() {
	local url="$1"

	if command -v curl >/dev/null 2>&1; then
		curl -fsSL "$url"
		return $?
	fi

	if command -v wget >/dev/null 2>&1; then
		wget -qO- "$url"
		return $?
	fi

	return 127
}

extract_tag_name() {
	sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
}

write_release_tag() {
	local repo="$1"
	local output="$2"
	local api_url="https://api.github.com/repos/${repo}/releases/latest"
	local tag

	tag="$(fetch_url "$api_url" | extract_tag_name)"
	rm -f "$output"

	if [ -n "$tag" ]; then
		printf '%s\n' "$tag" > "$output"
	else
		printf '0\n' > "$output"
	fi
}
