#!/bin/sh

set -eu

SUB_FILE="${1:-}"
TEMPLATE_FILE="${2:-}"
OUT_FILE="${3:-}"
TMP_FILE="/tmp/clash_template_merge_$$.yaml"
LOG_FILE="/tmp/clash_update.txt"

log() {
	printf '  %s - %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$LOG_FILE"
}

cleanup() {
	rm -f "$TMP_FILE" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

[ -n "$SUB_FILE" ] || { log "模板复写失败：缺少订阅文件参数"; exit 1; }
[ -n "$TEMPLATE_FILE" ] || { log "模板复写失败：缺少模板文件参数"; exit 1; }
[ -n "$OUT_FILE" ] || { log "模板复写失败：缺少输出文件参数"; exit 1; }

[ -f "$SUB_FILE" ] || { log "模板复写失败：订阅文件不存在"; exit 1; }
[ -f "$TEMPLATE_FILE" ] || { log "模板复写失败：模板文件不存在"; exit 1; }

if ! command -v yq >/dev/null 2>&1; then
	log "模板复写失败：缺少 yq"
	exit 1
fi

core_bin=""
for b in mihomo clash-meta clash; do
	if command -v "$b" >/dev/null 2>&1; then
		core_bin="$b"
		break
	fi
done

mkdir -p "$(dirname "$OUT_FILE")" >/dev/null 2>&1

log "开始模板复写：$(basename "$SUB_FILE") <- $(basename "$TEMPLATE_FILE")"

# 以模板为主结构，注入订阅节点/节点提供器
yq eval-all '
  (select(fileIndex == 0) | explode(.)) as $sub |
  (select(fileIndex == 1) | explode(.)) as $tpl |
  (
    $tpl
    * {
      "proxies": (((($tpl.proxies // []) + ($sub.proxies // [])) | unique_by(.name))),
      "proxy-providers": (($tpl."proxy-providers" // {}) * ($sub."proxy-providers" // {}))
    }
  )
' "$SUB_FILE" "$TEMPLATE_FILE" >"$TMP_FILE" 2>/dev/null || {
	log "模板复写失败：YAML 合并错误"
	exit 1
}

yq e '.' "$TMP_FILE" >/dev/null 2>&1 || {
	log "模板复写失败：合并结果 YAML 无效"
	exit 1
}

if [ -n "$core_bin" ]; then
	"$core_bin" -t -f "$TMP_FILE" >/dev/null 2>&1 || {
		log "模板复写失败：内核校验不通过"
		exit 1
	}
fi

mv -f "$TMP_FILE" "$OUT_FILE" >/dev/null 2>&1 || {
	log "模板复写失败：写入输出文件失败"
	exit 1
}

chmod 644 "$OUT_FILE" >/dev/null 2>&1 || true
log "模板复写完成：$(basename "$OUT_FILE")"
exit 0
