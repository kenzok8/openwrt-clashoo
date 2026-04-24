#!/usr/bin/ucode

'use strict';

import { readfile, writefile } from 'fs';

let path = ARGV[0] || '';
let redir_port = +(ARGV[1] || '7891');
let tproxy_port = +(ARGV[2] || '7982');
let mixed_port = +(ARGV[3] || '7890');
let has_tun_device = (ARGV[4] || '1') == '1';
// 默认 6666 必须与 /usr/share/clashoo/net/fw4.sh:CORE_ROUTING_MARK (0x1a0a) 一致；
// 不能用 354 (=0x162=PROXY_FWMARK)，那个会被 ip rule 吸到 lo 导致出站不可达。
let routing_mark = +(ARGV[5] || '6666');
let dns_port = +(ARGV[6] || '1053');
let dash_port = +(ARGV[7] || '9090');
let dash_secret = ARGV[8] != null ? (ARGV[8] + '') : '';

if (!path) {
	print("missing path\n");
	exit(1);
}

let raw = readfile(path);
if (!raw) {
	print("read failed\n");
	exit(1);
}

let cfg = json(raw);
if (!cfg) {
	print("json parse failed\n");
	exit(1);
}

function s_len(s) {
	return length(s || '');
}

function s_sub(s, start, count) {
	if (count == null)
		return substr(s || '', start);
	return substr(s || '', start, count);
}

function is_space(ch) {
	return ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n';
}

function trim_s(s) {
	s = (s == null) ? '' : (s + '');
	while (s_len(s) > 0 && is_space(s_sub(s, 0, 1)))
		s = s_sub(s, 1);
	while (s_len(s) > 0 && is_space(s_sub(s, s_len(s) - 1, 1)))
		s = s_sub(s, 0, s_len(s) - 1);
	return s;
}

function starts_with(s, prefix) {
	return s_sub(s || '', 0, s_len(prefix)) == prefix;
}

function find_char(s, ch) {
	for (let i = 0; i < s_len(s); i++)
		if (s_sub(s, i, 1) == ch)
			return i;
	return -1;
}

function find_last_char(s, ch) {
	for (let i = s_len(s) - 1; i >= 0; i--)
		if (s_sub(s, i, 1) == ch)
			return i;
	return -1;
}

function split_uci_words(line) {
	let out = [], cur = '', quote = '', esc = false;
	for (let i = 0; i < s_len(line); i++) {
		let ch = s_sub(line, i, 1);
		if (esc) {
			cur += ch;
			esc = false;
			continue;
		}
		if (ch == '\\') {
			esc = true;
			continue;
		}
		if (quote) {
			if (ch == quote)
				quote = '';
			else
				cur += ch;
			continue;
		}
		if (ch == '"' || ch == "'") {
			quote = ch;
			continue;
		}
		if (is_space(ch)) {
			if (s_len(cur) > 0) {
				push(out, cur);
				cur = '';
			}
			continue;
		}
		cur += ch;
	}
	if (s_len(cur) > 0)
		push(out, cur);
	return out;
}

function load_clashoo_uci() {
	let uci_path = ARGV[9] || '/etc/config/clashoo';
	let txt = readfile(uci_path) || '';
	let sections = [], cur = null;
	for (let line in split(txt, '\n')) {
		line = trim_s(line);
		if (!s_len(line) || starts_with(line, '#'))
			continue;
		let words = split_uci_words(line);
		if (!length(words))
			continue;
		if (words[0] == 'config') {
			cur = { type: words[1] || '', name: words[2] || '', options: {}, lists: {} };
			push(sections, cur);
			continue;
		}
		if (!cur || length(words) < 3)
			continue;
		if (words[0] == 'option')
			cur.options[words[1]] = words[2];
		else if (words[0] == 'list') {
			if (cur.lists[words[1]] == null)
				cur.lists[words[1]] = [];
			push(cur.lists[words[1]], words[2]);
		}
	}
	return sections;
}

let clashoo_uci = load_clashoo_uci();

