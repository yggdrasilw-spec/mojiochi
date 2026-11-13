// もじおち検証ハーネス: 辞書整合性 + 判定ロジック（単語検出・最長一致・重力・連鎖・アシスト）
// 使い方: kana_drop.html の全 script をマーカー位置に差し込んだものを node で実行
"use strict";
class El {
  constructor(tag) {
    this.tagName = (tag || "div").toUpperCase(); this.children = []; this.style = {}; this.dataset = {};
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
  querySelectorAll: sel => registry.byClass(sel),
  querySelector: () => new El(),
  addEventListener() {}
};
global.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
global.requestAnimationFrame = () => 0;
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
  ok(DICT.length >= 3000, "dict size " + DICT.length);
  const KANA = /^[ぁ-ゖー]+$/;
  let badKana = 0, badMora = 0, dup = 0; const seenR = new Set();
  for (const [r, w, m] of DICT) {
    if (!KANA.test(r)) badKana++;
    const n = moraUnits(r).length;
    if (n < 2 || n > 6) badMora++;
    if (seenR.has(r)) dup++; seenR.add(r);
    if (typeof w !== "string" || typeof m !== "string") { fail++; fails.push("entry shape " + r); }
  }
  ok(badKana === 0, "non-kana readings " + badKana);
  ok(badMora === 0, "mora out of range " + badMora);
  ok(dup === 0, "duplicate readings " + dup);
  ok(WORDSET.size === DICT.length, "wordset sync");
  for (const t of ["りんご", "がっこう", "きゅうり", "いぬ", "すいか", "でんしゃ"])
    ok(WORDSET.has(t), "dict contains " + t);

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
  // 縦並びは検出しない（仕様）
  g = gridWith([[8, 0, "り"], [9, 0, "ん"], [10, 0, "ご"]]);
  ok(findWords(g).length === 0, "vertical not detected");
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
  // スポーン分布： 頻出モーラがちゃんと出る＆全て辞書内のモーラ
  const counts = {};
  for (let i = 0; i < 4000; i++) { const mo = pickMoraFreq(); counts[mo] = (counts[mo] || 0) + 1; if (!MORA_FREQ.has(mo)) { ok(false, "spawn unknown mora " + mo); break; } }
  ok((counts["ん"] || 0) > 100, "spawn includes ん often: " + counts["ん"]);
  ok(Object.keys(counts).length > 60, "spawn variety " + Object.keys(counts).length);

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
        for (const m of ms) for (let k = 0; k < m.len; k++) grid[m.row][m.start + k] = null;
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

  console.log("\n=== RESULT: pass=" + pass + " fail=" + fail + " ===");
  if (fails.length) console.log(fails.slice(0, 20).join("\n"));
})();
