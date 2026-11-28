extends TabPanel
## Staff (ui.js PANELS.staff): hire, main and backup jobs per collection,
## skills with training, salary and firing, and the shop rules.


func sig() -> String:
	var s := App.state
	var parts: Array = [s.staff.size(), Game.max_staff(s), App.order.size(), App.lock_sig()]
	for e in s.staff:
		# Only reaching the top level changes the layout; level numbers are live.
		var lv := ".".join(Game.SKILL_KEYS.map(func(k): return "m" if e.skills[k].lvl >= Game.MAX_SKILL else ""))
		parts.append("%s/%s/%s/%s/%s/%s" % [e.task, e["set"], e.get("task2"), e.get("set2"), e.training.skill if e.training else "", lv])
	return "|".join(parts.map(func(x): return str(x)))


func _cur_job(e: Dictionary):
	var jobs := Game.jobs_of(e)
	var i: int = int(e.get("_job", 0))
	if i < jobs.size():
		return jobs[i]
	return jobs[0] if jobs.size() else null


func _job_row(e: Dictionary, slot: int) -> HBoxContainer:
	var task = e.get("task2") if slot == 2 else e.task
	var sid = e.get("set2") if slot == 2 else e["set"]
	var items: Array = [["", "None"]]
	for k in Game.SKILL_KEYS:
		items.append([k, Strings.SKILL_NAMES[k]])
	var job := U.option(items, task if task else "", func(v):
		var t = v if v != "" else null
		App.main.act(func(): Game.set_job(App.state, e, slot, t, e.get("set2") if slot == 2 else e["set"])), Strings.TIPS.jobBackup if slot == 2 else Strings.TIPS.jobMain)
	if slot == 2:
		U.tag(job, "backup-job")
	elif not U.tags.has("emp-job"):
		U.tag(job, "emp-job")
	var sets: Array = [["", "Any"]]
	sets.append_array(App.set_items())
	var cs := U.option(sets, sid if sid else "", func(v):
		var s = v if v != "" else null
		App.main.act(func(): Game.set_job(App.state, e, slot, e.get("task2") if slot == 2 else e.task, s)), Strings.TIPS.jobSet)
	cs.disabled = not task
	return U.hbox([U.fixed(U.label("Backup" if slot == 2 else "Job", "Muted"), 30), job, cs])


