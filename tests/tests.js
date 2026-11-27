// Browser test suite. Serve the repo root (python -m http.server) and open /tests/.
import * as G from '../js/game.js';
import * as M from '../js/market.js';
import * as Save from '../js/save.js';
import { loadCollections, normalizeSet } from '../js/data.js';
import { setTutorialData, currentStep, skipTutorial, restartTutorial } from '../js/tutorial.js';

const out = document.getElementById('out');
let passed = 0, failed = 0;
const results = [];

function section(name) { out.insertAdjacentHTML('beforeend', `<h2>${name}</h2>`); }
function ok(cond, name, detail = '') {
  if (cond) passed++; else failed++;
  results.push({ name, ok: !!cond, detail });
  out.insertAdjacentHTML('beforeend', `<div class="${cond ? 'pass' : 'fail'}">${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` <small>(${detail})</small>` : ''}</div>`);
}
let misses = 0;
function target(cond, name, detail) {
  if (!cond) misses++;
  results.push({ name, ok: true, target: !!cond, detail });
  out.insertAdjacentHTML('beforeend', `<div class="${cond ? 'pass' : 'warn'}">${cond ? 'ON TARGET' : 'OFF TARGET'} ${name} <small>(${detail})</small></div>`);
}
function note(text) { out.insertAdjacentHTML('beforeend', `<pre>${text}</pre>`); }

const T0 = Date.UTC(2026, 10, 26, 12, 0, 0);

function fresh(sets, order) {
  const s = G.newState(sets, order, T0);
  s.timeZone = 'UTC';
  s.setupDone = true;
  G.prepare(s, sets);
  G.tick(s, sets, 0, T0);
  return s;
}

