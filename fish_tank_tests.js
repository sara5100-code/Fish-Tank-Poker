#!/usr/bin/env node
/*
 * Fish Tank Poker - ヘッドレス・テストハーネス
 *
 * ブラウザ無しで fish_tank_poker.html のロジックを検証する。
 *   1) 埋め込み <script> を取り出し、Node の vm + 偽DOM で読み込む
 *   2) 内蔵の回帰スイート runFishTankRegressionTests() を実行
 *   3) 理論検証(estimateEquity / handRole / boardTex / ハンドランク表)を実行
 *
 * 使い方:
 *   node fish_tank_tests.js [path/to/fish_tank_poker.html]
 *   FAST=1 node fish_tank_tests.js   # 回帰スイートのエクイティ試行を抑えて高速化
 *   SKIP_REGRESSION=1 node ...        # 回帰スイートを飛ばし理論検証のみ
 *
 * 既定の対象ファイルは同ディレクトリの fish_tank_poker_fixed.html → 無ければ fish_tank_poker.html。
 */
const fs = require('fs'), vm = require('vm'), path = require('path');

function makeSeededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pickHtml() {
  if (process.argv[2]) return process.argv[2];
  for (const f of ['fish_tank_poker_fixed.html', 'fish_tank_poker.html']) {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) return p;
  }
  throw new Error('HTMLが見つかりません。引数でパスを指定してください。');
}

function htmlTailIsClosed(html) {
  return /<\/script>\s*<\/body>\s*<\/html>\s*$/i.test(String(html || '').trim());
}

function runHtmlIntegrityChecks(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  let pass = 0, fail = 0; const fails = [];
  const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? '  [' + e + ']' : '')); } };
  ok('HTML tail: script/body/html closed', htmlTailIsClosed(html));
  const broken = html.replace(/<\/script>\s*<\/body>\s*<\/html>\s*$/i, '');
  ok('HTML tail: missing-copy guard', !htmlTailIsClosed(broken));
  console.log(`\n[HTML integrity] ${pass} pass / ${fail} fail`);
  fails.forEach(f => console.log('  FAIL:', f));
  return fail === 0;
}

function loadSandbox(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) throw new Error('<script> が見つかりません');
  // const/class はvmグローバルに乗らないため、末尾でブリッジ注入
  const code = m[1] +
    "\n;try{Object.assign(globalThis,{HandEval,Deck,Card,HAND_RANK_169,HAND_COMBO_FRAC,HAND_STRENGTH,RANK_VAL,RANKS,SUITS,GameEngine,AI_PROFILES,regressionPlayer});}catch(e){globalThis.__bridgeErr=e.message;}\n";
  const anyNode = new Proxy(function () {}, {
    get(t, p) {
      if (p === 'style') return {};
      if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (p === 'length') return 0; if (p === 'value') return '';
      return anyNode;
    }, apply() { return anyNode; }, set() { return true; }, construct() { return anyNode; }
  });
  const documentStub = new Proxy({}, {
    get(t, p) {
      if (['getElementById', 'querySelector', 'createElement'].includes(p)) return () => anyNode;
      if (p === 'querySelectorAll') return () => [];
      if (p === 'addEventListener' || p === 'removeEventListener') return () => {};
      return anyNode;
    }
  });
  const seededMath = Object.create(Math);
  seededMath.random = makeSeededRandom(0x5f3759df);
  const sb = {
    console, Math: seededMath, Date, JSON, Array, Object, String, Number, Boolean, Set, Map, RegExp, Symbol,
    parseInt, parseFloat, isNaN, setTimeout: () => {}, clearTimeout: () => {}, setInterval: () => {},
    clearInterval: () => {}, requestAnimationFrame: () => {},
    URLSearchParams: class { constructor() {} has() { return false; } get() { return null; } },
    location: { search: '', href: '' }, alert: () => {}, navigator: {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }
  };
  sb.window = sb; sb.document = documentStub; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(code, sb, { filename: path.basename(htmlPath) });
  if (sb.__bridgeErr) console.warn('bridge warn:', sb.__bridgeErr);
  return sb;
}

// 速度用: 回帰スイート向けに軽量エクイティへ差し替え(リバー単独は厳密列挙のまま=決定論)
function patchFastEquity(s) {
  const { Deck, HandEval } = s;
  s.estimateEquity = function (hc, board, nOpp) {
    const deck = new Deck();
    const known = new Set([...hc, ...board].map(c => c.toString()));
    let seed = 0xc0ffee ^ ((nOpp || 0) << 16);
    [...known].sort().join('').split('').forEach(ch => { seed = ((seed * 31) ^ ch.charCodeAt(0)) >>> 0; });
    const rand = makeSeededRandom(seed);
    const rem = deck.cards.filter(c => !known.has(c.toString()));
    if (board.length >= 5) {
      const my = HandEval.evaluate([...hc, ...board]).score; let sc = 0, tot = 0;
      for (let i = 0; i < rem.length; i++) for (let j = i + 1; j < rem.length; j++) {
        const os = HandEval.evaluate([rem[i], rem[j], ...board]).score; sc += my > os ? 1 : (my === os ? 0.5 : 0); tot++;
      }
      return tot ? sc / tot : 0;
    }
    let sc = 0; const iter = 300;
    for (let i = 0; i < iter; i++) {
      for (let k = rem.length - 1; k > 0; k--) { const r = (rand() * (k + 1)) | 0; const t = rem[k]; rem[k] = rem[r]; rem[r] = t; }
      let p = 0; const b = [...board]; while (b.length < 5) b.push(rem[p++]);
      const my = HandEval.evaluate([...hc, ...b]).score; let lose = false, tie = false;
      for (let o = 0; o < nOpp; o++) { const c1 = rem[p++], c2 = rem[p++]; if (!c1 || !c2) continue; const os = HandEval.evaluate([c1, c2, ...b]).score; if (os > my) { lose = true; break; } if (os === my) tie = true; }
      sc += lose ? 0 : (tie ? 0.5 : 1);
    }
    return sc / iter;
  };
}

