#!/bin/sh

set -eu

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <tag> [core-dir]"
  echo "Example: $0 v1.19.22 ./core/mihomo"
  exit 1
fi

TAG="$1"
CORE_DIR="${2:-./core/mihomo}"

BASE_URL="https://github.com/MetaCubeX/mihomo/releases/download/${TAG}"

# openwrt_arch:mihomo_asset_arch
MATRIX="
x86_64:linux-amd64
aarch64_generic:linux-arm64
aarch64_cortex-a53:linux-arm64
aarch64_cortex-a72:linux-arm64
aarch64_cortex-a76:linux-arm64
arm_cortex-a7_neon-vfpv4:linux-armv7
arm_cortex-a9:linux-armv7
arm_cortex-a9_neon:linux-armv7
arm_cortex-a9_vfpv3-d16:linux-armv7
mipsel_24kc:linux-mipsle-softfloat
mips_24kc:linux-mips-softfloat
riscv64:linux-riscv64
i386_pentium4:linux-386
"

mkdir -p "$CORE_DIR"

echo "$MATRIX" | while IFS=: read -r OWRT_ARCH MIHOMO_ARCH; do
  [ -n "$OWRT_ARCH" ] || continue
  OUT_DIR="${CORE_DIR}/${OWRT_ARCH}"
  OUT_BIN="${OUT_DIR}/mihomo"
  TMP_GZ="${OUT_DIR}/mihomo.gz"
  URL="${BASE_URL}/mihomo-${MIHOMO_ARCH}-${TAG}.gz"

  mkdir -p "$OUT_DIR"
  echo "Fetching $OWRT_ARCH from $URL"

  if ! curl -fL --connect-timeout 15 --max-time 180 "$URL" -o "$TMP_GZ"; then
    echo "WARN: failed $OWRT_ARCH"
    rm -f "$TMP_GZ"
    continue
  fi

  if ! gunzip -f "$TMP_GZ"; then
    echo "WARN: gunzip failed $OWRT_ARCH"
    rm -f "$TMP_GZ"
    continue
  fi

  chmod 0755 "$OUT_BIN"
  echo "OK: $OUT_BIN"
done

echo "Done. Core binaries stored under: $CORE_DIR"
