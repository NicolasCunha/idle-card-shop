# IdleCardShop — Game Design Document

Nov 26, 2026 · @Nicolas · translated to English and brought up to date with game 1.6.1 on Nov 28, 2026 (Nicolas: the whole project is in English)

> Source: [GDD Claude Doc](https://claude.ai/artifact/Qk7rreXjreA9rsB8n22A4i) (revision 29, Portuguese). This file is now the source of truth. Status: **in use**. Open items are in section 12.

## 1. Overview

IdleCardShop is a calm, menu-based idle browser game where the player runs a trading card shop: buy boosters, open them, price the cards, sell them, and slowly automate everything with staff.

| Item | Decision |
| --- | --- |
| Genre | Idle / incremental, Cookie Clicker style (menus, plus one small pixel-art shop scene) |
| Platform | Browser; static site on GitHub Pages, later on its own domain |
| Model | Free, non-profit fan game |
| Card games | Pokémon and Magic: The Gathering (classic sets) |
| Shipped collections | Pokémon Base Set, Jungle, Fossil, Base Set 2, Team Rocket |
| Language | English everywhere: game, code and documents (Nicolas, 2026-11-28) |
| Card content | Data and images supplied by Nicolas; the code only reads and renders them |
| Save | localStorage plus versioned JSON export/import |

**Pillars**

1. **Calm.** No shop hours, no queues, no impatient customers, no penalty for being away. The player never has to hurry. Approved exceptions: new-set customers who leave when the newest collection is missing (section 7) and staff salaries (section 6, decided 2026-11-28).
2. **Manual to automatic.** The start is done by hand; the middle is hiring and training; the end is the shop running on its own while the player handles stock and the market.
3. **The joy of opening boosters.** Opening is the game's special moment, with an animation and the rarest card revealed last.
4. **A readable market without guarantees.** Prices change once per market day; the player can read trends and invest.
5. **True idle.** Closing the game loses nothing: on return, all the time away is simulated in full.

**Out of scope for now:** multiplayer, online accounts, monetization, prestige (section 12), collections Nicolas has not asked for.

## 2. Design foundations

The game combines four well-known ideas: the core loop with a progression engine, the exponential cost seesaw of idle games, cozy design, and the choreography of card reveals.

| Concept | What it says | How we use it |
| --- | --- | --- |
| Core loop + progression engine ([Roblox](https://create.roblox.com/docs/production/game-design/core-loops)) | A loop has the moment-to-moment action, the most repeated set of actions, and a progression engine; without progression the game gets repetitive | Action: open and price. Loop: buy → open → price → display → sell. Progression: staff, levels and upgrades |
| Anticipation → action → reward ([GameAnalytics](https://www.gameanalytics.com/blog/the-compulsion-loop-explained)) | Each loop step has expectation, action and reward; variable-ratio rewards hold attention | Booster rarity is the variable reward, used without real money and without pressure, only for the joy of the reveal |
| Exponential seesaw ([Pecorella, Math of Idle Games I](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i)) | Cost grows exponentially (base × rate^owned) while production grows linearly; multiplier milestones push the player back up | Hiring, training and upgrades have exponential costs; skills get faster per level |
| Re-engagement clocks ([Eric Guan](https://ericguan.substack.com/p/idle-game-design-principles)) | Systems with very different time cycles serve both the player who checks in every hour and the one who visits once a day; ~10–15% gains per level are noticeable | Short cycle: sales and openings. Medium: training. Long: market days, releases and supply events |
| Prestige ([Pecorella, Math of Idle Games III](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii)) | A voluntary reset with a permanent bonus keeps numbers manageable and creates a ladder to climb | Not now (Nicolas, 2026-11-28: think about it later) |
| Cozy: safety, abundance, softness ([Kitfox](https://medium.com/kitfox-games/designing-for-coziness-d33d2519a59e)) | Cozy mechanics are optional, safe and relaxing; risk and harsh stimuli break the mood | No queues, no angry customers, no offline loss; soft palette and music; collecting as an activity in itself |
| Reveal choreography ([N3TWORK](https://medium.com/n3twork/choreographed-emotion-6-steps-to-a-great-card-reveal-ux-a6e6bb8487dd)) | Six steps: gesture start, short summon, rarity preview, reveal, summary, repeat; commons fast, rares celebrated | Tear the pack with a gesture, commons first and fast, the rare last with glow and sound, a summary and "Open another" |

**Self-imposed limit:** the variable reward exists only inside the game, with game money. No real money, ads, nagging notifications or punishment for leaving.

## 3. Core loop

The player turns money into boosters, boosters into cards and cards into money, at a profit, and reinvests. Each step can be done by hand or by an employee.

```
Buy → Open (binder) → Price (showcase) → Customers buy → (money back to Buy)
 each step: by hand or by an employee
```

The three limits (storage, showcase and demand) are exactly what the upgrades raise.

1. **Buy** sealed boosters from the distributor (price follows the supply left, section 8.1). They go to storage, which has limited room.
2. **Open** boosters. Every card goes to the binder, and the player decides later what to do with each copy.
3. **Price** binder cards: the player picks how many and the price (today's market, ±5% or ±10%, or a typed price). Pricing puts the card straight into the showcase, which has a limited number of slots. Cards under a minimum value can go to *bulk*, sold to a wholesaler at 30% of value.
4. **Customers** arrive on their own, each with a budget, and buy from the showcase with a chance that depends on the price (section 7). The money goes back to step 1.

**Progression**

| Phase | What the player does | Typical bottleneck |
| --- | --- | --- |
| Start | Clicks every step | The player's time and clicks |
| Middle | Hires the 1st, 2nd, 3rd employee and picks each one's task | Speed of the slowest step |
| Advanced | Trains skills, buys upgrades, tunes the shop rules | Customer demand and showcase size |
| Idle | Shop 100% automated; the player handles the market, the binder and investments | Market choices |

**Re-engagement rhythms**

| Scale | What happens | Why come back |
| --- | --- | --- |
| Seconds | Customers buy, staff work | Watch the money come in |
| Minutes | Training ends, a hire or upgrade becomes affordable; a new market day every 10 minutes | Spend what you saved, check prices |
| Hours | A new collection every 2 hours; stock runs out; skills level up with practice | Open the new set, restock, tune rules |
| Days | Supply drops, rivals buy, reprints come | Speculate with sealed boosters |

**Pacing targets** (balancing goals, checked by simulation before each version)

| Milestone | Target |
| --- | --- |
| First sale | Under 1 minute |
| First employee ($50) | 3 to 5 minutes |
| Fully automated shop (3 staff: Buy, Open, Price) | 45 to 90 minutes (measured: about 2 hours; Nicolas, 2026-11-27: leave as is for now) |
| First skill at level 10 | A few days of idle play |
| Base Set complete (discovered) | 1 to 2 weeks, or sooner by buying singles |

**Player actions** (the single table of manual action prices and effects)

| Action | Where | Effect | Cost or gain |
| --- | --- | --- | --- |
| Buy booster / 5 / 10 / 100 / all | Shop | +n sealed boosters, −n supply | Base price × (printed ÷ left)^0.25 each |
| Buy booster | Market | +1 sealed booster, bought from rival shops | 110% of the booster's market value |
| Sell booster | Market | −1 sealed booster, goes to the rivals' stock | 90% of the booster's market value |
| Open 1 / 10 / 100 / all | Shop | Cards go to the binder | — |
| Price (1 / 10 / 100 / all, price level, Keep 0 or 1) | Shop | The most valuable binder copies go to the showcase | — |
| Bulk | Shop | Sells copies under the minimum value | 30% of market |
| List (quantity and free price) | Binder card detail | Copies of the card go to the showcase; listing the last copy asks first | — |
| Recall all | Showcase | The showcase goes back to the binder, to reprice | — |
| Buy single | Market | +1 copy in the binder | 110% of market |
| Hire, train, upgrade | Staff, Upgrades | See sections 6 and 7 | Exponential cost |

The binder records every card ever discovered (collection progress) and every copy the player owns. A discovered card with no copy is dimmed. Manual pricing and listing can sell any card, cheap ones included; only the staff pricer sends cheap copies to bulk.

## 4. Collections and cards

Each collection is a JSON file at the project root, and `collections.json` lists which ones the game loads, in release order. Adding a collection = create the JSON, add the images and add a line to `collections.json`, with no code change. Nicolas's crawler (`C:\DEV\pkmn-crawler`) emits this format.

**Collection fields**

| Field | Required | Use |
| --- | --- | --- |
| `id` | yes | Unique, permanent id (stored in the save) |
| `name` | yes | Display name |
| `game` | no | `pokemon`, `magic`... |
| `theme` | no | Visual style of that game's cards |
| `releaseYear` | no | Release year |
| `boosterImage` | no | Pack image |
| `booster.wholesalePrice` | yes | Base booster price at the distributor |
| `booster.slots` | yes | Booster layout by rarity (e.g. 7 commons, 3 uncommons, 1 rare with a holo chance) |
| `rarities` | yes | Rarities from most common to rarest, with name, base value and color |
| `reprintFactor` | no | Value of a reprint of this collection relative to the original (default 0.5) |
| `cards` | yes | Card list |

**Card fields**

| Field | Required | Use |
| --- | --- | --- |
| `index` | yes | Binder order |
| `id` | yes | Unique, permanent id within the collection |
| `number` | no | Printed number (e.g. 4/102) |
| `name` | yes | English name |
| `rarity` | yes | One of the `rarities` keys |
| `foil` | no | Applies the holographic effect |
| `image` | no | Image path; if missing, the game draws a generic card |
| `value` | no | Own base value (famous cards); otherwise the rarity's |
| `reprintOf` | no | `collectionId:cardId` of the original printing |
| `extra` | no | Free data for the future (type, HP, artist) |

**Rules**

- Collection and card `id`s never change once published, because the save stores them.
- The order of the `rarities` keys sets the reveal order when opening (commons first).
- Images at 5:7 (e.g. 500×700), PNG, JPG or WEBP, in `images/<collection id>/`.
- Rarities follow the crawler's source rarity. Team Rocket's Dark Raichu (83/82) has its own `secret` rarity, rarer than holo (2% of the rare slot).
- Collections release one after another on a calendar (section 8.1); an unreleased collection is hidden everywhere.

## 5. Opening boosters

Opening one booster at a time is an animated scene that imitates a real opening; opening in bulk skips the animation and shows the result in a scrolling list.

| Button | Behavior |
| --- | --- |
| Open 1 | Full animation |
| Open 10 | No animation; results grid |
| Open 100 | No animation; results grid |
| Open all | No animation; opens every sealed booster of the collection |

**Animation (Open 1)**

1. The pack appears large in the center of the screen.
2. The player clicks (or drags) and the pack tears: the top strip comes off, with a paper sound.
3. The cards come out as a face-up stack. The top card is the most common.
4. The player drags or clicks the top card and it slides aside, revealing the next, with a card sound.
5. The order is always most common to rarest; the last is the rare or holo. Rare and foil cards get a glow and a special sound.
6. At the end, a summary shows the pack's cards with "NEW" marks and the estimated value, with "Open another" and "Done".
7. A "Skip" button goes straight to the summary.

**Celebration levels** (the player never has to learn more than 3; commons pass fast, rares get the stage)

| Level | Rarities | Reveal |
| --- | --- | --- |
| Quiet | Common, uncommon | Fast slide, short card sound |
| Highlight | Rare | Short pause, edge glow, musical note |
| Big | Holo / foil / secret | Preview before the flip (the card behind glows), holographic shine, special chord |

A new card gets the NEW badge at any level. Each animation step can be sped up with a tap.

**Bulk results (10 / 100 / all):** identical cards are grouped with a count, sorted rarest first, with "NEW" marks and the total value.

**Card render sizes**

| Context | Size |
| --- | --- |
| Opening (card in focus) | Large, most of the screen height |
| Opening summary and showcase | Medium |
| Binder | Small, in a grid |
| Market and showcase tables | Thumbnail |

**Booster layout:** set in each collection's `booster.slots`. Base Set (Nicolas, 2026-11-27, following the real rarities): 11 cards, 7 common, 3 uncommon and 1 rare (67% rare, 33% holo rare). The 6 basic energies count as commons, so the set has 38 commons, 32 uncommons, 16 rares and 16 holo rares. Jungle, Fossil, Base Set 2 and Team Rocket use the same layout and a $4 wholesale price.

## 6. Staff

Each employee has 3 independent skills, level 1 to 10, and does one task at a time chosen by the player. They improve on their own at the task they practice, or faster with paid training.

| Skill | What it does | Time at level 1 |
| --- | --- | --- |
| Buy | Buys 1 booster from the distributor | 8 s per booster |
| Open | Opens 1 booster | 10 s per booster |
| Price | Prices 1 binder copy and puts it in the showcase (or bulk) | 3 s per card |

- **Speed:** each level makes the action 22% faster; at level 10 it is about 9× faster.
- **Experience:** each action gives 1 XP in that skill. XP to the next level = 25 × level^2.3 (level 1→2: 25 actions; level 9→10: about 3,900).
- **Training:** costs 40 × 2^level and takes 20 s × level; the employee does not work while training. +1 level.
- **Hiring:** costs 50 × 2.2^(current staff). Slots: 1 + the Staff room upgrade. Each new employee starts at level 1 or 2 in each skill, at random.
- **Visible status:** working, idle, training, or the reason for waiting (no packs, showcase full, cash reserve...).

**Shop rules** (for staff; some also for the player)

| Rule | Default |
| --- | --- |
| Collection the buyer buys | First collection |
| Collection the opener opens | First collection |
| Stock target (buyer stops when reached) | 10 boosters |
| Cash reserve (buyer does not spend below it) | $20 |
| Minimum value for the showcase (below goes to bulk) | $0.25 |
| Copies the pricer leaves in the binder (Keep copies) | 1 |
| Pricer's price (market, ±5% or ±10%) | Market |

**Back pressure:** the pricer waits when the showcase is full.

**Salaries (Nicolas, 2026-11-28; shipped in 1.7.0, `docs/sdd/economy-v5.md`):** each employee costs, per market day, $2 × the sum of their skill levels × (1 + 1% per market day at the shop, up to +50%). Paid continuously by the same tick, live and offline. When cash cannot cover the next payment the employee waits (status `unpaid`) until there is cash: no debt, no quitting. The Staff tab shows each salary and the payroll.

## 7. Customers and economy

Money comes in when customers buy from the showcase; demand is the shop's natural limit and upgrades raise it.

**Customers**

- One arrives on average every 6 s, divided by (1 + 25% per Marketing level) × (1 + 3% per Fame level).
- Budget: $2 to $120, log-uniform; Fame raises that ceiling to $240 at level 20. From Fame level 2, 10% of customers are "rich" (35% at level 20), with a budget from that ceiling up to a cap that grows with Fame to $1,000 at level 20. Rich customers are collectors: they look at the priciest cards first.
- Each looks at up to 3 cards that fit the budget. Pricier cards draw more attention: a card's chance of being looked at is proportional to the square root of its market price.
- For each card or good looked at, the chance of buying depends on the tag compared to today's market (Nicolas, 2026-11-28, after TCG Card Shop Simulator; linear between the points):

| Tag vs market | Buy chance |
| --- | --- |
| −20% or less | 100% |
| −10% | 95% |
| Market | 90% |
| +10% | 75% |
| +20% | 60% |
| +30% | 45% |
| +40% | 15% |
| +50% | 5% |
| +60% | 1% |
| Above +60% | never |

- Rich customers judge a tag 10 points closer to market (a +30% tag sells like +20%).

- The customer pays the tag × the Reputation bonus × the collection milestone bonus.
- **Feelings:** each look is judged cheap (≤ 99.5% of market), fair (≤ 110%), pricey (≤ 130%) or steep. The Showcase tab shows how customers feel about each card and a summary.
- **New-set customers (Nicolas, 2026-11-27):** on a release day 30% of customers come only for the newest collection, fading to 0 over 6 market days. With none of it in the showcase they leave without buying.
- No queue and no patience: nobody leaves angry.

**Upgrades**

| Upgrade | Effect per level | Starting cost | Growth | Max |
| --- | --- | --- | --- | --- |
| Bigger storage | Sealed booster room on a curve: 20, 30, 40 ... 450 at level 10 ... 10,000 at level 20 (Nicolas, 2026-11-28) | $40 | ×1.6 | 20 |
| Bigger showcase | +20 showcase slots (base 40) | $60 | ×1.6 | 20 |
| Marketing | +25% customers | $80 | ×1.75 | 20 |
| Reputation | +6% price paid | $120 | ×1.85 | 15 |
| Staff room | +1 staff slot | $150 | ×2.2 | 8 |
| Fame | Richer customers, +3% customers, shop decor | $200 | ×1.5 | Lv 1–20 |

**Starting numbers**

- Starting cash: $20. Booster: $4.
- Base value by rarity (Base Set): common $0.15 · uncommon $0.40 · rare $3 · holo rare $12. Famous cards set their own `value`.

**Cost formulas** (genre standard: cost = base × rate^level)

| Item | Base | Rate | Note |
| --- | --- | --- | --- |
| Hire | $50 | 2.2 | n = current staff |
| Train | $40 | 2 | n = current skill level |
| Upgrades | See table above | 1.5 to 2.2 | Each with a level cap |

Buying several at once uses the geometric series: the cost of n items from level k = base × rate^k × (rate^n − 1) / (rate − 1).

**Collection milestones** (approved by Nicolas, 2026-11-28)

| Collection discovered | Reward |
| --- | --- |
| 25% | +2% price paid for that collection's cards |
| 50% | +4% |
| 75% | +6% |
| 100% | +10% and a badge in the binder |

## 8. Market

Card prices change once per market day by a deterministic calculation: the same day gives the same price, nothing about card prices is saved, and no change is permanent.

**Market day (Nicolas, 2026-11-27)**

- A market day lasts 10 real minutes. Day number = floor(time / 10 min), the same for everyone; there are no time zones.
- The header shows "Day N" (counted from the save's first day) and the time to the next market day.

**Today's price = the card's base value × the day's multiplier.** The multiplier comes from a hash of (seed, card, day) and sums three components:

| Component | What it models | Range | Rhythm |
| --- | --- | --- | --- |
| Card noise | Normal day-to-day movement | ±~7% | Waves of 9 and 23 days |
| Collection trend | The whole collection heats up or cools down | ±~8% | Waves of 35 days |
| Interest events | News makes demand rise or fall | +15% to +100% or −10% to −40% | Weeks to months of market days |

**Interest events**

- Each card has a 22% chance of an event per 40-day window, with a news line ("{card} went viral online", "A famous streamer opened a {card}"...).
- Shape: gradual rise → optional plateau (0 to 25 days) → gradual fall → a 0 to 50% remainder that also fades slowly.
- Overlapping events have a soft cap of ~3× and a floor of ~1/3 of the base value.

**No spikes:** tested over 4,000 days × 102 cards, the largest day-to-day change was +6.1% / −5.5%.

**Booster reprints** (Nicolas, 2026-11-28): 32% to 64% of the first print run. Once a newer collection is out, a reprint is never bigger than the previous one.

**Reprints:** a card with `reprintOf` feels the original's events at 60% strength and is worth half the original by default (`reprintFactor`).

**Seed:** each save gets its own seed (a UUID) when it starts (Nicolas, 2026-11-28; 1.7.0). Saves from before 1.7.0 keep the old global seed, so their prices do not change.

**What the player does with it**

- The Market tab searches every released collection by name, number or collection name, with Collection and number columns, today's price, 1- and 7-day change and a 30-day chart, plus recent news.
- The player speculates with the section 3 actions: buy singles or boosters on the rise, hold in the binder, recall the showcase to reprice.
- A tag never changes on its own: old showcase cards become cheap when the market rises and stall when it falls.

### 8.1 Booster supply and release calendar (Nicolas, 2026-11-27)

Boosters are not infinite. Each collection has a print run, and the booster price rises as supply runs out, as in real life.

**Release calendar**

- The game starts with the Base Set only. Each next collection comes out 12 market days (2 real hours) after the previous one, counted from the save's first day, in `collections.json` order: Jungle, Fossil, Base Set 2, Team Rocket (`RELEASE_EVERY_DAYS`).
- An unreleased collection does not appear anywhere.

**Print run**

- The Base Set has 1,000,000 boosters. Each newer collection prints 25% more than the previous one, up to 2× the Base Set.
- Distributor price = base price × (printed ÷ left)^0.25.
- Market value (second hand) = base price × (printed ÷ left)^0.5 × a daily swing (~±12%). The Market is more volatile than the distributor.
- Below 2% left, prices stop rising.

**Daily world events** (per collection, every market day, from a hash of seed, collection and days since release)

| Event | Rule |
| --- | --- |
| Rival shops buy | 20 simulated shops of different sizes, together about 5.2% of the print run on a busy day. Each buys on 60% of days; demand fades to 20% over 66 days. They always leave 10% of the print run for the player. Big buys make news. |
| Returns | 12% chance per day: a shop returns up to 0.8% of the print run. |
| Reprint | Below 35% left: 3% chance per day of printing another 40% to 80% of the original run. The price drops. Makes news. |

**What the player can do**

- Buy from the distributor while there is supply; each purchase takes 1 off the supply and raises the price a little.
- On the Market: buy sealed boosters from rivals at 110% of market value (works even when the distributor is sold out) and sell at 90%.
- Hold boosters in storage waiting for the price to rise. Nothing guarantees a profit, because returns and reprints are random.

**Determinism:** the world (rivals, returns, reprints) is the same for anyone making the same choices, but the player's buys and sells change supply, so each collection's supply is saved. This is the approved exception to "no market state in the save"; single card prices are still computed from the day.

### 8.2 News

- A News button in the header with the unread count.
- Two parts: game notices (new collection out, reprints, big rival buys) and patch notes, kept in `data/news.json`.
- A note can require a released collection (`requires`).

### 8.3 Storage tab (Nicolas, 2026-11-28; 1.7.0)

Customers also buy sealed products and accessories: sealed boosters, booster boxes, and TCG accessories (sleeves, deck boxes, playmats) themed after Pokémon types. The **Storage** tab (unlocks with the Market) lets the player set the price of every good (prefilled at market value, or at a Market percentage) and put any amount on the shelf.

- **Booster box:** 36 boosters of one collection, bought from the distributor at 36 × the booster price less 10%, taking 36 from the supply. Can be opened into 36 boosters or sold sealed; market value is 36 × the booster's market value.
- **Accessories:** `data/accessories.json`, a placeholder list with no images; each has a wholesale cost and a base value that swings ±5% per day.
- **Shelf:** 20 goods, +10 per Bigger showcase level.
- **Customers:** while the shelf has goods, 25% of visits look at the shelf instead of the cards and react to the tags with the same price bands as cards.

### 8.4 Finances tab (Nicolas, 2026-11-28; 1.7.0)

Every money change is booked by category (card sales, bulk, Storage sales, Market, distributor, boxes and accessories, upgrades, hiring, training, salaries). The **Finances** tab (unlocks with the Showcase) shows today's income, expenses and net, and the previous 72 market days (12 hours) with a net bar.

### 8.5 Achievements (Nicolas, 2026-11-28; 1.7.0)

Awards for milestones (first sale, 100/1,000/10,000 cards sold, boosters opened, money earned, first hire, full team, a level 10 skill, maxed upgrades, Fame 20, first sealed sale, first box opened), one per completed collection and one for completing every collection. No reward: the list is the record. The header **Awards** button shows earned / total and opens the list. Older saves get what they already qualify for on load.

## 9. Offline progress and save

On load, the game simulates 100% of the time since the last save, with no cap and no penalty, behind a progress bar; the save lives in localStorage and can be exported and imported as versioned JSON.

**Offline simulation**

- Uses exactly the same rules as live play (the same tick function), in 1 s steps (2 s after more than a day).
- The simulated clock moves along, so market days and releases change mid-simulation as they would live.
- Runs in chunks so the page never freezes; a week away takes some tens of seconds.
- At the end, a summary: time away, money earned, boosters bought and opened, cards sold, levels gained.
- With the tab open in the background the game keeps running; if the browser pauses the tab, the same catch-up covers the gap on return.

**Save**

- Autosave every 10 s, when the tab is hidden and on close.
- System menu: Save now, Export (.json download), Import, Reset.
- File format: `{ game, saveVersion, gameVersion, exportedAt, state }`.
- `saveVersion` is an integer. Each schema change adds a migration `vN → vN+1`, applied in order on load or import.
- After migrations, the state is merged with defaults: a missing field gets the default, an unknown field is ignored. An old save never breaks the game.
- Card or collection ids that no longer exist are skipped without touching the rest.
- **Project rule:** every change to the save schema goes to Nicolas first, with the question "what happens to this field in old saves?".

**Device preferences** (theme, volumes, reduce motion, debug unlock and debug clock) live outside the save, in a separate localStorage key.

## 10. Interface, audio and settings

The interface is menus and panels, in English, with a pastel palette leaning to brown and dark yellow, light and dark modes, generated calm music, and a small pixel-art shop scene.

**Mobile:** the game runs on phones. On narrow screens the tabs become a fixed bottom bar, panels go to one column and buttons are touch-sized. It is also a PWA: installable and playable offline after the first visit.

**Tabs**

| Tab | Content |
| --- | --- |
| Shop | Shop floor scene; the 3 loop steps side by side (Distributor, Open, Price); staff summary; recent events |
| Binder | Binder per collection, discovery progress, List screen per card |
| Showcase | Cards for sale with number, collection, tag, market and customer feeling; Customers panel; Recall all |
| Market | Search, prices, trends, sealed boosters, news |
| Storage | Sealed boosters, booster boxes and accessories: stock, price, shelf |
| Staff | Employees, skills, salaries, training, shop rules |
| Upgrades | Shop upgrades |
| Finances | Today's income and expenses by category, past days |
| Settings | Theme (10 themes plus System), motion, volumes, tutorial, save (System), Code (debug menu) |

The header always shows money, the market day and the time to the next day, and the Awards and News buttons.

**Themes (1.7.0):** System, Light, Dark, Forest, Ocean, Lavender, Rose, Sepia, Midnight, Mint, Ember. A device preference, not saved in the game.

**Shop floor** (details in `docs/sdd/shop-floor.md`)

- A pixel-art view of the shop at the top of the Shop tab: customers (16×32 sprites, 4 directions) walk in, browse the showcase together at their own pace, say what they think of the prices in speech bubbles, show a happy or sad emote, and buyers show what they paid.
- The showcase case fills as cards are listed and grows with the showcase upgrade; decor grows with Fame.
- The floor keeps running on other tabs and with the browser hidden or minimized.
- 12 customer looks (1.6.2), plus two looks for sealed-goods customers; decor grows up to Fame 20.

**Visual**

- Neutral pastel palette: cream/sand backgrounds in light mode, coffee brown in dark; mustard/amber accent; soft rarity colors.
- Light, dark or follow the system.
- Cards with a rarity-colored border; foil with a subtle animated shine.

**Audio (Web Audio API, no sound files)**

- Music: calm generative ambient, long soft chords with loose pentatonic notes, no beat.
- Effects: click, purchase (coin), pack tear, card slide, rare reveal (shine), sale (soft coin, at most one every few seconds).
- Volumes: Master, Music and Effects, each with a 0–100 slider and mute. Master scales the other two.
- Audio starts only after the player's first click (browser rule).

**Copy**

- Short and direct: "Buy booster", "Open 10", "Price 3". Never explain the obvious.
- Mechanic explanations live in the tutorial and tooltips, not on buttons.
- Status in a few words: "no packs", "showcase full", "training".

**Feedback and accessibility**

- Every action gets an immediate, soft response: money ticking up, a small "+$" on sales, animated counters, a toast when the showcase is full.
- Rarity never depends on color alone: the border has a color and the rarity's short code from the collection JSON (C, U, R, H...).
- "Reduce motion" in Settings: no card sway, no animated shine, a shorter opening, no walking on the shop floor.
- Readable minimum text size and good contrast in both themes.

**Debug menu** (Nicolas, 2026-11-27; `docs/sdd/debug-menu.md`): a code in Settings unlocks tools to skip time, set money, add boosters, set upgrade levels and boost staff, for testing.

## 11. Tutorial

The tutorial teaches the loop in the first game, step by step, and is updated with every mechanic change, in any version.

**Format**

- Short steps that highlight the right button and wait for the player to act (e.g. "Buy a booster" only moves on after the purchase).
- Can be skipped and restarted in Settings.
- The content is one data file (`data/tutorial.json`), separate from the UI code, with a revision number. Players on an older revision see only the new or changed steps.
- Each new mechanic gets a step or tip the first time it unlocks.

**Progressive reveal** (as in Cookie Clicker, the screen grows with the player)

| Appears when | What |
| --- | --- |
| Start | Shop (Buy and Open only), Settings |
| First card opened | Price step, Binder tab |
| First sale | Showcase tab, Finances tab |
| Cash reaches $40 | Upgrades tab |
| Cash reaches $50 | Staff tab ("hire" tutorial step) |
| First new market day, or first card above $5 | Market tab ("market" step) |
| First Market visit | "supply" step: boosters have limited supply, buy and sell here |
| Market tab | Storage tab ("storage" and "shelf" steps) |
| First employee | "news" step: News button; "salary" step: Finances |
| 12 market days after the previous collection | The next collection, everywhere ("nextset" step) |

A tab that has appeared never disappears.

**Rule:** no delivery is done until the tutorial reflects it.

## 12. Next steps and open items

**Decided by Nicolas on 2026-11-28** (he approved every recommended option)

- **Salaries:** done (1.7.0, section 6). Charged offline too; unpaid staff wait, no debt.
- **Seed per save:** done (1.7.0, section 8). Older saves keep the old global seed.
- **Customers buy sealed goods and accessories; Storage tab:** done (1.7.0, section 8.3). Accessories are placeholders (no images needed, Nicolas) until he supplies a list.
- **Finances tab:** done (1.7.0, section 8.4).
- **Collection milestones:** approved as in section 7. Done.
- **Prestige:** not now; revisit later.
- **Language:** the whole project in English, this GDD included. Done.
- **More customer sprites and more decor at high Fame.** Done (1.6.2).
- **Achievements:** done (1.7.0, section 8.5). No reward; older saves get what they qualify for.
- **Themes:** about 10, chosen in Settings. Done (1.7.0, section 10).

**Balancing left as is (Nicolas, 2026-11-27)**

- Full automation takes about 2 hours against the 45–90 minute target.

## Sources

- [The Math of Idle Games, Part I](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i), Anthony Pecorella, 2016
- [The Math of Idle Games, Part III](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii), Anthony Pecorella, 2017
- [Idle Game Design Principles](https://ericguan.substack.com/p/idle-game-design-principles), Eric Guan, 2025
- [Designing for Coziness](https://medium.com/kitfox-games/designing-for-coziness-d33d2519a59e), Kitfox Games
- [Choreographed Emotion: 6 Steps to a Great Card Reveal UX](https://medium.com/n3twork/choreographed-emotion-6-steps-to-a-great-card-reveal-ux-a6e6bb8487dd), N3TWORK
- [What Is The Compulsion Loop?](https://www.gameanalytics.com/blog/the-compulsion-loop-explained), Joseph Kim, GameAnalytics
- [Core loops](https://create.roblox.com/docs/production/game-design/core-loops), Roblox Creator Hub
