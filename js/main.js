// Boot, main loop, actions and overlays.

import * as G from './game.js';
import * as UI from './ui.js';
import * as Save from './save.js';
import * as Audio from './audio.js';
import { loadCollections } from './data.js';
import { loadTutorial, skipTutorial, restartTutorial } from './tutorial.js';
import { initOpening, playOpening, showBulkResult, closeOverlay } from './opening.js';
import { fmtMoney, fmtNum, fmtDuration, esc } from './format.js';
import { OFFLINE } from './strings.js';
import { listTimeZones } from './market.js';

const TICK_MS = 250;
const AUTOSAVE_MS = 10000;
const LIVE_MAX_DT = 2; // longer gaps (paused tab) go through catch-up

let state, sets, order, prefs;
let catchingUp = false;
let pendingSale = 0, saleTimer = null;

async function boot() {
  prefs = Save.loadPrefs();
  Audio.setPrefs(prefs);
  try {
    ({ sets, order } = await loadCollections());
    await loadTutorial();
  } catch (err) {
    document.getElementById('app').innerHTML = `<p class="fatal">Could not load game data.</p>`;
    console.error(err);
    return;
  }
  if (!order.length) {
    document.getElementById('app').innerHTML = `<p class="fatal">No card collections found.</p>`;
    return;
  }
  state = Save.loadLocal(sets, order) || G.newState(sets, order);
  G.prepare(state, sets);

  initOpening({
    get state() { return state; }, sets, prefs,
    onOpenAnother: set => openOne(set),
    onClose: () => UI.frame(),
  });
  UI.initUI({ state, sets, order, prefs, actions: { run, click: () => Audio.sfx.click() } });

  G.onSale(v => {
    Audio.sfx.sale();
    pendingSale += v;
    if (!saleTimer) saleTimer = setTimeout(() => { UI.floatMoney(pendingSale); pendingSale = 0; saleTimer = null; }, 900);
  });

  // First gesture unlocks audio (browser rule).
  const unlock = () => { Audio.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => UI.applyTheme());

  // Console access for debugging and browser tests.
  window.idleCardShop = { get state() { return state; }, sets, order, G, frame: () => UI.frame(true) };

  if (!state.setupDone) showSetup();
  else await runCatchUp(Date.now(), true);

  setInterval(loop, TICK_MS);
  setInterval(save, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
    else loop();
  });
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', save);
}

function save() {
  if (!state || catchingUp || !state.setupDone) return;
  if (Save.saveLocal(state)) UI.markSaved(Date.now());
}

async function loop() {
  if (!state || catchingUp || !state.setupDone) { if (state) UI.frame(); return; }
  const now = Date.now();
  const dt = (now - state.lastTick) / 1000;
  if (dt > LIVE_MAX_DT) {
    await runCatchUp(now, dt > 60);
  } else if (dt > 0) {
    G.tick(state, sets, dt, now);
  }
  UI.frame();
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
    if (big && res) showOfflineSummary(res);
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
    <label>Choose your time zone
      <select id="setup-tz">${UI.timeZoneOptions(state.timeZone)}</select>
    </label>
    <div class="btns end"><button class="primary" id="setup-go">Open the shop</button></div>
  </div>`;
  el.hidden = false;
  el.querySelector('#setup-go').addEventListener('click', () => {
    Audio.unlock();
    Audio.sfx.click();
    state.timeZone = el.querySelector('#setup-tz').value;
    state.setupDone = true;
    const now = Date.now();
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
      if (G.buyBoosters(state, shopSet, Number(d.n) || 1)) Audio.sfx.coin();
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
    case 'price': G.priceMany(state, sets, G.MANUAL_PRICE_BATCH); break;
    case 'bulk': {
      const r = G.sellBulk(state, sets);
      if (r.n) Audio.sfx.coin();
      break;
    }
    case 'list': G.listMany(state, G.MANUAL_LIST_BATCH); break;
    case 'recall': G.recallShowcase(state); break;
    case 'shop-set': UI.setUiOption('shopSet', d.value); break;
    case 'binder-set': UI.setUiOption('binderSet', d.value); break;
    case 'market-set': UI.setUiOption('marketSet', d.value); break;
    case 'market-sort': UI.setUiOption('marketSort', d.value); break;
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
    case 'sell-binder': {
      const { set, card } = find(d);
      if (card && G.sellFromBinder(state, set, card)) overlayEl().innerHTML = UI.cardDetailHtml(set, card);
      break;
    }
    case 'close': closeOverlay(); break;
    case 'hire': if (G.hire(state)) Audio.sfx.coin(); break;
    case 'task': {
      const emp = state.staff.find(e => String(e.id) === d.id);
      if (emp) G.setTask(state, emp, d.value);
      break;
    }
    case 'train': {
      const emp = state.staff.find(e => String(e.id) === d.id);
      if (emp && G.train(state, emp, d.skill)) Audio.sfx.coin();
      break;
    }
    case 'rule': {
      const r = state.rules;
      if (d.rule === 'keepFirst') r.keepFirst = !!d.value;
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
    case 'timezone':
      if (listTimeZones().includes(d.value) || d.value === 'UTC') { state.timeZone = d.value; G.tick(state, sets, 0, Date.now()); }
      break;
    case 'save-now': save(); break;
    case 'export': save(); Save.exportFile(state); break;
    case 'import': importFile(d.files?.[0]); break;
    case 'reset':
      confirmBox('Erase this save and start over?', 'Reset', () => {
        Save.clearLocal();
        state = G.newState(sets, order);
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
    await runCatchUp(Date.now(), true);
    if (overlayEl().hidden) message('Save imported.');
  } catch (err) {
    console.error(err);
    message(`Import failed: ${err.message}`);
  }
}

boot();
