extends Control
## Root of the desktop game (port of js/main.js and the shell of js/ui.js):
## loading screen, save and autosave, the 4 Hz live tick, offline catch-up on
## a worker thread, the header, tabs, tutorial tip, overlays and actions.

const BASE := Vector2i(640, 360)
const TICK_S := 0.25
const AUTOSAVE_S := 10.0
const LIVE_MAX_DT := 2.0

const TABS := {
	"shop": preload("res://scripts/ui/tabs/shop_tab.gd"),
	"binder": preload("res://scripts/ui/tabs/binder_tab.gd"),
	"showcase": preload("res://scripts/ui/tabs/showcase_tab.gd"),
	"market": preload("res://scripts/ui/tabs/market_tab.gd"),
	"storage": preload("res://scripts/ui/tabs/storage_tab.gd"),
	"properties": preload("res://scripts/ui/tabs/properties_tab.gd"),
	"staff": preload("res://scripts/ui/tabs/staff_tab.gd"),
	"marketing": preload("res://scripts/ui/tabs/marketing_tab.gd"),
	"upgrades": preload("res://scripts/ui/tabs/upgrades_tab.gd"),
	"finances": preload("res://scripts/ui/tabs/finances_tab.gd"),
	"settings": preload("res://scripts/ui/tabs/settings_tab.gd"),
}
# Tutorial step -> tagged control (data/tutorial.json targets are CSS selectors
# for the web; tab targets are read from the selector itself).
const TUT_TARGETS := {
	"buy": "buy-1", "open": "open-1", "price-showcase": "price", "sale": "stage-price", "hire": "hire",
	"task": "emp-job", "backup": "backup-job", "supply": "boosters", "news": "news-btn", "shelf": "goods",
	"nextset": "shop-set", "routine": "new-routine", "routine-staff": "emp-routine",
}

var sets := {}
var order: Array = []
var news: Array = []
var tutorial = null
var accessories: Array = []
var state: Dictionary = {}
var prefs: Dictionary = {}

var _loader: Loader
var _loading: VBoxContainer
var _rows := {}
var _started_ms := 0
var _bg: ColorRect

# Shell
var _shell: VBoxContainer
var _money: Label
var _day: Label
var _awards_btn: Button
var _news_btn: Button
var _tab_bar: HBoxContainer
var _tab_btns := {}
var _scroll: ScrollContainer
var _panel_host: MarginContainer
var _panels := {}
var _active := "shop"
var _last_sig := ""
var _last_render := 0
var _tip: PanelContainer
var _tip_text: Label
var _tip_id := ""
var _hl: Control
var _hl_target: Control
var _toast: PanelContainer
var _toast_label: Label
var _toast_tw: Tween
var _overlay: Control
var _floaters: Control
var floor_view: ShopFloor
var images: CardImages
var sound: Sound

var _tick_acc := 0.0
var _save_acc := 0.0
var _shown_money := -1.0
var _money_tw: Tween
var _last_saved_ms := 0
var _pending_sale := 0.0
var _sale_timer := -1.0

# Catch-up
var _cu_thread: Thread
var _cu_total := 0
var _cu_done := 0
var _cu_before := {}
var _cu_big := false
var _cu_bar: ProgressBar
var _cu_label: Label
var _cu_after: Callable = Callable()

# News panel state
var _news_tab := "game"
var _news_more := {"game": false, "updates": false}
var _news_unread := {"inboxRead": 0, "seen": {}}
# List form
var _lf := {"key": "", "n": 1, "price": 0.0}


func _ready() -> void:
	_started_ms = Time.get_ticks_msec()
	prefs = SaveData.load_prefs()
	App.prefs = prefs
	App.main = self
	Game.clock_offset = int(prefs.get("clockOffset", 0))
	Palette.use(prefs.theme)
	theme = Palette.build_theme()
	apply_window()
	_bg = $Background
	_bg.color = Palette.c.bg
	images = CardImages.new()
	add_child(images)
	sound = Sound.new()
	add_child(sound)
	sound.set_prefs(prefs)
	U.on_click = func(): sfx("click")
	_build_loading_screen()
	_loader = Loader.new()
	_loader.step_changed.connect(_on_step)
	_loader.finished.connect(_on_loaded)
	_loader.start()
	get_tree().set_auto_accept_quit(false)


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		save_game()
		_finish_thread()
		get_tree().quit()
	elif what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		save_game()


## Static references to resources must go before the engine shuts down.
func _exit_tree() -> void:
	_finish_thread()
	for p in _panels.values():
		for k in p.keep:
			if is_instance_valid(k) and not k.is_inside_tree():
				k.free()
		if not p.is_inside_tree():
			p.free()
	_panels.clear()
	if floor_view and is_instance_valid(floor_view) and not floor_view.is_inside_tree():
		floor_view.free()
	Palette.font = null
	Palette.ui_sheet = null
	CardImages.inst = null
	App.main = null
	U.tags.clear()
	U.on_click = Callable()
	Game.customer_listener = Callable()
	Game.sale_listener = Callable()
	Game.achievement_listener = Callable()
	Game.achievement_check = Callable()


func _unhandled_key_input(ev: InputEvent) -> void:
	if ev.pressed and ev.keycode == KEY_F11:
		prefs.windowMode = "windowed" if prefs.windowMode == "fullscreen" else "fullscreen"
		prefs_changed()
		apply_window()
	elif ev.pressed and ev.keycode == KEY_ESCAPE and _overlay and _overlay.visible and _overlay.get_child_count() and not App.catching_up:
		if not (_overlay.get_child(0) is Opening) and state.get("setupDone", false):
			close_overlay()


# ---------- Loading ----------

func _build_loading_screen() -> void:
	_loading = VBoxContainer.new()
	_loading.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_loading.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_loading.grow_vertical = Control.GROW_DIRECTION_BOTH
	_loading.add_theme_constant_override("separation", 2)
	add_child(_loading)
	var title := U.label(Strings.LOADING, "Head")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_loading.add_child(title)
	for s in Strings.LOAD_STEPS:
		var mark := U.label("·", "Muted")
		mark.custom_minimum_size.x = 8
		var row := U.hbox([mark, U.label(s[1], "Muted"), U.label("", "")])
		_loading.add_child(row)
		_rows[s[0]] = row.get_children()


