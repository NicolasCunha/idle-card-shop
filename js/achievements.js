// Achievements (Nicolas, 2026-11-28; docs/sdd/economy-v5.md). No reward: the
// list is the record. Checked by the tick every few simulated seconds; a save
// gets what it already qualifies for on load, silently.

import * as G from './game.js';

const maxedOut = (s, k) => s.upgrades[k] >= G.UPGRADES[k].max;
const maxStaffEver = 1 + G.UPGRADES.staffRoom.max;
const complete = (s, set) => G.collectionProgress(s, set).frac >= 1;

const FIXED = [
  { id: 'first-sale', name: 'First sale', desc: 'Sell a card.', test: s => s.stats.cardsSold >= 1 },
  { id: 'sold-100', name: 'Regulars', desc: 'Sell 100 cards.', test: s => s.stats.cardsSold >= 100 },
  { id: 'sold-1k', name: 'Busy counter', desc: 'Sell 1,000 cards.', test: s => s.stats.cardsSold >= 1000 },
  { id: 'sold-10k', name: 'Card empire', desc: 'Sell 10,000 cards.', test: s => s.stats.cardsSold >= 10000 },
  { id: 'opened-100', name: 'Pack ripper', desc: 'Open 100 boosters.', test: s => s.stats.boostersOpened >= 100 },
  { id: 'opened-10k', name: 'Pack mountain', desc: 'Open 10,000 boosters.', test: s => s.stats.boostersOpened >= 10000 },
  { id: 'earned-1k', name: 'First grand', desc: 'Earn $1,000.', test: s => s.stats.earned >= 1000 },
  { id: 'earned-100k', name: 'Big business', desc: 'Earn $100,000.', test: s => s.stats.earned >= 100000 },
  { id: 'earned-1m', name: 'Millionaire', desc: 'Earn $1,000,000.', test: s => s.stats.earned >= 1000000 },
  { id: 'first-hire', name: 'First hire', desc: 'Hire an employee.', test: s => s.staff.length >= 1 },
  { id: 'full-team', name: 'Full team', desc: `Hire ${maxStaffEver} employees.`, test: s => s.staff.length >= maxStaffEver },
  { id: 'expert', name: 'Expert', desc: 'Get a skill to level 10.', test: s => s.staff.some(e => G.SKILL_KEYS.some(k => e.skills[k].lvl >= G.MAX_SKILL)) },
  { id: 'upgrade-max', name: 'Maxed out', desc: 'Max out an upgrade.', test: s => Object.keys(G.UPGRADES).some(k => maxedOut(s, k)) },
  { id: 'all-upgrades', name: 'Fully upgraded', desc: 'Max out every upgrade.', test: s => Object.keys(G.UPGRADES).every(k => maxedOut(s, k)) },
  { id: 'famous', name: 'Famous', desc: 'Reach Fame 20.', test: s => maxedOut(s, 'fame') },
  { id: 'sealed-sale', name: 'Sealed deal', desc: 'Sell a sealed product.', test: s => s.stats.sealedSold >= 1 },
  { id: 'box-break', name: 'Box break', desc: 'Open a booster box.', test: s => s.stats.boxesOpened >= 1 },
];

// The full list for these collections: fixed ones, one per collection, and
// one for all of them.
export function list(sets) {
  const all = Object.values(sets);
  return [
    ...FIXED,
    ...all.map(set => ({
      id: `complete-${set.id}`, name: `${set.name} complete`, desc: `Discover every ${set.name} card.`,
      test: s => complete(s, set),
    })),
    { id: 'master', name: 'Master collector', desc: 'Complete every collection.', test: s => all.every(set => complete(s, set)) },
  ];
}

let cached = null, cachedFor = null;
function listFor(sets) {
  if (cachedFor !== sets) { cached = list(sets); cachedFor = sets; }
  return cached;
}

export function check(state, sets, silent) {
  for (const a of listFor(sets)) {
    if (state.achievements[a.id] != null) continue;
    if (a.test(state, sets)) G.earnAchievement(state, a.id, a.name, silent);
  }
}

export function register() { G.setAchievementCheck(check); }
