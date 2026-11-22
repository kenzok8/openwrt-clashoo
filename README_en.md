> I maintain luci-app-clashoo not to show off how good the code is,
> but to bring the classic back.
>
> As proxy software gets more and more complex,
> I want this one to stay what it always was: simple, stable, and ready out of the box.
>
> Keep the complexity to myself, leave the simplicity to the user.

<p align="center">
    <img src="luci-app-clashoo/htdocs/luci-static/clashoo/logo.png" width="138" />
</p>
<h1 align="center">Clashoo</h1>
<p align="center"><strong>A dual-core proxy management plugin for OpenWrt: mihomo + sing-box</strong></p>

<p align="center"><a href="README.md">中文</a> · English</p>

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

## Screenshots

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

## Supported Range

| SDK | Package format | Notes |
|---|---|---|
| OpenWrt 24.10 | `.ipk` | opkg |
| OpenWrt 25.12 | `.apk` | apk, recommended |

9 architectures (build matrix in `.github/workflows/release.yml`): `aarch64_cortex-a53`, `aarch64_cortex-a72`, `aarch64_generic`, `arm_cortex-a7_neon-vfpv4`, `arm_cortex-a9_neon`, `i386_pentium4`, `mips_24kc`, `mipsel_24kc`, `x86_64`.

---

## Features

**Two cores, one interface**
- **mihomo (Clash Meta)** — Stable / Alpha / Smart, pick one, fed by YAML subscriptions
- The Clashoo package ships the mihomo stable release, v1.19.34 (see `PKG_UPSTREAM_VERSION` in `clashoo/Makefile`); fresh installs default to stable. Alpha can be installed manually under "System → Core/Data Components"; existing devices keep their current core choice.
- **sing-box** — Stable / Alpha switchable, fed by JSON config files
- Switching cores needs no reinstall; the same UCI config adapts to both sides automatically

**Overview dashboard**
- Live status and health checks (DNS / explicit proxy / transparent proxy)
- Start/stop switch with instant feedback
- Core switcher (Mihomo / Smart / Sing-box) with the current selection highlighted
- Transparent proxy breakdown (TCP / UDP / network stack)
- Access check: latency tiers for domestic and foreign sites (<400ms green / <800ms yellow / >800ms red)
- Real-time traffic monitor (upload / download / active connections)

**Config management**
- One-click subscription fetch with automatic config generation
- Config upload, online editing, custom file output
- Template override: upload a YAML template + paste a subscription URL → the URL is injected and verified automatically
- Every generated config is dry-run checked with `mihomo -t` before being written; bad configs never land on disk

**DNS policy**
- Enhanced mode: Fake-IP / Redir-Host freely switchable
- Upstream DNS split by role: default / proxy / direct / fallback
- mihomo reads the LuCI upstream DNS / split DNS settings and keeps DNS fields already present in the user's config
- Bundled `cn.mrs` domain set, using `rule-set:cn_domain` for domestic domains by default, so no geosite.dat dependency
- Bootstrap DNS, fallback GeoIP filtering, ECS client subnet
- DNS leak protection: blocks domestic DNS from resolving foreign domains, blocks DoT/DoQ

**Transparent proxy**
- TCP / UDP / network stack configured separately
- TCP supports Redirect / TProxy / TUN; UDP supports TProxy / TUN
- TUN stack supports gVisor / System / Mixed, only active when TCP or UDP is set to TUN
- LAN ACL groups by IPv4, IPv6, and MAC, with DNS hijack and proxying controlled separately
- QUIC GSO can be disabled; proxied UDP 443 can be blocked on demand so apps fall back to TCP

**System & data**
- Component updates: core / core data / plugin itself are checked separately, so failures are easy to pin down
- Backup & restore: one-click config export / import, plus factory reset, so experimenting is safe
- One-click download/update of the core, dashboard, and GeoIP / GeoSite data
- Mirror fallback chain (custom → gh-proxy.com → ghfast.top → direct GitHub)
- Four dashboards to choose from: MetaCubeXD / YACD / Zashboard / Razord

---

## Dependencies

