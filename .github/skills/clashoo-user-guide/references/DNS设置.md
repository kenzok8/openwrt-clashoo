# DNS 设置

Clashoo 的 DNS 设置分两层：一层是代理核心自己怎么解析域名，另一层是路由器防火墙是否拦截局域网设备的 DNS 请求。

这两个设置经常被混淆，尤其是 IPv6 相关选项。

## 三类 DNS 设置分别是什么

Clashoo 的 DNS 页面可以先按三块理解：基础 DNS、上游 DNS、分流 DNS。

| 区域 | 它管什么 | 你可以怎么理解 |
|---|---|---|
| 基础 DNS | 内核 DNS 功能本身怎么工作 | 先决定“Clashoo 要不要接管 DNS、监听哪个端口、用 Fake-IP 还是 Redir-Host、要不要解析 IPv6、Fake-IP 网段是什么” |
| 上游 DNS | Clashoo 解析域名时去问谁 | 决定“国内域名问阿里/腾讯，国外域名问 Cloudflare/Google，节点域名问哪个 DNS” |
| 分流 DNS | 什么域名该走哪个上游 DNS | 决定“国内域名走国内 DNS，非国内域名走国外 DNS” |

一句话：

```text
基础 DNS 决定 DNS 系统怎么开；
上游 DNS 决定可以问哪些 DNS；
分流 DNS 决定不同域名分别问哪个 DNS。
```

## 基础 DNS 是什么

基础 DNS 是 Clashoo 内核 DNS 的总开关和基础行为。

它主要决定：

- DNS 模块是否启用
- DNS 监听端口
- 使用 Fake-IP 还是 Redir-Host
- Fake-IP 使用哪个虚拟网段
- 是否解析 IPv6 地址
- 是否强制接管客户端 DNS
- 是否写入 ECS 客户端子网

如果基础 DNS 配错，后面的上游 DNS 和分流 DNS 即使写对，也可能不会正常工作。

## 上游 DNS 是什么

上游 DNS 是 Clashoo 真正拿去查询域名的 DNS 服务器。

Clashoo 默认把上游 DNS 分角色：

- 国内上游 DNS：用于解析国内域名
- 国外加密 DNS：用于解析国外域名，降低 DNS 污染
- 节点域名解析专用：用于解析代理节点服务器域名
- 直连域名解析：用于明确直连的域名
- Bootstrap DNS：用于解析 DoH / DoT / DoQ 服务器本身

上游 DNS 不是越多越好。太多反而更难排查。默认值已经覆盖普通使用场景。

## 分流 DNS 是什么

分流 DNS 是“域名匹配规则”和“上游 DNS”的对应关系。

例如默认策略：

```text
rule-set:cn_domain      -> 国内 DNS
geosite:geolocation-!cn -> 国外加密 DNS
```

也就是说：

- 国内域名用国内 DNS，尽量拿到国内 CDN IP
- 非中国域名用国外 DNS，降低污染概率

分流 DNS 不负责代理流量本身，它只决定域名解析时问哪个 DNS。真正决定流量直连还是代理的是代理规则和策略组。

## 默认 DNS 配置逐项说明

Clashoo 默认 DNS 以“Fake-IP + 国内 DNS 直连 + 国外 DNS 防污染”为目标。下面是默认配置中每一项的含义。

