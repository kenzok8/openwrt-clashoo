#!/bin/sh

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
fail=0

check_absent() {
	pattern="$1"
	path="$2"
	message="$3"
	if rg -n "$pattern" "$ROOT_DIR/$path" >/dev/null 2>&1; then
		echo "FAIL: $message" >&2
		fail=1
	fi
}

check_present() {
	pattern="$1"
	path="$2"
	message="$3"
	if ! rg -n "$pattern" "$ROOT_DIR/$path" >/dev/null 2>&1; then
		echo "FAIL: $message" >&2
		fail=1
	fi
}

check_present '^start_service\(\)' "clashoo/files/etc/init.d/clashoo" "init script must use procd start_service()"
check_present 'if ! select_config >/dev/null 2>&1; then' "clashoo/files/etc/init.d/clashoo" "start_service() must handle select_config failure explicitly"

check_absent 'config_load clash$' "clashoo/files/usr/share/clashoo/runtime/iprules.sh" "iprules.sh must load clashoo UCI config, not legacy clash"
check_absent 'config_load clash$' "clashoo/files/usr/share/clashoo/runtime/yum_change.sh" "yum_change.sh must load clashoo UCI config, not legacy clash"
check_present 'config_load "clashoo"' "clashoo/files/usr/share/clashoo/runtime/yum_change.sh" "yum_change.sh must load clashoo UCI config"

check_absent 'read_config_file:' "luci-app-clashoo/root/usr/share/rpcd/ucode/luci.clashoo" "unused legacy /usr/share/clash/config read RPC should not exist"
check_absent 'write_config_file:' "luci-app-clashoo/root/usr/share/rpcd/ucode/luci.clashoo" "unused legacy /usr/share/clash/config write RPC should not exist"
check_absent '^docs/$' ".gitignore" ".gitignore must not ignore the repository docs directory"

check_present '健康检查失败' "luci-app-clashoo/htdocs/luci-static/resources/view/clashoo/overview.js" "overview must surface health check failures"
check_present 'cl-status-note-fail' "luci-app-clashoo/htdocs/luci-static/resources/view/clashoo/clashoo.css" "health check failure note must have warning styling"
check_present 'cl-mode-degraded' "luci-app-clashoo/htdocs/luci-static/resources/view/clashoo/overview.js" "transparent proxy card must render degraded mode hint"
check_present '降级运行' "luci-app-clashoo/htdocs/luci-static/resources/view/clashoo/overview.js" "transparent proxy degraded hint must use the agreed text"

[ "$fail" -eq 0 ] || exit 1
echo "PASS: repository hygiene checks passed"
