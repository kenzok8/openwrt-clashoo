'use strict';
'require baseclass';
'require rpc';

const callStatus        = rpc.declare({ object: 'luci.clash', method: 'status',           expect: {} });
const callStart         = rpc.declare({ object: 'luci.clash', method: 'start',            expect: {} });
const callStop          = rpc.declare({ object: 'luci.clash', method: 'stop',             expect: {} });
const callReload        = rpc.declare({ object: 'luci.clash', method: 'reload',           expect: {} });
const callRestart       = rpc.declare({ object: 'luci.clash', method: 'restart',          expect: {} });
const callVersion       = rpc.declare({ object: 'luci.clash', method: 'version',          expect: {} });
const callListProf      = rpc.declare({ object: 'luci.clash', method: 'list_profiles',    expect: {} });
const callListConfigs   = rpc.declare({ object: 'luci.clash', method: 'list_configs',     expect: {} });
const callSetConfig     = rpc.declare({ object: 'luci.clash', method: 'set_config',       params: ['name'], expect: {} });
const callSetMode       = rpc.declare({ object: 'luci.clash', method: 'set_mode',         params: ['mode'], expect: {} });
const callSetProxyMode  = rpc.declare({ object: 'luci.clash', method: 'set_proxy_mode',   params: ['mode'], expect: {} });
const callSetPanel      = rpc.declare({ object: 'luci.clash', method: 'set_panel',        params: ['name'], expect: {} });
const callUpdatePanel   = rpc.declare({ object: 'luci.clash', method: 'update_panel',     params: ['name'], expect: {} });
const callReadLog       = rpc.declare({ object: 'luci.clash', method: 'read_log',         expect: {} });
const callReadRealLog   = rpc.declare({ object: 'luci.clash', method: 'read_real_log',    expect: {} });
const callClearLog      = rpc.declare({ object: 'luci.clash', method: 'clear_log',        expect: {} });
const callReadUpdateLog = rpc.declare({ object: 'luci.clash', method: 'read_update_log',  expect: {} });
const callClearUpdateLog= rpc.declare({ object: 'luci.clash', method: 'clear_update_log', expect: {} });
const callReadGeoipLog  = rpc.declare({ object: 'luci.clash', method: 'read_geoip_log',   expect: {} });
const callClearGeoipLog = rpc.declare({ object: 'luci.clash', method: 'clear_geoip_log',  expect: {} });
const callGetCpuArch    = rpc.declare({ object: 'luci.clash', method: 'get_cpu_arch',     expect: {} });
const callDownloadCore  = rpc.declare({ object: 'luci.clash', method: 'download_core',    expect: {} });
const callUpdateGeoip   = rpc.declare({ object: 'luci.clash', method: 'update_geoip',     expect: {} });
const callUpdateChinaIp = rpc.declare({ object: 'luci.clash', method: 'update_china_ip',  expect: {} });
const callGetLogStatus  = rpc.declare({ object: 'luci.clash', method: 'get_log_status',   expect: {} });
const callAccessCheck   = rpc.declare({ object: 'luci.clash', method: 'access_check',     expect: {} });

return baseclass.extend({
    status: function () { return L.resolveDefault(callStatus(), {}); },
    start: function () { return L.resolveDefault(callStart(), {}); },
    stop: function () { return L.resolveDefault(callStop(), {}); },
    reload: function () { return L.resolveDefault(callReload(), {}); },
    restart: function () { return L.resolveDefault(callRestart(), {}); },
    version: function () { return L.resolveDefault(callVersion(), {}); },

    listProfiles: function () { return L.resolveDefault(callListProf(), { profiles: [] }).then(r => r.profiles || []); },
    listConfigs: function () { return L.resolveDefault(callListConfigs(), { configs: [], current: '' }); },
    setConfig: function (name) { return L.resolveDefault(callSetConfig(name), {}); },
    setMode: function (mode) { return L.resolveDefault(callSetMode(mode), {}); },
    setProxyMode: function (mode) { return L.resolveDefault(callSetProxyMode(mode), {}); },
    setPanel: function (name) { return L.resolveDefault(callSetPanel(name), {}); },
    updatePanel: function (name) { return L.resolveDefault(callUpdatePanel(name || 'metacubexd'), {}); },

    readLog: function () { return L.resolveDefault(callReadLog(), { content: '' }).then(r => r.content || ''); },
    readRealLog: function () { return L.resolveDefault(callReadRealLog(), { content: '' }).then(r => r.content || ''); },
    clearLog: function () { return L.resolveDefault(callClearLog(), {}); },
    readUpdateLog: function () { return L.resolveDefault(callReadUpdateLog(), { content: '' }).then(r => r.content || ''); },
    clearUpdateLog: function () { return L.resolveDefault(callClearUpdateLog(), {}); },
    readGeoipLog: function () { return L.resolveDefault(callReadGeoipLog(), { content: '' }).then(r => r.content || ''); },
    clearGeoipLog: function () { return L.resolveDefault(callClearGeoipLog(), {}); },

    getCpuArch: function () { return L.resolveDefault(callGetCpuArch(), { arch: '' }).then(r => r.arch || ''); },
    downloadCore: function () { return L.resolveDefault(callDownloadCore(), {}); },
    updateGeoip: function () { return L.resolveDefault(callUpdateGeoip(), {}); },
    updateChinaIp: function () { return L.resolveDefault(callUpdateChinaIp(), {}); },
    getLogStatus: function () { return L.resolveDefault(callGetLogStatus(), {}); },
    accessCheck: function () { return L.resolveDefault(callAccessCheck(), {}); }
});
