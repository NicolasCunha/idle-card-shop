// Versioned saves (GDD section 9, .claude/rules/save-schema.md).
//
// File format: { game, saveVersion, gameVersion, exportedAt, state }
// - Each schema change adds one migration vN -> vN+1 to MIGRATIONS. Never edit a
//   shipped migration. Ask Nicolas before any schema change.
// - After migrations, state is merged with defaults: missing fields get the
//   default, unknown fields are dropped. Unknown cards and collections are skipped.

import { newState, SKILL_KEYS, goodInfo } from './game.js';
import { LEGACY_SEED } from './market.js';

export const GAME_ID = 'idlecardshop';
export const SAVE_VERSION = 5;
export const GAME_VERSION = '1.8.1';
export const SAVE_KEY = 'idlecardshop.save';
export const PREFS_KEY = 'idlecardshop.prefs';

// MIGRATIONS[n] turns a version-n state into version n+1.
export const MIGRATIONS = {
  // v2 (2026-11-27): opened cards live in the binder and pricing lists them
  // straight in the showcase. The unpriced pile and the priced queue go back to
  // the binder, and keepFirst becomes rules.keepCopies (default 1, from
  // newState), and List staff move to Price. All decided by Nicolas.
  1: state => {
    const binder = (state.binder && typeof state.binder === 'object') ? state.binder : (state.binder = {});
    for (const it of [...(state.unpriced || []), ...(state.priced || [])]) {
      if (!it || typeof it.s !== 'string' || typeof it.c !== 'string') continue;
      const cards = (binder[it.s] ||= {});
      cards[it.c] = (cards[it.c] || 0) + 1;
    }
    delete state.unpriced;
    delete state.priced;
    if (state.rules) delete state.rules.keepFirst;
    // The List task is gone: staff on it move to Price (Nicolas).
    for (const e of state.staff || []) {
      if (!e || typeof e !== 'object') continue;
      if (e.task === 'list') e.task = 'price';
      if (e.training?.skill === 'list') e.training = null;
      if (e.skills) delete e.skills.list;
    }
    return state;
  },
  // v3 (2026-11-27): booster supply, release calendar and News. Nicolas chose
  // to start every older save from zero, so the state is dropped and the
  // defaults (a new shop) take its place.
  2: () => ({}),
  // v4 (2026-11-27): Fame upgrade, new-set customers and shorter market days.
  // Nicolas chose to start every older save from zero again.
  3: () => ({}),
  // v5 (2026-11-28, docs/sdd/economy-v5.md; all choices Nicolas's): a seed per
  // save, where older saves keep the old global seed so their prices do not
  // change; staff tenure counts from the first tick after loading (hiredDay
  // null). Ledger, goods, shelf and achievements start from their defaults
  // (achievements are then filled from what the save qualifies for).
  4: state => {
    if (state && typeof state === 'object' && Object.keys(state).length) {
      state.seed = LEGACY_SEED;
      for (const e of state.staff || []) if (e && typeof e === 'object') e.hiredDay = null;
    }
    return state;
  },
};

export function serialize(state) {
  return {
    game: GAME_ID,
    saveVersion: SAVE_VERSION,
    gameVersion: GAME_VERSION,
    exportedAt: new Date().toISOString(),
    state: stripTransient(state),
  };
}

function stripTransient(state) {
  return JSON.parse(JSON.stringify(state, (k, v) => (k.startsWith('_') ? undefined : v)));
}

export function migrate(file) {
  if (!file || typeof file !== 'object' || !file.state) throw new Error('Not a save file');
  if (file.game && file.game !== GAME_ID) throw new Error('Not a save file');
  let v = Number.isInteger(file.saveVersion) ? file.saveVersion : 1;
  if (v > SAVE_VERSION) throw new Error('Save is from a newer version');
  let state = file.state;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`Missing migration v${v} -> v${v + 1}`);
    state = step(state);
    v++;
  }
  return state;
}

const isPlainObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);

// Merge saved data into defaults. An empty default object is a map (keys are
// ids), so it takes the saved object as is; a non-empty one is a record whose
// known keys are merged one by one.
export function mergeDefaults(def, saved) {
  if (saved === undefined) return def;
  if (Array.isArray(def)) return Array.isArray(saved) ? saved : def;
  if (isPlainObject(def)) {
    if (!isPlainObject(saved)) return def;
    if (Object.keys(def).length === 0) return saved;
    const out = {};
    for (const k of Object.keys(def)) out[k] = mergeDefaults(def[k], saved[k]);
    return out;
  }
  if (def === null) return saved;
  return typeof saved === typeof def ? saved : def;
}

