# clashoo 运行日志格式化
# 输入: /usr/share/clashoo/clashoo.txt 混合格式
#   mihomo 原生:  time="2026-04-19T04:47:14.xxxZ" level=info msg="xxx"
#   log_msg 行:   "  2026-04-19 12:47:14 - xxx"
# 输出: 统一简洁格式
#   HH:MM:SS xxx            (mihomo info，时间已 UTC→CST +8)
#   HH:MM:SS [warn] xxx
#   HH:MM:SS xxx            (log_msg 本地时间，直接用)

# mihomo 原生行
/^time="[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]/ {
	if (match($0, /T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]/)) {
		utc = substr($0, RSTART + 1, 8)
		hh = substr(utc, 1, 2) + 0
		mm = substr(utc, 4, 2)
		ss = substr(utc, 7, 2)
		cst_h = (hh + 8) % 24
		t = sprintf("%02d:%s:%s", cst_h, mm, ss)
	} else {
		t = "??:??:??"
	}

	prefix = ""
	if (match($0, /level=warning /)) prefix = " [warn]"
	else if (match($0, /level=error /)) prefix = " [err]"
	else if (match($0, /level=fatal /)) prefix = " [fatal]"

	i = index($0, "msg=\"")
	if (i > 0) {
		rest = substr($0, i + 5)
		sub(/"[[:space:]]*$/, "", rest)
		print t prefix " " rest
		next
	}
	print $0
	next
}

# log_msg 人工行: 保留时分秒，去掉日期和前导 "  YYYY-MM-DD "
/^[[:space:]]+[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][[:space:]]+[0-9][0-9]:[0-9][0-9]:[0-9][0-9]/ {
	if (match($0, /[0-9][0-9]:[0-9][0-9]:[0-9][0-9]/)) {
		t = substr($0, RSTART, 8)
	} else {
		t = ""
	}
	sub(/^[[:space:]]+[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][[:space:]]+[0-9][0-9]:[0-9][0-9]:[0-9][0-9][[:space:]]*-?[[:space:]]*/, "")
	print t " " $0
	next
}

# 空行丢弃
NF == 0 { next }

{ print }
