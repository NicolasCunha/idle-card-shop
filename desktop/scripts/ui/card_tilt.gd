class_name CardTilt
extends Control
## Big card in the card detail that turns toward the mouse (a 3D tilt drawn in
## 2D). The card is drawn once into its own SubViewport at RENDER_SCALE, then
## shown through card_tilt.gdshader. `tilt` (-1..1 per axis) is the current
## angle; `card_view` is the card inside the viewport. Reduce motion: no tilt.

const RENDER_SCALE := 4
const FOLLOW := 10.0 # how fast the card follows the mouse

var card_view: CardView
var face: TextureRect
var tilt := Vector2.ZERO
var _vp: SubViewport
var _mat: ShaderMaterial


func setup(s: Dictionary, c: Dictionary) -> CardTilt:
	var sz: Vector2 = CardView.SIZES.lg
	custom_minimum_size = sz
	mouse_filter = Control.MOUSE_FILTER_PASS
	_vp = SubViewport.new()
	_vp.transparent_bg = true
	_vp.size = Vector2i(sz * RENDER_SCALE)
	_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_vp.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	card_view = CardView.new().setup(s, c, "lg")
	card_view.scale = Vector2.ONE * RENDER_SCALE
	card_view.size = sz
	_vp.add_child(card_view)
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
	if not App.prefs.get("reduceMotion", false):
		var m := get_local_mouse_position()
		if Rect2(Vector2.ZERO, size).grow(24).has_point(m):
			want = ((m / size) * 2.0 - Vector2.ONE).clamp(-Vector2.ONE, Vector2.ONE)
	tilt = tilt.lerp(want, 1.0 - exp(-FOLLOW * delta))
	_mat.set_shader_parameter("tilt", tilt)
