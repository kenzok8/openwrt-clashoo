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
        o.cfgvalue = function () { return logContent; };
        o.write = function () { return true; };

        poll.add(L.bind(function () {
            let opt = this;
            return clash.readLog().then(function (content) {
                let ui = opt.getUIElement('config');
                if (ui) ui.setValue(content);
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
