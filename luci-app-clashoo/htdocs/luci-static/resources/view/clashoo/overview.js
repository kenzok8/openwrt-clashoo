'use strict';
'require view';
'require poll';
'require ui';
'require rpc';
'require uci';
'require tools.clashoo as clashoo';

var CSS = [
  '.cl-wrap{padding:8px 0}',
  '.cl-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}',
  '.cl-card{border:1px solid rgba(128,128,128,.2);border-radius:10px;padding:14px 16px;min-height:70px}',
  '.cl-card .lbl{font-size:11px;opacity:.55;margin-bottom:4px}',
  '.cl-card .val{font-size:20px;font-weight:700;word-break:break-all}',
  '.cl-card .val.sm{font-size:13px;font-weight:600}',
  '.cl-badge{display:inline-block;padding:3px 14px;border-radius:20px;font-size:12px;font-weight:600}',
  '.cl-badge-run{background:#e8f5e9;color:#2e7d32}',
  '.cl-badge-stop{background:#ffebee;color:#c62828}',
  '.cl-actions{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}',
  '.cl-controls{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}',
  '.cl-ctrl{border:1px solid rgba(128,128,128,.15);border-radius:8px;padding:10px 12px}',
  '.cl-ctrl label{display:block;font-size:11px;opacity:.55;margin-bottom:6px}',
  '.cl-ctrl select{width:100%;font-size:13px;box-sizing:border-box}',
  '.cl-ctrl-row{display:flex;gap:6px;align-items:center}',
  '.cl-ctrl-row select{flex:1;min-width:0}',
  '.cl-log-box{border:1px solid rgba(128,128,128,.2);border-radius:10px;padding:12px 14px}',
  '.cl-log-hdr{display:flex;justify-content:space-between;cursor:pointer;font-size:13px;font-weight:600;user-select:none}',
  '.cl-log-body{margin-top:10px;font-family:monospace;font-size:11px;opacity:.75;max-height:200px;overflow-y:auto;white-space:pre-wrap;display:none}',
  '.cl-log-body.open{display:block}',
  '.cl-chk{font-size:12px}',
  '@media(max-width:900px){.cl-cards{grid-template-columns:repeat(2,1fr)}.cl-controls{grid-template-columns:repeat(2,1fr)}}',
  '@media(max-width:480px){.cl-cards{grid-template-columns:1fr}.cl-controls{grid-template-columns:1fr}}'
].join('');

var callDownloadSubs = rpc.declare({ object: 'luci.clashoo', method: 'download_subs', expect: {} });

