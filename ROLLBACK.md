# aggregate-feed.yml 修复防灾记录

## 回退点
- 仓库: openwrt-clashoo
- 回退 commit: `24ebabd`
- 文件: `.github/workflows/aggregate-feed.yml`
- 时间: 2026-05-28 17:15 (北京时间)

## 回退命令
```bash
cd /Users/kenzo/kenzo-app/openwrt-clashoo
git checkout 24ebabd -- .github/workflows/aggregate-feed.yml
# 或直接 force push 回 24ebabd
git reset --hard 24ebabd && git push --force
```

## 本次改动
- 第 74 行 `docker run --rm --user root \` → `docker run --rm --user root --entrypoint bash \`
- 第 78 行 `sdk-tools bash -c '` → `sdk-tools -c '`
- 原因: Docker 镜像有 ENTRYPOINT，`bash -c` 被当成参数传给 entrypoint，脚本从未执行
