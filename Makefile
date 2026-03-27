include $(TOPDIR)/rules.mk 

PKG_NAME:=luci-app-clash
PKG_VERSION:=v1.9.0
PKG_MAINTAINER:=frainzy1477

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
	SECTION:=luci
	CATEGORY:=LuCI
	SUBMENU:=2. Clash For OpenWRT
	TITLE:=LuCI app for clash
	DEPENDS:=+luci-base +bash +coreutils +coreutils-nohup +curl +wget-ssl +jsonfilter +ca-bundle +ipset +kmod-tun
	PKGARCH:=all
	MAINTAINER:=frainzy1477
endef

define Package/$(PKG_NAME)/description
	Luci Interface for clash.
endef

define Build/Prepare
	po2lmo ${CURDIR}/po/zh-cn/clash.po ${CURDIR}/po/zh-cn/clash.zh-cn.lmo
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/clash
endef

define Package/$(PKG_NAME)/prerm
#!/bin/sh
# check if we are on real system
if [ -z "$${IPKG_INSTROOT}" ]; then
    echo "Removing rc.d symlink for clash"
    /etc/init.d/clash disable
    /etc/init.d/clash stop
    echo "Removing firewall rule for clash"
	uci -q batch <<-EOF >/dev/null
	delete firewall.clash
	commit firewall
EOF
fi

exit 0
endef

define Package/$(PKG_NAME)/preinst
#!/bin/sh
/etc/init.d/clash disable 2>/dev/null
if [ -z "$${IPKG_INSTROOT}" ]; then
	rm -rf /tmp/dnsmasq.d/custom_list.conf 2>/dev/null
	rm -rf /tmp/dnsmasq.clash 2>/dev/null
	mv /etc/config/clash /etc/config/clash.bak 2>/dev/null
	rm -rf /usr/lib/lua/luci/model/cbi/clash 2>/dev/null
	rm -rf /usr/lib/lua/luci/view/clash 2>/dev/null
	rm -rf /usr/share/clash/new_core_version 2>/dev/null
	rm -rf /usr/share/clash/new_clashr_core_version 2>/dev/null
	rm -rf /usr/share/clash/new_luci_version 2>/dev/null
	rm -rf /usr/share/clash/web 2>/dev/null
	mv /usr/share/clash/config/sub/config.yaml /usr/share/clashbackup/config.bak1 2>/dev/null
	mv /usr/share/clash/config/upload/config.yaml /usr/share/clashbackup/config.bak2 2>/dev/null
	mv /usr/share/clash/config/custom/config.yaml /usr/share/clashbackup/config.bak3 2>/dev/null
	mv /usr/share/clash/rule.yaml /usr/share/clashbackup/rule.bak 2>/dev/null
fi


exit 0
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh

if [ -z "$${IPKG_INSTROOT}" ]; then
	rm -rf /tmp/luci*
	mv /etc/config/clash.bak /etc/config/clash 2>/dev/null
	mv /usr/share/clashbackup/config.bak1 /usr/share/clash/config/sub/config.yaml 2>/dev/null
	mv /usr/share/clashbackup/config.bak2 /usr/share/clash/config/upload/config.yaml 2>/dev/null
	mv /usr/share/clashbackup/config.bak3 /usr/share/clash/config/custom/config.yaml 2>/dev/null
	mv /usr/share/clashbackup/rule.bak /usr/share/clash/rule.yaml 2>/dev/null
	/etc/init.d/clash disable 2>/dev/null
fi
/etc/init.d/clash disable 2>/dev/null

