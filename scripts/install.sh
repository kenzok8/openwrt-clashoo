#!/bin/sh

set -eu

FEED_BASE_URL="https://down.dllkids.xyz/openwrt-feed/clashoo"
KEY_BASE_URL="https://down.dllkids.xyz/openwrt-feed/keys"
GITHUB_API_URL="https://api.github.com/repos/kenzok8/openwrt-clashoo/releases/latest"
GITHUB_PROXY_PREFIX="${GITHUB_PROXY_PREFIX:-https://ghfast.top/}"
TMP_DIR="/tmp/clashoo-install"

# ---- 信任根 ---------------------------------------------------------------
# 这两把公钥的 SHA-256 是本脚本唯一内置的信任锚点，跑之前先比对再用。
# 同一组指纹也写在 README 的安装章节里，供人工核对下载到的公钥。
# 换钥匙时必须同步更新这里（可以留一段有期限的新旧指纹过渡期）。
APK_KEY_NAME="dllkids-feed.pub.pem"
APK_KEY_SHA256="ea9dd08b41e6b0fc7ffda166a89b2b4904ad5607bf77d82c9f7f2a54e63a8948"
OPKG_KEY_NAME="dllkids-feed.pub"
OPKG_KEY_SHA256="216565b4d2c50f90da39ee1b19f1c6d2de0392c0043ca9bea311ac831a44779e"

# GitHub Release 回退必须显式开启：它只能证明文件与 GitHub 上记录的摘要一致，
# 不是包签名验证，也不防发布账户失陷。
ALLOW_GITHUB_FALLBACK="${CLASHOO_ALLOW_GITHUB_FALLBACK:-0}"

die() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

info() {
  printf '%s\n' "$1"
}

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

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
    curl -fsSL "$url" -o "$out"
    return $?
  fi
  wget -qO "$out" "$url" 2>/dev/null
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return 0
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
    return 0
  fi
  return 1
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

