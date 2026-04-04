#!/bin/sh

set -eu

REPO="kenzok8/openwrt-clashoo"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"
TMP_DIR="/tmp/clashoo-install"

fetch_text() {
  url="$1"
  if command -v wget >/dev/null 2>&1; then
    wget -qO- "$url"
    return $?
  fi
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url"
    return $?
  fi
  return 127
}

download_file() {
  url="$1"
  out="$2"
  if command -v wget >/dev/null 2>&1; then
    wget -qO "$out" "$url"
    return $?
  fi
  curl -fL "$url" -o "$out"
}

detect_manager() {
  if command -v opkg >/dev/null 2>&1; then
    echo opkg
    return
  fi
  if command -v apk >/dev/null 2>&1; then
    echo apk
    return
  fi
  echo "unsupported"
}

detect_arch() {
  pm="$1"
  if [ "$pm" = "opkg" ]; then
    opkg print-architecture | awk '/^arch / {print $2}' | tail -n 1
    return
  fi
  apk --print-arch
}

find_asset_url() {
  json="$1"
  pattern="$2"
  printf '%s\n' "$json" | sed 's/},{/}\
{/g' | sed -n 's/.*"browser_download_url":"\([^"]*\)".*/\1/p' | grep -E "$pattern" | head -n 1
}

PM="$(detect_manager)"
if [ "$PM" = "unsupported" ]; then
  echo "No supported package manager found (opkg/apk)."
  exit 1
fi

ARCH="$(detect_arch "$PM")"
[ -n "$ARCH" ] || { echo "Cannot detect architecture"; exit 1; }

JSON="$(fetch_text "$API_URL")"
[ -n "$JSON" ] || { echo "Cannot fetch latest release info"; exit 1; }

EXT="ipk"
[ "$PM" = "apk" ] && EXT="apk"

CORE_URL="$(find_asset_url "$JSON" "clashoo_[^/]*_${ARCH}\\.${EXT}$")"
RUNTIME_URL="$(find_asset_url "$JSON" "clashoo-runtime_[^/]*_all\\.${EXT}$")"
LUCI_URL="$(find_asset_url "$JSON" "luci-app-clashoo_[^/]*_all\\.${EXT}$")"
I18N_URL="$(find_asset_url "$JSON" "luci-i18n-clashoo-zh-cn_[^/]*_all\\.${EXT}$")"

if [ -z "$CORE_URL" ] || [ -z "$RUNTIME_URL" ] || [ -z "$LUCI_URL" ]; then
  echo "Cannot find required release assets for arch: $ARCH"
  exit 1
fi

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

echo "Downloading packages..."
download_file "$CORE_URL" "$TMP_DIR/core.${EXT}"
download_file "$RUNTIME_URL" "$TMP_DIR/runtime.${EXT}"
download_file "$LUCI_URL" "$TMP_DIR/luci.${EXT}"
if [ -n "$I18N_URL" ]; then
  download_file "$I18N_URL" "$TMP_DIR/i18n.${EXT}"
fi

echo "Installing packages with $PM..."
if [ "$PM" = "opkg" ]; then
  opkg install "$TMP_DIR/core.${EXT}" "$TMP_DIR/runtime.${EXT}" "$TMP_DIR/luci.${EXT}" ${I18N_URL:+"$TMP_DIR/i18n.${EXT}"}
else
  apk add --allow-untrusted "$TMP_DIR/core.${EXT}" "$TMP_DIR/runtime.${EXT}" "$TMP_DIR/luci.${EXT}" ${I18N_URL:+"$TMP_DIR/i18n.${EXT}"}
fi

echo "Install complete."
