> 我维护 luci-app-clashoo，不是为了证明代码有多优秀，
> 而是想把经典重新带回来。
>
> 在代理软件越来越复杂的今天，
> 我更希望它依旧是一款 简单易用、稳定可靠、开箱即用 的插件。
>
> 把复杂留给自己，把简单留给用户。

<p align="center">
    <img src="luci-app-clashoo/htdocs/luci-static/clashoo/logo.png" width="138" />
</p>
<h1 align="center">Clashoo</h1>
<p align="center"><strong>面向 OpenWrt 的双内核代理管理插件：mihomo + sing-box</strong></p>
<div align="center">
    <a href="https://github.com/kenzok8/openwrt-clashoo/releases" target="_blank">
    <img alt="GitHub release" src="https://img.shields.io/github/v/release/kenzok8/openwrt-clashoo?style=flat-square"></a>
    <a href="https://github.com/kenzok8/openwrt-clashoo/releases" target="_blank">
    <img alt="GitHub downloads" src="https://img.shields.io/github/downloads/kenzok8/openwrt-clashoo/total.svg?style=flat-square"></a>
    <a href="https://github.com/kenzok8/openwrt-clashoo/commits" target="_blank">
    <img alt="GitHub commit" src="https://img.shields.io/github/commit-activity/m/kenzok8/openwrt-clashoo?style=flat-square"></a>
    <a href="https://github.com/kenzok8/openwrt-clashoo/issues?q=is%3Aissue+is%3Aclosed" target="_blank">
    <img alt="GitHub closed issues" src="https://img.shields.io/github/issues-closed/kenzok8/openwrt-clashoo.svg?style=flat-square"></a>
</div>

---

## 功能特性

