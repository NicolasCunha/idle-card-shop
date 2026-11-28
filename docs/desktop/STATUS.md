# Desktop port: status and resume point

Read this first when resuming the desktop port. Plan: [IdleCardShop: desktop app migration plan](https://claude.ai/artifact/39pCEHvmpoRng9FFrnnQFz) (section "Work stages").

## Rules for this work

- All work on branch `desktop-port`. Never push to `main`. Do not edit web files (`js/`, `css/`, `index.html`, `data/`, collection JSONs); rebase on `main` when the web game changes.
- Nicolas, 2026-11-28 14:19: migrate the whole game without waiting between stages. Commit each stage after the headless tests pass; copy `desktop/` to Nicolas's PC (`C:\DEV\idle-card-shop\desktop`, untracked in his main checkout) at milestones for him to test in Godot.
- Every fix to the web game is listed in `docs/desktop/PORT-FIXES.md` on `main` (kept by the web threads; do not edit it on this branch). Check it at the start of each stage and port what applies to the stages already done. Port progress is tracked in the table below.
- Godot 4.7.2 stable, GDScript only. Project in `desktop/`.
- Game text in English; calm pastel brown and dark-yellow palette, light and dark modes; GBA-style 2D; hand-drawn PNG spritesheets (never generated at runtime); tutorial always updated.

## Stages

| Stage | Delivers | State |
| --- | --- | --- |
| S1 | Plan updated with the final web game state; this file | done (2026-11-28) |
| S2 | Godot project skeleton in `desktop/`, 240×160 integer scaling, README | done (2026-11-28, Nicolas opened it in Godot) |
| S3 | Collection loader, loading screen with steps (PORT-FIXES 1.9.7), market price hash in GDScript; JS reference price dump | done (2026-11-28; 20/20 checks, 114K prices match JS; Nicolas tested) |
| S4 | Size test: export build and one card pack, JPG against WebP | done (Linux export: 67.6 MB binary + 1 MB pck, loads 30 collections in 65 ms; JPG kept, Nicolas 2026-11-28) |
| S5-S7 | All rules of `js/game.js`, `supply.js`, `achievements.js` in GDScript | done (golden simulation matches JS over 9,000 s) |
| S8 | Save port and v6 import/export (both ways), autosave every 10 s and on close, 3 backups | done |
| S9 | Offline catch-up on a worker thread with progress, then "While you were away" | done |
| S10 | 11 themes (4 dark) as a Godot Theme; hand-drawn pixel font (`art/src/font.txt`) and UI icons (`ui.txt`) | done |
| S11 | Shop floor from the hand-drawn sheet (`shop.txt`), Fame decor, showcase case | done |
| S12 | Customers walking, browsing, speech bubbles, emotes, sale pop-ups (web sheets) | done |
| S13-S17 | Every tab, News (two tabs), Awards, card detail and list form, opening scene, bulk results, tutorial (shared `data/tutorial.json`), debug menu, synthesised music and sounds | done (needs Nicolas's test) |
| S18 | GitHub Actions export (Windows, Linux), card packs, release 2.0.0 | done (release desktop-v2.0.0) |

## Web baseline to match (main at 0a75710, 2026-11-28)

- Game 1.9.6, save v6, tutorial revision 12 (18 steps). Port target: this exact rule set, plus later PORT-FIXES entries.
- Rules: `js/game.js` (1,402 lines), `market.js`, `supply.js`, `save.js`, `achievements.js`, `data.js`, `cards.js`, `clock.js`, `format.js`. UI and scene: `ui.js`, `main.js`, `scene.js`, `opening.js`, `audio.js`, `tutorial.js`, `debug.js`, `strings.js`.
- Content: 30 collections in `collections.json` (Base Set to Power Keepers), released one every 12 market days; 3,333 files in `images/` (about 404 MB); `data/accessories.json`, `data/news.json`, `data/tutorial.json`.
- Tabs: Shop, Binder, Showcase, Market, Storage, Properties, Staff, Marketing, Upgrades, Finances, Settings. News has two tabs (Game news, Updates) with the next release.
- Systems: 10-minute market days; per-save seed; booster supply with rival shops and reprints; Fame; new-set customers; customers buying singles, sealed goods and accessories; up to 30 staff with main and backup jobs (Buy, Open, Price, per collection), training, salaries, firing with severance by tenure; shop storage space; warehouses (levels 1-10, daily fees, shipments, Keep in shop targets, overflow from purchases and staff buyers); campaigns (Flyers, Radio, TV); Finances ledger; 19 achievements; collection milestones; 11 themes (4 dark); code-locked debug menu.
- Tests: `tests/tests.js` (about 180 checks plus balancing targets).

## PORT-FIXES progress

| Web version | Change | Port |
| --- | --- | --- |
| 1.9.7 | Loading screen with steps, parallel loading | ported (S3, `Loader`, `main.gd`) |
| 1.9.6 | Staff buyer fills warehouses past the stock target | ported (`Game._do_task`, golden sim) |
| 1.9.5 | Fire staff with severance | ported (`Game.fire`, Staff tab with confirm box) |
| 1.9.4 | Purchases overflow to warehouses | ported (`Game.room_for`, Shop shows `to warehouse`) |
| 1.9.3 | Per-card price cache and event cache | ported (S3, `Market`) |
| 1.9.1 | News in two tabs, debug Release all sets | ported (`main.gd` News, Settings debug) |
| 1.9.0 | Card values from balance.py (data only) | nothing to do |

## Tooling

- Cloud container: Godot is built from source (tag `4.7.2-stable`, headless-capable editor, `/home/user/godot-src`), because release downloads are blocked by the network policy. A new container rebuilds it in about 20 minutes on 4 cores:
  `git clone --depth 1 --branch 4.7.2-stable https://github.com/godotengine/godot src && pip install scons && cd src && scons platform=linuxbsd target=editor production=yes debug_symbols=no -j4 vulkan=no opengl3=yes x11=no wayland=no speechd=no fontconfig=no pulseaudio=no alsa=no dbus=no udev=no`
  Then `godot --headless --path desktop --import` and `godot --headless --path desktop --script res://tests/run_tests.gd`.
- Nicolas's PC: not installed yet (2026-11-28: auto mode blocked `winget install`). Nicolas runs `winget install --id GodotEngine.GodotEngine -e` in PowerShell himself.

## Desktop layout (differs from the plan)

- Canvas 640×360 instead of 240×160: the web game's tables (Market has 9 columns, Staff has skills and two jobs per employee) do not fit a GBA screen. Pixel art and the pixel font stay at 1:1 and the window scales by whole numbers (2× at 1280×720, 3× full screen on 1080p). Stretch mode `canvas_items`, so card scans keep their detail.
- Card scans load on worker threads (`CardImages`), thumbnails 100×140 cached (900), full scans for the big views (24).
- Music and sounds are synthesised once at start on a worker thread (port of `js/audio.js`), played on Music (low-pass, echo) and Effects buses.
- `godot --path desktop -- --shots` writes a screenshot of every screen (see README).

## S18 (build and release)

- `.github/workflows/desktop.yml`: official Godot 4.7.2 and export templates, tests, Windows and Linux export, one card pack per collection, zips as run artifacts; a `desktop-v*` tag, or a manual run (Run workflow) with a version, publishes the release with `desktop/RELEASE_NOTES.md`.
- The exported game mounts `packs/cards-*.pck` next to the executable (`GameData.mount_card_packs`). Checked in the container with a Linux export and the Base Set pack: 30 collections load and the scans decode.
- Content root and pack mounting use the `template` feature (exported builds only).

## 2.1.0 (Nicolas's feedback on 2.0.0, 2026-11-28)

- Staff: SmoothBar (bars move every frame); level, time and training cost update in place; only reaching max level rebuilds.
- Market: rows, sort, page history and card news on a WorkerThreadPool task; Market caches locked by a mutex; card price caches made at load.
- Card detail tilt (CardTilt + shaders/card_tilt.gdshader). Rarity foil comes from the foil thread on top of it.
- Binder cards 50x70, thumbnails 150x210 (600 kept).
- Settings: window mode and size (prefs windowMode, resolution; device prefs, not the save). Stretch aspect expand.
- Shop: staff chips centered.
- Launcher with delta updates from GitHub releases (README, "Launcher and updates"). Tested in the container with a local server and a fake 2.1.1: downloads the game pack and a changed card pack, skips the bundled one with the same checksum, restarts into the new game.

## Next step

Released 2026-11-28: https://github.com/NicolasCunha/idle-card-shop/releases/tag/desktop-v2.0.0 (made by a manual run of the Desktop build workflow with version 2.0.0; tag pushes from the cloud container are refused). Next: fixes from Nicolas's tests, and new web fixes from PORT-FIXES.md.
