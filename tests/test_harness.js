// もじおち検証ハーネス: 辞書整合性 + 判定ロジック（単語検出・最長一致・重力・連鎖・アシスト）
// 使い方: kana_drop.html の全 script をマーカー位置に差し込んだものを node で実行
"use strict";
class El {
  constructor(tag) {
    this.tagName = (tag || "div").toUpperCase(); this.children = []; this.dataset = {};
    this.style = { setProperty(k, v) { this[k] = v; } };
    this._cls = new Set(); this._html = ""; this.textContent = ""; this.parentNode = null;
    const self = this;
    this.classList = {
      add: (...cs) => cs.forEach(c => self._cls.add(c)),
      remove: (...cs) => cs.forEach(c => self._cls.delete(c)),
      toggle: (c, f) => { if (f === undefined) f = !self._cls.has(c); f ? self._cls.add(c) : self._cls.delete(c); return f; },
      contains: c => self._cls.has(c)
    };
  }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._cls].join(" "); }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); this.parentNode = null; } }
  addEventListener() {} removeEventListener() {}
  setAttribute(k, v) { (this._attrs ||= {})[k] = String(v); }
  getAttribute(k) { return this._attrs ? this._attrs[k] : null; }
  querySelector() { return new El(); }
  querySelectorAll(sel) {
    if (sel === ".cellbg") return this.children.filter(c => c._cls.has("cellbg"));
    if (sel === ".mascotSlot" || sel === ".togglebtn" || sel === "[data-nav]" || sel === ".screen" || sel === ".overlay") return registry.byClass(sel);
    return [];
  }
  getBoundingClientRect() { return { x: 0, y: 0, width: 378, height: 594, left: 0, top: 0, right: 378, bottom: 594 }; }
}
const registry = { els: {}, byClass(sel) {
  if (sel === ".screen") return ["cover", "game", "zukan"].map(id => getEl(id));
  if (sel === ".overlay") return [getEl("overOv")];
  return [];
} };
function getEl(id) { if (!registry.els[id]) { const e = new El("div"); e.id = id; registry.els[id] = e; } return registry.els[id]; }
global.window = global;
global.innerWidth = 1280; global.innerHeight = 720;
global.document = {
  getElementById: getEl,
  createElement: t => new El(t),
  createElementNS: (ns, t) => new El(t),
  querySelectorAll: sel => registry.byClass(sel),
  querySelector: () => new El(),
  addEventListener() {}
};
global.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
global.__rafCb = null;
global.requestAnimationFrame = cb => { global.__rafCb = cb; return 1; };
global.addEventListener = () => {};
global.performance = { now: () => 0 };
class FakeCtx { constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; }
  resume() {} createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { value: 0 }, type: "" }; }
  createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; } }
global.AudioContext = FakeCtx;
global.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
global.speechSynthesis = { cancel() {}, speak() {} };

/*__APP_SCRIPT__*/

