'use strict';
'require view';
'require form';
'require rpc';
'require ui';
'require uci';
'require poll';
'require tools.clash as clash';

let callGetArch = rpc.declare({ object: 'luci.clash', method: 'get_cpu_arch', expect: { arch: '' } });


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
        function luminanceFromRgb(s) {
            if (!s) return null;
            let m = String(s).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
            if (!m) return null;
            let r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
            return (0.299 * r + 0.587 * g + 0.114 * b);
        }
        function firstSolidBg() {
            if (typeof window === 'undefined') return '';
            let sels = ['.main', '#maincontent', 'body', 'html'];
            for (let i = 0; i < sels.length; i++) {
                let el = document.querySelector(sels[i]);
                if (!el) continue;
                let bg = window.getComputedStyle(el).backgroundColor || '';
                if (!/rgba\(0,\s*0,\s*0,\s*0\)/i.test(bg) && bg !== 'transparent')
                    return bg;
            }
            return '';
        }
        function inferDarkMode() {
            if (typeof window === 'undefined') return false;
            let de = document.documentElement || null;
            let body = document.body || null;
            let rootStyle = de ? window.getComputedStyle(de) : null;
            let bodyStyle = body ? window.getComputedStyle(body) : null;
            let bodyColor = bodyStyle ? bodyStyle.color : '';
            let textLuma = luminanceFromRgb(bodyColor);
            let pageBg = firstSolidBg();
            let bgLuma = luminanceFromRgb(pageBg);
            let colorScheme = (rootStyle && rootStyle.colorScheme) ? String(rootStyle.colorScheme).toLowerCase() : '';
            let dataTheme = ((de && de.getAttribute('data-theme')) || (body && body.getAttribute('data-theme')) || '').toLowerCase();
            return (
                (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ||
                (de && /dark|night/i.test((de.className || '') + ' ' + (de.id || ''))) ||
                (body && /dark|night/i.test((body.className || '') + ' ' + (body.id || ''))) ||
                /dark/.test(dataTheme) ||
                /dark/.test(colorScheme) ||
                (textLuma !== null && textLuma > 170) ||
                (bgLuma !== null && bgLuma < 120)
            );
        }
        const isDark = inferDarkMode();
        const TAB_BG = isDark ? '#23272f' : '#e8eaed';
        const TAB_TEXT = isDark ? '#d2d8e1' : '#555';
        const TAB_ACTIVE_TEXT = isDark ? '#8db5ff' : '#4a76d4';
        const BORDER = isDark ? '#3a404c' : '#ddd';
        const LOG_BG = isDark ? '#1a1f27' : '#fafafa';
        const LOG_TEXT = isDark ? '#d6dbe5' : '#333';
        const LOG_BORDER = isDark ? '#3a404c' : '#d0d0d0';
        let statusBar = E('div', {
            style: 'margin:0 0 12px 0;padding:8px 10px;border-radius:6px;background:' + (isDark ? '#1f2937' : '#f7f9fc') + ';color:' + (isDark ? '#cbd5e1' : '#4b5563') + ';font-size:.92rem;display:none'
        }, '');

        function setActionStatus(msg, ok) {
            statusBar.style.display = '';
            if (isDark) {
                statusBar.style.background = ok ? '#0b2f26' : '#3a1f27';
                statusBar.style.color = ok ? '#86efac' : '#fca5a5';
            } else {
                statusBar.style.background = ok ? '#ecfdf5' : '#fef2f2';
                statusBar.style.color = ok ? '#065f46' : '#991b1b';
            }
            statusBar.textContent = msg;
        }

        m = new form.Map('clash', '');
        this._map = m;

        /* ─── 内核下载 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('内核下载'));
        s.description = _('从 GitHub 下载 Mihomo 内核二进制文件');
        s.anonymous = false;

        o = s.option(form.ListValue, 'dcore', _('版本类型'));
        o.value('2', 'mihomo（稳定版）');
        o.value('3', 'Alpha（预发布版）');
        o.default = '2';

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

        o = s.option(form.ListValue, 'core_mirror_prefix', _('下载镜像前缀'));
        o.value('', _('直连 GitHub（海外网络）'));
        o.value('https://gh-proxy.com/', 'gh-proxy（推荐）');
        o.value('https://mirror.ghproxy.com/', 'mirror.ghproxy');
        o.value('https://gh-proxy.net/', 'gh-proxy.net');
        o.default = 'https://gh-proxy.com/';
        o.description = _('自动拼接完整内核下载地址；普通用户只需选择镜像');

        o = s.option(form.Flag, 'core_download_advanced', _('显示高级下载选项'));
        o.default = '0';
        o.rmempty = false;
        o.description = _('仅排障时启用：可手动填写完整下载 URL');

        o = s.option(form.Value, 'core_download_url', _('内核完整下载链接（可选）'));
        o.placeholder = 'https://mirror.example.com/mihomo-linux-amd64-compatible-v1.19.10.gz';
        o.rmempty = true;
        o.description = _('填完整 URL 时优先使用该链接下载内核（不再拼接镜像前缀）');
        o.depends('core_download_advanced', '1');

        o = s.option(form.Button, '_download_core', _(''));
        o.inputtitle = _('下载内核');
        o.inputstyle = 'apply';
        o.onclick = function () {
            return m.save().then(() => clash.downloadCore()).then(() => {
                setActionStatus(_('下载任务已启动，请稍后查看更新日志'), true);
            }).catch(function(e) { setActionStatus('下载失败: ' + (e && e.message ? e.message : e), false); });
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
                setActionStatus(_('GeoIP 更新任务已启动'), true);
            }).catch(function(e) { setActionStatus('GeoIP 更新失败: ' + (e && e.message ? e.message : e), false); });
        };

        /* ─── 绕过 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('绕过'));
        s.anonymous = false;

        o = s.option(form.Flag, 'bypass_china', _('绕过中国大陆 IP'));
        o.default = '0';
        o.description = _('目标为中国大陆 IP 时直连，不经过代理');

        o = s.option(form.Value, 'china_ip_url', _('大陆 IPv4 段更新 URL'));
        o.placeholder = 'https://ispip.clang.cn/all_cn.txt';
        o.default     = 'https://ispip.clang.cn/all_cn.txt';
        o.rmempty     = true;
        o.depends('bypass_china', '1');

        o = s.option(form.Value, 'china_ipv6_url', _('大陆 IPv6 段更新 URL'));
        o.placeholder = 'https://ispip.clang.cn/all_cn_ipv6.txt';
        o.default     = 'https://ispip.clang.cn/all_cn_ipv6.txt';
        o.rmempty     = true;
        o.depends('bypass_china', '1');

        o = s.option(form.Button, '_update_china_ip', _(''));
        o.inputtitle = _('更新大陆白名单');
        o.inputstyle = 'apply';
        o.depends('bypass_china', '1');
        o.onclick = function () {
            return m.save().then(() => clash.updateChinaIp()).then(() => {
                setActionStatus(_('大陆白名单更新任务已启动，稍后可在更新日志中查看进度'), true);
            }).catch(function(e) { setActionStatus('大陆白名单更新失败: ' + (e && e.message ? e.message : e), false); });
        };

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
                function processLog(raw) {
                    if (!raw) return '';
                    return raw;
                }

                let stickBottom = false;

                let ta = E('textarea', {
                    style: 'width:100%;height:50vh;font-family:monospace;font-size:13px;padding:8px;resize:vertical;box-sizing:border-box;border:1px solid ' + LOG_BORDER + ';border-radius:4px;background:' + LOG_BG + ';color:' + LOG_TEXT + ';'
                }, [processLog(initialContent)]);

                let clearBtn = E('button', {
                    type: 'button',
                    class: 'btn cbi-button cbi-button-negative',
                    style: 'transition:all .18s ease'
                }, [_('清空日志')]);

                let scrollBtn = E('button', {
                    type: 'button',
                    class: 'btn cbi-button',
                    style: 'margin-left:8px',
                }, [_('回到底部')]);

                clearBtn.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    clearBtn.disabled = true;
                    let prevText = clearBtn.textContent;
                    let prevBg = clearBtn.style.background;
                    clearBtn.textContent = '清空中...';
                    clearBtn.style.background = '#f97316';
                    Promise.resolve(clearFn()).then(function () {
                        ta.value = '';
                        ta.scrollTop = 0;
                        stickBottom = false;
                        return readFn().then(function (c) {
                            ta.value = processLog(c);
                        });
                    }).then(function () {
                        clearBtn.textContent = '已清空';
                        clearBtn.style.background = '#10b981';
                        setTimeout(function () {
                            clearBtn.textContent = prevText;
                            clearBtn.style.background = prevBg;
                        }, 900);
                    }).catch(function (e) {
                        clearBtn.textContent = prevText;
                        clearBtn.style.background = prevBg;
                        setActionStatus('清空日志失败: ' + (e && e.message ? e.message : e), false);
                    }).finally(function () {
                        clearBtn.disabled = false;
                    });
                });

                scrollBtn.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    stickBottom = true;
                    ta.scrollTop = ta.scrollHeight;
                    requestAnimationFrame(function () {
                        ta.scrollTop = ta.scrollHeight;
                    });
                    let prevText = scrollBtn.textContent;
                    let prevBg = scrollBtn.style.background;
                    let prevColor = scrollBtn.style.color;
                    scrollBtn.textContent = '已到底部';
                    scrollBtn.style.background = '#20c997';
                    scrollBtn.style.color = '#fff';
                    setTimeout(function () {
                        scrollBtn.textContent = prevText;
                        scrollBtn.style.background = prevBg;
                        scrollBtn.style.color = prevColor;
                    }, 900);
                });

                let panel = E('div', { style: 'padding-top:12px' }, [
                    E('div', { style: 'margin-bottom:10px' }, [clearBtn, scrollBtn]),
                    ta
                ]);

                poll.add(function () {
                    return readFn().then(function (c) {
                        ta.value = processLog(c);
                        if (stickBottom)
                            ta.scrollTop = ta.scrollHeight;
                    }).catch(function() {});
                }, 5);

                return panel;
            }

            let panels = {
                run:    mkLogPanel(logContent,    () => clash.readLog(),       () => clash.clearLog()),
                update: mkLogPanel(updateContent, () => clash.readUpdateLog(), () => clash.clearUpdateLog()),
                geoip:  mkLogPanel(geoipContent,  () => clash.readGeoipLog(),  () => clash.clearGeoipLog())
            };

            /* ─── 子 Tab 样式（圆角灰底，激活蓝色下划线）─── */
            let TAB_STYLE_BASE   = 'cursor:pointer;padding:8px 18px;margin-right:6px;border-radius:6px 6px 0 0;font-size:14px;border:none;background:' + TAB_BG + ';color:' + TAB_TEXT + ';border-bottom:3px solid transparent;';
            let TAB_STYLE_ACTIVE = 'cursor:pointer;padding:8px 18px;margin-right:6px;border-radius:6px 6px 0 0;font-size:14px;border:none;background:' + TAB_BG + ';color:' + TAB_ACTIVE_TEXT + ';border-bottom:3px solid ' + TAB_ACTIVE_TEXT + ';font-weight:600;';

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
            let subBar = E('div', { style: 'border-bottom:2px solid ' + BORDER + ';margin-bottom:12px;padding-top:4px' },
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
            let topBar = E('div', { style: 'border-bottom:2px solid ' + BORDER + ';margin-bottom:16px;padding-top:4px' },
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
                statusBar,
                systemNode,
                logSection
            ]);
        });
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
