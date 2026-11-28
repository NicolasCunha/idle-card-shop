class_name Loader
extends RefCounted
## Loads every data file on worker threads (web 1.9.7: files load in parallel).
## Collection files are read and parsed by a WorkerThreadPool group task; the
## tutorial, news and accessories load alongside. Call poll() each frame from the
## main thread: it emits step_changed and, once everything is in, finished.

signal step_changed(key: String, status: String, detail: String)
signal finished(ok: bool)

var root := ""
var files: Array = []
var sets := {}
var order: Array = []
var tutorial = null
var news: Array = []
var accessories: Array = []

var _raws: Array = []
var _parsed := 0 # files done; written by workers under _mutex
var _mutex := Mutex.new()
var _group := -1
var _tasks := {} # step key -> task id
var _results := {} # step key -> parsed JSON
var _reported := -1
var _done := false


func start(content_root: String = "") -> void:
	root = content_root if content_root != "" else GameData.content_root()
	step_changed.emit("code", "done", "")
	GameData.mount_card_packs()
	files = GameData.collection_files(root)
	_raws.resize(files.size())
	step_changed.emit("cards", "active", "0 / %d" % files.size())
	if files.size() > 0:
		_group = WorkerThreadPool.add_group_task(_parse_collection, files.size(), -1, false, "Load collections")
	for pair in [["tutorial", "data/tutorial.json"], ["news", "data/news.json"], ["goods", "data/accessories.json"]]:
		step_changed.emit(pair[0], "active", "")
		var path: String = root + pair[1]
		var key: String = pair[0]
		_tasks[key] = WorkerThreadPool.add_task(func(): _store(key, GameData.read_json(path)), false, "Load " + key)


func _parse_collection(i: int) -> void:
	var data = GameData.read_json(root + files[i])
	_mutex.lock()
	_raws[i] = data
	_parsed += 1
	_mutex.unlock()


func _store(key: String, data) -> void:
	_mutex.lock()
	_results[key] = data
	_mutex.unlock()


func poll() -> void:
	if _done:
		return
	_mutex.lock()
	var parsed := _parsed
	_mutex.unlock()
	if parsed != _reported:
		_reported = parsed
		step_changed.emit("cards", "active", "%d / %d" % [parsed, files.size()])
	for key in _tasks.keys():
		if WorkerThreadPool.is_task_completed(_tasks[key]):
			WorkerThreadPool.wait_for_task_completion(_tasks[key])
			_tasks.erase(key)
			_finish_file(key)
	if _group != -1 and WorkerThreadPool.is_group_task_completed(_group):
		WorkerThreadPool.wait_for_group_task_completion(_group)
		_group = -1
		var built := GameData.build_collections(files, _raws)
		sets = built.sets
		order = built.order
		_raws = []
		step_changed.emit("cards", "done", "%d / %d" % [order.size(), files.size()])
	elif _group == -1 and files.is_empty() and not _done:
		step_changed.emit("cards", "done", "0 / 0")
	if _group == -1 and _tasks.is_empty():
		_done = true
		finished.emit(order.size() > 0)


func _finish_file(key: String) -> void:
	_mutex.lock()
	var data = _results.get(key)
	_mutex.unlock()
	match key:
		"tutorial":
			tutorial = data
		"news":
			news = []
			if data is Dictionary and data.get("items") is Array:
				for n in data.items:
					if n is Dictionary and n.get("id") and n.get("title"):
						news.append(n)
		"goods":
			accessories = data.items if data is Dictionary and data.get("items") is Array else []
	step_changed.emit(key, "done", "")
