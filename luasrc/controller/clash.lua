module("luci.controller.clash", package.seeall)

local nixfs = require "nixio.fs"
local http  = require "luci.http"
local uci   = require "luci.model.uci".cursor()

local function basename(path)
	if not path or path == "" then return "" end
	return tostring(path):gsub("/*$", ""):match("([^/]+)$") or ""
end

-- ── 导航注册 ────────────────────────────────────────────────────

function index()
	if not nixfs.access("/etc/config/clash") then return end

	local has_menu_d = nixfs.access("/usr/share/luci/menu.d/luci-app-clashoo.json")
	if not has_menu_d then
		local page = entry({"admin", "services", "clashoo"},
			alias("admin", "services", "clashoo", "overview"), "Clashoo", 1)
		page.dependent  = true
		page.acl_depends = {"luci-app-clashoo"}

		local legacy = entry({"admin", "services", "clash"},
			alias("admin", "services", "clashoo"), nil)
		legacy.dependent  = true
		legacy.acl_depends = {"luci-app-clashoo"}

		entry({"admin","services","clashoo","overview"},       cbi("clash/overview"),       "概览",    10).leaf = true
		entry({"admin","services","clashoo","config_manager"}, cbi("clash/config_manager"), "配置管理", 20).leaf = true
		entry({"admin","services","clashoo","dns_settings"},   cbi("clash/dns_settings"),   "DNS 设置", 30).leaf = true
		entry({"admin","services","clashoo","system"},         cbi("clash/system"),         "系统",    40).leaf = true
		entry({"admin","services","clashoo","ip-rules"},       cbi("clash/config/ip-rules"), nil).leaf = true
	end

	-- JSON API
	entry({"admin","services","clash","check_status"},    call("check_status")).leaf    = true
	entry({"admin","services","clash","ping"},            call("act_ping")).leaf         = true
	entry({"admin","services","clash","readlog"},         call("action_read")).leaf      = true
	entry({"admin","services","clash","status"},          call("action_status")).leaf    = true
	entry({"admin","services","clash","check"},           call("check_update_log")).leaf = true
	entry({"admin","services","clash","doupdate"},        call("do_update")).leaf        = true
	entry({"admin","services","clash","start"},           call("do_start")).leaf         = true
	entry({"admin","services","clash","stop"},            call("do_stop")).leaf          = true
	entry({"admin","services","clash","reload"},          call("do_reload")).leaf        = true
	entry({"admin","services","clash","set_mode"},        call("do_set_mode")).leaf      = true
	entry({"admin","services","clash","list_configs"},    call("action_list_configs")).leaf    = true
	entry({"admin","services","clash","set_config"},      call("do_set_config")).leaf         = true
	entry({"admin","services","clash","set_config_type"}, call("do_set_config_type")).leaf    = true
	entry({"admin","services","clash","set_proxy_mode"},  call("do_set_proxy_mode")).leaf     = true
	entry({"admin","services","clash","set_panel"},       call("do_set_panel")).leaf          = true
	entry({"admin","services","clash","download_panel"},  call("do_download_panel")).leaf     = true
	entry({"admin","services","clash","geo"},             call("geoip_check")).leaf            = true
	entry({"admin","services","clash","geoipupdate"},     call("geoip_update")).leaf           = true
	entry({"admin","services","clash","check_geoip"},     call("check_geoip_log")).leaf        = true
	entry({"admin","services","clash","corelog"},         call("down_check")).leaf             = true
	entry({"admin","services","clash","logstatus"},       call("logstatus_check")).leaf        = true
	entry({"admin","services","clash","conf"},            call("action_conf")).leaf            = true
	entry({"admin","services","clash","update_config"},   call("action_update")).leaf          = true
	entry({"admin","services","clash","ping_check"},      call("action_ping_status")).leaf     = true
end

-- ── 内部工具函数 ─────────────────────────────────────────────────

local function uci_get(key)
	local v = luci.sys.exec("uci -q get " .. key .. " 2>/dev/null") or ""
	return v:gsub("%s+$", "")
