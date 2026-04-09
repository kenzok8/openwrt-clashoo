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
            }),
            clash.smartModelStatus().catch(function() { return { has_model: false, version: '' }; })
        ]);
    },

    render: function (data) {
        const allConfigs      = (data[1] && data[1].configs) || [];
        const curConf         = (data[1] && data[1].current) || '';
        const smartModelVer   = (data[2] && data[2].version) || '';

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

        /* ── Smart 设置 ── */
        s = m.section(form.NamedSection, 'config', 'clash', 'Smart 设置');
        s.description = 'Mihomo Alpha 智能节点选择（type: smart），仅 Alpha 版内核支持';

        o = s.option(form.Flag, 'smart_auto_switch', '<span style="color:#e06c75;font-weight:bold">Smart 策略自动切换</span>');
        o.rmempty = false;
        o.default = '0';
        o.description = '<span style="color:#e06c75">自动切换 Url-test、Load-balance 策略组到 Smart 策略组</span>';

        o = s.option(form.Value, 'smart_policy_priority', 'Policy Priority（权重加成）');
        o.placeholder = 'Premium:0.9;SG:1.3';
        o.rmempty = true;
        o.description = '节点权重加成，&lt;1 表示较低优先级，&gt;1 表示较高优先级，默认为 1，匹配模式支持 Regex 和字符串';

        o = s.option(form.Flag, 'smart_prefer_asn', '<span style="color:#e06c75;font-weight:bold">ASN 优先</span>');
        o.rmempty = false;
        o.default = '0';
        o.description = '选择节点时强制查找并优先使用目标的 ASN 信息，以获得更稳定的体验';

        o = s.option(form.Flag, 'smart_uselightgbm', '<span style="color:#e06c75;font-weight:bold">启用 LightGBM 模型</span>');
        o.rmempty = false;
        o.default = '0';
        o.description = '<span style="color:#e06c75">使用 LightGBM 模型来预测权重</span>';

        o = s.option(form.Flag, 'smart_collectdata', '收集训练数据');
        o.rmempty = false;
        o.default = '0';

        o = s.option(form.Flag, 'smart_lgbm_auto_update', '自动更新模型');
        o.rmempty = false;
        o.default = '0';

        o = s.option(form.Value, 'smart_lgbm_update_interval', '更新间隔（小时）');
        o.datatype    = 'uinteger';
        o.default     = '72';
        o.placeholder = '72';
        o.depends('smart_lgbm_auto_update', '1');

        /* 更新模型 按钮 + 当前版本 */
        o = s.option(form.DummyValue, '_smart_upgrade_btn', '更新模型');
        o.rawhtml = true;
        o.cfgvalue = function() {
            var verHtml = smartModelVer
                ? '<br><small style="color:#98c379">当前版本: ' + smartModelVer + '</small>'
                : '';
            return '<button type="button" class="btn cbi-button cbi-button-action" id="btn_smart_upgrade">检查并更新</button>' + verHtml;
        };
        o.write = function() {};

        /* 清理 Smart 缓存 按钮 */
        o = s.option(form.DummyValue, '_smart_flush_btn', '清理 Smart 缓存');
        o.rawhtml = true;
        o.cfgvalue = function() {
            return '<button type="button" class="btn cbi-button cbi-button-negative" id="btn_smart_flush">清理</button>';
        };
        o.write = function() {};

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


        return m.render().then(function(node) {
            var btnUpgrade = node.querySelector('#btn_smart_upgrade');
            if (btnUpgrade) {
                btnUpgrade.addEventListener('click', function() {
                    btnUpgrade.disabled = true;
                    btnUpgrade.textContent = '更新中…';
                    clash.smartUpgradeLgbm().then(function() {
                        btnUpgrade.disabled = false;
                        btnUpgrade.textContent = '检查并更新';
                        return clash.smartModelStatus();
                    }).then(function(s) {
                        if (s && s.version) {
                            var sm = btnUpgrade.nextElementSibling;
                            if (!sm || sm.tagName !== 'SMALL') {
                                sm = document.createElement('small');
                                sm.style.color = '#98c379';
                                btnUpgrade.parentNode.insertBefore(sm, btnUpgrade.nextSibling);
                            }
                            sm.textContent = '当前版本: ' + s.version;
                        }
                        L.ui.addNotification(null, E('p', '模型更新任务已启动，请稍后刷新页面查看版本'));
                    }).catch(function(e) {
                        btnUpgrade.disabled = false;
                        btnUpgrade.textContent = '检查并更新';
                        L.ui.addNotification(null, E('p', '更新失败: ' + (e.message || e)));
                    });
                });
            }

            var btnFlush = node.querySelector('#btn_smart_flush');
            if (btnFlush) {
                btnFlush.addEventListener('click', function() {
                    btnFlush.disabled = true;
                    btnFlush.textContent = '清理中…';
                    clash.smartFlushCache().then(function(r) {
                        btnFlush.disabled = false;
                        btnFlush.textContent = '清理';
                        L.ui.addNotification(null, E('p',
                            (r && r.success) ? 'Smart 缓存已清理' : '清理失败（请确认 Mihomo 正在运行）'
                        ));
                    }).catch(function(e) {
                        btnFlush.disabled = false;
                        btnFlush.textContent = '清理';
                        L.ui.addNotification(null, E('p', '清理失败: ' + (e.message || e)));
                    });
                });
            }

            return node;
        });
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
