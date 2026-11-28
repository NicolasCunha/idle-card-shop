class_name Palette
## The 11 colour themes of the web game (css/style.css) and the Godot Theme
## built from them: flat pixel boxes, 1 px borders, the hand-drawn pixel font.

const THEMES := {
	"light": ["#f3ead8", "#fbf6ec", "#efe4cf", "#4a3a2b", "#8a7660", "#e0d1b6", "#b9852a", "#f0dcae", "#fffaf0", "#4f8a4b", "#b2584a"],
	"dark": ["#241c17", "#30261f", "#3a2e26", "#efe3cf", "#b09c83", "#4a3c31", "#dcae4b", "#5a4424", "#2a1f12", "#8cc285", "#e3907f"],
	"ocean": ["#e4eef3", "#f4f9fb", "#d6e5ec", "#24404f", "#5f7d8c", "#c3d7e0", "#2f7fa3", "#cfe6f0", "#f4fbff", "#3f8a5a", "#b3544a"],
	"lavender": ["#ece8f4", "#f8f6fc", "#e0daee", "#3b3350", "#7a7192", "#d4cce6", "#7c5fb8", "#e3d9f5", "#fbf9ff", "#4f8a4b", "#b2584a"],
	"rose": ["#f6e6e8", "#fdf5f6", "#efd7da", "#4d2e33", "#8f6a70", "#e6c8cd", "#b8576a", "#f4d3da", "#fff8f9", "#4f8a4b", "#b04646"],
	"sepia": ["#ede3cf", "#f7f0e1", "#e3d5bb", "#3f3222", "#7d6a51", "#d6c4a4", "#8c6a3a", "#e8d6b4", "#fffaf0", "#56804a", "#a8523f"],
	"mint": ["#e2f1ea", "#f4fbf7", "#d2e8dd", "#23443a", "#5c8275", "#bfdccf", "#2f9273", "#cdeee0", "#f3fffa", "#2f8a4f", "#b3544a"],
	"forest": ["#18221b", "#202d24", "#29382d", "#e2eedf", "#9cb39f", "#34473a", "#8fbf6a", "#34502f", "#14200f", "#9fd38f", "#e8957f"],
	"midnight": ["#141826", "#1c2233", "#252c40", "#e3e7f3", "#9aa3bd", "#323a52", "#7f9cf0", "#2d3a66", "#0f1526", "#8cc9a0", "#ee9a8c"],
	"ember": ["#211614", "#2c1d1a", "#382622", "#f3e2d9", "#bd9a8c", "#4a332d", "#e8814f", "#5a3022", "#26130b", "#9bcf8a", "#f0978a"],
}
const KEYS := ["bg", "surface", "surface2", "text", "muted", "border", "accent", "accent_soft", "accent_text", "up", "down"]

static var c := {} # current colours by key
static var dark := false
static var font: FontFile
static var ui_sheet: Texture2D
static var ui_rects := {}


static func resolve(name: String) -> String:
	if name == "system":
		return "dark" if DisplayServer.is_dark_mode() else "light"
	return name if THEMES.has(name) else "light"


static func use(name: String) -> void:
	var t := resolve(name)
	var row: Array = THEMES[t]
	for i in KEYS.size():
		c[KEYS[i]] = Color(row[i])
	c.danger = c.down
	dark = t in Strings.DARK_THEMES


static func icon(name: String) -> AtlasTexture:
	if ui_sheet == null:
		ui_sheet = load("res://art/sheets/ui.png")
		ui_rects = JSON.parse_string(FileAccess.get_file_as_string("res://art/sheets/ui.json"))
	var a := AtlasTexture.new()
	a.atlas = ui_sheet
	var r: Array = ui_rects[name]
	a.region = Rect2(r[0], r[1], r[2], r[3])
	return a


