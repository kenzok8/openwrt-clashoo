#!/usr/bin/env bash
# prune-feed.sh
#
# Keep only the newest build of each package / firmware variant on the R2 feed,
# so duplicate versions stop piling up. Operates directly on R2 via rclone — no
# downloads. Run from GitHub Actions (see .github/workflows/prune-feed.yml).
#
# It NEVER touches the package index. The signed Packages/Packages.gz/Packages.sig
# is rebuilt + re-signed by the daily aggregate-feed workflow (the usign key lives
# in GH Secrets). This prune runs just before that, so a trimmed index self-heals
# the same day.
#
# Env:
#   REMOTE  rclone remote+bucket, e.g. r2:dllkids-openwrt-feed   (required)
#   KEEP    newest builds to keep per group          (default 1)
#   DRY     "1" => rclone --dry-run (list only)       (default 1)
#
set -euo pipefail

REMOTE="${REMOTE:?set REMOTE, e.g. b2:bucket}"
KEEP="${KEEP:-1}"
DRY="${DRY:-1}"

# Sub-paths under the bucket to clean.
SUBDIRS=(openwrt-feed firmware)

total_files=0
total_bytes=0

prune_one() {
  local sub="$1" base="$REMOTE/$1"
  local work; work="$(mktemp -d)"
  local lsf="$work/lsf" del="$work/del"

  echo "::group::scan $base"
  if ! rclone lsf -R --files-only --format "tsp" --separator $'\t' "$base" > "$lsf" 2> "$work/err"; then
    echo "skip $base (not reachable):"; cat "$work/err"; echo "::endgroup::"; rm -rf "$work"; return 0
  fi

  # Compute a version/date-agnostic group key per file, then within each
  # directory keep the newest KEEP and list the rest for deletion.
  awk -F'\t' -v OFS='\t' '
    function key(dir, fn,   a,n,i,k,t) {
      # ipk:  name_version_arch.ipk  ->  drop the version (2nd "_" field).
      # pkg name and version never contain "_"; arch may, so rejoin 3..NF.
      if (fn ~ /\.ipk$/) {
        n = split(fn, a, "_")
        if (n >= 3) { k = a[1]; for (i = 3; i <= n; i++) k = k "_" a[i]; return dir SUBSEP k }
        return dir SUBSEP fn
      }
      # apk:  name-version[-rRELEASE].apk  ->  strip ".apk", optional "-rN", then "-version".
      # apk version cannot contain "-"; name can. Works for both naming styles:
      #   clashoo-2026.06.03~316f5df-r1.apk        -> clashoo
      #   luci-app-adguardhome-27.147.35947~a57e622.apk -> luci-app-adguardhome
      if (fn ~ /\.apk$/) {
        t = fn
        sub(/\.apk$/, "", t)
        sub(/-r[0-9]+$/, "", t)
        sub(/-[^-]+$/, "", t)
        return dir SUBSEP t
      }
      # firmware image:  MM.DD-...  or  YYYYMMDD-...  ->  strip the leading date.
      if (fn ~ /\.img\.gz$/ || fn ~ /\.img$/ || fn ~ /\.bin$/) {
        t = fn
        sub(/^[0-9][0-9]\.[0-9][0-9]-/, "", t)
        sub(/^[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-/, "", t)
        return dir SUBSEP t
      }
      return ""   # configs, version.txt, Packages*, *.sig, *.pub, APKINDEX*, *.adb -> never prunable
    }
    {
      mt = $1; sz = $2; p = $3
      n = split(p, seg, "/"); fn = seg[n]
      dir = ""; for (i = 1; i < n; i++) dir = dir seg[i] "/"
      k = key(dir, fn); if (k == "") next
      print k, mt, sz, p
    }
  ' "$lsf" \
  | sort -t$'\t' -k1,1 -k2,2 -k4,4V \
  | awk -F'\t' -v KEEP="$KEEP" '
      { key[NR] = $1; size[NR] = $3; path[NR] = $4; cnt[$1]++ }
      END {
        for (i = 1; i <= NR; i++) {
          seen[key[i]]++
          if (seen[key[i]] <= cnt[key[i]] - KEEP) print size[i] "\t" path[i]
        }
      }
    ' > "$del"

  local files bytes
  files=$(wc -l < "$del" | tr -d ' ')
  bytes=$(awk -F'\t' '{ s += $1 } END { printf "%.0f", s + 0 }' "$del")
  echo "to-delete under $base: $files file(s), $(numfmt --to=iec --suffix=B "${bytes:-0}" 2>/dev/null || echo "${bytes}B")"
  cut -f2 "$del" | sed 's/^/  DEL /'

  if [[ "$files" -gt 0 ]]; then
    cut -f2 "$del" > "$work/paths"
    local args=(delete "$base" --files-from-raw "$work/paths" --b2-hard-delete -v)
    [[ "$DRY" == "1" ]] && args+=(--dry-run)
    rclone "${args[@]}"
  fi

  total_files=$((total_files + files))
  total_bytes=$((total_bytes + bytes))
  echo "::endgroup::"
  rm -rf "$work"
}

echo "REMOTE=$REMOTE KEEP=$KEEP DRY=$DRY"
for s in "${SUBDIRS[@]}"; do prune_one "$s"; done

mode=$([[ "$DRY" == "1" ]] && echo "WOULD-DELETE (dry-run)" || echo "DELETED")
echo "==== $mode total: $total_files file(s), $(numfmt --to=iec --suffix=B "${total_bytes:-0}" 2>/dev/null || echo "${total_bytes}B") ===="
