#!/bin/sh

set -eu

GH_PROXY="https://ghfast.top"
GH_REPO="kenzok8/openwrt-clashoo"
B2_FEED_BASE_URL="https://kenzo111.s3.us-west-004.backblazeb2.com/clashoo"
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

get_github_tag() {
  # 从仓库的 latest-release.txt 获取版本号（可通过 raw 正常访问）
  TAG="$(fetch_text "${GH_PROXY}/https://raw.githubusercontent.com/${GH_REPO}/refs/heads/main/latest-release.txt" 2>/dev/null || true)"
  printf '%s' "$TAG" | head -1 | tr -d ' \t\r\n'
}

PM="$(detect_pm)"
[ "$PM" = "unsupported" ] && { echo "Unsupported package manager"; exit 1; }

ARCH="$(detect_arch "$PM")"
[ -n "$ARCH" ] || { echo "Cannot detect architecture"; exit 1; }

EXT="ipk"
[ "$PM" = "apk" ] && EXT="apk"

# ========== 从 GitHub Releases 拉取 ==========
echo "Checking GitHub Releases..."
TAG="$(get_github_tag)"
CORE_URL=""; LUCI_URL=""; I18N_URL=""

if [ -n "$TAG" ]; then
  echo "Release: ${TAG}"

  # 下载 Release 页面提取文件链接
  REL_HTML="$(fetch_text "${GH_PROXY}/https://github.com/${GH_REPO}/releases/tag/${TAG}" || true)"

  if [ -n "$REL_HTML" ]; then
    # core
    F="$(printf '%s' "$REL_HTML" | grep -o "href=\"[^\"]*/download/${TAG}/clashoo[_-][^\"]*${ARCH}[^\"]*\.${EXT}\"" | sed 's/.*href="//;s/"//' | head -1)"
    [ -n "$F" ] && CORE_URL="${GH_PROXY}/$(printf "%s" "$F" | sed "s/~/\./g")"
    # luci
    if [ "$PM" = "opkg" ]; then
      F="$(printf '%s' "$REL_HTML" | grep -o "href=\"[^\"]*/download/${TAG}/luci-app-clashoo[^\"]*all\.${EXT}\"" | sed 's/.*href="//;s/"//' | head -1)"
      [ -n "$F" ] && LUCI_URL="${GH_PROXY}/${F}"
      F="$(printf '%s' "$REL_HTML" | grep -o "href=\"[^\"]*/download/${TAG}/luci-i18n-clashoo-zh-cn[^\"]*all\.${EXT}\"" | sed 's/.*href="//;s/"//' | head -1)"
      [ -n "$F" ] && I18N_URL="${GH_PROXY}/${F}"
    fi
  fi
fi

# ========== GitHub 失败则回退 B2 ==========
if [ -z "$CORE_URL" ] || [ -z "$LUCI_URL" ]; then
  echo "GitHub unavailable, falling back to B2 feed..."

  for SDK in $(printf '%s\n' "$(sed -n "s/^DISTRIB_RELEASE=['\"]\([^'\"]*\)['\"]$/\1/p" /etc/openwrt_release | head -1 | grep -Eo '[0-9]+\.[0-9]+')" 24.10 23.05); do
    # 尝试 manifest
    M="$(fetch_text "${B2_FEED_BASE_URL}/${SDK}/${ARCH}/manifest.txt" || true)"
    [ -n "$M" ] || continue
    CORE_URL="${B2_FEED_BASE_URL}/${SDK}/${ARCH}/$(printf '%s' "$M" | sed -n 's/^core=//p')"
    LUCI_URL="${B2_FEED_BASE_URL}/${SDK}/${ARCH}/$(printf '%s' "$M" | sed -n 's/^luci=//p')"
    I18N_URL="${B2_FEED_BASE_URL}/${SDK}/${ARCH}/$(printf '%s' "$M" | sed -n 's/^i18n=//p')"
    [ -n "$CORE_URL" ] && [ -n "$LUCI_URL" ] && break
  done
fi

[ -z "$CORE_URL" ] && { echo "Cannot find core package"; exit 1; }
[ -z "$LUCI_URL" ] && { echo "Cannot find luci package"; exit 1; }

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
