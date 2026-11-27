// Game rules: state, economy, customers and staff. No DOM here, so the exact same
// code runs live and during offline catch-up (GDD section 9).
//
// Flow: Distributor --buy--> Sealed stock --open--> Binder
//       --price--> Showcase --> customers buy (or bulk buyer for cheap spares)

import * as M from './market.js';

// ---------- Tunables (GDD sections 6 and 7) ----------
export const START_MONEY = 20;
export const MAX_SKILL = 10;
export const SPEED_PER_LEVEL = 0.78; // each level is 22% faster
export const BULK_RATE = 0.3;
export const MARKET_BUY_RATE = 1.1;
// Price levels offered when pricing: offset from today's market.
export const PRICE_LEVELS = [-0.1, -0.05, 0, 0.05, 0.1];
// Chance that a customer buys a card they look at, by tag / market (Nicolas,
// 2026-11-27: market 50%, up to 10% below 60%, more than 10% below 70%; the
// bands above market are ours). First band whose `upTo` covers the ratio wins.
export const BUY_BANDS = [
  { upTo: 0.9 - 1e-9, chance: 0.70 },
  { upTo: 0.995, chance: 0.60 },
  { upTo: 1.005, chance: 0.50 },
  { upTo: 1.05, chance: 0.35 },
  { upTo: 1.10, chance: 0.20 },
  { upTo: 1.25, chance: 0.08 },
  { upTo: 1.5, chance: 0.03 },
  { upTo: 2 - 1e-9, chance: 0.01 },
  { upTo: Infinity, chance: 0.005 },
];
export const CUSTOMER_LOOKS = 3;          // cards a customer looks at per visit
export const BUDGET_MIN = 2;              // customer budget, log-uniform
export const BUDGET_MAX = 120;
export const BASE_STORAGE = 20;
export const BASE_SHOWCASE = 40;
export const BASE_CUSTOMER_INTERVAL = 6;
export const LOG_SIZE = 40;

export const SKILLS = {
  buy: { base: 8 },
  open: { base: 10 },
  price: { base: 3 },
};
export const SKILL_KEYS = Object.keys(SKILLS);

export const UPGRADES = {
  storage: { baseCost: 40, growth: 1.6, max: 20 },
  showcase: { baseCost: 60, growth: 1.6, max: 20 },
  marketing: { baseCost: 80, growth: 1.75, max: 20 },
  reputation: { baseCost: 120, growth: 1.85, max: 15 },
  staffRoom: { baseCost: 150, growth: 2.2, max: 8 },
};

// ASSUMPTION [GDD Q5]: collection milestones as proposed (bonus on sale price).
export const MILESTONES = [
  { at: 0.25, bonus: 0.02 },
  { at: 0.5, bonus: 0.04 },
  { at: 0.75, bonus: 0.06 },
  { at: 1, bonus: 0.10 },
];

// ASSUMPTION [GDD Q2]: no staff salaries.

const NAMES = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Finn', 'Gus', 'Hana', 'Ivy', 'Jo', 'Kai', 'Lou',
  'Mae', 'Nico', 'Otto', 'Pia', 'Rae', 'Sam', 'Theo', 'Uma', 'Vic', 'Wren'];

// ---------- Randomness (swappable for tests) ----------
let rng = Math.random;
export function setRandom(fn) { rng = fn || Math.random; }
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Formulas ----------
export const skillDuration = (skill, lvl) => SKILLS[skill].base * Math.pow(SPEED_PER_LEVEL, lvl - 1);
export const xpToNext = lvl => Math.round(25 * Math.pow(lvl, 2.3));
export const trainCost = lvl => Math.round(40 * Math.pow(2, lvl));
export const trainTime = lvl => 20 * lvl;
export const hireCost = n => Math.round(50 * Math.pow(2.2, n));
export const upgradeCost = (key, lvl) => Math.round(UPGRADES[key].baseCost * Math.pow(UPGRADES[key].growth, lvl));
// Cost of n items starting at level k: base x rate^k x (rate^n - 1) / (rate - 1).
export const seriesCost = (base, rate, k, n) => base * Math.pow(rate, k) * (Math.pow(rate, n) - 1) / (rate - 1);