func _on_step(key: String, status: String, detail: String) -> void:
	if not _rows.has(key):
		return
	var row: Array = _rows[key]
	row[0].text = "✓" if status == "done" else ("…" if status == "active" else "·")
	row[0].theme_type_variation = "Head" if status == "done" else "Muted"
	row[1].theme_type_variation = "" if status != "" else "Muted"
	row[2].text = detail


func _process(delta: float) -> void:
	if _loader:
		_loader.poll()
		return
	if state.is_empty():
		return
	if App.catching_up:
		_poll_catch_up()
		return
	_tick_acc += delta
	if _tick_acc >= TICK_S:
		_tick_acc = 0.0
		_loop()
	_save_acc += delta
	if _save_acc >= AUTOSAVE_S:
		_save_acc = 0.0
		save_game()
	if _sale_timer >= 0:
		_sale_timer -= delta
		if _sale_timer < 0:
			_float_money(_pending_sale)
			_pending_sale = 0.0
	_update_highlight()
	if floor_view:
		floor_view.advance(delta)


func _on_loaded(ok: bool) -> void:
	sets = _loader.sets
	order = _loader.order
	news = _loader.news.filter(func(n): return n is Dictionary and n.get("id") and n.get("title"))
	tutorial = _loader.tutorial
	accessories = _loader.accessories
	_loader = null
	if not ok:
		for c in _loading.get_children():
			c.queue_free()
		_loading.add_child(U.label(Strings.LOAD_FAILED))
		return
	Tutorial.set_data(tutorial)
	Game.set_accessories(accessories)
	Achievements.register()
	_on_step("save", "active", "")
	var loaded = SaveData.load_local(sets, order)
	state = loaded if loaded is Dictionary else Game.new_state(sets, order, Game.now_ms())
	if prefs.get("releaseAll") != null:
		state._releaseAll = prefs.releaseAll
	Game.prepare(state, sets)
	_on_step("save", "done", "")
	App.state = state
	App.sets = sets
	App.order = order
	App.news = news
	App.ui.shopSet = order[0]
	App.ui.binderSet = order[0]
	var cards := 0
	for id in order:
		cards += sets[id].cards.size()
	print("Loaded %d collections, %d cards, %d news, %d accessories in %d ms" % [
		order.size(), cards, news.size(), accessories.size(), Time.get_ticks_msec() - _started_ms])
	_build_shell()
	sound.start()
	Game.customer_listener = func(ev): if floor_view: floor_view.customer(ev)
	Game.sale_listener = func(v): if not floor_view: _sale_feedback(v)
	Game.achievement_listener = func(name): toast("Achievement: " + name)
	var tw := create_tween()
	tw.tween_property(_loading, "modulate:a", 0.0, 0.25)
	tw.tween_callback(_loading.queue_free)
	if not state.get("setupDone", false):
		_show_setup()
	else:
		run_catch_up(Game.now_ms(), true)
	redraw(true)
	if "--shots" in OS.get_cmdline_user_args():
		_shots()
	elif "--perf" in OS.get_cmdline_user_args():
		_perf()
	elif "--shot-later" in OS.get_cmdline_user_args():
		await get_tree().create_timer(6.0).timeout
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(OS.get_environment("SHOTS_DIR").path_join("offline.png"))
		get_tree().quit()


## Screenshots of every screen for review (godot --path desktop -- --shots).
## Uses a throwaway save: run it with XDG_DATA_HOME pointing at a temp folder.
func _shots() -> void:
	var dir := OS.get_environment("SHOTS_DIR")
	if dir == "":
		dir = ProjectSettings.globalize_path("user://shots")
	DirAccess.make_dir_recursive_absolute(dir)
	var snap := func(name: String):
		await get_tree().create_timer(0.6).timeout
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(dir.path_join(name + ".png"))
	await snap.call("00-setup")
	state.setupDone = true
	state.lastTick = Game.now_ms()
	close_overlay()
	await snap.call("01-shop-new")
	Game.buy_boosters(state, sets[order[0]], 1)
	redraw(true)
	await snap.call("02-tutorial-open")
	open_one(sets[order[0]])
	await snap.call("03-opening-pack")
	_overlay.get_child(0)._tear()
	await get_tree().create_timer(0.8).timeout
	await snap.call("04-opening-stack")
	_overlay.get_child(0)._summary()
	await snap.call("05-opening-summary")
	close_overlay()
	DebugTools.set_money(state, 2000000)
	DebugTools.unlock_all(state)
	for i in 4:
		DebugTools.hire_free(state)
	for e in state.staff:
		Game.set_job(state, e, 1, "buy" if e.id % 2 else "price", null)
	DebugTools.add_cards(state, sets, sets[order[0]], 60)
	Game.price_spares(state, sets, 200, 0.0, 0.0)
	DebugTools.set_upgrade(state, "fame", 20)
	DebugTools.set_upgrade(state, "showcase", 6)
	Game.buy_warehouse(state)
	Game.start_campaign(state, "flyers")
	for i in 40:
		Game.tick(state, sets, 1, Game.now_ms())
	for i in 12:
		Game._customer_visit(state, sets)
	redraw(true)
	await get_tree().create_timer(2.5).timeout
	await snap.call("06-shop-busy")
	var res := DebugTools.add_cards(state, sets, sets[order[0]], 10)
	show_bulk_result(sets[order[0]], res)
	await snap.call("07-bulk-result")
	close_overlay()
	var n := 8
	for t in Strings.TAB_ORDER:
		switch_tab(t)
		await snap.call("%02d-tab-%s" % [n, t])
		n += 1
	show_card(sets[order[0]], sets[order[0]].cards[0])
	await snap.call("%02d-card" % n)
	n += 1
	var tilt_card: Control = _overlay.find_children("*", "CardTilt", true, false)[0]
	get_viewport().warp_mouse(tilt_card.get_global_transform_with_canvas() * Vector2(tilt_card.size.x * 0.95, tilt_card.size.y * 0.1))
	await snap.call("%02d-card-tilt" % n)
	n += 1
	show_list_form(sets[order[0]], sets[order[0]].cards[0])
	await snap.call("%02d-list-form" % n)
	n += 1
	show_news()
	await snap.call("%02d-news" % n)
	n += 1
	show_awards()
	await snap.call("%02d-awards" % n)
	n += 1
	close_overlay()
	prefs.theme = "dark"
	apply_theme()
	switch_tab("shop")
	await snap.call("%02d-shop-dark" % n)
	n += 1
	switch_tab("market")
	await snap.call("%02d-market-dark" % n)
	n += 1
	print("shots: ", dir)
	get_tree().quit()


