'use strict';
'require baseclass';
'require rpc';
'require uci';

const callRCList     = rpc.declare({ object: 'rc',         method: 'list',          params: ['name'],          expect: { '': {} } });
const callRCInit     = rpc.declare({ object: 'rc',         method: 'init',          params: ['name', 'action'], expect: { '': {} } });
const callVersion    = rpc.declare({ object: 'luci.clash', method: 'version',       expect: {} });
const callListProf   = rpc.declare({ object: 'luci.clash', method: 'list_profiles', expect: {} });
const callReadLog    = rpc.declare({ object: 'luci.clash', method: 'read_log',      expect: {} });
const callCaps       = rpc.declare({ object: 'luci.clash', method: 'capabilities',  expect: {} });

return baseclass.extend({
    status: function () {
        return L.resolveDefault(callRCList('clash'), {}).then(function (res) {
            return !!res?.clash?.running;
        });
    },

    reload: function () {
        return L.resolveDefault(callRCInit('clash', 'reload'), {});
    },

    restart: function () {
        return L.resolveDefault(callRCInit('clash', 'restart'), {});
    },

    version: function () {
        return L.resolveDefault(callVersion(), {});
    },

    listProfiles: function () {
        return L.resolveDefault(callListProf(), { profiles: [] }).then(function (res) {
            return res.profiles || [];
        });
    },

    readLog: function () {
        return L.resolveDefault(callReadLog(), { content: '' }).then(function (res) {
            return res.content || '';
        });
    },

    capabilities: function () {
        return L.resolveDefault(callCaps(), {});
    }
});
