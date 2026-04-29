#!/bin/sh

set -eu

FILE="${1:-clashoo/files/etc/init.d/clashoo}"

if [ ! -f "$FILE" ]; then
  echo "FAIL: file not found: $FILE" >&2
  exit 1
fi

fail=0

if ! grep -q 'cp "\$CONFIG_YAML_PATH" "\$CONFIG_YAML"' "$FILE"; then
  echo 'FAIL: config copy must quote both $CONFIG_YAML_PATH and $CONFIG_YAML' >&2
  fail=1
fi

if awk '/^select_config\(\)/,/^}/ {print}' "$FILE" | grep -q 'exit 0'; then
  echo 'FAIL: select_config must not silently exit 0 when config is missing/empty' >&2
  fail=1
fi

if ! awk '/^start_service\(\)/,/^}/ {print}' "$FILE" | grep -q 'if ! select_config >/dev/null 2>&1; then'; then
  echo 'FAIL: start_service() must handle select_config failure explicitly' >&2
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "PASS: init.d/clash startup guards look correct"
