class_name SaveData
## Versioned saves, ported from js/save.js (GDD section 9, save-schema rule).
## File format: { game, saveVersion, gameVersion, exportedAt, state }.
## Migrations run in order; then the state is merged with defaults and
## sanitized. Unknown cards and collections are skipped.

const GAME_ID := "idlecardshop"
const SAVE_VERSION := 6
const GAME_VERSION := "2.1.0"
const SAVE_PATH := "user://save.json"
const BACKUPS := 3


static func _migrate_1(state):
	if not state.get("binder") is Dictionary:
		state["binder"] = {}
	var binder: Dictionary = state.binder
	var items := []
	items.append_array(state.get("unpriced", []) if state.get("unpriced") is Array else [])
	items.append_array(state.get("priced", []) if state.get("priced") is Array else [])
	for it in items:
		if not it is Dictionary or not it.get("s") is String or not it.get("c") is String:
			continue
		if not binder.has(it.s):
			binder[it.s] = {}
		binder[it.s][it.c] = JS.num(binder[it.s].get(it.c)) + 1
	state.erase("unpriced")
	state.erase("priced")
	if state.get("rules") is Dictionary:
		state.rules.erase("keepFirst")
	for e in state.get("staff", []) if state.get("staff") is Array else []:
		if not e is Dictionary:
			continue
		if e.get("task") == "list":
			e.task = "price"
		if e.get("training") is Dictionary and e.training.get("skill") == "list":
			e.training = null
		if e.get("skills") is Dictionary:
			e.skills.erase("list")
	return state


static func _migrate_4(state):
	if state is Dictionary and state.size():
		state["seed"] = Market.LEGACY_SEED
		for e in state.get("staff", []) if state.get("staff") is Array else []:
			if e is Dictionary:
				e["hiredDay"] = null
	return state


static func _migrate_5(state):
	if state is Dictionary and state.get("staff") is Array:
		for e in state.staff:
			if e is Dictionary:
				e["set"] = null
				e["task2"] = null
				e["set2"] = null
	return state


## Runs migrations vN -> SAVE_VERSION. Returns the state, or an error String.
static func migrate(file):
	if not file is Dictionary or not JS.truthy(file.get("state")):
		return "Not a save file"
	if JS.truthy(file.get("game")) and file.game != GAME_ID:
		return "Not a save file"
	var sv = file.get("saveVersion")
	var v: int = int(sv) if (sv is float or sv is int) and float(sv) == floorf(float(sv)) else 1
	if v > SAVE_VERSION:
		return "Save is from a newer version"
	var state = file.state
	while v < SAVE_VERSION:
		match v:
			1: state = _migrate_1(state)
			2, 3: state = {}
			4: state = _migrate_4(state)
			5: state = _migrate_5(state)
			_: return "Missing migration v%d -> v%d" % [v, v + 1]
		v += 1
	return state


static func _is_plain(x) -> bool:
	return x is Dictionary


## Merge saved data into defaults. An empty default object is a map (keys are
## ids): it takes the saved object as is. A non-empty one is a record: known
## keys are merged one by one, unknown keys are dropped.
static func merge_defaults(def, saved):
	if saved == null and not def == null:
		# undefined in JS: keep the default. (A saved JSON null for a typed field
		# is also replaced by the default, as typeof null !== typeof default.)
		return def
	if def is Array:
		return saved if saved is Array else def
	if def is Dictionary:
		if not saved is Dictionary:
			return def
		if def.is_empty():
			return saved
		var out := {}
		for k in def.keys():
			out[k] = merge_defaults(def[k], saved.get(k))
		return out
	if def == null:
		return saved
	if (def is int or def is float) and (saved is int or saved is float):
		return saved
	return saved if typeof(saved) == typeof(def) else def


static func _finite(x) -> bool:
	return (x is int or x is float) and not is_nan(float(x)) and not is_inf(float(x))


static func _is_int(x) -> bool:
	return _finite(x) and float(x) == floorf(float(x))


