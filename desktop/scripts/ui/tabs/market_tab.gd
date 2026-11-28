extends TabPanel
## Market (ui.js PANELS.market): sealed boosters from rival shops, card news,
## and every released card with its price, changes and a 30-day line.

var search: LineEdit
var _timer: SceneTreeTimer
# Card rows, sorting, the shown page's price lines and card news are computed
# on a worker thread (thousands of cards); the tab shows the last result until
# the new one is in.
var _mutex := Mutex.new()
var _job := -1
var _job_key := ""
var _done = null # result from the worker, picked up in _process
var _result := {} # last finished result


func _init() -> void:
	super()
	search = LineEdit.new()
	search.placeholder_text = "Search"
	search.tooltip_text = Strings.TIPS.search
	search.custom_minimum_size.x = 140
	search.clear_button_enabled = true
	search.context_menu_enabled = false
	search.text_changed.connect(func(_t):
		var t := get_tree().create_timer(0.15)
		_timer = t
		t.timeout.connect(func():
			if _timer != t:
				return
			App.ui.marketQuery = search.text
			App.ui.marketPage = 0
			App.main.redraw(true)
			search.grab_focus()))
	keep.append(search)


func sig() -> String:
	var u := App.ui
	return "%s|%s|%s|%s|%s|%s|%d" % [App.state.day, u.marketSet, u.marketSort, u.marketPage, u.marketQuery, App.prefs.marketPageSize, App.lock_sig()]


func _pager(page: int, pages: int, total: int, size: int) -> HBoxContainer:
	var h := U.hbox([U.label("Per page", "Muted"), U.option(App.PAGE_SIZES.map(func(n): return [n, str(n) if n else "All"]), size, func(v):
		App.prefs.marketPageSize = int(v)
		SaveData.save_prefs(App.prefs)
		App.ui.marketPage = 0
		App.main.redraw(true)), U.grow()])
	if pages > 1:
		var prev := U.small("‹", func(): _page(page - 1))
		prev.disabled = page <= 0
		var nxt := U.small("›", func(): _page(page + 1))
		nxt.disabled = page >= pages - 1
		h.add_child(prev)
		h.add_child(U.label("%d / %d" % [page + 1, pages], "Muted"))
		h.add_child(nxt)
	else:
		h.add_child(U.label("%d cards" % total, "Muted"))
	return h


func _page(p: int) -> void:
	App.ui.marketPage = p
	App.main.redraw(true)
	App.main.scroll_top()


func _key(ids: Array) -> String:
	var u := App.ui
	return "%s|%s|%s|%s|%s|%s" % [App.state.day, u.marketSort, u.marketPage, u.marketQuery, App.prefs.marketPageSize, ids.size()]


func _process(_d: float) -> void:
	if _job == -1 or not WorkerThreadPool.is_task_completed(_job):
		return
	WorkerThreadPool.wait_for_task_completion(_job)
	_job = -1
	_mutex.lock()
	_result = _done
	_done = null
	_mutex.unlock()
	if is_visible_in_tree():
		App.main.redraw(true)


func _exit_tree() -> void:
	if _job != -1:
		WorkerThreadPool.wait_for_task_completion(_job)
		_job = -1


## Runs on a worker: reads only collection data and the Market caches (locked).
static func _compute(key: String, ids: Array, sets: Dictionary, query: String, sort: String, day: int, page: int, size: int) -> Dictionary:
	var match := GameData.card_filter(query)
	var rows: Array = []
	for id in ids:
		var st: Dictionary = sets[id]
		for c in st.cards:
			if not match.call(c, st):
				continue
			var r := {"st": st, "c": c}
			if sort != "number":
				var now := Market.market_value(st, c, day)
				r.now = now
				r.d1 = now / Market.market_value(st, c, day - 1) - 1.0
				r.d7 = now / Market.market_value(st, c, day - 7) - 1.0
			rows.append(r)
	match sort:
		"price": rows.sort_custom(func(a, b): return a.now > b.now)
		"d1": rows.sort_custom(func(a, b): return a.d1 > b.d1)
		"d7": rows.sort_custom(func(a, b): return a.d7 > b.d7)
	var pages := maxi(1, ceili(rows.size() / float(size))) if size else 1
	page = clampi(page, 0, pages - 1)
	var shown: Array = rows.slice(page * size, (page + 1) * size) if size else rows
	for r in shown:
		r.hist = Market.history(r.st, r.c, day, 30)
	var news: Array = []
	for id in ids:
		var st: Dictionary = sets[id]
		for c in st.cards:
			news.append_array(Market.news_for(st, c, day, 3))
	news.sort_custom(func(a, b): return a.day > b.day)
	return {"key": key, "shown": shown, "total": rows.size(), "pages": pages, "page": page, "news": news.slice(0, 8)}