function uci_config_section() {
	for (let s in clashoo_uci)
		if (s.type == 'clashoo' && (s.name == 'config' || s.name == ''))
			return s;
	return {};
}

let uci_cfg = uci_config_section();

function uci_opt(key, def) {
	if (uci_cfg.options && uci_cfg.options[key] != null)
		return uci_cfg.options[key];
	return def;
}

function uci_list(key) {
	if (uci_cfg.lists && uci_cfg.lists[key] != null)
		return uci_cfg.lists[key];
	if (uci_cfg.options && uci_cfg.options[key] != null)
		return [ uci_cfg.options[key] ];
	return [];
}

function uci_sections(type_name) {
	let out = [];
	for (let s in clashoo_uci)
		if (s.type == type_name)
			push(out, s);
	return out;
}

function opt_bool(v, def) {
	if (v == null || v == '')
		return def;
	return v === true || v == '1' || v == 'true' || v == 'yes' || v == 'on';
}

function normalize_dns_uri(address, protocol, port) {
	address = trim_s(address || '');
	protocol = trim_s(protocol || '');
	port = trim_s(port || '');
	if (!s_len(address))
		return '';
	if (find_char(address, ':') >= 0 && find_char(address, '/') >= 0)
		return address;
	if (protocol == 'none')
		protocol = '';
	if (protocol == 'dot')
		protocol = 'tls://';
	else if (protocol == 'doh')
		protocol = 'https://';
	else if (protocol == 'doq')
		protocol = 'quic://';
	if (s_len(protocol) && !starts_with(protocol, 'udp://') && !starts_with(protocol, 'tcp://') &&
	    !starts_with(protocol, 'tls://') && !starts_with(protocol, 'https://') && !starts_with(protocol, 'quic://'))
		protocol += '://';
	return protocol + address + (s_len(port) ? ':' + port : '');
}

function dns_server_obj(uri, tag, fallback_type) {
	uri = normalize_dns_uri(uri || '', '', '');
	if (!s_len(uri))
		return null;
	let scheme = fallback_type || 'udp';
	let rest = uri;
	let p = -1;
	for (let i = 0; i < s_len(uri) - 2; i++) {
		if (s_sub(uri, i, 3) == '://') {
			p = i;
			break;
		}
	}
	if (p >= 0) {
		scheme = s_sub(uri, 0, p);
		rest = s_sub(uri, p + 3);
	}
	if (scheme == 'dot')
		scheme = 'tls';
	else if (scheme == 'doh')
		scheme = 'https';
	else if (scheme == 'doq')
		scheme = 'quic';

	let path = '';
	let slash = find_char(rest, '/');
	if (slash >= 0) {
		path = s_sub(rest, slash);
		rest = s_sub(rest, 0, slash);
	}

	let server = rest, server_port = null;
	let colon = find_last_char(rest, ':');
	if (colon > 0 && find_char(rest, ']') < 0) {
		server = s_sub(rest, 0, colon);
		let n = +(s_sub(rest, colon + 1));
		if (n === n)
			server_port = n;
	}

	let obj = { type: scheme, tag: tag, server: server };
	if (server_port != null)
		obj.server_port = server_port;
	if (path && (scheme == 'https' || scheme == 'h3'))
		obj.path = path;
	if ((scheme == 'https' || scheme == 'tls' || scheme == 'quic') && tag != 'dns_resolver')
		obj.domain_resolver = 'dns_resolver';
	return obj;
}

function dns_servers_by_role(role) {
	let out = [];
	for (let s in uci_sections('dnsservers')) {
		if (!opt_bool(s.options.enabled, true))
			continue;
		if ((s.options.ser_type || 'nameserver') != role)
			continue;
		let uri = normalize_dns_uri(s.options.ser_address || '', s.options.protocol || '', s.options.ser_port || '');
		if (s_len(uri))
			push(out, uri);
	}
	return out;
}

function first_or(arr, fallback) {
	return length(arr) ? arr[0] : fallback;
}