## The pixel font from art/sheets/font.png + font.json (drawn by hand in
## art/src/font.txt). Glyphs are white so every theme colour works.
static func pixel_font() -> FontFile:
	if font:
		return font
	var meta = JSON.parse_string(FileAccess.get_file_as_string("res://art/sheets/font.json"))
	var tex: Texture2D = load("res://art/sheets/font.png")
	var img := tex.get_image()
	if img.is_compressed():
		img.decompress()
	var h: int = meta.height
	var asc: int = meta.ascent
	var f := FontFile.new()
	f.fixed_size = h
	f.fixed_size_scale_mode = TextServer.FIXED_SIZE_SCALE_INTEGER_ONLY
	f.antialiasing = TextServer.FONT_ANTIALIASING_NONE
	f.hinting = TextServer.HINTING_NONE
	f.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
	var size := Vector2i(h, 0)
	f.set_cache_ascent(0, h, asc)
	f.set_cache_descent(0, h, h - asc)
	f.set_texture_image(0, size, 0, img)
	for key in meta.glyphs:
		var cp := int(key)
		var g: Array = meta.glyphs[key]
		f.set_glyph_advance(0, h, cp, Vector2(g[2] + 1, 0))
		f.set_glyph_offset(0, size, cp, Vector2(0, -asc))
		f.set_glyph_size(0, size, cp, Vector2(g[2], g[3]))
		f.set_glyph_uv_rect(0, size, cp, Rect2(g[0], g[1], g[2], g[3]))
		f.set_glyph_texture_idx(0, size, cp, 0)
	font = f
	return f


static func box(bg: Color, border: Color, bw := 1, pad := Vector4(3, 2, 3, 2), bottom := -1) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(bw)
	if bottom >= 0:
		s.border_width_bottom = bottom
	s.content_margin_left = pad.x
	s.content_margin_top = pad.y
	s.content_margin_right = pad.z
	s.content_margin_bottom = pad.w
	s.anti_aliasing = false
	return s


static func empty(pad := 0) -> StyleBoxEmpty:
	var s := StyleBoxEmpty.new()
	s.set_content_margin_all(pad)
	return s


static func _button(t: Theme, type: String, bg: Color, fg: Color, hover: Color, edge: Color, pad: Vector4) -> void:
	t.set_stylebox("normal", type, box(bg, edge, 1, pad, 2))
	t.set_stylebox("hover", type, box(hover, edge, 1, pad, 2))
	t.set_stylebox("pressed", type, box(hover.darkened(0.06), edge, 1, Vector4(pad.x, pad.y + 1, pad.z, pad.w - 1), 1))
	t.set_stylebox("hover_pressed", type, box(hover.darkened(0.06), edge, 1, Vector4(pad.x, pad.y + 1, pad.z, pad.w - 1), 1))
	t.set_stylebox("disabled", type, box(c.surface, c.border, 1, pad, 1))
	var focus := box(Color(0, 0, 0, 0), c.accent, 1, pad)
	focus.draw_center = false
	t.set_stylebox("focus", type, focus)
	for k in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		t.set_color(k, type, fg)
	t.set_color("font_disabled_color", type, c.muted)
	t.set_color("icon_normal_color", type, fg)
	t.set_color("icon_hover_color", type, fg)
	t.set_color("icon_pressed_color", type, fg)
	t.set_color("icon_disabled_color", type, c.muted)