**双内核，一个界面**
- **mihomo（Clash Meta）** — 稳定版 / Alpha 版 / **Smart 版**（[vernesong fork](https://github.com/vernesong/mihomo)，支持 `type: smart` 策略组）三选一，走 YAML 订阅
- **sing-box** — 稳定版 / Alpha 版可切，走 JSON 配置文件
- 内核切换无需重装，同一套 UCI 配置自动适配两端

**概览面板**
- 运行状态 / 健康检查（`pass` / `fail` / 降级运行）一栏可见
- 内核切换（Mihomo / Smart / Sing-box 三向切换，当前选中高亮）
- 透明代理分解（TCP / UDP / 网络栈）
- 访问检查：内外站延迟分档显示（<400ms 绿 / <800ms 黄 / >800ms 红 / 超时红色单格）
- 实时流量监控（上行 / 下行 / 活跃连接数）
- 代理模式、运行模式、配置文件、管理面板一排下拉直达

**DNS 策略（全面重构）**
- 增强模式：Fake-IP ↔ Redir-Host 切换，不丢失字段
- ECS 客户端子网（mihomo `ecs` / sing-box `client_subnet` 自动写入）
- 上游 DNS 角色划分：默认 / 国内 / 代理 / 直连 / Fallback
- 分流解析策略（按 `geosite`、`geoip`、域名规则下发到不同上游）
- Fallback GeoIP 过滤与 IP-CIDR 过滤可配
- Bootstrap DNS（用于解析 DoH / DoT / DoQ 服务器域名）

**透明代理**
- Fake-IP / TUN / Mixed 三种运行模式，切换后前端稳定不回退
- TCP `redirect` + UDP `tproxy`（Fake-IP）/ TUN（TUN、Mixed）自动匹配
- `gVisor` / `system` / `mixed` 网络栈按模式自动选择

**管理面板**
- 内置 MetaCubeXD / YACD / Zashboard / Razord 四选一
- 一键更新面板（GitHub pages 直拉），更新日志实时落盘到「系统 → 日志 → 更新日志」

**系统与数据**
- 内核下载支持 GitHub / GHProxy 镜像源，按架构建议版本
- GeoIP / GeoSite 定时自动更新（间隔可配）
- 访问密钥（Dashboard）随机生成 / 掩码显示

---

## 界面预览（暗黑模式）

**概览 · mihomo 运行中**
![overview-mihomo](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/clashoo-overview-mihomo.png)

**概览 · sing-box 运行中**
![overview-singbox](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/clashoo-overview-singbox.png)

**DNS 配置**
![config-dns](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/clashoo-config-dns.png)

**sing-box 配置文件列表**
![config-singbox](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/clashoo-config-singbox.png)

**系统 · 内核与数据**
![system-kernel](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/clashoo-system-kernel.png)

**系统 · 更新日志**
![system-update-log](https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/clashoo-system-update-log.png)

---

## 仓库结构

```
clashoo/                         # 运行时包（/etc/config, /usr/share/clashoo/*）
├── files/etc/config/clashoo     # UCI 默认模板（DNS 策略、ECS、Fallback 等）
├── files/etc/init.d/clashoo     # 服务启停
└── files/usr/share/clashoo/
    ├── lib/
    │   ├── normalize_singbox_config.uc   # sing-box JSON 规则化（525 行 ucode）
    │   └── templates/default.json        # sing-box 默认模板
    ├── runtime/
    │   ├── yum_change.sh                 # mihomo YAML 生成
    │   ├── dns_helpers.sh                # POSIX sh DNS 工具函数
    │   └── ...
    └── update/                           # 内核 / 面板 / GeoIP 更新脚本

luci-app-clashoo/                # LuCI 前端插件
├── htdocs/luci-static/
│   ├── resources/view/clashoo/  # overview / config / system 三大页
│   ├── resources/tools/clashoo.js  # 统一 RPC + toast
│   └── clashoo/logo.png
├── po/                          # i18n
└── root/usr/share/rpcd/ucode/
    └── luci.clashoo             # 后端 RPC（status / set_mode / update_panel 等）

scripts/                         # 安装 / 卸载 / 单元测试
```

---

## 依赖

| 包名 | 说明 |
|------|------|
| `clashoo` | 运行时包，内置 mihomo 二进制并软链 `clash-meta` |
| `luci-app-clashoo` | LuCI 管理界面（主包） |
| `luci-i18n-clashoo-zh-cn` | 简体中文翻译（可选） |
| `luci` | OpenWrt Web 界面框架 |
| `ucode` | sing-box JSON 规则化运行时（OpenWrt 24.10+ 默认已含） |
| `curl` | 下载 GeoIP / 面板 / 订阅 |

sing-box 二进制由用户按需独立安装（或通过「系统 → 内核下载」一键拉取）。

---

## 系统要求

- OpenWrt **24.10+**（推荐 `24.10` / `25.x`）
- 不再维护旧版 LuCI / OpenWrt（如 `18.06`、`21.02`、`23.05`）

---

## 安装方式

### A. 一键安装（推荐）

安装脚本优先抓最新 `Pre-release`，没有时回退到最新 `Release`：

```bash
wget -O - https://github.com/kenzok8/openwrt-clashoo/raw/refs/heads/main/scripts/install.sh | ash
```

### B. 从 Release 手动安装

```bash
# opkg
opkg install clashoo_*.ipk
opkg install luci-app-clashoo_*.ipk
opkg install luci-i18n-clashoo-zh-cn_*.ipk

# apk
apk add --allow-untrusted clashoo_*.apk
apk add --allow-untrusted luci-app-clashoo_*.apk
apk add --allow-untrusted luci-i18n-clashoo-zh-cn_*.apk
```

### C. 从源码编译

```bash
git clone https://github.com/kenzok8/openwrt-clashoo.git package/openwrt-clashoo
make package/clashoo/compile V=s
make package/luci-app-clashoo/compile V=s
```

### 卸载并重置

```bash
wget -O - https://github.com/kenzok8/openwrt-clashoo/raw/refs/heads/main/scripts/uninstall.sh | ash
```

---

## 使用速览

1. **安装** → 浏览器访问 LuCI，进入「服务 → Clashoo」
2. **上传订阅 / 配置**
   - mihomo：`配置 → 订阅` 或直接上传 YAML
   - sing-box：`配置 → 配置文件` 上传 JSON
3. **选择内核** → 概览右上「内核切换」Mihomo / Smart / Sing-box（Smart 需先在「配置 → 代理 → Smart 策略设置」中启用策略）
4. **启动服务** → 概览「启用服务」开关
5. **选运行模式** → Fake-IP（默认）/ TUN / Mixed
6. **看日志** → 系统 → 日志（运行日志 / 更新日志 / GeoIP 日志）

---

## 开发与测试

```bash
# POSIX sh DNS 工具函数单元测试（本机即可跑）
./scripts/test_dns_helpers.sh

# sing-box JSON 规则化集成测试（需 ucode）
./scripts/test_singbox_dns_normalize.sh

# init.d 启动守卫静态检查
./scripts/test_initd_clash.sh

# YAML → sing-box JSON 转换测试（需 ucode / yq / jq）
./scripts/test_yaml2singbox.sh
```

---

## 致谢

- [mihomo](https://github.com/MetaCubeX/mihomo) — Clash Meta 内核
- [mihomo (vernesong fork)](https://github.com/vernesong/mihomo) — Smart 策略组支持
- [sing-box](https://github.com/SagerNet/sing-box) — 通用代理平台
- [fchomo](https://github.com/fcshark-org/openwrt-fchomo) — 参考实现
- [nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) — 参考实现

  
## 许可证

本项目遵循仓库内现有开源许可证（见 `LICENSE`），并保留上游项目的版权与许可声明。
