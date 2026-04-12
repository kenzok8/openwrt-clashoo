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

        /* ─── 模板复写设置 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('复写设置'));
        s.anonymous = false;
        s.render = function () {
            if (!document.getElementById('clashoo-rewrite-style')) {
                document.head.appendChild(E('style', { id: 'clashoo-rewrite-style' }, `
                    .clashoo-rewrite .rw-input { width: 320px; max-width: 100%; min-width: 0; box-sizing: border-box; }
                    .clashoo-rewrite .rw-inline { display: flex; align-items: center; gap: 10px; flex-wrap: nowrap; max-width: 100%; }
                    .clashoo-rewrite .rw-btn { flex: 0 0 auto; white-space: nowrap; }
                    .clashoo-rewrite .rw-output { width: 100%; max-width: 320px; text-align: right; color: #7f8a98; }
                    .clashoo-rewrite .rw-template-actions { width: 100%; max-width: 320px; display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
                    .clashoo-rewrite .rw-actions { width: 100%; display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
                    @media (max-width: 768px) {
                        .clashoo-rewrite .cbi-value-title { width: 100% !important; margin-bottom: 6px; }
                        .clashoo-rewrite .cbi-value-field { width: 100% !important; }
                        .clashoo-rewrite .rw-input { width: 100% !important; }
                        .clashoo-rewrite .rw-inline { flex-wrap: wrap; }
                        .clashoo-rewrite .rw-template-actions, .clashoo-rewrite .rw-actions { max-width: 100%; width: 100%; justify-content: space-between; }
                        .clashoo-rewrite .rw-template-actions .rw-btn, .clashoo-rewrite .rw-actions .btn { flex: 1 1 calc(50% - 6px); text-align: center; }
                    }
                `));
            }

            let subs = (subData.subs || []).map(function (x) { return x.name; });
            let templates = (customData.files || [])
                .map(function (f) { return f.name; })
                .filter(function (name) { return !/^_merged_/.test(name); });

            let subSel = E('select', { class: 'cbi-input-select rw-input' },
                subs.length ? subs.map(function (n, i) { return E('option', { value: n, selected: i === 0 }, n); })
                            : [E('option', { value: '' }, _('暂无订阅'))]
            );

            let templateSel = E('select', { class: 'cbi-input-select rw-input' },
                [E('option', { value: '' }, _('请选择模板文件'))].concat(
                    templates.map(function (n, i) { return E('option', { value: n, selected: i === 0 }, n); })
                )
            );

            let outputHint = E('div', { style: 'margin-top:6px;color:#666;font-size:.9rem' }, '');
            function stripExt(name) { return String(name || '').replace(/\.(yaml|yml)$/i, ''); }
            function outputName() {
                let a = stripExt(subSel.value);
                let t = stripExt(templateSel.value);
                if (!a || !t) return '';
                return a + '_' + t + '.yaml';
            }
            function refreshOutputHint() {
                let out = outputName();
                outputHint.textContent = out ? out : _('请先选择订阅和模板');
            }
            subSel.addEventListener('change', refreshOutputHint);
            templateSel.addEventListener('change', refreshOutputHint);

            function addTemplateOption(name) {
                if (!name) return;
                let exists = Array.prototype.some.call(templateSel.options, function (o) { return o.value === name; });
                if (!exists) templateSel.appendChild(E('option', { value: name }, name));
                templateSel.value = name;
                refreshOutputHint();
            }

            let uploadInput = E('input', { type: 'file', accept: '.yaml,.yml', class: 'rw-input' });
            let uploadBtn = E('button', { type: 'button', class: 'btn cbi-button cbi-button-action rw-btn' }, _('上传模版'));
            uploadBtn.addEventListener('click', function () {
                let files = uploadInput.files;
                if (!files || !files.length) { setPageStatus(_('请选择模板文件'), false); return; }
                let file = files[0];
                setPageStatus(_('上传模板中...'), true);
                let reader = new FileReader();
                reader.onload = function (ev) {
                    callUploadConfig(file.name, ev.target.result, '3').then(function (r) {
                        if (r && r.success) {
                            addTemplateOption(r.name || file.name);
                            setPageStatus(_('模板上传成功：') + (r.name || file.name), true);
                        } else {
                            setPageStatus((r && (r.message || r.error)) || _('模板上传失败'), false);
                        }
                    }).catch(function (e) {
                        setPageStatus(_('模板上传失败: ') + (e && e.message ? e.message : e), false);
                    });
                };
                reader.readAsText(file);
            });

            let remoteUrl = E('input', {
                type: 'text', class: 'cbi-input-text rw-input',
                placeholder: 'https://example.com/fx.yaml'
            });
            let remoteName = E('input', {
                type: 'text', class: 'cbi-input-text rw-input',
                placeholder: _('模板文件名（可选）')
            });
            let remoteBtn = E('button', { type: 'button', class: 'btn cbi-button cbi-button-action rw-btn' }, _('拉取模版'));
            remoteBtn.addEventListener('click', function () {
                let url = (remoteUrl.value || '').trim();
                if (!url) { setPageStatus(_('请输入模板 URL'), false); return; }
                setPageStatus(_('正在拉取模板...'), true);
                callFetchRewriteUrl(url, (remoteName.value || '').trim()).then(function (r) {
                    if (r && r.success) {
                        addTemplateOption(r.name || '');
                        setPageStatus((r.message || _('模板拉取成功')), true);
                    } else {
                        setPageStatus((r && (r.message || r.error)) || _('模板拉取失败'), false);
                    }
                }).catch(function (e) {
                    setPageStatus(_('模板拉取失败: ') + (e && e.message ? e.message : e), false);
                });
            });

            let applyBtn = E('button', { type: 'button', class: 'btn cbi-button cbi-button-apply' }, _('生成文件'));
            applyBtn.addEventListener('click', function () {
                if (!subSel.value) { setPageStatus(_('请先选择订阅'), false); return; }
                if (!templateSel.value) { setPageStatus(_('请先选择模板文件'), false); return; }
                let out = outputName();
                setPageStatus(_('正在生成：') + out, true);
                callApplyRewrite('1', subSel.value, '3', templateSel.value, out, '0').then(function (r) {
                    if (r && r.success) {
                        setPageStatus((r.message || (_('生成成功：') + out)), true);
                        setTimeout(function () { location.reload(); }, 900);
                    } else {
                        setPageStatus((r && (r.message || r.error)) || _('复写失败'), false);
                    }
                }).catch(function (e) {
                    setPageStatus(_('复写失败: ') + (e && e.message ? e.message : e), false);
                });
            });

            let applyActivateBtn = E('button', { type: 'button', class: 'btn cbi-button cbi-button-action' }, _('生成并启用'));
            applyActivateBtn.addEventListener('click', function () {
                if (!subSel.value) { setPageStatus(_('请先选择订阅'), false); return; }
                if (!templateSel.value) { setPageStatus(_('请先选择模板文件'), false); return; }
                let out = outputName();
                setPageStatus(_('正在生成并启用：') + out, true);
                callApplyRewrite('1', subSel.value, '3', templateSel.value, out, '1').then(function (r) {
                    if (r && r.success) {
                        setPageStatus((r.message || (_('生成并启用成功：') + out)), true);
                        setTimeout(function () { location.reload(); }, 900);
                    } else {
                        setPageStatus((r && (r.message || r.error)) || _('复写失败'), false);
                    }
                }).catch(function (e) {
                    setPageStatus(_('复写失败: ') + (e && e.message ? e.message : e), false);
                });
            });

            refreshOutputHint();

            function cbiRow(title, fieldNode, descNode) {
                let fieldChildren = [fieldNode];
                if (descNode)
                    fieldChildren.push(descNode);
                return E('div', { class: 'cbi-value' }, [
                    E('label', { class: 'cbi-value-title' }, title || ''),
                    E('div', { class: 'cbi-value-field' }, fieldChildren)
                ]);
            }

            return Promise.resolve(E('div', { class: 'cbi-section clashoo-rewrite' }, [
                E('h3', {}, _('复写设置')),
                E('p', { class: 'cbi-value-description', style: 'margin:0 10px 10px' },
                    _('模板复写仅两步：上传/拉取模板，然后对订阅应用复写并生成新文件（示例：a.yaml + fx.yaml = a_fx.yaml）。')),
                cbiRow(_('订阅文件'), subSel),
                cbiRow(_('模板选择'), templateSel),
                cbiRow(_('本地上传'), uploadInput),
                cbiRow(_('远程拉取'), remoteUrl),
                cbiRow(_('模板文件名'), remoteName),
                cbiRow(_('模板操作'), E('div', { class: 'rw-template-actions' }, [uploadBtn, remoteBtn])),
                cbiRow(_('生成文件名'), E('div', { class: 'rw-output' }, [outputHint])),
                cbiRow('', E('div', { style: 'width:100%;max-width:320px;color:#7f8a98;font-size:12px;line-height:1.5;text-align:right' },
                    _('生成文件：仅写入新文件；生成并启用：写入后立即切换生效。'))),
                cbiRow(_('应用操作'), E('div', { class: 'rw-actions' }, [applyBtn, applyActivateBtn]))
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
            return Promise.resolve(ui.changes.apply(true));
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
