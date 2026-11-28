class_name TabPanel
extends VBoxContainer
## One tab (ui.js PANELS): sig() says when to rebuild, build() makes the
## controls, and the live callables patch numbers in place between rebuilds.

var S: Dictionary
var min_render_ms := 0
var _live: Array = []
var keep: Array = [] # controls reused across rebuilds (floor, search box)


func _init() -> void:
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 4)


func sig() -> String:
	return ""


func build() -> void:
	pass


func rebuild() -> void:
	S = App.state
	_live.clear()
	for c in get_children():
		remove_child(c)
		if not c in keep:
			c.queue_free()
	build()
	refresh()


func refresh() -> void:
	for f in _live:
		f.call()


func live(f: Callable) -> void:
	_live.append(f)


func live_text(l: Label, f: Callable) -> Label:
	_live.append(func():
		var t := str(f.call())
		if l.text != t:
			l.text = t)
	return l


func live_btn_text(b: Button, f: Callable) -> Button:
	_live.append(func():
		var t := str(f.call())
		if b.text != t:
			b.text = t)
	return b


func live_dis(b: BaseButton, f: Callable) -> BaseButton:
	_live.append(func(): b.disabled = bool(f.call()))
	return b


func cost_btn(b: BaseButton, cost: float) -> BaseButton:
	return live_dis(b, func(): return App.state.money < cost - 1e-9)


func live_bar(p: ProgressBar, f: Callable) -> ProgressBar:
	if p is SmoothBar:
		_live.append(func(): p.set_target(float(f.call())))
	else:
		_live.append(func(): p.value = clampf(float(f.call()), 0.0, 1.0))
	return p


func live_show(c: Control, f: Callable) -> Control:
	_live.append(func(): c.visible = bool(f.call()))
	return c
