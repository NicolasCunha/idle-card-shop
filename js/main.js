// Boot, main loop, actions and overlays.

import * as G from './game.js';
import * as UI from './ui.js';
import * as Save from './save.js';
import * as Audio from './audio.js';
import * as Scene from './scene.js';
import { loadCollections } from './data.js';
import { loadTutorial, skipTutorial, restartTutorial } from './tutorial.js';
import { initOpening, playOpening, showBulkResult, closeOverlay } from './opening.js';
import { fmtMoney, fmtNum, fmtDuration, esc } from './format.js';
import { OFFLINE } from './strings.js';
import * as Clock from './clock.js';
import * as Debug from './debug.js';
import * as Achievements from './achievements.js';

const TICK_MS = 250;
const AUTOSAVE_MS = 10000;
const LIVE_MAX_DT = 2; // longer gaps (paused tab) go through catch-up

let state, sets, order, prefs, news = [];

// Accessories for the Storage tab (placeholder list Nicolas can replace).
async function loadAccessories() {
  try {
    const res = await fetch('data/accessories.json', { cache: 'no-cache' });
    return res.ok ? ((await res.json()).items || []) : [];
  } catch { return []; }
}

// Patch notes for the News panel. Missing or broken file: no notes.
async function loadNews() {
  try {
    const res = await fetch('data/news.json', { cache: 'no-cache' });
    return res.ok ? ((await res.json()).items || []).filter(n => n && n.id && n.title) : [];
  } catch { return []; }
}
let catchingUp = false;
let pendingSale = 0, saleTimer = null;

async function boot() {
  prefs = Save.loadPrefs();
  Clock.setOffset(prefs.clockOffset);
  Audio.setPrefs(prefs);
  try {
    ({ sets, order } = await loadCollections());
    await loadTutorial();
    news = await loadNews();
    G.setAccessories(await loadAccessories());
  } catch (err) {
    document.getElementById('app').innerHTML = `<p class="fatal">Could not load game data.</p>`;
    console.error(err);
    return;
  }
  if (!order.length) {
    document.getElementById('app').innerHTML = `<p class="fatal">No card collections found.</p>`;
    return;
  }
  Achievements.register();
  state = Save.loadLocal(sets, order) || G.newState(sets, order, Clock.now());
  G.prepare(state, sets);

  initOpening({
    get state() { return state; }, sets, prefs,
    onOpenAnother: set => openOne(set),
    onClose: () => UI.frame(),
  });
  Scene.initScene({
    getState: () => state, sets,
    onPaid: v => saleFeedback(v),
  });
  Scene.setCapacity(st => G.showcaseCapacity(st));
  UI.initUI({ state, sets, order, prefs, news, actions: { run, click: () => Audio.sfx.click() } });

  G.onCustomer(ev => Scene.customer(ev));
  G.onAchievement(name => UI.toastText(`Achievement: ${name}`));

  G.onSale(v => {
    if (Scene.showing()) return; // the buyer on the shop floor shows it
    saleFeedback(v);
  });

  // First gesture unlocks audio (browser rule).
  const unlock = () => { Audio.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => UI.applyTheme());

  // Console access for debugging and browser tests.
  window.idleCardShop = { get state() { return state; }, sets, order, G, frame: () => UI.frame(true) };

  if (!state.setupDone) showSetup();
  else await runCatchUp(Clock.now(), true);

  setInterval(loop, TICK_MS);
  setInterval(save, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
    else loop();
  });
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', save);
}

// Sale sound and header +$, batched so a busy shop floats one number at a time.
function saleFeedback(v) {
  Audio.sfx.sale();
  pendingSale += v;
  if (!saleTimer) saleTimer = setTimeout(() => { UI.floatMoney(pendingSale); pendingSale = 0; saleTimer = null; }, 900);
}

function save() {
  if (!state || catchingUp || !state.setupDone) return;
  if (Save.saveLocal(state)) UI.markSaved(Date.now());
}

