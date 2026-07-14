---
name: clashoo-user-guide
description: "Clashoo 功能与排障专家指南。Clashoo 是 OpenWrt 上的双内核（mihomo / Smart / sing-box）代理管理插件。回答「某功能怎么开/关」「为什么不通」「日志报错什么意思」「内核怎么选」「sing-box 配置怎么搞」等问题时使用本指南。回答前先读 AI 行为准则：对照源码、给 LuCI 操作路径而非裸命令、区分 mihomo(YAML) 与 sing-box(JSON)、先看日志再下结论。用户向 how-to 查 references/*.md，排障/日志类用本文件的架构、启动流程、防火墙与 DNS、日志报错章节。"
metadata:
  tags: [clashoo, openwrt, mihomo, smart, sing-box, clash, proxy, networking, fake-ip, tproxy, tun]
---

# Clashoo 专家指南

Clashoo 是 kenzok8 维护的 OpenWrt 代理管理插件，一个界面管三种内核：**mihomo（稳定/Alpha）、Smart、sing-box（稳定/Alpha）**。mihomo/Smart 走 YAML，sing-box 走 JSON，同一套 UCI 配置自动适配两端。

本指南分两层：
- **本文件**：AI 排障要用、但用户向 Wiki 不该有的东西——系统架构、启动流程、防火墙/DNS 内部机制、日志报错解码、双内核内幕、排障方法论。
- **`references/`**：13 篇用户向 how-to（安装、导入配置、选内核、各页操作），与项目 GitHub Wiki 同源。回答「怎么操作」时查这里。

---

## AI 行为准则

回答 Clashoo 问题前，先守住这几条：

1. **验证优先，不臆测**。拿不准就查源码：核心逻辑在 `clashoo/files/usr/share/clashoo/` 和 `clashoo/files/etc/init.d/clashoo`，UI 选项的真名在 `clashoo/files/etc/config/clashoo`（UCI），界面在 `luci-app-clashoo/htdocs/luci-static/resources/view/clashoo/*.js`。
2. **给 LuCI 操作路径，而非裸命令**。用户多数不是工程师，先说「服务 → Clashoo → 概览 / 配置 / 系统」里点哪里，再在必要时补命令行。
3. **先看日志再下结论**。三类日志（见下方「日志报错解码」）；让用户先贴 `概览` 状态行 + `系统 → 日志`，再判断。
4. **双内核分开对待**。同一个问题在 mihomo 和 sing-box 下机制不同（配置格式、DNS 接管、预检命令都不一样）。先确认 `核心类型 = mihomo/Smart 还是 sing-box`，再回答。
5. **隐私意识**。让用户贴日志时提醒打码订阅链接、节点地址、`dash_pass` 等敏感信息。

---

## 系统架构速查

### 数据流向

```
LuCI 视图(.js: overview/config/system)
   │  通过 RPC
   ▼
ucode RPC 后端 (root/usr/share/rpcd/ucode/luci.clashoo)
   │  读写
   ▼
UCI 配置 (/etc/config/clashoo)
   │  init.d 与 runtime 脚本读取
   ▼
init.d/clashoo  ──►  runtime/*、net/*、update/*、lib/* 脚本
   │                      │
   │                      ├─ mihomo 路线：生成 /etc/clashoo/config.yaml → mihomo -t 预检 → procd 拉起
   │                      └─ sing-box 路线：normalize /etc/sing-box/config.json → sing-box check → /etc/init.d/sing-box
   ▼
内核进程 (mihomo / smart / sing-box)
   +  fw4 防火墙规则  +  dnsmasq 转发  +  健康检查
```

### 关键目录与文件

