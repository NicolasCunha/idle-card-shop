# SDD: Shop floor scene

Requested by Nicolas on 2026-11-27. Purely visual: no rule, number or save change.

## What it shows

A pixel-art view between the tab bar and the panel, shown on every tab (Nicolas, 2026-11-27), so customers keep coming while the player works elsewhere (`js/scene.js`, `<canvas>`, no libraries). It is mounted once in the page shell (`ui.js` `buildShell`).

- Room: wall, door on the left, window, register on the right, wooden floor.
- Showcase: a glass case whose width grows with the Bigger showcase upgrade (3 shelves from level 4). Mini cards fill it in proportion to showcase use, colored by the rarity of the listed cards.
- Decor by Fame: poster at Fame 2, second poster and plant at 6, framed art at 11, rug at 16.
- Customers: every live visit from the rules (`G.onCustomer`) sends a customer in through the door. They walk to a spot along the case, look at it, show a speech bubble, play a happy (heart) or sad (rain cloud) emote, and walk out.
- Several customers browse at once, each at their own pace: a short random wait at the door (0-1.6 s), walking speed 75-120% of 42 px/s, browsing 1-3.5 s, a 45% chance to move to another spot along the case first, glances left and right. Spots are picked away from other customers, a little past each end of the case; when the front is crowded they stand in a second row just behind. A customer waits to speak while someone within 40 px is talking.

| Bubble | When |
| --- | --- |
| `Good price!` / `Fair price.` / `Pricey, but ok.` / `Steep... I want it.` | Bought a card; the feeling of that card's tag. Happy emote and `+$x` (gold, `(n)` when several cards) over the buyer |
| `Too pricey!` / `Bit pricey...` | Bought nothing; feeling of the last card looked at |
| `Maybe later.` | Bought nothing at a cheap or fair tag |
| `Nothing here...` | Empty showcase |
| `No <set>?` | Wanted the newest collection and found none |

At most 5 customers on the floor in a narrow room, up to 8 in a wide one (native width / 48). A buyer is always drawn: when the floor is full, the oldest non-buyer leaves to make room; non-buyers past the limit are not drawn. The money is credited by the rules when the visit happens; while the floor is on screen the sale sound and the header `+$` play when the buyer reacts (`onPaid`), otherwise on the sale itself (`G.onSale`). Offline catch-up and hidden tabs draw nothing. "Reduce motion": customers appear at the case, show the bubble and emote without walking or bouncing, then vanish.

## Size

Native height 112 px; native width follows the panel (200 to 400 px) so the room gets wider, not taller. Whole-number scale (about 230 CSS px tall), `image-rendering: pixelated`.

## Sprite format (for replacement art)

`images/sprites/customer-1.png` ... `customer-5.png`. Each sheet is 64 x 160: frames of 16 x 32, 4 columns x 5 rows, transparent background. The feet sit on the bottom row of the frame.

| Row | Frames |
| --- | --- |
| 0 | Walk down (facing the player): stand, step A, stand, step B |
| 1 | Walk up (back): same order |
| 2 | Walk left: same order |
| 3 | Walk right: same order |
| 4 | Emotes, facing the player: happy 1, happy 2, sad 1, sad 2 |

The placeholder sheets are original pixel art drawn by `tools/make_customers.py` (run `python tools/make_customers.py`). Nicolas can replace any sheet with his own art in the same layout; no code change needed. Adding a sixth sheet needs `SHEETS` in `js/scene.js` bumped. Sprites are network first in the service worker, so replaced art shows up on the next load.

## Tutorial impact

None: no mechanic, control or unlock changes; the scene only shows what already happens.
