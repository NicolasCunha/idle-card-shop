class_name Routines
## Staff routines (docs/sdd/staff-routines.md): player-built step lists that
## employees run top to bottom, in a loop. Desktop only (save v7).
##
## A routine is {id, name, steps}. A step is a dictionary:
##   do:   "buy" | "open" | "price" | "bulk" (actions) or "if" | "else" | "end"
##   set:  collection picker: a collection id or one of PICKERS
##   rep:  1, 5 or 0 (0 = all: repeat while it works, at most REP_ALL in a row)
##   keep: copies to keep (price, bulk); null = shop rule
##   cond: condition key (if)
##   val:  number: money for "money", value cap for bulk (null = shop rule)
## If / Else / End nest. Jumps only go forward, so one pass over the list always
## ends; a pass with no action means the employee waits until the next tick.
## The place in the routine is runtime (`_pc`, `_cur`, `_rep`, `_acted`, `_why`).

const ACTIONS := ["buy", "open", "price", "bulk"]
const KINDS := ["buy", "open", "price", "bulk", "if", "else", "end"]
const PICKERS := ["@same", "@least", "@next", "@newest", "@any"]
const CONDS := ["incomplete", "complete", "packs", "nopacks", "room", "money"]
const SET_CONDS := ["incomplete", "complete", "packs", "nopacks"]
const REPEATS := [1, 5, 0]
const REP_ALL := 50
const NAME_MAX := 16
const SKILL_OF := {"buy": "buy", "open": "open", "price": "price", "bulk": "price"}


# ---------- Editing ----------

static func new_step(kind: String) -> Dictionary:
	match kind:
		"if":
			return {"do": "if", "cond": "incomplete", "set": "@same", "val": 0}
		"else", "end":
			return {"do": kind}
		"price", "bulk":
			return {"do": kind, "set": "@same", "rep": 0, "keep": null, "val": null}
	return {"do": kind, "set": "@same", "rep": 1}


static func create(state: Dictionary, name: String = "") -> Dictionary:
	var r := {
		"id": state.nextId,
		"name": name if name != "" else "Routine %d" % (state.routines.size() + 1),
		"steps": [
			{"do": "buy", "set": "@least", "rep": 1},
			{"do": "open", "set": "@same", "rep": 1},
			{"do": "price", "set": "@same", "rep": 0, "keep": 1, "val": null},
		],
	}
	state.nextId += 1
	state.routines.append(r)
	return r


static func find(state: Dictionary, id):
	if id == null:
		return null
	for r in state.get("routines", []):
		if JS.num(r.id) == JS.num(id):
			return r
	return null


static func rename(r: Dictionary, name: String) -> void:
	var t := name.strip_edges().left(NAME_MAX)
	if t != "":
		r.name = t


static func remove(state: Dictionary, r: Dictionary) -> void:
	state.routines.erase(r)
	for e in state.staff:
		if e.get("routine") != null and JS.num(e.routine) == JS.num(r.id):
			assign(e, null)


static func assign(emp: Dictionary, r) -> void:
	emp["routine"] = r.id if r is Dictionary else null
	emp.progress = 0
	_reset(emp)


static func staff_on(state: Dictionary, r: Dictionary) -> Array:
	return state.staff.filter(func(e): return e.get("routine") != null and JS.num(e.routine) == JS.num(r.id))


## Inserts a step (an If comes with its End) at `at` (-1 = the end).
static func add_step(state: Dictionary, r: Dictionary, kind: String, at: int = -1) -> void:
	if not KINDS.has(kind):
		return
	var i: int = r.steps.size() if at < 0 or at > r.steps.size() else at
	r.steps.insert(i, new_step(kind))
	if kind == "if":
		r.steps.insert(i + 1, new_step("end"))
	changed(state, r)


static func remove_step(state: Dictionary, r: Dictionary, i: int) -> void:
	if i >= 0 and i < r.steps.size():
		r.steps.remove_at(i)
		changed(state, r)