return view.extend({
  _logOpen: false,
  _busy:    false,

  load: function () {
    return Promise.all([clashoo.status(), clashoo.listConfigs(), uci.load('clashoo')]);
  },

  render: function (data) {
    var self   = this;
    var st     = data[0] || {};
    var cfgData= data[1] || {};

    if (!document.getElementById('cl-css')) {
      var s = document.createElement('style');
      s.id = 'cl-css'; s.textContent = CSS;
      document.head.appendChild(s);
    }

    var root = E('div', { 'class': 'cl-wrap' }, [
      E('div', { 'class': 'cl-cards', id: 'cl-cards' }, this._cards(st, cfgData)),
      E('div', { 'class': 'cl-actions' }, [
        E('button', { 'class': 'btn cbi-button-action', click: L.bind(this._start, this) }, '▶ 启动'),
        E('button', { 'class': 'btn cbi-button',        click: L.bind(this._stop,  this) }, '⏹ 停止'),
        E('button', { 'class': 'btn cbi-button',        click: L.bind(this._restart,this) },'🔄 重启'),
        E('button', { 'class': 'btn cbi-button',        click: L.bind(this._updSubs,this) },'⬇ 更新订阅')
      ]),
      E('div', { 'class': 'cl-controls', id: 'cl-controls' }, this._controls(st, cfgData)),
      E('div', { 'class': 'cl-log-box' }, [
        E('div', {
          'class': 'cl-log-hdr',
          click: function () {
            self._logOpen = !self._logOpen;
            var b = document.getElementById('cl-log-body');
            if (b) b.className = 'cl-log-body' + (self._logOpen ? ' open' : '');
          }
        }, ['📋 实时日志 ', E('span', {}, self._logOpen ? '▴' : '▾')]),
        E('div', { 'class': 'cl-log-body', id: 'cl-log-body' }, '')
      ])
    ]);

    poll.add(L.bind(this._pollStatus, this), 8);
    poll.add(L.bind(this._pollLog,    this), 10);

    return root;
  },

  _cards: function (st, cfgData) {
    var running   = !!st.running;
    var curConf   = (cfgData && cfgData.current) || st.conf_path || '—';
    var dashPort  = st.dash_port || '9090';
    var panelType = st.panel_type || 'metacubexd';
    var localIp   = st.local_ip  || location.hostname;
    var coreLabel = st.core_type === 'singbox' ? 'sing-box' : 'Mihomo';

    return [
      this._card('运行状态', E('span', {}, [
        running
          ? E('span', { 'class': 'cl-badge cl-badge-run' }, '运行中')
          : E('span', { 'class': 'cl-badge cl-badge-stop' }, '已停止'),
        E('span', { style: 'font-size:11px;opacity:.5;margin-left:6px' }, coreLabel)
      ])),
      this._card('代理模式', st.proxy_mode || '—'),
      this._card('当前配置', E('span', { 'class': 'val sm' }, curConf)),
      this._card('连通测试', E('span', { 'class': 'cl-chk' }, '稍候检测...')),
      this._card('管理面板',
        dashPort ? E('a', {
          href: 'http://' + localIp + ':' + dashPort,
          target: '_blank',
          style: 'font-size:13px;font-weight:600'
        }, panelType + ' :' + dashPort) : E('span', {}, '未配置')),
      this._card('运行模式', E('span', { 'class': 'val sm', id: 'cl-tpmode' }, this._tpModeLabel(st)))
    ];
  },

  _tpModeLabel: function (st) {
    var map = { tun: 'TUN', redirect: 'Redirect', tproxy: 'TProxy', 'fake-ip': 'Fake-IP', mixed: '混合', off: '关闭' };
    var tcp = map[st.tcp_mode] || st.tcp_mode || uci.get('clashoo', 'config', 'tcp_mode') || '—';
    var udp = map[st.udp_mode] || st.udp_mode || uci.get('clashoo', 'config', 'udp_mode') || tcp;
    var tcpLabel = map[tcp] || tcp;
    var udpLabel = map[udp] || udp;
    return tcpLabel === udpLabel ? tcpLabel : 'TCP ' + tcpLabel + ' / UDP ' + udpLabel;
  },

  _card: function (lbl, val) {
    return E('div', { 'class': 'cl-card' }, [
      E('div', { 'class': 'lbl' }, lbl),
      E('div', { 'class': 'val' }, [val])
    ]);
  },

  _controls: function (st, cfgData) {
    var configs   = (cfgData && cfgData.configs) ? cfgData.configs : [];
    var current   = (cfgData && cfgData.current) || '';
    var proxyMode = st.proxy_mode  || 'rule';
    var tpMode    = st.mode_value  || 'fake-ip';
    var panelType = st.panel_type  || 'metacubexd';
    var panels    = ['metacubexd', 'yacd', 'zashboard', 'razord'];

    var mkSel = function (opts, val, fn) {
      return E('select', { 'class': 'cbi-input-select', change: fn },
        opts.map(function (o) {
          return E('option', { value: o[0], selected: o[0] === val ? '' : null }, o[1]);
        }));
    };

    var panelSel = mkSel(panels.map(function(p){return[p,p];}), panelType,
      function (ev) { clashoo.setPanel(ev.target.value); });

    return [
      E('div', { 'class': 'cl-ctrl' }, [
        E('label', {}, '代理模式'),
        mkSel([['rule','规则'],['global','全局'],['direct','直连']], proxyMode,
          function (ev) { clashoo.setProxyMode(ev.target.value); })
      ]),
      E('div', { 'class': 'cl-ctrl' }, [
        E('label', {}, '透明代理'),
        mkSel([['fake-ip','Fake-IP'],['tun','TUN'],['mixed','混合']], tpMode,
          function (ev) { clashoo.setMode(ev.target.value); })
      ]),
      E('div', { 'class': 'cl-ctrl' }, [
        E('label', {}, '配置文件'),
        mkSel(configs.length ? configs.map(function(c){return[c,c];}) : [['','（空）']], current,
          function (ev) {
            clashoo.setConfig(ev.target.value).then(function () { location.reload(); });
          })
      ]),
      E('div', { 'class': 'cl-ctrl' }, [
        E('label', {}, '管理面板'),
        E('div', { 'class': 'cl-ctrl-row' }, [
          panelSel,
          E('button', {
            'class': 'btn cbi-button',
            style: 'padding:3px 8px;font-size:12px;white-space:nowrap',
            click: function () {
              clashoo.updatePanel(panelSel.value).then(function () {
                ui.addNotification(null, E('p', '面板更新完成'));
              });
            }
          }, '更新')
        ])
      ])
    ];
  },

  _pollStatus: function () {
    var self = this;
    return Promise.all([clashoo.status(), clashoo.listConfigs(), clashoo.accessCheck()])
      .then(function (r) {
        var st = r[0] || {}, cfgData = r[1] || {}, ac = r[2] || {};
        var cards = document.getElementById('cl-cards');
        if (!cards) return;
        var newCards = self._cards(st, cfgData);
        // patch card 4 (index 3) with access check result
        var chkEl = newCards[3].querySelector('.cl-chk');
        if (chkEl) {
          chkEl.innerHTML = '';
          [['微信', ac.wechat], ['YouTube', ac.youtube], ['Google', ac.google]].forEach(function (kv) {
            var probe = kv[1] || {};
            var ok = probe.ok === true;
            var ms = ok && probe.avg_ms ? ' ' + probe.avg_ms + 'ms' : '';
            chkEl.appendChild(E('span', { style: 'margin-right:8px;white-space:nowrap' },
              kv[0] + (ok ? (' ✓' + ms) : ' ✗')));
          });
        }
        Array.from(cards.children).forEach(function (old, i) {
          if (newCards[i]) cards.replaceChild(newCards[i], old);
        });
        var tpEl = document.getElementById('cl-tpmode');
        if (tpEl) tpEl.textContent = self._tpModeLabel(st);
      });
  },

  _pollLog: function () {
    return clashoo.readRealLog().then(function (line) {
      if (!line) return;
      var body = document.getElementById('cl-log-body');
      if (body) {
        var lines = (body.textContent + '\n' + line).split('\n');
        body.textContent = lines.slice(-150).join('\n');
        body.scrollTop = body.scrollHeight;
      }
    });
  },

  _svc: function (fn) {
    if (this._busy) return Promise.resolve();
    this._busy = true;
    var self = this;
    return fn().then(function () {
      self._busy = false;
      return self._pollStatus();
    }).catch(function (e) {
      self._busy = false;
      ui.addNotification(null, E('p', '操作失败: ' + (e.message || e)));
    });
  },

  _start:   function () { return this._svc(function () { return clashoo.start(); }); },
  _stop:    function () { return this._svc(function () { return clashoo.stop();  }); },
  _restart: function () { return this._svc(function () { return clashoo.restart(); }); },

  _updSubs: function () {
    return L.resolveDefault(callDownloadSubs(), {}).then(function (r) {
      ui.addNotification(null, E('p', r.success ? '订阅更新成功' : ('更新失败: ' + (r.message || '未知错误'))));
    });
  },

  handleSaveApply: null,
  handleSave:      null,
  handleReset:     null
});
