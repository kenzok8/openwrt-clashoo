#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
INITD="$ROOT_DIR/clashoo/files/etc/init.d/clashoo"

grep -q 'curl_has_final_http_response()' "$INITD" || {
	echo "init.d does not define curl_has_final_http_response" >&2
	exit 1
}

grep -q 'Connection established' "$INITD" || {
	echo "health check does not explicitly ignore proxy CONNECT responses" >&2
	exit 1
}

connect_only='HTTP/1.1 200 Connection established'
final_ok='HTTP/1.1 200 Connection established

HTTP/2 204'

printf '%s\n' "$connect_only" | awk '
	/^HTTP\// && $0 !~ /Connection established/ { ok=1 }
	END { exit ok ? 0 : 1 }
' && {
	echo "CONNECT-only response was incorrectly accepted" >&2
	exit 1
}

printf '%s\n' "$final_ok" | awk '
	/^HTTP\// && $0 !~ /Connection established/ { ok=1 }
	END { exit ok ? 0 : 1 }
'
