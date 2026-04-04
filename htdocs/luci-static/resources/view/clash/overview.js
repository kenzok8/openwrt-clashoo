'use strict';
'require view';
'require poll';
'require tools.clash as clash';

/* ── 常量 ── */
const UI_LOCK_MS      = 3000;   /* 按钮点击后 UI 锁定时长 */
const PROBE_INTERVAL  = 90;     /* 探测轮询间隔(s) */
const PROBE_START_DELAY = 1200; /* 首次探测延迟(ms) */
const STATUS_INTERVAL = 8;      /* 状态轮询间隔(s) */
const STATUS_TIMEOUT_MS = 1200; /* 状态查询超时(ms) */
const CFG_TIMEOUT_MS = 1200;    /* 配置列表超时(ms) */
const REALLOG_TIMEOUT_MS = 900; /* 实时日志超时(ms) */
const REALLOG_INTERVAL = 10;    /* 实时日志轮询间隔(s) */
const PROBE_HISTORY   = 15;     /* 每站点最大历史记录条数 */
const LATENCY_WARN    = 300;    /* 延迟黄色阈值(ms) */

const COLORS = {
    running:   '#20c997',   /* 运行中/绿色 */
    stopped:   '#b58900',   /* 已停止/琥珀 */
    primary:   '#4a76d4',   /* 主操作按钮 */
    secondary: '#adb5bd',   /* 次操作按钮 */
    success:   '#28a745',   /* 延迟正常 */
    warning:   '#ffc107',   /* 延迟偏高 */
    danger:    '#dc3545',   /* 超时/错误 */
    muted:     '#adb5bd',   /* 禁用态 */
    accent:    '#20c997',   /* 更新面板按钮 */
    intl:      '#20c997',   /* 国外标签 */
    domestic:  '#20c997',   /* 国内标签 */
    textMuted: '#aaa',      /* 副标题/灰色文字 */
    textLight: '#777',      /* 滚动日志文字 */
    textLabel: '#555',      /* 表格标签 */
    textNone:  '#999',      /* 无数据 */
};

const PROBE_SITES = [
    { id: 'wechat',  label: '微信',    type: '国内', icon: 'https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico' },
    { id: 'youtube', label: 'YouTube', type: '国外', icon: 'https://www.youtube.com/favicon.ico' }
];

const START_STEPS = [
    '启动客户端',
    '正在检查配置文件',
    '设置 mihomo 网络规则',
    '设置dns转发器 / 启用自定义DNS',
    '设置Cron → Clash 计划任务,启动进程守护程序...',
    '重启 Dnsmasq 程序',
    'Clash 启动成功，请等待服务器上线！'
];

const STOP_STEPS = [
    '正在停止客户端...',
    '清理 mihomo 网络规则',
    '禁用dns缓存',
    'Clash 停止进程守护程序',
    '删除Cron',
    '重启 Dnsmasq 程序'
];

const ACTION_MIN_VISIBLE_MS = 6000;
const ACTION_STABLE_POLLS = 2;
const ENABLE_AUTO_PROBE = false;