function matcher_rule(matcher, server_tag) {
	let r = { server: server_tag, action: 'route' };
	if (starts_with(matcher, 'geosite:'))
		r.rule_set = s_sub(matcher, 8);
	else if (starts_with(matcher, 'rule_set:'))
		r.rule_set = s_sub(matcher, 9);
	else if (starts_with(matcher, 'domain:'))
		r.domain = s_sub(matcher, 7);
	else if (starts_with(matcher, 'domain-suffix:'))
		r.domain_suffix = s_sub(matcher, 14);
	else
		r.domain_suffix = matcher;
	return r;
}

function apply_dns_from_uci() {
	cfg.dns = cfg.dns || {};
	let bootstrap = uci_list('default_nameserver');
	if (!length(bootstrap))
		bootstrap = uci_list('defaul_nameserver');
	let resolver_uri = first_or(bootstrap, '223.5.5.5');
	let direct_uri = first_or(dns_servers_by_role('direct-nameserver'), first_or(dns_servers_by_role('nameserver'), 'https://doh.pub/dns-query'));
	let proxy_uri = first_or(dns_servers_by_role('proxy-server-nameserver'), first_or(dns_servers_by_role('fallback'), 'tls://1.1.1.1:853'));

	let servers = [];
	push(servers, dns_server_obj(resolver_uri, 'dns_resolver', 'udp'));
	push(servers, dns_server_obj(direct_uri, 'dns_direct', 'udp'));
	push(servers, dns_server_obj(proxy_uri, 'dns_proxy', 'tls'));

	let enhanced = uci_opt('enhanced_mode', 'fake-ip');
	if (enhanced == 'fake-ip') {
		let fake_range = uci_opt('fake_ip_range', '198.18.0.1/16');
		push(servers, {
			type: 'fakeip',
			tag: 'dns_fakeip',
			inet4_range: fake_range || '198.18.0.1/16',
			inet6_range: 'fc00::/18'
		});
	}

	let rules = [];
	let policy_idx = 1;
	for (let s in uci_sections('dns_policy')) {
		if (!opt_bool(s.options.enabled, true))
			continue;
		let matcher = trim_s(s.options.matcher || '');
		if (!s_len(matcher))
			continue;
		let list = s.lists.nameserver || [];
		if (!length(list) && s.options.nameserver)
			list = [ s.options.nameserver ];
		if (!length(list))
			continue;
		let tag = 'dns_policy_' + policy_idx++;
		push(servers, dns_server_obj(list[0], tag, 'udp'));
		push(rules, matcher_rule(matcher, tag));
	}
	if (enhanced == 'fake-ip') {
		push(rules, {
			rule_set: 'geolocation-!cn',
			query_type: [ 'A', 'AAAA' ],
			server: 'dns_fakeip',
			action: 'route'
		});
		push(rules, {
			rule_set: 'geolocation-!cn',
			query_type: 'CNAME',
			server: 'dns_proxy',
			action: 'route'
		});
	}

	let clean_servers = [];
	for (let s in servers)
		if (s)
			push(clean_servers, s);
	cfg.dns.servers = clean_servers;
	cfg.dns.rules = rules;
	cfg.dns.final = 'dns_direct';

	let ecs = trim_s(uci_opt('dns_ecs', ''));
	if (s_len(ecs))
		cfg.dns.client_subnet = ecs;
	else
		delete cfg.dns.client_subnet;

	if (opt_bool(uci_opt('singbox_independent_cache', '0'), false))
		cfg.dns.independent_cache = true;
	else
		delete cfg.dns.independent_cache;

	cfg.route = cfg.route || {};
	cfg.route.default_domain_resolver = 'dns_resolver';
}

let inbounds = cfg.inbounds || [];
let normalized = [];
let has_redirect = false;
let has_tproxy = false;
let has_mixed = false;
let has_tun = false;
let has_dns_in = false;

