class_name CardTilt
extends Control
## Big card in the card detail that turns toward the mouse (a 3D tilt drawn in
## 2D). The card is drawn once into its own SubViewport at RENDER_SCALE, then
## shown through card_tilt.gdshader. `tilt` (-1..1 per axis) is the current
## angle; `card_view` is the card inside the viewport. Reduce motion: no tilt.
## The scan is drawn by its own CardView (`scan`) under `card_view`, so the
## rarity foil (foil.gd) shines on the card and not on its badges.

const RENDER_SCALE := 4
const FOLLOW := 10.0 # how fast the card follows the mouse

var card_view: CardView
var scan: CardView
var face: TextureRect
var tilt := Vector2.ZERO
var _vp: SubViewport
var _mat: ShaderMaterial
var _foil: ShaderMaterial
var _foil_mode := 0


func setup(s: Dictionary, c: Dictionary) -> CardTilt:
	var sz: Vector2 = CardView.SIZES.lg
	custom_minimum_size = sz
	mouse_filter = Control.MOUSE_FILTER_PASS
	_vp = SubViewport.new()
	_vp.transparent_bg = true
	_vp.size = Vector2i(sz * RENDER_SCALE)
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_vp.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	scan = CardView.new().setup(s, c, "lg")
	scan.part = "scan"
	_foil = Foil.material_for(s, c)
	if _foil:
		_foil_mode = Foil.mode_of(c.rarity)
		scan.material = _foil
	card_view = CardView.new().setup(s, c, "lg")
	card_view.part = "overlay"
	for v in [scan, card_view]:
		v.scale = Vector2.ONE * RENDER_SCALE
		v.size = sz
		_vp.add_child(v)
	add_child(_vp)
	face = TextureRect.new()
	face.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	face.stretch_mode = TextureRect.STRETCH_SCALE
	face.size = sz
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	face.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_mat = ShaderMaterial.new()
	_mat.shader = preload("res://shaders/card_tilt.gdshader")
	_mat.set_shader_parameter("size", sz)
	face.material = _mat
	add_child(face)
	return self


func _ready() -> void:
	face.texture = _vp.get_texture()


func _process(delta: float) -> void:
	var want := Vector2.ZERO
	var calm: bool = App.prefs.get("reduceMotion", false)
	if not calm:
		var m := get_local_mouse_position()
		if Rect2(Vector2.ZERO, size).grow(24).has_point(m):
			want = ((m / size) * 2.0 - Vector2.ONE).clamp(-Vector2.ONE, Vector2.ONE)
	tilt = tilt.lerp(want, 1.0 - exp(-FOLLOW * delta))
	_mat.set_shader_parameter("tilt", tilt)
	if _foil:
		# no foil on a generic card (scan missing or still loading)
		var has_scan := CardImages.inst != null and CardImages.inst.get_tex(scan.card.image, true) != null
		_foil.set_shader_parameter("mode", _foil_mode if has_scan else 0)
		_foil.set_shader_parameter("tilt", tilt)
		_foil.set_shader_parameter("motion", 0.0 if calm else 1.0)