static func sanitize(state: Dictionary, sets: Dictionary) -> Dictionary:
	state.showcase = state.showcase.filter(func(it):
		return it is Dictionary and sets.has(it.get("s")) and sets[it.s].by_id.has(it.get("c")) and _finite(it.get("p")))
	for sid in state.market.keys():
		var m = state.market[sid]
		var ok_num := func(k): return m is Dictionary and _finite(m.get(k)) and m[k] >= 0
		if not sets.has(sid) or not ["run", "printed", "left", "held", "age"].all(ok_num):
			state.market.erase(sid)
		elif not m.get("hist") is Array:
			m["hist"] = []
	state.inbox = state.inbox.filter(func(n): return n is Dictionary and _finite(n.get("id")) and n.get("text") is String)
	for n in state.inbox:
		if n.has("detail") and not n.detail is String:
			n.erase("detail")
	if not state.seed is String or state.seed == "":
		state.seed = Market.LEGACY_SEED
	state.shelf = state.shelf.filter(func(it): return it is Dictionary and it.get("g") is String and Game.good_info(sets, it.g) != null \
		and _finite(it.get("p")) and it.p > 0 and _is_int(it.get("n")) and it.n > 0)
	for g in state.goods.keys():
		var n = state.goods[g]
		if Game.good_info(sets, g) == null or g.begins_with("b:") or not _is_int(n) or n <= 0:
			state.goods.erase(g)
	state.ledger = state.ledger.filter(func(e): return e is Dictionary and _finite(e.get("day")) and e.get("in") is Dictionary and e.get("out") is Dictionary)
	for id in state.achievements.keys():
		if not _finite(state.achievements[id]):
			state.achievements.erase(id)
	state.newsSeen = state.newsSeen.filter(func(id): return id is String)
	var c = state.campaign
	if not c is Dictionary or not Game.CAMPAIGNS.has(c.get("kind")) or not (JS.num(c.get("left")) > 0):
		state.campaign = null
	var p: Dictionary = state.properties
	var whs := []
	for w in p.warehouses:
		if w is Dictionary and _is_int(w.get("level")):
			var id = w.id if _finite(w.get("id")) else state.nextId
			if not _finite(w.get("id")):
				state.nextId += 1
			whs.append({"id": id, "level": clampi(int(w.level), 1, Game.WAREHOUSE.maxLevel)})
	p.warehouses = whs
	for m in [p.goods, p.targets]:
		for g in m.keys():
			if Game.good_info(sets, g) == null or not (_is_int(m[g]) and m[g] > 0):
				m.erase(g)
	p.ships = p.ships.filter(func(sh): return sh is Dictionary and sh.get("g") is String and Game.good_info(sets, sh.g) != null \
		and _is_int(sh.get("n")) and sh.n > 0 and _finite(sh.get("arrive")))
	for map in [state.stock, state.binder, state.seen]:
		for sid in map.keys():
			if not sets.has(sid):
				map.erase(sid)
	for m in [state.binder, state.seen]:
		for sid in m.keys():
			if not m[sid] is Dictionary:
				m.erase(sid)
				continue
			for cid in m[sid].keys():
				if not sets[sid].by_id.has(cid):
					m[sid].erase(cid)
	var first: String = sets.keys()[0] if sets.size() else ""
	if not sets.has(state.rules.buySet):
		state.rules.buySet = first
	if not sets.has(state.rules.openSet):
		state.rules.openSet = first
	var staff := []
	for e in state.staff:
		if not e is Dictionary:
			continue
		var skills := {}
		for k in Game.SKILL_KEYS:
			var s = e.get("skills", {}).get(k) if e.get("skills") is Dictionary else null
			var lvl := floorf(JS.num(s.get("lvl"))) if s is Dictionary else 0.0
			skills[k] = {"lvl": clampi(int(lvl) if lvl else 1, 1, 10), "xp": maxf(0.0, JS.num(s.get("xp")) if s is Dictionary else 0.0)}
		var id = e.get("id")
		if id == null:
			id = state.nextId
			state.nextId += 1
		var tr = e.get("training")
		staff.append({
			"id": id,
			"name": str(e.get("name")) if JS.truthy(e.get("name")) else "Clerk",
			"skills": skills,
			"task": e.task if Game.SKILL_KEYS.has(e.get("task")) else null,
			"set": e["set"] if e.get("set") is String and sets.has(e["set"]) else null,
			"task2": e.task2 if Game.SKILL_KEYS.has(e.get("task2")) else null,
			"set2": e.set2 if e.get("set2") is String and sets.has(e.set2) else null,
			"progress": JS.num(e.get("progress")),
			"training": tr if tr is Dictionary and Game.SKILL_KEYS.has(tr.get("skill")) else null,
			"status": "idle",
			"hiredDay": e.hiredDay if _finite(e.get("hiredDay")) else null,
		})
	state.staff = staff
	return state


