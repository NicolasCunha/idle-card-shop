class_name Opening
extends Control
## Booster opening scene (port of js/opening.js, GDD section 5). Open 1: the
## pack appears, a click tears it, the cards stack face up with the most
## common on top, each click slides the top card away, the rarest comes last
## with a celebration, then the summary. Skip jumps to the summary.

signal finished

var cset: Dictionary
var result: Array
var phase := "pack"
var idx := 0
var busy := false
var done := false
var stage: Control
var pack: Control
var cards: Array = []
var hint: Label


func setup(s: Dictionary, r: Array) -> Opening:
	cset = s
	result = r
	return self


func _reduced() -> bool:
	return bool(App.prefs.get("reduceMotion", false))


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var bg := ColorRect.new()
	bg.color = Color(0.1, 0.07, 0.05, 0.92)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	stage = Control.new()
	stage.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(stage)
	var skip := U.btn("Skip", func(): _summary())
	skip.position = Vector2(6, 6)
	add_child(skip)
	hint = Label.new()
	hint.add_theme_color_override("font_color", Color(0.94, 0.89, 0.81, 0.7))
	hint.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	hint.position.y -= 14
	hint.text = cset.name
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(hint)
	_show_pack()


func _show_pack() -> void:
	pack = Control.new()
	pack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tex := AtlasTexture.new()
	tex.atlas = load("res://art/sheets/shop.png")
	var rects = JSON.parse_string(FileAccess.get_file_as_string("res://art/sheets/shop.json"))
	var r: Array = rects.pack
	tex.region = Rect2(r[0], r[1], r[2], r[3])
	var tr := TextureRect.new()
	tr.texture = tex
	tr.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	tr.stretch_mode = TextureRect.STRETCH_SCALE
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.size = Vector2(r[2], r[3]) * 8
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pack.add_child(tr)
	pack.size = tr.size
	stage.add_child(pack)
	pack.pivot_offset = pack.size / 2
	pack.position = (get_viewport_rect().size - pack.size) / 2
	if not _reduced():
		pack.scale = Vector2(0.8, 0.8)
		pack.modulate.a = 0
		var tw := create_tween().set_parallel()
		tw.tween_property(pack, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(pack, "modulate:a", 1.0, 0.2)


func _gui_input(ev: InputEvent) -> void:
	if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
		_tap()
		accept_event()


func _unhandled_key_input(ev: InputEvent) -> void:
	if not ev.pressed:
		return
	if ev.keycode == KEY_SPACE or ev.keycode == KEY_ENTER:
		_tap()
		get_viewport().set_input_as_handled()
	elif ev.keycode == KEY_ESCAPE:
		_summary()
		get_viewport().set_input_as_handled()


func _tap() -> void:
	if phase == "pack":
		_tear()
	elif phase == "stack":
		busy = false
		_advance()


func _tear() -> void:
	phase = "tearing"
	App.main.sfx("tear")
	if _reduced():
		pack.queue_free()
	else:
		var tw := create_tween().set_parallel()
		tw.tween_property(pack, "rotation", -0.25, 0.4)
		tw.tween_property(pack, "position:y", pack.position.y - 30, 0.4)
		tw.tween_property(pack, "modulate:a", 0.0, 0.4)
		await tw.finished
		pack.queue_free()
	if done:
		return
	var center := get_viewport_rect().size / 2
	for i in range(result.size() - 1, -1, -1):
		var r: Dictionary = result[i]
		var cv := CardView.new()
		cv.setup(cset, r.card, "lg")
		cv.is_new = r.isNew
		cv.position = center - CardView.SIZES.lg / 2 + Vector2(0, -6)
		cv.pivot_offset = CardView.SIZES.lg / 2
		stage.add_child(cv)
		cards.push_front(cv)
		# Load the full scans now so each one is ready when it turns up.
		if CardImages.inst and r.card.get("image", "") != "":
			CardImages.inst.get_tex(r.card.image, true)
	if not _reduced() and cards.size():
		cards[0].scale = Vector2(0.9, 0.9)
		create_tween().tween_property(cards[0], "scale", Vector2.ONE, 0.15)
	phase = "stack"
	hint.text = "%d / %d" % [1, cards.size()]


func _advance() -> void:
	if busy or done:
		return
	if idx >= cards.size() - 1:
		_summary()
		return
	busy = true
	App.main.sfx("slide")
	var top: CardView = cards[idx]
	if _reduced():
		top.queue_free()
	else:
		var tw := create_tween().set_parallel()
		tw.tween_property(top, "position:x", top.position.x - 220, 0.22).set_ease(Tween.EASE_IN)
		tw.tween_property(top, "rotation", -0.3, 0.22)
		tw.tween_property(top, "modulate:a", 0.0, 0.22)
		tw.chain().tween_callback(top.queue_free)
	idx += 1
	hint.text = "%d / %d" % [idx + 1, cards.size()]
	var cur: CardView = cards[idx]
	var tier := GameData.celebration(cset, result[idx].card)
	if tier == "highlight":
		App.main.sfx("highlight")
		_glow(cur, 0.6)
		await get_tree().create_timer(0.0 if _reduced() else 0.3).timeout
	elif tier == "big":
		App.main.sfx("big")
		_glow(cur, 1.0)
		if not _reduced():
			var tw2 := create_tween()
			tw2.tween_property(cur, "scale", Vector2(1.08, 1.08), 0.18)
			tw2.tween_property(cur, "scale", Vector2.ONE, 0.25)
		await get_tree().create_timer(0.0 if _reduced() else 0.5).timeout
	busy = false


func _glow(cv: CardView, amount: float) -> void:
	cv.glow = amount
	cv.queue_redraw()


func _summary() -> void:
	if done:
		return
	done = true
	App.main.sfx("click")
	finished.emit()