## Frame times per tab with a busy shop (godot --path desktop -- --perf), for
## tuning. Uses a throwaway save like --shots.
func _perf() -> void:
	state.setupDone = true
	state.lastTick = Game.now_ms()
	close_overlay()
	DebugTools.set_money(state, 2e7)
	DebugTools.release_all(state, sets, prefs)
	DebugTools.unlock_all(state)
	for i in 12:
		var e = DebugTools.hire_free(state)
		if e:
			Game.set_job(state, e, 1, Game.SKILL_KEYS[i % Game.SKILL_KEYS.size()], null)
	for id in order.slice(0, 6):
		DebugTools.add_cards(state, sets, sets[id], 200)
	for t in ["shop", "staff", "market", "binder"]:
		switch_tab(t)
		await get_tree().create_timer(0.5).timeout
		rebuilds = 0
		rebuild_ms = 0.0
		var times: Array = []
		var t0 := Time.get_ticks_usec()
		for f in 1200:
			var a := Time.get_ticks_usec()
			await get_tree().process_frame
			times.append((Time.get_ticks_usec() - a) / 1000.0)
		times.sort()
		var total := (Time.get_ticks_usec() - t0) / 1e6
		printerr("perf %-7s fps %5.1f  median %5.1f ms  p95 %5.1f ms  max %5.1f ms" % [t, 1200 / total, times[600], times[1140], times[1199]])
		printerr("   rebuilds %d (%.1f ms)" % [rebuilds, rebuild_ms])
	get_tree().quit()


# ---------- Shell ----------

func _build_shell() -> void:
	_tip_id = ""
	_shell = VBoxContainer.new()
	_shell.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_shell.add_theme_constant_override("separation", 0)
	add_child(_shell)
	var header := PanelContainer.new()
	header.add_theme_stylebox_override("panel", Palette.box(Palette.c.surface, Palette.c.border, 0, Vector4(6, 3, 6, 3), 1))
	var hb := U.hbox([], 8)
	header.add_child(hb)
	hb.add_child(U.label("IdleCardShop", "Head"))
	_money = U.label("$0.00", "Strong")
	_money.tooltip_text = "Cash"
	_money.mouse_filter = Control.MOUSE_FILTER_PASS
	hb.add_child(_money)
	_day = U.label("", "Muted", Strings.TIPS.day)
	hb.add_child(_day)
	hb.add_child(U.grow())
	_awards_btn = U.small("Awards", func(): show_awards())
	hb.add_child(_awards_btn)
	_news_btn = U.small("News", func(): show_news())
	U.tag(_news_btn, "news-btn")
	hb.add_child(_news_btn)
	_shell.add_child(header)
	_tab_bar = U.hbox([], 1)
	var tabs_wrap := MarginContainer.new()
	tabs_wrap.add_theme_constant_override("margin_left", 4)
	tabs_wrap.add_theme_constant_override("margin_top", 3)
	tabs_wrap.add_child(_tab_bar)
	_shell.add_child(tabs_wrap)
	for k in Strings.TAB_ORDER:
		var key: String = k
		var b := U.btn(Strings.TABS[key], func(): switch_tab(key), "Tab")
		_tab_btns[key] = b
		_tab_bar.add_child(b)
	var body := PanelContainer.new()
	body.add_theme_stylebox_override("panel", Palette.box(Palette.c.surface, Palette.c.border, 1, Vector4(0, 0, 0, 0)))
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_shell.add_child(body)
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(_scroll)
	_panel_host = MarginContainer.new()
	_panel_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for side in ["left", "right", "top", "bottom"]:
		_panel_host.add_theme_constant_override("margin_" + side, 5)
	_scroll.add_child(_panel_host)
	floor_view = ShopFloor.new()
	floor_view.on_paid = func(v): _sale_feedback(v)

	_tip = PanelContainer.new()
	_tip.theme_type_variation = "Tip"
	_tip_text = U.label("")
	_tip_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_tip_text.custom_minimum_size.x = 260
	var skip := U.btn("Skip tutorial", func():
		Tutorial.skip(state)
		redraw(), "Link")
	_tip.add_child(U.hbox([_tip_text, skip], 6))
	_tip.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_tip.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_tip.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_tip.position.y -= 6
	_tip.visible = false
	add_child(_tip)
	_hl = Control.new()
	_hl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hl.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var hl := _hl
	_hl.draw.connect(func(): _draw_highlight(hl))
	add_child(_hl)
	_floaters = Control.new()
	_floaters.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_floaters.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_floaters)
	_toast = PanelContainer.new()
	_toast.theme_type_variation = "Toast"
	_toast_label = U.label("")
	_toast_label.add_theme_color_override("font_color", Palette.c.bg)
	_toast.add_child(_toast_label)
	_toast.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_toast.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_toast.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_toast.position.y -= 40
	_toast.modulate.a = 0
	_toast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_toast)
	_overlay = Control.new()
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.visible = false
	add_child(_overlay)


func apply_theme() -> void:
	Palette.use(prefs.theme)
	theme = Palette.build_theme()
	if _bg:
		_bg.color = Palette.c.bg
	if _shell:
		_shell.queue_free()
		_tip.queue_free()
		_hl.queue_free()
		_floaters.queue_free()
		_toast.queue_free()
		var overlay_open := _overlay.visible
		_overlay.queue_free()
		var keep_floor := floor_view
		if keep_floor.get_parent():
			keep_floor.get_parent().remove_child(keep_floor)
		_panels.clear()
		_tab_btns.clear()
		_build_shell()
		floor_view.queue_free()
		floor_view = keep_floor
		_last_sig = ""
		if overlay_open and not state.get("setupDone", false):
			_show_setup()
		redraw(true)


## Window mode and size (Settings > Display). The 640x360 canvas scales by
## whole steps and the stretch aspect "expand" fills the rest, so 4:3 and
## 16:10 sizes get more room instead of bars. Borderless covers the screen.
func apply_window() -> void:
	var win := get_window()
	var mode: String = prefs.get("windowMode", "windowed")
	if mode == "fullscreen":
		win.borderless = false
		win.mode = Window.MODE_FULLSCREEN
		return
	if win.mode != Window.MODE_WINDOWED:
		win.mode = Window.MODE_WINDOWED
	var area := DisplayServer.screen_get_usable_rect(win.current_screen)
	if mode == "borderless":
		var full := Rect2i(DisplayServer.screen_get_position(win.current_screen), DisplayServer.screen_get_size(win.current_screen))
		win.borderless = true
		win.size = full.size
		win.position = full.position
		return
	win.borderless = false
	var parts: PackedStringArray = str(prefs.get("resolution", "1280x720")).split("x")
	var want := Vector2i(int(parts[0]), int(parts[1])) if parts.size() == 2 else Vector2i(1280, 720)
	want = want.clamp(BASE, area.size if area.size.x > 0 else want)
	if win.size != want:
		win.size = want
		if area.size.x > 0:
			win.position = area.position + (area.size - want) / 2


