#!/bin/sh
# test_yaml2singbox.sh — yaml2singbox.uc 的集成测试
# 依赖: ucode, yq (mikefarah), jq
# 运行位置: OpenWrt 测试机（252）或任何装齐依赖的环境
# 退出码: 0 全通过, 非 0 有失败

set -e

LIB_DIR="${LIB_DIR:-/usr/share/clashoo/lib}"
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

PASS=0
FAIL=0

assert_eq() {  # label, expected, got
	if [ "$2" = "$3" ]; then
		printf "  ✓ %s (=%s)\n" "$1" "$2"
		PASS=$((PASS+1))
	else
		printf "  ✗ %s: expected=%s got=%s\n" "$1" "$2" "$3"
		FAIL=$((FAIL+1))
	fi
}

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1"; exit 2; }; }
need ucode; need yq; need jq

# ---- fixture YAML（合成假数据，覆盖主要协议）----
cat > "$TMP/sub.yaml" <<'YAML'
proxies:
  - name: "test-ss-01"
    type: ss
    server: ss.example.com
    port: 8388
    cipher: aes-128-gcm
    password: testpass
    udp: true
  - name: "test-ss-obfs"
    type: ss
    server: ss2.example.com
    port: 8389
    cipher: aes-256-gcm
    password: p2
    plugin: obfs
    plugin-opts:
      mode: http
      host: bing.com
  - name: "test-vmess-ws"
    type: vmess
    server: vm.example.com
    port: 443
    uuid: 11111111-2222-3333-4444-555555555555
    alterId: 0
    cipher: auto
    tls: true
    servername: vm.example.com
    skip-cert-verify: false
    network: ws
    ws-opts:
      path: /ws
      headers:
        Host: vm.example.com
  - name: "test-vless-reality"
    type: vless
    server: vl.example.com
    port: 443
    uuid: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
    flow: xtls-rprx-vision
    tls: true
    servername: www.microsoft.com
    reality-opts:
      public-key: somepubkey
      short-id: abc123
    client-fingerprint: chrome
  - name: "test-trojan"
    type: trojan
    server: tr.example.com
    port: 443
    password: trojanpass
    sni: tr.example.com
  - name: "test-hy2"
    type: hysteria2
    server: hy.example.com
    port: 8443
    password: hypass
    sni: hy.example.com
  - name: "test-tuic"
    type: tuic
    server: tu.example.com
    port: 443
    uuid: 12345678-9abc-def0-1234-56789abcdef0
    password: tuicpass
    sni: tu.example.com
    alpn:
      - h3
  # 同名重复，应自动去重
  - name: "test-ss-01"
    type: ss
    server: ss3.example.com
    port: 8390
    cipher: aes-128-gcm
    password: p3
  # clash 代理组，应被跳过
  - name: "proxy-group-1"
    type: select
    proxies:
      - test-ss-01
  # 未知协议，应被跳过且警告
  - name: "test-unknown"
    type: some-proto-never-exists
    server: x.example.com
    port: 1
YAML

# ---- 最小模板（包含 __NODES__ 占位）----
cat > "$TMP/tpl.json" <<'JSON'
{
  "outbounds": [
    { "type": "selector", "tag": "🚀 节点选择", "outbounds": ["__NODES__", "DIRECT"] },
    { "type": "direct", "tag": "DIRECT" },
    { "type": "selector", "tag": "📹 油管视频", "outbounds": ["🚀 节点选择", "DIRECT"] }
  ]
}
JSON

# ---- 运行转换 ----
OUT="$TMP/out.json"
if ! ucode "$LIB_DIR/yaml2singbox.uc" "$TMP/sub.yaml" "$TMP/tpl.json" "$OUT" 2>"$TMP/err.log"; then
	echo "✗ script exited non-zero"
	cat "$TMP/err.log"
	exit 1
fi

echo "转换完成，stderr 日志："
sed 's/^/    /' "$TMP/err.log"
echo

# ---- 断言 ----
echo "开始断言:"

