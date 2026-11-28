class_name U
## Small helpers to build controls in code, so each tab reads like the web
## markup it replaces.

static var on_click: Callable = Callable() # click sound, set by main
static var tags := {} # tutorial target name -> Control


static func label(text: String, variation := "", tip := "") -> Label:
	var l := Label.new()
	l.text = text
	if variation != "":
		l.theme_type_variation = variation
	if tip != "":
		l.tooltip_text = tip
		l.mouse_filter = Control.MOUSE_FILTER_PASS
	return l


static func wrap(text: String, variation := "", width := 0) -> Label:
	var l := label(text, variation)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if width:
		l.custom_minimum_size.x = width
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l


static func btn(text: String, cb: Callable, variation := "", tip := "") -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	if variation != "":
		b.theme_type_variation = variation
	if tip != "":
		b.tooltip_text = tip
	b.pressed.connect(func():
		if on_click.is_valid():
			on_click.call()
		cb.call())
	return b


static func small(text: String, cb: Callable, tip := "") -> Button:
	return btn(text, cb, "Small", tip)


static func hbox(children: Array = [], sep := -1) -> HBoxContainer:
	var h := HBoxContainer.new()
	if sep >= 0:
		h.add_theme_constant_override("separation", sep)
	for c in children:
		if c:
			h.add_child(c)
	return h


static func vbox(children: Array = [], sep := -1) -> VBoxContainer:
	var v := VBoxContainer.new()
	if sep >= 0:
		v.add_theme_constant_override("separation", sep)
	for c in children:
		if c:
			v.add_child(c)
	return v


static func flow(children: Array = []) -> HFlowContainer:
	var f := HFlowContainer.new()
	for c in children:
		if c:
			f.add_child(c)
	return f


static func grid(cols: int, children: Array = [], hsep := -1) -> GridContainer:
	var g := GridContainer.new()
	g.columns = cols
	if hsep >= 0:
		g.add_theme_constant_override("h_separation", hsep)
	for c in children:
		if c:
			g.add_child(c)
	return g


static func box(children: Array = [], variation := "") -> PanelContainer:
	var p := PanelContainer.new()
	if variation != "":
		p.theme_type_variation = variation
	var v := vbox(children)
	p.add_child(v)
	return p


## The VBox inside a box() for adding more rows.
static func inner(p: PanelContainer) -> VBoxContainer:
	return p.get_child(0)


static func grow() -> Control:
	var c := Control.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


static func gap(h := 2) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(h, h)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


static func fixed(c: Control, w: int) -> Control:
	c.custom_minimum_size.x = w
	return c


static func right(l: Label) -> Label:
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	return l


static func expand(c: Control) -> Control:
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c


## Key / value line.
static func kv(key: String, value: Label, tip := "") -> HBoxContainer:
	var h := hbox([label(key, "Muted", tip), grow(), value])
	return h


static func option(items: Array, selected, cb: Callable, tip := "") -> OptionButton:
	# items: [[value, text], ...]
	var o := OptionButton.new()
	o.focus_mode = Control.FOCUS_NONE
	o.fit_to_longest_item = true
	var sel := 0
	for i in items.size():
		o.add_item(str(items[i][1]), i)
		o.set_item_metadata(i, items[i][0])
		if str(items[i][0]) == str(selected):
			sel = i
	o.select(sel)
	if tip != "":
		o.tooltip_text = tip
	o.item_selected.connect(func(i):
		if on_click.is_valid():
			on_click.call()
		cb.call(o.get_item_metadata(i)))
	return o


static func edit(text: String, cb: Callable, width := 40, placeholder := "") -> LineEdit:
	var e := LineEdit.new()
	e.text = text
	e.custom_minimum_size.x = width
	e.placeholder_text = placeholder
	e.context_menu_enabled = false
	e.text_submitted.connect(func(t):
		cb.call(t)
		e.release_focus())
	e.focus_exited.connect(func(): cb.call(e.text))
	return e


static func bar(variation := "", h := 3, w := 0) -> ProgressBar:
	var p := SmoothBar.new()
	p.show_percentage = false
	p.min_value = 0
	p.max_value = 1
	p.step = 0
	p.custom_minimum_size = Vector2(w, h)
	if variation != "":
		p.theme_type_variation = variation
	p.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	if w == 0:
		p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return p


static func sep() -> HSeparator:
	return HSeparator.new()


static func tag(node: Control, name: String) -> Control:
	tags[name] = node
	return node


## Rarity letter on its colour, so rarity never shows by colour alone.
static func rarity_tag(cset: Dictionary, card: Dictionary) -> PanelContainer:
	var r: Dictionary = cset.rarities[card.rarity]
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", Palette.box(Color(r.color), Color(r.color), 0, Vector4(2, 0, 2, 0)))
	var l := Label.new()
	l.text = r.short
	l.add_theme_color_override("font_color", Color(0.16, 0.12, 0.1))
	p.add_child(l)
	p.tooltip_text = r.name
	p.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return p


static func feeling_tag(f: String, tip := "") -> Label:
	var l := label("%s %s" % [Strings.FEEL_ICON[f], Strings.FEELING_TEXT[f]], "", tip)
	var col: Color = {"cheap": Palette.c.up, "fair": Palette.c.text, "pricey": Palette.c.accent, "steep": Palette.c.down}[f]
	l.add_theme_color_override("font_color", col)
	return l


static func signed(x: float, text: String) -> Label:
	return label(text, "Up" if x >= 0 else "Down")
