#!/bin/sh

set -eu

GH_PROXY="https://ghfast.top"
GH_REPO="kenzok8/openwrt-clashoo"
TMP_DIR="/tmp/clashoo-install"

fetch_text() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1"
    return $?
  fi
  wget -qO- "$1"
}

download_file() {
  if command -v curl >/dev/null 2>&1; then
    curl -fL "$1" -o "$2"
    return $?
  fi
  wget -qO "$2" "$1"
}

detect_pm() {
  command -v opkg >/dev/null 2>&1 && echo "opkg" && return
  command -v apk >/dev/null 2>&1 && echo "apk" && return
  echo "unsupported"
}

detect_arch() {
  if [ "$1" = "opkg" ]; then
    opkg print-architecture | awk '/^arch / {print $2}' | tail -n 1
  else
    apk --print-arch
  fi
}

PM="$(detect_pm)"
[ "$PM" = "unsupported" ] && { echo "Unsupported package manager"; exit 1; }

ARCH="$(detect_arch "$PM")"
[ -n "$ARCH" ] || { echo "Cannot detect architecture"; exit 1; }

EXT="ipk"
[ "$PM" = "apk" ] && EXT="apk"

# 获取最新 Release 的 tag（先 Pre-release，再 Latest）
echo "Checking GitHub releases..."
TAG=""

# 方法1：从 releases 页面找 Pre-release
REL_HTML="$(fetch_text "${GH_PROXY}/https://github.com/${GH_REPO}/releases" || true)"
TAG="$(printf '%s' "$REL_HTML" | grep -B5 "Pre-release" | grep "/releases/tag/" | head -1 | sed 's/.*\/tag\/\([^"]*\).*/\1/')"

# 方法2：没有 Pre-release，取 Latest
if [ -z "$TAG" ]; then
  if command -v curl >/dev/null 2>&1; then
    LOCATION="$(curl -fsSL -o /dev/null -w '%{redirect_url}' "${GH_PROXY}/https://github.com/${GH_REPO}/releases/latest" 2>/dev/null || true)"
  else
    LOCATION="$(wget -qO- "${GH_PROXY}/https://github.com/${GH_REPO}/releases/latest" 2>/dev/null || true)"
  fi
  TAG="$(printf '%s' "$LOCATION" | sed 's/.*\/tag\///')"
fi

[ -z "$TAG" ] && { echo "Cannot find latest release"; exit 1; }
echo "Release: ${TAG}"

# 下载 Release 页面，提取文件链接
REL_HTML="$(fetch_text "${GH_PROXY}/https://github.com/${GH_REPO}/releases/tag/${TAG}" || true)"
[ -z "$REL_HTML" ] && { echo "Cannot fetch release page"; exit 1; }

CORE_URL=""; LUCI_URL=""; I18N_URL=""

# core
F="$(printf '%s' "$REL_HTML" | grep -o "href=\"[^\"]*/download/${TAG}/clashoo[_-][^\"]*${ARCH}[^\"]*\.${EXT}\"" | sed 's/.*href="//;s/"//' | head -1)"
[ -n "$F" ] && CORE_URL="${GH_PROXY}/${F}"

# luci-app
if [ "$PM" = "opkg" ]; then
  F="$(printf '%s' "$REL_HTML" | grep -o "href=\"[^\"]*/download/${TAG}/luci-app-clashoo[^\"]*all\.${EXT}\"" | sed 's/.*href="//;s/"//' | head -1)"
  [ -n "$F" ] && LUCI_URL="${GH_PROXY}/${F}"
  F="$(printf '%s' "$REL_HTML" | grep -o "href=\"[^\"]*/download/${TAG}/luci-i18n-clashoo-zh-cn[^\"]*all\.${EXT}\"" | sed 's/.*href="//;s/"//' | head -1)"
  [ -n "$F" ] && I18N_URL="${GH_PROXY}/${F}"
else
  F="$(printf '%s' "$REL_HTML" | grep -o "href=\"[^\"]*/download/${TAG}/luci-app-clashoo[^\"]*${ARCH}[^\"]*\.${EXT}\"" | sed 's/.*href="//;s/"//' | head -1)"
  [ -n "$F" ] && LUCI_URL="${GH_PROXY}/${F}"
  F="$(printf '%s' "$REL_HTML" | grep -o "href=\"[^\"]*/download/${TAG}/luci-i18n-clashoo-zh-cn[^\"]*${ARCH}[^\"]*\.${EXT}\"" | sed 's/.*href="//;s/"//' | head -1)"
  [ -n "$F" ] && I18N_URL="${GH_PROXY}/${F}"
fi

[ -z "$CORE_URL" ] && { echo "Cannot find core package for ${ARCH}"; exit 1; }
[ -z "$LUCI_URL" ] && { echo "Cannot find luci package for ${ARCH}"; exit 1; }

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

echo "Downloading..."
echo "  Core:  $(basename "$CORE_URL")"
echo "  Luci:  $(basename "$LUCI_URL")"
[ -n "$I18N_URL" ] && echo "  I18N:  $(basename "$I18N_URL")"

download_file "$CORE_URL" "$TMP_DIR/core.${EXT}"
download_file "$LUCI_URL" "$TMP_DIR/luci.${EXT}"
[ -n "$I18N_URL" ] && download_file "$I18N_URL" "$TMP_DIR/i18n.${EXT}"

echo "Installing..."
if [ "$PM" = "opkg" ]; then
  opkg install "$TMP_DIR/core.${EXT}" "$TMP_DIR/luci.${EXT}" ${I18N_URL:+"$TMP_DIR/i18n.${EXT}"}
else
  apk add --allow-untrusted "$TMP_DIR/core.${EXT}" "$TMP_DIR/luci.${EXT}" ${I18N_URL:+"$TMP_DIR/i18n.${EXT}"}
fi

echo "Install complete."
