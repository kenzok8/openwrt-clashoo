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
let callListTemplates = rpc.declare({ object: 'luci.clash', method: 'list_templates', expect: {} });
let callListTemplateBindings = rpc.declare({ object: 'luci.clash', method: 'list_template_bindings', expect: {} });
let callSetTemplateBinding = rpc.declare({ object: 'luci.clash', method: 'set_template_binding', params: ['sub_name', 'template_name', 'enabled'], expect: {} });
let callApplyTemplateForSub = rpc.declare({ object: 'luci.clash', method: 'apply_template_for_sub', params: ['sub_name', 'template_name', 'set_active'], expect: {} });
let callApplyEnabledTemplateBindings = rpc.declare({ object: 'luci.clash', method: 'apply_enabled_template_bindings', params: ['set_active'], expect: {} });


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
            callListDir('3'),
            callListTemplates(),
            callListTemplateBindings()
        ]);
    },

    render: function (data) {
        let subData      = data[1] || {};
        let subFileData  = data[2] || {};
        let uploadData   = data[3] || {};
        let customData   = data[4] || {};
        let templateData = data[5] || {};
        let bindingData  = data[6] || {};
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
            let templates = (templateData.files || []).map(function (f) { return f.name; });
            let subs = subData.subs || [];
            let bindRows = bindingData.bindings || [];
            let bindingMap = {};
            bindRows.forEach(function (b) { bindingMap[b.sub_name] = b; });

            let rowStyle = 'display:flex;align-items:center;margin:8px 0';
            let labelStyle = 'min-width:100px;flex-shrink:0;font-weight:500';
            let inputGroupStyle = 'display:flex;align-items:center;gap:8px;flex:1;flex-wrap:wrap';

            let uploadInput = E('input', { type: 'file', accept: '.yaml,.yml', style: 'max-width:260px' });
            let uploadBtn = E('button', { type: 'button', class: 'btn cbi-button cbi-button-action' }, _('上传模板'));
            uploadBtn.addEventListener('click', function () {
                let files = uploadInput.files;
                if (!files || !files.length) { setPageStatus(_('请选择模板文件'), false); return; }
                let file = files[0];
                setPageStatus(_('上传模板中...'), true);
                let reader = new FileReader();
                reader.onload = function (ev) {
                    callUploadConfig(file.name, ev.target.result, '3').then(function (r) {
                        if (r && r.success) {
                            setPageStatus(_('模板上传成功：') + file.name, true);
                            setTimeout(function () { location.reload(); }, 900);
                        } else {
                            setPageStatus(_('模板上传失败'), false);
                        }
                    }).catch(function (e) {
                        setPageStatus(_('模板上传失败: ') + (e && e.message ? e.message : e), false);
                    });
                };
                reader.readAsText(file);
            });

            let remoteUrl = E('input', {
                type: 'text', class: 'cbi-input-text', style: 'flex:1;min-width:260px',
                placeholder: 'https://example.com/template.yaml'
            });
            let remoteName = E('input', {
                type: 'text', class: 'cbi-input-text', style: 'width:180px',
                placeholder: _('模板文件名（可选）')
            });
            let remoteBtn = E('button', { type: 'button', class: 'btn cbi-button cbi-button-action' }, _('拉取模板'));
            remoteBtn.addEventListener('click', function () {
                let url = (remoteUrl.value || '').trim();
                if (!url) { setPageStatus(_('请输入模板 URL'), false); return; }
                setPageStatus(_('正在拉取模板...'), true);
                callFetchRewriteUrl(url, (remoteName.value || '').trim()).then(function (r) {
                    if (r && r.success) {
                        setPageStatus((r.message || _('模板拉取成功')) + '，页面将自动刷新', true);
                        setTimeout(function () { location.reload(); }, 900);
                    } else {
                        setPageStatus((r && (r.message || r.error)) || _('模板拉取失败'), false);
                    }
                }).catch(function (e) {
                    setPageStatus(_('模板拉取失败: ') + (e && e.message ? e.message : e), false);
                });
            });

            let batchBtn = E('button', { type: 'button', class: 'btn cbi-button cbi-button-apply' }, _('批量生成已启用绑定'));
            batchBtn.addEventListener('click', function () {
                setPageStatus(_('正在批量生成模板配置...'), true);
                callApplyEnabledTemplateBindings('0').then(function (r) {
                    if (r && r.success) {
                        setPageStatus(r.message || _('批量生成成功'), true);
                    } else {
                        setPageStatus((r && (r.message || r.error)) || _('批量生成存在失败项'), false);
                    }
                }).catch(function (e) {
                    setPageStatus(_('批量生成失败: ') + (e && e.message ? e.message : e), false);
                });
            });

            let batchActivateBtn = E('button', { type: 'button', class: 'btn cbi-button cbi-button-action' }, _('批量生成并切换活动配置'));
            batchActivateBtn.addEventListener('click', function () {
                setPageStatus(_('正在批量生成并切换活动配置...'), true);
                callApplyEnabledTemplateBindings('1').then(function (r) {
                    if (r && r.success) {
                        setPageStatus(r.message || _('批量生成成功'), true);
                        setTimeout(function () { location.reload(); }, 900);
                    } else {
                        setPageStatus((r && (r.message || r.error)) || _('批量生成存在失败项'), false);
                    }
                }).catch(function (e) {
                    setPageStatus(_('批量生成失败: ') + (e && e.message ? e.message : e), false);
                });
            });

            let table = E('table', { class: 'table cbi-section-table', style: 'width:100%;margin-top:8px' }, [
                E('thead', {}, E('tr', {}, [
                    E('th', { style: 'text-align:left' }, _('订阅')),
                    E('th', { style: 'text-align:left' }, _('模板文件')),
                    E('th', { style: 'text-align:center;width:88px' }, _('启用')),
                    E('th', { style: 'text-align:right;width:360px' }, _('操作'))
                ])),
                E('tbody', {}, (subs.length ? subs : [{ name: '' }]).map(function (sub) {
                    if (!sub.name) {
                        return E('tr', {}, [E('td', { colspan: '4', style: 'text-align:center;color:#888' }, _('暂无订阅，请先下载订阅'))]);
                    }

                    let bind = bindingMap[sub.name] || {};
                    let tplSel = E('select', { class: 'cbi-input-select', style: 'min-width:220px;max-width:420px' },
                        [E('option', { value: '' }, _('（不绑定模板）'))].concat(templates.map(function (t) {
                            return E('option', { value: t, selected: bind.template_name === t }, t);
                        }))
                    );
                    let en = E('input', { type: 'checkbox', checked: (bind.enabled || '0') === '1' });

                    let saveBtn = mkBtn(_('保存绑定'), 'apply', function () {
                        callSetTemplateBinding(sub.name, tplSel.value || '', en.checked ? '1' : '0').then(function (r) {
                            if (r && r.success) setPageStatus(_('已保存绑定：') + sub.name, true);
                            else setPageStatus((r && (r.message || r.error)) || _('保存绑定失败'), false);
                        }).catch(function (e) {
                            setPageStatus(_('保存绑定失败: ') + (e && e.message ? e.message : e), false);
                        });
                    });

                    let genBtn = mkBtn(_('生成'), 'action', function () {
                        if (!tplSel.value) { setPageStatus(_('请先选择模板：') + sub.name, false); return; }
                        setPageStatus(_('正在生成：') + sub.name, true);
                        callApplyTemplateForSub(sub.name, tplSel.value, '0').then(function (r) {
                            if (r && r.success) setPageStatus(r.message || _('生成成功'), true);
                            else setPageStatus((r && (r.message || r.error)) || _('生成失败'), false);
                        }).catch(function (e) {
                            setPageStatus(_('生成失败: ') + (e && e.message ? e.message : e), false);
                        });
                    });

                    let genActBtn = mkBtn(_('生成并启用'), 'apply', function () {
                        if (!tplSel.value) { setPageStatus(_('请先选择模板：') + sub.name, false); return; }
                        setPageStatus(_('正在生成并启用：') + sub.name, true);
                        callApplyTemplateForSub(sub.name, tplSel.value, '1').then(function (r) {
                            if (r && r.success) {
                                setPageStatus(r.message || _('生成并启用成功'), true);
                                setTimeout(function () { location.reload(); }, 900);
                            } else {
                                setPageStatus((r && (r.message || r.error)) || _('生成失败'), false);
                            }
                        }).catch(function (e) {
                            setPageStatus(_('生成失败: ') + (e && e.message ? e.message : e), false);
                        });
                    });

                    return E('tr', {}, [
                        E('td', {}, sub.name),
                        E('td', {}, tplSel),
                        E('td', { style: 'text-align:center' }, en),
                        E('td', { style: 'text-align:right;white-space:nowrap' }, [saveBtn, genBtn, genActBtn])
                    ]);
                }))
            ]);

            return Promise.resolve(E('div', { class: 'cbi-section' }, [
                E('h3', {}, _('复写设置')),
                E('p', { class: 'cbi-value-description', style: 'margin:0 10px 10px' },
                    _('模板复写模式：每个订阅可绑定一个模板，模板接管分组/规则结构，订阅提供节点池。')),
                E('div', { style: rowStyle + ';padding:0 10px;box-sizing:border-box' }, [
                    E('span', { style: labelStyle }, _('本地模板')),
                    E('div', { style: inputGroupStyle }, [uploadInput, uploadBtn])
                ]),
                E('div', { style: rowStyle + ';padding:0 10px;box-sizing:border-box' }, [
                    E('span', { style: labelStyle }, _('远程模板')),
                    E('div', { style: inputGroupStyle }, [remoteUrl, remoteName, remoteBtn])
                ]),
                E('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;padding:0 10px 10px;box-sizing:border-box' }, [batchBtn, batchActivateBtn]),
                E('div', { style: 'padding:0 10px 10px;box-sizing:border-box' }, [table])
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
