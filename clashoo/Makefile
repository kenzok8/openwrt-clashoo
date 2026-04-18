include $(TOPDIR)/rules.mk

PKG_NAME:=clashoo
PKG_SHORT_SHA:=2337d70
PKG_COMMIT_DATE:=2026.04.18

PKG_VERSION:=$(PKG_COMMIT_DATE)~$(PKG_SHORT_SHA)
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-alpha-$(PKG_SHORT_SHA).tar.gz
PKG_SOURCE_SUBDIR:=$(PKG_NAME)-alpha-$(PKG_SHORT_SHA)
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-alpha-$(PKG_SHORT_SHA)
PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/MetaCubeX/mihomo.git
PKG_SOURCE_VERSION:=2337d70d86fa15efe7b69ee54bff6139ebfabcf6
PKG_MIRROR_HASH:=3af383ae171c160eaa359b3c3a5f916e8a007a6af2086d819f4d6a416986412c
PKG_BUILD_VERSION:=alpha-$(PKG_SHORT_SHA)

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
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle +yq +firewall4 +ip-full +kmod-inet-diag +kmod-nft-socket +kmod-nft-tproxy +kmod-tun +kmod-dummy
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
	$(INSTALL_DIR) $(1)/usr/share/clash/runtime
	$(INSTALL_DIR) $(1)/usr/share/clash/update
	$(INSTALL_DIR) $(1)/usr/share/clash/net
	$(INSTALL_DIR) $(1)/usr/share/clash/rpc
	$(INSTALL_DIR) $(1)/usr/share/clash/lib
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
if [ -z "${IPKG_INSTROOT}" ]; then
	[ -x /usr/bin/mihomo ] && [ ! -x /usr/bin/clash-meta ] && ln -sf /usr/bin/mihomo /usr/bin/clash-meta
	rm -f /usr/share/clash/check_luci_version.sh /usr/share/clash/check_clash_meta_version.sh /usr/share/clash/check_mihomo_core_version.sh
	rm -f /usr/share/clash/cuslist.sh /usr/share/clash/groups.sh /usr/share/clash/load_groups.sh /usr/share/clash/panel_diag.sh
	rm -f /usr/share/clash/rmlist.sh /usr/share/clash/uplist.sh /usr/share/clash/rpc_restart_async.sh /usr/share/clash/rpc_update_china_ip_async.sh
	rm -rf /usr/share/clash/create
	/etc/init.d/clash disable 2>/dev/null
fi
exit 0
endef

define Package/clashoo/prerm
#!/bin/sh
if [ -z "${IPKG_INSTROOT}" ]; then
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
