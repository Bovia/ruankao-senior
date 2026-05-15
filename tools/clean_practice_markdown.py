#!/usr/bin/env python3
"""清理练习场题库：去掉光环/站点页眉页脚，保留题目正文；支持 .md / practice Markdown .js / 知识域 JSON。"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRACTICE = ROOT / "data" / "practice"

QUESTION_START = re.compile(
    r"^\d+[、，,.]\s*(?:\*\s*)?\[单选\](?:\s*\*)?",
    re.M,
)
FOOTER_MARKERS = (
    re.compile(r"^答题用时[：:]"),
    re.compile(r"^答题时间[：:]"),
    re.compile(r"^答题卡\s*$"),
    re.compile(r"^咨询热线[：:]"),
    re.compile(r"^技术支持[：:]"),
    re.compile(r"^备案号[：:]"),
    re.compile(r"^Copyright\b", re.I),
    re.compile(r"^PMI,"),
    re.compile(r"^registered marks", re.I),
    re.compile(r"^意见/"),
    re.compile(r"^客诉[：:]"),
    re.compile(r"^邮箱[：:]"),
    re.compile(r"^单选题\s*$"),
    re.compile(r"^[0-9\s]{20,}$"),
)
INLINE_FOOTER = re.compile(
    r"\n(?:答题用时[：:]|答题时间[：:]|答题卡\n|咨询热线[：:]|"
    r"技术支持[：:]|备案号[：:]|Copyright\b|PMI,|意见/|客诉[：:]|邮箱[：:]).*",
    re.S | re.I,
)
SITE_HEADER_LINE = re.compile(
    r"^(首页|课程中心|直播中心|题库|名师|问答|我的课程|詹丹丹|下载APP|关注公众号|"
    r"首页\s*试题详情|答案解析|软考高项综合测试题|总题数[：:]|答题数[：:]|"
    r"正题[：:]|错题[：:]|未答[：:]|单选题\d+道|单选题\s*[（(])"
)
USER_ANS = re.compile(r"\s*你的答案[：:]\s*\*?\*?[A-Da-d]\*?\*?")
AURA_IMG = re.compile(
    r"!\[([^\]]*)\]\(https?://[^)]*aura\.cn[^)]*\)",
    re.I,
)
JS_MARKDOWN_RE = re.compile(
    r'\(window\.practiceMarkdown\s*=\s*window\.practiceMarkdown\s*\|\|\s*\{\}\)\["([^"]+)"\]\s*=\s*`',
)


def split_questions(text: str) -> list[str]:
    parts = re.split(
        r"\n(?=\d+[、，,.]\s*(?:\*\s*)?\[单选\](?:\s*\*)?)",
        text,
    )
    out = []
    for p in parts:
        p = p.strip()
        if p and QUESTION_START.match(p):
            out.append(p)
    return out


def strip_footer_from_block(block: str) -> str:
    lines = block.split("\n")
    cut = len(lines)
    for i, line in enumerate(lines):
        t = line.strip()
        if any(m.match(t) for m in FOOTER_MARKERS):
            cut = i
            break
    return "\n".join(lines[:cut]).rstrip()


def strip_inline_footer(text: str) -> str:
    text = INLINE_FOOTER.sub("", text)
    lines = []
    for line in text.split("\n"):
        if SITE_HEADER_LINE.match(line.strip()):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def neutralize_aura_images(text: str) -> str:
    return AURA_IMG.sub(r"【题图：\1】", text)


def clean_block(block: str, new_num: int, strip_user_answer: bool) -> str:
    block = strip_footer_from_block(block)
    block = neutralize_aura_images(block)
    block = re.sub(
        r"^\d+[、，,.]\s*((?:\*\s*)?\[单选\](?:\s*\*)?)",
        rf"{new_num}、 \1",
        block,
        count=1,
        flags=re.M,
    )
    if strip_user_answer:
        block = USER_ANS.sub("", block)
    return block.strip()


def clean_markdown(text: str, *, renumber: bool = True, strip_user_answer: bool = True) -> str:
    m = QUESTION_START.search(text)
    if m:
        text = text[m.start() :]
    blocks = split_questions(text)
    if not blocks:
        return strip_inline_footer(neutralize_aura_images(text.strip())) + "\n"
    cleaned = []
    for i, b in enumerate(blocks, start=1):
        num = i if renumber else int(re.match(r"^(\d+)", b).group(1))
        cleaned.append(clean_block(b, num, strip_user_answer))
    return "\n\n".join(cleaned) + "\n"


def extract_user_answers(text: str) -> dict[str, str]:
    answers: dict[str, str] = {}
    for i, b in enumerate(split_questions(text)):
        m = re.search(r"你的答案[：:]\s*\*?\*?([A-Da-d])\*?\*?", b)
        if m:
            answers[str(i)] = m.group(1).upper()
    return answers


def escape_js_template(s: str) -> str:
    return s.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")


def write_js(key: str, md_text: str) -> None:
    body = escape_js_template(md_text)
    path = PRACTICE / f"{key}.js"
    path.write_text(
        f'(window.practiceMarkdown = window.practiceMarkdown || {{}})["{key}"] = `{body}`;\n',
        encoding="utf-8",
    )


def read_practice_js_markdown(js_path: Path) -> tuple[str, str] | None:
    raw = js_path.read_text(encoding="utf-8")
    m = JS_MARKDOWN_RE.search(raw)
    if not m:
        return None
    key = m.group(1)
    start = m.end()
    end = raw.rfind("`;", start)
    if end < 0:
        return None
    return key, raw[start:end]


def clean_practice_js(key: str, *, strip_user_answer: bool = True) -> dict[str, str]:
    js_path = PRACTICE / f"{key}.js"
    parsed = read_practice_js_markdown(js_path)
    if not parsed:
        raise ValueError(f"cannot parse practice markdown js: {js_path}")
    _, body = parsed
    ua = extract_user_answers(body)
    cleaned = clean_markdown(body, renumber=True, strip_user_answer=strip_user_answer)
    write_js(key, cleaned)
    md_path = PRACTICE / f"{key}.md"
    if md_path.exists():
        md_path.write_text(cleaned, encoding="utf-8")
    return ua


def clean_zhishiyu_js(js_path: Path) -> int:
    raw = js_path.read_text(encoding="utf-8")
    # extract quiz array via regex (files are `(function(){ ... quiz = [ ... ];})();`)
    m = re.search(r"\.quiz\s*=\s*(\[)", raw)
    if not m:
        print(f"skip zhishiyu (no quiz): {js_path.name}", file=sys.stderr)
        return 0
    start = m.start(1)
    depth = 0
    end = start
    for i, ch in enumerate(raw[start:], start):
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    quiz = json.loads(raw[start:end])
    n = 0
    for q in quiz:
        if not isinstance(q, dict):
            continue
        changed = False
        for field in ("analysis", "question"):
            if field in q and isinstance(q[field], str):
                new = strip_inline_footer(neutralize_aura_images(q[field]))
                if new != q[field]:
                    q[field] = new
                    changed = True
        if changed:
            n += 1
    new_quiz = json.dumps(quiz, ensure_ascii=False, indent=2)
    new_raw = raw[:start] + new_quiz + raw[end:]
    js_path.write_text(new_raw, encoding="utf-8")
    return n


def compact_export_answers(export_path: Path) -> None:
    """去重 bovia 答案并写成单行紧凑 JSON（.json + .js）。"""
    data = json.loads(export_path.read_text(encoding="utf-8"))
    profiles = data.get("practiceProfiles", {}).get("answersProfiles", {})
    bovia = profiles.get("bovia", {})
    by_set = bovia.get("bySetKey") if isinstance(bovia, dict) else {}
    if by_set:
        profiles["bovia"] = {"v": 1, "bySetKey": {}}
    # mtt 若曾被误存为字符串则还原
    attempts = data.get("practiceProfiles", {}).get("attemptsProfiles", {})
    mtt = attempts.get("mtt") if isinstance(attempts, dict) else None
    if isinstance(mtt, str):
        attempts["mtt"] = json.loads(mtt)
    compact = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    export_path.write_text(compact + "\n", encoding="utf-8")
    js_path = export_path.with_suffix(".js")
    js_path.write_text("window.__PRACTICE_SEED_DATA__ = " + compact + ";\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("keys", nargs="*", help="practice keys e.g. zonghe_1")
    ap.add_argument("--all-zonghe", action="store_true")
    ap.add_argument("--all-practice-js", action="store_true")
    ap.add_argument("--zhishiyu", action="store_true")
    ap.add_argument("--compact-export", action="store_true")
    ap.add_argument("--keep-user-answer-in-md", action="store_true")
    args = ap.parse_args()

    keys: list[str] = list(args.keys)
    if args.all_zonghe:
        keys.extend(
            sorted(
                p.stem
                for p in PRACTICE.glob("zonghe_*.js")
                if re.match(r"zonghe_\d+$", p.stem)
            )
        )
    if args.all_practice_js:
        keys.extend(
            sorted(
                p.stem
                for p in PRACTICE.glob("*.js")
                if p.stem.startswith(("zonghe_", "moni_"))
            )
        )
    keys = list(dict.fromkeys(keys))
    strip_ua = not args.keep_user_answer_in_md

    for key in keys:
        md_path = PRACTICE / f"{key}.md"
        js_path = PRACTICE / f"{key}.js"
        if md_path.exists():
            raw = md_path.read_text(encoding="utf-8")
            ua = extract_user_answers(raw)
            cleaned = clean_markdown(raw, strip_user_answer=strip_ua)
            md_path.write_text(cleaned, encoding="utf-8")
            if js_path.exists():
                write_js(key, cleaned)
            print(f"{key}: {len(split_questions(cleaned))} questions (md)")
        elif js_path.exists():
            ua = clean_practice_js(key, strip_user_answer=strip_ua)
            body = read_practice_js_markdown(js_path)[1]
            print(f"{key}: {len(split_questions(body))} questions (js), {len(ua)} answers in source")
        else:
            print(f"skip missing {key}", file=sys.stderr)

    if args.zhishiyu:
        for p in sorted(PRACTICE.glob("zhishiyu_*.js")):
            n = clean_zhishiyu_js(p)
            print(f"{p.stem}: cleaned {n} quiz items")

    if args.compact_export:
        export_path = ROOT / "data" / "export_my_answers_and_history.json"
        before = len(export_path.read_text(encoding="utf-8").splitlines())
        compact_export_answers(export_path)
        after = len(export_path.read_text(encoding="utf-8").splitlines())
        print(f"export compacted: {before} -> {after} lines")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