# 先走镜像、失败再直连 GitHub：加速站经常抖，单次尝试会让用户以为脚本坏了。
download_github_url() {
  _gh_url="$1"
  _gh_out="$2"
  download_file "$(download_url "$_gh_url")" "$_gh_out" && return 0
  if [ -n "$GITHUB_PROXY_PREFIX" ]; then
    echo "镜像下载失败，改用直连 GitHub 重试" >&2
    download_file "$_gh_url" "$_gh_out"
    return $?
  fi
  return 1
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

# Feed 结构：<base>/<sdk>/<arch>/<files> —— 与 dllkids setup 脚本对齐
feed_base_for() {
  printf '%s/%s/%s' "$FEED_BASE_URL" "$1" "$2"
}

# ---- 公钥引导 -------------------------------------------------------------

# 公钥引导：0 = 可用；1 = 网络取不到（由主流程决定是否显式回退）；
# 指纹不匹配、缺少校验工具时直接 die，绝不回退。
install_apk_key() {
  key_path="/etc/apk/keys/${APK_KEY_NAME}"
  if [ -r "$key_path" ] && [ "$(sha256_of "$key_path" || true)" = "$APK_KEY_SHA256" ]; then
    info "apk 公钥已就位: ${key_path}"
    return 0
  fi

  key_tmp="${TMP_DIR}/${APK_KEY_NAME}"
  if ! download_file "${KEY_BASE_URL}/${APK_KEY_NAME}" "$key_tmp"; then
    info "apk 公钥下载失败（网络）: ${KEY_BASE_URL}/${APK_KEY_NAME}"
    return 1
  fi

  have="$(sha256_of "$key_tmp" || true)"
  [ -n "$have" ] || die "系统缺少 sha256 工具（sha256sum/shasum），无法校验公钥，已停止"
  [ "$have" = "$APK_KEY_SHA256" ] \
    || die "APK 公钥指纹不匹配（期望 ${APK_KEY_SHA256}，实际 ${have}），已停止"

  mkdir -p /etc/apk/keys
  cp "$key_tmp" "$key_path" 2>/dev/null || die "无法写入 ${key_path}，需要 root 权限"
  chmod 644 "$key_path" 2>/dev/null || true
  info "已导入 apk 公钥: ${key_path}"
  return 0
}

install_opkg_key() {
  for cand in /etc/opkg/keys/*; do
    [ -f "$cand" ] || continue
    if [ "$(sha256_of "$cand" || true)" = "$OPKG_KEY_SHA256" ]; then
      info "opkg 公钥已就位: ${cand}"
      return 0
    fi
  done

  key_tmp="${TMP_DIR}/${OPKG_KEY_NAME}"
  if ! download_file "${KEY_BASE_URL}/${OPKG_KEY_NAME}" "$key_tmp"; then
    info "opkg 公钥下载失败（网络）: ${KEY_BASE_URL}/${OPKG_KEY_NAME}"
    return 1
  fi

  have="$(sha256_of "$key_tmp" || true)"
  [ -n "$have" ] || die "系统缺少 sha256 工具（sha256sum/shasum），无法校验公钥，已停止"
  [ "$have" = "$OPKG_KEY_SHA256" ] \
    || die "OPKG 公钥指纹不匹配（期望 ${OPKG_KEY_SHA256}，实际 ${have}），已停止"

  command -v opkg-key >/dev/null 2>&1 \
    || die "缺少 opkg-key，无法导入 feed 公钥；请先安装 usign/openwrt-keyring"
  opkg-key add "$key_tmp" || die "opkg-key add 失败"
  info "已导入 opkg 公钥: ${OPKG_KEY_NAME}"
  return 0
}

# ---- 签名 feed 安装 -------------------------------------------------------
# 返回码：0 成功；1 网络/源不可达（允许回退）；2 验签或摘要失败（禁止回退）

apk_install_from_feed() {
  sdk="$1"
  arch="$2"
  base="$(feed_base_for "$sdk" "$arch")"
  index_url="${base}/packages.adb"
  index_file="${TMP_DIR}/packages.adb"

  # 唯一允许回退的情况：索引压根取不到（网络）
  rm -f "$index_file"
  download_file "$index_url" "$index_file" >/dev/null 2>&1 || return 1
  if [ ! -s "$index_file" ]; then
    printf '包索引为空或格式异常: %s\n' "$index_url" >&2
    return 2
  fi

  # 索引一旦取到，后面任何失败都属于“验签/事务失败”，必须停止，不再回退
  if ! apk verify "$index_file" >/dev/null 2>&1; then
    printf '签名的包索引校验失败: %s\n' "$index_url" >&2
    return 2
  fi
  info "索引验签通过: ${sdk}/${arch}"

  repo_file="${TMP_DIR}/apk-repositories"
  {
    cat /etc/apk/repositories 2>/dev/null || true
    cat /etc/apk/repositories.d/*.list 2>/dev/null || true
    printf '%s\n' "$index_url"
  } > "$repo_file"

  # luci-app-clashoo 的 Depends 里硬依赖 luci-i18n-clashoo-zh-cn，所以 feed 只要能装
  # 前者就一定有后者。三个包都显式列出，不再去解析索引猜“有没有”，
  # 免得 adbdump 不可用或缺包时被静默跳过。
  pkgs="clashoo luci-app-clashoo luci-i18n-clashoo-zh-cn"

  out="${TMP_DIR}/apk-add.log"
  : > "$out"

  # update / add / upgrade 三步：add 负责首次安装，upgrade 把已装的旧版本顶到最新
  # （apk add 对已满足的约束不会升级）
  if ! apk --repositories-file "$repo_file" update --force-missing-repositories >>"$out" 2>&1; then
    cat "$out" >&2
    return 2
  fi
  for step in add upgrade; do
    # shellcheck disable=SC2086
    if ! apk --repositories-file "$repo_file" $step $pkgs >>"$out" 2>&1; then
      cat "$out" >&2
      return 2
    fi
  done

  return 0
}

opkg_install_from_feed() {
  sdk="$1"
  arch="$2"
  base="$(feed_base_for "$sdk" "$arch")"
  packages_url="${base}/Packages.gz"
  sig_url="${base}/Packages.sig"
  gz_file="${TMP_DIR}/Packages.gz"
  plain_file="${TMP_DIR}/Packages"
  sig_file="${TMP_DIR}/Packages.sig"

  # 唯一允许回退的情况：索引取不到（网络）
  rm -f "$gz_file" "$plain_file" "$sig_file"
  download_file "$packages_url" "$gz_file" >/dev/null 2>&1 || return 1
  if [ ! -s "$gz_file" ]; then
    printf '包索引为空: %s\n' "$packages_url" >&2
    return 2
  fi

  if ! gunzip -c "$gz_file" > "$plain_file" 2>/dev/null; then
    printf '包索引解压失败: %s\n' "$packages_url" >&2
    return 2
  fi
  if ! grep -q '^Package: ' "$plain_file"; then
    printf '包索引为空或格式异常: %s\n' "$packages_url" >&2
    return 2
  fi

  # 索引取到之后，任何失败都属于验签/事务失败，必须停止
  if command -v usign >/dev/null 2>&1; then
    download_file "$sig_url" "$sig_file" >/dev/null 2>&1 || {
      printf '索引签名文件下载失败: %s\n' "$sig_url" >&2
      return 2
    }
    key_file=""
    for cand in /etc/opkg/keys/*; do
      [ -f "$cand" ] || continue
      if [ "$(sha256_of "$cand" || true)" = "$OPKG_KEY_SHA256" ]; then
        key_file="$cand"
        break
      fi
    done
    if [ -z "$key_file" ]; then
      printf '找不到已导入的 feed 公钥，无法验签索引\n' >&2
      return 2
    fi
    if ! usign -V -m "$plain_file" -x "$sig_file" -p "$key_file" >/dev/null 2>&1; then
      printf '签名的包索引校验失败: %s\n' "$packages_url" >&2
      return 2
    fi
    info "索引验签通过: ${sdk}/${arch}"
  else
    info "系统无 usign，索引验签交由 opkg update 完成"
  fi

  # 临时 conf 保留系统 opkg.conf 的 dest/option 行，只把 lists_dir 换到临时目录，
  # 再补上项目 feed，避免污染系统的 customfeeds.conf
  conf_file="${TMP_DIR}/opkg.conf"
  {
    grep -v '^[[:space:]]*lists_dir' /etc/opkg.conf 2>/dev/null || true
    printf 'lists_dir ext %s/lists\n' "$TMP_DIR"
    printf 'option check_signature 1\n'
    cat /etc/opkg/distfeeds.conf 2>/dev/null || true
    cat /etc/opkg/customfeeds.conf 2>/dev/null || true
    printf 'src/gz dllkids_clashoo %s\n' "$base"
  } > "$conf_file"
  mkdir -p "${TMP_DIR}/lists"

  out="${TMP_DIR}/opkg.log"
  if ! opkg -f "$conf_file" update >"$out" 2>&1; then
    cat "$out" >&2
    return 2
  fi

  # i18n 是 luci-app-clashoo 的硬依赖（见索引 Depends），一并显式安装；
  # 装不上就是失败，不再“不可用就跳过”。
  if ! opkg -f "$conf_file" install clashoo luci-app-clashoo luci-i18n-clashoo-zh-cn >>"$out" 2>&1; then
    cat "$out" >&2
    return 2
  fi

  return 0
}

# ---- GitHub Release 回退（需显式开启，仅摘要校验）------------------------

github_assets() {
  payload="$(fetch_text "$GITHUB_API_URL" || true)"
  [ -n "$payload" ] || return 1
  printf '%s\n' "$payload" | awk '
    /"name": *"/ {
      line = $0
      sub(/.*"name": *"/, "", line)
      sub(/",?$/, "", line)
      name = line
    }
    /"digest": *"sha256:/ {
      line = $0
      sub(/.*"sha256:/, "", line)
      sub(/".*/, "", line)
      digest[name] = line
    }
    /"browser_download_url": *"/ {
      line = $0
      sub(/.*"browser_download_url": *"/, "", line)
      sub(/",?$/, "", line)
      url[name] = line
    }
    END {
      for (n in digest)
        if (url[n] != "")
          print n "\t" digest[n] "\t" url[n]
    }
  '
}

