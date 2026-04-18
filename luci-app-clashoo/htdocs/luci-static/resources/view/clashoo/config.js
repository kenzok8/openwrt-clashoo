'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require rpc';
'require tools.clashoo as clashoo';

var CSS = [
  '.cl-tabs{display:flex;border-bottom:2px solid rgba(128,128,128,.15);margin-bottom:18px}',
  '.cl-tab{padding:10px 20px;cursor:pointer;font-size:13px;opacity:.55;border-bottom:2px solid transparent;margin-bottom:-2px;transition:opacity .15s}',
  '.cl-tab.active{opacity:1;border-bottom-color:currentColor;font-weight:600}',
  '.cl-panel{display:none}.cl-panel.active{display:block}',
  '.cl-sub-list{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;table-layout:fixed}',
  '.cl-sub-list th,.cl-sub-list td{padding:8px 10px;border-bottom:1px solid rgba(128,128,128,.15);text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.cl-sub-list th{font-size:11px;opacity:.55;font-weight:600}',
  '.cl-sub-list th:nth-child(2),.cl-sub-list td:nth-child(2){width:72px}',
  '.cl-sub-list th:nth-child(3),.cl-sub-list td:nth-child(3){width:180px;text-align:right;white-space:nowrap}',
  '.cl-sub-url{border:1px solid rgba(128,128,128,.3);border-radius:6px;padding:8px 10px;width:100%;box-sizing:border-box;font-size:13px;margin-bottom:8px}',
  '.cl-btn-sm{padding:4px 10px;font-size:12px;border-radius:4px;cursor:pointer}',
  '.cl-section{margin-bottom:24px}',
  '.cl-section h4{font-size:13px;font-weight:700;margin-bottom:10px;opacity:.7}',
  /* constrain form inputs on desktop, table stays full-width */
  '.cl-form-wrap{max-width:640px}',
  '.cl-rewrite-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}',
  '.cl-actions{display:flex;gap:8px;flex-wrap:wrap}',
  '.cl-save-bar{display:flex;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(128,128,128,.15)}',
  '.cl-json-editor{width:100%;height:340px;font-family:monospace;font-size:11px;border:1px solid rgba(128,128,128,.25);border-radius:8px;padding:10px;box-sizing:border-box;resize:vertical;background:rgba(0,0,0,.02)}',
  '.cl-editor-hdr{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;font-weight:600}',
  '.cl-active-badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:#e8f5e9;color:#2e7d32}',
  '.cl-hint{font-size:11px;opacity:.45;margin-left:auto}',
  /* hide auto-generated section IDs in TypedSection */
  '.cbi-section-table-titles .cbi-section-table-cell:first-child{display:none}',
  '.cbi-section-table-row .cbi-section-table-cell:first-child{display:none}',
  '.cl-mode-tabs{display:inline-flex;gap:4px;margin:6px 0}',
  '.cl-mode-tab-active{font-weight:700}',
  '.cl-panel .cbi-section>h3{font-size:13px !important;font-weight:600;margin-bottom:8px}',
  '.cl-panel .cbi-value-title{font-size:12px !important}',
  '.cl-panel .cbi-value-field input,.cl-panel .cbi-value-field select,.cl-panel .cbi-value-field textarea{font-size:13px !important}',
  '.cl-panel .cbi-section-descr,.cl-panel .cbi-value-helptext{font-size:12px !important}',
  '.cl-panel .cbi-section{margin-bottom:12px}',
  '@media(max-width:680px){.cl-form-wrap{max-width:100%}}'
].join('');

