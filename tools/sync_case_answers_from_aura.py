#!/usr/bin/env python3
"""从光环「查看结果」页同步案例题官方参考答案，并重建 case_study_data.js。

依赖：Cursor 内置浏览器已登录 yun.aura.cn
用法：python3 tools/sync_case_answers_from_aura.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from html import unescape
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "data" / "case_gaoxiang"
MANIFEST = SRC_DIR / "manifest.json"
INDEX_URL = "https://yun.aura.cn/Tpaper/index/lid/7801/sid/1119.html"
BASE = "https://yun.aura.cn"
CURSOR_COOKIES = (
    Path.home() / "Library/Application Support/Cursor/Partitions/cursor-browser/Cookies"
)


def session():
    try:
        import browser_cookie3
        import requests
    except ImportError:
        sys.exit("需要: pip install browser-cookie3 requests")
    if not CURSOR_COOKIES.exists():
        sys.exit(f"未找到 Cookie: {CURSOR_COOKIES}\n请先在 Cursor 内置浏览器登录 yun.aura.cn")
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


def find_question_positions(html: str) -> list[tuple[int, str]]:
    pat = re.compile(r"【(?:<[^>]+>)*试题(?:<[^>]+>)*([一二三])")
    positions: list[tuple[int, str]] = []
    for m in pat.finditer(html):
        positions.append((m.start(), f"试题{m.group(1)}"))
    if positions:
        return positions
    labels = ["试题一", "试题二", "试题三"]
    return [(html.find(l), l) for l in labels if html.find(l) >= 0]


def extract_answer_blob(chunk: str) -> str:
    for block in re.findall(
        r'class="jxxq_jx_txt"[^>]*>(.*?)(?=class="jxxq_jx_txt"|$)', chunk, re.S
    ):
        if "正确答案" in block or "answer_right" in block:
            ans = clean_html(block)
            return re.sub(r"^正确答案[：:]\s*", "", ans).strip()
    return ""


def _strip_prompt_prefix(text: str, prompt: str) -> str:
    p = (prompt or "").strip()
    if not p or not text:
        return text
    if text.startswith(p):
        return text[len(p) :].strip()
    n = 0
    for a, b in zip(text, p):
        if a != b:
            break
        n += 1
    if n >= max(20, int(len(p) * 0.85)):
        return text[n:].strip()
    return text


def clean_answer_text(raw: str, prompt: str = "") -> str:
    if not raw:
        return ""
    text = raw.strip()
    text = re.sub(r"\s*<\s*div[\s\S]*$", "", text, flags=re.I)
    text = re.sub(r"\n-{2,}\s*$", "", text).strip()

    ref_at = -1
    for m in re.finditer(r"【\s*参考答案\s*】", text):
        ref_at = m.end()
    if ref_at >= 0:
        text = text[ref_at:].strip()
    else:
        text = re.sub(r"^参考答案[：:]\s*", "", text).strip()

    text = re.sub(r"^【问题\s*\d+】[^【]*", "", text).strip()
    text = re.sub(r"^（\s*\d+\s*分\s*）\s*", "", text).strip()

    p = (prompt or "").strip()
    text = _strip_prompt_prefix(text, p)
    p_head = re.sub(r"【问题\s*\d+】[\s\S]*$", "", p).strip()
    text = _strip_prompt_prefix(text, p_head)

    if p and re.search(r"判断.+正误", p):
        m = re.search(r"（\s*1\s*）", text)
        if m and m.start() > 0 and re.search(r"[√×]", text[m.start() : m.start() + 400]):
            text = text[m.start() :].strip()

    return text

def split_sub_answers(blob: str) -> dict[int, str]:
    """将一题内的参考答案按【问题N】拆成小题答案（仅保留【参考答案】后正文）。"""
    if not blob:
        return {}
    out: dict[int, str] = {}
    parts = re.split(r"【问题\s*(\d+)\s*】", blob)
    for i in range(1, len(parts), 2):
        num = int(parts[i])
        body = parts[i + 1]
        nxt = re.search(r"【问题\s*\d+", body)
        chunk = body[: nxt.start()] if nxt else body
        out[num] = clean_answer_text(chunk)
    return out


def parse_index(html: str) -> list[dict]:
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


def parse_write_page(html: str) -> list[dict]:
    positions = find_question_positions(html)
    if not positions:
        return []
    positions.sort()
    questions = []
    for i, (pos, label) in enumerate(positions):
        end = positions[i + 1][0] if i + 1 < len(positions) else len(html)
        chunk = html[pos:end]
        stem = chunk
        for marker in (r"<span class=\"answer_wrong\">关键词", r"你的答案", r"正确答案"):
            m = re.search(marker, chunk)
            if m:
                stem = chunk[: m.start()]
                break
        stem_text = clean_html(stem)
        ans_blob = extract_answer_blob(chunk)
        sub_ans = split_sub_answers(ans_blob)

        scenario = ""
        if "【说明】" in stem_text:
            _, scenario = stem_text.split("【说明】", 1)
            scenario = scenario.strip()
            m = re.search(r"【问题\s*\d+", scenario)
            if m:
                scenario = scenario[: m.start()].strip()

        images = re.findall(
            r"https://img01\.aura\.cn/wx/ueditor/[^\"'\\s<>]+", chunk
        )
        rel_images = []
        for u in images:
            name = u.rsplit("/", 1)[-1]
            rel_images.append(f"assets/case_{0:02d}/{name}")  # placeholder, fixed below

        subs_stem = []
        for sm in re.finditer(
            r"【问题\s*(\d+)\s*】[^【]*?（\s*(\d+)\s*分\s*）\s*([^【]+)",
            stem_text,
        ):
            subs_stem.append(
                {
                    "num": int(sm.group(1)),
                    "points": int(sm.group(2)),
                    "prompt": sm.group(3).strip(),
                }
            )
        if not subs_stem:
            for sm in re.finditer(r"【问题\s*(\d+)\s*】[^【]*?（\s*(\d+)\s*分\s*）", stem_text):
                start = sm.end()
                nxt = re.search(r"【问题\s*\d+", stem_text[start:])
                prompt = stem_text[start : start + nxt.start()] if nxt else stem_text[start:]
                subs_stem.append(
                    {
                        "num": int(sm.group(1)),
                        "points": int(sm.group(2)),
                        "prompt": prompt.strip(),
                    }
                )

        sub_questions = []
        for sq in subs_stem:
            sub_questions.append(
                {
                    "num": sq["num"],
                    "points": sq["points"],
                    "prompt": sq["prompt"],
                    "answer": clean_answer_text(
                        sub_ans.get(sq["num"], ""), sq["prompt"]
                    ),
                }
            )

        questions.append(
            {
                "label": label,
                "scenario": scenario,
                "images": list(dict.fromkeys(images)),
                "subQuestions": sub_questions,
            }
        )
    return questions


def write_case_md(meta: dict, questions: list[dict], slug: str) -> None:
    lines = [
        f"# {meta['title']}",
        "",
        f"- 试卷 tid：`{meta.get('paper_tid', '')}`",
        f"- 作答记录 tid：`{meta.get('result_tid', '')}`",
        f"- 来源：{meta.get('write_url', '')}",
        "",
    ]
    for q in questions:
        lines += [f"## {q['label']}", ""]
        if q.get("scenario"):
            lines += ["【说明】", q["scenario"], ""]
        if q.get("images"):
            lines += ["**题图：**", ""]
            for u in q["images"]:
                name = u.rsplit("/", 1)[-1]
                rel = f"assets/{slug}/{name}"
                lines.append(f"![题图]({rel})")
            lines.append("")
        for sq in q.get("subQuestions") or []:
            lines += [
                f"【问题{sq['num']}】（{sq['points']}分）",
                sq["prompt"],
                "",
            ]
        lines += ["### 参考答案", ""]
        for sq in q.get("subQuestions") or []:
            if sq.get("answer"):
                lines += [
                    f"【问题{sq['num']}】（{sq['points']}分）",
                    sq["answer"],
                    "",
                ]
        lines += ["---", ""]

    path = SRC_DIR / f"{slug}.md"
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> int:
    s = session()
    index_html = s.get(INDEX_URL, timeout=60).text
    cases = parse_index(index_html)

    manifest_cases = []
    for meta in cases:
        slug = f"case_{meta['num']:02d}"
        md_path = SRC_DIR / f"{slug}.md"
        write_url = ""
        has_answers = False

        if meta["result_tid"]:
            write_path = f"/Test/alsTyper/lid/0/tid/{meta['result_tid']}/typer/5/write/3.html"
            write_url = urljoin(BASE, write_path)
            wr = s.get(write_url, timeout=60)
            wr.raise_for_status()
            questions = parse_write_page(wr.text)
            meta["write_url"] = write_url
            write_case_md(meta, questions, slug)
            has_answers = any(
                sq.get("answer")
                for q in questions
                for sq in q.get("subQuestions") or []
            )
            print(f"✓ 案例（{meta['num']}）已同步答案 tid={meta['result_tid']}")
        else:
            print(f"○ 案例（{meta['num']}）无「查看结果」记录，保留现有 {slug}.md")
            if not md_path.exists():
                print(f"  警告: 缺少 {md_path}，请先运行 export_aura_case_papers.py")

        manifest_cases.append(
            {
                **meta,
                "slug": slug,
                "markdown": f"data/case_gaoxiang/{slug}.md",
                "has_answers": has_answers or (md_path.exists() and "### 参考答案" in md_path.read_text(encoding="utf-8")),
            }
        )

    manifest = {"index_url": INDEX_URL, "cases": manifest_cases}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    subprocess.run(
        [sys.executable, str(ROOT / "tools/build_case_study_js.py")],
        cwd=str(ROOT),
        check=True,
    )
    print("\n完成。请刷新练习场「案例题」页面。")
    if not any(c.get("result_tid") for c in cases):
        print("提示：案例（1）等需先在光环做完题并交卷，才会出现「查看结果」。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
