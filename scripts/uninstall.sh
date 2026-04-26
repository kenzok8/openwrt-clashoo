#!/bin/sh

set -eu

echo "Stopping clashoo service..."
/etc/init.d/clashoo stop >/dev/null 2>&1 || true
/etc/init.d/clashoo disable >/dev/null 2>&1 || true

if command -v opkg >/dev/null 2>&1; then
  echo "Removing packages with opkg..."
  opkg remove luci-i18n-clashoo-zh-cn luci-app-clashoo clashoo >/dev/null 2>&1 || true
elif command -v apk >/dev/null 2>&1; then
  echo "Removing packages with apk..."
  apk del luci-i18n-clashoo-zh-cn luci-app-clashoo clashoo >/dev/null 2>&1 || true
else
  echo "No supported package manager found (opkg/apk), skip package removal."
fi

echo "Cleaning runtime files..."
rm -rf /etc/clashoo /usr/share/clashoo /usr/share/clashbackup /tmp/clashoo-install
rm -f /etc/init.d/clashoo /etc/config/clashoo

rm -rf /tmp/luci*
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
/etc/init.d/uhttpd restart >/dev/null 2>&1 || true
/etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
/etc/init.d/firewall restart >/dev/null 2>&1 || true

echo "Uninstall & reset complete."
