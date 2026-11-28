// Game rules: state, economy, customers and staff. No DOM here, so the exact same
// code runs live and during offline catch-up (GDD section 9).
//
// Flow: Distributor --buy--> Sealed stock --open--> Binder
//       --price--> Showcase --> customers buy (or bulk buyer for cheap spares)

import * as M from './market.js';
import * as SU from './supply.js';
import { RIVAL_NAMES } from './strings.js';

// ---------- Tunables (GDD sections 6 and 7) ----------
export const START_MONEY = 20;
export const MAX_SKILL = 10;
export const SPEED_PER_LEVEL = 0.78; // each level is 22% faster
export const BULK_RATE = 0.3;
export const MARKET_BUY_RATE = 1.1;
// Price levels offered when pricing: offset from today's market.
export const PRICE_LEVELS = [-0.1, -0.05, 0, 0.05, 0.1];
// Chance that a customer buys what they look at, by tag / market (Nicolas,
// 2026-11-28, after TCG Card Shop Simulator): -20% 100%, -10% 95%, market 90%,
// +10% 75%, +20% 60%, +30% 45%, +40% 15%, +50% 5%, +60% 1%, above that never.
// Linear between the points.
export const BUY_CURVE = [[0.8, 1], [0.9, 0.95], [1, 0.9], [1.1, 0.75], [1.2, 0.6], [1.3, 0.45], [1.4, 0.15], [1.5, 0.05], [1.6, 0.01]];
// Rich customers judge a tag this much closer to market (a +30% tag feels like +20%).
export const RICH_LENIENCE = 0.1;
// How a customer feels about a tag, by tag / market. First band whose `upTo`
// covers the ratio wins: cheap sells 95-100%, fair 75-90%, pricey 45-60%,
// too pricey 15% or less.
export const FEELINGS = [
  { key: 'cheap', upTo: 0.995 },
  { key: 'fair', upTo: 1.105 },
  { key: 'pricey', upTo: 1.305 },
  { key: 'steep', upTo: Infinity },
];
export const FEEDBACK_SIZE = 200;         // customer looks kept for the Customers panel (runtime only)
export const CUSTOMER_LOOKS = 3;          // cards a customer looks at per visit
export const BUDGET_MIN = 2;              // customer budget, log-uniform
export const BUDGET_MAX = 120;
export const BASE_STORAGE = 20;
export const BASE_SHOWCASE = 40;
export const BASE_CUSTOMER_INTERVAL = 6;
export const LOG_SIZE = 40;
export const INBOX_SIZE = 60;

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
  // Fame (Nicolas, 2026-11-27): shown as Lv 1-20; the saved value is 0-19.
  fame: { baseCost: 200, growth: 1.5, max: 19, start: 1 },
};

// Fame: every customer's budget ceiling grows from BUDGET_MAX to twice that at
// level 20. From level 2 a share of customers is rich (10%, up to 35% at level
// 20), with a budget between that ceiling and one that grows to RICH_MAX at
// level 20; rich customers are collectors and look at the priciest cards first
// (weight = market value, not its square root). Each level also brings
// FAME_CUSTOMERS more customers. (1.7.1: Nicolas found $70 cards too slow at
// Fame 20.)
export const RICH_SHARE = 0.10;
export const RICH_SHARE_MAX = 0.35;
export const RICH_MAX = 1000;
export const FAME_CUSTOMERS = 0.03;

// New-set customers (Nicolas, 2026-11-27): right after a release some
// customers come for the newest collection only. With none of it in the
// showcase they leave without buying.
export const WANT_SHARE = 0.30;           // share on release day...
export const WANT_DAYS = 6;               // ...fading to 0 over this many days

// Collection milestones (approved by Nicolas, 2026-11-28): bonus on sale price.
export const MILESTONES = [
  { at: 0.25, bonus: 0.02 },
  { at: 0.5, bonus: 0.04 },
  { at: 0.75, bonus: 0.06 },
  { at: 1, bonus: 0.10 },
];

// Salaries (Nicolas, 2026-11-28; docs/sdd/economy-v5.md): per market day,
// $2 x the sum of skill levels, +1% per market day at the shop up to +50%.
// Paid by the tick, live and offline. No cash: the employee waits, no debt.
export const SALARY_PER_LEVEL = 2;
export const TENURE_BONUS = 0.01;
export const TENURE_MAX = 0.5;
const DAY_SECONDS = M.DAY_MS / 1000;

