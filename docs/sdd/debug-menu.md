# Debug menu

Requested by Nicolas, 2026-11-27: a hidden menu to test anything that would otherwise take a long time to reach.

## Unlock

- Settings has a **Code** box. The code is checked against a SHA-256 hash in `js/debug.js` (`CODE_HASH`); the plain code is not in the repo. Case and spaces are ignored.
- Unlocking sets `prefs.debug` (device preference, `idlecardshop.prefs`), so it stays on that device until `Hide debug`. It is not in the save.
- The site is static, so the hash ships to every player. It hides the menu from casual players; it is not a security boundary. A GitHub Secret would only help with a build step (Actions) that writes the hash; the game has no build step.

## Controls

| Control | Effect |
| --- | --- |
| Skip 1 day / Skip 6 days / Skip to next set | Moves the game clock forward (`js/clock.js`, offset in `prefs.clockOffset`). The next loop runs the normal offline catch-up, so the skipped time plays out like time away. Only forward: going back would leave `lastTick` in the future. |
| Release all sets | Every collection not out yet comes out on the current market day (Nicolas, 2026-11-28). Kept in `prefs.releaseAll` (the day), read into the runtime field `state._releaseAll`, which `supply.js` `releaseDay` uses; never saved. Collections already out keep their day. Cleared on reset and import. |
| Set money | Sets cash. |
| Add boosters | Adds sealed boosters of a released collection, past the storage cap. |
| Open free | Adds and opens boosters into the binder. |
| Upgrades − / + / Max | Sets each upgrade level (0..max). |
| Hire free | Hires one employee at no cost, raising Staff room if needed. |
| Max skills | Every employee's skills to level 10. |
| Unlock all | Shows every tab. |
| Hide debug | Locks the menu again on this device. |

## Clock

`js/clock.js` `now()` is real time plus the debug offset. `main.js` uses it for the loop, catch-up, setup, reset and import; the header countdown uses it too. Market prices still come from the day number, so skipping time changes the market day exactly as waiting would.

## Save impact

None: the debug tools only edit existing state fields. The offset, the release-all day and the unlock live in device preferences. A save exported after a skip carries a `lastTick` ahead of real time; on another device the game waits until real time catches up.

## Tutorial impact

None: the menu is hidden and not part of the game's mechanics.
