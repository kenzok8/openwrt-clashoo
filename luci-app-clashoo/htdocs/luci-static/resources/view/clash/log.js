'use strict';
'require view';
'require form';
'require poll';
'require tools.clash as clash';

return view.extend({
    load: function () {
        return clash.readLog();
    },

    render: function (logContent) {
        let m, s, o;

        function fmtLevel(level) {
            let lv = String(level || '').toLowerCase();
            if (lv === 'debug') return '调试';
            if (lv === 'info') return '信息';
            if (lv === 'warn' || lv === 'warning') return '警告';
            if (lv === 'error') return '错误';
            if (lv === 'silent') return '静默';
            return level || '信息';
        }

        function pad2(n) {
            return n < 10 ? ('0' + n) : String(n);
        }

        function fmtTime(ts) {
            let d = new Date(ts);
            if (!isNaN(d.getTime())) {
                return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
                    pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
            }
            return String(ts || '').replace('T', ' ').replace(/\.\d+Z$/, '');
        }

        function processLog(raw) {
            if (!raw) return '';
            return String(raw).split('\n').map(function (line) {
                let m = String(line || '').match(/^time="([^"]+)"\s+level=([a-zA-Z]+)\s+msg="(.*)"$/);
                if (!m)
                    return line;
                return fmtTime(m[1]) + ' [' + fmtLevel(m[2]) + '] ' + m[3];
            }).join('\n');
        }

        m = new form.Map('clash', _('系统日志'));

        s = m.section(form.NamedSection, 'config', 'clash', _('运行日志'));
        s.anonymous = false;

        o = s.option(form.Button, '_clear_log', _(''));
        o.inputtitle = _('清空日志');
        o.inputstyle = 'negative';
        o.onclick = function (_, section_id) {
            let el = m.lookupOption('_log_content', section_id);
            if (el && el[0]) el[0].getUIElement(section_id).setValue('');
            return clash.clearLog().catch(function() {});
        };

        o = s.option(form.TextValue, '_log_content', _(''));
        o.rows = 25;
        o.wrap = false;
        o.cfgvalue = function () { return processLog(logContent); };
        o.write = function () { return true; };

        poll.add(L.bind(function () {
            let opt = this;
            return clash.readLog().then(function (content) {
                let ui = opt.getUIElement('config');
                if (ui) ui.setValue(processLog(content));
            }).catch(function() {});
        }, o), 5);

        o = s.option(form.Button, '_scroll_bottom', _(''));
        o.inputtitle = _('滚动到底部');
        o.onclick = function (_, section_id) {
            let el = m.lookupOption('_log_content', section_id);
            if (el && el[0]) {
                let ta = el[0].getUIElement(section_id).node.firstChild;
                if (ta) ta.scrollTop = ta.scrollHeight;
            }
        };

        return m.render();
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