func tab_visible(tab: String) -> bool:
	if tab == "shop" or tab == "settings":
		return true
	return bool(state.unlocked.get(tab, false))


func switch_tab(tab: String) -> void:
	if not tab_visible(tab):
		return
	_active = tab
	state.flags.visited[tab] = true
	redraw(true)
	scroll_top()


func scroll_top() -> void:
	if _scroll:
		_scroll.scroll_vertical = 0


func _panel(tab: String) -> TabPanel:
	if not _panels.has(tab):
		var p: TabPanel = TABS[tab].new()
		if tab == "shop":
			p.floor_view = floor_view
		_panels[tab] = p
	return _panels[tab]


## Re-renders the active tab when its signature changed (or when forced) and
## patches live numbers. `idle` is the 4 Hz loop's own refresh: heavy tabs
## rebuild at most every min_render_ms.
var rebuilds := 0
var rebuild_ms := 0.0


func redraw(force := false, idle := false) -> void:
	if state.is_empty() or _shell == null or App.catching_up:
		return
	_update_header()
	for k in _tab_btns:
		var vis := tab_visible(k)
		var b: Button = _tab_btns[k]
		b.visible = vis
		b.theme_type_variation = "TabOn" if k == _active else "Tab"
		var fresh: bool = vis and not state.flags.visited.get(k, false) and k != "settings" and k != "shop"
		b.text = Strings.TABS[k] + (" ●" if fresh else "")
	var p := _panel(_active)
	var sig := _active + "|" + p.sig()
	var now := Time.get_ticks_msec()
	var due: bool = not idle or p.min_render_ms == 0 or now - _last_render >= p.min_render_ms
	if force or (sig != _last_sig and due):
		var fo := get_viewport().gui_get_focus_owner()
		var typing: bool = fo is LineEdit and _panel_host.is_ancestor_of(fo)
		if not typing or force:
			if _panel_host.get_child_count() and _panel_host.get_child(0) != p:
				_panel_host.remove_child(_panel_host.get_child(0))
			if p.get_parent() == null:
				_panel_host.add_child(p)
			var rb0 := Time.get_ticks_usec()
			p.rebuild()
			rebuilds += 1
			rebuild_ms += (Time.get_ticks_usec() - rb0) / 1000.0
			_last_sig = sig
			_last_render = now
	else:
		p.refresh()
	_update_tutorial()


func _loop() -> void:
	if not state.get("setupDone", false):
		return
	var now := Game.now_ms()
	var dt: float = (now - state.lastTick) / 1000.0
	if dt > LIVE_MAX_DT:
		run_catch_up(now, dt > 60)
		return
	elif dt > 0:
		Game.tick(state, sets, dt, now)
	redraw(false, true)


# ---------- Header ----------

func _update_header() -> void:
	_set_money(state.money)
	var t := (Market.day_label(state.day, state.firstDay) if state.get("day") != null else "") + " · next " + Fmt.clock(Market.ms_until_next_day(Game.now_ms()))
	if _day.text != t:
		_day.text = t
	_awards_btn.text = "Awards %d/%d" % [state.achievements.size(), Achievements.list(sets).size()]
	var n := unread_count()
	_news_btn.text = "News" + (" (%d)" % n if n else "")
	_news_btn.theme_type_variation = "Primary" if n else "Small"


func _set_money(target: float) -> void:
	if _shown_money < 0 or prefs.reduceMotion or absf(target - _shown_money) < 0.005:
		_shown_money = target
		_money.text = Fmt.money(target)
		return
	if _money_tw and _money_tw.is_running() and _money.get_meta("to", -1.0) == target:
		return
	if _money_tw:
		_money_tw.kill()
	_money.set_meta("to", target)
	_money_tw = create_tween()
	_money_tw.tween_method(func(v):
		_shown_money = v
		_money.text = Fmt.money(v), _shown_money, target, 0.18).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)


func _sale_feedback(v: float) -> void:
	sfx("sale")
	_pending_sale += v
	if _sale_timer < 0:
		_sale_timer = 0.9


func _float_money(v: float) -> void:
	if prefs.reduceMotion or v <= 0 or _money == null:
		return
	var l := U.label("+" + Fmt.money(v), "Up")
	l.position = _money.global_position + Vector2(_money.size.x + 4, 0)
	_floaters.add_child(l)
	var tw := create_tween().set_parallel()
	tw.tween_property(l, "position:y", l.position.y + 10, 1.4)
	tw.tween_property(l, "modulate:a", 0.0, 1.4).set_delay(0.4)
	tw.chain().tween_callback(l.queue_free)


func toast(text: String) -> void:
	if _toast == null:
		return
	_toast_label.text = text
	if _toast_tw:
		_toast_tw.kill()
	_toast.reset_size()
	_toast.position.x = (size.x - _toast.size.x) / 2
	_toast_tw = create_tween()
	_toast_tw.tween_property(_toast, "modulate:a", 1.0, 0.15)
	_toast_tw.tween_interval(2.3)
	_toast_tw.tween_property(_toast, "modulate:a", 0.0, 0.4)


func sfx(name: String) -> void:
	if sound:
		sound.sfx(name)


# ---------- Tutorial ----------

func _update_tutorial() -> void:
	var step = Tutorial.current_step(state)
	if step == null or _overlay.visible:
		_tip.visible = false
		_hl_target = null
		_hl.queue_redraw()
		return
	if _tip_id != step.id:
		_tip_id = step.id
		_tip_text.text = step.text
		_tip.reset_size()
		_tip.position = Vector2((size.x - _tip.size.x) / 2, size.y - _tip.size.y - 6)
	_tip.visible = true
	var target: Control = null
	var sel: String = step.get("target", "")
	var tab_sel := RegEx.create_from_string("^\\[data-tab='(\\w+)'\\]$").search(sel)
	if step.get("tab") and step.tab != _active:
		target = _tab_btns.get(step.tab)
	elif tab_sel:
		target = _tab_btns.get(tab_sel.get_string(1))
	elif TUT_TARGETS.has(step.id):
		var t = U.tags.get(TUT_TARGETS[step.id])
		target = t if is_instance_valid(t) and t.is_visible_in_tree() else null
	_hl_target = target
	_hl.queue_redraw()


