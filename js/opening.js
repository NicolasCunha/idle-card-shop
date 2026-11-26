// Booster opening scene (GDD section 5).
// Open 1: pack appears -> click/drag tears it -> face-up stack, most common on
// top -> each click slides the top card away -> rarest last, with celebration
// -> summary with NEW marks and value. Skip jumps to the summary.
// Open 10/100/all: no animation, grouped results list.

import { cardHtml, boosterHtml, rarityTag } from './cards.js';
import { celebration } from './data.js';
import { fmtMoney, esc } from './format.js';
import * as G from './game.js';
import { sfx } from './audio.js';

let ctx = null; // { state, sets, prefs, onOpenAnother, onClose }

export function initOpening(c) { ctx = c; }

function overlay() { return document.getElementById('overlay'); }

function show(html, cls = '') {
  const el = overlay();
  el.className = `overlay ${cls}`;
  el.innerHTML = html;
  el.hidden = false;
  return el;
}

export function closeOverlay() {
  const el = overlay();
  el.hidden = true;
  el.innerHTML = '';
  el.className = 'overlay';
}

const wait = ms => new Promise(r => setTimeout(r, ms));

export function playOpening(set, result) {
  const reduce = ctx.prefs.reduceMotion;
  const el = show(`
    <div class="scene ${reduce ? 'reduce' : ''}">
      <button class="scene-skip" data-scene="skip">Skip</button>
      <div class="scene-stage">${boosterHtml(set)}</div>
      <div class="scene-hint" aria-hidden="true"></div>
    </div>`, 'dark');
  const stage = el.querySelector('.scene-stage');
  let phase = 'pack', idx = 0, busy = false, finished = false;

  const summary = () => {
    if (finished) return;
    finished = true;
    showSummary(set, result);
  };

  el.querySelector('[data-scene="skip"]').addEventListener('click', e => { e.stopPropagation(); sfx.click(); summary(); });

  const tear = async () => {
    phase = 'tearing';
    sfx.tear();
    stage.querySelector('.pack').classList.add('torn');
    await wait(reduce ? 50 : 550);
    if (finished) return;
    stage.innerHTML = `<div class="stack">${result.map((r, i) => `
      <div class="stack-card tier-${celebration(set, r.card)}" style="z-index:${result.length - i}">
        ${cardHtml(set, r.card, { size: 'lg', badge: r.isNew ? '<span class="badge-new">NEW</span>' : '' })}
      </div>`).join('')}</div>`;
    const first = stage.querySelector('.stack-card');
    first?.classList.add('enter');
    phase = 'stack';
    markNext();
  };

  // The card behind the top one glows if it is a big reveal (rarity preview).
  const markNext = () => {
    const cards = stage.querySelectorAll('.stack-card');
    cards.forEach(c => c.classList.remove('peek'));
    const next = cards[idx + 1];
    if (next && next.classList.contains('tier-big')) next.classList.add('peek');
  };

  const advance = async () => {
    if (busy || finished) return;
    const cards = stage.querySelectorAll('.stack-card');
    if (idx >= cards.length - 1) { summary(); return; }
    busy = true;
    sfx.slide();
    cards[idx].classList.add('away');
    idx++;
    const cur = cards[idx];
    const tier = [...cur.classList].find(c => c.startsWith('tier-'))?.slice(5);
    markNext();
    if (tier === 'highlight') {
      cur.classList.add('celebrate');
      sfx.highlight();
      await wait(reduce ? 0 : 300);
    } else if (tier === 'big') {
      cur.classList.add('celebrate', 'celebrate-big');
      sfx.big();
      await wait(reduce ? 0 : 500);
    }
    busy = false;
  };

  // Click or drag both count. Any tap during a pause just speeds it up.
  let downX = null;
  stage.addEventListener('pointerdown', e => { downX = e.clientX; });
  stage.addEventListener('pointerup', e => {
    if (downX === null) return;
    downX = null;
    if (phase === 'pack') tear();
    else if (phase === 'stack') { busy = false; advance(); }
  });
  el.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (phase === 'pack') tear(); else if (phase === 'stack') { busy = false; advance(); }
    } else if (e.key === 'Escape') summary();
  });
  el.tabIndex = -1;
  el.focus();
}

function showSummary(set, result) {
  const total = result.reduce((a, r) => a + G.marketValue(ctx.state, set, r.card), 0);
  const hasMore = (ctx.state.stock[set.id] || 0) > 0;
  const el = show(`
    <div class="modal summary">
      <div class="summary-cards">${[...result].reverse().map(r => cardHtml(set, r.card, {
        size: 'md',
        badge: (r.isNew ? '<span class="badge-new">NEW</span>' : '') + (r.kept ? '<span class="badge-kept">binder</span>' : ''),
      })).join('')}</div>
      <div class="summary-foot">
        <span>Value <b>${fmtMoney(total)}</b></span>
        <span class="grow"></span>
        <button data-scene="again" ${hasMore ? '' : 'disabled'}>Open another</button>
        <button class="primary" data-scene="done">Done</button>
      </div>
    </div>`, 'dark');
  el.querySelector('[data-scene="done"]').addEventListener('click', () => { sfx.click(); closeOverlay(); ctx.onClose?.(); });
  el.querySelector('[data-scene="again"]').addEventListener('click', () => { sfx.click(); ctx.onOpenAnother?.(set); });
  el.querySelector('[data-scene="done"]').focus();
}

// Grouped results for Open 10 / 100 / all: rarest first, with count and NEW.
export function showBulkResult(set, result) {
  const groups = new Map();
  for (const r of result) {
    const g = groups.get(r.card.id) || { card: r.card, n: 0, isNew: false, kept: 0 };
    g.n++;
    g.isNew ||= r.isNew;
    if (r.kept) g.kept++;
    groups.set(r.card.id, g);
  }
  const rows = [...groups.values()].sort((a, b) =>
    set.rarities[b.card.rarity].rank - set.rarities[a.card.rarity].rank ||
    G.marketValue(ctx.state, set, b.card) - G.marketValue(ctx.state, set, a.card));
  const total = result.reduce((a, r) => a + G.marketValue(ctx.state, set, r.card), 0);
  const packs = Math.round(result.length / Math.max(1, set.booster.slots.reduce((a, s) => a + s.count, 0)));
  const newCount = rows.filter(g => g.isNew).length;
  const el = show(`
    <div class="modal bulk-result">
      <h2>${packs} boosters · ${result.length} cards${newCount ? ` · ${newCount} new` : ''}</h2>
      <div class="result-list">${rows.map(g => `
        <div class="result-row">
          ${cardHtml(set, g.card, { size: 'xs' })}
          ${rarityTag(set, g.card)}
          <span class="grow">${esc(g.card.name)}${g.isNew ? ' <span class="badge-new inline">NEW</span>' : ''}</span>
          <span class="muted">×${g.n}</span>
          <span class="num">${fmtMoney(G.marketValue(ctx.state, set, g.card) * g.n)}</span>
        </div>`).join('')}</div>
      <div class="summary-foot">
        <span>Value <b>${fmtMoney(total)}</b></span>
        <span class="grow"></span>
        <button class="primary" data-scene="done">Done</button>
      </div>
    </div>`);
  el.querySelector('[data-scene="done"]').addEventListener('click', () => { sfx.click(); closeOverlay(); ctx.onClose?.(); });
  el.querySelector('[data-scene="done"]').focus();
}