end

local function is_running()
	return luci.sys.call(
		"pidof mihomo >/dev/null || pidof clash-meta >/dev/null || pidof clash >/dev/null"
	) == 0
end

-- 找到当前可用的 mihomo 二进制
local function find_binary()
	local bins = {
		"/usr/bin/mihomo",
		"/usr/bin/clash-meta",
		"/etc/clash/clash-meta",
	}
	for _, p in ipairs(bins) do
		if nixfs.access(p) then return p end
	end
	return ""
end

local function binary_version(path)
	if path == "" or not nixfs.access(path) then return "" end
	local v = luci.sys.exec(
		path .. [[ -v 2>/dev/null | awk 'NR==1{ if($1=="Mihomo") print $3; else print $2 }']]
	)
	return v and v:gsub("%s+$", "") or ""
end

local function mihomo_version()
	local bin = find_binary()
	if bin ~= "" then
		local v = binary_version(bin)
		if v ~= "" then return v end
	end
	return uci_get("clash.config.core_version") ~= "" and uci_get("clash.config.core_version")
		or luci.sys.exec("sed -n 1p /usr/share/clash/core_version 2>/dev/null"):gsub("%s+$", "")
		or "0"
end

local function proxy_mode()
	local v = uci_get("clash.config.p_mode")
	if v == "global" or v == "direct" then return v end
	return "rule"
end

local function mode_value()
	local tcp = uci_get("clash.config.tcp_mode")
	return tcp == "tun" and "tun" or "fake-ip"
end

local function sanitize_config_type(raw)
	raw = (raw or ""):gsub("%s+", "")
	if raw == "1" or raw == "2" or raw == "3" then return raw end
	return ""
end

