class_name ShopFloor
extends Control
## Shop floor (port of js/scene.js, docs/sdd/shop-floor.md): a small pixel
## view of the shop built from the hand-drawn sheet art/sheets/shop.png.
## Purely visual: the rules report each customer visit through
## Game.customer_listener and this only draws it. Offline catch-up never
## reaches it.

const H := 112
const SPRITE := Vector2(16, 32)
const SHEETS := 12
const SPEED := 42.0
const DOOR := Vector2(20, 50)
const LANE_Y := 96.0
const LOOK_Y := 84.0

var on_paid: Callable = Callable()
var sheet: Texture2D
var rects := {}
var people: Array = []
var customers: Array = []
var _draw_acc := 0.0
var _cap := 1


func _init() -> void:
	custom_minimum_size = Vector2(0, H)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sheet = load("res://art/sheets/shop.png")
	rects = JSON.parse_string(FileAccess.get_file_as_string("res://art/sheets/shop.json"))
	for i in range(1, SHEETS + 1):
		customers.append(load("res://art/sheets/customers/customer-%d.png" % i))


func W() -> float:
	return clampf(size.x, 200, 640)


func _reduced() -> bool:
	return bool(App.prefs.get("reduceMotion", false))


func _max_on_floor() -> int:
	return clampi(int(W() / 48), 5, 10)


## One customer visit from the rules: { looks: [{ s, c, p, f, b, paid }], miss, empty }.
func customer(ev: Dictionary) -> bool:
	var bought: Array = ev.looks.filter(func(l): return l.b)
	var paid := 0.0
	for l in bought:
		paid += l.paid
	if people.size() >= _max_on_floor():
		if bought.is_empty():
			return false
		var idx := -1
		for i in people.size():
			if not people[i].paid and people[i].phase != "out":
				idx = i
				break
		if idx < 0:
			if on_paid.is_valid():
				on_paid.call(paid)
			return false
		people.remove_at(idx)
	var look_at = bought[0] if bought.size() else (ev.looks.back() if ev.looks.size() else null)
	var text: String
	var happy := false
	if ev.get("miss"):
		var st = App.sets.get(ev.miss)
		text = "No %s?" % (st.name if st else "new set")
	elif ev.get("empty") or look_at == null:
		text = Strings.FLOOR_EMPTY
	elif bought.size():
		text = Strings.BOUGHT[look_at.f]
		happy = true
	else:
		text = Strings.PASSED[look_at.f]
	var spot := _free_spot(null)
	var lane := LANE_Y + roundf(randf_range(-3, 3))
	var look: float = LOOK_Y + roundf(randf_range(-1, 1)) + int(spot.row) * 9
	var p := {
		"sheet": randi() % SHEETS, "x": DOOR.x, "y": DOOR.y, "dir": 0, "t": 0.0, "frac": spot.frac, "row": spot.row,
		"look": look, "lane": lane, "speed": SPEED * randf_range(0.75, 1.2), "delay": randf_range(0, 1.6),
		"browse": randf_range(1, 3.5), "moves": 1 if randf() < 0.45 else 0,
		"path": [{"x": DOOR.x, "y": lane}, {"frac": spot.frac, "y": lane}, {"frac": spot.frac, "y": look}],
		"phase": "in", "wait": 0.0, "text": text, "happy": happy, "feeling": look_at.f if look_at else "",
		"paid": paid, "n": bought.size(), "walking": false,
	}
	if _reduced():
		p.x = _spot_x(spot.frac)
		p.y = LOOK_Y
		p.path = []
		p.delay = 0.0
		p.moves = 0
	people.append(p)
	return true


## Moves everyone forward; main calls it every frame so the floor keeps
## going while another tab is open (scene.js).
func advance(delta: float) -> void:
	var dt := minf(60.0, delta)
	while dt > 0 and people.size():
		var s := minf(0.1, dt)
		dt -= s
		for p in people:
			_step(p, s)
		for i in range(people.size() - 1, -1, -1):
			if people[i].phase == "gone":
				people.remove_at(i)
	_draw_acc += delta
	if is_visible_in_tree() and _draw_acc >= 0.033:
		_draw_acc = 0.0
		queue_redraw()