function runTheoryChecks(s) {
  const Cs = s.regressionCards;
  const { estimateEquity, handRole, boardTex, boardTextureProfile, boardTextureFrequencyAdjustment, boardTextureSizePlan, representativeBoardProfile, rangeActionUpdateProfile, HandEval, handType, HAND_RANK_169, HAND_COMBO_FRAC } = s;
  let pass = 0, fail = 0; const fails = [];
  const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? '  [' + e + ']' : '')); } };
  const approx = (n, v, lo, hi) => ok(n, v >= lo && v <= hi, 'got ' + (typeof v === 'number' ? v.toFixed(3) : v) + ' want ' + lo + '..' + hi);
  const role = (h, b) => handRole(Cs(h), Cs(b), HandEval.evaluate([...Cs(h), ...Cs(b)]));

  // --- ハンドランク表 169手 ---
  ok('169手: 件数169・重複なし', HAND_RANK_169.length === 169 && new Set(HAND_RANK_169).size === 169);
  const posMap = {}; HAND_RANK_169.forEach((h, i) => posMap[h] = i + 1);
  let inv = HAND_RANK_169.filter(h => h.endsWith('s') && posMap[h.slice(0, -1) + 'o'] && posMap[h] > posMap[h.slice(0, -1) + 'o']);
  ok('169手: スーテッド<オフスーツ逆転なし', inv.length === 0, inv.join(','));

  // --- estimateEquity 既知値 ---
  approx('AA vs1 ~0.85', estimateEquity(Cs(['As', 'Ah']), [], 1, 3000), 0.82, 0.88);
  approx('AKs vs1 ~0.67', estimateEquity(Cs(['As', 'Ks']), [], 1, 3000), 0.63, 0.71);
  approx('72o vs1 ~0.35', estimateEquity(Cs(['7d', '2c']), [], 1, 3000), 0.30, 0.40);
  ok('AA>KK', estimateEquity(Cs(['As','Ah']),[],1,12000) > estimateEquity(Cs(['Ks','Kh']),[],1,12000));
  ok('3opp<1opp', estimateEquity(Cs(['As', 'Ah']), [], 3, 2000) < estimateEquity(Cs(['As', 'Ah']), [], 1, 2000));
  const r1 = estimateEquity(Cs(['As', 'Kd']), Cs(['Ah', 'Kh', '7c', '2d', '9s']), 1, 50);
  const r2 = estimateEquity(Cs(['As', 'Kd']), Cs(['Ah', 'Kh', '7c', '2d', '9s']), 1, 9999);
  ok('リバー厳密列挙=決定論', r1 === r2, r1 + ' vs ' + r2);
  approx('リバーナッツ~1.0', estimateEquity(Cs(['Ah', 'Kh']), Cs(['Qh', 'Jh', 'Th', '2c', '3d']), 1, 9999), 0.999, 1.0);
  approx('全タイ=0.5', estimateEquity(Cs(['2c', '3d']), Cs(['Ah', 'Kh', 'Qh', 'Jh', 'Th']), 1, 9999), 0.45, 0.55);

  // --- handRole / boardTex ---
  let R;
  R = role(['As', 'Td'], ['Ts', '9c', '4d']); ok('TPTK top_pair', R.pairTier === 'top_pair', R.pairTier); ok('TPTK strong/value', ['strong', 'value'].includes(R.role), R.role);
  R = role(['As', 'Ad'], ['Ks', '9c', '4d']); ok('AA overpair', R.pairTier === 'overpair', R.pairTier);
  R = role(['7s', '7d'], ['Ks', '9c', '4d']); ok('77 under_pair/medium', R.pairTier === 'under_pair' && R.role === 'medium', R.pairTier + '/' + R.role);
  R = role(['9s', '2d'], ['Ks', '9c', '4d']); ok('2nd pair', R.pairTier === 'second_pair', R.pairTier);
  R = role(['9s', '9h'], ['Ks', '9c', '4d']); ok('set strong', ['strong', 'nutted', 'value'].includes(R.role), R.role);
  R = role(['As', '2s'], ['Ks', '9s', '4d']); ok('FD draw', R.role === 'draw' && R.draw && R.draw.flush, R.role);
  R = role(['8s', '7d'], ['9c', '6h', '2d']); ok('OESD draw', R.role === 'draw' && R.draw && R.draw.oesd, R.role);
  R = role(['As', 'Qd'], ['Ks', '9c', '4d', '2h', '3s']); ok('river air', R.role === 'air', R.role);
  ok('boardTex monotone flushy>=3', boardTex(Cs(['As', 'Ks', '9s'])).flushy >= 3);
  ok('boardTex paired', boardTex(Cs(['Ks', 'Kd', '4c'])).paired === true);
  if (typeof boardTextureProfile === 'function' && typeof representativeBoardProfile === 'function') {
    const aDry = boardTextureProfile(Cs(['Ad', '9c', '3s']), 'flop', []);
    const lowConn = boardTextureProfile(Cs(['9h', '8c', '7d']), 'flop', []);
    const mono = boardTextureProfile(Cs(['Ah', 'Th', '4h']), 'flop', []);
    const fourFlush = boardTextureProfile(Cs(['Ah', 'Th', '4h', '2c', '7h']), 'river', Cs(['Ah', 'Th', '4h', '2c']));
    const pairRiver = boardTextureProfile(Cs(['Kh', '9c', '4d', '2s', '9h']), 'river', Cs(['Kh', '9c', '4d', '2s']));
    ok('代表ボード: A-high dry分類', aDry.representativeClass === 'a_high_dry', aDry.representativeClass);
    ok('代表ボード: low connected分類', lowConn.representativeClass === 'low_connected', lowConn.representativeClass);
    ok('代表ボード: monotone分類', mono.representativeClass === 'monotone', mono.representativeClass);
    ok('代表ボード: 4-flush river分類', fourFlush.representativeClass === 'four_flush_river', fourFlush.representativeClass);
    ok('代表ボード: paired river分類', pairRiver.representativeClass === 'paired_river', pairRiver.representativeClass);
    const pfrDry = boardTextureFrequencyAdjustment(0.50, aDry, { street: 'flop', isPfr: true, isIP: true, role: { role: 'air' }, nOpponents: 1 });
    const callerLow = boardTextureFrequencyAdjustment(0.50, lowConn, { street: 'flop', isPfr: false, isIP: true, role: { role: 'air' }, nOpponents: 1 });
    const drySize = boardTextureSizePlan(100, aDry, { role: 'air' }, { street: 'flop', isPfr: true, isIP: true, nOpponents: 1 });
    ok('代表ボード頻度: A-high dryのPFR IPは小CB寄り', pfrDry.representativeClass === 'a_high_dry' && pfrDry.preferredSizePct === 33 && pfrDry.betPct >= 55, JSON.stringify(pfrDry));
    ok('代表ボード頻度: low connected callerは受け側絡みを残す', callerLow.representativeClass === 'low_connected' && callerLow.betPct <= pfrDry.betPct, JSON.stringify(callerLow));
    ok('代表ボードサイズ: 辞書由来サイズを返す', drySize && drySize.source === 'representative_board' && drySize.pct === 33, JSON.stringify(drySize));
  }
  if (typeof rangeActionUpdateProfile === 'function' && typeof boardTextureProfile === 'function') {
    const board = boardTextureProfile(Cs(['Th', '9h', '4d', '8c', '2s']), 'river', Cs(['Th', '9h', '4d', '8c']));
    const roleWeak = { role: 'medium', pairTier: 'second_pair' };
    const oneBarrelCall = { street: 'river', action: 'call', amount: 42, toCall: 42, pot: 142, position: 'BTN', isHuman: true };
    const oneBarrelHand = { decisions: [
      { street: 'river', action: 'bet', amount: 42, pot: 100, isHuman: false },
      oneBarrelCall
    ] };
    const threeBarrelCall = { street: 'river', action: 'call', amount: 78, toCall: 78, pot: 218, position: 'BTN', isHuman: true };
    const threeBarrelHand = { decisions: [
      { street: 'flop', action: 'bet', amount: 35, pot: 70, isHuman: false },
      { street: 'flop', action: 'call', amount: 35, pot: 105, isHuman: true },
      { street: 'turn', action: 'bet', amount: 70, pot: 140, isHuman: false },
      { street: 'turn', action: 'call', amount: 70, pot: 210, isHuman: true },
      { street: 'river', action: 'bet', amount: 78, pot: 218, isHuman: false },
      threeBarrelCall
    ] };
    const one = rangeActionUpdateProfile(oneBarrelHand, oneBarrelCall, board, roleWeak, { heroRangeAdv: '低' });
    const three = rangeActionUpdateProfile(threeBarrelHand, threeBarrelCall, board, roleWeak, { heroRangeAdv: '低' });
    ok('レンジ更新: 3バレルは1バレルよりバリュー密度が高い', three.valueDensityPct > one.valueDensityPct, 'one=' + one.valueDensityPct + ' three=' + three.valueDensityPct);
    ok('レンジ更新: 3バレルはブラフ候補が増えすぎない', three.bluffCandidatePct <= one.bluffCandidatePct, 'one=' + one.bluffCandidatePct + ' three=' + three.bluffCandidatePct);
    ok('レンジ更新: 密度フィールドを保持する', typeof three.rangeDensityBand === 'string' && typeof three.bluffDensityBand === 'string', JSON.stringify(three));
  }
  // --- クラッシュ回帰ガード: ポケットペア×ペアボード(handRoleのmadeDraw未定義バグ) ---
  for (const [h, b, lbl] of [[['As', 'Ah'], ['8s', '8c', '5d'], 'AA on 8-8-5'], [['5s', '5h'], ['8s', '8c', '3d'], '55 on 8-8-3']]) {
    let crashed = false; try { role(h, b); } catch (e) { crashed = true; }
    ok('handRole crash無し: ' + lbl, !crashed);
  }

  console.log(`\n[理論検証] ${pass} pass / ${fail} fail`);
  fails.forEach(f => console.log('  FAIL:', f));
  return fail === 0;
}

