// Player-facing copy lives here (plus data/tutorial.json), so a later translation
// does not need a rewrite. Keep it short: see .claude/rules/ui-copy.md.

export const TABS = {
  shop: 'Shop',
  binder: 'Binder',
  showcase: 'Showcase',
  market: 'Market',
  storage: 'Storage',
  staff: 'Staff',
  upgrades: 'Upgrades',
  finances: 'Finances',
  settings: 'Settings',
};

// Finances tab categories (game.js earn/spend).
export const LEDGER_CATS = {
  cards: 'Card sales', bulk: 'Bulk sales', sealed: 'Storage sales', market: 'Market',
  boosters: 'Distributor', goods: 'Boxes and accessories', upgrades: 'Upgrades',
  hires: 'Hiring', training: 'Training', salaries: 'Salaries',
};

export const THEMES = [
  ['system', 'System'], ['light', 'Light'], ['dark', 'Dark'], ['forest', 'Forest'], ['ocean', 'Ocean'],
  ['lavender', 'Lavender'], ['rose', 'Rose'], ['sepia', 'Sepia'], ['midnight', 'Midnight'], ['mint', 'Mint'], ['ember', 'Ember'],
];
// Themes with a dark background.
export const DARK_THEMES = ['dark', 'forest', 'midnight', 'ember'];

export const SKILL_NAMES = { buy: 'Buy', open: 'Open', price: 'Price', list: 'List' };

export const UPGRADE_TEXT = {
  storage: { name: 'Bigger storage', effect: '+10 sealed boosters' },
  showcase: { name: 'Bigger showcase', effect: '+20 showcase slots' },
  marketing: { name: 'Marketing', effect: '+25% customers' },
  reputation: { name: 'Reputation', effect: '+6% sale price' },
  staffRoom: { name: 'Staff room', effect: '+1 staff slot' },
  fame: { name: 'Fame', effect: 'Richer customers, +3% customers' },
};

export const TIPS = {
  buy: 'Sealed boosters from the distributor. Less supply left, higher price.',
  buyAll: 'As many as your cash and storage allow.',
  supply: 'Boosters left at the distributor, out of all ever printed. Rival shops buy every day; reprints add more.',
  boosterMarket: 'Second-hand value. Follows supply more than the distributor and swings day to day.',
  marketBuy: 'Buy a sealed booster from rival shops at 110% of market value.',
  marketSell: 'Sell a sealed booster to rival shops at 90% of market value.',
  search: 'Name, number or collection. Example: Alakazam 1 or Jungle',
  open: 'Opened cards go to your binder.',
  price: 'Tags binder copies, priciest first, and puts them in the showcase.',
  priceKeep: 'Copies of each card that stay in the binder.',
  priceLevel: "Tag price against today's market.",
  bulk: 'Sells binder copies worth less than the bulk threshold at 30% of market.',
  recall: 'Brings showcase cards back to the binder.',
  single: 'Buy one copy for your binder at 110% of market.',
  list: 'Put copies in the showcase at your price.',
  locked: 'Not out yet.',
  stockTarget: 'Buyer stops when the shop holds this many sealed boosters.',
  cashReserve: 'Buyer never spends below this.',
  bulkBelow: 'Copies worth less go to the bulk buyer at 30%.',
  keepCopies: 'The pricer leaves this many copies of each card in the binder.',
  skillSpeed: 'Each level is 22% faster. Practice gives XP; training costs money and time.',
  feelings: 'What customers think of the tags they looked at.',
  customers: 'Each customer has a budget. At market price they buy half the time; cheaper sells more often, pricier much less. Twice the market almost never sells.',
  milestone: 'Discovery bonus on sale price for this collection.',
  day: 'A new market day every 10 minutes, the same for everyone.',
  salary: 'Per market day: $2 per skill level, +1% per day at the shop (up to +50%). Unpaid staff wait for cash.',
  goodPrice: 'Price tag. Customers react to it like card tags.',
  box: '36 boosters. 10% off the distributor price.',
  openBox: 'Needs room for 36 boosters.',
  shelf: 'Goods for sale. Room grows with Bigger showcase.',
};

// Simulated rival shops (supply.js RIVALS, same order: biggest first).
export const RIVAL_NAMES = ['Northside Games', 'Blue Harbor Cards', 'Pixel Hobby', 'Corner Collectibles',
  'Red Oak Hobbies', 'Card Castle', 'Meteor Games', 'Silver Sleeve', 'Top Deck Corner', 'Fox & Dice',
  'Harbor Light Toys', 'Paper Dragon', 'Old Town Cards', 'Rainy Day Games', 'Little Vault',
  'Comet Collectibles', 'Maple Street Toys', 'Cozy Corner Cards',
  'Golden Deck', 'Starlight Toys', 'Mint Condition', 'Lucky Pull'];

export const STATUS = {
  working: 'working',
  idle: 'idle',
  training: 'training',
};

export const FEELING_TEXT = { cheap: 'cheap', fair: 'fair', pricey: 'pricey', steep: 'too pricey' };

export const TOASTS = {
  showcaseFull: 'Showcase full',
  shelfFull: 'Shelf full',
  badCode: 'Wrong code',
};

export const OFFLINE = {
  title: 'While you were away',
  simulating: 'Catching up',
};
