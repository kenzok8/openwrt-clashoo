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
    <a href="https://github.com/kenzok8/openwrt-clashoo/wiki" target="_blank">
    <img alt="Wiki" src="https://img.shields.io/badge/docs-Wiki-1f6feb?style=flat-square"></a>
</div>

---

## 界面预览

<details open>
<summary><b>Desktop Screenshots</b></summary>
<br>
<table>
<tr>
<td align="center"><b>Mihomo</b><br><img width="400" src="https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/clashoo/clashoo-mihomo.png"></td>
<td align="center"><b>Smart</b><br><img width="400" src="https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/clashoo/clashoo-smart.png"></td>
</tr>
<tr>
<td align="center"><b>Sing-box</b><br><img width="400" src="https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/clashoo/clashoo-singbox.png"></td>
<td align="center"><b>System</b><br><img width="400" src="https://raw.githubusercontent.com/kenzok8/kenzok8/main/screenshot/clashoo/clashoo%23system.png"></td>
</tr>
</table>
</details>

---

## 功能特性

**双内核，一个界面**
- **mihomo（Clash Meta）** — 稳定版 / Alpha 版 / Smart 版三选一，走 YAML 订阅
- **sing-box** — 稳定版 / Alpha 版可切，走 JSON 配置文件
- 内核切换无需重装，同一套 UCI 配置自动适配两端

**概览面板**
- 运行状态与健康检查（DNS / 显式代理 / 透明代理三项检测）实时可见
- 秒级响应启停开关，点击即反馈
- 内核切换（Mihomo / Smart / Sing-box）当前选中高亮
- 透明代理分解（TCP / UDP / 网络栈）
- 访问检查：内外站延迟分档（<400ms 绿 / <800ms 黄 / >800ms 红）
- 实时流量监控（上行 / 下行 / 活跃连接数）

**配置管理**
- 订阅一键拉取并自动生成配置
- 配置上传、在线编辑、自定义文件输出
- 模板复写：上传 YAML 模板 + 输入订阅链接 → 自动注入 URL 并验校
- 生成后自动 `mihomo -t` 干跑校验，坏配置不写入

**DNS 策略**
- 增强模式：Fake-IP / Redir-Host 自由切换
- 上游 DNS 按角色分流：默认 / 代理 / 直连 / Fallback
- Bootstrap DNS、Fallback GeoIP 过滤、ECS 客户端子网
- DNS 防泄漏：阻止国内 DNS 解析国外域名、阻断 DoT/DoQ

**透明代理**
- Fake-IP / TUN / Mixed 三种模式
- TCP Redirect + UDP TProxy 自动匹配
- gVisor / System / Mixed 网络栈可选

**系统与数据**
- 组件更新：内核 / 内核数据 / 插件本体按组件单独检查更新，便于定位失败
- 备份与还原：配置一键导出 / 导入，支持还原出厂默认设置，折腾不怕坏
- 内核、管理面板、GeoIP / GeoSite 一键下载/更新
- 镜像源自动回退（自定义 → gh-proxy → 直连 GitHub 兜底）
- 面板四选一 MetaCubeXD / YACD / Zashboard / Razord

---

## 依赖

| 包名 | 说明 |
|------|------|
| `ca-bundle` | CA 证书包 |
| `curl` | 下载 GeoIP / 面板 / 订阅 |
| `yq` | YAML 处理工具 |
| `firewall4` | nftables 防火墙 |
| `ip-full` | 完整 iproute2 |
| `kmod-inet-diag` | 网络诊断内核模块 |
| `kmod-nft-socket` | nftables socket 匹配 |
| `kmod-nft-tproxy` | nftables TPROXY 支持 |
| `kmod-tun` | TUN 设备支持 |
| `kmod-dummy` | dummy 网卡模块 |

sing-box 二进制由用户按需安装，或通过「系统 → 内核下载」一键拉取。

---

## 系统要求

- OpenWrt **24.10+**（推荐 25.x）

---

## 安装

### 一键安装

