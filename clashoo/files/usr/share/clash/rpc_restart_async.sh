#!/bin/sh

# Fire-and-forget restart used by LuCI RPC to avoid blocking UI apply flow.
nohup /etc/init.d/clash restart >>/tmp/clash_update.txt 2>&1 </dev/null &
exit 0
