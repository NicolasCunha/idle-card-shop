extends TabPanel
## Showcase (ui.js PANELS.showcase): tagged cards grouped by card and price,
## and what customers think of the tags.


func _init() -> void:
	super()
	min_render_ms = 2000


func sig() -> String:
	var s := App.state
	return "%d|%s|%s" % [s.showcase.size(), s.day, s.showcase[0].c if s.showcase.size() else ""]


func build() -> void:
	var groups := {}
	var rows: Array = []
	for it in App.state.showcase:
		var k := "%s:%s:%s" % [it.s, it.c, it.p]
		if not groups.has(k):
			groups[k] = {"it": it, "n": 0}
			rows.append(groups[k])
		groups[k].n += 1
	rows.sort_custom(func(a, b): return a.it.p > b.it.p)
	var recall := U.btn("Recall all", func(): App.main.act(func(): Game.recall_showcase(App.state)), "", Strings.TIPS.recall)
	recall.disabled = App.state.showcase.is_empty()
	add_child(U.hbox([U.label("Showcase", "Head"), live_text(U.label("", "Muted"), func():
		return "%s / %s" % [Fmt.num(App.state.showcase.size()), Fmt.num(Game.showcase_capacity(App.state))]), U.grow(), recall]))

	var table := U.grid(7, [], 6)
	for h in ["", "Card", "#", "Collection", "Tag", "Market", "Customers"]:
		table.add_child(U.label(h, "Muted"))
	var shown := 0
	for g in rows:
		if shown >= 300:
			break
		shown += 1
		var it: Dictionary = g.it
		var st: Dictionary = App.sets[it.s]
		var c: Dictionary = st.by_id[it.c]
		var mv := Game.market_value(App.state, st, c)
		var off: float = it.p / mv - 1.0
		table.add_child(CardView.new().setup(st, c, "xs"))
		var name := U.hbox([U.rarity_tag(st, c), U.label(c.name)], 2)
		if g.n > 1:
			name.add_child(U.label("×%d" % g.n, "Muted"))
		table.add_child(name)
		table.add_child(U.right(U.label(c.number if c.number != "" else str(c.index), "Muted")))
		table.add_child(U.label(st.name, "Muted"))
		table.add_child(U.right(U.label(Fmt.money(it.p))))
		table.add_child(U.right(U.label(Fmt.money(mv), "Muted")))
		table.add_child(U.feeling_tag(Game.feeling(it.p, mv), "market" if absf(off) < 0.005 else Fmt.pct(off)))
	add_child(table)
	if rows.is_empty():
		add_child(U.label("Empty", "Muted"))

	var cust := U.box([])
	U.tag(cust, "customers")
	var cv := U.inner(cust)
	var sum := U.hbox([], 6)
	cv.add_child(U.hbox([U.label("Customers", "Head", Strings.TIPS.feelings), U.grow(), sum]))
	var list := U.vbox([], 1)
	cv.add_child(list)
	add_child(cust)
	live(func(): _feel(sum, list))


func _feel(sum: HBoxContainer, list: VBoxContainer) -> void:
	var fb := Game.feedback_summary(App.state)
	var total: Dictionary = fb.total
	var recent: Array = App.state.get("_feedback", []).slice(-12)
	recent.reverse()
	var key := str(App.state.get("_feedbackVer", 0))
	if list.get_meta("k", "") == key:
		return
	list.set_meta("k", key)
	for c in sum.get_children():
		c.queue_free()
	for c in list.get_children():
		c.queue_free()
	var looks: float = total.get("looks", 0)
	if looks:
		for f in Game.FEELINGS:
			var l := U.feeling_tag(f.key)
			l.text += " %d%%" % int(round(total.get(f.key, 0) / looks * 100))
			sum.add_child(l)
	if total.get("missed", 0):
		var m := U.label("✕ wanted new set %d%%" % int(round(total.missed / (total.missed + looks) * 100)))
		m.add_theme_color_override("font_color", Palette.c.down)
		sum.add_child(m)
	for e in recent:
		var st = App.sets.get(e.s)
		if e.get("miss"):
			if st:
				var m := U.label("✕ wanted " + st.name)
				m.add_theme_color_override("font_color", Palette.c.down)
				list.add_child(U.hbox([m, U.label("left", "Muted")]))
			continue
		if st == null or not st.by_id.has(e.c):
			continue
		var c: Dictionary = st.by_id[e.c]
		list.add_child(U.hbox([U.rarity_tag(st, c), U.label(c.name), U.label(Fmt.money(e.p)), U.feeling_tag(e.f),
			U.label("bought" if e.b else "passed", "Muted")]))
	if list.get_child_count() == 0:
		list.add_child(U.label("no customers yet", "Muted"))
