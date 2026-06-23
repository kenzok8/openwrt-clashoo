#!/bin/sh

set -eu

FEED_BASE_URL="https://down.dllkids.xyz/openwrt-feed/clashoo"
GITHUB_API_URL="https://api.github.com/repos/kenzok8/openwrt-clashoo/releases/latest"
GITHUB_PROXY_PREFIX="${GITHUB_PROXY_PREFIX:-https://ghfast.top/}"
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

download_url() {
  url="$1"
  case "$url" in
    https://github.com/*)
      printf '%s%s\n' "$GITHUB_PROXY_PREFIX" "$url"
      ;;
    *)
      printf '%s\n' "$url"
      ;;
  esac
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
  # apk --print-arch 只回 CPU family（如 aarch64），丢掉 subtarget 后缀；
  # feed/release 产物用完整 target arch（aarch64_cortex-a53），优先读 DISTRIB_ARCH
  distrib_arch="$(sed -n "s/^DISTRIB_ARCH=['\"]\([^'\"]*\)['\"].*/\1/p" /etc/openwrt_release 2>/dev/null | head -n 1)"
  if [ -n "$distrib_arch" ]; then
    printf '%s\n' "$distrib_arch"
  else
    apk --print-arch
  fi
}

detect_sdk() {
  if [ ! -r /etc/openwrt_release ]; then
    return 1
  fi

  release="$(sed -n "s/^DISTRIB_RELEASE=['\"]\\([^'\"]*\\)['\"]$/\\1/p" /etc/openwrt_release | head -n 1)"
  [ -n "$release" ] || return 1

  sdk="$(printf '%s\n' "$release" | grep -Eo '[0-9]+\.[0-9]+' | head -n 1)"
  [ -n "$sdk" ] || return 1
  printf '%s\n' "$sdk"
}

find_feed_filename() {
  package_name="$1"
  packages_text="$2"
  printf '%s\n' "$packages_text" | awk -v pkg="$package_name" '
    $0 == "Package: " pkg {
      in_pkg = 1
      next
    }
    in_pkg && /^Filename: / {
      sub(/^Filename: /, "")
      print
      exit
    }
    in_pkg && /^$/ {
      in_pkg = 0
    }
  '
}

find_manifest_value() {
  key="$1"
  manifest_text="$2"
  printf '%s\n' "$manifest_text" | sed -n "s/^${key}=//p" | head -n 1
}

append_unique_word() {
  value="$1"
  list="$2"
  [ -n "$value" ] || {
    printf '%s\n' "$list"
    return
  }
  case " $list " in
    *" $value "*) ;;
    *) list="${list}${list:+ }${value}" ;;
  esac
  printf '%s\n' "$list"
}

build_sdk_candidates() {
  pm="$1"
  candidates=""
  detected_sdk="$(detect_sdk || true)"
  candidates="$(append_unique_word "$detected_sdk" "$candidates")"

  if [ "$pm" = "opkg" ]; then
    for sdk in 24.10 23.05 22.03 21.02; do
      candidates="$(append_unique_word "$sdk" "$candidates")"
    done
  else
    for sdk in 25.12 24.10; do
      candidates="$(append_unique_word "$sdk" "$candidates")"
    done
  fi

  printf '%s\n' "$candidates"
}

# Feed 结构：<base>/<sdk>/<arch>/<files> —— 与 dllkids setup.sh 对齐，不嵌 feedname 子目录
feed_base_for() {
  printf '%s/%s/%s' "$FEED_BASE_URL" "$1" "$2"
}

load_manifest_urls() {
  sdk="$1"
  arch="$2"
  base="$(feed_base_for "$sdk" "$arch")"
  manifest_url="${base}/manifest-clashoo.txt"
  manifest_text="$(fetch_text "$manifest_url" || true)"
  [ -n "$manifest_text" ] || return 1

  core_file="$(find_manifest_value "core" "$manifest_text")"
  luci_file="$(find_manifest_value "luci" "$manifest_text")"
  i18n_file="$(find_manifest_value "i18n" "$manifest_text")"

  [ -n "$core_file" ] || return 1
  [ -n "$luci_file" ] || return 1

  CORE_URL="${base}/${core_file}"
  LUCI_URL="${base}/${luci_file}"
  I18N_URL=""
  [ -n "$i18n_file" ] && I18N_URL="${base}/${i18n_file}"
  return 0
}