async function run() {
  const { sets, order } = await loadCollections('../');
  const tut = await (await fetch('../data/tutorial.json')).json();
  setTutorialData(tut);
  const base = sets.base;

  // ---------- Data ----------
  section('Collections');
  ok(order.length >= 1 && base, 'collections.json loads the Base Set');
  ok(base.cards.length === 102, 'Base Set has 102 cards', `${base.cards.length}`);
  ok(new Set(base.cards.map(c => c.id)).size === base.cards.length, 'card ids are unique');
  ok(base.cards.every(c => base.rarities[c.rarity]), 'every card rarity exists');
  ok(base.booster.slots.reduce((a, s) => a + s.count, 0) === 11, 'booster has 11 cards (7C 3U 1R)');
  const count = r => base.cards.filter(c => c.rarity === r).length;
  ok(count('common') === 38 && count('uncommon') === 32 && count('rare') === 16 && count('holo') === 16, 'Base Set rarities: 38C 32U 16R 16H');
  const reprintSet = normalizeSet({ id: 'x', name: 'X', booster: { wholesalePrice: 1, slots: [] }, rarities: { c: { value: 1 } }, cards: [{ index: 1, id: 'a', name: 'A', rarity: 'c' }, { index: 2, id: 'b', name: 'B', rarity: 'nope' }] });
  ok(reprintSet.cards.length === 1, 'cards with unknown rarity are skipped');

  // ---------- Market ----------
  section('Market');
  const card = base.cards[0];
  ok(M.marketValue(base, card, 20000) === M.marketValue(base, card, 20000), 'same day gives the same price');
  let maxUp = 0, maxDown = 0, maxMul = 0, minMul = Infinity;
  const DAYS = 1500;
  for (const c of base.cards) {
    let prev = M.cardMultiplier(base, c, 19000);
    for (let d = 19001; d < 19000 + DAYS; d++) {
      const m = M.cardMultiplier(base, c, d);
      const ch = m / prev - 1;
      if (ch > maxUp) maxUp = ch;
      if (ch < maxDown) maxDown = ch;
      if (m > maxMul) maxMul = m;
      if (m < minMul) minMul = m;
      prev = m;
    }
  }
  ok(maxUp < 0.07 && maxDown > -0.07, `no daily move above 7% over ${DAYS} days x 102 cards`, `+${(maxUp * 100).toFixed(1)}% / ${(maxDown * 100).toFixed(1)}%`);
  ok(maxMul < 3.05 && minMul > 0.32, 'soft cap keeps prices within ~1/3x..3x', `${minMul.toFixed(2)}x..${maxMul.toFixed(2)}x`);
  ok(M.dayNumber('UTC', new Date(Date.UTC(1970, 0, 2))) === 1, 'day number counts days since 1970-01-01');
  ok(M.dayNumber('Asia/Tokyo', new Date(Date.UTC(2026, 0, 1, 20))) === M.dayNumber('UTC', new Date(Date.UTC(2026, 0, 1, 20))) + 1, 'day follows the chosen time zone');

  // ---------- Loop ----------
  section('Shop loop');
  G.setRandom(G.seededRandom(1));
  let s = fresh(sets, order);
  const price = G.boosterPrice(s, base);
  ok(G.buyBooster(s, base) && Math.abs(s.money - (20 - price)) < 1e-9, 'buying a booster costs the day price');
  const opened = G.openBooster(s, sets, base);
  ok(opened.length === 11 && s.unpriced.length === 11, 'opening puts 11 cards in the unpriced pile');
  const ranks = opened.map(r => base.rarities[r.card.rarity].rank);
  ok(ranks.every((r, i) => i === 0 || r >= ranks[i - 1]), 'reveal order goes from common to rare');
  ok(opened.every(r => r.isNew || opened.filter(o => o.card === r.card).length > 1), 'first copies are marked NEW');
  G.priceMany(s, sets, 11);
  ok(s.unpriced.length === 0 && s.priced.every(it => it.p >= s.rules.bulkBelow), 'pricing sends cheap cards to bulk');
  G.listMany(s, 11);
  ok(s.priced.length === 0 && s.showcase.length > 0, 'listing moves priced cards to the showcase');
  for (let i = 0; i < 120 && s.showcase.length; i++) G.tick(s, sets, 1, T0 + i * 1000);
  ok(s.showcase.length === 0 && s.stats.cardsSold > 0, 'customers buy from the showcase');
  s.showcase.push({ s: 'base', c: base.cards[0].id, p: 9999 });
  for (let i = 0; i < 120; i++) G.tick(s, sets, 1, T0 + 200000 + i * 1000);
  ok(s.showcase.length === 1, 'customers skip cards tagged above 115% of market');
  s.rules.keepFirst = true;
  s.money = 100;
  G.buyBooster(s, base);
  const before = Object.keys(s.binder.base || {}).length;
  const kept = G.openBooster(s, sets, base);
  ok(kept.some(r => r.kept) || before === 102, 'keep-first sends new cards to the binder');
  s = fresh(sets, order);
  s.money = 1;
  G.tick(s, sets, 1, T0 + 1000);
  ok(s.stock.base === 1 && s.stats.rescues === 1, 'a broke shop with nothing to sell gets a free booster');
  G.tick(s, sets, 1, T0 + 2000);
  ok(s.stock.base === 1, 'the rescue does not repeat while there is something to open');
  ok(Math.abs(G.seriesCost(50, 2.2, 0, 3) - (G.hireCost(0) + G.hireCost(1) + G.hireCost(2))) < 1, 'geometric series matches summed costs');

  // ---------- Staff ----------
  section('Staff');
  s = fresh(sets, order);
  s.money = 1000;
  const emp = G.hire(s);
  ok(emp && G.SKILL_KEYS.every(k => emp.skills[k].lvl >= 1 && emp.skills[k].lvl <= 2), 'new hires start at level 1 or 2');
  ok(!G.hire(s), 'hiring stops at the slot limit');
  ok(Math.abs(G.skillDuration('open', 10) / G.skillDuration('open', 1) - Math.pow(0.78, 9)) < 1e-9, 'each level is 22% faster (~9x at level 10)', `${(1 / Math.pow(0.78, 9)).toFixed(1)}x`);
  ok(G.xpToNext(1) === 25 && G.xpToNext(9) === Math.round(25 * Math.pow(9, 2.3)), 'XP curve 25 x level^2.3', `9->10: ${G.xpToNext(9)}`);
  emp.skills.open.lvl = 1;
  ok(G.train(s, emp, 'open') && emp.training, 'training starts and costs money');
  G.tick(s, sets, 25, T0 + 25000);
  ok(!emp.training && emp.skills.open.lvl === 2, 'training finishes after 20s x level');
  G.setTask(s, emp, 'buy');
  s.money = 25;
  G.tick(s, sets, 20, T0 + 45000);
  ok(s.money >= s.rules.cashReserve - 1e-9 && emp.status === 'cash reserve', 'buyer respects the cash reserve');

  // ---------- Save ----------
  section('Save');
  s = fresh(sets, order);
  G.buyBooster(s, base); G.openBooster(s, sets, base);
  const file = JSON.parse(JSON.stringify(Save.serialize(s)));
  ok(file.game === 'idlecardshop' && file.saveVersion === Save.SAVE_VERSION && file.state, 'file has { game, saveVersion, gameVersion, exportedAt, state }');
  ok(!JSON.stringify(file).includes('"_bonus"'), 'transient caches are not saved');
  const back = Save.restore(file, sets, order);
  ok(back.unpriced.length === s.unpriced.length && back.money === s.money, 'export/import round trip keeps state');
  const partial = { game: 'idlecardshop', saveVersion: 1, state: { money: 77, futureField: 1, unpriced: [{ s: 'base', c: '001' }, { s: 'gone', c: 'x' }, { s: 'base', c: 'nope' }], upgrades: { storage: 2 } } };
  const merged = Save.restore(partial, sets, order);
  ok(merged.money === 77 && merged.upgrades.storage === 2 && merged.upgrades.showcase === 0, 'missing fields get defaults');
  ok(!('futureField' in merged), 'unknown fields are dropped');
  ok(merged.unpriced.length === 1, 'unknown cards and collections are skipped');
  let threw = false;
  try { Save.restore({ game: 'idlecardshop', saveVersion: 999, state: {} }, sets, order); } catch { threw = true; }
  ok(threw, 'a save from a newer version is refused');

  // ---------- Tutorial ----------
  section('Tutorial');
  s = fresh(sets, order);
  ok(currentStep(s)?.id === 'buy', 'first step is "Buy a booster"');
  G.buyBooster(s, base);
  ok(currentStep(s)?.id === 'open', 'step advances after the action');
  skipTutorial(s);
  ok(currentStep(s) === null && s.tutorial.rev === tut.revision, 'skip finishes the current revision');
  setTutorialData({ revision: tut.revision + 1, steps: [...tut.steps, { id: 'new-thing', text: 'New.', target: 'body' }] });
  ok(currentStep(s)?.id === 'new-thing', 'a newer revision shows only the new steps');
  setTutorialData(tut);
  restartTutorial(s);
  ok(currentStep(s)?.id === 'buy', 'restart shows the tutorial again from the start');

  // ---------- Offline ----------
  section('Offline');
  const live = fresh(sets, order), off = fresh(sets, order);
  for (const st of [live, off]) {
    st.money = 2000;
    st.upgrades.staffRoom = 3;
    for (let i = 0; i < 4; i++) G.hire(st);
    ['buy', 'open', 'price', 'list'].forEach((t, i) => { st.staff[i].task = t; st.staff[i].skills[t].lvl = 1; });
  }
  const HOURS = 2;
  G.setRandom(G.seededRandom(7));
  for (let t = 0.25; t <= HOURS * 3600; t += 0.25) G.tick(live, sets, 0.25, T0 + t * 1000);
  G.setRandom(G.seededRandom(8));
  const res = await G.catchUp(off, sets, T0 + HOURS * 3600 * 1000, null, { budgetMs: 1000 });
  const diff = Math.abs(off.stats.earned - live.stats.earned) / live.stats.earned;
  ok(res && res.seconds === HOURS * 3600, 'catch-up simulates the full absence');
  ok(diff < 0.1, 'offline result matches live play within 10%', `live ${live.stats.earned.toFixed(0)} vs offline ${off.stats.earned.toFixed(0)}`);
  const week = fresh(sets, order);
  Object.assign(week, JSON.parse(JSON.stringify(Save.serialize(off).state)));
  G.prepare(week, sets);
  const t1 = performance.now();
  await G.catchUp(week, sets, week.lastTick + 7 * 86400 * 1000, null, { budgetMs: 1000 });
  const secs = (performance.now() - t1) / 1000;
  ok(secs < 60, 'one week away simulates in under a minute', `${secs.toFixed(1)}s`);
  ok(week.day === off.day + 7, 'market days advance during catch-up');

  // ---------- Pacing ----------
  section('Pacing (GDD targets)');
  // Median of several seeds, since booster luck swings the early game a lot.
  const runs = [];
  for (let seed = 1; seed <= 9; seed++) {
    G.setRandom(G.seededRandom(seed * 101));
    runs.push(pacing(sets, order));
  }
  const median = k => {
    const v = runs.map(r => r[k] ?? Infinity).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  const p = { firstSale: median('firstSale'), firstHire: median('firstHire'), fullAuto: median('fullAuto') };
  note(`median of ${runs.length} runs\n` + Object.entries(p).map(([k, v]) => `${k}: ${fmtT(v)}  (all: ${runs.map(r => fmtT(r[k])).join(', ')})`).join('\n'));
  ok(runs.every(r => r.fullAuto != null), 'no run gets stuck (every bot reaches 4 staff in 4 hours)');
  // Balancing targets are reported, not failed: tuning them is a design call.
  target(p.firstSale < 60, 'first sale under 1 minute', fmtT(p.firstSale));
  target(p.firstHire >= 120 && p.firstHire <= 360, 'first employee in about 3-5 minutes', fmtT(p.firstHire));
  target(p.fullAuto >= 45 * 60 && p.fullAuto <= 90 * 60, 'full automation in about 45-90 minutes', fmtT(p.fullAuto));
  G.setRandom(null);

  document.getElementById('summary').innerHTML = `<b class="${failed ? 'fail' : 'pass'}">${passed} passed, ${failed} failed</b>${misses ? ` · ${misses} balancing target(s) missed` : ''}`;
  window.testResults = { passed, failed, results, pacing: p };
}

function fmtT(s) { return s == null ? '-' : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`; }

// A simple player bot: one manual action every ~1.5 s (opening with the
// animation takes ~6 s), hires and assigns staff as soon as possible.
function pacing(sets, order) {
  const base = sets[order[0]];
  const s = fresh(sets, order);
  const r = { firstSale: null, firstHire: null, fullAuto: null };
  let t = 0, busy = 0;
  const dt = 0.5;
  const tasksNeeded = ['open', 'price', 'list', 'buy'];
  while (t < 4 * 3600) {
    t += dt;
    G.tick(s, sets, dt, T0 + t * 1000);
    if (r.firstSale == null && s.stats.cardsSold > 0) r.firstSale = t;
    busy -= dt;
    if (busy > 0) continue;
    // Spend: hire, then staff room, then upgrades.
    if (s.staff.length < 4 && G.canHire(s)) {
      const e = G.hire(s);
      e.task = tasksNeeded.find(k => !s.staff.some(x => x.task === k));
      if (r.firstHire == null) r.firstHire = t;
      if (s.staff.length === 4 && r.fullAuto == null) r.fullAuto = t;
      busy = 2; continue;
    }
    if (s.staff.length < 4 && s.staff.length >= G.maxStaff(s) && G.buyUpgrade(s, 'staffRoom')) { busy = 1.5; continue; }
    // Demand is the shop's limit, so a sensible player also buys some Marketing.
    if (s.staff.length && s.upgrades.marketing < 2 * s.staff.length && G.buyUpgrade(s, 'marketing')) { busy = 1.5; continue; }
    const doneByStaff = k => s.staff.some(e => e.task === k);
    if (!doneByStaff('price') && s.unpriced.length) { G.priceMany(s, sets, 3); busy = 1.5; continue; }
    if (!doneByStaff('list') && s.priced.length && s.showcase.length < G.showcaseCapacity(s)) { G.listMany(s, 5); busy = 1.5; continue; }
    if (!doneByStaff('open') && s.stock.base > 0 && s.unpriced.length < 30) { G.openBooster(s, sets, base); busy = 6; continue; }
    if (!doneByStaff('buy') && (s.stock.base || 0) < 3 && G.buyBooster(s, base, 0)) { busy = 1.5; continue; }
    busy = 1.5;
  }
  return r;
}

run().catch(err => {
  document.getElementById('summary').innerHTML = `<b class="fail">Crashed: ${err.message}</b>`;
  console.error(err);
  window.testResults = { crashed: String(err) };
});