static func move_step(state: Dictionary, r: Dictionary, i: int, d: int) -> void:
	var j := i + d
	if i < 0 or j < 0 or i >= r.steps.size() or j >= r.steps.size():
		return
	var t = r.steps[i]
	r.steps[i] = r.steps[j]
	r.steps[j] = t
	changed(state, r)


## Sets one field of a step; changing an action keeps what still applies.
static func set_field(state: Dictionary, r: Dictionary, i: int, key: String, value) -> void:
	if i < 0 or i >= r.steps.size():
		return
	var st: Dictionary = r.steps[i]
	if key == "do":
		if not ACTIONS.has(value) or not ACTIONS.has(st.do):
			return
		var n := new_step(value)
		n.set = st.get("set", "@same")
		if n.set == "@any" and not (value == "price" or value == "bulk"):
			n.set = "@same"
		r.steps[i] = n
	else:
		st[key] = value
	changed(state, r)


## Every edit resets the employees on this routine to its top.
static func changed(state: Dictionary, r: Dictionary) -> void:
	r.erase("_j")
	for e in staff_on(state, r):
		_reset(e)


static func _reset(emp: Dictionary) -> void:
	for k in ["_pc", "_cur", "_rep", "_acted", "_why", "_cap"]:
		emp.erase(k)


# ---------- Structure ----------

## Indent level of each step (for the editor) and the forward jumps:
## if -> index after its Else (or its End), else -> index after its End.
static func jumps(r: Dictionary) -> Dictionary:
	if r.has("_j"):
		return r._j
	var n: int = r.steps.size()
	var jump := []
	var depth := []
	jump.resize(n)
	depth.resize(n)
	var open := [] # [if index, else index or -1]
	for i in n:
		var k: String = r.steps[i].do
		jump[i] = -1
		match k:
			"if":
				depth[i] = open.size()
				open.append([i, -1])
			"else":
				if open.is_empty() or open.back()[1] >= 0:
					depth[i] = open.size()
					continue # stray: ignored
				depth[i] = open.size() - 1
				open.back()[1] = i
				jump[open.back()[0]] = i + 1
			"end":
				if open.is_empty():
					depth[i] = 0
					continue # stray: ignored
				var o: Array = open.pop_back()
				depth[i] = open.size()
				if o[1] >= 0:
					jump[o[1]] = i + 1
				else:
					jump[o[0]] = i + 1
			_:
				depth[i] = open.size()
	for o in open: # no End: the block runs to the end of the list
		if o[1] >= 0:
			jump[o[1]] = n
		else:
			jump[o[0]] = n
	var out := {"jump": jump, "depth": depth}
	r["_j"] = out
	return out


# ---------- Pickers and conditions ----------

## Released collections in release order, cached for the market day.
static func _released(state: Dictionary, sets: Dictionary) -> Array:
	var c = state.get("_relCache")
	if c == null or c.day != state.day or c.n != sets.size() or c.first != state.get("firstDay"):
		c = {"day": state.day, "n": sets.size(), "first": state.get("firstDay"), "list": Game.released_sets(state, sets)}
		state["_relCache"] = c
	return c.list


static func owned_frac(state: Dictionary, cset: Dictionary) -> float:
	var total: int = cset.cards.size()
	if not total:
		return 1.0
	var b = state.binder.get(cset.id)
	return (float(b.size()) / total) if b is Dictionary else 0.0


static func complete(state: Dictionary, cset: Dictionary) -> bool:
	return owned_frac(state, cset) >= 1.0 - 1e-9


## Collection id for a picker, or null (none fits, or Any / Same with nothing before).
static func pick(state: Dictionary, sets: Dictionary, emp: Dictionary, picker):
	match picker:
		"@same":
			var c = emp.get("_cur")
			return c if c is String and sets.has(c) else null
		"@any":
			return null
		"@least":
			var best = null
			var bf := 2.0
			for s in _released(state, sets):
				var f := owned_frac(state, s)
				if f < 1.0 - 1e-9 and f < bf:
					bf = f
					best = s.id
			return best
		"@next":
			for s in _released(state, sets):
				if not complete(state, s):
					return s.id
			return null
		"@newest":
			var rel := _released(state, sets)
			return rel.back().id if rel.size() else null
	return picker if picker is String and sets.has(picker) else null