func _update_highlight() -> void:
	if _hl_target and not prefs.reduceMotion:
		_hl.queue_redraw()


func _draw_highlight(hl: Control) -> void:
	if hl != _hl:
		return
	if _hl_target == null or not is_instance_valid(_hl_target) or not _hl_target.is_visible_in_tree():
		return
	var r := _hl_target.get_global_rect().grow(2)
	var a := 1.0 if prefs.reduceMotion else 0.55 + 0.45 * sin(Time.get_ticks_msec() / 220.0)
	_hl.draw_rect(r, Color(Palette.c.accent, a), false, 1)
	_hl.draw_rect(r.grow(1), Color(Palette.c.accent, a * 0.4), false, 1)


func restart_tutorial() -> void:
	Tutorial.restart(state)
	_tip_id = ""
	switch_tab("shop")


# ---------- Save ----------

func save_game() -> void:
	if state.is_empty() or App.catching_up or not state.get("setupDone", false):
		return
	if SaveData.save_local(state):
		_last_saved_ms = Time.get_ticks_msec()


func last_saved_text() -> String:
	if not _last_saved_ms:
		return ""
	return "Saved %s ago" % Fmt.duration((Time.get_ticks_msec() - _last_saved_ms) / 1000.0)


func prefs_changed() -> void:
	prefs.clockOffset = Game.clock_offset
	SaveData.save_prefs(prefs)
	if sound:
		sound.set_prefs(prefs)


func export_save() -> void:
	save_game()
	var d := FileDialog.new()
	d.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	d.access = FileDialog.ACCESS_FILESYSTEM
	d.use_native_dialog = true
	d.filters = PackedStringArray(["*.json ; Save file"])
	d.current_file = "idlecardshop-save-%s.json" % Time.get_date_string_from_system()
	d.file_selected.connect(func(path):
		if SaveData.export_file(state, path):
			toast("Exported")
		else:
			message("Export failed.")
		d.queue_free())
	d.canceled.connect(d.queue_free)
	add_child(d)
	d.popup_centered(Vector2i(560, 320))


func import_save() -> void:
	var d := FileDialog.new()
	d.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	d.access = FileDialog.ACCESS_FILESYSTEM
	d.use_native_dialog = true
	d.filters = PackedStringArray(["*.json ; Save file"])
	d.file_selected.connect(func(path):
		d.queue_free()
		_import_path(path))
	d.canceled.connect(d.queue_free)
	add_child(d)
	d.popup_centered(Vector2i(560, 320))


func _import_path(path: String) -> void:
	var next = SaveData.import_file(path, sets, order)
	if next is String:
		message("Import failed: " + next)
		return
	next.setupDone = true
	_clear_release_all()
	Game.prepare(next, sets)
	_set_state(next)
	run_catch_up(Game.now_ms(), true, func(): if not _overlay.visible: message("Save imported."))


func _set_state(s: Dictionary) -> void:
	state = s
	App.state = s
	_shown_money = -1
	_last_sig = ""
	_panels.clear()
	for c in _panel_host.get_children():
		_panel_host.remove_child(c)
	if floor_view.get_parent():
		floor_view.get_parent().remove_child(floor_view)
	floor_view.people.clear()


func _clear_release_all() -> void:
	if prefs.get("releaseAll") == null:
		return
	prefs.releaseAll = null
	prefs_changed()


func ask_reset() -> void:
	confirm_box("Erase this save and start over?", "Reset", func():
		SaveData.clear_local()
		_clear_release_all()
		var s := Game.new_state(sets, order, Game.now_ms())
		Game.prepare(s, sets)
		_set_state(s)
		_show_setup())


# ---------- Offline catch-up ----------

## Simulates the time since the last tick. Over a minute, with the overlay,
## it runs on a worker thread with a progress bar, then the summary.
func run_catch_up(now: int, show_overlay: bool, after: Callable = Callable()) -> void:
	var seconds: float = (now - state.lastTick) / 1000.0
	if seconds < 1:
		state.lastTick = now
		if after.is_valid():
			after.call()
		return
	var total := int(floor(seconds))
	_cu_before = {"money": state.money, "earned": state.stats.earned, "sold": state.stats.cardsSold,
		"opened": state.stats.boostersOpened, "bought": state.stats.boostersBought, "levels": state.stats.levelsGained}
	_cu_total = total
	_cu_done = 0
	_cu_after = after
	_cu_big = show_overlay and seconds > 60
	if not _cu_big:
		Game.catch_up_slice(state, sets, int(state.lastTick), total, 0, Time.get_ticks_usec() + 60_000_000)
		_cu_done = total
		_finish_catch_up()
		return
	App.catching_up = true
	var box := _modal([U.label(Strings.OFFLINE.simulating, "Head")], 220)
	_cu_bar = U.bar("", 5)
	_cu_label = U.label("", "Muted")
	U.inner(box).add_child(_cu_bar)
	U.inner(box).add_child(_cu_label)
	_cu_thread = Thread.new()
	var from := int(state.lastTick)
	var s := state
	_cu_thread.start(func():
		var done := 0
		while done < total and App.catching_up:
			done = Game.catch_up_slice(s, sets, from, total, done, Time.get_ticks_usec() + 40_000)
			_cu_done = done)


func _poll_catch_up() -> void:
	if _cu_bar:
		_cu_bar.value = _cu_done / float(maxi(1, _cu_total))
		_cu_label.text = "%s / %s" % [Fmt.duration(_cu_done), Fmt.duration(_cu_total)]
	if _cu_thread and not _cu_thread.is_alive():
		_cu_thread.wait_to_finish()
		_cu_thread = null
		App.catching_up = false
		_finish_catch_up()


func _finish_thread() -> void:
	if _cu_thread:
		App.catching_up = false
		_cu_thread.wait_to_finish()
		_cu_thread = null