// Drop references to cards or collections that no longer exist, without
// touching anything else.
export function sanitize(state, sets) {
  const ok = it => it && sets[it.s]?.byId[it.c];
  state.showcase = state.showcase.filter(it => ok(it) && typeof it.p === 'number');
  for (const [sid, m] of Object.entries(state.market)) {
    const okNum = k => Number.isFinite(m?.[k]) && m[k] >= 0;
    if (!sets[sid] || !['run', 'printed', 'left', 'held', 'age'].every(okNum)) delete state.market[sid];
    else if (!Array.isArray(m.hist)) m.hist = [];
  }
  state.inbox = state.inbox.filter(n => isPlainObject(n) && Number.isFinite(n.id) && typeof n.text === 'string');
  for (const n of state.inbox) if ('detail' in n && typeof n.detail !== 'string') delete n.detail;
  if (typeof state.seed !== 'string' || !state.seed) state.seed = LEGACY_SEED;
  state.shelf = state.shelf.filter(it => isPlainObject(it) && typeof it.g === 'string' && goodInfo(sets, it.g)
    && Number.isFinite(it.p) && it.p > 0 && Number.isInteger(it.n) && it.n > 0);
  for (const [g, n] of Object.entries(state.goods)) {
    if (!goodInfo(sets, g) || g.startsWith('b:') || !Number.isInteger(n) || n <= 0) delete state.goods[g];
  }
  state.ledger = state.ledger.filter(e => isPlainObject(e) && Number.isFinite(e.day) && isPlainObject(e.in) && isPlainObject(e.out));
  for (const [id, day] of Object.entries(state.achievements)) if (!Number.isFinite(day)) delete state.achievements[id];
  state.newsSeen = state.newsSeen.filter(id => typeof id === 'string');
  for (const map of [state.stock, state.binder, state.seen]) {
    for (const sid of Object.keys(map)) if (!sets[sid]) delete map[sid];
  }
  for (const m of [state.binder, state.seen]) {
    for (const [sid, cards] of Object.entries(m)) {
      if (!isPlainObject(cards)) { delete m[sid]; continue; }
      for (const cid of Object.keys(cards)) if (!sets[sid].byId[cid]) delete cards[cid];
    }
  }
  const first = Object.keys(sets)[0] || '';
  if (!sets[state.rules.buySet]) state.rules.buySet = first;
  if (!sets[state.rules.openSet]) state.rules.openSet = first;
  state.staff = state.staff.filter(isPlainObject).map(e => {
    const skills = {};
    for (const k of SKILL_KEYS) {
      const s = e.skills?.[k];
      skills[k] = { lvl: Math.min(10, Math.max(1, Math.floor(s?.lvl) || 1)), xp: Math.max(0, Number(s?.xp) || 0) };
    }
    return {
      id: e.id ?? state.nextId++,
      name: String(e.name || 'Clerk'),
      skills,
      task: SKILL_KEYS.includes(e.task) ? e.task : null,
      progress: Number(e.progress) || 0,
      training: e.training && SKILL_KEYS.includes(e.training.skill) ? e.training : null,
      status: 'idle',
      hiredDay: Number.isFinite(e.hiredDay) ? e.hiredDay : null,
    };
  });
  return state;
}

export function restore(file, sets, order) {
  const migrated = migrate(file);
  const state = mergeDefaults(newState(sets, order), migrated);
  return sanitize(state, sets);
}

// ---------- localStorage ----------
export function saveLocal(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(state)));
    return true;
  } catch (err) {
    console.error('Save failed', err);
    return false;
  }
}

export function loadLocal(sets, order) {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return restore(JSON.parse(raw), sets, order);
  } catch (err) {
    console.error('Could not load save', err);
    // Keep the unreadable save aside instead of overwriting it.
    localStorage.setItem(SAVE_KEY + '.broken', raw);
    return null;
  }
}

export function clearLocal() {
  localStorage.removeItem(SAVE_KEY);
}

export function exportFile(state) {
  const blob = new Blob([JSON.stringify(serialize(state), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  a.href = url;
  a.download = `idlecardshop-${d.toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Device preferences (never inside the save) ----------
export const DEFAULT_PREFS = {
  theme: 'system',
  master: 70,
  music: 50,
  effects: 70,
  muteMaster: false,
  muteMusic: false,
  muteEffects: false,
  reduceMotion: false,
  marketPageSize: 25, // 0 = all
  debug: false,       // debug menu unlocked on this device (debug.js)
  clockOffset: 0,     // debug time skip, ms ahead of real time (clock.js)
};

export function loadPrefs() {
  try {
    return mergeDefaults({ ...DEFAULT_PREFS }, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