func build() -> void:
	U.tags.erase("emp-job")
	var s := App.state
	var cost := Game.hire_cost(s.staff.size())
	var room: bool = s.staff.size() < Game.max_staff(s)
	var head := U.hbox([U.label("Staff", "Head"), U.label("%d / %d" % [s.staff.size(), Game.max_staff(s)], "Muted")])
	if s.staff.size():
		head.add_child(U.label("  Payroll", "Muted", Strings.TIPS.salary))
		head.add_child(live_text(U.label(""), func(): return Fmt.money(Game.payroll(App.state)) + "/day"))
	head.add_child(U.grow())
	if room:
		var hb := U.btn("Hire " + Fmt.money(cost), func(): App.main.act(func(): return Game.hire(App.state) != null, "coin"), "Primary")
		cost_btn(hb, cost)
		U.tag(hb, "hire")
		head.add_child(hb)
	else:
		head.add_child(U.label("No free slot", "Muted"))
	add_child(head)

	if s.staff.is_empty():
		add_child(U.label("No staff yet", "Muted"))
	var emps := GridContainer.new()
	emps.columns = 2
	emps.add_theme_constant_override("h_separation", 4)
	emps.add_theme_constant_override("v_separation", 4)
	for emp in s.staff:
		var e: Dictionary = emp
		var bx := U.box([])
		bx.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var v := U.inner(bx)
		var status := U.label("", "Muted")
		live_text(status, func(): return "training " + Fmt.duration(e.training.left) if e.training else e.status)
		var sal := live_text(U.label("", "Muted", Strings.TIPS.salary), func(): return Fmt.money(Game.salary_per_day(App.state, e)) + "/day")
		var fire := U.small("Fire", func(): App.main.ask_fire(e), Strings.TIPS.fire)
		live_btn_text(fire, func(): return "Fire " + Fmt.money(Game.severance(App.state, e)))
		live_dis(fire, func(): return not Game.can_fire(App.state, e))
		v.add_child(U.hbox([U.label(e.name), status, U.grow(), sal, fire]))
		v.add_child(_job_row(e, 1))
		v.add_child(_job_row(e, 2))
		var pg := U.bar("", 2)
		live_bar(pg, func():
			if e.training:
				return 1.0 - e.training.left / e.training.total
			var j = _cur_job(e)
			if j and (e.status == "working" or e.status == "backup job"):
				return minf(1.0, e.progress / Game.skill_duration(j[0], e.skills[j[0]].lvl))
			return 0.0)
		v.add_child(pg)
		var sk := U.grid(5, [], 4)
		sk.tooltip_text = Strings.TIPS.skillSpeed
		for key in Game.SKILL_KEYS:
			var k: String = key
			var lvl: int = e.skills[k].lvl
			var on: bool = e.task == k or e.get("task2") == k
			sk.add_child(U.label(Strings.SKILL_NAMES[k], "" if on else "Muted"))
			sk.add_child(live_text(U.label(""), func(): return "Lv %d" % e.skills[k].lvl))
			var xp := U.bar("Up", 2, 30)
			live_bar(xp, func():
				var sv: Dictionary = e.skills[k]
				return 1.0 if sv.lvl >= Game.MAX_SKILL else sv.xp / Game.xp_to_next(sv.lvl))
			sk.add_child(xp)
			sk.add_child(live_text(U.label("", "Muted"), func(): return Fmt.sec(Game.skill_duration(k, e.skills[k].lvl))))
			if lvl >= Game.MAX_SKILL:
				sk.add_child(U.label("Max", "Muted"))
			else:
				var tb := U.small("Train " + Fmt.money(Game.train_cost(lvl)), func(): App.main.act(func(): return Game.train(App.state, e, k), "coin"))
				live_btn_text(tb, func(): return "Train " + Fmt.money(Game.train_cost(e.skills[k].lvl)))
				live_dis(tb, func(): return not Game.can_train(App.state, e, k))
				sk.add_child(tb)
		v.add_child(sk)
		emps.add_child(bx)
	add_child(emps)

	# Shop rules
	var r: Dictionary = s.rules
	var rb := U.box([U.label("Shop rules", "Head")])
	var g := U.grid(4, [], 6)
	if App.released().size() > 1:
		g.add_child(U.label("Buyer collection", "Muted"))
		g.add_child(U.option(App.set_items(), r.buySet, func(v): _rule("buySet", v)))
		g.add_child(U.label("Opener collection", "Muted"))
		g.add_child(U.option(App.set_items(), r.openSet, func(v): _rule("openSet", v)))
	for item in [["stockTarget", "Stock target"], ["cashReserve", "Cash reserve"], ["bulkBelow", "Bulk below"], ["keepCopies", "Keep copies"]]:
		var key: String = item[0]
		g.add_child(U.label(item[1], "Muted", Strings.TIPS[key]))
		g.add_child(U.edit(str(r[key]), func(t): _rule(key, t), 50))
	g.add_child(U.label("Staff price", "Muted", Strings.TIPS.priceLevel))
	g.add_child(U.option(App.level_items(), str(r.priceLevel) if r.priceLevel != 0 else "0", func(v): _rule("priceLevel", v)))
	U.inner(rb).add_child(g)
	add_child(rb)


func _rule(key: String, value) -> void:
	var r: Dictionary = App.state.rules
	if key == "priceLevel":
		var v := float(value)
		if v in Game.PRICE_LEVELS:
			r.priceLevel = v
	elif key == "buySet" or key == "openSet":
		if App.sets.has(value):
			r[key] = value
	else:
		var t := str(value).strip_edges()
		if not t.is_valid_float():
			return
		var v := float(t)
		if is_finite(v) and v >= 0:
			r[key] = v if key == "bulkBelow" else floorf(v)
	App.main.redraw()
