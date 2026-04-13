#!/bin/sh

ACTION="$1"
LOG_FILE="/tmp/clash_update.txt"

case "$ACTION" in
  restart)
    # Fire-and-forget restart used by LuCI RPC to avoid blocking UI apply flow.
    nohup /etc/init.d/clash restart >>"$LOG_FILE" 2>&1 </dev/null &
    exit 0
    ;;
  update_china_ip)
    echo "[china-ip] task started" >>"$LOG_FILE"
    nohup /usr/share/clash/update/update_china_ip.sh >>"$LOG_FILE" 2>&1 </dev/null &
    exit 0
    ;;
  *)
    echo "usage: $0 {restart|update_china_ip}" >&2
    exit 1
    ;;
esac