exit 0
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DIR) $(1)/etc/clash
	$(INSTALL_DIR) $(1)/usr/share/
	$(INSTALL_DIR) $(1)/usr/share/clash
	$(INSTALL_DIR) $(1)/usr/share/rpcd	
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d	
	$(INSTALL_DIR) $(1)/usr/share/clash/rules
	$(INSTALL_DIR) $(1)/usr/share/clash/rules/g_rules
	$(INSTALL_DIR) $(1)/etc/clash/dashboard
	$(INSTALL_DIR) $(1)/etc/clash/dashboard/img
	$(INSTALL_DIR) $(1)/etc/clash/dashboard/js
	$(INSTALL_DIR) $(1)/usr/share/clash/yacd
	$(INSTALL_DIR) $(1)/etc/clash/clashtun
	$(INSTALL_DIR) $(1)/etc/clash/dtun
	$(INSTALL_DIR) $(1)/usr/share/clashbackup
	$(INSTALL_DIR) $(1)/usr/share/clash/create
	$(INSTALL_DIR) $(1)/etc/clash/provider
	$(INSTALL_DIR) $(1)/etc/clash/proxyprovider
	$(INSTALL_DIR) $(1)/etc/clash/ruleprovider
	$(INSTALL_DIR) $(1)/usr/share/clash/config
	$(INSTALL_DIR) $(1)/usr/share/clash/config/sub
	$(INSTALL_DIR) $(1)/usr/share/clash/config/upload
	$(INSTALL_DIR) $(1)/usr/share/clash/config/custom

	
	$(INSTALL_BIN) 	./root/etc/init.d/clash $(1)/etc/init.d/clash
	$(INSTALL_CONF) ./root/etc/config/clash $(1)/etc/config/clash
	$(INSTALL_CONF) ./root/etc/clash/Country.mmdb $(1)/etc/clash
	$(INSTALL_BIN) ./root/usr/share/clash/create/* $(1)/usr/share/clash/create
	$(INSTALL_BIN) ./root/usr/share/clash/*.sh $(1)/usr/share/clash
	$(INSTALL_BIN) ./root/usr/share/rpcd/acl.d/luci-app-clash.json $(1)/usr/share/rpcd/acl.d
	$(INSTALL_BIN) ./root/usr/share/clash/rules/g_rules/Steam.rules $(1)/usr/share/clash/rules/g_rules
	$(INSTALL_BIN) ./root//usr/share/clash/rules/rules.list $(1)/usr/share/clash/rules
	
	$(INSTALL_BIN) ./root/usr/share/clash/luci_version $(1)/usr/share/clash
	$(INSTALL_BIN) ./root/usr/share/clash/rule.yaml $(1)/usr/share/clash
	$(INSTALL_BIN) ./root/usr/share/clash/server.list $(1)/usr/share/clash
	$(INSTALL_BIN) ./root/usr/share/clash/clash_real.txt $(1)/usr/share/clash
	$(INSTALL_BIN) ./root/usr/share/clash/logstatus_check $(1)/usr/share/clash
	$(INSTALL_BIN) ./root/usr/share/clash/clash.txt $(1)/usr/share/clash
	$(INSTALL_BIN) ./root/usr/share/clash/chinaipset.sh $(1)/usr/share/clash
	$(INSTALL_BIN) ./root/usr/share/clash/china_ip.txt $(1)/usr/share/clash
	
	$(INSTALL_BIN) ./root/usr/share/clash/dashboard/index.html $(1)/etc/clash/dashboard
	$(INSTALL_BIN) ./root/usr/share/clash/dashboard/main.658aa6a6e3feec8f168b.css $(1)/etc/clash/dashboard
	$(INSTALL_BIN) ./root/usr/share/clash/dashboard/img/ffac0fa1d89f15922b4594863b8b32e9.png $(1)/etc/clash/dashboard/img
	$(INSTALL_BIN) ./root/usr/share/clash/dashboard/js/1.bundle.658aa6a6e3feec8f168b.min.js $(1)/etc/clash/dashboard/js
	$(INSTALL_BIN) ./root/usr/share/clash/dashboard/js/bundle.658aa6a6e3feec8f168b.min.js $(1)/etc/clash/dashboard/js
	$(INSTALL_BIN) ./root/usr/share/clash/yacd/* $(1)/usr/share/clash/yacd
	
	# luci 23.05+ JS 视图（htdocs）
	$(INSTALL_DIR) $(1)/www/luci-static/resources/tools
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/clash
	$(INSTALL_DATA) ./htdocs/luci-static/resources/tools/clash.js $(1)/www/luci-static/resources/tools
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/clash/app.js $(1)/www/luci-static/resources/view/clash
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/clash/log.js $(1)/www/luci-static/resources/view/clash
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/clash/index.js $(1)/www/luci-static/resources/view/clash

	# luci 23.05+ menu.d & rpcd ucode
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DIR) $(1)/usr/share/rpcd/ucode
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-clash.json $(1)/usr/share/luci/menu.d
	$(INSTALL_BIN)  ./root/usr/share/rpcd/ucode/luci.clash $(1)/usr/share/rpcd/ucode
endef

define Package/luci-i18n-clash-zh-cn
	SECTION:=luci
	CATEGORY:=LuCI
	TITLE:=luci-app-clash - Simplified Chinese (zh-cn)
	DEPENDS:=luci-app-clash
	HIDDEN:=1
endef

define Package/luci-i18n-clash-zh-cn/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	$(INSTALL_DATA) ./po/zh-cn/clash.zh-cn.lmo $(1)/usr/lib/lua/luci/i18n
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
$(eval $(call BuildPackage,luci-i18n-clash-zh-cn))
