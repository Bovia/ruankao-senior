#!/usr/bin/env python3
"""从 image_manifest 下载题图到 data/practice/assets/<setKey>/，并回写题库引用。"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRACTICE = ROOT / "data" / "practice"
ASSETS = PRACTICE / "assets"
MANIFEST = PRACTICE / "image_manifest.json"

PLACEHOLDER = re.compile(r"【题图：([^】]+)】")
IMG_PATTERNS = [
    re.compile(r"图片\d+\.png"),
    re.compile(r"\d+-\d+(?:-\d+)*(?:-\d+)*\.png"),
    re.compile(r"(?<!\d-)(?<![\w/])\d{1,3}\.png"),
    re.compile(r"image\.gif"),
    re.compile(r"企业微信截图_[\w.-]+\.png"),
]
JS_KEY_RE = re.compile(
    r'\(window\.practiceMarkdown\s*=\s*window\.practiceMarkdown\s*\|\|\s*\{\}\)\["([^"]+)"\]\s*=\s*`',
)

def read_practice_body(key: str) -> str:
    js = PRACTICE / f"{key}.js"
    raw = js.read_text(encoding="utf-8")
    m = JS_KEY_RE.search(raw)
    if not m:
        return ""
    start = m.end()
    end = raw.rfind("`;", start)
    return raw[start:end] if end > 0 else ""


def extract_image_names(text: str) -> set[str]:
    names: set[str] = set()
    for m in PLACEHOLDER.finditer(text):
        n = m.group(1).strip()
        if n and not n.startswith("http"):
            names.add(n)
    for pat in IMG_PATTERNS:
        for m in pat.finditer(text):
            names.add(m.group(0))
    return names


def collect_refs() -> dict[str, list[str]]:
    refs: dict[str, list[str]] = {}
    for js in sorted(PRACTICE.glob("zonghe_*.js")):
        key = js.stem
        if key.startswith("zonghe_"):
            names = extract_image_names(read_practice_body(key))
            if names:
                refs[key] = sorted(names)
    moni = PRACTICE / "moni_1.js"
    if moni.exists():
        names = extract_image_names(read_practice_body("moni_1"))
        if names:
            refs["moni_1"] = sorted(names)
    return refs


def load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text(encoding="utf-8"))
    return {"bySetKey": {}, "urlByFile": {}}


def save_manifest(data: dict) -> None:
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def download(url: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    try:
        r = subprocess.run(
            [
                "curl",
                "-fsSL",
                "-m",
                "45",
                "-H",
                "User-Agent: Mozilla/5.0",
                "-H",
                "Referer: https://aura.cn/",
                "-o",
                str(tmp),
                url,
            ],
            capture_output=True,
            timeout=50,
        )
        if r.returncode != 0 or not tmp.exists() or tmp.stat().st_size < 200:
            tmp.unlink(missing_ok=True)
            return False
        tmp.replace(dest)
        return True
    except (OSError, subprocess.TimeoutExpired):
        tmp.unlink(missing_ok=True)
        return False


def local_img_ref(set_key: str, filename: str) -> str:
    return f"![{filename}](./data/practice/assets/{set_key}/{filename})"


def rewrite_practice_js(key: str, downloaded: set[str]) -> int:
    js_path = PRACTICE / f"{key}.js"
    raw = js_path.read_text(encoding="utf-8")
    m = JS_KEY_RE.search(raw)
    if not m:
        return 0
    start, end = m.end(), raw.rfind("`;", m.end())
    body = raw[start:end]
    n = 0
    asset_prefix = f"./data/practice/assets/{key}/"

    def repl_placeholder(mo: re.Match) -> str:
        nonlocal n
        name = mo.group(1).strip()
        if name in downloaded:
            n += 1
            return local_img_ref(key, name)
        return mo.group(0)

    body = PLACEHOLDER.sub(repl_placeholder, body)

    def repl_bare(mo: re.Match) -> str:
        nonlocal n
        name = mo.group(0)
        if asset_prefix in body[max(0, mo.start() - 80) : mo.end() + 80]:
            return name
        if name in downloaded:
            n += 1
            return local_img_ref(key, name)
        return name

    for pat in IMG_PATTERNS:
        body = pat.sub(repl_bare, body)

    new_raw = raw[:start] + body + raw[end:]
    js_path.write_text(new_raw, encoding="utf-8")
    md = PRACTICE / f"{key}.md"
    if md.exists():
        md.write_text(body + "\n", encoding="utf-8")
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rewrite", action="store_true", help="下载后把题文中的占位替换为本地 markdown 图片")
    ap.add_argument("--set", dest="sets", action="append", help="只处理指定 setKey")
    args = ap.parse_args()

    manifest = load_manifest()
    by_set: dict[str, dict[str, str]] = manifest.setdefault("bySetKey", {})
    url_global: dict[str, str] = manifest.setdefault("urlByFile", {})
    refs = collect_refs()
    if args.sets:
        refs = {k: v for k, v in refs.items() if k in args.sets}

    ok, fail = 0, 0
    report: dict[str, dict] = {"downloaded": {}, "missing": {}, "skipped_exists": {}}

    for set_key, names in refs.items():
        set_urls = by_set.setdefault(set_key, {})
        downloaded_names: set[str] = set()
        for name in names:
            dest = ASSETS / set_key / name
            if dest.exists() and dest.stat().st_size > 500:
                report["skipped_exists"].setdefault(set_key, []).append(name)
                downloaded_names.add(name)
                ok += 1
                continue
            url = set_urls.get(name) or url_global.get(name)
            if not url:
                report["missing"].setdefault(set_key, []).append(name)
                fail += 1
                continue
            if download(url, dest):
                report["downloaded"].setdefault(set_key, []).append(name)
                downloaded_names.add(name)
                ok += 1
                time.sleep(0.15)
            else:
                report["missing"].setdefault(set_key, []).append(name)
                fail += 1

        if args.rewrite and downloaded_names:
            rewrite_practice_js(set_key, downloaded_names)

    manifest["lastRun"] = int(time.time() * 1000)
    manifest["lastReport"] = report
    save_manifest(manifest)

    print(f"done: ok={ok} missing={fail}")
    for set_key, names in report.get("missing", {}).items():
        print(f"  missing {set_key}: {len(names)}")
    for set_key, names in report.get("downloaded", {}).items():
        print(f"  new {set_key}: {len(names)}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