// Finances: one ledger entry per market day, this many kept.
export const LEDGER_DAYS = 72;

// Sealed goods (docs/sdd/economy-v5.md).
export const BOX_SIZE = 36;               // boosters per box
export const BOX_DISCOUNT = 0.9;          // a box costs 36 boosters less 10%
export const SEALED_SHARE = 0.25;         // visits that shop the sealed shelf when it has goods
export const SEALED_LOOKS = 2;
export const SHELF_BASE = 20;             // shelf room, +10 per Bigger showcase level
export const SHELF_PER_LEVEL = 10;
const ACC_SWING = 0.05;                   // accessories' daily value swing

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

// Sealed booster room (Nicolas, 2026-11-28): grows on a curve from 20 to
// STORAGE_MAX at the last Bigger storage level, never below the old +10 a level.
export const STORAGE_MAX = 10000;
export function storageAt(level) {
  const curve = BASE_STORAGE * Math.pow(STORAGE_MAX / BASE_STORAGE, level / UPGRADES.storage.max);
  const v = Math.max(BASE_STORAGE + 10 * level, curve);
  return v < 100 ? Math.round(v) : v < 1000 ? Math.round(v / 10) * 10 : Math.round(v / 50) * 50;
}
export const stockCapacity = s => storageAt(s.upgrades.storage);
export const showcaseCapacity = s => BASE_SHOWCASE + 20 * s.upgrades.showcase;
export const maxStaff = s => 1 + s.upgrades.staffRoom;
export const customerInterval = s => BASE_CUSTOMER_INTERVAL / ((1 + 0.25 * s.upgrades.marketing) * (1 + FAME_CUSTOMERS * (s.upgrades.fame || 0)));
// Budget ceiling of rich customers at a Fame value (0-19).
export const richCap = fame => BUDGET_MAX * Math.pow(RICH_MAX / BUDGET_MAX, fame / UPGRADES.fame.max);
export const budgetCap = fame => BUDGET_MAX * (1 + fame / UPGRADES.fame.max);
export const richShare = fame => (fame > 0 ? RICH_SHARE + (RICH_SHARE_MAX - RICH_SHARE) * (fame - 1) / (UPGRADES.fame.max - 1) : 0);
export function customerBudget(state) {
  const fame = state.upgrades.fame || 0;
  const cap = budgetCap(fame);
  if (fame > 0 && rng() < richShare(fame)) return cap * Math.pow(richCap(fame) / cap, rng());
  return BUDGET_MIN * Math.pow(cap / BUDGET_MIN, rng());
}
// Rich customers (budget above the everyday ceiling) weigh cards by value
// and accept higher tags (RICH_LENIENCE).
const isRich = (budget, state) => budget > budgetCap(state.upgrades.fame || 0);
const lookWeight = (budget, state) => (isRich(budget, state) ? v => v : Math.sqrt);

// The newest released collection past the first, and the share of customers
// who want it today (0 outside the window).
export function wantedSet(state, sets) {
  let best = null;
  for (const set of Object.values(sets)) {
    if (!(set.releaseIndex > 0) || !setUnlocked(state, set)) continue;
    if (!best || set.releaseIndex > best.releaseIndex) best = set;
  }
  if (!best) return null;
  const age = state.day - SU.releaseDay(state, best);
  const share = WANT_SHARE * (1 - age / WANT_DAYS);
  return share > 0 ? { set: best, share } : null;
}
export const reputationBonus = s => 1 + 0.06 * s.upgrades.reputation;
export const totalStock = s => Object.values(s.stock).reduce((a, b) => a + b, 0);

