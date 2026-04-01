'use strict';
'require form';
'require view';
'require uci';
'require tools.clash as clash';

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('clash'),
            clash.listConfigs()
        ]);
    },

    render: function (data) {
        const allConfigs  = (data[1] && data[1].configs) || [];
        const curConf     = (data[1] && data[1].current) || '';

        let m, s, o;

        m = new form.Map('clash', '代理配置', '');

        /* ── 基本配置 ── */
        s = m.section(form.NamedSection, 'config', 'clash', '基本配置');

        o = s.option(form.Flag, 'enable', '启用');
        o.rmempty = false;

        o = s.option(form.ListValue, 'core', '内核版本');
        o.value('2', 'mihomo（稳定版）');
        o.value('3', 'Alpha（预发布版）');
        o.default = '3';
        o.description = '选择要使用的 Mihomo 内核版本，需在系统页面提前下载对应版本';

        o = s.option(form.ListValue, '_active_config', '配置文件');
        o.value('', '（未设置）');
        for (const name of allConfigs) {
            o.value(name, name);
        }
        o.load = function () { return curConf || ''; };
        o.write = function () {};
        o.onchange = function (ev, sid, opt, val) {
            if (!val) return;
            clash.setConfig(val).then(function () { window.location.reload(); });
        };

        o = s.option(form.Value, 'start_delay', '启动延迟（秒）');
        o.datatype    = 'uinteger';
        o.placeholder = '立即启动';

        o = s.option(form.ListValue, 'p_mode', '代理模式');
        o.value('rule',   '规则');
        o.value('global', '全局');
        o.value('direct', '直连');

        o = s.option(form.ListValue, 'level', '日志级别');
        o.value('info',    'info');
        o.value('warning', 'warning');
        o.value('error',   'error');
        o.value('debug',   'debug');
        o.value('silent',  'silent');

        /* ── 透明代理模式 ── */
        s = m.section(form.NamedSection, 'config', 'clash', '透明代理');

        o = s.option(form.ListValue, 'tcp_mode', 'TCP 模式');
        o.optional    = true;
        o.placeholder = '禁用';
        o.value('redirect', 'Redirect 模式');
        o.value('tproxy',   'TPROXY 模式');
        o.value('tun',      'TUN 模式');
        o.description = 'Redirect：NAT 重定向，兼容性最好；TPROXY：透明代理，性能更好；TUN：虚拟网卡，支持所有协议';

        o = s.option(form.ListValue, 'udp_mode', 'UDP 模式');
        o.optional    = true;
        o.placeholder = '禁用';
        o.value('tproxy', 'TPROXY 模式');
        o.value('tun',    'TUN 模式');
        o.description = 'TPROXY：需内核支持 IP_TRANSPARENT；TUN：与 TCP TUN 模式配合使用';

        o = s.option(form.ListValue, 'stack', 'TUN 协议栈');
        o.optional    = true;
        o.placeholder = 'mixed';
        o.value('system', 'system（原生 TCP+UDP）');
        o.value('gvisor', 'gVisor（沙箱隔离）');
        o.value('mixed',  'mixed（推荐：TCP=system, UDP=gVisor）');
        o.description = 'TUN 模式专用；mixed 综合性能最佳，为 Mihomo 官方推荐值';
        o.depends('tcp_mode', 'tun');

        o = s.option(form.Value, 'redir_port', 'Redirect 端口');
        o.datatype    = 'port';
        o.placeholder = '7891';
        o.description = 'TCP Redirect 模式监听端口（mihomo: redir-port）';
        o.depends('tcp_mode', 'redirect');

        o = s.option(form.Value, 'tproxy_port', 'TPROXY 端口');
        o.datatype    = 'port';
        o.placeholder = '7892';
        o.description = 'TPROXY 模式监听端口（mihomo: tproxy-port），TCP/UDP TPROXY 任一启用时生效';
        o.depends('tcp_mode', 'tproxy');
        o.depends('udp_mode', 'tproxy');

        /* ── 端口配置 ── */
        s = m.section(form.NamedSection, 'config', 'clash', '端口配置');

        o = s.option(form.Value, 'http_port', 'HTTP 代理端口');
        o.datatype    = 'port';
        o.placeholder = '8080';

        o = s.option(form.Value, 'socks_port', 'SOCKS5 代理端口');
        o.datatype    = 'port';
        o.placeholder = '1080';

        o = s.option(form.Value, 'mixed_port', '混合端口（HTTP + SOCKS5）');
        o.datatype    = 'port';
        o.placeholder = '7890';

        o = s.option(form.Value, 'dash_port', '外部控制端口（面板）');
        o.datatype    = 'port';
        o.placeholder = '9090';

        o = s.option(form.Flag, 'allow_lan', '允许局域网连接');
        o.rmempty = false;


        /* ── 绕过 ── */
        s = m.section(form.NamedSection, 'config', 'clash', '绕过');

        o = s.option(form.Flag, 'bypass_china', '绕过中国大陆 IP');
        o.rmempty = false;
        o.description = '目标为中国大陆 IP 时直连，不经过代理（需 /usr/share/clash/china_ip.txt）';

        o = s.option(form.ListValue, 'proxy_tcp_dport', '要代理的 TCP 目标端口');
        o.optional    = true;
        o.placeholder = '全部端口';
        o.value('21 22 80 110 143 194 443 465 853 993 995 8080 8443', '常用端口');

        o = s.option(form.ListValue, 'proxy_udp_dport', '要代理的 UDP 目标端口');
        o.optional    = true;
        o.placeholder = '全部端口';
        o.value('123 443 8443', '常用端口');

        o = s.option(form.DynamicList, 'bypass_dscp', '绕过 DSCP');
        o.datatype = 'range(0, 63)';
        o.rmempty  = true;
        o.description = '此 DSCP 标记的流量不走代理，范围 0-63';

        o = s.option(form.DynamicList, 'bypass_fwmark', '绕过 FWMark');
        o.rmempty  = true;
        o.description = '此防火墙标记的流量不走代理';

        /* ── 局域网访问控制 ── */
        s = m.section(form.NamedSection, 'config', 'clash', '局域网访问控制');
        s.description = '控制哪些局域网设备走代理（按来源 IP 过滤）';

        o = s.option(form.ListValue, 'access_control', '控制模式');
        o.value('0', '关闭（所有设备走代理）');
        o.value('1', '白名单（仅列表中的设备走代理）');
        o.value('2', '黑名单（列表中的设备不走代理）');
        o.default = '0';

        o = s.option(form.DynamicList, 'proxy_lan_ips', '白名单设备 IP');
        o.datatype = 'ip4addr';
        o.rmempty  = true;
        o.retain   = true;
        o.description = '支持 CIDR，如 192.168.1.100 或 192.168.2.0/24';
        o.depends('access_control', '1');

        o = s.option(form.DynamicList, 'reject_lan_ips', '黑名单设备 IP');
        o.datatype = 'ip4addr';
        o.rmempty  = true;
        o.retain   = true;
        o.description = '支持 CIDR，如 192.168.1.200 或 192.168.3.0/24';
        o.depends('access_control', '2');


        return m.render().then(function (node) {
            /* Constrain all selects so long filenames don't stretch the layout */
            let style = E('style', {}, [
                '.cbi-value-field select.cbi-input-select {',
                '  max-width:100%;',
                '  width:100%;',
                '  box-sizing:border-box;',
                '  overflow:hidden;',
                '  text-overflow:ellipsis;',
                '}'
            ].join(''));
            node.insertBefore(style, node.firstChild);
            return node;
        });
    }
});
