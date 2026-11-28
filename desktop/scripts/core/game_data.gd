class_name GameData
## Loads card collections and data files (port of js/data.js, GDD section 4).
## Adding a collection = add its JSON at the repo root and list it in
## collections.json. No code change.
##
## Content root: res://content/ in an exported build (S18 packs it there);
## during development, the repo root next to desktop/.


static func content_root() -> String:
	if not OS.has_feature("editor") and FileAccess.file_exists("res://content/collections.json"):
		return "res://content/"
	return ProjectSettings.globalize_path("res://").path_join("..").simplify_path() + "/"


static func read_json(path: String):
	var text := FileAccess.get_file_as_string(path)
	if text == "":
		push_error("Could not read %s (%s)" % [path, error_string(FileAccess.get_open_error())])
		return null
	var data = JSON.parse_string(text)
	if data == null:
		push_error("Invalid JSON in %s" % path)
	return data


## File names listed in collections.json, in release order.
static func collection_files(root: String) -> Array:
	var list = read_json(root + "collections.json")
	if list is Dictionary and list.get("collections") is Array:
		return list.collections
	return []


## Builds { sets, order } from parsed collection JSONs (same order as files).
## Bad or duplicate collections are skipped with a warning, like the web build.
static func build_collections(files: Array, raws: Array) -> Dictionary:
	var sets := {}
	var order := []
	for i in files.size():
		var raw = raws[i]
		if not raw is Dictionary:
			push_error("Could not load collection %s" % files[i])
			continue
		var cset = normalize_set(raw)
		if cset == null:
			push_error("Collection %s is missing required fields (id, name, booster, rarities, cards)" % files[i])
			continue
		if sets.has(cset.id):
			push_warning("Duplicate collection id \"%s\" in %s, skipped" % [cset.id, files[i]])
			continue
		sets[cset.id] = cset
		order.append(cset.id)
	resolve_reprints(sets)
	link_order(sets, order)
	return {"sets": sets, "order": order}


## Synchronous load of every collection (tests and tools; the game uses Loader).
static func load_collections(root: String = "") -> Dictionary:
	if root == "":
		root = content_root()
	var files := collection_files(root)
	var raws := []
	for f in files:
		raws.append(read_json(root + f))
	return build_collections(files, raws)


## Collections are released in collections.json order (supply RELEASE_EVERY_DAYS).
static func link_order(sets: Dictionary, order: Array) -> void:
	for i in order.size():
		var s: Dictionary = sets[order[i]]
		s.release_index = i
		s.prev = sets[order[i - 1]] if i > 0 else null
		s.next_id = order[i + 1] if i + 1 < order.size() else null


static func _num(v, fallback: float) -> float:
	if v is float or v is int:
		return float(v)
	if v is String and v.is_valid_float():
		return v.to_float()
	return fallback


static func _str(v) -> String:
	# JSON numbers arrive as floats; print whole numbers without ".0", as JS does.
	if v is float and v == floorf(v):
		return str(int(v))
	return str(v)


