'use strict';
'require view';
'require poll';
'require rpc';
'require tools.clash as clash';

return view.extend({
    load: function () {
        return Promise.all([
            clash.status(),
            clash.listConfigs()
        ]);
    },

    render: function (data) {
        const cfgData = data[1] || {};

        /* ── Helpers ── */
        function mkBtn(label, bg, onClick) {
            let b = E('button', {
                class: 'btn cbi-button',
                style: 'background:' + bg + ';color:#fff;border:none;border-radius:.5rem;padding:.55rem 1.2rem;font-size:.95rem;cursor:pointer;margin:0 4px'
            }, label);
            if (onClick) b.addEventListener('click', onClick);
            return b;
        }

        function mkSelect(id, opts, cur, onChange) {
            let sel = E('select', {
                id: id,
                style: 'width:260px;max-width:90vw;padding:.5rem .75rem;border:1px solid #ccc;border-radius:.375rem;font-size:.95rem;background:#fff'
            });
            for (let [v, label] of opts) {
                let o = E('option', { value: v }, label);
                if (v === cur) o.selected = true;
                sel.appendChild(o);
            }
            sel.addEventListener('change', () => onChange(sel.value));
            return sel;
        }

        function mkRow(child) {
            return E('div', {
                style: 'display:flex;align-items:center;justify-content:center;padding:14px 0;border-bottom:1px solid #eee'
            }, child);
        }

        /* ── Static structure ── */
        let node = E('div', { style: 'max-width:700px;margin:0 auto;background:#fff;border-radius:.5rem;overflow:hidden;border:1px solid #e0e0e0' }, [
            /* Hero */
            E('div', { style: 'text-align:center;padding:22px 0 18px;border-bottom:1px solid #eee' }, [
                E('img', {
                    src: '/luci-static/clash/logo.png',
                    style: 'width:60px;height:60px;object-fit:contain',
                    onerror: "this.style.display='none'",
                    alt: ''
                }),
                E('div', { id: 'clash-core-name', style: 'font-size:1.05rem;font-weight:600;margin-top:8px;color:#333' }, 'Clash'),
                E('div', { style: 'font-size:.85rem;color:#888;margin-top:4px' }, '基于规则的自定义代理客户端')
            ]),
            /* Start/Stop row */
            mkRow(E('span', { id: 'row-client', style: 'display:flex;gap:8px' })),
            /* Mode */
            mkRow(E('span', { id: 'row-mode' })),
            /* Config */
            mkRow(E('span', { id: 'row-config' })),
            /* Proxy mode */
            mkRow(E('span', { id: 'row-proxy' })),
            /* Panel type */
            mkRow(E('span', { id: 'row-panel' })),
            /* Panel buttons */
            E('div', { style: 'display:flex;align-items:center;justify-content:center;padding:16px 0;gap:8px' }, [
                E('span', { id: 'row-panel-btns', style: 'display:flex;gap:8px' })
            ])
        ]);

        /* ── Render dynamic content ── */
        function renderAll(s) {
            const running   = !!s.running;
            const configs   = cfgData.configs || [];
            const curConf   = cfgData.current || s.conf_path || '';
            const modeValue = s.mode_value  || 'fake-ip';
            const proxyMode = s.proxy_mode  || 'rule';
            const panelType = s.panel_type  || 'metacubexd';
            const dashPort  = s.dash_port   || '9090';
            const dashPass  = s.dash_pass   || '';
            const localIp   = s.local_ip    || location.hostname;
            const dashOk    = !!s.dashboard_installed || !!s.yacd_installed;
            const coreName  = (s.core_version || '').match(/^(\S+)/)?.[1] || 'Clash';

            /* Core name in hero */
            let nameEl = document.getElementById('clash-core-name');
            if (nameEl) nameEl.textContent = coreName;

            /* Client buttons */
            let elClient = document.getElementById('row-client');
            if (elClient) {
                elClient.innerHTML = '';
                if (running) {
                    elClient.appendChild(mkBtn('RUNNING', '#1f8b4c', null));
                    elClient.appendChild(mkBtn('停止客户端', '#6c757d', () => clash.stop()));
                } else {
                    elClient.appendChild(mkBtn('STOPPED', '#b58900', null));
                    elClient.appendChild(mkBtn('启用客户端', '#6366f1', () => clash.start()));
                }
            }

            /* Clash mode */
            let elMode = document.getElementById('row-mode');
            if (elMode) {
                elMode.innerHTML = '';
                elMode.appendChild(mkSelect('sel-mode', [
                    ['fake-ip', 'fake ip'],
                    ['tun',     'TUN 模式'],
                    ['mixed',   '混合模式']
                ], modeValue, v => clash.setMode(v)));
            }

            /* Config */
            let elCfg = document.getElementById('row-config');
            if (elCfg) {
                elCfg.innerHTML = '';
                let opts = configs.length ? configs.map(c => [c, c]) : [['', '（无配置）']];
                if (curConf && !configs.includes(curConf)) opts.unshift([curConf, curConf]);
                elCfg.appendChild(mkSelect('sel-config', opts, curConf,
                    v => v && clash.setConfig(v)
                ));
            }

            /* Proxy mode */
            let elProxy = document.getElementById('row-proxy');
            if (elProxy) {
                elProxy.innerHTML = '';
                elProxy.appendChild(mkSelect('sel-proxy', [
                    ['rule',   '规则模式'],
                    ['global', '全局模式'],
                    ['direct', '直连模式']
                ], proxyMode, v => clash.setProxyMode(v)));
            }

            /* Panel type */
            let elPanel = document.getElementById('row-panel');
            if (elPanel) {
                elPanel.innerHTML = '';
                elPanel.appendChild(mkSelect('sel-panel', [
                    ['metacubexd', 'MetaCubeXD Panel'],
                    ['yacd',       'YACD Panel'],
                    ['zashboard',  'Zashboard'],
                    ['razord',     'Razord']
                ], panelType, v => clash.setPanel(v)));
            }

            /* Panel buttons */
            let elBtns = document.getElementById('row-panel-btns');
            if (elBtns) {
                elBtns.innerHTML = '';
                let authSuffix = dashPass ? '?secret=' + encodeURIComponent(dashPass) : '';
                let panelUrl   = 'http://' + localIp + ':' + dashPort + '/ui' + authSuffix;
                elBtns.appendChild(mkBtn('更新面板', '#0d8f5b', () => clash.updatePanel(panelType)));
                if (dashOk) {
                    let a = E('a', {
                        href: panelUrl, target: '_blank', rel: 'noopener',
                        style: 'background:#6c757d;color:#fff;border-radius:.5rem;padding:.55rem 1.2rem;font-size:.95rem;text-decoration:none'
                    }, '打开面板');
                    elBtns.appendChild(a);
                } else {
                    elBtns.appendChild(mkBtn('打开面板', '#aaa', null));
                }
            }
        }

        renderAll(data[0] || {});

        poll.add(() => clash.status().then(s => renderAll(s)), 3);

        return node;
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
