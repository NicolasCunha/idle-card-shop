# IdleCardShop — agent guide

A calm, menu-based (Cookie Clicker style) idle browser game about running a trading card shop. Static site for GitHub Pages. The design source of truth is [docs/GDD.md](docs/GDD.md).

## Current phase

**v1 built (2026-11-26) and live on GitHub Pages.** Nicolas told us to build the game with the GDD as written, using the GDD's proposed answers to the open questions as assumptions. Implementation notes, assumptions and open balancing items: [docs/sdd/v1-implementation.md](docs/sdd/v1-implementation.md). For new features, use the `develop-feature` skill. Booster supply, the release calendar and News: [docs/sdd/booster-supply.md](docs/sdd/booster-supply.md). 10-minute market days, Fame and new-set customers: [docs/sdd/fast-days-fame.md](docs/sdd/fast-days-fame.md). Shop floor scene and sprite format: [docs/sdd/shop-floor.md](docs/sdd/shop-floor.md). Debug menu (code-locked, Settings): [docs/sdd/debug-menu.md](docs/sdd/debug-menu.md). Salaries, seed per save, Storage, Finances, achievements and themes (save v5, game 1.7.0): [docs/sdd/economy-v5.md](docs/sdd/economy-v5.md). Staff jobs, storage space, warehouses and marketing (save v6, game 1.9.0): [docs/sdd/properties-v6.md](docs/sdd/properties-v6.md).

## Owner

Nicolas owns the design and all card content. He writes in Portuguese; reply to him in Portuguese. Everything in the project is in English: the game, the code and every document, the GDD included (Nicolas, 2026-11-28).

## Directives (always apply)

- Every fix or change to the web game gets an entry in [docs/desktop/PORT-FIXES.md](docs/desktop/PORT-FIXES.md), so it is also applied to the Godot desktop port (Nicolas, 2026-11-28).

Read these before any change. Each one is short.

- @.claude/rules/language.md — the game is fully in English
- @.claude/rules/ui-copy.md — short, direct UI copy, no self-explaining text
- @.claude/rules/tutorial.md — every mechanic change updates the tutorial
- @.claude/rules/save-schema.md — versioned save JSON; ask Nicolas before any schema change
- @.claude/rules/card-content.md — one JSON per collection at the repo root; data and images come from Nicolas only
- @.claude/rules/design-pillars.md — calm, no punishment, deterministic market

## Skills (reusable processes)

- `.claude/skills/add-card-collection/` — add a new card set from data Nicolas supplies
- `.claude/skills/pkmn-crawler/` — crawl a pkmncards.com set with Nicolas's crawler (`tools/pkmn-crawler/`), only when he asks for those sets
- `.claude/skills/develop-feature/` — take a feature from GDD/SDD to a finished, tested change
- `.claude/skills/change-save-schema/` — change the save format safely, with a migration

## GDD questions

Nicolas answered all of them on 2026-11-27/28 (GDD section 12). Code still built on the old provisional answer is marked `ASSUMPTION [GDD Q#]` until the decided version ships; details still being settled are listed in GDD section 12. Do not settle those yourself.

1. Base Set booster layout: 7 common, 3 uncommon, 1 rare slot (33% holo). Done.
2. Staff salaries: **yes**, growing with skill levels and tenure. Done (1.7.0).
3. Market seed: **per save** (UUID at save start; old saves keep the global seed). Done (1.7.0).
4. Customers buy sealed boosters, boxes and accessories, with a Storage tab. Done (1.7.0).
5. Collection milestones: approved as proposed. Done.
6. Prestige: not now.
7. Document language: everything in English. Done.

## Tech stack

- Static site: vanilla JavaScript ES modules, no build step, no dependencies, no backend. Deploys to GitHub Pages from `main` root.
- Run: `python -m http.server 8000` in the repo root, open `http://localhost:8000/`. (Node is not installed on Nicolas's machine.)
- Tests: open `http://localhost:8000/tests/`; all checks must pass. Balancing targets are reported separately and do not fail the suite.
- Rules live in `js/game.js` (no DOM; the same `tick` runs live and offline). Market in `js/market.js`, saves in `js/save.js`, UI in `js/ui.js`, player-facing copy in `js/strings.js` and `data/tutorial.json`.
- Console handle for debugging: `window.idleCardShop.state`.
