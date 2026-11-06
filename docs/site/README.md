# Clashoo 在线文档

线上地址：<https://kenzok8.github.io/openwrt-clashoo/>

内容在 `content/`，每页只写正文片段；页头、侧栏、页脚和版本号由 `build.py` 统一生成。构建只用 Python 标准库，没有第三方依赖。

## 本地预览

```sh
python3 docs/site/build.py
python3 -m http.server 4173 --directory .build/docs-site
```

## 自检

```sh
python3 docs/site/build.py --check
```

`--check` 会拦下这几类问题：锚点 id 重复、站内链接指向不存在的文件、导航里漏登的正文页、`h2`/`h3` 缺 `id`、正文没有以 `<h1>` 开头、出现以 `/` 开头的绝对路径。

## 加一页

1. 在 `content/` 新建 `xxx.html`，以 `<h1>` 开头，`h2`/`h3` 都带 `id`
2. 在 `site.json` 的 `nav` 里登记，决定它出现在哪一组
3. 跑一遍 `--check`，再提交

## 内容从哪来

页面正文与仓库 Wiki（`.github/skills/clashoo-user-guide/references/`）同源，Wiki 由 CI 自动同步。改功能说明时两边都要照顾到：站点讲「怎么点」，Wiki 讲「原理与排障内幕」。

## 发布

`.github/workflows/docs.yml` 在 `main` 分支上跑自检、构建并发布到 GitHub Pages。

前提：仓库 Settings → Pages → Source 选择 **GitHub Actions**。没有这一步，`deploy` 任务会因为拿不到 Pages 环境而失败。