static func normalize_set(raw: Dictionary):
	if not raw.get("id") or not raw.get("name") or not raw.get("booster") is Dictionary \
			or not raw.get("rarities") is Dictionary or not raw.get("cards") is Array:
		return null
	var rarity_order: Array = raw.rarities.keys()
	var rarities := {}
	for i in rarity_order.size():
		var key: String = rarity_order[i]
		var r: Dictionary = raw.rarities[key]
		var rname: String = r.get("name") if r.get("name") else key
		rarities[key] = {
			"key": key,
			"rank": i,
			"name": rname,
			"short": r.get("short") if r.get("short") else rname.substr(0, 1).to_upper(),
			"value": _num(r.get("value"), 0.0),
			"color": r.get("color") if r.get("color") else "#999",
		}
	var booster: Dictionary = raw.booster
	var slots := []
	for s in booster.get("slots", []):
		slots.append({
			"count": int(s.get("count")) if s.get("count") else 1,
			"rarity": s.get("rarity") if s.get("rarity") else null,
			"weights": s.get("weights") if s.get("weights") else null,
		})
	var wholesale := _num(booster.get("wholesalePrice"), 0.0)
	var cset := {
		"id": _str(raw.id),
		"name": raw.name,
		"game": raw.get("game") if raw.get("game") else "",
		"theme": raw.get("theme") if raw.get("theme") else (raw.get("game") if raw.get("game") else "default"),
		"release_year": raw.get("releaseYear") if raw.get("releaseYear") else null,
		"booster_image": raw.get("boosterImage") if raw.get("boosterImage") else null,
		"booster": {"wholesale_price": wholesale if wholesale else 1.0, "slots": slots},
		"rarities": rarities,
		"rarity_order": rarity_order,
		"reprint_factor": _num(raw.get("reprintFactor"), 0.5) if raw.get("reprintFactor") != null else 0.5,
		"cards": [],
		"by_id": {},
		"by_rarity": {},
	}
	for key in rarity_order:
		cset.by_rarity[key] = []
	var cards: Array = raw.cards.duplicate()
	# Stable sort by index, like Array.prototype.sort in JS.
	var indexed := []
	for i in cards.size():
		indexed.append([_num(cards[i].get("index"), 0.0) if cards[i] is Dictionary else 0.0, i])
	indexed.sort_custom(func(a, b): return a[0] < b[0] or (a[0] == b[0] and a[1] < b[1]))
	for pair in indexed:
		var c = cards[pair[1]]
		if not c is Dictionary or not c.get("id") or not c.get("name") or not rarities.has(c.get("rarity")):
			push_warning("Collection %s: card skipped (needs id, name and a known rarity)" % cset.id)
			continue
		var cid := _str(c.id)
		if cset.by_id.has(cid):
			push_warning("Collection %s: duplicate card id %s" % [cset.id, cid])
			continue
		var own_value = _num(c.value, 0.0) if c.get("value") != null else null
		var card := {
			"set_id": cset.id,
			"index": c.get("index"),
			"id": cid,
			"number": _str(c.number) if c.get("number") else "",
			"name": c.name,
			"rarity": c.rarity,
			"foil": bool(c.get("foil", false)),
			"image": c.get("image") if c.get("image") else null,
			"own_value": own_value,
			"value": own_value if own_value != null else rarities[c.rarity].value,
			"reprint_of": c.get("reprintOf") if c.get("reprintOf") else null,
			"extra": c.get("extra") if c.get("extra") else null,
		}
		cset.cards.append(card)
		cset.by_id[cid] = card
		cset.by_rarity[card.rarity].append(card)
	return cset


## A reprint without its own value is worth the original's value x reprintFactor.
static func resolve_reprints(sets: Dictionary) -> void:
	for cset in sets.values():
		for card in cset.cards:
			if card.reprint_of == null:
				continue
			var parts: PackedStringArray = card.reprint_of.split(":")
			var orig = null
			if parts.size() == 2 and sets.has(parts[0]):
				orig = sets[parts[0]].by_id.get(parts[1])
			if orig == null:
				push_warning("Reprint %s:%s points to unknown %s" % [cset.id, card.id, card.reprint_of])
				continue
			if card.own_value == null:
				card.value = orig.value * cset.reprint_factor


## Search filter (data.js cardFilter): words match the card or collection name,
## numbers match the card number. Returns func(card, set) -> bool.
static func card_filter(query: String) -> Callable:
	var words := query.to_lower().split(" ", false)
	if words.is_empty():
		return func(_c, _s): return true
	var nums: Array = []
	var full: Array = []
	var names: Array = []
	var re_num := RegEx.create_from_string("^#?\\d+$")
	var re_full := RegEx.create_from_string("^\\d+/\\d+$")
	for w in words:
		if re_num.search(w):
			nums.append(int(w.replace("#", "")))
		elif re_full.search(w):
			full.append(w)
		else:
			names.append(w)
	return func(card, cset):
		var nm: String = card.name.to_lower()
		var sn: String = cset.name.to_lower() if cset else ""
		for w in names:
			if not (w in nm or w in sn):
				return false
		var n: int = _lead_int(card.get("number", ""))
		if n == 0:
			n = int(card.index)
		for x in nums:
			if x != n:
				return false
		for x in full:
			if String(card.get("number", "")).to_lower() != x:
				return false
		return true


static func _lead_int(s) -> int:
	var t := String(s)
	var i := 0
	while i < t.length() and t[i] >= "0" and t[i] <= "9":
		i += 1
	return t.substr(0, i).to_int() if i > 0 else 0


## How much a pulled card is celebrated: "big", "highlight" or "quiet".
static func celebration(cset: Dictionary, card: Dictionary) -> String:
	var rank: int = cset.rarities[card.rarity].rank
	var top: int = cset.rarity_order.size() - 1
	if card.get("foil", false) or (rank == top and top >= 2):
		return "big"
	if rank >= maxi(2, top - 1):
		return "highlight"
	return "quiet"