pick_asset() {
  pattern="$1"
  assets="$2"
  printf '%s\n' "$assets" | awk -F'\t' -v pat="$pattern" '$1 ~ pat {print; exit}'
}

github_install() {
  pm="$1"
  arch="$2"
  ext="$3"

  info "回退到 GitHub Release：只校验 GitHub 记录的 SHA-256，不是包签名验证"
  assets="$(github_assets || true)"
  [ -n "$assets" ] || die "GitHub Release 资产列表获取失败或缺少摘要，已停止"

  case "$pm" in
    apk)
      core_pat="^clashoo-[^-]+-r[0-9]+-${arch}\\.apk$"
      luci_pat="^luci-app-clashoo-[^-]+-r[0-9]+-(${arch}|all)\\.apk$"
      i18n_pat="^luci-i18n-clashoo-zh-cn-[^-]+-r[0-9]+-(${arch}|all)\\.apk$"
      ;;
    *)
      core_pat="^clashoo_.*_${arch}\\.ipk$"
      luci_pat="^luci-app-clashoo_.*_all\\.ipk$"
      i18n_pat="^luci-i18n-clashoo-zh-cn_.*_all\\.ipk$"
      ;;
  esac

  core_row="$(pick_asset "$core_pat" "$assets")"
  luci_row="$(pick_asset "$luci_pat" "$assets")"
  i18n_row="$(pick_asset "$i18n_pat" "$assets")"
  [ -n "$core_row" ] || die "GitHub Release 中找不到适配 ${arch} 的核心包，已停止"
  [ -n "$luci_row" ] || die "GitHub Release 中找不到 LuCI 包，已停止"

  files=""
  idx=0
  for row in "$core_row" "$luci_row" "$i18n_row"; do
    [ -n "$row" ] || continue
    name="$(printf '%s' "$row" | cut -f1)"
    want="$(printf '%s' "$row" | cut -f2)"
    url="$(printf '%s' "$row" | cut -f3)"
    [ -n "$want" ] || die "资产 ${name} 没有 sha256 摘要，已停止"
    idx=$((idx + 1))
    out="${TMP_DIR}/pkg-${idx}.${ext}"
    download_github_url "$url" "$out" || die "下载失败: ${name}"
    have="$(sha256_of "$out" || true)"
    [ "$have" = "$want" ] || die "摘要不匹配（${name}）：期望 ${want}，实际 ${have}，已停止"
    info "摘要校验通过: ${name}"
    files="$files $out"
  done

  if [ "$pm" = "opkg" ]; then
    opkg update || info "警告: opkg update 失败，依赖解析可能受影响"
    # shellcheck disable=SC2086
    opkg install $files
  else
    info "注意: 这些包没有本 feed 的签名，只能以 --allow-untrusted 安装"
    # shellcheck disable=SC2086
    apk add --allow-untrusted $files
  fi
}

