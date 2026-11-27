# Card content

## Where it lives

- One JSON file per card collection, at the repo root, named `<collection-id>.json`.
- `collections.json` at the repo root lists which collections the game loads, in order.
- Images in `images/<collection-id>/`, 5:7 ratio (e.g. 500×700), PNG, JPG or WEBP.
- Field reference: GDD section 4. Adding a collection must never require a code change.

## Who supplies it

**Card data and images come only from Nicolas.** Never:

- fetch, scrape or download official card lists, set lists, prices or artwork from any website or API;
- fill in card names, numbers, rarities or values from memory;
- generate or source card art.

If data is missing, leave the field out (the game draws a generic card when `image` is missing) or use an obvious placeholder (`"name": "Card 4"`), and tell Nicolas what is missing. The v1 Base Set template ships with placeholder names for him to fill.

## Validation

When a collection file changes, check: unique `id`s, every `rarity` is a key of `rarities`, `index` is unique and sequential, every `reprintOf` points to an existing card, every `image` path exists. Use the `add-card-collection` skill.

Base Set booster (decided 2026-11-27): 7 common, 3 uncommon, 1 rare slot (33% holo). Basic energies count as common.

Jungle, Fossil, Base Set 2 and Team Rocket (added 2026-11-27, crawled at Nicolas's direct request) use the same booster layout and $4 wholesale price until he says otherwise. Base Set 2 cards carry `reprintOf` to the Base Set or Jungle card with the same name and rarity (Imposter Professor Oak has none). Team Rocket's secret rare Dark Raichu (83/82) is mapped to `holo`.

Collections unlock in `collections.json` order: each needs 90% of the previous one discovered (Nicolas, 2026-11-27). Append new collections in release order.

Nicolas's crawler (`C:\DEV\pkmn-crawler`, his own tool that he runs himself) emits collection JSON in this format. Nicolas confirmed on 2026-11-27 that its output counts as data supplied by him. Agents still never run bulk crawls or download art themselves.