## Parsed save file -> ready state, or an error String.
static func restore(file, sets: Dictionary, order: Array):
	var migrated = migrate(file)
	if migrated is String:
		return migrated
	var state = merge_defaults(Game.new_state(sets, order), migrated)
	return sanitize(state, sets)


static func serialize(state: Dictionary) -> Dictionary:
	return {
		"game": GAME_ID,
		"saveVersion": SAVE_VERSION,
		"gameVersion": GAME_VERSION,
		"exportedAt": Time.get_datetime_string_from_system(true) + "Z",
		"state": JS.strip(state),
	}


static func to_json(state: Dictionary, indent: String = "") -> String:
	return JSON.stringify(serialize(state), indent, false)


## Writes user://save.json, keeping the last BACKUPS saves as save.json.1 .. .3.
static func save_local(state: Dictionary) -> bool:
	var text := to_json(state)
	var tmp := SAVE_PATH + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		push_error("Save failed: %s" % error_string(FileAccess.get_open_error()))
		return false
	f.store_string(text)
	f.close()
	var dir := DirAccess.open("user://")
	if FileAccess.file_exists(SAVE_PATH):
		for i in range(BACKUPS - 1, 0, -1):
			var from := "%s.%d" % [SAVE_PATH, i]
			if FileAccess.file_exists(from):
				dir.rename(from, "%s.%d" % [SAVE_PATH, i + 1])
		dir.rename(SAVE_PATH, SAVE_PATH + ".1")
	return dir.rename(tmp, SAVE_PATH) == OK


## The local save, a restored state, or null when there is none or it is broken
## (a broken save is kept aside as save.json.broken).
static func load_local(sets: Dictionary, order: Array):
	if not FileAccess.file_exists(SAVE_PATH):
		return null
	var text := FileAccess.get_file_as_string(SAVE_PATH)
	var data = JSON.parse_string(text)
	var state = restore(data, sets, order) if data != null else "Invalid JSON"
	if state is String:
		push_error("Could not load save: %s" % state)
		DirAccess.open("user://").copy(SAVE_PATH, SAVE_PATH + ".broken")
		return null
	return state


static func clear_local() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		DirAccess.open("user://").remove(SAVE_PATH)


## Import from a file path (web or desktop export). Returns state or error String.
static func import_file(path: String, sets: Dictionary, order: Array):
	var data = JSON.parse_string(FileAccess.get_file_as_string(path))
	if data == null:
		return "Not a save file"
	return restore(data, sets, order)


static func export_file(state: Dictionary, path: String) -> bool:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(to_json(state, "  "))
	return true


# ---------- Device preferences (never inside the save) ----------
const PREFS_PATH := "user://prefs.json"
const DEFAULT_PREFS := {
	"theme": "system",
	"master": 70,
	"music": 50,
	"effects": 70,
	"muteMaster": false,
	"muteMusic": false,
	"muteEffects": false,
	"reduceMotion": false,
	"marketPageSize": 25,
	"debug": false,
	"clockOffset": 0,
	"releaseAll": null,
	"resolution": "1280x720",
	"windowMode": "", # windowed, borderless or fullscreen; "" = from the old fullscreen pref
}


const RESOLUTIONS := ["800x600", "1024x768", "1280x720", "1440x900", "1920x1080"]


static func load_prefs() -> Dictionary:
	var data = null
	if FileAccess.file_exists(PREFS_PATH):
		data = JSON.parse_string(FileAccess.get_file_as_string(PREFS_PATH))
	var p: Dictionary = merge_defaults(DEFAULT_PREFS.duplicate(true), data if data is Dictionary else {})
	if not p.windowMode in ["windowed", "borderless", "fullscreen"]:
		p.windowMode = "fullscreen" if data is Dictionary and data.get("fullscreen", false) else "windowed"
	if not p.resolution in RESOLUTIONS:
		p.resolution = "1280x720"
	return p


static func save_prefs(prefs: Dictionary) -> void:
	var f := FileAccess.open(PREFS_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(prefs))
