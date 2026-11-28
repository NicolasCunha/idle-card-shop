# Staff jobs, storage space, warehouses and marketing (save v6, game 1.9.0)

All rules and numbers below were proposed on 2026-11-28 and approved by Nicolas ("Pode seguir").

## Staff: up to 30, a main and a backup job

- Staff room goes to level 29, so 30 staff. Levels 0-8 cost as before ($150 × 2.2^level); later levels grow by ×1.35 per level. Hiring the same: 50 × 2.2^n up to n = 8, then ×1.35 per hire.
- A job is an action (Buy, Open, Price) and a collection. "Any" means the shop rules' collection for Buy and Open, and every collection for Price.
- Each employee has a main job (`task`, `set`) and an optional backup job (`task2`, `set2`). Each step they try the main job first and do the backup job only when the main one has nothing to do. Status `backup job` shows when they are on it.

## Storage space

- Shop storage (Bigger storage upgrade) now holds every sealed good: booster 1 space, accessory 1, booster box 10.
- Buying boosters, boxes or accessories, opening a box (needs 26 free: 36 boosters in, 10 out) and staff buys all check free space.
- Saves already over the limit keep their goods; nothing more comes in until there is room.

## Properties tab: warehouses

- Unlocks at $25K earned. Any number of warehouses, each level 1-10.
- Buy $50K. Upgrade $50K × current level. Space 100K per level (1M at level 10). Fee $250 per level per market day, paid continuously by the tick (Finances: Properties). When cash cannot cover the fee, shipments wait; no debt.
- Goods are pooled across warehouses, with the same ids as Storage (`b:`, `x:`, `a:`).
- Fill: buy straight into the warehouses at distributor price (boosters in lots of 100, boxes one by one, so the price follows supply), or move everything from the shop (Store all).
- Ship to the shop by hand (Ship 100) or by a per-good target (Keep in shop), checked every 5 s. Arrival by shipment size in space: up to 1K in 1 market day, up to 10K in 2, more in 3. Shop space is reserved for goods on the way.

## Marketing tab: campaigns

- Unlocks at $1K earned once Upgrades is open. One campaign at a time; the Marketing upgrade stays in Upgrades.

| Campaign | Cost | Market days | Customers | Budgets |
| --- | --- | --- | --- | --- |
| Flyers | $500 | 1 | +25% | — |
| Radio ad | $5,000 | 2 | +50% | +10% |
| TV ad | $50,000 | 3 | +100% | +25% |

## Save v6

| Field | Old saves |
| --- | --- |
| `staff[].set`, `task2`, `set2` | Current task stays the main job, any collection; no backup |
| `properties { warehouses, goods, ships, targets }` | None |
| `campaign { kind, left }` | None |
| `stats.campaigns`, `feesPaid`, `shipments` | 0 |
| `unlocked.marketing`, `unlocked.properties` | Re-checked on load |
| `inbox[].detail` (1.8.1) | Old notices keep only their title |

## Tutorial (rev 8)

New steps: `backup` (second employee: give a backup job), `marketing` (tab unlocks), `properties` (tab unlocks). The `task` step now says "Pick a job for them."