async function loop() {
  if (!state || catchingUp || !state.setupDone) { if (state) UI.frame(); return; }
  const now = Clock.now();
  const dt = (now - state.lastTick) / 1000;
  if (dt > LIVE_MAX_DT) {
    await runCatchUp(now, dt > 60);
  } else if (dt > 0) {
    G.tick(state, sets, dt, now);
  }
  UI.frame(false, true);
}

// ---------- Offline catch-up ----------
async function runCatchUp(now, showOverlay) {
  const seconds = (now - state.lastTick) / 1000;
  if (seconds < 1) { state.lastTick = now; return; }
  catchingUp = true;
  const big = showOverlay && seconds > 60;
  let bar = null, label = null;
  if (big) {
    const el = overlayEl();
    el.className = 'overlay';
    el.innerHTML = `<div class="modal catchup">
      <h2>${OFFLINE.simulating}</h2>
      <div class="progress"><i id="cu-bar"></i></div>
      <div class="muted" id="cu-label"></div>
    </div>`;
    el.hidden = false;
    bar = el.querySelector('#cu-bar');
    label = el.querySelector('#cu-label');
  }
  try {
    const res = await G.catchUp(state, sets, now, (frac, done) => {
      if (bar) bar.style.width = `${(frac * 100).toFixed(1)}%`;
      if (label) label.textContent = `${fmtDuration(done)} / ${fmtDuration(seconds)}`;
    });
    const quiet = res && !res.earned && !res.bought && !res.opened && !res.sold && !res.levels;
    if (big && res && !quiet) showOfflineSummary(res);
    else if (big) closeOverlay();
  } finally {
    catchingUp = false;
  }
  save();
  UI.frame();
}

function showOfflineSummary(r) {
  const el = overlayEl();
  el.innerHTML = `<div class="modal offline">
    <h2>${OFFLINE.title}</h2>
    <div class="kv"><span>Time away</span><b>${fmtDuration(r.seconds)}</b></div>
    <div class="kv"><span>Earned</span><b>${fmtMoney(r.earned)}</b></div>
    <div class="kv"><span>Cash change</span><b>${fmtMoney(r.money)}</b></div>
    <div class="kv"><span>Boosters bought</span><b>${fmtNum(r.bought)}</b></div>
    <div class="kv"><span>Boosters opened</span><b>${fmtNum(r.opened)}</b></div>
    <div class="kv"><span>Cards sold</span><b>${fmtNum(r.sold)}</b></div>
    <div class="kv"><span>Levels gained</span><b>${fmtNum(r.levels)}</b></div>
    <div class="btns end"><button class="primary" data-action="close">Continue</button></div>
  </div>`;
  el.hidden = false;
  el.querySelector('button').focus();
}

function overlayEl() { return document.getElementById('overlay'); }

// ---------- First run ----------
function showSetup() {
  const el = overlayEl();
  el.className = 'overlay';
  el.innerHTML = `<div class="modal setup">
    <h1>IdleCardShop</h1>
    <div class="btns end"><button class="primary" id="setup-go">Open the shop</button></div>
  </div>`;
  el.hidden = false;
  el.querySelector('#setup-go').addEventListener('click', () => {
    Audio.unlock();
    Audio.sfx.click();
    state.setupDone = true;
    const now = Clock.now();
    state.lastTick = now;
    state.createdAt = now;
    G.tick(state, sets, 0, now);
    closeOverlay();
    save();
    UI.frame(true);
  });
}

// ---------- Opening ----------
function openOne(set) {
  const res = G.openBooster(state, sets, set);
  if (!res) { closeOverlay(); UI.frame(); return; }
  playOpening(set, res);
  UI.frame();
}

// ---------- Actions ----------
function find(d) {
  const set = sets[d.s];
  return { set, card: set?.byId[d.c] };
}

function confirmBox(text, yes, onYes) {
  const el = overlayEl();
  el.className = 'overlay';
  el.innerHTML = `<div class="modal confirm"><p>${esc(text)}</p>
    <div class="btns end"><button data-action="close">Cancel</button><button class="danger" id="confirm-yes">${esc(yes)}</button></div></div>`;
  el.hidden = false;
  el.querySelector('#confirm-yes').addEventListener('click', () => { closeOverlay(); onYes(); });
}