func _finish_catch_up() -> void:
	var r := {
		"seconds": _cu_total,
		"money": state.money - _cu_before.money,
		"earned": state.stats.earned - _cu_before.earned,
		"sold": state.stats.cardsSold - _cu_before.sold,
		"opened": state.stats.boostersOpened - _cu_before.opened,
		"bought": state.stats.boostersBought - _cu_before.bought,
		"levels": state.stats.levelsGained - _cu_before.levels,
	}
	var quiet: bool = not r.earned and not r.bought and not r.opened and not r.sold and not r.levels
	if _cu_big:
		if not quiet:
			_show_offline(r)
		else:
			close_overlay()
	_cu_bar = null
	save_game()
	redraw(true)
	if _cu_after.is_valid():
		var f := _cu_after
		_cu_after = Callable()
		f.call()


func _show_offline(r: Dictionary) -> void:
	var rows := U.grid(2, [], 16)
	for item in [["Time away", Fmt.duration(r.seconds)], ["Earned", Fmt.money(r.earned)], ["Cash change", Fmt.money(r.money)],
			["Boosters bought", Fmt.num(r.bought)], ["Boosters opened", Fmt.num(r.opened)], ["Cards sold", Fmt.num(r.sold)],
			["Levels gained", Fmt.num(r.levels)]]:
		rows.add_child(U.expand(U.label(item[0], "Muted")))
		rows.add_child(U.right(U.label(item[1])))
	_modal([U.label(Strings.OFFLINE.title, "Head"), rows, U.hbox([U.grow(), U.btn("Continue", close_overlay, "Primary")])], 200)


# ---------- Overlays ----------

## Shows a centred modal box over a dim backdrop; returns the box.
func _modal(children: Array, min_w := 0, max_h := 0) -> PanelContainer:
	_clear_overlay()
	var dim := ColorRect.new()
	dim.color = Color(0.08, 0.06, 0.04, 0.55)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.add_child(center)
	var box := U.box(children, "Modal")
	if min_w:
		box.custom_minimum_size.x = min_w
	center.add_child(box)
	_overlay.visible = true
	_update_tutorial()
	return box


## A modal whose body scrolls when it is taller than the screen.
func _scroll_modal(head: Array, body: Control, foot: Array, w: int) -> PanelContainer:
	var sc := ScrollContainer.new()
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	sc.custom_minimum_size = Vector2(w, 0)
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(body)
	var children := head.duplicate()
	children.append(sc)
	children.append_array(foot)
	var box := _modal(children, w)
	sc.custom_minimum_size.y = mini(int(size.y) - 90, 250)
	return box


func _clear_overlay() -> void:
	for c in _overlay.get_children():
		_overlay.remove_child(c)
		c.queue_free()


func close_overlay() -> void:
	_clear_overlay()
	_overlay.visible = false
	redraw(true)


func confirm_box(text: String, yes: String, on_yes: Callable) -> void:
	_modal([U.wrap(text, "", 200), U.hbox([U.grow(), U.btn("Cancel", close_overlay), U.btn(yes, func():
		close_overlay()
		on_yes.call(), "Danger")])], 220)


func message(text: String) -> void:
	_modal([U.wrap(text, "", 200), U.hbox([U.grow(), U.btn("OK", close_overlay, "Primary")])], 220)


func _show_setup() -> void:
	var title := U.label("IdleCardShop", "Head")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_modal([title, U.gap(6), U.hbox([U.grow(), U.btn("Open the shop", func():
		state.setupDone = true
		var now := Game.now_ms()
		state.lastTick = now
		state.createdAt = now
		Game.tick(state, sets, 0, now)
		close_overlay()
		save_game()
		redraw(true), "Primary"), U.grow()])], 180)


# ---------- News and awards ----------

func _visible_notes() -> Array:
	return news.filter(func(n): return not n.get("requires"))


func unread_count() -> int:
	var n := Game.unread_notices(state)
	for note in _visible_notes():
		if not state.newsSeen.has(note.id):
			n += 1
	return n


func _release_note(title: String):
	for n in news:
		if n.get("requires") and n.title == title:
			return n
	return null


func show_news() -> void:
	_news_more = {"game": false, "updates": false}
	var seen := {}
	for id in state.newsSeen:
		seen[id] = true
	_news_unread = {"inboxRead": state.inboxRead, "seen": seen}
	var upd := 0
	for n in _visible_notes():
		if not seen.has(n.id):
			upd += 1
	_news_tab = "updates" if Game.unread_notices(state) == 0 and upd > 0 else "game"
	Game.mark_notices_read(state)
	for n in _visible_notes():
		if not state.newsSeen.has(n.id):
			state.newsSeen.append(n.id)
	state.flags.visited.news = true
	_render_news()
	_update_header()


func _note(title: String, meta: String, text: String, unread: bool) -> PanelContainer:
	var head := U.hbox([U.label(("● " if unread else "") + title, "Head" if unread else ""), U.grow(), U.label(meta, "Muted")])
	var p := U.box([head], "Inset")
	if text != "":
		U.inner(p).add_child(U.wrap(text, "", 300))
	return p


func _news_list(key: String, items: Array, is_unread: Callable, make: Callable, body: VBoxContainer, empty_ok := false) -> void:
	if items.is_empty():
		if not empty_ok:
			body.add_child(U.label("—", "Muted"))
		return
	var unread := items.filter(func(it): return is_unread.call(it)).size()
	var n: int = items.size() if _news_more[key] else maxi(5, unread)
	for it in items.slice(0, n):
		body.add_child(make.call(it, is_unread.call(it)))
	if items.size() > n:
		body.add_child(U.hbox([U.btn("Read more", func():
			_news_more[key] = true
			_render_news(), "Link")]))


