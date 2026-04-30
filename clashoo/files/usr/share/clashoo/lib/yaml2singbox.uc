#!/usr/bin/ucode
/*
 * yaml2singbox.uc — 把 mihomo (clash) YAML 订阅的 proxies 数组转换为 sing-box 的 outbounds
 *
 * 用法:  ucode yaml2singbox.uc <yaml-in> [template-json] [json-out]
 *   yaml-in        必填，clash/mihomo 订阅 yaml 文件路径
 *   template-json  可选，sing-box 模板路径，默认 /usr/share/clashoo/lib/templates/default.json
 *   json-out       可选，输出 json 路径，默认 stdout
 *
 * 设计:
 *   - 依赖 yq (mikefarah) 读 yaml → json（与 template_merge.sh 一致的技术栈）
 *   - 支持协议: shadowsocks, vmess, vless, trojan, hysteria2, tuic。其余协议跳过并告警
 *   - 模板里 "🚀 节点选择".outbounds 若包含字符串 "__NODES__"，会被展开为全部节点 tag
 *   - 日志走 stderr，JSON 输出走 stdout 或 json-out
 */

'use strict';

import { readfile, writefile, popen } from 'fs';

const TPL_DEFAULT = '/usr/share/clashoo/lib/templates/default.json';
const SUPPORTED = {
	'ss':         'shadowsocks',
	'shadowsocks':'shadowsocks',
	'vmess':      'vmess',
	'vless':      'vless',
	'trojan':     'trojan',
	'hysteria2':  'hysteria2',
	'hy2':        'hysteria2',
	'tuic':       'tuic'
};

function logerr(msg) {
	warn(sprintf("[yaml2singbox] %s\n", msg));
}

function die(msg, code) {
	logerr(msg);
	exit(code || 1);
}

/* ---------- YAML 读取（通过 yq） ---------- */
function quote_sh(s) {
	/* single-quote for shell; escape embedded quotes */
	return "'" + replace(s, "'", "'\\''") + "'";
}

function read_yaml_as_json(path) {
	const cmd = sprintf("yq -o=json eval . %s 2>/dev/null", quote_sh(path));
	const h = popen(cmd, "r");
	if (!h)
		die(sprintf("popen failed: %s", cmd));
	let buf = "", chunk;
	while ((chunk = h.read(65536)))
		buf += chunk;
	h.close();
	if (!length(buf))
		die(sprintf("yq returned empty for %s (yaml loadable?)", path));
	const data = json(buf);
	if (data === null)
		die("json parse of yq output failed");
	return data;
}

/* ---------- 小工具 ---------- */
function pick(obj, ...keys) {
	for (let k in keys)
		if (obj[k] != null)
			return obj[k];
	return null;
}

function tobool(v) {
	if (v === true || v === 'true' || v === 1 || v === '1') return true;
	if (v === false || v === 'false' || v === 0 || v === '0') return false;
	return null;
}

function toint(v) {
	if (v == null) return null;
	let n = +v;
	return (n === n) ? n : null;  /* NaN check */
}

function strip_null(obj) {
	if (type(obj) !== 'object') return obj;
	const out = {};
	for (let k in obj) {
		const v = obj[k];
		if (v == null) continue;
		if (type(v) === 'object') {
			const sv = strip_null(v);
			if (length(sv) > 0) out[k] = sv;
		} else if (type(v) === 'array') {
			const arr = map(v, (x) => (type(x) === 'object') ? strip_null(x) : x);
			if (length(arr) > 0) out[k] = arr;
		} else {
			out[k] = v;
		}
	}
	return out;
}

/* ---------- TLS 块组装（通用） ---------- */
function build_tls(p) {
	const enabled = tobool(p.tls) || (p.sni && length(p.sni) > 0) || (p.servername && length(p.servername) > 0);
	if (!enabled) return null;
	const tls = {
		enabled: true,
		server_name: pick(p, 'sni', 'servername'),
		insecure: tobool(p['skip-cert-verify']) === true ? true : null,
		alpn: p.alpn
	};
	const reality = p['reality-opts'];
	if (reality && type(reality) === 'object') {
		tls.reality = {
			enabled: true,
			public_key: reality['public-key'],
			short_id: reality['short-id']
		};
	}
	const client_fp = p['client-fingerprint'];
	if (client_fp)
		tls.utls = { enabled: true, fingerprint: client_fp };
	return strip_null(tls);
}

