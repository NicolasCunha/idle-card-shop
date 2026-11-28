class_name GoldenSim
## Runs tests/ref/sim_script.json with the ported rules and compares the state
## at each checkpoint with sim_ref.json (made by the web build).


static func act(state: Dictionary, s: Dictionary, op: String, a: Array) -> void:
	match op:
		"money": state.money = float(a[0])
		"buy": Game.buy_boosters(state, s[a[0]], int(a[1]))
		"open": Game.open_boosters(state, s, s[a[0]], int(a[1]))
		"price": Game.price_spares(state, s, int(a[0]), a[1], a[2])
		"hire":
			for i in int(a[0]):
				Game.hire(state)
		"upgrade":
			for i in int(a[1]):
				Game.buy_upgrade(state, a[0])
		"job": Game.set_job(state, state.staff[int(a[0])], int(a[1]), a[2], a[3])
		"train": Game.train(state, state.staff[int(a[0])], a[1])
		"campaign": Game.start_campaign(state, a[0])
		"warehouse": Game.buy_warehouse(state)
		"upwarehouse": Game.upgrade_warehouse(state, state.properties.warehouses[int(a[0])].id)
		"towarehouse": Game.buy_to_warehouse(state, s, a[0], a[1])
		"target": Game.set_target(state, a[0], a[1])
		"box": Game.buy_box(state, s[a[0]])
		"openbox": Game.open_box(state, s[a[0]])
		"acc": Game.buy_accessory(state, a[0], int(a[1]))
		"listgood": Game.list_good(state, s, a[0], a[1], a[2])
		"rules": state.rules[a[0]] = a[1]
		"single": Game.buy_single(state, s, s[a[0]], s[a[0]].by_id[a[1]])
		"sellmb": Game.sell_market_booster(state, s[a[0]])
		"buymb": Game.buy_market_booster(state, s[a[0]])
		"bulk": Game.sell_bulk(state, s, a[0])
		"store": Game.store_in_warehouse(state, a[0], a[1])
		"ship": Game.ship_to_shop(state, a[0], a[1])
		"recall": Game.recall_showcase(state)
		"fire": Game.fire(state, state.staff[int(a[0])])
		"recallshelf": Game.recall_shelf(state)
		_: push_error("unknown op " + op)


## Returns { checkpoint -> list of differences }.
static func run(sets: Dictionary, order: Array, accessories: Array) -> Dictionary:
	var script = GameData.read_json("res://tests/ref/sim_script.json")
	var ref = GameData.read_json("res://tests/ref/sim_ref.json")
	Game.set_accessories(accessories)
	Achievements.register()
	Game.set_random(Rng.seeded(int(script.rngSeed)))
	var start := int(script.startMs)
	var state := Game.new_state(sets, order, start)
	state.seed = script.marketSeed
	Game.prepare(state, sets)
	var checkpoints := {}
	for c in script.checkpoints:
		checkpoints[int(c)] = true
	var actions: Array = script.actions
	var ai := 0
	var out := {}
	for t in int(script.seconds) + 1:
		while ai < actions.size() and int(actions[ai][0]) == t:
			act(state, sets, actions[ai][1], actions[ai].slice(2))
			ai += 1
		if t > 0:
			Game.tick(state, sets, 1, start + t * 1000)
		if checkpoints.has(t):
			var diffs := []
			var dump = JSON.parse_string(JSON.stringify(JS.strip(state)))
			dump.erase("routines") # desktop-only fields (save v7)
			for e in dump.staff:
				e.erase("routine")
			diff(dump, ref.checkpoints[str(t)], "state", diffs)
			out[t] = diffs
	Game.set_random()
	return out


static func diff(a, b, path: String, out: Array) -> void:
	if out.size() >= 12:
		return
	if (a is float or a is int) and (b is float or b is int):
		if absf(a - b) > 1e-9 * maxf(1.0, absf(b)):
			out.append("%s: %s vs JS %s" % [path, a, b])
		return
	if a is Dictionary and b is Dictionary:
		for k in b.keys():
			if not a.has(k):
				out.append("%s.%s missing" % [path, k])
			else:
				diff(a[k], b[k], "%s.%s" % [path, k], out)
		for k in a.keys():
			if not b.has(k):
				out.append("%s.%s extra (%s)" % [path, k, a[k]])
		return
	if a is Array and b is Array:
		if a.size() != b.size():
			out.append("%s: %d items vs JS %d" % [path, a.size(), b.size()])
		for i in mini(a.size(), b.size()):
			diff(a[i], b[i], "%s[%d]" % [path, i], out)
		return
	if typeof(a) != typeof(b) or a != b:
		out.append("%s: %s vs JS %s" % [path, a, b])