# ---- 主流程 ---------------------------------------------------------------

PM="$(detect_manager)"
[ "$PM" != "unsupported" ] || die "未找到 opkg 或 apk，无法继续"

ARCH="$(detect_arch "$PM")"
[ -n "$ARCH" ] || die "无法识别设备架构"

EXT="ipk"
[ "$PM" = "apk" ] && EXT="apk"

SDK_CANDIDATES="$(build_sdk_candidates "$PM")"

rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

if [ "$PM" = "apk" ]; then
  install_apk_key || KEY_OK=0
else
  install_opkg_key || KEY_OK=0
fi

# 拿不到公钥（网络）时不能装签名 feed，但也不该直接判死：显式开启回退才走 GitHub。
# 指纹不匹配在 install_*_key 里已经 die，不会走到这里。
if [ "${KEY_OK:-1}" -eq 0 ]; then
  if [ "$ALLOW_GITHUB_FALLBACK" != "1" ]; then
    die "无法获取 feed 公钥（网络原因），且未开启 GitHub 回退。网络恢复后重试，或设置 CLASHOO_ALLOW_GITHUB_FALLBACK=1 显式使用 GitHub Release（仅校验摘要，不是包签名验证）"
  fi
  info "无法获取 feed 公钥，跳过签名 feed，直接使用 GitHub 回退"
  github_install "$PM" "$ARCH" "$EXT"
  info "安装完成（${PM}，${ARCH}）"
  exit 0
fi

installed=0
unreachable=0
for SDK in $SDK_CANDIDATES; do
  info "尝试签名 feed: ${SDK}/${ARCH}"
  if [ "$PM" = "apk" ]; then
    set +e
    apk_install_from_feed "$SDK" "$ARCH"
    rc=$?
    set -e
  else
    set +e
    opkg_install_from_feed "$SDK" "$ARCH"
    rc=$?
    set -e
  fi

  case "$rc" in
    0)
      installed=1
      break
      ;;
    2)
      die "包索引验签或包摘要校验失败，已停止安装（不会自动降级）"
      ;;
    *)
      unreachable=1
      info "该源不可用，继续下一个候选"
      ;;
  esac
done

if [ "$installed" -eq 0 ]; then
  [ "$unreachable" -eq 1 ] || die "没有可用的安装源"
  if [ "$ALLOW_GITHUB_FALLBACK" != "1" ]; then
    die "签名 feed 不可用。若确认是本机网络问题，可设置 CLASHOO_ALLOW_GITHUB_FALLBACK=1 重试（GitHub 回退仅校验摘要，不是包签名验证）"
  fi
  github_install "$PM" "$ARCH" "$EXT"
fi

info "安装完成（${PM}，${ARCH}）"
