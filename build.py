#!/usr/bin/env python3
"""kana_drop_template.html に dict.json を注入して kana_drop.html を生成する。
使い方: python3 build.py"""
import json
from pathlib import Path

ROOT = Path(__file__).parent

def main():
    tpl = (ROOT / "kana_drop_template.html").read_text(encoding="utf-8")
    d = json.loads((ROOT / "dict.json").read_text(encoding="utf-8"))
    assert "/*__DICT__*/" in tpl
    html = tpl.replace("/*__DICT__*/[]", json.dumps(d, ensure_ascii=False))
    out = ROOT / "kana_drop.html"
    out.write_text(html, encoding="utf-8")
    print(f"built kana_drop.html: {len(d)} words, {out.stat().st_size} bytes")

if __name__ == "__main__":
    main()