return view.extend({
    load: function () {
        function timeoutResolve(ms, fallback) {
            return new Promise(function(resolve) {
                setTimeout(function() { resolve(fallback); }, ms);
            });
        }

        return Promise.all([
            Promise.race([
                clash.status(),
                timeoutResolve(STATUS_TIMEOUT_MS, {})
            ]).catch(function() { return {}; }),
            Promise.race([
                clash.listConfigs(),
                timeoutResolve(CFG_TIMEOUT_MS, { configs: [], current: '' })
            ]).catch(function() { return { configs: [], current: '' }; })
        ]);
    },

    render: function (data) {
        const cfgData = data[1] || {};
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
        const PAGE_BG = firstSolidBg() || '';
        const BG_CARD = PAGE_BG && PAGE_BG !== 'transparent' ? PAGE_BG : (isDark ? '#1f232b' : '#ffffff');
        const BORDER_SOFT = isDark ? '#3a404c' : '#e5e7eb';
        const TEXT_SUB = isDark ? '#aeb7c3' : '#aaa';
        const TEXT_LABEL = isDark ? '#c6cfda' : '#555';
        const DIVIDER = isDark ? '#323844' : '#eee';

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
                E('td', { style: 'width:35%;padding:8px 12px;color:' + TEXT_LABEL + ';font-size:14px;vertical-align:middle;white-space:nowrap' }, label),
                E('td', { id: tdId, style: 'padding:6px 12px;vertical-align:middle' })
            ]);
        }

        let _uiLockUntil = 0;   /* 按钮点击后短暂禁止重渲染 */
        let _isRunning   = false;
        let _actionState = '';
        let _actionTimer = null;
        let _actionIndex = 0;
        let _actionStartedAt = 0;
        let _actionStableTicks = 0;
        let _actionErrorUntil = 0;
        /* diff-update: 缓存上次状态，只在数据变化时重绘 */
        let _prev = {};
        let _firstRender = true;

        /* ── structure ── */
        let node = E('div', {}, [
            E('div', { class: 'cbi-section' }, [
                E('div', { style: 'text-align:center;padding:10px 0 4px' }, [
                    E('img', {
                        src: '/luci-static/clash/logo.png?v=3',
                        style: 'width:48px;height:48px;object-fit:contain;display:block;margin:0 auto 4px;background:transparent;border:none;box-shadow:none',
                        onerror: "this.style.display='none'",
                        alt: 'Clash'
                    }),
                    /* 标题 = 实时日志滚动区，运行时变绿 */
                    E('p', { id: 'ov-title', style: 'margin:0;min-height:20px;font-weight:500;font-size:.9rem;color:#777;line-height:1.25;letter-spacing:.01em;transition:color .3s' }, 'Clashoo'),
                    E('p', { style: 'margin:2px 0 0;font-size:.82rem;color:' + TEXT_SUB }, '基于规则的自定义代理客户端')
                ]),
                /* 连接测试 — 紧跟副标题 */
                E('div', {
                    id: 'probe-grid',
                    style: 'display:flex;gap:10px;padding:8px 12px 4px;max-width:760px;margin:0 auto;flex-wrap:wrap'
                }),
                E('hr', { style: 'border:none;border-top:1px solid ' + DIVIDER + ';margin:8px 0 4px' }),
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

        function stopActionTicker() {
            if (_actionTimer) {
                clearInterval(_actionTimer);
                _actionTimer = null;
            }
            _actionState = '';
            _actionIndex = 0;
            _actionStartedAt = 0;
            _actionStableTicks = 0;
        }

        function startActionTicker(state) {
            stopActionTicker();
            _actionState = state;
            _actionIndex = 0;
            _actionStartedAt = Date.now();
            _actionStableTicks = 0;
            let title = $id('ov-title');
            let seq = state === 'starting' ? START_STEPS : STOP_STEPS;
            if (title && seq.length > 0) {
                title.textContent = seq[0];
                title.style.color = COLORS.textLight;
            }
            _actionTimer = setInterval(function () {
                let t = $id('ov-title');
                if (!t || !_actionState) return;
                if (_actionIndex < seq.length - 1)
                    _actionIndex++;
                t.textContent = seq[_actionIndex];
                t.style.color = COLORS.textLight;
            }, 900);
        }

        function renderLockedClient(elClient, running) {
            if (!elClient) return;
            elClient.innerHTML = '';
            let grp = mkBtnGroup();
            grp.appendChild(mkBtn(running ? '运行中' : '已停止', running ? COLORS.running : COLORS.stopped, null));
            grp.appendChild(mkBtn(_actionState === 'starting' ? '启动中' : '停止中', COLORS.muted, null));
            elClient.appendChild(grp);
        }

        function showActionError(msg) {
            let title = $id('ov-title');
            if (!title) return;
            _actionErrorUntil = Date.now() + 4000;
            title.textContent = msg;
            title.style.color = COLORS.danger;
            setTimeout(function () {
                if (!_actionState && Date.now() >= _actionErrorUntil) {
                    title.textContent = 'Clashoo';
                    title.style.color = _isRunning ? COLORS.running : COLORS.textMuted;
                }
            }, 4100);
        }

        function $id(id) {
            if (document.contains(node)) return document.getElementById(id);
            return node.querySelector('#' + id);
        }

        poll.add(function () {
            if (!document.contains(node)) return Promise.resolve();
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return Promise.resolve();
            if (!_isRunning && !_actionState) return Promise.resolve();
            return Promise.race([
                clash.readRealLog(),
                new Promise(function(resolve) { setTimeout(function() { resolve(''); }, REALLOG_TIMEOUT_MS); })
            ]).then(function (c) {
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
                if (_actionState) {
                    return;
                }

                if (Date.now() < _actionErrorUntil) {
                    return;
                }

                if (text === 'Clashoo' || _stableTicks >= 3) {
                    title.textContent = 'Clashoo';
                    title.style.color = _isRunning ? COLORS.running : COLORS.textMuted;
                } else {
                    title.textContent = text;
                    title.style.color = COLORS.textLight;
                }
            }).catch(function() {});
        }, REALLOG_INTERVAL);

        /* ── render dynamic ── */
        function update(s) {
            const running   = !!s.running;
            const prevRunning = _prev.running;
            const actionElapsed = _actionStartedAt ? (Date.now() - _actionStartedAt) : 0;
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

            if (_actionState === 'starting') {
                if (running)
                    _actionStableTicks++;
                else
                    _actionStableTicks = 0;
                if (actionElapsed > ACTION_MIN_VISIBLE_MS && _actionStableTicks >= ACTION_STABLE_POLLS)
                    stopActionTicker();
            }
            if (_actionState === 'stopping') {
                if (running === false)
                    _actionStableTicks++;
                else
                    _actionStableTicks = 0;
                if (actionElapsed > ACTION_MIN_VISIBLE_MS && _actionStableTicks >= ACTION_STABLE_POLLS)
                    stopActionTicker();
            }

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
                        _uiLockUntil = Date.now() + 12000;
                        _prev.running = undefined;
                        startActionTicker('stopping');
                        renderLockedClient($id('ov-client'), true);
                        clash.stop().catch(function(e) {
                            stopActionTicker();
                            showActionError('停止失败: ' + (e && e.message ? e.message : e));
                        });
                      })
                    : mkBtn('启用客户端', COLORS.primary, () => {
                        if (!configs.length || !curConf) {
                            stopActionTicker();
                            showActionError('请添加配置文件');
                            return;
                        }
                        _uiLockUntil = Date.now() + 12000;
                        _prev.running = undefined;
                        startActionTicker('starting');
                        renderLockedClient($id('ov-client'), false);
                        clash.start().then(function(r) {
                            if (r && r.success === false) {
                                stopActionTicker();
                                showActionError(r.message || '请添加配置文件');
                            }
                        }).catch(function(e) {
                            stopActionTicker();
                            showActionError('启动失败: ' + (e && e.message ? e.message : e));
                        });
                      }));
                elClient.appendChild(grp);
            }
            else if (elClient && locked) {
                renderLockedClient(elClient, running);
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
                let panelUrl   = 'http://' + localIp + ':' + dashPort + '/ui/' + authSuffix;
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
        poll.add(function() {
            if (!document.contains(node)) return Promise.resolve();
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return Promise.resolve();
            return Promise.race([
                clash.status(),
                new Promise(function(resolve) { setTimeout(function() { resolve(null); }, STATUS_TIMEOUT_MS); })
            ]).then(function(s) {
                if (s) update(s);
            }).catch(function() {});
        }, STATUS_INTERVAL);

        /* ── 访问检查 ── */
        let _probeHistory = {};

        function renderProbeCard(site) {
            let history = _probeHistory[site.id] || [];
            let latest  = history[history.length - 1];

            let isIntl      = site.type === '国外';
            let isSmall = (typeof window !== 'undefined' && window.innerWidth < 480);
            let badgeStyle  = 'display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;flex:0 0 auto;' +
                'min-width:' + (isSmall ? '34px' : '40px') + ';height:' + (isSmall ? '20px' : '23px') + ';padding:0 ' + (isSmall ? '5px' : '7px') + ';' +
                'font-size:.82rem;line-height:1;border-radius:999px;border:1px solid;font-weight:500;' +
                (isIntl ? 'color:' + COLORS.intl + ';border-color:' + COLORS.intl : 'color:' + COLORS.domestic + ';border-color:' + COLORS.domestic);
            let latencyColor = !latest ? COLORS.textNone
                : latest.state === 'stopped' ? COLORS.textMuted
                : !latest.ok ? COLORS.danger
                : latest.ms < LATENCY_WARN ? COLORS.success : COLORS.warning;
            let latencyText  = !latest ? '--'
                : latest.state === 'stopped' ? '已停用'
                : !latest.ok ? '失败' : latest.ms + 'ms';

            return E('div', {
                id: 'probe-card-' + site.id,
                style: 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:8px;background:transparent;border:none;flex:1 1 300px;min-width:0'
            }, [
                E('div', {
                    style: isSmall
                        ? 'display:grid;grid-template-columns:20px 76px 46px;align-items:center;column-gap:8px;min-width:0;flex:1 1 auto'
                        : 'display:grid;grid-template-columns:20px 120px 50px;align-items:center;column-gap:8px;min-width:0;flex:1 1 auto'
                }, [
                    E('img', {
                        src: site.icon,
                        style: 'width:20px;height:20px;object-fit:contain;border-radius:3px',
                        onerror: "this.style.display='none'"
                    }),
                    E('span', { style: 'font-weight:500;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, site.label),
                    E('span', { style: badgeStyle }, site.type)
                ]),
                E('div', { style: 'display:flex;align-items:center;flex:0 0 auto;margin-left:8px' }, [
                    E('span', { style: 'font-weight:500;font-size:.82rem;min-width:42px;text-align:right;color:' + latencyColor }, latencyText)
                ])
            ]);
        }

        async function probeAll() {
            if (!document.contains(node)) return;
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            let grid = $id('probe-grid');
            if (!grid) return;

            if (!_isRunning) {
                for (let i = 0; i < PROBE_SITES.length; i++) {
                    let site = PROBE_SITES[i];
                    if (!_probeHistory[site.id]) _probeHistory[site.id] = [];
                    _probeHistory[site.id].push({ ok: false, ms: 0, state: 'stopped' });
                    if (_probeHistory[site.id].length > PROBE_HISTORY) _probeHistory[site.id].shift();
                    let oldStopped = $id('probe-card-' + site.id);
                    if (oldStopped) oldStopped.replaceWith(renderProbeCard(site));
                }
                return;
            }

            let check = await Promise.race([
                clash.accessCheck(),
                new Promise(function(resolve) { setTimeout(function() { resolve(null); }, 2500); })
            ]).catch(function() { return null; });
            for (let i = 0; i < PROBE_SITES.length; i++) {
                let site = PROBE_SITES[i];
                let src = check ? check[site.id] : null;
                let res = src ? {
                    ok: !!src.ok,
                    ms: Number(src.avg_ms || 0),
                    state: src.state || (src.ok ? 'ok' : 'down')
                } : { ok: false, ms: 0, state: 'down' };
                if (!_probeHistory[site.id]) _probeHistory[site.id] = [];
                _probeHistory[site.id].push(res);
                if (_probeHistory[site.id].length > PROBE_HISTORY) _probeHistory[site.id].shift();
                let old = $id('probe-card-' + site.id);
                if (old) old.replaceWith(renderProbeCard(site));
            }
        }

        /* 先渲染占位卡片（显示 --），不阻塞页面 */
        let gridInit = node.querySelector('#probe-grid');
        if (gridInit) {
            for (let site of PROBE_SITES)
                gridInit.appendChild(renderProbeCard(site));
        }
        /* 连接测试默认不自动探测，避免切页时被慢 RPC 阻塞 */
        if (ENABLE_AUTO_PROBE) {
            setTimeout(function() {
                if (!document.contains(node)) return;
                probeAll();
            }, PROBE_START_DELAY);
            poll.add(function() {
                if (!document.contains(node)) return Promise.resolve();
                return probeAll().catch(function() {});
            }, PROBE_INTERVAL);
        }

        return node;
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