# A1: 输出是合法 JSON
if jq -e . "$OUT" >/dev/null 2>&1; then
	echo "  ✓ 输出为合法 JSON"; PASS=$((PASS+1))
else
	echo "  ✗ 输出不是合法 JSON"; FAIL=$((FAIL+1))
fi

# A2: 7 个 proxy 有效（1 去重合并保留但 tag 不同 → 7 条节点），select/unknown 被跳过 → 8 总数(因为 test-ss-01 重复一条自动加 _2)
# 实际：ss*3(包括重名) + vmess + vless + trojan + hy2 + tuic = 8 个可用节点
NODE_COUNT=$(jq '[.outbounds[] | select(.type!="selector" and .type!="urltest" and .type!="direct" and .type!="block" and .type!="dns")] | length' "$OUT")
assert_eq "代理节点数量(8)" 8 "$NODE_COUNT"

# A3: 节点 tag 去重 —— 重名的第二条应变为 test-ss-01_2
HAS_DEDUPED=$(jq '[.outbounds[].tag] | map(select(.=="test-ss-01_2")) | length' "$OUT")
assert_eq "去重后 tag test-ss-01_2 存在" 1 "$HAS_DEDUPED"

# A4: selector "🚀 节点选择" outbounds 包含全部 8 节点 + DIRECT = 9
SEL_LEN=$(jq '[.outbounds[] | select(.tag=="🚀 节点选择")][0].outbounds | length' "$OUT")
assert_eq "节点选择 outbounds 长度(9)" 9 "$SEL_LEN"

# A5: 没有 __NODES__ 残留
HAS_PLACEHOLDER=$(jq '[.. | strings? | select(.=="__NODES__")] | length' "$OUT")
assert_eq "无 __NODES__ 残留" 0 "$HAS_PLACEHOLDER"

# A6: ss 节点字段映射正确
SS_METHOD=$(jq -r '[.outbounds[] | select(.tag=="test-ss-01" and .type=="shadowsocks")][0].method' "$OUT")
assert_eq "ss method=aes-128-gcm" "aes-128-gcm" "$SS_METHOD"

# A7: vmess ws transport 字段
VMESS_PATH=$(jq -r '[.outbounds[] | select(.tag=="test-vmess-ws")][0].transport.path' "$OUT")
assert_eq "vmess ws path=/ws" "/ws" "$VMESS_PATH"

# A8: vless reality 字段
REALITY_PK=$(jq -r '[.outbounds[] | select(.tag=="test-vless-reality")][0].tls.reality.public_key' "$OUT")
assert_eq "vless reality public_key" "somepubkey" "$REALITY_PK"

# A9: trojan tls.server_name 自动填充
TROJAN_SNI=$(jq -r '[.outbounds[] | select(.tag=="test-trojan")][0].tls.server_name' "$OUT")
assert_eq "trojan sni=tr.example.com" "tr.example.com" "$TROJAN_SNI"

# A10: hy2 password + tls
HY2_PASS=$(jq -r '[.outbounds[] | select(.tag=="test-hy2")][0].password' "$OUT")
assert_eq "hy2 password" "hypass" "$HY2_PASS"

# A11: tuic uuid
TUIC_UUID=$(jq -r '[.outbounds[] | select(.tag=="test-tuic")][0].uuid' "$OUT")
assert_eq "tuic uuid" "12345678-9abc-def0-1234-56789abcdef0" "$TUIC_UUID"

# A12: select 类型被跳过（不应有 tag=proxy-group-1 的节点）
SEL_SKIPPED=$(jq '[.outbounds[] | select(.tag=="proxy-group-1")] | length' "$OUT")
assert_eq "select 类型被跳过" 0 "$SEL_SKIPPED"

# A13: 未知协议被跳过
UNK_SKIPPED=$(jq '[.outbounds[] | select(.tag=="test-unknown")] | length' "$OUT")
assert_eq "未知协议被跳过" 0 "$UNK_SKIPPED"

echo
echo "========================================"
echo "通过: $PASS   失败: $FAIL"
echo "========================================"
[ "$FAIL" -eq 0 ]
