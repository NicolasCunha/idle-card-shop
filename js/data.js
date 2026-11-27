// Loads card collections (GDD section 4). Adding a collection = add its JSON at
// the repo root and list it in collections.json. No code change.

export async function loadCollections(base = '') {
  const list = await fetchJson(base + 'collections.json');
  const sets = {};
  const order = [];
  for (const file of list.collections || []) {
    try {
      const raw = await fetchJson(base + file);
      const set = normalizeSet(raw);
      if (sets[set.id]) { console.warn(`Duplicate collection id "${set.id}" in ${file}, skipped`); continue; }
      sets[set.id] = set;
      order.push(set.id);
    } catch (err) {
      console.error(`Could not load collection ${file}:`, err);
    }
  }
  resolveReprints(sets);
  linkOrder(sets, order);
  return { sets, order };
}

// Collections unlock in collections.json order: each one needs the one before it.
export function linkOrder(sets, order) {
  order.forEach((id, i) => {
    sets[id].prev = i > 0 ? sets[order[i - 1]] : null;
    sets[id].nextId = order[i + 1] || null;
  });
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export function normalizeSet(raw) {
  if (!raw.id || !raw.name || !raw.booster || !raw.rarities || !Array.isArray(raw.cards)) {
    throw new Error(`Collection is missing required fields (id, name, booster, rarities, cards)`);
  }
  const rarityOrder = Object.keys(raw.rarities);
  const rarities = {};
  rarityOrder.forEach((key, i) => {
    const r = raw.rarities[key];
    rarities[key] = {
      key,
      rank: i,
      name: r.name || key,
      short: r.short || (r.name || key).charAt(0).toUpperCase(),
      value: Number(r.value) || 0,
      color: r.color || '#999',
    };
  });
  const set = {
    id: String(raw.id),
    name: raw.name,
    game: raw.game || '',
    theme: raw.theme || raw.game || 'default',
    releaseYear: raw.releaseYear || null,
    boosterImage: raw.boosterImage || null,
    booster: {
      wholesalePrice: Number(raw.booster.wholesalePrice) || 1,
      slots: (raw.booster.slots || []).map(s => ({ count: s.count || 1, rarity: s.rarity || null, weights: s.weights || null })),
    },
    rarities,
    rarityOrder,
    reprintFactor: raw.reprintFactor ?? 0.5,
    cards: [],
    byId: {},
    byRarity: {},
  };
  for (const key of rarityOrder) set.byRarity[key] = [];
  const cards = [...raw.cards].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const c of cards) {
    if (!c.id || !c.name || !rarities[c.rarity]) {
      console.warn(`Collection ${set.id}: card skipped (needs id, name and a known rarity)`, c);
      continue;
    }
    if (set.byId[c.id]) { console.warn(`Collection ${set.id}: duplicate card id ${c.id}`); continue; }
    const card = {
      setId: set.id,
      index: c.index,
      id: String(c.id),
      number: c.number || '',
      name: c.name,
      rarity: c.rarity,
      foil: !!c.foil,
      image: c.image || null,
      ownValue: c.value != null ? Number(c.value) : null,
      value: c.value != null ? Number(c.value) : rarities[c.rarity].value,
      reprintOf: c.reprintOf || null,
      extra: c.extra || null,
    };
    set.cards.push(card);
    set.byId[card.id] = card;
    set.byRarity[card.rarity].push(card);
  }
  return set;
}

// A reprint without its own value is worth the original's value x reprintFactor.
function resolveReprints(sets) {
  for (const set of Object.values(sets)) {
    for (const card of set.cards) {
      if (!card.reprintOf) continue;
      const [sid, cid] = card.reprintOf.split(':');
      const orig = sets[sid]?.byId[cid];
      if (!orig) { console.warn(`Reprint ${set.id}:${card.id} points to unknown ${card.reprintOf}`); continue; }
      if (card.ownValue == null) card.value = orig.value * set.reprintFactor;
    }
  }
}

// Celebration tier for the opening scene (GDD section 5): quiet, highlight, big.
export function celebration(set, card) {
  const rank = set.rarities[card.rarity].rank;
  const top = set.rarityOrder.length - 1;
  if (card.foil || (rank === top && top >= 2)) return 'big';
  if (rank >= Math.max(2, top - 1)) return 'highlight';
  return 'quiet';
}