// ---------- State ----------
export function newSeed() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'seed-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newState(sets, order, nowMs = Date.now()) {
  const first = order[0] || '';
  return {
    seed: newSeed(),    // market seed (docs/sdd/economy-v5.md)
    money: START_MONEY,
    stock: {},          // setId -> sealed boosters
    binder: {},         // setId -> cardId -> copies owned (opened cards land here)
    seen: {},           // setId -> cardId -> true
    showcase: [],       // [{s, c, p}] tagged cards for sale
    staff: [],
    upgrades: { storage: 0, showcase: 0, marketing: 0, reputation: 0, staffRoom: 0, fame: 0 },
    rules: {
      buySet: first,
      openSet: first,
      stockTarget: 10,
      cashReserve: 20,
      bulkBelow: 0.25,
      keepCopies: 1,    // the pricing employee leaves this many copies of each card
      priceLevel: 0,    // the pricing employee's offset from market (PRICE_LEVELS)
    },
    setupDone: false,
    day: 0,
    firstDay: null,
    customerTimer: 3,
    unlocked: { priceList: false, binder: false, showcase: false, upgrades: false, staff: false, market: false, storage: false, finances: false },
    tutorial: { rev: 0, done: [], skipped: false, base: {} },
    flags: { visited: {} },
    stats: {
      earned: 0, spent: 0, boostersBought: 0, boostersOpened: 0, cardsPriced: 0, cardsListed: 0,
      cardsSold: 0, bulkSold: 0, customers: 0, missedCustomers: 0, levelsGained: 0, playTime: 0,
      boostersSold: 0, boostersBoughtMarket: 0,
      sealedSold: 0, boxesBought: 0, boxesOpened: 0, accessoriesBought: 0, salariesPaid: 0,
    },
    goods: {},          // 'x:<set>' boxes, 'a:<id>' accessories -> count
    shelf: [],          // [{g, p, n}] sealed goods for sale (Storage tab)
    ledger: [],         // [{day, in: {cat: $}, out: {cat: $}}] Finances tab
    achievements: {},   // id -> market day earned
    market: {},         // setId -> booster supply (supply.js)
    inbox: [],          // game notices for the News panel: [{id, day, kind, text, detail?}]
    inboxRead: 0,       // highest inbox id the player has seen
    newsSeen: [],       // ids of patch notes (data/news.json) the player has seen
    log: [],
    nextId: 1,
    createdAt: nowMs,
    lastTick: nowMs,
  };
}

// ---------- Market access ----------
export const dayAt = (state, nowMs) => M.dayNumber(nowMs);

// Per-card memo of today's market value; cheap enough for offline catch-up.
export function marketValue(state, set, card) {
  if (card._mvDay !== state.day) {
    card._mvDay = state.day;
    card._mv = M.marketValue(set, card, state.day);
  }
  return card._mv;
}

// Distributor price: set by the supply left (supply.js).
export const supply = (state, set) => SU.supplyOf(state, set);
export const boosterPrice = (state, set) => SU.priceOf(set, supply(state, set));
// Second-hand value of a sealed booster: more scarcity-driven than the
// distributor, plus a daily swing.
export const marketBoosterValue = (state, set) => SU.marketValueOf(set, supply(state, set), state.day);
export const marketBoosterBuyPrice = (state, set) => marketBoosterValue(state, set) * SU.MARKET_BUY_RATE;
export const marketBoosterSellPrice = (state, set) => marketBoosterValue(state, set) * SU.MARKET_SELL_RATE;

// ---------- Helpers ----------
function log(state, kind, text) {
  state.log.unshift({ t: state.lastTick, kind, text });
  if (state.log.length > LOG_SIZE) state.log.length = LOG_SIZE;
}

// Every money change has a category for the Finances tab.
function earn(state, v, cat) {
  state.money += v;
  state.stats.earned += v;
  book(state, 'in', cat, v);
}

function spend(state, v, cat) {
  state.money -= v;
  state.stats.spent += v;
  book(state, 'out', cat, v);
}

