'use strict';
'require view';
'require poll';
'require ui';
'require rpc';
'require uci';
'require tools.clashoo as clashoo';

var CSS = [
  '.cl-wrap{padding:8px 0}',
  '.cl-wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}',
  '.cl-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}',
  '.cl-card{border:1px solid rgba(128,128,128,.2);border-radius:10px;padding:14px 16px;min-height:70px}',
  '.cl-card .lbl{font-size:12px;opacity:.55;margin-bottom:4px}',
  '.cl-card .val{font-size:13px;font-weight:500;word-break:break-all}',
  '.cl-check-note{display:block;margin-top:6px;font-size:11px;line-height:1.45;opacity:.6;font-weight:400}',
  '.cl-badge{display:inline-block;padding:3px 14px;border-radius:20px;font-size:12px;font-weight:600}',
  '.cl-badge-run{background:#e8f5e9;color:#2e7d32}',
  '.cl-badge-stop{background:#ffebee;color:#c62828}',
  '.cl-actions{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;align-items:center}',
  '.cl-actions-sep{width:1px;height:20px;background:rgba(128,128,128,.2);margin:0 4px}',
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
  '.cl-chk{font-size:13px}',
  '.cl-wrap .cbi-input-text,.cl-wrap .cbi-input-select,.cl-wrap select,.cl-wrap input,.cl-wrap textarea,.cl-wrap .btn,.cl-wrap .cbi-button{font-size:13px !important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif !important}',
  '.cl-wrap .btn,.cl-wrap .cbi-button{padding:4px 10px;line-height:1.35}',
  '@keyframes cl-fadein{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}',
  '.cl-op-msg{font-size:12px;font-weight:500;opacity:.85;animation:cl-fadein .25s ease}',
  '@media(max-width:900px){.cl-cards{grid-template-columns:repeat(2,1fr)}.cl-controls{grid-template-columns:repeat(2,1fr)}}',
  '@media(max-width:480px){.cl-cards{grid-template-columns:1fr}.cl-controls{grid-template-columns:1fr}}'
].join('');

var callDownloadSubs = rpc.declare({ object: 'luci.clashoo', method: 'download_subs', expect: {} });

/* Progress message sequences — displayed step-by-step during async operations */
var MSGS = {
  mihomo: {
    start: [
      '启动客户端',
      '正在检查配置文件',
      '设置 mihomo 网络规则',
      '设置 DNS 转发器 / 启用自定义 DNS',
      '设置 Cron → 计划任务，启动进程守护程序...',
      '重启 Dnsmasq 程序',
      'mihomo 启动成功，请等待服务器上线！'
    ],
    stop: [
      '正在停止客户端...',
      '清理 mihomo 网络规则',
      '禁用 DNS 缓存',
      'mihomo 停止进程守护程序',
      '删除 Cron → 计划任务',
      '重启 Dnsmasq 程序'
    ],
    restart: [
      '正在重启客户端...',
      '清理 mihomo 网络规则',
      '停止 mihomo',
      '启动客户端',
      '正在检查配置文件',
      '设置 mihomo 网络规则',
      '重启 Dnsmasq 程序',
      'mihomo 重启成功，请等待服务器上线！'
    ]
  },
  singbox: {
    start: [
      '启动客户端',
      '正在检查配置文件',
      '设置 sing-box 网络规则',
      '设置 DNS 转发器 / 启用自定义 DNS',
      '设置 Cron → 计划任务，启动进程守护程序...',
      '重启 Dnsmasq 程序',
      'sing-box 启动成功，请等待服务器上线！'
    ],
    stop: [
      '正在停止客户端...',
      '清理 sing-box 网络规则',
      '禁用 DNS 缓存',
      'sing-box 停止进程守护程序',
      '删除 Cron → 计划任务',
      '重启 Dnsmasq 程序'
    ],
    restart: [
      '正在重启客户端...',
      '清理 sing-box 网络规则',
      '停止 sing-box',
      '启动客户端',
      '正在检查配置文件',
      '设置 sing-box 网络规则',
      '重启 Dnsmasq 程序',
      'sing-box 重启成功，请等待服务器上线！'
    ]
  }
};

