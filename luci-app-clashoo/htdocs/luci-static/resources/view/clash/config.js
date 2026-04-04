'use strict';
'require view';
'require form';
'require rpc';
'require ui';
'require uci';
'require tools.clash as clash';

let callListSubs    = rpc.declare({ object: 'luci.clash', method: 'list_subscriptions', expect: {} });
let callListDir     = rpc.declare({ object: 'luci.clash', method: 'list_dir_files', params: ['type'], expect: {} });
let callDeleteCfg   = rpc.declare({ object: 'luci.clash', method: 'delete_config', params: ['name', 'type'], expect: {} });
let callDownloadSubs= rpc.declare({ object: 'luci.clash', method: 'download_subs', expect: {} });
let callUpdateSub   = rpc.declare({ object: 'luci.clash', method: 'update_sub', params: ['name'], expect: {} });
let callSetConfig   = rpc.declare({ object: 'luci.clash', method: 'set_config', params: ['name'], expect: {} });
let callApplyRewrite= rpc.declare({ object: 'luci.clash', method: 'apply_rewrite', params: ['base_type', 'base_name', 'rewrite_type', 'rewrite_name', 'output_name', 'set_active'], expect: {} });
let callFetchRewriteUrl = rpc.declare({ object: 'luci.clash', method: 'fetch_rewrite_url', params: ['url', 'name'], expect: {} });


function mkBtn(label, style, fn) {
    let b = E('button', {
        type: 'button',
        class: 'btn cbi-button cbi-button-' + style,
        style: 'margin:1px 2px'
    }, label);
    b.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        fn();
    });
    return b;
}

