#!/bin/sh

set -eu

echo "Stopping clash service..."
/etc/init.d/clash stop >/dev/null 2>&1 || true
/etc/init.d/clash disable >/dev/null 2>&1 || true

if command -v opkg >/dev/null 2>&1; then
  echo "Removing packages with opkg..."
  opkg remove luci-i18n-clashoo-zh-cn luci-app-clashoo clashoo-runtime clashoo >/dev/null 2>&1 || true
elif command -v apk >/dev/null 2>&1; then
  echo "Removing packages with apk..."
  apk del luci-i18n-clashoo-zh-cn luci-app-clashoo clashoo-runtime clashoo >/dev/null 2>&1 || true
else
  echo "No supported package manager found (opkg/apk), skip package removal."
fi

echo "Cleaning runtime files..."
rm -rf /etc/clash /usr/share/clash /usr/share/clashbackup /tmp/clashoo-install
rm -f /etc/init.d/clash /etc/config/clash

rm -rf /tmp/luci*
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
/etc/init.d/uhttpd restart >/dev/null 2>&1 || true
/etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
/etc/init.d/firewall restart >/dev/null 2>&1 || true

echo "Uninstall & reset complete."
