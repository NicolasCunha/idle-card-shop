class_name Sound
extends Node
## Calm music and sound effects, synthesised like js/audio.js (no audio files):
## each sound is rendered once on a worker thread into a sample buffer, then
## played on a Music bus (low-pass and echo) or an Effects bus.

const RATE := 22050
const PENTA := [0, 2, 4, 7, 9]
const ROOT := 196.0
const CHORDS := [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [2, 5, 9]]

var _wavs := {} # name -> AudioStreamWAV
var _ready_flag := false
var _mutex := Mutex.new()
var _rendered := {}
var _music: AudioStreamPlayer
var _fx: AudioStreamPlayer
var _bar := 0
var _bar_t := 0.0
var _last_sale := -1e9
var _notes: Array = [] # [time_left, name]
var prefs: Dictionary


static func hz(semi: float) -> float:
	return ROOT * pow(2.0, semi / 12.0)


func _ready() -> void:
	_make_buses()
	_music = AudioStreamPlayer.new()
	_music.bus = "Music"
	_music.max_polyphony = 12
	add_child(_music)
	_fx = AudioStreamPlayer.new()
	_fx.bus = "Effects"
	_fx.max_polyphony = 8
	add_child(_fx)


## Renders every sound on a worker thread (after loading, so it does not slow it).
func start() -> void:
	WorkerThreadPool.add_task(_render_all, false, "Render sounds")


func _make_buses() -> void:
	for name in ["Music", "Effects"]:
		if AudioServer.get_bus_index(name) >= 0:
			continue
		var i := AudioServer.bus_count
		AudioServer.add_bus(i)
		AudioServer.set_bus_name(i, name)
		AudioServer.set_bus_send(i, "Master")
		if name == "Music":
			var lp := AudioEffectLowPassFilter.new()
			lp.cutoff_hz = 1800
			AudioServer.add_bus_effect(i, lp)
			var d := AudioEffectDelay.new()
			d.dry = 1.0
			d.tap1_active = true
			d.tap1_delay_ms = 450
			d.tap1_level_db = -10
			d.tap2_active = false
			d.feedback_active = true
			d.feedback_delay_ms = 450
			d.feedback_level_db = -10.5
			AudioServer.add_bus_effect(i, d)


func set_prefs(p: Dictionary) -> void:
	prefs = p
	var vol := func(v, muted): return 0.0 if muted else float(v) / 100.0
	_set_db(0, vol.call(p.master, p.muteMaster))
	_set_db(AudioServer.get_bus_index("Music"), vol.call(p.music, p.muteMusic) * 0.35)
	_set_db(AudioServer.get_bus_index("Effects"), vol.call(p.effects, p.muteEffects) * 0.6)


func _set_db(bus: int, lin: float) -> void:
	if bus < 0:
		return
	AudioServer.set_bus_mute(bus, lin <= 0.0001)
	AudioServer.set_bus_volume_db(bus, linear_to_db(maxf(lin, 0.0001)))


# ---------- Rendering ----------

## One voice: sine, triangle or square with a linear attack and an
## exponential release, like tone() in audio.js.
func _tone(buf: PackedFloat32Array, freq: float, start: float, type: String, gain: float, attack: float, release: float) -> void:
	var s0 := int(start * RATE)
	var n := int((release + 0.05) * RATE)
	if buf.size() < s0 + n:
		buf.resize(s0 + n)
	var ph := 0.0
	var step := freq / RATE
	var k := log(0.0001 / gain) / maxf(0.001, release - attack)
	for i in n:
		var t := float(i) / RATE
		var env := gain * t / attack if t < attack else gain * exp(k * (t - attack))
		var v: float
		match type:
			"triangle": v = 4.0 * absf(ph - floorf(ph + 0.5)) - 1.0
			"square": v = 1.0 if fmod(ph, 1.0) < 0.5 else -1.0
			_: v = sin(TAU * ph)
		buf[s0 + i] += v * env
		ph += step


## Band-passed noise burst that fades out (noise() in audio.js).
func _noise(buf: PackedFloat32Array, start: float, dur: float, gain: float, freq: float, q: float) -> void:
	var s0 := int(start * RATE)
	var n := int(dur * RATE)
	if buf.size() < s0 + n:
		buf.resize(s0 + n)
	var w0 := TAU * freq / RATE
	var alpha := sin(w0) / (2.0 * q)
	var a0 := 1.0 + alpha
	var b0 := alpha / a0
	var b2 := -alpha / a0
	var a1 := -2.0 * cos(w0) / a0
	var a2 := (1.0 - alpha) / a0
	var x1 := 0.0
	var x2 := 0.0
	var y1 := 0.0
	var y2 := 0.0
	var rng := RandomNumberGenerator.new()
	rng.seed = int(freq * 1000 + dur * 100)
	for i in n:
		var x := (rng.randf() * 2.0 - 1.0) * (1.0 - float(i) / n)
		var y := b0 * x + b2 * x2 - a1 * y1 - a2 * y2
		x2 = x1
		x1 = x
		y2 = y1
		y1 = y
		buf[s0 + i] += y * gain