| 路径 | 作用 |
|------|------|
| `/etc/config/clashoo` | UCI 配置，所有界面选项的真实存放处 |
| `/etc/init.d/clashoo` | 主控脚本：启停、双内核调度、健康检查、bootstrap、core-only |
| `/etc/clashoo/config.yaml` | mihomo 运行配置（由所选订阅/配置文件加工而来） |
| `/etc/sing-box/config.json` | sing-box 运行配置（由所选 profile normalize 而来） |
| `/usr/share/sing-box/` | sing-box 工作目录，含 `cache.db`（fake-ip 反查表） |
| `/usr/share/clashoo/runtime/` | 运行时脚本：`clashoo.sh`、`mixin.uc`、`dns_helpers.sh`、`iprules.sh`、`backup.sh`、`restore.sh` |
| `/usr/share/clashoo/net/` | 网络层：`fw4.sh`（防火墙）、`dns_auto_setup.sh`、`access_check*.sh`、`log_format.awk` |
| `/usr/share/clashoo/lib/` | sing-box 转换链：`yaml2singbox.uc`、`normalize_singbox_config.uc`、`migrate_singbox.uc`、`templates/default.json` |
| `/usr/share/clashoo/update/` | 更新脚本：内核/面板/GeoIP/订阅/组件/LightGBM |
| `/usr/share/clashoo/clashoo.txt` | 插件日志（用户在「日志」页看到的主日志） |
| `/usr/share/clashoo/clashoo_real.txt` | 单行状态（界面状态行的来源） |
| `/var/log/clashoo/core.log` | 内核进程 stdout（mihomo/sing-box 原生日志、预检报错） |
| `/tmp/clashoo/runtime_state` | 运行时状态机：健康状态、生效模式、降级标记 |

### 内核选择的两套字段（重要）

界面选内核写的是 **`core_type` + `dcore`**，启动时再同步出一个**遗留字段 `core`** 供老逻辑用（见 `sync_legacy_core_field`）：

| 用户选择 | `core_type` | `dcore` | 同步出的 `core` | 实际二进制（按优先级探测） |
|----------|-------------|---------|------------------|----------------------------|
| Smart | `mihomo` | `1` | `1` | `/usr/bin/smart` → `/etc/clashoo/clash` → `/usr/bin/clash` |
| mihomo 稳定版 | `mihomo` | `2` | `2` | `/usr/bin/clash-meta`（用户下载） → `/etc/clashoo/clash-meta` → `/usr/bin/mihomo` |
| mihomo Alpha | `mihomo` | `3` | `3` | `/usr/bin/mihomo`（CI 自动 bump 的 alpha） → `/usr/bin/clash-meta` |
| sing-box 稳定版 | `singbox` | `4` | `4` | `/usr/bin/sing-box` ← 软链到 `/usr/bin/sing-box-stable` |
| sing-box Alpha | `singbox` | `5` | `5` | `/usr/bin/sing-box` ← 软链到 `/usr/bin/sing-box-alpha` |

> 排障要点：`/usr/bin/mihomo` 是 CI 每天自动 bump 的 **Alpha**，稳定版优先认 `clash-meta`。sing-box 稳定/Alpha 通过软链 `/usr/bin/sing-box` 共存切换。

### procd 进程身份（为什么不能 `pidof`）

OpenClash / nikki / passwall 可能和 Clashoo 共用同名二进制（mihomo、sing-box）。Clashoo **从不用 `pidof` 判断进程**，一律查 `ubus call service list`：

- mihomo 路线：进程注册在 procd 服务名 **`clashoo`** 下（`_clashoo_instance_pid`）。
- sing-box 路线：Clashoo 不自己拉起，而是托管系统的 **`/etc/init.d/sing-box`**（procd 服务名 `sing-box`，`_singbox_instance_pid`），启动前把 `sing-box.main.enabled` 置 1、停止时置 0。`boot()` 阶段会先把它强制置 0，避免它在 Clashoo 准备好配置/防火墙前抢跑。

---

## 系统启动完整流程

`/etc/init.d/clashoo start` → `start_service()`，按所选内核分两条路。

### 公共前置
1. `sync_legacy_core_field`：由 `core_type/dcore` 同步出 `core`。
2. `_detect_selected_core`：按上表探测可用二进制。
3. `cleanup_legacy_startup_backups` + `migrate_legacy_clash_dir`：清理历史残留、把老的 `/etc/clash` 迁到 `/etc/clashoo`。
4. `resolve_effective_tp_modes`：算「生效的」TCP/UDP 模式。**选了 TUN 但设备无 `/dev/net/tun` → 自动降级**（TCP→redirect、UDP→tproxy），并在状态机记 `degraded=1`。
5. `runtime_state_record_preflight`：把生效模式、是否有 tun、降级原因写进 `/tmp/clashoo/runtime_state`。

