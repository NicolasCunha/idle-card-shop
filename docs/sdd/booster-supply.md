# SDD: booster supply, release calendar, News, Market search

Requested by Nicolas on 2026-11-27 (audio message). GDD sections 8.1 and 8.2.

## Goal

Boosters are finite. Each collection has a print run that rival shops buy from every day, so booster prices rise over time; reprints bring them down. Collections come out on a calendar instead of a discovery gate, so new sets can be added without the player hitting a wall. A News panel tells the player about releases, reprints and game updates. The Market table gets card numbers, search and an "All collections" filter.

## Rules and numbers

All tunables are constants at the top of `js/supply.js`.

| Constant | Value | Meaning |
| --- | --- | --- |
| `RELEASE_EVERY_DAYS` | 7 | Market days between releases, from the save's first day |
| `BASE_PRINT_RUN` | 1,000,000 | First collection's print run |
| `PRINT_GROWTH` / `PRINT_CAP` | 1.25 / 2 | Each newer set prints 25% more, up to 2x the first |
| `PLAYER_MARGIN` | 0.10 | Rivals never take the supply below 10% of all printed |
| `DISTRIBUTOR_EXPONENT` | 0.25 | distributor price = wholesale x (printed / left)^0.25 |
| `MARKET_EXPONENT` / `MARKET_SWING` | 0.5 / 0.06 | Market value = wholesale x (printed / left)^0.5 x daily swing (5- and 13-day waves, about ±12%) |
| `MIN_LEFT_FRAC` | 0.02 | Prices stop rising below 2% left (distributor ~2.7x, Market ~7x) |
| `MARKET_BUY_RATE` / `MARKET_SELL_RATE` | 1.1 / 0.9 | Sealed boosters on the Market |
| `RIVALS` | 8 appetites, 0.04% to 0.6% of the run per day | Rival shops |
| Rival buy chance | 60% per rival per day | Demand fades from 100% to 20% (`HYPE_DAYS` 30) |
| Returns | 12% per day, up to 0.4% of the run | From what rivals hold |
| Reprints | Below 35% left, 2% per day, 40-80% of the run | Adds to printed and left |

Pools per collection (`state.market[setId]`): `left` (at the distributor), `held` (rival shops' stock, which the Market sells from), `printed` (run plus reprints).

- Distributor buy: `left - 1`, pays the booster price.
- Market buy: `held - 1`, pays 110% of Market value. Works when the distributor is sold out.
- Market sell: `held + 1`, earns 90% of Market value. Sold boosters go to rival stock, not back to the distributor, so buying at the distributor and flipping on the Market is possible (Nicolas wants manipulation) but finite: every distributor buy uses up supply and raises the price (tested).

The distributor rises with scarcity too, but less than the Market, which also swings day to day (Nicolas, 2026-11-27: the second-hand market is more volatile). `hist` keeps the daily scarcity (printed / left) so the Market 7-day change can be recomputed.
- The pricing staff and the buyer use the distributor; the buyer shows `sold out` when `left < 1`.

Daily dice come from `hashRand('supply', setId, daysSinceRelease, ...)` with the global market seed, so the world is the same for everyone who makes the same choices. The player's trades change the pools, so the pools are saved. This is an approved exception to "nothing about the market is stored in the save"; card prices are still computed from the day only.

`advanceSupply` runs inside `tick` on every day change and steps each released collection up to its current age, so live play, offline catch-up and a single large jump give the same supply (tested).

Release: a collection with `releaseIndex` i is out when `day >= firstDay + 7i`. Collections that are not out are hidden from every selector, the Market and the binder. The 90% unlock (`UNLOCK_AT`) is gone.

## News

- `state.inbox`: game notices (release, reprint, big rival buys), newest first, capped at 60. `state.inboxRead` is the highest id seen.
- `data/news.json`: patch notes `{ id, date, version, title, text, requires? }`. `requires` hides a note until that collection is out. `state.newsSeen` lists note ids the player has seen.
- The header News button shows the unread count; opening the panel marks everything read.

## Market search

`cardFilter(query)` in `js/data.js`: words match the name, a plain number matches the card's number in its collection, `1/102` matches the printed number; every part must match.

## Save impact

`saveVersion` 2 -> 3. Nicolas chose to start every older save from zero (migration 2 returns `{}`, defaults fill in a new shop). New fields: `market`, `inbox`, `inboxRead`, `newsSeen`, `stats.boostersSold`, `stats.boostersBoughtMarket`. Removed: `stats.rescues`.

## Tutorial impact

Revision 3 -> 4. New steps `supply` (Market booster table, done on the first booster bought or sold on the Market) and `news` (News button). `market` and `nextset` texts updated.

## Open questions

- Storage caps sealed boosters at 20 + 10 per level (max 220), which limits speculation. Maybe a bigger storage upgrade later.
- Customers still do not buy sealed boosters [PENDING GDD Q4].