function message(text) {
  const el = overlayEl();
  el.className = 'overlay';
  el.innerHTML = `<div class="modal confirm"><p>${esc(text)}</p><div class="btns end"><button class="primary" data-action="close">OK</button></div></div>`;
  el.hidden = false;
}

function run(action, d) {
  const shopSet = sets[d.set] || sets[document.querySelector('[data-action="shop-set"]')?.value] || sets[order[0]];
  switch (action) {
    case 'buy': {
      if (G.buyBoosters(state, shopSet, d.n === 'all' ? Infinity : Number(d.n) || 1)) Audio.sfx.coin();
      break;
    }
    case 'open': {
      const have = state.stock[shopSet.id] || 0;
      if (!have) break;
      if (d.n === '1') { openOne(shopSet); return; }
      const n = d.n === 'all' ? have : Math.min(have, Number(d.n));
      const res = G.openBoosters(state, sets, shopSet, n);
      Audio.sfx.tear();
      showBulkResult(shopSet, res);
      break;
    }
    case 'price': {
      const q = UI.uiOption('priceQty');
      const keep = Number(UI.uiOption('priceKeep')) || 0;
      if (G.priceSpares(state, sets, q === 'all' ? Infinity : Number(q) || 1, Number(UI.uiOption('priceLevel')) || 0, keep)) Audio.sfx.click();
      if (!G.freeSlots(state) && G.spares(state, sets, keep).length) UI.toast('showcaseFull');
      break;
    }
    case 'buy-market-booster': {
      if (sets[d.set] && G.buyMarketBooster(state, sets[d.set])) Audio.sfx.coin();
      break;
    }
    case 'sell-booster': {
      if (sets[d.set] && G.repeat(G.sellMarketBooster, state, sets[d.set], Number(d.n) || 1)) Audio.sfx.coin();
      break;
    }
    case 'news-more': {
      UI.setNewsMore(d.sec);
      const panel = document.querySelector('.news-panel');
      const top = panel ? panel.scrollTop : 0;
      overlayEl().innerHTML = UI.newsHtml();
      const again = document.querySelector('.news-panel');
      if (again) again.scrollTop = top;
      return;
    }
    case 'news': {
      const el = overlayEl();
      el.className = 'overlay';
      UI.resetNewsMore();
      el.innerHTML = UI.newsHtml();
      el.hidden = false;
      UI.markNewsRead();
      UI.frame();
      return;
    }
    case 'awards': {
      const el = overlayEl();
      el.className = 'overlay';
      el.innerHTML = UI.awardsHtml();
      el.hidden = false;
      UI.frame();
      return;
    }
    case 'good-level': UI.setUiOption('gp', {}); UI.setUiOption('goodLevel', d.value); break;
    case 'ui-opt': UI.setUiOption(d.opt, d.value); break;
    case 'bulk': {
      const r = G.sellBulk(state, sets, Number(UI.uiOption('priceKeep')) || 0);
      if (r.n) Audio.sfx.coin();
      break;
    }
    case 'recall': G.recallShowcase(state); break;
    case 'shop-set': UI.setUiOption('shopSet', d.value); break;
    case 'binder-set': UI.setUiOption('binderSet', d.value); break;
    case 'market-set': UI.setUiOption('marketSet', d.value); break;
    case 'market-sort': UI.setUiOption('marketSort', d.value); break;
    case 'market-page': UI.setMarketPage(Number(d.page) || 0); document.getElementById('panel').scrollTop = 0; window.scrollTo(0, 0); break;
    case 'market-page-size':
      prefs.marketPageSize = Number(d.value) || 0;
      Save.savePrefs(prefs);
      UI.setMarketPage(0);
      break;
    case 'card': {
      const { set, card } = find(d);
      if (!card) break;
      const el = overlayEl();
      el.className = 'overlay';
      el.innerHTML = UI.cardDetailHtml(set, card);
      el.hidden = false;
      return;
    }
    case 'buy-single': {
      const { set, card } = find(d);
      if (card && G.buySingle(state, sets, set, card)) {
        Audio.sfx.coin();
        if (!overlayEl().hidden && overlayEl().querySelector('.detail')) overlayEl().innerHTML = UI.cardDetailHtml(set, card);
      }
      break;
    }
    case 'list':
    case 'lf': {
      const { set, card } = find(d);
      if (!card) break;
      if (action === 'lf') UI.lfSet(set, card, d.what);
      overlayEl().innerHTML = UI.listFormHtml(set, card);
      return;
    }
    case 'list-card':
    case 'list-card-ok': {
      const { set, card } = find(d);
      if (!card) break;
      const have = state.binder[set.id]?.[card.id] || 0;
      const lf = UI.lfState();
      const n = action === 'list-card' ? Math.min(lf.n, have, G.freeSlots(state)) : Number(d.n);
      const price = action === 'list-card' ? lf.price : Number(d.price);
      if (!(n > 0) || !(price > 0)) break;
      if (action === 'list-card' && n >= have) {
        overlayEl().innerHTML = UI.confirmLastHtml(set, card, n, price);
        return;
      }
      if (G.listCard(state, set, card, n, price)) { Audio.sfx.click(); overlayEl().innerHTML = UI.cardDetailHtml(set, card); }
      return;
    }
    case 'close': closeOverlay(); break;
    case 'hire': if (G.hire(state)) Audio.sfx.coin(); break;
    case 'job':
    case 'job-set': {
      const emp = state.staff.find(e => String(e.id) === d.id);
      if (!emp) break;
      const slot = Number(d.slot) === 2 ? 2 : 1;
      const task = slot === 2 ? emp.task2 : emp.task, sid = slot === 2 ? emp.set2 : emp.set;
      if (action === 'job') G.setJob(state, emp, slot, d.value, sid);
      else G.setJob(state, emp, slot, task, d.value);
      break;
    }
    case 'campaign': if (G.startCampaign(state, d.kind)) Audio.sfx.coin(); break;
    case 'wh-buy': if (G.buyWarehouse(state)) Audio.sfx.coin(); break;
    case 'wh-up': if (G.upgradeWarehouse(state, Number(d.id))) Audio.sfx.coin(); break;
    case 'wh-stock': if (G.buyToWarehouse(state, sets, d.g, Number(d.n) || 0)) Audio.sfx.coin(); break;
    case 'wh-store': if (G.storeInWarehouse(state, d.g, Infinity)) Audio.sfx.click(); break;
    case 'wh-ship': if (G.shipToShop(state, d.g, 100)) Audio.sfx.click(); break;
    case 'wh-target': G.setTarget(state, d.g, d.value); break;
    case 'train': {
      const emp = state.staff.find(e => String(e.id) === d.id);
      if (emp && G.train(state, emp, d.skill)) Audio.sfx.coin();
      break;
    }
    case 'rule': {
      const r = state.rules;
      if (d.rule === 'priceLevel') { if (G.PRICE_LEVELS.includes(Number(d.value))) r.priceLevel = Number(d.value); }
      else if (d.rule === 'buySet' || d.rule === 'openSet') { if (sets[d.value]) r[d.rule] = d.value; }
      else {
        const v = Number(d.value);
        if (Number.isFinite(v) && v >= 0) r[d.rule] = d.rule === 'bulkBelow' ? v : Math.floor(v);
      }
      break;
    }
    case 'upgrade': if (G.buyUpgrade(state, d.key)) Audio.sfx.coin(); break;
    case 'skip-tutorial': skipTutorial(state); break;
    case 'restart-tutorial': restartTutorial(state); UI.switchTab('shop'); break;
    case 'pref-theme': prefs.theme = d.value; Save.savePrefs(prefs); UI.applyTheme(); break;
    case 'pref-motion': prefs.reduceMotion = !!d.value; Save.savePrefs(prefs); UI.applyTheme(); break;
    case 'pref-vol': prefs[d.key] = Number(d.value); Audio.setPrefs(prefs); Save.savePrefs(prefs); break;
    case 'pref-mute': prefs[d.key] = !!d.value; Audio.setPrefs(prefs); Save.savePrefs(prefs); break;
    case 'save-now': save(); break;
    case 'good-list': {
      const input = document.querySelector(`[data-gp="${CSS.escape(d.g)}"]`);
      const price = Number(input?.value) || UI.goodPriceFor(d.g);
      const n = d.n === 'all' ? Infinity : Number(d.n) || 1;
      if (G.listGood(state, sets, d.g, n, price)) Audio.sfx.coin();
      else if (!G.shelfFree(state)) UI.toast('shelfFull');
      break;
    }
    case 'shelf-recall': G.recallShelf(state); break;
    case 'shelf-take': G.recallShelfItem(state, Number(d.i)); break;
    case 'box-buy': if (sets[d.set] && G.buyBox(state, sets[d.set])) Audio.sfx.coin(); break;
    case 'box-open': if (sets[d.set] && G.openBox(state, sets[d.set])) Audio.sfx.tear(); break;
    case 'acc-buy': if (G.buyAccessory(state, d.id, Number(d.n) || 1)) Audio.sfx.coin(); break;
    case 'dbg-code': {
      const input = document.getElementById('dbg-code');
      Debug.checkCode(input?.value).then(ok => {
        if (ok) { prefs.debug = true; Save.savePrefs(prefs); UI.frame(true); }
        else if (input) { input.value = ''; UI.toast('badCode'); }
      });
      return;
    }
    case 'dbg-lock': prefs.debug = false; Save.savePrefs(prefs); break;
    case 'dbg-skip': {
      if (catchingUp) return;
      const ms = d.n === 'next' ? Debug.msToNextSet(state, sets, Clock.now()) : Number(d.n) * Debug.DAY_MS;
      if (!ms) return;
      Clock.setOffset(Clock.getOffset() + ms);
      prefs.clockOffset = Clock.getOffset();
      Save.savePrefs(prefs);
      loop();
      return;
    }
    case 'dbg-money': Debug.setMoney(state, document.getElementById('dbg-money')?.value); break;
    case 'dbg-boosters':
    case 'dbg-cards': {
      const set = sets[document.getElementById('dbg-set')?.value];
      const n = document.getElementById('dbg-n')?.value;
      if (!set) break;
      if (action === 'dbg-boosters') Debug.addBoosters(state, set, n);
      else showBulkResult(set, Debug.addCards(state, sets, set, n));
      break;
    }
    case 'dbg-up': {
      const cur = state.upgrades[d.key] || 0;
      Debug.setUpgrade(state, d.key, d.n === 'max' ? Infinity : cur + Number(d.n));
      break;
    }
    case 'dbg-hire': Debug.hireFree(state); break;
    case 'dbg-skills': Debug.maxSkills(state); break;
    case 'dbg-unlock': Debug.unlockAll(state); break;
    case 'export': save(); Save.exportFile(state); break;
    case 'import': importFile(d.files?.[0]); break;
    case 'reset':
      confirmBox('Erase this save and start over?', 'Reset', () => {
        Save.clearLocal();
        state = G.newState(sets, order, Clock.now());
        G.prepare(state, sets);
        UI.setState(state);
        showSetup();
      });
      return;
  }
  UI.frame();
}

async function importFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const next = Save.restore(JSON.parse(text), sets, order);
    next.setupDone = true;
    G.prepare(next, sets);
    state = next;
    UI.setState(state);
    await runCatchUp(Clock.now(), true);
    if (overlayEl().hidden) message('Save imported.');
  } catch (err) {
    console.error(err);
    message(`Import failed: ${err.message}`);
  }
}

boot();

// Installable app and offline play (sw.js).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('No offline mode:', err)));
}
