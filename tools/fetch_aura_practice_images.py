#!/usr/bin/env python3
"""从光环答案解析页 HTML 提取题图 URL（需 Cursor 内置浏览器已登录 yun.aura.cn）。"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "practice" / "image_manifest.json"
TID_MAP = ROOT / "data" / "practice" / "captures" / "aura_tid_map.json"
CURSOR_COOKIES = (
    Path.home() / "Library/Application Support/Cursor/Partitions/cursor-browser/Cookies"
)
UEDITOR_RE = re.compile(r"https://img01\.aura\.cn/wx/ueditor/[^\"\\s'<>\\]+")


def ordered_urls(html: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for u in UEDITOR_RE.findall(html):
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def load_ordered_names(set_key: str) -> list[str]:
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "dl", ROOT / "tools/download_practice_images.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    refs = mod.collect_refs()
    return refs.get(set_key, [])


def align(urls: list[str], names: list[str]) -> dict[str, str]:
    if not names:
        return {Path(u).name: u for u in urls}
    u = list(urls)
    if len(u) > len(names):
        u = u[len(u) - len(names) :]
    if len(u) < len(names):
        raise SystemExit(f"URL 数 {len(u)} < 题图名 {len(names)}，请确认已登录且页面含全部题图")
    return dict(zip(names, u[: len(names)]))


def main() -> int:
    ap = argparse.ArgumentParser(description="从光环答案页抓取题图 CDN 地址")
    ap.add_argument("url", help="答案解析页 URL（含 tid/…）")
    ap.add_argument("--set-key", required=True, help="如 zonghe_11")
    ap.add_argument("--tid", type=int, default=0)
    ap.add_argument("--download", action="store_true", help="写入 manifest 后立即下载")
    args = ap.parse_args()

    try:
        import browser_cookie3
        import requests
    except ImportError:
        print("需要: pip install browser-cookie3 requests", file=sys.stderr)
        return 1

    if not CURSOR_COOKIES.exists():
        print(f"未找到 Cursor 浏览器 Cookie: {CURSOR_COOKIES}", file=sys.stderr)
        print("请先在 Cursor 内置浏览器登录 yun.aura.cn", file=sys.stderr)
        return 1

    cj = browser_cookie3.chromium(cookie_file=str(CURSOR_COOKIES), domain_name="yun.aura.cn")
    cookies = {c.name: c.value for c in cj}
    r = requests.get(
        args.url,
        cookies=cookies,
        timeout=60,
        headers={"User-Agent": "Mozilla/5.0", "Referer": "https://yun.aura.cn/"},
    )
    if r.status_code != 200 or "登录" in r.text[:2000]:
        print(f"页面异常 status={r.status_code}，请确认已在 Cursor 浏览器登录", file=sys.stderr)
        return 1

    urls = ordered_urls(r.text)
    names = load_ordered_names(args.set_key)
    mapping = align(urls, names)
    print(f"found {len(urls)} cdn urls -> mapped {len(mapping)} files for {args.set_key}")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    manifest.setdefault("bySetKey", {})[args.set_key] = mapping
    if args.tid:
        tid_map = json.loads(TID_MAP.read_text(encoding="utf-8")) if TID_MAP.exists() else {}
        tid_map[str(args.tid)] = args.set_key
        TID_MAP.write_text(json.dumps(tid_map, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.download:
        r = subprocess.run(
            [
                sys.executable,
                str(ROOT / "tools/download_practice_images.py"),
                "--rewrite",
                "--set",
                args.set_key,
            ],
            cwd=ROOT,
        )
        return r.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