for (let ib in inbounds) {
	if (!ib)
		continue;

	if (ib.type == 'tun' || ib.tag == 'tun-in') {
		/* Keep tun inbound only when tun device exists. */
		if (has_tun_device && !has_tun) {
			ib.type = 'tun';
			ib.tag = ib.tag || 'tun-in';
			push(normalized, ib);
			has_tun = true;
		}
		continue;
	}

	if (ib.tag == 'redirect-in' || ib.type == 'redirect') {
		if (has_redirect)
			continue;
		ib.type = 'redirect';
		ib.tag = 'redirect-in';
		ib.listen = '0.0.0.0';
		ib.listen_port = redir_port;
		has_redirect = true;
		push(normalized, ib);
		continue;
	}

	if (ib.tag == 'tproxy-in' || ib.type == 'tproxy') {
		if (has_tproxy)
			continue;
		ib.type = 'tproxy';
		ib.tag = 'tproxy-in';
		ib.listen = '0.0.0.0';
		ib.listen_port = tproxy_port;
		ib.network = 'udp';
		has_tproxy = true;
		push(normalized, ib);
		continue;
	}

	if (ib.tag == 'mixed-in' || ib.type == 'mixed') {
		if (has_mixed)
			continue;
		ib.type = 'mixed';
		ib.tag = 'mixed-in';
		ib.listen = '0.0.0.0';
		ib.listen_port = mixed_port;
		has_mixed = true;
		push(normalized, ib);
		continue;
	}

	if (ib.tag == 'dns-in') {
		if (has_dns_in)
			continue;
		ib.type = 'direct';
		ib.tag = 'dns-in';
		ib.listen = '0.0.0.0';
		ib.listen_port = dns_port;
		has_dns_in = true;
		push(normalized, ib);
		continue;
	}

	push(normalized, ib);
}

if (!has_redirect) {
	push(normalized, {
		type: 'redirect',
		tag: 'redirect-in',
		listen: '0.0.0.0',
		listen_port: redir_port
	});
}

if (!has_mixed) {
	push(normalized, {
		type: 'mixed',
		tag: 'mixed-in',
		listen: '0.0.0.0',
		listen_port: mixed_port
	});
}

if (!has_tproxy) {
	push(normalized, {
		type: 'tproxy',
		tag: 'tproxy-in',
		listen: '0.0.0.0',
		listen_port: tproxy_port,
		network: 'udp'
	});
}

if (!has_dns_in) {
	push(normalized, {
		type: 'direct',
		tag: 'dns-in',
		listen: '0.0.0.0',
		listen_port: dns_port
	});
}

cfg.inbounds = normalized;

for (let ob in (cfg.outbounds || [])) {
	if (!ob || type(ob) != 'object')
		continue;

	let t = ob.type || '';
	if (t == 'selector' || t == 'urltest' || t == 'fallback' || t == 'load_balance' || t == 'dns' || t == 'block')
		continue;

	if (ob.routing_mark == null)
		ob.routing_mark = routing_mark;
}

cfg.route = cfg.route || {};
cfg.route.rules = cfg.route.rules || [];
let has_dns_hijack = false;
for (let rule in cfg.route.rules) {
	if (!rule || type(rule) != 'object')
		continue;
	if (rule.inbound == 'dns-in' && rule.action == 'hijack-dns') {
		has_dns_hijack = true;
		break;
	}
}
if (!has_dns_hijack) {
	unshift(cfg.route.rules, {
		inbound: 'dns-in',
		action: 'hijack-dns'
	});
}
cfg.route.auto_detect_interface = true;
apply_dns_from_uci();

cfg.experimental = cfg.experimental || {};
cfg.experimental.clash_api = cfg.experimental.clash_api || {};
cfg.experimental.clash_api.external_controller = '0.0.0.0:' + dash_port;
cfg.experimental.clash_api.external_ui = '/etc/clashoo/dashboard';
cfg.experimental.clash_api.secret = dash_secret;

if (writefile(path, sprintf('%J', cfg)) === null) {
	print("write failed\n");
	exit(1);
}

print("normalized\n");