### mihomo / Smart 路线
1. `select_config`：把所选配置文件拷为 `/etc/clashoo/config.yaml`，空/缺直接失败。
2. `_require_runtime_network_stack`：检查 `fw4 / nft / ip` 齐全。
3. `_start_validate_core`：对应内核二进制不存在就报错退出。
4. `_start_prepare_config`（**core-only 模式跳过整段**）：
   - `check`：把 `Proxy:` / `Rule:` 等老式大写键名 sed 成标准 `proxies:` / `rules:`。
   - 展开 YAML merge anchor（`<<:`，yq 4.53+ 会破坏，先 `explode(.)`）。
   - `yml_change`：用 `runtime/mixin.uc` 生成 mixin 片段，`yq` 深合并进 config.yaml（端口、allow-lan、external-controller、DNS 等运行参数注入）。
   - `dns_mihomo_apply_leak_protect`：若开 DNS 防泄漏，改写 DNS 段。
   - `smart_inject`：**仅 `core=1`（Smart）** 时把 `url-test/load-balance` 组改成 `type: smart` 并注入 `policy-priority / prefer-asn / uselightgbm / collectdata / sample-rate`、`profile.smart-collector-size`、顶层 `lgbm-*`。非 Smart 内核会反向清除这些字段。
   - `_prepare_geo_bootstrap_mode`：若配置需要 GeoIP/GeoSite 但本地数据缺失/损坏，**临时剥离** geo 规则先启动（bootstrap 模式），并记 `/var/run/clashoo_bootstrap_pending`。
   - `yml_dns_change`：按 `dnsforwader/dnscache/listen_port` 改 dnsmasq（先 `backup_dnsmasq_state` 存原状）。
   - 拷到工作目录 + `ip_rules`。
5. `_start_launch_core`：
   - **`mihomo -t` 预检**（15s 看门狗）。失败不碰防火墙/dnsmasq；**超时（退出码 124）多半是在下载 geo 数据**，会异步补 geo 并稍后重试。
   - `procd_open_instance` 拉起内核（`disable_quic_gso=1` 时注入 `QUIC_GO_DISABLE_GSO=1`；core-only 注入 `SAFE_PATHS=/`）。
   - 非 core-only：`fw4.sh apply` → 重启 dnsmasq → `restore` → `add_cron`。
   - 后台看门狗等内核出现：出现则跑健康检查 + 立即触发访问检查 + 完成 bootstrap geo 补全；**超时未出现则 `_rollback_failed_start` 回滚防火墙与 DNS**（否则会留下指向无人监听端口的劫持 DNS）。

### sing-box 路线
1. `start_singbox_service`：
   - `_sync_singbox_binary`：按 `dcore` 把 `/usr/bin/sing-box` 软链到 stable/alpha。
   - `prepare_singbox_runtime`：把所选 profile 拷为 `/etc/sing-box/config.json`，删旧 `cache.db`；非 core-only 用 `ucode normalize_singbox_config.uc` 改写端口/`routing_mark=6666`/DNS 端口/面板端口密码/tun 探测；core-only 只跑 `migrate_singbox.uc` 做版本迁移。写 `sing-box.main`（conffile/workdir/user）。
   - **`sing-box check` 预检**（15s 看门狗）。失败/超时不碰防火墙与 DNS。
   - `/etc/init.d/sing-box start`。
2. 非 core-only：`fw4.sh apply` → `singbox_dns_change` → `add_cron`。
3. `_wait_core_alive ... sing-box`：窗口内死掉就 `_rollback_failed_start`。
4. 健康检查（settle 异步复检）。

### 启动等待窗口
`_compute_start_wait`：TUN 模式 15s、其它 6s（TUN 要等 utun 建好 + fake-ip 池初始化）。慢设备可 `uci set clashoo.config.start_wait_secs=N` 覆盖。