function book(state, side, cat, v) {
  if (!v) return;
  const L = state.ledger;
  let e = L[L.length - 1];
  if (!e || e.day !== state.day) {
    e = { day: state.day, in: {}, out: {} };
    L.push(e);
    if (L.length > LEDGER_DAYS) L.splice(0, L.length - LEDGER_DAYS);
  }
  e[side][cat] = (e[side][cat] || 0) + v;
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

// Collections come out one every RELEASE_EVERY_DAYS market days, in
// collections.json order (Nicolas, 2026-11-27). Before its release a collection
// is hidden everywhere.
export const setUnlocked = (state, set) => SU.isReleased(state, set);
export const releasedSets = (state, sets) => Object.values(sets).filter(s => setUnlocked(state, s));
export const nextRelease = (state, sets) => Object.values(sets).find(s => !setUnlocked(state, s)) || null;

// Refresh the cached milestone bonus (called when discoveries change).
function refreshBonus(state, sets, setId) {
  state._bonus = state._bonus || {};
  state._bonus[setId] = milestoneBonus(state, sets[setId]);
}

// ---------- Notices (News panel) ----------
// A game notice: a short title and an optional one-line detail.
export function notify(state, kind, text, detail) {
  const n = { id: state.nextId++, day: state.day, kind, text };
  if (detail) n.detail = detail;
  state.inbox.unshift(n);
  if (state.inbox.length > INBOX_SIZE) state.inbox.length = INBOX_SIZE;
}
export const unreadNotices = state => state.inbox.filter(n => n.id > state.inboxRead).length;
export function markNoticesRead(state) {
  state.inboxRead = state.inbox.reduce((a, n) => Math.max(a, n.id), state.inboxRead);
}

function saleMultiplier(state, setId) {
  return reputationBonus(state) * (1 + (state._bonus?.[setId] || 0));
}

// ---------- Actions: buy ----------
export const soldOut = (state, set) => supply(state, set).left < 1;

export function canBuyBooster(state, set, reserve = 0) {
  return setUnlocked(state, set) && !soldOut(state, set) && totalStock(state) < stockCapacity(state)
    && state.money - boosterPrice(state, set) >= reserve - 1e-9;
}

export function buyBooster(state, set, reserve = 0) {
  if (!canBuyBooster(state, set, reserve)) return false;
  spend(state, boosterPrice(state, set), 'boosters');
  supply(state, set).left--;
  state.stock[set.id] = (state.stock[set.id] || 0) + 1;
  state.stats.boostersBought++;
  return true;
}

// Market (sealed): buy from what rival shops hold at 110% of market value,
// even when the distributor is sold out; sell at 90%. Sold boosters go to the
// rivals' stock, not back to the distributor, so buy-and-flip cannot loop
// forever: each distributor buy uses up supply and raises its price.
export function canBuyMarketBooster(state, set) {
  return setUnlocked(state, set) && supply(state, set).held >= 1 && totalStock(state) < stockCapacity(state)
    && state.money >= marketBoosterBuyPrice(state, set) - 1e-9;
}

export function buyMarketBooster(state, set) {
  if (!canBuyMarketBooster(state, set)) return false;
  spend(state, marketBoosterBuyPrice(state, set), 'market');
  supply(state, set).held--;
  state.stock[set.id] = (state.stock[set.id] || 0) + 1;
  state.stats.boostersBoughtMarket++;
  return true;
}

export function sellMarketBooster(state, set) {
  if (!(state.stock[set.id] > 0) || !setUnlocked(state, set)) return false;
  earn(state, marketBoosterSellPrice(state, set), 'market');
  supply(state, set).held++;
  state.stock[set.id]--;
  state.stats.boostersSold++;
  return true;
}

// n boosters through one of the functions above; returns how many went through.
export function repeat(fn, state, set, n) {
  let k = 0;
  while (k < n && fn(state, set)) k++;
  return k;
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

export function buyChance(tag, mv, lenience = 0) {
  const r = (mv > 0 ? tag / mv : Infinity) - lenience;
  const C = BUY_CURVE;
  if (r <= C[0][0]) return 1;
  for (let i = 1; i < C.length; i++) {
    if (r <= C[i][0] + 1e-9) {
      const [x0, y0] = C[i - 1], [x1, y1] = C[i];
      return y0 + (y1 - y0) * Math.min(1, (r - x0) / (x1 - x0));
    }
  }
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
// of each card, at market x (1 + level). Every card can be listed by hand,
// cheap ones included; only the staff pricer sends cheap copies to bulk.
export function priceSpares(state, sets, n, level = 0, keep = 0) {
  let left = Math.min(n, freeSlots(state)), k = 0;
  for (const sp of spares(state, sets, keep)) {
    if (left <= 0) break;
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
  earn(state, total, 'bulk');
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
      earn(state, sp.mv * BULK_RATE, 'bulk');
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
  spend(state, cost, 'market');
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
  spend(state, cost, 'upgrades');
  state.upgrades[key]++;
  return true;
}

// ---------- Staff ----------
export function canHire(state) {
  return state.staff.length < maxStaff(state) && state.money >= hireCost(state.staff.length);
}

export function hire(state) {
  if (!canHire(state)) return null;
  spend(state, hireCost(state.staff.length), 'hires');
  const used = new Set(state.staff.map(e => e.name));
  const free = NAMES.filter(n => !used.has(n));
  const name = free.length ? free[Math.floor(rng() * free.length)] : `Clerk ${state.nextId}`;
  const skills = {};
  for (const k of SKILL_KEYS) skills[k] = { lvl: 1 + Math.floor(rng() * 2), xp: 0 };
  const emp = { id: state.nextId++, name, skills, task: null, progress: 0, training: null, status: 'idle', hiredDay: state.day };
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
  spend(state, trainCost(lvl), 'training');
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
      if (soldOut(state, set)) { emp.status = 'sold out'; return false; }
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

export function salaryPerDay(state, emp) {
  let lv = 0;
  for (const k of SKILL_KEYS) lv += emp.skills[k].lvl;
  const days = emp.hiredDay == null ? 0 : Math.max(0, state.day - emp.hiredDay);
  return SALARY_PER_LEVEL * lv * (1 + Math.min(TENURE_MAX, TENURE_BONUS * days));
}
export const payroll = state => state.staff.reduce((a, e) => a + salaryPerDay(state, e), 0);

function tickEmployee(state, sets, emp, dt) {
  if (emp.hiredDay == null) emp.hiredDay = state.day;
  const due = salaryPerDay(state, emp) * dt / DAY_SECONDS;
  if (state.money < due) { emp.status = 'unpaid'; return; }
  spend(state, due, 'salaries');
  state.stats.salariesPaid += due;
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
export function feeling(tag, mv) {
  const r = tag / mv;
  for (const f of FEELINGS) if (r <= f.upTo) return f.key;
  return FEELINGS[FEELINGS.length - 1].key;
}

// Recent customer looks, newest last: { s, c, p, f (feeling), b (bought), day }.
// A runtime cache (never saved); offline catch-up refills it like live play.
function remember(state, it, f, bought) {
  const fb = (state._feedback ||= []);
  fb.push({ s: it.s, c: it.c, p: it.p, f, b: bought, day: state.day });
  if (fb.length > FEEDBACK_SIZE) fb.splice(0, fb.length - FEEDBACK_SIZE);
  state._feedbackVer = (state._feedbackVer || 0) + 1;
}

// A customer who wanted the newest collection and found none of it.
function rememberMiss(state, setId) {
  const fb = (state._feedback ||= []);
  fb.push({ s: setId, miss: true, day: state.day });
  if (fb.length > FEEDBACK_SIZE) fb.splice(0, fb.length - FEEDBACK_SIZE);
  state._feedbackVer = (state._feedbackVer || 0) + 1;
  state.stats.missedCustomers = (state.stats.missedCustomers || 0) + 1;
}

// Counts per feeling over the kept looks, and per showcase card.
export function feedbackSummary(state) {
  const total = { looks: 0, bought: 0 };
  for (const f of FEELINGS) total[f.key] = 0;
  const byCard = {};
  total.missed = 0;
  for (const e of state._feedback || []) {
    if (e.miss) { total.missed++; continue; }
    total.looks++; total[e.f]++;
    if (e.b) total.bought++;
    const k = `${e.s}:${e.c}`;
    const g = (byCard[k] ||= { looks: 0, bought: 0 });
    g.looks++;
    if (e.b) g.bought++;
  }
  return { total, byCard };
}

let saleListener = null;
export function onSale(fn) { saleListener = fn; }
// The shop floor scene listens to visits (live play only, never offline).
let customerListener = null;
export function onCustomer(fn) { customerListener = fn; }
const tellScene = ev => { if (customerListener && !quiet) customerListener(ev); };
let quiet = false; // true during offline catch-up: no sounds or floating text

// A customer arrives with a budget and looks at up to CUSTOMER_LOOKS cards
// they can afford (pricier cards draw more attention: weight = sqrt of market
// price). Each look buys with the chance from BUY_CURVE.
function customerVisit(state, sets) {
  state.stats.customers++;
  if (state.shelf.length && rng() < SEALED_SHARE) { sealedVisit(state, sets); return; }
  if (!state.showcase.length) { tellScene({ looks: [], empty: true }); return; }
  // Some customers come for the newest collection only.
  const want = wantedSet(state, sets);
  const only = want && rng() < want.share ? want.set.id : null;
  if (only && !state.showcase.some(it => it.s === only)) {
    rememberMiss(state, only);
    tellScene({ looks: [], miss: only });
    return;
  }
  const looks = [];
  let budget = customerBudget(state);
  const weigh = lookWeight(budget, state);
  const lenience = isRich(budget, state) ? RICH_LENIENCE : 0;
  const looked = new Set();
  for (let i = 0; i < CUSTOMER_LOOKS && state.showcase.length; i++) {
    let total = 0;
    const weights = new Array(state.showcase.length);
    for (let j = 0; j < state.showcase.length; j++) {
      const it = state.showcase[j];
      const set = sets[it.s], card = set?.byId[it.c];
      const w = card && it.p <= budget && !looked.has(it) && (!only || it.s === only) ? weigh(marketValue(state, set, card)) : 0;
      weights[j] = w;
      total += w;
    }
    if (total <= 0) break;
    let r = rng() * total, pick = 0;
    while (pick < weights.length - 1 && (r -= weights[pick]) > 0) pick++;
    const it = state.showcase[pick];
    looked.add(it);
    const set = sets[it.s], card = set.byId[it.c];
    const mv = marketValue(state, set, card);
    const bought = rng() < buyChance(it.p, mv, lenience);
    const f = feeling(it.p, mv);
    remember(state, it, f, bought);
    const look = { s: it.s, c: it.c, p: it.p, f, b: bought, paid: 0 };
    looks.push(look);
    if (!bought) continue;
    state.showcase.splice(pick, 1);
    budget -= it.p;
    const paid = it.p * saleMultiplier(state, it.s);
    look.paid = paid;
    earn(state, paid, 'cards');
    state.stats.cardsSold++;
    if (saleListener && !quiet) saleListener(paid);
  }
  tellScene({ looks });
}

// A customer for sealed goods and accessories: looks at up to SEALED_LOOKS
// shelf goods they can afford (weight = sqrt of value) and buys with the same
// price bands as cards.
function sealedVisit(state, sets) {
  const looks = [];
  let budget = customerBudget(state);
  const weigh = lookWeight(budget, state);
  const lenience = isRich(budget, state) ? RICH_LENIENCE : 0;
  const looked = new Set();
  for (let i = 0; i < SEALED_LOOKS && state.shelf.length; i++) {
    let total = 0;
    const weights = state.shelf.map(it => {
      const w = it.p <= budget && !looked.has(it) ? weigh(Math.max(0.01, goodValue(state, sets, it.g))) : 0;
      total += w;
      return w;
    });
    if (total <= 0) break;
    let r = rng() * total, pick = 0;
    while (pick < weights.length - 1 && (r -= weights[pick]) > 0) pick++;
    const it = state.shelf[pick];
    looked.add(it);
    const mv = goodValue(state, sets, it.g);
    const bought = rng() < buyChance(it.p, mv, lenience);
    const look = { g: it.g, p: it.p, f: feeling(it.p, mv), b: bought, paid: 0 };
    looks.push(look);
    if (!bought) continue;
    if (--it.n <= 0) state.shelf.splice(pick, 1);
    budget -= it.p;
    const paid = it.p * reputationBonus(state);
    look.paid = paid;
    earn(state, paid, 'sealed');
    state.stats.sealedSold++;
    if (saleListener && !quiet) saleListener(paid);
  }
  tellScene({ looks });
}

// ---------- Sealed goods (Storage tab) ----------
// Goods ids: 'b:<set>' sealed booster (state.stock), 'x:<set>' box,
// 'a:<accessory id>' accessory (state.goods).
let ACCESSORIES = {};
export function setAccessories(list) {
  ACCESSORIES = {};
  for (const a of list || []) {
    if (a && typeof a.id === 'string' && a.name && a.cost > 0 && a.value > 0) ACCESSORIES[a.id] = a;
  }
}
export const accessories = () => Object.values(ACCESSORIES);

export function goodInfo(sets, g) {
  const kind = g.slice(0, 1), id = g.slice(2);
  if (kind === 'a') return ACCESSORIES[id] ? { kind, acc: ACCESSORIES[id], name: ACCESSORIES[id].name } : null;
  const set = sets[id];
  if (!set || (kind !== 'b' && kind !== 'x')) return null;
  return { kind, set, name: `${set.name} ${kind === 'b' ? 'booster' : 'booster box'}` };
}

export function goodValue(state, sets, g) {
  const info = goodInfo(sets, g);
  if (!info) return 0;
  if (info.kind === 'a') return info.acc.value * (1 + ACC_SWING * (M.hashRand('acc', info.acc.id, state.day) * 2 - 1));
  const v = marketBoosterValue(state, info.set);
  return info.kind === 'x' ? v * BOX_SIZE : v;
}

export function goodsOwned(state, g) {
  return g.startsWith('b:') ? (state.stock[g.slice(2)] || 0) : (state.goods[g] || 0);
}
function takeGoods(state, g, n) {
  const k = Math.max(0, Math.min(goodsOwned(state, g), Math.floor(n)));
  if (!k) return 0;
  if (g.startsWith('b:')) state.stock[g.slice(2)] -= k;
  else { state.goods[g] -= k; if (!state.goods[g]) delete state.goods[g]; }
  return k;
}
function addGoods(state, g, n) {
  if (g.startsWith('b:')) state.stock[g.slice(2)] = (state.stock[g.slice(2)] || 0) + n;
  else state.goods[g] = (state.goods[g] || 0) + n;
}

export const shelfCapacity = s => SHELF_BASE + SHELF_PER_LEVEL * s.upgrades.showcase;
export const shelfCount = s => s.shelf.reduce((a, it) => a + it.n, 0);
export const shelfFree = s => Math.max(0, shelfCapacity(s) - shelfCount(s));

// Puts up to n of a good on the shelf at `price` each. Returns how many.
export function listGood(state, sets, g, n, price) {
  if (!(price > 0) || !goodInfo(sets, g)) return 0;
  const k = takeGoods(state, g, Math.min(n, shelfFree(state)));
  if (!k) return 0;
  const p = Math.round(price * 100) / 100;
  const it = state.shelf.find(x => x.g === g && x.p === p);
  if (it) it.n += k; else state.shelf.push({ g, p, n: k });
  return k;
}

export function recallShelfItem(state, i) {
  const it = state.shelf[i];
  if (!it) return 0;
  addGoods(state, it.g, it.n);
  state.shelf.splice(i, 1);
  return it.n;
}

export function recallShelf(state) {
  let n = 0;
  for (const it of state.shelf) { addGoods(state, it.g, it.n); n += it.n; }
  state.shelf = [];
  return n;
}

export const boxPrice = (state, set) => BOX_SIZE * boosterPrice(state, set) * BOX_DISCOUNT;
export function canBuyBox(state, set) {
  return setUnlocked(state, set) && supply(state, set).left >= BOX_SIZE && state.money >= boxPrice(state, set) - 1e-9;
}
export function buyBox(state, set) {
  if (!canBuyBox(state, set)) return false;
  spend(state, boxPrice(state, set), 'goods');
  supply(state, set).left -= BOX_SIZE;
  addGoods(state, `x:${set.id}`, 1);
  state.stats.boxesBought++;
  return true;
}
export function canOpenBox(state, set) {
  return goodsOwned(state, `x:${set.id}`) > 0 && stockCapacity(state) - totalStock(state) >= BOX_SIZE;
}
export function openBox(state, set) {
  if (!canOpenBox(state, set)) return false;
  takeGoods(state, `x:${set.id}`, 1);
  addGoods(state, `b:${set.id}`, BOX_SIZE);
  state.stats.boxesOpened++;
  return true;
}
export function buyAccessory(state, id, n = 1) {
  const a = ACCESSORIES[id];
  if (!a) return 0;
  let k = 0;
  while (k < n && state.money >= a.cost - 1e-9) {
    spend(state, a.cost, 'goods');
    addGoods(state, `a:${id}`, 1);
    k++;
  }
  state.stats.accessoriesBought += k;
  return k;
}

// ---------- Achievements ----------
// achievements.js registers its check; it runs every few simulated seconds.
let achievementCheck = null;
export function setAchievementCheck(fn) { achievementCheck = fn; }
let achievementListener = null;
export function onAchievement(fn) { achievementListener = fn; }
export function earnAchievement(state, id, name, silent) {
  if (state.achievements[id] != null) return false;
  state.achievements[id] = state.day;
  if (!silent) {
    notify(state, 'achievement', `Achievement: ${name}`, 'See all of them in Awards.');
    if (achievementListener && !quiet) achievementListener(name);
  }
  return true;
}

// ---------- Progressive reveal (GDD section 11) ----------
function checkUnlocks(state, sets) {
  const u = state.unlocked;
  if (!u.priceList && state.stats.boostersOpened > 0) { u.priceList = true; u.binder = true; }
  if (!u.showcase && state.stats.cardsSold > 0) u.showcase = true;
  if (!u.finances && u.showcase) u.finances = true;
  if (!u.storage && u.market) u.storage = true;
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
    if (!first) log(state, 'day', `New market day: ${M.dayLabel(day, state.firstDay)}`);
    advanceSupply(state, sets);
  }
  state.customerTimer -= dt;
  let guard = 0;
  while (state.customerTimer <= 0 && guard++ < 1000) {
    customerVisit(state, sets);
    state.customerTimer += customerInterval(state) * (0.5 + rng());
  }
  for (const emp of state.staff) tickEmployee(state, sets, emp, dt);
  checkUnlocks(state, sets);
  state._achT = (state._achT || 0) + dt;
  if (state._achT >= 5 && achievementCheck) { state._achT = 0; achievementCheck(state, sets, false); }
}

// Runs every market day since the last one for each released collection, and
// announces new releases. Same result live or offline: the dice depend only on
// (collection, days since release) and the supply the player left.
function advanceSupply(state, sets) {
  for (const set of Object.values(sets)) {
    if (!setUnlocked(state, set)) continue;
    const m = supply(state, set);
    if (!m.out) {
      m.out = true;
      if (set.releaseIndex > 0) {
        log(state, 'release', `${set.name} is out`);
        notify(state, 'release', `${set.name} is out`, 'Boosters are at the distributor. Some customers will ask for it.');
      }
    }
    const age = state.day - SU.releaseDay(state, set);
    // Day the next collection comes out: until then this one is the newest.
    let next = Infinity;
    for (const o of Object.values(sets)) if (o.releaseIndex > set.releaseIndex) next = Math.min(next, SU.releaseDay(state, o));
    // Big rival buys and reprints of the days stepped now become one notice
    // each per collection (Nicolas, 2026-11-28: the News was flooded).
    const left0 = m.left;
    let bought = 0, reprinted = 0;
    const names = new Set();
    while (m.age < age) {
      const latest = SU.releaseDay(state, set) + m.age + 1 < next;
      for (const n of SU.stepDay(set, m, latest)) {
        if (n.kind === 'rival') { bought += n.n; names.add(RIVAL_NAMES[n.rival] || 'A rival shop'); }
        else if (n.kind === 'reprint') reprinted += n.n;
      }
    }
    if (bought && bought >= RIVAL_NOTICE * left0) {
      const list = [...names];
      const who = list.length > 2 ? `${list.slice(0, 2).join(', ')} and ${list.length - 2} more` : list.join(' and ');
      notify(state, 'rival', `${set.name}: rival shops stock up`,
        `${who} bought ${fmtCount(bought)} boosters. Distributor supply ${pctChange(-bought, left0)}. Booster prices may rise.`);
    }
    if (reprinted) {
      log(state, 'reprint', `${set.name}: reprint hits the market`);
      notify(state, 'reprint', `${set.name}: reprint hits the market`,
        `${fmtCount(reprinted)} new boosters. Distributor supply ${pctChange(reprinted, Math.max(1, m.left - reprinted))}. Booster prices may drop.`);
    }
  }
  refreshOpen(state, sets);
}

// Rival buys make a notice only when they take at least this share of the
// distributor's supply.
const RIVAL_NOTICE = 0.03;

// Supply change for notices: +45% / −12%.
const pctChange = (d, base) => {
  const p = base > 0 ? Math.round((d / base) * 100) : 100;
  return `${p >= 0 ? '+' : '−'}${Math.abs(p)}%`;
};

// Short count for notices: 12,400 -> 12.4K.
function fmtCount(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(n);
}

// state._open: collections after the first that are out (tutorial "nextset").
function refreshOpen(state, sets) {
  state._open = {};
  for (const set of Object.values(sets)) if (set.releaseIndex > 0) state._open[set.id] = setUnlocked(state, set);
}

// Recomputes derived caches after load.
export function prepare(state, sets) {
  M.setSeed(state.seed);
  for (const set of Object.values(sets)) for (const c of set.cards) c._mvDay = null;
  state._bonus = {};
  for (const id of Object.keys(sets)) refreshBonus(state, sets, id);
  refreshOpen(state, sets);
  // Achievements the save already qualifies for, without announcing them.
  if (achievementCheck) achievementCheck(state, sets, true);
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
