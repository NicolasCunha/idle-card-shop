class_name Strings
## Player-facing copy (port of js/strings.js). Short and direct: .claude/rules/ui-copy.md.

const LOADING := "Loading…"
const LOAD_FAILED := "Could not load game data."

## Loading screen steps (web 1.9.7), in display order.
const LOAD_STEPS := [
	["code", "Game code"],
	["cards", "Card collections"],
	["tutorial", "Tutorial"],
	["news", "News"],
	["goods", "Accessories"],
	["save", "Save"],
]