### core-only（仅内核）模式
`core_only=1` 时 Clashoo **只保活内核进程**，原样运行用户导入的配置，**不接管防火墙/DNS/cron**，并放宽 `SAFE_PATHS=/`（信任用户自带配置里的绝对路径，如 OpenClash 的 external-ui）。详见 `references/仅内核.md`。

---

## 防火墙与 DNS 内部机制

### fw4 防火墙（`net/fw4.sh`）

只支持 **fw4 + nft**（无 iptables 后端）。通过 UCI `firewall.*` include 段挂三张表，`apply`/`remove` 成对操作：

| include 段 | 挂载位置 | 内容 |
|------------|----------|------|
| `clash_fw4_sets` | `table-pre` | 命名集合：本地网段、中国 IP（`clashoo_china/6`）、ACL 白/黑名单 |
| `clash_fw4_dstnat` | `dstnat` 链 | DNS 劫持（53→53）+ redirect 模式的代理重定向 |
| `clash_fw4_mangle` | `mangle_prerouting` 链 | TProxy 模式的 TCP/UDP 打标转发 |

另有本机出站表 `clashoo_local`（`ip` 族，**仅 redirect 模式**），让路由器自身流量也走代理。

**QUIC 阻断表 `clashoo_quic`**（`block_quic=1` 时建，`inet` 族，forward hook priority -10）：`ip daddr <fake-ip 段> udp dport 443 reject with icmpx type port-unreachable`。
- 必须 **reject 发 ICMP**，不能 drop：drop 与「机场黑洞掉 UDP 443」无法区分，客户端照样干等。mihomo 规则里的 `REJECT` 对 UDP 也是静默丢包，同样无效。
- 优先级要抢在 fw4 之前：mihomo 的 auto-redirect 会在 fw4 forward 链顶部 accept 所有 tun 流量。
- **只挂 forward，不能挂 output**：output 会打死内核自己连 Hysteria2/TUIC 节点的 UDP 443。
- 限定 fake-ip 目标 = 只拦走代理的 QUIC，国内直连 QUIC 不受影响（非 fake-ip 模式回退用 `clashoo_china` 集合排除）。

**两个关键 fwmark（不能混用）**：
- `PROXY_FWMARK = 0x162`：入站 TProxy 标记 → `ip rule fwmark 0x162 table 0x162` → `local 0.0.0.0/0 dev lo`。
- `CORE_ROUTING_MARK = 0x1a0a`（=6666）：内核出站 SO_MARK（= mihomo `routing-mark` / sing-box `routing_mark`）。
- 两者必须不同，否则内核出站被拉回 `lo` → 全网不可达。改其一须同步 `fw4.sh` 与 `normalize_singbox_config.uc`。

**透明代理模式如何落到规则**：
- `redirect`：DSTNAT 链 `redirect to :redir_port`（默认 7891）。
- `tproxy`（TCP/UDP）：mangle 链 `tproxy to :tproxy_port`（默认 7982）+ 打 `0x162` + `ip rule`/`ip route`。
- `tun`：内核自己接管，nft 不加代理规则（仅留 DNS 劫持）；无 tun 设备时自动回落 redirect/tproxy。

**绕行（bypass）**：本地网段、中国 IP（`bypass_china=1` 用内置 `geoip_cn.nft`）、ACL（`access_control` 1=白名单只代理 `proxy_lan_ips`、2=黑名单不代理 `reject_lan_ips`）、自定义端口（`bypass_port_mode`：all/common/custom）、DSCP、fwmark。**共存**：自动把 passwall(0x1)/passwall2(0xff)/nikki(tproxy/tun mark) 的标记并入 bypass，避免互相截流。

### DNS 接管