func _render_news() -> void:
	var notes := _visible_notes()
	notes.sort_custom(func(a, b): return String(a.get("date", "")) > String(b.get("date", "")))
	var game_unread := func(n): return n.id > _news_unread.inboxRead
	var upd_unread := func(n): return not _news_unread.seen.has(n.id)
	var body := U.vbox([], 3)
	if _news_tab == "game":
		var nxt = Game.next_release(state, sets)
		var has_next: bool = nxt != null and state.get("firstDay") != null
		if has_next:
			var rn = _release_note(nxt.name + " is out")
			body.add_child(_note("Next: " + nxt.name, Market.day_label(Supply.release_day(state, nxt), state.firstDay), rn.text if rn else "", false))
		_news_list("game", state.inbox, game_unread, func(n, u):
			var extra := ""
			if n.get("kind") == "release":
				var rn = _release_note(n.text)
				extra = rn.text if rn else ""
			var text := " ".join([extra, n.get("detail", "")].filter(func(x): return x != null and x != ""))
			return _note(n.text, Market.day_label(n.day, state.firstDay) if n.get("day") else "", text, u), body, has_next)
	else:
		_news_list("updates", notes, upd_unread, func(n, u):
			var meta: String = (n.version + " · " if n.get("version") else "") + String(n.get("date", ""))
			return _note(n.title, meta, n.get("text", ""), u), body)
	var count := func(items: Array, f: Callable) -> String:
		var c := items.filter(func(x): return f.call(x)).size()
		return " (%d)" % c if c else ""
	var tabs := U.hbox([
		U.btn("Game news" + count.call(state.inbox, game_unread), func():
			_news_tab = "game"
			_render_news(), "TabOn" if _news_tab == "game" else "Tab"),
		U.btn("Updates" + count.call(notes, upd_unread), func():
			_news_tab = "updates"
			_render_news(), "TabOn" if _news_tab == "updates" else "Tab")], 1)
	_scroll_modal([U.label("News", "Head"), tabs], body, [U.hbox([U.grow(), U.btn("Done", close_overlay, "Primary")])], 340)


func show_awards() -> void:
	var all := Achievements.list(sets)
	var got := all.filter(func(a): return state.achievements.get(a.id) != null).size()
	var g := U.grid(3, [], 6)
	for a in all:
		var day = state.achievements.get(a.id)
		var mark := U.label("★" if day != null else "☆", "Head" if day != null else "Muted")
		g.add_child(mark)
		g.add_child(U.hbox([U.label(a.name, "" if day != null else "Muted"), U.expand(U.label(a.desc, "Muted"))]))
		g.add_child(U.label(Market.day_label(day, state.firstDay) if day != null else "", "Muted"))
	_scroll_modal([U.hbox([U.label("Awards", "Head"), U.label("%d / %d" % [got, all.size()], "Muted")])], g,
		[U.hbox([U.grow(), U.btn("Done", close_overlay, "Primary")])], 380)


# ---------- Card detail and list form ----------

func show_card(st: Dictionary, c: Dictionary) -> void:
	var day: int = state.day
	var hist := Market.history(st, c, day, 30)
	var now: float = hist.back()
	var have: int = int(state.binder.get(st.id, {}).get(c.id, 0))
	var cost := now * Game.MARKET_BUY_RATE
	var can_list: bool = have > 0 and state.unlocked.get("priceList", false)
	var info := U.vbox([U.label(c.name, "Head"), U.label(st.rarities[c.rarity].name + (" · " + c.number if c.number != "" else ""), "Muted"),
		U.label(st.name, "Muted"),
		U.kv("Market", U.label(Fmt.money(now))),
		U.kv("7 days", U.signed(now - hist[hist.size() - 8], Fmt.pct(now / hist[hist.size() - 8] - 1.0))),
		Spark.new().setup(hist, 150, 30),
		U.kv("In binder", U.label(str(have)))])
	info.custom_minimum_size.x = 160
	var btns := U.hbox()
	if can_list:
		if Game.free_slots(state) > 0:
			btns.add_child(U.btn("List", func(): show_list_form(st, c), "Primary", Strings.TIPS.list))
		else:
			btns.add_child(U.label("showcase full", "Muted"))
	if Game.set_unlocked(state, st):
		var b := U.btn("Buy " + Fmt.money(cost), func():
			if Game.buy_single(state, sets, st, c):
				sfx("coin")
				show_card(st, c), "", Strings.TIPS.single)
		b.disabled = state.money < cost
		btns.add_child(b)
	else:
		btns.add_child(U.label("locked", "Muted", Strings.TIPS.locked))
	btns.add_child(U.grow())
	btns.add_child(U.btn("Done", close_overlay))
	info.add_child(U.gap(4))
	info.add_child(btns)
	var cv := CardTilt.new().setup(st, c)
	_modal([U.hbox([cv, info], 8)])


func _lf_reset(st: Dictionary, c: Dictionary) -> void:
	var key: String = st.id + ":" + c.id
	if _lf.key != key:
		_lf = {"key": key, "n": 1, "price": Game.tag_price(Game.market_value(state, st, c), 0)}


func _lf_max(st: Dictionary, c: Dictionary) -> int:
	return mini(int(state.binder.get(st.id, {}).get(c.id, 0)), Game.free_slots(state))


func show_list_form(st: Dictionary, c: Dictionary) -> void:
	_lf_reset(st, c)
	var now := Game.market_value(state, st, c)
	var have: int = int(state.binder.get(st.id, {}).get(c.id, 0))
	var mx := _lf_max(st, c)
	_lf.n = maxi(1, mini(_lf.n, maxi(mx, 1)))
	var qty := LineEdit.new()
	qty.text = str(_lf.n)
	qty.custom_minimum_size.x = 36
	var price := LineEdit.new()
	price.text = "%.2f" % _lf.price
	price.custom_minimum_size.x = 50
	var off := U.label("", "Muted", Strings.TIPS.customers)
	var total := U.label("")
	var list_btn := U.btn("List", func(): _list_card(st, c, false), "Primary")
	var upd := func():
		off.text = ("market" if _lf.price == Game.tag_price(now, 0) else Fmt.pct(_lf.price / now - 1.0)) if _lf.price else ""
		off.theme_type_variation = "Down" if _lf.price > now * 1.1 else "Muted"
		total.text = Fmt.money(_lf.n * _lf.price)
		list_btn.text = "List %d" % _lf.n
		list_btn.disabled = not (_lf.n > 0 and _lf.price > 0 and mx > 0)
	qty.text_changed.connect(func(t):
		var v := int(t) if t.is_valid_int() else 0
		_lf.n = mini(v, mx) if v > 0 else 0
		upd.call())
	price.text_changed.connect(func(t):
		var v := roundf(float(t) * 100.0) / 100.0 if t.is_valid_float() else 0.0
		_lf.price = v if v > 0 else 0.0
		upd.call())
	var set_n := func(n: int):
		_lf.n = maxi(1, mini(n, maxi(mx, 1)))
		qty.text = str(_lf.n)
		upd.call()
	var info := U.vbox([U.label(c.name, "Head"), U.kv("Market", U.label(Fmt.money(now))), U.kv("In binder", U.label(str(have))),
		U.hbox([U.label("Quantity", "Muted"), U.grow(), U.small("−", func(): set_n.call(_lf.n - 1)), qty,
			U.small("+", func(): set_n.call(_lf.n + 1)), U.small("Max", func(): set_n.call(mx))]),
		U.hbox([U.label("Price", "Muted"), U.grow(), off, price, U.small("Market", func():
			_lf.price = Game.tag_price(now, 0)
			price.text = "%.2f" % _lf.price
			upd.call())]),
		U.kv("Total", total),
		U.gap(4),
		U.hbox([U.btn("Back", func(): show_card(st, c)), U.grow(), list_btn])])
	info.custom_minimum_size.x = 190
	upd.call()
	_modal([U.hbox([CardView.new().setup(st, c, "lg"), info], 8)])


