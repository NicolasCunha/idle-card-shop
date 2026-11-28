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
	_test_ui_helpers()
	print("%d passed, %d failed" % [_passed, _failed])
	quit(1 if _failed > 0 else 0)


func _test_project_settings() -> void:
	ok(ProjectSettings.get_setting("display/window/size/viewport_width") == 640, "base width 640")
	ok(ProjectSettings.get_setting("display/window/size/viewport_height") == 360, "base height 360")
	ok(ProjectSettings.get_setting("display/window/stretch/mode") == "canvas_items", "stretch mode canvas_items")
	ok(ProjectSettings.get_setting("display/window/stretch/scale_mode") == "integer", "integer scaling")
	ok(ProjectSettings.get_setting("rendering/textures/canvas_textures/default_texture_filter") == 0, "nearest filter")
	ok(ProjectSettings.get_setting("application/config/version") == SaveData.GAME_VERSION, "project version matches the save's game version",
		"%s vs %s" % [ProjectSettings.get_setting("application/config/version"), SaveData.GAME_VERSION])


func _test_main_scene() -> void:
	ok(ProjectSettings.get_setting("application/run/main_scene") == "res://scenes/boot.tscn", "launcher is the first scene")
	ok(load("res://scenes/boot.tscn") is PackedScene, "launcher scene loads")
	ok(load("res://scripts/boot.gd").get_script_constant_map().has("API"), "launcher script compiles")
	var path := "res://scenes/main.tscn"
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


## Formatting, search, tutorial and debug helpers used by the UI (S13-S17).
func _test_ui_helpers() -> void:
	ok(Fmt.money(1234.5) == "$1,234.50" and Fmt.money(12400) == "$12.4K" and Fmt.money(-3) == "-$3.00" and Fmt.money(2.5e6) == "$2.50M",
		"money format like format.js", "%s %s %s %s" % [Fmt.money(1234.5), Fmt.money(12400), Fmt.money(-3), Fmt.money(2.5e6)])
	ok(Fmt.pct(0.123) == "+12.3%" and Fmt.pct(-0.05) == "-5.0%" and Fmt.pct(0) == "0.0%", "percent format", Fmt.pct(0.123))
	ok(Fmt.duration(3700) == "1h 1m" and Fmt.duration(59) == "59s" and Fmt.duration(90061) == "1d 1h", "duration format")
	ok(Fmt.clock(65000) == "1:05" and Fmt.clock(3725000) == "1:02:05", "clock format", Fmt.clock(3725000))
	ok(Fmt.sec(0.5) == "500ms" and Fmt.sec(6.24) == "6.2s" and Fmt.sec(10) == "10s", "seconds format", Fmt.sec(6.24))
	var data := GameData.load_collections()
	var base: Dictionary = data.sets[data.order[0]]
	var f := GameData.card_filter("alakazam 1")
	var hits: Array = base.cards.filter(func(c): return f.call(c, base))
	ok(hits.size() == 1 and hits[0].name == "Alakazam", "market search by name and number", str(hits.size()))
	var g := GameData.card_filter(base.name.split(" ")[0])
	ok(base.cards.all(func(c): return g.call(c, base)), "market search by collection name")
	ok(GameData.celebration(base, base.cards[0]) == "big", "holo pull is a big reveal")
	Tutorial.set_data(GameData.read_json(GameData.content_root() + "data/tutorial.json"))
	var s := Game.new_state(data.sets, data.order, 1795800001000)
	ok(Tutorial.current_step(s) == null, "no tutorial before the shop opens")
	s.setupDone = true
	var step = Tutorial.current_step(s)
	ok(step != null and step.id == "buy", "tutorial starts at Buy a booster")
	s.stats.boostersBought = 1
	step = Tutorial.current_step(s)
	ok(step != null and step.id == "open" and "buy" in s.tutorial.done, "tutorial moves on when the step is done")
	Tutorial.skip(s)
	ok(Tutorial.current_step(s) == null and s.tutorial.skipped, "skip tutorial")
	ok(not DebugTools.check_code("") and not DebugTools.check_code("wrong code"), "debug code rejects wrong codes")
	var p := Palette.pixel_font()
	ok(p != null and p.get_string_size("Hello", HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x > 10, "pixel font builds from the sheet")
	for t in Palette.THEMES:
		Palette.use(t)
	ok(Palette.c.has("accent") and Palette.dark, "11 themes load", str(Palette.THEMES.size()))
	Palette.font = null
