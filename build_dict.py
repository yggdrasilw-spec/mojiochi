#!/usr/bin/env python3
"""しりとりアプリ（hiragana-ninshiki）の配信辞書から、もじおち用の単語辞書を抽出する。

入力: data/shiritori-delivery/index.json + chunks/*.json（GitHub Pages から取得）
出力: dict.json … [reading, display, meaning, category, level] の配列
フィルタ: 読みがひらがなのみ／2〜6モーラ／レベル1〜2／固有名詞系カテゴリを除外
"""
import json, re, subprocess, sys, urllib.request
from pathlib import Path

BASE = "https://yggdrasilw-spec.github.io/hiragana-ninshiki/data/shiritori-delivery/"
ROOT = Path(__file__).parent
SRC = ROOT / "dict_src"
SRC.mkdir(exist_ok=True)

SMALL = set("ゃゅょ")
KANA_RE = re.compile(r"^[ぁ-ゖー]+$")  # ひらがな+長音（ゎヶ等は除外される範囲）
ALLOW_CAT = {"animal", "plant", "food", "daily", "body", "school", "nature",
             "sport", "arts", "other", "onomatopoeia", "earthScience", "biology"}
DENY_CAT = {"place", "japanPlace", "company", "brand", "fiction", "entertainment", "society"}
KID_CAT = {"animal", "plant", "food", "daily", "body", "school", "nature", "sport", "arts"}

def mora_units(s):
    units, i = [], 0
    while i < len(s):
        if i + 1 < len(s) and s[i + 1] in SMALL:
            units.append(s[i:i + 2]); i += 2
        else:
            units.append(s[i]); i += 1
    return units

def fetch(url, dest):
    if dest.exists() and dest.stat().st_size > 0:
        return
    urllib.request.urlretrieve(url, dest)

def main():
    fetch(BASE + "index.json", SRC / "index.json")
    index = json.loads((SRC / "index.json").read_text(encoding="utf-8"))
    chunks = index["chunks"]
    print(f"chunks: {len(chunks)}")
    # 並列取得
    (SRC / "urls.txt").write_text("\n".join(BASE + c["file"] for c in chunks), encoding="utf-8")
    subprocess.run(
        "cd dict_src && cat urls.txt | xargs -P 12 -I{} sh -c 'f=$(basename {}); [ -s $f ] || curl -sL --max-time 40 {} -o $f'",
        shell=True, cwd=ROOT, check=False)
    got = len(list(SRC.glob("*.json"))) - 1
    print(f"fetched chunk files: {got}")
    levels = {r[0]: r[1] for r in index["readings"]}

    best = {}  # reading -> entry dict
    seen = 0
    for c in chunks:
        f = SRC / Path(c["file"]).name
        if not f.exists():
            print("missing:", c["file"]); continue
        for e in json.loads(f.read_text(encoding="utf-8")):
            seen += 1
            r = e.get("reading", "")
            if not KANA_RE.match(r):
                continue
            units = mora_units(r)
            if not (2 <= len(units) <= 6):
                continue
            lv = e.get("level", levels.get(r, 5))
            if lv > 2:
                continue
            named = e.get("namedSenses") or []
            genres = e.get("genres") or ["other"]
            if any(g in DENY_CAT for g in genres) and not any(g in ALLOW_CAT for g in genres):
                continue
            cat = genres[0]
            # センス選択： 固有名詞でなく、意味レベルが低いもの
            cands = []
            for i, w in enumerate(e.get("words", [])):
                if i < len(named) and named[i]:
                    continue
                mlv = (e.get("meaningLevels") or [lv])[i] if i < len(e.get("meaningLevels") or []) else lv
                cands.append((mlv, i, w))
            if not cands:
                continue
            cands.sort()
            mlv, i, w = cands[0]
            meaning = (e.get("meanings") or [""])[i] if i < len(e.get("meanings") or []) else ""
            meaning = re.sub(r"\s+", "", meaning)[:30]
            cand = {"r": r, "w": w, "m": meaning, "c": cat, "lv": lv, "mlv": mlv, "mora": len(units),
                    "kid": 0 if cat in KID_CAT else 1}
            old = best.get(r)
            if old is None or (cand["lv"], cand["mlv"]) < (old["lv"], old["mlv"]):
                best[r] = cand
    # 採用プール： レベル1は全部、レベル2は子ども向けジャンルのみ。上限 3400 語
    pool = [w for w in best.values() if w["lv"] == 1 or w["kid"] == 0]
    pool.sort(key=lambda x: (x["lv"], x["kid"], x["mora"], x["r"]))
    words = pool[:3400]
    print(f"scanned {seen} entries -> game dictionary {len(words)} words (pool {len(pool)})")
    from collections import Counter
    print("by level:", Counter(w["lv"] for w in words))
    print("by mora:", Counter(w["mora"] for w in words))
    print("by category:", Counter(w["c"] for w in words).most_common(10))
    out = [[w["r"], w["w"], w["m"], w["c"]] for w in words]
    (ROOT / "dict.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print("wrote dict.json", (ROOT / "dict.json").stat().st_size, "bytes")

if __name__ == "__main__":
    main()
