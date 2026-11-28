extends SceneTree
## Packs one collection's card images into a resource pack (cards-<id>.pck).
## Files are stored as they are (JPG or WebP bytes, no import step) at
## res://content/images/<id>/<file>, the same path the collection JSON uses.
## The game mounts the pack with ProjectSettings.load_resource_pack and decodes
## images on a worker thread with Image.load_*_from_buffer.
##
## godot --headless --path desktop --script res://tools/pack_cards.gd -- <image dir> <collection id> <out.pck>


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() < 3:
		printerr("usage: -- <image dir> <collection id> <out.pck>")
		quit(2)
		return
	var dir: String = args[0]
	var id: String = args[1]
	var out: String = args[2]
	var files := DirAccess.get_files_at(dir)
	var packer := PCKPacker.new()
	if packer.pck_start(out) != OK:
		printerr("cannot write %s" % out)
		quit(1)
		return
	var n := 0
	for f in files:
		var ext := f.get_extension().to_lower()
		if ext in ["jpg", "jpeg", "png", "webp"]:
			packer.add_file("res://content/images/%s/%s" % [id, f], dir.path_join(f))
			n += 1
	packer.flush()
	print("%s: %d images" % [out, n])
	quit(0)
