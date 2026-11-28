extends SceneTree
## Mounts a card pack and decodes every image in it; prints the time.
## godot --headless --path desktop --script res://tools/bench_cards.gd -- <pack.pck> <collection id>


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var t0 := Time.get_ticks_usec()
	if not ProjectSettings.load_resource_pack(args[0], false):
		printerr("cannot mount %s" % args[0])
		quit(1)
		return
	var t1 := Time.get_ticks_usec()
	var dir := "res://content/images/%s" % args[1]
	var files := DirAccess.get_files_at(dir)
	var n := 0
	var px := 0
	for f in files:
		var bytes := FileAccess.get_file_as_bytes(dir.path_join(f))
		var img := Image.new()
		var err := img.load_webp_from_buffer(bytes) if f.get_extension() == "webp" else img.load_jpg_from_buffer(bytes)
		if err == OK:
			n += 1
			px = img.get_width()
	var t2 := Time.get_ticks_usec()
	print("%s: mount %.1f ms, %d images decoded in %.1f ms (%.2f ms each), width %d" % [
		args[0].get_file(), (t1 - t0) / 1000.0, n, (t2 - t1) / 1000.0, (t2 - t1) / 1000.0 / maxi(n, 1), px])
	quit(0)
