#!/bin/sh

ACTION="$1"
LOG_FILE="/tmp/clash_update.txt"

log_line() {
	printf '%s - %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"
}

run_init_async() {
	local action="$1"
	mkdir -p /tmp/lock >/dev/null 2>&1
	(flock /tmp/lock/clashoo_rpc_async.lock /etc/init.d/clashoo "$action" >/dev/null 2>&1 </dev/null &)
}

case "$ACTION" in
  start)
    run_init_async start
    exit 0
    ;;
  stop)
    run_init_async stop
    exit 0
    ;;
  restart)
    # Fire-and-forget restart used by LuCI RPC to avoid blocking UI apply flow.
    run_init_async restart
    exit 0
    ;;
  update_china_ip)
    log_line "[china-ip] task started"
    nohup /usr/share/clashoo/update/update_china_ip.sh >>"$LOG_FILE" 2>&1 </dev/null &
    exit 0
    ;;
  update_geoip)
    log_line "GeoIP 更新任务已触发"
    (exec 1000>&-; nohup /usr/share/clashoo/update/geoip.sh >/dev/null 2>&1 </dev/null &)
    exit 0
    ;;
  *)
    echo "usage: $0 {start|stop|restart|update_china_ip|update_geoip}" >&2
    exit 1
    ;;
esac
