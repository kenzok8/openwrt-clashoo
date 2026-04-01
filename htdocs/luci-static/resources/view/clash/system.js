'use strict';
'require view';
'require form';
'require rpc';
'require uci';
'require tools.clash as clash';

let callGetArch = rpc.declare({ object: 'luci.clash', method: 'get_cpu_arch', expect: { arch: '' } });
let callGetLogStatus = rpc.declare({ object: 'luci.clash', method: 'get_log_status' });

return view.extend({
    load: function () {
        return Promise.all([
            L.resolveDefault(callGetArch(), ''),
            uci.load('clash')
        ]);
    },

    render: function (data) {
        let cpuArch = (typeof data[0] === 'string' ? data[0] : (data[0]?.arch || '')).trim();
        let m, s, o;

        m = new form.Map('clash', _('系统设置'));

        /* ─── 内核下载 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('内核下载'));
        s.description = _('从 GitHub 下载 Mihomo 内核二进制文件');
        s.anonymous = false;

        o = s.option(form.ListValue, 'dcore', _('版本类型'));
        o.value('2', 'mihomo（稳定版）');
        o.value('3', 'Alpha（预发布版）');
        o.default = '3';

        o = s.option(form.ListValue, 'download_core', _('CPU 架构'));
        o.value('aarch64_cortex-a53');
        o.value('aarch64_generic');
        o.value('arm_cortex-a7_neon-vfpv4');
        o.value('mipsel_24kc');
        o.value('mips_24kc');
        o.value('x86_64');
        o.value('riscv64');
        o.default = cpuArch || 'x86_64';
        o.description = cpuArch ? _('当前设备：<strong>%s</strong>').format(cpuArch) : '';

        o = s.option(form.Value, 'core_mirror_prefix', _('下载镜像前缀（可选）'));
        o.placeholder = 'https://gh-proxy.com/';
        o.rmempty = true;
        o.description = _('留空直连 GitHub；国内可填镜像前缀提升成功率');

        o = s.option(form.Button, '_download_core', _(''));
        o.inputtitle = _('下载内核');
        o.inputstyle = 'apply';
        o.onclick = function () {
            return m.save().then(() => clash.downloadCore()).then(() => {
                L.ui.addNotification(null, E('p', _('下载任务已启动，请稍后刷新查看结果')));
            });
        };

        /* ─── GeoIP / GeoSite ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('GeoIP / GeoSite 数据库'));
        s.description = _('Mihomo 使用 GeoIP/GeoSite 数据库进行规则匹配，建议定期更新');
        s.anonymous = false;

        o = s.option(form.Flag, 'auto_update_geoip', _('自动更新'));

        o = s.option(form.ListValue, 'auto_update_geoip_time', _('更新时间（每天几点）'));
        for (let i = 0; i <= 23; i++) o.value(String(i), i + ':00');
        o.default = '3';
        o.depends('auto_update_geoip', '1');

        o = s.option(form.Value, 'geoip_update_interval', _('更新周期（天）'));
        o.datatype = 'uinteger';
        o.default = '7';
        o.depends('auto_update_geoip', '1');

        o = s.option(form.ListValue, 'geoip_source', _('数据来源'));
        o.value('2', '默认简化源（推荐）');
        o.value('3', 'OpenClash 社区源');
        o.value('1', 'MaxMind 官方');
        o.value('4', '自定义订阅');
        o.default = '2';

        o = s.option(form.ListValue, 'geoip_format', _('GeoIP 格式'));
        o.value('mmdb', 'MMDB（推荐）');
        o.value('dat', 'DAT');
        o.default = 'mmdb';

        o = s.option(form.ListValue, 'geodata_loader', _('加载模式'));
        o.value('standard', '标准');
        o.value('memconservative', '节省内存');
        o.default = 'standard';
        o.description = _('内存受限设备可选"节省内存"');

        o = s.option(form.Value, 'license_key', _('MaxMind 授权密钥'));
        o.rmempty = true;
        o.depends('geoip_source', '1');

        o = s.option(form.Value, 'geoip_mmdb_url', _('GeoIP（MMDB）订阅链接'));
        o.rmempty = true;
        o.placeholder = 'https://raw.githubusercontent.com/alecthw/mmdb_china_ip_list/release/Country.mmdb';
        o.depends('geoip_source', '2');
        o.depends('geoip_source', '4');

        o = s.option(form.Value, 'geosite_url', _('GeoSite 订阅链接'));
        o.rmempty = true;
        o.depends('geoip_source', '2');
        o.depends('geoip_source', '3');
        o.depends('geoip_source', '4');

        o = s.option(form.Value, 'geoip_dat_url', _('GeoIP（DAT）订阅链接'));
        o.rmempty = true;
        o.depends('geoip_source', '2');
        o.depends('geoip_source', '3');
        o.depends('geoip_source', '4');

        o = s.option(form.Button, '_update_geoip', _(''));
        o.inputtitle = _('立即更新 GeoIP');
        o.inputstyle = 'apply';
        o.onclick = function () {
            return m.save().then(() => clash.updateGeoip()).then(() => {
                L.ui.addNotification(null, E('p', _('GeoIP 更新任务已启动')));
            });
        };

        /* ─── 绕过 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('绕过'));
        s.anonymous = false;

        o = s.option(form.Flag, 'bypass_china', _('绕过中国大陆 IP'));
        o.default = '0';
        o.description = _('目标为中国大陆 IP 时直连，不经过代理（需要 /usr/share/clash/china_ip.txt）');

        /* ─── 局域网访问控制 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('局域网访问控制'));
        s.description = _('控制哪些局域网设备走代理（按来源 IP 过滤）');
        s.anonymous = false;

        o = s.option(form.ListValue, 'access_control', _('控制模式'));
        o.value('0', '关闭（所有设备走代理）');
        o.value('1', '白名单（仅列表中的设备走代理）');
        o.value('2', '黑名单（列表中的设备不走代理）');
        o.default = '0';

        o = s.option(form.DynamicList, 'proxy_lan_ips', _('白名单设备 IP'));
        o.datatype = 'ip4addr';
        o.rmempty = true;
        o.depends('access_control', '1');

        o = s.option(form.DynamicList, 'reject_lan_ips', _('黑名单设备 IP'));
        o.datatype = 'ip4addr';
        o.rmempty = true;
        o.depends('access_control', '2');

        /* ─── 自动化任务 ─── */
        s = m.section(form.NamedSection, 'config', 'clash', _('自动化任务'));
        s.anonymous = false;

        o = s.option(form.Flag, 'auto_update', _('自动更新订阅'));
        o.description = _('定时拉取当前使用的订阅配置');

        o = s.option(form.ListValue, 'auto_update_time', _('更新频率'));
        o.value('1', '每小时');
        o.value('6', '每 6 小时');
        o.value('12', '每 12 小时');
        o.value('24', '每 24 小时');
        o.depends('auto_update', '1');

        o = s.option(form.Flag, 'auto_clear_log', _('自动清理日志'));

        o = s.option(form.ListValue, 'clear_time', _('清理频率'));
        o.value('1', '每小时');
        o.value('6', '每 6 小时');
        o.value('12', '每 12 小时');
        o.value('24', '每 24 小时');
        o.depends('auto_clear_log', '1');

        return m.render();
    },

    handleSaveApply: function (ev) {
        return this.handleSave(ev).then(() => clash.restart());
    }
});
