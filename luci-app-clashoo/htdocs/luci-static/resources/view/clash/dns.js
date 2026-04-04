'use strict';
'require view';
'require form';
'require ui';
'require uci';
'require tools.clash as clash';

return view.extend({
    load: function () {
        return uci.load('clash');
    },

    render: function () {
        let m, s, o;

        function useInlineEmptyHint(section) {
            section.addbtntitle = _('添加');
            section.renderSectionPlaceholder = function() { return E([]); };
            section.renderSectionAdd = function(config_data) {
                let node = form.TypedSection.prototype.renderSectionAdd.call(this, config_data);
                if (node && this.cfgsections(config_data).length === 0) {
                    let children = Array.from(node.childNodes || []);
                    for (let child of children) {
                        if (child && child.nodeType === 3 && child.textContent && child.textContent.trim()) {
                            node.removeChild(child);
                        }
                    }
                    node.appendChild(E('span', {
                        style: 'margin-left:10px;color:#888;font-size:.9rem;vertical-align:middle;line-height:2.2rem'
                    }, _('尚无任何配置')));
                }
                return node;
            };
        }

        m = new form.Map('clash', _('DNS 设置'), _('配置 Clash DNS 解析规则'));
        this._map = m;

        /* ─── 基础 DNS ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('基础 DNS'));
        s.anonymous = false;

        o = s.option(form.Flag, 'enable_dns', _('启用 DNS 模块'));
        o.default = '1';

        o = s.option(form.Value, 'listen_port', _('DNS 监听端口'));
        o.default = '5300';
        o.datatype = 'port';
        o.depends('enable_dns', '1');

        o = s.option(form.ListValue, 'enhanced_mode', _('增强模式'));
        o.value('fake-ip', 'Fake-IP');
        o.value('redir-host', 'Redir-Host');
        o.default = 'fake-ip';
        o.depends('enable_dns', '1');

        o = s.option(form.Value, 'fake_ip_range', _('Fake-IP 网段'));
        o.default = '198.18.0.1/16';
        o.depends({ enable_dns: '1', enhanced_mode: 'fake-ip' });

        o = s.option(form.Value, 'default_nameserver', _('默认 DNS 服务器'), _('引导 DoH/DoT 解析用'));
        o.default = '223.5.5.5';
        o.depends('enable_dns', '1');

        /* ─── 高级设置 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('高级设置'));
        s.anonymous = false;

        o = s.option(form.Flag, 'dnsforwader', _('强制转发 DNS'));
        o.default = '0';

        o = s.option(form.DynamicList, 'fake_ip_filter', _('Fake-IP 过滤域名'), _('匹配的域名返回真实 IP，不走 Fake-IP'));
        o.rmempty = true;
        o.default = ['*.lan', '*.local', 'localhost.ptlogin2.qq.com', '+.stun.*.*', '+.stun.*.*.*', 'time.windows.com', 'time.nist.gov', 'time.apple.com'];
        o.depends({ enable_dns: '1', enhanced_mode: 'fake-ip' });

        /* ─── 上游 DNS 服务器 ─── */
        s = m.section(form.TypedSection, 'dnsservers', _('上游 DNS 服务器'));
        s.addremove = true;
        s.anonymous = true;

        o = s.option(form.ListValue, 'ser_type', _('角色'));
        o.value('nameserver', 'Nameserver（国内）');
        o.value('fallback',   'Fallback（境外）');
        o.default = 'nameserver';

        o = s.option(form.Value, 'ser_address', _('DNS 地址'));
        o.placeholder = '114.114.114.114';

        o = s.option(form.ListValue, 'protocol', _('协议'));
        o.value('udp://',   'UDP');
        o.value('tcp://',   'TCP');
        o.value('tls://',   'TLS (DoT)');
        o.value('https://', 'HTTPS (DoH)');
        o.default = 'udp://';

        /* ─── DNS 劫持 ─── */
        s = m.section(form.TypedSection, 'dnshijack', _('DNS 劫持'));
        s.addremove = true;
        s.anonymous = true;
        useInlineEmptyHint(s);

        o = s.option(form.ListValue, 'type', _('协议类型'));
        o.value('none', _('无（仅 IP）'));
        o.value('tcp://', 'TCP');
        o.value('udp://', 'UDP');
        o.default = 'none';
        o = s.option(form.Value, 'ip', _('目标 DNS'));
        o.placeholder = '1.1.1.1';
        o = s.option(form.Value, 'port', _('端口'));
        o.datatype = 'port';
        o.placeholder = '53';
        o.rmempty = true;

        /* ─── 代理认证 ─── */
        s = m.section(form.TypedSection, 'authentication', _('代理认证'));
        s.addremove = true;
        s.anonymous = true;
        useInlineEmptyHint(s);

        o = s.option(form.Value, 'username', _('用户名'));
        o = s.option(form.Value, 'password', _('密码'));
        o.password = true;

        return m.render();
    },

    handleSaveApply: function (ev) {
        return this.handleSave(ev).then(function () {
            return Promise.resolve(ui.changes.apply(true)).then(function () {
                return clash.restart();
            });
        });
    },

    handleSave: function (ev) {
        if (!this._map)
            return Promise.resolve();
        return this._map.save(ev);
    },

    handleReset: function () {
        if (!this._map)
            return Promise.resolve();
        return this._map.reset();
    }
});
