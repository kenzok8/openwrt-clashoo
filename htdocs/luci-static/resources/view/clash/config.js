'use strict';
'require view';
'require form';
'require rpc';
'require uci';
'require tools.clash as clash';

let callListSubs    = rpc.declare({ object: 'luci.clash', method: 'list_subscriptions', expect: {} });
let callListDir     = rpc.declare({ object: 'luci.clash', method: 'list_dir_files', params: ['type'], expect: {} });
let callDeleteCfg   = rpc.declare({ object: 'luci.clash', method: 'delete_config', params: ['name', 'type'], expect: {} });
let callDownloadSubs= rpc.declare({ object: 'luci.clash', method: 'download_subs', expect: {} });
let callUpdateSub   = rpc.declare({ object: 'luci.clash', method: 'update_sub', params: ['name'], expect: {} });
let callSetConfig   = rpc.declare({ object: 'luci.clash', method: 'set_config', params: ['name'], expect: {} });
let callReadFile    = rpc.declare({ object: 'luci.clash', method: 'read_config_file', params: ['path'], expect: {} });
let callWriteFile   = rpc.declare({ object: 'luci.clash', method: 'write_config_file', params: ['path', 'content'], expect: {} });

function mkBtn(label, style, fn) {
    let b = E('button', {
        class: 'btn cbi-button cbi-button-' + style,
        style: 'margin:1px 2px'
    }, label);
    b.addEventListener('click', fn);
    return b;
}

function renderFileTable(title, rows, activeName, ctype, container) {
    if (!rows || !rows.length) {
        container.appendChild(E('p', { class: 'cbi-value-description' }, _('暂无文件')));
        return;
    }
    let tbl = E('table', { class: 'table cbi-section-table', style: 'width:100%' }, [
        E('thead', {}, E('tr', {}, [
            E('th', {}, _('文件名')),
            E('th', {}, _('更新时间')),
            E('th', {}, _('大小')),
            E('th', {}, _('操作'))
        ])),
        E('tbody', {}, rows.map(f => {
            let isActive = f.name === activeName || f.active;
            let nameCell = isActive
                ? E('td', {}, E('strong', { style: 'color:#4CAF50' }, '▶ ' + f.name))
                : E('td', {}, f.name);
            let actions = E('td', {}, [
                mkBtn(_('使用'), 'apply', () => {
                    callSetConfig(f.name).then(() => {
                        L.ui.addNotification(null, E('p', _('配置已切换：') + f.name));
                        container.dataset.refresh = '1';
                    });
                }),
                mkBtn(_('删除'), 'remove', () => {
                    if (!confirm(_('确认删除 ') + f.name + '？')) return;
                    callDeleteCfg(f.name, ctype).then(() => location.reload());
                })
            ]);
            return E('tr', {}, [nameCell, E('td', {}, f.mtime || '-'), E('td', {}, f.size || '-'), actions]);
        }))
    ]);
    container.appendChild(E('h3', { style: 'margin:1em 0 .4em' }, title));
    container.appendChild(tbl);
}

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('clash'),
            callListSubs(),
            callListDir('2'),
            callListDir('3')
        ]);
    },

    render: function (data) {
        let subData    = data[1] || {};
        let uploadData = data[2] || {};
        let customData = data[3] || {};
        let activeName = subData.active || '';

        let m, s, o;
        m = new form.Map('clash', _('配置管理'));

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
            return m.save().then(() => callDownloadSubs()).then(() => {
                L.ui.addNotification(null, E('p', _('订阅下载任务已启动，稍后刷新页面查看结果')));
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
                                E('th', {}, _('文件名')),
                                E('th', {}, _('类型')),
                                E('th', {}, _('链接')),
                                E('th', {}, _('更新时间')),
                                E('th', {}, _('大小')),
                                E('th', {}, _('操作'))
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
                                let actions = E('td', {}, [
                                    sub.has_file ? mkBtn(_('使用'), 'apply', () => {
                                        callSetConfig(sub.name).then(() => location.reload());
                                    }) : '',
                                    sub.url ? mkBtn(_('更新'), 'apply', () => {
                                        callUpdateSub(sub.name).then(() =>
                                            L.ui.addNotification(null, E('p', _('更新任务已启动：') + sub.name)));
                                    }) : '',
                                    mkBtn(_('删除'), 'remove', () => {
                                        if (!confirm(_('确认删除 ') + sub.name + '？')) return;
                                        callDeleteCfg(sub.name, '1').then(() => location.reload());
                                    })
                                ]);
                                return E('tr', {}, [nameCell, E('td', {}, sub.type || '-'), urlCell,
                                    E('td', {}, sub.mtime || '-'), E('td', {}, sub.size || '-'), actions]);
                            }))
                        ])
                    ])
                ]);
                return Promise.resolve(node);
            };
        }

        /* ─── 上传配置 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('上传配置文件'));
        s.anonymous = false;
        s.description = _('上传本地 .yaml / .yml 文件作为配置来源（存入 upload/ 目录）');
        s.render = function () {
            let input = E('input', {
                type: 'file', accept: '.yaml,.yml',
                id: 'cfg-upload-input'
            });
            let status = E('span', { style: 'margin-left:8px;color:#666;font-size:.9rem' }, '');
            let btn = E('button', {
                type: 'button',
                class: 'btn cbi-button cbi-button-apply'
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
            /* Use same cbi-value row structure as form.Button so the button
               sits in the value column and aligns with "下载订阅" above */
            let node = E('div', { class: 'cbi-section' }, [
                E('h3', {}, _('上传配置文件')),
                E('p', { class: 'cbi-value-description' }, _('上传本地 .yaml / .yml 文件作为配置来源（存入 upload/ 目录）')),
                E('div', { class: 'cbi-section-node' }, [
                    E('div', { class: 'cbi-value' }, [
                        E('label', { class: 'cbi-value-title' }, ''),
                        E('div', { class: 'cbi-value-field' }, [input])
                    ]),
                    E('div', { class: 'cbi-value' }, [
                        E('label', { class: 'cbi-value-title' }, ''),
                        E('div', { class: 'cbi-value-field' }, [btn, status])
                    ])
                ])
            ]);
            return Promise.resolve(node);
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

        o = s.option(form.Value, 'api_secret', _('访问鉴权密钥'));
        o.password = true;
        o.placeholder = _('留空不鉴权');
        o.rmempty = true;
        o.description = _('访问 RESTful API 及面板所需的 Bearer Token，留空则无需鉴权');

        o = s.option(form.ListValue, 'selection_cache', _('记忆代理节点选择'));
        o.optional = true;
        o.value('', _('不修改'));
        o.value('0', _('禁用'));
        o.value('1', _('启用'));
        o.default = '1';
        o.description = _('重启后保留上次选择的代理节点与策略组');

        /* ─── 已上传文件列表 ─── */
        let uploadFiles = uploadData.files || [];
        let customFiles = customData.files || [];

        s = m.section(form.NamedSection, 'config', 'clash', _('文件列表'));
        s.anonymous = false;
        s.render = function () {
            let node = E('div', { class: 'cbi-section' });
            renderFileTable(_('上传配置文件'), uploadFiles, activeName, '2', node);
            renderFileTable(_('自定义配置文件'), customFiles, activeName, '3', node);
            return Promise.resolve(node);
        };

        return m.render();
    },

    handleSaveApply: function (ev) {
        return this.handleSave(ev).then(() => clash.restart());
    }
});
