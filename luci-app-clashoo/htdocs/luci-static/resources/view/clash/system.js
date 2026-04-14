'use strict';
'require view';
'require form';
'require uci';
'require ui';
'require poll';
'require tools.clash as clash';

var CSS = [
  '.cl-tabs{display:flex;border-bottom:2px solid rgba(128,128,128,.15);margin-bottom:18px}',
  '.cl-tab{padding:10px 20px;cursor:pointer;font-size:13px;opacity:.55;border-bottom:2px solid transparent;margin-bottom:-2px}',
  '.cl-tab.active{opacity:1;border-bottom-color:currentColor;font-weight:600}',
  '.cl-panel{display:none}.cl-panel.active{display:block}',
  '.cl-section{margin-bottom:20px}',
  '.cl-section h4{font-size:13px;font-weight:700;margin-bottom:10px;opacity:.7}',
  '.cl-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
  '.cl-log-area{font-family:monospace;font-size:11px;opacity:.75;max-height:300px;overflow-y:auto;border:1px solid rgba(128,128,128,.2);border-radius:8px;padding:10px;white-space:pre-wrap;margin-top:8px}',
  '.cl-log-tabs{display:flex;gap:8px;margin-bottom:8px}',
  '.cl-log-tab{padding:4px 12px;border:1px solid rgba(128,128,128,.2);border-radius:20px;font-size:12px;cursor:pointer;opacity:.6}',
  '.cl-log-tab.active{opacity:1;font-weight:600;background:rgba(128,128,128,.1)}'
].join('');

