extends SceneTree
## Headless test runner: godot --headless --path desktop --script res://tests/run_tests.gd
## Exits with code 0 when every check passes, 1 otherwise.

var _passed := 0
var _failed := 0


func ok(cond: bool, name: String, detail: String = "") -> void:
	if cond:
		_passed += 1
		print("ok    %s  %s" % [name, detail])
	else:
		_failed += 1
		printerr("FAIL  %s  %s" % [name, detail])


func _initialize() -> void:
	_test_project_settings()
	_test_main_scene()
	_test_collections()
	_test_market()
	_test_golden_sim()
	print("%d passed, %d failed" % [_passed, _failed])
	quit(1 if _failed > 0 else 0)


func _test_project_settings() -> void:
	ok(ProjectSettings.get_setting("display/window/size/viewport_width") == 240, "base width 240")
	ok(ProjectSettings.get_setting("display/window/size/viewport_height") == 160, "base height 160")
	ok(ProjectSettings.get_setting("display/window/stretch/mode") == "viewport", "stretch mode viewport")
	ok(ProjectSettings.get_setting("display/window/stretch/scale_mode") == "integer", "integer scaling")
	ok(ProjectSettings.get_setting("rendering/textures/canvas_textures/default_texture_filter") == 0, "nearest filter")


func _test_main_scene() -> void:
	var path: String = ProjectSettings.get_setting("application/run/main_scene")
	var packed := load(path) as PackedScene
	ok(packed != null, "main scene loads", path)
	if packed:
		var node := packed.instantiate()
		ok(node is Control, "main scene root is a Control")
		ok(node.get_node_or_null("Background") is ColorRect, "background present")
		node.free()


var _data := {}


func _test_collections() -> void:
	_data = GameData.load_collections()
	var ref = GameData.read_json("res://tests/ref/market_ref.json")
	ok(ref is Dictionary, "reference file loads")
	if not ref is Dictionary:
		return
	ok(_data.order.size() == int(ref.collections), "every collection loads", "%d of %d" % [_data.order.size(), int(ref.collections)])
	var count := 0
	var bad := 0
	for id in _data.order:
		for card in _data.sets[id].cards:
			count += 1
			var want = ref["values"].get("%s:%s" % [id, card.id])
			if want == null or not _close(card.value, want):
				bad += 1
				if bad <= 3:
					printerr("  value %s:%s = %s, JS %s" % [id, card.id, card.value, want])
	ok(count == int(ref.cards), "every card loads", "%d of %d" % [count, int(ref.cards)])
	ok(bad == 0, "card values match JS (reprints included)", "%d differ" % bad)
	var a: Dictionary = _data.sets[_data.order[0]]
	ok(a.release_index == 0 and a.prev == null and a.next_id == _data.order[1], "release order linked")
	_ref = ref


var _ref := {}


func _close(a: float, b: float) -> bool:
	return absf(a - b) <= 1e-11 * maxf(1.0, absf(b))


func _test_market() -> void:
	if _ref.is_empty():
		return
	var bad_rand := 0
	for r in _ref.rands:
		Market.set_seed(r.seed)
		var parts := []
		for p in r.parts:
			parts.append(int(p) if p is float else p)
		var got := int(Market.rand(parts) * 9007199254740992.0)
		if got != int(r.hash):
			bad_rand += 1
			printerr("  hash %s %s = %d, JS %d" % [r.seed, r.parts, got, int(r.hash)])
	ok(bad_rand == 0, "seeded hash matches JS bit for bit", "%d of %d differ" % [bad_rand, _ref.rands.size()])
	var day0 := int(_ref.day0)
	var days := int(_ref.days)
	for run in _ref.runs:
		Market.set_seed(run.seed)
		var checked := 0
		var bad := 0
		var worst := 0.0
		for key in run.cards.keys():
			var parts: PackedStringArray = key.split(":")
			var cset: Dictionary = _data.sets[parts[0]]
			var card: Dictionary = cset.by_id[parts[1]]
			var want: Array = run.cards[key]
			for i in days:
				var got := Market.card_multiplier(cset, card, day0 + i)
				checked += 1
				var rel: float = absf(got - want[i]) / want[i]
				worst = maxf(worst, rel)
				if rel > 1e-11:
					bad += 1
					if bad <= 3:
						printerr("  %s day %d: %s, JS %s" % [key, day0 + i, got, want[i]])
		ok(bad == 0 and checked > 0, "prices match JS over %d days (%s seed, %d values)" % [days,
			"legacy" if run.seed == Market.LEGACY_SEED else "per-save", checked], "%d differ, worst %s" % [bad, worst])
	Market.set_seed(Market.LEGACY_SEED)
	var news := []
	for n in _ref.news:
		news.append(n)
	var got_news := []
	for id in _data.order.slice(0, 5):
		for card in _data.sets[id].cards.slice(0, 20):
			for d in range(day0, day0 + days):
				for n in Market.news_for(_data.sets[id], card, d):
					got_news.append(["%s:%s" % [id, card.id], d, n.day, n.kind, n.text])
	var same := got_news.size() == news.size()
	if same:
		for i in news.size():
			var w: Array = news[i]
			var g: Array = got_news[i]
			if w[0] != g[0] or int(w[1]) != g[1] or int(w[2]) != g[2] or w[3] != g[3] or w[4] != g[4]:
				same = false
				printerr("  news %s vs JS %s" % [g, w])
				break
	ok(same, "market news match JS", "%d vs %d" % [got_news.size(), news.size()])
	ok(Market.day_number(1795800000000) == 2993000, "market day number")
	ok(Market.day_label(2993004, 2993000) == "Day 5", "day label")
	ok(Fmt.num(1234567) == "1,234,567", "thousands separator")


func _test_golden_sim() -> void:
	var acc = GameData.read_json(GameData.content_root() + "data/accessories.json")
	var res := GoldenSim.run(_data.sets, _data.order, acc.items)
	for t in res.keys():
		var d: Array = res[t]
		ok(d.is_empty(), "golden simulation matches JS at %ds" % t, "" if d.is_empty() else "\n    " + "\n    ".join(PackedStringArray(d)))
