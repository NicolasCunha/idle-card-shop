// Menu UI. Each tab has sig() (re-render when it changes), html() (markup) and
// vals() (live numbers patched in place), so inputs keep focus and clicks are
// never lost to a re-render.

import * as G from './game.js';
import * as M from './market.js';
import * as SU from './supply.js';
import { cardHtml, rarityTag } from './cards.js';
import { fmtMoney, fmtNum, fmtPct, fmtSec, fmtDuration, fmtClock, esc } from './format.js';
import { TABS, SKILL_NAMES, UPGRADE_TEXT, TIPS, TOASTS, FEELING_TEXT, LEDGER_CATS, THEMES, DARK_THEMES, CAMPAIGN_TEXT } from './strings.js';
import * as Achievements from './achievements.js';
import { currentStep } from './tutorial.js';
import { cardFilter } from './data.js';
import { GAME_VERSION } from './save.js';
import { mount as mountScene } from './scene.js';
import * as Clock from './clock.js';

let S = null, SETS = null, ORDER = [], PREFS = null, A = null, NEWS = [];
let active = 'shop';
let lastSig = null;
let ui = { gp: {}, goodLevel: '0', shopSet: null, binderSet: null, marketSet: 'all', marketSort: 'number', marketPage: 0, marketQuery: '', priceQty: '10', priceLevel: '0', priceKeep: '0' };
export const PAGE_SIZES = [10, 25, 50, 100, 0];
let shownMoney = null;

export function initUI({ state, sets, order, prefs, actions, news }) {
  S = state; SETS = sets; ORDER = order; PREFS = prefs; A = actions; NEWS = news || [];
  ui.shopSet = ui.binderSet = order[0];
  buildShell();
  bindEvents();
  applyTheme();
  frame(true);
}

export function setState(s) { S = s; lastSig = null; shownMoney = null; }
export function forceRender() { lastSig = null; }
export function activeTab() { return active; }

// ---------- Shell ----------
function buildShell() {
  document.getElementById('app').innerHTML = `
    <header class="top">
      <div class="brand">IdleCardShop</div>
      <div class="top-stats">
        <span class="money" id="money" title="Cash">$0.00</span>
        <span class="day" title="${esc(TIPS.day)}"><span id="day-label"></span> · next <span id="day-next"></span></span>
        <button class="small" id="awards-btn" data-action="awards">Awards <span class="muted" id="awards-count"></span></button>
        <button class="small news-btn" id="news-btn" data-action="news">News<span class="news-count" id="news-count" hidden></span></button>
      </div>
    </header>
    <nav class="tabs" id="tabs">${Object.entries(TABS).map(([k, v]) =>
      `<button class="tab" data-tab="${k}" ${k === 'shop' || k === 'settings' ? '' : 'hidden'}>${v}</button>`).join('')}</nav>
    <main id="panel" class="panel"></main>
    <div id="tip" class="tip" hidden></div>
    <div id="floaters" class="floaters" aria-hidden="true"></div>`;
}

export function applyTheme() {
  const t = PREFS.theme === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : PREFS.theme;
  const known = THEMES.some(([k]) => k === t) ? t : 'light';
  document.documentElement.dataset.theme = known;
  document.documentElement.dataset.mode = DARK_THEMES.includes(known) ? 'dark' : 'light';
  document.documentElement.classList.toggle('reduce-motion', !!PREFS.reduceMotion);
}

function bindEvents() {
  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { switchTab(tab.dataset.tab); A.click(); return; }
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled || btn.tagName === 'SELECT' || btn.tagName === 'INPUT') return;
    A.click();
    A.run(btn.dataset.action, btn.dataset);
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-action]');
    if (!el || (el.tagName !== 'SELECT' && el.tagName !== 'INPUT')) return;
    const value = el.type === 'checkbox' ? el.checked : el.value;
    // A changed select can be re-rendered right away; typing in inputs cannot.
    if (el.tagName === 'SELECT') el.blur();
    A.run(el.dataset.action, { ...el.dataset, value, files: el.files });
  });
  document.addEventListener('input', e => {
    if (e.target.matches?.('[data-lf]')) { lfInput(e.target); return; }
    if (e.target.matches?.('[data-market-search]')) { marketSearch(e.target); return; }
    if (e.target.matches?.('[data-gp]')) { ui.gp[e.target.dataset.gp] = e.target.value; patchGoodPct(e.target); return; }
    const el = e.target.closest('input[type="range"][data-action]');
    if (el) A.run(el.dataset.action, { ...el.dataset, value: el.value });
  });
}

export function switchTab(tab) {
  if (!tabVisible(tab)) return;
  active = tab;
  S.flags.visited[tab] = true;
  lastSig = null;
  frame(true);
  document.getElementById('panel').scrollTop = 0;
}

export function setUiOption(key, value) {
  ui[key] = value;
  if (key === 'marketSet' || key === 'marketSort') ui.marketPage = 0;
  lastSig = null;
}

export function uiOption(key) { return ui[key]; }

export function setMarketPage(page) { ui.marketPage = page; lastSig = null; }

function pager(page, pages, total, size) {
  return `<div class="pager">
    <label class="inline">Per page <select data-action="market-page-size">
      ${PAGE_SIZES.map(n => `<option value="${n}" ${n === size ? 'selected' : ''}>${n || 'All'}</option>`).join('')}
    </select></label>
    <span class="grow"></span>
    ${pages > 1 ? `
    <button class="small" data-action="market-page" data-page="${page - 1}" ${page <= 0 ? 'disabled' : ''} aria-label="Previous page">‹</button>
    <span class="muted">${page + 1} / ${pages}</span>
    <button class="small" data-action="market-page" data-page="${page + 1}" ${page >= pages - 1 ? 'disabled' : ''} aria-label="Next page">›</button>` : `<span class="muted">${total} cards</span>`}
  </div>`;
}

function tabVisible(tab) {
  if (tab === 'shop' || tab === 'settings') return true;
  return !!S.unlocked[tab];
}

