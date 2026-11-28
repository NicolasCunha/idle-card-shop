extends Control
## Launcher (first scene of an exported build). Checks the latest GitHub
## release, downloads only what changed (the game pack and the card packs whose
## checksum differs) into user://update/, then starts the newest game it has:
## the bundled one, or the downloaded one. Export templates refuse --main-pack,
## so a downloaded game runs from a copy of this executable in
## user://update/run/ named after its pack (IdleCardShop-game + .pck next to
## it), started as a new process. No network or any error: play what is
## installed. A new engine version cannot be patched; then it links to
## the full download. Self-contained on purpose: no game classes are loaded
## here, so the restarted game never mixes old and new scripts.

const API := "https://api.github.com/repos/NicolasCunha/idle-card-shop/releases/latest"
const RELEASES := "https://github.com/NicolasCunha/idle-card-shop/releases/latest"
const DIR := "user://update/"
const STATE := "user://update/installed.json"
const MAIN := "res://scenes/main.tscn"
const TIMEOUT := 8.0

var _status: Label
var _bar: ProgressBar
var _http: HTTPRequest
var _queue: Array = [] # [url, path, sha256, size, label]
var _installed := {} # what is in user://update: {version, engine, game: sha, packs: {file: sha}}
var _total := 0
var _done_bytes := 0
var _cur: Array = []
var _manifest := {}


func _ready() -> void:
	var uargs := OS.get_cmdline_user_args()
	if not OS.has_feature("template") or "--no-update" in uargs or "--launched" in uargs:
		_play.call_deferred()
		return
	_build_ui()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DIR + "packs"))
	var f := FileAccess.get_file_as_string(STATE)
	var parsed = JSON.parse_string(f) if f != "" else null
	_installed = parsed if parsed is Dictionary else {}
	_http = HTTPRequest.new()
	_http.timeout = TIMEOUT
	_http.use_threads = true
	add_child(_http)
	_status.text = "Checking for updates"
	_http.request_completed.connect(_on_release, CONNECT_ONE_SHOT)
	var api := API
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--update-api="):
			api = a.trim_prefix("--update-api=") # for testing against a local server
	if _http.request(api, ["Accept: application/vnd.github+json", "User-Agent: IdleCardShop"]) != OK:
		_play()


func _build_ui() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.14, 0.11, 0.09)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var box := VBoxContainer.new()
	box.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	box.custom_minimum_size = Vector2(260, 0)
	box.position -= Vector2(130, 20)
	add_child(box)
	var title := Label.new()
	title.text = "IdleCardShop"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_color_override("font_color", Color("dcae4b"))
	box.add_child(title)
	_status = Label.new()
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.add_theme_color_override("font_color", Color("b09c83"))
	_status.add_theme_font_size_override("font_size", 10)
	box.add_child(_status)
	_bar = ProgressBar.new()
	_bar.show_percentage = false
	_bar.custom_minimum_size.y = 4
	_bar.max_value = 1.0
	_bar.visible = false
	box.add_child(_bar)


func _on_release(result: int, code: int, _h: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		_play()
		return
	var rel = JSON.parse_string(body.get_string_from_utf8())
	if not rel is Dictionary:
		_play()
		return
	var assets := {}
	for a in rel.get("assets", []):
		assets[a.name] = a.browser_download_url
	if not assets.has("manifest.json"):
		_play()
		return
	_http.request_completed.connect(func(r, c, _hh, b): _on_manifest(r, c, b, assets), CONNECT_ONE_SHOT)
	if _http.request(assets["manifest.json"], ["User-Agent: IdleCardShop"]) != OK:
		_play()


func _on_manifest(result: int, code: int, body: PackedByteArray, assets: Dictionary) -> void:
	var m = JSON.parse_string(body.get_string_from_utf8()) if result == HTTPRequest.RESULT_SUCCESS and code == 200 else null
	if not m is Dictionary or not m.has("version") or not m.has("game"):
		_play()
		return
	_manifest = m
	var engine := "%d.%d.%d" % [Engine.get_version_info().major, Engine.get_version_info().minor, Engine.get_version_info().patch]
	if str(m.get("engine", engine)) != engine:
		_new_engine(str(m.version))
		return
	if _newer(str(m.version), _local_version()) and _installed.get("game") != m.game.sha256 and assets.has(m.game.file):
		_queue.append([assets[m.game.file], DIR + "game-%s.pck" % m.version, m.game.sha256, int(m.game.size), "Game " + str(m.version)])
	var packs: Dictionary = _installed.get("packs", {})
	var bundled := OS.get_executable_path().get_base_dir().path_join("packs")
	for p in m.get("packs", []):
		var file: String = p.file
		if packs.get(file) == p.sha256 or not assets.has(file):
			continue
		if _bundled_sha(bundled.path_join(file)) == p.sha256:
			continue
		_queue.append([assets[file], DIR + "packs/" + file, p.sha256, int(p.size), "Cards " + str(p.get("name", file))])
	for q in _queue:
		_total += q[3]
	_next()


## Checksum of a card pack that came with the game, remembered by its date so
## the packs are hashed only once.
func _bundled_sha(path: String) -> String:
	if not FileAccess.file_exists(path):
		return ""
	if not _installed.has("bundled"):
		_installed.bundled = {}
	var stamp := str(FileAccess.get_modified_time(path))
	var known = _installed.bundled.get(path.get_file())
	if known is Array and known.size() == 2 and known[0] == stamp:
		return known[1]
	var sha := FileAccess.get_sha256(path)
	_installed.bundled[path.get_file()] = [stamp, sha]
	_save_installed()
	return sha


func _next() -> void:
	if _queue.is_empty():
		_play()
		return
	_cur = _queue.pop_front()
	_status.text = _cur[4]
	_bar.visible = true
	_http.download_file = _cur[1] + ".part"
	_http.request_completed.connect(_on_file, CONNECT_ONE_SHOT)
	_http.timeout = 0.0
	if _http.request(_cur[0], ["User-Agent: IdleCardShop"]) != OK:
		_play()


func _process(_d: float) -> void:
	if _bar and _bar.visible and _total > 0 and _http:
		_bar.value = float(_done_bytes + maxi(0, _http.get_downloaded_bytes())) / _total


func _on_file(result: int, code: int, _h: PackedStringArray, _b: PackedByteArray) -> void:
	var part: String = _cur[1] + ".part"
	if result != HTTPRequest.RESULT_SUCCESS or code != 200 or FileAccess.get_sha256(part) != _cur[2]:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(part))
		_play() # keep what works; try again next start
		return
	DirAccess.rename_absolute(ProjectSettings.globalize_path(part), ProjectSettings.globalize_path(_cur[1]))
	_done_bytes += _cur[3]
	if _cur[1].get_file().begins_with("game-"):
		_installed.game = _cur[2]
		_installed.game_file = _cur[1].get_file()
		_installed.version = str(_manifest.version)
	else:
		if not _installed.has("packs"):
			_installed.packs = {}
		_installed.packs[_cur[1].get_file()] = _cur[2]
	_save_installed()
	_next()