load_opkg_feed_urls() {
  sdk="$1"
  arch="$2"
  base="$(feed_base_for "$sdk" "$arch")"
  packages_url="${base}/Packages.gz"
  packages_text="$(fetch_text "$packages_url" || true)"
  if ! printf '%s' "$packages_text" | grep -q '^Package: '; then
    return 1
  fi

  core_file="$(find_feed_filename "clashoo" "$packages_text")"
  luci_file="$(find_feed_filename "luci-app-clashoo" "$packages_text")"
  i18n_file="$(find_feed_filename "luci-i18n-clashoo-zh-cn" "$packages_text")"

  [ -n "$core_file" ] || return 1
  [ -n "$luci_file" ] || return 1

  CORE_URL="${base}/${core_file}"
  LUCI_URL="${base}/${luci_file}"
  I18N_URL=""
  [ -n "$i18n_file" ] && I18N_URL="${base}/${i18n_file}"
  return 0
}

load_github_urls() {
  arch="$1"
  ext="$2"
  payload="$(fetch_text "$GITHUB_API_URL" || true)"
  [ -n "$payload" ] || return 1

  urls="$(printf '%s\n' "$payload" | sed -n 's/.*"browser_download_url":[[:space:]]*"\([^"]*\)".*/\1/p')"
  [ -n "$urls" ] || return 1

  if [ "$ext" = "apk" ]; then
    CORE_URL="$(printf '%s\n' "$urls" | grep -E '/clashoo-[^-]+.*-r[0-9]+-'"$arch"'\.apk$' | head -n 1)"
    LUCI_URL="$(printf '%s\n' "$urls" | grep -E '/luci-app-clashoo-[^-]+.*-r[0-9]+-('"$arch"'|all)\.apk$' | head -n 1)"
    I18N_URL="$(printf '%s\n' "$urls" | grep -E '/luci-i18n-clashoo-zh-cn-[^-]+.*-r[0-9]+-('"$arch"'|all)\.apk$' | head -n 1)"
  else
    CORE_URL="$(printf '%s\n' "$urls" | grep -E '/clashoo_.*_'"$arch"'\.ipk$' | head -n 1)"
    LUCI_URL="$(printf '%s\n' "$urls" | grep -E '/luci-app-clashoo_.*_all\.ipk$' | head -n 1)"
    I18N_URL="$(printf '%s\n' "$urls" | grep -E '/luci-i18n-clashoo-zh-cn_.*_all\.ipk$' | head -n 1)"
  fi

  [ -n "$CORE_URL" ] || return 1
  [ -n "$LUCI_URL" ] || return 1
  return 0
}

PM="$(detect_manager)"
if [ "$PM" = "unsupported" ]; then
  echo "No supported package manager found (opkg/apk)."
  exit 1
fi

ARCH="$(detect_arch "$PM")"
[ -n "$ARCH" ] || { echo "Cannot detect architecture"; exit 1; }

SDK_CANDIDATES="$(build_sdk_candidates "$PM")"

EXT="ipk"
[ "$PM" = "apk" ] && EXT="apk"

CORE_URL=""
LUCI_URL=""
I18N_URL=""

if [ -n "$SDK_CANDIDATES" ]; then
  for SDK in $SDK_CANDIDATES; do
    if load_manifest_urls "$SDK" "$ARCH"; then
      echo "Using R2 feed manifest: ${SDK}/${ARCH}"
      break
    fi
    if [ "$PM" = "opkg" ] && load_opkg_feed_urls "$SDK" "$ARCH"; then
      echo "Using R2 feed: ${SDK}/${ARCH}"
      break
    fi
  done
fi

if [ -z "$CORE_URL" ] || [ -z "$LUCI_URL" ]; then
  if load_github_urls "$ARCH" "$EXT"; then
    echo "Using GitHub latest release"
  else
    echo "Cannot find required packages for arch: $ARCH"
    echo "Detected package manager: $PM"
    echo "Tried SDKs: $SDK_CANDIDATES"
    exit 1
  fi
fi

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

echo "Downloading packages..."
download_file "$(download_url "$CORE_URL")" "$TMP_DIR/core.${EXT}"
download_file "$(download_url "$LUCI_URL")" "$TMP_DIR/luci.${EXT}"
if [ -n "$I18N_URL" ]; then
  download_file "$(download_url "$I18N_URL")" "$TMP_DIR/i18n.${EXT}"
fi

echo "Installing packages with $PM..."
if [ "$PM" = "opkg" ]; then
  # Refresh package lists so deps (yq, coreutils-nohup, kmod-*) resolve on fresh systems
  opkg update || echo "Warning: opkg update failed, dependency resolution may break"
  opkg install "$TMP_DIR/core.${EXT}" "$TMP_DIR/luci.${EXT}" ${I18N_URL:+"$TMP_DIR/i18n.${EXT}"}
else
  apk update || echo "Warning: apk update failed, dependency resolution may break"
  apk add --allow-untrusted "$TMP_DIR/core.${EXT}" "$TMP_DIR/luci.${EXT}" ${I18N_URL:+"$TMP_DIR/i18n.${EXT}"}
fi

echo "Install complete."
