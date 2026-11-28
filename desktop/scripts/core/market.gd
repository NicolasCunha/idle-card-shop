class_name Market
## Deterministic daily market, ported line by line from js/market.js (GDD section 8).
##
## Price of a card on a day = base value x day multiplier. The multiplier depends
## only on (seed, card, day number), so nothing about card prices is saved.
## Components, summed in log space: card noise (9 and 23 day waves), collection
## trend (35 day waves) and interest events (rise, plateau, fall, residual).
## Reprints share the original's events at REPRINT_HYPE_FACTOR strength.
##
## The hash must match JS bit for bit: tests/ref/market_ref.json holds JS output.

const LEGACY_SEED := "idlecardshop-market-v1"
const EVENT_WINDOW := 40
const EVENT_CHANCE := 0.22
const EVENT_LOOKBACK := 10
const REPRINT_HYPE_FACTOR := 0.6
const LOG_CAP := 1.1
## Market days (Nicolas, 2026-11-27): one global clock, a new day every 10 minutes.
const DAY_MS := 10 * 60 * 1000
const CARD_CACHE_DAYS := 64

const NEWS_UP := [
	"{card} appeared on a TV show",
	"{card} went viral online",
	"A tournament champion played {card}",
	"A famous streamer opened a {card}",
	"Collectors are chasing {card}",
	"{card} showed up in a movie",
]
const NEWS_DOWN := [
	"A large lot of {card} hit the market",
	"Collector interest in {card} cooled",
	"Fake {card} cards are flooding the market",
]

const _M32 := 0xFFFFFFFF

static var _seed: String = LEGACY_SEED
static var _gen := 0 # bumps when the seed changes; invalidates per-card caches
static var _events: Dictionary = {}


static func set_seed(seed) -> void:
	var next: String = seed if seed is String and seed != "" else LEGACY_SEED
	if next != _seed:
		_seed = next
		_gen += 1
		_events.clear()


static func get_seed() -> String:
	return _seed


# ---------- Hash (cyrb53, as in JS) ----------

## Math.imul on unsigned 32-bit values, without 64-bit overflow.
static func _imul(a: int, b: int) -> int:
	var lo := (a * (b & 0xFFFF)) & _M32
	var hi := ((a * (b >> 16)) & 0xFFFF) << 16
	return (lo + hi) & _M32


## cyrb53 over UTF-16 code units; returns an integer below 2^53.
static func hash53(s: String) -> int:
	var h1 := 0xdeadbeef
	var h2 := 0x41c6ce57
	var units := s.to_utf16_buffer()
	for i in range(0, units.size(), 2):
		var ch := units[i] | (units[i + 1] << 8)
		h1 = _imul(h1 ^ ch, 2654435761)
		h2 = _imul(h2 ^ ch, 1597334677)
	h1 = _imul(h1 ^ (h1 >> 16), 2246822507) ^ _imul(h2 ^ (h2 >> 13), 3266489909)
	h2 = _imul(h2 ^ (h2 >> 16), 2246822507) ^ _imul(h1 ^ (h1 >> 13), 3266489909)
	return 4294967296 * (2097151 & h2) + h1


## Seeded random in [0, 1) from parts. Parts must be Strings or ints, never floats,
## so they print the way JS joins them.
static func rand(parts: Array) -> float:
	var strs := PackedStringArray()
	for p in parts:
		strs.append(str(p))
	return hash53(_seed + "|" + "|".join(strs)) / 9007199254740992.0


static func smooth(t: float) -> float:
	if t <= 0.0:
		return 0.0
	if t >= 1.0:
		return 1.0
	return t * t * (3.0 - 2.0 * t)


static func smooth_noise(key: String, day: int, period: int, amp: float) -> float:
	var q := float(day) / period
	var i := floori(q)
	var t := q - i
	var a := rand([key, period, i]) * 2.0 - 1.0
	var b := rand([key, period, i + 1]) * 2.0 - 1.0
	return amp * (a + (b - a) * smooth(t))


## JS Math.round: half rounds up.
static func js_round(x: float) -> int:
	return floori(x + 0.5)


# ---------- Market day ----------

static func day_number(now_ms: int) -> int:
	return floori(float(now_ms) / DAY_MS)


static func day_label(day: int, first_day = null) -> String:
	var first: int = day if first_day == null else int(first_day)
	return "Day %s" % Fmt.num(day - first + 1)


static func ms_until_next_day(now_ms: int) -> int:
	return DAY_MS - (now_ms % DAY_MS)


# ---------- Events ----------
# Fixed per (seed, card, window): computed once and cached (web 1.9.3).

