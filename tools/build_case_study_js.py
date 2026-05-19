#!/usr/bin/env python3
"""将 data/case_gaoxiang/*.md 编译为 window.caseStudySets（供练习场案例题使用）。"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "data" / "case_gaoxiang"
MANIFEST = SRC_DIR / "manifest.json"
OUT = ROOT / "data" / "case_study_data.js"
AURA_LID = "7801"
AURA_SID = "1119"
CDN_BASE = "https://img01.aura.cn/wx/ueditor"


def case_image_path_to_cdn(path: str) -> str:
    """本地 assets 路径或文件名 → 光环 CDN（与 img01.aura.cn 命名规则一致）。"""
    p = (path or "").strip()
    if not p:
        return ""
    if re.match(r"^https?://", p, re.I):
        return p
    name = Path(p).name
    m = re.match(r"^(\d{4})(\d{2})", name)
    if not m:
        return p
    year, month = m.group(1), m.group(2)
    return f"{CDN_BASE}/{year}/{year}-{month}/{name}"


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

def split_sub_blocks(text: str) -> list[tuple[int, str]]:
    parts = re.split(r"【问题\s*(\d+)\s*】", text)
    out: list[tuple[int, str]] = []
    for i in range(1, len(parts), 2):
        num = int(parts[i])
        body = parts[i + 1].strip()
        out.append((num, body))
    return out


def parse_question_section(body: str, slug: str) -> dict:
    if "### 参考答案" in body:
        stem_part, ans_part = body.split("### 参考答案", 1)
    else:
        stem_part, ans_part = body, ""

    images = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", stem_part)
    images = [
        case_image_path_to_cdn(
            p if p.startswith("data/") else f"data/case_gaoxiang/{p.lstrip('/')}"
        )
        for p in images
    ]
    stem_part = re.sub(r"!\[[^\]]*\]\([^)]+\)\s*", "", stem_part)
    stem_part = re.sub(r"\*\*题图：\*\*\s*\n?", "", stem_part).strip()

    intro = stem_part
    scenario = ""
    if "【说明】" in intro:
        head, scenario = intro.split("【说明】", 1)
        scenario = scenario.strip()
        # 题干里若还夹着【问题N】，说明段只取到第一个问题前
        m = re.search(r"【问题\s*\d+", scenario)
        if m:
            scenario = scenario[: m.start()].strip()
    else:
        head = intro
        m = re.search(r"【问题\s*\d+", head)
        if m:
            scenario = ""
            head = head[: m.start()].strip()

    label_m = re.search(r"【试题\s*([一二三])】", head)
    if label_m:
        label = f"试题{label_m.group(1)}"
    else:
        sec_m = re.search(r"试题\s*([一二三])", head)
        label = f"试题{sec_m.group(1)}" if sec_m else "试题"

    subs_stem = split_sub_blocks(stem_part)
    subs_ans = {n: t for n, t in split_sub_blocks(ans_part)}

    sub_questions = []
    for num, prompt in subs_stem:
        pts_m = re.search(r"（\s*(\d+)\s*分\s*）", prompt)
        points = int(pts_m.group(1)) if pts_m else 0
        prompt_clean = re.sub(r"^（\s*\d+\s*分\s*）\s*", "", prompt).strip()
        raw_ans = subs_ans.get(num, "")
        raw_ans = clean_answer_text(raw_ans, prompt_clean)
        sub_questions.append(
            {
                "num": num,
                "points": points,
                "prompt": prompt_clean,
                "answer": raw_ans,
            }
        )

    return {
        "label": label,
        "preamble": head.strip(),
        "scenario": scenario,
        "images": images,
        "subQuestions": sub_questions,
    }


def parse_md_file(path: Path, meta: dict) -> dict:
    text = path.read_text(encoding="utf-8")
    slug = meta.get("slug") or f"case_{meta['num']:02d}"
    sections = re.split(r"\n##\s+", text)
    questions = []
    for sec in sections[1:]:
        if not sec.strip():
            continue
        questions.append(parse_question_section(sec, slug))

    paper_tid = meta.get("paper_tid") or ""
    result_tid = meta.get("result_tid") or ""
    detail_url = (
        f"https://yun.aura.cn/Tpaper/detail/lid/{AURA_LID}/tid/{paper_tid}/sid/{AURA_SID}.html"
        if paper_tid
        else ""
    )
    write_url = (
        f"https://yun.aura.cn/Test/alsTyper/lid/0/tid/{result_tid}/typer/5/write/3.html"
        if result_tid
        else ""
    )
    return {
        "id": f"case-{meta['num']}",
        "num": meta["num"],
        "title": f"案例（{meta['num']}）",
        "fullTitle": meta.get("title", ""),
        "key": slug,
        "summary": f"{len(questions)} 道大题 · "
        + ("含官方参考答案" if meta.get("has_answers") else "暂无官方答案"),
        "hasOfficialAnswers": bool(meta.get("has_answers")),
        "paperTid": paper_tid,
        "resultTid": result_tid,
        "auraDetailUrl": detail_url,
        "auraWriteUrl": write_url,
        "questions": questions,
    }


def main() -> int:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    sets = []
    for c in manifest["cases"]:
        md_path = ROOT / c["markdown"]
        sets.append(parse_md_file(md_path, c))

    js = "// 自动生成：python3 tools/build_case_study_js.py\n"
    js += "window.caseStudySets = "
    js += json.dumps(sets, ensure_ascii=False, indent=2)
    js += ";\n"
    OUT.write_text(js, encoding="utf-8")
    print(f"wrote {OUT} ({len(sets)} sets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
