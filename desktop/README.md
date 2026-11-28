# IdleCardShop desktop (Godot)

The desktop build of IdleCardShop, in Godot 4.7 with GDScript. Work in progress on the `desktop-port` branch; the browser game in the repo root is still the live version. Plan and status: [../docs/desktop/STATUS.md](../docs/desktop/STATUS.md).

## Open and run

1. Install Godot 4.7 (standard, not .NET): `winget install --id GodotEngine.GodotEngine -e`.
2. Open Godot, choose **Import**, and pick `desktop/project.godot`.
3. Press **F5** (Run project). A 960×640 window opens, lists the loading steps (Game code, Card collections N / 30, Tutorial, News, Accessories, Save), then shows an empty screen. The Output panel prints how many collections and cards loaded and how long it took.

The game draws at 240×160 (the GBA screen) and scales by whole numbers only, so pixels stay sharp. Resize the window to see ×4, ×5, ×6.

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
| `art/src/` | Palette-indexed text grids, one per sprite (source) |
| `art/sheets/` | Exported PNG spritesheets (the assets the game loads) |
| `tests/` | Headless test runner and checks |

Collection JSONs, `data/` and card images stay at the repo root and are shared with the browser game.