// ---------- Frame ----------
// Short notice at the bottom of the screen. Fades out on its own.
let toastTimer = 0;
export function toast(key) { toastText(TOASTS[key] || key); }
export function toastText(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// `idle` is the main loop's own refresh: heavy panels (minRenderMs) then
// rebuild at most that often; their live numbers are still patched.
let lastRenderAt = 0;
export function frame(force = false, idle = false) {
  updateHeader();
  for (const b of document.querySelectorAll('#tabs .tab')) {
    const vis = tabVisible(b.dataset.tab);
    b.hidden = !vis;
    b.classList.toggle('active', b.dataset.tab === active);
    b.classList.toggle('fresh', vis && !S.flags.visited[b.dataset.tab] && b.dataset.tab !== 'settings' && b.dataset.tab !== 'shop');
  }
  const tab = PANELS[active];
  const sig = active + '|' + tab.sig();
  const panel = document.getElementById('panel');
  const due = !idle || !tab.minRenderMs || performance.now() - lastRenderAt >= tab.minRenderMs;
  if (force || (sig !== lastSig && due)) {
    const focused = panel.contains(document.activeElement) && document.activeElement.matches('input, select');
    if (!focused || force) {
      panel.innerHTML = tab.html();
      lastSig = sig;
      lastRenderAt = performance.now();
      mountScene(document.getElementById('floor'));
    }
  }
  patch(panel, tab.vals ? tab.vals() : {});
  if (tab.live) tab.live(panel);
  updateTutorial();
}

function patch(root, vals) {
  for (const el of root.querySelectorAll('[data-k]')) {
    const v = vals[el.dataset.k];
    if (v !== undefined && el.textContent !== String(v)) el.textContent = v;
  }
  for (const el of root.querySelectorAll('[data-html]')) {
    const v = vals[el.dataset.html];
    if (v !== undefined && el._html !== v) { el.innerHTML = v; el._html = v; }
  }
  for (const el of root.querySelectorAll('[data-w]')) {
    const v = vals[el.dataset.w];
    if (v !== undefined) el.style.width = `${Math.max(0, Math.min(100, v * 100))}%`;
  }
  for (const el of root.querySelectorAll('[data-d]')) {
    const v = vals['d:' + el.dataset.d];
    if (v !== undefined) el.disabled = !!v;
  }
  for (const el of root.querySelectorAll('[data-cost]')) {
    if (el.dataset.d) continue;
    el.disabled = S.money < Number(el.dataset.cost) - 1e-9;
  }
}

// Money counts to its new value in a short, smooth tween (~180 ms).
const MONEY_TWEEN_MS = 180;
let moneyTween = null;
function setMoneyText(v) { document.getElementById('money').textContent = fmtMoney(v); }
function animateMoney(target) {
  if (shownMoney === null || PREFS.reduceMotion || Math.abs(target - shownMoney) < 0.005) {
    shownMoney = target;
    moneyTween = null;
    setMoneyText(target);
    return;
  }
  if (moneyTween && moneyTween.to === target) {
    // Background tabs pause animation frames: snap instead of lagging behind.
    if (performance.now() - moneyTween.start > MONEY_TWEEN_MS + 50) {
      shownMoney = target;
      moneyTween = null;
      setMoneyText(target);
    }
    return;
  }
  moneyTween = { from: shownMoney, to: target, start: performance.now() };
  const step = now => {
    if (!moneyTween || moneyTween.to !== target) return;
    const t = Math.min(1, (now - moneyTween.start) / MONEY_TWEEN_MS);
    shownMoney = moneyTween.from + (target - moneyTween.from) * (1 - (1 - t) * (1 - t));
    setMoneyText(shownMoney);
    if (t < 1) requestAnimationFrame(step);
    else { shownMoney = target; moneyTween = null; }
  };
  requestAnimationFrame(step);
}

function updateHeader() {
  animateMoney(S.money);
  document.getElementById('day-label').textContent = S.day ? M.dayLabel(S.day, S.firstDay) : '';
  document.getElementById('day-next').textContent = fmtClock(M.msUntilNextDay(Clock.now()));
  const ac = document.getElementById('awards-count');
  const at = `${Object.keys(S.achievements).length}/${Achievements.list(SETS).length}`;
  if (ac.textContent !== at) ac.textContent = at;
  const n = unreadCount();
  const badge = document.getElementById('news-count');
  badge.hidden = !n;
  if (badge.textContent !== String(n)) badge.textContent = n;
}

// ---------- News (patch notes + game notices) ----------
// Two tabs (Nicolas, 2026-11-28): Game news (the shop's notices, plus the next
// release) and Updates (the changelog, always complete). Collection notes with
// `requires` are not changelog: their text joins that collection's release notice.
const visibleNotes = () => NEWS.filter(n => !n.requires);
export const unreadCount = () => G.unreadNotices(S) + visibleNotes().filter(n => !S.newsSeen.includes(n.id)).length;

// Each tab shows its NEWS_SHOWN newest items, or every unread one if there are
// more, and a Read more button for the rest (Nicolas, 2026-11-28).
const NEWS_SHOWN = 5;
let newsMore = { game: false, updates: false };
let newsTab = 'game';
// What was unread when the panel opened: opening marks everything read, and
// switching tabs must not clear the dots.
let newsUnread = { inboxRead: 0, seen: new Set() };
export function setNewsMore(sec) { newsMore[sec] = true; }
export function setNewsTab(tab) { if (tab === 'game' || tab === 'updates') newsTab = tab; }
export function resetNewsMore() {
  newsMore = { game: false, updates: false };
  newsUnread = { inboxRead: S.inboxRead, seen: new Set(S.newsSeen) };
  const gameUnread = G.unreadNotices(S), updUnread = visibleNotes().filter(n => !S.newsSeen.includes(n.id)).length;
  newsTab = !gameUnread && updUnread ? 'updates' : 'game';
}

function newsList(key, items, isUnread, itemHtml, emptyOk = false) {
  if (!items.length) return emptyOk ? '' : '<div class="muted">—</div>';
  const unread = items.filter(isUnread).length;
  const n = newsMore[key] ? items.length : Math.max(NEWS_SHOWN, unread);
  return `${items.slice(0, n).map(it => itemHtml(it, isUnread(it))).join('')}
    ${items.length > n ? `<button class="link more" data-action="news-more" data-sec="${key}">Read more</button>` : ''}`;
}

const releaseNote = title => NEWS.find(n => n.requires && n.title === title);

export function newsHtml() {
  const notes = visibleNotes().slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const card = (title, meta, text, unread) => `
      <article class="note ${unread ? 'unread' : ''}">
        <div class="note-head"><b>${esc(title)}</b><span class="muted">${esc(meta)}</span></div>
        ${text ? `<p>${esc(text)}</p>` : ''}
      </article>`;
  const gameUnread = n => n.id > newsUnread.inboxRead;
  const updUnread = n => !newsUnread.seen.has(n.id);
  const count = (items, f) => { const c = items.filter(f).length; return c ? ` <span class="news-count">${c}</span>` : ''; };
  const next = G.nextRelease(S, SETS);
  const nextHtml = next && S.firstDay != null
    ? card(`Next: ${next.name}`, M.dayLabel(SU.releaseDay(S, next), S.firstDay), releaseNote(`${next.name} is out`)?.text || '', false) : '';
  const tab = (k, label, badge) => `<button class="tab ${newsTab === k ? 'active' : ''}" role="tab" aria-selected="${newsTab === k}" data-action="news-tab" data-news="${k}">${label}${badge}</button>`;
  const body = newsTab === 'game'
    ? nextHtml + newsList('game', S.inbox, gameUnread, (n, u) => {
      const extra = n.kind === 'release' ? releaseNote(n.text)?.text : '';
      return card(n.text, n.day ? M.dayLabel(n.day, S.firstDay) : '', [extra, n.detail].filter(Boolean).join(' '), u);
    }, !!nextHtml)
    : newsList('updates', notes, updUnread,
      (n, u) => card(n.title, `${n.version ? `${n.version} · ` : ''}${n.date || ''}`, n.text, u));
  return `
  <div class="modal news-panel">
    <button class="modal-x" data-action="close" aria-label="Close">×</button>
    <h2>News</h2>
    <nav class="tabs news-tabs" role="tablist">${tab('game', 'Game news', count(S.inbox, gameUnread))}${tab('updates', 'Updates', count(notes, updUnread))}</nav>
    <section class="news-sec" role="tabpanel">${body}</section>
    <div class="btns end"><button class="primary" data-action="close">Done</button></div>
  </div>`;
}

// ---------- Awards ----------
export function awardsHtml() {
  const all = Achievements.list(SETS);
  const got = all.filter(a => S.achievements[a.id] != null).length;
  return `
  <div class="modal awards-panel">
    <button class="modal-x" data-action="close" aria-label="Close">×</button>
    <h2>Awards <span class="muted">${got} / ${all.length}</span></h2>
    <ul class="awards">${all.map(a => {
      const day = S.achievements[a.id];
      return `<li class="${day != null ? 'got' : ''}"><span class="aw-mark" aria-hidden="true">${day != null ? '★' : '☆'}</span>
        <span><b>${esc(a.name)}</b><span class="muted"> ${esc(a.desc)}</span></span>
        <span class="muted">${day != null ? esc(M.dayLabel(day, S.firstDay)) : ''}</span></li>`;
    }).join('')}</ul>
    <div class="btns end"><button class="primary" data-action="close">Done</button></div>
  </div>`;
}

export function markNewsRead() {
  G.markNoticesRead(S);
  for (const n of visibleNotes()) if (!S.newsSeen.includes(n.id)) S.newsSeen.push(n.id);
  S.flags.visited.news = true;
}

export function floatMoney(v) {
  if (PREFS.reduceMotion) return;
  const box = document.getElementById('floaters');
  const el = document.createElement('span');
  el.className = 'floater';
  el.textContent = '+' + fmtMoney(v);
  box.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

// ---------- Tutorial ----------
let lastTarget = null;
function updateTutorial() {
  const step = currentStep(S);
  const tip = document.getElementById('tip');
  if (lastTarget) { lastTarget.classList.remove('tut-target'); lastTarget = null; }
  document.querySelectorAll('.tab.tut-target').forEach(t => t.classList.remove('tut-target'));
  if (!step || !document.getElementById('overlay').hidden) { tip.hidden = true; return; }
  if (tip._id !== step.id) {
    tip.innerHTML = `<span>${esc(step.text)}</span><button class="link" data-action="skip-tutorial">Skip tutorial</button>`;
    tip._id = step.id;
  }
  tip.hidden = false;
  let target = null;
  if (step.tab && step.tab !== active) target = document.querySelector(`#tabs [data-tab="${step.tab}"]`);
  else target = document.querySelector(step.target);
  if (target) { target.classList.add('tut-target'); lastTarget = target; }
}

// ---------- Helpers ----------
const set = id => SETS[id];
// Only collections that are out are shown anywhere.
const released = () => ORDER.filter(id => G.setUnlocked(S, SETS[id]));
const releasedOr = id => (SETS[id] && G.setUnlocked(S, SETS[id]) ? id : ORDER[0]);
const setOptions = sel => released().map(id =>
  `<option value="${esc(id)}" ${id === sel ? 'selected' : ''}>${esc(SETS[id].name)}</option>`).join('');
const fmtLevel = l => (Number(l) ? `${Number(l) > 0 ? '+' : '−'}${Math.round(Math.abs(Number(l)) * 100)}%` : 'Market');
const levelOptions = sel => G.PRICE_LEVELS.map(l => `<option value="${l}" ${String(l) === String(sel) ? 'selected' : ''}>${fmtLevel(l)}</option>`).join('');
const lockSig = () => released().length;
const fmtCount = n => (n >= 995000 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(0)}K` : fmtNum(Math.floor(n)));

function staffOn(task) {
  return S.staff.filter(e => (e.task === task || e.task2 === task) && !e.training);
}
const curJob = e => G.jobsOf(e)[e._job || 0] || G.jobsOf(e)[0] || null;
const jobText = e => G.jobsOf(e).map(([t, s]) => SKILL_NAMES[t] + (SETS[s] ? ` ${SETS[s].name}` : '')).join(' / ') || '—';

function chips(task) {
  return staffOn(task).map(e => `<span class="chip" title="${esc(e.status)}">${esc(e.name)}</span>`).join('');
}

function logHtml() {
  if (!S.log.length) return '<li class="muted">—</li>';
  return S.log.slice(0, 12).map(l => `<li class="log-${esc(l.kind)}">${esc(l.text)}</li>`).join('');
}

// ---------- Panels ----------
const PANELS = {};

PANELS.shop = {
  sig: () => [S.unlocked.priceList, S.staff.length, ui.shopSet, ORDER.length, lockSig()].join(),
  html() {
    const sid = ui.shopSet = releasedOr(ui.shopSet);
    const sel = released().length > 1 ? `<select data-action="shop-set">${setOptions(sid)}</select>` : '';
    const next = G.nextRelease(S, SETS);
    return `
    <div class="floor" id="floor"></div>
    <div class="stages">
      <section class="stage" id="stage-buy">
        <h3>Distributor</h3>${sel}
        <div class="stat-big" title="${esc(TIPS.buy)}"><span data-k="bprice"></span><small> each</small></div>
        <div class="kv" title="${esc(TIPS.supply)}"><span>Supply</span><b data-k="left"></b></div>
        <div class="kv"><span>Sealed</span><b data-k="stock"></b></div>
        ${next ? `<div class="kv muted"><span>Next set: ${esc(next.name)}</span><span data-k="nextin"></span></div>` : ''}
        <div class="btns">
          <button data-action="buy" data-n="1" data-d="buy">Buy booster</button>
          <button data-action="buy" data-n="5" data-d="buy">Buy 5</button>
          <button data-action="buy" data-n="10" data-d="buy">Buy 10</button>
          <button data-action="buy" data-n="100" data-d="buy">Buy 100</button>
          <button data-action="buy" data-n="all" data-d="buy" title="${esc(TIPS.buyAll)}">Buy all</button>
        </div>
        <div class="chips" data-html="c-buy"></div>
      </section>
      <section class="stage" id="stage-open">
        <h3>Open</h3>
        <div class="stat-big" title="${esc(TIPS.open)}"><span data-k="sealed"></span><small> sealed</small></div>
        <div class="btns">
          <button data-action="open" data-n="1" data-d="open">Open 1</button>
          <button data-action="open" data-n="10" data-d="open">Open 10</button>
          <button data-action="open" data-n="100" data-d="open">Open 100</button>
          <button data-action="open" data-n="all" data-d="open">Open all</button>
        </div>
        <div class="chips" data-html="c-open"></div>
      </section>
      ${S.unlocked.priceList ? `
      <section class="stage" id="stage-price">
        <h3>Price</h3>
        <div class="stat-big"><span data-k="avail"></span><small> in binder</small></div>
        <div class="kv" title="${esc(TIPS.customers)}"><span>Showcase</span><b data-k="showcase"></b></div>
        <div class="price-opts">
          <select data-action="ui-opt" data-opt="priceQty" aria-label="Quantity">
            ${[['1', '1'], ['10', '10'], ['100', '100'], ['all', 'All']].map(([v, l]) => `<option value="${v}" ${ui.priceQty === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <select data-action="ui-opt" data-opt="priceLevel" aria-label="Price" title="${esc(TIPS.priceLevel)}">${levelOptions(ui.priceLevel)}</select>
          <select data-action="ui-opt" data-opt="priceKeep" aria-label="Keep" title="${esc(TIPS.priceKeep)}">
            ${[['0', 'Keep 0'], ['1', 'Keep 1']].map(([v, l]) => `<option value="${v}" ${ui.priceKeep === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="btns">
          <button class="primary" data-action="price" data-d="price" title="${esc(TIPS.price)}">Price</button>
          <button data-action="bulk" data-d="bulk" title="${esc(TIPS.bulk)}">Bulk <span data-k="bulkv"></span></button>
        </div>
        <div class="chips" data-html="c-price"></div>
      </section>` : ''}
    </div>
    <div class="lower">
      <section class="box"><h3>Recent</h3><ul class="log" data-html="log"></ul></section>
      ${S.staff.length ? `<section class="box"><h3>Staff</h3><ul class="staff-mini" data-html="staffmini"></ul></section>` : ''}
    </div>`;
  },
  vals() {
    const st = set(releasedOr(ui.shopSet));
    const price = G.boosterPrice(S, st);
    const sup = G.supply(S, st);
    const out = G.soldOut(S, st);
    const full = G.storageFree(S) < 1 || !G.setUnlocked(S, st) || out;
    const next = G.nextRelease(S, SETS);
    const days = next ? SU.releaseDay(S, next) - S.day : 0;
    const keep = Number(ui.priceKeep) || 0;
    let avail = 0;
    for (const cards of Object.values(S.binder)) for (const n of Object.values(cards)) if (n > keep) avail += n - keep;
    const bulk = S.unlocked.priceList ? G.bulkSpares(S, SETS, keep) : { n: 0, total: 0 };
    return {
      bprice: fmtMoney(price),
      left: out ? 'sold out' : fmtNum(sup.left),
      nextin: days > 1 ? `${days} days` : days === 1 ? 'tomorrow' : 'soon',
      stock: `${fmtNum(G.storageUsed(S))} / ${fmtNum(G.stockCapacity(S))}`,
      sealed: fmtNum(S.stock[st.id] || 0),
      avail: fmtNum(avail),
      showcase: `${fmtNum(S.showcase.length)} / ${fmtNum(G.showcaseCapacity(S))}`,
      bulkv: bulk.n ? fmtMoney(bulk.total) : '',
      'd:buy': full || S.money < price,
      'd:open': !(S.stock[st.id] > 0),
      'd:price': !avail || !G.freeSlots(S),
      'd:bulk': !bulk.n,
      'c-buy': chips('buy'), 'c-open': chips('open'), 'c-price': chips('price'),
      log: logHtml(),
      staffmini: S.staff.map(e => `<li><b>${esc(e.name)}</b> <span class="muted">${esc(jobText(e))}</span> <span class="status st-${esc(e.status.replace(/\s/g, '-'))}">${esc(e.status)}</span></li>`).join(''),
    };
  },
};

PANELS.binder = {
  sig() {
    const st = set(ui.binderSet = releasedOr(ui.binderSet));
    const seen = G.collectionProgress(S, st).seen;
    // Copies change all the time under automation; live() patches them, so
    // only a newly seen card rebuilds the grid.
    return [ui.binderSet, seen, lockSig()].join();
  },
  live(panel) {
    const binder = S.binder[ui.binderSet] || {};
    const seen = S.seen[ui.binderSet] || {};
    for (const el of panel.querySelectorAll('[data-bn]')) {
      const n = binder[el.dataset.bn] || 0;
      if (el._n === n) continue;
      el._n = n;
      el.textContent = `×${n}`;
      el.hidden = !n;
      el.closest('.card')?.classList.toggle('not-owned', !!seen[el.dataset.bn] && !n);
    }
  },
  html() {
    const st = set(ui.binderSet);
    const prog = G.collectionProgress(S, st);
    const bonus = G.milestoneBonus(S, st);
    const binder = S.binder[st.id] || {};
    const seen = S.seen[st.id] || {};
    const next = G.MILESTONES.find(m => prog.frac < m.at);
    return `
    <div class="bar-head">
      ${released().length > 1 ? `<select data-action="binder-set">${setOptions(st.id)}</select>` : `<h2>${esc(st.name)}</h2>`}
      <span class="grow"></span>
      <span title="${esc(TIPS.milestone)}">${bonus ? `+${Math.round(bonus * 100)}% sale price` : ''}${next ? ` <span class="muted">· next at ${Math.round(next.at * 100)}%</span>` : ''}</span>
    </div>
    <div class="progress-line"><div class="progress"><i style="width:${(prog.frac * 100).toFixed(1)}%"></i></div><span>${prog.seen} / ${prog.total}</span></div>
    <div class="binder-grid">${st.cards.map(c => {
      const n = binder[c.id] || 0;
      return `<button class="binder-slot" data-action="card" data-s="${esc(st.id)}" data-c="${esc(c.id)}" ${seen[c.id] ? '' : 'disabled'}>
        ${cardHtml(st, c, { size: 'sm', unseen: !seen[c.id], extraClass: seen[c.id] && !n ? 'not-owned' : '', badge: seen[c.id] ? `<span class="badge-count" data-bn="${esc(c.id)}" ${n ? '' : 'hidden'}>×${n}</span>` : '' })}
      </button>`;
    }).join('')}</div>`;
  },
};

PANELS.showcase = {
  sig: () => [S.showcase.length, S.day, S.showcase[0]?.c].join(),
  minRenderMs: 2000, // sales change it every second at full speed
  html() {
    const groups = new Map();
    for (const it of S.showcase) {
      const k = `${it.s}:${it.c}:${it.p}`;
      const g = groups.get(k) || { it, n: 0 };
      g.n++;
      groups.set(k, g);
    }
    const rows = [...groups.values()].sort((a, b) => b.it.p - a.it.p);
    return `
    <div class="bar-head">
      <h2>Showcase <span class="muted" data-k="count"></span></h2>
      <span class="grow"></span>
      <button data-action="recall" ${S.showcase.length ? '' : 'disabled'} title="${esc(TIPS.recall)}">Recall all</button>
    </div>
    <div class="table showcase-table">
      <div class="tr th"><span></span><span>Card</span><span class="num">#</span><span>Collection</span><span class="num">Tag</span><span class="num">Market</span><span class="num">Customers</span></div>
      ${rows.map(({ it, n }) => {
        const st = SETS[it.s], c = st.byId[it.c];
        const mv = G.marketValue(S, st, c);
        const off = it.p / mv - 1;
        return `<div class="tr">
          ${cardHtml(st, c, { size: 'xs' })}
          <span>${rarityTag(st, c)} ${esc(c.name)} ${n > 1 ? `<span class="muted">×${n}</span>` : ''}</span>
          <span class="num muted">${esc(c.number || String(c.index))}</span>
          <span class="muted">${esc(st.name)}</span>
          <span class="num">${fmtMoney(it.p)}</span>
          <span class="num muted">${fmtMoney(mv)}</span>
          ${feelingTag(G.feeling(it.p, mv), Math.abs(off) < 0.005 ? 'market' : fmtPct(off))}
        </div>`;
      }).join('') || '<div class="empty muted">Empty</div>'}
    </div>
    <section class="box customers" id="customers">
      <div class="bar-head"><h3 title="${esc(TIPS.feelings)}">Customers</h3><span class="grow"></span><span class="feel-sum" data-html="feelsum"></span></div>
      <ul class="log feel-log" data-html="feellog"></ul>
    </section>`;
  },
  vals() {
    const { total } = G.feedbackSummary(S);
    const pct = k => (total.looks ? Math.round((total[k] / total.looks) * 100) : 0);
    const recent = (S._feedback || []).slice(-12).reverse();
    const miss = total.missed ? `<span class="feel feel-steep">✕ wanted new set ${Math.round((total.missed / (total.missed + total.looks)) * 100)}%</span>` : '';
    return {
      count: `${fmtNum(S.showcase.length)} / ${fmtNum(G.showcaseCapacity(S))}`,
      feelsum: total.looks
        ? G.FEELINGS.map(f => `<span class="feel feel-${f.key}">${esc(FEELING_TEXT[f.key])} ${pct(f.key)}%</span>`).join('') + miss
        : miss,
      feellog: recent.map(e => {
        const st = SETS[e.s];
        if (e.miss) return st ? `<li><span class="feel feel-steep">✕ wanted ${esc(st.name)}</span> <span class="muted">left</span></li>` : '';
        const c = st?.byId[e.c];
        if (!c) return '';
        return `<li>${rarityTag(st, c)} ${esc(c.name)} <span class="num">${fmtMoney(e.p)}</span> ${feelingTag(e.f)} <span class="muted">${e.b ? 'bought' : 'passed'}</span></li>`;
      }).join('') || '<li class="muted">no customers yet</li>',
    };
  },
};

// Feeling as a word plus a symbol, never color alone.
const FEEL_ICON = { cheap: '▼', fair: '●', pricey: '▲', steep: '▲▲' };
function feelingTag(f, title = '') {
  return `<span class="feel feel-${f}" ${title ? `title="${esc(title)}"` : ''}>${FEEL_ICON[f]} ${esc(FEELING_TEXT[f])}</span>`;
}

function sparkline(values, w = 90, h = 24) {
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(' ');
  const up = values[values.length - 1] >= values[0];
  return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}

// "{card}" in a news template becomes the card's name, highlighted.
function newsSentence(n) {
  return esc(n.text).split('{card}').join(`<b>${esc(n.card.name)}</b>`);
}

PANELS.market = {
  sig: () => [S.day, ui.marketSet, ui.marketSort, ui.marketPage, ui.marketQuery, PREFS.marketPageSize, lockSig()].join(),
  html() {
    const ids = released();
    ui.marketSet = 'all';
    const shownSets = ids.map(set);
    const day = S.day;
    const match = cardFilter(ui.marketQuery);
    const rows = [];
    for (const st of shownSets) {
      for (const c of st.cards) {
        if (!match(c, st)) continue;
        const hist = M.history(st, c, day, 30);
        const now = hist[hist.length - 1];
        rows.push({ st, c, now, d1: now / hist[hist.length - 2] - 1, d7: now / hist[hist.length - 8] - 1, hist });
      }
    }
    const sorters = {
      number: (a, b) => a.st.releaseIndex - b.st.releaseIndex || a.c.index - b.c.index,
      price: (a, b) => b.now - a.now,
      d1: (a, b) => b.d1 - a.d1,
      d7: (a, b) => b.d7 - a.d7,
    };
    rows.sort(sorters[ui.marketSort] || sorters.number);
    const size = PAGE_SIZES.includes(PREFS.marketPageSize) ? PREFS.marketPageSize : 25;
    const pages = size ? Math.max(1, Math.ceil(rows.length / size)) : 1;
    ui.marketPage = Math.min(Math.max(0, ui.marketPage), pages - 1);
    const shown = size ? rows.slice(ui.marketPage * size, (ui.marketPage + 1) * size) : rows;
    const pagerHtml = pager(ui.marketPage, pages, rows.length, size);
    const news = [];
    for (const st of shownSets) for (const c of st.cards) news.push(...M.newsFor(st, c, day, 3));
    news.sort((a, b) => b.day - a.day);
    const many = shownSets.length > 1;
    return `
    <div class="bar-head market-filters">
      <input type="search" class="market-search" data-market-search placeholder="Search" aria-label="Search" title="${esc(TIPS.search)}" value="${esc(ui.marketQuery)}">
      <span class="grow"></span>
      <label class="inline">Sort <select data-action="market-sort">
        ${[['number', 'Number'], ['price', 'Price'], ['d1', '1 day'], ['d7', '7 days']].map(([k, v]) => `<option value="${k}" ${ui.marketSort === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select></label>
    </div>
    <section class="box boosters">
      <h3>Boosters</h3>
      <div class="table booster-table">
        <div class="tr th"><span>Collection</span><span class="num" title="${esc(TIPS.buy)}">Distributor</span><span class="num" title="${esc(TIPS.boosterMarket)}">Market</span><span class="num">7d</span><span class="num" title="${esc(TIPS.supply)}">Supply</span><span class="num">Yours</span><span></span></div>
        ${shownSets.map(st => {
          const id = esc(st.id);
          return `<div class="tr">
          <span>${esc(st.name)}</span>
          <span class="num muted" data-k="bd-${id}"></span>
          <span class="num" data-k="bp-${id}"></span>
          <span class="num" data-html="b7-${id}"></span>
          <span class="num" data-k="bs-${id}" title="${esc(TIPS.supply)}"></span>
          <span class="num" data-k="by-${id}"></span>
          <span class="btns tight">
            <button class="small" data-action="buy-market-booster" data-set="${id}" data-d="bb-${id}" title="${esc(TIPS.marketBuy)}">Buy <span data-k="bbp-${id}"></span></button>
            <button class="small" data-action="sell-booster" data-set="${id}" data-n="1" data-d="bl-${id}" title="${esc(TIPS.marketSell)}">Sell <span data-k="blp-${id}"></span></button>
            <button class="small" data-action="sell-booster" data-set="${id}" data-n="10" data-d="bl-${id}" title="${esc(TIPS.marketSell)}">Sell 10</button>
          </span>
        </div>`;
        }).join('')}
      </div>
    </section>
    ${news.length ? `<section class="box news"><h3>Card news</h3><ul>${news.slice(0, 8).map(n =>
      `<li class="${n.kind}">${newsSentence(n)}${many ? ` <span class="muted">${esc(n.set.name)}</span>` : ''} <span class="muted">${esc(M.dayLabel(n.day, S.firstDay))}</span></li>`).join('')}</ul></section>` : ''}
    ${pagerHtml}
    <div class="table market-table">
      <div class="tr th"><span></span><span class="num">#</span><span>Card</span><span>Collection</span><span class="num">Today</span><span class="num">1d</span><span class="num">7d</span><span>30d</span><span></span></div>
      ${shown.map(r => {
        const cost = r.now * G.MARKET_BUY_RATE;
        const ref = `data-s="${esc(r.st.id)}" data-c="${esc(r.c.id)}"`;
        return `<div class="tr">
          <button class="thumb" data-action="card" ${ref} aria-label="${esc(r.c.name)}">${cardHtml(r.st, r.c, { size: 'xs' })}</button>
          <span class="num muted">${esc(r.c.number || String(r.c.index))}</span>
          <span>${rarityTag(r.st, r.c)} ${esc(r.c.name)}</span>
          <span class="muted">${esc(r.st.name)}</span>
          <span class="num">${fmtMoney(r.now)}</span>
          <span class="num ${r.d1 >= 0 ? 'up' : 'down'}">${fmtPct(r.d1)}</span>
          <span class="num ${r.d7 >= 0 ? 'up' : 'down'}">${fmtPct(r.d7)}</span>
          <span>${sparkline(r.hist)}</span>
          <span><button class="small" data-action="buy-single" ${ref} data-cost="${cost}" title="${esc(TIPS.single)}">Buy ${fmtMoney(cost)}</button></span>
        </div>`;
      }).join('') || '<div class="empty muted">No cards</div>'}
    </div>
    ${pages > 1 ? pagerHtml : ''}`;
  },
  vals() {
    const v = {};
    for (const id of released()) {
      if (ui.marketSet !== 'all' && ui.marketSet !== id) continue;
      const st = set(id), m = G.supply(S, st);
      const p = G.marketBoosterValue(S, st);
      const ch = p / SU.marketValueAgo(st, m, S.day, 7) - 1;
      v[`bd-${id}`] = G.soldOut(S, st) ? 'sold out' : fmtMoney(G.boosterPrice(S, st));
      v[`bp-${id}`] = fmtMoney(p);
      v[`b7-${id}`] = `<span class="${ch >= 0 ? 'up' : 'down'}">${fmtPct(ch)}</span>`;
      v[`bs-${id}`] = G.soldOut(S, st) ? 'sold out' : `${fmtNum(m.left)} / ${fmtCount(m.printed)}`;
      v[`by-${id}`] = fmtNum(S.stock[id] || 0);
      v[`bbp-${id}`] = fmtMoney(G.marketBoosterBuyPrice(S, st));
      v[`blp-${id}`] = fmtMoney(G.marketBoosterSellPrice(S, st));
      v[`d:bb-${id}`] = !G.canBuyMarketBooster(S, st);
      v[`d:bl-${id}`] = !(S.stock[id] > 0);
    }
    return v;
  },
};

// Search box: redraw the Market as the player types, keeping focus and caret.
let searchTimer = null;
function marketSearch(input) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    ui.marketQuery = input.value;
    ui.marketPage = 0;
    frame(true);
    const box = document.querySelector('[data-market-search]');
    if (box) { box.focus(); const n = box.value.length; box.setSelectionRange(n, n); }
  }, 150);
}
// One job row: action and collection. "Any" follows the shop rules for Buy and
// Open, and takes every collection for Price.
function jobRow(e, slot) {
  const task = slot === 2 ? e.task2 : e.task, sid = slot === 2 ? e.set2 : e.set;
  return `<div class="job">
    <span class="muted small" title="${esc(slot === 2 ? TIPS.jobBackup : TIPS.jobMain)}">${slot === 2 ? 'Backup' : 'Job'}</span>
    <select data-action="job" data-id="${e.id}" data-slot="${slot}" aria-label="${slot === 2 ? 'Backup job' : 'Job'}">
      <option value="" ${!task ? 'selected' : ''}>None</option>
      ${G.SKILL_KEYS.map(k => `<option value="${k}" ${task === k ? 'selected' : ''}>${SKILL_NAMES[k]}</option>`).join('')}
    </select>
    <select data-action="job-set" data-id="${e.id}" data-slot="${slot}" aria-label="Collection" ${task ? '' : 'disabled'} title="${esc(TIPS.jobSet)}">
      <option value="" ${!sid ? 'selected' : ''}>Any</option>
      ${setOptions(sid)}
    </select>
  </div>`;
}

PANELS.staff = {
  sig: () => [S.staff.length, G.maxStaff(S), ORDER.length, lockSig(),
    ...S.staff.map(e => `${e.task}/${e.set}/${e.task2}/${e.set2}/${e.training ? e.training.skill : ''}/${G.SKILL_KEYS.map(k => e.skills[k].lvl).join('.')}`)].join('|'),
  html() {
    const cost = G.hireCost(S.staff.length);
    const room = S.staff.length < G.maxStaff(S);
    const r = S.rules;
    return `
    <div class="bar-head">
      <h2>Staff <span class="muted">${S.staff.length} / ${G.maxStaff(S)}</span></h2>
      ${S.staff.length ? `<span class="muted" title="${esc(TIPS.salary)}">Payroll <span data-k="payroll"></span>/day</span>` : ''}
      <span class="grow"></span>
      ${room ? `<button class="primary" data-action="hire" data-cost="${cost}">Hire ${fmtMoney(cost)}</button>` : '<span class="muted">No free slot</span>'}
    </div>
    <div class="emps">${S.staff.map(e => `
      <section class="emp box" data-id="${e.id}">
        <div class="emp-head">
          <b>${esc(e.name)}</b>
          <span class="status" data-k="st-${e.id}"></span>
          <span class="grow"></span>
          <span class="muted small" title="${esc(TIPS.salary)}"><span data-k="sal-${e.id}"></span>/day</span>
        </div>
        <div class="jobs">${[1, 2].map(slot => jobRow(e, slot)).join('')}</div>
        <div class="progress thin"><i data-w="pg-${e.id}"></i></div>
        <div class="skills" title="${esc(TIPS.skillSpeed)}">${G.SKILL_KEYS.map(k => {
          const sk = e.skills[k];
          const max = sk.lvl >= G.MAX_SKILL;
          const tc = G.trainCost(sk.lvl);
          return `<div class="skill ${e.task === k || e.task2 === k ? 'on' : ''}">
            <span class="sk-name">${SKILL_NAMES[k]}</span>
            <span class="sk-lvl">Lv ${sk.lvl}</span>
            <span class="progress thin sk-xp"><i data-w="xp-${e.id}-${k}"></i></span>
            <span class="muted sk-time">${fmtSec(G.skillDuration(k, sk.lvl))}</span>
            ${max ? '<span class="muted">Max</span>' : `<button class="small" data-action="train" data-id="${e.id}" data-skill="${k}" data-d="tr-${e.id}-${k}">Train ${fmtMoney(tc)}</button>`}
          </div>`;
        }).join('')}</div>
      </section>`).join('') || '<div class="empty muted">No staff yet</div>'}
    </div>
    <section class="box rules">
      <h3>Shop rules</h3>
      <div class="rules-grid">
        ${released().length > 1 ? `
        <label>Buyer collection <select data-action="rule" data-rule="buySet">${setOptions(r.buySet)}</select></label>
        <label>Opener collection <select data-action="rule" data-rule="openSet">${setOptions(r.openSet)}</select></label>` : ''}
        <label title="${esc(TIPS.stockTarget)}">Stock target <input type="number" min="0" step="1" data-action="rule" data-rule="stockTarget" value="${r.stockTarget}"></label>
        <label title="${esc(TIPS.cashReserve)}">Cash reserve <input type="number" min="0" step="1" data-action="rule" data-rule="cashReserve" value="${r.cashReserve}"></label>
        <label title="${esc(TIPS.bulkBelow)}">Bulk below <input type="number" min="0" step="0.05" data-action="rule" data-rule="bulkBelow" value="${r.bulkBelow}"></label>
        <label title="${esc(TIPS.keepCopies)}">Keep copies <input type="number" min="0" step="1" data-action="rule" data-rule="keepCopies" value="${r.keepCopies}"></label>
        <label title="${esc(TIPS.priceLevel)}">Staff price <select data-action="rule" data-rule="priceLevel">${levelOptions(r.priceLevel)}</select></label>
      </div>
    </section>`;
  },
  vals() {
    const v = { payroll: fmtMoney(G.payroll(S)) };
    for (const e of S.staff) {
      v[`sal-${e.id}`] = fmtMoney(G.salaryPerDay(S, e));
      v[`st-${e.id}`] = e.training ? `training ${fmtDuration(e.training.left)}` : e.status;
      if (e.training) v[`pg-${e.id}`] = 1 - e.training.left / e.training.total;
      else if (curJob(e) && (e.status === 'working' || e.status === 'backup job')) v[`pg-${e.id}`] = Math.min(1, e.progress / G.skillDuration(curJob(e)[0], e.skills[curJob(e)[0]].lvl));
      else v[`pg-${e.id}`] = 0;
      for (const k of G.SKILL_KEYS) {
        const sk = e.skills[k];
        v[`xp-${e.id}-${k}`] = sk.lvl >= G.MAX_SKILL ? 1 : sk.xp / G.xpToNext(sk.lvl);
        v[`d:tr-${e.id}-${k}`] = !G.canTrain(S, e, k);
      }
    }
    return v;
  },
};

PANELS.upgrades = {
  sig: () => Object.values(S.upgrades).join(),
  html() {
    return `<div class="upgrades">${Object.keys(G.UPGRADES).map(k => {
      const lvl = S.upgrades[k], def = G.UPGRADES[k], txt = UPGRADE_TEXT[k];
      const max = lvl >= def.max;
      const cost = G.upgradeCost(k, lvl);
      return `<section class="box upgrade">
        <div><b>${esc(txt.name)}</b><div class="muted">${esc(txt.effect)}${k === 'storage' ? ` · ${fmtNum(G.storageAt(lvl))}${max ? '' : ` → ${fmtNum(G.storageAt(lvl + 1))}`}` : ''}</div></div>
        <span class="muted">Lv ${lvl + (def.start || 0)} / ${def.max + (def.start || 0)}</span>
        ${max ? '<span class="muted">Max</span>' : `<button data-action="upgrade" data-key="${k}" data-cost="${cost}">${fmtMoney(cost)}</button>`}
      </section>`;
    }).join('')}</div>`;
  },
};

// ---------- Storage: sealed goods and accessories ----------
const goodKeys = () => [
  ...released().map(id => `b:${id}`),
  ...released().map(id => `x:${id}`),
  ...G.accessories().map(a => `a:${a.id}`),
];
const goodName = g => G.goodInfo(SETS, g)?.name || g;
function goodPrice(g) {
  const typed = Number(ui.gp[g]);
  if (ui.gp[g] != null && typed > 0) return typed;
  return Math.round(G.goodValue(S, SETS, g) * (1 + Number(ui.goodLevel)) * 100) / 100;
}
const pctText = (p, v) => (v > 0 ? (Math.abs(p / v - 1) < 0.005 ? '0%' : fmtPct(p / v - 1)) : '');
function patchGoodPct(input) {
  const g = input.dataset.gp;
  const el = document.querySelector(`[data-gpct="${CSS.escape(g)}"]`);
  if (el) el.textContent = pctText(Number(input.value), G.goodValue(S, SETS, g));
}
export function goodPriceFor(g) { return goodPrice(g); }

function goodTile(g) {
  const info = G.goodInfo(SETS, g);
  const k = esc(g);
  const buy = info.kind === 'x'
    ? `<button class="small" data-action="box-buy" data-set="${esc(info.set.id)}" data-d="xb-${k}" title="${esc(TIPS.box)}">Buy <span data-k="xbp-${k}"></span></button>
       <button class="small" data-action="box-open" data-set="${esc(info.set.id)}" data-d="xo-${k}" title="${esc(TIPS.openBox)}">Open</button>`
    : info.kind === 'a'
      ? `<button class="small" data-action="acc-buy" data-id="${esc(info.acc.id)}" data-n="1" data-cost="${info.acc.cost}">Buy ${fmtMoney(info.acc.cost)}</button>
         <button class="small" data-action="acc-buy" data-id="${esc(info.acc.id)}" data-n="10" data-cost="${info.acc.cost * 10}">Buy 10</button>`
      : '';
  return `<article class="good box">
    <header><b>${esc(info.kind === 'a' ? info.name : info.set.name)}</b></header>
    <dl class="good-stats">
      <div><dt>Yours</dt><dd data-k="go-${k}"></dd></div>
      <div><dt>Market</dt><dd data-k="gv-${k}"></dd></div>
    </dl>
    <div class="good-price">
      <span class="money-in"><span>$</span><input type="number" min="0.01" step="0.01" class="gp" data-gp="${k}" value="${goodPrice(g).toFixed(2)}" aria-label="Price" title="${esc(TIPS.goodPrice)}"></span>
      <span class="pct muted" data-gpct="${k}">${pctText(goodPrice(g), G.goodValue(S, SETS, g))}</span>
    </div>
    <div class="btns tight">
      <button class="small" data-action="good-list" data-g="${k}" data-n="1" data-d="gl-${k}">List</button>
      <button class="small" data-action="good-list" data-g="${k}" data-n="10" data-d="gl-${k}">List 10</button>
      <button class="small" data-action="good-list" data-g="${k}" data-n="all" data-d="gl-${k}">List all</button>
    </div>
    ${buy ? `<div class="btns tight good-buy">${buy}</div>` : ''}
  </article>`;
}

PANELS.storage = {
  sig: () => [S.day, lockSig(), ui.goodLevel, G.accessories().length, S.shelf.length,
    S.shelf.map(it => `${it.g}@${it.p}`).join(';')].join('|'),
  html() {
    const keys = goodKeys();
    const section = (title, list) => list.length ? `<section class="goods"><h3>${title}</h3><div class="goods-grid">${list.map(goodTile).join('')}</div></section>` : '';
    return `
    <div class="bar-head">
      <h2>Storage <span class="muted" title="${esc(TIPS.space)}" data-k="space"></span></h2>
      <span class="grow"></span>
      <label class="inline">Price <select data-action="good-level">${levelOptions(ui.goodLevel)}</select></label>
    </div>
    <section class="box shelf">
      <div class="bar-head"><h3 title="${esc(TIPS.shelf)}">Shelf <span data-k="shelf-n"></span></h3><span class="grow"></span>
        ${S.shelf.length ? '<button class="small" data-action="shelf-recall">Recall all</button>' : ''}</div>
      ${S.shelf.length ? `<div class="shelf-items">${S.shelf.map((it, i) => `<div class="shelf-item">
        <span class="shelf-name">${esc(goodName(it.g))}</span>
        <span class="muted">×<span data-k="sn-${i}"></span></span>
        <b>${fmtMoney(it.p)}</b>
        <span class="muted" data-k="sp-${i}"></span>
        <button class="small" data-action="shelf-take" data-i="${i}" aria-label="Recall">Recall</button>
      </div>`).join('')}</div>` : '<div class="empty muted">Empty</div>'}
    </section>
    ${section('Boosters', keys.filter(g => g.startsWith('b:')))}
    ${section('Booster boxes', keys.filter(g => g.startsWith('x:')))}
    ${section('Accessories', keys.filter(g => g.startsWith('a:')))}`;
  },
  vals() {
    const v = { 'shelf-n': `${fmtNum(G.shelfCount(S))} / ${fmtNum(G.shelfCapacity(S))}`, space: `${fmtNum(G.storageUsed(S))} / ${fmtNum(G.stockCapacity(S))}` };
    const free = G.shelfFree(S) > 0;
    for (const g of goodKeys()) {
      const n = G.goodsOwned(S, g);
      v[`go-${g}`] = fmtNum(n);
      v[`gv-${g}`] = fmtMoney(G.goodValue(S, SETS, g));
      v[`d:gl-${g}`] = !(n > 0 && free);
      if (g.startsWith('x:')) {
        const st = SETS[g.slice(2)];
        v[`xbp-${g}`] = fmtMoney(G.boxPrice(S, st));
        v[`d:xb-${g}`] = !G.canBuyBox(S, st);
        v[`d:xo-${g}`] = !G.canOpenBox(S, st);
      }
    }
    S.shelf.forEach((it, i) => {
      v[`sn-${i}`] = fmtNum(it.n);
      v[`sp-${i}`] = pctText(it.p, G.goodValue(S, SETS, it.g));
    });
    return v;
  },
};

// ---------- Properties: warehouses ----------
const WH_BUY = [100, 1000];
PANELS.properties = {
  sig: () => [lockSig(), G.accessories().length, S.properties.warehouses.map(w => w.level).join('.'),
    S.properties.ships.length, Object.keys(S.properties.targets).join()].join('|'),
  html() {
    const p = S.properties;
    const has = p.warehouses.length > 0;
    return `
    <div class="bar-head">
      <h2>Properties ${has ? `<span class="muted" data-k="wh-space"></span>` : ''}</h2>
      ${has ? `<span class="muted" title="${esc(TIPS.whFee)}">Fees <span data-k="wh-fee"></span>/day</span> <span class="status st-unpaid" data-k="wh-unpaid"></span>` : ''}
      <span class="grow"></span>
      <button class="primary" data-action="wh-buy" data-d="wh-buy">Buy warehouse ${fmtMoney(G.WAREHOUSE.cost)}</button>
    </div>
    ${has ? `<div class="whs">${p.warehouses.map((w, i) => `
      <section class="box wh">
        <b>Warehouse ${i + 1}</b>
        <span class="muted">Lv ${w.level} / ${G.WAREHOUSE.maxLevel}</span>
        <span class="muted">${fmtCount(G.WAREHOUSE.space * w.level)} space</span>
        ${w.level >= G.WAREHOUSE.maxLevel ? '<span class="muted">Max</span>'
          : `<button class="small" data-action="wh-up" data-id="${w.id}" data-d="whu-${w.id}">Upgrade ${fmtMoney(G.upgradeWarehouseCost(w.level))}</button>`}
      </section>`).join('')}</div>
    <section class="box">
      <h3>Goods</h3>
      <div class="table wh-goods">
        <div class="tr th"><span>Good</span><span class="num">Warehouse</span><span class="num">Shop</span><span class="num">On the way</span><span title="${esc(TIPS.whTarget)}">Keep in shop</span><span></span></div>
        ${goodKeys().map(g => { const k = esc(g); return `<div class="tr">
          <span>${esc(goodName(g))}</span>
          <span class="num" data-k="wo-${k}"></span>
          <span class="num" data-k="ws-${k}"></span>
          <span class="num" data-k="wt-${k}"></span>
          <input type="number" min="0" step="1" data-action="wh-target" data-g="${k}" value="${p.targets[g] || 0}" aria-label="Keep in shop">
          <span class="btns tight">
            ${WH_BUY.map(n => `<button class="small" data-action="wh-stock" data-g="${k}" data-n="${n}" data-d="wb${n}-${k}" title="${esc(TIPS.whBuy)}">Buy ${fmtCount(n)}</button>`).join('')}
            <button class="small" data-action="wh-store" data-g="${k}" data-d="wst-${k}" title="${esc(TIPS.whStore)}">Store all</button>
            <button class="small" data-action="wh-ship" data-g="${k}" data-d="wsh-${k}" title="${esc(TIPS.whShip)}">Ship 100</button>
          </span>
        </div>`; }).join('')}
      </div>
    </section>
    <section class="box">
      <h3>Shipments</h3>
      ${p.ships.length ? `<ul class="ships">${p.ships.map(sh => `<li><span>${esc(goodName(sh.g))} ×${fmtNum(sh.n)}</span>
        <span class="muted">${esc(M.dayLabel(sh.arrive, S.firstDay))}</span></li>`).join('')}</ul>` : '<div class="empty muted">None</div>'}
    </section>` : '<div class="empty muted">No warehouses</div>'}`;
  },
  vals() {
    const v = {
      'wh-space': `${fmtCount(G.warehouseUsed(S))} / ${fmtCount(G.warehouseCapacity(S))}`,
      'wh-fee': fmtMoney(G.warehouseFeePerDay(S)),
      'wh-unpaid': S._feesUnpaid ? 'unpaid' : '',
      'd:wh-buy': S.money < G.WAREHOUSE.cost,
    };
    for (const w of S.properties.warehouses) v[`d:whu-${w.id}`] = S.money < G.upgradeWarehouseCost(w.level);
    const free = G.warehouseFree(S);
    for (const g of goodKeys()) {
      const own = G.warehouseOwned(S, g);
      v[`wo-${g}`] = fmtNum(own);
      v[`ws-${g}`] = fmtNum(G.goodsOwned(S, g));
      v[`wt-${g}`] = fmtNum(G.inTransit(S, g));
      v[`d:wst-${g}`] = !(G.goodsOwned(S, g) > 0 && free >= G.goodSpace(g));
      v[`d:wsh-${g}`] = !(own > 0 && G.storageFree(S) >= G.goodSpace(g));
      for (const n of WH_BUY) v[`d:wb${n}-${g}`] = free < G.goodSpace(g);
    }
    return v;
  },
};

// ---------- Marketing: campaigns ----------
PANELS.marketing = {
  sig: () => [S.campaign?.kind || ''].join(),
  html() {
    const c = S.campaign;
    return `
    <div class="bar-head"><h2>Marketing</h2></div>
    ${c ? `<section class="box campaign-now">
      <b>${esc(CAMPAIGN_TEXT[c.kind].name)}</b>
      <span class="muted">${esc(CAMPAIGN_TEXT[c.kind].effect)}</span>
      <span class="grow"></span>
      <span data-k="camp-left"></span>
      <div class="progress thin"><i data-w="camp-pg"></i></div>
    </section>` : ''}
    <div class="upgrades">${Object.entries(G.CAMPAIGNS).map(([k, def]) => `
      <section class="upgrade box">
        <div><b>${esc(CAMPAIGN_TEXT[k].name)}</b><div class="muted">${esc(CAMPAIGN_TEXT[k].effect)}</div></div>
        <span class="muted">${def.days} ${def.days === 1 ? 'day' : 'days'}</span>
        <button data-action="campaign" data-kind="${k}" data-d="camp-${k}">${fmtMoney(def.cost)}</button>
      </section>`).join('')}</div>`;
  },
  vals() {
    const v = {};
    const c = S.campaign;
    if (c) {
      const total = G.CAMPAIGNS[c.kind].days * G.DAY_SECONDS;
      v['camp-left'] = fmtDuration(c.left);
      v['camp-pg'] = 1 - c.left / total;
    }
    for (const [k, def] of Object.entries(G.CAMPAIGNS)) v[`d:camp-${k}`] = !!c || S.money < def.cost;
    return v;
  },
};

// ---------- Finances ----------
const sumOf = o => Object.values(o).reduce((a, x) => a + x, 0);
function catRows(o) {
  const rows = Object.entries(o).filter(([, x]) => x >= 0.005).sort((a, b) => b[1] - a[1]);
  return rows.map(([c, x]) => `<div class="tr"><span>${esc(LEDGER_CATS[c] || c)}</span><span class="num">${fmtMoney(x)}</span></div>`).join('')
    || '<div class="empty muted">—</div>';
}

PANELS.finances = {
  minRenderMs: 1000,
  sig: () => {
    const e = S.ledger[S.ledger.length - 1];
    return [S.ledger.length, e?.day, e ? Math.floor(sumOf(e.in)) + '/' + Math.floor(sumOf(e.out)) + '/' + Object.keys(e.in).length + Object.keys(e.out).length : ''].join('|');
  },
  html() {
    const L = S.ledger;
    const today = L.length && L[L.length - 1].day === S.day ? L[L.length - 1] : { day: S.day, in: {}, out: {} };
    const tin = sumOf(today.in), tout = sumOf(today.out), net = tin - tout;
    const past = L.filter(e => e.day !== S.day).slice().reverse();
    const max = Math.max(1, ...past.map(e => Math.abs(sumOf(e.in) - sumOf(e.out))));
    return `
    <div class="bar-head"><h2>Finances <span class="muted">${esc(M.dayLabel(S.day, S.firstDay))}</span></h2></div>
    <div class="fin-today">
      <section class="box"><h3>Income</h3><div class="table fin-table">${catRows(today.in)}
        <div class="tr total"><span>Total</span><span class="num up">${fmtMoney(tin)}</span></div></div></section>
      <section class="box"><h3>Expenses</h3><div class="table fin-table">${catRows(today.out)}
        <div class="tr total"><span>Total</span><span class="num down">${fmtMoney(tout)}</span></div></div></section>
      <section class="box fin-net"><h3>Net</h3><b class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(net))}</b></section>
    </div>
    <section class="box">
      <h3>Past days</h3>
      <div class="table fin-days">
        <div class="tr th"><span>Day</span><span class="num">Income</span><span class="num">Expenses</span><span class="num">Net</span><span></span></div>
        ${past.map(e => {
          const i = sumOf(e.in), o = sumOf(e.out), n = i - o;
          return `<div class="tr" title="${esc([...Object.entries(e.in).map(([c, x]) => `+${fmtMoney(x)} ${LEDGER_CATS[c] || c}`), ...Object.entries(e.out).map(([c, x]) => `−${fmtMoney(x)} ${LEDGER_CATS[c] || c}`)].join('\n'))}">
            <span>${esc(M.dayLabel(e.day, S.firstDay))}</span>
            <span class="num">${fmtMoney(i)}</span>
            <span class="num">${fmtMoney(o)}</span>
            <span class="num ${n >= 0 ? 'up' : 'down'}">${n >= 0 ? '+' : '−'}${fmtMoney(Math.abs(n))}</span>
            <span class="fin-bar ${n >= 0 ? 'pos' : 'neg'}"><i style="width:${Math.round(Math.abs(n) / max * 100)}%"></i></span>
          </div>`;
        }).join('') || '<div class="empty muted">No past days yet</div>'}
      </div>
    </section>`;
  },
};

PANELS.settings = {
  sig: () => [PREFS.theme, PREFS.reduceMotion, PREFS.muteMaster, PREFS.muteMusic, PREFS.muteEffects, S.tutorial.done.length === 0,
    PREFS.debug, S.staff.length, released().length].join(),
  html() {
    const vol = (key, label) => `
      <label class="vol">${label}
        <input type="range" min="0" max="100" step="1" data-action="pref-vol" data-key="${key}" value="${PREFS[key]}">
        <label class="check"><input type="checkbox" data-action="pref-mute" data-key="mute${key[0].toUpperCase()}${key.slice(1)}" ${PREFS['mute' + key[0].toUpperCase() + key.slice(1)] ? 'checked' : ''}> Mute</label>
      </label>`;
    return `
    <div class="settings">
      <section class="box">
        <h3>Display</h3>
        <label>Theme <select data-action="pref-theme">
          ${THEMES.map(([k, v]) => `<option value="${k}" ${PREFS.theme === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></label>
        <label class="check"><input type="checkbox" data-action="pref-motion" ${PREFS.reduceMotion ? 'checked' : ''}> Reduce motion</label>
      </section>
      <section class="box">
        <h3>Sound</h3>
        ${vol('master', 'Master')}${vol('music', 'Music')}${vol('effects', 'Effects')}
      </section>
      <section class="box">
        <h3>Tutorial</h3>
        <button data-action="restart-tutorial">Restart tutorial</button>
      </section>
      <section class="box">
        <h3>System</h3>
        <div class="btns">
          <button data-action="save-now">Save now</button>
          <button data-action="export">Export</button>
          <label class="button">Import<input type="file" accept=".json,application/json" data-action="import" hidden></label>
          <button class="danger" data-action="reset">Reset</button>
        </div>
        <div class="muted small" data-k="saved"></div>
      </section>
      ${debugHtml()}
      <p class="muted small foot">IdleCardShop ${GAME_VERSION} · Free fan game. Not affiliated with any card game publisher.</p>
    </div>`;
  },
  vals() {
    const v = { saved: lastSavedText() };
    if (PREFS.debug) {
      v['dbg-clock'] = Clock.getOffset() ? `+${fmtDuration(Clock.getOffset() / 1000)}` : 'real time';
      v['dbg-day'] = M.dayLabel(S.day, S.firstDay);
      for (const k of Object.keys(G.UPGRADES)) v[`dbg-up-${k}`] = `Lv ${S.upgrades[k] + (G.UPGRADES[k].start || 0)}`;
    }
    return v;
  },
};

// Debug menu: a code field until unlocked on this device (debug.js).
function debugHtml() {
  if (!PREFS.debug) return `
      <section class="box">
        <h3>Code</h3>
        <div class="lf-row"><input type="text" id="dbg-code" autocomplete="off" spellcheck="false" aria-label="Code"><button data-action="dbg-code">Enter</button></div>
      </section>`;
  const sets = released().map(set);
  const setSel = `<select id="dbg-set" aria-label="Collection">${sets.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>`;
  const ups = Object.keys(G.UPGRADES).map(k => `
        <div class="dbg-row"><span>${esc(UPGRADE_TEXT[k]?.name || k)}</span><b data-k="dbg-up-${k}"></b>
          <button class="small" data-action="dbg-up" data-key="${k}" data-n="-1">−</button>
          <button class="small" data-action="dbg-up" data-key="${k}" data-n="1">+</button>
          <button class="small" data-action="dbg-up" data-key="${k}" data-n="max">Max</button></div>`).join('');
  return `
      <section class="box debug">
        <h3>Debug</h3>
        <div class="dbg-row"><span>Day</span><b data-k="dbg-day"></b><span class="muted" data-k="dbg-clock"></span></div>
        <div class="btns">
          <button data-action="dbg-skip" data-n="1">Skip 1 day</button>
          <button data-action="dbg-skip" data-n="6">Skip 6 days</button>
          <button data-action="dbg-skip" data-n="next">Skip to next set</button>
          <button data-action="dbg-release">Release all sets</button>
        </div>
        <div class="lf-row"><input type="number" id="dbg-money" min="0" step="1" value="${Math.floor(S.money)}" aria-label="Money"><button data-action="dbg-money">Set money</button></div>
        <div class="lf-row">${setSel}<input type="number" id="dbg-n" min="1" step="1" value="10" aria-label="Amount">
          <button data-action="dbg-boosters">Add boosters</button><button data-action="dbg-cards">Open free</button></div>
        <h4>Upgrades</h4>${ups}
        <h4>Staff</h4>
        <div class="btns">
          <button data-action="dbg-hire">Hire free</button>
          <button data-action="dbg-skills">Max skills</button>
          <button data-action="dbg-unlock">Unlock all</button>
          <button data-action="dbg-lock">Hide debug</button>
        </div>
      </section>`;
}

let lastSavedAt = 0;
export function markSaved(t) { lastSavedAt = t; }
function lastSavedText() {
  if (!lastSavedAt) return '';
  return `Saved ${fmtDuration((Date.now() - lastSavedAt) / 1000)} ago`;
}

// ---------- Card detail ----------
// List form: `lf` keeps the chosen quantity and price while the form is
// redrawn; it resets when another card is opened.
const lf = { key: '', n: 1, price: 0 };

export function lfState() { return lf; }
function lfMax(st, c) { return Math.min(S.binder[st.id]?.[c.id] || 0, G.freeSlots(S)); }
function lfReset(st, c) {
  const key = `${st.id}:${c.id}`;
  if (lf.key !== key) { lf.key = key; lf.n = 1; lf.price = G.tagPrice(G.marketValue(S, st, c), 0); }
}
export function lfSet(st, c, what) {
  lfReset(st, c);
  const max = lfMax(st, c);
  if (what === 'minus') lf.n = lf.n - 1;
  else if (what === 'plus') lf.n = lf.n + 1;
  else if (what === 'max') lf.n = max;
  else if (what === 'market') lf.price = G.tagPrice(G.marketValue(S, st, c), 0);
  lf.n = Math.max(1, Math.min(lf.n, max || 1));
}

// Live update while quantity or price is typed.
export function lfInput(input) {
  const root = input.closest('.list-form');
  const max = Number(root.dataset.max);
  const mv = Number(root.dataset.mv);
  if (input.dataset.lf === 'n') {
    const v = Math.floor(Number(input.value));
    lf.n = v > 0 ? Math.min(v, max) : 0;
  } else {
    const v = Math.round(Number(input.value) * 100) / 100;
    lf.price = v > 0 ? v : 0;
  }
  const off = root.querySelector('.pf-off');
  off.textContent = lf.price ? (lf.price === G.tagPrice(mv, 0) ? 'market' : fmtPct(lf.price / mv - 1)) : '';
  off.className = `pf-off ${lf.price > mv * 1.1 ? 'warn' : 'muted'}`;
  root.querySelector('[data-k="lf-total"]').textContent = fmtMoney(lf.n * lf.price);
  const btn = root.querySelector('[data-action="list-card"]');
  btn.disabled = !(lf.n > 0 && lf.price > 0);
  btn.textContent = `List ${lf.n || 0}`;
}

export function cardDetailHtml(st, c) {
  const day = S.day;
  const hist = M.history(st, c, day, 30);
  const now = hist[hist.length - 1];
  const have = S.binder[st.id]?.[c.id] || 0;
  const cost = now * G.MARKET_BUY_RATE;
  const open = G.setUnlocked(S, st);
  const ref = `data-s="${esc(st.id)}" data-c="${esc(c.id)}"`;
  const canList = have && S.unlocked.priceList;
  return `
  <div class="modal detail">
    ${cardHtml(st, c, { size: 'lg' })}
    <div class="detail-info">
      <h2>${esc(c.name)}</h2>
      <div class="muted">${esc(st.rarities[c.rarity].name)}${c.number ? ` · ${esc(c.number)}` : ''}</div>
      <div class="kv"><span>Market</span><b>${fmtMoney(now)}</b></div>
      <div class="kv"><span>7 days</span><b class="${now >= hist[hist.length - 8] ? 'up' : 'down'}">${fmtPct(now / hist[hist.length - 8] - 1)}</b></div>
      ${sparkline(hist, 240, 60)}
      <div class="kv"><span>In binder</span><b>${have}</b></div>
      <div class="btns">
        ${canList ? (G.freeSlots(S) ? `<button class="primary" data-action="list" ${ref} title="${esc(TIPS.list)}">List</button>` : '<span class="muted">showcase full</span>') : ''}
        ${open
          ? `<button data-action="buy-single" ${ref} ${S.money >= cost ? '' : 'disabled'} title="${esc(TIPS.single)}">Buy ${fmtMoney(cost)}</button>`
          : `<span class="muted" title="${esc(TIPS.locked)}">locked</span>`}
        <span class="grow"></span>
        <button data-action="close">Done</button>
      </div>
    </div>
  </div>`;
}

export function listFormHtml(st, c) {
  lfReset(st, c);
  const now = G.marketValue(S, st, c);
  const have = S.binder[st.id]?.[c.id] || 0;
  const max = lfMax(st, c);
  lf.n = Math.max(1, Math.min(lf.n, max || 1));
  const ref = `data-s="${esc(st.id)}" data-c="${esc(c.id)}"`;
  const off = lf.price / now - 1;
  const ok = max > 0 && lf.price > 0;
  return `
  <div class="modal detail list-form" data-max="${max}" data-mv="${now}">
    ${cardHtml(st, c, { size: 'lg' })}
    <div class="detail-info">
      <h2>${esc(c.name)}</h2>
      <div class="kv"><span>Market</span><b>${fmtMoney(now)}</b></div>
      <div class="kv"><span>In binder</span><b>${have}</b></div>
      <div class="lf-row">
        <label for="lf-n">Quantity</label>
        <span class="grow"></span>
        <button class="small" data-action="lf" data-what="minus" ${ref} aria-label="One less">&minus;</button>
        <input id="lf-n" type="number" min="1" max="${max}" step="1" inputmode="numeric" data-lf="n" value="${lf.n}">
        <button class="small" data-action="lf" data-what="plus" ${ref} aria-label="One more">+</button>
        <button class="small" data-action="lf" data-what="max" ${ref}>Max</button>
      </div>
      <div class="lf-row">
        <label for="lf-p">Price</label>
        <span class="grow"></span>
        <span class="pf-off ${lf.price > now * 1.1 ? 'warn' : 'muted'}" title="${esc(TIPS.customers)}">${lf.price === G.tagPrice(now, 0) ? 'market' : fmtPct(off)}</span>
        <input id="lf-p" type="number" min="0.01" step="0.01" inputmode="decimal" data-lf="price" value="${lf.price.toFixed(2)}">
        <button class="small" data-action="lf" data-what="market" ${ref}>Market</button>
      </div>
      <div class="kv"><span>Total</span><b data-k="lf-total">${fmtMoney(lf.n * lf.price)}</b></div>
      <div class="btns">
        <button data-action="card" ${ref}>Back</button>
        <span class="grow"></span>
        <button class="primary" data-action="list-card" ${ref} ${ok ? '' : 'disabled'}>List ${lf.n}</button>
      </div>
    </div>
  </div>`;
}

export function confirmLastHtml(st, c, n, price) {
  const ref = `data-s="${esc(st.id)}" data-c="${esc(c.id)}"`;
  return `
  <div class="modal confirm">
    <p>List your last ${esc(c.name)}?</p>
    <div class="btns end">
      <button data-action="card" ${ref}>Cancel</button>
      <button class="primary" data-action="list-card-ok" ${ref} data-n="${n}" data-price="${price}">List</button>
    </div>
  </div>`;
}