func _free_spot(skip) -> Dictionary:
	var span := _spot_x(1) - _spot_x(0)
	if span == 0:
		span = 1
	var others: Array = people.filter(func(o): return o != skip and o.phase != "out" and o.frac != null)
	var best := {"frac": randf(), "row": 0}
	var best_gap := -1.0
	for row in [0, 1]:
		var taken: Array = others.filter(func(o): return int(o.row) == row).map(func(o): return o.frac)
		for i in 8:
			var f := randf_range(-0.08, 1.08)
			var gap := 999.0
			if taken.size():
				gap = INF
				for t in taken:
					gap = minf(gap, absf(t - f))
				gap *= span
			var score := gap - 10 if row else gap
			if score > best_gap:
				best = {"frac": f, "row": row}
				best_gap = score
		if best_gap >= 14:
			break
	return best


func _someone_talking(p: Dictionary) -> bool:
	for o in people:
		if o != p and o.phase == "talk" and absf(o.x - p.x) < 40:
			return true
	return false


func _case_rect() -> Rect2:
	var lvl: int = int(App.state.upgrades.get("showcase", 0)) if App.state else 0
	var w := minf(W() - 120, 76 + lvl * 8)
	w = floorf(w / 8) * 8
	return Rect2(roundf(56 + (W() - 112 - w) / 2), 46, w, 26)


func _spot_x(frac: float) -> float:
	var c := _case_rect()
	return c.position.x + 8 + frac * maxf(4, c.size.x - 16)


func _step(p: Dictionary, dt: float) -> void:
	if p.delay > 0:
		p.delay -= dt
		return
	p.t += dt
	if p.path.size():
		var tgt: Dictionary = p.path[0]
		if tgt.has("frac"):
			tgt.x = _spot_x(tgt.frac)
		var dx: float = tgt.x - p.x
		var dy: float = tgt.y - p.y
		var d := sqrt(dx * dx + dy * dy)
		var move: float = p.speed * dt
		if absf(dx) > absf(dy):
			p.dir = 3 if dx > 0 else 2
		else:
			p.dir = 0 if dy > 0 else 1
		if d <= move:
			p.x = tgt.x
			p.y = tgt.y
			p.path.pop_front()
		else:
			p.x += dx / d * move
			p.y += dy / d * move
		p.walking = true
		return
	p.walking = false
	p.wait += dt
	if p.phase == "in":
		p.phase = "look"
		p.wait = 0.0
		p.dir = 1
	elif p.phase == "look":
		p.dir = (3 if p.frac < 0.5 else 2) if int(floor(p.t * 0.9 + p.frac * 7)) % 5 == 0 else 1
		if p.wait < p.browse:
			return
		if p.moves > 0:
			p.moves -= 1
			p.wait = 0.0
			p.browse = randf_range(0.8, 2)
			var spot := _free_spot(p)
			p.frac = spot.frac
			p.row = spot.row
			p.look = LOOK_Y + roundf(randf_range(-1, 1)) + spot.row * 9
			p.path = [{"frac": p.frac, "y": p.look}]
			return
		if _someone_talking(p):
			return
		p.phase = "talk"
		p.wait = 0.0
		p.dir = 0
	elif p.phase == "talk" and p.wait > 1.8:
		p.phase = "react"
		p.wait = 0.0
		if p.paid and on_paid.is_valid():
			on_paid.call(p.paid)
	elif p.phase == "react" and p.wait > 1.3:
		p.phase = "out"
		p.wait = 0.0
		if _reduced():
			p.phase = "gone"
			return
		p.path = [{"x": p.x, "y": p.lane}, {"x": DOOR.x, "y": p.lane}, {"x": DOOR.x, "y": DOOR.y}]
	elif p.phase == "out":
		p.phase = "gone"


# ---------- Drawing ----------

func _r(name: String) -> Rect2:
	var a: Array = rects[name]
	return Rect2(a[0], a[1], a[2], a[3])


func _spr(name: String, pos: Vector2, mod := Color.WHITE) -> void:
	var r := _r(name)
	draw_texture_rect_region(sheet, Rect2(pos.floor(), r.size), r, mod)


