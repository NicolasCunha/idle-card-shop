---
name: develop-feature
description: Take an IdleCardShop feature from the GDD/SDD to a finished change — design check, implementation, tutorial update, save impact, tests. Use for any new mechanic, tab, upgrade, staff skill, market change or UI change.
---

# Develop a feature

**Phase gate:** game code waits for GDD approval. If `docs/GDD.md` is still marked as a draft, stop and tell Nicolas.

## 1. Anchor in the design

1. Find the feature in `docs/GDD.md` and its SDD in `docs/sdd/`. If there is no SDD, write a short one first (English): goal, rules and numbers, data touched, save impact, tutorial impact, open questions. Show it to Nicolas before coding if it decides anything the GDD leaves open.
2. Check it against `.claude/rules/design-pillars.md`. If it adds pressure, loss or punishment, stop and ask.
3. If it touches anything marked **[PENDING GDD Q#]**, ask Nicolas or use the GDD proposal and say so.

## 2. Check save impact before coding

Does it add, remove, rename or change the meaning of any saved field? If yes, stop and run the `change-save-schema` skill first. Nicolas decides what happens to old saves.

## 3. Implement

- Player-facing text in English, following `.claude/rules/ui-copy.md`.
- Game logic goes through the single tick function so offline simulation behaves exactly like live play.
- Market logic stays deterministic and is never stored in the save.
- New tabs or controls follow the progressive reveal rules (GDD section 11): once shown, never hidden.
- Respect "Reduce motion" and color-independent rarity.

Stack conventions:

- Rules and numbers go in `js/game.js` (no DOM). Add tunables as exported constants at the top.
- UI goes in `js/ui.js`: each tab has `sig()` (re-render when it changes), `html()` and `vals()` (live values patched into `data-k`, `data-w`, `data-d`, `data-html` elements). Buttons use `data-action`, handled in `run()` in `js/main.js`.
- Player-facing text goes in `js/strings.js` or `data/tutorial.json`.
- Tests go in `tests/tests.js`; run them at `/tests/` on a local static server.

## 4. Update the tutorial

Mandatory per `.claude/rules/tutorial.md`: add or change steps in the tutorial data file, bump its revision, update the unlock table if needed. If there is truly no impact, write down why.

## 5. Verify

- Tests for the new rules and numbers, including an offline-simulation case (long absence gives the same result as live ticking).
- If it changes economy numbers, rerun the pacing simulation against the GDD pacing targets (first sale < 1 min, first employee 3–5 min, full automation 45–90 min).
- Load an old save and confirm nothing breaks.
- Play it in the browser once.

## 6. Close out

- Update the GDD/SDD if the design moved.
- Summary for Nicolas, in Portuguese: what changed, tutorial revision, save impact, anything still open.
