---
name: download-picture
description: >-
  从光环云课堂答案解析页抓取题图 CDN 地址、写入 image_manifest、下载到
  data/practice/assets 并回写题库 JS。用户提到 downloadPicture、题图、拉图、
  下载图片、光环题图、aura 答案页、fetch_aura、image_manifest 时使用。
---

# downloadPicture（光环练习场题图下载）

## 前置条件

1. 用户已在 **Cursor 内置浏览器** 打开并登录 [yun.aura.cn](https://yun.aura.cn)（非系统 Chrome 亦可，脚本读 Cursor 分区 Cookie）。
2. 目标套卷已有 `data/practice/<setKey>.js`，且题文中含题图文件名（如 `9-5.png`、`图片2.png`）。
3. 依赖（缺则安装）：`pip install browser-cookie3 requests`

## 用户需提供

- **答案解析长页 URL**（含 `tid/数字`，如 `…/write/75.html` 或 `…/write/75/lid/0.html`）
- **套卷 key**（如 `zonghe_11`、`moni_2`）
- 可选：**tid** 数字（写入 `data/practice/captures/aura_tid_map.json`）

## 标准流程（必须执行，不要只口头说明）

在仓库根目录运行：

```bash
python3 tools/fetch_aura_practice_images.py \
  "<答案解析页完整 URL>" \
  --set-key <setKey> \
  --tid <tid> \
  --download
```

示例：

```bash
python3 tools/fetch_aura_practice_images.py \
  "https://yun.aura.cn/Test/alsTyper/lid/0/tid/7028333/typer/1/write/75.html" \
  --set-key zonghe_10 --tid 7028333 --download
```

脚本会：

1. 用 Cursor 浏览器 Cookie 拉取页面 HTML
2. 提取 `img01.aura.cn/wx/ueditor/` 图片 URL
3. 按 `download_practice_images.collect_refs()` 的题图顺序对齐文件名
4. 更新 `data/practice/image_manifest.json`
5. `--download` 时调用 `tools/download_practice_images.py --rewrite --set <setKey>`

## 完成后自检

```bash
ls data/practice/assets/<setKey>/ | wc -l
python3 tools/download_practice_images.py --set <setKey>   # 应 missing=0 或仅 skipped_exists
```

在本地练习场打开对应套卷，抽查含图题目解析是否显示图片。

## 失败与备用方案

| 现象 | 处理 |
|------|------|
| `未找到 Cursor 浏览器 Cookie` | 提醒用户在 Cursor 里打开光环并登录一次 |
| `URL 数 < 题图名` | 确认链接是**答案解析长页**；或让用户保持该页打开，用浏览器 Network 抓 `img01.aura.cn` |
| Cookie 脚本失败 | 备用：控制台粘贴 `tools/capture_aura_images.js` → `merge_captured_urls.py <json> --download` |

**备用 B（Agent 代抓）**：用户已打开答案页时，可 `browser_navigate` 到该 URL、滚到底部、`browser_network_requests` 收集 ueditor 图，按题图在 `collect_refs` 中的顺序写入 manifest，再跑 `download_practice_images.py --rewrite --set <setKey>`。

## 关键路径（勿删）

| 路径 | 用途 |
|------|------|
| `tools/fetch_aura_practice_images.py` | 主入口（本技能） |
| `tools/download_practice_images.py` | 下载 + 回写 JS |
| `tools/merge_captured_urls.py` | 控制台 JSON 合并 |
| `tools/capture_aura_images.js` | 浏览器手动抓取 |
| `data/practice/image_manifest.json` | 文件名 → CDN URL |
| `data/practice/captures/aura_tid_map.json` | tid → setKey |
| `data/practice/assets/<setKey>/` | 本地题图 |

更多说明：`data/practice/captures/README.md`

## 与导题技能的关系

- **先** `practice-import-unified` 导入题库（含题图占位文件名）
- **再** `downloadPicture` 补全题图资源
- 无题图套卷（如部分 `zonghe_2`）跳过本技能
