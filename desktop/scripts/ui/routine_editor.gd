class_name RoutineEditor
## Modal that builds a staff routine as a tree of steps (docs/sdd/staff-routines.md).
## Every edit re-renders the modal and keeps its scroll position.

const W := 560

static var _rid = null
static var _scroll: ScrollContainer = null


static func open(r: Dictionary) -> void:
	_rid = r.id
	_render(0)


static func _act(f: Callable) -> void:
	var at := _scroll.scroll_vertical if is_instance_valid(_scroll) else 0
	f.call()
	_render(at)


static func _render(scroll_at: int) -> void:
	var s := App.state
	var r = Routines.find(s, _rid)
	if r == null:
		App.main.close_overlay()
		return
	var name := U.edit(r.name, func(t): Routines.rename(r, str(t)), 110)
	name.max_length = Routines.NAME_MAX
	var staff: Array = Routines.staff_on(s, r).map(func(e): return e.name)
	var head := U.hbox([U.label("Routine", "Head", Strings.TIPS.routine), name, U.grow(),
		U.label(", ".join(staff) if staff.size() else "no staff", "Muted"),
		U.small("Delete", func(): App.main.confirm_box("Delete %s?" % r.name, "Delete", func():
			Routines.remove(s, r)
			App.main.redraw(true)))])
	var body := U.vbox([], 2)
	var j := Routines.jumps(r)
	for i in r.steps.size():
		body.add_child(_row(r, i, int(j.depth[i])))
	if r.steps.is_empty():
		body.add_child(U.label("no steps", "Muted"))
	var add := _add_menu(r, -1, "Add step")
	var foot := U.hbox([add, U.grow(), U.btn("Done", func(): App.main.close_overlay(), "Primary")])
	var box: PanelContainer = App.main._scroll_modal([head], body, [foot], W)
	_scroll = box.find_children("*", "ScrollContainer", true, false)[0]
	_scroll.set_deferred("scroll_vertical", scroll_at)


static func _indent(depth: int) -> Control:
	var h := U.hbox([], 0)
	for d in depth:
		var line := ColorRect.new()
		line.color = Palette.c.border
		line.custom_minimum_size = Vector2(1, 0)
		line.size_flags_vertical = Control.SIZE_EXPAND_FILL
		h.add_child(U.fixed(U.gap(1), 5))
		h.add_child(line)
		h.add_child(U.fixed(U.gap(1), 5))
	return h


static func _sets(with_any: bool) -> Array:
	var out: Array = []
	for p in Routines.PICKERS:
		if p != "@any" or with_any:
			out.append([p, Strings.PICKER_NAMES[p]])
	out.append_array(App.set_items())
	return out


static func _add_menu(r: Dictionary, at: int, text: String) -> OptionButton:
	var items: Array = [["", text]]
	for k in Routines.KINDS:
		items.append([k, Strings.STEP_NAMES[k]])
	var o := U.option(items, "", func(v):
		if v != "":
			_act(func(): Routines.add_step(App.state, r, v, at)), Strings.TIPS.stepAdd)
	o.fit_to_longest_item = false
	return o


static func _num_edit(value, cb: Callable, tip: String) -> LineEdit:
	var shown := "" if value == null else (str(int(value)) if float(value) == floorf(float(value)) else str(value))
	var e := U.edit(shown, func(t):
		var x := str(t).strip_edges()
		if x == "":
			cb.call(null)
		elif x.is_valid_float() and float(x) >= 0:
			cb.call(float(x)), 32, "rule")
	e.tooltip_text = tip
	return e


static func _row(r: Dictionary, i: int, depth: int) -> Control:
	var s := App.state
	var st: Dictionary = r.steps[i]
	var set_f := func(k: String, v): _act(func(): Routines.set_field(s, r, i, k, v))
	var row := U.hbox([U.fixed(U.right(U.label(str(i + 1), "Muted")), 14), _indent(depth)], 3)
	match st.do:
		"if":
			row.add_child(U.fixed(U.label("If", "Head"), 26))
			var conds: Array = Routines.CONDS.map(func(c): return [c, Strings.COND_NAMES[c]])
			row.add_child(U.option(conds, st.cond, func(v): set_f.call("cond", v)))
			if Routines.SET_CONDS.has(st.cond):
				row.add_child(U.option(_sets(false), st.set, func(v): set_f.call("set", v), Strings.TIPS.stepSet))
			elif st.cond == "money":
				row.add_child(U.edit(str(int(JS.num(st.val))), func(t):
					var x := str(t).strip_edges()
					if x.is_valid_float() and float(x) >= 0 and float(x) != JS.num(st.val):
						set_f.call("val", float(x)), 50))
		"else", "end":
			row.add_child(U.label(Strings.STEP_NAMES[st.do], "Head" if st.do == "else" else "Muted"))
		_:
			var kinds: Array = Routines.ACTIONS.map(func(k): return [k, Strings.STEP_NAMES[k]])
			row.add_child(U.fixed(U.option(kinds, st.do, func(v): set_f.call("do", v)), 50))
			var any: bool = st.do == "price" or st.do == "bulk"
			row.add_child(U.option(_sets(any), st.set, func(v): set_f.call("set", v), Strings.TIPS.stepSet))
			var reps: Array = Routines.REPEATS.map(func(n): return [n, Strings.REPEAT_NAMES[n]])
			row.add_child(U.option(reps, st.rep, func(v): set_f.call("rep", int(v)), Strings.TIPS.stepRep))
			if any:
				row.add_child(U.label("Keep", "Muted", Strings.TIPS.stepKeep))
				row.add_child(_num_edit(st.keep, func(v):
					if v != st.keep:
						set_f.call("keep", null if v == null else floorf(v)), Strings.TIPS.stepKeep))
			if st.do == "bulk":
				row.add_child(U.label("Below", "Muted", Strings.TIPS.stepBelow))
				row.add_child(_num_edit(st.val, func(v):
					if v != st.val:
						set_f.call("val", v), Strings.TIPS.stepBelow))
	row.add_child(U.grow())
	row.add_child(_add_menu(r, i + 1, "+"))
	var up := U.small("^", func(): _act(func(): Routines.move_step(s, r, i, -1)))
	up.disabled = i == 0
	var down := U.small("v", func(): _act(func(): Routines.move_step(s, r, i, 1)))
	down.disabled = i == r.steps.size() - 1
	row.add_child(up)
	row.add_child(down)
	row.add_child(U.small("x", func(): _act(func(): Routines.remove_step(s, r, i))))
	return row
