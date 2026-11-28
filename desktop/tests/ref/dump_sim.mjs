// Golden simulation from the web build: runs sim_script.json and writes the
// state at each checkpoint to sim_ref.json. Run from the repo root with Node 22+:
//   node desktop/tests/ref/dump_sim.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(readFileSync(join(root, url), 'utf8')) });

const G = await import(join(root, 'js', 'game.js'));
const A = await import(join(root, 'js', 'achievements.js'));
const S = await import(join(root, 'js', 'save.js'));
const { loadCollections } = await import(join(root, 'js', 'data.js'));
const { sets, order } = await loadCollections('');
G.setAccessories(JSON.parse(readFileSync(join(root, 'data', 'accessories.json'), 'utf8')).items);
A.register();

const script = JSON.parse(readFileSync(join(here, 'sim_script.json'), 'utf8'));
G.setRandom(G.seededRandom(script.rngSeed));
const state = G.newState(sets, order, script.startMs);
state.seed = script.marketSeed;
G.prepare(state, sets);

function act(op, a) {
  const s = sets;
  switch (op) {
    case 'money': state.money = a[0]; break;
    case 'buy': G.buyBoosters(state, s[a[0]], a[1]); break;
    case 'open': G.openBoosters(state, s, s[a[0]], a[1]); break;
    case 'price': G.priceSpares(state, s, a[0], a[1], a[2]); break;
    case 'hire': for (let i = 0; i < a[0]; i++) G.hire(state); break;
    case 'upgrade': for (let i = 0; i < a[1]; i++) G.buyUpgrade(state, a[0]); break;
    case 'job': G.setJob(state, state.staff[a[0]], a[1], a[2], a[3]); break;
    case 'train': G.train(state, state.staff[a[0]], a[1]); break;
    case 'campaign': G.startCampaign(state, a[0]); break;
    case 'warehouse': G.buyWarehouse(state); break;
    case 'upwarehouse': G.upgradeWarehouse(state, state.properties.warehouses[a[0]].id); break;
    case 'towarehouse': G.buyToWarehouse(state, s, a[0], a[1]); break;
    case 'target': G.setTarget(state, a[0], a[1]); break;
    case 'box': G.buyBox(state, s[a[0]]); break;
    case 'openbox': G.openBox(state, s[a[0]]); break;
    case 'acc': G.buyAccessory(state, a[0], a[1]); break;
    case 'listgood': G.listGood(state, s, a[0], a[1], a[2]); break;
    case 'rules': state.rules[a[0]] = a[1]; break;
    case 'single': G.buySingle(state, s, s[a[0]], s[a[0]].byId[a[1]]); break;
    case 'sellmb': G.sellMarketBooster(state, s[a[0]]); break;
    case 'buymb': G.buyMarketBooster(state, s[a[0]]); break;
    case 'bulk': G.sellBulk(state, s, a[0]); break;
    case 'store': G.storeInWarehouse(state, a[0], a[1]); break;
    case 'ship': G.shipToShop(state, a[0], a[1]); break;
    case 'recall': G.recallShowcase(state); break;
    case 'fire': G.fire(state, state.staff[a[0]]); break;
    case 'recallshelf': G.recallShelf(state); break;
    default: throw new Error('unknown op ' + op);
  }
}

const out = { checkpoints: {} };
let ai = 0;
for (let t = 0; t <= script.seconds; t++) {
  while (ai < script.actions.length && script.actions[ai][0] === t) {
    const [, op, ...args] = script.actions[ai++];
    act(op, args);
  }
  if (t > 0) G.tick(state, sets, 1, script.startMs + t * 1000);
  if (script.checkpoints.includes(t)) out.checkpoints[t] = S.serialize(state).state;
}
writeFileSync(join(here, 'sim_ref.json'), JSON.stringify(out));
console.log(`sim_ref.json: money ${state.money.toFixed(2)}, sold ${state.stats.cardsSold}, opened ${state.stats.boostersOpened}, staff ${state.staff.length}, notices ${state.inbox.length}`);
