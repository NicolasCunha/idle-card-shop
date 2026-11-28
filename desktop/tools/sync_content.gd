extends SceneTree
## Copies the shared game data from the repo root into res://content/ before an
## export: collections.json, every collection JSON it lists, and data/*.json.
## Card images are not copied; they ship as card packs (tools/pack_cards.gd).
## godot --headless --path desktop --script res://tools/sync_content.gd


func _initialize() -> void:
	var src := ProjectSettings.globalize_path("res://").path_join("..").simplify_path() + "/"
	var dst := ProjectSettings.globalize_path("res://content/")
	DirAccess.make_dir_recursive_absolute(dst + "data")
	var files := ["collections.json"]
	files.append_array(GameData.collection_files(src))
	for f in DirAccess.get_files_at(src + "data"):
		if f.ends_with(".json"):
			files.append("data/" + f)
	var n := 0
	for f in files:
		if DirAccess.copy_absolute(src + f, dst + f) == OK:
			n += 1
		else:
			printerr("could not copy " + f)
	print("content: %d files copied" % n)
	quit(0 if n == files.size() else 1)
