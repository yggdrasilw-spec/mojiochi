#!/usr/bin/env python3
"""しりとりアプリ（hiragana-ninshiki）の配信辞書【全件】から、もじおち用の単語辞書を抽出する。
出力: dict.json … [reading, display, meaning, category] の配列
採用条件: 読みがひらがなのみ／2〜7モーラ。全レベル・全カテゴリ（固有名詞含む）を採用。
通常辞書に加えて、別配信の「日本の地名・駅名」追加辞書（japan-places、読み約8.5万件）も取り込む。
追加辞書は通常辞書に無い読みだけを補い、通常辞書側の表記・意味を優先する。
"""
import json, re, subprocess, urllib.request
from pathlib import Path

BASE = "https://yggdrasilw-spec.github.io/hiragana-ninshiki/data/shiritori-delivery/"
ROOT = Path(__file__).parent
SRC = ROOT / "dict_src"
SRC.mkdir(exist_ok=True)
SMALL = set("ゃゅょ")
KANA_RE = re.compile(r"^[ぁ-ゖー]+$")

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
    (SRC / "urls.txt").write_text("\n".join(BASE + c["file"] for c in chunks), encoding="utf-8")
    subprocess.run(
        "cd dict_src && cat urls.txt | xargs -P 12 -I{} sh -c 'f=$(basename {}); [ -s $f ] || curl -sL --max-time 40 {} -o $f'",
        shell=True, cwd=ROOT, check=False)
    print(f"fetched chunk files: {len(list(SRC.glob('*.json'))) - 1}")
    best = {}
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
            if not (2 <= len(units) <= 7):
                continue
            named = e.get("namedSenses") or []
            genres = e.get("genres") or ["other"]
            mls = e.get("meaningLevels") or []
            cands = []
            for i, w in enumerate(e.get("words", [])):
                mlv = mls[i] if i < len(mls) else 9
                is_named = 1 if (i < len(named) and named[i]) else 0
                cands.append((mlv, is_named, i, w))
            if not cands:
                continue
            cands.sort()
            mlv, is_named, i, w = cands[0]
            meanings = e.get("meanings") or []
            meaning = meanings[i] if i < len(meanings) else ""
            meaning = re.sub(r"\s+", "", meaning)[:30]
            cand = {"r": r, "w": w, "m": meaning, "c": genres[0], "key": (mlv, is_named), "mora": len(units)}
            old = best.get(r)
            if old is None or cand["key"] < old["key"]:
                best[r] = cand
    # --- 追加辞書「日本の地名・駅名」（通常辞書に無い読みだけ補う） ---
    pdir = SRC / "places"
    pdir.mkdir(exist_ok=True)
    fetch(BASE + "japan-places/index.json", SRC / "places_index.json")
    pindex = json.loads((SRC / "places_index.json").read_text(encoding="utf-8"))
    pchunks = pindex["chunks"]
    print(f"places chunks: {len(pchunks)}")
    (SRC / "places_urls.txt").write_text("\n".join(BASE + "japan-places/" + c["file"] for c in pchunks), encoding="utf-8")
    subprocess.run(
        "cd dict_src/places && cat ../places_urls.txt | xargs -P 12 -I{} sh -c 'f=$(basename {}); [ -s $f ] || curl -sL --max-time 40 {} -o $f'",
        shell=True, cwd=ROOT, check=False)
    print(f"fetched places chunk files: {len(list(pdir.glob('*.json')))}")
    p_seen = p_added = 0
    for c in pchunks:
        f = pdir / Path(c["file"]).name
        if not f.exists():
            print("missing places:", c["file"]); continue
        for e in json.loads(f.read_text(encoding="utf-8")):
            p_seen += 1
            r = e.get("reading", "")
            if r in best:
                continue
            if not KANA_RE.match(r):
                continue
            units = mora_units(r)
            if not (2 <= len(units) <= 7):
                continue
            ws = e.get("words", [])
            if not ws:
                continue
            meanings = e.get("meanings") or []
            meaning = meanings[0] if meanings else ""
            meaning = re.sub(r"\s+", "", meaning)[:30]
            best[r] = {"r": r, "w": ws[0], "m": meaning, "c": "japanPlace",
                       "key": (9, 9), "mora": len(units)}
            p_added += 1
    print(f"places: scanned {p_seen} entries -> added {p_added} readings")
    words = sorted(best.values(), key=lambda x: x["r"])
    print(f"scanned {seen} entries -> game dictionary {len(words)} words")
    from collections import Counter
    print("by mora:", Counter(w["mora"] for w in words))
    print("by category:", Counter(w["c"] for w in words).most_common(10))
    out = [[w["r"], w["w"], w["m"]] for w in words]
    (ROOT / "dict.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print("wrote dict.json", (ROOT / "dict.json").stat().st_size, "bytes")

if __name__ == "__main__":
    main()
