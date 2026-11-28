// Booster supply and release calendar (SDD docs/sdd/booster-supply.md).
//
// Each collection has a finite print run. Rival shops buy from it every day,
// sometimes return boosters, and the publisher sometimes reprints. The booster
// price rises as the supply left drops and falls after a reprint.
//
// The world's daily dice come from a hash of (seed, collection, days since
// release), so two players with the same choices see the same world. What the
// player buys and sells changes the supply, so the supply lives in the save
// (state.market). No DOM here: the same code runs live and offline.

import { hashRand, smoothNoise } from './market.js';

// ---------- Tunables ----------
export const RELEASE_EVERY_DAYS = 12;     // a new collection every 12 market days (2 hours)
export const BASE_PRINT_RUN = 1000000;    // first collection's print run
export const PRINT_GROWTH = 1.25;         // each newer collection prints 25% more...
export const PRINT_CAP = 2;               // ...up to 2x the first one
export const PLAYER_MARGIN = 0.1;         // rivals stop buying at 10% of the print left
// Distributor and second-hand market both follow scarcity, the market much
// more, plus a daily swing (Nicolas, 2026-11-27).
export const DISTRIBUTOR_EXPONENT = 0.25; // distributor = base x (printed / left)^0.25
export const MARKET_EXPONENT = 0.5;       // market value = base x (printed / left)^0.5 x swing
export const MARKET_SWING = 0.06;         // ~±6% waves of 5 and 13 days, ~±12% together
export const MIN_LEFT_FRAC = 0.02;        // prices stop rising below 2% left (about 2.7x / 7x)
export const MARKET_BUY_RATE = 1.1;       // buy sealed on the Market at 110% of market value
export const MARKET_SELL_RATE = 0.9;      // sell sealed to the Market at 90% of market value
export const HISTORY_DAYS = 30;

// Rival shops: share of the first print run each one wants on a busy day.
// 20 rivals, big chains to corner stores (Nicolas, 2026-11-27: many shops
// compete for supply; scarcity should swing).
export const RIVALS = [0.006, 0.005, 0.0045, 0.004, 0.0035, 0.003, 0.003, 0.0025, 0.0025, 0.002,
  0.002, 0.0018, 0.0015, 0.0015, 0.0012, 0.001, 0.001, 0.0008, 0.0006, 0.0005];
const RIVAL_BUY_CHANCE = 0.6;
const HYPE_DAYS = 66;                     // demand fades from 100% to 20%
const RETURN_CHANCE = 0.12;               // a rival returns some boosters
const RETURN_MAX = 0.008;                 // up to 0.8% of the print run
const REPRINT_BELOW = 0.35;               // reprints only happen below 35% left
const REPRINT_CHANCE = 0.03;              // per day, when below
// Size, share of the first print run (Nicolas, 2026-11-28: 20% smaller than
// the first 0.4-0.8). Once a newer collection is out, a reprint is never bigger
// than the one before: nobody keeps reprinting an old set at full size.
const REPRINT_MIN = 0.32, REPRINT_MAX = 0.64;
const BIG_BUY = 0.006;                    // a rival buy above 0.6% of the run makes news

// ---------- Calendar ----------
// set.releaseIndex is the collection's place in collections.json (data.js).
// The first one is out on the save's first market day.
// state._releaseAll (debug "Release all sets", a device preference, never
// saved): every collection not out by that day comes out on it.
export function releaseDay(state, set) {
  if (state.firstDay == null) return Infinity;
  const day = state.firstDay + (set.releaseIndex || 0) * RELEASE_EVERY_DAYS;
  return state._releaseAll != null ? Math.min(day, Math.max(state.firstDay, state._releaseAll)) : day;
}
export const isReleased = (state, set) => !!state.day && state.day >= releaseDay(state, set);

export function printRun(set) {
  const i = set.releaseIndex || 0;
  return Math.round(BASE_PRINT_RUN * Math.min(PRINT_CAP, Math.pow(PRINT_GROWTH, i)));
}

