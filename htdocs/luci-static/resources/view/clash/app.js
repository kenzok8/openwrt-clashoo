'use strict';
'require form';
'require view';
'require ui';
'require uci';
'require tools.clash as clash';

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('clash'),
            Promise.race([
                clash.listConfigs(),
                new Promise(function(resolve) {
                    setTimeout(function() { resolve({ configs: [], current: '' }); }, 1200);
                })
            ]).catch(function() {
                return { configs: [], current: '' };
            })
        ]);
    },

    render: function (data) {
        const allConfigs  = (data[1] && data[1].configs) || [];
        const curConf     = (data[1] && data[1].current) || '';

        let m, s, o;

        m = new form.Map('clash', '代理配置', '');
        this._map = m;

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
        o.default = '';
        for (const name of allConfigs) {
            const label = name.length > 28 ? name.slice(0, 25) + '…' : name;
            o.value(name, label);
        }
        o.load = function () { return curConf || ''; };
        o.write = function () {};
        o.onchange = function (ev, sid, opt, val) {
            if (!val) return;
            clash.setConfig(val).then(function () { window.location.reload(); }).catch(function(e) { L.ui.addNotification(null, E('p', '切换配置失败: ' + (e.message || e))); });
        };

        o = s.option(form.Value, 'start_delay', '启动延迟（秒）');
        o.datatype    = 'uinteger';
        o.placeholder = '立即启动';

        o = s.option(form.ListValue, 'p_mode', '代理模式');
        o.value('rule',   '规则');
        o.value('global', '全局');
        o.value('direct', '直连');

        o = s.option(form.ListValue, 'level', '日志级别');
        o.value('info',    '信息');
        o.value('warning', '警告');
        o.value('error',   '错误');
        o.value('debug',   '调试');
        o.value('silent',  '静默');

        /* ── 透明代理模式 ── */
        s = m.section(form.NamedSection, 'config', 'clash', '透明代理');

        o = s.option(form.ListValue, 'tcp_mode', 'TCP 模式');
        o.optional    = true;
        o.placeholder = '禁用';
        o.value('redirect', 'Redirect 模式');
        o.value('tproxy',   'TPROXY 模式');
        o.value('tun',      'TUN 模式');
        o.default = 'redirect';
        o.description = 'Redirect：NAT 重定向，兼容性最好；TPROXY：透明代理，性能更好；TUN：虚拟网卡，支持所有协议';

        o = s.option(form.ListValue, 'udp_mode', 'UDP 模式');
        o.optional    = true;
        o.placeholder = '禁用';
        o.value('tproxy', 'TPROXY 模式');
        o.value('tun',    'TUN 模式');
        o.default = 'tun';
        o.description = 'TPROXY：需内核支持 IP_TRANSPARENT；TUN：与 TCP TUN 模式配合使用';

        o = s.option(form.ListValue, 'stack', '网络栈类型');
        o.value('system', 'System');
        o.value('gvisor', 'gVisor');
        o.value('mixed',  'Mixed（推荐）');
        o.default = 'mixed';
        o.description = 'TUN 模式专用：System=原生TCP+UDP；gVisor=沙箱隔离；Mixed=TCP用System，UDP用gVisor（推荐）';
        o.depends('tcp_mode', 'tun');
        o.depends('udp_mode', 'tun');

        o = s.option(form.Flag, 'disable_quic_gso', '禁用 quic-go GSO 支持');
        o.default = '1';
        o.rmempty = false;
        o.description = '遇到 QUIC/UDP 连接不稳定时建议开启（稳定优先，可能略降吞吐）';

        o = s.option(form.Flag, 'ipv4_dns_hijack', 'IPv4 DNS 劫持');
        o.default = '1';
        o.rmempty = false;

        o = s.option(form.Flag, 'ipv6_dns_hijack', 'IPv6 DNS 劫持');
        o.default = '1';
        o.rmempty = false;

        o = s.option(form.Flag, 'ipv4_proxy', 'IPv4 代理');
        o.default = '1';
        o.rmempty = false;

        o = s.option(form.Flag, 'ipv6_proxy', 'IPv6 代理');
        o.default = '1';
        o.rmempty = false;

        o = s.option(form.Flag, 'fake_ip_ping_hijack', 'Fake-IP Ping 劫持');
        o.default = '1';
        o.rmempty = false;
        o.description = 'Fake-IP 模式下劫持 ICMP ping 请求，避免 ping 结果异常';

        /* ── 端口配置 ── */
        s = m.section(form.NamedSection, 'config', 'clash', '端口配置');

        o = s.option(form.Flag, 'allow_lan', '允许局域网连接');
        o.enabled  = 'true';
        o.disabled = 'false';
        o.default  = 'true';
        o.rmempty  = false;

        o = s.option(form.Value, 'http_port', 'HTTP 代理端口');
        o.datatype    = 'port';
        o.default     = '8080';
        o.placeholder = '8080';

        o = s.option(form.Value, 'socks_port', 'SOCKS5 代理端口');
        o.datatype    = 'port';
        o.default     = '1080';
        o.placeholder = '1080';

        o = s.option(form.Value, 'mixed_port', '混合端口（HTTPS + SOCKS5）');
        o.datatype    = 'port';
        o.default     = '7890';
        o.placeholder = '7890';

        o = s.option(form.Value, 'redir_port', 'Redirect 端口');
        o.datatype    = 'port';
        o.default     = '7891';
        o.placeholder = '7891';
        o.description = 'TCP Redirect 模式监听端口（mihomo: redir-port）';

        o = s.option(form.Value, 'tproxy_port', 'TPROXY 端口');
        o.datatype    = 'port';
        o.default     = '7982';
        o.placeholder = '7982';
        o.description = 'TPROXY 模式监听端口（mihomo: tproxy-port），TCP/UDP TPROXY 任一启用时生效';


        return m.render();
    },

    handleSave: function (ev) {
        if (!this._map)
            return Promise.resolve();
        return this._map.save(ev);
    },

    handleSaveApply: function (ev) {
        return this.handleSave(ev).then(function () {
            return Promise.resolve(ui.changes.apply(true)).then(function () {
                return clash.restart();
            });
        });
    },

    handleReset: function () {
        if (!this._map)
            return Promise.resolve();
        return this._map.reset();
    }
});
