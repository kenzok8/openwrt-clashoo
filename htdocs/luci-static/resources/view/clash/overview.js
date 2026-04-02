'use strict';
'require view';
'require poll';
'require tools.clash as clash';

/* ── 常量 ── */
const UI_LOCK_MS      = 3000;   /* 按钮点击后 UI 锁定时长 */
const PROBE_TIMEOUT   = 5000;   /* 连接探测超时(ms) */
const PROBE_INTERVAL  = 30;     /* 探测轮询间隔(s) */
const STATUS_INTERVAL = 3;      /* 状态轮询间隔(s) */
const PROBE_HISTORY   = 15;     /* 每站点最大历史记录条数 */
const LATENCY_WARN    = 300;    /* 延迟黄色阈值(ms) */

const COLORS = {
    running:   '#1f8b4c',   /* 运行中/绿色 */
    stopped:   '#b58900',   /* 已停止/琥珀 */
    primary:   '#4a76d4',   /* 主操作按钮 */
    secondary: '#adb5bd',   /* 次操作按钮 */
    success:   '#28a745',   /* 延迟正常 */
    warning:   '#ffc107',   /* 延迟偏高 */
    danger:    '#dc3545',   /* 超时/错误 */
    muted:     '#adb5bd',   /* 禁用态 */
    accent:    '#0d8f5b',   /* 更新面板按钮 */
    intl:      '#20c997',   /* 国外标签 */
    domestic:  '#20c997',   /* 国内标签 */
    textMuted: '#aaa',      /* 副标题/灰色文字 */
    textLight: '#777',      /* 滚动日志文字 */
    textLabel: '#555',      /* 表格标签 */
    textNone:  '#999',      /* 无数据 */
};

const PROBE_SITES = [
    { id: 'wechat',    label: '微信',     type: '国内',
      url: 'https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico',
      icon: 'https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico' },
    { id: 'youtube',   label: 'YouTube',  type: '国外',
      url: 'https://www.youtube.com/favicon.ico',
      icon: 'https://www.youtube.com/favicon.ico' },
];

