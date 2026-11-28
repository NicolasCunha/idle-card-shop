# Desktop port: status and resume point

Read this first when resuming the desktop port. Plan: [IdleCardShop: desktop app migration plan](https://claude.ai/artifact/39pCEHvmpoRng9FFrnnQFz) (section "Work stages").

## Rules for this work

- All work on branch `desktop-port`. Never push to `main`. Do not edit web files (`js/`, `css/`, `index.html`, `data/`, collection JSONs); rebase on `main` when the web game changes.
- One stage per go-ahead from Nicolas. Each stage: build it, copy `desktop/` to Nicolas's PC (`C:\DEV\idle-card-shop\desktop`, untracked in his main checkout), he tests in Godot, then commit, update this file, report and wait.
- Every fix to the web game is listed in `docs/desktop/PORT-FIXES.md` on `main` (kept by the web threads). Check it at the start of each stage and port what applies to the stages already done.
- Godot 4.7.2 stable, GDScript only. Project in `desktop/`.
- Game text in English; calm pastel brown and dark-yellow palette, light and dark modes; GBA-style 2D; hand-drawn PNG spritesheets (never generated at runtime); tutorial always updated.

## Stages

| Stage | Delivers | State |
| --- | --- | --- |
| S1 | Plan updated with the final web game state; this file | done (2026-11-28) |
| S2 | Godot project skeleton in `desktop/`, 240×160 integer scaling, README | done (2026-11-28, Nicolas opened it in Godot) |
| S3 | Collection loader, loading screen with steps (PORT-FIXES 1.9.7), market price hash in GDScript; JS reference price dump | next |
| S4 | Size test: export build and one card pack, JPG against WebP | |
| S5 | Boosters, opening, binder, showcase, sales | |
| S6 | Staff (30, main and backup jobs, firing), salaries, customers, supply, release calendar | |
| S7 | Storage, properties (warehouses, shipments), campaigns, Fame, achievements | |
| S8 | Save port and v6 import (needs Nicolas's save answers) | |
| S9 | Simulation thread, commands, snapshots, offline catch-up | |
| S10 | Palette and UI sheets (light and dark), bitmap font | |
| S11 | Shop tiles, Fame decor, shop floor scene | |
| S12 | Customer and staff sheets and animations | |
| S13-S17 | Tabs by group: Shop and Binder; Market and News; Staff; Storage, Properties, Marketing, Finances; Settings, tutorial, debug | |
| S18 | GitHub Actions export, card packs, release 2.0.0 | |

## Web baseline to match (main at 0a75710, 2026-11-28)

- Game 1.9.6, save v6, tutorial revision 12 (18 steps). Port target: this exact rule set, plus later PORT-FIXES entries.
- Rules: `js/game.js` (1,402 lines), `market.js`, `supply.js`, `save.js`, `achievements.js`, `data.js`, `cards.js`, `clock.js`, `format.js`. UI and scene: `ui.js`, `main.js`, `scene.js`, `opening.js`, `audio.js`, `tutorial.js`, `debug.js`, `strings.js`.
- Content: 30 collections in `collections.json` (Base Set to Power Keepers), released one every 12 market days; 3,333 files in `images/` (about 404 MB); `data/accessories.json`, `data/news.json`, `data/tutorial.json`.
- Tabs: Shop, Binder, Showcase, Market, Storage, Properties, Staff, Marketing, Upgrades, Finances, Settings. News has two tabs (Game news, Updates) with the next release.
- Systems: 10-minute market days; per-save seed; booster supply with rival shops and reprints; Fame; new-set customers; customers buying singles, sealed goods and accessories; up to 30 staff with main and backup jobs (Buy, Open, Price, per collection), training, salaries, firing with severance by tenure; shop storage space; warehouses (levels 1-10, daily fees, shipments, Keep in shop targets, overflow from purchases and staff buyers); campaigns (Flyers, Radio, TV); Finances ledger; 19 achievements; collection milestones; 11 themes (4 dark); code-locked debug menu.
- Tests: `tests/tests.js` (about 180 checks plus balancing targets).

## Tooling

- Cloud container: Godot is built from source (tag `4.7.2-stable`, headless-capable editor, `/home/user/godot-src`), because release downloads are blocked by the network policy. A new container must rebuild it (about 1 hour on 4 cores) or reuse a cached binary.
- Nicolas's PC: not installed yet (2026-11-28: auto mode blocked `winget install`). Nicolas runs `winget install --id GodotEngine.GodotEngine -e` in PowerShell himself.

## Next step

S3: GDScript loader for `collections.json` and the collection JSONs (read from the repo root in development), a loading screen listing each step (Game code, Card collections N / total, Tutorial, News, Accessories, Save) like web 1.9.7, and the market price hash ported from `js/market.js`. A reference dump of JS prices; done when every card matches over 30 days.
