#!/usr/bin/env bash
# prune-feed.sh
#
# Keep only the newest build of each package / firmware variant on the R2 feed,
# so duplicate versions stop piling up. Operates directly on R2 via rclone — no
# downloads. Run from GitHub Actions (see .github/workflows/prune-feed.yml).
#
# It NEVER touches the package index, and never touches the aggregated
# <sdk>/<arch>/ trees either: those are a mirror of whatever aggregate-feed
# uploads, index included, and rclone sync already drops what is no longer
# there. Only the per-project source feeds and the firmware tree are pruned.
#
# Env:
#   REMOTE  rclone remote+bucket, e.g. r2:dllkids-openwrt-feed   (required)
#   KEEP    newest builds to keep per group          (default 1)
#   DRY     "1" => rclone --dry-run (list only)       (default 1)
#
set -euo pipefail

REMOTE="${REMOTE:?set REMOTE, e.g. r2:dllkids-openwrt-feed}"
KEEP="${KEEP:-1}"
DRY="${DRY:-1}"

# KEEP comes from a manual workflow_dispatch input. awk coerces junk to 0, so
# "abc" or "-1" would put every file of a group on the delete list.
# Fail closed instead of pruning the whole feed.
case "$KEEP" in
  *[!0-9]*) echo "KEEP must be a positive integer, got '$KEEP'" >&2; exit 2 ;;
esac
[ "$KEEP" -ge 1 ] || { echo "KEEP must be >= 1, got '$KEEP'" >&2; exit 2; }

# Sub-paths under the bucket to clean: the firmware tree plus every per-project
# source feed under openwrt-feed/ (anything not named like an SDK release, since
# openwrt-feed/<sdk>/<arch>/ is aggregate-feed's mirror and is off limits).
SUBDIRS=(firmware)
while IFS= read -r d; do
  d="${d%/}"
  [ -n "$d" ] || continue
  case "$d" in [0-9]*) continue ;; esac
  SUBDIRS+=("openwrt-feed/$d")
done < <(rclone lsf --dirs-only "$REMOTE/openwrt-feed/" 2>/dev/null || true)

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
  # directory keep the newest KEEP and list the rest for deletion. Packages rank
  # by version, firmware images by upload time (their MM.DD prefix wraps at new
  # year); KIND says which ranking a row takes.
  awk -F'\t' -v OFS='\t' '
    function key(dir, fn,   a,n,i,k,t) {
      KIND = "pkg"
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
        KIND = "fw"
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
      print KIND, k, mt, sz, p
    }
  ' "$lsf" > "$work/rows"

  { awk -F'\t' '$1 == "pkg"' "$work/rows" | sort -t$'\t' -k2,2 -k5,5V
    awk -F'\t' '$1 == "fw"'  "$work/rows" | sort -t$'\t' -k2,2 -k3,3 -k5,5V
  } \
  | awk -F'\t' -v KEEP="$KEEP" '
      { key[NR] = $2; size[NR] = $4; path[NR] = $5; cnt[$2]++ }
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
    local args=(delete "$base" --files-from-raw "$work/paths" -v)
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
