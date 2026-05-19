#!/usr/bin/env python3
"""从光环 Tpaper 列表页导出全部案例题（题目 + 参考答案 + 题图）。"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html import unescape
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
CURSOR_COOKIES = (
    Path.home() / "Library/Application Support/Cursor/Partitions/cursor-browser/Cookies"
)
BASE = "https://yun.aura.cn"
UEDITOR_RE = re.compile(r"https://img01\.aura\.cn/wx/ueditor/[^\"'\\s<>]+")


def session():
    try:
        import browser_cookie3
        import requests
    except ImportError:
        sys.exit("需要: pip install browser-cookie3 requests")

    if not CURSOR_COOKIES.exists():
        sys.exit(f"未找到 Cursor Cookie: {CURSOR_COOKIES}\n请先在 Cursor 内置浏览器登录 yun.aura.cn")

    cj = browser_cookie3.chromium(cookie_file=str(CURSOR_COOKIES), domain_name="yun.aura.cn")
    s = requests.Session()
    s.cookies.update({c.name: c.value for c in cj})
    s.headers.update({"User-Agent": "Mozilla/5.0", "Referer": BASE + "/"})
    return s


def clean_html(html: str) -> str:
    html = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.S | re.I)
    html = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.S | re.I)
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    html = re.sub(r"</p>\s*<p[^>]*>", "\n", html, flags=re.I)
    html = re.sub(r"<[^>]+>", "", html)
    text = unescape(html)
    text = re.sub(r"[ \t\r]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def ueditor_urls(html: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for u in UEDITOR_RE.findall(html):
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def download_images(s, urls: list[str], dest_dir: Path) -> dict[str, str]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    mapping: dict[str, str] = {}
    for url in urls:
        name = url.rsplit("/", 1)[-1].split("?")[0]
        local = dest_dir / name
        rel = f"assets/{dest_dir.name}/{name}"
        mapping[url] = rel
        if local.exists():
            continue
        r = s.get(url, timeout=60)
        r.raise_for_status()
        local.write_bytes(r.content)
    return mapping


def parse_index(html: str) -> list[dict]:
    """解析列表页：案例编号、试卷 tid、最近一次作答 tid。"""
    parts = re.split(r'<li class="tk_nr_li">', html)[1:]
    items = []
    for part in parts:
        m = re.search(r"软考高项综合测试题-案例（(\d+)）", part)
        if not m:
            continue
        num = int(m.group(1))
        paper = re.search(r"/Tpaper/detail/lid/\d+/tid/(\d+)/sid/", part)
        results = re.findall(r"/Test/index/tid/(\d+)/sid/", part)
        items.append(
            {
                "num": num,
                "title": f"软考高项综合测试题-案例（{num}）",
                "paper_tid": paper.group(1) if paper else "",
                "result_tid": results[0] if results else "",
            }
        )
    return sorted(items, key=lambda x: x["num"])


def parse_detail_questions(html: str) -> list[dict]:
    """Tpaper/detail：仅题目（无官方答案）。"""
    m = re.search(r"<!--简答开始(.*?)<!--简答结束", html, re.S)
    if not m:
        return []
    block = m.group(1)
    chunks = re.findall(
        r'class="st_content_txt_tm short_textarea_id"[^>]*>(.*?)</div>\s*<div class="st_content_txt_xx',
        block,
        re.S,
    )
    return [
        {"raw_html": raw, "stem": clean_html(raw), "answer": ""} for raw in chunks
    ]


def trim_stem_html(chunk: str) -> str:
    for marker in (r"<span class=\"answer_wrong\">关键词", r"你的答案", r"正确答案"):
        m = re.search(marker, chunk)
        if m:
            return chunk[: m.start()]
    return chunk


def extract_correct_answer(chunk: str) -> str:
    for block in re.findall(
        r'class="jxxq_jx_txt"[^>]*>(.*?)(?=class="jxxq_jx_txt"|$)', chunk, re.S
    ):
        if "正确答案" in block or "answer_right" in block:
            answer = clean_html(block)
            answer = re.sub(r"^正确答案[：:]\s*", "", answer)
            answer = re.sub(r"\s*<div\s*$", "", answer)
            return answer.strip()
    return ""


def find_question_positions(html: str) -> list[tuple[int, str]]:
    """兼容「试题一」连写与 HTML 拆开的「试题</span>…二」。"""
    pat = re.compile(r"【(?:<[^>]+>)*试题(?:<[^>]+>)*([一二三])")
    positions: list[tuple[int, str]] = []
    for m in pat.finditer(html):
        positions.append((m.start(), f"试题{m.group(1)}"))
    if positions:
        return positions
    labels = ["试题一", "试题二", "试题三"]
    return [(html.find(l), l) for l in labels if html.find(l) >= 0]


def parse_write_page(html: str) -> list[dict]:
    """Test/alsTyper write：题目 + 正确答案。"""
    positions = find_question_positions(html)
    if not positions:
        return []
    positions.sort()
    questions = []
    for i, (pos, label) in enumerate(positions):
        end = positions[i + 1][0] if i + 1 < len(positions) else len(html)
        chunk = html[pos:end]
        stem_html = trim_stem_html(chunk)
        stem = clean_html(stem_html)
        stem = re.sub(r"^【简答】\s*", "", stem)
        answer = extract_correct_answer(chunk)
        questions.append(
            {"label": label, "raw_html": stem_html, "stem": stem, "answer": answer}
        )
    return questions


def build_markdown(
    meta: dict,
    questions: list[dict],
    img_map: dict[str, str],
    source_url: str,
    has_answers: bool,
) -> str:
    lines = [
        f"# {meta['title']}",
        "",
        f"- 试卷 tid：`{meta.get('paper_tid', '')}`",
        f"- 作答记录 tid：`{meta.get('result_tid', '') or '（无，仅题目）'}`",
        f"- 来源：{source_url}",
        "",
    ]
    if not has_answers:
        lines += [
            "> 本套尚未在光环生成「查看结果」解析页，以下为试卷详情中的题目与题图；",
            "> 提交作答后可用本脚本重新导出以补全参考答案。",
            "",
        ]

    for i, q in enumerate(questions, 1):
        label = q.get("label") or f"第{i}题"
        lines += [f"## {label}", ""]
        stem = q["stem"]
        lines.append(stem)
        lines.append("")
        raw = q.get("raw_html", "")
        img_urls = ueditor_urls(raw)
        if img_urls:
            lines.append("**题图：**")
            lines.append("")
            for url in img_urls:
                lines.append(f"![题图]({img_map.get(url, url)})")
            lines.append("")
        if q.get("answer"):
            lines += ["### 参考答案", "", q["answer"], ""]
        lines.append("---")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="导出光环案例题（含图）")
    ap.add_argument(
        "index_url",
        nargs="?",
        default="https://yun.aura.cn/Tpaper/index/lid/7801/sid/1119.html",
        help="试卷列表页 URL",
    )
    ap.add_argument(
        "--out-dir",
        default=str(ROOT / "data" / "case_gaoxiang"),
        help="输出目录",
    )
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    s = session()
    r = s.get(args.index_url, timeout=60)
    r.raise_for_status()
    items = parse_index(r.text)
    if not items:
        sys.exit("未解析到案例题，请确认 URL 与登录状态")

    manifest = {"index_url": args.index_url, "cases": []}

    for meta in items:
        num = meta["num"]
        slug = f"case_{num:02d}"
        assets = out_dir / "assets" / slug
        all_html = ""
        questions: list[dict] = []
        has_answers = False
        source_url = ""

        if meta["result_tid"]:
            write_path = f"/Test/alsTyper/lid/0/tid/{meta['result_tid']}/typer/5/write/3.html"
            source_url = urljoin(BASE, write_path)
            wr = s.get(source_url, timeout=60)
            wr.raise_for_status()
            all_html = wr.text
            questions = parse_write_page(wr.text)
            has_answers = any(q.get("answer") for q in questions)
        else:
            detail_path = f"/Tpaper/detail/lid/7801/tid/{meta['paper_tid']}/sid/1119.html"
            source_url = urljoin(BASE, detail_path)
            dr = s.get(source_url, timeout=60)
            dr.raise_for_status()
            all_html = dr.text
            questions = parse_detail_questions(dr.text)
            # 补 label
            for i, q in enumerate(questions):
                q["label"] = ["试题一", "试题二", "试题三"][i] if i < 3 else f"第{i+1}题"

        urls = ueditor_urls(all_html)
        for q in questions:
            urls.extend(ueditor_urls(q.get("raw_html", "")))
        # dedupe preserve order
        seen: set[str] = set()
        ordered: list[str] = []
        for u in urls:
            if u not in seen:
                seen.add(u)
                ordered.append(u)

        img_map = download_images(s, ordered, assets)
        md = build_markdown(meta, questions, img_map, source_url, has_answers)
        md_path = out_dir / f"{slug}.md"
        md_path.write_text(md, encoding="utf-8")
        print(f"✓ {slug}: {len(questions)} 题, {len(ordered)} 图, answers={'Y' if has_answers else 'N'} -> {md_path.name}")

        manifest["cases"].append(
            {
                **meta,
                "slug": slug,
                "markdown": str(md_path.relative_to(ROOT)),
                "image_count": len(ordered),
                "question_count": len(questions),
                "has_answers": has_answers,
            }
        )

    # 总目录
    index_lines = [
        "# 软考高项综合测试题 · 案例专题（光环导出）",
        "",
        f"列表页：{args.index_url}",
        "",
        "| 套次 | 题目 | 题图 | 参考答案 | 文件 |",
        "|------|------|------|----------|------|",
    ]
    for c in manifest["cases"]:
        ans = "有" if c["has_answers"] else "无（需先交卷）"
        qn = c.get("question_count", 3)
        index_lines.append(
            f"| {c['title']} | {qn} | {c['image_count']} | {ans} | [{c['slug']}]({c['markdown']}) |"
        )
    (out_dir / "README.md").write_text("\n".join(index_lines) + "\n", encoding="utf-8")
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    combined = out_dir / "all_cases.md"
    parts = [(out_dir / f"case_{c['num']:02d}.md").read_text(encoding="utf-8") for c in manifest["cases"]]
    combined.write_text(
        "# 软考高项综合测试题 · 全部案例（汇总）\n\n" + "\n\n".join(parts),
        encoding="utf-8",
    )
    print(f"汇总：{combined.name}")
    print(f"\n完成：{out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