/* ---------- transport 组装（ws / grpc / http） ---------- */
function build_transport(p) {
	const net = p.network;
	if (!net || net === 'tcp') return null;
	if (net === 'ws') {
		const opts = p['ws-opts'] || {};
		return strip_null({
			type: 'ws',
			path: opts.path,
			headers: opts.headers,
			max_early_data: toint(opts['max-early-data']),
			early_data_header_name: opts['early-data-header-name']
		});
	}
	if (net === 'grpc') {
		const opts = p['grpc-opts'] || {};
		return { type: 'grpc', service_name: opts['grpc-service-name'] };
	}
	if (net === 'http' || net === 'h2') {
		const opts = p['h2-opts'] || p['http-opts'] || {};
		return strip_null({
			type: 'http',
			host: opts.host || opts.Host,
			path: opts.path
		});
	}
	if (net === 'httpupgrade') {
		const opts = p['http-upgrade-opts'] || {};
		return strip_null({ type: 'httpupgrade', path: opts.path, host: opts.host });
	}
	logerr(sprintf("unknown transport network '%s' for node '%s', ignored", net, p.name));
	return null;
}

/* ---------- 协议各自的转换 ---------- */
function convert_ss(p) {
	const plugin = p.plugin, popts = p['plugin-opts'] || {};
	let plugin_opts = null;
	if (plugin && type(popts) === 'object') {
		/* 字段名映射：Clash simple-obfs 命名 → sing-box obfs-local 命名
		 * Clash: mode=http;host=xxx
		 * sing-box: obfs=http;obfs-host=xxx */
		const FIELD_MAP = {
			'mode': 'obfs',
			'host': 'obfs-host',
			'uri': 'obfs-uri'
		};
		const parts = [];
		for (let k in popts) {
			const v = popts[k];
			if (type(v) === 'object') continue;
			push(parts, (FIELD_MAP[k] || k) + '=' + v);
		}
		plugin_opts = join(';', parts);
	}
	/* sing-box 的 plugin 名：clash 的 obfs = sing-box 的 obfs-local */
	let sb_plugin = null;
	if (plugin === 'obfs') sb_plugin = 'obfs-local';
	else if (plugin === 'v2ray-plugin') sb_plugin = 'v2ray-plugin';
	else if (plugin === 'shadow-tls') sb_plugin = 'shadow-tls';
	else if (plugin) sb_plugin = plugin;

	return strip_null({
		type: 'shadowsocks',
		tag: p.name,
		server: p.server,
		server_port: toint(p.port),
		method: p.cipher,
		password: p.password,
		plugin: sb_plugin,
		plugin_opts: plugin_opts
	});
}

function convert_vmess(p) {
	return strip_null({
		type: 'vmess',
		tag: p.name,
		server: p.server,
		server_port: toint(p.port),
		uuid: p.uuid,
		alter_id: toint(p.alterId) || 0,
		security: p.cipher || 'auto',
		tls: build_tls(p),
		transport: build_transport(p)
	});
}

function convert_vless(p) {
	return strip_null({
		type: 'vless',
		tag: p.name,
		server: p.server,
		server_port: toint(p.port),
		uuid: p.uuid,
		flow: p.flow,
		tls: build_tls(p),
		transport: build_transport(p)
	});
}

function convert_trojan(p) {
	return strip_null({
		type: 'trojan',
		tag: p.name,
		server: p.server,
		server_port: toint(p.port),
		password: p.password,
		tls: build_tls(p) || { enabled: true, server_name: p.sni || p.server },
		transport: build_transport(p)
	});
}

function convert_hysteria2(p) {
	const obfs_pass = p['obfs-password'];
	return strip_null({
		type: 'hysteria2',
		tag: p.name,
		server: p.server,
		server_port: toint(p.port),
		password: pick(p, 'password', 'auth'),
		up_mbps: toint(p.up),
		down_mbps: toint(p.down),
		obfs: (p.obfs && obfs_pass) ? { type: p.obfs, password: obfs_pass } : null,
		tls: build_tls(p) || { enabled: true, server_name: p.sni || p.server }
	});
}

function convert_tuic(p) {
	return strip_null({
		type: 'tuic',
		tag: p.name,
		server: p.server,
		server_port: toint(p.port),
		uuid: p.uuid,
		password: p.password,
		congestion_control: p['congestion-controller'] || p.congestion,
		udp_relay_mode: p['udp-relay-mode'],
		tls: build_tls(p) || { enabled: true, server_name: p.sni || p.server, alpn: p.alpn }
	});
}