var callListSubs      = rpc.declare({ object: 'luci.clashoo', method: 'list_subscriptions',  expect: {} });
var callListDir       = rpc.declare({ object: 'luci.clashoo', method: 'list_dir_files',      params: ['type'], expect: {} });
var callDownloadSubs  = rpc.declare({ object: 'luci.clashoo', method: 'download_subs',       expect: {} });
var callUpdateSub     = rpc.declare({ object: 'luci.clashoo', method: 'update_sub',          params: ['name'], expect: {} });
var callSetConfig     = rpc.declare({ object: 'luci.clashoo', method: 'set_config',          params: ['name'], expect: {} });
var callDeleteCfg     = rpc.declare({ object: 'luci.clashoo', method: 'delete_config',       params: ['name', 'type'], expect: {} });
var callUploadConfig  = rpc.declare({ object: 'luci.clashoo', method: 'upload_config',       params: ['name', 'content', 'type'], expect: {} });
var callApplyRewrite  = rpc.declare({ object: 'luci.clashoo', method: 'apply_rewrite',          params: ['base_type','base_name','rewrite_type','rewrite_name','output_name','set_active'], expect: {} });
var callFetchUrl      = rpc.declare({ object: 'luci.clashoo', method: 'fetch_rewrite_url',      params: ['url','name'], expect: {} });
var callApplyTplUrl   = rpc.declare({ object: 'luci.clashoo', method: 'apply_template_with_url', params: ['template_source','sub_url','output_name','set_active'], expect: {} });
var callMigrateSbProfile = rpc.declare({ object: 'luci.clashoo', method: 'migrate_singbox_profile', params: ['name'], expect: {} });

