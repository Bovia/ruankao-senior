#!/usr/bin/env python3
"""合并浏览器抓取的图片 URL 到 image_manifest.json，并下载。"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data/practice/image_manifest.json"
DOWNLOAD = ROOT / "tools/download_practice_images.py"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("capture_json", help="capture_aura_images.js 导出的 JSON 文件")
    ap.add_argument("--download", action="store_true", help="合并后立即下载")
    args = ap.parse_args()

    cap = json.loads(Path(args.capture_json).read_text(encoding="utf-8"))
    set_key = cap.get("setKey") or cap.get("set_key")
    urls = cap.get("urls") or {}
    if not set_key or not urls:
        print("无效 capture JSON：需要 setKey 与 urls", file=sys.stderr)
        return 1

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    by_set = manifest.setdefault("bySetKey", {})
    target = by_set.setdefault(set_key, {})
    target.update(urls)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"merged {len(urls)} urls into {set_key}")

    if args.download:
        r = subprocess.run(
            [sys.executable, str(DOWNLOAD), "--rewrite", "--set", set_key],
            cwd=ROOT,
        )
        return r.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
