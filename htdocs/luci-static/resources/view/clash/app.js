'use strict';
'require form';
'require view';
'require uci';
'require poll';
'require tools.clash as clash';

function renderStatus(running) {
    return updateStatus(
        E('input', { id: 'core_status', style: 'border:unset;font-style:italic;font-weight:bold;', readonly: '' }),
        running
    );
}

function updateStatus(element, running) {
    if (element) {
        element.style.color = running ? 'green' : 'red';
        element.value = running ? _('Running') : _('Not Running');
    }
    return element;
}

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('clash'),
            clash.version(),
            clash.status(),
            clash.listProfiles(),
            clash.capabilities()
        ]);
    },

    render: function (data) {
        const appVersion   = data[1].app   || '';
        const coreVersion = data[1].core  || '';
        const binary      = data[1].binary || '';
        const running     = data[2];
        const profiles    = data[3];
        const caps        = data[4] || {};
        const backend     = caps.backend || _('Unknown');
        const missing     = caps.missing_legacy_tools || [];

        let m, s, o;

        m = new form.Map('clash', _('Clash'),
            _('Transparent proxy with Clash / Clash.Meta / Mihomo on OpenWrt.'));

        if (missing.length) {
            m.description = _('Current runtime still expects legacy firewall tooling. Missing commands: ') + missing.join(', ') + '. ' +
                _('You can install the UI first, but transparent proxy mode will not be reliable until firewall handling is refactored further.');
        }

        /* ── 状态栏 ── */
        s = m.section(form.TableSection, 'status', _('Status'));
        s.anonymous = true;

        o = s.option(form.Value, '_app_version', _('App Version'));
        o.readonly = true;
        o.load = function () { return appVersion || _('Unknown'); };
        o.write = function () { };

        o = s.option(form.Value, '_core_version', _('Core Version'));
        o.readonly = true;
        o.load = function () { return coreVersion || _('Not installed'); };
        o.write = function () { };

        o = s.option(form.Value, '_binary', _('Binary'));
        o.readonly = true;
        o.load = function () { return binary || _('Not found'); };
        o.write = function () { };

        o = s.option(form.Value, '_backend', _('Firewall Backend'));
        o.readonly = true;
        o.load = function () { return backend; };
        o.write = function () { };

        o = s.option(form.DummyValue, '_core_status', _('Core Status'));
        o.cfgvalue = function () { return renderStatus(running); };

        poll.add(function () {
            return L.resolveDefault(clash.status()).then(function (r) {
                updateStatus(document.getElementById('core_status'), r);
            });
        });

        o = s.option(form.Button, 'reload');
        o.inputstyle  = 'action';
        o.inputtitle  = _('Reload Service');
        o.onclick = function () { return clash.reload(); };

        o = s.option(form.Button, 'restart');
        o.inputstyle  = 'negative';
        o.inputtitle  = _('Restart Service');
        o.onclick = function () { return clash.restart(); };

        /* ── 主配置 ── */
        s = m.section(form.NamedSection, 'config', 'clash', _('App Config'));

        o = s.option(form.Flag, 'enable', _('Enable'));
        o.rmempty = false;

        o = s.option(form.ListValue, 'profile', _('Select Profile'));
        o.optional = true;
        o.value('', _('-- Use default config.yaml --'));
        for (const name of profiles) {
            o.value('profile:' + name, name);
        }

        o = s.option(form.Value, 'start_delay', _('Start Delay (seconds)'));
        o.datatype    = 'uinteger';
        o.placeholder = _('Start immediately');

        o = s.option(form.ListValue, 'p_mode', _('Proxy Mode'));
        o.value('rule',   _('Rule'));
        o.value('global', _('Global'));
        o.value('direct', _('Direct'));

        o = s.option(form.ListValue, 'level', _('Log Level'));
        o.value('info',    'info');
        o.value('warning', 'warning');
        o.value('error',   'error');
        o.value('debug',   'debug');
        o.value('silent',  'silent');

        o = s.option(form.Value, 'http_port',  _('HTTP Proxy Port'));
        o.datatype = 'port';

        o = s.option(form.Value, 'socks_port', _('SOCKS5 Proxy Port'));
        o.datatype = 'port';

        o = s.option(form.Value, 'redir_port', _('Redir-TCP Port'));
        o.datatype = 'port';

        o = s.option(form.Value, 'dash_port',  _('Dashboard Port'));
        o.datatype = 'port';

        o = s.option(form.Flag, 'allow_lan', _('Allow LAN'));
        o.rmempty = false;

        return m.render();
    }
});
