include $(TOPDIR)/rules.mk

PKG_NAME:=clashoo
PKG_VERSION:=1.9.0
PKG_RELEASE:=16
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

define Build/Compile
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

$(eval $(call BuildPackage,clashoo))
$(eval $(call BuildPackage,clashoo-runtime))
