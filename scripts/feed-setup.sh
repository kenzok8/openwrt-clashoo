#!/bin/sh
set -eu

BASE_URL=https://down.dllkids.xyz/openwrt-feed

# 先确定包管理器 —— SDK 版本直接看 PM，不再读 DISTRIB_RELEASE。
# 自定义固件（如 kenzok 的 v2026.MM.DD 命名）DISTRIB_RELEASE 跟上游 SDK 完全脱钩，
# 解析字符串容易翻车；apk-tools v3 等于 25.12，opkg 等于 24.10，这条对应关系稳定。
if command -v apk >/dev/null 2>&1; then
  PM="apk"
  FEEDS_FILE="/etc/apk/repositories.d/customfeeds.list"
  SDK="25.12"
elif command -v opkg >/dev/null 2>&1; then
  PM="opkg"
  FEEDS_FILE="/etc/opkg/customfeeds.conf"
  SDK="24.10"
else
  echo "[ERROR] No supported package manager" >&2; exit 1
fi

SDK_URL="$BASE_URL/$SDK"
# opkg 用 usign Ed25519 公钥；apk 用 ECDSA P-256 PEM 公钥
KEY_URL_OPKG="$BASE_URL/keys/dllkids-feed.pub"
KEY_URL_APK="$BASE_URL/keys/dllkids-feed.pub.pem"
KEY_FILE_OPKG="/tmp/dllkids-feed.pub"

fetch_file() {
  url="$1"; out="$2"
  if command -v wget >/dev/null 2>&1; then wget -q -O "$out" "$url"; return 0; fi
  if command -v uclient-fetch >/dev/null 2>&1; then uclient-fetch -q -O "$out" "$url"; return 0; fi
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$url" -o "$out"; return 0; fi
  echo "[ERROR] Need wget/uclient-fetch/curl" >&2; exit 1
}

# 输出到标准输出（用于解析资产列表），失败返回非零
fetch_stdout() {
  url="$1"
  if command -v wget >/dev/null 2>&1; then wget -qO- "$url"; return $?; fi
  if command -v uclient-fetch >/dev/null 2>&1; then uclient-fetch -q -O - "$url"; return $?; fi
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$url"; return $?; fi
  return 1
}

url_exists() {
  url="$1"
  # Do a real redirected GET. Some CDN/B2 paths return 302 to HEAD
  # even when the final object is missing, which makes curl -fI lie.
  if command -v wget >/dev/null 2>&1; then wget -q -O /dev/null "$url" && return 0; fi
  if command -v uclient-fetch >/dev/null 2>&1; then uclient-fetch -q -O /dev/null "$url" >/dev/null 2>&1 && return 0; fi
  if command -v curl >/dev/null 2>&1; then curl -fsSL -o /dev/null "$url" && return 0; fi
  return 1
}

clean_dllkids_lines() {
  file="$1"
  [ -e "$file" ] || return 0
  tmpf="${file}.dllkids.tmp"
  # 先清掉旧版脚本残留的 dllkids 行（包括错 SDK / 没尾斜杠的早期版本），
  # 避免共存的旧行让 apk update 报 404
  grep -vF 'down.dllkids.xyz/openwrt-feed/' "$file" > "$tmpf" || true
  mv "$tmpf" "$file"
}

upsert_line() {
  line="$1"
  mkdir -p "$(dirname "$FEEDS_FILE")"
  touch "$FEEDS_FILE"
  if [ "$PM" = "apk" ]; then
    clean_dllkids_lines "/etc/apk/repositories"
    for feeds_file in /etc/apk/repositories.d/*.list; do
      [ -e "$feeds_file" ] || continue
      clean_dllkids_lines "$feeds_file"
    done
  else
    clean_dllkids_lines "$FEEDS_FILE"
  fi
  printf '%s\n' "$line" >> "$FEEDS_FILE"
}

ARCH=""
if [ "$PM" = "opkg" ]; then
  ARCH=$(opkg print-architecture | awk '$1=="arch" && $2!="all" && $2!="noarch" { if ($3+0>best) { best=$3+0; arch=$2 } } END { if (arch!="") print arch; else print "all" }')
else
  # apk --print-arch 只回 CPU family（如 aarch64），丢掉 subtarget 后缀；
  # feed 目录用完整 target arch（aarch64_cortex-a53），优先读 DISTRIB_ARCH
  ARCH=$(sed -n "s/^DISTRIB_ARCH=['\"]\([^'\"]*\)['\"].*/\1/p" /etc/openwrt_release 2>/dev/null | head -n1)
  [ -n "$ARCH" ] || ARCH=$(apk --print-arch)
fi

ARCH_URL="$SDK_URL/${ARCH}"

feed_has_index() {
  feed_url="$1"
  if [ "$PM" = "apk" ]; then
    url_exists "$feed_url/packages.adb"
  else
    url_exists "$feed_url/Packages.gz"
  fi
}

candidate_arches() {
  requested_arch="$1"
  printf '%s\n' "$requested_arch"
  case "$requested_arch" in
    aarch64|arm64|aarch64_*)
      [ "$requested_arch" = "aarch64_generic" ] || printf '%s\n' "aarch64_generic"
      ;;
  esac
  printf '%s\n' "all"
}

select_feed_arch() {
  requested_arch="$1"
  seen=" "
  for candidate in $(candidate_arches "$requested_arch"); do
    case "$seen" in
      *" $candidate "*) continue ;;
    esac
    seen="${seen}${candidate} "
    candidate_url="$SDK_URL/$candidate"
    if feed_has_index "$candidate_url"; then
      if [ "$candidate" != "$requested_arch" ]; then
        echo "[WARN] Feed not found for '${requested_arch}', fallback to '${candidate}'"
      fi
      ARCH="$candidate"
      ARCH_URL="$candidate_url"
      return 0
    fi
  done
  echo "[ERROR] No usable ${PM} feed found for '${requested_arch}' under ${SDK_URL}" >&2
  return 1
}

