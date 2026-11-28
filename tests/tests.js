// Browser test suite. Serve the repo root (python -m http.server) and open /tests/.
import * as G from '../js/game.js';
import * as M from '../js/market.js';
import * as Save from '../js/save.js';
import * as SU from '../js/supply.js';
import { loadCollections, normalizeSet, linkOrder, cardFilter } from '../js/data.js';
import { fmtMoney } from '../js/format.js';
import { setTutorialData, currentStep, skipTutorial, restartTutorial } from '../js/tutorial.js';
import * as Debug from '../js/debug.js';
import * as Clock from '../js/clock.js';
import * as Achievements from '../js/achievements.js';

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
  s.seed = M.LEGACY_SEED; // fixed seed: deterministic expectations
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
  ok(order.join() === 'base,jungle,fossil,base-set-2,team-rocket,gym-heroes,gym-challenge,neo-genesis,neo-discovery,neo-revelation,neo-destiny,expedition,aquapolis,skyridge,ruby-sapphire,sandstorm,dragon,team-magma-vs-team-aqua,hidden-legends,firered-leafgreen,team-rocket-returns,deoxys,emerald,unseen-forces,delta-species,legend-maker,holon-phantoms,crystal-guardians,dragon-frontiers,power-keepers', 'collections load in release order', order.join());
  const trr = sets['team-rocket-returns'];
  ok(trr.rarities.ex.rank > trr.rarities.holo.rank && trr.rarities.star.rank > trr.rarities.secret.rank && Math.abs(Object.values(trr.booster.slots[2].weights).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'ex and Gold Star rarer than holo; rare slot sums to 1');
  const packEv = set => set.booster.slots.reduce((sum, s) => {
    const w = s.rarity ? { [s.rarity]: 1 } : s.weights;
    const tot = Object.values(w).reduce((a, b) => a + b, 0);
    return sum + Object.entries(w).reduce((a, [r, x]) => a + (set.byRarity[r]?.length ? s.count * x / tot * set.rarities[r].value : 0), 0);
  }, 0) / set.booster.wholesalePrice;
  const evs = order.map(id => packEv(sets[id]));
  ok(evs.every(e => Math.abs(e / evs[0] - 1) < 0.01), 'every booster is worth the same multiple of its price (tools/balance.py)', evs.map(e => e.toFixed(2)).join('/'));
  ok(order.every(id => sets[id].rarityOrder.every((r, i, a) => !i || sets[id].rarities[r].value > sets[id].rarities[a[i - 1]].value)), 'rarer rarities are always worth more');
  ok(sets['neo-destiny'].cards.filter(c => c.rarity === 'secret').length === 8 && sets['neo-revelation'].cards.filter(c => c.rarity === 'secret').length === 2, 'Shining cards are Secret Rares (2 in Neo Revelation, 8 in Neo Destiny)');
  const tr = sets['team-rocket'];
  const w = tr.booster.slots[2].weights;
  ok(tr.byId['083'].rarity === 'secret' && tr.rarities.secret.rank > tr.rarities.holo.rank && w.secret < w.holo, 'Team Rocket secret rare is rarer than holo');
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
  ok(M.dayNumber(M.DAY_MS * 5 + 1) === 5 && M.dayNumber(M.DAY_MS * 6 - 1) === 5 && M.DAY_MS === 600000, 'a market day lasts 10 minutes');
  ok(M.msUntilNextDay(M.DAY_MS * 5 + 1000) === M.DAY_MS - 1000 && M.dayLabel(105, 100) === 'Day 6', 'countdown and Day N label');

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
  const cheapCard = opened.find(r => G.marketValue(s, base, r.card) < s.rules.bulkBelow)?.card;
  const listed = G.priceSpares(s, sets, 4, 0, 0);
  ok(listed === 4 && s.showcase.length === listed, 'pricing N puts N cards straight in the showcase', `${listed}`);
  const mvTop = Math.max(...opened.map(r => G.marketValue(s, base, r.card)));
  ok(s.showcase.some(it => Math.abs(it.p - G.tagPrice(mvTop, 0)) < 1e-9), 'batch pricing starts with the priciest card');
  ok(G.priceSpares(s, sets, 99, 0, 0) === 7 && inBinder() === 0, 'manual pricing lists every card, cheap ones too');
  ok(!cheapCard || s.showcase.some(it => it.c === cheapCard.id), 'a card under the bulk threshold can be listed by hand');
  s.binder.base = { [cheapCard?.id || '070']: 2 };
  const bulkBefore = s.money;
  const bk = G.sellBulk(s, sets, 0);
  ok(bk.n === (cheapCard ? 2 : 0) && s.money >= bulkBefore, 'bulk sells the cheap copies at 30%', `${bk.n}`);
  s.binder.base = { '001': 3 };
  ok(G.priceSpares(s, sets, 99, 0, 1) === 2 && s.binder.base['001'] === 1, 'Keep 1 leaves one copy in the binder');
  const one = base.byId['001'];
  ok(G.listCard(s, base, one, 1, 1.23) === 1 && s.showcase.at(-1).p === 1.23 && !s.binder.base['001'], 'a card can be listed at a manual price');
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  ok(near(G.buyChance(0.8, 1), 1) && near(G.buyChance(0.9, 1), 0.95) && near(G.buyChance(1, 1), 0.9) && near(G.buyChance(1.1, 1), 0.75) && near(G.buyChance(1.2, 1), 0.6), 'buy chance: -20% 100%, -10% 95%, market 90%, +10% 75%, +20% 60%');
  ok(near(G.buyChance(1.3, 1), 0.45) && near(G.buyChance(1.4, 1), 0.15) && near(G.buyChance(1.5, 1), 0.05) && near(G.buyChance(1.6, 1), 0.01) && G.buyChance(1.7, 1) === 0, 'buy chance: +30% 45%, +40% 15%, +50% 5%, +60% 1%, above never');
  ok(near(G.buyChance(1.3, 1, G.RICH_LENIENCE), 0.6), 'rich customers accept a +30% tag like a +20% one');
  for (let i = 0; i < 400 && s.showcase.length; i++) G.tick(s, sets, 1, T0 + i * 1000);
  ok(s.showcase.length === 0 && s.stats.cardsSold > 0, 'customers buy from the showcase');
  ok(G.feeling(0.8, 1) === 'cheap' && G.feeling(1, 1) === 'fair' && G.feeling(1.2, 1) === 'pricey' && G.feeling(2, 1) === 'steep', 'customers feel cheap, fair, pricey or too pricey by tag / market');
  const fb = G.feedbackSummary(s);
  ok(fb.total.looks > 0 && fb.total.bought === s.stats.cardsSold && fb.total.looks <= G.FEEDBACK_SIZE, 'every customer look is remembered with its feeling', `${fb.total.looks} looks, ${fb.total.bought} bought`);
  ok(!('_feedback' in Save.serialize(s).state), 'customer feedback is never saved');
  {
    const f = fresh(sets, order);
    G.setRandom(G.seededRandom(7));
    const draw = fame => { f.upgrades.fame = fame; return Array.from({ length: 4000 }, () => G.customerBudget(f)); };
    const b1 = draw(0), b20 = draw(19);
    ok(Math.abs(G.richCap(0) - G.BUDGET_MAX) < 1e-9 && Math.abs(G.richCap(19) - G.RICH_MAX) < 1e-6, 'Fame ceiling grows from $120 to $1,000');
    ok(b1.every(x => x >= G.BUDGET_MIN && x <= G.BUDGET_MAX), 'Fame 1 keeps budgets between $2 and $120');
    const rich = b20.filter(x => x > G.budgetCap(19)).length / b20.length;
    ok(Math.abs(G.budgetCap(19) - 2 * G.BUDGET_MAX) < 1e-9 && b20.some(x => x > G.BUDGET_MAX && x <= G.budgetCap(19)), 'Fame 20 doubles the everyday budget ceiling ($240)');
    ok(b20.every(x => x <= G.RICH_MAX) && rich > 0.31 && rich < 0.39 && b20.some(x => x > 600), 'Fame 20: about 35% of customers are rich, up to $1,000', `${Math.round(rich * 100)}% rich`);
    // The priciest card in a full showcase of commons sells quickly at Fame 20.
    const r = fresh(sets, order);
    r.upgrades.fame = 19; r.upgrades.marketing = G.UPGRADES.marketing.max; r.upgrades.showcase = 20;
    const cheap = base.cards.filter(c => c.rarity === 'common');
    for (let k = 0; k < G.showcaseCapacity(r) - 1; k++) { const c = cheap[k % cheap.length]; r.showcase.push({ s: 'base', c: c.id, p: Math.round(G.marketValue(r, base, c) * 100) / 100 }); }
    const star = base.cards.reduce((a, c) => (G.marketValue(r, base, c) > G.marketValue(r, base, a) ? c : a));
    const starTag = { s: 'base', c: star.id, p: Math.round(G.marketValue(r, base, star) * 100) / 100 };
    r.showcase.push(starTag);
    let secs = 0;
    while (r.showcase.includes(starTag) && secs < 1800) { secs++; G.tick(r, sets, 1, T0 + secs * 1000); while (r.showcase.length < G.showcaseCapacity(r) - 1) r.showcase.push({ ...r.showcase[0] }); }
    ok(!r.showcase.includes(starTag) && secs < 120, 'Fame 20: the priciest card at market sells in about two minutes or less', `${fmtMoney(starTag.p)} in ${secs}s`);
    f.upgrades.fame = 0; const i0 = G.customerInterval(f);
    f.upgrades.fame = 10;
    ok(Math.abs(i0 / G.customerInterval(f) - 1.3) < 1e-9, 'each Fame level brings 3% more customers');
    const caps = Array.from({ length: G.UPGRADES.storage.max + 1 }, (_, l) => G.storageAt(l));
    ok(caps[0] === 20 && caps[1] === 30 && caps.at(-1) === 10000 && caps.every((c, i) => !i || c > caps[i - 1]), 'booster storage grows from 20 to 10,000', caps.join(' '));
  }
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

  // ---------- Economy v5 ----------
  section('Salaries and Finances');
  G.setAccessories((await (await fetch('../data/accessories.json')).json()).items);
  Achievements.register();
  s = fresh(sets, order);
  s.money = 1000;
  const worker = G.hire(s);
  const lv = G.SKILL_KEYS.reduce((a, k) => a + worker.skills[k].lvl, 0);
  ok(worker.hiredDay === s.day && Math.abs(G.salaryPerDay(s, worker) - G.SALARY_PER_LEVEL * lv) < 1e-9, 'salary is $2 per skill level per day at hiring', fmtMoney(G.salaryPerDay(s, worker)));
  worker.hiredDay = s.day - 20;
  ok(Math.abs(G.salaryPerDay(s, worker) / (G.SALARY_PER_LEVEL * lv) - 1.2) < 1e-9, 'tenure adds 1% per market day');
  worker.hiredDay = s.day - 500;
  ok(Math.abs(G.salaryPerDay(s, worker) / (G.SALARY_PER_LEVEL * lv) - 1.5) < 1e-9, 'tenure bonus stops at +50%');
  worker.hiredDay = s.day;
  const m0 = s.money;
  G.tick(s, sets, 60, T0 + 60000);
  const paid = G.salaryPerDay(s, worker) * 60 / (M.DAY_MS / 1000);
  ok(Math.abs(m0 - s.money - paid) < 1e-6 && Math.abs(s.stats.salariesPaid - paid) < 1e-6, 'salary is paid continuously by the tick', fmtMoney(paid));
  const today = s.ledger[s.ledger.length - 1];
  ok(today.day === s.day && Math.abs(today.out.salaries - paid) < 1e-6 && today.out.hires > 0, 'the ledger books salaries and hiring by category');
  s.money = 0;
  G.setTask(s, worker, 'open');
  G.tick(s, sets, 5, T0 + 65000);
  ok(worker.status === 'unpaid' && s.money === 0, 'with no cash the employee waits, no debt');
  const led = fresh(sets, order);
  G.buyBooster(led, base);
  ok(led.ledger.at(-1).out.boosters > 0, 'distributor purchases are booked');
  led.money = 1e6;
  for (let d = 1; d <= G.LEDGER_DAYS + 10; d++) { led.day++; led.stock.base = 0; G.buyBooster(led, base); }
  ok(led.ledger.length === G.LEDGER_DAYS, `the ledger keeps ${G.LEDGER_DAYS} market days`);

  section('Seed per save');
  const ns1 = G.newState(sets, order, T0), ns2 = G.newState(sets, order, T0);
  ok(typeof ns1.seed === 'string' && ns1.seed.length >= 16 && ns1.seed !== ns2.seed, 'each new save gets its own seed');
  const c0 = base.cards[0];
  M.setSeed(ns1.seed); const p1 = M.marketValue(base, c0, 100);
  M.setSeed(ns2.seed); const p2 = M.marketValue(base, c0, 100);
  M.setSeed(ns1.seed); const p1b = M.marketValue(base, c0, 100);
  ok(p1 !== p2 && p1 === p1b, 'prices depend on the save seed and repeat for the same seed');
  M.setSeed(M.LEGACY_SEED);
  const v4 = { game: 'idlecardshop', saveVersion: 4, state: { money: 50, setupDone: true, staff: [{ id: 1, name: 'Ada', task: 'open', skills: {} }] } };
  const m45 = Save.restore(v4, sets, order);
  ok(m45.seed === M.LEGACY_SEED && m45.money === 50, 'v4 saves keep the old global seed');
  ok(m45.staff[0].hiredDay === null && Array.isArray(m45.ledger) && !m45.ledger.length && !m45.shelf.length, 'v4 -> v5: tenure starts on load, empty ledger and shelf');
  {
    const v5 = JSON.parse(JSON.stringify(Save.serialize(fresh(sets, order))));
    v5.saveVersion = 5;
    v5.state.staff = [{ id: 7, name: 'Ada', task: 'open', skills: {}, progress: 0, status: 'idle', hiredDay: 3 }];
    delete v5.state.properties;
    delete v5.state.campaign;
    const m56 = Save.restore(v5, sets, order);
    const e = m56.staff[0];
    ok(e.task === 'open' && e.set === null && e.task2 === null && e.set2 === null, 'v5 -> v6: the task becomes the main job, any collection, no backup');
    ok(!m56.properties.warehouses.length && !m56.campaign, 'v5 -> v6: no warehouses, no campaign');
  }
  const empty4 = Save.restore({ game: 'idlecardshop', saveVersion: 4, state: {} }, sets, order);
  ok(empty4.seed !== M.LEGACY_SEED, 'an empty v4 save starts with a new seed');

  section('Storage');
  s = fresh(sets, order);
  s.money = 5000;
  s.upgrades.storage = 3;
  ok(G.buyBox(s, base) && G.goodsOwned(s, 'x:base') === 1, 'a booster box can be bought');
  ok(Math.abs(G.boxPrice(s, base) - 36 * G.boosterPrice(s, base) * 0.9) < 1e-9, 'a box costs 36 boosters less 10%');
  ok(G.openBox(s, base) && G.goodsOwned(s, 'b:base') === 36 && !G.goodsOwned(s, 'x:base'), 'opening a box gives 36 boosters');
  const acc = G.accessories()[0];
  ok(acc && G.buyAccessory(s, acc.id, 2) === 2 && G.goodsOwned(s, `a:${acc.id}`) === 2, 'accessories can be bought', acc?.name);
  ok(G.listGood(s, sets, 'b:base', 10, 5) === 10 && s.stock.base === 26 && G.shelfCount(s) === 10, 'listing moves goods to the shelf');
  ok(G.listGood(s, sets, 'b:base', 5, 5) === 5 && s.shelf.length === 1, 'same good at the same price stacks');
  const room = G.shelfFree(s);
  ok(G.listGood(s, sets, 'b:base', 999, 6) === room && G.shelfCount(s) === G.shelfCapacity(s), 'the shelf has limited room', `${G.shelfCapacity(s)}`);
  ok(G.recallShelf(s) > 0 && !s.shelf.length && s.stock.base === 36, 'recall brings goods back');
  G.listGood(s, sets, `a:${acc.id}`, 2, acc.value);
  G.setRandom(G.seededRandom(3));
  for (let t = 1; t <= 1800 && s.shelf.length; t++) G.tick(s, sets, 1, T0 + 60000 + t * 1000);
  ok(!s.shelf.length && s.stats.sealedSold === 2 && s.ledger.at(-1).in.sealed > 0, 'customers buy shelf goods at a fair price', `${s.stats.sealedSold} sold`);
  ok(s.achievements['sealed-sale'] != null && s.achievements['box-break'] != null, 'achievements are earned during play');

  section('Storage space');
  {
    const sp = fresh(sets, order);
    sp.money = 1e6;
    const cap = G.stockCapacity(sp);
    sp.stock.base = cap - 15;
    ok(G.storageUsed(sp) === cap - 15 && G.buyBox(sp, base) && G.storageUsed(sp) === cap - 5, 'a booster box takes 10 storage spaces');
    ok(!G.canBuyBox(sp, base) && G.buyAccessory(sp, acc.id, 10) === 5 && G.storageFree(sp) === 0, 'accessories take 1 space and stop when storage is full');
    ok(!G.canBuyBooster(sp, base) && !G.canOpenBox(sp, base), 'a full storage buys no boosters and opens no boxes');
    sp.stock.base = cap + 50;
    ok(G.storageUsed(sp) > cap && !G.canBuyBooster(sp, base), 'goods over the limit stay; nothing more comes in');
  }

  section('Staff jobs');
  {
    const sj = fresh(sets, order);
    sj.money = 1e9;
    sj.upgrades.staffRoom = G.UPGRADES.staffRoom.max;
    ok(G.maxStaff(sj) === 30, 'the staff room holds up to 30 staff');
    ok(G.upgradeCost('staffRoom', 9) < G.UPGRADES.staffRoom.baseCost * Math.pow(2.2, 9) && G.upgradeCost('staffRoom', 8) === Math.round(150 * Math.pow(2.2, 8)), 'staff room levels past 8 grow more slowly');
    ok(G.hireCost(29) < 1e8 && G.hireCost(9) > G.hireCost(8), 'the 30th hire stays affordable', fmtMoney(G.hireCost(29)));
    const e = G.hire(sj);
    G.setJob(sj, e, 1, 'open', 'base');
    G.setJob(sj, e, 2, 'buy', 'base');
    sj.stock.base = 0;
    G.tick(sj, sets, 30, T0 + 30000);
    ok(sj.stock.base > 0 || sj.stats.boostersOpened > 0, 'with no packs to open the backup job buys some');
    ok(sj.stats.boostersBought > 0 && e.status !== 'no packs', 'the backup job keeps the employee busy', e.status);
    const before = sj.stats.boostersOpened;
    sj.stock.base = 20;
    G.tick(sj, sets, 30, T0 + 60000);
    ok(sj.stats.boostersOpened > before, 'the main job comes first again once it has work');
    const sp2 = G.spares(sj, sets, 0, 'jungle');
    ok(sp2.every(x => x.set.id === 'jungle'), 'a job can be limited to one collection');
  }

  section('Marketing');
  {
    const mk = fresh(sets, order);
    mk.money = 600;
    const i0 = G.customerInterval(mk);
    ok(G.startCampaign(mk, 'flyers') && Math.abs(i0 / G.customerInterval(mk) - 1.25) < 1e-9 && mk.money === 100, 'flyers bring 25% more customers for $500');
    ok(!G.startCampaign(mk, 'flyers'), 'one campaign at a time');
    G.tick(mk, sets, G.DAY_SECONDS + 1, T0 + 1000);
    ok(!mk.campaign && Math.abs(G.customerInterval(mk) - i0) < 1e-9, 'a campaign ends after its days');
    ok(mk.ledger.at(-1).out.marketing === 500, 'campaigns show in Finances');
  }

  section('Properties');
  {
    const wh = fresh(sets, order);
    wh.money = 200000;
    ok(G.buyWarehouse(wh) && G.warehouseCapacity(wh) === 100000 && wh.money === 150000, 'a warehouse costs $50K and holds 100K');
    const id = wh.properties.warehouses[0].id;
    ok(G.upgradeWarehouse(wh, id) && G.warehouseCapacity(wh) === 200000 && G.warehouseFeePerDay(wh) === 500, 'levels add 100K space and $250/day');
    const k = G.buyToWarehouse(wh, sets, 'b:base', 1000);
    ok(k === 1000 && G.warehouseOwned(wh, 'b:base') === 1000 && !wh.stock.base, 'boosters can be bought straight into the warehouse');
    ok(G.shipDays(1000) === 1 && G.shipDays(1001) === 2 && G.shipDays(10000) === 2 && G.shipDays(10001) === 3, 'shipments take 1 to 3 days by size');
    G.setTarget(wh, 'b:base', 10);
    const d0 = wh.day;
    G.tick(wh, sets, 6, T0 + 6000);
    ok(G.inTransit(wh, 'b:base') === 10 && !wh.stock.base, 'the target sends a shipment');
    G.tick(wh, sets, 1, T0 + 2 * M.DAY_MS);
    ok(wh.day > d0 && wh.stock.base === 10 && !wh.properties.ships.length, 'the shipment arrives in the shop');
    const fees = wh.stats.feesPaid;
    ok(fees > 0 && wh.ledger.some(e => e.out.properties > 0), 'daily fees are paid and booked', fmtMoney(fees));
    wh.money = 0;
    wh.stock.base = 0;
    G.tick(wh, sets, 6, T0 + 2 * M.DAY_MS + 6000);
    ok(!G.inTransit(wh, 'b:base') && wh._feesUnpaid && wh.money === 0, 'unpaid fees pause shipments, no debt');
    const bw = fresh(sets, order);
    bw.firstDay = bw.day = M.dayNumber(T0);
    bw.money = 100000;
    G.buyWarehouse(bw);
    bw.upgrades.staffRoom = 1;
    const buyer = G.hire(bw);
    G.setTask(bw, buyer, 'buy');
    bw.rules.stockTarget = 60;
    bw.rules.cashReserve = 0;
    bw.stock.base = G.stockCapacity(bw);
    G.tick(bw, sets, 600, T0 + 600000);
    const inWh = G.warehouseOwned(bw, 'b:base');
    const mw = fresh(sets, order);
    mw.firstDay = mw.day = M.dayNumber(T0);
    mw.money = 100000;
    mw.stock.base = G.stockCapacity(mw);
    ok(!G.buyBooster(mw, sets.base), 'a full shop without a warehouse cannot buy');
    G.buyWarehouse(mw);
    const before = G.storageUsed(mw);
    ok(G.buyBoosters(mw, sets.base, 5) === 5 && G.warehouseOwned(mw, 'b:base') === 5 && G.storageUsed(mw) === before && G.buyBox(mw, sets.base) && G.warehouseOwned(mw, 'x:base') === 1,
      'with the shop full, purchases go to the warehouses');
    ok(inWh > 0 && bw.stock.base + inWh <= 60 && bw.stock.base === G.stockCapacity(bw), 'a full shop sends the buyer to the warehouses, up to the stock target', `${inWh} in the warehouse`);
  }

  section('Achievements');
  const aw = fresh(sets, order);
  aw.stats.cardsSold = 150;
  Achievements.check(aw, sets, true);
  ok(aw.achievements['first-sale'] != null && aw.achievements['sold-100'] != null && aw.achievements['sold-1k'] == null, 'existing progress earns its achievements');
  ok(Achievements.list(sets).some(a => a.id === 'complete-jungle') && Achievements.list(sets).some(a => a.id === 'master'), 'one achievement per collection plus Master collector');
  const before = aw.inbox.length;
  Achievements.check(aw, sets, true);
  ok(aw.inbox.length === before, 'silent checks add no notices');

  // ---------- Release calendar ----------
  section('Release calendar');
  const DAY = M.DAY_MS;
  {
    const mk = id => normalizeSet({ id, name: id.toUpperCase(), booster: { wholesalePrice: 1, slots: [{ count: 1, rarity: 'c' }] }, rarities: { c: { value: 1 } },
      cards: Array.from({ length: 10 }, (_, i) => ({ index: i + 1, id: `${i + 1}`, name: `Card ${i + 1}`, rarity: 'c' })) });
    const two = { a: mk('a'), b: mk('b') };
    linkOrder(two, ['a', 'b']);
    const u = fresh(two, ['a', 'b']);
    u.money = 1000;
    ok(G.setUnlocked(u, two.a) && !G.setUnlocked(u, two.b), 'only the first collection is out on day one');
    ok(!G.buyBooster(u, two.b) && !G.buySingle(u, two, two.b, two.b.cards[0]), 'a collection not out yet sells no boosters or singles');
    for (let i = 0; i < 10; i++) G.buySingle(u, two, two.a, two.a.cards[i]);
    ok(!G.setUnlocked(u, two.b), 'discovering the whole collection does not release the next');
    G.tick(u, two, 1, T0 + (SU.RELEASE_EVERY_DAYS - 1) * DAY);
    ok(!G.setUnlocked(u, two.b), 'a day before the release the next collection is still not out');
    G.tick(u, two, 1, T0 + SU.RELEASE_EVERY_DAYS * DAY);
    ok(G.setUnlocked(u, two.b) && G.buyBooster(u, two.b), `the next collection is out after ${SU.RELEASE_EVERY_DAYS} days`);
    ok(u.log.some(l => l.kind === 'release') && u.inbox.some(n => n.kind === 'release'), 'the release shows in Recent and News');
    const want = G.wantedSet(u, two);
    ok(want && want.set === two.b && Math.abs(want.share - G.WANT_SHARE) < 1e-9, 'on release day some customers want the new collection');
    G.setRandom(G.seededRandom(3));
    u.showcase = Array.from({ length: 30 }, (_, i) => ({ s: 'a', c: two.a.cards[i % 10].id, p: 0.5 }));
    const missed0 = u.stats.missedCustomers;
    for (let i = 0; i < 200; i++) G.tick(u, two, 1, T0 + SU.RELEASE_EVERY_DAYS * DAY + 1000 + i * 1000);
    ok(u.stats.missedCustomers > missed0 && u.showcase.length < 30, 'customers who want it leave without buying; others still buy', `${u.stats.missedCustomers - missed0} left`);
    G.tick(u, two, 1, T0 + (SU.RELEASE_EVERY_DAYS + G.WANT_DAYS) * DAY);
    ok(!G.wantedSet(u, two), `after ${G.WANT_DAYS} days nobody comes for it only`);
    ok(G.unreadNotices(u) > 0 && (G.markNoticesRead(u), G.unreadNotices(u) === 0), 'reading News clears the unread count');
  }

  // ---------- Booster supply ----------
  section('Booster supply');
  {
    ok(SU.printRun(sets.base) === SU.BASE_PRINT_RUN && SU.printRun(sets.jungle) > SU.printRun(sets.base), 'each newer collection prints more', order.map(id => SU.printRun(sets[id])).join('/'));
    ok(order.every(id => SU.printRun(sets[id]) <= SU.BASE_PRINT_RUN * SU.PRINT_CAP), 'print runs stop growing at the cap');
    const a = fresh(sets, order), b = fresh(sets, order);
    const p0 = G.boosterPrice(a, base);
    ok(Math.abs(p0 - base.booster.wholesalePrice) < 1e-9, 'a new collection starts at its base booster price', fmtMoney(p0));
    for (let d = 1; d <= 120; d++) G.tick(a, sets, 1, T0 + d * DAY);
    G.tick(b, sets, 1, T0 + 120 * DAY);
    const ma = a.market.base, mb = b.market.base;
    ok(ma.left === mb.left && ma.printed === mb.printed && ma.held === mb.held, 'day by day and one jump give the same supply', `${ma.left} left`);
    ok(ma.left < ma.run && G.boosterPrice(a, base) > p0, 'rival shops buy, so supply drops and the price rises', `${fmtMoney(G.boosterPrice(a, base))} after 120 days`);
    ok(ma.left >= ma.printed * SU.PLAYER_MARGIN - 1, 'rivals always leave a share for the player');
    const dRise = G.boosterPrice(a, base) / p0 - 1;
    const scarce = ma.printed / ma.left;
    ok(Math.abs(dRise - (Math.pow(scarce, SU.DISTRIBUTOR_EXPONENT) - 1)) < 1e-4 && SU.DISTRIBUTOR_EXPONENT < SU.MARKET_EXPONENT,
      'the distributor rises with scarcity, less than the Market', `distributor ${fmtMoney(G.boosterPrice(a, base))}, market ${fmtMoney(G.marketBoosterValue(a, base))}`);
    let maxSwing = 0;
    for (let d = 0; d < 400; d++) maxSwing = Math.max(maxSwing, Math.abs(SU.marketValueOf(base, ma, 20000 + d) / SU.marketValueOf(base, ma, 20000 + d - 1) - 1));
    ok(maxSwing > 0 && maxSwing < 0.07, 'the Market booster value swings day to day, under 7%', `max ${(maxSwing * 100).toFixed(1)}%`);
    // A long run reaches the reprint zone at some point; reprints raise supply.
    const c = fresh(sets, order);
    let reprinted = false, minFrac = 1, maxP = 0;
    for (let d = 1; d <= 1500 && !reprinted; d += 10) {
      G.tick(c, sets, 1, T0 + d * DAY);
      const m = c.market.base;
      minFrac = Math.min(minFrac, m.left / m.printed);
      maxP = Math.max(maxP, G.boosterPrice(c, base));
      reprinted = m.reprints > 0;
    }
    ok(reprinted && c.inbox.some(n => n.kind === 'reprint'), 'a reprint happens and shows in News', `lowest supply ${(minFrac * 100).toFixed(0)}%, top price ${fmtMoney(maxP)}`);
    const rivalNotes = c.inbox.filter(n => n.kind === 'rival');
    const keys = rivalNotes.map(n => `${n.day}|${n.text}`);
    ok(new Set(keys).size === keys.length && rivalNotes.every(n => /stock up$/.test(n.text) && /Distributor supply −\d+%/.test(n.detail)), 'rival buys are grouped into one notice with the supply change', rivalNotes[0]?.detail || 'none above 3%');
    const rep = c.inbox.find(n => n.kind === 'reprint');
    ok(/reprint hits the market$/.test(rep.text) && /Distributor supply \+\d+%/.test(rep.detail), 'reprint notices say how much supply changed', rep.detail);
    {
      // Reprints: 32-64% of the first run, and never bigger than the last one once a newer set is out.
      const sizes = (latest) => {
        const m = { run: 1e6, printed: 1e6, left: 1e5, held: 0, reprints: 0, age: 0, hist: [], out: true };
        const out = [];
        for (let d = 0; d < 6000 && out.length < 6; d++) {
          m.left = Math.min(m.left, m.printed * 0.1);
          const before = m.printed;
          SU.stepDay(base, m, latest);
          if (m.printed > before) out.push((m.printed - before) / m.run);
        }
        return out;
      };
      const old = sizes(false), now = sizes(true);
      ok(old.length >= 3 && old.every((f, i) => f >= 0.32 - 1e-6 && f <= 0.64 + 1e-6 && (!i || f <= old[i - 1] + 1e-9)), 'reprints of an older set never grow', old.map(f => Math.round(f * 100) + '%').join(' '));
      ok(now.every(f => f >= 0.32 - 1e-6 && f <= 0.64 + 1e-6), 'reprints are 32-64% of the first run', now.map(f => Math.round(f * 100) + '%').join(' '));
    }
    const t = fresh(sets, order);
    t.money = 1000;
    const before = t.market.base.left;
    G.buyBooster(t, base);
    ok(t.market.base.left === before - 1, 'buying from the distributor takes from the supply');
    ok(!G.buyMarketBooster(t, base), 'nothing to buy on the Market before rivals hold boosters');
    G.tick(t, sets, 1, T0 + 3 * DAY);
    const held = t.market.base.held;
    const cost = G.marketBoosterBuyPrice(t, base);
    const m0 = t.money;
    ok(held > 0 && G.buyMarketBooster(t, base) && Math.abs(m0 - t.money - cost) < 1e-9 && t.market.base.held === held - 1, 'Market boosters cost 110% and come from rival stock');
    const left = t.market.base.left, held2 = t.market.base.held, sell = G.marketBoosterSellPrice(t, base), m1 = t.money, n = t.stock.base;
    ok(G.sellMarketBooster(t, base) && Math.abs(t.money - m1 - sell) < 1e-9 && t.stock.base === n - 1 && t.market.base.held === held2 + 1 && t.market.base.left === left,
      'selling a booster pays 90% and it goes to rival stock, not back to the distributor');
    { // Buy at the distributor and flip on the Market, over and over: it must run out.
      const f = fresh(sets, order);
      f.money = 1e9;
      f.market.base.left = 1000;
      let loops = 0;
      while (loops < 5000 && G.buyBooster(f, base)) { G.sellMarketBooster(f, base); loops++; }
      ok(loops <= 1000 && G.soldOut(f, base), 'buy-and-flip stops when the distributor runs out', `${loops} flips`);
    }
    t.market.base.left = 0;
    ok(G.soldOut(t, base) && !G.buyBooster(t, base), 'a sold-out distributor sells nothing');
  }

  // ---------- Market search ----------
  section('Market search');
  {
    const find = q => base.cards.filter(c => cardFilter(q)(c, base)).map(c => c.number);
    ok(find('Alakazam 1').join() === '1/102', '"Alakazam 1" finds Alakazam 1/102 only');
    ok(find('alakazam').length === 1 && find('1').join() === '1/102', 'name alone and number alone both work');
    ok(find('97').length === 1 && find('1/102').join() === '1/102', 'printed number works');
    ok(find('Alakazam 2').length === 0 && find('').length === base.cards.length, 'a mismatch finds nothing; empty finds all');
    const jungle = sets.jungle;
    ok(jungle.cards.filter(c => cardFilter('jungle')(c, jungle)).length === jungle.cards.length && find('jungle').length === 0, 'the collection name matches every card in it');
    ok(find('base alakazam').join() === '1/102', 'collection and card name together');
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
  const partial = { game: 'idlecardshop', saveVersion: Save.SAVE_VERSION, state: { money: 77, futureField: 1, showcase: [{ s: 'base', c: '001', p: 1 }, { s: 'gone', c: 'x', p: 1 }, { s: 'base', c: 'nope', p: 1 }], upgrades: { storage: 2 } } };
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
  // The v1 -> v2 step still runs on its own (shipped migrations never change).
  const m12 = Save.MIGRATIONS[1](JSON.parse(JSON.stringify(v1.state)));
  ok(m12.binder.base['001'] === 2 && m12.binder.base['002'] === 2 && !('unpriced' in m12) && m12.staff[0].task === 'price', 'v1 -> v2 step still moves cards to the binder and List staff to Price');
  const m2 = Save.restore(v1, sets, order);
  const blank = G.newState(sets, order);
  ok(m2.money === blank.money && !Object.keys(m2.binder).length && !m2.staff.length && !m2.setupDone, 'v1 saves start over (Nicolas, v3)');
  const v2 = { game: 'idlecardshop', saveVersion: 2, state: { money: 999, setupDone: true, stats: { rescues: 3 }, binder: { base: { '001': 4 } } } };
  const m3 = Save.restore(v2, sets, order);
  ok(m3.money === blank.money && !Object.keys(m3.binder).length && !m3.setupDone && !('rescues' in m3.stats), 'v2 saves start over too');
  const sup = fresh(sets, order);
  G.tick(sup, sets, 1, T0 + 5 * M.DAY_MS);
  const r3 = Save.restore(JSON.parse(JSON.stringify(Save.serialize(sup))), sets, order);
  ok(r3.market.base.left === sup.market.base.left && r3.market.base.age === sup.market.base.age && r3.inbox.length === sup.inbox.length, 'booster supply and News survive a save round trip');
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
  ok(week.day === off.day + 7 * 86400000 / M.DAY_MS, 'market days advance during catch-up', `${week.day - off.day} days`);

  // ---------- Debug ----------
  section('Debug');
  ok(await Debug.checkCode('cunha2026'), 'the debug code unlocks the menu');
  ok(await Debug.checkCode(' Cunha 2026 '), 'the code ignores case and spaces');
  ok(!(await Debug.checkCode('cunha2025')) && !(await Debug.checkCode('')), 'other codes do not unlock it');
  Clock.setOffset(5000);
  ok(Clock.now() - Date.now() >= 4990, 'the debug clock runs ahead by its offset');
  Clock.setOffset(0);
  const dbg = fresh(sets, order);
  dbg.firstDay = dbg.day = M.dayNumber(T0);
  const nextSet = G.nextRelease(dbg, sets);
  const skip = Debug.msToNextSet(dbg, sets, T0);
  ok(nextSet && M.dayNumber(T0 + skip) === SU.releaseDay(dbg, nextSet), 'skip to next set lands on its release day', `${skip / M.DAY_MS} days`);
  Debug.setUpgrade(dbg, 'fame', 99);
  ok(dbg.upgrades.fame === G.UPGRADES.fame.max, 'debug upgrade levels stay within the max');
  const rel = fresh(sets, order);
  rel.firstDay = M.dayNumber(T0) - 15; rel.day = M.dayNumber(T0);
  G.tick(rel, sets, 0, T0);
  const ageBase = SU.releaseDay(rel, sets[order[0]]), ageJungle = SU.releaseDay(rel, sets[order[1]]);
  const prefsDbg = {};
  Debug.releaseAll(rel, sets, prefsDbg);
  ok(order.every(id => G.setUnlocked(rel, sets[id])) && prefsDbg.releaseAll === rel.day, 'release all sets brings every collection out today');
  ok(SU.releaseDay(rel, sets[order[0]]) === ageBase && SU.releaseDay(rel, sets[order[1]]) === ageJungle && SU.releaseDay(rel, sets[order[2]]) === rel.day, 'collections already out keep their release day');
  ok(!('_releaseAll' in Save.serialize(rel).state), 'release all is never saved');

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
    // An unpaid employee waits for cash, so the player does that step by hand.
    const doneByStaff = k => s.staff.some(e => e.task === k && e.status !== 'unpaid');
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
