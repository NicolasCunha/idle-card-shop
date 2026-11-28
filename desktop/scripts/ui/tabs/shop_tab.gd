extends TabPanel
## Shop tab (ui.js PANELS.shop): the shop floor, then the three stages of the
## loop (Distributor, Open, Price), recent log and staff.

var floor_view: Control


func sig() -> String:
	var s := App.state
	return "%s|%d|%s|%d|%d" % [s.unlocked.get("priceList", false), s.staff.size(), App.ui.shopSet, App.order.size(), App.lock_sig()]


func _st() -> Dictionary:
	return App.sets[App.released_or(App.ui.shopSet)]


func _chips(task: String) -> HFlowContainer:
	var f := U.flow()
	live(func():
		var names: Array = App.state.staff.filter(func(e): return (e.task == task or e.get("task2") == task) and not e.training).map(func(e): return [e.name, e.status])
		var key := str(names)
		if f.get_meta("k", "") == key:
			return
		f.set_meta("k", key)
		for c in f.get_children():
			c.queue_free()
		for n in names:
			var chip := PanelContainer.new()
			chip.theme_type_variation = "Chip"
			chip.tooltip_text = n[1]
			chip.add_child(U.label(n[0]))
			f.add_child(chip))
	return f


func build() -> void:
	var ui := App.ui
	ui.shopSet = App.released_or(ui.shopSet)
	var sid: String = ui.shopSet
	if floor_view:
		if not floor_view in keep:
			keep.append(floor_view)
		if floor_view.get_parent():
			floor_view.get_parent().remove_child(floor_view)
		add_child(floor_view)
	var stages := U.hbox([], 4)
	stages.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_child(stages)

	# Distributor
	var buy := U.box([U.label("Distributor", "Head")])
	U.tag(buy, "stage-buy")
	var bv := U.inner(buy)
	if App.released().size() > 1:
		bv.add_child(U.tag(U.option(App.set_items(), sid, func(v):
			App.ui.shopSet = v
			App.main.redraw(true), ""), "shop-set"))
	var price := live_text(U.label(""), func(): return Fmt.money(Game.booster_price(App.state, _st())) + " each")
	price.tooltip_text = Strings.TIPS.buy
	price.mouse_filter = Control.MOUSE_FILTER_PASS
	bv.add_child(price)
	bv.add_child(U.kv("Supply", live_text(U.label(""), func():
		var st := _st()
		return "sold out" if Game.sold_out(App.state, st) else Fmt.num(Game.supply(App.state, st).left)), Strings.TIPS.supply))
	bv.add_child(U.kv("Sealed", live_text(U.label(""), func():
		return "%s / %s%s" % [Fmt.num(Game.storage_used(App.state)), Fmt.num(Game.stock_capacity(App.state)),
			" · to warehouse" if Game.room_for(App.state) == "warehouse" else ""])))
	var nxt = Game.next_release(App.state, App.sets)
	if nxt:
		bv.add_child(U.hbox([U.label("Next set: " + nxt.name, "Muted"), U.grow(), live_text(U.label("", "Muted"), func():
			var n = Game.next_release(App.state, App.sets)
			if n == null:
				return ""
			var days: int = Supply.release_day(App.state, n) - int(App.state.day)
			return "%d days" % days if days > 1 else ("tomorrow" if days == 1 else "soon"))]))
	var buttons := U.flow()
	for n in [[1, "Buy booster"], [5, "Buy 5"], [10, "Buy 10"], [100, "Buy 100"], [0, "Buy all"]]:
		var count: int = n[0]
		var b := U.btn(n[1], func(): App.main.act_buy(_st(), count), "", Strings.TIPS.buyAll if count == 0 else "")
		live_dis(b, func():
			var st := _st()
			return Game.room_for(App.state) == "" or not Game.set_unlocked(App.state, st) or Game.sold_out(App.state, st) \
				or App.state.money < Game.booster_price(App.state, st))
		if count == 1:
			U.tag(b, "buy-1")
		buttons.add_child(b)
	bv.add_child(buttons)
	bv.add_child(_chips("buy"))
	buy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stages.add_child(buy)

	# Open
	var op := U.box([U.label("Open", "Head")])
	var ov := U.inner(op)
	var sealed := live_text(U.label(""), func(): return Fmt.num(App.state.stock.get(_st().id, 0)) + " sealed")
	sealed.tooltip_text = Strings.TIPS.open
	sealed.mouse_filter = Control.MOUSE_FILTER_PASS
	ov.add_child(sealed)
	var ob := U.flow()
	for n in [[1, "Open 1"], [10, "Open 10"], [100, "Open 100"], [0, "Open all"]]:
		var count: int = n[0]
		var b := U.btn(n[1], func(): App.main.act_open(_st(), count))
		live_dis(b, func(): return not (float(App.state.stock.get(_st().id, 0)) > 0))
		if count == 1:
			U.tag(b, "open-1")
		ob.add_child(b)
	ov.add_child(ob)
	ov.add_child(_chips("open"))
	op.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stages.add_child(op)

	# Price
	if App.state.unlocked.get("priceList", false):
		var pr := U.box([U.label("Price", "Head")])
		U.tag(pr, "stage-price")
		var pv := U.inner(pr)
		pv.add_child(live_text(U.label(""), func(): return Fmt.num(_avail()) + " in binder"))
		pv.add_child(U.kv("Showcase", live_text(U.label(""), func():
			return "%s / %s" % [Fmt.num(App.state.showcase.size()), Fmt.num(Game.showcase_capacity(App.state))]), Strings.TIPS.customers))
		pv.add_child(U.flow([
			U.option([["1", "1"], ["10", "10"], ["100", "100"], ["all", "All"]], ui.priceQty, func(v): App.ui.priceQty = v),
			U.option(App.level_items(), ui.priceLevel, func(v): App.ui.priceLevel = v, Strings.TIPS.priceLevel),
			U.option([["0", "Keep 0"], ["1", "Keep 1"]], ui.priceKeep, func(v): App.ui.priceKeep = v, Strings.TIPS.priceKeep),
		]))
		var pb := U.btn("Price", func(): App.main.act_price(), "Primary", Strings.TIPS.price)
		U.tag(pb, "price")
		live_dis(pb, func(): return _avail() == 0 or Game.free_slots(App.state) <= 0)
		var bulk := U.btn("Bulk", func(): App.main.act_bulk(), "", Strings.TIPS.bulk)
		live(func():
			var r := Game.bulk_spares(App.state, App.sets, float(App.ui.priceKeep))
			bulk.text = "Bulk " + Fmt.money(r.total) if r.n else "Bulk"
			bulk.disabled = not r.n)
		pv.add_child(U.flow([pb, bulk]))
		pv.add_child(_chips("price"))
		pr.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		stages.add_child(pr)

	# Recent and staff
	var lower := U.hbox([], 4)
	var log_box := U.box([U.label("Recent", "Head")])
	log_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var log_list := U.vbox([], 1)
	U.inner(log_box).add_child(log_list)
	live(func():
		var lines: Array = App.state.log.slice(0, 10).map(func(l): return [l.text, l.kind])
		var key := str(lines)
		if log_list.get_meta("k", "") == key:
			return
		log_list.set_meta("k", key)
		for c in log_list.get_children():
			c.queue_free()
		if lines.is_empty():
			log_list.add_child(U.label("—", "Muted"))
		for l in lines:
			log_list.add_child(U.wrap(l[0], "Muted" if l[1] == "info" else "")))
	lower.add_child(log_box)
	if App.state.staff.size():
		var sb := U.box([U.label("Staff", "Head")])
		sb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var list := U.vbox([], 1)
		U.inner(sb).add_child(list)
		for e in App.state.staff:
			var emp: Dictionary = e
			var st := U.label("", "Muted")
			live_text(st, func(): return emp.status)
			list.add_child(U.hbox([U.label(emp.name), U.label(_job_text(emp), "Muted"), U.grow(), st]))
		lower.add_child(sb)
	add_child(lower)


func _job_text(e: Dictionary) -> String:
	var parts: Array = []
	for j in Game.jobs_of(e):
		parts.append(Strings.SKILL_NAMES[j[0]] + (" " + App.sets[j[1]].name if App.sets.has(j[1]) else ""))
	return " / ".join(parts) if parts.size() else "—"


func _avail() -> int:
	var keep := float(App.ui.priceKeep)
	var n := 0.0
	for sid in App.state.binder:
		var cards: Dictionary = App.state.binder[sid]
		for cid in cards:
			if cards[cid] > keep:
				n += cards[cid] - keep
	return int(n)
