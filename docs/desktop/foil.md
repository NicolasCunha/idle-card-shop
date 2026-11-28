# Rarity foil (desktop)

Nicolas, 2026-11-28: foil only where the real card shines, and fancier for rarer cards. Shown on the big card in the card detail, on top of the mouse tilt (`card_tilt.gd`). The binder grid has no foil.

| Rarity | Mode | Effect |
|---|---|---|
| holo | 1 | rainbow only in the artwork window |
| ex | 2 | holo window + a faint plain sheen on the card (less than secret: ex is more common) |
| secret | 3 | holo window + faint diagonal rainbow lines over the whole card |
| star (Gold Star) | 4 | holo window + gold border, slow sheen, twinkling stars |

Common, uncommon and rare: no foil.

## Pieces

- `desktop/shaders/card_foil.gdshader`: one `canvas_item` shader, uniforms `mode`, `art_rect` (UV x, y, w, h), `tilt` (-1..1), `grid` (card size in base pixels; the foil is drawn in base pixels with few colour and brightness steps, to match the pixel art), `motion` (0 under Reduce motion: no twinkle, no moving sheen).
- `desktop/scripts/ui/foil.gd` (`Foil`): rarity → mode, the card's artwork window, the material.
- `CardTilt` draws the scan with its own `CardView` (`part = "scan"`, carries the foil) under a second one with the badges (`part = "overlay"`), so badges are never foiled. No foil while the scan is missing or loading.
- `desktop/data/foil_rects.json`: artwork window of every foil card, `{set id: {card id: [x, y, w, h]}}`. Generated, not hand-written; it is not card content, so collection JSON files stay untouched.

## Artwork windows

`python -X utf8 desktop/tools/foil_rects.py` from the repo root (numpy, Pillow). Run it after adding or changing a collection; a test checks every foil card has a window.

- A fixed window per era does not work: each scan is cropped a little differently. Free edge detection alone missed about a third of the cards.
- So: the median window of each set is the template, and each edge snaps to the strongest straight line within 2% of it. A weak edge keeps the template.
- Energy cards are full art: their window is the whole card inside the border.
- Hand fixes go in `desktop/data/foil_overrides.json` (same shape) and win over detection.

## Not done

- No foil in the binder grid, booster opening or showcase (cost and noise; could get a cheap static version later).
- No Pokémon cut-out mask: on real WotC holos the Pokémon itself is not foil. The shader only weakens the foil on bright pixels.
