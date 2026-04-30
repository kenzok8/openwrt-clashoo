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
check_present 'format_core_log' "luci-app-clashoo/root/usr/share/rpcd/ucode/luci.clashoo" "core log RPC must use simplified filtering"
check_present "已过滤 ' \\+ dropped \\+ ' 行" "luci-app-clashoo/root/usr/share/rpcd/ucode/luci.clashoo" "core log output must show filtered noisy line count"
check_present '任务已提交' "luci-app-clashoo/htdocs/luci-static/resources/view/clashoo/overview.js" "service actions should use submitted-state feedback"
check_absent '_pollUntilOpDone' "luci-app-clashoo/htdocs/luci-static/resources/view/clashoo/overview.js" "service action buttons must not wait on long operation polling"
check_present 'clear_core_log' "luci-app-clashoo/root/usr/share/rpcd/ucode/luci.clashoo" "core log should have an independent clear RPC"
check_present 'clearCoreLog' "luci-app-clashoo/htdocs/luci-static/resources/tools/clashoo.js" "frontend tool should expose core log clearing"
check_present 'CORE_LOG_PATH="/var/log/clashoo/core.log"' "clashoo/files/etc/init.d/clashoo" "core logs should be written to an independent file"
check_present 'rm -f /usr/share/sing-box/cache.db' "clashoo/files/etc/init.d/clashoo" "sing-box startup should clear stale selector cache"
check_present "cfg.log.output = '/var/log/clashoo/core.log'" "clashoo/files/usr/share/clashoo/lib/normalize_singbox_config.uc" "sing-box runtime should write core logs to the independent file"
check_present "tag == 'geolocation-cn' || tag == 'cn'" "clashoo/files/usr/share/clashoo/lib/normalize_singbox_config.uc" "sing-box runtime should map CN geosite rule sets to local cache"
check_present 'scripts/gen-singbox-rulesets.sh' ".github/workflows/update-cn-nft.yml" "CN data workflow must refresh packaged sing-box rule sets"
check_present 'clashoo/files/usr/share/clashoo/ruleset' ".github/workflows/update-cn-nft.yml" "CN data workflow must commit packaged sing-box rule sets"
check_present 'RULESET_DIR=.*clashoo/files/usr/share/clashoo/ruleset' "scripts/gen-singbox-rulesets.sh" "sing-box rule set generator must write into the package ruleset directory"
check_present 'geolocation-!cn' "scripts/gen-singbox-rulesets.sh" "sing-box rule set generator must include the fake-ip non-CN domain set"
check_present 'cn-ip' "scripts/gen-singbox-rulesets.sh" "sing-box rule set generator must include the CN IP set"
check_present 'private-ip' "scripts/gen-singbox-rulesets.sh" "sing-box rule set generator must include the private IP set"
check_present 'store_fakeip: true' "clashoo/files/usr/share/clashoo/lib/normalize_singbox_config.uc" "sing-box runtime should keep fake-ip cache support"
check_present 'store_fakeip' "luci-app-clashoo/root/usr/share/rpcd/ucode/luci.clashoo" "generated sing-box profiles should keep fake-ip cache support"
check_absent '系统日志不可清空' "luci-app-clashoo/htdocs/luci-static/resources/view/clashoo/system.js" "core log clear action should remain usable"
check_absent '核心日志来自系统日志，无法清空' "luci-app-clashoo/htdocs/luci-static/resources/view/clashoo/system.js" "core log clear action should not raise an error-like toast"
check_absent '当前日志不可清空' "luci-app-clashoo/htdocs/luci-static/resources/view/clashoo/system.js" "log tabs should not show stale non-clearable wording"
check_present '定时更新规则数据' "luci-app-clashoo/htdocs/luci-static/resources/view/clashoo/system.js" "scheduled resource update should be presented as rule data update"
check_absent '自动更新订阅' "clashoo/files/usr/share/clashoo/update/update_all.sh" "scheduled resource update must not update subscriptions"
check_present 'update_china_ip.sh' "clashoo/files/usr/share/clashoo/update/update_all.sh" "scheduled rule data update must refresh mainland whitelist"
check_present 'geoip.sh' "clashoo/files/usr/share/clashoo/update/update_all.sh" "scheduled rule data update must refresh GeoIP and GeoSite data"
check_present 'GeoIP 更新任务启动' "clashoo/files/usr/share/clashoo/update/geoip.sh" "GeoIP updater must write progress to the merged update log"
check_present 'connection: open connection to' "luci-app-clashoo/root/usr/share/rpcd/ucode/luci.clashoo" "core log filter should drop node connection errors"

[ "$fail" -eq 0 ] || exit 1
echo "PASS: repository hygiene checks passed"
