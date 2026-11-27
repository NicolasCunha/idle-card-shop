# SDD — v1 implementation

Status: implemented 2026-11-26. Covers every system in the GDD at v1 scope; per-system SDDs can split out of this one as systems grow.

## Tech stack

- Static site, vanilla JavaScript ES modules, no build step, no dependencies. Works on GitHub Pages as is.
- Run locally with any static server from the repo root, e.g. `python -m http.server 8000`, then open `http://localhost:8000/`. Opening `index.html` from disk does not work (modules and `fetch` need http).
- Tests: open `http://localhost:8000/tests/` in a browser. The page runs the suite and a pacing simulation and shows pass/fail.

## Files

| Path | Role |
| --- | --- |
| `index.html`, `css/style.css` | Page shell and all styling (light/dark themes, cards, opening scene) |
| `js/main.js` | Boot, main loop (250 ms), autosave (10 s, hide, close), actions, overlays |
| `js/game.js` | All rules: state, economy, staff, customers, tick, offline catch-up. No DOM |
| `js/market.js` | Deterministic daily market, time zones, news |
| `js/data.js` | Loads `collections.json` and each collection JSON; validation; celebration tiers |
| `js/save.js` | Versioned save, migrations, defaults merge, sanitize, export/import, device prefs |
| `js/ui.js` | Tabs and panels (sig/html/vals pattern), tutorial highlight, card detail |
| `js/opening.js` | Open 1 animation, summary, grouped results for Open 10/100/all |
| `js/cards.js` | Card and booster markup (one image, any size; generic card when image missing) |
| `js/audio.js` | Web Audio music and effects; no audio files |
| `js/strings.js` | Player-facing copy |
| `data/tutorial.json` | Tutorial steps and revision |
| `collections.json`, `base.json` | Collection list and the Base Set template |
| `tests/` | Browser test suite and pacing bot |

## Key decisions

- **One tick function** (`G.tick(state, sets, dt, nowMs)`) runs live and offline. Live ticks use real elapsed time; gaps over 2 s (paused tab, reload) go through `G.catchUp`, which steps 1 s (2 s past one day) in chunks and yields to the page. Gaps over 60 s show the progress overlay and the "While you were away" summary. A week simulates in about 1 s.
- **Market day** is cached until the next midnight of the chosen time zone, so catch-up stays fast and days still change mid-simulation.
- **Card market value** is memoized per card per day.
- **Prices are tags**: a card keeps the price it was tagged at; customers skip tags above 115% of today's market.
- **Opening** applies the result to the state before the animation plays, so closing the scene never loses cards.
- **Device preferences** (theme, volumes, mutes, reduce motion) live in `idlecardshop.prefs`, never in the save.
- **Debug handle**: `window.idleCardShop` exposes the live state in the console.

## Save schema v1

`{ game: "idlecardshop", saveVersion: 1, gameVersion, exportedAt, state }`. `state` fields are defined by `G.newState()`; keys starting with `_` are caches and are never saved. No migrations yet (v1 is the first schema). Any change goes through the `change-save-schema` skill.

## Assumptions taken from GDD proposals (open questions)

| GDD question | Used in v1 |
| --- | --- |
| Q1 Base Set booster | **Answered 2026-11-27:** 7 common, 3 uncommon, 1 rare slot (67% rare, 33% holo). Rarities follow Nicolas's crawler data: 38 common (6 basic energies count as common), 32 uncommon, 16 rare, 16 holo |
| Q2 Staff salaries | None |
| Q3 Market seed | One global seed for everyone |
| Q4 Customers buy sealed | No |
| Q5 Collection milestones | 25/50/75/100% give +2/+4/+6/+10% sale price for that collection |
| Q6 Prestige | Not implemented |
| Q7 Document language | GDD in Portuguese; code, SDDs, rules and skills in English |

## Additions and deviations to confirm with Nicolas

- **Stuck-shop rescue (new)**: if the shop has no cash for a booster and nothing left to sell (no sealed boosters, no cards anywhere, empty binder), the distributor fronts one free booster. Without it a player who spends everything on staff can get permanently stuck, which breaks the calm pillar.
- **XP curve**: the GDD formula `25 x level^2.3` gives about 3,900 XP for level 9 to 10; the GDD text says about 4,400. The code follows the formula.
- **Pacing**: first sale about 15 s and first employee about 3.5 min hit the targets. Full automation (4 staff) takes about 2 h for the test bot, against the 45 to 90 min target. Demand (one customer every 6 s) caps income near $20/min early on, and 4 staff plus 3 Staff room levels cost about $2,140. Fixing it is a balancing choice (cheaper Staff room, more customers early, or a longer target).
