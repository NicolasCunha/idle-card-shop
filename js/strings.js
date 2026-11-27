// Player-facing copy lives here (plus data/tutorial.json), so a later translation
// does not need a rewrite. Keep it short: see .claude/rules/ui-copy.md.

export const TABS = {
  shop: 'Shop',
  binder: 'Binder',
  showcase: 'Showcase',
  market: 'Market',
  staff: 'Staff',
  upgrades: 'Upgrades',
  settings: 'Settings',
};

export const SKILL_NAMES = { buy: 'Buy', open: 'Open', price: 'Price', list: 'List' };

export const UPGRADE_TEXT = {
  storage: { name: 'Bigger storage', effect: '+10 sealed boosters' },
  showcase: { name: 'Bigger showcase', effect: '+20 showcase slots' },
  marketing: { name: 'Marketing', effect: '+25% customers' },
  reputation: { name: 'Reputation', effect: '+6% sale price' },
  staffRoom: { name: 'Staff room', effect: '+1 staff slot' },
};

export const TIPS = {
  buy: 'Sealed boosters from the distributor. Price follows the collection trend of the day.',
  open: 'Opened cards go to the unpriced pile.',
  price: 'Tags cards at today\'s market price. Cards under the bulk threshold go to the bulk buyer at 30%.',
  bulk: 'Sells the whole unpriced pile to the bulk buyer at 30% of market.',
  list: 'Moves priced cards to the showcase. Customers buy from there.',
  recall: 'Brings showcase cards back to the unpriced pile so you can price them again.',
  single: 'Buy one copy for your binder at 110% of market.',
  sellBinder: 'Moves copies to the unpriced pile.',
  keepOne: 'Moves every copy but one to the unpriced pile.',
  locked:'Discover 90% of the previous collection to buy this one.',
  stockTarget: 'Buyer stops when the shop holds this many sealed boosters.',
  cashReserve: 'Buyer never spends below this.',
  bulkBelow: 'Cards worth less go to bulk when priced.',
  keepFirst: 'Opened cards you do not own yet go straight to the binder.',
  skillSpeed: 'Each level is 22% faster. Practice gives XP; training costs money and time.',
  priceQuality: 'Staff charge 75% of market at level 1, 100% at level 10.',
  customers: 'Customers skip cards tagged above 115% of today\'s market.',
  milestone: 'Discovery bonus on sale price for this collection.',
  timeZone: 'Market day changes at midnight in this time zone.',
};

export const STATUS = {
  working: 'working',
  idle: 'idle',
  training: 'training',
};

export const OFFLINE = {
  title: 'While you were away',
  simulating: 'Catching up',
};
