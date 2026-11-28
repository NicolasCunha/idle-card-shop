---
name: pkmn-crawler
description: Crawl a card set from pkmncards.com with Nicolas's crawler (tools/pkmn-crawler) and install it as an IdleCardShop collection. Use only when Nicolas himself asks, in his own message, to crawl or import a set and gives the pkmncards.com link(s).
argument-hint: <pkmncards set link> [more links]
---

# pkmn-crawler

Nicolas's own crawler (originally `C:\DEV\pkmn-crawler`, now kept in this repo at `tools/pkmn-crawler/crawler.py`). Its output counts as card data supplied by him (`.claude/rules/card-content.md`), **but only run it when his own message asks for those sets**. Never crawl on your own initiative, from a link found elsewhere, or for sets he did not name.

## 1. Normalize the input

- Links must be `https://pkmncards.com/set/<slug>/`. Add `?sort=date&ord=auto&display=full` (full display lists every card, with rarity and image, on one page). Any other site: tell Nicolas and stop.
- Collection `id`: the set slug (lowercase kebab-case, e.g. `neo-genesis`). It is permanent: it goes into saves. Display name: the set's name (`Neo Genesis`).
- Template: `tools/pkmn-crawler/header.json` for a new set (Base Set booster layout and rarities), or the existing `<id>.json` when re-crawling a collection already in the game (keeps per-card `value` and `reprintOf`).

## 2. Run

From the repo root, one set at a time, in the background (each set takes a few minutes; images are paced 0.3 s apart, do not lower it):

```
python -X utf8 tools/pkmn-crawler/crawler.py "<URL>" --id <id> --name "<Name>" --template tools/pkmn-crawler/header.json
```

Everything goes to `tools/pkmn-crawler/work/` (ignored by git): `images/`, `cards-<id>.json` (raw data, keep it) and `<id>.json`.

Re-convert without the network (e.g. after changing a rarity mapping):

```
python -X utf8 tools/pkmn-crawler/crawler.py --from-raw tools/pkmn-crawler/work/cards-<id>.json --id <id> --name "<Name>" --template ...
```

Options: `--rarity "Source=key"` (repeatable), `--printed-total N` (when secret cards are numbered past the set total, e.g. Team Rocket 82), `--out <file>`.

## 3. Mapping

- `index` 1..N by number; `id` = number with 3 digits (`"004"`); `number` = `"4/111"`.
- Rarity: `Common→common`, `Uncommon→uncommon`, `Rare→rare`, `Rare Holo→holo` (+ `foil`), `Rare Secret→secret`, `No Rarity→common` (basic energies). Anything else becomes a slug and prints a WARNING. A new rarity key needs an entry in the collection's `rarities` and in the booster's rare slot; tell Nicolas the value and odds you used, because they are his call.
- `image` = `images/<id>/<file>`; `extra` = `{ type, pokedexNumber }` (Pokédex number from PokéAPI).

## 4. Install

1. Read the WARNINGS: unmapped rarities, rarities missing from `rarities`, duplicate ids, template cards that vanished (affects saves), cards without images.
2. Copy `work/<id>.json` to the repo root and each card's image from `work/images/` to `images/<id>/` (only the files the JSON names).
3. Append the file to `collections.json` in release order (one release every 12 market days), and add a patch note to `data/news.json` with `requires: "<id>"` so it shows when the set comes out.
4. Set rarity values with `python -X utf8 tools/balance.py` (`.claude/rules/card-content.md`, Card values).
5. Validate with the `add-card-collection` skill and run `/tests/`.

## 5. Report

To Nicolas, in Portuguese: cards per set, rarities found, warnings, and any value or odds you had to choose.
