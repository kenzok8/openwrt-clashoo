include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-clashoo
PKG_VERSION:=1.9.0
PKG_RELEASE:=15
PKG_MAINTAINER:=kenzok8

include $(INCLUDE_DIR)/package.mk

define Package/clashoo
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Clashoo bundled core
  PROVIDES:=mihomo clash-meta
  PKGARCH:=$(ARCH_PACKAGES)
  MAINTAINER:=kenzok8
endef

define Package/clashoo/description
  Bundled Mihomo core binary for Clashoo.
endef

define Package/clashoo/install
	$(INSTALL_DIR) $(1)/usr/bin
	[ -x ./core/mihomo/$(ARCH_PACKAGES)/mihomo ] || { echo "Missing bundled core for $(ARCH_PACKAGES): core/mihomo/$(ARCH_PACKAGES)/mihomo" >&2; exit 1; }
	$(INSTALL_BIN) ./core/mihomo/$(ARCH_PACKAGES)/mihomo $(1)/usr/bin/mihomo
	ln -sf /usr/bin/mihomo $(1)/usr/bin/clash-meta
endef

define Package/clashoo-runtime
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Clashoo runtime for Mihomo
  DEPENDS:=+clashoo +bash +ca-bundle +curl +yq +firewall4 +ip-full +kmod-inet-diag +kmod-nft-socket +kmod-nft-tproxy +kmod-tun +kmod-dummy
  PROVIDES:=clash-meta
  PKGARCH:=all
  MAINTAINER:=kenzok8
endef

define Package/clashoo-runtime/description
  Clashoo runtime scripts and init integration for Mihomo core.
endef

define Package/clashoo-runtime/conffiles
/etc/config/clash
endef

define Package/clashoo-runtime/install
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DIR) $(1)/etc/clash
	$(INSTALL_DIR) $(1)/etc/clash/provider
	$(INSTALL_DIR) $(1)/etc/clash/proxyprovider
	$(INSTALL_DIR) $(1)/etc/clash/ruleprovider
	$(INSTALL_DIR) $(1)/usr/share
	$(INSTALL_DIR) $(1)/usr/share/clash
	$(INSTALL_DIR) $(1)/usr/share/clashbackup
	$(INSTALL_DIR) $(1)/usr/share/clash/config
	$(INSTALL_DIR) $(1)/usr/share/clash/config/sub
	$(INSTALL_DIR) $(1)/usr/share/clash/config/upload
	$(INSTALL_DIR) $(1)/usr/share/clash/config/custom

	$(INSTALL_BIN) ./root/etc/init.d/clash $(1)/etc/init.d/clash
	$(INSTALL_CONF) ./root/etc/config/clash $(1)/etc/config/clash
	$(CP) ./root/usr/share/clash/* $(1)/usr/share/clash/

	$(RM) $(1)/usr/share/clash/dashboard
	$(RM) $(1)/usr/share/clash/yacd
	$(RM) $(1)/usr/share/clash/clash.txt
	$(RM) $(1)/usr/share/clash/update.log
	$(RM) $(1)/usr/share/clash/geoip.log
	$(RM) $(1)/usr/share/clash/core_down_complete
endef

define Package/clashoo-runtime/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	[ -x /usr/bin/mihomo ] && [ ! -x /usr/bin/clash-meta ] && ln -sf /usr/bin/mihomo /usr/bin/clash-meta
	/etc/init.d/clash disable 2>/dev/null
fi
exit 0
endef

define Package/clashoo-runtime/prerm
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	/etc/init.d/clash disable 2>/dev/null
	/etc/init.d/clash stop >/dev/null 2>&1
fi
exit 0
endef

define Package/luci-app-clashoo
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI app for Clashoo
  DEPENDS:=+luci-base +clashoo-runtime
  PKGARCH:=all
  MAINTAINER:=kenzok8
endef

define Package/luci-app-clashoo/description
  LuCI web interface for Clashoo.
endef

define Build/Prepare
	if [ -f ${CURDIR}/po/zh-cn/clash.po ] && command -v po2lmo >/dev/null 2>&1; then \
		po2lmo ${CURDIR}/po/zh-cn/clash.po ${CURDIR}/po/zh-cn/clash.zh-cn.lmo; \
	fi
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/luci-app-clashoo/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DIR) $(1)/usr/share/rpcd/ucode
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DIR) $(1)/www/luci-static/resources/tools
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/clash
	$(INSTALL_DIR) $(1)/www/luci-static/clash

	$(INSTALL_DATA) ./luasrc/controller/clash.lua $(1)/usr/lib/lua/luci/controller/clash.lua
	$(INSTALL_BIN) ./root/usr/share/rpcd/ucode/luci.clash $(1)/usr/share/rpcd/ucode/luci.clash
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-clashoo.json $(1)/usr/share/rpcd/acl.d/luci-app-clashoo.json
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-clashoo.json $(1)/usr/share/luci/menu.d/luci-app-clashoo.json

	$(INSTALL_DATA) ./htdocs/luci-static/resources/tools/clash.js $(1)/www/luci-static/resources/tools/clash.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/clash/index.js $(1)/www/luci-static/resources/view/clash/index.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/clash/overview.js $(1)/www/luci-static/resources/view/clash/overview.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/clash/app.js $(1)/www/luci-static/resources/view/clash/app.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/clash/config.js $(1)/www/luci-static/resources/view/clash/config.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/clash/dns.js $(1)/www/luci-static/resources/view/clash/dns.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/clash/system.js $(1)/www/luci-static/resources/view/clash/system.js
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/clash/log.js $(1)/www/luci-static/resources/view/clash/log.js
	$(INSTALL_DATA) ./htdocs/luci-static/clash/logo.png $(1)/www/luci-static/clash/logo.png
endef

define Package/luci-app-clashoo/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	rm -rf /tmp/luci*
	/etc/init.d/rpcd restart >/dev/null 2>&1 || true
	/etc/init.d/uhttpd restart >/dev/null 2>&1 || true
fi
exit 0
endef

define Package/luci-i18n-clashoo-zh-cn
	SECTION:=luci
	CATEGORY:=LuCI
	TITLE:=luci-app-clashoo - Simplified Chinese (zh-cn)
	DEPENDS:=+luci-app-clashoo
	PKGARCH:=all
endef

define Package/luci-i18n-clashoo-zh-cn/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	if [ -f ./po/zh-cn/clash.zh-cn.lmo ]; then \
		$(INSTALL_DATA) ./po/zh-cn/clash.zh-cn.lmo $(1)/usr/lib/lua/luci/i18n; \
	else \
		$(INSTALL_DATA) ./dist/clash.zh-cn.lmo $(1)/usr/lib/lua/luci/i18n; \
	fi
endef

define Package/luci-i18n-clashoo-zh-cn/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	rm -rf /tmp/luci*
	/etc/init.d/uhttpd restart >/dev/null 2>&1 || true
fi
exit 0
endef

$(eval $(call BuildPackage,clashoo))
$(eval $(call BuildPackage,clashoo-runtime))
$(eval $(call BuildPackage,luci-app-clashoo))
$(eval $(call BuildPackage,luci-i18n-clashoo-zh-cn))
