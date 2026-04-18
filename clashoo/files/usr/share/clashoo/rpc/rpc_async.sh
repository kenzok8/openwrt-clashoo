#!/bin/sh

ACTION="$1"
LOG_FILE="/tmp/clash_update.txt"

case "$ACTION" in
  start)
    nohup /etc/init.d/clashoo start >>"$LOG_FILE" 2>&1 </dev/null &
    exit 0
    ;;
  stop)
    nohup /etc/init.d/clashoo stop >>"$LOG_FILE" 2>&1 </dev/null &
    exit 0
    ;;
  restart)
    # Fire-and-forget restart used by LuCI RPC to avoid blocking UI apply flow.
    nohup /etc/init.d/clashoo restart >>"$LOG_FILE" 2>&1 </dev/null &
    exit 0
    ;;
  update_china_ip)
    echo "[china-ip] task started" >>"$LOG_FILE"
    nohup /usr/share/clashoo/update/update_china_ip.sh >>"$LOG_FILE" 2>&1 </dev/null &
    exit 0
    ;;
  *)
    echo "usage: $0 {start|stop|restart|update_china_ip}" >&2
    exit 1
    ;;
esac
