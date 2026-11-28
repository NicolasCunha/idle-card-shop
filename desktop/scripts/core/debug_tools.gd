class_name DebugTools
## Debug menu helpers (port of js/debug.js). Unlocked on this device by a code;
## only its SHA-256 is in the repo. Every helper edits existing state fields,
## so the save format does not change.

const CODE_HASH := "1716c7abecf5b08f3d09ecdd986da3a5e2b3a7534f3b5e9b7b0eddbcec9d6a0c"


## Case and spaces do not matter.
static func check_code(code: String) -> bool:
	var text := code.to_lower()
	for ws in [" ", "\t", "\n", "\r"]:
		text = text.replace(ws, "")
	if text == "":
		return false
	return text.sha256_text() == CODE_HASH


static func set_money(state: Dictionary, v) -> void:
	var n := float(v)
	if is_finite(n) and n >= 0:
		state.money = round(n * 100.0) / 100.0


## Sealed boosters straight into storage, past the storage cap.
static func add_boosters(state: Dictionary, cset: Dictionary, n) -> void:
	var k := maxi(0, int(floor(float(n))))
	state.stock[cset.id] = float(state.stock.get(cset.id, 0)) + k


static func add_cards(state: Dictionary, sets: Dictionary, cset: Dictionary, n) -> Array:
	var k := maxi(0, int(floor(float(n))))
	add_boosters(state, cset, k)
	return Game.open_boosters(state, sets, cset, k)


static func set_upgrade(state: Dictionary, key: String, lvl: float) -> void:
	if not Game.UPGRADES.has(key):
		return
	var mx: int = Game.UPGRADES[key].max
	state.upgrades[key] = clampi(int(floor(minf(lvl, mx))), 0, mx)


static func hire_free(state: Dictionary):
	if state.staff.size() > Game.UPGRADES.staffRoom.max:
		return null
	state.upgrades.staffRoom = maxi(int(state.upgrades.staffRoom), state.staff.size())
	var money: float = state.money
	var spent: float = state.stats.spent
	var cost := Game.hire_cost(state.staff.size())
	state.money = INF
	var emp = Game.hire(state)
	state.money = money
	state.stats.spent = spent
	if state.ledger.size():
		var e: Dictionary = state.ledger[state.ledger.size() - 1]
		if e.out.has("hires"):
			e.out.hires -= cost
			if e.out.hires < 1e-9:
				e.out.erase("hires")
	return emp


static func max_skills(state: Dictionary) -> void:
	for e in state.staff:
		for k in Game.SKILL_KEYS:
			e.skills[k] = {"lvl": Game.MAX_SKILL, "xp": 0}


## Every collection not out yet comes out today. Kept in device preferences.
static func release_all(state: Dictionary, sets: Dictionary, prefs: Dictionary) -> void:
	if state.get("day") == null:
		return
	prefs.releaseAll = state.day
	state._releaseAll = state.day
	Game.advance_supply(state, sets)


static func unlock_all(state: Dictionary) -> void:
	for k in state.unlocked:
		state.unlocked[k] = true


static func ms_to_next_set(state: Dictionary, sets: Dictionary, now: int) -> int:
	var nxt = Game.next_release(state, sets)
	if nxt == null:
		return 0
	return maxi(0, Supply.release_day(state, nxt) * Market.DAY_MS - now)
