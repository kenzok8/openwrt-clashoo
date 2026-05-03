#!/usr/bin/ucode

'use strict';

import { readfile, writefile } from 'fs';

let path = ARGV[0] || '';
if (!path) { print("missing path\n"); exit(1); }

let raw = readfile(path);
if (!raw) { print("read failed\n"); exit(1); }

// 已注入则跳过
if (match(raw, /📲 APNs 推送/)) {
	print("APNs already injected, skip\n");
	exit(0);
}

let lines = split(raw, '\n');
let out = [];
let in_groups = false;
let in_rules = false;

// APNs 选择器组（放在 🍎 Apple 之后）
let apns_group = '  - {name: 📲 APNs 推送, type: select, proxies: [🚀 节点选择, ♻️ 自动选择, 🌐 直连]}';

// APNs 路由规则
let apns_rules = [
	'  - DOMAIN-KEYWORD,push.apple.com,📲 APNs 推送',
	'  - DOMAIN-KEYWORD,apple.com.edgekey.net,📲 APNs 推送',
	'  - IP-CIDR,17.249.0.0/16,📲 APNs 推送,no-resolve',
	'  - IP-CIDR,17.252.0.0/16,📲 APNs 推送,no-resolve',
	'  - IP-CIDR,17.57.144.0/22,📲 APNs 推送,no-resolve',
	'  - IP-CIDR,17.188.128.0/18,📲 APNs 推送,no-resolve',
	'  - IP-CIDR,17.188.20.0/23,📲 APNs 推送,no-resolve',
	'  - IP-CIDR6,2620:149:a44::/48,📲 APNs 推送,no-resolve',
	'  - IP-CIDR6,2403:300:a42::/48,📲 APNs 推送,no-resolve',
	'  - IP-CIDR6,2403:300:a51::/48,📲 APNs 推送,no-resolve',
	'  - IP-CIDR6,2a01:b740:a42::/48,📲 APNs 推送,no-resolve',
];

for (let i = 0; i < length(lines); i++) {
	let line = lines[i];

	// 跟踪当前所在区块
	if (match(line, /^proxy-groups:/)) { in_groups = true; in_rules = false; }
	if (match(line, /^rules:/)) { in_rules = true; in_groups = false; }

	// 在 🍎 Apple 组之后插入 APNs 组
	if (in_groups && match(line, /name: 🍎 Apple/)) {
		push(out, line);
		push(out, apns_group);
		continue;
	}

	// 在 RULE-SET,apple_domain 之前插入 APNs 规则
	if (in_rules && match(line, /RULE-SET,apple_domain/)) {
		for (let r = 0; r < length(apns_rules); r++)
			push(out, apns_rules[r]);
		push(out, line);
		continue;
	}

	push(out, line);
}

let result = join('\n', out) + '\n';
if (writefile(path, result) === null) {
	print("write failed\n");
	exit(1);
}
print("APNs injected\n");
