#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
INITD="$ROOT_DIR/clashoo/files/etc/init.d/clashoo"

if grep -q 'print "  fallback-filter:"' "$INITD"; then
	echo "init.d still hardcodes fallback-filter indentation" >&2
	exit 1
fi

inject_fallback_filter() {
	awk '
		function indent_len(s) { match(s, /[^ ]/); return RSTART ? RSTART - 1 : length(s) }
		/^dns:[[:space:]]*$/ { dns=1; child_indent=-1; print; next }
		dns {
			cur_indent = indent_len($0)
			if ($0 ~ /^[[:space:]]*[^#[:space:]][^:]*:/ && cur_indent > 0 && child_indent < 0)
				child_indent = cur_indent
			if ($0 ~ /^[^[:space:]#][^:]*:/) {
				if (!inserted) {
					sp = sprintf("%*s", child_indent > 0 ? child_indent : 2, "")
					print sp "fallback-filter:"
					print sp "  geoip: false"
					inserted=1
				}
				dns=0
			}
		}
		{ print }
		END {
			if (dns && !inserted) {
				sp = sprintf("%*s", child_indent > 0 ? child_indent : 2, "")
				print sp "fallback-filter:"
				print sp "  geoip: false"
			}
		}
	'
}

case2="$(printf 'dns:\n  enable: true\n  nameserver:\n    - 1.1.1.1\nproxies: []\n' | inject_fallback_filter)"
printf '%s\n' "$case2" | grep -q '^  fallback-filter:$'
printf '%s\n' "$case2" | grep -q '^    geoip: false$'

case4="$(printf 'dns:\n    enable: true\n    nameserver:\n      - 1.1.1.1\nproxies: []\n' | inject_fallback_filter)"
printf '%s\n' "$case4" | grep -q '^    fallback-filter:$'
printf '%s\n' "$case4" | grep -q '^      geoip: false$'