export const stockCapacity = s => BASE_STORAGE + 10 * s.upgrades.storage;
export const showcaseCapacity = s => BASE_SHOWCASE + 20 * s.upgrades.showcase;
export const maxStaff = s => 1 + s.upgrades.staffRoom;
export const customerInterval = s => BASE_CUSTOMER_INTERVAL / (1 + 0.25 * s.upgrades.marketing);
export const reputationBonus = s => 1 + 0.06 * s.upgrades.reputation;
export const totalStock = s => Object.values(s.stock).reduce((a, b) => a + b, 0);

// ---------- State ----------
export function newState(sets, order, nowMs = Date.now()) {
  const first = order[0] || '';
  return {
    money: START_MONEY,
    stock: {},          // setId -> sealed boosters
    binder: {},         // setId -> cardId -> copies owned (opened cards land here)
    seen: {},           // setId -> cardId -> true
    showcase: [],       // [{s, c, p}] tagged cards for sale
    staff: [],
    upgrades: { storage: 0, showcase: 0, marketing: 0, reputation: 0, staffRoom: 0 },
    rules: {
      buySet: first,
      openSet: first,
      stockTarget: 10,
      cashReserve: 20,
      bulkBelow: 0.25,
      keepCopies: 1,    // the pricing employee leaves this many copies of each card
      priceLevel: 0,    // the pricing employee's offset from market (PRICE_LEVELS)
    },
    timeZone: M.browserTimeZone(),
    setupDone: false,
    day: 0,
    firstDay: null,
    customerTimer: 3,
    unlocked: { priceList: false, binder: false, showcase: false, upgrades: false, staff: false, market: false },
    tutorial: { rev: 0, done: [], skipped: false, base: {} },
    flags: { visited: {} },
    stats: {
      earned: 0, spent: 0, boostersBought: 0, boostersOpened: 0, cardsPriced: 0, cardsListed: 0,
      cardsSold: 0, bulkSold: 0, customers: 0, levelsGained: 0, playTime: 0, rescues: 0,
    },
    log: [],
    nextId: 1,
    createdAt: nowMs,
    lastTick: nowMs,
  };
}

// ---------- Market access ----------
// Cached until the next midnight, so long catch-ups stay fast.
export function dayAt(state, nowMs) {
  const c = state._dayCache;
  if (c && c.tz === state.timeZone && nowMs >= c.from && nowMs < c.to) return c.day;
  const day = M.dayNumber(state.timeZone, new Date(nowMs));
  state._dayCache = { tz: state.timeZone, from: nowMs, to: nowMs + M.msUntilNextDay(state.timeZone, nowMs), day };
  return day;
}

// Per-card memo of today's market value; cheap enough for offline catch-up.
export function marketValue(state, set, card) {
  if (card._mvDay !== state.day) {
    card._mvDay = state.day;
    card._mv = M.marketValue(set, card, state.day);
  }
  return card._mv;
}

export function boosterPrice(state, set) {
  return set.booster.wholesalePrice * M.boosterMultiplier(set, state.day);
}

// ---------- Helpers ----------
function log(state, kind, text) {
  state.log.unshift({ t: state.lastTick, kind, text });
  if (state.log.length > LOG_SIZE) state.log.length = LOG_SIZE;
}

function earn(state, v) {
  state.money += v;
  state.stats.earned += v;
}

function spend(state, v) {
  state.money -= v;
  state.stats.spent += v;
}

export function collectionProgress(state, set) {
  const seen = state.seen[set.id] || {};
  let n = 0;
  for (const c of set.cards) if (seen[c.id]) n++;
  return { seen: n, total: set.cards.length, frac: set.cards.length ? n / set.cards.length : 0 };
}

