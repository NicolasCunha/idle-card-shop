extends TabPanel
## Properties (ui.js PANELS.properties): warehouses, goods kept there with the
## Keep in shop targets, and shipments on the way.

const WH_BUY := [100, 1000]


func sig() -> String:
	var p: Dictionary = App.state.properties
	return "%d|%d|%s|%d|%s" % [App.lock_sig(), Game.accessories().size(), ".".join(p.warehouses.map(func(w): return str(w.level))),
		p.ships.size(), ",".join(p.targets.keys())]


func build() -> void:
	var p: Dictionary = App.state.properties
	var has: bool = p.warehouses.size() > 0
	var head := U.hbox([U.label("Properties", "Head")])
	if has:
		head.add_child(live_text(U.label("", "Muted"), func():
			return "%s / %s" % [Fmt.count(Game.warehouse_used(App.state)), Fmt.count(Game.warehouse_capacity(App.state))]))
		head.add_child(U.label("  Fees", "Muted", Strings.TIPS.whFee))
		head.add_child(live_text(U.label(""), func(): return Fmt.money(Game.warehouse_fee_per_day(App.state)) + "/day"))
		var unpaid := live_text(U.label("", "Down"), func(): return "unpaid" if App.state.get("_feesUnpaid") else "")
		head.add_child(unpaid)
	head.add_child(U.grow())
	var buy := U.btn("Buy warehouse " + Fmt.money(Game.WAREHOUSE.cost), func(): App.main.act(func(): return Game.buy_warehouse(App.state), "coin"), "Primary")
	cost_btn(buy, Game.WAREHOUSE.cost)
	head.add_child(buy)
	add_child(head)
	if not has:
		add_child(U.label("No warehouses", "Muted"))
		return
	var whs := U.flow()
	for i in p.warehouses.size():
		var w: Dictionary = p.warehouses[i]
		var row := U.hbox([U.label("Warehouse %d" % (i + 1)), U.label("Lv %d / %d" % [w.level, Game.WAREHOUSE.maxLevel], "Muted"),
			U.label(Fmt.count(Game.WAREHOUSE.space * w.level) + " space", "Muted")])
		if w.level >= Game.WAREHOUSE.maxLevel:
			row.add_child(U.label("Max", "Muted"))
		else:
			var c := Game.upgrade_warehouse_cost(w.level)
			row.add_child(cost_btn(U.small("Upgrade " + Fmt.money(c), func(): App.main.act(func(): return Game.upgrade_warehouse(App.state, w.id), "coin")), c))
		whs.add_child(U.box([row]))
	add_child(whs)

	var gb := U.box([U.label("Goods", "Head")])
	var g := U.grid(6, [], 6)
	for h in [["Good", ""], ["Warehouse", ""], ["Shop", ""], ["On the way", ""], ["Keep in shop", Strings.TIPS.whTarget], ["", ""]]:
		g.add_child(U.label(h[0], "Muted", h[1]))
	for key in preload("res://scripts/ui/tabs/storage_tab.gd").good_keys():
		var k: String = key
		g.add_child(U.label(preload("res://scripts/ui/tabs/storage_tab.gd").good_name(k)))
		g.add_child(live_text(U.right(U.label("")), func(): return Fmt.num(Game.warehouse_owned(App.state, k))))
		g.add_child(live_text(U.right(U.label("")), func(): return Fmt.num(Game.goods_owned(App.state, k))))
		g.add_child(live_text(U.right(U.label("")), func(): return Fmt.num(Game.in_transit(App.state, k))))
		g.add_child(U.edit(str(int(p.targets.get(k, 0))), func(t):
			if t.strip_edges().is_valid_float():
				Game.set_target(App.state, k, float(t))
				App.main.redraw(), 40))
		var btns := U.hbox([], 2)
		for n in WH_BUY:
			var count: int = n
			var b := U.small("Buy " + Fmt.count(count), func(): App.main.act(func(): return Game.buy_to_warehouse(App.state, App.sets, k, count), "coin"), Strings.TIPS.whBuy)
			live_dis(b, func(): return Game.warehouse_free(App.state) < Game.good_space(k))
			btns.add_child(b)
		var store := U.small("Store all", func(): App.main.act(func(): return Game.store_in_warehouse(App.state, k, INF), "click"), Strings.TIPS.whStore)
		live_dis(store, func(): return not (Game.goods_owned(App.state, k) > 0 and Game.warehouse_free(App.state) >= Game.good_space(k)))
		var ship := U.small("Ship 100", func(): App.main.act(func(): return Game.ship_to_shop(App.state, k, 100), "click"), Strings.TIPS.whShip)
		live_dis(ship, func(): return not (Game.warehouse_owned(App.state, k) > 0 and Game.storage_free(App.state) >= Game.good_space(k)))
		btns.add_child(store)
		btns.add_child(ship)
		g.add_child(btns)
	U.inner(gb).add_child(g)
	add_child(gb)

	var sb := U.box([U.label("Shipments", "Head")])
	if p.ships.is_empty():
		U.inner(sb).add_child(U.label("None", "Muted"))
	for sh in p.ships:
		U.inner(sb).add_child(U.hbox([U.label("%s ×%s" % [preload("res://scripts/ui/tabs/storage_tab.gd").good_name(sh.g), Fmt.num(sh.n)]), U.grow(),
			U.label(Market.day_label(sh.arrive, App.state.firstDay), "Muted")]))
	add_child(sb)
