extends TabPanel
## Binder (ui.js PANELS.binder): collection progress, discovery bonus and every
## card of the collection, unseen ones hidden.


func sig() -> String:
	App.ui.binderSet = App.released_or(App.ui.binderSet)
	var st: Dictionary = App.sets[App.ui.binderSet]
	return "%s|%d|%d" % [App.ui.binderSet, Game.collection_progress(App.state, st).seen, App.lock_sig()]


func build() -> void:
	var st: Dictionary = App.sets[App.ui.binderSet]
	var prog := Game.collection_progress(App.state, st)
	var bonus := Game.milestone_bonus(App.state, st)
	var nxt = null
	for m in Game.MILESTONES:
		if prog.frac < m.at:
			nxt = m
			break
	var head := U.hbox()
	if App.released().size() > 1:
		head.add_child(U.option(App.set_items(), st.id, func(v):
			App.ui.binderSet = v
			App.main.redraw(true)))
	else:
		head.add_child(U.label(st.name, "Head"))
	head.add_child(U.grow())
	var txt := ""
	if bonus:
		txt = "+%d%% sale price" % int(round(bonus * 100))
	if nxt:
		txt += (" · " if txt != "" else "") + "next at %d%%" % int(round(nxt.at * 100))
	head.add_child(U.label(txt, "Muted", Strings.TIPS.milestone))
	add_child(head)
	var bar := U.bar("", 4)
	bar.value = prog.frac
	add_child(U.hbox([bar, U.label("%d / %d" % [prog.seen, prog.total])]))

	var binder: Dictionary = App.state.binder.get(st.id, {})
	var seen: Dictionary = App.state.seen.get(st.id, {})
	var grid := HFlowContainer.new()
	grid.add_theme_constant_override("h_separation", 3)
	grid.add_theme_constant_override("v_separation", 3)
	for c in st.cards:
		var card: Dictionary = c
		var was_seen := seen.has(card.id)
		var n: int = int(binder.get(card.id, 0))
		var cv := CardView.new()
		cv.unseen = not was_seen
		cv.setup(st, card, "md")
		cv.count = n
		cv.dim = was_seen and n == 0
		var b := Button.new()
		b.flat = true
		b.focus_mode = Control.FOCUS_NONE
		b.add_theme_stylebox_override("normal", Palette.empty())
		b.add_theme_stylebox_override("hover", Palette.box(Color(0, 0, 0, 0), Palette.c.accent, 1, Vector4()))
		b.add_theme_stylebox_override("pressed", Palette.empty())
		b.custom_minimum_size = cv.custom_minimum_size
		b.disabled = not was_seen
		b.tooltip_text = "%s · %s" % [card.name, st.rarities[card.rarity].name] if was_seen else "???"
		b.add_child(cv)
		b.pressed.connect(func(): App.main.show_card(st, card))
		grid.add_child(b)
		if was_seen:
			live(func():
				var k: int = int(App.state.binder.get(st.id, {}).get(card.id, 0))
				if k != cv.count:
					cv.count = k
					cv.dim = k == 0
					cv.queue_redraw())
	add_child(grid)