```bash
wget -O - https://raw.githubusercontent.com/kenzok8/openwrt-clashoo/refs/heads/main/scripts/install.sh | ash
```

大陆网络访问 GitHub 受限，可用镜像加速：

```bash
wget --no-check-certificate -O - https://ghfast.top/https://raw.githubusercontent.com/kenzok8/openwrt-clashoo/refs/heads/main/scripts/install.sh | ash
```

### 软件源安装

在 OpenWrt 路由器上执行以下命令：

```bash
wget -qO- https://down.dllkids.xyz/openwrt-feed/openwrt-feed-setup.sh | sh
```

脚本自动完成：

- ✅ 检测 SDK 版本（24.10 / 25.12）与处理器架构
- ✅ 检测该架构 feed 是否存在（覆盖 `Packages.gz` / `APKINDEX.tar.gz` / `packages.adb` 三类索引），缺则回退 `all`
- ✅ 下载对应公钥，opkg → `opkg-key add`；apk → 放入 `/etc/apk/keys/`
- ✅ 写入/更新源配置（`customfeeds.conf` 或 `/etc/apk/repositories`），不会重复堆积
- ✅ 执行 `opkg update` / `apk update`，签名校验失败时自动回退 `--allow-untrusted`
- ✅ `apk update && apk add clashoo luci-app-clashoo`

### 源码编译

```bash
git clone https://github.com/kenzok8/openwrt-clashoo.git package/openwrt-clashoo
make package/clashoo/compile V=s
make package/luci-app-clashoo/compile V=s
```

### 卸载

```bash
wget -O - https://raw.githubusercontent.com/kenzok8/openwrt-clashoo/refs/heads/main/scripts/uninstall.sh | ash
```

大陆网络访问 GitHub 受限，可用镜像加速：

```bash
wget --no-check-certificate -O - https://ghfast.top/https://raw.githubusercontent.com/kenzok8/openwrt-clashoo/refs/heads/main/scripts/uninstall.sh | ash
```

---

## 使用

1. 安装后进入 LuCI「服务 → Clashoo」
2. 上传订阅或导入配置文件
3. 选择内核（Mihomo / Smart / Sing-box）
4. 点击启用服务
5. 选运行模式（Fake-IP / TUN / Mixed）

更多用法、配置说明与常见问题见 **[项目 Wiki](https://github.com/kenzok8/openwrt-clashoo/wiki)**。

---

## AI 助手指南（Skill）

仓库自带一个通用 AI 技能 `clashoo-user-guide`，把 Clashoo 的功能说明、双内核内幕与排障经验喂给 AI 助手，让它能准确回答「某功能怎么开」「为什么不通」「日志报错什么意思」。

通用安装（Claude Code / Codex / Gemini 等都支持，需要 Node.js）：

```bash
# 装到当前 agent
npx skills add kenzok8/openwrt-clashoo

# 装到所有已安装的 agent
npx skills add kenzok8/openwrt-clashoo -a '*'
```

技能源码在 [`skills/clashoo-user-guide/`](skills/clashoo-user-guide/)；其中 `references/` 与本仓库 Wiki 同源，由 CI 自动同步。

---

## 开发

```bash
./scripts/test_dns_helpers.sh          # DNS 单元测试
./scripts/test_singbox_dns_normalize.sh # sing-box 规则化测试
./scripts/test_initd_clash.sh           # init.d 守卫检查
./scripts/test_yaml2singbox.sh          # YAML → JSON 转换测试
./tests/test_subscription_update.sh     # 订阅更新与定时任务测试
```

---

## 致谢

- [mihomo](https://github.com/MetaCubeX/mihomo) — Clash Meta 内核
- [vernesong/mihomo](https://github.com/vernesong/mihomo) — Smart 策略组支持
- [sing-box](https://github.com/SagerNet/sing-box) — 通用代理平台
- [nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) — 架构参考

---

## 许可证

本项目遵循仓库内开源许可证（见 `LICENSE`），并保留上游项目的版权与许可声明。
