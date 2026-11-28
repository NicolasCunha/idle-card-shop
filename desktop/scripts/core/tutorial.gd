class_name Tutorial
## Tutorial engine (port of js/tutorial.js). Steps come from data/tutorial.json,
## shared with the web game; every mechanic change bumps its revision
## (.claude/rules/tutorial.md). Targets are mapped to controls in TutorialTargets.

static var data: Dictionary = {"revision": 0, "steps": []}


static func set_data(d) -> void:
	if d is Dictionary and d.get("steps") is Array:
		data = d


static func _grew(s: Dictionary, k: String) -> bool:
	var base = s.tutorial.get("base")
	var b: float = float(base.get(k, 0)) if base is Dictionary and base.get(k) != null else 0.0
	return float(s.stats.get(k, 0)) > b


static func _any_open(s: Dictionary) -> bool:
	var o = s.get("_open", {})
	for k in o:
		if o[k]:
			return true
	return false


static func check(cond, s: Dictionary) -> bool:
	if cond == null or cond == "":
		return true
	match cond:
		"boostersBought", "boostersOpened", "cardsPriced", "cardsListed", "cardsSold":
			return _grew(s, cond)
		"staffUnlocked": return bool(s.unlocked.get("staff", false))
		"marketUnlocked": return bool(s.unlocked.get("market", false))
		"showcaseUnlocked": return bool(s.unlocked.get("showcase", false))
		"marketingUnlocked": return bool(s.unlocked.get("marketing", false))
		"propertiesUnlocked": return bool(s.unlocked.get("properties", false))
		"storageUnlocked": return bool(s.unlocked.get("storage", false))
		"visitedShowcase": return bool(s.flags.visited.get("showcase", false))
		"visitedMarketing": return bool(s.flags.visited.get("marketing", false))
		"visitedProperties": return bool(s.flags.visited.get("properties", false))
		"visitedMarket": return bool(s.flags.visited.get("market", false))
		"visitedSettings": return bool(s.flags.visited.get("settings", false))
		"visitedNews": return bool(s.flags.visited.get("news", false))
		"visitedFinances": return bool(s.flags.visited.get("finances", false))
		"visitedStorage": return bool(s.flags.visited.get("storage", false))
		"hasStaff": return s.staff.size() > 0
		"staffHasTask": return s.staff.any(func(e): return JS.truthy(e.get("task")))
		"twoStaff": return s.staff.size() >= 2
		"hasBackupJob": return s.staff.any(func(e): return JS.truthy(e.get("task2")))
		"listedGood": return s.shelf.size() > 0 or _grew(s, "sealedSold")
		"tradedBooster": return _grew(s, "boostersSold") or _grew(s, "boostersBoughtMarket")
		"nextSetOpen": return _any_open(s)
		"boughtNextSet":
			var o = s.get("_open", {})
			for id in o:
				if o[id] and (float(s.stock.get(id, 0)) > 0 or s.seen.get(id, {}).size() > 0):
					return true
			return false
	push_warning("Tutorial: unknown condition \"%s\"" % cond)
	return false


## Marks finished steps and returns the step to show now, or null.
static func current_step(s: Dictionary):
	if not s.get("setupDone", false):
		return null
	var t: Dictionary = s.tutorial
	var done := {}
	for id in t.done:
		done[id] = true
	var changed := false
	for step in data.steps:
		if not done.has(step.id) and step.get("done") and check(step.done, s):
			done[step.id] = true
			t.done.append(step.id)
			changed = true
	if data.steps.all(func(st): return done.has(st.id)):
		t.rev = data.revision
		return null
	for step in data.steps:
		if not done.has(step.id) and check(step.get("when"), s):
			return step
	return null


## Skip marks every current step done; steps added in later revisions still show.
static func skip(s: Dictionary) -> void:
	s.tutorial.done = data.steps.map(func(st): return st.id)
	s.tutorial.rev = data.revision
	s.tutorial.skipped = true


static func restart(s: Dictionary) -> void:
	s.tutorial.done = []
	s.tutorial.rev = 0
	s.tutorial.skipped = false
	s.tutorial.base = s.stats.duplicate(true)
	s.flags.visited = {}
