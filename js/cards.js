// Card rendering. One image file serves every size; a missing image falls back
// to a generic card drawn in CSS (GDD sections 4 and 5).

import { esc } from './format.js';

export function cardHtml(set, card, { size = 'md', unseen = false, badge = '', extraClass = '' } = {}) {
  const r = set.rarities[card.rarity];
  const cls = ['card', `size-${size}`, `theme-${esc(set.theme)}`, `r-${esc(card.rarity)}`];
  if (card.foil) cls.push('foil');
  if (unseen) cls.push('unseen');
  if (extraClass) cls.push(extraClass);
  const art = card.image
    ? `<img src="${esc(card.image)}" alt="" loading="lazy" draggable="false" onerror="this.remove()">`
    : '';
  return `<div class="${cls.join(' ')}" style="--rc:${esc(r.color)}" title="${esc(unseen ? '???' : `${card.name} · ${r.name}`)}">
    <div class="card-art"><span class="card-generic">${esc(r.short)}</span>${unseen ? '' : art}</div>
    <div class="card-foot">
      <span class="card-name">${esc(unseen ? '???' : card.name)}</span>
      <span class="card-meta"><b class="rar" aria-label="${esc(r.name)}">${esc(r.short)}</b>${esc(card.number || '')}</span>
    </div>
    ${badge}
  </div>`;
}

export function rarityTag(set, card) {
  const r = set.rarities[card.rarity];
  return `<b class="rar-tag" style="--rc:${esc(r.color)}" title="${esc(r.name)}">${esc(r.short)}</b>`;
}

export function boosterHtml(set) {
  const img = set.boosterImage ? `<img src="${esc(set.boosterImage)}" alt="" draggable="false" onerror="this.remove()">` : '';
  return `<div class="pack theme-${esc(set.theme)}">
    <div class="pack-top"></div>
    <div class="pack-body">${img}<span class="pack-name">${esc(set.name)}</span></div>
  </div>`;
}