return view.extend({
    load: function () {
        return Promise.all([
            clash.status(),
            clash.listConfigs()
        ]);
    },

    render: function (data) {
        const cfgData = data[1] || {};

        /* ── helpers ── */
        function mkSel(id, opts, cur, onChange) {
            let sel = E('select', {
                id: id,
                class: 'cbi-input-select',
                style: 'width:100%;max-width:360px;box-sizing:border-box'
            });
            for (let [v, label] of opts) {
                let o = E('option', { value: v }, label);
                if (v === cur) o.selected = true;
                sel.appendChild(o);
            }
            sel.addEventListener('change', () => onChange(sel.value));
            return sel;
        }

        const BTN_STYLE = [
            'display:inline-block',
            'width:90px',
            'height:36px',
            'line-height:36px',
            'padding:0 6px',
            'border:none',
            'border-radius:.375rem',
            'font-size:.9rem',
            'cursor:pointer',
            'color:#fff',
            'text-align:center',
            'white-space:nowrap',
            'box-sizing:border-box'
        ].join(';');

        function mkBtn(label, bg, onClick) {
            let b = E('button', {
                type: 'button',
                style: BTN_STYLE + ';background:' + bg
            }, label);
            if (onClick) b.addEventListener('click', onClick);
            return b;
        }

        function mkBtnGroup() {
            return E('div', {
                style: 'display:inline-flex;gap:6px;align-items:center'
            });
        }

        function mkRow(label, tdId) {
            return E('tr', {}, [
                E('td', { style: 'width:35%;padding:8px 12px;color:#555;font-size:14px;vertical-align:middle;white-space:nowrap' }, label),
                E('td', { id: tdId, style: 'padding:6px 12px;vertical-align:middle' })
            ]);
        }

        let _uiLockUntil = 0;   /* 按钮点击后短暂禁止重渲染 */
        let _isRunning   = false;
        /* diff-update: 缓存上次状态，只在数据变化时重绘 */
        let _prev = {};
        let _firstRender = true;

        /* ── structure ── */
        let node = E('div', {}, [
            E('div', { class: 'cbi-section' }, [
                E('div', { style: 'text-align:center;padding:10px 0 4px' }, [
                    E('img', {
                        src: '/luci-static/clash/logo.png',
                        style: 'width:48px;height:48px;object-fit:contain;display:block;margin:0 auto 4px',
                        onerror: "this.style.display='none'",
                        alt: 'Clash'
                    }),
                    /* 标题 = 实时日志滚动区，运行时变绿 */
                    E('p', { id: 'ov-title', style: 'margin:0;font-weight:700;font-size:1.1rem;color:#aaa;letter-spacing:.02em;transition:color .4s' }, 'Clashoo'),
                    E('p', { style: 'margin:2px 0 0;font-size:.82rem;color:#aaa' }, '基于规则的自定义代理客户端')
                ]),
                /* 连接测试 — 紧跟副标题 */
                E('div', {
                    id: 'probe-grid',
                    style: 'display:flex;gap:10px;padding:8px 12px 4px;max-width:600px;margin:0 auto'
                }),
                E('hr', { style: 'border:none;border-top:1px solid #eee;margin:8px 0 4px' }),
                E('div', { class: 'cbi-section-node' }, [
                    E('table', { style: 'width:100%;border-collapse:collapse' }, [
                        mkRow('客户端',    'ov-client'),
                        mkRow('运行模式',  'ov-mode'),
                        mkRow('配置文件',  'ov-config'),
                        mkRow('代理模式',  'ov-proxy'),
                        mkRow('面板类型',  'ov-panel'),
                        mkRow('面板控制',  'ov-panel-addr')
                    ])
                ])
            ])
        ]);

        /* ── 每秒轮询 clash_real.txt → 滚动显示在标题，稳定后变回 "Clashoo" ── */
        let _lastRealLog  = '';
        let _stableTicks  = 0;

        function $id(id) {
            if (document.contains(node)) return document.getElementById(id);
            return node.querySelector('#' + id);
        }

        poll.add(function () {
            return clash.readRealLog().then(function (c) {
                let title = $id('ov-title');
                if (!title) return;
                let text = (c || '').trim();

                /* 规范化：只把最终稳定值替换为 "Clashoo" */
                if (/Clash\s+for\s+OpenWRT/i.test(text)) text = 'Clashoo';
                if (text === 'mihomo' || text === 'Clashoo') text = 'Clashoo';
                if (!text) text = 'Clashoo';

                if (text === _lastRealLog) {
                    _stableTicks++;
                } else {
                    _lastRealLog = text;
                    _stableTicks = 0;
                }

                /* 文字是 "Clashoo" 或稳定3秒 → 显示 "Clashoo"，颜色跟运行状态 */
                if (text === 'Clashoo' || _stableTicks >= 3) {
                    title.textContent = 'Clashoo';
                    title.style.color = _isRunning ? COLORS.running : COLORS.textMuted;
                } else {
                    title.textContent = text;
                    title.style.color = COLORS.textLight;
                }
            }).catch(function() {});
        }, 1);

        /* ── render dynamic ── */
        function update(s) {
            const running   = !!s.running;
            _isRunning = running;
            const locked    = Date.now() < _uiLockUntil;
            const configs   = cfgData.configs || [];
            const curConf   = cfgData.current || s.conf_path || '';
            const modeValue = s.mode_value  || 'fake-ip';
            const proxyMode = s.proxy_mode  || 'rule';
            const panelType = s.panel_type  || 'metacubexd';
            const dashPort  = s.dash_port   || '9090';
            const dashPass  = s.dash_pass   || '';
            const localIp   = s.local_ip    || location.hostname;
            const dashOk    = !!s.dashboard_installed || !!s.yacd_installed;

            /* Client — only rebuild when running state changes */
            let elClient = $id('ov-client');
            if (elClient && !locked && (_firstRender || _prev.running !== running)) {
                _prev.running = running;
                elClient.innerHTML = '';
                let grp = mkBtnGroup();
                grp.appendChild(mkBtn(running ? '运行中' : '已停止',
                    running ? COLORS.running : COLORS.stopped, null));
                grp.appendChild(running
                    ? mkBtn('停止客户端', COLORS.secondary, () => {
                        _uiLockUntil = Date.now() + UI_LOCK_MS;
                        _prev.running = undefined;
                        clash.stop().catch(function(e) { L.ui.addNotification(null, E('p', '操作失败: ' + e.message)); });
                      })
                    : mkBtn('启用客户端', COLORS.primary, () => {
                        _uiLockUntil = Date.now() + UI_LOCK_MS;
                        _prev.running = undefined;
                        clash.start().catch(function(e) { L.ui.addNotification(null, E('p', '操作失败: ' + e.message)); });
                      }));
                elClient.appendChild(grp);
            }

            /* Mode — only rebuild when value changes */
            let elMode = $id('ov-mode');
            if (elMode && (_firstRender || _prev.mode !== modeValue)) {
                _prev.mode = modeValue;
                elMode.innerHTML = '';
                elMode.appendChild(mkSel('sel-mode', [
                    ['fake-ip', 'Fake-IP'],
                    ['tun',     'TUN 模式'],
                    ['mixed',   '混合模式']
                ], modeValue, v => clash.setMode(v)));
            }

            /* Config — only rebuild when config list or selection changes */
            let cfgKey = configs.join(',') + '|' + curConf;
            let elCfg = $id('ov-config');
            if (elCfg && (_firstRender || _prev.cfgKey !== cfgKey)) {
                _prev.cfgKey = cfgKey;
                elCfg.innerHTML = '';
                let opts = configs.length ? configs.map(c => [c, c]) : [['', '（无配置）']];
                if (curConf && !configs.includes(curConf)) opts.unshift([curConf, curConf]);
                elCfg.appendChild(mkSel('sel-config', opts, curConf,
                    v => v && clash.setConfig(v)));
            }

            /* Proxy mode — only rebuild when value changes */
            let elProxy = $id('ov-proxy');
            if (elProxy && (_firstRender || _prev.proxy !== proxyMode)) {
                _prev.proxy = proxyMode;
                elProxy.innerHTML = '';
                elProxy.appendChild(mkSel('sel-proxy', [
                    ['rule',   '规则模式'],
                    ['global', '全局模式'],
                    ['direct', '直连模式']
                ], proxyMode, v => clash.setProxyMode(v)));
            }

            /* Panel type — only rebuild when value changes */
            let elPanel = $id('ov-panel');
            if (elPanel && (_firstRender || _prev.panel !== panelType)) {
                _prev.panel = panelType;
                elPanel.innerHTML = '';
                elPanel.appendChild(mkSel('sel-panel', [
                    ['metacubexd', 'MetaCubeXD Panel'],
                    ['yacd',       'YACD Panel'],
                    ['zashboard',  'Zashboard'],
                    ['razord',     'Razord']
                ], panelType, v => clash.setPanel(v)));
            }

            /* Panel address — only rebuild when relevant data changes */
            let addrKey = panelType + '|' + dashPort + '|' + dashPass + '|' + localIp + '|' + dashOk;
            let elAddr = $id('ov-panel-addr');
            if (elAddr && (_firstRender || _prev.addrKey !== addrKey)) {
                _prev.addrKey = addrKey;
                elAddr.innerHTML = '';
                let authSuffix = dashPass ? '?secret=' + encodeURIComponent(dashPass) : '';
                let panelUrl   = 'http://' + localIp + ':' + dashPort + '/ui' + authSuffix;
                let grp = mkBtnGroup();
                grp.appendChild(mkBtn('更新面板', COLORS.accent, () => clash.updatePanel(panelType)));
                if (dashOk) {
                    let a = E('a', {
                        href: panelUrl, target: '_blank', rel: 'noopener',
                        style: BTN_STYLE + ';background:' + COLORS.muted + ';text-decoration:none'
                    }, '打开面板');
                    grp.appendChild(a);
                } else {
                    grp.appendChild(mkBtn('打开面板', COLORS.muted, null));
                }
                elAddr.appendChild(grp);
            }
            _firstRender = false;
        }

        update(data[0] || {});
        poll.add(() => clash.status().then(s => update(s)).catch(function() {}), STATUS_INTERVAL);

        /* ── 访问检查 ── */
        let _probeHistory = {};

        function renderProbeCard(site) {
            let history = _probeHistory[site.id] || [];
            let latest  = history[history.length - 1];

            let isIntl      = site.type === '国外';
            let isSmall = (typeof window !== 'undefined' && window.innerWidth < 480);
            let pad = isSmall ? '2px 6px' : '2px 8px';
            let fs  = isSmall ? '.66rem' : '.72rem';
            let badgeStyle  = 'font-size:' + fs + ';padding:' + pad + ';border-radius:999px;border:1.5px solid;font-weight:600;' +
                (isIntl ? 'color:' + COLORS.intl + ';border-color:' + COLORS.intl : 'color:' + COLORS.domestic + ';border-color:' + COLORS.domestic);
            let latencyColor = !latest ? COLORS.textNone
                : !latest.ok           ? COLORS.danger
                : latest.ms < LATENCY_WARN ? COLORS.success : COLORS.warning;
            let latencyText  = !latest ? '--' : !latest.ok ? 'timeout' : latest.ms + 'ms';

            return E('div', {
                id: 'probe-card-' + site.id,
                style: 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:8px;background:#f8f9fa;flex:1'
            }, [
                E('div', { style: 'display:flex;align-items:center;gap:8px' }, [
                    E('img', {
                        src: site.icon,
                        style: 'width:20px;height:20px;object-fit:contain;border-radius:3px',
                        onerror: "this.style.display='none'"
                    }),
                    E('span', { style: 'font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px' }, site.label)
                ]),
                E('div', { style: 'display:flex;align-items:center;gap:8px' }, [
                    E('span', { style: badgeStyle }, site.type),
                    E('span', { style: 'font-weight:600;font-size:13px;min-width:48px;text-align:right;color:' + latencyColor }, latencyText)
                ])
            ]);
        }

        async function probeSite(site) {
            let ctrl  = new AbortController();
            let timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT);
            let t0    = performance.now();
            try {
                await fetch(site.url, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
                clearTimeout(timer);
                return { ms: Math.round(performance.now() - t0), ok: true };
            } catch(e) {
                clearTimeout(timer);
                return { ms: PROBE_TIMEOUT, ok: false };
            }
        }

        async function probeAll() {
            let grid = $id('probe-grid');
            if (!grid) return;
            let results = await Promise.all(PROBE_SITES.map(s => probeSite(s)));
            for (let i = 0; i < PROBE_SITES.length; i++) {
                let site = PROBE_SITES[i];
                if (!_probeHistory[site.id]) _probeHistory[site.id] = [];
                _probeHistory[site.id].push(results[i]);
                if (_probeHistory[site.id].length > PROBE_HISTORY) _probeHistory[site.id].shift();
                let old = $id('probe-card-' + site.id);
                if (old) old.replaceWith(renderProbeCard(site));
            }
        }

        /* 先渲染占位卡片（显示 --），不阻塞页面 */
        for (let site of PROBE_SITES) {
            let grid = $id('probe-grid');
            if (grid) grid.appendChild(renderProbeCard(site));
        }
        /* 异步探测，完成后更新卡片 */
        setTimeout(function() { probeAll(); }, 100);
        poll.add(function() { return probeAll().catch(function() {}); }, PROBE_INTERVAL);

        return node;
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
