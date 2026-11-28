extends TabPanel
## Finances (ui.js PANELS.finances): today's income and expenses by category,
## then past days with a net bar.


func _init() -> void:
	super()
	min_render_ms = 1000


static func sum_of(o: Dictionary) -> float:
	var t := 0.0
	for k in o:
		t += o[k]
	return t


func sig() -> String:
	var L: Array = App.state.ledger
	if L.is_empty():
		return "0"
	var e: Dictionary = L.back()
	return "%d|%s|%d/%d/%d" % [L.size(), e.day, int(sum_of(e.in)), int(sum_of(e.out)), e.in.size() + e.out.size()]


func _cats(o: Dictionary, total_label: String, total: float, up: bool) -> GridContainer:
	var g := U.grid(2, [], 12)
	var rows: Array = o.keys().filter(func(k): return o[k] >= 0.005)
	rows.sort_custom(func(a, b): return o[a] > o[b])
	for k in rows:
		g.add_child(U.expand(U.label(Strings.LEDGER_CATS.get(k, k))))
		g.add_child(U.right(U.label(Fmt.money(o[k]))))
	if rows.is_empty():
		g.add_child(U.label("—", "Muted"))
		g.add_child(U.label(""))
	g.add_child(U.label(total_label, "Muted"))
	g.add_child(U.right(U.label(Fmt.money(total), "Up" if up else "Down")))
	return g


func build() -> void:
	var s := App.state
	var L: Array = s.ledger
	var today: Dictionary = L.back() if L.size() and L.back().day == s.day else {"day": s.day, "in": {}, "out": {}}
	var tin := sum_of(today.in)
	var tout := sum_of(today.out)
	var net := tin - tout
	add_child(U.hbox([U.label("Finances", "Head"), U.label(Market.day_label(s.day, s.firstDay), "Muted")]))
	var inc := U.box([U.label("Income", "Head"), _cats(today.in, "Total", tin, true)])
	var exp := U.box([U.label("Expenses", "Head"), _cats(today.out, "Total", tout, false)])
	inc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	exp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var nb := U.box([U.label("Net", "Head"), U.label(("+" if net >= 0 else "−") + Fmt.money(absf(net)), "Up" if net >= 0 else "Down")])
	nb.custom_minimum_size.x = 90
	add_child(U.hbox([inc, exp, nb], 4))
	var past: Array = L.filter(func(e): return e.day != s.day)
	past.reverse()
	var mx := 1.0
	for e in past:
		mx = maxf(mx, absf(sum_of(e.in) - sum_of(e.out)))
	var pb := U.box([U.label("Past days", "Head")])
	var g := U.grid(5, [], 10)
	for h in ["Day", "Income", "Expenses", "Net", ""]:
		g.add_child(U.label(h, "Muted"))
	for e in past:
		var i := sum_of(e.in)
		var o := sum_of(e.out)
		var n := i - o
		var tip: Array = []
		for c in e.in:
			tip.append("+%s %s" % [Fmt.money(e.in[c]), Strings.LEDGER_CATS.get(c, c)])
		for c in e.out:
			tip.append("−%s %s" % [Fmt.money(e.out[c]), Strings.LEDGER_CATS.get(c, c)])
		var day := U.label(Market.day_label(e.day, s.firstDay), "", "\n".join(tip))
		g.add_child(day)
		g.add_child(U.right(U.label(Fmt.money(i))))
		g.add_child(U.right(U.label(Fmt.money(o))))
		g.add_child(U.right(U.label(("+" if n >= 0 else "−") + Fmt.money(absf(n)), "Up" if n >= 0 else "Down")))
		var bar := U.bar("Up" if n >= 0 else "Down", 3, 80)
		bar.value = absf(n) / mx
		g.add_child(bar)
	U.inner(pb).add_child(g)
	if past.is_empty():
		U.inner(pb).add_child(U.label("No past days yet", "Muted"))
	add_child(pb)
