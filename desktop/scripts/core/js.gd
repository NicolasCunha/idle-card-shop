class_name JS
## Helpers that reproduce JavaScript behaviour the ported rules depend on.


## Object key order: integer-like keys ascending first, then the others in
## insertion order (ECMAScript OrdinaryOwnPropertyKeys).
static func keys(d: Dictionary) -> Array:
	var ints := []
	var rest := []
	for k in d.keys():
		var s := str(k)
		if s.is_valid_int() and (s == "0" or (not s.begins_with("0") and not s.begins_with("-") and not s.begins_with("+"))) and s.to_int() < 4294967295:
			ints.append(s)
		else:
			rest.append(k)
	if ints.is_empty():
		return rest
	ints.sort_custom(func(a, b): return a.to_int() < b.to_int())
	return ints + rest


## Math.round: halves round up.
static func round(x: float) -> float:
	return floorf(x + 0.5)


## Number.prototype.toFixed for small digit counts (display only).
static func to_fixed(x: float, digits: int) -> String:
	return ("%." + str(digits) + "f") % x


## Truthiness of a value as JS sees it.
static func truthy(v) -> bool:
	if v == null:
		return false
	if v is bool:
		return v
	if v is int or v is float:
		return v != 0 and not is_nan(float(v))
	if v is String:
		return v != ""
	return true


## Number(x) || 0 for a value that may be missing.
static func num(v) -> float:
	if v is int or v is float:
		return 0.0 if is_nan(float(v)) else float(v)
	if v is bool:
		return 1.0 if v else 0.0
	return 0.0


## Deep copy without runtime keys (those starting with "_"), like stripTransient.
static func strip(v):
	if v is Dictionary:
		var out := {}
		for k in v.keys():
			if str(k).begins_with("_"):
				continue
			out[k] = strip(v[k])
		return out
	if v is Array:
		var a := []
		for x in v:
			a.append(strip(x))
		return a
	return v