| 设置项 | 默认值 | 作用 | 建议 |
|---|---|---|---|
| 启用 DNS 模块 | `1` | 让 Clashoo 内核接管 DNS 解析。关闭后，Fake-IP 和分流 DNS 能力会失效，Clashoo 会把 dnsmasq 还原回系统 DNS。 | 保持开启 |
| DNS 监听端口 | `1053` | Clashoo 内核监听 DNS 的端口，dnsmasq / 防火墙会把 DNS 请求转到这里。 | 不冲突就不要改 |
| 增强模式 | `fake-ip` | 使用 Fake-IP 机制，把需要代理的域名映射到虚拟 IP，再由内核还原域名转发。 | 推荐默认 |
| Fake-IP 网段 | `198.18.0.1/16` | Fake-IP 使用的 IPv4 虚拟地址池。`198.18.0.0/15` 常用于测试网络，不会和公网冲突。 | 保持默认 |
| IPv6 DNS | `false` | 控制内核解析域名时是否查询 AAAA 记录。关闭后更偏向 IPv4。 | IPv6 不稳定时关闭 |
| 强制转发 DNS | `1` | 配合 dnsmasq / 防火墙，把客户端 DNS 请求转给 Clashoo。只有启用 DNS 模块时才有意义。 | 保持开启 |
| Fake-IP 过滤域名 | `*.lan`、`localhost.ptlogin2.qq.com`、`rule-set:cn_domain` | 这些域名不走 Fake-IP（走真实 IP），避免局域网域名异常；`rule-set:cn_domain` 让国内域名走真实 IP 直连，并用内置 `cn.mrs` 规则集替代 `geosite:cn`，免加载 10MB 的 geosite.dat、启动更快。填 `geosite:cn` 也会自动改用 cn.mrs。 | 保持默认，需要时再追加 |
| Bootstrap DNS | `223.5.5.5`、`119.29.29.29` | 用来解析 DoH / DoT / DoQ 服务器本身的域名。必须尽量稳定，最好是纯 IP DNS。 | 保持默认或换成本地可用 DNS |
| ECS 客户端子网 | 留空（推荐） | 给上游 DNS 一个“客户端大概位置”，帮助 CDN 返回更合适的 IP。mihomo 写入 DNS URL 的 `ecs` 参数，sing-box 写入 `dns.client_subnet`；清空则不写入。 | 默认留空即可；懂网络再填 |
| 强制覆盖 ECS | `0` | 开启后会覆盖 DNS 地址中已有的 ECS 参数。 | 默认关闭 |
| Fallback GeoIP 过滤 | `0` | 是否用 GeoIP 校验 fallback 解析结果。默认关闭，避免冷启动依赖 GeoIP 数据库（MMDB）拖慢启动。 | 默认关闭即可 |
| Fallback IP CIDR | `240.0.0.0/4` | 过滤明显异常或保留地址段的解析结果。 | 保持默认 |
| sing-box 独立 DNS 缓存 | `0` | 让 direct / proxy / fallback 等 DNS 角色使用独立缓存。适合复杂分流场景。 | 一般关闭 |

## ECS 应该怎么填

ECS 是 EDNS Client Subnet。它会在 DNS 请求中带上一个网段，让上游 DNS 知道“客户端大概在哪”，从而返回更合适的 CDN IP。

| 写法 | 含义 | 适合场景 |
|---|---|---|
| 留空 | 不主动写入 ECS。Clashoo 默认就是留空。 | 默认推荐；对隐私敏感，或怀疑 ECS 导致解析异常 |
| `223.5.5.0/24` | 用一个固定国内网段作为位置信息，解析更偏向国内 CDN。 | 想让国内解析更稳定 |
| `116.22.33.0/24` | 用你的公网 IPv4 去掉最后一段后补 `/24`。例如公网 IP 是 `116.22.33.44`，就填这个。 | 想让 CDN 更贴近真实地区 |
| `0.0.0.0/0` | 让内核或上游按自身能力处理客户端子网。不同内核和版本表现可能不同。 | 想自动处理时可测试 |

注意：ECS 只影响 DNS 返回哪个 IP，不等于代理规则。ECS 填错可能导致 CDN 调度到不合适的地区。

## 默认上游 DNS 角色

Clashoo 把上游 DNS 分成不同角色，不同域名会走不同解析链。

| 角色 | 默认值 | 用途 |
|---|---|---|
| 主解析（nameserver） | `https://dns.alidns.com/dns-query`、`https://doh.pub/dns-query` | 默认国内主解析，保证国内域名和 CDN 调度稳定 |
| 节点域名解析（proxy-server-nameserver） | `tls://1.1.1.1:853` | 配合 DNS Respect Rules 解析代理节点相关域名，避免污染 |
| 直连域名解析（direct-nameserver） | `udp://223.5.5.5` | 明确直连的域名走国内 DNS |
| Bootstrap DNS（default-nameserver） | `223.5.5.5`、`119.29.29.29` | 解析 DoH / DoT / DoQ 服务器本身，必须是纯 IP |
| Fallback DNS | `https://cloudflare-dns.com/dns-query`、`https://dns.google/dns-query` | 给非国内域名策略或 Redir-Host 场景兜底，Fake-IP 模式下默认不直接注入 fallback 字段 |

默认分流解析策略：

| 匹配规则 | 默认使用 DNS | 含义 |
|---|---|---|
| `rule-set:cn_domain` | 阿里 DNS、腾讯 DNS | 国内域名用国内 DNS，使用内置 `cn.mrs`，不依赖 geosite.dat |
| `geosite:geolocation-!cn` | Cloudflare DNS | 非国内域名用境外 DNS |

Fake-IP 模式下不再配置 fallback。mihomo 一旦配了 fallback 就会自动启用 fallback-filter，境外 DNS 直连被墙时会空等超时，反而拖慢 Google、YouTube。

界面里仍可以填 `geosite:cn`，Clashoo 运行时会自动改成 `rule-set:cn_domain`。这样不需要额外加载 10MB 左右的 geosite.dat，干净固件也能用内置 `cn.mrs` 做国内域名判断。

## DNS Respect Rules

位置：`基础设置 -> 高级 DNS -> DNS Respect Rules`，默认开启。