(async () => {
  let pass = 0, fail = 0; const fails = [];
  const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } };

  /* ===== 辞書の整合性 ===== */
  ok(DICT.length >= 55000, "dict size " + DICT.length);
  const KANA = /^[ぁ-ゖー]+$/;
  let badKana = 0, badMora = 0, dup = 0; const seenR = new Set();
  for (const [r, w, m] of DICT) {
    if (!KANA.test(r)) badKana++;
    const n = moraUnits(r).length;
    if (n < 2 || n > 7) badMora++;
    if (seenR.has(r)) dup++; seenR.add(r);
    if (typeof w !== "string" || typeof m !== "string") { fail++; fails.push("entry shape " + r); }
  }
  ok(badKana === 0, "non-kana readings " + badKana);
  ok(badMora === 0, "mora out of range " + badMora);
  ok(dup === 0, "duplicate readings " + dup);
  ok(WORDSET.size === DICT.length, "wordset sync");
  for (const t of ["りんご", "がっこう", "きゅうり", "いぬ", "すいか", "でんしゃ",
                   "りおる", "あいあんと", "とうきょう", "ぴかちゅう"])
    ok(WORDSET.has(t), "dict contains " + t);
  // 7モーラ語も検出できること（辞書から実在の7モーラ語を1つ拾って盤面に置く）
  const seven = DICT.find(e => moraUnits(e[0]).length === 7);
  ok(!!seven, "dict has 7-mora words");
  if (seven) {
    const u = moraUnits(seven[0]);
    const g7 = newGrid();
    u.forEach((mo, i) => { g7[10][i] = mo; });
    const m7 = findWords(g7);
    ok(m7.some(m => m.reading === seven[0] && m.len === 7), "7-mora word detected: " + seven[0]);
  }

  /* ===== モーラ分割 ===== */
  ok(JSON.stringify(moraUnits("きゅうり")) === '["きゅ","う","り"]', "moraUnits digraph");
  ok(JSON.stringify(moraUnits("がっこう")) === '["が","っ","こ","う"]', "moraUnits sokuon");
  ok(JSON.stringify(moraUnits("しゅーくりーむ")) === '["しゅ","ー","く","り","ー","む"]', "moraUnits long");

  /* ===== 単語検出 ===== */
  const gridWith = placements => { const g = newGrid(); for (const [r, c, mo] of placements) g[r][c] = mo; return g; };
  // 横一列の基本検出（最下段に り・ん・ご）
  let g = gridWith([[10, 0, "り"], [10, 1, "ん"], [10, 2, "ご"]]);
  let ms = findWords(g);
  ok(ms.length === 1 && ms[0].reading === "りんご", "detect ringo: " + JSON.stringify(ms.map(m => m.reading)));
  // 最長一致： 「あめ」の手前に「あめだま」を置ける並びでは長い方を取る（テスト語を注入）
  WORDSET.add("あめだま");
  g = gridWith([[10, 0, "あ"], [10, 1, "め"], [10, 2, "だ"], [10, 3, "ま"]]);
  ms = findWords(g);
  ok(ms.length === 1 && ms[0].reading === "あめだま" && ms[0].len === 4, "longest match wins: " + JSON.stringify(ms.map(m => m.reading)));
  WORDSET.delete("あめだま");
  // 重ならない2単語は両方拾う
  g = gridWith([[10, 0, "い"], [10, 1, "ぬ"], [10, 3, "ね"], [10, 4, "こ"]]);
  ms = findWords(g);
  ok(ms.length === 2, "two words detected: " + ms.length);
  // 隙間があると単語にならない
  g = gridWith([[10, 0, "り"], [10, 2, "ご"]]);
  ok(findWords(g).length === 0, "gap breaks word");
  // 縦並びも検出する（上→下で読む）
  g = gridWith([[8, 0, "り"], [9, 0, "ん"], [10, 0, "ご"]]);
  ms = findWords(g);
  ok(ms.length === 1 && ms[0].reading === "りんご" && ms[0].vert === true && ms[0].cells.length === 3,
     "vertical word detected: " + JSON.stringify(ms.map(m => m.reading)));
  // 縦横でセルを共有する場合は片方だけ（二重消ししない）： あい（縦）と いぬ（横）で「い」を共有
  g = gridWith([[9, 0, "あ"], [10, 0, "い"], [10, 1, "ぬ"]]);
  ms = findWords(g);
  ok(ms.length === 1 && ms[0].reading === "いぬ", "cross sharing: only one word claims the shared cell: " +
     JSON.stringify(ms.map(m => m.reading)));
  // 斜め（左上→右下）も検出する
  g = gridWith([[8, 0, "り"], [9, 1, "ん"], [10, 2, "ご"]]);
  ms = findWords(g);
  ok(ms.length === 1 && ms[0].reading === "りんご" && ms[0].diag === true && ms[0].cells.length === 3,
     "diagonal (top-left to bottom-right) word detected: " + JSON.stringify(ms.map(m => m.reading)));
  // 逆向きの斜め（右上→左下の並び）は検出しない
  g = gridWith([[10, 0, "り"], [9, 1, "ん"], [8, 2, "ご"]]);
  ok(findWords(g).length === 0, "anti-diagonal not detected");
  // 拗音は1セル=1モーラとして並ぶ
  g = gridWith([[10, 0, "きゅ"], [10, 1, "う"], [10, 2, "り"]]);
  ms = findWords(g);
  ok(ms.length === 1 && ms[0].reading === "きゅうり", "digraph word: " + JSON.stringify(ms.map(m => m.reading)));

  /* ===== 重力・着地 ===== */
  g = gridWith([[5, 0, "あ"], [8, 0, "い"]]);
  applyGravity(g);
  ok(g[10][0] === "い" && g[9][0] === "あ" && g[5][0] === null, "gravity compacts preserving order");
  ok(landRow(newGrid(), 3) === ROWS - 1, "landRow empty col");
  g = gridWith([[10, 3, "あ"], [9, 3, "い"]]);
  ok(landRow(g, 3) === 8, "landRow on stack");

  /* ===== 出現アシスト ===== */
  g = gridWith([[10, 0, "り"], [10, 1, "ん"]]);
  const wanted = computeWanted(g);
  ok(wanted.has("ご"), "assist wants ご for りん_: " + [...wanted].join(","));
  // 接頭辞側： 「ご」だけ置くと「りんご」の頭側は拾わない（2モーラ以上の断片が条件）
  const w2 = computeWanted(gridWith([[10, 0, "ご"]]));
  ok(!w2.has("ん"), "single mora gives no assist");
  // 後方一致： 「んご」の断片からは「り」が候補になる
  const w3 = computeWanted(gridWith([[10, 0, "ん"], [10, 1, "ご"]]));
  ok(w3.has("り"), "suffix assist wants り for _んご: " + [...w3].join(","));
  // 縦の断片（り・ん が縦に積まれた）からも「ご」が候補になる
  const w4 = computeWanted(gridWith([[8, 0, "り"], [9, 0, "ん"]]));
  ok(w4.has("ご"), "vertical assist wants ご for vertical りん_: " + [...w4].join(","));
  // 斜めの断片（り・ん が左上→右下に並んだ）からも「ご」が候補になる
  const w5 = computeWanted(gridWith([[8, 0, "り"], [9, 1, "ん"]]));
  ok(w5.has("ご"), "diagonal assist wants ご for diagonal りん_: " + [...w5].join(","));
  // スポーン分布： 頻出モーラがちゃんと出る＆全て辞書内のモーラ
  const counts = {};
  for (let i = 0; i < 4000; i++) { const mo = pickMoraFreq(); counts[mo] = (counts[mo] || 0) + 1; if (!MORA_FREQ.has(mo)) { ok(false, "spawn unknown mora " + mo); break; } }
  ok((counts["ん"] || 0) > 100, "spawn includes ん often: " + counts["ん"]);
  ok(Object.keys(counts).length > 60, "spawn variety " + Object.keys(counts).length);
  // 落ちものの出現（pickMora）：基本仮名は一様、拗音は約5%に抑制、旧仮名などは出ないこと
  {
    const cnt = {};
    for (let i = 0; i < 20000; i++) { const mo = pickMora(newGrid()); cnt[mo] = (cnt[mo] || 0) + 1; }
    ok((cnt["ん"] || 0) < 400, "falling spawn no freq bias: ん x" + (cnt["ん"] || 0) + "/20000");
    for (const bad of ["ゑ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "ゔ"])
      ok(!cnt[bad], "falling spawn excludes " + bad);
    const dig = Object.entries(cnt).filter(([u]) => u.length > 1).reduce((a, [, n]) => a + n, 0);
    ok(dig > 400 && dig < 1600, "digraph share ~5%: " + (dig / 200).toFixed(1) + "%");
    ok(Object.keys(cnt).length >= SPAWN_BASE.length + SPAWN_DIGRAPH.length - 2,
       "falling spawn covers spawnable units: " + Object.keys(cnt).length);
  }

  /* ===== 色・行 ===== */
  ok(rowOfMora("きゅ") === "か", "row of digraph");
  ok(rowOfMora("が") === "か", "row of dakuten");
  ok(colorOfMora("あ") !== colorOfMora("か"), "row colors differ");

  /* ===== プレイシミュレーション（純粋ロジックのみ） ===== */
  {
    const grid = newGrid();
    let placed = 0, wordsMade = 0, chainsTotal = 0, maxChainSim = 0, over = false;
    for (let turn = 0; turn < 3000 && !over; turn++) {
      const mo = pickMora(grid);
      // 置き場所： 全列を試し、最も単語が消える列を選ぶ（同点はランダム）
      let bestCol = -1, bestScore = -1;
      for (let c = 0; c < COLS; c++) {
        const lr = landRow(grid, c);
        if (lr < 0) continue;
        grid[lr][c] = mo;
        const got = findWords(grid).reduce((a, m) => a + m.len, 0);
        grid[lr][c] = null;
        const score = got * 10 + Math.random();
        if (score > bestScore) { bestScore = score; bestCol = c; }
      }
      if (bestCol < 0) { over = true; break; }
      grid[landRow(grid, bestCol)][bestCol] = mo;
      placed++;
      let chain = 0;
      for (;;) {
        const ms = findWords(grid);
        if (!ms.length) break;
        chain++; wordsMade += ms.length;
        for (const m of ms) for (const [r, c] of m.cells) grid[r][c] = null;
        applyGravity(grid);
      }
      chainsTotal += chain; maxChainSim = Math.max(maxChainSim, chain);
      // 重力の不変条件： 各列は下詰め
      for (let c = 0; c < COLS; c++) {
        let gap = false, bad = false;
        for (let r = ROWS - 1; r >= 0; r--) { if (!grid[r][c]) gap = true; else if (gap) bad = true; }
        if (bad) { ok(false, "gravity invariant broken col " + c); over = true; break; }
      }
    }
    ok(placed >= 170, "sim placed " + placed + " blocks before game over");
    ok(wordsMade >= 30, "sim words made " + wordsMade);
    console.log("sim: placed=" + placed + " words=" + wordsMade + " maxChain=" + maxChainSim +
      " wordsPerBlock=" + (wordsMade / Math.max(1, placed)).toFixed(3));
  }

  /* ===== もじつみ（物理ベース）： フィールド・近接グラフ・単語保証 ===== */
  const mkB = (mora, x, y) => ({ mora, x, y, vx: 0, vy: 0, m: 1, sleep: false, rest: 0, el: new El("div") });
  {
    // 曲線フィールドの符号付き距離
    ok(sdField(4, 3.75) < -TRAD, "sdField center is deep inside");
    ok(sdField(4, 0.62) < 0, "sdField spawn point is inside");
    ok(sdField(-1, 3) > 0, "sdField outside left");
    ok(sdField(0.3, 7.2) > 0, "sdField bottom-left corner is cut by the curve");
    ok(sdField(4, 7.0) < 0, "sdField bottom center is inside");
    // 近接グラフの探索： 横一列の りんご を数えられる
    const bodies = [mkB("り", 0.5, 3), mkB("ん", 1.45, 3), mkB("ご", 2.4, 3), mkB("あ", 6.5, 0.8), mkB("か", 7.2, 6.5)];
    ok(countTraceableGraph(bodies, 1) === 1, "graph solver finds ringo");
    // 離れた文字同士は繋がらない
    const far = [mkB("り", 0.5, 0.5), mkB("ん", 4, 3.75), mkB("ご", 7.5, 7)];
    ok(countTraceableGraph(far, 1) === 0, "graph solver: far apart is not traceable");
    // 接頭辞集合の健全性
    ok(PREFIX_SET.has("りん"), "prefix set has りん");
    ok(!PREFIX_SET.has("りんごはし"), "prefix set rejects non-prefix");
    /* 追加辞書： 元辞書に欠けていた主要地名が入っていること */
    for (const p of ["おのみち", "ふくやま", "みはら", "なごや", "さっぽろ", "よこはま", "こうべ", "まつやま", "たかまつ", "いわて", "えひめ"])
      ok(WORDSET.has(p), "extra dict has place name " + p);
    /* 地名・駅名の専用追加辞書（japan-places）が本体辞書に取り込まれていること */
    ok(WORDSET.has("しんしらおか"), "japan-places station name しんしらおか included");
    ok(DICT.length > 100000, "dict includes japan-places (total " + DICT.length + ")");
  }
  /* ===== letterFix： 単語ゼロの盤面に単語を埋め込めること ===== */
  {
    const bodies = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) bodies.push(mkB("ん", 1 + c * 1.0, 2 + r * 1.0));
    ok(countTraceableGraph(bodies, 2) === 0, "letterFix precondition: no words");
    letterFix(bodies);
    const n = countTraceableGraph(bodies, 2);
    ok(n >= 2, "letterFix embeds >=2 traceable words (got " + n + ")");
  }
  /* ===== なぞり（tryConnectBody）： 接続・斜め・引き返し ===== */
  {
    T = { bodies: [mkB("り", 0.5, 3), mkB("ん", 1.45, 3), mkB("ご", 2.4, 3), mkB("す", 3.35, 3.9)],
          path: [], score: 0, words: 0, maxChain: 0, left: 60, over: false, settled: true,
          started: true, lastWords: [], lastShownSec: 99, shakes: 3, spawnQueue: [], spawnT: 0, simT: 0 };
    tryConnectBody(0.5, 3);
    ok(T.path.length === 1 && T.path[0].mora === "り", "trace starts at nearest body");
    tryConnectBody(1.45, 3);
    tryConnectBody(2.4, 3);
    ok(T.path.map(b => b.mora).join("") === "りんご", "trace builds ringo");
    tryConnectBody(3.35, 3.9);
    ok(T.path.length === 4, "trace extends diagonally-adjacent");
    tryConnectBody(2.4, 3);
    ok(T.path.length === 3, "trace backtracks");
    tryConnectBody(6.5, 0.8);
    ok(T.path.length === 3, "trace ignores far bodies");
    T = null;
  }
  /* ===== 先行入力（予約キュー）： 静止を待たず、どんどん連続で消せる ===== */
  {
    T = { bodies: [mkB("り", 0.5, 3), mkB("ん", 1.45, 3), mkB("ご", 2.4, 3), mkB("あ", 5.5, 3), mkB("め", 6.45, 3)],
          path: [], score: 0, words: 0, maxChain: 0, left: 90, over: false, settled: false,
          started: true, lastWords: [], lastShownSec: 99, shakes: 3, spawnQueue: [], spawnT: 0, simT: 0,
          rainEnd: null, combo: 0, lastClearAt: 0, queue: [], busy: false, executing: null };
    const w1 = T.bodies.slice(0, 3), w2 = T.bodies.slice(3);
    submitWord(w1);
    ok(T.busy && T.words === 1, "queue: first word executes immediately without waiting for settle");
    ok(hitStop > 0, "hitstop: world freezes briefly on clear");
    submitWord(w2);
    ok(T.queue.length === 1, "queue: second word is reserved while first is clearing");
    ok(w2[0].el.classList.contains("reserved"), "queue: reserved word is highlighted");
    T.path = [];
    tryConnectBody(5.5, 3);
    ok(T.path.length === 0, "queue: reserved bodies cannot be traced again");
    await new Promise(r => setTimeout(r, 1300));
    ok(T.words === 2 && T.queue.length === 0 && !T.busy, "queue: reserved word clears consecutively");
    ok(T.spawnQueue.length === 5, "queue: replacements accumulate (3+2, not overwritten): " + T.spawnQueue.length);
    T = null;
  }
  /* ===== 長い単語のボーナス： 5モーラ「あさごはん」は 250+120=370点 ===== */
  {
    T = { bodies: [mkB("あ", 0.5, 3), mkB("さ", 1.45, 3), mkB("ご", 2.4, 3), mkB("は", 3.35, 3), mkB("ん", 4.3, 3)],
          path: [], score: 0, words: 0, maxChain: 0, left: 90, over: false, settled: true,
          started: true, lastWords: [], lastShownSec: 99, shakes: 3, spawnQueue: [], spawnT: 0, simT: 0,
          rainEnd: null, combo: 0, lastClearAt: 0, queue: [], busy: false, executing: null };
    submitWord(T.bodies.slice());
    ok(T.score === 370, "long word bonus: 5-mora word scores 370 (got " + T.score + ")");
    await new Promise(r => setTimeout(r, 500));
    T = null;
  }
  /* ===== 小さい文字の代用： っは出さず、つで代用できる ===== */
  {
    ok(resolveReading("がつこう") === "がっこう", "sokuon: つ substitutes for っ (がつこう→がっこう)");
    ok(resolveReading("じゆう") === "じゆう", "sokuon: exact word wins over substitution (じゆう stays じゆう)");
    ok(resolveReading("りんご") === "りんご", "sokuon: plain word resolves as-is");
    ok(resolveReading("んんん") === null, "sokuon: non-word stays null");
    let bad = 0;
    for (let i = 0; i < 800; i++) { const mo = pickMoraTsumi(); if (mo.length === 1 && SMALL2FULL[mo]) bad++; }
    ok(bad === 0, "sokuon: pickMoraTsumi never deals a standalone small kana");
    const bodies = [mkB("が", 0.5, 3), mkB("つ", 1.45, 3), mkB("こ", 2.4, 3), mkB("う", 3.35, 3)];
    ok(countTraceableGraph(bodies, 1) >= 1, "sokuon: graph solver finds がっこう via つ");
    T = { bodies: bodies.slice(), path: [], score: 0, words: 0, maxChain: 0, left: 90, over: false, settled: true,
          started: true, lastWords: [], lastShownSec: 99, shakes: 3, spawnQueue: [], spawnT: 0, simT: 0,
          rainEnd: null, combo: 0, lastClearAt: 0, queue: [], busy: false, executing: null };
    submitWord(T.bodies.slice());
    await new Promise(r => setTimeout(r, 600));
    ok(T.words === 1 && T.lastWords[0] && T.lastWords[0].reading === "がっこう",
       "sokuon: cleared word is recorded under its true reading がっこう");
    T = null;
  }
  /* ===== フルシミュレーション： ぱらぱら落ちて静止し、単語が保証される ===== */
  {
    startTsumi();
    let frames = 0;
    while (T && !T.settled && frames < 1200) { stepTsumi(1 / 60); frames++; }
    ok(T.settled, "tsumi settles (" + frames + " frames)");
    ok(T.bodies.length === TBODIES, "all bodies spawned: " + T.bodies.length);
    let outside = 0;
    for (const b of T.bodies) if (sdField(b.x, b.y) > -TRAD + 0.08) outside++;
    ok(outside === 0, "all bodies rest inside the curved field (" + outside + ")");
    ok(countTraceableGraph(T.bodies, 2) >= 2, "settled board guarantees traceable words");
    ok(T.started, "timer starts after settle");
    let floating = 0;
    for (const b of T.bodies) if (!bodySupported(b, T.bodies)) floating++;
    ok(floating === 0, "no body floats in mid-air (" + floating + ")");
    console.log("tsumi sim: settled in " + (frames / 60).toFixed(2) + "s");
    // ゆらす： 投げ上げて再静止すること
    shakeField();
    ok(!T.settled && T.shakes === PARAMS.shakes - 1, "shake consumes one use and un-settles");
    // なぞり中のブロックは、周りが動いていても指の下でズレないこと
    const pb = T.bodies[0];
    pb.pin = true;
    const px = pb.x, py = pb.y;
    for (let i = 0; i < 30; i++) stepTsumi(1 / 60);
    ok(pb.x === px && pb.y === py, "pin: traced body does not drift while board moves");
    pb.pin = false;
    frames = 0;
    while (T && !T.settled && frames < 1200) { stepTsumi(1 / 60); frames++; }
    ok(T.settled, "board re-settles after shake (" + frames + " frames)");
    ok(countTraceableGraph(T.bodies, 2) >= 2, "words guaranteed after shake");
    console.log("tsumi shake sim: re-settled in " + (frames / 60).toFixed(2) + "s");
    T = null;
  }

  /* ===== 実ループ駆動のE2E（rAFループ自体が生きていること） ===== */
  {
    let vt = 0;
    const runFrames = (n, dtMs = 16.7) => {
      for (let i = 0; i < n; i++) {
        const cb = global.__rafCb; global.__rafCb = null;
        if (!cb) break;
        vt += dtMs;
        cb(vt);
      }
    };
    startGame("tsumi");
    /* 静止前（落下が始まった直後）でも掴めて、タイマーが最初の掴みで始まること */
    const gb = makeBody("あ", 3, 3); T.bodies.push(gb);
    ok(!T.settled && !T.started, "E2E: pre-settle state before first grab");
    tsumiPointer({ clientX: 3 * 378 / 8, clientY: 3 * 378 / 8 }, "down");
    ok(T.path.length === 1 && T.path[0] === gb, "E2E: grab works before settle (path=" + T.path.length + ")");
    ok(T.started, "E2E: timer starts on first grab");
    tsumiPointer({ clientX: 0, clientY: 0 }, "up");
    T.bodies = T.bodies.filter(b => b !== gb); gb.el.remove();
    runFrames(60);
    ok(T && T.bodies.length > 0, "E2E: loop spawns tsumi bodies (" + (T ? T.bodies.length : "no T") + ")");
    runFrames(600);
    ok(T && T.settled, "E2E: loop settles the board");
    ok(T && T.started && T.left < TSUMI_TIME, "E2E: timer counts down (left=" + (T ? T.left.toFixed(1) : "?") + ")");
    T = null;
    /* 回帰： 静止した盤面で単語を消したとき、補充ブロックが空中で凍らず落ちてくること
       （消去の演出待ち中に静止判定が先行し、補充が上部に張り付く不具合があった） */
    startGame("tsumi");
    {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      let g2 = 0;
      while (g2++ < 2000 && !(T && T.settled)) { stepTsumi(1 / 60); await wait(1); }
      ok(T && T.settled, "regression: board settles before clear");
      ensureTsumiDict();
      const adj = buildAdj(T.bodies);
      let wpath = null;
      const dfs = (i, str, p, used) => {
        if (wpath) return;
        if (p.length >= 2 && resolveReading(str)) { wpath = p.slice(); return; }
        if (p.length >= 6) return;
        for (const j of adj[i]) {
          if (used.has(j)) continue;
          const ns = str + T.bodies[j].mora;
          if (!TSUMI_PREFIX_SET.has(ns)) continue;
          used.add(j); p.push(j); dfs(j, ns, p, used); p.pop(); used.delete(j);
          if (wpath) return;
        }
      };
      for (let i = 0; i < T.bodies.length && !wpath; i++) dfs(i, T.bodies[i].mora, [i], new Set([i]));
      ok(!!wpath, "regression: a word is traceable on the settled board");
      if (wpath) {
        submitWord(wpath.map(i => T.bodies[i]));
        let g3 = 0;
        while (g3++ < 900 && !(T.settled && !T.busy && !T.spawnQueue.length)) { stepTsumi(1 / 60); await wait(4); }
        const stuck = T.bodies.filter(b => b.y < 1.5).length;
        ok(T.bodies.length === TBODIES && stuck === 0 && T.settled,
          "regression: refills fall after clear (bodies=" + T.bodies.length + " stuckTop=" + stuck + " settled=" + T.settled + ")");
      }
    }
    T = null;
    startGame("endless");
    runFrames(120);
    ok(G && (!G.falling || G.falling.y > 0 || G.moraCleared > 0), "E2E: falling block falls via loop");
    G = null;
  }

  /* ===== ログ枠の固定（常に3枠で描く） ===== */
  {
    const count = h => (h.match(/class="lw"/g) || []).length;
    ok(count(renderLastWords([])) === 3, "log frame: empty still renders 3 slots");
    ok(count(renderLastWords([{ w: "学校", reading: "がっこう", gain: 40, m: "まなぶところ" }])) === 3, "log frame: 1 item still renders 3 slots");
    ok(count(renderLastWords([1, 2, 3].map(i => ({ w: "w" + i, reading: "r" + i, gain: i, m: "m" + i })))) === 3, "log frame: 3 items render 3 slots");
    ok(renderLastWords([]).includes("まだ ないよ"), "log frame: empty shows placeholder text");
  }

  console.log("\n=== RESULT: pass=" + pass + " fail=" + fail + " ===");
  if (fails.length) console.log(fails.slice(0, 20).join("\n"));
})();