local function append_config_list(configs, pattern)
	for path in nixfs.glob(pattern) do
		configs[#configs + 1] = basename(path)
	end
end

local function list_configs(conf_type)
	local configs = {}
	conf_type = sanitize_config_type(conf_type)
	if conf_type == "1" then
		append_config_list(configs, "/usr/share/clash/config/sub/*.yaml")
	elseif conf_type == "2" then
		append_config_list(configs, "/usr/share/clash/config/upload/*.yaml")
	elseif conf_type == "3" then
		append_config_list(configs, "/usr/share/clash/config/custom/*.yaml")
	else
		append_config_list(configs, "/usr/share/clash/config/sub/*.yaml")
		append_config_list(configs, "/usr/share/clash/config/upload/*.yaml")
		append_config_list(configs, "/usr/share/clash/config/custom/*.yaml")
	end
	table.sort(configs)
	return configs
end

local function typeconf()
	return uci_get("clash.config.config_type")
end

local function conf_path()
	local p = uci_get("clash.config.use_config")
	if p ~= "" and nixfs.access(p) then
		return basename(p)
	end
	return ""
end

local function localip()
	local ip = uci_get("network.lan.ipaddr"):gsub("/%d+$", "")
	if ip == "" then
		ip = luci.sys.exec(
			"ip -4 -o addr show dev br-lan 2>/dev/null | awk '{print $4}' | sed -n '1p'"
		):gsub("%s+$", ""):gsub("/%d+$", "")
	end
	return ip
end

local function dashboard_panel()
	return uci_get("clash.config.dashboard_panel")
end

local function panel_download_state()
	if nixfs.access("/var/run/panel_downloading") then return "downloading" end
	local f = io.open("/tmp/clash_panel_download_state", "r")
	if not f then return "" end
	local s = f:read("*l") or ""
	f:close()
	return s
end

local function downcheck()
	if nixfs.access("/var/run/core_update_error") then return "0"
	elseif nixfs.access("/var/run/core_update") then return "1"
	elseif nixfs.access("/usr/share/clash/core_down_complete") then return "2"
	end
	return ""
end

local function geoipcheck()
	if nixfs.access("/var/run/geoip_update_error") then return "0"
	elseif nixfs.access("/var/run/geoip_update") then return "1"
	elseif nixfs.access("/var/run/geoip_down_complete") then return "2"
	end
	return ""
end

local function ping_enable()
	local v = uci_get("clash.config.ping_enable")
	return v ~= "" and v or "0"
end

local function new_mihomo_version()
	return luci.sys.exec("sed -n 1p /usr/share/clash/new_mihomo_core_version 2>/dev/null"):gsub("%s+$","")
end

local function current_luci_version()
	return luci.sys.exec("sed -n 1p /usr/share/clash/luci_version 2>/dev/null"):gsub("%s+$","")
end

local function new_luci_version()
	return luci.sys.exec("sed -n 1p /usr/share/clash/new_luci_version 2>/dev/null"):gsub("%s+$","")
end

-- ── API 响应函数 ─────────────────────────────────────────────────

function action_read()
	luci.http.prepare_content("application/json")
	luci.http.write_json({
		readlog = luci.sys.exec("sed -n '$p' /usr/share/clash/clash_real.txt 2>/dev/null"):gsub("%s+$","")
	})
end

function down_check()
	luci.http.prepare_content("application/json")
	luci.http.write_json({ downcheck = downcheck() })
end

function geoip_check()
	luci.http.prepare_content("application/json")
	luci.http.write_json({ geoipcheck = geoipcheck() })
end

function check_status()
	luci.http.prepare_content("application/json")
	luci.http.write_json({
		current_version     = current_luci_version(),
		new_version         = new_luci_version(),
		mihomo_core         = mihomo_version(),
		new_mihomo_version  = new_mihomo_version(),
		conf_path           = conf_path(),
		typeconf            = typeconf(),
	})
end

function action_status()
	luci.http.prepare_content("application/json")
	luci.http.write_json({
		clash               = is_running(),
		localip             = localip(),
		dash_port           = uci_get("clash.config.dash_port"),
		dash_pass           = uci_get("clash.config.dash_pass"),
		dashboard_panel     = dashboard_panel(),
		current_version     = current_luci_version(),
		new_version         = new_luci_version(),
		mihomo_core         = mihomo_version(),
		new_mihomo_version  = new_mihomo_version(),
		mode_value          = mode_value(),
		in_use              = typeconf(),
		conf_path           = conf_path(),
		proxy_mode          = proxy_mode(),
		panel_download_state = panel_download_state(),
		dashboard_installed = nixfs.access("/etc/clash/dashboard/index.html") and true or false,
		zashboard_installed = nixfs.access("/usr/share/clash/zashboard/index.html") and true or false,
		yacd_installed      = nixfs.access("/usr/share/clash/yacd/index.html") and true or false,
	})
end

function action_conf()
	luci.http.prepare_content("application/json")
	luci.http.write_json({
		conf_path = conf_path(),
		typeconf  = typeconf(),
		configs   = list_configs(),
	})
end

function action_list_configs()
	local req_type = sanitize_config_type(luci.http.formvalue("type"))
	if req_type == "" then req_type = sanitize_config_type(typeconf()) end
	luci.http.prepare_content("application/json")
	luci.http.write_json({ configs = list_configs(req_type), current = conf_path(), type = req_type })
end

function action_update()
	luci.sys.exec(
		"kill $(pgrep -f /usr/share/clash/update.sh) 2>/dev/null; " ..
		"(sh /usr/share/clash/update.sh >/usr/share/clash/clash.txt 2>&1) &"
	)
end

function action_ping_status()
	luci.http.prepare_content("application/json")
	luci.http.write_json({ ping_enable = ping_enable() })
end

function act_ping()
	local domain = luci.http.formvalue("domain") or ""
	local e = {
		index = luci.http.formvalue("index"),
		ping  = luci.sys.exec(string.format(
			"ping -c 1 -W 1 -w 5 %q 2>&1 | grep -o 'time=[0-9.]*' | awk -F= '{print $2}'", domain
		)):gsub("%s+$","")
	}
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function geoip_update()
	nixfs.writefile("/var/run/geoiplog", "0")
	luci.sys.exec(
		"(rm -f /var/run/geoip_update_error; touch /var/run/geoip_update;" ..
		" sh /usr/share/clash/geoip.sh >/tmp/geoip_update.txt 2>&1 ||" ..
		" touch /var/run/geoip_update_error; rm -f /var/run/geoip_update) &"
	)
end

function do_update()
	nixfs.writefile("/var/run/clashlog", "0")
	luci.sys.exec(
		"(rm -f /var/run/core_update_error; touch /var/run/core_update;" ..
		" sh /usr/share/clash/core_download.sh >/tmp/clash_update.txt 2>&1 ||" ..
		" touch /var/run/core_update_error; rm -f /var/run/core_update) &"
	)
end

function do_start()
	if find_binary() == "" then
		luci.http.status(500, "Core Not Found")
		return
	end
	luci.sys.call("uci set clash.config.enable='1' && uci commit clash && /etc/init.d/clash start >/dev/null 2>&1")
	luci.sys.call("sleep 5")
	if is_running() then
		luci.http.status(200, "OK")
	else
		luci.http.status(500, "Start Failed")
	end
end

function do_stop()
	luci.sys.call("uci set clash.config.enable='0' && uci commit clash && /etc/init.d/clash stop >/dev/null 2>&1")
	luci.http.status(200, "OK")
end

function do_reload()
	local rc = luci.sys.call("/etc/init.d/clash restart >/dev/null 2>&1")
	luci.http.status(rc == 0 and 200 or 500, rc == 0 and "OK" or "Reload Failed")
end

function do_set_mode()
	local mode = (luci.http.formvalue("mode") or ""):gsub("%s+", "")
	if mode ~= "tun" and mode ~= "fake-ip" then
		luci.http.status(400, "Bad Request"); return
	end

	local rc
	if mode == "tun" then
		local core = uci_get("clash.config.core")
		rc = luci.sys.call(string.format(
			"uci set clash.config.tcp_mode='tun' && uci set clash.config.udp_mode='tun'" ..
			" && uci set clash.config.core=%q && uci set clash.config.stack='mixed'" ..
			" && uci set clash.config.enhanced_mode='fake-ip' && uci commit clash",
			core ~= "" and core or "3"
		))
	else
		rc = luci.sys.call(
			"uci set clash.config.tcp_mode='redirect' && uci delete clash.config.udp_mode" ..
			" && uci set clash.config.enhanced_mode='fake-ip' && uci commit clash"
		)
	end

	if rc ~= 0 then luci.http.status(500, "Set Mode Failed"); return end

	if is_running() then
		luci.sys.call("/etc/init.d/clash restart >/dev/null 2>&1")
		luci.sys.call("sleep 3")
		if not is_running() then luci.http.status(500, "Restart Failed"); return end
	end
	luci.http.status(200, "OK")
end

function do_set_proxy_mode()
	local mode = (luci.http.formvalue("mode") or ""):gsub("%s+", "")
	if mode ~= "rule" and mode ~= "global" and mode ~= "direct" then
		luci.http.status(400, "Bad Request"); return
	end
	local rc = luci.sys.call(string.format(
		"uci set clash.config.p_mode=%q && uci commit clash", mode
	))
	if rc ~= 0 then luci.http.status(500, "Set Proxy Mode Failed"); return end
	if is_running() then
		luci.sys.call("/etc/init.d/clash restart >/dev/null 2>&1")
		luci.sys.call("sleep 2")
		if not is_running() then luci.http.status(500, "Restart Failed"); return end
	end
	luci.http.status(200, "OK")
end

function do_set_config()
	local name = (luci.http.formvalue("name") or ""):gsub("[^%w%._%-]", "")
	if name == "" then luci.http.status(400, "Bad Request"); return end

	local dirs = {
		{"/usr/share/clash/config/sub/",    "1"},
		{"/usr/share/clash/config/upload/", "2"},
		{"/usr/share/clash/config/custom/", "3"},
	}
	for _, entry in ipairs(dirs) do
		local candidate = entry[1] .. name
		if nixfs.access(candidate) then
			local rc = luci.sys.call(string.format(
				"uci set clash.config.use_config=%q && uci set clash.config.config_type=%q && uci commit clash",
				candidate, entry[2]
			))
			if rc ~= 0 then luci.http.status(500, "Set Config Failed"); return end
			if is_running() then
				luci.sys.call("/etc/init.d/clash restart >/dev/null 2>&1")
				luci.sys.call("sleep 2")
				if not is_running() then luci.http.status(500, "Restart Failed"); return end
			end
			luci.http.status(200, "OK")
			return
		end
	end
	luci.http.status(404, "Not Found")
end

function do_set_config_type()
	local ctype = sanitize_config_type(luci.http.formvalue("type"))
	if ctype == "" then luci.http.status(400, "Bad Request"); return end

	local base_map = {
		["1"] = "/usr/share/clash/config/sub/",
		["2"] = "/usr/share/clash/config/upload/",
		["3"] = "/usr/share/clash/config/custom/",
	}
	local basedir = base_map[ctype]
	local current = uci:get("clash", "config", "use_config") or ""
	local current_ok = current ~= "" and current:sub(1, #basedir) == basedir and nixfs.access(current)

	uci:set("clash", "config", "config_type", ctype)
	if not current_ok then
		local configs = list_configs(ctype)
		if #configs > 0 then
			uci:set("clash", "config", "use_config", basedir .. configs[1])
		else
			uci:delete("clash", "config", "use_config")
		end
	end
	uci:commit("clash")
	luci.http.status(200, "OK")
end

function do_set_panel()
	local allowed = { metacubexd=true, yacd=true, zashboard=true, razord=true }
	local name = (luci.http.formvalue("name") or "metacubexd"):gsub("%s+", "")
	if not allowed[name] then name = "metacubexd" end
	local rc = luci.sys.call(string.format(
		"uci set clash.config.dashboard_panel=%q && uci commit clash", name
	))
	luci.http.status(rc == 0 and 200 or 500, rc == 0 and "OK" or "Set Panel Failed")
end

function do_download_panel()
	local allowed = { metacubexd=true, yacd=true, zashboard=true, razord=true }
	local name = (luci.http.formvalue("name") or uci_get("clash.config.dashboard_panel")):gsub("%s+", "")
	if not allowed[name] then name = "metacubexd" end
	local rc = luci.sys.call(string.format(
		"sh /usr/share/clash/panel_download.sh %q >/dev/null 2>&1 &", name
	))
	luci.http.status(rc == 0 and 200 or 500, rc == 0 and "OK" or "Download Failed")
end

-- ── 日志流式读取 ─────────────────────────────────────────────────

local function stream_log(pos_file, log_file, running_flag)
	luci.http.prepare_content("text/plain; charset=utf-8")
	local pos = tonumber(nixfs.readfile(pos_file)) or 0
	local f   = io.open(log_file, "r")
	if not f then luci.http.write("\0"); return end
	f:seek("set", pos)
	local chunk = f:read(2097152) or ""
	pos = f:seek()
	f:close()
	nixfs.writefile(pos_file, tostring(pos))
	luci.http.write(nixfs.access(running_flag) and chunk or (chunk .. "\0"))
end

function check_update_log()
	stream_log("/var/run/clashlog", "/tmp/clash_update.txt", "/var/run/core_update")
end

function check_geoip_log()
	stream_log("/var/run/geoiplog", "/tmp/geoip_update.txt", "/var/run/geoip_update")
end

function logstatus_check()
	local pos_file  = "/usr/share/clash/logstatus_check"
	local log_file  = "/usr/share/clash/clash.txt"
	if not nixfs.access(log_file) then
		luci.http.prepare_content("text/plain; charset=utf-8")
		luci.http.write("\0")
		return
	end
	stream_log(pos_file, log_file, "/var/run/logstatus")
end
