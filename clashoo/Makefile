include $(TOPDIR)/rules.mk

PKG_NAME:=clashoo
PKG_VERSION:=1.19.22
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_SUBDIR:=$(PKG_NAME)-$(PKG_VERSION)
PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/MetaCubeX/mihomo.git
PKG_SOURCE_VERSION:=v$(PKG_VERSION)
PKG_MIRROR_HASH:=9ad3b84878f22929d71854104c2300fa70abaf3a69160c1c7567f454e052b88b

PKG_LICENSE:=GPL3.0+
PKG_MAINTAINER:=kenzok8

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

PKG_BUILD_TIME:=$(shell date -u -Iseconds)

GO_PKG:=github.com/metacubex/mihomo
GO_PKG_LDFLAGS_X:=$(GO_PKG)/constant.Version=v$(PKG_VERSION) $(GO_PKG)/constant.BuildTime=$(PKG_BUILD_TIME)
GO_PKG_TAGS:=with_gvisor

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/clashoo
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Clashoo Core (Mihomo)
  DEPENDS:=$(GO_ARCH_DEPENDS)
  PROVIDES:=mihomo clash-meta
endef

define Package/clashoo/description
  Compiled Mihomo core for Clashoo.
endef

define Package/clashoo-runtime
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Clashoo Runtime Environment
  DEPENDS:=+clashoo +bash +ca-bundle +curl +yq +firewall4 +ip-full +kmod-inet-diag +kmod-nft-socket +kmod-nft-tproxy +kmod-tun +kmod-dummy
  PKGARCH:=all
endef

define Package/clashoo-runtime/description
  Runtime scripts, config files and init integration for Clashoo.
endef

define Package/clashoo-runtime/conffiles
/etc/config/clash
endef

define Package/clashoo-runtime/install
	$(INSTALL_DIR) $(1)/usr/bin
	ln -sf /usr/bin/mihomo $(1)/usr/bin/clash-meta

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DIR) $(1)/etc/clash
	$(INSTALL_DIR) $(1)/etc/clash/provider
	$(INSTALL_DIR) $(1)/etc/clash/proxyprovider
	$(INSTALL_DIR) $(1)/etc/clash/ruleprovider
	$(INSTALL_DIR) $(1)/usr/share/clash
	$(INSTALL_DIR) $(1)/usr/share/clashbackup
	$(INSTALL_DIR) $(1)/usr/share/clash/config
	$(INSTALL_DIR) $(1)/usr/share/clash/config/sub
	$(INSTALL_DIR) $(1)/usr/share/clash/config/upload
	$(INSTALL_DIR) $(1)/usr/share/clash/config/custom

	$(INSTALL_BIN) $(CURDIR)/files/etc/init.d/clash $(1)/etc/init.d/clash
	$(INSTALL_CONF) $(CURDIR)/files/etc/config/clash $(1)/etc/config/clash
	$(CP) $(CURDIR)/files/usr/share/clash/* $(1)/usr/share/clash/

	$(RM) $(1)/usr/share/clash/dashboard
	$(RM) $(1)/usr/share/clash/yacd
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
	/etc/init.d/clash stop >/dev/null 2>&1
	/etc/init.d/clash disable 2>/dev/null
fi
exit 0
endef

define Build/Prepare
	$(Build/Prepare/Default)
	$(RM) -r $(PKG_BUILD_DIR)/rules/logic_test
endef

$(eval $(call GoBinPackage,clashoo))
$(eval $(call BuildPackage,clashoo))
$(eval $(call BuildPackage,clashoo-runtime))
