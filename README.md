# IdleCardShop

A calm, menu-based idle browser game about running a trading card shop: buy boosters, open them, price the cards, list them in the showcase, and slowly automate everything with staff.

Free, non-commercial fan game. Static site for GitHub Pages.

## Play locally

The game is plain HTML, CSS and JavaScript modules with no build step. Serve the repo root with any static server:

```
python -m http.server 8000
```

Then open http://localhost:8000/. Tests run at http://localhost:8000/tests/.

## Publish on GitHub Pages

Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`.

## Status

v1 implements the whole GDD loop for the Base Set: shop loop, booster opening, binder, showcase, daily market, staff, upgrades, offline progress, versioned saves, audio, tutorial. Card names are placeholders until real data is supplied.

- Design: [docs/GDD.md](docs/GDD.md) (Portuguese)
- Implementation notes and open assumptions: [docs/sdd/v1-implementation.md](docs/sdd/v1-implementation.md)
- Working rules for contributors and AI agents: [CLAUDE.md](CLAUDE.md) and [.claude/](.claude/)

## Repository layout

| Path | What |
| --- | --- |
| `index.html`, `css/`, `js/` | The game |
| `data/tutorial.json` | Tutorial steps (with revision number) |
| `collections.json` | List of card collections the game loads |
| `<collection-id>.json` | One file per card collection, at the repo root (`base.json`) |
| `images/<collection-id>/` | Card and booster images for that collection (optional) |
| `tests/` | Browser test suite and pacing simulation |
| `docs/` | GDD and system design documents |
| `.claude/` | Project rules and skills for AI agents |

## Card content

All card data and images are supplied by the project owner. The code only reads and renders them. Nothing is fetched from official card databases or image sources. Cards without an image are drawn as a generic card.

## License

Not decided yet. Card names and artwork belong to their respective owners; this project claims no rights over them.
