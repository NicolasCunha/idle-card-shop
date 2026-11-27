# Design pillars (guardrails for every feature)

From GDD sections 1 and 2. A feature that breaks one of these needs Nicolas's explicit approval.

- **Calm.** No timers that pressure, no queues, no impatient customers, no shop hours, no loss while away. Exception (Nicolas, 2026-11-27): right after a release some customers want the new collection and leave without buying if the showcase has none of it; only that sale is lost (docs/sdd/fast-days-fame.md). **[PENDING GDD Q2]** no staff salaries (provisional).
- **Manual to automatic.** Every loop step can be done by hand first and by staff later.
- **True idle.** Offline time is simulated 100%, with the same tick function as live play. No cap, no penalty.
- **Deterministic market.** Daily prices come from a hash of (seed, card, day). Same day, same price. Card prices are never stored in the save. Exception (Nicolas, 2026-11-27): booster supply per collection is saved, because the player's trades change it; its daily world events still come from the same seeded hash (docs/sdd/booster-supply.md). **[PENDING GDD Q3]** global seed (provisional) vs per save.
- **In-game rewards only.** No real money, ads, nagging notifications, or punishment for leaving.
- **Accessible.** Rarity never by color alone; "Reduce motion" honored everywhere; readable contrast in both themes.

Out of v1 scope unless Nicolas says otherwise: scenery graphics, multiplayer, online accounts, monetization, Magic and Pokémon collections Nicolas has not asked for (shipped: Base Set, Jungle, Fossil, Base Set 2, Team Rocket), prestige (**[PENDING GDD Q6]**), customers buying sealed boosters (**[PENDING GDD Q4]**). Collection milestones are proposed but not approved (**[PENDING GDD Q5]**).