return view.extend({
  _logOpen: false,
  _busy:    false,
  _op:      null,   /* 'start' | 'stop' | 'restart' | null */
  _opTimers: null,  /* array of setTimeout IDs for cleanup */

  _lastAc:      null,
  _lastSt:      null,
  _lastCfgData: null,

  load: function () {
    return Promise.all([clashoo.status(), clashoo.listConfigs(), uci.load('clashoo')]);
  },

  render: function (data) {
    var self   = this;
    var st     = data[0] || {};
    var cfgData= data[1] || {};
    var ac     = {};

    if (!document.getElementById('cl-css')) {
      var s = document.createElement('style');
      s.id = 'cl-css'; s.textContent = CSS;
      document.head.appendChild(s);
    }

    this._lastSt      = st;
    this._lastCfgData = cfgData;
    this._lastAc      = ac;

    var root = E('div', { 'class': 'cl-wrap' }, [
      E('div', { 'class': 'cl-cards', id: 'cl-cards' }, this._cards(st, cfgData, ac)),
      E('div', { 'class': 'cl-actions' }, [
        E('button', { 'class': 'btn cbi-button-action', click: L.bind(this._start,   this) }, '启动'),
        E('button', { 'class': 'btn cbi-button',        click: L.bind(this._stop,    this) }, '停止'),
        E('button', { 'class': 'btn cbi-button',        click: L.bind(this._restart, this) }, '重启'),
        E('span',   { 'class': 'cl-actions-sep' }),
        E('button', { 'class': 'btn cbi-button',        click: L.bind(this._updSubs, this) }, '更新订阅')
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
        }, ['实时日志 ', E('span', {}, self._logOpen ? '▴' : '▾')]),
        E('div', { 'class': 'cl-log-body', id: 'cl-log-body' }, '')
      ])
    ]);

    poll.add(L.bind(this._pollStatus, this), 8);
    poll.add(L.bind(this._pollLog,    this), 10);
    poll.add(L.bind(this._pollAccess, this), 60);
    /* Fire access check immediately on first load — don't wait 60s */
    this._pollAccess();

    return root;
  },

  _coreLabel: function (family, channel) {
    if (!family)
      return '未运行';
    return (family === 'singbox' ? 'sing-box' : 'mihomo') + ' ' + (channel === 'alpha' ? '预发布版' : '稳定版');
  },

  _configuredChannel: function (family) {
    var dcore = uci.get('clashoo', 'config', 'dcore') || '2';
    if (family === 'singbox')
      return dcore === '5' ? 'alpha' : 'stable';
    return dcore === '3' ? 'alpha' : 'stable';
  },

  _proxyModeLabel: function (mode) {
    var map = { rule: '规则', global: '全局', direct: '直连' };
    return map[mode] || mode || '—';
  },

  _cards: function (st, cfgData, ac) {
    var running   = !!st.running;
    var curConf   = (cfgData && cfgData.current) || st.conf_path || '—';
    var dashPort  = st.dash_port || '9090';
    var panelType = st.panel_type || 'metacubexd';
    var localIp   = st.local_ip  || location.hostname;
    var configuredCoreLabel = this._coreLabel(st.core_type, this._configuredChannel(st.core_type));

    var statusChildren = [
      running
        ? E('span', { 'class': 'cl-badge cl-badge-run' }, '运行中')
        : E('span', { 'class': 'cl-badge cl-badge-stop' }, '已停止'),
      E('span', { style: 'font-size:11px;opacity:.5;margin-left:6px' }, configuredCoreLabel)
    ];
    var statusEl = E('span', { id: 'cl-status-val' }, statusChildren);

    return [
      this._card('运行状态', statusEl),
      this._card('代理模式', this._proxyModeLabel(st.proxy_mode)),
      this._card('当前配置', E('span', {}, curConf)),
      this._card('核心出站', this._renderCheckStatus(st, ac)),
      this._card('管理面板',
        dashPort ? E('a', {
          href: 'http://' + localIp + ':' + dashPort + '/ui/',
          target: '_blank',
          style: 'font-size:13px;font-weight:600'
        }, panelType + ' :' + dashPort) : E('span', {}, '未配置')),
      this._card('运行模式', E('span', { id: 'cl-tpmode' }, this._tpModeLabel(st)))
    ];
  },

  /* Directly update the status card content without rebuilding all cards */
  _showOpMsg: function (msg) {
    var el = document.getElementById('cl-status-val');
    if (!el) return;
    el.innerHTML = '';
    el.appendChild(E('span', { 'class': 'cl-op-msg' }, msg));
  },

  /* Schedule message animation: space messages evenly over (totalMs - tailMs) */
  _startMsgAnim: function (messages, totalMs) {
    var self = this;
    var tailMs  = 2500;                            /* last message stays visible for tailMs before poll */
    var spanMs  = Math.max(totalMs - tailMs, 1000);
    var stepMs  = messages.length > 1 ? Math.floor(spanMs / (messages.length - 1)) : spanMs;
    self._opTimers = [];
    messages.forEach(function (msg, i) {
      var t = setTimeout(function () {
        self._showOpMsg(msg);
      }, i * stepMs);
      self._opTimers.push(t);
    });
  },

  _clearOpTimers: function () {
    if (this._opTimers) {
      this._opTimers.forEach(function (t) { clearTimeout(t); });
      this._opTimers = null;
    }
  },

  _tpModeLabel: function (st) {
    var map = {
      tun: '隧道模式',
      redirect: '重定向',
      tproxy: '透明代理',
      'fake-ip': '虚拟 IP',
      mixed: '混合模式',
      off: '关闭'
    };
    var tcp = st.tcp_mode || uci.get('clashoo', 'config', 'tcp_mode') || '—';
    var udp = st.udp_mode || uci.get('clashoo', 'config', 'udp_mode') || tcp;
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

  _renderCheckStatus: function (st, ac) {
    var probes = [
      ['百度', ac.baidu],
      ['谷歌', ac.google],
      ['GitHub', ac.github]
    ];
    var wrap = E('span', { 'class': 'cl-chk' }, []);

    if (!ac || (!ac.baidu && !ac.google && !ac.github)) {
      wrap.appendChild(E('span', { style: 'opacity:.5;font-size:12px' }, '检测中…'));
      return wrap;
    }

    probes.forEach(function (kv) {
      var probe = kv[1] || {};
      var ok = probe.ok === true;
      var ms = ok && probe.avg_ms ? ' ' + probe.avg_ms + 'ms' : '';
      wrap.appendChild(E('span', { style: 'margin-right:8px;white-space:nowrap' },
        kv[0] + (ok ? (' ✓' + ms) : ' ✗')));
    });

    return wrap;
  },

  _controls: function (st, cfgData) {
    var configs   = (cfgData && cfgData.configs) ? cfgData.configs : [];
    var current   = (cfgData && cfgData.current) || '';
    var proxyMode = st.proxy_mode  || 'rule';
    var tpMode    = ((st.tcp_mode === 'tun' || st.udp_mode === 'tun' || (uci.get('clashoo', 'config', 'tun_mode') || '0') === '1')
      ? 'tun' : 'fake-ip');
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
        mkSel([['fake-ip','虚拟 IP'],['tun','隧道模式']], tpMode,
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
            style: 'padding:4px 10px;white-space:nowrap',
            click: function () {
              clashoo.updatePanel(panelSel.value).then(function () {
                ui.addNotification(null, E('p', '面板更新任务已提交，请在「系统 → 日志」页查看进度'));
              });
            }
          }, '更新')
        ])
      ])
    ];
  },

  /* Skip status poll while an operation is animating — avoids overwriting the messages */
  _pollStatus: function () {
    if (this._op) return Promise.resolve();
    var self = this;
    return Promise.all([clashoo.status(), clashoo.listConfigs()])
      .then(function (r) {
        var st = r[0] || {}, cfgData = r[1] || {};
        self._lastSt      = st;
        self._lastCfgData = cfgData;
        var ac    = self._lastAc || {};
        var cards = document.getElementById('cl-cards');
        if (!cards) return;
        var newCards = self._cards(st, cfgData, ac);
        Array.from(cards.children).forEach(function (old, i) {
          if (newCards[i]) cards.replaceChild(newCards[i], old);
        });
        var tpEl = document.getElementById('cl-tpmode');
        if (tpEl) tpEl.textContent = self._tpModeLabel(st);
      });
  },

  /* Slow poll for connectivity check — every 60s, network probes are expensive */
  _pollAccess: function () {
    var self = this;
    return clashoo.accessCheck().then(function (ac) {
      self._lastAc = ac || {};
      /* Refresh only the connectivity card (4th card, index 3) */
      var cards = document.getElementById('cl-cards');
      if (!cards || !cards.children[3]) return;
      var st = self._lastSt || {};
      var newCard = self._card('核心出站', self._renderCheckStatus(st, self._lastAc));
      cards.replaceChild(newCard, cards.children[3]);
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

  /* fn: async RPC call, opKey: 'start'|'stop'|'restart', pollDelay: ms to wait before final status poll */
  _svc: function (fn, opKey, pollDelay) {
    if (this._busy) return Promise.resolve();
    this._busy = true;
    var self = this;

    /* Determine message set based on core type */
    var coreType = uci.get('clashoo', 'config', 'core_type') || 'mihomo';
    var msgSet   = coreType === 'singbox' ? MSGS.singbox : MSGS.mihomo;
    var messages = msgSet[opKey] || [];

    self._op = opKey;
    if (messages.length) self._startMsgAnim(messages, pollDelay);

    return fn().then(function () {
      self._busy = false;
      /* Clear animation timers, then wait for the service to actually finish */
      setTimeout(function () {
        self._clearOpTimers();
        self._op = null;
        self._pollStatus();
      }, pollDelay);
    }).catch(function (e) {
      self._busy = false;
      self._clearOpTimers();
      self._op = null;
      ui.addNotification(null, E('p', '操作失败: ' + (e.message || e)));
      self._pollStatus();
    });
  },

  _start:   function () { return this._svc(function () { return clashoo.start(); },   'start',   15000); },
  _stop:    function () { return this._svc(function () { return clashoo.stop();  },   'stop',    12000); },
  _restart: function () { return this._svc(function () { return clashoo.restart(); }, 'restart', 20000); },

  _updSubs: function () {
    return L.resolveDefault(callDownloadSubs(), {}).then(function (r) {
      ui.addNotification(null, E('p', r.success ? '订阅更新成功' : ('更新失败: ' + (r.message || '未知错误'))));
    });
  },

  handleSaveApply: null,
  handleSave:      null,
  handleReset:     null
});