func _wav(buf: PackedFloat32Array) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(buf.size() * 2)
	for i in buf.size():
		bytes.encode_s16(i * 2, int(clampf(buf[i], -1.0, 1.0) * 32767.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = bytes
	return w


func _render_all() -> void:
	var out := {}
	var b := PackedFloat32Array()
	_tone(b, 660, 0, "triangle", 0.08, 0.01, 0.06)
	out.click = b
	b = PackedFloat32Array()
	_tone(b, 988, 0, "square", 0.04, 0.01, 0.1)
	_tone(b, 1319, 0.07, "square", 0.035, 0.01, 0.25)
	out.coin = b
	b = PackedFloat32Array()
	_tone(b, 1175, 0, "sine", 0.06, 0.01, 0.3)
	_tone(b, 1568, 0.06, "sine", 0.04, 0.01, 0.4)
	out.sale = b
	b = PackedFloat32Array()
	_noise(b, 0, 0.35, 0.35, 2500, 0.6)
	_noise(b, 0.05, 0.25, 0.2, 5000, 1.0)
	out.tear = b
	b = PackedFloat32Array()
	_noise(b, 0, 0.12, 0.18, 1800, 1.5)
	out.slide = b
	b = PackedFloat32Array()
	_tone(b, hz(19), 0, "sine", 0.08, 0.01, 0.8)
	out.highlight = b
	b = PackedFloat32Array()
	var semis := [12, 16, 19, 24]
	for i in semis.size():
		_tone(b, hz(semis[i]), i * 0.07, "sine", 0.07, 0.01, 1.6)
	_tone(b, hz(31), 0.3, "triangle", 0.03, 0.01, 1.2)
	out.big = b
	for i in CHORDS.size():
		b = PackedFloat32Array()
		for s in CHORDS[i]:
			_tone(b, hz(s - 12), 0, "sine", 0.07, 2.5, 8)
		_tone(b, hz(CHORDS[i][0] - 24), 0, "triangle", 0.05, 3, 8)
		out["chord%d" % i] = b
	for s in PENTA:
		for oct in [0, 12]:
			b = PackedFloat32Array()
			_tone(b, hz(s + oct), 0, "sine", 0.045, 0.04, 3)
			out["note%d" % (s + oct)] = b
	var wavs := {}
	for k in out:
		wavs[k] = _wav(out[k])
	_mutex.lock()
	_rendered = wavs
	_mutex.unlock()


func _process(delta: float) -> void:
	if not _ready_flag:
		_mutex.lock()
		if _rendered.size():
			_wavs = _rendered
			_ready_flag = true
		_mutex.unlock()
		if not _ready_flag:
			return
		_bar_t = 0.0
		_play_bar()
	_bar_t += delta
	if _bar_t >= 7.0:
		_bar_t -= 7.0
		_play_bar()
	for n in _notes:
		n[0] -= delta
	while _notes.size() and _notes[0][0] <= 0:
		_play(_music, _notes.pop_front()[1])


func _play_bar() -> void:
	_play(_music, "chord%d" % (_bar % CHORDS.size()))
	var count := 2 + randi() % 3
	for i in count:
		if randf() < 0.3:
			continue
		var semi: int = PENTA[randi() % PENTA.size()] + (0 if randf() < 0.5 else 12)
		_notes.append([0.8 + i * (1.2 + randf() * 1.4), "note%d" % semi])
	_notes.sort_custom(func(a, b): return a[0] < b[0])
	_bar += 1


func _play(player: AudioStreamPlayer, name: String) -> void:
	if not _wavs.has(name):
		return
	var pb: AudioStreamPlaybackPolyphonic = player.get_stream_playback() if player.playing else null
	if pb == null:
		player.stream = AudioStreamPolyphonic.new()
		player.stream.polyphony = player.max_polyphony
		player.play()
		pb = player.get_stream_playback()
	pb.play_stream(_wavs[name])


func sfx(name: String) -> void:
	if not _ready_flag:
		return
	if name == "sale":
		var now := Time.get_ticks_msec()
		if now - _last_sale < 3500:
			return
		_last_sale = now
	_play(_fx, name)
