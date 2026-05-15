#!/usr/bin/env python3
"""批量 merge + download 多套 captures。"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MERGE = ROOT / "tools" / "merge_captured_urls.py"
CAPTURES = ROOT / "data" / "practice" / "captures"


def main() -> int:
    sets = sys.argv[1:] or [p.stem for p in sorted(CAPTURES.glob("zonghe_*.json"))]
    rc = 0
    for key in sets:
        cap = CAPTURES / f"{key}.json"
        if not cap.exists():
            print(f"skip missing {cap}")
            continue
        print(f"=== {key} ===")
        r = subprocess.run(
            [sys.executable, str(MERGE), str(cap), "--download"],
            cwd=ROOT,
        )
        if r.returncode:
            rc = r.returncode
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