static func check(state: Dictionary, sets: Dictionary, emp: Dictionary, st: Dictionary) -> bool:
	var cond: String = str(st.get("cond", ""))
	if SET_CONDS.has(cond):
		var sid = pick(state, sets, emp, st.get("set", "@same"))
		if sid == null and st.get("set", "@same") == "@same":
			sid = state.rules.buySet
		if sid == null or not sets.has(sid):
			return cond == "complete" and st.get("set") in ["@least", "@next"]
		emp["_cur"] = sid
		match cond:
			"incomplete": return not complete(state, sets[sid])
			"complete": return complete(state, sets[sid])
			"packs": return JS.num(state.stock.get(sid)) >= 1
			"nopacks": return JS.num(state.stock.get(sid)) < 1
	match cond:
		"room": return Game.free_slots(state) > 0
		"money": return state.money > JS.num(st.get("val"))
	return false


# ---------- Running ----------

## One action. Returns true if it happened; otherwise emp.status says why.
static func run_step(state: Dictionary, sets: Dictionary, emp: Dictionary, st: Dictionary) -> bool:
	var picker = st.get("set", "@same")
	var sid = pick(state, sets, emp, picker)
	if sid == null and (picker == "@least" or picker == "@next"):
		emp.status = "all complete"
		return false
	if sid != null:
		emp["_cur"] = sid
	match st.do:
		"buy", "open":
			return Game._do_task(state, sets, emp, [st.do, sid])
		"price":
			var r := Game._staff_price_one(state, sets, sid, _keep(state, st))
			if r == "full":
				emp.status = "showcase full"
				return false
			if r == "none":
				emp.status = "nothing to price"
				return false
			return true
		"bulk":
			if bulk_one(state, sets, sid, _keep(state, st), st.get("val")):
				return true
			emp.status = "nothing to sell"
			return false
	return false


static func _keep(state: Dictionary, st: Dictionary) -> float:
	var k = st.get("keep")
	return maxf(0.0, floorf(JS.num(k) if k != null else JS.num(state.rules.keepCopies)))


## Sells one spare card worth less than `below` (null = shop rule, 0 = any) to
## the bulk buyer. The spare list is cached until the binder or the day changes.
static func bulk_one(state: Dictionary, sets: Dictionary, only_set, keep: float, below) -> bool:
	var cap: float = JS.num(state.rules.bulkBelow) if below == null else JS.num(below)
	if not state.has("_bulkQ"):
		state["_bulkQ"] = {}
	var key := "%s|%s|%s" % [only_set if only_set != null else "*", keep, cap]
	var ver: int = state.get("_binderVer", 0)
	var q = state._bulkQ.get(key)
	if q == null or q.day != state.day or q.ver != ver:
		var list := Game.spares(state, sets, keep, only_set)
		if cap > 0:
			list = list.filter(func(sp): return sp.mv < cap)
		list.reverse() # cheapest first
		q = {"day": state.day, "ver": ver, "i": 0, "list": list}
		state._bulkQ[key] = q
	while q.i < q.list.size():
		var sp: Dictionary = q.list[q.i]
		if Game.copies(state, sp.set, sp.card) <= keep:
			q.i += 1
			continue
		Game._take_from_binder(state, sp.set, sp.card, 1)
		Game._earn(state, sp.mv * Game.BULK_RATE, "bulk")
		state.stats.bulkSold += 1
		return true
	return false