return view.extend({
  _tab: 'subs',

  load: function () {
    return Promise.all([
      L.resolveDefault(callListSubs(), { subs: [], url: '' }),
      L.resolveDefault(callListDir('1'), { files: [] }),
      L.resolveDefault(callListDir('2'), { files: [] }),
      L.resolveDefault(callListDir('3'), { files: [] }),
      uci.load('clashoo'),
      clashoo.listSingboxProfiles()
    ]);
  },

  render: function (data) {
    var self       = this;
    var subsData   = data[0] || {};
    var subFiles   = (data[1] && data[1].files) || [];
    var upFiles    = (data[2] && data[2].files) || [];
    var tplFiles   = (data[3] && data[3].files) || [];
    var sbData     = data[5] || { profiles: [], active: '' };
    var coreType   = uci.get('clashoo', 'config', 'core_type') || 'mihomo';

    if (!document.getElementById('cl-css')) {
      var s = document.createElement('style');
      s.id = 'cl-css'; s.textContent = CSS;
      document.head.appendChild(s);
    }

    if (coreType === 'singbox') return this._renderSingbox(sbData);

    var tabs = [
      { id: 'subs', label: '订阅' },
      { id: 'proxy', label: '代理' },
      { id: 'dns',   label: 'DNS' }
    ];
    var tabEls   = {};
    var panelEls = {};

    var tabBar = E('div', { 'class': 'cl-tabs' },
      tabs.map(function (t) {
        var el = E('div', {
          'class': 'cl-tab' + (self._tab === t.id ? ' active' : ''),
          click: function () {
            Object.keys(tabEls).forEach(function (k) {
              tabEls[k].className   = 'cl-tab'   + (k === t.id ? ' active' : '');
              panelEls[k].className = 'cl-panel' + (k === t.id ? ' active' : '');
            });
            self._tab = t.id;
          }
        }, t.label);
        tabEls[t.id] = el;
        return el;
      })
    );

    var subPanel = E('div', { 'class': 'cl-panel' + (this._tab === 'subs' ? ' active' : ''), id: 'cl-panel-subs' },
      this._buildSubsPanel(subsData, subFiles, upFiles, tplFiles)
    );
    panelEls['subs'] = subPanel;

    var proxyPanel = E('div', { 'class': 'cl-panel' + (this._tab === 'proxy' ? ' active' : ''), id: 'cl-panel-proxy' });
    panelEls['proxy'] = proxyPanel;
    this._buildProxyForm(proxyPanel);

    var dnsPanel = E('div', { 'class': 'cl-panel' + (this._tab === 'dns' ? ' active' : ''), id: 'cl-panel-dns' });
    panelEls['dns'] = dnsPanel;
    this._buildDnsForm(dnsPanel);

    return E('div', {}, [tabBar, subPanel, proxyPanel, dnsPanel]);
  },

  _buildSubsPanel: function (subsData, subFiles, upFiles, tplFiles) {
    var self = this;
    var subUrl      = uci.get('clashoo', 'config', 'subscribe_url') || '';
    var savedName   = uci.get('clashoo', 'config', 'config_name')   || '';
    var subs        = subsData.subs || [];

    var urlInput = E('input', {
      'class': 'cl-sub-url',
      type: 'text',
      placeholder: '订阅链接（多条用换行分隔）',
      value: subUrl
    });

    var nameInput = E('input', {
      'class': 'cl-sub-url',
      type: 'text',
      placeholder: '文件名（选填，留空自动生成）',
      value: savedName,
      style: 'margin-top:0'
    });

    var dlBtn = E('button', {
      'class': 'btn cbi-button-action cl-btn-sm',
      click: function () {
        uci.set('clashoo', 'config', 'subscribe_url', urlInput.value);
        uci.set('clashoo', 'config', 'config_name',   nameInput.value.trim());
        uci.save()
          .then(function () { return clashoo.commitConfig(); })
          .then(function () { return L.resolveDefault(callDownloadSubs(), {}); })
          .then(function (r) {
            ui.addNotification(null, E('p', r.success ? '下载成功' : '下载失败: ' + (r.message || '')));
            location.reload();
          });
      }
    }, '下载订阅');

    var subRows = subs.map(function (sub) {
      var nameCells = sub.active
        ? [E('span', { 'class': 'cl-active-badge', style: 'margin-right:6px' }, '使用中'), sub.name]
        : [sub.name];
      return E('tr', {}, [
        E('td', {}, nameCells),
        E('td', { style: 'opacity:.5;font-size:11px' }, sub.size || ''),
        E('td', {}, [
          E('button', {
            'class': 'btn cbi-button cl-btn-sm',
            style: 'margin-right:4px',
            click: function () {
              L.resolveDefault(callUpdateSub(sub.name), {}).then(function (r) {
                ui.addNotification(null, E('p', r.success ? sub.name + ' 更新成功' : '更新失败'));
                location.reload();
              });
            }
          }, '更新'),
          E('button', {
            'class': 'btn cbi-button cl-btn-sm',
            style: 'margin-right:4px',
            click: function () {
              L.resolveDefault(callSetConfig(sub.name), {}).then(function () { location.reload(); });
            }
          }, '切换'),
          E('button', {
            'class': 'btn cbi-button-negative cl-btn-sm',
            click: function () {
              if (!confirm('删除 ' + sub.name + '？')) return;
              L.resolveDefault(callDeleteCfg(sub.name, '1'), {}).then(function () { location.reload(); });
            }
          }, '删除')
        ])
      ]);
    });

    var uploadInput = E('input', { type: 'file', accept: '.yaml,.yml', style: 'display:none', id: 'cl-upload-input' });
    uploadInput.addEventListener('change', function (ev) {
      var file = ev.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        L.resolveDefault(callUploadConfig(file.name, e.target.result, '2'), {}).then(function (r) {
          ui.addNotification(null, E('p', r.success ? '上传成功: ' + r.name : '上传失败'));
          location.reload();
        });
      };
      reader.readAsText(file);
    });

    var mkSel = function (files, placeholder) {
      return E('select', { 'class': 'cbi-input-select' },
        [E('option', { value: '' }, placeholder)].concat(
          files.map(function (f) { return E('option', { value: f.name }, f.name); })
        )
      );
    };

    /* ── 模板复写（注入订阅 URL 模式）── */
    var tplSel     = mkSel(tplFiles, '选择本地模板文件');
    var tplUrlIn   = E('input', { type: 'text', 'class': 'cl-sub-url', placeholder: '输入远程模板 URL，例如 https://raw.githubusercontent.com/…/Clash.yaml' });
    var subUrlIn   = E('input', { type: 'text', 'class': 'cl-sub-url', placeholder: '输入订阅链接 URL（注入到模板的 proxy-providers）', style: 'margin-top:6px' });
    var outNameIn  = E('input', { type: 'text', 'class': 'cl-sub-url', placeholder: '输出文件名（不含扩展名，留空自动填写）', style: 'margin-top:6px' });
    var rwMode     = 'local';

    function rwAutoFill() {
      if (outNameIn.value) return;
      var tpl = rwMode === 'local' ? tplSel.value.replace(/\.(yaml|yml)$/, '') : 'remote-tpl';
      if (tpl) outNameIn.value = tpl + '-rewrite';
    }
    tplSel.addEventListener('change', rwAutoFill);

    var localPanel  = E('div', { style: 'margin-top:8px' }, [tplSel]);
    var remotePanel = E('div', { style: 'display:none;margin-top:8px' }, [tplUrlIn]);

    var tabLocal  = E('button', { 'class': 'btn cbi-button cl-btn-sm cl-mode-tab-active',
      click: function () {
        rwMode = 'local';
        localPanel.style.display  = ''; remotePanel.style.display = 'none';
        tabLocal.classList.add('cl-mode-tab-active');
        tabRemote.classList.remove('cl-mode-tab-active');
        outNameIn.value = '';
        rwAutoFill();
      }
    }, '本地模板');
    var tabRemote = E('button', { 'class': 'btn cbi-button cl-btn-sm',
      click: function () {
        rwMode = 'remote';
        localPanel.style.display  = 'none'; remotePanel.style.display = '';
        tabRemote.classList.add('cl-mode-tab-active');
        tabLocal.classList.remove('cl-mode-tab-active');
        outNameIn.value = '';
      }
    }, '远程模板');

    var rwApply = function (setActive) {
      var tplSrc = rwMode === 'local' ? tplSel.value : tplUrlIn.value.trim();
      var subUrl = subUrlIn.value.trim();
      var out    = outNameIn.value.trim();
      if (!tplSrc) { ui.addNotification(null, E('p', rwMode === 'local' ? '请选择本地模板文件' : '请输入远程模板 URL')); return; }
      if (!subUrl) { ui.addNotification(null, E('p', '请输入订阅链接 URL')); return; }
      if (!out)    { ui.addNotification(null, E('p', '请填写输出文件名')); return; }
      L.resolveDefault(callApplyTplUrl(tplSrc, subUrl, out, setActive ? '1' : '0'), {}).then(function (r) {
        ui.addNotification(null, E('p', r && r.success ? (r.message || '生成成功: ' + r.output_name) : ('生成失败: ' + (r && r.message || '未知错误'))));
        if (r && r.success) location.reload();
      });
    };

    /* ── 其他配置文件（上传 + 自定义/复写输出）── */
    var makeOtherRows = function (files, type) {
      return files.map(function (f) {
        var nameCells = f.active
          ? [E('span', { 'class': 'cl-active-badge', style: 'margin-right:6px' }, '使用中'), f.name]
          : [f.name];
        return E('tr', {}, [
          E('td', {}, nameCells),
          E('td', { style: 'opacity:.5;font-size:11px' }, f.size || ''),
          E('td', {}, [
            E('button', {
              'class': 'btn cbi-button cl-btn-sm',
              style: 'margin-right:4px',
              click: function () {
                L.resolveDefault(callSetConfig(f.name), {}).then(function () { location.reload(); });
              }
            }, '切换'),
            E('button', {
              'class': 'btn cbi-button-negative cl-btn-sm',
              click: function () {
                if (!confirm('删除 ' + f.name + '？')) return;
                L.resolveDefault(callDeleteCfg(f.name, type), {}).then(function () { location.reload(); });
              }
            }, '删除')
          ])
        ]);
      });
    };

    var otherFiles = (upFiles || []).map(function(f){ return {f:f, t:'2'}; })
      .concat((tplFiles || []).map(function(f){ return {f:f, t:'3'}; }));

    var otherRows = otherFiles.map(function(o) {
      return makeOtherRows([o.f], o.t)[0];
    });

    return [
      E('div', { 'class': 'cl-section' }, [
        E('h4', {}, '订阅链接'),
        E('div', { 'class': 'cl-form-wrap' }, [urlInput, nameInput, dlBtn])
      ]),
      E('div', { 'class': 'cl-section' }, [
        E('h4', {}, '已下载订阅'),
        subs.length ? E('table', { 'class': 'cl-sub-list' }, [
          E('thead', {}, E('tr', {}, [E('th', {}, '文件名'), E('th', {}, '大小'), E('th', {}, '操作')])),
          E('tbody', {}, subRows)
        ]) : E('p', { style: 'opacity:.5;font-size:13px' }, '暂无订阅')
      ]),
      E('div', { 'class': 'cl-section' }, [
        E('h4', {}, '上传配置文件'),
        uploadInput,
        E('button', {
          'class': 'btn cbi-button cl-btn-sm',
          click: function () { document.getElementById('cl-upload-input').click(); }
        }, '选择 YAML 文件上传')
      ]),
      otherFiles.length ? E('div', { 'class': 'cl-section' }, [
        E('h4', {}, '其他配置文件（上传 / 复写输出）'),
        E('table', { 'class': 'cl-sub-list' }, [
          E('thead', {}, E('tr', {}, [E('th', {}, '文件名'), E('th', {}, '大小'), E('th', {}, '操作')])),
          E('tbody', {}, otherRows)
        ])
      ]) : null,
      E('div', { 'class': 'cl-section' }, [
        E('h4', {}, '复写设置'),
        E('p', { style: 'font-size:12px;opacity:.6;margin:0 0 8px' }, '选择一个含 proxy-providers 的模板，填入订阅链接，自动将链接注入模板并生成可用配置'),
        E('div', { 'class': 'cl-form-wrap' }, [
          E('div', { 'class': 'cl-mode-tabs' }, [tabLocal, tabRemote]),
          localPanel,
          remotePanel,
          subUrlIn,
          outNameIn,
          E('div', { 'class': 'cl-actions', style: 'margin-top:8px' }, [
            E('button', { 'class': 'btn cbi-button cl-btn-sm', click: function(){ rwApply(false); } }, '生成（不切换）'),
            E('button', { 'class': 'btn cbi-button-action cl-btn-sm', click: function(){ rwApply(true); } }, '生成并切换')
          ])
        ])
      ])
    ];
  },

  _buildProxyForm: function (container) {
    var m = new form.Map('clashoo', '', '');
    var s, o;

    s = m.section(form.NamedSection, 'config', 'clashoo', '透明代理');
    s.addremove = false;
    o = s.option(form.ListValue, 'tcp_mode', 'TCP 模式');
    o.value('redirect', '重定向'); o.value('tproxy', '透明代理'); o.value('tun', '隧道模式（TUN）'); o.value('off', '关闭');
    o = s.option(form.ListValue, 'udp_mode', 'UDP 模式');
    o.value('tun', '隧道模式（TUN）'); o.value('tproxy', '透明代理'); o.value('off', '关闭');
    o = s.option(form.ListValue, 'stack', '网络栈类型');
    o.value('system', '系统栈'); o.value('gvisor', 'gVisor'); o.value('mixed', '混合栈'); o.value('lwip', 'LWIP');
    o = s.option(form.Flag, 'disable_quic_gso', '禁用 QUIC GSO');
    o = s.option(form.Flag, 'ipv4_dns_hijack', 'IPv4 DNS 劫持');
    o = s.option(form.Flag, 'ipv6_dns_hijack', 'IPv6 DNS 劫持');
    o = s.option(form.Flag, 'ipv4_proxy',      'IPv4 代理');
    o = s.option(form.Flag, 'ipv6_proxy',      'IPv6 代理');
    o = s.option(form.Flag, 'fake_ip_ping_hijack', '虚拟 IP Ping 劫持');

    s = m.section(form.NamedSection, 'config', 'clashoo', '端口配置');
    s.addremove = false;
    o = s.option(form.Flag,  'allow_lan',   '允许局域网连接');
    o = s.option(form.Value, 'http_port',   'HTTP 端口');
    o = s.option(form.Value, 'socks_port',  'SOCKS5 端口');
    o = s.option(form.Value, 'mixed_port',  '混合端口');
    o = s.option(form.Value, 'redir_port',  '重定向端口');
    o = s.option(form.Value, 'tproxy_port', '透明代理端口');

    s = m.section(form.NamedSection, 'config', 'clashoo', '智能策略设置');
    s.addremove = false;
    o = s.option(form.Flag,  'smart_auto_switch',     '智能策略自动切换');
    o = s.option(form.Value, 'smart_policy_priority', '节点权重加成');
    o.placeholder = 'Premium:0.9;SG:1.3';
    o.rmempty = true;
    o.description = '数值 <1 调低这个策略的优先级，>1 调高，默认为 1；格式：策略名:权重 多条用分号分隔，支持正则，例如 Premium:0.9;SG:1.3';
    o = s.option(form.Flag,  'smart_prefer_asn',      'ASN 优先');
    o = s.option(form.Flag,  'smart_uselightgbm',     '启用 LightGBM 模型');
    o = s.option(form.Flag,  'smart_collectdata',     '收集训练数据');
    o = s.option(form.Flag,  'smart_lgbm_auto_update','自动更新模型');

    var sa = m.section(form.TypedSection, 'authentication', '代理认证');
    sa.anonymous = true; sa.addremove = true;
    o = sa.option(form.Value, 'username', '用户名');
    o = sa.option(form.Value, 'password', '密码');

    m.render().then(function (node) {
      container.appendChild(node);
      container.appendChild(E('div', { 'class': 'cl-save-bar' }, [
        E('button', { 'class': 'btn cbi-button', click: function () {
          m.save().then(function () { return clashoo.commitConfig(); })
            .then(function () { location.reload(); })
            .catch(function (e) { ui.addNotification(null, E('p', '保存失败: ' + (e.message || e))); });
        }}, '保存配置'),
        E('button', { 'class': 'btn cbi-button-action', click: function () {
          m.save().then(function () { return clashoo.commitConfig(); })
            .then(function () { return clashoo.restart(); })
            .then(function () { ui.addNotification(null, E('p', '代理配置已保存并重启服务')); })
            .catch(function (e) { ui.addNotification(null, E('p', '操作失败: ' + (e.message || e))); });
        }}, '应用配置')
      ]));
    });
  },

  _buildDnsForm: function (container) {
    var m = new form.Map('clashoo', '', '');
    var s, o;

    s = m.section(form.NamedSection, 'config', 'clashoo', '基础 DNS');
    s.addremove = false;
    o = s.option(form.Flag,        'enable_dns',        '启用 DNS 模块');
    o = s.option(form.Value,       'listen_port',       'DNS 监听端口');
    o = s.option(form.ListValue,   'enhanced_mode',     '增强模式');
    o.value('fake-ip', '虚拟 IP'); o.value('redir-host', '域名直连');
    o = s.option(form.Value,       'fake_ip_range',     '虚拟 IP 网段');
    o = s.option(form.Value,       'default_nameserver','默认 DNS 服务器');
    o = s.option(form.Flag,        'dnsforwader',       '强制转发 DNS');
    o = s.option(form.DynamicList, 'fake_ip_filter',    '虚拟 IP 过滤域名');

    s = m.section(form.TypedSection, 'dnsservers', '上游 DNS 服务器');
    s.addremove = true; s.anonymous = true;
    o = s.option(form.ListValue, 'ser_type', '角色');
    o.value('nameserver','主解析'); o.value('fallback','回退解析');
    o = s.option(form.Value,     'ser_address', 'DNS 地址');
    o.placeholder = '例如 https://doh.pub/dns-query';
    o = s.option(form.ListValue, 'protocol',    '协议');
    o.value('udp','UDP'); o.value('tcp','TCP'); o.value('doh','DoH'); o.value('dot','DoT');

    s = m.section(form.TypedSection, 'dnshijack', 'DNS 劫持');
    s.addremove = true; s.anonymous = true;
    o = s.option(form.ListValue, 'type', '协议类型');
    o.value('udp','UDP'); o.value('tcp','TCP');
    o = s.option(form.Value, 'ip',   '目标 DNS');
    o.placeholder = '例如 114.114.114.114';
    o = s.option(form.Value, 'port', '端口');
    o.placeholder = '53';

    m.render().then(function (node) {
      container.appendChild(node);
      container.appendChild(E('div', { 'class': 'cl-save-bar' }, [
        E('button', { 'class': 'btn cbi-button', click: function () {
          m.save().then(function () { return clashoo.commitConfig(); })
            .then(function () { location.reload(); })
            .catch(function (e) { ui.addNotification(null, E('p', '保存失败: ' + (e.message || e))); });
        }}, '保存配置'),
        E('button', { 'class': 'btn cbi-button-action', click: function () {
          m.save().then(function () { return clashoo.commitConfig(); })
            .then(function () { return clashoo.restart(); })
            .then(function () { ui.addNotification(null, E('p', 'DNS 配置已保存并重启服务')); })
            .catch(function (e) { ui.addNotification(null, E('p', '操作失败: ' + (e.message || e))); });
        }}, '应用配置')
      ]));
    });
  },

  /* ── sing-box UI ── */

  _renderSingbox: function (sbData) {
    var self = this;
    var profiles = sbData.profiles || [];
    var sbTab = 'profiles';
    var tabEls = {}, panelEls = {};

    var tabs = [
      { id: 'profiles', label: '配置文件' },
      { id: 'wizard',   label: '快速向导' }
    ];

    var tabBar = E('div', { 'class': 'cl-tabs' },
      tabs.map(function (t) {
        var el = E('div', {
          'class': 'cl-tab' + (t.id === 'profiles' ? ' active' : ''),
          click: function () {
            Object.keys(tabEls).forEach(function (k) {
              tabEls[k].className   = 'cl-tab'   + (k === t.id ? ' active' : '');
              panelEls[k].className = 'cl-panel' + (k === t.id ? ' active' : '');
            });
          }
        }, t.label);
        tabEls[t.id] = el;
        return el;
      })
    );

    var profilesPanel = E('div', { 'class': 'cl-panel active' },
      self._buildSbProfilesPanel(profiles, sbData.active || ''));
    panelEls['profiles'] = profilesPanel;

    var wizardPanel = E('div', { 'class': 'cl-panel' },
      self._buildSbWizardPanel());
    panelEls['wizard'] = wizardPanel;

    return E('div', {}, [tabBar, profilesPanel, wizardPanel]);
  },

  _buildSbProfilesPanel: function (profiles, activeProfile) {
    var self = this;

    /* ── JSON editor (initially hidden) ── */
    var editorTitle = E('span', { 'class': 'cl-editor-hdr' }, '选择上方配置后可在此处编辑');
    var textarea    = E('textarea', { 'class': 'cl-json-editor', placeholder: '选择配置文件后内容将显示在这里…' });
    var saveBtn = E('button', {
      'class': 'btn cbi-button-action cl-btn-sm',
      disabled: '',
      click: function () {
        var name = textarea.dataset.name;
        if (!name) return;
        clashoo.saveSingboxProfile(name, textarea.value).then(function (r) {
          if (r.success) ui.addNotification(null, E('p', name + ' 已保存'));
          else ui.addNotification(null, E('p', '保存失败: ' + (r.message || r.error || '')));
        });
      }
    }, '保存');

    var migrateBtn = E('button', {
      'class': 'btn cbi-button cl-btn-sm',
      disabled: '',
      click: function () {
        var name = textarea.dataset.name;
        if (!name) return;
        L.resolveDefault(callMigrateSbProfile(name), {}).then(function (r) {
          if (r && r.success) {
            var msg = r.changes && r.changes.length ? '已修复废弃字段: ' + r.changes.join(', ') : '配置已是最新，无需修复';
            ui.addNotification(null, E('p', msg));
            /* 重新加载编辑器内容 */
            clashoo.getSingboxProfile(name).then(function (gr) { textarea.value = gr.content || ''; });
          } else {
            ui.addNotification(null, E('p', '修复失败: ' + ((r && r.message) || '')));
          }
        });
      }
    }, '修复废弃字段');

    var editorBox = E('div', { 'class': 'cl-section', style: 'margin-top:16px' }, [
      editorTitle,
      textarea,
      E('div', { 'class': 'cl-actions', style: 'margin-top:6px' }, [
        saveBtn,
        migrateBtn,
        E('span', { 'class': 'cl-hint' }, '编辑后点击保存；切换配置后服务将自动重启')
      ])
    ]);

    function loadEditor(name) {
      editorTitle.textContent = '编辑：' + name;
      saveBtn.removeAttribute('disabled');
      migrateBtn.removeAttribute('disabled');
      textarea.dataset.name = name;
      textarea.value = '加载中…';
      clashoo.getSingboxProfile(name).then(function (r) {
        textarea.value = r.content || '';
      });
    }

    /* ── Profile table ── */
    var rows = profiles.length
      ? profiles.map(function (p) {
          return E('tr', {}, [
            E('td', {}, [
              p.name,
              p.active ? E('span', { 'class': 'cl-active-badge', style: 'margin-left:6px' }, '使用中') : ''
            ]),
            E('td', { style: 'opacity:.5;font-size:12px' }, p.size || '—'),
            E('td', { style: 'white-space:nowrap' }, [
              E('button', {
                'class': 'btn cbi-button cl-btn-sm',
                style: 'margin-right:4px',
                click: function () { loadEditor(p.name); }
              }, '编辑'),
              E('button', {
                'class': 'btn cbi-button cl-btn-sm',
                style: 'margin-right:4px',
                click: function () {
                  clashoo.setSingboxProfile(p.name).then(function (r) {
                    ui.addNotification(null, E('p', r.success ? '已切换至 ' + p.name : ('切换失败: ' + (r.message || ''))));
                    if (r.success) location.reload();
                  });
                }
              }, p.active ? '重新应用' : '切换'),
              E('button', {
                'class': 'btn cbi-button-negative cl-btn-sm',
                click: function () {
                  if (!confirm('删除 ' + p.name + '？')) return;
                  clashoo.deleteSingboxProfile(p.name).then(function () { location.reload(); });
                }
              }, '删除')
            ])
          ]);
        })
      : [E('tr', {}, [E('td', { colspan: '3', style: 'opacity:.4;font-size:13px;padding:16px 0' }, '暂无配置文件，请使用快速向导生成或上传 JSON 文件')])];

    /* ── Upload ── */
    var uploadInput = E('input', { type: 'file', accept: '.json', style: 'display:none', id: 'sb-upload' });
    uploadInput.addEventListener('change', function (ev) {
      var file = ev.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        clashoo.saveSingboxProfile(file.name, e.target.result).then(function (r) {
          if (r.success) { ui.addNotification(null, E('p', '上传成功: ' + r.name)); location.reload(); }
          else ui.addNotification(null, E('p', '上传失败: ' + (r.message || r.error || '')));
        });
      };
      reader.readAsText(file);
    });

    return [
      E('div', { 'class': 'cl-section' }, [
        E('h4', {}, 'sing-box 配置文件'),
        E('table', { 'class': 'cl-sub-list' }, [
          E('thead', {}, E('tr', {}, [E('th', {}, '文件名'), E('th', {}, '大小'), E('th', {}, '操作')])),
          E('tbody', {}, rows)
        ]),
        uploadInput,
        E('div', { 'class': 'cl-actions', style: 'margin-top:8px' }, [
          E('button', {
            'class': 'btn cbi-button cl-btn-sm',
            click: function () { document.getElementById('sb-upload').click(); }
          }, '上传 JSON 配置')
        ])
      ]),
      editorBox
    ];
  },

  _buildSbWizardPanel: function () {
    var urlInput = E('input', {
      'class': 'cl-sub-url',
      type: 'text',
      placeholder: '粘贴订阅链接（支持 vmess / vless / trojan 等）'
    });
    var nameInput = E('input', {
      'class': 'cl-sub-url',
      type: 'text',
      placeholder: '配置文件名（选填，留空自动生成 singbox.json）',
      style: 'margin-top:0'
    });
    var secretInput = E('input', {
      'class': 'cl-sub-url',
      type: 'text',
      placeholder: 'API 密钥（选填，留空使用当前面板密码）',
      style: 'margin-top:0'
    });

    function doCreate(setActive) {
      var url = urlInput.value.trim();
      if (!url) { ui.addNotification(null, E('p', '请填写订阅链接')); return; }
      clashoo.createSingboxConfig(url, nameInput.value.trim(), secretInput.value.trim())
        .then(function (r) {
          if (!r.success) { ui.addNotification(null, E('p', '生成失败: ' + (r.message || ''))); return; }
          if (setActive) {
            return clashoo.setSingboxProfile(r.name).then(function () {
              ui.addNotification(null, E('p', r.message + '，已切换为活动配置'));
              location.reload();
            });
          }
          ui.addNotification(null, E('p', r.message));
          location.reload();
        });
    }

    return [
      E('div', { 'class': 'cl-section' }, [
        E('h4', {}, '一键生成 sing-box 配置'),
        E('div', { 'class': 'cl-form-wrap' }, [
          urlInput, nameInput, secretInput,
          E('div', { 'class': 'cl-actions', style: 'margin-top:8px' }, [
            E('button', { 'class': 'btn cbi-button cl-btn-sm', click: function () { doCreate(false); } }, '生成配置'),
            E('button', { 'class': 'btn cbi-button-action cl-btn-sm', click: function () { doCreate(true); } }, '生成并切换')
          ])
        ]),
        E('p', { style: 'margin-top:14px;font-size:12px;opacity:.5;line-height:1.6' },
          '生成的配置包含 TUN 透明代理、geoip/geosite 大陆直连、自动延迟测速策略组。\n' +
          '同名文件会直接覆盖，更新订阅时留空文件名或填相同名称即可，不会重复堆积文件。'
        )
      ])
    ];
  },

  handleSaveApply: null,
  handleSave:      null,
  handleReset:     null
});
