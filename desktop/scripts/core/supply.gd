class_name Supply
## Booster supply and release calendar, ported from js/supply.js
## (docs/sdd/booster-supply.md). Daily world dice come from the seeded hash of
## (seed, collection, days since release). The supply lives in the save.

const RELEASE_EVERY_DAYS := 12
const BASE_PRINT_RUN := 1000000
const PRINT_GROWTH := 1.25
const PRINT_CAP := 2.0
const PLAYER_MARGIN := 0.1
const DISTRIBUTOR_EXPONENT := 0.25
const MARKET_EXPONENT := 0.5
const MARKET_SWING := 0.06
const MIN_LEFT_FRAC := 0.02
const MARKET_BUY_RATE := 1.1
const MARKET_SELL_RATE := 0.9
const HISTORY_DAYS := 30

const RIVALS := [0.006, 0.005, 0.0045, 0.004, 0.0035, 0.003, 0.003, 0.0025, 0.0025, 0.002,
	0.002, 0.0018, 0.0015, 0.0015, 0.0012, 0.001, 0.001, 0.0008, 0.0006, 0.0005]
const RIVAL_BUY_CHANCE := 0.6
const HYPE_DAYS := 66.0
const RETURN_CHANCE := 0.12
const RETURN_MAX := 0.008
const REPRINT_BELOW := 0.35
const REPRINT_CHANCE := 0.03
const REPRINT_MIN := 0.32
const REPRINT_MAX := 0.64
const BIG_BUY := 0.006


# ---------- Calendar ----------

## Market day a collection comes out; INF before the save's first day.
## state._releaseAll (debug, never saved) brings every later release to that day.
static func release_day(state: Dictionary, cset: Dictionary) -> float:
	if state.firstDay == null:
		return INF
	var day: float = state.firstDay + cset.get("release_index", 0) * RELEASE_EVERY_DAYS
	if state.get("_releaseAll") != null:
		return minf(day, maxf(state.firstDay, state._releaseAll))
	return day


static func is_released(state: Dictionary, cset: Dictionary) -> bool:
	return JS.truthy(state.day) and state.day >= release_day(state, cset)


static func print_run(cset: Dictionary) -> int:
	var i: int = cset.get("release_index", 0)
	return int(JS.round(BASE_PRINT_RUN * minf(PRINT_CAP, pow(PRINT_GROWTH, i))))


# ---------- Supply state ----------
# state.market[setId] = { run, printed, left, held, reprints, age, hist, out }

static func supply_of(state: Dictionary, cset: Dictionary) -> Dictionary:
	var m = state.market.get(cset.id)
	if m == null:
		var run := print_run(cset)
		m = {"run": run, "printed": run, "left": run, "held": 0, "reprints": 0, "age": 0, "hist": [], "out": false}
		state.market[cset.id] = m
		m.hist.append(scarcity(m))
	return m


## printed / left, capped, rounded to 4 decimals.
static func scarcity(m: Dictionary) -> float:
	return JS.round(1.0 / maxf(MIN_LEFT_FRAC, float(m.left) / m.printed) * 10000.0) / 10000.0


static func price_of(cset: Dictionary, m: Dictionary) -> float:
	return cset.booster.wholesale_price * pow(scarcity(m), DISTRIBUTOR_EXPONENT)


static func _swing(cset: Dictionary, day: int) -> float:
	return exp(Market.smooth_noise("booster:" + cset.id, day, 5, MARKET_SWING) \
		+ Market.smooth_noise("booster:" + cset.id, day, 13, MARKET_SWING))


static func _market_at(cset: Dictionary, s: float, day: int) -> float:
	return cset.booster.wholesale_price * pow(s, MARKET_EXPONENT) * _swing(cset, day)


static func market_value_of(cset: Dictionary, m: Dictionary, day: int) -> float:
	return _market_at(cset, scarcity(m), day)


static func market_value_ago(cset: Dictionary, m: Dictionary, day: int, back: int) -> float:
	var h: Array = m.hist
	if h.is_empty():
		return market_value_of(cset, m, day)
	var i := maxi(0, h.size() - 1 - back)
	return _market_at(cset, h[i], day - (h.size() - 1 - i))


static func _reprint_size(cset: Dictionary, k: int) -> float:
	return REPRINT_MIN + (REPRINT_MAX - REPRINT_MIN) * Market.rand(["supply", cset.id, "reprint", k])


## One market day for one collection. Returns news items.
static func step_day(cset: Dictionary, m: Dictionary, latest: bool = true) -> Array:
	m.age = int(m.age) + 1
	var age: int = m.age
	var news := []
	var hype := 0.2 + 0.8 * exp(-age / HYPE_DAYS)
	if m.held > 0 and Market.rand(["supply", cset.id, age, "ret"]) < RETURN_CHANCE:
		var n := minf(m.held, JS.round(m.run * RETURN_MAX * Market.rand(["supply", cset.id, age, "retn"])))
		m.held -= n
		m.left += n
	var floor_v: float = m.printed * PLAYER_MARGIN
	for i in RIVALS.size():
		if Market.rand(["supply", cset.id, age, "buy", i]) >= RIVAL_BUY_CHANCE:
			continue
		var want := JS.round(m.run * RIVALS[i] * hype * (0.5 + Market.rand(["supply", cset.id, age, "amt", i])))
		var n := maxf(0.0, minf(want, floorf(m.left - floor_v)))
		if n == 0:
			continue
		m.left -= n
		m.held += n
		if n >= m.run * BIG_BUY:
			news.append({"kind": "rival", "rival": i, "n": n})
	if float(m.left) / m.printed < REPRINT_BELOW and Market.rand(["supply", cset.id, age, "rep"]) < REPRINT_CHANCE:
		var f := _reprint_size(cset, int(m.reprints))
		if not latest:
			for k in int(m.reprints):
				f = minf(f, _reprint_size(cset, k))
			if m.reprints:
				f = minf(f, float(m.printed - m.run) / m.reprints / m.run)
		var n := JS.round(m.run * f)
		m.printed += n
		m.left += n
		m.reprints = int(m.reprints) + 1
		news.append({"kind": "reprint", "n": n})
	m.hist.append(scarcity(m))
	if m.hist.size() > HISTORY_DAYS:
		m.hist = m.hist.slice(m.hist.size() - HISTORY_DAYS)
	return news
