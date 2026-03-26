# luci-app-clash

> OpenWrt 上的 Clash / Clash.Meta / Mihomo 透明代理管理插件，同时兼容 **luci 18.06** 与 **luci 23.05+**。

[![license](https://img.shields.io/github/license/kenzok78/luci-app-clash)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/kenzok78/luci-app-clash?style=flat-square)](https://github.com/kenzok78/luci-app-clash/stargazers)

---

## 说明

本仓库基于 [frainzy1477/luci-app-clash](https://github.com/frainzy1477/luci-app-clash) 进行现代化重构与兼容性修复。

**修复 / 更新**

- `root/etc/init.d/clash`：原本硬编码 `/etc/clash/clash`，现自动检测 `mihomo` / `clash-meta` / `clash` 多种二进制路径
- `root/usr/share/rpcd/acl.d/luci-app-clash.json`：补全 ubus、uci、文件读写权限，解决 luci 23.05+ 下权限不足问题
- `luasrc/controller/clash.lua`：添加 `menu.d` 检测，防止与 23.05+ JSON 菜单注册发生双重菜单问题
- `Makefile`：补全新文件安装路径（`www/luci-static/resources`、`menu.d`、`rpcd/ucode`）

**新增（luci 23.05+）**

- `htdocs/.../tools/clash.js`：RPC 辅助模块，封装所有后端调用
- `htdocs/.../view/clash/app.js`：主视图，状态栏 + 应用配置，含自动轮询服务状态
- `htdocs/.../view/clash/log.js`：日志视图，深色终端风格，每 5 秒自动刷新
- `root/usr/share/luci/menu.d/luci-app-clash.json`：luci 23.05+ 菜单注册（`admin/services/clash`）
- `root/usr/share/rpcd/ucode/luci.clash`：rpcd ucode 后端，提供 version / status / reload / restart / list_profiles / read_log 接口

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

## 编译

```shell
# 添加源
echo "src-git clash https://github.com/kenzok78/luci-app-clash.git;test" >> feeds.conf.default
# 更新并安装源
./scripts/feeds update -a
./scripts/feeds install -a
# 编译
make package/luci-app-clash/compile
```

编译结果可以在 `bin/packages/your_architecture/base` 内找到。

## 依赖

- ca-bundle
- curl
- bash
- coreutils-base64
- ip-full
- kmod-inet-diag
- kmod-nft-socket
- kmod-nft-tproxy
- kmod-tun
- iptables-mod-tproxy
- ipset

## License

本项目基于 [GPL-3.0](LICENSE) 协议开源。  
原始代码来自 [frainzy1477/luci-app-clash](https://github.com/frainzy1477/luci-app-clash)，在此基础上进行了现代化改造。


