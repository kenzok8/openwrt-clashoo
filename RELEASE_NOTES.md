# Release Notes

## v1.9.0-r15

- Introduced split package layout for production use:
  - `clashoo` (bundled mihomo core)
  - `clashoo-runtime` (runtime scripts/init)
  - `luci-app-clashoo`
  - `luci-i18n-clashoo-zh-cn`
- Added safer DNS and startup handling in runtime scripts to reduce lockout risk.
- Added core update rollback logic and verification flow for safer binary replacement.
- Updated maintainer metadata to `kenzok8` and standardized repository metadata.
- Added helper script `scripts/fetch_mihomo_cores.sh` for multi-arch core asset preparation.