| Package | Purpose |
|------|------|
| `ca-bundle` | CA certificate bundle |
| `curl` | Downloading GeoIP / dashboards / subscriptions |
| `yq` | YAML processing (config generation and validation) |
| `firewall4` | nftables firewall (transparent proxy rules) |
| `ip-full` | Full iproute2 |
| `coreutils-nohup` | Background async update tasks (GeoIP, China IP) |
| `coreutils-timeout` | Time limits on health-check commands (e.g. `timeout 3 nslookup`) |
| `kmod-inet-diag` | Network diagnostics kernel module |
| `kmod-nft-socket` | nftables socket matching |
| `kmod-nft-tproxy` | nftables TPROXY support |
| `kmod-tun` | TUN device support |
| `kmod-dummy` | Dummy network device module |
| `unzip` | Extracting downloaded dashboard archives |


`luci-app-clashoo` additionally depends on `luci-base` and `luci-i18n-clashoo-zh-cn` (Chinese translation). See `clashoo/Makefile` and `luci-app-clashoo/Makefile` for the full dependency lists.

The sing-box core is downloaded by Clashoo's "Component Update" into a private directory and never overwrites the system's `/usr/bin/sing-box`, so it can coexist with HomeProxy. The two plugins still must not take over the transparent proxy at the same time; to run them side by side, switch Clashoo to core-only mode and make sure the listen ports don't collide.

---

## Installation

### One-click install

```bash
# Recommended in mainland China: jsDelivr mirror, more stable than ghfast-style accelerators
wget -O - https://cdn.jsdelivr.net/gh/kenzok8/openwrt-clashoo@main/scripts/install.sh | ash
```

```bash
# Direct GitHub (when the mirror hasn't synced the latest script yet)
wget -O - https://raw.githubusercontent.com/kenzok8/openwrt-clashoo/refs/heads/main/scripts/install.sh | ash
```

> jsDelivr caches `@main` (up to ~12 hours), so a freshly changed script may take a while to take effect.
> Package downloads go through `GITHUB_PROXY_PREFIX` by default (`https://ghfast.top/`), falling back to direct GitHub on failure;
> to use another accelerator: `GITHUB_PROXY_PREFIX=https://your-mirror/ wget -O - ... | ash`.

How the install script verifies:

- It installs only from the **signed feed** by default: it compares the built-in public key fingerprints first, then lets apk/opkg verify the index signature and package digests
- On a fingerprint mismatch, a failed signature check, or a digest mismatch it **stops outright** — no silent downgrade
- Only when the signed feed is unreachable (network cause) can `CLASHOO_ALLOW_GITHUB_FALLBACK=1` explicitly enable the GitHub Release fallback; that path only checks the SHA-256 recorded by GitHub — **not package signature verification** — and does not protect against a compromised publisher account

```bash
CLASHOO_ALLOW_GITHUB_FALLBACK=1 sh install.sh
```

<details>
<summary><b>Public key fingerprints & verification notes</b></summary>

The script imports the feed public keys itself; no manual steps needed. The fingerprints (hard-coded in `scripts/install.sh`):

| Public key | Purpose | SHA-256 |
|---|---|---|
| `dllkids-feed.pub.pem` | apk index signature on OpenWrt 25.12+ (ECDSA P-256) | `ea9dd08b41e6b0fc7ffda166a89b2b4904ad5607bf77d82c9f7f2a54e63a8948` |
| `dllkids-feed.pub` | opkg `Packages.gz` signature on 24.10 and earlier (usign Ed25519) | `216565b4d2c50f90da39ee1b19f1c6d2de0392c0043ca9bea311ac831a44779e` |

opkg key ID (file name under `/etc/opkg/keys/`): `f2a0779946829e7a`

To check the keys yourself:

```sh
curl -fsSLO https://down.dllkids.xyz/openwrt-feed/keys/dllkids-feed.pub.pem
curl -fsSLO https://down.dllkids.xyz/openwrt-feed/keys/dllkids-feed.pub
sha256sum dllkids-feed.pub dllkids-feed.pub.pem
```