打开后，DNS 查询本身也按代理规则走。境外 DNS 查询可以经代理出去，避免直连被污染；节点域名解析会使用 `proxy-server-nameserver`。

关闭它会怎样：境外域名改用直连的 DNS 解析，很可能拿到污染 IP。表现是网页能开（TCP 把域名交给节点解析，不受影响），但 **QUIC / UDP 会挂**（UDP 出站必须先在本地解析出 IP，就发到污染地址去了），典型症状就是 Google Play 下载一直转圈。

前提：必须配置了「节点域名解析（proxy-server-nameserver）」，否则 mihomo 会拒绝启动。开了 `prefer-h3` 时不要用。

## 自己写的配置文件优先

如果你的配置文件里已经写了 `dns` 段，里面已有的字段（`nameserver`、`nameserver-policy`、`respect-rules` 等）**不会被 LuCI 的设置覆盖**，Clashoo 只补你没写的部分。想完全由 LuCI 接管，就把配置文件里的 `dns` 段删掉。

几个例外是为了避免已知坑：

- 用户配置里的 `fake-ip-filter` 和 `sniffer` 会整体保留，不再强行覆盖。
- LuCI 里额外填写的 Fake-IP 过滤域名会追加合并到用户原有列表，不会清空原条目。
- 用户配置的 `nameserver-policy` 缺少国内域名兜底时，会补 `rule-set:cn_domain`。
- 用户写了 `geosite:cn` 时，会映射到内置 `rule-set:cn_domain`。
- 用户 DNS 里写 `system` 时，会改成 `223.5.5.5`，避免 DNS 自环。

## 基础 DNS 与透明代理 DNS 劫持的区别

| 维度 | 基础 DNS 设置：IPv6 解析 | 透明代理：IPv6 DNS 劫持 |
|---|---|---|
| 所在层级 | 应用层，属于 mihomo / sing-box 内核 DNS 行为 | 网络层，属于防火墙 / 透明代理接管行为 |
| 作用对象 | Clashoo 内核自己 | 局域网内其他设备，例如手机、电脑、电视 |
| 功能定义 | 决定内核解析域名时，是否查询 AAAA 记录，也就是 IPv6 地址 | 决定是否拦截局域网设备发出的 IPv6 DNS 查询，并交给 Clashoo 处理 |
| 关闭后的结果 | 内核通常只尝试获取 IPv4 地址 | 局域网设备如果手动使用 IPv6 DNS，可能绕过 Clashoo DNS 分流 |
| 主要影响 | 代理核心拿到 IPv4 还是 IPv6 目标地址 | 客户端 DNS 是否会泄漏或绕过规则 |
| 典型问题 | IPv6 网络不完整时，可能解析到 IPv6 但访问失败 | 客户端绕过 Clashoo，导致规则不生效、污染或直连异常 |

## 简单理解

`基础 DNS -> IPv6 解析` 管的是：

```text
Clashoo 内核要不要解析 IPv6 地址
```

`透明代理 -> IPv6 DNS 劫持` 管的是：

```text
局域网设备的 IPv6 DNS 请求要不要被 Clashoo 接管
```

所以，`IPv6 DNS 劫持` 不是“开启 IPv6 解析”。它只是防止客户端绕过 Clashoo 的 DNS。

## 推荐设置

| 网络环境 | 基础 DNS IPv6 解析 | 透明代理 IPv6 DNS 劫持 | 透明代理 IPv6 代理 |
|---|---|---|---|
| 没有 IPv6，或不确定 IPv6 是否稳定 | 关闭 | 开启 | 关闭 |
| IPv6 可用，但只想优先走 IPv4 | 关闭 | 开启 | 关闭 |
| IPv6 完整可用，希望规则覆盖 IPv6 | 开启 | 开启 | 开启 |
| 出现 IPv6 解析正常但访问失败 | 先关闭 | 保持开启 | 先关闭 |

## 为什么建议保留 IPv6 DNS 劫持

即使你不想使用 IPv6 代理，也建议保留 IPv6 DNS 劫持。

原因是很多设备会自动使用运营商下发的 IPv6 DNS。如果不劫持，这些 DNS 请求可能不经过 Clashoo，结果是：

- 域名分流规则不生效
- Fake-IP 规则失效
- 国内外判断异常
- DNS 请求泄漏到外部 DNS

## 排查建议

如果开启 IPv6 后出现异常，按这个顺序排查：

1. 先关闭 `基础 DNS IPv6 解析`
2. 保留 `透明代理 IPv6 DNS 劫持`
3. 关闭 `透明代理 IPv6 代理`
4. 确认 Fake-IP 下国内外访问正常
5. 再逐项打开 IPv6 解析和 IPv6 代理测试

这样可以区分问题来自 DNS 解析、IPv6 透明代理，还是运营商 IPv6 网络本身。
