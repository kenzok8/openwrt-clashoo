# luci-app-clash

> OpenWrt 上的 Clash / Clash.Meta / Mihomo 透明代理管理插件，同时兼容 **luci 18.06** 与 **luci 23.05+**。

[![license](https://img.shields.io/github/license/kenzok78/luci-app-clash)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/kenzok78/luci-app-clash?style=flat-square)](https://github.com/kenzok78/luci-app-clash/stargazers)

---

## 说明

本仓库基于 [frainzy1477/luci-app-clash](https://github.com/frainzy1477/luci-app-clash) 进行现代化重构与兼容性修复，主要改动如下：

### ✅ 修复 / 更新

| 类型 | 说明 |
|------|------|
| 🔧 修复 | `root/etc/init.d/clash`：原本硬编码 `/etc/clash/clash`，现自动检测 `mihomo` / `clash-meta` / `clash` 多种二进制路径 |
| 🔧 修复 | `root/usr/share/rpcd/acl.d/luci-app-clash.json`：补全 ubus、uci、文件读写权限，解决 23.05+ 下权限不足问题 |
| 🔧 修复 | `luasrc/controller/clash.lua`：添加 `menu.d` 检测，防止与 23.05+ JSON 菜单注册发生双重菜单问题 |
| 🔧 修复 | `Makefile`：补全新文件安装路径（`www/luci-static/resources`、`menu.d`、`rpcd/ucode`） |

### ✨ 新增

| 文件 | 说明 |
|------|------|
| `htdocs/.../tools/clash.js` | RPC 辅助模块（`require tools.clash`），封装所有后端调用 |
| `htdocs/.../view/clash/app.js` | luci 23.05+ 主视图：状态栏 + 应用配置，含自动轮询服务状态 |
| `htdocs/.../view/clash/log.js` | luci 23.05+ 日志视图：深色终端风格，每 5 秒自动刷新 |
| `root/usr/share/luci/menu.d/luci-app-clash.json` | luci 23.05+ 菜单注册（`admin/services/clash`） |
| `root/usr/share/rpcd/ucode/luci.clash` | rpcd ucode 后端，提供 `version` / `status` / `reload` / `restart` / `list_profiles` / `read_log` 接口 |

---

## 兼容性

| 平台 | 支持方式 |
|------|----------|
| luci **18.06** | 原有 Lua CBI 多页面界面（全部保留） |
| luci **23.05+** | 新增 JS 单页视图（概览+配置 / 日志），自动优先加载 |

支持的内核二进制（按优先级自动检测）：

```
/usr/bin/mihomo  →  /usr/bin/clash-meta  →  /etc/clash/clashtun/clash  →  /etc/clash/dtun/clash  →  /etc/clash/clash
```

---

## 内核依赖

本插件**不包含**代理内核，需自行安装以下任一内核：

| 内核 | 安装路径 | 项目地址 |
|------|----------|----------|
| **mihomo**（原 Clash.Meta） | `/usr/bin/mihomo` | [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo) |
| **clash-meta** | `/usr/bin/clash-meta` | [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo) |
| **clash**（旧版） | `/etc/clash/clash` | [Dreamacro/clash](https://github.com/Dreamacro/clash)（已停更） |

---

## OpenWrt 软件包依赖

### 运行时必需

| 包名 | 用途 |
|------|------|
| `luci` | LuCI Web 界面框架 |
| `luci-base` | LuCI 基础库 |
| `rpcd` | OpenWrt RPC 守护进程（23.05+ 必需） |
| `rpcd-mod-file` | rpcd 文件读取模块（23.05+ 必需） |
| `rpcd-mod-rpcsys` | rpcd 系统调用模块 |
| `bash` | init.d 启动脚本所需 Shell |
| `coreutils` | 基础命令工具集 |
| `coreutils-nohup` | 后台运行支持 |
| `coreutils-base64` | Base64 编解码 |
| `curl` | 订阅下载 / GeoIP 更新 |
| `wget` | 备用下载工具 |
| `ca-certificates` | HTTPS 证书验证 |
| `jsonfilter` | JSON 解析（UCI 配置处理） |

### 透明代理（TProxy/Redir 模式）

| 包名 | 用途 |
|------|------|
| `iptables` | IPv4 流量劫持规则 |
| `iptables-mod-tproxy` | TProxy 透明代理模式支持 |
| `ipset` | IP 集合管理（白名单 / 绕过规则） |
| `kmod-tun` | TUN 虚拟网卡（TUN 模式必需） |
| `ip-full` 或 `ip` | 路由策略配置 |

### 可选增强

| 包名 | 用途 |
|------|------|
| `libustream-openssl` 或 `libustream-mbedtls` | HTTPS 下载支持 |
| `lsof` | 端口占用检测 |
| `procps-ng-pgrep` | 进程状态检查（若系统无内置 `pgrep`） |

---

## 安装方法

### 方式一：opkg 直接安装

```bash
opkg update
opkg install luci-app-clash
```

### 方式二：手动上传 ipk

```bash
# 将 ipk 上传到路由器后执行
opkg install /tmp/luci-app-clash_*.ipk --force-depends
```

### 卸载

```bash
opkg remove luci-app-clash
```

---

## 从源码编译

```bash
# 1. 下载 OpenWrt SDK
# 参考：https://openwrt.org/docs/guide-developer/toolchain/using_the_sdk

# 2. 克隆本仓库到 package 目录
git clone https://github.com/kenzok78/luci-app-clash.git package/luci-app-clash

# 3. 更新 feeds
./scripts/feeds update -a
./scripts/feeds install -a

# 4. 编译 i18n 语言文件
pushd package/luci-app-clash/tools/po2lmo
make && sudo make install
popd
po2lmo ./package/luci-app-clash/po/zh-cn/clash.po \
       ./package/luci-app-clash/po/zh-cn/clash.zh-cn.lmo

# 5. 选择包并编译
make menuconfig   # 在 LuCI → Applications 中勾选 luci-app-clash
make package/luci-app-clash/compile V=s
```

---

## License

本项目基于 [GPL-3.0](LICENSE) 协议开源。  
原始代码来自 [frainzy1477/luci-app-clash](https://github.com/frainzy1477/luci-app-clash)，在此基础上进行了现代化改造。