export function milestoneBonus(state, set) {
  const { frac } = collectionProgress(state, set);
  let b = 0;
  for (const m of MILESTONES) if (frac >= m.at) b = m.bonus;
  return b;
}

// A collection's boosters and singles can be bought once the collection before
// it (collections.json order) is UNLOCK_AT discovered. The first one is always open.
export const UNLOCK_AT = 0.9;

export function setUnlocked(state, set) {
  return !set.prev || collectionProgress(state, set.prev).frac >= UNLOCK_AT - 1e-9;
}

// Refresh cached milestone bonuses (called when discoveries change). Announces
// the next collection the moment this one crosses UNLOCK_AT.
function refreshBonus(state, sets, setId, announce = true) {
  state._bonus = state._bonus || {};
  state._bonus[setId] = milestoneBonus(state, sets[setId]);
  const next = sets[sets[setId].nextId];
  if (!next) return;
  state._open = state._open || {};
  const open = setUnlocked(state, next);
  if (announce && open && state._open[next.id] === false) log(state, 'unlock', `${next.name} boosters available`);
  state._open[next.id] = open;
}

function saleMultiplier(state, setId) {
  return reputationBonus(state) * (1 + (state._bonus?.[setId] || 0));
}

// ---------- Actions: buy ----------
export function canBuyBooster(state, set, reserve = 0) {
  return setUnlocked(state, set) && totalStock(state) < stockCapacity(state) && state.money - boosterPrice(state, set) >= reserve - 1e-9;
}

export function buyBooster(state, set, reserve = 0) {
  if (!canBuyBooster(state, set, reserve)) return false;
  spend(state, boosterPrice(state, set));
  state.stock[set.id] = (state.stock[set.id] || 0) + 1;
  state.stats.boostersBought++;
  return true;
}

export function buyBoosters(state, set, n) {
  let k = 0;
  while (k < n && buyBooster(state, set)) k++;
  return k;
}

// ---------- Actions: open ----------
function pickWeighted(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
  return entries[entries.length - 1][0];
}

export function rollBooster(set) {
  const out = [];
  for (const slot of set.booster.slots) {
    for (let i = 0; i < slot.count; i++) {
      const rarity = slot.weights ? pickWeighted(slot.weights) : slot.rarity;
      const pool = set.byRarity[rarity];
      if (!pool || !pool.length) continue;
      out.push(pool[Math.floor(rng() * pool.length)]);
    }
  }
  // Reveal order: most common first, rarest last (GDD section 5).
  out.sort((a, b) => set.rarities[a.rarity].rank - set.rarities[b.rarity].rank);
  return out;
}

// Opens one booster. Every card goes to the binder right away, so closing the
// opening scene never loses anything. Returns [{card, isNew}] or null.
export function openBooster(state, sets, set) {
  if (!(state.stock[set.id] > 0)) return null;
  state.stock[set.id]--;
  state.stats.boostersOpened++;
  const seen = (state.seen[set.id] ||= {});
  const binder = (state.binder[set.id] ||= {});
  const result = [];
  let discovered = false;
  for (const card of rollBooster(set)) {
    const isNew = !seen[card.id];
    if (isNew) { seen[card.id] = true; discovered = true; }
    binder[card.id] = (binder[card.id] || 0) + 1;
    result.push({ card, isNew });
  }
  state._binderVer = (state._binderVer || 0) + 1;
  if (discovered) {
    const before = state._bonus?.[set.id] || 0;
    refreshBonus(state, sets, set.id);
    const after = state._bonus[set.id];
    if (after > before) log(state, 'milestone', `${set.name}: ${Math.round(collectionProgress(state, set).frac * 100)}% discovered`);
  }
  return result;
}

export function openBoosters(state, sets, set, n) {
  const all = [];
  for (let i = 0; i < n; i++) {
    const r = openBooster(state, sets, set);
    if (!r) break;
    all.push(...r);
  }
  return all;
}