// ---------- Supply state ----------
// state.market[setId] = { run, printed, left, held, reprints, age, hist, out }
//   out: the release was announced;
//   run: first print run; printed: run + reprints; left: at the distributor;
//   held: boosters rival shops hold (the Market sells from these);
//   age: days since release simulated; hist: last HISTORY_DAYS daily scarcity
//   values (printed / left).
export function supplyOf(state, set) {
  let m = state.market[set.id];
  if (!m) {
    const run = printRun(set);
    m = state.market[set.id] = { run, printed: run, left: run, held: 0, reprints: 0, age: 0, hist: [], out: false };
    m.hist.push(scarcity(m));
  }
  return m;
}

// printed / left, capped. hist keeps one value per day (close).
const scarcity = m => Math.round(1 / Math.max(MIN_LEFT_FRAC, m.left / m.printed) * 10000) / 10000;

export function priceOf(set, m) {
  return set.booster.wholesalePrice * Math.pow(scarcity(m), DISTRIBUTOR_EXPONENT);
}

const swing = (set, day) => Math.exp(smoothNoise('booster:' + set.id, day, 5, MARKET_SWING) + smoothNoise('booster:' + set.id, day, 13, MARKET_SWING));
const marketAt = (set, s, day) => set.booster.wholesalePrice * Math.pow(s, MARKET_EXPONENT) * swing(set, day);

// Second-hand value of a sealed booster today.
export const marketValueOf = (set, m, day) => marketAt(set, scarcity(m), day);

// Market value `back` days ago, from the daily history.
export function marketValueAgo(set, m, day, back) {
  const h = m.hist;
  if (!h.length) return marketValueOf(set, m, day);
  const i = Math.max(0, h.length - 1 - back);
  return marketAt(set, h[i], day - (h.length - 1 - i));
}

// One market day for one collection. Returns news items [{kind, text}].
// Reprint size for the k-th reprint (0-based), a share of the first run.
// Fixed per (seed, collection, k), so later reprints can be compared to it.
const reprintSize = (set, k) => REPRINT_MIN + (REPRINT_MAX - REPRINT_MIN) * hashRand('supply', set.id, 'reprint', k);

export function stepDay(set, m, latest = true) {
  const age = ++m.age;
  const r = (...k) => hashRand('supply', set.id, age, ...k);
  const news = [];
  const hype = 0.2 + 0.8 * Math.exp(-age / HYPE_DAYS);
  // Returns first, so a rival can only return what it bought before.
  if (m.held > 0 && r('ret') < RETURN_CHANCE) {
    const n = Math.min(m.held, Math.round(m.run * RETURN_MAX * r('retn')));
    m.held -= n; m.left += n;
  }
  const floor = m.printed * PLAYER_MARGIN;
  for (let i = 0; i < RIVALS.length; i++) {
    if (r('buy', i) >= RIVAL_BUY_CHANCE) continue;
    const want = Math.round(m.run * RIVALS[i] * hype * (0.5 + r('amt', i)));
    const n = Math.max(0, Math.min(want, Math.floor(m.left - floor)));
    if (!n) continue;
    m.left -= n; m.held += n;
    if (n >= m.run * BIG_BUY) news.push({ kind: 'rival', rival: i, n });
  }
  if (m.left / m.printed < REPRINT_BELOW && r('rep') < REPRINT_CHANCE) {
    let f = reprintSize(set, m.reprints);
    if (!latest) {
      for (let k = 0; k < m.reprints; k++) f = Math.min(f, reprintSize(set, k));
      // Saves from before 1.7.1 drew reprint sizes differently: never above their average.
      if (m.reprints) f = Math.min(f, (m.printed - m.run) / m.reprints / m.run);
    }
    const n = Math.round(m.run * f);
    m.printed += n; m.left += n; m.reprints++;
    news.push({ kind: 'reprint', n });
  }
  m.hist.push(scarcity(m));
  if (m.hist.length > HISTORY_DAYS) m.hist.splice(0, m.hist.length - HISTORY_DAYS);
  return news;
}
