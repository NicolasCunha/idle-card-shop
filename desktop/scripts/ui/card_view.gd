class_name CardView
extends Control
## One card (cards.js): the scan when there is one, otherwise a generic card in
## the rarity colour with its letter. Rarity is never colour alone: the letter
## is always shown. Sizes are in base pixels.

const SIZES := {"xs": Vector2(10, 14), "sm": Vector2(36, 50), "md": Vector2(50, 70), "lg": Vector2(110, 154)}

var cset: Dictionary
var card: Dictionary
var size_key := "sm"
var unseen := false
var dim := false
var count := 0 # "×n" badge when > 0
var is_new := false
var glow := 0.0 # celebration glow, 0-1
var _key := ""


func setup(s: Dictionary, c: Dictionary, sz := "sm") -> CardView:
	cset = s
	card = c
	size_key = sz
	custom_minimum_size = SIZES[sz]
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	var img: String = card.get("image", "")
	if img != "" and not unseen:
		_key = CardImages.key_of(img, sz == "lg")
	return self


func _ready() -> void:
	if CardImages.inst and _key != "":
		CardImages.inst.loaded.connect(_on_loaded)


func _on_loaded(key: String) -> void:
	if key == _key:
		queue_redraw()


func set_count(n: int) -> void:
	if n != count:
		count = n
		queue_redraw()


func _draw() -> void:
	var r := Rect2(Vector2.ZERO, size)
	var rar: Dictionary = cset.rarities[card.rarity]
	var rc := Color(rar.color)
	var font := Palette.pixel_font()
	var a := 0.45 if dim else 1.0
	var tex: Texture2D = null
	if not unseen and _key != "" and CardImages.inst:
		tex = CardImages.inst.get_tex(card.image, size_key == "lg")
	if glow > 0:
		draw_rect(r.grow(2), Color(Palette.c.accent, glow * 0.8), false, 2)
	if unseen:
		draw_rect(r, Color(Palette.c.surface2, a))
		draw_rect(r, Palette.c.border, false, 1)
		if size_key != "xs":
			_center_text(font, "?", r, Palette.c.muted)
	elif tex:
		draw_texture_rect(tex, r, false, Color(1, 1, 1, a))
		if size_key != "xs":
			_corner(font, rar, rc, a)
	else:
		draw_rect(r, Color(Palette.c.surface, a))
		draw_rect(r, Color(rc, a), false, 2 if size_key != "xs" else 1)
		if size_key == "xs":
			draw_rect(Rect2(2, 3, size.x - 4, size.y - 6), Color(rc, a * 0.6))
		else:
			var art := Rect2(3, 3, size.x - 6, size.y * 0.55)
			draw_rect(art, Color(rc, a * 0.35))
			_center_text(font, rar.short, art, Color(Palette.c.text, a))
			if size_key != "sm":
				var nm: String = card.name
				var max_w := size.x - 6
				while nm.length() > 1 and font.get_string_size(nm, HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x > max_w:
					nm = nm.substr(0, nm.length() - 1)
				draw_string(font, Vector2(3, art.end.y + 9), nm, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(Palette.c.text, a))
				draw_string(font, Vector2(3, size.y - 4), "%s %s" % [rar.short, card.get("number", "")], HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(Palette.c.muted, a))
			else:
				draw_string(font, Vector2(3, size.y - 4), rar.short, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(Palette.c.muted, a))
	if is_new:
		_badge(font, "NEW", Vector2(1, 1), Palette.c.accent, Palette.c.accent_text)
	if count > 0:
		var t := "×%d" % count
		var w := font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x + 3
		_badge(font, t, Vector2(size.x - w - 1, size.y - 11), Palette.c.text, Palette.c.bg)


func _corner(font: Font, rar: Dictionary, rc: Color, a: float) -> void:
	var t: String = rar.short
	var w := font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x + 3
	var p := Vector2(size.x - w - 1, 1)
	draw_rect(Rect2(p, Vector2(w, 10)), Color(rc, a))
	draw_string(font, p + Vector2(2, 8), t, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color(0.16, 0.12, 0.1, a))


func _badge(font: Font, t: String, p: Vector2, bg: Color, fg: Color) -> void:
	var w := font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x + 3
	draw_rect(Rect2(p, Vector2(w, 10)), bg)
	draw_string(font, p + Vector2(2, 8), t, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, fg)


func _center_text(font: Font, t: String, r: Rect2, col: Color) -> void:
	var w := font.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x
	draw_string(font, Vector2(floor(r.position.x + (r.size.x - w) / 2), floor(r.position.y + r.size.y / 2 + 3)), t, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, col)
