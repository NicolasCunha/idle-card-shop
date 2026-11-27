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

import { hashRand } from './market.js';

// ---------- Tunables ----------
export const RELEASE_EVERY_DAYS = 7;      // a new collection every 7 market days
export const BASE_PRINT_RUN = 1000000;    // first collection's print run
export const PRINT_GROWTH = 1.25;         // each newer collection prints 25% more...
export const PRINT_CAP = 2;               // ...up to 2x the first one
export const PLAYER_MARGIN = 0.1;         // rivals stop buying at 10% of the print left
export const PRICE_EXPONENT = 0.5;        // price = base x (printed / left)^0.5
export const MIN_LEFT_FRAC = 0.02;        // price stops rising below 2% left (about 7x)
export const MARKET_BUY_RATE = 1.1;       // buy sealed on the Market at 110%
export const MARKET_SELL_RATE = 0.9;      // sell sealed to the Market at 90%
export const HISTORY_DAYS = 30;

// Rival shops: share of the first print run each one wants on a busy day.
export const RIVALS = [0.006, 0.004, 0.003, 0.0025, 0.002, 0.0015, 0.0006, 0.0004];
const RIVAL_BUY_CHANCE = 0.6;
const HYPE_DAYS = 30;                     // demand fades from 100% to 20% over a few months
const RETURN_CHANCE = 0.12;               // a rival returns some boosters
const RETURN_MAX = 0.004;                 // up to 0.4% of the print run
const REPRINT_BELOW = 0.35;               // reprints only happen below 35% left
const REPRINT_CHANCE = 0.02;              // per day, when below
const REPRINT_MIN = 0.4, REPRINT_MAX = 0.8; // size, share of the first print run
const BIG_BUY = 0.01;                     // a rival buy above 1% of the run makes news

// ---------- Calendar ----------
// set.releaseIndex is the collection's place in collections.json (data.js).
// The first one is out on the save's first market day.
export function releaseDay(state, set) {
  if (state.firstDay == null) return Infinity;
  return state.firstDay + (set.releaseIndex || 0) * RELEASE_EVERY_DAYS;
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
//   age: days since release simulated; hist: last HISTORY_DAYS daily prices.
export function supplyOf(state, set) {
  let m = state.market[set.id];
  if (!m) {
    const run = printRun(set);
    m = state.market[set.id] = { run, printed: run, left: run, held: 0, reprints: 0, age: 0, hist: [], out: false };
    m.hist.push(round2(priceOf(set, m)));
  }
  return m;
}

const round2 = v => Math.round(v * 100) / 100;

export function priceOf(set, m) {
  const frac = Math.max(MIN_LEFT_FRAC, m.left / m.printed);
  return set.booster.wholesalePrice * Math.pow(1 / frac, PRICE_EXPONENT);
}

// One market day for one collection. Returns news items [{kind, text}].
export function stepDay(set, m) {
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
    const n = Math.round(m.run * (REPRINT_MIN + (REPRINT_MAX - REPRINT_MIN) * r('repn')));
    m.printed += n; m.left += n; m.reprints++;
    news.push({ kind: 'reprint', n });
  }
  m.hist.push(round2(priceOf(set, m)));
  if (m.hist.length > HISTORY_DAYS) m.hist.splice(0, m.hist.length - HISTORY_DAYS);
  return news;
}
