#!/usr/bin/env python3
"""kana_drop_template.html に dict.json を注入して kana_drop.html を生成する。
使い方: python3 build.py"""
import json
from pathlib import Path

ROOT = Path(__file__).parent

def main():
    tpl = (ROOT / "kana_drop_template.html").read_text(encoding="utf-8")
    d = json.loads((ROOT / "dict.json").read_text(encoding="utf-8"))
    # 追加辞書（地名など元辞書に欠けている語を補う。既存の読みとは重ねない）
    extra_path = ROOT / "extra_words.json"
    if extra_path.exists():
        extra = json.loads(extra_path.read_text(encoding="utf-8"))
        seen = {row[0] for row in d}
        added = [row for row in extra if row[0] not in seen]
        d = d + added
        print(f"extra words: +{len(added)} (of {len(extra)} candidates)")
    assert "/*__DICT__*/" in tpl
    html = tpl.replace("/*__DICT__*/[]", json.dumps(d, ensure_ascii=False))
    out = ROOT / "kana_drop.html"
    out.write_text(html, encoding="utf-8")
    print(f"built kana_drop.html: {len(d)} words, {out.stat().st_size} bytes")

if __name__ == "__main__":
    main()
