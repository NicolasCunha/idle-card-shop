class_name Foil
extends RefCounted
## Rarity foil for the big card (card_foil.gdshader, docs/desktop/foil.md):
## holo foils only the artwork window, ex adds a faint sheen, secret adds the
## whole card, Gold Star is the fancy one. Artwork windows per card come from
## data/foil_rects.json (tools/foil_rects.py).

const MODES := {"holo": 1, "ex": 2, "secret": 3, "star": 4}
const DEFAULT_RECT := [0.09, 0.12, 0.81, 0.40]

static var _rects = null


static func mode_of(rarity: String) -> int:
	return MODES.get(rarity, 0)


## Artwork window of a card in UV (x, y, w, h); the set's first card, then a
## default, when the card is missing from the file.
static func rect_of(set_id: String, card_id: String) -> Array:
	if _rects == null:
		_rects = GameData.read_json("res://data/foil_rects.json")
		if not _rects is Dictionary:
			_rects = {}
	var rs: Dictionary = _rects.get(set_id, {})
	if rs.has(card_id):
		return rs[card_id]
	return rs.values()[0] if rs.size() else DEFAULT_RECT


## A material for the card scan, or null when the rarity has no foil.
static func material_for(s: Dictionary, c: Dictionary) -> ShaderMaterial:
	var mode := mode_of(c.rarity)
	if mode == 0 or c.get("image", "") == "":
		return null
	var r := rect_of(s.id, c.id)
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://shaders/card_foil.gdshader")
	mat.set_shader_parameter("mode", mode)
	mat.set_shader_parameter("art_rect", Vector4(r[0], r[1], r[2], r[3]))
	mat.set_shader_parameter("grid", CardView.SIZES.lg)
	return mat