function runRegression(s) {
  if (typeof s.runFishTankRegressionTests !== 'function') { console.log('[回帰] runner未検出 → スキップ'); return true; }
  const t0 = Date.now();
  const res = s.runFishTankRegressionTests();
  const arr = res.results || res.tests || [];
  const fails = arr.filter(t => t.pass !== true).map(t => t.name + (t.error ? ' [ERR:' + t.error + ']' : ''));
  console.log(`\n[回帰] ${res.passed}/${res.total} PASS  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  fails.forEach(n => console.log('  FAIL:', n));
  return fails.length === 0;
}

function runModeChecks(s) {
  if (typeof s.setRangeMode !== 'function') { console.log('[モード検証] setRangeMode未検出 → スキップ'); return true; }
  const { regressionHand, regressionDecision, analyzeHand, setRangeMode } = s;
  const he = (an, f) => (an.evals || []).filter(e => e.isHuman).find(f);
  const D = regressionDecision;
  const turnHand = () => regressionHand({ heroHole: ['As', 'Td'], villainHole: ['Kh', 'Kc'], board: ['Ts', '9s', '4d', '8c'], pot: 5800, decisions: [
    D({ street: 'flop', action: 'check', amount: 0, pot: 1000, toCall: 0, facingRaise: false, position: 'CO', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 12000 }),
    D({ street: 'flop', action: 'raise', amount: 700, pot: 1000, toCall: 0, facingRaise: false, position: 'BTN', playerName: 'v', isHuman: false, playerIdx: 1, playerChipsBefore: 12000 }),
    D({ street: 'flop', action: 'call', amount: 700, pot: 1700, toCall: 700, potOdds: 700 / 2400, facingRaise: true, position: 'CO', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 12000 }),
    D({ street: 'turn', action: 'check', amount: 0, pot: 2400, toCall: 0, facingRaise: false, position: 'CO', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 11300 }),
    D({ street: 'turn', action: 'raise', amount: 1700, pot: 2400, toCall: 0, facingRaise: false, position: 'BTN', playerName: 'v', isHuman: false, playerIdx: 1, playerChipsBefore: 11300 }),
    D({ street: 'turn', action: 'call', amount: 1700, pot: 4100, toCall: 1700, potOdds: 1700 / 5800, facingRaise: true, position: 'CO', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 11300 })
  ] });
  const riverHand = () => { const t = turnHand(); return regressionHand({ heroHole: ['As', 'Td'], villainHole: ['Kh', 'Kc'], board: ['Ts', '9s', '4d', '8c', '2h'], pot: 14400, decisions: [...t.decisions,
    D({ street: 'river', action: 'check', amount: 0, pot: 5800, toCall: 0, facingRaise: false, position: 'CO', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 9600 }),
    D({ street: 'river', action: 'raise', amount: 4300, pot: 5800, toCall: 0, facingRaise: false, position: 'BTN', playerName: 'v', isHuman: false, playerIdx: 1, playerChipsBefore: 9600 }),
    D({ street: 'river', action: 'call', amount: 4300, pot: 10100, toCall: 4300, potOdds: 4300 / 14400, facingRaise: true, position: 'CO', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 9600 })
  ] }); };
  let pass = 0, fail = 0; const fails = [];
  const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? '  [' + e + ']' : '')); } };
  // TPTK(AsTd) on T9s4 8 (2) を OOP で3バレル受け。母集団TPTKオーバーバリューの典型局面。
  setRangeMode('live');
  let T = he(analyzeHand(turnHand()), e => e.street === 'turn' && e.action === 'call');
  let R = he(analyzeHand(riverHand()), e => e.street === 'river' && e.action === 'call');
  ok('LIVE turn: quality≠good', T.quality !== 'good', T.quality);
  ok('LIVE turn: verdict border/bad', ['border', 'bad'].includes(T.onePairProfile && T.onePairProfile.verdict), T.onePairProfile && T.onePairProfile.verdict);
  ok('LIVE river: quality bad', R.quality === 'bad', R.quality);
  ok('LIVE river: verdict bad(フォールド)', R.onePairProfile && R.onePairProfile.verdict === 'bad', R.onePairProfile && R.onePairProfile.verdict);
  const liveRiverEff = R.effectiveEqPct;
  setRangeMode('gto');
  T = he(analyzeHand(turnHand()), e => e.street === 'turn' && e.action === 'call');
  R = he(analyzeHand(riverHand()), e => e.street === 'river' && e.action === 'call');
  ok('GTO turn: quality good維持(EV正直)', T.quality === 'good', T.quality);
  ok('GTO river: verdict border(badにしない)', R.onePairProfile && R.onePairProfile.verdict !== 'bad', R.onePairProfile && R.onePairProfile.verdict);
  // GTOはプレッシャー割引を弱めるので、同一局面の実効EQはLiveより高いはず
  ok('GTO river: 実効EQ > Live(割引が弱い)', R.effectiveEqPct > liveRiverEff, 'gto=' + R.effectiveEqPct + ' live=' + liveRiverEff);
  // 整合性: GTOで実効EQが必要勝率を上回る強ワンペアコールは quality を bad にしない(本文「コール寄り」と一致)
  ok('GTO river: quality≠bad(本文コール寄りと整合)', R.quality !== 'bad', 'quality=' + R.quality + ' effEQ=' + R.effectiveEqPct);
  // [回帰ガード] 4BET/5BET後は手札順位だけでなく、vs4bet表のスタック帯別継続レンジを本文・mixに反映する。
  const fourBetHand = (heroHole, finalAction) => regressionHand({ heroHole, villainHole: ['Ah', 'Kh'], board: [], pot: 400, decisions: [
    D({ street: 'preflop', action: 'raise', amount: 15, pot: 7, toCall: 0, facingRaise: false, position: 'CO', playerName: 'v', isHuman: false, playerIdx: 1, playerChipsBefore: 500 }),
    D({ street: 'preflop', action: 'raise', amount: 45, pot: 22, toCall: 15, facingRaise: true, position: 'BTN', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 500 }),
    D({ street: 'preflop', action: 'raise', amount: 150, pot: 67, toCall: 105, facingRaise: true, position: 'CO', playerName: 'v', isHuman: false, playerIdx: 1, playerChipsBefore: 485 }),
    D({ street: 'preflop', action: finalAction, amount: finalAction === 'call' ? 105 : 500, pot: 217, toCall: 105, potOdds: 105 / 322, facingRaise: true, position: 'BTN', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 455, pfRaiseCountBefore: 3 })
  ] });
  const QQ4c = he(analyzeHand(fourBetHand(['Qh', 'Qs'], 'call')), e => e.street === 'preflop' && e.action === 'call');
  const JJ5b = he(analyzeHand(fourBetHand(['Jh', 'Js'], 'raise')), e => e.street === 'preflop' && e.action === 'raise' && e.amount === 500);
  ok('4BETコール本文にvs4bet参照レンジを出す', /参照レンジでは/.test(QQ4c.comment || '') && /Call\/5bet/.test(QQ4c.strategyMix || ''), (QQ4c.comment || '').slice(0, 80));
  ok('100BB相当のJJ 5BETはvs4bet表でレンジ外寄り', JJ5b.quality === 'bad' && /参照レンジでは/.test(JJ5b.comment || ''), 'q=' + JJ5b.quality + ' c=' + (JJ5b.comment || '').slice(0, 80));
  const threeBetHand = (heroHole, finalAction) => regressionHand({ heroHole, villainHole: ['Ah', '5h'], board: [], pot: 160, decisions: [
    D({ street: 'preflop', action: 'raise', amount: 15, pot: 7, toCall: 0, facingRaise: false, position: 'BTN', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 500 }),
    D({ street: 'preflop', action: 'raise', amount: 55, pot: 22, toCall: 15, facingRaise: true, position: 'BB', playerName: 'v', isHuman: false, playerIdx: 1, playerChipsBefore: 500 }),
    D({ street: 'preflop', action: finalAction, amount: finalAction === 'fold' ? 0 : (finalAction === 'call' ? 40 : 145), pot: 77, toCall: 40, potOdds: 40 / 117, facingRaise: true, position: 'BTN', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 485, pfRaiseCountBefore: 2 })
  ] });
  const QQ3c = he(analyzeHand(threeBetHand(['Qh', 'Qs'], 'call')), e => e.street === 'preflop' && e.action === 'call');
  const AJo3f = he(analyzeHand(threeBetHand(['Ah', 'Jd'], 'fold')), e => e.street === 'preflop' && e.action === 'fold');
  const AJo4b = he(analyzeHand(threeBetHand(['Ah', 'Jd'], 'raise')), e => e.street === 'preflop' && e.action === 'raise' && e.amount === 145);
  ok('3BETコール本文にvs3bet参照レンジを出す', /vs3BET参照レンジ/.test(QQ3c.comment || '') && /Call\/4BET/i.test(QQ3c.strategyMix || ''), (QQ3c.comment || '').slice(0, 80));
  ok('AJoの3BETフォールドはvs3bet表で自然', AJo3f.quality === 'good' && /vs3BET参照レンジ/.test(AJo3f.comment || ''), 'q=' + AJo3f.quality + ' c=' + (AJo3f.comment || '').slice(0, 80));
  ok('AJoの4BETはvs3bet表でレンジ外寄り', AJo4b.quality === 'bad' && /vs3BET参照レンジ/.test(AJo4b.comment || ''), 'q=' + AJo4b.quality + ' c=' + (AJo4b.comment || '').slice(0, 80));
  // [回帰ガード] アンダーペア(自分のポケットペア)を「ボードのペアにキッカー」と誤説明しない
  if (typeof s.coachReviewText === 'function') {
    const riverCatch = {
      street: 'river',
      action: 'call',
      potOdds: 0.30,
      liveCashRiverDecisionProfile: {
        lane: 'riverOnePairCatch',
        sizePct: 75,
        completed: true,
        line: { label: '3barrel' },
        suggest: 'フォールド寄り'
      },
      rangeActionUpdateProfile: {
        street: 'river',
        lane: 'call',
        valueDensityPct: 78,
        bluffCandidatePct: 18,
        rangeDensityBand: '高',
        bluffDensityBand: '少なめ'
      }
    };
    const riverTxt = s.coachReviewText(riverCatch);
    ok('river call text compares required equity and range density', /必要勝率/.test(riverTxt) && /バリュー密度/.test(riverTxt) && /ブラフ候補/.test(riverTxt) && /フォールド寄り/.test(riverTxt), riverTxt);
    const D2 = regressionDecision;
    const up = regressionHand({ heroHole: ['4c', '4d'], villainHole: ['Qd', '6c'], board: ['5h', '2c', 'Qh', 'Ac', 'Ks'], pot: 41, decisions: [
      D2({ street: 'flop', action: 'check', amount: 0, pot: 28, toCall: 0, facingRaise: false, position: 'MP', playerName: 'あ', isHuman: true, playerIdx: 0, playerChipsBefore: 987 }),
      D2({ street: 'flop', action: 'check', amount: 0, pot: 28, toCall: 0, facingRaise: false, position: 'BB', playerName: 'm', isHuman: false, playerIdx: 1, playerChipsBefore: 992 })
    ] });
    const e = (analyzeHand(up).evals || []).filter(x => x.isHuman)[0];
    const txt = s.coachReviewText(e) + (e.comment || '');
    ok('アンダーペアを「ボードのペアにキッカー」と誤説明しない', !/ボードのペアにキッカー|ボードペアはキッカー/.test(txt), txt.slice(0, 40));
    ok('44 on dry board は under_pair 判定', e.onePairProfile && e.onePairProfile.pairTier === 'under_pair', e.onePairProfile && e.onePairProfile.pairTier);
    // [回帰ガード] 脆弱トリップス(J9 on KJJ8s, 3スペード)のターンチェックバックを重く罰しない
    const D3 = regressionDecision;
    const trh = regressionHand({ heroHole: ['Jh', '9c'], villainHole: ['Kd', '3h'], board: ['Ks', 'Jc', 'Js', '8s', '4s'], pot: 46, decisions: [
      D3({ street: 'turn', action: 'check', amount: 0, pot: 46, toCall: 0, facingRaise: false, position: 'BTN', playerName: 'あ', isHuman: true, playerIdx: 0, playerChipsBefore: 978 }),
      D3({ street: 'turn', action: 'check', amount: 0, pot: 46, toCall: 0, facingRaise: false, position: 'BB', playerName: 'k', isHuman: false, playerIdx: 1, playerChipsBefore: 983 })
    ] });
    const te = (analyzeHand(trh).evals || []).filter(x => x.isHuman)[0];
    ok('脆弱トリップスのスケアターンchをbadにしない', te.quality !== 'bad' && (te.deduction || 0) <= 12, 'q=' + te.quality + ' ded=' + te.deduction);
    // [回帰ガード] 範囲内の標準BTNオープンを主テーマ(preflop-entry)に乗っ取らせない
    if (typeof s.regressionPlayer === 'function') {
      const RP = s.regressionPlayer, D5 = regressionDecision;
      const ps = [RP('あなた', true, ['Jh', '9c'], { chips: 1000 }), RP('b', false, ['2c', '7d'], { chips: 1000, active: false }), RP('n', false, ['3c', '8d'], { chips: 1000, active: false }), RP('y', false, ['4c', '9d'], { chips: 1000, active: false }), RP('u', false, ['5c', 'Td'], { chips: 1000, active: false }), RP('k', false, ['Kd', '3h'], { chips: 1000 })];
      const h6 = regressionHand({ players: ps, board: ['Ks', 'Jc', 'Js', '8s', '4s'], pot: 67, dealerIndex: 0, decisions: [
        D5({ street: 'preflop', action: 'raise', amount: 13, pot: 7, toCall: 0, facingRaise: false, position: 'BTN', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 1000 }),
        D5({ street: 'preflop', action: 'call', amount: 8, pot: 20, toCall: 8, facingRaise: true, position: 'BB', playerName: 'k', isHuman: false, playerIdx: 5, playerChipsBefore: 1000 }),
        D5({ street: 'flop', action: 'check', amount: 0, pot: 28, toCall: 0, facingRaise: false, position: 'BB', playerName: 'k', isHuman: false, playerIdx: 5, playerChipsBefore: 992 }),
        D5({ street: 'flop', action: 'raise', amount: 9, pot: 28, toCall: 0, facingRaise: false, position: 'BTN', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 987 }),
        D5({ street: 'flop', action: 'call', amount: 9, pot: 37, toCall: 9, facingRaise: true, position: 'BB', playerName: 'k', isHuman: false, playerIdx: 5, playerChipsBefore: 983 }),
        D5({ street: 'turn', action: 'check', amount: 0, pot: 46, toCall: 0, facingRaise: false, position: 'BB', playerName: 'k', isHuman: false, playerIdx: 5, playerChipsBefore: 983 }),
        D5({ street: 'turn', action: 'check', amount: 0, pot: 46, toCall: 0, facingRaise: false, position: 'BTN', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 978 }),
        D5({ street: 'river', action: 'raise', amount: 21, pot: 46, toCall: 0, facingRaise: false, position: 'BB', playerName: 'k', isHuman: false, playerIdx: 5, playerChipsBefore: 983 }),
        D5({ street: 'river', action: 'fold', amount: 0, pot: 67, toCall: 21, facingRaise: true, position: 'BTN', playerName: 'あなた', isHuman: true, playerIdx: 0, playerChipsBefore: 978 })
      ] });
      const pl6 = analyzeHand(h6).primaryLesson;
      ok('標準BTNオープンを主テーマにしない', pl6 && pl6.category !== 'preflop-entry', pl6 && pl6.category);
    }
  }
  setRangeMode('live'); // 既定へ戻す
  console.log(`\n[モード検証] ${pass} pass / ${fail} fail`);
  fails.forEach(x => console.log('  FAIL:', x));
  return fail === 0;
}

function runPreflopModeChecks(s) {
  if (typeof s.liveCashRangeProfile !== 'function') { console.log('[プリフロップモード検証] スキップ'); return true; }
  const { liveCashRangeProfile, preflopChartLookup, regressionCards: Cs, setRangeMode } = s;
  const players = Array.from({ length: 6 }, (_, i) => ({ active: true, isHuman: i === 0 }));
  const players9 = Array.from({ length: 9 }, (_, i) => ({ active: true, isHuman: i === 0 }));
  function prof(hc, pos, act, caller) {
    const dec = [{ street: 'preflop', action: 'raise', position: 'CO', isHuman: false, playerIdx: 5 }];
    if (caller) dec.push({ street: 'preflop', action: 'call', position: 'HJ', isHuman: false, playerIdx: 4 });
    const d = { street: 'preflop', action: act, facingRaise: true, toCall: 15, position: pos, isHuman: true, playerIdx: 0, pfActionBetLevel: 2 };
    dec.push(d);
    return liveCashRangeProfile({ players, decisions: dec, community: [] }, d, Cs(hc), pos);
  }
  function open9(hc, pos) {
    const d = { street: 'preflop', action: 'raise', facingRaise: false, toCall: 0, position: pos, isHuman: true, playerIdx: 0, pot: 15 };
    return liveCashRangeProfile({ players: players9, decisions: [d], community: [] }, d, Cs(hc), pos);
  }
  const cap = (mode, hc, pos, act, caller) => { setRangeMode(mode); const p = prof(hc, pos, act, caller); return p ? p.capPercent : null; };
  let pass = 0, fail = 0; const fails = [];
  const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? '  [' + e + ']' : '')); } };
  // GTOは3betを広く(ポラー)
  ok('GTO 3bet幅 > Live (A5s BTN)', cap('gto', ['As', '5s'], 'BTN', 'raise') > cap('live', ['As', '5s'], 'BTN', 'raise'));
  // GTOは非IPフラットを圧縮(3bet-or-fold)
  ok('GTO flat幅 < Live (KJo SB)', cap('gto', ['Kh', 'Jd'], 'SB', 'call') < cap('live', ['Kh', 'Jd'], 'SB', 'call'));
  // スクイーズ(間にコール)はバリュー寄せで締まる
  ok('スクイーズ < 単独3bet (A5s BTN/live)', cap('live', ['As', '5s'], 'BTN', 'raise', true) < cap('live', ['As', '5s'], 'BTN', 'raise', false));
  // ライブ・マルチウェイは投機系フラットを広げる
  ok('MWフラット > 単独 (76s BTN/live)', cap('live', ['7s', '6s'], 'BTN', 'call', true) > cap('live', ['7s', '6s'], 'BTN', 'call', false));
  // サイズ提案: Liveは大きめ、GTOは小さめ
  if (typeof s.preflopSizePlan === 'function') {
    const sp = (mode, d, i3, iso, pos) => { setRangeMode(mode); return s.preflopSizePlan({ bigBlind: 5 }, d, 0, i3, iso, pos).target; };
    ok('オープン: Live > GTO (CO)', sp('live', { toCall: 0 }, false, false, 'CO') > sp('gto', { toCall: 0 }, false, false, 'CO'));
    ok('3bet: Live > GTO (BTN)', sp('live', { toCall: 15 }, true, false, 'BTN') > sp('gto', { toCall: 15 }, true, false, 'BTN'));
  }
  setRangeMode('live');
  const expectOpen = (pos, hc, want, label) => {
    const p = open9(hc, pos);
    ok(label, want.includes(p && p.severity), p && ('severity=' + p.severity + ' verdict=' + p.verdict));
  };
  expectOpen('UTG', ['Kh', 'Td'], ['bad'], '9max UTG KTo open: out');
  expectOpen('UTG', ['Ah', 'Td'], ['bad'], '9max UTG ATo open: out');
  expectOpen('UTG', ['5h', '5d'], ['bad'], '9max UTG 55 open: out');
  expectOpen('UTG', ['Qh', 'Jh'], ['border'], '9max UTG QJs open: mix only');
  expectOpen('UTG+1', ['Kh', 'Td'], ['bad'], '9max UTG+1 KTo open: out');
  expectOpen('UTG+1', ['Ah', 'Td'], ['bad'], '9max UTG+1 ATo open: out');
  expectOpen('UTG+1', ['5h', '5d'], ['bad'], '9max UTG+1 55 open: out');
  expectOpen('UTG+1', ['Qh', 'Jh'], ['border'], '9max UTG+1 QJs open: mix only');
  expectOpen('MP', ['Kh', 'Td'], ['bad'], '9max MP KTo open: out');
  expectOpen('MP', ['Ah', 'Td'], ['bad'], '9max MP ATo open: out');
  expectOpen('MP', ['5h', '5d'], ['border'], '9max MP 55 open: mix only');
  expectOpen('MP', ['Qh', 'Jh'], ['good'], '9max MP QJs open: chart in');
  if (typeof preflopChartLookup === 'function') {
    const chart = (kind, ht, stackBB) => preflopChartLookup(kind, ht, 'BTN', 6, { stackBB, openerPos: 'CO' });
    ok('vs3bet 100BB QQ: continue pure', chart('vs3bet', 'QQ', 100).status === 'pure');
    ok('vs3bet 100BB AJo: fold out', chart('vs3bet', 'AJo', 100).status === 'out');
    ok('vs3bet 50BB TT: mixed continue', chart('vs3bet', 'TT', 50).status === 'mix');
    ok('vs4bet 100BB AA: continue pure', chart('vs4bet', 'AA', 100).status === 'pure');
    ok('vs4bet 100BB QQ: mixed continue', chart('vs4bet', 'QQ', 100).status === 'mix');
    ok('vs4bet 100BB JJ: fold out', chart('vs4bet', 'JJ', 100).status === 'out');
    ok('vs4bet 20BB QQ: shallow continue pure', chart('vs4bet', 'QQ', 20).status === 'pure');
  }
  setRangeMode('live');
  console.log(`\n[プリフロップモード検証] ${pass} pass / ${fail} fail`);
  fails.forEach(x => console.log('  FAIL:', x));
  return fail === 0;
}

function runAiPreflopModeChecks(s) {
  if (typeof s.aiDecide !== 'function' || typeof s.createAuditRingGame !== 'function' || !s.AI_PROFILES || !s.Card) {
    console.log('[AIプリフロップ検証] スキップ'); return true;
  }
  const { aiDecide, createAuditRingGame, AI_PROFILES, Card, setRangeMode } = s;
  function rates(mode, hc, N) {
    setRangeMode(mode);
    const g = createAuditRingGame();
    const v = g.players[1], opener = g.players[2];
    g.dealerIndex = v.seatIndex; g.bigBlind = 5; g.currentBet = 15; g.pot = 22;
    g.currentHandDecisions = [{ street: 'preflop', action: 'raise', playerIdx: opener.id != null ? opener.id : 2 }];
    v.profile = AI_PROFILES.take; v.holeCards = hc.map(c => new Card(c[0], c[1]));
    v.currentBet = 0; v.chips = 1000;
    let bet = 0, call = 0;
    for (let i = 0; i < N; i++) { const a = aiDecide(v, g, 'hard'); if (a.action === 'raise' || a.action === 'allin') bet++; else if (a.action === 'call') call++; }
    return { bet: bet / N, call: call / N };
  }
  let pass = 0, fail = 0; const fails = [];
  const ok = (n, c, e) => { if (c) pass++; else { fail++; fails.push(n + (e ? '  [' + e + ']' : '')); } };
  const N = 1500;
  const L = rates('live', ['As', '5s'], N), G = rates('gto', ['As', '5s'], N);
  // Liveはブラフ3betを減らす
  ok('Live 3bet頻度 < GTO (A5s)', L.bet < G.bet - 0.05, 'live=' + L.bet.toFixed(2) + ' gto=' + G.bet.toFixed(2));
  // Liveはその分コールに回す(より受け身)
  ok('Live コール頻度 > GTO (A5s)', L.call > G.call + 0.05, 'live=' + L.call.toFixed(2) + ' gto=' + G.call.toFixed(2));
  setRangeMode('live');
  console.log(`\n[AIプリフロップ検証] ${pass} pass / ${fail} fail`);
  fails.forEach(x => console.log('  FAIL:', x));
  return fail === 0;
}

(function main() {
  const htmlPath = pickHtml();
  console.log('target:', htmlPath);
  let allOk = runHtmlIntegrityChecks(htmlPath);
  const s = loadSandbox(htmlPath);
  const realEquity = s.estimateEquity; // run theory checks at full fidelity
  if (!process.env.SKIP_REGRESSION) {
    if (process.env.FAST) patchFastEquity(s);
    allOk = runRegression(s) && allOk;
    s.estimateEquity = realEquity; // restore after FAST patch
  }
  allOk = runTheoryChecks(s) && allOk;
  // 構造系チェック(モード/プリフロップ/AI/主テーマ)は多数のanalyzeHandを回すため、精度不要な範囲で軽量エクイティを使う
  if (process.env.FAST) patchFastEquity(s);
  allOk = runModeChecks(s) && allOk;
  allOk = runPreflopModeChecks(s) && allOk;
  allOk = runAiPreflopModeChecks(s) && allOk;
  console.log('\n===', allOk ? 'ALL GREEN' : 'CHECK FAILS ABOVE', '===');
  process.exit(allOk ? 0 : 1);
})();