func _start(key: String, ids: Array, size: int) -> void:
	if _job != -1:
		if _job_key == key:
			return
		WorkerThreadPool.wait_for_task_completion(_job) # finishes quickly; keeps one job at a time
		_job = -1
	_job_key = key
	var u := App.ui
	var args := [key, ids.duplicate(), App.sets, str(u.marketQuery), str(u.marketSort), int(App.state.day), int(u.marketPage), size]
	_job = WorkerThreadPool.add_task(func():
		var r: Dictionary = _compute.callv(args)
		_mutex.lock()
		_done = r
		_mutex.unlock(), false, "Market rows")


func build() -> void:
	var ui := App.ui
	var ids := App.released()
	ui.marketSet = "all"
	var day: int = App.state.day
	var sort: String = ui.marketSort
	var size: int = App.prefs.marketPageSize if int(App.prefs.marketPageSize) in App.PAGE_SIZES else 25
	var key := _key(ids)
	var ready: bool = _result.get("key", "") == key
	if not ready:
		_start(key, ids, size)
	var res: Dictionary = _result
	var shown: Array = res.get("shown", [])
	var pages: int = res.get("pages", 1)
	if ready:
		ui.marketPage = res.page

	if search.get_parent():
		search.get_parent().remove_child(search)
	add_child(U.hbox([search, U.grow(), U.label("Sort", "Muted"), U.option([["number", "Number"], ["price", "Price"], ["d1", "1 day"], ["d7", "7 days"]], sort, func(v):
		App.ui.marketSort = v
		App.ui.marketPage = 0
		App.main.redraw(true))]))

	# Boosters
	var bx := U.box([U.label("Boosters", "Head")])
	U.tag(bx, "boosters")
	var bt := U.grid(7, [], 6)
	for h in [["Collection", ""], ["Distributor", Strings.TIPS.buy], ["Market", Strings.TIPS.boosterMarket], ["7d", ""], ["Supply", Strings.TIPS.supply], ["Yours", ""], ["", ""]]:
		bt.add_child(U.label(h[0], "Muted", h[1]))
	for id in ids:
		var st: Dictionary = App.sets[id]
		bt.add_child(U.label(st.name))
		bt.add_child(live_text(U.right(U.label("", "Muted")), func():
			return "sold out" if Game.sold_out(App.state, st) else Fmt.money(Game.booster_price(App.state, st))))
		bt.add_child(live_text(U.right(U.label("")), func(): return Fmt.money(Game.market_booster_value(App.state, st))))
		var ch := U.right(U.label(""))
		live(func():
			var m := Game.supply(App.state, st)
			var v := Game.market_booster_value(App.state, st) / Supply.market_value_ago(st, m, App.state.day, 7) - 1.0
			ch.text = Fmt.pct(v)
			ch.theme_type_variation = "Up" if v >= 0 else "Down")
		bt.add_child(ch)
		bt.add_child(live_text(U.right(U.label("", "", Strings.TIPS.supply)), func():
			var m := Game.supply(App.state, st)
			return "sold out" if Game.sold_out(App.state, st) else "%s / %s" % [Fmt.num(m.left), Fmt.count(m.printed)]))
		bt.add_child(live_text(U.right(U.label("")), func(): return Fmt.num(App.state.stock.get(id, 0))))
		var buy := U.small("Buy", func(): App.main.act(func(): return Game.buy_market_booster(App.state, st), "coin"), Strings.TIPS.marketBuy)
		live_btn_text(buy, func(): return "Buy " + Fmt.money(Game.market_booster_buy_price(App.state, st)))
		live_dis(buy, func(): return not Game.can_buy_market_booster(App.state, st))
		var sell := U.small("Sell", func(): App.main.act(func(): return Game.sell_market_booster(App.state, st), "coin"), Strings.TIPS.marketSell)
		live_btn_text(sell, func(): return "Sell " + Fmt.money(Game.market_booster_sell_price(App.state, st)))
		live_dis(sell, func(): return not (float(App.state.stock.get(id, 0)) > 0))
		var sell10 := U.small("Sell 10", func(): App.main.act(func(): return Game.repeat(Game.sell_market_booster, App.state, st, 10), "coin"), Strings.TIPS.marketSell)
		live_dis(sell10, func(): return not (float(App.state.stock.get(id, 0)) > 0))
		bt.add_child(U.hbox([buy, sell, sell10], 2))
	U.inner(bx).add_child(bt)
	add_child(bx)

	# Card news
	var news: Array = res.get("news", [])
	if news.size():
		var nb := U.box([U.label("Card news", "Head")])
		for n in news:
			var parts: PackedStringArray = n.text.split("{card}")
			var line := U.hbox([], 0)
			for i in parts.size():
				if i > 0:
					var cl := U.label(n.card.name)
					cl.add_theme_color_override("font_color", Palette.c.up if n.kind == "up" else Palette.c.down)
					line.add_child(cl)
				if parts[i] != "":
					line.add_child(U.label(parts[i]))
			if ids.size() > 1:
				line.add_child(U.label("  " + n.set.name, "Muted"))
			line.add_child(U.label("  " + Market.day_label(n.day, App.state.firstDay), "Muted"))
			U.inner(nb).add_child(line)
		add_child(nb)

	var total: int = res.get("total", 0)
	var pager := _pager(ui.marketPage, pages, total, size)
	add_child(pager)
	var table := U.grid(9, [], 6)
	for h in ["", "#", "Card", "Collection", "Today", "1d", "7d", "30d", ""]:
		table.add_child(U.label(h, "Muted"))
	for r in shown:
		var st: Dictionary = r.st
		var c: Dictionary = r.c
		var hist: Array = r.hist
		var now: float = hist.back()
		var d1: float = now / hist[hist.size() - 2] - 1.0
		var d7: float = now / hist[hist.size() - 8] - 1.0
		var thumb := Button.new()
		thumb.flat = true
		thumb.focus_mode = Control.FOCUS_NONE
		thumb.add_theme_stylebox_override("normal", Palette.empty())
		thumb.add_theme_stylebox_override("hover", Palette.box(Color(0, 0, 0, 0), Palette.c.accent, 1, Vector4()))
		thumb.custom_minimum_size = CardView.SIZES.xs
		thumb.add_child(CardView.new().setup(st, c, "xs"))
		thumb.tooltip_text = c.name
		thumb.pressed.connect(func(): App.main.show_card(st, c))
		table.add_child(thumb)
		table.add_child(U.right(U.label(c.number if c.number != "" else str(c.index), "Muted")))
		var nm := U.hbox([U.rarity_tag(st, c), U.label(c.name)], 2)
		table.add_child(nm)
		table.add_child(U.label(st.name, "Muted"))
		table.add_child(U.right(U.label(Fmt.money(now))))
		table.add_child(U.right(U.signed(d1, Fmt.pct(d1))))
		table.add_child(U.right(U.signed(d7, Fmt.pct(d7))))
		table.add_child(Spark.new().setup(hist, 40, 9))
		var cost := now * Game.MARKET_BUY_RATE
		var b := U.small("Buy " + Fmt.money(cost), func(): App.main.act(func(): return Game.buy_single(App.state, App.sets, st, c), "coin"), Strings.TIPS.single)
		cost_btn(b, cost)
		table.add_child(b)
	table.modulate.a = 1.0 if ready else 0.5
	add_child(table)
	if res.is_empty():
		add_child(U.label("loading", "Muted"))
	elif shown.is_empty():
		add_child(U.label("No cards", "Muted"))
	if pages > 1:
		add_child(_pager(ui.marketPage, pages, total, size))