// ---------- Actions: price (binder -> showcase) ----------
export const copies = (state, set, card) => state.binder[set.id]?.[card.id] || 0;
export const freeSlots = state => Math.max(0, showcaseCapacity(state) - state.showcase.length);
export const tagPrice = (mv, level) => Math.max(0.01, Math.round(mv * (1 + level) * 100) / 100);

export function buyChance(tag, mv) {
  const r = mv > 0 ? tag / mv : Infinity;
  for (const b of BUY_BANDS) if (r <= b.upTo) return b.chance;
  return 0;
}

function takeFromBinder(state, set, card, n) {
  const binder = state.binder[set.id];
  const have = binder?.[card.id] || 0;
  const k = Math.max(0, Math.min(have, Math.floor(n)));
  if (!k) return 0;
  binder[card.id] = have - k;
  if (!binder[card.id]) delete binder[card.id];
  return k;
}

// Puts up to n copies of one card in the showcase at `price` each (limited by
// free slots). Returns how many were listed.
export function listCard(state, set, card, n, price) {
  if (!(price > 0)) return 0;
  const k = takeFromBinder(state, set, card, Math.min(n, freeSlots(state)));
  const p = Math.round(price * 100) / 100;
  for (let i = 0; i < k; i++) state.showcase.push({ s: set.id, c: card.id, p });
  state.stats.cardsPriced += k;
  state.stats.cardsListed += k;
  return k;
}

// Spare copies: what is left after keeping `keep` copies of each card. Sorted
// by today's value, priciest first.
export function spares(state, sets, keep) {
  const out = [];
  for (const [sid, cards] of Object.entries(state.binder)) {
    const set = sets[sid];
    if (!set) continue;
    for (const [cid, n] of Object.entries(cards)) {
      const card = set.byId[cid];
      if (card && n > keep) out.push({ set, card, n: n - keep, mv: marketValue(state, set, card) });
    }
  }
  return out.sort((a, b) => b.mv - a.mv);
}

// Manual batch: prices up to n copies, priciest first, keeping `keep` copies
// of each card, at market x (1 + level). Cards worth less than the bulk
// threshold are left for the bulk buyer.
export function priceSpares(state, sets, n, level = 0, keep = 0) {
  let left = Math.min(n, freeSlots(state)), k = 0;
  for (const sp of spares(state, sets, keep)) {
    if (left <= 0) break;
    if (sp.mv < state.rules.bulkBelow) continue;
    const m = listCard(state, sp.set, sp.card, Math.min(left, sp.n), tagPrice(sp.mv, level));
    left -= m; k += m;
  }
  return k;
}

// Copies (keeping `keep` of each card) worth less than the bulk threshold.
export function bulkSpares(state, sets, keep = 0) {
  let n = 0, total = 0;
  for (const sp of spares(state, sets, keep)) {
    if (sp.mv >= state.rules.bulkBelow) continue;
    n += sp.n;
    total += sp.n * sp.mv * BULK_RATE;
  }
  return { n, total };
}

export function sellBulk(state, sets, keep = 0) {
  let n = 0, total = 0;
  for (const sp of spares(state, sets, keep)) {
    if (sp.mv >= state.rules.bulkBelow) continue;
    takeFromBinder(state, sp.set, sp.card, sp.n);
    n += sp.n;
    total += sp.n * sp.mv * BULK_RATE;
  }
  earn(state, total);
  state.stats.bulkSold += n;
  if (n) state._binderVer = (state._binderVer || 0) + 1;
  return { n, total };
}

