#!/usr/bin/ucode

'use strict';

import { readfile, writefile } from 'fs';

let path = ARGV[0] || '';
let redir_port = +(ARGV[1] || '7891');
let tproxy_port = +(ARGV[2] || '7982');
let mixed_port = +(ARGV[3] || '7890');
let has_tun_device = (ARGV[4] || '1') == '1';

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

let inbounds = cfg.inbounds || [];
let normalized = [];
let has_redirect = false;
let has_tproxy = false;
let has_mixed = false;
let has_tun = false;

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

cfg.inbounds = normalized;
cfg.route = cfg.route || {};
cfg.route.auto_detect_interface = true;

if (writefile(path, sprintf('%J', cfg)) === null) {
	print("write failed\n");
	exit(1);
}

print("normalized\n");