func _save_installed() -> void:
	var f := FileAccess.open(STATE, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(_installed))


func _new_engine(version: String) -> void:
	_status.text = "Version %s needs a new download" % version
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	var get_btn := Button.new()
	get_btn.text = "Download"
	get_btn.pressed.connect(func(): OS.shell_open(RELEASES))
	var play := Button.new()
	play.text = "Play"
	play.pressed.connect(_play)
	row.add_child(get_btn)
	row.add_child(play)
	_status.get_parent().add_child(row)


## The version the running pack reports.
func _running_version() -> String:
	return str(ProjectSettings.get_setting("application/config/version", "0"))


## The newest game this install has: downloaded or bundled.
func _local_version() -> String:
	var v := _running_version()
	var got := str(_installed.get("version", "0"))
	if FileAccess.file_exists(DIR + str(_installed.get("game_file", "-"))) and _newer(got, v):
		return got
	return v


static func _newer(a: String, b: String) -> bool:
	var x := a.split(".")
	var y := b.split(".")
	for i in maxi(x.size(), y.size()):
		var p := int(x[i]) if i < x.size() else 0
		var q := int(y[i]) if i < y.size() else 0
		if p != q:
			return p > q
	return false


func _play() -> void:
	if _http:
		_http.cancel_request()
	var file := str(_installed.get("game_file", ""))
	if OS.has_feature("template") and not "--launched" in OS.get_cmdline_user_args() and file != "" \
			and FileAccess.file_exists(DIR + file) and _newer(str(_installed.get("version", "0")), _running_version()):
		if _launch(file):
			return
	_clean_old(file)
	get_tree().change_scene_to_file(MAIN)


## Starts the downloaded game: a copy of this executable with the new pack
## beside it. Returns false if the copy cannot be made (then the bundled game runs).
func _launch(file: String) -> bool:
	var exe := OS.get_executable_path()
	var ext := "." + exe.get_extension() if exe.get_extension() != "" else ""
	var run := ProjectSettings.globalize_path(DIR + "run")
	DirAccess.make_dir_recursive_absolute(run)
	var game_exe := run.path_join("IdleCardShop-game" + ext)
	var game_pck := run.path_join("IdleCardShop-game.pck")
	var stamp := "%d:%d" % [FileAccess.get_size(exe), FileAccess.get_modified_time(exe)]
	if not FileAccess.file_exists(game_exe) or _installed.get("run_exe") != stamp:
		if DirAccess.copy_absolute(exe, game_exe, 493) != OK: # 493 = rwxr-xr-x
			return false
		_installed.run_exe = stamp
		_save_installed()
	if _installed.get("run_pck") != file or not FileAccess.file_exists(game_pck):
		if DirAccess.copy_absolute(ProjectSettings.globalize_path(DIR + file), game_pck) != OK:
			return false
		_installed.run_pck = file
		_save_installed()
	var args := PackedStringArray()
	for a in OS.get_cmdline_args():
		args.append(a)
	args.append("--")
	args.append("--launched")
	args.append("--packs-dir=" + exe.get_base_dir().path_join("packs"))
	for a in OS.get_cmdline_user_args():
		args.append(a)
	if OS.create_process(game_exe, args) <= 0:
		return false
	get_tree().quit()
	return true


## Removes downloaded game packs that are no longer the installed one (a file
## still in use is simply left for next time).
func _clean_old(keep: String) -> void:
	if not OS.has_feature("template"):
		return
	for f in DirAccess.get_files_at(DIR):
		if f.begins_with("game-") and f != keep:
			DirAccess.remove_absolute(ProjectSettings.globalize_path(DIR + f))
