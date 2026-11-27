---
name: add-card-collection
description: Add a new card collection (card set) to IdleCardShop, or update an existing one, from data and images Nicolas supplies. Use when asked to add a set, import a card list, fill in the Base Set template, or add card images.
---

# Add a card collection

Follow `.claude/rules/card-content.md`. Card data and images come only from Nicolas: never fetch, scrape or recall official card lists, prices or art.

## 1. Gather input from Nicolas

Ask for whatever is missing (in Portuguese):

- Collection `id` (lowercase, kebab-case, permanent — it goes into saves), display `name`, `game`, `releaseYear`.
- Rarities, from most common to rarest, each with name, base value and color.
- Booster: `wholesalePrice` and `slots` (how many of each rarity, holo chance). Base Set: 7C / 3U / 1R (33% holo).
- The card list: index, id, name, rarity, and optional number, foil, value, reprintOf, extra.
- Images: where they are. Do not proceed to invent any of these.

## 2. Write the files

1. Create `<collection-id>.json` at the repo root with the fields in GDD section 4.
2. Copy images Nicolas provided into `images/<collection-id>/` and point each card's `image` at its file. Leave `image` out for cards without art.
3. Add the collection to `collections.json`.

For an existing collection, never change a published `id` (collection or card). Adding cards is safe; removing a card is a save-impact question for Nicolas (`.claude/rules/save-schema.md`).

## 3. Validate

Check and report:

- [ ] JSON parses; required fields present
- [ ] collection `id` unique across `collections.json`; card `id`s and `index` unique within the file
- [ ] every card `rarity` is a key of `rarities`; every `booster.slots` rarity exists
- [ ] every `reprintOf` resolves to an existing `collection:card`
- [ ] every `image` path exists; images are 5:7
- [ ] no placeholder left that Nicolas expected to be filled (list them if any)

Then serve the repo root (`python -m http.server 8000`), open `/tests/` (collection checks must pass) and the game itself, and open one booster of the new collection. The browser console lists any card the loader skipped.

## 4. Tutorial and summary

A new collection alone has no tutorial impact. If it brings a new mechanic (new rarity tier with a new reveal level, for example), follow `.claude/rules/tutorial.md`.

Tell Nicolas what was added, how many cards, how many still lack images, and any placeholders.