## Runs `emp` on routine `r` for dt seconds (called from Game._tick_employee).
static func tick(state: Dictionary, sets: Dictionary, emp: Dictionary, r: Dictionary, dt: float) -> void:
	var steps: Array = r.steps
	if not steps.any(func(st): return ACTIONS.has(st.do)):
		emp.status = "no steps"
		emp.progress = 0
		return
	var j := jumps(r)
	emp.progress += dt
	var guard := 0
	while guard < 4000:
		guard += 1
		var pc: int = clampi(int(emp.get("_pc", 0)), 0, steps.size())
		# Walk control rows (and wrap) up to the next action.
		var walked := 0
		while walked <= 2 * steps.size() + 2:
			walked += 1
			if pc >= steps.size():
				if not emp.get("_acted", false):
					emp["_pc"] = 0
					emp.status = emp.get("_why", "waiting")
					emp.erase("_why")
					emp.progress = minf(emp.progress, float(emp.get("_cap", emp.progress)))
					return
				pc = 0
				emp["_acted"] = false
				emp.erase("_why")
				continue
			var st: Dictionary = steps[pc]
			match st.do:
				"if":
					pc = pc + 1 if check(state, sets, emp, st) else (j.jump[pc] if j.jump[pc] >= 0 else pc + 1)
				"else":
					pc = j.jump[pc] if j.jump[pc] >= 0 else pc + 1
				"end":
					pc += 1
				_:
					break
		emp["_pc"] = pc
		if pc >= steps.size() or not ACTIONS.has(steps[pc].do):
			emp["_pc"] = 0
			emp.status = "waiting"
			return
		var step: Dictionary = steps[pc]
		var skill: String = SKILL_OF[step.do]
		var dur := Game.skill_duration(skill, int(emp.skills[skill].lvl))
		emp["_cap"] = maxf(float(emp.get("_cap", 0.0)), dur)
		if emp.progress < dur:
			emp.status = "working"
			return
		var rep := int(emp.get("_rep", 0))
		if run_step(state, sets, emp, step):
			emp.progress -= dur
			Game._gain_xp(state, emp, skill)
			emp["_acted"] = true
			rep += 1
			var want := int(JS.num(step.get("rep", 1)))
			if (want > 0 and rep >= want) or rep >= REP_ALL:
				emp["_pc"] = pc + 1
				rep = 0
			emp["_rep"] = rep
			emp.status = "working"
		else:
			if not emp.has("_why"):
				emp["_why"] = emp.status
			emp["_pc"] = pc + 1
			emp["_rep"] = 0


## Text for an employee's place in its routine: "2 Open".
static func where(emp: Dictionary, r: Dictionary) -> String:
	var pc := int(emp.get("_pc", 0))
	if pc < 0 or pc >= r.steps.size():
		return ""
	return "%d %s" % [pc + 1, Strings.STEP_NAMES.get(r.steps[pc].do, "")]


# ---------- Save ----------

## Cleans saved routines: known kinds, known pickers, sane numbers.
static func sanitize(state: Dictionary, sets: Dictionary) -> void:
	var out := []
	var ids := {}
	for r in state.get("routines", []):
		if not r is Dictionary or not r.get("steps") is Array:
			continue
		var id = r.get("id")
		if not (id is int or id is float) or ids.has(int(id)):
			id = state.nextId
			state.nextId += 1
		ids[int(id)] = true
		var steps := []
		for st in r.steps:
			if not st is Dictionary or not KINDS.has(st.get("do")):
				continue
			var n := new_step(st.do)
			var s = st.get("set")
			if n.has("set") and s is String and (PICKERS.has(s) or sets.has(s)):
				if s != "@any" or st.do in ["price", "bulk"]:
					n.set = s
			if n.has("rep") and (st.get("rep") is int or st.get("rep") is float) and REPEATS.has(int(st.rep)):
				n.rep = int(st.rep)
			if n.has("keep"):
				n.keep = maxf(0.0, floorf(st.keep)) if st.get("keep") is int or st.get("keep") is float else null
			if n.has("cond") and CONDS.has(st.get("cond")):
				n.cond = st.cond
			if n.has("val"):
				var v = st.get("val")
				if (v is int or v is float) and is_finite(float(v)) and v >= 0:
					n.val = float(v)
			steps.append(n)
		var name := str(r.get("name", "")).strip_edges().left(NAME_MAX)
		out.append({"id": int(id), "name": name if name != "" else "Routine", "steps": steps})
	state.routines = out
	for e in state.staff:
		if e.get("routine") != null and find(state, e.routine) == null:
			e.routine = null
