# もじおち（kana-drop）

落ちてくるひらがなブロック（1モーラ）を並べて、辞書の単語を作って消す落ちものパズル。設計の経緯と判断は `DESIGN.md`。

## ファイル

- `kana_drop.html` — 納品物（単一HTML、辞書同梱）。**直接編集しない**
- `kana_drop_template.html` — 本体テンプレート。編集はここに行う
- `dict.json` — ゲーム用辞書（3,400語： 読み・表記・意味・カテゴリ）
- `build.py` — テンプレートに dict.json を注入して kana_drop.html を生成
- `build_dict.py` — しりとり辞書（hiragana-ninshiki の配信データ）から dict.json を抽出（要ネット）
- `dict_src/` — 辞書抽出の作業データ（再生成可能）
- `tests/test_harness.js` — 判定ロジックとプレイシミュレーションの検証

## ビルドと検証

```bash
python3 build.py
# 検証： kana_drop.html の script を tests/test_harness.js のマーカーに差し込んで node 実行
```

## 辞書データの出典

しりとりアプリ（yggdrasilw-spec/hiragana-ninshiki）の配信辞書から、レベル1（基本語）を中心に、読みがひらがなのみ・2〜6モーラの語を抽出。語の意味は同辞書の編集データ（原典は JMDict／日本語WordNet 由来のエントリを含む）。

## 遊び方

- ドラッグで落ちるブロックを左右に移動、下フリックか「おとす」ボタンで即落下。キーボード ←→↓＋スペースにも対応
- 横一列に辞書の単語が並ぶと消える（最長一致優先）。消えたら落下して連鎖
- 接地後 0.42 秒は横に滑らせることができる（ロックディレイ）
- 出現アシスト：「あと1モーラで単語になる並び」があると、そのモーラが出やすくなる（PARAMS.assistP）
- モード：エンドレス／お題ミッション（3つのお題を達成）／ことばずかん（localStorage に記録）
