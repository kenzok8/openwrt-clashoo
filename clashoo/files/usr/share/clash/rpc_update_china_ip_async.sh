#!/bin/sh

echo "[china-ip] task started" >>/tmp/clash_update.txt
nohup /usr/share/clash/update_china_ip.sh >>/tmp/clash_update.txt 2>&1 </dev/null &
exit 0
