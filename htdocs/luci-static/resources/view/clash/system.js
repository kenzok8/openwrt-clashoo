'use strict';
'require view';
'require form';
'require rpc';
'require uci';
'require poll';
'require tools.clash as clash';

let callGetArch = rpc.declare({ object: 'luci.clash', method: 'get_cpu_arch', expect: { arch: '' } });
let callGetLogStatus = rpc.declare({ object: 'luci.clash', method: 'get_log_status' });

return view.extend({
    load: function () {
        return Promise.all([
            L.resolveDefault(callGetArch(), ''),
            uci.load('clash'),
            clash.readLog(),
            clash.readUpdateLog(),
            clash.readGeoipLog()
        ]);
    },

    render: function (data) {
        let cpuArch = (typeof data[0] === 'string' ? data[0] : (data[0]?.arch || '')).trim();
        let logContent    = data[2] || '';
        let updateContent = data[3] || '';
        let geoipContent  = data[4] || '';
        let m, s, o;

        m = new form.Map('clash', '');

        /* ─── 内核下载 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('内核下载'));
        s.description = _('从 GitHub 下载 Mihomo 内核二进制文件');
        s.anonymous = false;

        o = s.option(form.ListValue, 'dcore', _('版本类型'));
        o.value('2', 'mihomo（稳定版）');
        o.value('3', 'Alpha（预发布版）');
        o.default = '3';

        o = s.option(form.ListValue, 'download_core', _('CPU 架构'));
        o.value('aarch64_cortex-a53');
        o.value('aarch64_generic');
        o.value('arm_cortex-a7_neon-vfpv4');
        o.value('mipsel_24kc');
        o.value('mips_24kc');
        o.value('x86_64');
        o.value('riscv64');
        o.default = cpuArch || 'x86_64';
        o.description = cpuArch ? _('当前设备：<strong>%s</strong>').format(cpuArch) : '';

        o = s.option(form.Value, 'core_mirror_prefix', _('下载镜像前缀（可选）'));
        o.placeholder = 'https://gh-proxy.com/';
        o.rmempty = true;
        o.description = _('留空直连 GitHub；国内可填镜像前缀提升成功率');

        o = s.option(form.Button, '_download_core', _(''));
        o.inputtitle = _('下载内核');
        o.inputstyle = 'apply';
        o.onclick = function () {
            return m.save().then(() => clash.downloadCore()).then(() => {
                L.ui.addNotification(null, E('p', _('下载任务已启动，请稍后刷新查看结果')));
            });
        };

        /* ─── GeoIP / GeoSite ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('GeoIP / GeoSite 数据库'));
        s.description = _('Mihomo 使用 GeoIP/GeoSite 数据库进行规则匹配，建议定期更新');
        s.anonymous = false;

        o = s.option(form.Flag, 'auto_update_geoip', _('自动更新'));

        o = s.option(form.ListValue, 'auto_update_geoip_time', _('更新时间（每天几点）'));
        for (let i = 0; i <= 23; i++) o.value(String(i), i + ':00');
        o.default = '3';
        o.depends('auto_update_geoip', '1');

        o = s.option(form.Value, 'geoip_update_interval', _('更新周期（天）'));
        o.datatype = 'uinteger';
        o.default = '7';
        o.depends('auto_update_geoip', '1');

        o = s.option(form.ListValue, 'geoip_source', _('数据来源'));
        o.value('2', '默认简化源（推荐）');
        o.value('3', 'OpenClash 社区源');
        o.value('1', 'MaxMind 官方');
        o.value('4', '自定义订阅');
        o.default = '2';

        o = s.option(form.ListValue, 'geoip_format', _('GeoIP 格式'));
        o.value('mmdb', 'MMDB（推荐）');
        o.value('dat', 'DAT');
        o.default = 'mmdb';

        o = s.option(form.ListValue, 'geodata_loader', _('加载模式'));
        o.value('standard', '标准');
        o.value('memconservative', '节省内存');
        o.default = 'standard';
        o.description = _('内存受限设备可选"节省内存"');

        o = s.option(form.Value, 'license_key', _('MaxMind 授权密钥'));
        o.rmempty = true;
        o.depends('geoip_source', '1');

        o = s.option(form.Value, 'geoip_mmdb_url', _('GeoIP（MMDB）订阅链接'));
        o.rmempty = true;
        o.placeholder = 'https://raw.githubusercontent.com/alecthw/mmdb_china_ip_list/release/Country.mmdb';
        o.depends('geoip_source', '2');
        o.depends('geoip_source', '4');

        o = s.option(form.Value, 'geosite_url', _('GeoSite 订阅链接'));
        o.rmempty = true;
        o.placeholder = 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat';
        o.depends('geoip_source', '2');
        o.depends('geoip_source', '3');
        o.depends('geoip_source', '4');

        o = s.option(form.Value, 'geoip_dat_url', _('GeoIP（DAT）订阅链接'));
        o.rmempty = true;
        o.placeholder = 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat';
        o.depends('geoip_source', '2');
        o.depends('geoip_source', '3');
        o.depends('geoip_source', '4');

        o = s.option(form.Button, '_update_geoip', _(''));
        o.inputtitle = _('立即更新 GeoIP');
        o.inputstyle = 'apply';
        o.onclick = function () {
            return m.save().then(() => clash.updateGeoip()).then(() => {
                L.ui.addNotification(null, E('p', _('GeoIP 更新任务已启动')));
            });
        };

        /* ─── 绕过 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('绕过'));
        s.anonymous = false;

        o = s.option(form.Flag, 'bypass_china', _('绕过中国大陆 IP'));
        o.default = '0';
        o.description = _('目标为中国大陆 IP 时直连，不经过代理（需要 /usr/share/clash/china_ip.txt）');

        o = s.option(form.Value, 'proxy_tcp_dport', _('要代理的 TCP 目标端口'));
        o.optional    = true;
        o.placeholder = _('全部端口');
        o.description = _('仅代理指定 TCP 端口，留空表示全部；可填多个空格分隔，如：80 443 8080');

        o = s.option(form.Value, 'proxy_udp_dport', _('要代理的 UDP 目标端口'));
        o.optional    = true;
        o.placeholder = _('全部端口');
        o.description = _('仅代理指定 UDP 端口，留空表示全部；可填多个空格分隔，如：443 8443');

        o = s.option(form.DynamicList, 'bypass_dscp', _('绕过 DSCP'));
        o.datatype = 'range(0, 63)';
        o.rmempty  = true;
        o.description = _('此 DSCP 标记的流量不走代理，范围 0–63');

        o = s.option(form.DynamicList, 'bypass_fwmark', _('绕过 FWMark'));
        o.rmempty  = true;
        o.description = _('此防火墙标记的流量不走代理');

        /* ─── 局域网访问控制 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('局域网访问控制'));
        s.description = _('控制哪些局域网设备走代理（按来源 IP 过滤）');
        s.anonymous = false;

        o = s.option(form.ListValue, 'access_control', _('控制模式'));
        o.value('0', '关闭（所有设备走代理）');
        o.value('1', '白名单（仅列表中的设备走代理）');
        o.value('2', '黑名单（列表中的设备不走代理）');
        o.default = '0';

        o = s.option(form.DynamicList, 'proxy_lan_ips', _('白名单设备 IP'));
        o.datatype = 'ip4addr';
        o.rmempty  = true;
        o.retain   = true;
        o.description = _('支持 CIDR，如 192.168.1.100 或 192.168.2.0/24');
        o.depends('access_control', '1');

        o = s.option(form.DynamicList, 'reject_lan_ips', _('黑名单设备 IP'));
        o.datatype = 'ip4addr';
        o.rmempty  = true;
        o.retain   = true;
        o.description = _('支持 CIDR，如 192.168.1.200 或 192.168.3.0/24');
        o.depends('access_control', '2');

        /* ─── 自动化任务 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('自动化任务'));
        s.anonymous = false;

        o = s.option(form.Flag, 'auto_update', _('自动更新订阅'));
        o.description = _('定时拉取当前使用的订阅配置');

        o = s.option(form.ListValue, 'auto_update_time', _('更新频率'));
        o.value('1',  '每 1 天');
        o.value('7',  '每 7 天');
        o.value('10', '每 10 天');
        o.value('30', '每 30 天');
        o.default = '7';
        o.depends('auto_update', '1');

        o = s.option(form.Flag, 'auto_clear_log', _('自动清理日志'));

        o = s.option(form.ListValue, 'clear_time', _('清理频率'));
        o.value('1',  '每 1 天');
        o.value('7',  '每 7 天');
        o.value('10', '每 10 天');
        o.value('30', '每 30 天');
        o.default = '7';
        o.depends('auto_clear_log', '1');

        return m.render().then(function (systemNode) {
            /* ─── 日志 Tab 工具函数 ─── */
            function mkLogPanel(initialContent, readFn, clearFn) {
                let ta = E('textarea', {
                    style: 'width:100%;height:50vh;font-family:monospace;font-size:13px;padding:8px;resize:vertical;box-sizing:border-box;border:1px solid #d0d0d0;border-radius:4px;background:#fafafa;color:#333;'
                }, [initialContent]);
                ta.scrollTop = ta.scrollHeight;

                let clearBtn = E('button', {
                    class: 'btn cbi-button cbi-button-negative',
                    onclick: function () { ta.value = ''; return clearFn(); }
                }, [_('清空日志')]);

                let scrollBtn = E('button', {
                    class: 'btn cbi-button',
                    style: 'margin-left:8px',
                    onclick: function () { ta.scrollTop = ta.scrollHeight; }
                }, [_('滚动到底部')]);

                let panel = E('div', { style: 'padding-top:12px' }, [
                    E('div', { style: 'margin-bottom:10px' }, [clearBtn, scrollBtn]),
                    ta
                ]);

                poll.add(function () {
                    return readFn().then(function (c) { ta.value = c; });
                }, 5);

                return panel;
            }

            let panels = {
                run:    mkLogPanel(logContent,    () => clash.readLog(),       () => clash.clearLog()),
                update: mkLogPanel(updateContent, () => clash.readUpdateLog(), () => clash.clearUpdateLog()),
                geoip:  mkLogPanel(geoipContent,  () => clash.readGeoipLog(),  () => clash.clearGeoipLog())
            };

            /* ─── 子 Tab 样式（圆角灰底，激活蓝色下划线）─── */
            let TAB_STYLE_BASE   = 'cursor:pointer;padding:8px 18px;margin-right:6px;border-radius:6px 6px 0 0;font-size:14px;border:none;background:#e8eaed;color:#555;border-bottom:3px solid transparent;';
            let TAB_STYLE_ACTIVE = 'cursor:pointer;padding:8px 18px;margin-right:6px;border-radius:6px 6px 0 0;font-size:14px;border:none;background:#e8eaed;color:#4a76d4;border-bottom:3px solid #4a76d4;font-weight:600;';

            function mkBtn(label, active) {
                return E('button', { type: 'button', style: active ? TAB_STYLE_ACTIVE : TAB_STYLE_BASE }, [label]);
            }

            /* ─── 三级子 Tab ─── */
            let subTabs = [
                { key: 'run',    label: _('运行日志') },
                { key: 'update', label: _('更新日志') },
                { key: 'geoip',  label: _('GeoIP 日志') }
            ];

            let subBtns = {};
            let subBar = E('div', { style: 'border-bottom:2px solid #ddd;margin-bottom:12px;padding-top:4px' },
                subTabs.map(function (t) {
                    let b = mkBtn(t.label, t.key === 'run');
                    subBtns[t.key] = b;
                    b.addEventListener('click', function () { switchSub(t.key); });
                    return b;
                })
            );

            function switchSub(key) {
                subTabs.forEach(function (t) {
                    subBtns[t.key].style.cssText = t.key === key ? TAB_STYLE_ACTIVE : TAB_STYLE_BASE;
                    panels[t.key].style.display = t.key === key ? '' : 'none';
                });
            }
            switchSub('run');

            let logSection = E('div', {}, [subBar, panels.run, panels.update, panels.geoip]);

            /* ─── 顶层 Tab（系统设置 / 系统日志）─── */
            let topBtns = {};
            let topDefs = [
                { key: 'system', label: _('系统设置') },
                { key: 'log',    label: _('系统日志') }
            ];
            let topBar = E('div', { style: 'border-bottom:2px solid #ddd;margin-bottom:16px;padding-top:4px' },
                topDefs.map(function (t) {
                    let b = mkBtn(t.label, t.key === 'system');
                    topBtns[t.key] = b;
                    b.addEventListener('click', function () { switchTop(t.key); });
                    return b;
                })
            );

            function switchTop(key) {
                topDefs.forEach(function (t) {
                    topBtns[t.key].style.cssText = t.key === key ? TAB_STYLE_ACTIVE : TAB_STYLE_BASE;
                });
                systemNode.style.display = key === 'system' ? '' : 'none';
                logSection.style.display = key === 'log'    ? '' : 'none';
            }
            switchTop('system');

            return E('div', {}, [
                E('h2', { style: 'margin-bottom:12px' }, [_('系统设置')]),
                topBar,
                systemNode,
                logSection
            ]);
        });
    },

    handleSaveApply: function (ev) {
        return this.handleSave(ev).then(() => clash.restart());
    }
});
