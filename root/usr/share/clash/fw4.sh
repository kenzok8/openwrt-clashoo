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

config_tproxy_port() {
	local port
	port="$(uci_get clash.config.tproxy_port)"
	if [ -n "$port" ]; then
		printf '%s\n' "$port"
	else
		config_redir_port
	fi
}

config_tcp_mode() {
	uci_get clash.config.tcp_mode
}

config_udp_mode() {
	uci_get clash.config.udp_mode
}

config_access_control() {
	uci_get clash.config.access_control
}

config_bypass_china() {
	uci_get clash.config.bypass_china
}

config_proxy_tcp_dport() {
	uci_get clash.config.proxy_tcp_dport
}

config_proxy_udp_dport() {
	uci_get clash.config.proxy_udp_dport
}

config_bypass_dscp() {
	uci_list clash.config.bypass_dscp
}

config_bypass_fwmark() {
	uci_list clash.config.bypass_fwmark
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

render_china6_elements() {
	awk '!/^$/&&!/^#/{printf sep $0; sep=", "}' /usr/share/clash/china_ipv6.txt 2>/dev/null
}

render_token_elements() {
	printf '%s\n' "$1" | tr ',\t' '  ' | awk '
		BEGIN { first = 1 }
		{
			for (i = 1; i <= NF; i++) {
				if ($i == "")
					continue
				if (!first)
					printf ", "
				printf "%s", $i
				first = 0
			}
		}'
}

render_port_match() {
	local proto="$1"
	local ports="$2"
	local port_elements

	port_elements="$(render_token_elements "$ports")"
	if [ -n "$port_elements" ]; then
		printf 'meta l4proto %s %s dport { %s }' "$proto" "$proto" "$port_elements"
	else
		printf 'meta l4proto %s' "$proto"
	fi
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
	local redir_port tproxy_port tcp_mode udp_mode access_control fake_ip_range proxy_lan_ips reject_lan_ips
	local proxy_tcp_dport proxy_udp_dport bypass_dscp bypass_fwmark
	redir_port="$(config_redir_port)"
	tproxy_port="$(config_tproxy_port)"
	tcp_mode="$(config_tcp_mode)"
	udp_mode="$(config_udp_mode)"
	access_control="$(config_access_control)"
	bypass_china="$(config_bypass_china)"
	proxy_tcp_dport="$(config_proxy_tcp_dport)"
	proxy_udp_dport="$(config_proxy_udp_dport)"
	bypass_dscp="$(config_bypass_dscp)"
	bypass_fwmark="$(config_bypass_fwmark)"
	fake_ip_range="$(config_fake_ip_range)"
	proxy_lan_ips="$(uci_list clash.config.proxy_lan_ips)"
	reject_lan_ips="$(uci_list clash.config.reject_lan_ips)"

	mkdir -p "$NFT_DIR"

	# Build optional elements lines (nftables rejects empty elements = {})
	local china_elements china6_elements proxy_elements reject_elements dscp_elements fwmark_elements
	china_elements="$(render_china_elements)"
	china6_elements="$(render_china6_elements)"
	proxy_elements="$(render_ip_elements "$proxy_lan_ips")"
	reject_elements="$(render_ip_elements "$reject_lan_ips")"
	dscp_elements="$(render_token_elements "$bypass_dscp")"
	fwmark_elements="$(render_token_elements "$bypass_fwmark")"

	{
		printf 'set clash_localnetwork {\n\ttype ipv4_addr;\n\tflags interval;\n\tauto-merge;\n'
		printf '\telements = { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4, 240.0.0.0/4 }\n}\n\n'

		printf 'set clash_china {\n\ttype ipv4_addr;\n\tflags interval;\n\tauto-merge;\n'
		[ -n "$china_elements" ] && printf '\telements = { %s }\n' "$china_elements"
		printf '}\n\n'

		printf 'set clash_china6 {\n\ttype ipv6_addr;\n\tflags interval;\n\tauto-merge;\n'
		[ -n "$china6_elements" ] && printf '\telements = { %s }\n' "$china6_elements"
		printf '}\n\n'

		printf 'set clash_proxy_lan {\n\ttype ipv4_addr;\n\tflags interval;\n\tauto-merge;\n'
		[ -n "$proxy_elements" ] && printf '\telements = { %s }\n' "$proxy_elements"
		printf '}\n\n'

		printf 'set clash_reject_lan {\n\ttype ipv4_addr;\n\tflags interval;\n\tauto-merge;\n'
		[ -n "$reject_elements" ] && printf '\telements = { %s }\n' "$reject_elements"
		printf '}\n'
	} > "$SETS_RULES"

	: > "$OUTPUT_RULES"

	# TCP rules: redirect or tproxy (tun mode needs no nftables rule)
	case "$tcp_mode" in
		redirect)
			tcp_match="$(render_port_match tcp "$proxy_tcp_dport")"
			cat > "$DSTNAT_RULES" <<EOF
ip daddr @clash_localnetwork return
$( bool_enabled "$bypass_china" && printf '%s\n' 'ip6 daddr @clash_china6 return' )
$( bool_enabled "$bypass_china" && printf '%s\n' 'ip daddr @clash_china return' )
$( [ "$access_control" = "1" ] && printf '%s\n' 'ip saddr != @clash_proxy_lan return' )
$( [ "$access_control" = "2" ] && printf '%s\n' 'ip saddr @clash_reject_lan return' )
$( [ -n "$dscp_elements" ] && printf '%s\n' "ip dscp { ${dscp_elements} } return" )
$( [ -n "$dscp_elements" ] && printf '%s\n' "ip6 dscp { ${dscp_elements} } return" )
$( [ -n "$fwmark_elements" ] && printf '%s\n' "meta mark { ${fwmark_elements} } return" )
${tcp_match} redirect to :${redir_port}
EOF
			;;
		tproxy)
			: > "$DSTNAT_RULES"
			;;
		*)
			# tun or unset: no TCP nftables rules
			: > "$DSTNAT_RULES"
			;;
	esac

	# UDP rules: tproxy via mangle (tun mode needs no nftables rule)
	# Also handle TCP tproxy mode here (both TCP+UDP in mangle)
	local need_mangle=0
	[ "$tcp_mode" = "tproxy" ] && need_mangle=1
	[ "$udp_mode" = "tproxy" ] && need_mangle=1

	if [ "$need_mangle" -eq 1 ]; then
		tcp_match="$(render_port_match tcp "$proxy_tcp_dport")"
		udp_match="$(render_port_match udp "$proxy_udp_dport")"
		{
			printf 'ip daddr @clash_localnetwork return\n'
			bool_enabled "$bypass_china" && printf 'meta nfproto ipv6 ip6 daddr @clash_china6 return\n'
			bool_enabled "$bypass_china" && printf 'ip daddr @clash_china return\n'
			[ "$access_control" = "1" ] && printf 'ip saddr != @clash_proxy_lan return\n'
			[ "$access_control" = "2" ] && printf 'ip saddr @clash_reject_lan return\n'
			[ -n "$dscp_elements" ] && printf 'ip dscp { %s } return\n' "$dscp_elements"
			[ -n "$dscp_elements" ] && printf 'ip6 dscp { %s } return\n' "$dscp_elements"
			[ -n "$fwmark_elements" ] && printf 'meta mark { %s } return\n' "$fwmark_elements"
			[ "$tcp_mode" = "tproxy" ] && printf '%s tproxy to :%s meta mark set %s accept\n' "$tcp_match" "$tproxy_port" "$PROXY_FWMARK"
			[ "$udp_mode" = "tproxy" ] && printf '%s tproxy to :%s meta mark set %s accept\n' "$udp_match" "$tproxy_port" "$PROXY_FWMARK"
		} > "$MANGLE_RULES"
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