- **mihomo**：`yml_dns_change` 把 dnsmasq 上游改成 `127.0.0.1#listen_port`（默认 1053）+ `noresolv=1`，原状存于 `/tmp/clashoo/dnsmasq_*.before`。配置里 `listen: 0.0.0.0:53` 会被改成 `listen_port`，避免和 dnsmasq 抢 53。
- **sing-box**：`singbox_dns_change` 同理，但仅在 `dnsforwader=1` 时接管。
- **增强模式**：`enhanced_mode = fake-ip`（默认，配 `fake_ip_range 198.18.0.1/16` + `fake_ip_filter`）或 `redir-host`。
- **安全网**：`ensure_dns_when_core_stopped` —— 内核停了，若 dnsmasq 只剩指向本地 Clashoo DNS，会自动补公共 DNS（119.29.29.29 / 223.5.5.5），避免断网。
- **上游 DNS 注入**（`mixin.uc`，2026-07-14 起）：UCI 的 `dnsservers`（按 `ser_type` 分角色）/ `dns_policy` / `default_nameserver` 会注入 mihomo 的 `dns` 段。**在此之前 mihomo 完全没有 nameserver**，回落到内置国内 DNS（`doh.pub` / `tls://223.5.5.5:853`），境外域名解析成污染 IP。
  - 角色映射：`nameserver` = 境外 DoH（配 `respect-rules` 经代理查询）、`proxy-server-nameserver` = 国内（解析节点域名，必须直连可达）、`direct-nameserver` = 国内。**sing-box 的映射相反**：`dns_proxy` 取 `nameserver`（走代理），`dns_direct` 取 `direct-nameserver`。
  - `respect-rules` 需要 `proxy-server-nameserver` 存在，且不能与 `prefer-h3` 同用。
  - fake-ip 下不注入 `fallback`（mihomo 一配 fallback 就自动开 fallback-filter，境外 DNS 直连被墙会空等超时）。
  - **用户配置优先**：`init.d` 用 yq 探测用户 yaml 的 `dns` 段已有哪些字段，经 `CLASHOO_DNS_PRESENT` 传给 mixin，逐字段跳过。老用户的错误角色由 `_migrate_dns_roles` 一次性迁移（`dns_migrated` 标记）。
- **DNS 污染的典型症状**：TCP 正常、UDP/QUIC 全挂（连接表里 upload 一直涨、download 恒为 0），Google Play 下载卡死。因为 **TCP 出站把域名透传给节点解析，UDP 出站必须先在本地解析出 IP**。排查看连接的 destinationIP 是不是国内地址。
- **DNS 防泄漏**（`dns_leak_protect=1`）：阻止国内 DNS 解析国外域名、阻断 DoT/DoQ，并强制 `ipv6:false`。
- sing-box 的 fake-ip 反查表持久化在 `cache.db` 的 `store_fakeip`（模板已开）；**删了 cache.db 或没开 store_fakeip，重启后 HTTPS 会大面积失败**。

---

## 健康检查与运行状态

`概览` 状态行来自 `/tmp/clashoo/runtime_state`，由 `runtime_run_health_check` 三项探测填充：

| 探测项 | 方法 | 结果含义 |
|--------|------|----------|
| `dns` | `nslookup www.google.com 127.0.0.1` | 解析到 `198.18./fc00:` = `ok`（fake-ip 生效）；解析到真实 IP = `compat`；无解析 = `fail` |
| `explicit` | `curl --proxy 127.0.0.1:mixed_port` 打 generate_204 | 本地混合端口可出网 = `ok` |
| `transparent` | `curl` 直连 generate_204 | 测路由器自身 output 重定向链（**仅供参考，不作判定门槛**——PPPoE/GL.iNet 上不可靠，见 issue #25） |

**判定**：`explicit=ok` 且（非 fake-ip 或 `dns ∈ {ok,compat,na}`）→ `pass`；否则 `fail`。冷启动假失败会由 `settle` 复检（8 次 × 15s）自愈。

`health_detail` 字段是排障金矿，常见值：
- `preflight:config_dry_run_failed` / `preflight:singbox_dry_run_failed`：配置预检没过（看 core.log 真实报错）。
- `preflight:timeout` / `preflight:singbox_timeout`：预检超时，多半在下载 geo。
- `preflight:missing_fw4_stack`：缺 fw4/nft/ip。
- `preflight:core_validation_failed`：内核二进制不存在。
- `start:core_not_running` / `start:singbox_died_after_apply`：拉起后没保活，已回滚。
- `service_stopped` / `service_disabled` / `boot_disabled`：正常停止态，不接受健康更新。