What this protects against, and what it doesn't: it stops man-in-the-middle attacks, swapped public keys, and tampered package indexes; it does not stop an attacker who compromises both the script source (GitHub or mirror) and the feed origin, nor a compromised publisher account — a script cannot vouch for itself, so that layer can only be covered by manually checking the fingerprints above. When rotating keys, update the constants in `scripts/install.sh` first, then this table.

</details>

### Feed install

Run on the OpenWrt router:

```bash
wget -qO- https://down.dllkids.xyz/openwrt-feed/openwrt-feed-setup.sh | sh
```

The script automatically:

- ✅ Detects the SDK version (24.10 / 25.12) and CPU architecture
- ✅ Checks whether a feed exists for that architecture (covers `Packages.gz` / `APKINDEX.tar.gz` / `packages.adb` indexes), falling back to `all` if not
- ✅ Downloads the matching public key: opkg → `opkg-key add`; apk → into `/etc/apk/keys/`
- ✅ Writes/updates the feed config (`customfeeds.conf` or `/etc/apk/repositories`) without duplicating entries
- ✅ Runs `opkg update` / `apk update` (apk falls back to `--allow-untrusted` if signature verification fails)
- ✅ Installs a matching `vmlinux-btf` for the running kernel (`uname -r`) when BTF is missing (only honk / dae need it; clashoo itself doesn't)

The script only sets up the feed — it doesn't install any packages. Install them yourself afterwards:

```bash
apk add clashoo luci-app-clashoo        # 25.12
opkg install clashoo luci-app-clashoo   # 24.10
```

### Build from source

```bash
git clone https://github.com/kenzok8/openwrt-clashoo.git package/openwrt-clashoo
make package/clashoo/compile V=s
make package/luci-app-clashoo/compile V=s
```

### Uninstall

```bash
wget -O - https://raw.githubusercontent.com/kenzok8/openwrt-clashoo/refs/heads/main/scripts/uninstall.sh | ash
```

If GitHub is hard to reach from mainland China, use a mirror:

```bash
wget -O - https://ghfast.top/https://raw.githubusercontent.com/kenzok8/openwrt-clashoo/refs/heads/main/scripts/uninstall.sh | ash
```

---

## Usage

1. After installing, open LuCI "Services → Clashoo"
2. Upload a subscription or import a config file
3. Pick a core (Mihomo / Smart / Sing-box)
4. Enable the service
5. Tune the transparent proxy as needed: TCP, UDP, and the TUN network stack

For more usage notes, config details, and FAQs, see the **[project Wiki](https://github.com/kenzok8/openwrt-clashoo/wiki)**.

---

## AI Assistant Guide (Skill)

The repo ships a general-purpose AI skill, `clashoo-user-guide`, which feeds Clashoo's feature docs, dual-core internals, and troubleshooting experience to AI assistants so they can accurately answer "how do I turn on X", "why is it not working", and "what does this log error mean".

Generic install (works with Claude Code / Codex / Gemini, etc.; needs Node.js):

```bash
# Install into the current agent
npx skills add kenzok8/openwrt-clashoo

# Install into all installed agents
npx skills add kenzok8/openwrt-clashoo -a '*'
```

Skill source: [`.github/skills/clashoo-user-guide/`](.github/skills/clashoo-user-guide/); its `references/` share a source with this repo's Wiki and are synced automatically by CI.

---

## Development

The repo has no local test scripts. PRs touching `clashoo/` or `luci-app-clashoo/` trigger the `release.yml` build matrix (9 architectures × 24.10 / 25.12 SDKs); manual debug builds run through the **Debug plugins build** workflow in Actions (24.10.4 / 25.12.2, plugin name and architecture selectable).

---

## Acknowledgements

- [mihomo](https://github.com/MetaCubeX/mihomo) — Clash Meta core
- [vernesong/mihomo](https://github.com/vernesong/mihomo) — Smart policy group support
- [sing-box](https://github.com/SagerNet/sing-box) — Universal proxy platform
- [nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) — Architecture reference

---

## License

This project is licensed under GPL-3.0 (see `LICENSE`), with upstream copyright and license notices retained.