// One step of the pricing employee: the priciest spare copy (keeping
// rules.keepCopies) goes to the showcase at the rule's price level, or to the
// bulk buyer if it is worth less than the bulk threshold. The candidate list
// is cached and walked one copy per card per pass; it is rebuilt when a pass
// ends having done something or the binder gained cards (state._binderVer), or when the day
// or the rule changes.
function staffPriceOne(state, sets) {
  const keep = Math.max(0, Math.floor(state.rules.keepCopies) || 0);
  const ver = state._binderVer || 0;
  let q = state._spares;
  for (;;) {
    const stale = !q || q.day !== state.day || q.keep !== keep;
    if (stale || q.i >= q.list.length) {
      if (!stale && q.ver === ver && !q.acted) return 'none';
      q = state._spares = { day: state.day, keep, ver, i: 0, list: spares(state, sets, keep) };
      continue;
    }
    const sp = q.list[q.i];
    if (copies(state, sp.set, sp.card) <= keep) { q.i++; continue; }
    if (sp.mv >= state.rules.bulkBelow && !freeSlots(state)) return 'full';
    q.i++; // one copy per card per pass, so cards opened meanwhile get their turn
    q.acted = true;
    if (sp.mv < state.rules.bulkBelow) {
      takeFromBinder(state, sp.set, sp.card, 1);
      earn(state, sp.mv * BULK_RATE);
      state.stats.bulkSold++;
      return 'bulk';
    }
    listCard(state, sp.set, sp.card, 1, tagPrice(sp.mv, state.rules.priceLevel || 0));
    return 'priced';
  }
}

export function recallShowcase(state) {
  const n = state.showcase.length;
  for (const it of state.showcase) {
    const b = (state.binder[it.s] ||= {});
    b[it.c] = (b[it.c] || 0) + 1;
  }
  state.showcase = [];
  state._binderVer = (state._binderVer || 0) + 1;
  return n;
}

// ---------- Actions: market ----------
export function singlePrice(state, set, card) {
  return marketValue(state, set, card) * MARKET_BUY_RATE;
}

export function buySingle(state, sets, set, card) {
  const cost = singlePrice(state, set, card);
  if (!setUnlocked(state, set) || state.money < cost) return false;
  spend(state, cost);
  const binder = (state.binder[set.id] ||= {});
  binder[card.id] = (binder[card.id] || 0) + 1;
  state._binderVer = (state._binderVer || 0) + 1;
  const seen = (state.seen[set.id] ||= {});
  if (!seen[card.id]) { seen[card.id] = true; refreshBonus(state, sets, set.id); }
  return true;
}

// ---------- Upgrades ----------
export function buyUpgrade(state, key) {
  const lvl = state.upgrades[key];
  if (lvl >= UPGRADES[key].max) return false;
  const cost = upgradeCost(key, lvl);
  if (state.money < cost) return false;
  spend(state, cost);
  state.upgrades[key]++;
  return true;
}

// ---------- Staff ----------
export function canHire(state) {
  return state.staff.length < maxStaff(state) && state.money >= hireCost(state.staff.length);
}

export function hire(state) {
  if (!canHire(state)) return null;
  spend(state, hireCost(state.staff.length));
  const used = new Set(state.staff.map(e => e.name));
  const free = NAMES.filter(n => !used.has(n));
  const name = free.length ? free[Math.floor(rng() * free.length)] : `Clerk ${state.nextId}`;
  const skills = {};
  for (const k of SKILL_KEYS) skills[k] = { lvl: 1 + Math.floor(rng() * 2), xp: 0 };
  const emp = { id: state.nextId++, name, skills, task: null, progress: 0, training: null, status: 'idle' };
  state.staff.push(emp);
  log(state, 'staff', `${name} joined the shop`);
  return emp;
}

export function setTask(state, emp, task) {
  emp.task = SKILLS[task] ? task : null;
  emp.progress = 0;
}

export function canTrain(state, emp, skill) {
  const sk = emp.skills[skill];
  return !emp.training && sk.lvl < MAX_SKILL && state.money >= trainCost(sk.lvl);
}

export function train(state, emp, skill) {
  if (!canTrain(state, emp, skill)) return false;
  const lvl = emp.skills[skill].lvl;
  spend(state, trainCost(lvl));
  emp.training = { skill, left: trainTime(lvl), total: trainTime(lvl) };
  emp.progress = 0;
  return true;
}