**降级运行**：`degraded=1` + `degrade_reason=tun_unavailable_auto_fallback` —— 选了 TUN/Mixed 但无 tun 设备，已自动回落。

---

## 日志报错解码

三个日志，分工不同：

| 日志 | 路径 | 看什么 |
|------|------|--------|
| 插件日志 | `/usr/share/clashoo/clashoo.txt` | Clashoo 自己的中/英文步骤与错误（`log_msg` 写入） |
| 状态行 | `/usr/share/clashoo/clashoo_real.txt` | 单行当前状态 |
| 内核日志 | `/var/log/clashoo/core.log` | mihomo/sing-box 原生输出、预检真实报错 |

`net/log_format.awk` 负责美化：把 mihomo `time="...T..Z" level=.. msg=".."` 转成 `MM-DD HH:MM:SS [级别] 消息`，并把 UTC 时间 **+8 转北京时间**；`log_msg` 行也归一成同格式。

**常见报错 → 含义**：
- `配置预检失败，未应用防火墙与 DNS 改动` → 配置本身有错，去 core.log 看 `level=error/fatal` 那行（`_preflight_reason` 已提取到状态里）。
- `配置预检超时（可能正在下载 Geo 数据）` → GitHub 不可达时 mihomo 会卡 ~90s 下 geo；等自动重试或先在「系统」页更新 GeoIP。
- `Geo 数据缺失，已切换为引导模式` → bootstrap 模式正常现象，代理通了会自动补 geo 并重载。
- `找不到本地 sing-box 内核，请先安装` → sing-box 二进制没装，去「系统 → 内核下载」。
- `当前配置需要 mihomo 或 clash-meta 内核` → 配置用了 `rule-providers`/`script`，Smart/旧核不支持，已自动切到 mihomo。
- `clashoo core not detected within Ns, rolled back` → 内核拉起后没保活，防火墙/DNS 已回滚，去 core.log 看 panic/端口占用。
- `启动失败，正在回退防火墙与 DNS 配置` → `_rollback_failed_start` 触发。

---

## 双内核内幕与 sing-box 配置

### mihomo（YAML） vs sing-box（JSON）

| 维度 | mihomo / Smart | sing-box |
|------|----------------|----------|
| 配置格式 | YAML 订阅 | JSON |
| 运行配置 | `/etc/clashoo/config.yaml` | `/etc/sing-box/config.json` |
| 预检命令 | `mihomo -t` | `sing-box check` |
| 进程托管 | procd `clashoo` | procd `sing-box`（Clashoo 代管 enabled） |
| 运行参数注入 | `mixin.uc` 深合并 | `normalize_singbox_config.uc` 改写 |
| Smart 策略 | 仅 Smart 内核（`smart_inject`） | 不适用 |

### sing-box 配置从哪来（两种来源）

1. **YAML 转 JSON**（`lib/yaml2singbox.uc`）：把 mihomo/clash 的 `proxies` 转成 sing-box outbounds。
   - 支持协议：`ss / vmess / vless / trojan / hysteria2(hy2) / tuic`，其它跳过。
   - 自动组装 TLS（含 reality、utls 指纹）、transport（ws/grpc/http/httpupgrade）。
   - 套用模板 `lib/templates/default.json`，把模板里的占位符按**地区**展开：`__NODES__`（全部）、`__NODES_HK__/JP__/US__/SG__/OTHER__`（按节点名识别港/日/美/新及其它，某地区无节点则回退全部）。
   - 自动剔除**机场伪节点**（Traffic:/Expire:/官网/到期/客服/QQ群 等），避免它们在 selector/urltest 里以 0ms 胜出吞掉流量。
   - 支持 `proxy-providers`（http 类）：下载订阅再转。
2. **直接导入 JSON**：用户上传/订阅的 sing-box 原生 JSON，启动时 `migrate_singbox.uc` 做版本迁移（旧 schema → 当前核接受的格式，幂等）。

