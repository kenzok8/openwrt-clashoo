'use strict';
'require baseclass';
'require rpc';

const callStatus      = rpc.declare({ object: 'luci.clash', method: 'status',          expect: {} });
const callStart       = rpc.declare({ object: 'luci.clash', method: 'start',           expect: {} });
const callStop        = rpc.declare({ object: 'luci.clash', method: 'stop',            expect: {} });
const callReload      = rpc.declare({ object: 'luci.clash', method: 'reload',          expect: {} });
const callRestart     = rpc.declare({ object: 'luci.clash', method: 'restart',         expect: {} });
const callVersion     = rpc.declare({ object: 'luci.clash', method: 'version',         expect: {} });
const callListProf    = rpc.declare({ object: 'luci.clash', method: 'list_profiles',   expect: {} });
const callListConfigs = rpc.declare({ object: 'luci.clash', method: 'list_configs',    expect: {} });
const callSetConfig   = rpc.declare({ object: 'luci.clash', method: 'set_config',      params: ['name'],         expect: {} });
const callSetMode     = rpc.declare({ object: 'luci.clash', method: 'set_mode',        params: ['mode'],         expect: {} });
const callSetProxy    = rpc.declare({ object: 'luci.clash', method: 'set_proxy_mode',  params: ['mode'],         expect: {} });
const callSetPanel    = rpc.declare({ object: 'luci.clash', method: 'set_panel',       params: ['name'],         expect: {} });
const callUpdatePanel = rpc.declare({ object: 'luci.clash', method: 'update_panel',    params: ['name'],         expect: {} });
const callReadLog     = rpc.declare({ object: 'luci.clash', method: 'read_log',        expect: {} });
const callClearLog    = rpc.declare({ object: 'luci.clash', method: 'clear_log',       expect: {} });
const callReadUpdLog  = rpc.declare({ object: 'luci.clash', method: 'read_update_log', expect: {} });
const callClearUpdLog = rpc.declare({ object: 'luci.clash', method: 'clear_update_log',expect: {} });
const callReadGeoLog  = rpc.declare({ object: 'luci.clash', method: 'read_geoip_log',  expect: {} });
const callClearGeoLog = rpc.declare({ object: 'luci.clash', method: 'clear_geoip_log', expect: {} });
const callGetArch     = rpc.declare({ object: 'luci.clash', method: 'get_cpu_arch',    expect: {} });
const callDownCore    = rpc.declare({ object: 'luci.clash', method: 'download_core',   expect: {} });
const callUpdateGeoip = rpc.declare({ object: 'luci.clash', method: 'update_geoip',    expect: {} });
const callGetLogStat  = rpc.declare({ object: 'luci.clash', method: 'get_log_status',  expect: {} });

return baseclass.extend({
    status: function () {
        return L.resolveDefault(callStatus(), {});
    },

    start: function () {
        return L.resolveDefault(callStart(), {});
    },

    stop: function () {
        return L.resolveDefault(callStop(), {});
    },

    reload: function () {
        return L.resolveDefault(callReload(), {});
    },

    restart: function () {
        return L.resolveDefault(callRestart(), {});
    },

    version: function () {
        return L.resolveDefault(callVersion(), {});
    },

    listProfiles: function () {
        return L.resolveDefault(callListProf(), { profiles: [] }).then(res => res.profiles || []);
    },

    listConfigs: function () {
        return L.resolveDefault(callListConfigs(), { configs: [], current: '' });
    },

    setConfig: function (name) {
        return L.resolveDefault(callSetConfig(name), {});
    },

    setMode: function (mode) {
        return L.resolveDefault(callSetMode(mode), {});
    },

    setProxyMode: function (mode) {
        return L.resolveDefault(callSetProxy(mode), {});
    },

    setPanel: function (name) {
        return L.resolveDefault(callSetPanel(name), {});
    },

    updatePanel: function (name) {
        return L.resolveDefault(callUpdatePanel(name || 'metacubexd'), {});
    },

    readLog: function () {
        return L.resolveDefault(callReadLog(), { content: '' }).then(res => res.content || '');
    },

    clearLog: function () {
        return L.resolveDefault(callClearLog(), {});
    },

    readUpdateLog: function () {
        return L.resolveDefault(callReadUpdLog(), { content: '' }).then(r => r.content || '');
    },

    clearUpdateLog: function () {
        return L.resolveDefault(callClearUpdLog(), {});
    },

    readGeoipLog: function () {
        return L.resolveDefault(callReadGeoLog(), { content: '' }).then(r => r.content || '');
    },

    clearGeoipLog: function () {
        return L.resolveDefault(callClearGeoLog(), {});
    },

    capabilities: function () {
        return L.resolveDefault(callCaps(), {});
    },

    getCpuArch: function () {
        return L.resolveDefault(callGetArch(), { arch: '' }).then(res => res.arch || '');
    },

    downloadCore: function () {
        return L.resolveDefault(callDownCore(), {});
    },

    updateGeoip: function () {
        return L.resolveDefault(callUpdateGeoip(), {});
    },

    getLogStatus: function () {
        return L.resolveDefault(callGetLogStat(), {});
    }
});
