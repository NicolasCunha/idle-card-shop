class_name Achievements
## Achievements, ported from js/achievements.js (docs/sdd/economy-v5.md).
## No reward: the list is the record. Checked by the tick every few simulated
## seconds; a save gets what it already qualifies for on load, silently.

static var _cached: Array = []
static var _cached_for = null


static func _maxed(s: Dictionary, k: String) -> bool:
	return s.upgrades[k] >= Game.UPGRADES[k].max


static func _complete(s: Dictionary, cset: Dictionary) -> bool:
	return Game.collection_progress(s, cset).frac >= 1


static func _fixed() -> Array:
	var max_staff_ever: int = 1 + Game.UPGRADES.staffRoom.max
	return [
		{"id": "first-sale", "name": "First sale", "desc": "Sell a card.", "test": func(s): return s.stats.cardsSold >= 1},
		{"id": "sold-100", "name": "Regulars", "desc": "Sell 100 cards.", "test": func(s): return s.stats.cardsSold >= 100},
		{"id": "sold-1k", "name": "Busy counter", "desc": "Sell 1,000 cards.", "test": func(s): return s.stats.cardsSold >= 1000},
		{"id": "sold-10k", "name": "Card empire", "desc": "Sell 10,000 cards.", "test": func(s): return s.stats.cardsSold >= 10000},
		{"id": "opened-100", "name": "Pack ripper", "desc": "Open 100 boosters.", "test": func(s): return s.stats.boostersOpened >= 100},
		{"id": "opened-10k", "name": "Pack mountain", "desc": "Open 10,000 boosters.", "test": func(s): return s.stats.boostersOpened >= 10000},
		{"id": "earned-1k", "name": "First grand", "desc": "Earn $1,000.", "test": func(s): return s.stats.earned >= 1000},
		{"id": "earned-100k", "name": "Big business", "desc": "Earn $100,000.", "test": func(s): return s.stats.earned >= 100000},
		{"id": "earned-1m", "name": "Millionaire", "desc": "Earn $1,000,000.", "test": func(s): return s.stats.earned >= 1000000},
		{"id": "first-hire", "name": "First hire", "desc": "Hire an employee.", "test": func(s): return s.staff.size() >= 1},
		{"id": "full-team", "name": "Full team", "desc": "Hire %d employees." % max_staff_ever, "test": func(s): return s.staff.size() >= max_staff_ever},
		{"id": "expert", "name": "Expert", "desc": "Get a skill to level 10.", "test": func(s):
			return s.staff.any(func(e): return Game.SKILL_KEYS.any(func(k): return e.skills[k].lvl >= Game.MAX_SKILL))},
		{"id": "upgrade-max", "name": "Maxed out", "desc": "Max out an upgrade.", "test": func(s): return Game.UPGRADE_KEYS.any(func(k): return _maxed(s, k))},
		{"id": "all-upgrades", "name": "Fully upgraded", "desc": "Max out every upgrade.", "test": func(s): return Game.UPGRADE_KEYS.all(func(k): return _maxed(s, k))},
		{"id": "famous", "name": "Famous", "desc": "Reach Fame 20.", "test": func(s): return _maxed(s, "fame")},
		{"id": "sealed-sale", "name": "Sealed deal", "desc": "Sell a sealed product.", "test": func(s): return s.stats.sealedSold >= 1},
		{"id": "box-break", "name": "Box break", "desc": "Open a booster box.", "test": func(s): return s.stats.boxesOpened >= 1},
	]


## The full list for these collections: fixed ones, one per collection, and
## one for all of them.
static func list(sets: Dictionary) -> Array:
	var all: Array = sets.values()
	var out := _fixed()
	for cset in all:
		var c: Dictionary = cset
		out.append({"id": "complete-%s" % c.id, "name": "%s complete" % c.name, "desc": "Discover every %s card." % c.name,
			"test": func(s): return _complete(s, c)})
	out.append({"id": "master", "name": "Master collector", "desc": "Complete every collection.",
		"test": func(s): return all.all(func(c): return _complete(s, c))})
	return out


static func _list_for(sets: Dictionary) -> Array:
	if not is_same(_cached_for, sets):
		_cached = list(sets)
		_cached_for = sets
	return _cached


static func check(state: Dictionary, sets: Dictionary, silent: bool) -> void:
	for a in _list_for(sets):
		if state.achievements.get(a.id) != null:
			continue
		if a.test.call(state):
			Game.earn_achievement(state, a.id, a.name, silent)


static func register() -> void:
	Game.achievement_check = check
