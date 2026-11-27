// Menu UI. Each tab has sig() (re-render when it changes), html() (markup) and
// vals() (live numbers patched in place), so inputs keep focus and clicks are
// never lost to a re-render.

import * as G from './game.js';
import * as M from './market.js';
import { cardHtml, rarityTag } from './cards.js';
import { fmtMoney, fmtNum, fmtPct, fmtSec, fmtDuration, fmtClock, esc } from './format.js';
import { TABS, SKILL_NAMES, UPGRADE_TEXT, TIPS } from './strings.js';
import { currentStep } from './tutorial.js';
import { GAME_VERSION } from './save.js';

let S = null, SETS = null, ORDER = [], PREFS = null, A = null;
let active = 'shop';
let lastSig = null;
let ui = { shopSet: null, binderSet: null, marketSet: null, marketSort: 'number', marketPage: 0, priceQty: '10', priceLevel: '0', priceKeep: '0' };
export const PAGE_SIZES = [10, 25, 50, 100, 0];
let shownMoney = null;

export function initUI({ state, sets, order, prefs, actions }) {
  S = state; SETS = sets; ORDER = order; PREFS = prefs; A = actions;
  ui.shopSet = ui.binderSet = ui.marketSet = order[0];
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
        <span class="day" title="${esc(TIPS.timeZone)}"><span id="day-label"></span> · next <span id="day-next"></span></span>
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
  document.documentElement.dataset.theme = t;
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
    if (e.target.matches?.('[data-pf="price"]')) { pfInput(e.target); return; }
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
export function frame(force = false) {
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
  if (force || sig !== lastSig) {
    const focused = panel.contains(document.activeElement) && document.activeElement.matches('input, select');
    if (!focused || force) {
      panel.innerHTML = tab.html();
      lastSig = sig;
    }
  }
  patch(panel, tab.vals ? tab.vals() : {});
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
  document.getElementById('day-label').textContent = S.day ? M.dayLabel(S.day) : '';
  document.getElementById('day-next').textContent = fmtClock(M.msUntilNextDay(S.timeZone));
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
// withLock: mark collections whose boosters are still locked.
const setOptions = (sel, withLock = false) => ORDER.map(id => {
  const lock = withLock && !G.setUnlocked(S, SETS[id]);
  return `<option value="${esc(id)}" ${id === sel ? 'selected' : ''}>${esc(SETS[id].name)}${lock ? ' · locked' : ''}</option>`;
}).join('');
const fmtLevel = l => (Number(l) ? `${Number(l) > 0 ? '+' : '−'}${Math.round(Math.abs(Number(l)) * 100)}%` : 'Market');
const levelOptions = sel => G.PRICE_LEVELS.map(l => `<option value="${l}" ${String(l) === String(sel) ? 'selected' : ''}>${fmtLevel(l)}</option>`).join('');
const lockSig = () => ORDER.map(id => (G.setUnlocked(S, SETS[id]) ? 1 : 0)).join('');

function staffOn(task) {
  return S.staff.filter(e => e.task === task && !e.training);
}

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
    const sid = ui.shopSet;
    const st = set(sid);
    const multi = ORDER.length > 1;
    const sel = multi ? `<select data-action="shop-set">${setOptions(sid, true)}</select>` : '';
    const locked = !G.setUnlocked(S, st);
    return `
    <div class="stages">
      <section class="stage" id="stage-buy">
        <h3>Distributor</h3>${sel}
        <div class="stat-big" title="${esc(TIPS.buy)}"><span data-k="bprice"></span><small> each</small></div>
        ${locked ? `<div class="lock-line" title="${esc(TIPS.locked)}">
          <span>${esc(st.prev.name)}</span>
          <div class="progress"><i data-w="lockw"></i></div>
          <b data-k="lockp"></b>
        </div>` : ''}
        <div class="kv"><span>Sealed</span><b data-k="stock"></b></div>
        <div class="btns">
          <button data-action="buy" data-n="1" data-d="buy1">Buy booster</button>
          <button data-action="buy" data-n="5" data-d="buy5">Buy 5</button>
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
    const st = set(ui.shopSet);
    const price = G.boosterPrice(S, st);
    const full = G.totalStock(S) >= G.stockCapacity(S) || !G.setUnlocked(S, st);
    const prevFrac = st.prev ? G.collectionProgress(S, st.prev).frac : 1;
    const keep = Number(ui.priceKeep) || 0;
    let avail = 0;
    for (const cards of Object.values(S.binder)) for (const n of Object.values(cards)) if (n > keep) avail += n - keep;
    const bulk = S.unlocked.priceList ? G.bulkSpares(S, SETS, keep) : { n: 0, total: 0 };
    return {
      bprice: fmtMoney(price),
      stock: `${fmtNum(G.totalStock(S))} / ${fmtNum(G.stockCapacity(S))}`,
      sealed: fmtNum(S.stock[st.id] || 0),
      avail: fmtNum(avail),
      showcase: `${fmtNum(S.showcase.length)} / ${fmtNum(G.showcaseCapacity(S))}`,
      bulkv: bulk.n ? fmtMoney(bulk.total) : '',
      lockw: prevFrac / G.UNLOCK_AT,
      lockp: `${Math.floor(prevFrac * 100)}% / ${Math.round(G.UNLOCK_AT * 100)}%`,
      'd:buy1': full || S.money < price,
      'd:buy5': full || S.money < price,
      'd:open': !(S.stock[st.id] > 0),
      'd:price': !avail || !G.freeSlots(S),
      'd:bulk': !bulk.n,
      'c-buy': chips('buy'), 'c-open': chips('open'), 'c-price': chips('price'),
      log: logHtml(),
      staffmini: S.staff.map(e => `<li><b>${esc(e.name)}</b> <span class="muted">${esc(e.task ? SKILL_NAMES[e.task] : '—')}</span> <span class="status st-${esc(e.status.replace(/\s/g, '-'))}">${esc(e.status)}</span></li>`).join(''),
    };
  },
};

PANELS.binder = {
  sig() {
    const st = set(ui.binderSet);
    const seen = G.collectionProgress(S, st).seen;
    const copies = Object.values(S.binder[st.id] || {}).reduce((a, b) => a + b, 0);
    return [ui.binderSet, seen, copies].join();
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
      ${ORDER.length > 1 ? `<select data-action="binder-set">${setOptions(st.id)}</select>` : `<h2>${esc(st.name)}</h2>`}
      <span class="grow"></span>
      <span title="${esc(TIPS.milestone)}">${bonus ? `+${Math.round(bonus * 100)}% sale price` : ''}${next ? ` <span class="muted">· next at ${Math.round(next.at * 100)}%</span>` : ''}</span>
    </div>
    <div class="progress-line"><div class="progress"><i style="width:${(prog.frac * 100).toFixed(1)}%"></i></div><span>${prog.seen} / ${prog.total}</span></div>
    <div class="binder-grid">${st.cards.map(c => {
      const n = binder[c.id] || 0;
      return `<button class="binder-slot" data-action="card" data-s="${esc(st.id)}" data-c="${esc(c.id)}" ${seen[c.id] ? '' : 'disabled'}>
        ${cardHtml(st, c, { size: 'sm', unseen: !seen[c.id], extraClass: seen[c.id] && !n ? 'not-owned' : '', badge: n ? `<span class="badge-count">×${n}</span>` : '' })}
      </button>`;
    }).join('')}</div>`;
  },
};

