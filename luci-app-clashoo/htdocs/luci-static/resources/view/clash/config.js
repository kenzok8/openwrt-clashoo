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
let callUploadConfig    = rpc.declare({ object: 'luci.clash', method: 'upload_config', params: ['name', 'content', 'type'], expect: {} });


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
                    E('div', { class: 'cbi-section-node', style: 'padding:0 10px 10px;box-sizing:border-box' }, [
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
                    callUploadConfig(file.name, e.target.result, '2').then(r => {
                        status.textContent = (r && r.success) ? _('上传成功') : _('上传失败');
                        if (r && r.success) setTimeout(() => location.reload(), 1500);
                    }).catch(() => { status.textContent = _('上传失败'); });
                };
                reader.readAsText(file);
            });
            let node = E('div', { class: 'cbi-section' }, [
                E('h3', {}, _('上传配置')),
                E('p', { class: 'cbi-value-description', style: 'margin:0 10px 10px' },
                    _('上传本地 .yaml / .yml 文件作为配置来源（存入 upload/ 目录）')),
                E('div', { style: 'display:flex;align-items:center;gap:0;max-width:540px;padding:0 10px 10px;box-sizing:border-box' },
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

        /* ─── 复写设置 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('复写设置'));
        s.anonymous = false;
        s.render = function () {
            var allRewriteFiles = []
                .concat((subFileData.files || []).map(function (f) { return f.name; }))
                .concat(uploadFiles.map(function (f) { return f.name; }))
                .concat(customFiles.map(function (f) { return f.name; }));

            var rowStyle = 'display:flex;align-items:center;margin:8px 0';
            var labelStyle = 'min-width:100px;flex-shrink:0;font-weight:500';
            var inputGroupStyle = 'display:flex;align-items:center;gap:8px;flex:1;flex-wrap:wrap';

            /* ── 复写来源切换 ── */
            var srcMode = E('select', { class: 'cbi-input-select', style: 'min-width:140px' }, [
                E('option', { value: 'local' }, _('本地文件')),
                E('option', { value: 'remote' }, _('远程拉取'))
            ]);

            /* 本地文件选择 */
            var localFile = E('select', { class: 'cbi-input-select', style: 'min-width:200px;flex:1;max-width:360px' });
            if (!allRewriteFiles.length) {
                localFile.appendChild(E('option', { value: '' }, _('无可用文件')));
                localFile.disabled = true;
            } else {
                allRewriteFiles.forEach(function (n) { localFile.appendChild(E('option', { value: n }, n)); });
            }

            /* 本地上传 */
            var uploadInput = E('input', { type: 'file', accept: '.yaml,.yml', style: 'max-width:240px' });
            var uploadBtn = E('button', {
                type: 'button', class: 'btn cbi-button cbi-button-action', style: 'white-space:nowrap'
            }, _('上传'));
            uploadBtn.addEventListener('click', function () {
                var files = uploadInput.files;
                if (!files || !files.length) { setPageStatus(_('请选择文件'), false); return; }
                var file = files[0];
                setPageStatus(_('上传中…'), true);
                var reader = new FileReader();
                reader.onload = function (ev) {
                    callUploadConfig(file.name, ev.target.result, '2').then(function (r) {
                        if (r && r.success) {
                            setPageStatus(_('上传成功：') + file.name, true);
                            setTimeout(function () { location.reload(); }, 1000);
                        } else {
                            setPageStatus(_('上传失败'), false);
                        }
                    }).catch(function () { setPageStatus(_('上传失败'), false); });
                };
                reader.readAsText(file);
            });

            /* 远程拉取 */
            var remoteUrl = E('input', {
                type: 'text', class: 'cbi-input-text', style: 'flex:1;min-width:200px',
                placeholder: 'https://example.com/rewrite.yaml'
            });
            var remoteName = E('input', {
                type: 'text', class: 'cbi-input-text',
                placeholder: _('文件名（可选）'), style: 'width:160px;flex-shrink:0'
            });
            var remoteBtn = E('button', {
                type: 'button', class: 'btn cbi-button cbi-button-action', style: 'white-space:nowrap'
            }, _('拉取'));
            remoteBtn.addEventListener('click', function () {
                var url = (remoteUrl.value || '').trim();
                if (!url) { setPageStatus(_('请输入 URL'), false); return; }
                setPageStatus(_('正在拉取复写文件...'), true);
                callFetchRewriteUrl(url, (remoteName.value || '').trim()).then(function (r) {
                    if (r && r.success) {
                        setPageStatus((r.message || _('拉取成功')) + '，页面将自动刷新', true);
                        setTimeout(function () { location.reload(); }, 1000);
                    } else {
                        setPageStatus((r && (r.message || r.error)) || _('拉取失败'), false);
                    }
                }).catch(function (e) {
                    setPageStatus(_('拉取失败: ') + (e && e.message ? e.message : e), false);
                });
            });

            /* 本地/远程行容器 */
            var localRow = E('div', { style: rowStyle }, [
                E('span', { style: labelStyle }, _('选择文件')),
                E('div', { style: inputGroupStyle }, [ localFile, uploadInput, uploadBtn ])
            ]);
            var remoteRow = E('div', { style: rowStyle + ';display:none' }, [
                E('span', { style: labelStyle }, _('远程 URL')),
                E('div', { style: inputGroupStyle }, [ remoteUrl, remoteName, remoteBtn ])
            ]);

            srcMode.addEventListener('change', function () {
                var isRemote = srcMode.value === 'remote';
                localRow.style.display = isRemote ? 'none' : '';
                remoteRow.style.display = isRemote ? '' : 'none';
            });

            /* ── 应用复写 ── */
            var setActive = E('input', { type: 'checkbox', checked: true });
            var applyBtn = E('button', {
                type: 'button', class: 'btn cbi-button cbi-button-apply'
            }, _('应用复写'));

            applyBtn.addEventListener('click', function () {
                var rn = '';
                if (srcMode.value === 'local') {
                    rn = localFile.value || '';
                    if (!rn) { setPageStatus(_('请选择复写文件'), false); return; }
                } else {
                    setPageStatus(_('请先拉取远程文件，再选择本地文件应用'), false);
                    return;
                }
                if (!activeName) { setPageStatus(_('当前无活动配置，请先设置配置文件'), false); return; }

                setPageStatus(_('正在将复写应用到当前配置...'), true);
                /* base = 当前活动配置, rewrite = 选中的文件 */
                var bn = activeName;
                var bt;
                if ((subFileData.files || []).some(function(f){ return f.name === bn; })) bt = '1';
                else if (uploadFiles.some(function(f){ return f.name === bn; })) bt = '2';
                else bt = '3';
                /* 判断复写文件来源类型 */
                var rt = '3';
                if ((subFileData.files || []).some(function (f) { return f.name === rn; })) rt = '1';
                else if (uploadFiles.some(function (f) { return f.name === rn; })) rt = '2';

                callApplyRewrite(bt, bn, rt, rn, '', setActive.checked ? '1' : '0').then(function (r) {
                    if (r && r.success) {
                        setPageStatus(r.message || _('复写成功'), true);
                        setTimeout(function () { location.reload(); }, 1200);
                    } else {
                        setPageStatus((r && (r.message || r.error)) || _('复写失败'), false);
                    }
                }).catch(function (e) {
                    setPageStatus(_('复写失败: ') + (e && e.message ? e.message : e), false);
                });
            });

            return Promise.resolve(E('div', { class: 'cbi-section' }, [
                E('h3', {}, _('复写设置')),
                E('p', { class: 'cbi-value-description', style: 'margin:0 10px 10px' },
                    _('用自定义配置覆盖当前配置。复写文件可从本地上传或远程拉取。')),

                activeName
                    ? E('div', { style: 'margin:0 10px 12px;padding:8px 12px;border-radius:6px;background:' + (isDark ? '#1a2332' : '#f0f7ff') + ';font-size:.92rem' },
                        _('当前配置：') + E('strong', {}, activeName).outerHTML)
                    : E('div', { style: 'margin:0 10px 12px;padding:8px 12px;border-radius:6px;background:' + (isDark ? '#2d1f1f' : '#fff5f5') + ';color:' + (isDark ? '#fca5a5' : '#991b1b') + ';font-size:.92rem' },
                        _('未设置活动配置，请先在上方选择配置文件')),

                E('div', { style: rowStyle + ';padding:0 10px;box-sizing:border-box' }, [
                    E('span', { style: labelStyle }, _('复写来源')),
                    E('div', { style: inputGroupStyle }, [ srcMode ])
                ]),
                E('div', { style: 'padding:0 10px;box-sizing:border-box' }, [localRow]),
                E('div', { style: 'padding:0 10px;box-sizing:border-box' }, [remoteRow]),
                E('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:14px 10px 0;padding:10px 0 0;border-top:1px solid ' + (isDark ? '#3a404c' : '#e5e7eb') }, [
                    E('label', { style: 'display:flex;align-items:center;gap:6px;user-select:none;cursor:pointer' }, [
                        setActive, _('应用后设为当前配置')
                    ]),
                    applyBtn
                ])
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