## Repeats a sprite over an area, cropping the last row and column.
func _tile(name: String, area: Rect2, mod := Color.WHITE) -> void:
	var r := _r(name)
	var y := area.position.y
	while y < area.end.y:
		var h := minf(r.size.y, area.end.y - y)
		var x := area.position.x
		while x < area.end.x:
			var w := minf(r.size.x, area.end.x - x)
			draw_texture_rect_region(sheet, Rect2(x, y, w, h), Rect2(r.position, Vector2(w, h)), mod)
			x += r.size.x
		y += r.size.y


## Nine-slice box from a small sprite with a 2 px border.
func _nine(name: String, area: Rect2) -> void:
	var r := _r(name)
	var m := 2.0
	var cs := r.size - Vector2(m, m) * 2
	var xs := [area.position.x, area.position.x + m, area.end.x - m, area.end.x]
	var ys := [area.position.y, area.position.y + m, area.end.y - m, area.end.y]
	var sx := [r.position.x, r.position.x + m, r.end.x - m, r.end.x]
	var sy := [r.position.y, r.position.y + m, r.end.y - m, r.end.y]
	for j in 3:
		for i in 3:
			var dst := Rect2(xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j])
			var src := Rect2(sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j])
			if dst.size.x > 0 and dst.size.y > 0:
				draw_texture_rect_region(sheet, dst, src)
	if cs.x <= 0:
		pass


func _draw() -> void:
	if App.state.is_empty():
		return
	var w := W()
	var x0 := floorf((size.x - w) / 2)
	draw_set_transform(Vector2(x0, 0))
	var fame: int = 0 if App.catching_up else int(App.state.upgrades.get("fame", 0))
	_room(fame, w)
	_case(w)
	var order: Array = people.filter(func(p): return not (p.delay > 0))
	order.sort_custom(func(a, b): return a.y < b.y)
	for p in order:
		_person(p)
	for p in order:
		if p.phase == "talk" or p.phase == "react":
			_bubble(p, w)
	draw_set_transform(Vector2.ZERO)


func _room(fame: int, w: float) -> void:
	_tile("wall", Rect2(0, 0, w, 52))
	_tile("trim", Rect2(0, 52, w, 4))
	var wx := w - 96
	_spr("window", Vector2(wx, 10))
	if fame >= 1:
		_spr("poster1", Vector2(48, 12))
	if fame >= 5:
		_spr("poster2", Vector2(70, 14))
	if fame >= 10:
		_spr("frame_art", Vector2(wx - 30, 12))
	_spr("door", Vector2(8, 16))
	_tile("floor", Rect2(0, 56, w, H - 56))
	if fame >= 15:
		var rug := Rect2(floorf(w / 2 - 55), 90, 110, 16)
		_tile("rug_edge", rug)
		_tile("rug", rug.grow(-2))
	if fame >= 5:
		_spr("plant", Vector2(37, 50))
	var rx := w - 44
	_spr("register", Vector2(rx, 46))
	if fame >= 12:
		var a := 92.0
		var b := wx - 36
		if b - a >= 24:
			_tile("wall_shelf", Rect2(a, 40, b - a, 2))
			var i := 0
			var x := a + 2
			while x + 8 <= b - 2:
				_spr(["box_y", "box_b", "box_g", "box_r", "box_z"][i % 5], Vector2(x, 32))
				x += 10
				i += 1
	if fame >= 14:
		_tile("lights", Rect2(4, 3, w - 8, 4))
	if fame >= 16:
		_spr("plant", Vector2(rx - 14, 50))
	if fame >= 17:
		_spr("sign", Vector2(7, 5))
	if fame >= 18:
		_spr("standee", Vector2(w - 18, 76))
	if fame >= 19:
		_spr("trophy", Vector2(rx + 30, 39))
		_tile("warm", Rect2(0, 56, w, H - 56))


