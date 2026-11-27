// Deterministic daily market (GDD section 8).
//
// Price of a card on a day = base value x day multiplier. The multiplier depends
// only on (fixed seed, card, day number), so every player sees the same market on
// the same day and nothing about the market is stored in the save.
//
// Components, summed in log space (so they act as percentages):
//  1. Card noise: small (~±7%) slow waves of 9 and 23 days.
//  2. Collection trend: the whole collection warms or cools (~±8%), 35-day waves.
//  3. Interest events: a card gains or loses interest. Gradual rise, optional
//     plateau, gradual fall, then a residual that also fades. Reprints share the
//     original's events at REPRINT_HYPE_FACTOR strength.
// Every curve is a smoothstep whose length grows with the size of the move, so no
// day-to-day jump exceeds ~6% (see tests).
//
// ASSUMPTION [GDD Q3]: one global seed for everyone (GDD proposal).

const SEED = 'idlecardshop-market-v1';
const EVENT_WINDOW = 40;
const EVENT_CHANCE = 0.22;
const EVENT_LOOKBACK = 10;
export const REPRINT_HYPE_FACTOR = 0.6;
const LOG_CAP = 1.1;

const NEWS_UP = [
  'appeared on a TV show',
  'went viral online',
  'was played by a tournament champion',
  'a famous streamer opened one',
  'collectors are chasing the full set',
  'showed up in a movie',
];
const NEWS_DOWN = [
  'a large lot hit the market',
  'collector interest cooled',
  'fakes are flooding the market',
];

function hash(str) {
  // cyrb53
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
const rand = (...parts) => hash(SEED + '|' + parts.join('|')) / 9007199254740992;
// Same global seed, for other deterministic systems (booster supply).
export const hashRand = rand;
const smoothstep = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function smoothNoise(key, day, period, amp) {
  const i = Math.floor(day / period), t = day / period - i;
  const a = rand(key, period, i) * 2 - 1, b = rand(key, period, i + 1) * 2 - 1;
  return amp * (a + (b - a) * smoothstep(t));
}

// ---------- Market day ----------
export function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export function listTimeZones() {
  try { return ['UTC', ...Intl.supportedValuesOf('timeZone').filter(z => z !== 'UTC')]; }
  catch { return ['UTC', browserTimeZone()]; }
}

// Days since 1970-01-01 on the local date in the given time zone.
const formatters = new Map();
function formatter(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, f);
  }
  return f;
}

export function dayNumber(timeZone, date = new Date()) {
  let ymd;
  try {
    ymd = formatter(timeZone).format(date);
  } catch {
    ymd = date.toISOString().slice(0, 10);
  }
  return Math.floor(Date.parse(ymd + 'T00:00:00Z') / 86400000);
}

export function dayLabel(day) {
  return new Date(day * 86400000).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

export function msUntilNextDay(timeZone, nowMs = Date.now()) {
  const today = dayNumber(timeZone, new Date(nowMs));
  let lo = 0, hi = 26 * 3600000;
  while (hi - lo > 1000) {
    const mid = (lo + hi) / 2;
    if (dayNumber(timeZone, new Date(nowMs + mid)) > today) hi = mid; else lo = mid;
  }
  return hi;
}

// ---------- Events ----------
function eventForWindow(key, w) {
  if (rand(key, 'ev', w) >= EVENT_CHANCE) return null;
  const up = rand(key, 'up', w) < 0.7;
  const r = rand(key, 'mag', w);
  const mag = up ? 0.15 + r * r * 0.85 : -(0.1 + r * 0.3); // +15%..+100% or -10%..-40%
  const lm = Math.log(1 + mag);
  const rise = Math.round(Math.max(7, Math.abs(lm) * 45) + rand(key, 'rise', w) * 10);
  const plateau = Math.floor(rand(key, 'plat', w) * 25);
  const fall = Math.round(Math.max(10, Math.abs(lm) * 55) + rand(key, 'fall', w) * 30);
  const residual = rand(key, 'res', w) * 0.5;
  const residualDecay = 60 + Math.floor(rand(key, 'rdec', w) * 120);
  const start = w * EVENT_WINDOW + Math.floor(rand(key, 'start', w) * EVENT_WINDOW);
  const pool = up ? NEWS_UP : NEWS_DOWN;
  const news = pool[Math.floor(rand(key, 'news', w) * pool.length)];
  return { start, lm, mag, rise, plateau, fall, residual, residualDecay, news };
}

function eventShape(ev, day) {
  const x = day - ev.start;
  if (x < 0) return 0;
  if (x < ev.rise) return smoothstep(x / ev.rise);
  const afterPlat = ev.rise + ev.plateau;
  if (x < afterPlat) return 1;
  if (x < afterPlat + ev.fall) return 1 - (1 - ev.residual) * smoothstep((x - afterPlat) / ev.fall);
  return ev.residual * (1 - smoothstep((x - afterPlat - ev.fall) / ev.residualDecay));
}

function eventsAround(key, day) {
  const w0 = Math.floor(day / EVENT_WINDOW);
  const out = [];
  for (let w = w0 - EVENT_LOOKBACK; w <= w0; w++) {
    const ev = eventForWindow(key, w);
    if (ev) out.push(ev);
  }
  return out;
}

// ---------- API ----------
const groupKey = (set, card) => card.reprintOf || `${set.id}:${card.id}`;

export function cardLogMultiplier(set, card, day) {
  const own = `${set.id}:${card.id}`;
  let lm = smoothNoise(own, day, 9, 0.025) + smoothNoise(own, day, 23, 0.05);
  lm += smoothNoise('set:' + set.id, day, 35, 0.08);
  const hype = card.reprintOf ? REPRINT_HYPE_FACTOR : 1;
  for (const ev of eventsAround(groupKey(set, card), day)) lm += ev.lm * eventShape(ev, day) * hype;
  // Soft cap: overlapping events stay within ~3x and ~1/3 of base value.
  return LOG_CAP * Math.tanh(lm / LOG_CAP);
}

const cache = new Map();
export function cardMultiplier(set, card, day) {
  const k = `${day}|${set.id}|${card.id}`;
  let v = cache.get(k);
  if (v === undefined) {
    if (cache.size > 50000) cache.clear();
    v = Math.exp(cardLogMultiplier(set, card, day));
    cache.set(k, v);
  }
  return v;
}

export const marketValue = (set, card, day) => card.value * cardMultiplier(set, card, day);

export function history(set, card, day, days = 30) {
  const out = [];
  for (let d = day - days + 1; d <= day; d++) out.push(marketValue(set, card, d));
  return out;
}

// News: events for this card that started in the last `recent` days.
export function newsFor(set, card, day, recent = 3) {
  const items = [];
  for (const ev of eventsAround(groupKey(set, card), day)) {
    const x = day - ev.start;
    if (x >= 0 && x < recent) items.push({ set, card, day: ev.start, kind: ev.mag > 0 ? 'up' : 'down', text: ev.news });
  }
  return items;
}
