extends Control
## Root of the desktop game. S3: loading screen with steps (web 1.9.7), then an
## empty screen. Later stages add the shop floor and the tab panels here.

const BASE_SIZE := Vector2i(240, 160)
# Placeholder colours until the palette sheet (S10).
const TEXT := Color(0.29, 0.22, 0.15)
const MUTED := Color(0.55, 0.47, 0.37)
const ACCENT := Color(0.66, 0.5, 0.13)

var sets := {}
var order: Array = []
var news: Array = []
var tutorial = null
var accessories: Array = []

var _loader: Loader
var _loading: VBoxContainer
var _rows := {} # step key -> [mark Label, name Label, detail Label]
var _started_ms := 0


func _ready() -> void:
	_started_ms = Time.get_ticks_msec()
	_build_loading_screen()
	_loader = Loader.new()
	_loader.step_changed.connect(_on_step)
	_loader.finished.connect(_on_loaded)
	_loader.start()


func _process(_delta: float) -> void:
	if _loader:
		_loader.poll()


func _build_loading_screen() -> void:
	var t := Theme.new()
	t.default_font_size = 8
	theme = t
	_loading = VBoxContainer.new()
	_loading.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_loading.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_loading.grow_vertical = Control.GROW_DIRECTION_BOTH
	_loading.add_theme_constant_override("separation", 1)
	add_child(_loading)
	var title := _label(Strings.LOADING, MUTED)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_loading.add_child(title)
	for s in Strings.LOAD_STEPS:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 3)
		var mark := _label("·", MUTED)
		mark.custom_minimum_size.x = 6
		var step_name := _label(s[1], MUTED)
		var detail := _label("", MUTED)
		row.add_child(mark)
		row.add_child(step_name)
		row.add_child(detail)
		_loading.add_child(row)
		_rows[s[0]] = [mark, step_name, detail]


func _label(text: String, color: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_color_override("font_color", color)
	return l


func _on_step(key: String, status: String, detail: String) -> void:
	if not _rows.has(key):
		return
	var row: Array = _rows[key]
	row[0].text = "✓" if status == "done" else ("…" if status == "active" else "·")
	row[0].add_theme_color_override("font_color", ACCENT if status == "done" else MUTED)
	row[1].add_theme_color_override("font_color", TEXT if status != "" else MUTED)
	row[2].text = detail
	row[2].add_theme_color_override("font_color", TEXT)


func _on_loaded(ok: bool) -> void:
	sets = _loader.sets
	order = _loader.order
	news = _loader.news
	tutorial = _loader.tutorial
	accessories = _loader.accessories
	_loader = null
	if not ok:
		for c in _loading.get_children():
			c.queue_free()
		_loading.add_child(_label(Strings.LOAD_FAILED, TEXT))
		return
	# Save loading arrives in S8; until then the step completes at once.
	_on_step("save", "active", "")
	_on_step("save", "done", "")
	var cards := 0
	for id in order:
		cards += sets[id].cards.size()
	print("Loaded %d collections, %d cards, %d news, %d accessories in %d ms" % [
		order.size(), cards, news.size(), accessories.size(), Time.get_ticks_msec() - _started_ms])
	var tw := create_tween()
	tw.tween_interval(0.6)
	tw.tween_property(_loading, "modulate:a", 0.0, 0.3)
	tw.tween_callback(_loading.queue_free)