function convert_proxy(p) {
	const sb_type = SUPPORTED[p.type];
	if (!sb_type) {
		if (p.type && p.type !== 'select')
			logerr(sprintf("skip unsupported type '%s' for '%s'", p.type, p.name));
		return null;
	}
	if (!p.server || !p.port || !p.name) {
		logerr(sprintf("skip proxy missing server/port/name (type=%s)", p.type));
		return null;
	}
	switch (p.type) {
		case 'ss':
		case 'shadowsocks':     return convert_ss(p);
		case 'vmess':           return convert_vmess(p);
		case 'vless':           return convert_vless(p);
		case 'trojan':          return convert_trojan(p);
		case 'hysteria2':
		case 'hy2':             return convert_hysteria2(p);
		case 'tuic':            return convert_tuic(p);
	}
	return null;
}

/* ---------- 去重：tag 必须唯一 ---------- */
function dedupe_tags(nodes) {
	const seen = {};
	for (let n in nodes) {
		let base = n.tag, t = base, i = 2;
		while (seen[t]) {
			t = base + '_' + i;
			i++;
		}
		n.tag = t;
		seen[t] = true;
	}
	return nodes;
}

/* 机场常塞的"伪节点"标签：流量计费 / 到期日 / 套餐链接 / 客服等。
 * 它们是真实 SS/Vmess 配置（参与 sing-box 解析、能让 P2-H 抽流量到期信息），
 * 但服务端通常不真转发流量或被限速到不可用——必须从 selector/urltest 里剔除，
 * 否则 selector 默认选第一个、urltest 选延迟最低（同源 0ms），所有代理都会打到伪节点 → 国外 out。 */
function is_pseudo_node_tag(tag) {
	if (!tag) return false;
	const t = '' + tag;
	const patterns = [
		/^Traffic[：:]/i,
		/^Expire[：:]/i,
		/剩余流量|剩余[：:]/,
		/距离下次重置/,
		/到期(时间|日期)?[：:]/,
		/官网[：:]/,
		/网站[：:]/,
		/套餐[：:]?/,
		/客服[：:]/,
		/QQ[群]?[：:]/i,
		/Telegram|TG群|官方群/i,
		/续费|订阅地址|流量重置/,
	];
	for (let re in patterns) if (match(t, re)) return true;
	return false;
}

/* ---------- 按节点名识别地区，返回 'HK'/'JP'/'US'/'SG'/'OTHER'/'' ---------- */
function region_of(tag) {
	if (!tag) return '';
	const t = '' + tag;
	if (match(t, /港|🇭🇰|HK[^A-Za-z]|[^A-Za-z]HK|^HK$|[Hh]ong[Kk]/)) return 'HK';
	if (match(t, /日|🇯🇵|JP[^A-Za-z]|[^A-Za-z]JP|^JP$|[Jj]apan/)) return 'JP';
	if (match(t, /美|🇺🇸|US[^A-Za-z]|[^A-Za-z]US|^US$|[Uu]nited.?[Ss]tates|[Aa]merica/)) return 'US';
	if (match(t, /新加坡|🇸🇬|SG[^A-Za-z]|[^A-Za-z]SG|^SG$|[Ss]ingapore/)) return 'SG';
	if (match(t, /台湾|台|🇹🇼|TW[^A-Za-z]|[^A-Za-z]TW|^TW$|[Tt]aiwan|韩国|韩|🇰🇷|KR[^A-Za-z]|[^A-Za-z]KR|^KR$|[Kk]orea/)) return 'OTHER';
	return '';
}