PANELS.showcase = {
  sig: () => [S.showcase.length, S.day, S.showcase[0]?.c].join(),
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
    <div class="table">
      <div class="tr th"><span></span><span>Card</span><span class="num">Tag</span><span class="num">Market</span><span></span></div>
      ${rows.map(({ it, n }) => {
        const st = SETS[it.s], c = st.byId[it.c];
        const mv = G.marketValue(S, st, c);
        const off = it.p / mv - 1;
        return `<div class="tr">
          ${cardHtml(st, c, { size: 'xs' })}
          <span>${rarityTag(st, c)} ${esc(c.name)} ${n > 1 ? `<span class="muted">×${n}</span>` : ''}</span>
          <span class="num">${fmtMoney(it.p)}</span>
          <span class="num muted">${fmtMoney(mv)}</span>
          <span class="num ${off > 0.10 ? 'warn' : 'muted'}" title="${esc(TIPS.customers)}">${Math.abs(off) < 0.005 ? '=' : fmtPct(off)}</span>
        </div>`;
      }).join('') || '<div class="empty muted">Empty</div>'}
    </div>`;
  },
  vals: () => ({ count: `${fmtNum(S.showcase.length)} / ${fmtNum(G.showcaseCapacity(S))}` }),
};

function sparkline(values, w = 90, h = 24) {
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(' ');
  const up = values[values.length - 1] >= values[0];
  return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}

PANELS.market = {
  sig: () => [S.day, ui.marketSet, ui.marketSort, ui.marketPage, PREFS.marketPageSize, lockSig()].join(),
  html() {
    const st = set(ui.marketSet);
    const day = S.day;
    const rows = st.cards.map(c => {
      const hist = M.history(st, c, day, 30);
      const now = hist[hist.length - 1];
      return { c, now, d1: now / hist[hist.length - 2] - 1, d7: now / hist[hist.length - 8] - 1, hist };
    });
    const sorters = {
      number: (a, b) => a.c.index - b.c.index,
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
    for (const c of st.cards) news.push(...M.newsFor(st, c, day, 3));
    news.sort((a, b) => b.day - a.day);
    const bp = G.boosterPrice(S, st);
    const bp7 = st.booster.wholesalePrice * M.boosterMultiplier(st, day - 7);
    const open = G.setUnlocked(S, st);
    return `
    <div class="bar-head">
      ${ORDER.length > 1 ? `<select data-action="market-set">${setOptions(st.id, true)}</select>` : `<h2>${esc(st.name)}</h2>`}
      <span class="muted">Booster ${fmtMoney(bp)} <span class="${bp >= bp7 ? 'up' : 'down'}">${fmtPct(bp / bp7 - 1)}</span></span>
      <span class="grow"></span>
      <label class="inline">Sort <select data-action="market-sort">
        ${[['number', 'Number'], ['price', 'Price'], ['d1', '1 day'], ['d7', '7 days']].map(([k, v]) => `<option value="${k}" ${ui.marketSort === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select></label>
    </div>
    ${news.length ? `<section class="box news"><h3>News</h3><ul>${news.slice(0, 8).map(n =>
      `<li class="${n.kind}"><b>${esc(n.card.name)}</b> ${esc(n.text)} <span class="muted">${esc(M.dayLabel(n.day))}</span></li>`).join('')}</ul></section>` : ''}
    ${pagerHtml}
    <div class="table market-table">
      <div class="tr th"><span></span><span>Card</span><span class="num">Today</span><span class="num">1d</span><span class="num">7d</span><span>30d</span><span></span></div>
      ${shown.map(r => {
        const cost = r.now * G.MARKET_BUY_RATE;
        return `<div class="tr">
          <button class="thumb" data-action="card" data-s="${esc(st.id)}" data-c="${esc(r.c.id)}" aria-label="${esc(r.c.name)}">${cardHtml(st, r.c, { size: 'xs' })}</button>
          <span>${rarityTag(st, r.c)} ${esc(r.c.name)}</span>
          <span class="num">${fmtMoney(r.now)}</span>
          <span class="num ${r.d1 >= 0 ? 'up' : 'down'}">${fmtPct(r.d1)}</span>
          <span class="num ${r.d7 >= 0 ? 'up' : 'down'}">${fmtPct(r.d7)}</span>
          <span>${sparkline(r.hist)}</span>
          <span>${open
            ? `<button class="small" data-action="buy-single" data-s="${esc(st.id)}" data-c="${esc(r.c.id)}" data-cost="${cost}" title="${esc(TIPS.single)}">Buy ${fmtMoney(cost)}</button>`
            : `<span class="muted" title="${esc(TIPS.locked)}">locked</span>`}</span>
        </div>`;
      }).join('')}
    </div>
    ${pages > 1 ? pagerHtml : ''}`;
  },
};

PANELS.staff = {
  sig: () => [S.staff.length, G.maxStaff(S), ORDER.length, lockSig(),
    ...S.staff.map(e => `${e.task}/${e.training ? e.training.skill : ''}/${G.SKILL_KEYS.map(k => e.skills[k].lvl).join('.')}`)].join('|'),
  html() {
    const cost = G.hireCost(S.staff.length);
    const room = S.staff.length < G.maxStaff(S);
    const r = S.rules;
    return `
    <div class="bar-head">
      <h2>Staff <span class="muted">${S.staff.length} / ${G.maxStaff(S)}</span></h2>
      <span class="grow"></span>
      ${room ? `<button class="primary" data-action="hire" data-cost="${cost}">Hire ${fmtMoney(cost)}</button>` : '<span class="muted">No free slot</span>'}
    </div>
    <div class="emps">${S.staff.map(e => `
      <section class="emp box" data-id="${e.id}">
        <div class="emp-head">
          <b>${esc(e.name)}</b>
          <span class="status" data-k="st-${e.id}"></span>
          <span class="grow"></span>
          <select data-action="task" data-id="${e.id}" aria-label="Task">
            <option value="" ${!e.task ? 'selected' : ''}>No task</option>
            ${G.SKILL_KEYS.map(k => `<option value="${k}" ${e.task === k ? 'selected' : ''}>${SKILL_NAMES[k]}</option>`).join('')}
          </select>
        </div>
        <div class="progress thin"><i data-w="pg-${e.id}"></i></div>
        <div class="skills" title="${esc(TIPS.skillSpeed)}">${G.SKILL_KEYS.map(k => {
          const sk = e.skills[k];
          const max = sk.lvl >= G.MAX_SKILL;
          const tc = G.trainCost(sk.lvl);
          return `<div class="skill ${e.task === k ? 'on' : ''}">
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
        ${ORDER.length > 1 ? `
        <label>Buyer collection <select data-action="rule" data-rule="buySet">${setOptions(r.buySet, true)}</select></label>
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
    const v = {};
    for (const e of S.staff) {
      v[`st-${e.id}`] = e.training ? `training ${fmtDuration(e.training.left)}` : e.status;
      if (e.training) v[`pg-${e.id}`] = 1 - e.training.left / e.training.total;
      else if (e.task && e.status === 'working') v[`pg-${e.id}`] = e.progress / G.skillDuration(e.task, e.skills[e.task].lvl);
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
        <div><b>${esc(txt.name)}</b><div class="muted">${esc(txt.effect)}</div></div>
        <span class="muted">Lv ${lvl} / ${def.max}</span>
        ${max ? '<span class="muted">Max</span>' : `<button data-action="upgrade" data-key="${k}" data-cost="${cost}">${fmtMoney(cost)}</button>`}
      </section>`;
    }).join('')}</div>`;
  },
};

PANELS.settings = {
  sig: () => [PREFS.theme, PREFS.reduceMotion, S.timeZone, PREFS.muteMaster, PREFS.muteMusic, PREFS.muteEffects, S.tutorial.done.length === 0].join(),
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
          ${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([k, v]) => `<option value="${k}" ${PREFS.theme === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></label>
        <label class="check"><input type="checkbox" data-action="pref-motion" ${PREFS.reduceMotion ? 'checked' : ''}> Reduce motion</label>
      </section>
      <section class="box">
        <h3>Sound</h3>
        ${vol('master', 'Master')}${vol('music', 'Music')}${vol('effects', 'Effects')}
      </section>
      <section class="box">
        <h3>Market</h3>
        <label title="${esc(TIPS.timeZone)}">Time zone <select data-action="timezone">${timeZoneOptions(S.timeZone)}</select></label>
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
      <p class="muted small foot">IdleCardShop ${GAME_VERSION} · Free fan game. Not affiliated with any card game publisher.</p>
    </div>`;
  },
  vals: () => ({ saved: lastSavedText() }),
};

let lastSavedAt = 0;
export function markSaved(t) { lastSavedAt = t; }
function lastSavedText() {
  if (!lastSavedAt) return '';
  return `Saved ${fmtDuration((Date.now() - lastSavedAt) / 1000)} ago`;
}

let tzCache = null;
export function timeZoneOptions(sel) {
  tzCache ||= M.listTimeZones();
  const list = tzCache.includes(sel) ? tzCache : [sel, ...tzCache];
  return list.map(z => `<option value="${esc(z)}" ${z === sel ? 'selected' : ''}>${esc(z)}</option>`).join('');
}

// ---------- Card detail ----------
// Pricing form inside the card detail. `pf` keeps the choice while the
// detail is redrawn; it resets when another card is opened.
const pf = { key: '', n: '1', price: 0 };

export function pfQty(n) { pf.n = n; }
export function pfLevel(st, c, level) { pf.price = G.tagPrice(G.marketValue(S, st, c), Number(level)); }
export function pfState() { return pf; }

function pfCount(have) {
  if (pf.n === 'all') return have;
  if (pf.n === 'keep1') return have - 1;
  return Math.min(have, Number(pf.n) || 1);
}

// Live update while the price is typed: % against market and the button label.
export function pfInput(input) {
  const v = Math.round(Number(input.value) * 100) / 100;
  pf.price = v > 0 ? v : 0;
  const root = input.closest('.detail');
  const mv = Number(input.dataset.mv);
  const off = root.querySelector('.pf-off');
  if (off) {
    off.textContent = pf.price ? (Math.abs(pf.price / mv - 1) < 0.005 ? 'market' : fmtPct(pf.price / mv - 1)) : '';
    off.className = `pf-off ${pf.price > mv * 1.1 ? 'warn' : 'muted'}`;
  }
  for (const b of root.querySelectorAll('[data-pf-level]')) b.classList.toggle('on', pf.price === G.tagPrice(mv, Number(b.dataset.pfLevel)));
  const btn = root.querySelector('[data-action="list-card"]');
  if (btn) btn.disabled = !pf.price || Number(btn.dataset.max) < 1;
}

export function cardDetailHtml(st, c) {
  const day = S.day;
  const hist = M.history(st, c, day, 30);
  const now = hist[hist.length - 1];
  const have = S.binder[st.id]?.[c.id] || 0;
  const cost = now * G.MARKET_BUY_RATE;
  const open = G.setUnlocked(S, st);
  const ref = `data-s="${esc(st.id)}" data-c="${esc(c.id)}"`;
  const key = `${st.id}:${c.id}`;
  if (pf.key !== key) { pf.key = key; pf.n = '1'; pf.price = G.tagPrice(now, 0); }
  if (pf.n === 'keep1' && have < 2) pf.n = '1';
  const k = Math.min(Math.max(0, pfCount(have)), G.freeSlots(S));
  const qty = (n, label, ok) => `<button class="small ${pf.n === n ? 'on' : ''}" data-action="pf-qty" ${ref} data-n="${n}" ${ok ? '' : 'disabled'}${n === 'keep1' ? ` title="${esc(TIPS.keepOne)}"` : ''}>${label}</button>`;
  const lvl = l => `<button class="small ${pf.price === G.tagPrice(now, l) ? 'on' : ''}" data-action="pf-level" ${ref} data-level="${l}" data-pf-level="${l}">${fmtLevel(l)}</button>`;
  const off = pf.price / now - 1;
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
      ${have && S.unlocked.priceList ? `
      <div class="price-form">
        <div class="seg">${qty('1', '1', have >= 1)}${qty('5', '5', have >= 5)}${qty('10', '10', have >= 10)}${qty('keep1', 'Keep 1', have >= 2)}${qty('all', 'All', have >= 1)}</div>
        <div class="seg">${G.PRICE_LEVELS.map(lvl).join('')}</div>
        <div class="pf-price">
          <label>Price <input type="number" min="0.01" step="0.01" inputmode="decimal" data-pf="price" data-mv="${now}" value="${pf.price.toFixed(2)}"></label>
          <span class="pf-off ${pf.price > now * 1.1 ? 'warn' : 'muted'}" title="${esc(TIPS.customers)}">${Math.abs(off) < 0.005 ? 'market' : fmtPct(off)}</span>
          <span class="grow"></span>
          ${G.freeSlots(S) ? `<button class="primary" data-action="list-card" ${ref} data-max="${k}" ${k > 0 && pf.price > 0 ? '' : 'disabled'} title="${esc(TIPS.price)}">List ${k}</button>` : '<span class="muted">showcase full</span>'}
        </div>
      </div>` : ''}
      <div class="btns">
        ${open
          ? `<button data-action="buy-single" ${ref} ${S.money >= cost ? '' : 'disabled'} title="${esc(TIPS.single)}">Buy ${fmtMoney(cost)}</button>`
          : `<span class="muted" title="${esc(TIPS.locked)}">locked</span>`}
        <span class="grow"></span>
        <button data-action="close">Done</button>
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
