#!/usr/bin/env python3
"""从光环 Tpaper 列表页导出综合题单选卷（题目 + 解析 + 你的答案 + 题图）。"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
import time
from html import unescape
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
PRACTICE = ROOT / "data" / "practice"
TID_MAP = PRACTICE / "captures" / "aura_tid_map.json"
EXPORT = ROOT / "data" / "export_my_answers_and_history.json"

# 复用案例导出脚本的 session / clean_html / 拉图
_case_mod = importlib.util.spec_from_file_location(
    "export_aura_case_papers", ROOT / "tools" / "export_aura_case_papers.py"
)
_case = importlib.util.module_from_spec(_case_mod)
assert _case_mod.loader
_case_mod.loader.exec_module(_case)

session = _case.session
clean_html = _case.clean_html
ueditor_urls = _case.ueditor_urls
download_images = _case.download_images
BASE = _case.BASE

IMG_TAG = re.compile(r"<img\b[^>]*>", re.I)


def parse_index(html: str) -> list[dict]:
    """解析综合题列表：套次编号、试卷 tid、最近一次作答 tid。"""
    sid_m = re.search(r"/sid/(\d+)\.html", html)
    sid = sid_m.group(1) if sid_m else "1250"
    parts = re.split(r'<li class="tk_nr_li">', html)[1:]
    items = []
    for part in parts:
        m = re.search(r"软考高项综合测试题（(\d+)）", part)
        if not m:
            continue
        num = int(m.group(1))
        paper = re.search(r"/Tpaper/detail/lid/\d+/tid/(\d+)/sid/", part)
        results = re.findall(rf"/Test/index/tid/(\d+)/sid/{sid}", part)
        items.append(
            {
                "num": num,
                "title": f"软考高项综合测试题（{num}）",
                "key": f"zonghe_{num}",
                "paper_tid": paper.group(1) if paper else "",
                "result_tid": results[0] if results else "",
                "sid": sid,
            }
        )
    return sorted(items, key=lambda x: x["num"])


def find_write_path(html: str) -> str:
    m = re.search(r"/Test/alsTyper/lid/0/tid/\d+/typer/1/write/\d+\.html", html)
    return m.group(0) if m else ""


def replace_imgs(chunk: str, img_map: dict[str, str], set_key: str) -> str:
    def repl(tag: str) -> str:
        src_m = re.search(r'src="([^"]+)"', tag, re.I)
        if not src_m:
            return ""
        url = src_m.group(1)
        alt_m = re.search(r'(?:alt|title)="([^"]+)"', tag, re.I)
        name = alt_m.group(1) if alt_m else url.rsplit("/", 1)[-1]
        local = img_map.get(url)
        if local:
            path = f"./data/practice/assets/{set_key}/{Path(local).name}"
        else:
            path = url
        return f"![{name}]({path})"

    return IMG_TAG.sub(lambda m: repl(m.group(0)), chunk)


def normalize_question_text(text: str) -> str:
    text = re.sub(r"^(\d+[、，,.])\s*\n\s*(\[单选\])", r"\1 \2", text, flags=re.M)
    text = re.sub(r"<div\s*$", "", text, flags=re.M)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_write_page(html: str, img_map: dict[str, str], set_key: str) -> str:
    """解析 typer/1 答案解析长页 → 练习场 Markdown。"""
    starts = [m.end() for m in re.finditer(r'class="st_content_txt_tm[^"]*"[^>]*>', html)]
    if not starts:
        return ""
    blocks: list[str] = []
    for i, start in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(html)
        chunk = replace_imgs(html[start:end], img_map, set_key)
        text = normalize_question_text(clean_html(chunk))
        if text:
            blocks.append(text)
    return "\n\n".join(blocks) + "\n"


def load_clean_module():
    spec = importlib.util.spec_from_file_location(
        "clean_practice_markdown", ROOT / "tools" / "clean_practice_markdown.py"
    )
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


def update_bovia_answers(set_key: str, answers: dict[str, str]) -> None:
    if not answers or not EXPORT.exists():
        return
    data = json.loads(EXPORT.read_text(encoding="utf-8"))
    raw = data["items"].get("jiyiqi-practice-user-answers-v1", "{}")
    ua = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(ua, dict):
        ua = {"v": 1, "bySetKey": {}}
    by_set = ua.setdefault("bySetKey", {})
    by_set[set_key] = {**by_set.get(set_key, {}), **answers}
    ua["generatedAt"] = int(time.time() * 1000)
    data["items"]["jiyiqi-practice-user-answers-v1"] = json.dumps(
        ua, ensure_ascii=False, separators=(",", ":")
    )
    compact = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    EXPORT.write_text(compact + "\n", encoding="utf-8")
    EXPORT.with_suffix(".js").write_text(
        "window.__PRACTICE_SEED_DATA__ = " + compact + ";\n", encoding="utf-8"
    )


def update_tid_map(result_tid: str, set_key: str) -> None:
    mapping: dict[str, str] = {}
    if TID_MAP.exists():
        mapping = json.loads(TID_MAP.read_text(encoding="utf-8"))
    mapping[str(result_tid)] = set_key
    TID_MAP.parent.mkdir(parents=True, exist_ok=True)
    TID_MAP.write_text(
        json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def export_from_write_url(
    s,
    write_url: str,
    set_key: str,
    clean_mod,
    *,
    result_tid: str = "",
) -> dict:
    wr = s.get(write_url, timeout=120)
    wr.raise_for_status()
    html = wr.text

    assets = PRACTICE / "assets" / set_key
    urls: list[str] = []
    seen: set[str] = set()
    for u in ueditor_urls(html):
        if u not in seen:
            seen.add(u)
            urls.append(u)

    img_map = download_images(s, urls, assets)
    raw_md = parse_write_page(html, img_map, set_key)
    if not raw_md.strip():
        sys.exit(f"{set_key} 未解析到题目")

    md_path = PRACTICE / f"{set_key}.md"
    md_path.write_text(raw_md, encoding="utf-8")

    answers = clean_mod.extract_user_answers(raw_md)
    cleaned = clean_mod.clean_markdown(raw_md, renumber=True, strip_user_answer=True)
    md_path.write_text(cleaned, encoding="utf-8")
    clean_mod.write_js(set_key, cleaned)

    update_bovia_answers(set_key, answers)
    tid = result_tid or re.search(r"/tid/(\d+)/", write_url)
    if tid:
        update_tid_map(tid.group(1) if hasattr(tid, "group") else tid, set_key)

    qn = len(clean_mod.split_questions(cleaned))
    print(f"✓ {set_key}: {qn} 题, {len(urls)} 图, {len(answers)} 条你的答案 → bovia")
    return {
        "key": set_key,
        "question_count": qn,
        "answer_count": len(answers),
        "image_count": len(urls),
        "write_url": write_url,
    }


def export_one(s, meta: dict, clean_mod) -> dict:
    set_key = meta["key"]
    num = meta["num"]
    if not meta["result_tid"]:
        sys.exit(f"综合题{num} 无作答记录，请先在光环交卷后再导出")

    idx_url = urljoin(BASE, f"/Test/index/tid/{meta['result_tid']}/sid/{meta['sid']}.html")
    ir = s.get(idx_url, timeout=60)
    ir.raise_for_status()
    write_path = find_write_path(ir.text)
    if not write_path:
        sys.exit(f"综合题{num} 未找到答案解析页链接")

    source_url = urljoin(BASE, write_path)
    out = export_from_write_url(
        s, source_url, set_key, clean_mod, result_tid=meta["result_tid"]
    )
    return {**meta, **out}


def main() -> int:
    ap = argparse.ArgumentParser(description="导出光环综合题/模考单选卷")
    ap.add_argument(
        "index_url",
        nargs="?",
        default="",
        help="试卷列表页 URL（与 --write-url 二选一）",
    )
    ap.add_argument(
        "--write-url",
        default="",
        help="答案解析长页 URL，如 …/typer/1/write/75.html",
    )
    ap.add_argument(
        "--set-key",
        default="",
        help="落盘 key，如 zonghe_11 / moni_2",
    )
    ap.add_argument(
        "--nums",
        type=str,
        default="",
        help="仅导出指定套次，逗号分隔，如 11,12",
    )
    args = ap.parse_args()

    clean_mod = load_clean_module()
    s = session()

    if args.write_url:
        if not args.set_key:
            sys.exit("使用 --write-url 时必须指定 --set-key")
        export_from_write_url(s, args.write_url, args.set_key, clean_mod)
        print(f"\n完成：{args.set_key}")
        return 0

    index_url = args.index_url or "https://yun.aura.cn/Tpaper/index/lid/7801/sid/1250.html"
    want = {int(x.strip()) for x in args.nums.split(",") if x.strip()} if args.nums else None

    r = s.get(index_url, timeout=60)
    r.raise_for_status()
    items = parse_index(r.text)
    if want:
        items = [x for x in items if x["num"] in want]
    if not items:
        sys.exit("未解析到目标综合题，请确认 URL、套次与登录状态")

    exported = [export_one(s, meta, clean_mod) for meta in items]
    print(f"\n完成：{', '.join(x['key'] for x in exported)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
