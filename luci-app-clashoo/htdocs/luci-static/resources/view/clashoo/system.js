'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require poll';
'require rpc';
'require tools.clashoo as clashoo';

var callHostHints = rpc.declare({
  object: 'luci-rpc',
  method: 'getHostHints',
  expect: { '': {} }
});

var CSS = [
  '.cl-wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}',
  '.cl-tabs{display:flex;border-bottom:2px solid rgba(128,128,128,.15);margin-bottom:18px}',
  '.cl-tab{padding:10px 20px;cursor:pointer;font-size:13px;opacity:.55;border-bottom:2px solid transparent;margin-bottom:-2px}',
  '.cl-tab.active{opacity:1;border-bottom-color:currentColor;font-weight:600}',
  '.cl-panel{display:none}.cl-panel.active{display:block}',
  '.cl-section{margin-bottom:20px}',
  '.cl-section h4{font-size:.95rem;font-weight:600;margin-bottom:10px;color:var(--title-color,rgba(92,102,120,.72));opacity:.95}',
  '.cl-save-bar{display:flex;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(128,128,128,.15)}',
  '.cl-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
  '.cl-log-area{font-family:monospace;font-size:11px;opacity:.75;max-height:300px;overflow-y:auto;border:1px solid rgba(128,128,128,.2);border-radius:8px;padding:10px;white-space:pre-wrap;margin-top:8px}',
  '.cl-log-tabs{display:flex;gap:8px;margin-bottom:8px}',
  '.cl-log-tab{padding:4px 12px;border:1px solid rgba(128,128,128,.2);border-radius:20px;font-size:12px;cursor:pointer;opacity:.6}',
  '.cl-log-tab.active{opacity:1;font-weight:600;background:rgba(128,128,128,.1)}',
  /* 统一 form.Map 字体大小与 config 页一致 */
  '.cl-panel .cbi-section>h3{font-size:13px !important;font-weight:600;margin-bottom:8px}',
  '.cl-panel .cbi-value-title{font-size:13px !important}',
  '.cl-panel .cbi-value-field input,.cl-panel .cbi-value-field select,.cl-panel .cbi-value-field textarea{font-size:13px !important}',
  '.cl-panel .cbi-section-descr,.cl-panel .cbi-value-helptext{font-size:12px !important}',
  '.cl-panel .cbi-section{margin-bottom:12px}',
  '.cl-wrap .cbi-section>h3,.cl-wrap .cbi-value-title,.cl-wrap .cbi-section-descr,.cl-wrap .cbi-value-helptext{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif !important}',
  '.cl-wrap .cbi-input-text,.cl-wrap .cbi-input-select,.cl-wrap select,.cl-wrap input,.cl-wrap textarea,.cl-wrap .btn,.cl-wrap .cbi-button{font-size:13px !important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif !important}',
  '.cl-wrap .btn,.cl-wrap .cbi-button{padding:4px 10px;line-height:1.35}'
].join('');

function fastResolve(promise, timeoutMs, fallback) {
  var t = new Promise(function (resolve) {
    setTimeout(function () { resolve(fallback); }, timeoutMs);
  });
  return Promise.race([L.resolveDefault(promise, fallback), t]);
}

function decorateSystemForm(root) {
  if (!root || !root.querySelectorAll)
    return;

  var fields = root.querySelectorAll('.cbi-value-field');
  for (var i = 0; i < fields.length; i++) {
    if (fields[i] && fields[i].classList)
      fields[i].classList.add('cl-control-wrap');
  }

  var sections = root.querySelectorAll('.cbi-section');
  for (var j = 0; j < sections.length; j++) {
    if (sections[j] && sections[j].classList)
      sections[j].classList.add('cl-form-card');
  }
}

