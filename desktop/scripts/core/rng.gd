class_name Rng
extends RefCounted
## Random numbers for the rules. Default: Godot's RNG. Tests use the seeded
## generator from game.js (mulberry32) so runs match the JS build exactly.

var _seeded := false
var _a := 0
var _rng := RandomNumberGenerator.new()


static func seeded(seed: int) -> Rng:
	var r := Rng.new()
	r._seeded = true
	r._a = seed & 0xFFFFFFFF
	return r


func next() -> float:
	if not _seeded:
		return _rng.randf()
	_a = (_a + 0x6d2b79f5) & 0xFFFFFFFF
	var t := _a
	t = Market._imul(t ^ (t >> 15), t | 1)
	t ^= (t + Market._imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
	return float((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
