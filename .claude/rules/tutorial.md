# Tutorial is always up to date

**No change is done until the tutorial reflects it.** This applies to every change that adds, removes or alters a mechanic, a tab, a button the tutorial points at, or an unlock condition.

- Tutorial content lives in `data/tutorial.json` (list of steps), separate from UI code. Each step has `id`, `text`, `target` (CSS selector to highlight), optional `tab`, optional `when` (show condition) and `done` (finish condition). Conditions are defined in `js/tutorial.js`; add one there if a new step needs it.
- Progressive reveal (which tabs and controls appear when) lives in `checkUnlocks` in `js/game.js`.
- The tutorial has an integer revision number. Every tutorial change bumps it. Players on an older revision see only the new or changed steps.
- Each step highlights the right control and waits for the player to do the action.
- A new mechanic gets a step or tip shown the first time it unlocks.
- Keep the progressive reveal table (GDD section 11) in sync: if a tab or control unlocks at a new condition, update both the tutorial and the GDD/SDD.
- Tutorial text follows `.claude/rules/ui-copy.md`: short imperative sentences in English.

In every summary of a change, state either "tutorial updated (rev N → N+1)" or "no tutorial impact" with the reason.
