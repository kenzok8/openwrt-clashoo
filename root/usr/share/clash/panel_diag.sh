#!/bin/sh

panel="$1"
OUT_FILE="/tmp/clash_panel_diag.txt"
TMP_ROOT="/tmp/panel_diag_$$"
ZIP_FILE="$TMP_ROOT/panel.zip"
UNPACK_DIR="$TMP_ROOT/unpack"

[ -n "$panel" ] || panel="$(uci -q get clash.config.dashboard_panel 2>/dev/null)"
[ -n "$panel" ] || panel="metacubexd"

case "$panel" in
	metacubexd)
		URLS="https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip"
		TARGET_DIR="/etc/clash/dashboard"
		;;
	yacd)
		URLS="https://github.com/MetaCubeX/Yacd-meta/archive/refs/heads/gh-pages.zip https://github.com/haishanh/yacd/archive/refs/heads/gh-pages.zip"
		TARGET_DIR="/usr/share/clash/yacd"
		;;
	zashboard)
		URLS="https://github.com/Zephyruso/zashboard/releases/latest/download/dist-cdn-fonts.zip https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip"
		TARGET_DIR="/etc/clash/dashboard"
		;;
	razord)
		URLS="https://github.com/MetaCubeX/Razord-meta/archive/refs/heads/gh-pages.zip https://github.com/ayanamist/clash-dashboard/archive/refs/heads/gh-pages.zip"
		TARGET_DIR="/etc/clash/dashboard"
		;;
	*)
		panel="metacubexd"
		URLS="https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip"
		TARGET_DIR="/etc/clash/dashboard"
		;;
esac

log() {
	printf '%s\n' "$1" >> "$OUT_FILE"
}

cleanup() {
	rm -rf "$TMP_ROOT" >/dev/null 2>&1
}

has_unzip() {
	if command -v unzip >/dev/null 2>&1; then
		echo "unzip"
		return 0
	fi
	if command -v busybox >/dev/null 2>&1 && busybox --list 2>/dev/null | grep -qx "unzip"; then
		echo "busybox unzip"
		return 0
	fi
	if command -v bsdtar >/dev/null 2>&1; then
		echo "bsdtar"
		return 0
	fi
	return 1
}

extract_zip() {
	if command -v unzip >/dev/null 2>&1; then
		unzip -oq "$ZIP_FILE" -d "$UNPACK_DIR" >/dev/null 2>&1
		return $?
	fi
	if command -v busybox >/dev/null 2>&1 && busybox --list 2>/dev/null | grep -qx "unzip"; then
		busybox unzip -oq "$ZIP_FILE" -d "$UNPACK_DIR" >/dev/null 2>&1
		return $?
	fi
	if command -v bsdtar >/dev/null 2>&1; then
		bsdtar -xf "$ZIP_FILE" -C "$UNPACK_DIR" >/dev/null 2>&1
		return $?
	fi
	return 2
}

find_web_root() {
	if [ -f "$UNPACK_DIR/index.html" ]; then
		echo "$UNPACK_DIR"
		return 0
	fi
	index_file="$(find "$UNPACK_DIR" -type f -name index.html 2>/dev/null | head -n 1)"
	if [ -n "$index_file" ]; then
		dirname "$index_file"
		return 0
	fi
	return 1
}

mkdir -p "$TMP_ROOT" "$UNPACK_DIR" >/dev/null 2>&1
trap cleanup EXIT INT TERM

: > "$OUT_FILE"
log "=== 面板下载诊断报告 ==="
log "时间: $(date '+%Y-%m-%d %H:%M:%S')"
log "面板: $panel"
log "目标目录: $TARGET_DIR"

if tool="$(has_unzip)"; then
	log "[OK] 解压工具可用: $tool"
else
	log "[FAIL] 未找到解压工具（unzip / busybox unzip / bsdtar）"
fi

if mkdir -p "$TARGET_DIR" >/dev/null 2>&1; then
	touch "$TARGET_DIR/.diag_test" >/dev/null 2>&1
	if [ $? -eq 0 ]; then
		rm -f "$TARGET_DIR/.diag_test" >/dev/null 2>&1
		log "[OK] 目标目录可写: $TARGET_DIR"
	else
		log "[FAIL] 目标目录不可写: $TARGET_DIR"
	fi
else
	log "[FAIL] 无法创建目标目录: $TARGET_DIR"
fi

if wget -q --spider --timeout=10 --no-check-certificate "https://github.com"; then
	log "[OK] 可访问 github.com"
else
	log "[FAIL] 无法访问 github.com（网络或 DNS 问题）"
fi

best_url=""
for url in $URLS; do
	if wget -q --spider --timeout=20 --no-check-certificate "$url"; then
		log "[OK] 下载链接可达: $url"
		[ -n "$best_url" ] || best_url="$url"
	else
		log "[FAIL] 下载链接不可达: $url"
	fi
done

if [ -z "$best_url" ]; then
	log ""
	log "结论: 当前面板下载失败，主要原因是下载链接不可达。"
	log "建议: 检查路由器联网/DNS/时间同步，或切换面板后重试。"
	exit 0
fi

if wget -q --timeout=60 --no-check-certificate "$best_url" -O "$ZIP_FILE"; then
	zip_size=$(wc -c < "$ZIP_FILE" 2>/dev/null)
	log "[OK] 实际下载成功，文件大小: ${zip_size:-0} 字节"
else
	log "[FAIL] 实际下载失败: $best_url"
	log ""
	log "结论: 链接可达但下载失败，可能是 TLS/网络抖动。"
	log "建议: 稍后重试，或更换 DNS。"
	exit 0
fi

extract_zip
extract_rc=$?
if [ "$extract_rc" -ne 0 ]; then
	log "[FAIL] 解压失败（返回码: $extract_rc）"
	log ""
	log "结论: 下载成功但解压失败。"
	log "建议: 安装 unzip 或 bsdtar 后再试。"
	exit 0
fi

src_dir="$(find_web_root)"
if [ -z "$src_dir" ] || [ ! -f "$src_dir/index.html" ]; then
	log "[FAIL] 压缩包中未找到 index.html"
	log ""
	log "结论: 下载内容不是有效面板资源包。"
	log "建议: 切换镜像链接或稍后重试。"
	exit 0
fi

log "[OK] 解压校验通过，index.html: $src_dir/index.html"
log ""
log "结论: 诊断通过，环境支持面板下载与安装。"
log "建议: 回到概览页点击“下载面板”即可。"
exit 0
