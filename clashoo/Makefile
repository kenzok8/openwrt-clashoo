include $(TOPDIR)/rules.mk

PKG_NAME:=clashoo
PKG_VERSION:=alpha-5e8bd85
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/MetaCubeX/mihomo.git
PKG_SOURCE_DATE:=2026-04-07
PKG_SOURCE_VERSION:=5e8bd85f18609c66c81c4b8a8419d1fe5ff789f8
PKG_MIRROR_HASH:=a0530bbb2a2e595d1c47e89d9721418f53f79618a7f9facad1dda2c4b04fdac6
PKG_BUILD_VERSION:=alpha-5e8bd85

PKG_LICENSE:=GPL3.0+
PKG_MAINTAINER:=kenzok8

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

PKG_BUILD_TIME:=$(shell date -u -Iseconds)

GO_PKG:=github.com/metacubex/mihomo
GO_PKG_LDFLAGS_X:=$(GO_PKG)/constant.Version=$(PKG_BUILD_VERSION) $(GO_PKG)/constant.BuildTime=$(PKG_BUILD_TIME)
GO_PKG_TAGS:=with_gvisor

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/clashoo
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Clashoo (Mihomo)
  DEPENDS:=$(GO_ARCH_DEPENDS) +bash +ca-bundle +curl +yq +firewall4 +ip-full +kmod-inet-diag +kmod-nft-socket +kmod-nft-tproxy +kmod-tun +kmod-dummy
  PROVIDES:=mihomo clash-meta
endef

define Package/clashoo/description
  Mihomo proxy core with runtime environment for Clashoo.
endef

define Package/clashoo/conffiles
/etc/config/clash
endef

define Package/clashoo/install
	$(call GoPackage/Package/Install/Bin,$(1))

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

define Package/clashoo/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	[ -x /usr/bin/mihomo ] && [ ! -x /usr/bin/clash-meta ] && ln -sf /usr/bin/mihomo /usr/bin/clash-meta
	/etc/init.d/clash disable 2>/dev/null
fi
exit 0
endef

define Package/clashoo/prerm
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
