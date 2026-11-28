# Economy update (save v5)

Decided by Nicolas on 2026-11-28 (he approved every recommended option). GDD sections 6, 7, 8.3, 10 and 12.

## Seed per save

- `state.seed` (string). A new save gets a random UUID; the market and booster supply hash with it (`M.setSeed`, called by `G.prepare`).
- Saves from v4 get the old global seed `idlecardshop-market-v1`, so their prices do not change.

## Salaries

- Each employee costs, per market day (10 min), `$2 × (sum of skill levels) × (1 + 1% per market day at the shop)`. The tenure bonus stops at +50% (50 market days), so salaries cannot outgrow a long-running shop.
- Paid continuously by the same tick, live and offline (Nicolas approved charging offline).
- When cash cannot cover the next payment, the employee stops (status `unpaid`) until there is cash. No debt, no quitting. Training also waits.
- `emp.hiredDay` (market day of hiring). Saves from v4: set on the first tick after loading, so tenure counts from that day.
- Staff tab shows each employee's salary per day and the total payroll.

## Finances tab

- `state.ledger`: one entry per market day, newest last, `{ day, in: { cat: $ }, out: { cat: $ } }`, kept for `LEDGER_DAYS` (72 market days, 12 hours). Every money change goes through `earn(state, v, cat)` / `spend(state, v, cat)`.
- Income categories: `cards`, `bulk`, `sealed` (Storage sales), `market` (sealed sold on the Market). Expenses: `boosters`, `market` (sealed and singles bought), `goods` (boxes and accessories), `upgrades`, `hires`, `training`, `salaries`.
- The tab shows today by category (income, expenses, net) and a table of the previous days with a small net bar.
- Unlocks with the Showcase (first sale). Saves from v4 start with an empty ledger.

## Storage tab: sealed goods and accessories

- Goods: sealed boosters (the existing `state.stock`), booster boxes and accessories.
- **Boxes:** 36 boosters of one collection. Bought from the distributor at 36 × the booster price × 0.9, taking 36 from the supply. Can be opened into 36 boosters (needs storage room) or sold sealed. Market value = 36 × the booster's market value.
- **Accessories:** `data/accessories.json`, a placeholder list (sleeves, deck boxes, playmats by energy type) for Nicolas to replace; no images. Each has a wholesale `cost` and a base `value`; today's value swings ±5% by the seeded hash.
- `state.goods`: `{ 'x:<set>': boxes, 'a:<id>': accessories }`. `state.shelf`: `[{ g, p, n }]`, goods for sale (`g` = `b:<set>` booster, `x:<set>` box, `a:<id>` accessory) at price `p`, `n` units. Shelf room: 20 + 10 per Bigger showcase level.
- The Storage tab lists every good with stock, today's value, a price field (prefilled at market, shows the % against market) and List 1 / 10 / all; Buy for boxes and accessories; Open for boxes; the shelf with Recall.
- **Customers:** when the shelf has goods, 25% of visits look at up to 2 shelf goods they can afford (weight √value) and buy with the same price bands as cards. They pay the tag × Reputation. With an empty shelf they shop for cards as before.
- Unlocks with the Market tab. Saves from v4 start with empty goods and shelf.

## Achievements

- `js/achievements.js`: a list of `{ id, name, desc, test(state, sets) }`, plus one "<Collection> complete" per collection and "Master collector" for all.
- `state.achievements`: `{ id: day earned }`. Checked every 5 simulated seconds in the tick. No reward (Nicolas).
- Saves from v4 get everything they already qualify for on load, silently. Later ones make a News notice and a toast.
- Header button **Awards** with an earned / total count opens the list.

## Themes

Settings → Theme: System, Light, Dark, plus Forest, Ocean, Lavender, Rose, Sepia, Midnight, Mint, Ember (10 named themes). Each sets the CSS variables; `data-mode` (light or dark) drives the few dark-only rules. Device preference, not in the save.

## Save v5 migration (4 → 5)

| Field | Old saves |
| --- | --- |
| `seed` | Old global seed |
| `staff[].hiredDay` | Set on the first tick after loading |
| `ledger` | Empty |
| `goods`, `shelf` | Empty |
| `achievements` | Filled on load from what the save qualifies for |
| `unlocked.storage`, `unlocked.finances` | Derived on the first tick |
| New `stats` counters | 0 |

## Tutorial

Rev 7: `salary` step after the first hire (points at the Finances tab), `storage` step when the Storage tab unlocks, then `shelf` (list a good).
