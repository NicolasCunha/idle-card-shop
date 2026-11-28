class_name App
## Shared context for the UI: the live state, data and device prefs, plus the
## per-session UI options of ui.js (`ui`).

static var state: Dictionary
static var sets: Dictionary
static var order: Array
static var prefs: Dictionary
static var news: Array
static var main # main.gd
static var catching_up := false
static var ui := {
	"gp": {}, "goodLevel": "0", "shopSet": "", "binderSet": "", "marketSet": "all", "marketSort": "number",
	"marketPage": 0, "marketQuery": "", "priceQty": "10", "priceLevel": "0", "priceKeep": "0",
}
const PAGE_SIZES := [10, 25, 50, 100, 0]


## Only collections that are out are shown anywhere.
static func released() -> Array:
	return order.filter(func(id): return Game.set_unlocked(state, sets[id]))


static func released_or(id) -> String:
	if sets.has(id) and Game.set_unlocked(state, sets[id]):
		return id
	return order[0]


static func set_items() -> Array:
	return released().map(func(id): return [id, sets[id].name])


static func fmt_level(l) -> String:
	var v := float(l)
	if v == 0:
		return "Market"
	return "%s%d%%" % ["+" if v > 0 else "−", int(round(absf(v) * 100))]


static func level_items() -> Array:
	return Game.PRICE_LEVELS.map(func(l): return [str(l) if l != 0 else "0", fmt_level(l)])


static func lock_sig() -> int:
	return released().size()


static func cset(id) -> Dictionary:
	return sets[id]
