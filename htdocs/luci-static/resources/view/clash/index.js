'use strict';
'require view';
'require rpc';
'require form';
'require uci';

return view.extend({
	load: function() {
		return uci.load('clash');
	},

	render: function() {
		var m = new form.Map('clash', _('Clash'), _('LuCI interface for Clash'));
		var s = m.section(form.NamedSection, 'config', 'config', _('Configuration'));
		s.anonymous = true;
		
		return m.render();
	}
});