select_feed_arch "$ARCH"

if [ "$PM" = "opkg" ]; then
  echo "[INFO] Downloading usign key: $KEY_URL_OPKG"
  fetch_file "$KEY_URL_OPKG" "$KEY_FILE_OPKG"
  opkg-key add "$KEY_FILE_OPKG"
  upsert_line "src/gz dllkids_feed ${ARCH_URL}"
else
  # apk：安装 ECDSA 公钥到 /etc/apk/keys/，长期信任本仓库
  echo "[INFO] Downloading ECDSA key: $KEY_URL_APK"
  mkdir -p /etc/apk/keys
  fetch_file "$KEY_URL_APK" "/etc/apk/keys/dllkids-feed.pub.pem"
  chmod 644 /etc/apk/keys/dllkids-feed.pub.pem
  # apk-tools v3 规范格式：直接指向 packages.adb 文件，跟上游 distfeeds.list 对齐。
  # 写成目录的话 apk 还会去尝试 v2 的 ${arch}/APKINDEX.tar.gz fallback，产生 404 warning。
  upsert_line "${ARCH_URL}/packages.adb"
fi

echo "[INFO] SDK: $SDK | Arch: $ARCH | Feed: $ARCH_URL"

if [ "$PM" = "apk" ]; then
  # 先按已装公钥严格校验；若失败（如仓库正在过渡到稳定 key 期间）回退到 --allow-untrusted
  if ! apk update 2>/dev/null; then
    echo "[WARN] 签名校验失败，临时使用 --allow-untrusted；构建完成稳定 key 上线后再跑一次本脚本即可。"
    apk update --allow-untrusted
  fi
else
  opkg update
fi


# BTF 补齐：honk / dae / daed 的 eBPF 运行时需要内核 BTF。
# 固件自带 /sys/kernel/btf/vmlinux 时不做事；否则按 uname -r 精确匹配取同名包，
# 匹配不上就明确报出来，绝不装近似版本（BTF 描述的是具体内核结构布局）。
BTF_RELEASE="https://github.com/kenzok8/vmlinux-btf/releases/download/latest"
BTF_ASSETS="https://api.github.com/repos/kenzok8/vmlinux-btf/releases/tags/latest"

kernel_btf_ready() {
  [ -r /sys/kernel/btf/vmlinux ] && return 0
  kv=$(uname -r); kv=${kv%%-*}
  [ -r "/usr/lib/debug/boot/vmlinux-${kv}" ] && return 0
  return 1
}

ensure_btf() {
  [ "${SKIP_BTF:-0}" = 1 ] && return 0
  kernel_btf_ready && return 0
  kv=$(uname -r); kv=${kv%%-*}
  btf_arch="$ARCH"
  if [ "$PM" = "apk" ]; then
    name="vmlinux-btf-${kv}-r1-${btf_arch}.apk"
  else
    name="vmlinux-btf_${kv}-r1_${btf_arch}.ipk"
  fi
  url="$BTF_RELEASE/$name"
  exact=1
  if ! url_exists "$url"; then
    exact=0
    # 退一步：同系列（major.minor 相同）的补丁位版本一般可用，装但明确告警；
    # 跨系列一律不装 —— BTF 描述的是具体内核布局，跨系列会跑出错误偏移。
    series="${kv%.*}"
    assets=$(fetch_stdout "$BTF_ASSETS" 2>/dev/null || true)
    if [ "$PM" = "apk" ]; then
      sibling=$(printf '%s\n' "$assets" | grep -oE "vmlinux-btf-${series}\.[0-9]+-r[0-9]+-${btf_arch}\.apk" | head -n 1)
    else
      sibling=$(printf '%s\n' "$assets" | grep -oE "vmlinux-btf_${series}\.[0-9]+-r[0-9]+_${btf_arch}\.ipk" | head -n 1)
    fi
    if [ -z "$sibling" ]; then
      echo "[WARN] 当前内核 ${kv} 没有匹配的 BTF 包（精确 ${name} 与同系列都没有）。"
      echo "[WARN] 跳过 BTF 安装。honk / dae 启动会报「内核缺少 BTF」。"
      echo "[WARN] 请到 https://github.com/kenzok8/vmlinux-btf/issues 反馈 uname -r 与架构，我们补编。"
      return 0
    fi
    name="$sibling"
    url="$BTF_RELEASE/$name"
    echo "[WARN] 没有 ${kv} 的精确包，退回同系列：$name"
    echo "[WARN] 同系列补丁位一般可用；若核心异常，先怀疑这份 BTF。"
  fi
  echo "[INFO] 安装匹配内核 ${kv} 的 BTF：$name"
  fetch_file "$url" "/tmp/$name"
  if [ "$PM" = "apk" ]; then
    apk add --allow-untrusted "/tmp/$name" || { echo "[WARN] BTF 安装失败，请手动执行 apk add /tmp/$name"; return 0; }
  else
    opkg install "/tmp/$name" || { echo "[WARN] BTF 安装失败，请手动执行 opkg install /tmp/$name"; return 0; }
  fi
  rm -f "/tmp/$name"
  kernel_btf_ready && echo "[OK] BTF 已就绪" || echo "[WARN] BTF 装上了但内核没认到，请重启后重试"
}

ensure_btf

echo "[OK] dllkids feed setup completed"
