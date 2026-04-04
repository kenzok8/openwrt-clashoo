> 我维护 luci-app-clash，不是为了证明代码有多优秀，
> 而是想把经典重新带回来。
>
> 在代理软件越来越复杂的今天，
> 我更希望它依旧是一款 简单易用、稳定可靠、开箱即用 的插件。
>
> 把复杂留给自己，把简单留给用户。

<p align="center">
    <img src="logo.png" width="138" />
</p>
<h1 align="center">Clashoo</h1>
<p align="center"><strong>基于 mihomo 内核的 OpenWrt LuCI 代理管理界面</strong></p>
<div align="center">
    <a href="https://github.com/kenzok8/luci-app-clashoo/releases" target="_blank">
    <img alt="GitHub release" src="https://img.shields.io/github/v/release/kenzok8/luci-app-clashoo?style=flat-square"></a>
    <a href="https://github.com/kenzok8/luci-app-clashoo/releases" target="_blank">
    <img alt="GitHub downloads" src="https://img.shields.io/github/downloads/kenzok8/luci-app-clashoo/total.svg?style=flat-square"></a>
    <a href="https://github.com/kenzok8/luci-app-clashoo/commits" target="_blank">
    <img alt="GitHub commit" src="https://img.shields.io/github/commit-activity/m/kenzok8/luci-app-clashoo?style=flat-square"></a>
    <a href="https://github.com/kenzok8/luci-app-clashoo/issues?q=is%3Aissue+is%3Aclosed" target="_blank">
    <img alt="GitHub closed issues" src="https://img.shields.io/github/issues-closed/kenzok8/luci-app-clashoo.svg?style=flat-square"></a>
</div>

## 功能特性

- **概览面板** — 一键启停、实时状态滚动、连接测试（Bilibili / 微信 / YouTube / GitHub）
- **代理配置** — 多配置文件管理、运行模式切换（Fake-IP / TUN / 混合）
- **DNS 设置** — 自定义上游 DNS、Fake-IP 过滤、DNS 劫持规则
- **配置管理** — YAML 配置在线编辑与上传
- **系统设置** — GeoIP 更新、大陆白名单、日志查看

## 依赖

| 包名 | 说明 |
|------|------|
| `clashoo` | 内置 mihomo 核心包（架构相关） |
| `clashoo-runtime` | Clashoo 启动脚本与运行时 |
| `luci-app-clashoo` | LuCI 管理界面 |
| `luci` | OpenWrt Web 界面框架 |
| `curl` | 下载 GeoIP / 面板 / 订阅 |

## 系统要求

- 仅支持新版本 OpenWrt，最低 `24.10+`（推荐 `24.10/25.x`）
- 不再维护旧版 LuCI / OpenWrt（如 `18.06`、`21.02`、`23.05`）

## 安装

```bash
# 从源码编译
git clone https://github.com/kenzok8/luci-app-clashoo.git package/luci-app-clashoo
make package/luci-app-clashoo/compile V=s

# 或直接安装 ipk
opkg install clashoo_*.ipk clashoo-runtime_*.ipk luci-app-clashoo_*.ipk
```

## 截图

概览页面包含：
- 🐱 Clashoo 品牌标识 + 启停状态动画
- 📊 连接测试（国内/国外延迟检测）
- ⚙️ 快捷配置（运行模式、代理模式、面板控制）

## 致谢

- [mihomo](https://github.com/MetaCubeX/mihomo) — Clash Meta 内核
- [luci-app-clash](https://github.com/kenzok78/luci-app-clash) — 原始项目
- [nikki](https://github.com/nikki-enrich/openwrt-nikki) — 参考实现

## 许可证

GPL-3.0