### normalize 改了什么（`normalize_singbox_config.uc`）

把导入的 JSON 适配到 Clashoo 运行环境：重写 inbounds 端口（redir 7891 / tproxy 7982 / mixed 7890 / dns 1053）、`routing_mark=6666`（必须等于 fw4 的 `CORE_ROUTING_MARK`）、clash_api 端口与密码、按是否有 tun 设备调整 tun inbound。模板默认 DNS 用 fakeip + `store_fakeip`，route 用一堆远程 `.srs` rule_set 分流（OpenAI/Claude/Gemini/YouTube/流媒体/中国直连等）。

> sing-box DNS schema 有坑（1.13+ 移除 `server.strategy`、`final` 不能指 fakeip 等），改模板/normalize 前务必用 `sing-box check` 校验。

---

## 更新与定时任务

`update/` 下各脚本**分组件独立更新**，便于定位失败：
- `core_download.sh` 内核、`panel_download.sh` 面板、`geoip.sh` GeoIP/GeoSite、`subscription_update.sh` 订阅、`component_update.sh` 插件本体、`lgbm_update.sh` Smart 模型、`template_merge.sh` 模板复写、`update_all.sh` 汇总。
- **镜像回退**：`core_mirror_prefix`（默认 `gh-proxy.com`）→ 直连 GitHub 兜底。
- **定时任务**（`add_cron`，写 `/etc/crontabs/root`）：清日志（`auto_clear_log`）、自动更新（`auto_update`→`update_all.sh`）、订阅自动更新（`auto_subscription_update`→每小时第 7 分跑 `subscription_update_cron.sh`）、Smart 模型自动更新（`smart_lgbm_auto_update`）。`refresh_cron` 在核心运行且非 core-only 时重建。

---

## 排障方法论（按症状）

1. **服务起不来** → 看状态行 `health_detail`。`preflight:*` 看 core.log 真实报错；`missing_fw4_stack` 装 `firewall4`/`nft`；`core_validation_failed` 装对应内核。
2. **起来了但不通** → 看健康检查三项。`explicit=fail` 是内核出站问题（节点/订阅/预检）；`dns=fail` 是 DNS 接管问题（dnsmasq 上游、enhanced_mode）；`transparent` 单独 fail 多数可忽略。
3. **Google/YouTube 慢/超时** → 经典 fake-ip + fallback DNS 坑：fallback 走被墙的 DOH 触发超时。检查 DNS 分流与 fallback 配置。
4. **重启后 HTTPS 大面积坏（尤其 sing-box）** → fake-ip 反查表没持久化，确认 `store_fakeip` 开着、`cache.db` 没被误删。
5. **TUN 选了却显示降级** → 设备无 `/dev/net/tun`，装 `kmod-tun` 或改用 Fake-IP。
6. **和别的代理插件冲突** → Clashoo 靠命名空间共存（独立 nft 表名、procd 服务名、fwmark bypass），但同时只应有一个接管透明代理。
7. **配置改了不生效** → mihomo 走 REST API 热重载（`reload_service`），sing-box 走 `restart`；确认改的是「当前选中」的配置文件。

---

## 参考资料

**用户向 how-to（`references/`，与项目 Wiki 同源）**：
- [快速开始](references/快速开始.md)、[概览页面](references/概览页面.md)、[配置文件](references/配置文件.md)、[代理模式](references/代理模式.md)、[仅内核](references/仅内核.md)、[DNS设置](references/DNS设置.md)、[内核说明](references/内核说明.md)、[系统维护](references/系统维护.md)、[日志说明](references/日志说明.md)、[名词解释](references/名词解释.md)、[故障排查](references/故障排查.md)

**外部**：
- mihomo Wiki：https://wiki.metacubex.one/config/
- sing-box 文档：https://sing-box.sagernet.org/configuration/
- meta-rules-dat（geo/规则集）：https://github.com/MetaCubeX/meta-rules-dat
- Clashoo 仓库与 Issues：https://github.com/kenzok8/openwrt-clashoo
