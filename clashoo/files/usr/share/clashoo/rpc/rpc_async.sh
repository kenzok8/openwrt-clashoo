#!/bin/sh

ACTION="$1"
LOG_FILE="/tmp/clash_update.txt"

log_line() {
	printf '%s - %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"
}

case "$ACTION" in
  start)
    nohup /etc/init.d/clashoo start >/dev/null 2>&1 </dev/null &
    exit 0
    ;;
  stop)
    nohup /etc/init.d/clashoo stop >/dev/null 2>&1 </dev/null &
    exit 0
    ;;
  restart)
    # Fire-and-forget restart used by LuCI RPC to avoid blocking UI apply flow.
    nohup /etc/init.d/clashoo restart >/dev/null 2>&1 </dev/null &
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