function fmtMtime(v) {
    if (!v) return '-';
    let s = String(v).trim();
    if (!/^\d+$/.test(s)) return s;
    let n = parseInt(s, 10);
    if (!isFinite(n) || n <= 0) return s;
    let d = new Date(n * 1000);
    if (isNaN(d.getTime())) return s;
    let p = n => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function renderFileTable(title, rows, activeName, ctype, container, setPageStatus) {
    if (!rows || !rows.length)
        return false;

    container.appendChild(E('h3', { style: 'margin:1em 0 .4em' }, title));
    let tbl = E('table', { class: 'table cbi-section-table', style: 'width:100%' }, [
        E('thead', {}, E('tr', {}, [
            E('th', { style: 'text-align:left' }, _('文件名')),
            E('th', { style: 'text-align:center;width:190px' }, _('更新时间')),
            E('th', { style: 'text-align:center;width:100px' }, _('大小')),
            E('th', { style: 'text-align:right;width:220px' }, _('操作'))
        ])),
        E('tbody', {}, rows.map(f => {
            let isActive = f.name === activeName || f.active;
            let nameCell = isActive
                ? E('td', {}, E('strong', { style: 'color:#4CAF50' }, '▶ ' + f.name))
                : E('td', {}, f.name);
            let actions = E('td', { style: 'text-align:right;white-space:nowrap' }, [
                mkBtn(_('使用'), 'apply', () => {
                    callSetConfig(f.name).then(() => {
                        setPageStatus(_('配置已切换：') + f.name, true);
                        container.dataset.refresh = '1';
                    });
                }),
                mkBtn(_('删除'), 'remove', () => {
                    callDeleteCfg(f.name, ctype).then(() => location.reload());
                })
            ]);
            return E('tr', {}, [
                nameCell,
                E('td', { style: 'text-align:center' }, fmtMtime(f.mtime)),
                E('td', { style: 'text-align:center' }, f.size || '-'),
                actions
            ]);
        }))
    ]);
    container.appendChild(tbl);
    return true;
}

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('clash'),
            callListSubs(),
            callListDir('1'),
            callListDir('2'),
            callListDir('3')
        ]);
    },

    render: function (data) {
        let subData      = data[1] || {};
        let subFileData  = data[2] || {};
        let uploadData   = data[3] || {};
        let customData   = data[4] || {};
        let activeName = subData.active || '';

        let m, s, o;
        m = new form.Map('clash', _('配置管理'));
        this._map = m;

        function inferDarkMode() {
            if (typeof window === 'undefined') return false;
            let de = document.documentElement || null;
            let body = document.body || null;
            let rootStyle = de ? window.getComputedStyle(de) : null;
            let colorScheme = (rootStyle && rootStyle.colorScheme) ? String(rootStyle.colorScheme).toLowerCase() : '';
            let dataTheme = ((de && de.getAttribute('data-theme')) || (body && body.getAttribute('data-theme')) || '').toLowerCase();
            return (
                (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ||
                (de && /dark|night/i.test((de.className || '') + ' ' + (de.id || ''))) ||
                (body && /dark|night/i.test((body.className || '') + ' ' + (body.id || ''))) ||
                /dark/.test(dataTheme) ||
                /dark/.test(colorScheme)
            );
        }
        const isDark = inferDarkMode();

        let pageStatus = E('div', {
            id: 'cfg-inline-status',
            style: 'margin:0 0 12px 0;padding:8px 10px;border-radius:6px;background:' + (isDark ? '#1f2937' : '#f7f9fc') + ';color:' + (isDark ? '#cbd5e1' : '#4b5563') + ';font-size:.92rem;display:none'
        }, '');

        function setPageStatus(msg, ok) {
            pageStatus.style.display = '';
            if (isDark) {
                pageStatus.style.background = ok ? '#0b2f26' : '#3a1f27';
                pageStatus.style.color = ok ? '#86efac' : '#fca5a5';
            } else {
                pageStatus.style.background = ok ? '#ecfdf5' : '#fef2f2';
                pageStatus.style.color = ok ? '#065f46' : '#991b1b';
            }
            pageStatus.textContent = msg;
        }

        /* ─── 配置来源 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('配置来源'));
        s.anonymous = false;
        s.description = _('填写订阅链接后点击"下载订阅"，或直接上传 YAML 文件');

        o = s.option(form.ListValue, 'subcri', _('订阅类型'));
        o.value('clash', 'Clash');
        o.value('meta', 'Mihomo / Clash.Meta');
        o.default = 'clash';

        o = s.option(form.Value, 'config_name', _('配置名称'));
        o.placeholder = 'sub-config';
        o.rmempty = true;
        o.default = '';
        o.description = _('可选：指定基础文件名，多条链接自动追加序号后缀');

        o = s.option(form.DynamicList, 'clash_url', _('订阅链接'));
        o.rmempty = true;
        o.default = [];
        o.description = _('每条链接对应一个配置文件');

        o = s.option(form.Button, '_dl_sub', _(''));
        o.inputtitle = _('下载订阅');
        o.inputstyle = 'apply';
        o.onclick = function () {
            setPageStatus('正在下载订阅，请稍候...', true);
            return m.save().then(() => callDownloadSubs()).then((r) => {
                if (r && r.success) {
                    setPageStatus((r.message || '订阅下载成功') + '，页面将自动刷新', true);
                    setTimeout(() => location.reload(), 1200);
                } else {
                    setPageStatus((r && (r.message || r.error)) || '订阅下载失败，请检查链接', false);
                }
            }).catch((e) => {
                setPageStatus('订阅下载失败: ' + (e && e.message ? e.message : e), false);
            });
        };

        /* ─── 订阅管理表格（自定义 DOM section） ─── */
        let subs = subData.subs || [];
        if (subs.length) {
            s = m.section(form.NamedSection, 'config', 'clash', _('订阅管理'));
            s.anonymous = false;
            s.render = function () {
                let node = E('div', { class: 'cbi-section' }, [
                    E('h3', {}, _('订阅管理')),
                    E('div', { class: 'cbi-section-node' }, [
                        E('table', { class: 'table cbi-section-table', style: 'width:100%' }, [
                            E('thead', {}, E('tr', {}, [
                                E('th', { style: 'text-align:left' }, _('文件名')),
                                E('th', { style: 'text-align:center;width:90px' }, _('类型')),
                                E('th', { style: 'text-align:left' }, _('链接')),
                                E('th', { style: 'text-align:center;width:190px' }, _('更新时间')),
                                E('th', { style: 'text-align:center;width:100px' }, _('大小')),
                                E('th', { style: 'text-align:right;width:270px' }, _('操作'))
                            ])),
                            E('tbody', {}, subs.map(sub => {
                                let isActive = sub.name === activeName;
                                let nameCell = isActive
                                    ? E('td', {}, E('strong', { style: 'color:#4CAF50' }, '▶ ' + sub.name))
                                    : E('td', {}, sub.name);
                                let shortUrl = sub.url.length > 44
                                    ? sub.url.slice(0, 28) + '...' + sub.url.slice(-12)
                                    : sub.url;
                                let urlCell = E('td', {}, E('a', {
                                    href: sub.url, target: '_blank', rel: 'noopener',
                                    title: sub.url,
                                    style: 'max-width:240px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle'
                                }, shortUrl));
                                let actions = E('td', { style: 'text-align:right;white-space:nowrap' }, [
                                    sub.has_file ? mkBtn(_('使用'), 'apply', () => {
                                        callSetConfig(sub.name).then(() => {
                                            setPageStatus(_('配置已切换：') + sub.name, true);
                                            setTimeout(() => location.reload(), 800);
                                        });
                                    }) : '',
                                    sub.url ? mkBtn(_('更新'), 'apply', () => {
                                        setPageStatus('正在更新订阅：' + sub.name + ' ...', true);
                                        callUpdateSub(sub.name).then((r) => {
                                            if (r && r.success) {
                                                setPageStatus((r.message || ('更新完成：' + sub.name)) + '，页面将自动刷新', true);
                                                setTimeout(() => location.reload(), 1200);
                                            } else {
                                                setPageStatus((r && (r.message || r.error)) || ('更新失败：' + sub.name), false);
                                            }
                                        }).catch((e) => {
                                            setPageStatus('更新失败: ' + (e && e.message ? e.message : e), false);
                                        });
                                    }) : '',
                                    mkBtn(_('删除'), 'remove', () => {
                                        callDeleteCfg(sub.name, '1').then(() => location.reload());
                                    })
                                ]);
                                return E('tr', {}, [
                                    nameCell,
                                    E('td', { style: 'text-align:center' }, sub.type || '-'),
                                    urlCell,
                                    E('td', { style: 'text-align:center' }, fmtMtime(sub.mtime)),
                                    E('td', { style: 'text-align:center' }, sub.size || '-'),
                                    actions
                                ]);
                            }))
                        ])
                    ])
                ]);
                return Promise.resolve(node);
            };
        }

        /* ─── 上传配置 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('上传配置'));
        s.anonymous = false;
        s.render = function () {
            let input = E('input', {
                type: 'file', accept: '.yaml,.yml',
                id: 'cfg-upload-input',
                style: 'flex:1;min-width:0'
            });
            let status = E('span', { style: 'margin-left:8px;color:#666;font-size:.9rem;white-space:nowrap' }, '');
            let btn = E('button', {
                type: 'button',
                class: 'btn cbi-button cbi-button-apply',
                style: 'margin-left:8px;white-space:nowrap;flex-shrink:0'
            }, _('上传'));
            btn.addEventListener('click', () => {
                let files = input.files;
                if (!files || !files.length) { status.textContent = _('未选择文件'); return; }
                let file = files[0];
                status.textContent = _('上传中…');
                let reader = new FileReader();
                reader.onload = e => {
                    L.Request.post('/cgi-bin/luci/admin/services/clash/upload', new Blob([e.target.result]), {
                        headers: { 'X-Filename': file.name }
                    }).then(resp => {
                        status.textContent = resp.ok ? _('上传成功') : _('上传失败');
                        if (resp.ok) setTimeout(() => location.reload(), 1500);
                    }).catch(() => { status.textContent = _('上传失败'); });
                };
                reader.readAsArrayBuffer(file);
            });
            let node = E('div', { class: 'cbi-section' }, [
                E('h3', {}, _('上传配置')),
                E('p', { class: 'cbi-value-description', style: 'margin-bottom:10px' },
                    _('上传本地 .yaml / .yml 文件作为配置来源（存入 upload/ 目录）')),
                E('div', { style: 'display:flex;align-items:center;gap:0;max-width:540px' },
                    [input, btn, status])
            ]);
            return Promise.resolve(node);
        };

        /* ─── 已上传文件列表（紧跟上传区域，集中管理） ─── */
        let uploadFiles = uploadData.files || [];
        let customFiles = customData.files || [];

        if (uploadFiles.length || customFiles.length) {
            s = m.section(form.NamedSection, 'config', 'clash', _('文件列表'));
            s.anonymous = false;
            s.render = function () {
                let node = E('div', { class: 'cbi-section' });
                let hasUpload = renderFileTable(_('已上传配置'), uploadFiles, activeName, '2', node, setPageStatus);
                let hasCustom = renderFileTable(_('自定义文件'), customFiles, activeName, '3', node, setPageStatus);
                if (hasUpload && hasCustom)
                    node.appendChild(E('hr', { style: 'border:none;border-top:1px solid #eee;margin:8px 0' }));
                return Promise.resolve(node);
            };
        }

        /* ─── 复写设置（主配置 + 复写配置） ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('复写设置'));
        s.anonymous = false;
        s.render = function () {
            let subFiles = (subFileData.files || []).map(f => f.name);
            let upFiles  = uploadFiles.map(f => f.name);
            let cuFiles  = customFiles.map(f => f.name);

            function filesByType(t) {
                if (t === '1') return subFiles;
                if (t === '2') return upFiles;
                if (t === '3') return cuFiles;
                return [];
            }

            function labelOfType(t) {
                if (t === '1') return _('远程订阅');
                if (t === '2') return _('本地上传');
                return _('自定义');
            }

            function refillFileSelect(sel, t) {
                let arr = filesByType(t);
                while (sel.firstChild) sel.removeChild(sel.firstChild);
                if (!arr.length) {
                    sel.appendChild(E('option', { value: '' }, _('无可用文件')));
                    sel.disabled = true;
                    return;
                }
                arr.forEach(n => sel.appendChild(E('option', { value: n }, n)));
                sel.disabled = false;
            }

            let baseType = E('select', { class: 'cbi-input-select', style: 'min-width:150px' }, [
                E('option', { value: '2' }, _('本地上传')),
                E('option', { value: '1' }, _('远程订阅')),
                E('option', { value: '3' }, _('自定义'))
            ]);
            let baseFile = E('select', { class: 'cbi-input-select', style: 'min-width:320px' });

            let rewriteType = E('select', { class: 'cbi-input-select', style: 'min-width:150px' }, [
                E('option', { value: '1' }, _('远程订阅')),
                E('option', { value: '2' }, _('本地上传')),
                E('option', { value: '3' }, _('自定义'))
            ]);
            let rewriteFile = E('select', { class: 'cbi-input-select', style: 'min-width:320px' });

            let outName = E('input', {
                type: 'text',
                class: 'cbi-input-text',
                placeholder: 'merged-rewrite.yaml',
                style: 'min-width:320px'
            });

            let remoteUrl = E('input', {
                type: 'text',
                class: 'cbi-input-text',
                style: 'min-width:520px',
                value: 'https://raw.githubusercontent.com/kenzok78/ruleset/main/rule/config/Clash/fx.yaml'
            });
            let remoteName = E('input', {
                type: 'text',
                class: 'cbi-input-text',
                placeholder: 'fx.yaml（可选）',
                style: 'min-width:220px'
            });
            let remoteBtn = E('button', {
                type: 'button',
                class: 'btn cbi-button cbi-button-apply',
                style: 'white-space:nowrap'
            }, _('下载远程复写'));

            remoteBtn.addEventListener('click', function () {
                let url = (remoteUrl.value || '').trim();
                let name = (remoteName.value || '').trim();
                if (!url) {
                    setPageStatus(_('请输入远程复写 URL'), false);
                    return;
                }
                setPageStatus(_('正在下载远程复写文件...'), true);
                callFetchRewriteUrl(url, name).then(function (r) {
                    if (r && r.success) {
                        setPageStatus((r.message || _('下载成功')) + '，页面将自动刷新', true);
                        setTimeout(() => location.reload(), 1000);
                    } else {
                        setPageStatus((r && (r.message || r.error)) || _('下载失败'), false);
                    }
                }).catch(function (e) {
                    setPageStatus(_('下载失败: ') + (e && e.message ? e.message : e), false);
                });
            });

            let setActive = E('input', { type: 'checkbox' });
            let actLabel = E('label', { style: 'margin-left:6px;user-select:none' }, _('生成后设为当前配置'));

            refillFileSelect(baseFile, baseType.value);
            refillFileSelect(rewriteFile, rewriteType.value);

            baseType.addEventListener('change', () => refillFileSelect(baseFile, baseType.value));
            rewriteType.addEventListener('change', () => refillFileSelect(rewriteFile, rewriteType.value));

            let btn = E('button', {
                type: 'button',
                class: 'btn cbi-button cbi-button-apply',
                style: 'margin-top:6px'
            }, _('应用复写'));

            btn.addEventListener('click', function () {
                let bt = baseType.value;
                let bn = baseFile.value || '';
                let rt = rewriteType.value;
                let rn = rewriteFile.value || '';
                let on = (outName.value || '').trim();

                if (!bn) {
                    setPageStatus(_('请选择主配置文件'), false);
                    return;
                }
                if (!rn) {
                    setPageStatus(_('请选择复写配置文件'), false);
                    return;
                }

                setPageStatus(_('正在应用复写：') + labelOfType(bt) + ' + ' + labelOfType(rt), true);
                callApplyRewrite(bt, bn, rt, rn, on, setActive.checked ? '1' : '0').then(function (r) {
                    if (r && r.success) {
                        let msg = r.message || (_('复写成功，输出文件：') + (r.output_name || '-'));
                        setPageStatus(msg, true);
                        setTimeout(() => location.reload(), 1200);
                    } else {
                        setPageStatus((r && (r.message || r.error)) || _('复写失败'), false);
                    }
                }).catch(function (e) {
                    setPageStatus(_('复写失败: ') + (e && e.message ? e.message : e), false);
                });
            });

            return Promise.resolve(E('div', { class: 'cbi-section' }, [
                E('h3', {}, _('复写设置')),
                E('p', { class: 'cbi-value-description', style: 'margin-bottom:10px' },
                    _('将“主配置文件”与“复写配置文件”合并，生成到 custom 目录，可用于覆盖本地规则配置。')),
                E('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0' }, [
                    E('span', { style: 'min-width:84px' }, _('主配置来源')),
                    baseType,
                    baseFile
                ]),
                E('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0' }, [
                    E('span', { style: 'min-width:84px' }, _('复写来源')),
                    rewriteType,
                    rewriteFile
                ]),
                E('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0' }, [
                    E('span', { style: 'min-width:84px' }, _('输出文件名')),
                    outName
                ]),
                E('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0' }, [
                    E('span', { style: 'min-width:84px' }, _('远程复写 URL')),
                    remoteUrl,
                    remoteName,
                    remoteBtn
                ]),
                E('div', { style: 'display:flex;align-items:center;gap:6px;margin:8px 0' }, [
                    setActive,
                    actLabel
                ]),
                btn
            ]));
        };

        /* ─── 面板配置 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('面板配置'));
        s.description = _('Web 控制面板相关设置（mihomo: external-controller / external-ui）');
        s.anonymous = false;

        o = s.option(form.Value, 'dash_port', _('面板端口'));
        o.datatype    = 'port';
        o.default     = '9090';
        o.placeholder = '9090';
        o.description = 'RESTful API 及 Web 面板监听端口（mihomo: external-controller）';

        o = s.option(form.Value, 'ui_path', _('面板存储目录'));
        o.placeholder = 'ui';
        o.description = _('面板静态文件的存放目录（相对于配置目录，如：ui）');
        o.rmempty = true;

        o = s.option(form.Value, 'ui_name', _('面板标识名'));
        o.placeholder = _('留空自动检测');
        o.description = _('对应 external-ui-name，用于指定加载哪个子目录的面板');
        o.rmempty = true;

        o = s.option(form.ListValue, 'ui_url', _('面板下载源'));
        o.optional = true;
        o.rmempty = true;
        o.value('', _('不下载'));
        o.value('https://github.com/Zephyruso/zashboard/releases/latest/download/dist-cdn-fonts.zip', 'Zashboard (CDN Fonts)');
        o.value('https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip', 'Zashboard');
        o.value('https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip', 'MetaCubeXD');
        o.value('https://github.com/MetaCubeX/Yacd-meta/archive/refs/heads/gh-pages.zip', 'YACD');
        o.value('https://github.com/MetaCubeX/Razord-meta/archive/refs/heads/gh-pages.zip', 'Razord');
        o.description = _('选择要下载安装的 Web 面板包');

        o = s.option(form.Value, 'api_tls_listen', _('TLS 加密监听地址'));
        o.placeholder = '[::]:9443';
        o.rmempty = true;
        o.description = _('启用 HTTPS 访问控制器时的监听地址');

        o = s.option(form.Value, 'api_tls_cert', _('TLS 证书路径'));
        o.placeholder = _('如：/etc/clash/cert.pem');
        o.rmempty = true;

        o = s.option(form.Value, 'api_tls_key', _('TLS 私钥路径'));
        o.placeholder = _('如：/etc/clash/key.pem');
        o.rmempty = true;

        o = s.option(form.Value, 'api_tls_ech_key', _('TLS ECH 密钥路径'));
        o.placeholder = _('如：/etc/clash/ech.pem');
        o.rmempty = true;
        o.description = _('Encrypted Client Hello 密钥文件路径（可选）');

        o = s.option(form.Value, 'api_secret', _('面板密钥'));
        o.password = true;
        o.placeholder = _('请设置密码（推荐）');
        o.rmempty = true;
        o.description = _('访问 RESTful API 及面板所需的 Bearer Token，建议设置强密码');

        o = s.option(form.ListValue, 'selection_cache', _('记忆代理节点选择'));
        o.optional = true;
        o.value('', _('不修改'));
        o.value('0', _('禁用'));
        o.value('1', _('启用'));
        o.default = '1';
        o.description = _('重启后保留上次选择的代理节点与策略组');

        return m.render().then(function (node) {
            node.insertBefore(pageStatus, node.firstChild || null);
            return node;
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
