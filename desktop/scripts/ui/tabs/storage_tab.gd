extends TabPanel
## Storage (ui.js PANELS.storage): sealed boosters, boxes and accessories, the
## shelf customers buy from, and price tags per good.


static func good_keys() -> Array:
	var out: Array = []
	for id in App.released():
		out.append("b:" + id)
	for id in App.released():
		out.append("x:" + id)
	for a in Game.accessories():
		out.append("a:" + a.id)
	return out


static func good_name(g: String) -> String:
	var info = Game.good_info(App.sets, g)
	return info.name if info else g


static func good_price(g: String) -> float:
	var typed = App.ui.gp.get(g)
	if typed != null and float(typed) > 0:
		return float(typed)
	return round(Game.good_value(App.state, App.sets, g) * (1.0 + float(App.ui.goodLevel)) * 100.0) / 100.0


static func pct_text(p: float, v: float) -> String:
	if v <= 0:
		return ""
	return "0%" if absf(p / v - 1.0) < 0.005 else Fmt.pct(p / v - 1.0)


func sig() -> String:
	var s := App.state
	return "%s|%d|%s|%d|%d|%s" % [s.day, App.lock_sig(), App.ui.goodLevel, Game.accessories().size(), s.shelf.size(),
		";".join(s.shelf.map(func(it): return "%s@%s" % [it.g, it.p]))]


func _tile(g: String) -> PanelContainer:
	var info: Dictionary = Game.good_info(App.sets, g)
	var bx := U.box([U.label(info.name if info.kind == "a" else info.set.name)])
	bx.custom_minimum_size.x = 150
	var v := U.inner(bx)
	v.add_child(U.hbox([U.label("Yours", "Muted"), live_text(U.label(""), func(): return Fmt.num(Game.goods_owned(App.state, g))),
		U.grow(), U.label("Market", "Muted"), live_text(U.label(""), func(): return Fmt.money(Game.good_value(App.state, App.sets, g)))]))
	var pct := U.label(pct_text(good_price(g), Game.good_value(App.state, App.sets, g)), "Muted")
	var price := LineEdit.new()
	price.text = "%.2f" % good_price(g)
	price.custom_minimum_size.x = 50
	price.tooltip_text = Strings.TIPS.goodPrice
	price.context_menu_enabled = false
	price.text_changed.connect(func(t):
		App.ui.gp[g] = t
		pct.text = pct_text(float(t), Game.good_value(App.state, App.sets, g)))
	v.add_child(U.hbox([U.label("$", "Muted"), price, pct]))
	var row := U.hbox([], 2)
	for n in [[1, "List"], [10, "List 10"], [0, "List all"]]:
		var count: int = n[0]
		var b := U.small(n[1], func():
			var p := float(price.text) if price.text.is_valid_float() and float(price.text) > 0 else good_price(g)
			if Game.list_good(App.state, App.sets, g, INF if count == 0 else count, p):
				App.main.sfx("coin")
			elif Game.shelf_free(App.state) <= 0:
				App.main.toast(Strings.TOASTS.shelfFull)
			App.main.redraw())
		live_dis(b, func(): return not (Game.goods_owned(App.state, g) > 0 and Game.shelf_free(App.state) > 0))
		row.add_child(b)
	v.add_child(row)
	if info.kind == "x":
		var st: Dictionary = info.set
		var bb := U.small("Buy", func(): App.main.act(func(): return Game.buy_box(App.state, st), "coin"), Strings.TIPS.box)
		live_btn_text(bb, func(): return "Buy " + Fmt.money(Game.box_price(App.state, st)))
		live_dis(bb, func(): return not Game.can_buy_box(App.state, st))
		var ob := U.small("Open", func(): App.main.act(func(): return Game.open_box(App.state, st), "tear"), Strings.TIPS.openBox)
		live_dis(ob, func(): return not Game.can_open_box(App.state, st))
		v.add_child(U.hbox([bb, ob], 2))
	elif info.kind == "a":
		var acc: Dictionary = info.acc
		var b1 := U.small("Buy " + Fmt.money(acc.cost), func(): App.main.act(func(): return Game.buy_accessory(App.state, acc.id, 1), "coin"))
		cost_btn(b1, acc.cost)
		var b10 := U.small("Buy 10", func(): App.main.act(func(): return Game.buy_accessory(App.state, acc.id, 10), "coin"))
		cost_btn(b10, acc.cost * 10)
		v.add_child(U.hbox([b1, b10], 2))
	return bx


func build() -> void:
	var keys := good_keys()
	add_child(U.hbox([U.label("Storage", "Head"), live_text(U.label("", "Muted", Strings.TIPS.space), func():
		return "%s / %s" % [Fmt.num(Game.storage_used(App.state)), Fmt.num(Game.stock_capacity(App.state))]),
		U.grow(), U.label("Price", "Muted"), U.option(App.level_items(), App.ui.goodLevel, func(v):
			App.ui.gp = {}
			App.ui.goodLevel = v
			App.main.redraw(true))]))
	var shelf := U.box([])
	var sv := U.inner(shelf)
	var head := U.hbox([U.label("Shelf", "Head", Strings.TIPS.shelf), live_text(U.label(""), func():
		return "%s / %s" % [Fmt.num(Game.shelf_count(App.state)), Fmt.num(Game.shelf_capacity(App.state))]), U.grow()])
	if App.state.shelf.size():
		head.add_child(U.small("Recall all", func(): App.main.act(func(): Game.recall_shelf(App.state))))
	sv.add_child(head)
	if App.state.shelf.is_empty():
		sv.add_child(U.label("Empty", "Muted"))
	else:
		var g := U.grid(5, [], 8)
		for i in App.state.shelf.size():
			var idx: int = i
			var it: Dictionary = App.state.shelf[i]
			g.add_child(U.label(good_name(it.g)))
			g.add_child(live_text(U.label("", "Muted"), func(): return "×" + Fmt.num(App.state.shelf[idx].n) if idx < App.state.shelf.size() else ""))
			g.add_child(U.label(Fmt.money(it.p)))
			g.add_child(live_text(U.label("", "Muted"), func():
				return pct_text(it.p, Game.good_value(App.state, App.sets, it.g))))
			g.add_child(U.small("Recall", func(): App.main.act(func(): Game.recall_shelf_item(App.state, idx))))
		sv.add_child(g)
	add_child(shelf)
	var first := true
	for sec in [["Boosters", "b:"], ["Booster boxes", "x:"], ["Accessories", "a:"]]:
		var list: Array = keys.filter(func(k): return k.begins_with(sec[1]))
		if list.is_empty():
			continue
		var section := U.vbox([U.label(sec[0], "Head")])
		if first:
			U.tag(section, "goods")
			first = false
		var f := U.flow()
		for g in list:
			f.add_child(_tile(g))
		section.add_child(f)
		add_child(section)
