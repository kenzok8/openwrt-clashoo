#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
YUM_CHANGE="$ROOT_DIR/clashoo/files/usr/share/clashoo/runtime/yum_change.sh"

if grep -q "sed 's/\\[\\\\\\\\/&\\]/\\\\\\\\\\\\\\\\&/g'" "$YUM_CHANGE"; then
	echo "yum_change.sh still uses over-escaped sed replacement for dash_pass" >&2
	exit 1
fi

escape_for_sed_replacement() {
	printf '%s' "$1" | sed 's/[\/&]/\\&/g'
}

apply_secret_replace() {
	secret="$1"
	tmp="${TMPDIR:-/tmp}/clashoo_escape_test.$$"
	printf 'secret: "old"\n' > "$tmp"
	safe="$(escape_for_sed_replacement "$secret")"
	sed "s@^secret:.*@secret: \"${safe}\"@g" "$tmp" > "${tmp}.new"
	mv "${tmp}.new" "$tmp"
	cat "$tmp"
	rm -f "$tmp" "${tmp}.new"
}

expect='secret: "abc&def/a\b"'
actual="$(apply_secret_replace 'abc&def/a\b')"

[ "$actual" = "$expect" ] || {
	echo "expected: $expect" >&2
	echo "actual:   $actual" >&2
	exit 1
}
