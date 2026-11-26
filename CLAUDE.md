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

These are unanswered (GDD section 12). Anything that depends on them is marked **[PENDING GDD Q#]** in the rules and skills. Do not settle them yourself; use the GDD's proposed default only where a rule says so, and flag it.

1. Base Set booster layout (commons/uncommons/rares, holo chance)
2. Staff salaries (proposal: none)
3. Market seed global or per save (proposal: global)
4. Customers buy sealed boosters too (proposal: not in v1)
5. Collection milestones and their bonuses
6. Prestige on the roadmap
7. Document language (proposal: GDD in Portuguese; SDDs, directives and skills in English — this scaffolding follows the proposal)

## Tech stack

**[PENDING]** Not chosen yet. Constraints from the GDD: static files only (GitHub Pages), localStorage saves, Web Audio API for all sound (no audio files), no backend, no accounts.
