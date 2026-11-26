# IdleCardShop — agent guide

A calm, menu-based (Cookie Clicker style) idle browser game about running a trading card shop. Static site for GitHub Pages. The design source of truth is [docs/GDD.md](docs/GDD.md) (written in Portuguese).

## Current phase

**Pre-production. The GDD is a draft awaiting the owner's approval. Do not write game code until the GDD is approved** and the relevant SDD exists in `docs/sdd/`. If asked to code before that, point this out and ask.

## Owner

Nicolas owns the design and all card content. He writes in Portuguese; reply to him in Portuguese. Everything that ships in the game, and all code, is in English.

## Directives (always apply)

Read these before any change. Each one is short.

- @.claude/rules/language.md — the game is fully in English
- @.claude/rules/ui-copy.md — short, direct UI copy, no self-explaining text
- @.claude/rules/tutorial.md — every mechanic change updates the tutorial
- @.claude/rules/save-schema.md — versioned save JSON; ask Nicolas before any schema change
- @.claude/rules/card-content.md — one JSON per collection at the repo root; data and images come from Nicolas only
- @.claude/rules/design-pillars.md — calm, no punishment, deterministic market

## Skills (reusable processes)

- `.claude/skills/add-card-collection/` — add a new card set from data Nicolas supplies
- `.claude/skills/develop-feature/` — take a feature from GDD/SDD to a finished, tested change
- `.claude/skills/change-save-schema/` — change the save format safely, with a migration

## Open GDD questions

These are unanswered (GDD section 12). v1 uses the GDD's proposed answer for each (see the SDD). Anything that depends on them is marked **[PENDING GDD Q#]** in rules and skills and `ASSUMPTION [GDD Q#]` in code. Do not settle them yourself; when Nicolas answers one, update the GDD, the SDD, the code and remove the marks.

1. Base Set booster layout (commons/uncommons/rares, holo chance)
2. Staff salaries (proposal: none)
3. Market seed global or per save (proposal: global)
4. Customers buy sealed boosters too (proposal: not in v1)
5. Collection milestones and their bonuses
6. Prestige on the roadmap
7. Document language (proposal: GDD in Portuguese; SDDs, directives and skills in English — this scaffolding follows the proposal)

## Tech stack

- Static site: vanilla JavaScript ES modules, no build step, no dependencies, no backend. Deploys to GitHub Pages from `main` root.
- Run: `python -m http.server 8000` in the repo root, open `http://localhost:8000/`. (Node is not installed on Nicolas's machine.)
- Tests: open `http://localhost:8000/tests/`; all checks must pass. Balancing targets are reported separately and do not fail the suite.
- Rules live in `js/game.js` (no DOM; the same `tick` runs live and offline). Market in `js/market.js`, saves in `js/save.js`, UI in `js/ui.js`, player-facing copy in `js/strings.js` and `data/tutorial.json`.
- Console handle for debugging: `window.idleCardShop.state`.
