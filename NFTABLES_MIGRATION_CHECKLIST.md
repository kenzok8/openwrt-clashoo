# luci-app-clash nftables 迁移清单

目标：在 OpenWrt fw4 环境下，统一采用 nftables 规则模型，避免旧版 iptables 规则与 Mihomo 行为不一致。

## 0. 现状盘点

- [x] 已有 fw4 入口：`root/etc/init.d/clash` 的 `use_fw4_backend()` 与 `backend_apply_rules()`
- [x] 已有 nft 规则脚本：`root/usr/share/clash/fw4.sh`
- [ ] 仍保留 legacy iptables 全量分支：`rules()` / `remove_mark()`
- [x] 旧核心遗留逻辑（dtun/clashtun）已从主链下线

## 1. 能力边界（先定规则）

- [ ] 明确支持矩阵
  - fw4+nft：主路径（推荐）
  - legacy(iptables)：仅兼容兜底，或计划删除
- [ ] UI 文案与能力一致
  - 对外只强调 `TUN（推荐）`
  - 不再出现“TPROXY=iptables”暗示

## 2. 规则引擎迁移（参考 Nikki）

参考文件（Nikki）：

- `OpenWrt-nikki-ref/nikki/files/ucode/hijack.ut`
- `OpenWrt-nikki-ref/nikki/files/nikki.init`
- `OpenWrt-nikki-ref/nikki/files/scripts/firewall_include.sh`

待迁移项：

- [ ] 将 `fw4.sh` 从“静态片段写入”升级到“模板化生成规则集”
- [ ] 拆分路由器本机与 LAN 入站链（router/lan）
- [ ] 统一 fwmark 与 route table 策略（避免与其他服务冲突）
- [ ] 增加 cgroup / skuid / skgid 维度可选控制（按需）
- [ ] 增加 IPv6 对等规则（与 IPv4 同步）
- [ ] 对接 GeoIP nft include（可选）

## 3. 服务生命周期与回滚

- [ ] 启动：先加载配置，再原子下发 nft 规则，最后校验表/链存在
- [ ] 停止：仅清理自身表/规则句柄，避免误删其他应用规则
- [ ] 异常：规则下发失败时自动回滚并记录错误上下文

## 4. UI 与配置收敛

- [x] settings 端口页去除显式 TPROXY 术语（改为 UDP 转发端口）
- [x] 删除未使用的旧上传模板：`luasrc/view/clash/upload_core.htm`
- [x] 不再维护核心的检查入口与版本字段（dtun/clashtun）已移除
- [ ] 在页面说明中明确“fw4/nft 环境优先”

## 5. 验证矩阵（上线前必跑）

- [ ] fake-ip + UDP 开启：DNS、TCP、UDP 联通
- [ ] tun 模式：路由接管、回环、LAN 代理、IPv6
- [ ] 规则重载/服务重启后 nft 规则无重复残留
- [ ] 与其他常见服务并存（adguardhome、openclash、nikki）不冲突

## 6. 本轮已完成（本次提交范围）

- [x] 输出迁移清单文档（本文件）
- [x] 清理 settings 残留术语：`TPROXY 端口` -> `UDP 转发端口`
- [x] 清理无效遗留模板：`upload_core.htm`
- [x] 启动日志文案去除 `iptables` 暗示，改为统一“网络规则”