function levelUp(state, emp, skill, how) {
  const sk = emp.skills[skill];
  sk.lvl = Math.min(MAX_SKILL, sk.lvl + 1);
  sk.xp = 0;
  state.stats.levelsGained++;
  log(state, 'staff', `${emp.name}: ${skill[0].toUpperCase()}${skill.slice(1)} Lv ${sk.lvl}${how === 'training' ? ' (trained)' : ''}`);
}

function gainXp(state, emp, skill) {
  const sk = emp.skills[skill];
  if (sk.lvl >= MAX_SKILL) return;
  sk.xp++;
  if (sk.xp >= xpToNext(sk.lvl)) levelUp(state, emp, skill, 'practice');
}

// One action of the employee's task. Returns true if it happened; otherwise
// sets emp.status to the reason it is waiting.
function doTask(state, sets, emp) {
  switch (emp.task) {
    case 'buy': {
      const set = sets[state.rules.buySet];
      if (!set) { emp.status = 'no collection'; return false; }
      if (!setUnlocked(state, set)) { emp.status = 'locked'; return false; }
      if ((state.stock[set.id] || 0) >= state.rules.stockTarget) { emp.status = 'stock target'; return false; }
      if (totalStock(state) >= stockCapacity(state)) { emp.status = 'storage full'; return false; }
      if (!buyBooster(state, set, state.rules.cashReserve)) { emp.status = 'cash reserve'; return false; }
      return true;
    }
    case 'open': {
      const set = sets[state.rules.openSet];
      if (!set || !openBooster(state, sets, set)) { emp.status = 'no packs'; return false; }
      return true;
    }
    case 'price': {
      const r = staffPriceOne(state, sets);
      if (r === 'full') { emp.status = 'showcase full'; return false; }
      if (r === 'none') { emp.status = 'nothing to price'; return false; }
      return true;
    }
  }
  return false;
}

function tickEmployee(state, sets, emp, dt) {
  if (emp.training) {
    emp.status = 'training';
    emp.training.left -= dt;
    if (emp.training.left <= 0) {
      const skill = emp.training.skill;
      emp.training = null;
      levelUp(state, emp, skill, 'training');
    }
    return;
  }
  if (!emp.task) { emp.status = 'idle'; emp.progress = 0; return; }
  const dur = skillDuration(emp.task, emp.skills[emp.task].lvl);
  emp.progress += dt;
  let guard = 0;
  while (emp.progress >= dur && guard++ < 2000) {
    if (!doTask(state, sets, emp)) { emp.progress = dur; return; }
    emp.progress -= dur;
    gainXp(state, emp, emp.task);
  }
  emp.status = 'working';
}

// ---------- Customers ----------
let saleListener = null;
export function onSale(fn) { saleListener = fn; }
let quiet = false; // true during offline catch-up: no sounds or floating text

// A customer arrives with a budget and looks at up to CUSTOMER_LOOKS cards
// they can afford (pricier cards draw more attention: weight = sqrt of market
// price). Each look buys with the chance of the tag's price band (BUY_BANDS).
function customerVisit(state, sets) {
  state.stats.customers++;
  if (!state.showcase.length) return;
  let budget = BUDGET_MIN * Math.pow(BUDGET_MAX / BUDGET_MIN, rng());
  const looked = new Set();
  for (let i = 0; i < CUSTOMER_LOOKS && state.showcase.length; i++) {
    let total = 0;
    const weights = new Array(state.showcase.length);
    for (let j = 0; j < state.showcase.length; j++) {
      const it = state.showcase[j];
      const set = sets[it.s], card = set?.byId[it.c];
      const w = card && it.p <= budget && !looked.has(it) ? Math.sqrt(marketValue(state, set, card)) : 0;
      weights[j] = w;
      total += w;
    }
    if (total <= 0) break;
    let r = rng() * total, pick = 0;
    while (pick < weights.length - 1 && (r -= weights[pick]) > 0) pick++;
    const it = state.showcase[pick];
    looked.add(it);
    const set = sets[it.s], card = set.byId[it.c];
    if (rng() >= buyChance(it.p, marketValue(state, set, card))) continue;
    state.showcase.splice(pick, 1);
    budget -= it.p;
    const paid = it.p * saleMultiplier(state, it.s);
    earn(state, paid);
    state.stats.cardsSold++;
    if (saleListener && !quiet) saleListener(paid);
  }
}

