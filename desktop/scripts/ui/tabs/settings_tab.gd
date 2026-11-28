extends TabPanel
## Settings (ui.js PANELS.settings): display, sound, tutorial, save files and
## the code-locked debug menu.


func sig() -> String:
	var p := App.prefs
	return "%s|%s|%s|%s|%s|%s|%s|%s|%d|%d|%s" % [p.theme, p.reduceMotion, p.muteMaster, p.muteMusic, p.muteEffects,
		App.state.tutorial.done.size() == 0, p.debug, p.windowMode, App.state.staff.size(), App.released().size(), p.resolution]


func _toggle(text: String, on: bool, cb: Callable) -> Button:
	var b := U.btn(("✓ " if on else "· ") + text, func(): cb.call(not on))
	if on:
		b.theme_type_variation = "Primary"
	return b


func _vol(key: String, label: String) -> HBoxContainer:
	var mute_key := "mute" + key.capitalize()
	var val := U.label(str(App.prefs[key]))
	U.fixed(val, 18)
	val.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var step := func(d: int):
		App.prefs[key] = clampi(int(App.prefs[key]) + d, 0, 100)
		val.text = str(App.prefs[key])
		App.main.prefs_changed()
	return U.hbox([U.fixed(U.label(label), 44), U.small("−", func(): step.call(-10)), val, U.small("+", func(): step.call(10)),
		_toggle("Mute", App.prefs[mute_key], func(v):
			App.prefs[mute_key] = v
			App.main.prefs_changed()
			App.main.redraw(true))])


func build() -> void:
	var p := App.prefs
	var cols := U.hbox([], 4)
	var left := U.vbox([], 4)
	var right_col := U.vbox([], 4)
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cols.add_child(left)
	cols.add_child(right_col)
	add_child(cols)

	var sizes: Array = SaveData.RESOLUTIONS.map(func(r): return [r, r.replace("x", "×")])
	var res := U.option(sizes, p.resolution, func(v):
		App.prefs.resolution = v
		App.main.prefs_changed()
		App.main.apply_window())
	res.disabled = p.windowMode != "windowed"
	left.add_child(U.box([U.label("Display", "Head"),
		U.hbox([U.fixed(U.label("Theme"), 44), U.option(Strings.THEMES, p.theme, func(v):
			App.prefs.theme = v
			App.main.prefs_changed()
			App.main.apply_theme())]),
		U.hbox([U.fixed(U.label("Window"), 44), U.option([["windowed", "Windowed"], ["borderless", "Borderless"], ["fullscreen", "Fullscreen"]], p.windowMode, func(v):
			App.prefs.windowMode = v
			App.main.prefs_changed()
			App.main.apply_window()
			App.main.redraw(true))]),
		U.hbox([U.fixed(U.label("Size"), 44), res]),
		U.flow([_toggle("Reduce motion", p.reduceMotion, func(v):
			App.prefs.reduceMotion = v
			App.main.prefs_changed()
			App.main.redraw(true))])]))
	left.add_child(U.box([U.label("Sound", "Head"), _vol("master", "Master"), _vol("music", "Music"), _vol("effects", "Effects")]))
	left.add_child(U.box([U.label("Tutorial", "Head"), U.hbox([U.btn("Restart tutorial", func(): App.main.restart_tutorial())])]))
	var saved := live_text(U.label("", "Muted"), func(): return App.main.last_saved_text())
	right_col.add_child(U.box([U.label("System", "Head"), U.flow([
		U.btn("Save now", func(): App.main.save_game()),
		U.btn("Export", func(): App.main.export_save()),
		U.btn("Import", func(): App.main.import_save()),
		U.btn("Open save folder", func(): OS.shell_open(ProjectSettings.globalize_path("user://"))),
		U.btn("Reset", func(): App.main.ask_reset(), "Danger")]), saved]))
	right_col.add_child(_debug())
	right_col.add_child(U.wrap("IdleCardShop %s · %s" % [SaveData.GAME_VERSION, Strings.FOOT], "Muted"))


func _debug() -> PanelContainer:
	if not App.prefs.debug:
		var code := LineEdit.new()
		code.custom_minimum_size.x = 90
		code.secret = false
		code.context_menu_enabled = false
		var enter := func():
			if DebugTools.check_code(code.text):
				App.prefs.debug = true
				App.main.prefs_changed()
				App.main.redraw(true)
			else:
				code.text = ""
				App.main.toast(Strings.TOASTS.badCode)
		code.text_submitted.connect(func(_t): enter.call())
		return U.box([U.label("Code", "Head"), U.hbox([code, U.btn("Enter", enter)])])
	var bx := U.box([U.label("Debug", "Head")])
	var v := U.inner(bx)
	v.add_child(U.hbox([U.label("Day"), live_text(U.label(""), func(): return Market.day_label(App.state.day, App.state.firstDay)),
		live_text(U.label("", "Muted"), func(): return "+" + Fmt.duration(Game.clock_offset / 1000.0) if Game.clock_offset else "real time")]))
	v.add_child(U.flow([
		U.small("Skip 1 day", func(): App.main.debug_skip(1)),
		U.small("Skip 6 days", func(): App.main.debug_skip(6)),
		U.small("Skip to next set", func(): App.main.debug_skip(-1)),
		U.small("Release all sets", func():
			DebugTools.release_all(App.state, App.sets, App.prefs)
			App.main.prefs_changed()
			App.main.redraw(true))]))
	var money := LineEdit.new()
	money.text = str(int(App.state.money))
	money.custom_minimum_size.x = 70
	v.add_child(U.hbox([money, U.small("Set money", func(): App.main.act(func(): DebugTools.set_money(App.state, money.text)))]))
	var ids := App.released()
	var pick := {"id": ids[0]}
	var n := LineEdit.new()
	n.text = "10"
	n.custom_minimum_size.x = 30
	v.add_child(U.hbox([U.option(App.set_items(), ids[0], func(val): pick.id = val), n,
		U.small("Add boosters", func(): App.main.act(func(): DebugTools.add_boosters(App.state, App.sets[pick.id], n.text))),
		U.small("Open free", func():
			var st: Dictionary = App.sets[pick.id]
			App.main.show_bulk_result(st, DebugTools.add_cards(App.state, App.sets, st, n.text)))]))
	v.add_child(U.label("Upgrades", "Muted"))
	var g := U.grid(5, [], 4)
	for key in Game.UPGRADE_KEYS:
		var k: String = key
		g.add_child(U.label(Strings.UPGRADE_TEXT[k].name))
		g.add_child(live_text(U.label(""), func(): return "Lv %d" % (App.state.upgrades[k] + Game.UPGRADES[k].get("start", 0))))
		g.add_child(U.small("−", func(): App.main.act(func(): DebugTools.set_upgrade(App.state, k, App.state.upgrades[k] - 1))))
		g.add_child(U.small("+", func(): App.main.act(func(): DebugTools.set_upgrade(App.state, k, App.state.upgrades[k] + 1))))
		g.add_child(U.small("Max", func(): App.main.act(func(): DebugTools.set_upgrade(App.state, k, INF))))
	v.add_child(g)
	v.add_child(U.label("Staff", "Muted"))
	v.add_child(U.flow([
		U.small("Hire free", func(): App.main.act(func(): DebugTools.hire_free(App.state))),
		U.small("Max skills", func(): App.main.act(func(): DebugTools.max_skills(App.state))),
		U.small("Unlock all", func(): App.main.act(func(): DebugTools.unlock_all(App.state))),
		U.small("Hide debug", func():
			App.prefs.debug = false
			App.main.prefs_changed()
			App.main.redraw(true))]))
	return bx