/* ---------- 把 __NODES__/__NODES_XX__ 占位符替换为真实 tag（剔除伪节点） ---------- */
function expand_node_placeholder(outbounds, node_tags) {
	const real_tags = [];
	for (let t in node_tags) if (!is_pseudo_node_tag(t)) push(real_tags, t);

	/* 按地区分桶 */
	let tags_hk = [], tags_jp = [], tags_us = [], tags_sg = [], tags_other = [];
	for (let t in real_tags) {
		const r = region_of(t);
		if      (r === 'HK')    push(tags_hk,    t);
		else if (r === 'JP')    push(tags_jp,    t);
		else if (r === 'US')    push(tags_us,    t);
		else if (r === 'SG')    push(tags_sg,    t);
		else if (r === 'OTHER') push(tags_other, t);
	}
	/* 某地区无节点时回退到全量，避免 selector/urltest outbounds 为空 */
	if (!length(tags_hk))    tags_hk    = real_tags;
	if (!length(tags_jp))    tags_jp    = real_tags;
	if (!length(tags_us))    tags_us    = real_tags;
	if (!length(tags_sg))    tags_sg    = real_tags;
	if (!length(tags_other)) tags_other = real_tags;

	for (let ob in outbounds) {
		if (ob.type !== 'selector' && ob.type !== 'urltest') continue;
		if (!ob.outbounds || type(ob.outbounds) !== 'array') continue;
		const expanded = [];
		for (let item in ob.outbounds) {
			let list = null;
			if      (item === '__NODES__')       list = real_tags;
			else if (item === '__NODES_HK__')    list = tags_hk;
			else if (item === '__NODES_JP__')    list = tags_jp;
			else if (item === '__NODES_US__')    list = tags_us;
			else if (item === '__NODES_SG__')    list = tags_sg;
			else if (item === '__NODES_OTHER__') list = tags_other;
			if (list !== null) { for (let t in list) push(expanded, t); }
			else               { push(expanded, item); }
		}
		ob.outbounds = expanded;
	}
	return outbounds;
}

/* ---------- proxy-providers 解析 ---------- */
function resolve_providers(yaml) {
	if (type(yaml['proxy-providers']) !== 'object')
		return [];
	const all = [];
	for (let name in yaml['proxy-providers']) {
		const p = yaml['proxy-providers'][name];
		if (p.type !== 'http' || !p.url) {
			logerr(sprintf("provider '%s': skip (not http or no url)", name));
			continue;
		}
		const cmd = sprintf("wget -q -O- --timeout=20 %s 2>/dev/null | yq -o=json eval . 2>/dev/null", quote_sh(p.url));
		const h = popen(cmd, "r");
		if (!h) { logerr(sprintf("provider '%s': download failed", name)); continue; }
		let buf = "", chunk;
		while ((chunk = h.read(65536))) buf += chunk;
		h.close();
		if (!length(buf)) { logerr(sprintf("provider '%s': empty response", name)); continue; }
		const data = json(buf);
		if (!data || type(data.proxies) !== 'array') {
			logerr(sprintf("provider '%s': no proxies array in response", name));
			continue;
		}
		logerr(sprintf("provider '%s': %d proxies", name, length(data.proxies)));
		for (let px in data.proxies) push(all, px);
	}
	return all;
}

/* ---------- main ---------- */
const yaml_path = ARGV[0];
const tpl_path  = ARGV[1] || TPL_DEFAULT;
const out_path  = ARGV[2];

if (!yaml_path)
	die("usage: ucode yaml2singbox.uc <yaml-in> [template-json] [json-out]");

const yaml = read_yaml_as_json(yaml_path);

let proxies = [];
if (type(yaml.proxies) === 'array')
	proxies = yaml.proxies;
else
	logerr("no inline proxies array, checking proxy-providers...");

if (type(yaml['proxy-providers']) === 'object') {
	const pproxies = resolve_providers(yaml);
	for (let p in pproxies) push(proxies, p);
}

if (!length(proxies))
	die(sprintf("no proxies found in %s (inline or via providers)", yaml_path));

const tpl_raw = readfile(tpl_path);
if (!tpl_raw)
	die(sprintf("cannot read template %s", tpl_path));
const tpl = json(tpl_raw);
if (!tpl || type(tpl.outbounds) !== 'array')
	die(sprintf("template %s has no outbounds[]", tpl_path));

/* 转换节点 */
const nodes = [];
let skipped = 0;
for (let p in proxies) {
	const o = convert_proxy(p);
	if (o) push(nodes, o); else skipped++;
}
dedupe_tags(nodes);

if (!length(nodes))
	die(sprintf("no usable nodes converted from %d proxies (skipped=%d)", length(proxies), skipped));

logerr(sprintf("converted=%d skipped=%d", length(nodes), skipped));

/* 拼装：节点插入到 outbounds 数组前部 */
const final_outbounds = [];
for (let n in nodes) push(final_outbounds, n);
for (let ob in tpl.outbounds) push(final_outbounds, ob);

/* 展开 __NODES__ 占位符 */
const node_tags = map(nodes, (n) => n.tag);
expand_node_placeholder(final_outbounds, node_tags);

tpl.outbounds = final_outbounds;

const out = sprintf("%.J\n", tpl);
if (out_path) {
	if (!writefile(out_path, out))
		die(sprintf("writefile failed: %s", out_path));
	logerr(sprintf("wrote %s (%d bytes, %d nodes)", out_path, length(out), length(nodes)));
} else {
	print(out);
}
