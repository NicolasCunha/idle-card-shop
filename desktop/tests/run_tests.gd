extends SceneTree
## Headless test runner: godot --headless --path desktop --script res://tests/run_tests.gd
## Exits with code 0 when every check passes, 1 otherwise.

var _passed := 0
var _failed := 0


func ok(cond: bool, name: String, detail: String = "") -> void:
	if cond:
		_passed += 1
	else:
		_failed += 1
		printerr("FAIL  %s  %s" % [name, detail])


func _initialize() -> void:
	_test_project_settings()
	_test_main_scene()
	print("%d passed, %d failed" % [_passed, _failed])
	quit(1 if _failed > 0 else 0)


func _test_project_settings() -> void:
	ok(ProjectSettings.get_setting("display/window/size/viewport_width") == 240, "base width 240")
	ok(ProjectSettings.get_setting("display/window/size/viewport_height") == 160, "base height 160")
	ok(ProjectSettings.get_setting("display/window/stretch/mode") == "viewport", "stretch mode viewport")
	ok(ProjectSettings.get_setting("display/window/stretch/scale_mode") == "integer", "integer scaling")
	ok(ProjectSettings.get_setting("rendering/textures/canvas_textures/default_texture_filter") == 0, "nearest filter")


func _test_main_scene() -> void:
	var path: String = ProjectSettings.get_setting("application/run/main_scene")
	var packed := load(path) as PackedScene
	ok(packed != null, "main scene loads", path)
	if packed:
		var node := packed.instantiate()
		ok(node is Control, "main scene root is a Control")
		ok(node.get_node_or_null("Background") is ColorRect, "background present")
		node.free()