// ---------- Progressive reveal (GDD section 11) ----------
function checkUnlocks(state, sets) {
  const u = state.unlocked;
  if (!u.priceList && state.stats.boostersOpened > 0) { u.priceList = true; u.binder = true; }
  if (!u.showcase && state.stats.cardsSold > 0) u.showcase = true;
  if (!u.upgrades && state.money >= 40) u.upgrades = true;
  if (!u.staff && state.money >= 50) u.staff = true;
  if (!u.market) {
    const newDay = state.firstDay != null && state.day !== state.firstDay;
    let pricey = false;
    if (!newDay && state.stats.boostersOpened > 0) {
      for (const [sid, cards] of Object.entries(state.binder)) {
        const set = sets[sid];
        for (const cid of Object.keys(cards)) {
          const card = set?.byId[cid];
          if (card && marketValue(state, set, card) > 5) { pricey = true; break; }
        }
        if (pricey) break;
      }
      if (!pricey) pricey = state.showcase.some(it => it.p > 5);
    }
    if (newDay || pricey) u.market = true;
  }
}

// ---------- Loop ----------
export function tick(state, sets, dt, nowMs) {
  state.lastTick = nowMs;
  state.stats.playTime += dt;
  const day = dayAt(state, nowMs);
  if (day !== state.day) {
    const first = !state.day;
    state.day = day;
    if (state.firstDay == null) state.firstDay = day;
    if (!first) log(state, 'day', `New market day: ${M.dayLabel(day)}`);
  }
  state.customerTimer -= dt;
  let guard = 0;
  while (state.customerTimer <= 0 && guard++ < 1000) {
    customerVisit(state, sets);
    state.customerTimer += customerInterval(state) * (0.5 + rng());
  }
  for (const emp of state.staff) tickEmployee(state, sets, emp, dt);
  checkUnlocks(state, sets);
}

// Recomputes derived caches after load.
export function prepare(state, sets) {
  state._bonus = {};
  state._open = {};
  for (const id of Object.keys(sets)) refreshBonus(state, sets, id, false);
}

// Replays the time since the last tick in full, in chunks, so the page stays
// responsive. onProgress(fraction, simulatedSeconds) is called between chunks.
export async function catchUp(state, sets, toMs, onProgress, opts = {}) {
  const fromMs = state.lastTick;
  const total = Math.floor((toMs - fromMs) / 1000);
  if (total < 1) return null;
  const before = {
    money: state.money, earned: state.stats.earned, sold: state.stats.cardsSold,
    opened: state.stats.boostersOpened, bought: state.stats.boostersBought, levels: state.stats.levelsGained,
  };
  const step = total > 86400 ? 2 : 1;
  const budget = opts.budgetMs ?? 30;
  let done = 0;
  quiet = true;
  try {
    let last = performance.now();
    while (done < total) {
      const dt = Math.min(step, total - done);
      done += dt;
      tick(state, sets, dt, fromMs + done * 1000);
      if (performance.now() - last > budget) {
        onProgress?.(done / total, done);
        await new Promise(r => setTimeout(r, 0));
        last = performance.now();
      }
    }
  } finally {
    quiet = false;
  }
  onProgress?.(1, total);
  return {
    seconds: total,
    money: state.money - before.money,
    earned: state.stats.earned - before.earned,
    sold: state.stats.cardsSold - before.sold,
    opened: state.stats.boostersOpened - before.opened,
    bought: state.stats.boostersBought - before.bought,
    levels: state.stats.levelsGained - before.levels,
  };
}
