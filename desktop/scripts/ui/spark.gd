class_name Spark
extends Control
## 30-day price line (ui.js sparkline), green going up, red going down.

var values: Array = []


func setup(v: Array, w := 40, h := 10) -> Spark:
	values = v
	custom_minimum_size = Vector2(w, h)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	return self


func _draw() -> void:
	if values.size() < 2:
		return
	var mn: float = values.min()
	var mx: float = values.max()
	var span := mx - mn if mx > mn else 1.0
	var pts := PackedVector2Array()
	for i in values.size():
		pts.append(Vector2(i * (size.x - 1) / (values.size() - 1), (size.y - 1) - (values[i] - mn) / span * (size.y - 2)))
	var up: bool = values.back() >= values[0]
	draw_polyline(pts, Palette.c.up if up else Palette.c.down, 1.0)
