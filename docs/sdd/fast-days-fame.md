# SDD: 10-minute market days, Fame, new-set customers

Requested by Nicolas on 2026-11-27. Save v4 (all older saves start over, his call).

## Market days

- One global clock: `day = floor(now / DAY_MS)`, `DAY_MS` = 10 minutes (`js/market.js`). Same day, same prices for every player. Time zones are gone (setup and Settings).
- The header shows `Day N` counted from the save's first day, and a countdown to the next day.
- Releases every 12 days (2 real hours). 20 rival shops buy every day: a new collection drops below 30% left in about 5 real hours, and reprints refill it in cycles (see booster-supply.md).
- Offline is still simulated in full with no cap: one real day away is 144 market days.

## Fame upgrade

`UPGRADES.fame`: saved value 0-19, shown as Lv 1-20. Cost $200 x 1.5^level.

| Rule | Value |
| --- | --- |
| Fame 1 (saved 0) | Budgets log-uniform $2-$120, as before |
| Everyday ceiling | `budgetCap(fame)` = $120 x (1 + fame/19): $240 at Fame 20 (1.7.1) |
| From Fame 2 | `richShare(fame)`: 10% at Fame 2 up to 35% at Fame 20 (1.7.1) draw log-uniform from the everyday ceiling to `richCap(fame)` |
| `richCap` | $120 x (1000/120)^(fame/19): $1,000 at Fame 20 |
| Rich customers | Collectors: they weigh cards by market value (not its square root), so pricey cards get their looks (1.7.1) |
| Customers | +3% per level (`FAME_CUSTOMERS`), on top of Marketing |

1.7.1 (Nicolas, 2026-11-28: a $70 card took too long to sell at Fame 20): with a full showcase of cheaper cards, a $70 card at market now sells in about 10 seconds on average at Fame 20, against about 5 minutes at Fame 1.

## New-set customers

Relaxes the "no punishment" pillar (Nicolas, 2026-11-27): no money or reputation is lost, only the sale.

- `wantedSet`: the newest released collection past the first. On its release day `WANT_SHARE` 30% of customers want it; the share fades to 0 over `WANT_DAYS` 6 days.
- A customer who wants it only looks at that collection's cards. With none in the showcase they leave (`stats.missedCustomers`), shown in the Customers box as `wanted <set>`.

## Save impact

`saveVersion` 3 -> 4, migration 3 returns `{}` (new shop). New: `upgrades.fame`, `stats.missedCustomers`. Removed: `timeZone`.

## Tutorial impact

Revision 5 -> 6: `market` and `nextset` texts updated.