function randomSecret(len) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  var out = '';
  var n = Math.max(6, parseInt(len, 10) || 6);
  for (var i = 0; i < n; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function enhanceDashPasswordField(root) {
  if (!root || !root.querySelector)
    return;

  var input = root.querySelector('input[id$=".dash_pass"], input[name$=".dash_pass"]');
  if (!input || input.dataset.clEnhanced === '1')
    return;

  input.dataset.clEnhanced = '1';
  input.type = 'password';
  input.autocomplete = 'new-password';

  var parent = input.parentNode;
  if (!parent)
    return;

  /* Remove LuCI default password helper controls (e.g. stray "*" button) */
  var children = parent.children ? Array.prototype.slice.call(parent.children) : [];
  children.forEach(function (el) {
    if (!el || el === input)
      return;
    var tag = (el.tagName || '').toUpperCase();
    var isBtnLike = tag === 'BUTTON'
      || (tag === 'INPUT' && String(el.type || '').toLowerCase() === 'button')
      || ((el.className || '').indexOf('cbi-button') >= 0);
    if (isBtnLike)
      parent.removeChild(el);
  });

  var wrap = E('div', { 'class': 'cl-pass-wrap' });
  parent.insertBefore(wrap, input);
  wrap.appendChild(input);

  var eyeBtn = E('button', {
    type: 'button',
    'class': 'btn cbi-button cl-pass-btn',
    title: '显示/隐藏',
    click: function (ev) {
      ev.preventDefault();
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      eyeBtn.textContent = show ? '🙈' : '👁';
    }
  }, '👁');

  var genBtn = E('button', {
    type: 'button',
    'class': 'btn cbi-button-action cl-pass-btn cl-pass-gen',
    click: function (ev) {
      ev.preventDefault();
      input.type = 'text';
      input.value = randomSecret(6);
      eyeBtn.textContent = '🙈';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, '随机');

  wrap.appendChild(eyeBtn);
  wrap.appendChild(genBtn);
}

function clearClashooDirty() {
  var applyPromise;
  try {
    applyPromise = (L.uci && typeof L.uci.callApply === 'function')
      ? Promise.resolve(L.uci.callApply(0, false)).catch(function () {})
      : Promise.resolve();
  } catch (e) { applyPromise = Promise.resolve(); }
  return applyPromise.then(function () {
    try {
      if (L.ui && L.ui.changes && L.ui.changes.changes) {
        delete L.ui.changes.changes.clashoo;
        var n = Object.keys(L.ui.changes.changes).length;
        if (typeof L.ui.changes.renderChangeIndicator === 'function')
          L.ui.changes.renderChangeIndicator(n);
        else if (typeof L.ui.changes.setIndicator === 'function')
          L.ui.changes.setIndicator(n);
      }
    } catch (e) {}
  });
}

function saveCommitApplyMaybeReload(m, runningMsg, stoppedMsg) {
  return clashoo.status()
    .then(function (st) { return !!(st && st.running); })
    .catch(function () { return false; })
    .then(function (running) {
      return m.save()
        .then(function () { return clashoo.commitConfig(); })
        .then(function () {
          return running ? clashoo.reload() : { success: true, skipped: true };
        })
        .then(function () { return clearClashooDirty(); })
        .then(function () {
          ui.addNotification(null, E('p', running ? runningMsg : stoppedMsg));
          window.setTimeout(function () { location.reload(); }, 300);
        });
    });
}

return view.extend({
  _tab:    'kernel',
  _logTab: 'plugin',

  load: function () {
    return Promise.all([
      fastResolve(clashoo.getCpuArch(), 1200, ''),
      fastResolve(clashoo.getLogStatus(), 1200, {}),
      fastResolve(clashoo.readLog(), 1200, ''),
      uci.load('clashoo'),
      fastResolve(L.resolveDefault(callHostHints(), {}), 1500, {})
    ]);
  },

  render: function (data) {
    var self      = this;
    var cpuArch   = data[0] || '';
    var logStatus = data[1] || {};
    var runLog    = data[2] || '';
    var hostHints = data[4] || {};
    this._hostHints = hostHints;

    if (!document.getElementById('cl-css')) {
      var s = document.createElement('style');
      s.id = 'cl-css'; s.textContent = CSS;
      document.head.appendChild(s);
    }
    if (!document.getElementById('cl-css-ext')) {
      var link = document.createElement('link');
      link.id = 'cl-css-ext';
      link.rel = 'stylesheet';
      link.href = L.resource('view/clashoo/clashoo.css') + '?v=20260425b1';
      document.head.appendChild(link);
    } else {
      document.getElementById('cl-css-ext').href = L.resource('view/clashoo/clashoo.css') + '?v=20260425b1';
    }

    var tabs = [
      { id: 'kernel', label: '内核与数据' },
      { id: 'rules',  label: '规则与控制' },
      { id: 'logs',   label: '日志' }
    ];
    var tabEls = {}, panelEls = {};

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

    var kernelPanel = E('div', { 'class': 'cl-panel' + (this._tab === 'kernel' ? ' active' : ''), id: 'cl-panel-kernel' });
    panelEls['kernel'] = kernelPanel;
    this._buildKernelPanel(kernelPanel, cpuArch);

    var rulesPanel = E('div', { 'class': 'cl-panel' + (this._tab === 'rules' ? ' active' : ''), id: 'cl-panel-rules' });
    panelEls['rules'] = rulesPanel;
    this._buildRulesForm(rulesPanel);

    var logsPanel = E('div', { 'class': 'cl-panel' + (this._tab === 'logs' ? ' active' : ''), id: 'cl-panel-logs' },
      this._buildLogsPanel(runLog)
    );
    panelEls['logs'] = logsPanel;

    this._tabEls = tabEls;
    this._panelEls = panelEls;
    poll.add(L.bind(this._pollLogs, this), 8);

    return E('div', { 'class': 'cl-wrap clashoo-container cl-system-page cl-form-page' }, [tabBar, kernelPanel, rulesPanel, logsPanel]);
  },

  _detectMihomoArch: function (raw) {
    if (!raw) return '';
    if (raw === 'x86_64')             return 'amd64';
    if (/^aarch64/.test(raw))         return 'arm64';
    if (/^armv7|^arm_cortex-a[7-9]|^arm_cortex-a1[0-9]/.test(raw)) return 'armv7';
    if (/^armv6|^arm_cortex-a[56]/.test(raw))  return 'armv6';
    if (/^arm/.test(raw))             return 'armv5';
    if (/^i[3-6]86/.test(raw))        return '386';
    if (/^mips64el/.test(raw))        return 'mips64le';
    if (/^mips64/.test(raw))          return 'mips64';
    if (/^mipsel/.test(raw))          return 'mipsle';
    if (/^mips/.test(raw))            return 'mips';
    return '';
  },

  _buildKernelPanel: function (container, cpuArch) {
    var self = this;
    var detectedArch = this._detectMihomoArch(cpuArch);
    var m = new form.Map('clashoo', '', '');
    var s, o;

    s = m.section(form.NamedSection, 'config', 'clashoo', '后端核心');
    s.addremove = false;
    o = s.option(form.ListValue, 'core_type', '核心类型');
    o.value('mihomo', 'mihomo（Clash Meta 内核）');
    o.value('singbox', 'sing-box（需已安装并启用 clash_api）');
    o.description = '';

    s = m.section(form.NamedSection, 'config', 'clashoo', '内核下载');
    s.addremove = false;
    o = s.option(form.ListValue, 'dcore', '版本类型');
    o.value('1', 'mihomo（Smart 版）');
    o.value('2', 'mihomo（稳定版）'); o.value('3', 'mihomo（Alpha 版）');
    o.value('4', 'sing-box（稳定版）'); o.value('5', 'sing-box（Alpha 版）');
    o = s.option(form.ListValue, 'download_core', 'CPU 架构');
    ['amd64','arm64','armv7','armv6','armv5','386','mips','mipsle','mips64','mips64le'].forEach(function(a){ o.value(a,a); });
    if (detectedArch) o.default = detectedArch;
    o.description = '';
    o = s.option(form.DummyValue, '_arch_badge', '架构建议');
    o.cfgvalue = function () {
      var sys = cpuArch || '未知';
      var rec = detectedArch || '手动选择';
      return E('div', { 'class': 'cl-arch-badge-row' }, [
        E('span', { 'class': 'cl-arch-badge cl-arch-badge-sys' }, '系统架构 ' + sys),
        E('span', { 'class': 'cl-arch-arrow' }, '→'),
        E('span', { 'class': 'cl-arch-badge cl-arch-badge-rec' }, '推荐下载 ' + rec)
      ]);
    };
    o.write = function () {};
    o = s.option(form.ListValue, 'core_mirror_prefix', '镜像源');
    o.value('', 'GitHub 直连'); o.value('https://gh-proxy.com/', 'GHProxy');
    o = s.option(form.DummyValue, '_dl_btn', '');
    o.cfgvalue = function () {
      var dlStatus = E('span', { style: 'font-size:12px;opacity:.65' }, '');
      return E('div', { 'class': 'cl-actions', style: 'margin-top:0' }, [
        E('button', {
          'class': 'btn cbi-button-action',
          click: function () {
            dlStatus.textContent = '正在启动下载任务…';
            m.save()
              .then(function () { return clashoo.commitConfig(); })
              .then(function () { return clashoo.clearUpdateLog(); })
              .then(function () { return clashoo.downloadCore(); })
              .then(function () {
                dlStatus.textContent = '下载任务已启动，已切换到更新日志';
                self._switchTab('logs');
                if (self._activateLogTab)
                  self._activateLogTab('update');
              })
              .catch(function (e) {
                dlStatus.textContent = '';
                ui.addNotification(null, E('p', '启动下载失败: ' + (e.message || e)));
              });
          }
        }, '下载内核'),
        dlStatus
      ]);
    };
    o.write = function () {};

    s = m.section(form.NamedSection, 'config', 'clashoo', 'GeoIP 与 GeoSite');
    s.addremove = false;
    o = s.option(form.Flag,  'auto_update_geoip',  '自动更新');
    o = s.option(form.Value, 'auto_update_geoip_time',  '更新小时（0-23）');
    o = s.option(form.Value, 'geoip_update_interval',   '更新间隔（天）');
    o = s.option(form.ListValue, 'geoip_source', '数据源');
    o.value('2', 'GitHub'); o.value('4', '自定义');
    o = s.option(form.DummyValue, '_geo_btn', '');
    o.cfgvalue = function () {
      return E('button', {
        'class': 'btn cbi-button',
        click: function () {
          clashoo.updateGeoip().then(function () {
            ui.addNotification(null, E('p', 'GeoIP 更新任务已启动'));
            self._switchTab('logs');
            if (self._activateLogTab)
              self._activateLogTab('update');
          });
        }
      }, '立即更新 GeoIP');
    };
    o.write = function () {};

    s = m.section(form.NamedSection, 'config', 'clashoo', '管理面板配置');
    s.addremove = false;
    o = s.option(form.Value, 'dash_port', '面板端口');
    o.placeholder = '9090';
    o = s.option(form.Value, 'dash_pass', '访问密钥');
    o.placeholder = 'clashoo';
    o = s.option(form.ListValue, 'dashboard_panel', '面板 UI');
    ['metacubexd','yacd','zashboard','razord'].forEach(function(p){ o.value(p,p); });

    m.render().then(function (node) {
      decorateSystemForm(node);
      enhanceDashPasswordField(node);
      container.appendChild(node);
      container.appendChild(E('div', { 'class': 'cl-save-bar' }, [
        E('button', { 'class': 'btn cbi-button', click: function () {
          m.save().then(function () { return clashoo.commitConfig(); })
            .then(function () { return clearClashooDirty(); })
            .then(function () { location.reload(); })
            .catch(function (e) { ui.addNotification(null, E('p', '保存失败: ' + (e.message || e))); });
        }}, '保存配置'),
        E('button', { 'class': 'btn cbi-button-action', click: function () {
          saveCommitApplyMaybeReload(m, '配置已保存并热重载服务', '配置已保存，服务未启动')
            .catch(function (e) { ui.addNotification(null, E('p', '操作失败: ' + (e.message || e))); });
        }}, '应用配置')
      ]));
    });
  },

  _buildRulesForm: function (container) {
    var m = new form.Map('clashoo', '', '');
    var s, o;

    s = m.section(form.NamedSection, 'config', 'clashoo', '绕过规则');
    s.addremove = false;
    o = s.option(form.Flag, 'bypass_china',  '大陆 IP 绕过');
    o = s.option(form.ListValue, 'bypass_port_mode', '绕过端口');
    o.value('all', '所有端口');
    o.value('common', '常用端口');
    o.value('custom', '自定义');
    o.default = 'all';

    o = s.option(form.Value, 'bypass_port_custom', '自定义端口');
    o.depends('bypass_port_mode', 'custom');
    o.placeholder = '22,53,80,443,8080,8443';
    o.datatype = 'string';
    o.rmempty = true;

    o = s.option(form.Flag, 'sniffer_streaming', '嗅探功能（流媒体兼容）');
    o.default = '1';
    o.rmempty = false;
    o.description = '启用后自动注入 sniffer 配置，提升流媒体域名识别与分流稳定性。';

    s = m.section(form.NamedSection, 'config', 'clashoo', '局域网控制');
    s.addremove = false;
    o = s.option(form.ListValue, 'access_control', '访问控制');
    o.value('0', '所有设备'); o.value('1', '白名单'); o.value('2', '黑名单');

    /* Populate host hints for both IP list fields */
    var hints = this._hostHints || {};
    var hostOptions = [];
    var seen = {};
    Object.keys(hints).forEach(function (mac) {
      var h = hints[mac] || {};
      var macU = mac.toUpperCase();
      var addrs = h.ipaddrs || (h.ipv4 ? [h.ipv4] : []);
      addrs.forEach(function (ip) {
        if (ip && !seen[ip]) {
          seen[ip] = true;
          hostOptions.push([ip, ip + ' (' + macU + ')']);
        }
      });
    });

    o = s.option(form.DynamicList, 'proxy_lan_ips', 'IP白名单');
    o.placeholder = '192.168.1.100';
    o.depends('access_control', '1');
    hostOptions.forEach(function (kv) { o.value(kv[0], kv[1]); });

    o = s.option(form.DynamicList, 'reject_lan_ips', 'IP黑名单');
    o.placeholder = '192.168.1.100';
    o.depends('access_control', '2');
    hostOptions.forEach(function (kv) { o.value(kv[0], kv[1]); });

    s = m.section(form.NamedSection, 'config', 'clashoo', '自动化任务');
    s.addremove = false;
    o = s.option(form.Flag,  'auto_update',   '定时更新规则数据');
    o = s.option(form.Value, 'auto_update_time',   '更新间隔（小时）');
    o = s.option(form.Flag,  'auto_clear_log',    '定时清理日志');
    o = s.option(form.Value, 'clear_time','清理间隔（小时）');

    m.render().then(function (node) {
      decorateSystemForm(node);
      container.appendChild(node);
      container.appendChild(E('div', { 'class': 'cl-save-bar' }, [
        E('button', { 'class': 'btn cbi-button', click: function () {
          m.save().then(function () { return clashoo.commitConfig(); })
            .then(function () { return clearClashooDirty(); })
            .then(function () { location.reload(); })
            .catch(function (e) { ui.addNotification(null, E('p', '保存失败: ' + (e.message || e))); });
        }}, '保存配置'),
        E('button', { 'class': 'btn cbi-button-action', click: function () {
          saveCommitApplyMaybeReload(m, '配置已保存并热重载服务', '配置已保存，服务未启动')
            .catch(function (e) { ui.addNotification(null, E('p', '操作失败: ' + (e.message || e))); });
        }}, '应用配置')
      ]));
    });
  },

  _buildLogsPanel: function (runLog) {
    var self = this;
    var logTypes = [
      { id: 'plugin', label: '插件日志', read: clashoo.readLog.bind(clashoo),              clear: clashoo.clearLog.bind(clashoo) },
      { id: 'core',   label: '核心日志', read: clashoo.readCoreLog.bind(clashoo),           clear: clashoo.clearCoreLog.bind(clashoo) },
      { id: 'update', label: '更新日志', read: clashoo.readUpdateMergedLog.bind(clashoo),   clear: clashoo.clearUpdateMergedLog.bind(clashoo) }
    ];

    var logTabEls = {};
    var logArea = E('div', { 'class': 'cl-log-area', id: 'cl-log-area' }, runLog || '（空）');
    var clearBtn = null;

    function activateLogTab(id) {
      var logType = logTypes.find(function (lt) { return lt.id === id; }) || logTypes[0];
      Object.keys(logTabEls).forEach(function (k) {
        logTabEls[k].className = 'cl-log-tab' + (k === logType.id ? ' active' : '');
      });
      self._logTab = logType.id;
      syncClearButton();
      return logType.read().then(function (content) {
        logArea.textContent = (content && content.trim()) ? content : '（空）';
      });
    }
    this._activateLogTab = activateLogTab;

    var logTabBar = E('div', { 'class': 'cl-log-tabs' },
      logTypes.map(function (lt) {
        var el = E('span', {
          'class': 'cl-log-tab' + (self._logTab === lt.id ? ' active' : ''),
          click: function () {
            activateLogTab(lt.id);
          }
        }, lt.label);
        logTabEls[lt.id] = el;
        return el;
      })
    );

    var currentType = function () {
      return logTypes.find(function (lt) { return lt.id === self._logTab; }) || logTypes[0];
    };

    function syncClearButton() {
      if (!clearBtn) return;
      var ct = currentType();
      var canClear = !!ct.clear;
      clearBtn.disabled = !canClear;
      clearBtn.className = 'btn ' + (canClear ? 'cbi-button-negative' : 'cbi-button');
      clearBtn.title = canClear ? '清空当前日志' : '';
      clearBtn.textContent = '清空日志';
    }

    clearBtn = E('button', {
      'class': 'btn cbi-button-negative',
      click: function () {
        var ct = currentType();
        if (!ct.clear) return;
        ct.clear().then(function () { logArea.textContent = ''; });
      }
    }, '清空日志');
    syncClearButton();

    return E('div', { 'class': 'cl-section cl-card cl-log-card' }, [
      E('h4', {}, '日志'),
      logTabBar,
      logArea,
      E('div', { 'class': 'cl-actions', style: 'margin-top:8px' }, [
        E('button', {
          'class': 'btn cbi-button',
          click: function () {
            logArea.scrollTop = logArea.scrollHeight;
          }
        }, '滚动到底部'),
        clearBtn
      ])
    ]);
  },

  _pollLogs: function () {
    if (this._tab !== 'logs') return Promise.resolve();
    var self = this;
    var logFns = {
      plugin: clashoo.readLog.bind(clashoo),
      core:   clashoo.readCoreLog.bind(clashoo),
      update: clashoo.readUpdateMergedLog.bind(clashoo)
    };
    var readFn = logFns[this._logTab] || logFns.plugin;
    return readFn().then(function (content) {
      var el = document.getElementById('cl-log-area');
      if (el) el.textContent = (content && content.trim()) ? content : '（空）';
    });
  },

  _switchTab: function (id) {
    var tabEls = this._tabEls || {};
    var panelEls = this._panelEls || {};
    Object.keys(tabEls).forEach(function (k) {
      tabEls[k].className = 'cl-tab' + (k === id ? ' active' : '');
      panelEls[k].className = 'cl-panel' + (k === id ? ' active' : '');
    });
    this._tab = id;
  },

  handleSaveApply: null,
  handleSave:      null,
  handleReset:     null
});
