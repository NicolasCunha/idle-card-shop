// Debug menu (Settings). Unlocked on this device by a code; only its SHA-256
// is in the repo. Every helper here edits existing state fields, so the save
// format does not change.

import * as G from './game.js';
import * as SU from './supply.js';
import { DAY_MS } from './market.js';

const CODE_HASH = '1716c7abecf5b08f3d09ecdd986da3a5e2b3a7534f3b5e9b7b0eddbcec9d6a0c';

// Case and spaces do not matter ("Cunha 2026" works too).
export async function checkCode(code) {
  const text = String(code || '').toLowerCase().replace(/\s+/g, '');
  if (!text || !globalThis.crypto?.subtle) return false;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === CODE_HASH;
}

export function setMoney(state, v) {
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) state.money = Math.round(n * 100) / 100;
}

// Sealed boosters straight into storage, past the storage cap.
export function addBoosters(state, set, n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  state.stock[set.id] = (state.stock[set.id] || 0) + n;
}

// Opens n free boosters into the binder.
export function addCards(state, sets, set, n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  addBoosters(state, set, n);
  return G.openBoosters(state, sets, set, n);
}

export function setUpgrade(state, key, lvl) {
  const max = G.UPGRADES[key]?.max;
  if (max == null) return;
  state.upgrades[key] = Math.max(0, Math.min(max, Math.floor(lvl)));
}

export function hireFree(state) {
  if (state.staff.length > G.UPGRADES.staffRoom.max) return null;
  state.upgrades.staffRoom = Math.max(state.upgrades.staffRoom, state.staff.length);
  const money = state.money, spent = state.stats.spent;
  const cost = G.hireCost(state.staff.length);
  state.money = Infinity;
  const emp = G.hire(state);
  state.money = money;
  state.stats.spent = spent;
  const e = state.ledger[state.ledger.length - 1];
  if (e?.out.hires) { e.out.hires -= cost; if (e.out.hires < 1e-9) delete e.out.hires; }
  return emp;
}

export function maxSkills(state) {
  for (const e of state.staff) for (const k of G.SKILL_KEYS) e.skills[k] = { lvl: G.MAX_SKILL, xp: 0 };
}

export function unlockAll(state) {
  for (const k of Object.keys(state.unlocked)) state.unlocked[k] = true;
}

// Milliseconds from `nowMs` to the start of the next collection's release day.
export function msToNextSet(state, sets, nowMs) {
  const next = G.nextRelease(state, sets);
  if (!next) return 0;
  return Math.max(0, SU.releaseDay(state, next) * DAY_MS - nowMs);
}

export { DAY_MS };
