class_name SmoothBar
extends ProgressBar
## Progress bar that moves every frame. The game state only changes at 4 Hz, so
## the bar estimates the fill rate from the last two updates and keeps moving
## between them; it snaps when the value drops (a job finished) or with
## Reduce motion.

var _target := 0.0
var _rate := 0.0
var _since := 0.0
var _have := false


func _ready() -> void:
	set_process(false)


func set_target(v: float) -> void:
	v = clampf(v, 0.0, 1.0)
	if not _have or App.prefs.get("reduceMotion", false) or v < _target - 0.001:
		_rate = 0.0
		value = v
	elif _since > 0.05:
		_rate = clampf((v - _target) / _since, 0.0, 4.0)
	_target = v
	_since = 0.0
	_have = true
	set_process(_rate > 0.0 or absf(value - _target) > 0.0005)


func _process(delta: float) -> void:
	_since += delta
	var want := minf(1.0, _target + _rate * minf(_since, 0.5))
	value = lerpf(value, want, 1.0 - exp(-18.0 * delta))
	if _rate == 0.0 and absf(value - _target) < 0.0005:
		value = _target
		set_process(false)