func _list_card(st: Dictionary, c: Dictionary, confirmed: bool, n := 0, p := 0.0) -> void:
	var have: int = int(state.binder.get(st.id, {}).get(c.id, 0))
	if not confirmed:
		n = mini(mini(_lf.n, have), Game.free_slots(state))
		p = _lf.price
	if not (n > 0) or not (p > 0):
		return
	if not confirmed and n >= have:
		var nn := n
		var pp := p
		_modal([U.label("List your last %s?" % c.name), U.hbox([U.grow(), U.btn("Cancel", func(): show_card(st, c)),
			U.btn("List", func(): _list_card(st, c, true, nn, pp), "Primary")])], 200)
		return
	if Game.list_card(state, st, c, n, p):
		sfx("click")
		show_card(st, c)


# ---------- Opening ----------

func open_one(st: Dictionary) -> void:
	var res = Game.open_booster(state, sets, st)
	if res == null:
		close_overlay()
		return
	_clear_overlay()
	_overlay.visible = true
	var op := Opening.new().setup(st, res)
	op.finished.connect(func(): _opening_summary(st, res))
	_overlay.add_child(op)
	_update_tutorial()


func _opening_summary(st: Dictionary, res: Array) -> void:
	var total := 0.0
	for r in res:
		total += Game.market_value(state, st, r.card)
	var grid := HFlowContainer.new()
	grid.custom_minimum_size.x = 330
	var rev := res.duplicate()
	rev.reverse()
	for r in rev:
		var cv := CardView.new()
		cv.is_new = r.isNew
		grid.add_child(cv.setup(st, r.card, "md"))
	var again := U.btn("Open another", func(): open_one(st))
	again.disabled = not (float(state.stock.get(st.id, 0)) > 0)
	_modal([grid, U.hbox([U.label("Value"), U.label(Fmt.money(total), "Head"), U.grow(), again, U.btn("Done", close_overlay, "Primary")])])


## Grouped results for Open 10 / 100 / all: rarest first, with count and NEW.
func show_bulk_result(st: Dictionary, result: Array) -> void:
	var groups := {}
	var list: Array = []
	for r in result:
		var id: String = r.card.id
		if not groups.has(id):
			groups[id] = {"card": r.card, "n": 0, "isNew": false}
			list.append(groups[id])
		groups[id].n += 1
		groups[id].isNew = groups[id].isNew or r.isNew
	list.sort_custom(func(a, b):
		var ra: int = st.rarities[a.card.rarity].rank
		var rb: int = st.rarities[b.card.rarity].rank
		if ra != rb:
			return ra > rb
		return Game.market_value(state, st, a.card) > Game.market_value(state, st, b.card))
	var total := 0.0
	for r in result:
		total += Game.market_value(state, st, r.card)
	var per := 0
	for s in st.booster.slots:
		per += int(s.count)
	var packs := int(round(result.size() / float(maxi(1, per))))
	var new_count := list.filter(func(g): return g.isNew).size()
	var grid := HFlowContainer.new()
	for g in list:
		var cv := CardView.new()
		cv.is_new = g.isNew
		cv.setup(st, g.card, "sm")
		if g.n > 1:
			cv.count = g.n
		grid.add_child(U.vbox([cv, U.hbox([U.rarity_tag(st, g.card), U.label(Fmt.money(Game.market_value(state, st, g.card) * g.n), "Muted")], 1)], 1))
	var title := "%d boosters · %d cards%s" % [packs, result.size(), " · %d new" % new_count if new_count else ""]
	_scroll_modal([U.label(title, "Head")], grid, [U.hbox([U.label("Value"), U.label(Fmt.money(total), "Head"), U.grow(),
		U.btn("Done", close_overlay, "Primary")])], 420)


# ---------- Actions ----------

## Runs a rules action, plays its sound when it went through, and refreshes.
func act(fn: Callable, sound_name := "") -> void:
	var r = fn.call()
	if sound_name != "" and r != null and JS.truthy(r):
		sfx(sound_name)
	redraw()


func act_buy(st: Dictionary, n: int) -> void:
	if Game.buy_boosters(state, st, n if n > 0 else 1_000_000_000):
		sfx("coin")
	redraw()


func act_open(st: Dictionary, n: int) -> void:
	var have := int(state.stock.get(st.id, 0))
	if have <= 0:
		return
	if n == 1:
		open_one(st)
		return
	var k := have if n == 0 else mini(have, n)
	var res := Game.open_boosters(state, sets, st, k)
	sfx("tear")
	show_bulk_result(st, res)


func act_price() -> void:
	var q: String = App.ui.priceQty
	var keep := float(App.ui.priceKeep)
	if Game.price_spares(state, sets, 1_000_000_000 if q == "all" else maxi(1, int(q)), float(App.ui.priceLevel), keep):
		sfx("click")
	if Game.free_slots(state) <= 0 and Game.spares(state, sets, keep).size():
		toast(Strings.TOASTS.showcaseFull)
	redraw()


func act_bulk() -> void:
	var r := Game.sell_bulk(state, sets, float(App.ui.priceKeep))
	if r.n:
		sfx("coin")
	redraw()


func ask_fire(e: Dictionary) -> void:
	if not Game.can_fire(state, e):
		return
	confirm_box("Fire %s for %s?" % [e.name, Fmt.money(Game.severance(state, e))], "Fire", func():
		Game.fire(state, e)
		redraw(true))


func debug_skip(days: int) -> void:
	if App.catching_up:
		return
	var ms := DebugTools.ms_to_next_set(state, sets, Game.now_ms()) if days < 0 else days * Market.DAY_MS
	if ms <= 0:
		return
	Game.clock_offset += ms
	prefs_changed()
	_loop()