static func build_theme() -> Theme:
	var t := Theme.new()
	t.default_font = pixel_font()
	t.default_font_size = 9
	var pad := Vector4(4, 2, 4, 2)
	var edge: Color = c.border.darkened(0.25) if not dark else c.border.lightened(0.15)
	_button(t, "Button", c.surface2, c.text, c.accent_soft, edge, pad)
	t.set_constant("h_separation", "Button", 2)
	t.add_type("Primary")
	t.set_type_variation("Primary", "Button")
	_button(t, "Primary", c.accent, c.accent_text, c.accent.lightened(0.12), c.accent.darkened(0.3), pad)
	t.set_type_variation("Danger", "Button")
	_button(t, "Danger", c.danger, c.accent_text if not dark else c.bg, c.danger.lightened(0.1), c.danger.darkened(0.3), pad)
	t.set_type_variation("Small", "Button")
	_button(t, "Small", c.surface2, c.text, c.accent_soft, edge, Vector4(3, 1, 3, 1))
	t.set_type_variation("Link", "Button")
	for k in ["normal", "hover", "pressed", "hover_pressed", "disabled", "focus"]:
		t.set_stylebox(k, "Link", empty(1))
	for k in ["font_color", "font_focus_color", "font_pressed_color"]:
		t.set_color(k, "Link", c.accent)
	t.set_color("font_hover_color", "Link", c.text)
	t.set_color("font_disabled_color", "Link", c.muted)
	# Tabs: flat until active.
	t.set_type_variation("Tab", "Button")
	_button(t, "Tab", c.bg, c.muted, c.surface2, c.bg, Vector4(4, 2, 4, 2))
	t.set_stylebox("normal", "Tab", box(c.bg, c.bg, 0, Vector4(4, 2, 4, 3)))
	t.set_color("font_color", "Tab", c.muted)
	t.set_color("font_hover_color", "Tab", c.text)
	t.set_type_variation("TabOn", "Button")
	_button(t, "TabOn", c.surface, c.text, c.surface, c.border, Vector4(4, 2, 4, 2))
	var on := box(c.surface, c.border, 1, Vector4(4, 2, 4, 3), 0)
	t.set_stylebox("normal", "TabOn", on)
	t.set_stylebox("hover", "TabOn", on)

	t.set_color("font_color", "Label", c.text)
	t.set_constant("line_spacing", "Label", 1)
	t.set_type_variation("Muted", "Label")
	t.set_color("font_color", "Muted", c.muted)
	t.set_type_variation("Head", "Label")
	t.set_color("font_color", "Head", c.accent if not dark else c.accent)
	t.set_type_variation("Up", "Label")
	t.set_color("font_color", "Up", c.up)
	t.set_type_variation("Down", "Label")
	t.set_color("font_color", "Down", c.down)
	t.set_type_variation("Strong", "Label")
	t.set_color("font_color", "Strong", c.text)
	t.set_color("font_outline_color", "Strong", c.text)
	t.set_constant("outline_size", "Strong", 0)

	t.set_stylebox("panel", "PanelContainer", box(c.surface, c.border, 1, Vector4(5, 4, 5, 4)))
	t.set_type_variation("Flat", "PanelContainer")
	t.set_stylebox("panel", "Flat", empty())
	t.set_type_variation("Inset", "PanelContainer")
	t.set_stylebox("panel", "Inset", box(c.surface2, c.border, 1, Vector4(3, 2, 3, 2)))
	t.set_type_variation("Modal", "PanelContainer")
	t.set_stylebox("panel", "Modal", box(c.surface, edge, 1, Vector4(8, 6, 8, 6), 2))
	t.set_type_variation("Tip", "PanelContainer")
	t.set_stylebox("panel", "Tip", box(c.accent_soft, c.accent, 1, Vector4(5, 3, 5, 3), 2))
	t.set_type_variation("Toast", "PanelContainer")
	t.set_stylebox("panel", "Toast", box(c.text, c.text, 1, Vector4(6, 3, 6, 3)))
	t.set_type_variation("Chip", "PanelContainer")
	t.set_stylebox("panel", "Chip", box(c.accent_soft, c.accent_soft, 0, Vector4(3, 0, 3, 1)))
	t.set_type_variation("Row", "PanelContainer")
	t.set_stylebox("panel", "Row", box(c.surface2, c.surface2, 0, Vector4(2, 1, 2, 1)))

	for type in ["LineEdit"]:
		t.set_stylebox("normal", type, box(c.bg, edge, 1, Vector4(3, 2, 3, 2)))
		t.set_stylebox("focus", type, box(c.bg, c.accent, 1, Vector4(3, 2, 3, 2)))
		t.set_stylebox("read_only", type, box(c.surface, c.border, 1, Vector4(3, 2, 3, 2)))
		t.set_color("font_color", type, c.text)
		t.set_color("font_placeholder_color", type, c.muted)
		t.set_color("caret_color", type, c.text)
		t.set_color("selection_color", type, c.accent_soft)
		t.set_color("font_selected_color", type, c.text)
		t.set_constant("minimum_character_width", type, 2)
	_button(t, "OptionButton", c.surface2, c.text, c.accent_soft, edge, Vector4(4, 2, 4, 2))
	t.set_icon("arrow", "OptionButton", icon("arrow_down"))
	t.set_constant("arrow_margin", "OptionButton", 3)
	t.set_constant("modulate_arrow", "OptionButton", 1)
	t.set_stylebox("panel", "PopupMenu", box(c.surface, edge, 1, Vector4(2, 2, 2, 2)))
	t.set_stylebox("hover", "PopupMenu", box(c.accent_soft, c.accent_soft, 0, Vector4(2, 0, 2, 0)))
	t.set_color("font_color", "PopupMenu", c.text)
	t.set_color("font_hover_color", "PopupMenu", c.text)
	t.set_color("font_disabled_color", "PopupMenu", c.muted)
	t.set_icon("radio_checked", "PopupMenu", icon("dot"))
	t.set_icon("radio_unchecked", "PopupMenu", PlaceholderTexture2D.new())
	t.set_icon("checked", "PopupMenu", icon("check"))
	t.set_icon("unchecked", "PopupMenu", PlaceholderTexture2D.new())
	t.set_constant("v_separation", "PopupMenu", 2)
	t.set_constant("h_separation", "PopupMenu", 3)
	t.set_constant("item_start_padding", "PopupMenu", 2)
	t.set_constant("item_end_padding", "PopupMenu", 4)

	var bar_bg := box(c.surface2, c.border, 1, Vector4(0, 0, 0, 0))
	var bar_fg := box(c.accent, c.accent, 0, Vector4(0, 0, 0, 0))
	t.set_stylebox("background", "ProgressBar", bar_bg)
	t.set_stylebox("fill", "ProgressBar", bar_fg)
	t.set_type_variation("Up", "ProgressBar")
	t.set_stylebox("fill", "Up", box(c.up, c.up, 0, Vector4()))
	t.set_type_variation("Down", "ProgressBar")
	t.set_stylebox("fill", "Down", box(c.down, c.down, 0, Vector4()))

	for type in ["VScrollBar", "HScrollBar"]:
		t.set_stylebox("scroll", type, box(c.surface2, c.surface2, 0, Vector4(2, 2, 2, 2)))
		t.set_stylebox("scroll_focus", type, box(c.surface2, c.surface2, 0, Vector4(2, 2, 2, 2)))
		t.set_stylebox("grabber", type, box(c.border.darkened(0.1) if not dark else c.border.lightened(0.2), c.border, 0, Vector4(2, 2, 2, 2)))
		t.set_stylebox("grabber_highlight", type, box(c.accent, c.accent, 0, Vector4(2, 2, 2, 2)))
		t.set_stylebox("grabber_pressed", type, box(c.accent, c.accent, 0, Vector4(2, 2, 2, 2)))
	t.set_stylebox("panel", "ScrollContainer", empty())
	t.set_stylebox("panel", "TooltipPanel", box(c.text, c.text, 1, Vector4(4, 2, 4, 3)))
	t.set_color("font_color", "TooltipLabel", c.bg)
	t.set_constant("separation", "HBoxContainer", 3)
	t.set_constant("separation", "VBoxContainer", 3)
	t.set_constant("h_separation", "GridContainer", 3)
	t.set_constant("v_separation", "GridContainer", 3)
	t.set_constant("h_separation", "HFlowContainer", 3)
	t.set_constant("v_separation", "HFlowContainer", 3)
	t.set_constant("separation", "HSeparator", 3)
	t.set_stylebox("separator", "HSeparator", box(c.border, c.border, 0, Vector4()))
	return t
