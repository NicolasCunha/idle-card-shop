// Browser test suite. Serve the repo root (python -m http.server) and open /tests/.
import * as G from '../js/game.js';
import * as M from '../js/market.js';
import * as Save from '../js/save.js';
import { loadCollections, normalizeSet, linkOrder } from '../js/data.js';
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
  ok(order.join() === 'base,jungle,fossil,base-set-2,team-rocket', 'collections load in release order', order.join());
  ok(order.every(id => sets[id].cards.length && sets[id].cards.every(c => sets[id].rarities[c.rarity])), 'every collection has cards with known rarities', order.map(id => sets[id].cards.length).join('/'));
  ok(sets['base-set-2'].cards.filter(c => c.reprintOf).every(c => c.value < sets[c.reprintOf.split(':')[0]].byId[c.reprintOf.split(':')[1]].value + 1e-9), 'Base Set 2 reprints point to existing originals');
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
  const inBinder = () => Object.values(s.binder.base || {}).reduce((x, y) => x + y, 0);
  ok(opened.length === 11 && inBinder() === 11, 'opening puts all 11 cards in the binder');
  const ranks = opened.map(r => base.rarities[r.card.rarity].rank);
  ok(ranks.every((r, i) => i === 0 || r >= ranks[i - 1]), 'reveal order goes from common to rare');
  ok(opened.every(r => r.isNew || opened.filter(o => o.card === r.card).length > 1), 'first copies are marked NEW');
  const cheap = opened.filter(r => G.marketValue(s, base, r.card) < s.rules.bulkBelow).length;
  const listed = G.priceSpares(s, sets, 4, 0, 0);
  ok(listed === Math.min(4, 11 - cheap) && s.showcase.length === listed, 'pricing N puts N cards straight in the showcase', `${listed}`);
  const mvTop = Math.max(...opened.map(r => G.marketValue(s, base, r.card)));
  ok(s.showcase.some(it => Math.abs(it.p - G.tagPrice(mvTop, 0)) < 1e-9), 'batch pricing starts with the priciest card');
  ok(G.priceSpares(s, sets, 99, 0.1, 0) >= 0 && s.showcase.every(it => it.p >= s.rules.bulkBelow * 0.9), 'cards under the bulk threshold are left for bulk');
  const bulkBefore = s.money;
  const bk = G.sellBulk(s, sets, 0);
  ok(bk.n === cheap && s.money >= bulkBefore, 'bulk sells the cheap copies at 30%', `${bk.n}`);
  s.binder.base = { '001': 3 };
  ok(G.priceSpares(s, sets, 99, 0, 1) === 2 && s.binder.base['001'] === 1, 'Keep 1 leaves one copy in the binder');
  const one = base.byId['001'];
  ok(G.listCard(s, base, one, 1, 1.23) === 1 && s.showcase.at(-1).p === 1.23 && !s.binder.base['001'], 'a card can be listed at a manual price');
  ok(G.buyChance(1, 1) === 0.5 && G.buyChance(0.95, 1) === 0.6 && G.buyChance(0.8, 1) === 0.7, 'customers buy 50% at market, 60% up to 10% below, 70% further below');
  ok(G.buyChance(1.04, 1) < 0.5 && G.buyChance(1.2, 1) < G.buyChance(1.08, 1) && G.buyChance(2, 1) <= 0.005, 'the chance drops above market; 2x almost never sells');
  for (let i = 0; i < 400 && s.showcase.length; i++) G.tick(s, sets, 1, T0 + i * 1000);
  ok(s.showcase.length === 0 && s.stats.cardsSold > 0, 'customers buy from the showcase');
  s.showcase.push({ s: 'base', c: base.cards[0].id, p: 9999 });
  for (let i = 0; i < 300; i++) G.tick(s, sets, 1, T0 + 500000 + i * 1000);
  ok(s.showcase.length === 1, 'customers never pay above their budget');
  s.showcase = [];
  { // 2x market almost never sells; market sells about half the looks.
    const t = fresh(sets, order), c = base.byId['004'], mv = G.marketValue(t, base, c);
    t.upgrades.showcase = 20;
    for (let i = 0; i < 40; i++) t.showcase.push({ s: 'base', c: '004', p: G.tagPrice(mv, 1) });
    for (let i = 0; i < 600; i++) G.tick(t, sets, 1, T0 + i * 1000);
    ok(t.stats.cardsSold <= 2, '2x market tags stay unsold', `${t.stats.cardsSold} sold in 10 min`);
  }
  s.binder.base = { '002': 2 };
  s.showcase.push({ s: 'base', c: '002', p: 1 });
  G.recallShowcase(s);
  ok(s.binder.base['002'] === 3 && !s.showcase.length, 'recall brings cards back to the binder');
  s = fresh(sets, order);
  s.money = 1;
  G.tick(s, sets, 1, T0 + 1000);
  ok(!s.stock.base, 'a broke shop gets no free booster');
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

  // ---------- Collection unlock ----------
  section('Collection unlock');
  {
    const mk = id => normalizeSet({ id, name: id.toUpperCase(), booster: { wholesalePrice: 1, slots: [{ count: 1, rarity: 'c' }] }, rarities: { c: { value: 1 } },
      cards: Array.from({ length: 10 }, (_, i) => ({ index: i + 1, id: `${i + 1}`, name: `Card ${i + 1}`, rarity: 'c' })) });
    const two = { a: mk('a'), b: mk('b') };
    linkOrder(two, ['a', 'b']);
    const u = fresh(two, ['a', 'b']);
    u.money = 1000;
    ok(G.setUnlocked(u, two.a) && !G.setUnlocked(u, two.b), 'only the first collection starts unlocked');
    ok(!G.buyBooster(u, two.b) && !G.buySingle(u, two, two.b, two.b.cards[0]), 'a locked collection sells no boosters or singles');
    for (let i = 0; i < 8; i++) G.buySingle(u, two, two.a, two.a.cards[i]);
    ok(!G.setUnlocked(u, two.b), '80% of the previous collection is not enough');
    G.buySingle(u, two, two.a, two.a.cards[8]);
    ok(G.setUnlocked(u, two.b) && G.buyBooster(u, two.b), '90% of the previous collection unlocks the next', `${G.collectionProgress(u, two.a).seen}/10`);
    ok(u.log.some(l => l.kind === 'unlock'), 'the unlock shows in Recent');
    u.binder.a['1'] = 1;
    ok(G.listCard(u, two.a, two.a.cards[0], 1, 5) === 1 && !u.binder.a['1'] && G.setUnlocked(u, two.b), 'selling every copy keeps the discovery and the unlock');
  }

  // ---------- Save ----------
  section('Save');
  s = fresh(sets, order);
  G.buyBooster(s, base); G.openBooster(s, sets, base);
  const file = JSON.parse(JSON.stringify(Save.serialize(s)));
  ok(file.game === 'idlecardshop' && file.saveVersion === Save.SAVE_VERSION && file.state, 'file has { game, saveVersion, gameVersion, exportedAt, state }');
  ok(!JSON.stringify(file).includes('"_bonus"'), 'transient caches are not saved');
  const back = Save.restore(file, sets, order);
  ok(JSON.stringify(back.binder) === JSON.stringify(s.binder) && back.money === s.money, 'export/import round trip keeps state');
  const partial = { game: 'idlecardshop', saveVersion: 1, state: { money: 77, futureField: 1, showcase: [{ s: 'base', c: '001', p: 1 }, { s: 'gone', c: 'x', p: 1 }, { s: 'base', c: 'nope', p: 1 }], upgrades: { storage: 2 } } };
  const merged = Save.restore(partial, sets, order);
  ok(merged.money === 77 && merged.upgrades.storage === 2 && merged.upgrades.showcase === 0, 'missing fields get defaults');
  ok(!('futureField' in merged), 'unknown fields are dropped');
  ok(merged.showcase.length === 1, 'unknown cards and collections are skipped');
  const v1 = { game: 'idlecardshop', saveVersion: 1, state: {
    money: 5, binder: { base: { '001': 1 } },
    unpriced: [{ s: 'base', c: '001' }, { s: 'base', c: '002' }], priced: [{ s: 'base', c: '002', p: 3 }],
    rules: { keepFirst: true, stockTarget: 7 },
    staff: [{ id: 1, name: 'Ada', task: 'list', skills: { buy: { lvl: 2, xp: 0 }, list: { lvl: 5, xp: 3 } }, training: { skill: 'list', left: 9, total: 20 } }],
  } };
  const m2 = Save.restore(v1, sets, order);
  ok(m2.binder.base['001'] === 2 && m2.binder.base['002'] === 2 && !('unpriced' in m2) && !('priced' in m2), 'v1 saves: unpriced and priced cards go back to the binder');
  ok(m2.rules.keepCopies === 1 && m2.rules.stockTarget === 7 && !('keepFirst' in m2.rules), 'v1 saves: keepFirst becomes Keep copies 1');
  ok(m2.staff[0].task === 'price' && !m2.staff[0].training && !('list' in m2.staff[0].skills) && m2.staff[0].skills.buy.lvl === 2, 'v1 saves: List staff move to Price');
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
    st.upgrades.staffRoom = 2;
    for (let i = 0; i < 3; i++) G.hire(st);
    ['buy', 'open', 'price'].forEach((t, i) => { st.staff[i].task = t; st.staff[i].skills[t].lvl = 1; });
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
  ok(runs.every(r => r.fullAuto != null), 'no run gets stuck (every bot reaches 3 staff in 4 hours)');
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
  const tasksNeeded = ['open', 'price', 'buy'];
  const N = tasksNeeded.length;
  const owned = () => Object.values(s.binder.base || {}).reduce((a, b) => a + b, 0);
  while (t < 4 * 3600) {
    t += dt;
    G.tick(s, sets, dt, T0 + t * 1000);
    if (r.firstSale == null && s.stats.cardsSold > 0) r.firstSale = t;
    busy -= dt;
    if (busy > 0) continue;
    // Spend: hire, then staff room, then upgrades.
    if (s.staff.length < N && G.canHire(s)) {
      const e = G.hire(s);
      e.task = tasksNeeded.find(k => !s.staff.some(x => x.task === k));
      if (r.firstHire == null) r.firstHire = t;
      if (s.staff.length === N && r.fullAuto == null) r.fullAuto = t;
      busy = 2; continue;
    }
    if (s.staff.length < N && s.staff.length >= G.maxStaff(s) && G.buyUpgrade(s, 'staffRoom')) { busy = 1.5; continue; }
    // Demand is the shop's limit, so a sensible player also buys some Marketing.
    if (s.staff.length && s.upgrades.marketing < 2 * s.staff.length && G.buyUpgrade(s, 'marketing')) { busy = 1.5; continue; }
    const doneByStaff = k => s.staff.some(e => e.task === k);
    if (!doneByStaff('price') && owned() && G.freeSlots(s) && G.priceSpares(s, sets, 10, 0, 0)) { busy = 1.5; continue; }
    if (!doneByStaff('price') && G.bulkSpares(s, sets, 0).n > 20) { G.sellBulk(s, sets, 0); busy = 1.5; continue; }
    if (!doneByStaff('open') && s.stock.base > 0 && owned() < 30) { G.openBooster(s, sets, base); busy = 6; continue; }
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