func _case(_w: float) -> void:
	var c := _case_rect()
	var lvl: int = int(App.state.upgrades.get("showcase", 0))
	var shelves := 3 if lvl >= 4 else 2
	var top := c.position.y - 3
	_spr("shadow", Vector2(c.position.x + 2, c.end.y + 2))
	_tile("shadow", Rect2(c.position.x + 6, c.end.y + 2, c.size.x - 8, 3))
	_spr("case_left", Vector2(c.position.x, top))
	_tile("case_mid", Rect2(c.position.x + 8, top, c.size.x - 16, 29))
	_spr("case_right", Vector2(c.end.x - 8, top))
	# glass area: rows 3..21 of the case sprites
	var gx := c.position.x + 2
	var gy := top + 3
	var gw := c.size.x - 4
	var gh := 19.0
	var per := int((gw - 2) / 5)
	var slots := per * shelves
	var items: Array = App.state.showcase
	if not App.catching_up:
		_cap = maxi(1, Game.showcase_capacity(App.state))
	var shown := mini(slots, ceili(items.size() / float(_cap) * slots))
	var shelf_h := floorf(gh / shelves)
	for i in shown:
		var row := i / per
		var col := i % per
		var it: Dictionary = items[int(floor(i / float(maxi(1, shown)) * items.size()))] if items.size() else {}
		var color := Color("#999999")
		if it.size() and App.sets.has(it.s) and App.sets[it.s].by_id.has(it.c):
			var st: Dictionary = App.sets[it.s]
			color = Color(st.rarities[st.by_id[it.c].rarity].color)
		var p := Vector2(gx + 2 + col * 5, gy + 1 + row * shelf_h)
		_spr("card", p)
		_spr("card_mark", p + Vector2(1, 1), color)
	for r in range(1, shelves):
		_tile("case_shelf", Rect2(gx, gy + r * shelf_h - 1, gw, 1))
	_tile("case_glass", Rect2(gx, gy, gw, gh))
	_spr("case_glint", Vector2(gx + 1, gy))


func _person(p: Dictionary) -> void:
	var tex: Texture2D = customers[p.sheet]
	var col := 0
	var row: int = p.dir
	if p.walking:
		col = int(floor(p.t * 8)) % 4
	if p.phase == "react":
		row = 4
		var alt := 0 if _reduced() else int(floor(p.wait * 4)) % 2
		col = alt if p.happy else 2 + alt
	var pos := Vector2(roundf(p.x - SPRITE.x / 2), roundf(p.y - SPRITE.y))
	_spr("shadow", pos + Vector2(3, SPRITE.y - 2))
	draw_texture_rect_region(tex, Rect2(pos, SPRITE), Rect2(Vector2(col, row) * SPRITE, SPRITE))
	if p.phase == "react":
		_spr("heart" if p.happy else "cloud", pos + Vector2(5, -7))
		if p.paid:
			_paid(p, pos)


func _paid(p: Dictionary, pos: Vector2) -> void:
	var font := Palette.pixel_font()
	var rise := 0.0 if _reduced() else minf(8, p.wait * 10)
	var text := "+$%.2f%s" % [p.paid, " (%d)" % p.n if p.n > 1 else ""]
	var tw := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x
	var tx := roundf(clampf(pos.x + 8 - tw / 2, 1, W() - tw - 1))
	var ty := roundf(pos.y - 14 - rise)
	for d in [Vector2(-1, 0), Vector2(1, 0), Vector2(0, -1), Vector2(0, 1)]:
		draw_string(font, Vector2(tx, ty) + d, text, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color("#2a1f1a"))
	draw_string(font, Vector2(tx, ty), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color("#f2c14e"))


func _bubble(p: Dictionary, w: float) -> void:
	var font := Palette.pixel_font()
	var tw := font.get_string_size(p.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 9).x
	var bw := tw + 8
	var bh := 13.0
	var x := clampf(roundf(p.x - bw / 2), 1, w - bw - 1)
	var y := maxf(1, roundf(p.y - SPRITE.y - bh - 4))
	_nine("bubble", Rect2(x, y, bw, bh))
	var tx := roundf(clampf(p.x - 2, x + 2, x + bw - 7))
	_spr("bubble_tail", Vector2(tx, y + bh - 1))
	var col := Color("#3d7a3a") if p.happy else (Color("#a8473a") if p.feeling == "steep" or p.feeling == "pricey" else Color("#2a1f1a"))
	draw_string(font, Vector2(x + 4, y + 10), p.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, col)