return view.extend({
  _tab:    'kernel',
  _logTab: 'run',

  load: function () {
    return Promise.all([
      clash.getCpuArch(),
      clash.getLogStatus(),
      clash.readLog(),
      uci.load('clash')
    ]);
  },

  render: function (data) {
    var self      = this;
    var cpuArch   = data[0] || '';
    var logStatus = data[1] || {};
    var runLog    = data[2] || '';

    if (!document.getElementById('cl-css')) {
      var s = document.createElement('style');
      s.id = 'cl-css'; s.textContent = CSS;
      document.head.appendChild(s);
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

    var kernelPanel = E('div', { 'class': 'cl-panel' + (this._tab === 'kernel' ? ' active' : '') });
    panelEls['kernel'] = kernelPanel;
    this._buildKernelPanel(kernelPanel, cpuArch);

    var rulesPanel = E('div', { 'class': 'cl-panel' + (this._tab === 'rules' ? ' active' : '') });
    panelEls['rules'] = rulesPanel;
    this._buildRulesForm(rulesPanel);

    var logsPanel = E('div', { 'class': 'cl-panel' + (this._tab === 'logs' ? ' active' : '') },
      this._buildLogsPanel(runLog)
    );
    panelEls['logs'] = logsPanel;

    poll.add(L.bind(this._pollLogs, this), 8);

    return E('div', {}, [tabBar, kernelPanel, rulesPanel, logsPanel]);
  },

  _buildKernelPanel: function (container, cpuArch) {
    var m = new form.Map('clash', '', '');
    var s, o;

    s = m.section(form.NamedSection, 'config', 'clash', '内核下载');
    s.addremove = false;
    o = s.option(form.ListValue, 'core', '版本类型');
    o.value('meta', 'Meta'); o.value('premium', 'Premium');
    o = s.option(form.ListValue, 'core_arch', 'CPU 架构');
    ['amd64','arm64','armv7','armv6','armv5','386','mips','mipsle','mips64','mips64le'].forEach(function(a){ o.value(a,a); });
    o.placeholder = cpuArch || '自动检测';
    o = s.option(form.ListValue, 'download_source', '镜像源');
    o.value('github', 'GitHub'); o.value('ghproxy', 'GHProxy');
    o = s.option(form.DummyValue, '_dl_btn', '');
    o.cfgvalue = function () {
      return E('button', {
        'class': 'btn cbi-button-action',
        click: function () {
          clash.downloadCore().then(function () {
            ui.addNotification(null, E('p', '内核下载任务已启动，请查看日志'));
          });
        }
      }, '下载内核');
    };
    o.write = function () {};

    s = m.section(form.NamedSection, 'config', 'clash', 'GeoIP / GeoSite');
    s.addremove = false;
    o = s.option(form.Flag,  'auto_update_geoip',  '自动更新');
    o = s.option(form.Value, 'geoip_update_time',  '更新时间（HH:MM）');
    o = s.option(form.Value, 'geoip_update_day',   '每周几（0=每天）');
    o = s.option(form.ListValue, 'geodata_source', '数据源');
    o.value('github', 'GitHub'); o.value('custom', '自定义');
    o = s.option(form.DummyValue, '_geo_btn', '');
    o.cfgvalue = function () {
      return E('button', {
        'class': 'btn cbi-button',
        click: function () {
          clash.updateGeoip().then(function () {
            ui.addNotification(null, E('p', 'GeoIP 更新任务已启动'));
          });
        }
      }, '立即更新 GeoIP');
    };
    o.write = function () {};

    s = m.section(form.NamedSection, 'config', 'clash', '管理面板配置');
    s.addremove = false;
    o = s.option(form.Value, 'dashboard_port', '面板端口');
    o = s.option(form.Value, 'dashboard_pass', '访问密钥');
    o = s.option(form.ListValue, 'panel_ui', '面板 UI');
    ['metacubexd','yacd','zashboard','razord'].forEach(function(p){ o.value(p,p); });

    m.render().then(function (node) { container.appendChild(node); });
  },

  _buildRulesForm: function (container) {
    var m = new form.Map('clash', '', '');
    var s, o;

    s = m.section(form.NamedSection, 'config', 'clash', '绕过规则');
    s.addremove = false;
    o = s.option(form.Flag, 'cn_redirect',  '大陆 IP 绕过');
    o = s.option(form.DynamicList, 'bypass_port',  '绕过端口');
    o = s.option(form.DynamicList, 'bypass_dscp',  '绕过 DSCP 标记');
    o = s.option(form.DynamicList, 'bypass_fwmark','绕过 FWMark');

    s = m.section(form.NamedSection, 'config', 'clash', '局域网控制');
    s.addremove = false;
    o = s.option(form.ListValue, 'access_control_mode', '访问控制');
    o.value('all', '所有设备'); o.value('allow', '白名单'); o.value('deny', '黑名单');
    o = s.option(form.DynamicList, 'access_control_list', 'IP 列表');

    s = m.section(form.NamedSection, 'config', 'clash', '自动化任务');
    s.addremove = false;
    o = s.option(form.Flag,  'auto_update_sub',   '定时更新订阅');
    o = s.option(form.Value, 'update_sub_time',   '更新时间（HH:MM）');
    o = s.option(form.Flag,  'auto_clear_log',    '定时清理日志');
    o = s.option(form.Value, 'clear_log_interval','清理间隔（天）');

    m.render().then(function (node) { container.appendChild(node); });
  },

  _buildLogsPanel: function (runLog) {
    var self = this;
    var logTypes = [
      { id: 'run',    label: '运行日志',   read: clash.readLog.bind(clash),        clear: clash.clearLog.bind(clash) },
      { id: 'update', label: '更新日志',   read: clash.readUpdateLog.bind(clash),  clear: clash.clearUpdateLog.bind(clash) },
      { id: 'geoip',  label: 'GeoIP 日志', read: clash.readGeoipLog.bind(clash),   clear: clash.clearGeoipLog.bind(clash) }
    ];

    var logTabEls = {};
    var logArea = E('div', { 'class': 'cl-log-area', id: 'cl-log-area' }, runLog);

    var logTabBar = E('div', { 'class': 'cl-log-tabs' },
      logTypes.map(function (lt) {
        var el = E('span', {
          'class': 'cl-log-tab' + (self._logTab === lt.id ? ' active' : ''),
          click: function () {
            Object.keys(logTabEls).forEach(function (k) {
              logTabEls[k].className = 'cl-log-tab' + (k === lt.id ? ' active' : '');
            });
            self._logTab = lt.id;
            lt.read().then(function (content) { logArea.textContent = content || '（空）'; });
          }
        }, lt.label);
        logTabEls[lt.id] = el;
        return el;
      })
    );

    var currentType = function () {
      return logTypes.find(function (lt) { return lt.id === self._logTab; }) || logTypes[0];
    };

    return [
      logTabBar,
      logArea,
      E('div', { 'class': 'cl-actions', style: 'margin-top:8px' }, [
        E('button', {
          'class': 'btn cbi-button',
          click: function () {
            logArea.scrollTop = logArea.scrollHeight;
          }
        }, '滚动到底部'),
        E('button', {
          'class': 'btn cbi-button-negative',
          click: function () {
            if (!confirm('清空当前日志？')) return;
            currentType().clear().then(function () { logArea.textContent = ''; });
          }
        }, '清空日志')
      ])
    ];
  },

  _pollLogs: function () {
    if (this._tab !== 'logs') return Promise.resolve();
    var self = this;
    var logFns = {
      run:    clash.readLog.bind(clash),
      update: clash.readUpdateLog.bind(clash),
      geoip:  clash.readGeoipLog.bind(clash)
    };
    var readFn = logFns[this._logTab] || logFns.run;
    return readFn().then(function (content) {
      var el = document.getElementById('cl-log-area');
      if (el && content) el.textContent = content;
    });
  },

  handleSaveApply: null,
  handleSave:      null,
  handleReset:     null
});
