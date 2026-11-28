class_name CardImages
extends Node
## Card scans, decoded on worker threads and cached. Thumbnails are scaled down
## once; the full image is kept only for the few big views. A missing or broken
## image gives null and the card is drawn as a generic card (cards.js).

signal loaded(key: String)

const THUMB := Vector2i(100, 140)
const MAX_THUMBS := 900
const MAX_FULL := 24

static var inst: CardImages

var root := ""
var _cache := {} # key -> Texture2D or null (failed)
var _lru: Array = []
var _queued := {} # key -> true
var _done: Array = [] # [key, Image or null] from workers
var _mutex := Mutex.new()
var _running := 0
var _waiting: Array = [] # keys not started yet, newest last
const WORKERS := 3


func _init() -> void:
	inst = self
	root = GameData.content_root()


static func key_of(path: String, full: bool) -> String:
	return path + ("#full" if full else "#thumb")


## The texture if it is ready; otherwise starts loading it and returns null.
func get_tex(path: String, full := false) -> Texture2D:
	if path == "":
		return null
	var key := key_of(path, full)
	if _cache.has(key):
		var i := _lru.find(key)
		if i >= 0 and i < _lru.size() - 40:
			_lru.remove_at(i)
			_lru.append(key)
		return _cache[key]
	if not _queued.has(key):
		_queued[key] = true
		_waiting.append(key)
		_pump()
	return null


func failed(path: String, full := false) -> bool:
	var key := key_of(path, full)
	return _cache.has(key) and _cache[key] == null


func _pump() -> void:
	while _running < WORKERS and _waiting.size():
		var key: String = _waiting.pop_back()
		_running += 1
		WorkerThreadPool.add_task(_decode.bind(key), false, "Card image")


func _decode(key: String) -> void:
	var full := key.ends_with("#full")
	var path := key.substr(0, key.rfind("#"))
	var img: Image = null
	var file := root + path
	if FileAccess.file_exists(file):
		var bytes := FileAccess.get_file_as_bytes(file)
		img = Image.new()
		var err := ERR_FILE_UNRECOGNIZED
		var low := path.to_lower()
		if low.ends_with(".png"):
			err = img.load_png_from_buffer(bytes)
		elif low.ends_with(".webp"):
			err = img.load_webp_from_buffer(bytes)
		else:
			err = img.load_jpg_from_buffer(bytes)
		if err != OK:
			img = null
		else:
			if not full:
				img.resize(THUMB.x, THUMB.y, Image.INTERPOLATE_LANCZOS)
			img.generate_mipmaps()
	_mutex.lock()
	_done.append([key, img])
	_mutex.unlock()


func _process(_delta: float) -> void:
	_mutex.lock()
	var batch := _done
	_done = []
	_mutex.unlock()
	for pair in batch:
		var key: String = pair[0]
		_running -= 1
		_queued.erase(key)
		_cache[key] = ImageTexture.create_from_image(pair[1]) if pair[1] else null
		_lru.append(key)
		loaded.emit(key)
	if batch.size():
		_trim()
	_pump()


func _trim() -> void:
	var thumbs := 0
	var fulls := 0
	for k in _lru:
		if k.ends_with("#full"):
			fulls += 1
		else:
			thumbs += 1
	var i := 0
	while (thumbs > MAX_THUMBS or fulls > MAX_FULL) and i < _lru.size():
		var k: String = _lru[i]
		var full := k.ends_with("#full")
		if (full and fulls > MAX_FULL) or (not full and thumbs > MAX_THUMBS):
			_cache.erase(k)
			_lru.remove_at(i)
			if full:
				fulls -= 1
			else:
				thumbs -= 1
		else:
			i += 1
