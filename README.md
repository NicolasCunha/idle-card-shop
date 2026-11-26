# IdleCardShop

A calm, menu-based idle browser game about running a trading card shop: buy boosters, open them, price the cards, list them in the showcase, and slowly automate everything with staff.

Free, non-commercial fan game. Static site, planned for GitHub Pages.

## Status

Pre-production. The game design document is a draft waiting for approval, and no game code exists yet.

- Design: [docs/GDD.md](docs/GDD.md) (Portuguese)
- Working rules for contributors and AI agents: [CLAUDE.md](CLAUDE.md) and [.claude/](.claude/)

## Repository layout

| Path | What |
| --- | --- |
| `docs/GDD.md` | Game design document |
| `docs/sdd/` | System design documents, one per system (to be written after GDD approval) |
| `collections.json` | List of card collections the game loads (to be added with the first collection) |
| `<collection-id>.json` | One file per card collection, at the repo root |
| `images/<collection-id>/` | Card and booster images for that collection |
| `.claude/rules/` | Project directives |
| `.claude/skills/` | Reusable processes (add a card collection, develop a feature, change the save schema) |

## Card content

All card data and images are supplied by the project owner. The code only reads and renders them. Nothing is fetched from official card databases or image sources.

## License

Not decided yet. Card names and artwork belong to their respective owners; this project claims no rights over them.
