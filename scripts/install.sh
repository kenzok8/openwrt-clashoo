#!/bin/sh

set -eu

REPO="kenzok8/openwrt-clashoo"
RELEASES_API_URL="https://api.github.com/repos/${REPO}/releases?per_page=20"
LATEST_API_URL="https://api.github.com/repos/${REPO}/releases/latest"
TMP_DIR="/tmp/clashoo-install"

fetch_text() {
  url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url"
    return $?
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -qO- "$url"
    return $?
  fi
  return 127
}

download_file() {
  url="$1"
  out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fL "$url" -o "$out"
    return $?
  fi
  wget -qO "$out" "$url"
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
  printf '%s\n' "$json" \
    | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | sed 's/^.*"browser_download_url"[[:space:]]*:[[:space:]]*"//; s/"$//' \
    | grep -E "$pattern" \
    | head -n 1
}

split_release_objects() {
  awk '
    BEGIN {
      in_string = 0
      escaped = 0
      depth = 0
      buf = ""
    }
    {
      for (i = 1; i <= length($0); i++) {
        c = substr($0, i, 1)

        if (!in_string && c == "{") {
          depth++
          if (depth == 1) {
            buf = "{"
          } else {
            buf = buf c
          }
          continue
        }

        if (depth > 0) {
          buf = buf c
        }

        if (escaped) {
          escaped = 0
          continue
        }

        if (c == "\\") {
          if (in_string) {
            escaped = 1
          }
          continue
        }

        if (c == "\"") {
          in_string = !in_string
          continue
        }

        if (!in_string && c == "}" && depth > 0) {
          depth--
          if (depth == 0) {
            print buf
            buf = ""
          }
        }
      }
    }
  '
}

find_release_object() {
  json="$1"
  match="$2"
  printf '%s\n' "$json" | split_release_objects | grep -E -m 1 "$match" || true
}

extract_release_string() {
  json="$1"
  key="$2"
  printf '%s\n' "$json" | sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" | head -n 1
}

list_asset_names() {
  json="$1"
  printf '%s\n' "$json" \
    | grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | sed 's/^.*"name"[[:space:]]*:[[:space:]]*"//; s/"$//'
}

resolve_release_json() {
  releases_json="$(fetch_text "$RELEASES_API_URL" || true)"
  if [ -n "$releases_json" ]; then
    prerelease_json="$(find_release_object "$releases_json" '"prerelease"[[:space:]]*:[[:space:]]*true')"
    if [ -n "$prerelease_json" ]; then
      RELEASE_KIND="prerelease"
      RELEASE_JSON="$prerelease_json"
      return 0
    fi
  fi

  RELEASE_KIND="latest"
  RELEASE_JSON="$(fetch_text "$LATEST_API_URL")"
}

PM="$(detect_manager)"
if [ "$PM" = "unsupported" ]; then
  echo "No supported package manager found (opkg/apk)."
  exit 1
fi

ARCH="$(detect_arch "$PM")"
[ -n "$ARCH" ] || { echo "Cannot detect architecture"; exit 1; }

RELEASE_KIND=""
RELEASE_JSON=""
resolve_release_json
JSON="$RELEASE_JSON"
[ -n "$JSON" ] || { echo "Cannot fetch release info"; exit 1; }
RELEASE_TAG="$(extract_release_string "$JSON" "tag_name")"
[ -n "$RELEASE_TAG" ] && echo "Using ${RELEASE_KIND} release: $RELEASE_TAG"

EXT="ipk"
[ "$PM" = "apk" ] && EXT="apk"

if [ "$PM" = "opkg" ]; then
  CORE_URL="$(find_asset_url "$JSON" "clashoo_[^/]*_${ARCH}\\.ipk$")"
  LUCI_URL="$(find_asset_url "$JSON" "luci-app-clashoo_[^/]*_all\\.ipk$")"
  I18N_URL="$(find_asset_url "$JSON" "luci-i18n-clashoo-zh-cn_[^/]*_all\\.ipk$")"
else
  CORE_URL="$(find_asset_url "$JSON" "clashoo([-_][^/]+)?\\.apk$")"
  LUCI_URL="$(find_asset_url "$JSON" "luci-app-clashoo([-_][^/]+)?\\.apk$")"
  I18N_URL="$(find_asset_url "$JSON" "luci-i18n-clashoo-zh-cn([-_][^/]+)?\\.apk$")"
fi

if [ -z "$CORE_URL" ] || [ -z "$LUCI_URL" ]; then
  echo "Cannot find required release assets for arch: $ARCH"
  [ -n "$RELEASE_TAG" ] && echo "Resolved release tag: $RELEASE_TAG"
  echo "Detected package manager: $PM"
  echo "Available assets:"
  list_asset_names "$JSON" | sed -n '1,40p'
  exit 1
fi

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

echo "Downloading packages..."
download_file "$CORE_URL" "$TMP_DIR/core.${EXT}"
download_file "$LUCI_URL" "$TMP_DIR/luci.${EXT}"
if [ -n "$I18N_URL" ]; then
  download_file "$I18N_URL" "$TMP_DIR/i18n.${EXT}"
fi

echo "Installing packages with $PM..."
if [ "$PM" = "opkg" ]; then
  opkg install "$TMP_DIR/core.${EXT}" "$TMP_DIR/luci.${EXT}" ${I18N_URL:+"$TMP_DIR/i18n.${EXT}"}
else
  apk add --allow-untrusted "$TMP_DIR/core.${EXT}" "$TMP_DIR/luci.${EXT}" ${I18N_URL:+"$TMP_DIR/i18n.${EXT}"}
fi

echo "Install complete."
