#!/bin/sh
# Shared DNS helpers for ClashOO runtime generators. Keep POSIX sh compatible.

dns_trim() {
  printf '%s' "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

dns_has_scheme() {
  printf '%s' "$1" | grep -Eq '^[A-Za-z][A-Za-z0-9+.-]*://'
}

dns_norm_protocol() {
  case "$(dns_trim "${1:-}")" in
    ''|'none') printf '' ;;
    udp|'udp://') printf 'udp://' ;;
    tcp|'tcp://') printf 'tcp://' ;;
    dot|tls|'tls://') printf 'tls://' ;;
    doh|https|'https://') printf 'https://' ;;
    doq|quic|'quic://') printf 'quic://' ;;
    *) printf '%s' "$1" ;;
  esac
}

dns_normalize_server() {
  local address protocol port prefix
  address=$(dns_trim "${1:-}")
  protocol=$(dns_trim "${2:-}")
  port=$(dns_trim "${3:-}")

  [ -n "$address" ] || return 0

  if dns_has_scheme "$address"; then
    printf '%s' "$address"
    return 0
  fi

  prefix=$(dns_norm_protocol "$protocol")
  if [ -n "$port" ]; then
    printf '%s%s:%s' "$prefix" "$address" "$port"
  else
    printf '%s%s' "$prefix" "$address"
  fi
}

dns_yaml_sq() {
  printf "%s" "$1" | sed "s/'/''/g"
}

dns_yaml_list_item() {
  local value
  value=$(dns_yaml_sq "$1")
  printf "   - '%s'\n" "$value"
}