static func _event_for_window(key: String, w: int):
	var k := key + "|" + str(w)
	if _events.has(k):
		return _events[k]
	if _events.size() > 400000:
		_events.clear()
	var ev = _make_event(key, w)
	_events[k] = ev
	return ev


static func _make_event(key: String, w: int):
	if rand([key, "ev", w]) >= EVENT_CHANCE:
		return null
	var up := rand([key, "up", w]) < 0.7
	var r := rand([key, "mag", w])
	var mag := (0.15 + r * r * 0.85) if up else -(0.1 + r * 0.3)
	var lm := log(1.0 + mag)
	var rise := js_round(maxf(7.0, absf(lm) * 45.0) + rand([key, "rise", w]) * 10.0)
	var plateau := floori(rand([key, "plat", w]) * 25.0)
	var fall := js_round(maxf(10.0, absf(lm) * 55.0) + rand([key, "fall", w]) * 30.0)
	var residual := rand([key, "res", w]) * 0.5
	var residual_decay := 60 + floori(rand([key, "rdec", w]) * 120.0)
	var start := w * EVENT_WINDOW + floori(rand([key, "start", w]) * EVENT_WINDOW)
	var pool: Array = NEWS_UP if up else NEWS_DOWN
	var news: String = pool[floori(rand([key, "news", w]) * pool.size())]
	return {
		"start": start, "lm": lm, "mag": mag, "rise": rise, "plateau": plateau,
		"fall": fall, "residual": residual, "residual_decay": residual_decay, "news": news,
	}


static func _event_shape(ev: Dictionary, day: int) -> float:
	var x: int = day - ev.start
	if x < 0:
		return 0.0
	if x < ev.rise:
		return smooth(float(x) / ev.rise)
	var after_plat: int = ev.rise + ev.plateau
	if x < after_plat:
		return 1.0
	if x < after_plat + ev.fall:
		return 1.0 - (1.0 - ev.residual) * smooth(float(x - after_plat) / ev.fall)
	return ev.residual * (1.0 - smooth(float(x - after_plat - ev.fall) / ev.residual_decay))


static func _events_around(key: String, day: int) -> Array:
	var w0 := floori(float(day) / EVENT_WINDOW)
	var out := []
	for w in range(w0 - EVENT_LOOKBACK, w0 + 1):
		var ev = _event_for_window(key, w)
		if ev != null:
			out.append(ev)
	return out


# ---------- API ----------

static func _group_key(cset: Dictionary, card: Dictionary) -> String:
	return card.reprint_of if card.reprint_of != null else "%s:%s" % [cset.id, card.id]


static func card_log_multiplier(cset: Dictionary, card: Dictionary, day: int) -> float:
	var own := "%s:%s" % [cset.id, card.id]
	var lm := smooth_noise(own, day, 9, 0.025) + smooth_noise(own, day, 23, 0.05)
	lm += smooth_noise("set:" + cset.id, day, 35, 0.08)
	var hype := REPRINT_HYPE_FACTOR if card.reprint_of != null else 1.0
	for ev in _events_around(_group_key(cset, card), day):
		lm += ev.lm * _event_shape(ev, day) * hype
	# Soft cap: overlapping events stay within ~3x and ~1/3 of base value.
	return LOG_CAP * tanh(lm / LOG_CAP)


## Per-card cache of recent days (card._mc, runtime only; web 1.9.3).
static func card_multiplier(cset: Dictionary, card: Dictionary, day: int) -> float:
	var m: Dictionary
	if not card.has("_mc") or card.get("_mc_gen", -1) != _gen:
		m = {}
		card["_mc"] = m
		card["_mc_gen"] = _gen
	else:
		m = card["_mc"]
	if m.has(day):
		return m[day]
	if m.size() >= CARD_CACHE_DAYS:
		m.clear()
	var v := exp(card_log_multiplier(cset, card, day))
	m[day] = v
	return v


static func market_value(cset: Dictionary, card: Dictionary, day: int) -> float:
	return card.value * card_multiplier(cset, card, day)


static func history(cset: Dictionary, card: Dictionary, day: int, days: int = 30) -> Array:
	var out := []
	for d in range(day - days + 1, day + 1):
		out.append(market_value(cset, card, d))
	return out


## News: events for this card that started in the last `recent` days.
static func news_for(cset: Dictionary, card: Dictionary, day: int, recent: int = 3) -> Array:
	var items := []
	for ev in _events_around(_group_key(cset, card), day):
		var x: int = day - ev.start
		if x >= 0 and x < recent:
			items.append({"set": cset, "card": card, "day": ev.start,
				"kind": "up" if ev.mag > 0 else "down", "text": ev.news})
	return items
