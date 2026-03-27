#!/bin/sh

set -eu

NFT_DIR="/var/run/clash"
SETS_RULES="${NFT_DIR}/fw4_sets.nft"
DSTNAT_RULES="${NFT_DIR}/fw4_dstnat.nft"
MANGLE_RULES="${NFT_DIR}/fw4_mangle.nft"
OUTPUT_RULES="${NFT_DIR}/fw4_output.nft"
LOCAL_OUTPUT_TABLE="clash_local"
PROXY_FWMARK="0x162"
PROXY_ROUTE_TABLE="0x162"

uci_get() {
	uci -q get "$1" 2>/dev/null || true
}

bool_enabled() {
	case "$1" in
		1|true|TRUE|yes|on) return 0 ;;
		*) return 1 ;;
	esac
}

config_redir_port() {
	uci_get clash.config.redir_port
}

config_enable_udp() {
	uci_get clash.config.enable_udp
}

config_access_control() {
	uci_get clash.config.access_control
}

config_fake_ip_range() {
	local value
	value="$(uci_get clash.config.fake_ip_range)"
	[ -n "$value" ] && {
		printf '%s\n' "$value"
		return
	}
	printf '198.18.0.1/16\n'
}

uci_list() {
	local key="$1"
	uci -q show "$key" 2>/dev/null | sed -n "s/^${key}=//p" | sed "s/'//g"
}

ensure_firewall_include() {
	local name="$1"
	local path="$2"
	local chain="${3:-}"
	local position="${4:-chain-pre}"

	uci -q batch <<-EOF >/dev/null
		set firewall.${name}=include
		set firewall.${name}.type='nftables'
		set firewall.${name}.path='${path}'
		set firewall.${name}.position='${position}'
		$( [ -n "$chain" ] && printf "set firewall.%s.chain='%s'\n" "$name" "$chain" )
		commit firewall
EOF
}

remove_firewall_include() {
	local name="$1"
	uci -q delete firewall."${name}" >/dev/null 2>&1 || true
}

render_common_returns() {
	cat <<'EOF'
meta nfproto ipv4 ip daddr { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4, 240.0.0.0/4 } return
meta nfproto ipv6 ip6 daddr { ::1/128, fc00::/7, fe80::/10, ff00::/8 } return
EOF
}

render_ip_elements() {
	local list="$1"
	local first=1 entry
	for entry in $list; do
		if [ "$first" -eq 0 ]; then
			printf ', '
		fi
		printf '%s' "$entry"
		first=0
	done
}

render_china_elements() {
	awk '!/^$/&&!/^#/{printf sep $0; sep=", "}' /usr/share/clash/china_ip.txt 2>/dev/null
}

apply_local_output_rule() {
	local redir_port fake_ip_range
	redir_port="$(config_redir_port)"
	fake_ip_range="$(config_fake_ip_range)"

	nft delete table ip ${LOCAL_OUTPUT_TABLE} >/dev/null 2>&1 || true
	nft -f - <<EOF
table ip ${LOCAL_OUTPUT_TABLE} {
	chain output {
		type nat hook output priority dstnat; policy accept;
		ip daddr ${fake_ip_range} tcp dport != 53 redirect to :${redir_port}
	}
}
EOF
}

remove_local_output_rule() {
	nft delete table ip ${LOCAL_OUTPUT_TABLE} >/dev/null 2>&1 || true
}

generate_rules() {
	local redir_port enable_udp access_control fake_ip_range proxy_lan_ips reject_lan_ips
	redir_port="$(config_redir_port)"
	enable_udp="$(config_enable_udp)"
	access_control="$(config_access_control)"
	fake_ip_range="$(config_fake_ip_range)"
	proxy_lan_ips="$(uci_list clash.config.proxy_lan_ips)"
	reject_lan_ips="$(uci_list clash.config.reject_lan_ips)"

	mkdir -p "$NFT_DIR"

	cat > "$SETS_RULES" <<EOF
set clash_localnetwork {
	type ipv4_addr;
	flags interval;
	auto-merge;
	elements = { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4, 240.0.0.0/4 }
}

set clash_china {
	type ipv4_addr;
	flags interval;
	auto-merge;
	elements = { $(render_china_elements) }
}

set clash_proxy_lan {
	type ipv4_addr;
	flags interval;
	auto-merge;
	elements = { $(render_ip_elements "$proxy_lan_ips") }
}

set clash_reject_lan {
	type ipv4_addr;
	flags interval;
	auto-merge;
	elements = { $(render_ip_elements "$reject_lan_ips") }
}
EOF

	: > "$OUTPUT_RULES"

	cat > "$DSTNAT_RULES" <<EOF
ip daddr @clash_localnetwork return
ip daddr @clash_china return
$( [ "$access_control" = "1" ] && printf '%s\n' 'ip saddr != @clash_proxy_lan return' )
$( [ "$access_control" = "2" ] && printf '%s\n' 'ip saddr @clash_reject_lan return' )
meta l4proto tcp redirect to :${redir_port}
EOF

	if bool_enabled "$enable_udp"; then
		cat > "$MANGLE_RULES" <<EOF
ip daddr @clash_localnetwork return
ip daddr @clash_china return
$( [ "$access_control" = "1" ] && printf '%s\n' 'ip saddr != @clash_proxy_lan return' )
$( [ "$access_control" = "2" ] && printf '%s\n' 'ip saddr @clash_reject_lan return' )
meta l4proto udp tproxy to :${redir_port} meta mark set ${PROXY_FWMARK} accept
EOF
	else
		: > "$MANGLE_RULES"
	fi
}

apply_rules() {
	generate_rules
	ensure_firewall_include clash_fw4_sets "$SETS_RULES" '' table-pre
	ensure_firewall_include clash_fw4_dstnat "$DSTNAT_RULES" dstnat
	remove_firewall_include clash_fw4_output
	if [ -s "$MANGLE_RULES" ]; then
		ensure_firewall_include clash_fw4_mangle "$MANGLE_RULES" mangle_prerouting
		ip rule add fwmark "$PROXY_FWMARK" table "$PROXY_ROUTE_TABLE" >/dev/null 2>&1 || true
		ip route add local 0.0.0.0/0 dev lo table "$PROXY_ROUTE_TABLE" >/dev/null 2>&1 || true
	else
		remove_firewall_include clash_fw4_mangle
	fi
	/etc/init.d/firewall restart >/dev/null 2>&1 || /etc/init.d/firewall reload >/dev/null 2>&1 || true
	apply_local_output_rule
}

remove_rules() {
	remove_local_output_rule
	remove_firewall_include clash_fw4_sets
	remove_firewall_include clash_fw4_dstnat
	remove_firewall_include clash_fw4_output
	remove_firewall_include clash_fw4_mangle
	uci commit firewall >/dev/null 2>&1 || true
	rm -f "$SETS_RULES" "$DSTNAT_RULES" "$OUTPUT_RULES" "$MANGLE_RULES"
	ip rule del fwmark "$PROXY_FWMARK" table "$PROXY_ROUTE_TABLE" >/dev/null 2>&1 || true
	ip route del local 0.0.0.0/0 dev lo table "$PROXY_ROUTE_TABLE" >/dev/null 2>&1 || true
	/etc/init.d/firewall restart >/dev/null 2>&1 || /etc/init.d/firewall reload >/dev/null 2>&1 || true
}

case "${1:-}" in
	apply)
		apply_rules
		;;
	remove)
		remove_rules
		;;
	*)
		echo "Usage: $0 {apply|remove}" >&2
		exit 1
		;;
esac
