# 光环题图抓取（下次复用）

在 **Cursor 内置浏览器** 登录 [光环云课堂](https://yun.aura.cn) 后，把答案解析页链接发给 Agent，或本地执行：

```bash
# 示例：综合题 10
python3 tools/fetch_aura_practice_images.py \
  "https://yun.aura.cn/Test/alsTyper/lid/0/tid/7028333/typer/1/write/75.html" \
  --set-key zonghe_10 --tid 7028333 --download
```

- `--set-key`：题库 JS 名（须已有 `data/practice/<set-key>.js` 且题中含图文件名）
- `--tid`：可选，写入 `aura_tid_map.json` 便于对照
- `--download`：写入 `image_manifest.json` 并下载到 `assets/<set-key>/`，回写 JS

## 备用：控制台手动

1. 答案解析页 F12 → 粘贴 `tools/capture_aura_images.js`
2. 复制 JSON，保存为任意路径后：

```bash
python3 tools/merge_captured_urls.py /path/to/capture.json --download
```

## 文件说明

| 路径 | 用途 |
|------|------|
| `image_manifest.json` | 各套卷文件名 → CDN URL（主清单） |
| `aura_tid_map.json` | tid → setKey 对照 |
| `assets/<setKey>/` | 已下载题图 |
| `tools/download_practice_images.py` | 仅下载 / 回写（已有 URL 时） |
| `tools/batch_capture_download.py` | 批量 `--download` 多套 |
