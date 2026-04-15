# Clashoo UI 重设计规格文档

**日期**：2026-04-13  
**状态**：待实施  
**作者**：吴白 × Claude

---

## 背景与动机

现有 `luci-app-clashoo` UI 存在以下问题：
- 6 个独立页面，导航分散，选项繁杂
- 混用 LuCI Form API 与自定义 JS，风格不统一
- 传统表单布局，移动端体验差
- 缺乏视觉层次，信息密度过高

参考 `luci-app-openclaw` 的卡片式单文件实现（CSS Grid、零外部框架、响应式），进行完全重写。

**目标**：3 页结构、卡片布局、PC 与移动端不变形、代码统一风格。

---

## 架构决策

- **实施策略**：完全重写前端（3 个 view JS 文件），后端 RPC（`luci.clash` ucode）完全不改动
- **UI 框架**：零外部依赖，纯 LuCI View API + 自定义嵌入式 CSS
- **响应式**：CSS Grid，PC 3列 / 平板 2列 / 手机 1列
- **参考实现**：`luci-app-openclaw/htdocs/luci-static/resources/view/openclaw.js`

---

## 页面结构

### 原有（6 页）→ 新结构（3 页）

| 原页面 | 归并到 |
|--------|--------|
| `overview.js` | 新 `overview.js`（重写） |
| `app.js` 代理配置 | 新 `config.js` → Tab：代理 |
| `config.js` 订阅管理 | 新 `config.js` → Tab：订阅 |
| `dns.js` DNS 设置 | 新 `config.js` → Tab：DNS |
| `system.js` 系统设置 | 新 `system.js`（重写） |
| `log.js` 日志 | 新 `system.js` → Tab：日志 |

菜单注册（`menu.d/luci-app-clashoo.json`）相应精简为 3 个子菜单项。

---

## 页面详细设计

### 1. 概览页（`overview.js`）

**布局结构：**
```
[ 6 张状态卡片 - CSS Grid 3列/2列/1列 ]
[ 操作按钮行：启动 | 停止 | 重启 | 更新订阅 ]
[ 控制行：代理模式下拉 | 透明代理类型下拉 | 配置文件下拉 | 面板下拉 + 打开按钮 ]
[ 实时日志区（折叠，默认收起）]
```

**6 张卡片内容：**

| 卡片 | 显示内容 | 数据来源 |
|------|----------|----------|
| 运行状态 | 运行中/已停止（彩色徽章） | `clash.status()` |
| 代理模式 | rule/global/direct | `clash.status().mode_value` |
| 当前配置 | 配置文件名 | `clash.status().config` |
| 连通测试 | 微信✓ YouTube✓ 等 | `clash.accessCheck()` |
| 面板入口 | 面板类型 + 打开按钮 | `clash.status().dash_port` |
| 实时日志 | 最新一行日志摘要 | `clash.readRealLog()` |

**交互：**
- 轮询间隔：状态 8s，日志 10s
- 操作按钮带加载状态，防止重复点击
- 深色模式自动适配

---

### 2. 配置页（`config.js`，合并原 app + config + dns）

**Tab 结构：**

#### Tab A：订阅
- 订阅链接输入 + 下载按钮
- 已下载订阅列表（名称、操作：更新/删除/切换）
- 文件上传（YAML）
- 模板复写（选订阅 + 选模板 → 生成合并文件）
- 精简：面板配置移至系统页

#### Tab B：代理
- 透明代理模式（TCP/UDP）、网络栈
- 端口配置（HTTP/SOCKS5/混合/Redirect/TPROXY）
- Smart 设置（折叠，默认收起）
- 删除：启动延迟、日志级别（移至系统页或删除）

#### Tab C：DNS
- 基础 DNS：监听端口、增强模式、Fake-IP 网段
- 上游 DNS 服务器列表
- DNS 劫持规则列表
- 代理认证（用户名/密码）移至代理 Tab 底部

**保存方式：** 每个 Tab 独立保存按钮，调用 UCI set/apply。

---

### 3. 系统页（`system.js`，合并原 system + log）

**Tab 结构：**

#### Tab A：内核与数据
- 内核下载（版本类型、架构、镜像源）
- GeoIP/GeoSite 更新（自动更新开关、周期、数据源）
- 面板配置（端口、UI 类型、密钥、TLS）

#### Tab B：规则与控制
- 大陆 IP 绕过开关 + 自定义端口
- 局域网白/黑名单
- 自动化任务（定时更新订阅、定时清理日志）

#### Tab C：日志
- 运行日志 / 更新日志 / GeoIP 日志（子 Tab 切换）
- 清空、滚动到底部按钮
- 替代原 `log.js` 页面

---

## CSS 设计规范

参考 openclaw，完全内联嵌入至各 JS 文件顶部：

```css
/* 卡片网格 */
.cl-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:16px }
@media(max-width:768px) { .cl-cards { grid-template-columns:repeat(2,1fr) } }
@media(max-width:420px) { .cl-cards { grid-template-columns:1fr } }

/* 卡片 */
.cl-card { border:1px solid rgba(128,128,128,.2); border-radius:10px; padding:14px 16px }
.cl-card .lbl { font-size:11px; opacity:.55 }
.cl-card .val { font-size:20px; font-weight:700; margin-top:4px }

/* 徽章 */
.cl-badge { display:inline-block; padding:3px 14px; border-radius:20px; font-size:12px; font-weight:600 }
.cl-badge-run  { background:#e8f5e9; color:#2e7d32 }
.cl-badge-stop { background:#ffebee; color:#c62828 }

/* Tab */
.cl-tabs { display:flex; border-bottom:1px solid rgba(128,128,128,.2); margin-bottom:16px }
.cl-tab  { padding:10px 18px; cursor:pointer; font-size:13px; opacity:.6 }
.cl-tab.active { opacity:1; border-bottom:2px solid currentColor; font-weight:600 }
```

---

## 文件改动清单

| 文件 | 操作 |
|------|------|
| `htdocs/.../view/clash/overview.js` | 完全重写 |
| `htdocs/.../view/clash/config.js` | 完全重写（合并 app.js + dns.js） |
| `htdocs/.../view/clash/system.js` | 完全重写（合并 log.js） |
| `htdocs/.../view/clash/app.js` | 删除 |
| `htdocs/.../view/clash/dns.js` | 删除 |
| `htdocs/.../view/clash/log.js` | 删除 |
| `root/usr/share/luci/menu.d/luci-app-clashoo.json` | 精简为 3 个子菜单项 |
| `htdocs/.../tools/clash.js` | 不改动 |
| `root/usr/share/rpcd/ucode/luci.clash` | 不改动 |

---

## 验证方式

1. 在 OpenWrt 测试机上安装包，确认 3 个页面均可正常访问
2. 概览页：服务启停、模式切换、配置切换功能正常
3. 配置页：订阅下载、代理端口保存、DNS 配置保存均正常
4. 系统页：内核下载、日志查看正常
5. 手机浏览器访问，确认卡片响应式布局不变形
6. 深色模式下视觉正常
