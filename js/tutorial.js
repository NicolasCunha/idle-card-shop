// Tutorial engine. Content lives in data/tutorial.json (one list of steps with a
// revision number). Every mechanic change updates that file and bumps its
// revision: see .claude/rules/tutorial.md.

let data = { revision: 0, steps: [] };

export async function loadTutorial(base = '') {
  const res = await fetch(base + 'data/tutorial.json', { cache: 'no-cache' });
  data = await res.json();
  return data;
}

export function setTutorialData(d) { data = d; }
export function tutorialData() { return data; }

// Stat counters compare to a baseline taken on restart, so a replayed tutorial
// waits for the action again.
const grew = (s, k) => s.stats[k] > (s.tutorial.base?.[k] || 0);
const COND = {
  boostersBought: s => grew(s, 'boostersBought'),
  boostersOpened: s => grew(s, 'boostersOpened'),
  cardsPriced: s => grew(s, 'cardsPriced'),
  cardsListed: s => grew(s, 'cardsListed'),
  cardsSold: s => grew(s, 'cardsSold'),
  staffUnlocked: s => s.unlocked.staff,
  marketUnlocked: s => s.unlocked.market,
  hasStaff: s => s.staff.length > 0,
  staffHasTask: s => s.staff.some(e => e.task),
  visitedMarket: s => !!s.flags.visited.market,
  visitedSettings: s => !!s.flags.visited.settings,
  // s._open: collections past the first whose boosters are unlocked (game.js).
  nextSetOpen: s => Object.values(s._open || {}).some(Boolean),
  boughtNextSet: s => Object.keys(s._open || {}).some(id => s._open[id] && (s.stock[id] > 0 || Object.keys(s.seen[id] || {}).length > 0)),
};

function check(name, state) {
  if (!name) return true;
  const fn = COND[name];
  if (!fn) { console.warn(`Tutorial: unknown condition "${name}"`); return false; }
  return fn(state);
}

// Marks finished steps and returns the step to show now, or null.
export function currentStep(state) {
  const t = state.tutorial;
  if (!state.setupDone) return null;
  const done = new Set(t.done);
  let changed = false;
  for (const step of data.steps) {
    if (!done.has(step.id) && step.done && check(step.done, state)) { done.add(step.id); changed = true; }
  }
  if (changed) t.done = [...done];
  if (data.steps.every(s => done.has(s.id))) {
    t.rev = data.revision;
    return null;
  }
  return data.steps.find(s => !done.has(s.id) && check(s.when, state)) || null;
}

// Skip marks every current step as done; steps added in later revisions still show.
export function skipTutorial(state) {
  state.tutorial.done = data.steps.map(s => s.id);
  state.tutorial.rev = data.revision;
  state.tutorial.skipped = true;
}

export function restartTutorial(state) {
  state.tutorial.done = [];
  state.tutorial.rev = 0;
  state.tutorial.skipped = false;
  state.tutorial.base = { ...state.stats };
  state.flags.visited = {};
}

export function conditionNames() { return Object.keys(COND); }
