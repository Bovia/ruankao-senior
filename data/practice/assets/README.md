# 练习场题图（本地）

目录：`assets/<setKey>/<文件名>.png`

## 已下载

- `zonghe_1/`：5 张（来自历史导出中的 aura CDN 链接）

## 其余套卷

导出 Markdown 里只有文件名（如 `9-5.png`），**没有外链**，脚本无法自动猜 URL。

补图方式（任选）：

1. 在 `data/practice/image_manifest.json` 的 `bySetKey.<套卷>.<文件名>` 填入图片 URL，然后执行：
   ```bash
   python3 tools/download_practice_images.py --rewrite --set zonghe_8
   ```
2. 浏览器打开原站答案页，F12 → Network 筛 `png`，把 `img01.aura.cn` 地址抄进 manifest。
3. 手动把图片放进对应 `assets/<setKey>/` 目录（文件名与题中一致）。

缺失列表见 `image_manifest.json` 的 `lastReport.missing`。
