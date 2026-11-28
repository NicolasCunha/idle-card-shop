# IdleCardShop desktop (Godot)

The desktop build of IdleCardShop, in Godot 4.7 with GDScript. Work in progress on the `desktop-port` branch; the browser game in the repo root is still the live version. Plan and status: [../docs/desktop/STATUS.md](../docs/desktop/STATUS.md).

## Open and run

1. Install Godot 4.7 (standard, not .NET): `winget install --id GodotEngine.GodotEngine -e`.
2. Open Godot, choose **Import**, and pick `desktop/project.godot`.
3. Press **F5** (Run project). The loading screen lists its steps, then the game starts: the same rules, tabs, tutorial and save as the browser game.

The game is laid out on a 640×360 canvas with a hand-drawn pixel font and scales by whole numbers only (2× in a 1280×720 window, 3× full screen on 1080p), so pixels stay sharp. Settings > Display has the window size and full screen; F11 toggles full screen.

Saves live in the Godot user folder (Settings > System > Open save folder): `save.json` plus three backups, and `prefs.json` for this device. Export and Import read and write the same JSON as the browser game, both ways.

## Screenshots for review

`godot --path desktop -- --shots` plays through every screen with a throwaway save and writes PNGs to `user://shots` (or `$SHOTS_DIR`). Point `XDG_DATA_HOME` (Linux) at a temp folder so your own save is not touched.

## Tests

Headless, from the repo root:

```
godot --headless --path desktop --import
godot --headless --path desktop --script res://tests/run_tests.gd
```

The first line builds the editor cache once. The second prints `N passed, 0 failed` and exits with code 0 when all checks pass. In the Godot editor you can also open `tests/run_tests.gd` and use **File > Run** (Ctrl+Shift+X).

The market checks compare against `tests/ref/market_ref.json`, made by the web build. After a change to `js/market.js`, `js/data.js` or a collection JSON, regenerate it from the repo root with Node 22+ (the cloud container has it): `node desktop/tests/ref/dump_market.mjs`.

## Folders

| Folder | Contents |
| --- | --- |
| `scenes/` | Godot scenes (`main.tscn` is the entry point) |
| `scripts/core/` | Game rules ported from `js/` (no nodes, no drawing) |
| `scripts/ui/` | Panels, tabs and the shop floor |
| `art/src/` | Hand-drawn palette-indexed text grids: `font.txt` (pixel font), `shop.txt` (shop floor), `ui.txt` (icons) |
| `art/sheets/` | PNG sheets built from `art/src` by `python tools/build_art.py` (the game only loads these), plus the customer sheets |
| `tests/` | Headless test runner and checks |

Collection JSONs, `data/` and card images stay at the repo root and are shared with the browser game.

## Builds

`.github/workflows/desktop.yml` builds Windows and Linux on every push to `desktop-port` (download them from the run's artifacts) and publishes a GitHub release for a `desktop-v*` tag. Each zip holds the game and a `packs/` folder with one card pack per collection (`cards-<id>.pck`, made by `tools/pack_cards.gd`). The game mounts every pack it finds there at start; a missing pack only means that collection's cards are drawn as generic cards.

Local export: run `tools/sync_content.gd` first (copies collections and `data/` into `content/`), then `godot --headless --path desktop --export-release Linux build/linux/IdleCardShop.x86_64`.
