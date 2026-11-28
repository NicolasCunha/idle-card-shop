class_name Game
## Game rules: state, economy, customers and staff, ported line by line from
## js/game.js. No nodes and no drawing here, so the same code runs live and
## during offline catch-up (GDD section 9).
##
## Flow: Distributor --buy--> Sealed stock --open--> Binder
##       --price--> Showcase --> customers buy (or bulk buyer for cheap spares)
##
## The state is a Dictionary with the same keys as the web save (camelCase), so
## saves move between builds unchanged. Keys starting with "_" are runtime caches.
## Integer maths: JS numbers are doubles, so divisions use floats here.

# ---------- Tunables (GDD sections 6 and 7) ----------
const START_MONEY := 20.0
const MAX_SKILL := 10
const SPEED_PER_LEVEL := 0.78
const BULK_RATE := 0.3
const MARKET_BUY_RATE := 1.1
const PRICE_LEVELS := [-0.1, -0.05, 0.0, 0.05, 0.1]
const BUY_CURVE := [[0.8, 1.0], [0.9, 0.95], [1.0, 0.9], [1.1, 0.75], [1.2, 0.6], [1.3, 0.45], [1.4, 0.15], [1.5, 0.05], [1.6, 0.01]]
const RICH_LENIENCE := 0.1
const FEELINGS := [
	{"key": "cheap", "upTo": 0.995},
	{"key": "fair", "upTo": 1.105},
	{"key": "pricey", "upTo": 1.305},
	{"key": "steep", "upTo": INF},
]
const FEEDBACK_SIZE := 200
const CUSTOMER_LOOKS := 3
const BUDGET_MIN := 2.0
const BUDGET_MAX := 120.0
const BASE_STORAGE := 20
const BASE_SHOWCASE := 40
const BASE_CUSTOMER_INTERVAL := 6.0
const LOG_SIZE := 40
const INBOX_SIZE := 60

const SKILLS := {"buy": {"base": 8.0}, "open": {"base": 10.0}, "price": {"base": 3.0}}
const SKILL_KEYS := ["buy", "open", "price"]

const UPGRADES := {
	"storage": {"baseCost": 40.0, "growth": 1.6, "max": 20},
	"showcase": {"baseCost": 60.0, "growth": 1.6, "max": 20},
	"marketing": {"baseCost": 80.0, "growth": 1.75, "max": 20},
	"reputation": {"baseCost": 120.0, "growth": 1.85, "max": 15},
	"staffRoom": {"baseCost": 150.0, "growth": 2.2, "max": 29, "softFrom": 8, "softGrowth": 1.35},
	"fame": {"baseCost": 200.0, "growth": 1.5, "max": 19, "start": 1},
}
const UPGRADE_KEYS := ["storage", "showcase", "marketing", "reputation", "staffRoom", "fame"]

const RICH_SHARE := 0.10
const RICH_SHARE_MAX := 0.35
const RICH_MAX := 1000.0
const FAME_CUSTOMERS := 0.03
const WANT_SHARE := 0.30
const WANT_DAYS := 6.0
const MILESTONES := [{"at": 0.25, "bonus": 0.02}, {"at": 0.5, "bonus": 0.04}, {"at": 0.75, "bonus": 0.06}, {"at": 1.0, "bonus": 0.10}]
const SALARY_PER_LEVEL := 2.0
const TENURE_BONUS := 0.01
const TENURE_MAX := 0.5
const DAY_SECONDS := Market.DAY_MS / 1000
const LEDGER_DAYS := 72
const BOX_SIZE := 36
const BOX_DISCOUNT := 0.9
const SEALED_SHARE := 0.25
const SEALED_LOOKS := 2
const SHELF_BASE := 20
const SHELF_PER_LEVEL := 10
const ACC_SWING := 0.05
const STORAGE_MAX := 10000.0
const BOX_SPACE := 10
const SEVERANCE_DAYS := 6
const RIVAL_NOTICE := 0.03

const CAMPAIGNS := {
	"flyers": {"cost": 500.0, "days": 1, "customers": 0.25, "budget": 0.0},
	"radio": {"cost": 5000.0, "days": 2, "customers": 0.5, "budget": 0.1},
	"tv": {"cost": 50000.0, "days": 3, "customers": 1.0, "budget": 0.25},
}
const WAREHOUSE := {"cost": 50000.0, "upgrade": 50000.0, "fee": 250.0, "space": 100000, "maxLevel": 10}
const SHIP_DAYS := [[1000.0, 1], [10000.0, 2], [INF, 3]]

const NAMES := ["Ada", "Ben", "Cleo", "Dev", "Eli", "Finn", "Gus", "Hana", "Ivy", "Jo", "Kai", "Lou",
	"Mae", "Nico", "Otto", "Pia", "Rae", "Sam", "Theo", "Uma", "Vic", "Wren",
	"Yara", "Zed", "Bea", "Cal", "Dot", "Ezra", "Faye", "Gil", "Iris", "June", "Lia", "Max", "Noor", "Ruth"]

# ---------- Randomness and listeners ----------
static var rng: Rng = Rng.new()
static var sale_listener: Callable = Callable()
static var customer_listener: Callable = Callable()
static var achievement_listener: Callable = Callable()
static var achievement_check: Callable = Callable()
static var quiet := false # true during offline catch-up: no sounds or floating text
static var _accessories := {}


static func set_random(r: Rng = null) -> void:
	rng = r if r != null else Rng.new()


static func _r() -> float:
	return rng.next()


# ---------- Formulas ----------

static func skill_duration(skill: String, lvl: int) -> float:
	return SKILLS[skill].base * pow(SPEED_PER_LEVEL, lvl - 1)


static func xp_to_next(lvl: int) -> float:
	return JS.round(25.0 * pow(lvl, 2.3))


static func train_cost(lvl: int) -> float:
	return JS.round(40.0 * pow(2.0, lvl))


static func train_time(lvl: int) -> float:
	return 20.0 * lvl


static func hire_cost(n: int) -> float:
	return JS.round(50.0 * pow(2.2, mini(n, 8)) * pow(1.35, maxi(0, n - 8)))


static func upgrade_cost(key: String, lvl: int) -> float:
	var u: Dictionary = UPGRADES[key]
	if not u.has("softFrom") or lvl <= u.softFrom:
		return JS.round(u.baseCost * pow(u.growth, lvl))
	return JS.round(u.baseCost * pow(u.growth, u.softFrom) * pow(u.softGrowth, lvl - u.softFrom))


static func series_cost(base: float, rate: float, k: int, n: int) -> float:
	return base * pow(rate, k) * (pow(rate, n) - 1.0) / (rate - 1.0)


static func storage_at(level: int) -> float:
	var curve := BASE_STORAGE * pow(STORAGE_MAX / BASE_STORAGE, float(level) / UPGRADES.storage.max)
	var v := maxf(BASE_STORAGE + 10.0 * level, curve)
	if v < 100:
		return JS.round(v)
	if v < 1000:
		return JS.round(v / 10.0) * 10.0
	return JS.round(v / 50.0) * 50.0


static func stock_capacity(s: Dictionary) -> float:
	return storage_at(int(s.upgrades.storage))


static func showcase_capacity(s: Dictionary) -> int:
	return BASE_SHOWCASE + 20 * int(s.upgrades.showcase)


static func max_staff(s: Dictionary) -> int:
	return 1 + int(s.upgrades.staffRoom)


static func customer_interval(s: Dictionary) -> float:
	var c = campaign_of(s)
	return BASE_CUSTOMER_INTERVAL / ((1.0 + 0.25 * s.upgrades.marketing) * (1.0 + FAME_CUSTOMERS * JS.num(s.upgrades.get("fame")))
		* (1.0 + (c.customers if c != null else 0.0)))


static func campaign_of(s: Dictionary):
	var c = s.get("campaign")
	if c is Dictionary and CAMPAIGNS.has(c.get("kind")) and JS.num(c.get("left")) > 0:
		return CAMPAIGNS[c.kind]
	return null


static func start_campaign(state: Dictionary, kind: String) -> bool:
	var c = CAMPAIGNS.get(kind)
	if c == null or campaign_of(state) != null or state.money < c.cost - 1e-9:
		return false
	_spend(state, c.cost, "marketing")
	state.campaign = {"kind": kind, "left": c.days * DAY_SECONDS}
	state.stats.campaigns += 1
	return true


static func rich_cap(fame: float) -> float:
	return BUDGET_MAX * pow(RICH_MAX / BUDGET_MAX, fame / UPGRADES.fame.max)


static func budget_cap(fame: float) -> float:
	return BUDGET_MAX * (1.0 + fame / UPGRADES.fame.max)


static func rich_share(fame: float) -> float:
	if fame > 0:
		return RICH_SHARE + (RICH_SHARE_MAX - RICH_SHARE) * (fame - 1.0) / (UPGRADES.fame.max - 1.0)
	return 0.0


static func _campaign_budget(state: Dictionary) -> float:
	var c = campaign_of(state)
	return c.budget if c != null else 0.0


static func customer_budget(state: Dictionary) -> float:
	var fame := JS.num(state.upgrades.get("fame"))
	var cap := budget_cap(fame)
	var boost := 1.0 + _campaign_budget(state)
	if fame > 0 and _r() < rich_share(fame):
		return boost * cap * pow(rich_cap(fame) / cap, _r())
	return boost * BUDGET_MIN * pow(cap / BUDGET_MIN, _r())


static func _is_rich(budget: float, state: Dictionary) -> bool:
	return budget > budget_cap(JS.num(state.upgrades.get("fame"))) * (1.0 + _campaign_budget(state))


static func _weigh(rich: bool, v: float) -> float:
	return v if rich else sqrt(v)


## The newest released collection past the first, and the share of customers
## who want it today (null outside the window).
static func wanted_set(state: Dictionary, sets: Dictionary):
	var best = null
	for cset in sets.values():
		if not (cset.release_index > 0) or not set_unlocked(state, cset):
			continue
		if best == null or cset.release_index > best.release_index:
			best = cset
	if best == null:
		return null
	var age: float = state.day - Supply.release_day(state, best)
	var share := WANT_SHARE * (1.0 - age / WANT_DAYS)
	return {"set": best, "share": share} if share > 0 else null


static func reputation_bonus(s: Dictionary) -> float:
	return 1.0 + 0.06 * s.upgrades.reputation


static func total_stock(s: Dictionary) -> float:
	var n := 0.0
	for v in s.stock.values():
		n += v
	return n


static func good_space(g: String) -> int:
	return BOX_SPACE if g.begins_with("x:") else 1


static func storage_used(s: Dictionary) -> float:
	var n := total_stock(s)
	for g in s.goods.keys():
		n += good_space(g) * s.goods[g]
	return n


static func storage_free(s: Dictionary) -> float:
	return maxf(0.0, stock_capacity(s) - storage_used(s))


# ---------- State ----------

static func new_seed() -> String:
	var b := Crypto.new().generate_random_bytes(16)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	var h := b.hex_encode()
	return "%s-%s-%s-%s-%s" % [h.substr(0, 8), h.substr(8, 4), h.substr(12, 4), h.substr(16, 4), h.substr(20, 12)]


static func now_ms() -> int:
	return int(Time.get_unix_time_from_system() * 1000.0)


static func new_state(sets: Dictionary, order: Array, now: int = -1) -> Dictionary:
	if now < 0:
		now = now_ms()
	var first: String = order[0] if order.size() > 0 else ""
	return {
		"seed": new_seed(),
		"money": START_MONEY,
		"stock": {},
		"binder": {},
		"seen": {},
		"showcase": [],
		"staff": [],
		"upgrades": {"storage": 0, "showcase": 0, "marketing": 0, "reputation": 0, "staffRoom": 0, "fame": 0},
		"rules": {
			"buySet": first,
			"openSet": first,
			"stockTarget": 10,
			"cashReserve": 20,
			"bulkBelow": 0.25,
			"keepCopies": 1,
			"priceLevel": 0,
		},
		"setupDone": false,
		"day": 0,
		"firstDay": null,
		"customerTimer": 3,
		"unlocked": {"priceList": false, "binder": false, "showcase": false, "upgrades": false, "staff": false, "market": false, "storage": false, "finances": false, "marketing": false, "properties": false},
		"tutorial": {"rev": 0, "done": [], "skipped": false, "base": {}},
		"flags": {"visited": {}},
		"stats": {
			"earned": 0, "spent": 0, "boostersBought": 0, "boostersOpened": 0, "cardsPriced": 0, "cardsListed": 0,
			"cardsSold": 0, "bulkSold": 0, "customers": 0, "missedCustomers": 0, "levelsGained": 0, "playTime": 0,
			"boostersSold": 0, "boostersBoughtMarket": 0,
			"sealedSold": 0, "boxesBought": 0, "boxesOpened": 0, "accessoriesBought": 0, "salariesPaid": 0,
			"campaigns": 0, "feesPaid": 0, "shipments": 0,
		},
		"campaign": null,
		"properties": {"warehouses": [], "goods": {}, "ships": [], "targets": {}},
		"goods": {},
		"shelf": [],
		"ledger": [],
		"achievements": {},
		"market": {},
		"inbox": [],
		"inboxRead": 0,
		"newsSeen": [],
		"log": [],
		"nextId": 1,
		"createdAt": now,
		"lastTick": now,
	}


# ---------- Market access ----------

static func day_at(_state: Dictionary, now: int) -> int:
	return Market.day_number(now)


## Per-card memo of today's market value.
static func market_value(state: Dictionary, cset: Dictionary, card: Dictionary) -> float:
	if card.get("_mvDay") != state.day:
		card["_mvDay"] = state.day
		card["_mv"] = Market.market_value(cset, card, int(state.day))
	return card["_mv"]


static func supply(state: Dictionary, cset: Dictionary) -> Dictionary:
	return Supply.supply_of(state, cset)


static func booster_price(state: Dictionary, cset: Dictionary) -> float:
	return Supply.price_of(cset, supply(state, cset))


static func market_booster_value(state: Dictionary, cset: Dictionary) -> float:
	return Supply.market_value_of(cset, supply(state, cset), int(state.day))


static func market_booster_buy_price(state: Dictionary, cset: Dictionary) -> float:
	return market_booster_value(state, cset) * Supply.MARKET_BUY_RATE


static func market_booster_sell_price(state: Dictionary, cset: Dictionary) -> float:
	return market_booster_value(state, cset) * Supply.MARKET_SELL_RATE


# ---------- Helpers ----------

static func _log(state: Dictionary, kind: String, text: String) -> void:
	state.log.push_front({"t": state.lastTick, "kind": kind, "text": text})
	if state.log.size() > LOG_SIZE:
		state.log.resize(LOG_SIZE)


static func _earn(state: Dictionary, v: float, cat: String) -> void:
	state.money += v
	state.stats.earned += v
	_book(state, "in", cat, v)


static func _spend(state: Dictionary, v: float, cat: String) -> void:
	state.money -= v
	state.stats.spent += v
	_book(state, "out", cat, v)


static func _book(state: Dictionary, side: String, cat: String, v: float) -> void:
	if not v:
		return
	var L: Array = state.ledger
	var e = L.back() if L.size() > 0 else null
	if e == null or e.day != state.day:
		e = {"day": state.day, "in": {}, "out": {}}
		L.append(e)
		if L.size() > LEDGER_DAYS:
			state.ledger = L.slice(L.size() - LEDGER_DAYS)
	e[side][cat] = JS.num(e[side].get(cat)) + v


static func collection_progress(state: Dictionary, cset: Dictionary) -> Dictionary:
	var seen: Dictionary = state.seen.get(cset.id, {})
	var n := 0
	for c in cset.cards:
		if seen.get(c.id):
			n += 1
	var total: int = cset.cards.size()
	return {"seen": n, "total": total, "frac": float(n) / total if total else 0.0}


static func milestone_bonus(state: Dictionary, cset: Dictionary) -> float:
	var frac: float = collection_progress(state, cset).frac
	var b := 0.0
	for m in MILESTONES:
		if frac >= m.at:
			b = m.bonus
	return b


static func set_unlocked(state: Dictionary, cset: Dictionary) -> bool:
	return Supply.is_released(state, cset)


static func released_sets(state: Dictionary, sets: Dictionary) -> Array:
	return sets.values().filter(func(s): return set_unlocked(state, s))


static func next_release(state: Dictionary, sets: Dictionary):
	for s in sets.values():
		if not set_unlocked(state, s):
			return s
	return null


static func _refresh_bonus(state: Dictionary, sets: Dictionary, set_id: String) -> void:
	if not state.has("_bonus"):
		state["_bonus"] = {}
	state._bonus[set_id] = milestone_bonus(state, sets[set_id])


# ---------- Notices (News panel) ----------

static func notify(state: Dictionary, kind: String, text: String, detail: String = "") -> void:
	var n := {"id": state.nextId, "day": state.day, "kind": kind, "text": text}
	state.nextId += 1
	if detail != "":
		n["detail"] = detail
	state.inbox.push_front(n)
	if state.inbox.size() > INBOX_SIZE:
		state.inbox.resize(INBOX_SIZE)


static func unread_notices(state: Dictionary) -> int:
	return state.inbox.filter(func(n): return n.id > state.inboxRead).size()


static func mark_notices_read(state: Dictionary) -> void:
	var m: float = state.inboxRead
	for n in state.inbox:
		m = maxf(m, n.id)
	state.inboxRead = m


static func _sale_multiplier(state: Dictionary, set_id: String) -> float:
	return reputation_bonus(state) * (1.0 + JS.num(state.get("_bonus", {}).get(set_id)))


# ---------- Actions: buy ----------

static func sold_out(state: Dictionary, cset: Dictionary) -> bool:
	return supply(state, cset).left < 1


## Where a purchase of `space` goes: "shop", "warehouse" once the shop is full,
## or "" when there is no room anywhere.
static func room_for(state: Dictionary, space: int = 1) -> String:
	if storage_free(state) >= space:
		return "shop"
	if warehouse_free(state) >= space:
		return "warehouse"
	return ""


static func _receive(state: Dictionary, g: String, n: float, where: String) -> void:
	if where == "warehouse":
		_add_warehouse(state, g, n)
	else:
		_add_goods(state, g, n)


static func can_buy_booster(state: Dictionary, cset: Dictionary, reserve: float = 0.0) -> bool:
	return set_unlocked(state, cset) and not sold_out(state, cset) and room_for(state) != "" \
		and state.money - booster_price(state, cset) >= reserve - 1e-9


static func buy_booster(state: Dictionary, cset: Dictionary, reserve: float = 0.0) -> bool:
	if not can_buy_booster(state, cset, reserve):
		return false
	_spend(state, booster_price(state, cset), "boosters")
	supply(state, cset).left -= 1
	_receive(state, "b:" + cset.id, 1, room_for(state))
	state.stats.boostersBought += 1
	return true


static func can_buy_market_booster(state: Dictionary, cset: Dictionary) -> bool:
	return set_unlocked(state, cset) and supply(state, cset).held >= 1 and room_for(state) != "" \
		and state.money >= market_booster_buy_price(state, cset) - 1e-9


static func buy_market_booster(state: Dictionary, cset: Dictionary) -> bool:
	if not can_buy_market_booster(state, cset):
		return false
	_spend(state, market_booster_buy_price(state, cset), "market")
	supply(state, cset).held -= 1
	_receive(state, "b:" + cset.id, 1, room_for(state))
	state.stats.boostersBoughtMarket += 1
	return true


static func sell_market_booster(state: Dictionary, cset: Dictionary) -> bool:
	if not (JS.num(state.stock.get(cset.id)) > 0) or not set_unlocked(state, cset):
		return false
	_earn(state, market_booster_sell_price(state, cset), "market")
	supply(state, cset).held += 1
	state.stock[cset.id] -= 1
	state.stats.boostersSold += 1
	return true


## n times one of the actions above; returns how many went through.
static func repeat(fn: Callable, state: Dictionary, cset: Dictionary, n: int) -> int:
	var k := 0
	while k < n and fn.call(state, cset):
		k += 1
	return k


static func buy_boosters(state: Dictionary, cset: Dictionary, n: int) -> int:
	var k := 0
	while k < n and buy_booster(state, cset):
		k += 1
	return k


# ---------- Actions: open ----------

static func _pick_weighted(weights: Dictionary) -> String:
	var keys := JS.keys(weights)
	var total := 0.0
	for k in keys:
		total += weights[k]
	var r := _r() * total
	for k in keys:
		r -= weights[k]
		if r <= 0:
			return k
	return keys.back()


static func roll_booster(cset: Dictionary) -> Array:
	var out := []
	for slot in cset.booster.slots:
		for i in int(slot.count):
			var rarity: String = _pick_weighted(slot.weights) if slot.weights != null else str(slot.rarity)
			var pool = cset.by_rarity.get(rarity)
			if pool == null or pool.is_empty():
				continue
			out.append(pool[floori(_r() * pool.size())])
	# Reveal order: most common first, rarest last (stable, like JS sort).
	var idx := []
	for i in out.size():
		idx.append([cset.rarities[out[i].rarity].rank, i])
	idx.sort_custom(func(a, b): return a[0] < b[0] or (a[0] == b[0] and a[1] < b[1]))
	var sorted := []
	for p in idx:
		sorted.append(out[p[1]])
	return sorted


## Opens one booster. Every card goes to the binder at once. Returns
## [{card, isNew}] or null.
static func open_booster(state: Dictionary, sets: Dictionary, cset: Dictionary):
	if not (JS.num(state.stock.get(cset.id)) > 0):
		return null
	state.stock[cset.id] -= 1
	state.stats.boostersOpened += 1
	if not state.seen.has(cset.id):
		state.seen[cset.id] = {}
	if not state.binder.has(cset.id):
		state.binder[cset.id] = {}
	var seen: Dictionary = state.seen[cset.id]
	var binder: Dictionary = state.binder[cset.id]
	var result := []
	var discovered := false
	for card in roll_booster(cset):
		var is_new := not JS.truthy(seen.get(card.id))
		if is_new:
			seen[card.id] = true
			discovered = true
		binder[card.id] = JS.num(binder.get(card.id)) + 1
		result.append({"card": card, "isNew": is_new})
	state["_binderVer"] = int(state.get("_binderVer", 0)) + 1
	if discovered:
		var before := JS.num(state.get("_bonus", {}).get(cset.id))
		_refresh_bonus(state, sets, cset.id)
		var after: float = state._bonus[cset.id]
		if after > before:
			_log(state, "milestone", "%s: %d%% discovered" % [cset.name, int(JS.round(collection_progress(state, cset).frac * 100.0))])
	return result


static func open_boosters(state: Dictionary, sets: Dictionary, cset: Dictionary, n: int) -> Array:
	var all := []
	for i in n:
		var r = open_booster(state, sets, cset)
		if r == null:
			break
		all.append_array(r)
	return all


# ---------- Actions: price (binder -> showcase) ----------

static func copies(state: Dictionary, cset: Dictionary, card: Dictionary) -> float:
	return JS.num(state.binder.get(cset.id, {}).get(card.id))


static func free_slots(state: Dictionary) -> int:
	return maxi(0, showcase_capacity(state) - state.showcase.size())


static func tag_price(mv: float, level: float) -> float:
	return maxf(0.01, JS.round(mv * (1.0 + level) * 100.0) / 100.0)


static func buy_chance(tag: float, mv: float, lenience: float = 0.0) -> float:
	var r := (tag / mv if mv > 0 else INF) - lenience
	var C := BUY_CURVE
	if r <= C[0][0]:
		return 1.0
	for i in range(1, C.size()):
		if r <= C[i][0] + 1e-9:
			var x0: float = C[i - 1][0]
			var y0: float = C[i - 1][1]
			var x1: float = C[i][0]
			var y1: float = C[i][1]
			return y0 + (y1 - y0) * minf(1.0, (r - x0) / (x1 - x0))
	return 0.0


static func _take_from_binder(state: Dictionary, cset: Dictionary, card: Dictionary, n: float) -> int:
	var binder = state.binder.get(cset.id)
	var have := JS.num(binder.get(card.id)) if binder != null else 0.0
	var k := int(maxf(0.0, minf(have, floorf(n))))
	if not k:
		return 0
	binder[card.id] = have - k
	if not binder[card.id]:
		binder.erase(card.id)
	return k


## Puts up to n copies of one card in the showcase at `price` each.
static func list_card(state: Dictionary, cset: Dictionary, card: Dictionary, n: float, price: float) -> int:
	if not (price > 0):
		return 0
	var k := _take_from_binder(state, cset, card, minf(n, free_slots(state)))
	var p := JS.round(price * 100.0) / 100.0
	for i in k:
		state.showcase.append({"s": cset.id, "c": card.id, "p": p})
	state.stats.cardsPriced += k
	state.stats.cardsListed += k
	return k


## Spare copies after keeping `keep` of each card, priciest first.
static func spares(state: Dictionary, sets: Dictionary, keep: float, only_set = null) -> Array:
	var out := []
	for sid in JS.keys(state.binder):
		var cset = sets.get(sid)
		if cset == null or (only_set != null and sid != only_set):
			continue
		var cards: Dictionary = state.binder[sid]
		for cid in JS.keys(cards):
			var n: float = cards[cid]
			var card = cset.by_id.get(cid)
			if card != null and n > keep:
				out.append({"set": cset, "card": card, "n": n - keep, "mv": market_value(state, cset, card), "_i": out.size()})
	out.sort_custom(func(a, b): return a.mv > b.mv or (a.mv == b.mv and a._i < b._i))
	return out


static func price_spares(state: Dictionary, sets: Dictionary, n: int, level: float = 0.0, keep: float = 0.0) -> int:
	var left := mini(n, free_slots(state))
	var k := 0
	for sp in spares(state, sets, keep):
		if left <= 0:
			break
		var m := list_card(state, sp.set, sp.card, minf(left, sp.n), tag_price(sp.mv, level))
		left -= m
		k += m
	return k


static func bulk_spares(state: Dictionary, sets: Dictionary, keep: float = 0.0) -> Dictionary:
	var n := 0.0
	var total := 0.0
	for sp in spares(state, sets, keep):
		if sp.mv >= state.rules.bulkBelow:
			continue
		n += sp.n
		total += sp.n * sp.mv * BULK_RATE
	return {"n": n, "total": total}


static func sell_bulk(state: Dictionary, sets: Dictionary, keep: float = 0.0) -> Dictionary:
	var n := 0.0
	var total := 0.0
	for sp in spares(state, sets, keep):
		if sp.mv >= state.rules.bulkBelow:
			continue
		_take_from_binder(state, sp.set, sp.card, sp.n)
		n += sp.n
		total += sp.n * sp.mv * BULK_RATE
	_earn(state, total, "bulk")
	state.stats.bulkSold += n
	if n:
		state["_binderVer"] = int(state.get("_binderVer", 0)) + 1
	return {"n": n, "total": total}


## One step of the pricing employee (see js/game.js staffPriceOne).
static func _staff_price_one(state: Dictionary, sets: Dictionary, only_set = null) -> String:
	var keep := maxf(0.0, floorf(JS.num(state.rules.keepCopies)))
	var ver: int = state.get("_binderVer", 0)
	if not state.has("_spares"):
		state["_spares"] = {}
	var cache: Dictionary = state._spares
	var key: String = only_set if only_set != null else "*"
	var q = cache.get(key)
	while true:
		var stale: bool = q == null or q.day != state.day or q.keep != keep
		if stale or q.i >= q.list.size():
			if not stale and q.ver == ver and not q.get("acted", false):
				return "none"
			q = {"day": state.day, "keep": keep, "ver": ver, "i": 0, "list": spares(state, sets, keep, only_set)}
			cache[key] = q
			continue
		var sp: Dictionary = q.list[q.i]
		if copies(state, sp.set, sp.card) <= keep:
			q.i += 1
			continue
		if sp.mv >= state.rules.bulkBelow and not free_slots(state):
			return "full"
		q.i += 1
		q["acted"] = true
		if sp.mv < state.rules.bulkBelow:
			_take_from_binder(state, sp.set, sp.card, 1)
			_earn(state, sp.mv * BULK_RATE, "bulk")
			state.stats.bulkSold += 1
			return "bulk"
		list_card(state, sp.set, sp.card, 1, tag_price(sp.mv, JS.num(state.rules.get("priceLevel"))))
		return "priced"
	return "none"


static func recall_showcase(state: Dictionary) -> int:
	var n: int = state.showcase.size()
	for it in state.showcase:
		if not state.binder.has(it.s):
			state.binder[it.s] = {}
		var b: Dictionary = state.binder[it.s]
		b[it.c] = JS.num(b.get(it.c)) + 1
	state.showcase = []
	state["_binderVer"] = int(state.get("_binderVer", 0)) + 1
	return n


# ---------- Actions: market ----------

static func single_price(state: Dictionary, cset: Dictionary, card: Dictionary) -> float:
	return market_value(state, cset, card) * MARKET_BUY_RATE


static func buy_single(state: Dictionary, sets: Dictionary, cset: Dictionary, card: Dictionary) -> bool:
	var cost := single_price(state, cset, card)
	if not set_unlocked(state, cset) or state.money < cost:
		return false
	_spend(state, cost, "market")
	if not state.binder.has(cset.id):
		state.binder[cset.id] = {}
	var binder: Dictionary = state.binder[cset.id]
	binder[card.id] = JS.num(binder.get(card.id)) + 1
	state["_binderVer"] = int(state.get("_binderVer", 0)) + 1
	if not state.seen.has(cset.id):
		state.seen[cset.id] = {}
	if not state.seen[cset.id].get(card.id):
		state.seen[cset.id][card.id] = true
		_refresh_bonus(state, sets, cset.id)
	return true


# ---------- Upgrades ----------

static func buy_upgrade(state: Dictionary, key: String) -> bool:
	var lvl: int = state.upgrades[key]
	if lvl >= UPGRADES[key].max:
		return false
	var cost := upgrade_cost(key, lvl)
	if state.money < cost:
		return false
	_spend(state, cost, "upgrades")
	state.upgrades[key] = lvl + 1
	return true


# ---------- Staff ----------

static func can_hire(state: Dictionary) -> bool:
	return state.staff.size() < max_staff(state) and state.money >= hire_cost(state.staff.size())


static func hire(state: Dictionary):
	if not can_hire(state):
		return null
	_spend(state, hire_cost(state.staff.size()), "hires")
	var used := {}
	for e in state.staff:
		used[e.name] = true
	var free := NAMES.filter(func(n): return not used.has(n))
	var name: String = free[floori(_r() * free.size())] if free.size() else "Clerk %d" % state.nextId
	var skills := {}
	for k in SKILL_KEYS:
		skills[k] = {"lvl": 1 + floori(_r() * 2), "xp": 0}
	var emp := {"id": state.nextId, "name": name, "skills": skills, "task": null, "set": null, "task2": null, "set2": null,
		"progress": 0, "training": null, "status": "idle", "hiredDay": state.day}
	state.nextId += 1
	state.staff.append(emp)
	_log(state, "staff", "%s joined the shop" % name)
	return emp


static func set_task(_state: Dictionary, emp: Dictionary, task) -> void:
	emp.task = task if SKILLS.has(task) else null
	emp.progress = 0


## Jobs: a primary and a secondary job, each an action and a collection
## (null = the shop rules' collection, or any for Price).
static func set_job(_state: Dictionary, emp: Dictionary, slot: int, task, set_id) -> void:
	var t = task if SKILLS.has(task) else null
	var s = set_id if set_id is String and set_id != "" else null
	if slot == 2:
		emp.task2 = t
		emp.set2 = s
	else:
		emp.task = t
		emp["set"] = s
	emp.progress = 0
	emp["_job"] = 0


static func jobs_of(emp: Dictionary) -> Array:
	var out := []
	for j in [[emp.task, emp["set"]], [emp.task2, emp.set2]]:
		if JS.truthy(j[0]):
			out.append(j)
	return out


static func can_train(state: Dictionary, emp: Dictionary, skill: String) -> bool:
	var sk: Dictionary = emp.skills[skill]
	return emp.training == null and sk.lvl < MAX_SKILL and state.money >= train_cost(int(sk.lvl))


static func train(state: Dictionary, emp: Dictionary, skill: String) -> bool:
	if not can_train(state, emp, skill):
		return false
	var lvl: int = emp.skills[skill].lvl
	_spend(state, train_cost(lvl), "training")
	emp.training = {"skill": skill, "left": train_time(lvl), "total": train_time(lvl)}
	emp.progress = 0
	return true


static func _level_up(state: Dictionary, emp: Dictionary, skill: String, how: String) -> void:
	var sk: Dictionary = emp.skills[skill]
	sk.lvl = mini(MAX_SKILL, int(sk.lvl) + 1)
	sk.xp = 0
	state.stats.levelsGained += 1
	_log(state, "staff", "%s: %s Lv %d%s" % [emp.name, skill.capitalize(), sk.lvl, " (trained)" if how == "training" else ""])


static func _gain_xp(state: Dictionary, emp: Dictionary, skill: String) -> void:
	var sk: Dictionary = emp.skills[skill]
	if sk.lvl >= MAX_SKILL:
		return
	sk.xp += 1
	if sk.xp >= xp_to_next(int(sk.lvl)):
		_level_up(state, emp, skill, "practice")


## One action of a job. Returns true if it happened; otherwise sets emp.status.
static func _do_task(state: Dictionary, sets: Dictionary, emp: Dictionary, job: Array) -> bool:
	var task: String = job[0]
	var only = job[1]
	match task:
		"buy":
			var cset = sets.get(only) if only != null else null
			if cset == null:
				cset = sets.get(state.rules.buySet)
			if cset == null:
				emp.status = "no collection"
				return false
			if not set_unlocked(state, cset):
				emp.status = "locked"
				return false
			if sold_out(state, cset):
				emp.status = "sold out"
				return false
			var g: String = "b:" + cset.id
			var shop_wants: bool = JS.num(state.stock.get(cset.id)) < state.rules.stockTarget
			if shop_wants and storage_free(state) >= 1:
				if not buy_booster(state, cset, state.rules.cashReserve):
					emp.status = "cash reserve"
					return false
				return true
			if not warehouse_capacity(state):
				emp.status = "storage full" if shop_wants else "stock target"
				return false
			if warehouse_free(state) < 1:
				emp.status = "warehouse full"
				return false
			if state.money - booster_price(state, cset) < state.rules.cashReserve - 1e-9:
				emp.status = "cash reserve"
				return false
			if not buy_to_warehouse(state, sets, g, 1):
				emp.status = "cash reserve"
				return false
			return true
		"open":
			var cset = sets.get(only) if only != null else null
			if cset == null:
				cset = sets.get(state.rules.openSet)
			if cset == null or open_booster(state, sets, cset) == null:
				emp.status = "no packs"
				return false
			return true
		"price":
			var r := _staff_price_one(state, sets, only if only != null and sets.has(only) else null)
			if r == "full":
				emp.status = "showcase full"
				return false
			if r == "none":
				emp.status = "nothing to price"
				return false
			return true
	return false


static func salary_per_day(state: Dictionary, emp: Dictionary) -> float:
	var lv := 0.0
	for k in SKILL_KEYS:
		lv += emp.skills[k].lvl
	var days := 0.0 if emp.hiredDay == null else maxf(0.0, state.day - emp.hiredDay)
	return SALARY_PER_LEVEL * lv * (1.0 + minf(TENURE_MAX, TENURE_BONUS * days))


static func payroll(state: Dictionary) -> float:
	var t := 0.0
	for e in state.staff:
		t += salary_per_day(state, e)
	return t


static func severance(state: Dictionary, emp: Dictionary) -> float:
	var days := 0.0 if emp.hiredDay == null else maxf(0.0, state.day - emp.hiredDay)
	return salary_per_day(state, emp) * maxf(1.0, ceilf(days / SEVERANCE_DAYS))


static func can_fire(state: Dictionary, emp: Dictionary) -> bool:
	return state.staff.has(emp) and state.money >= severance(state, emp) - 1e-9


static func fire(state: Dictionary, emp: Dictionary) -> bool:
	if not can_fire(state, emp):
		return false
	var fee := severance(state, emp)
	_spend(state, fee, "salaries")
	state.stats.salariesPaid += fee
	state.staff.erase(emp)
	_log(state, "staff", "%s left the shop" % emp.name)
	return true


static func _tick_employee(state: Dictionary, sets: Dictionary, emp: Dictionary, dt: float) -> void:
	if emp.hiredDay == null:
		emp.hiredDay = state.day
	var due := salary_per_day(state, emp) * dt / DAY_SECONDS
	if state.money < due:
		emp.status = "unpaid"
		return
	_spend(state, due, "salaries")
	state.stats.salariesPaid += due
	if emp.training != null:
		emp.status = "training"
		emp.training.left -= dt
		if emp.training.left <= 0:
			var skill: String = emp.training.skill
			emp.training = null
			_level_up(state, emp, skill, "training")
		return
	var jobs := jobs_of(emp)
	if jobs.is_empty():
		emp.status = "idle"
		emp.progress = 0
		return
	var ji: int = emp.get("_job", 0)
	var cur: Array = jobs[ji] if ji < jobs.size() else jobs[0]
	var dur := skill_duration(cur[0], int(emp.skills[cur[0]].lvl))
	emp.progress += dt
	var guard := 0
	while emp.progress >= dur and guard < 2000:
		guard += 1
		var done := -1
		var why := ""
		for j in jobs.size():
			if _do_task(state, sets, emp, jobs[j]):
				done = j
				break
			if j == 0:
				why = emp.status
		if done < 0:
			emp.status = why
			emp.progress = dur
			return
		emp.progress -= dur
		emp["_job"] = done
		_gain_xp(state, emp, jobs[done][0])
		cur = jobs[done]
		dur = skill_duration(cur[0], int(emp.skills[cur[0]].lvl))
	emp.status = "backup job" if int(emp.get("_job", 0)) > 0 else "working"


# ---------- Customers ----------

static func feeling(tag: float, mv: float) -> String:
	var r := tag / mv
	for f in FEELINGS:
		if r <= f.upTo:
			return f.key
	return FEELINGS.back().key


static func _remember(state: Dictionary, it: Dictionary, f: String, bought: bool) -> void:
	if not state.has("_feedback"):
		state["_feedback"] = []
	var fb: Array = state._feedback
	fb.append({"s": it.s, "c": it.c, "p": it.p, "f": f, "b": bought, "day": state.day})
	if fb.size() > FEEDBACK_SIZE:
		state._feedback = fb.slice(fb.size() - FEEDBACK_SIZE)
	state["_feedbackVer"] = int(state.get("_feedbackVer", 0)) + 1


static func _remember_miss(state: Dictionary, set_id: String) -> void:
	if not state.has("_feedback"):
		state["_feedback"] = []
	var fb: Array = state._feedback
	fb.append({"s": set_id, "miss": true, "day": state.day})
	if fb.size() > FEEDBACK_SIZE:
		state._feedback = fb.slice(fb.size() - FEEDBACK_SIZE)
	state["_feedbackVer"] = int(state.get("_feedbackVer", 0)) + 1
	state.stats.missedCustomers = JS.num(state.stats.get("missedCustomers")) + 1


static func feedback_summary(state: Dictionary) -> Dictionary:
	var total := {"looks": 0, "bought": 0}
	for f in FEELINGS:
		total[f.key] = 0
	var by_card := {}
	total.missed = 0
	for e in state.get("_feedback", []):
		if e.get("miss"):
			total.missed += 1
			continue
		total.looks += 1
		total[e.f] += 1
		if e.b:
			total.bought += 1
		var k: String = "%s:%s" % [e.s, e.c]
		if not by_card.has(k):
			by_card[k] = {"looks": 0, "bought": 0}
		by_card[k].looks += 1
		if e.b:
			by_card[k].bought += 1
	return {"total": total, "byCard": by_card}


static func _tell_scene(ev: Dictionary) -> void:
	if customer_listener.is_valid() and not quiet:
		customer_listener.call(ev)


static func _customer_visit(state: Dictionary, sets: Dictionary) -> void:
	state.stats.customers += 1
	if state.shelf.size() and _r() < SEALED_SHARE:
		_sealed_visit(state, sets)
		return
	if state.showcase.is_empty():
		_tell_scene({"looks": [], "empty": true})
		return
	var want = wanted_set(state, sets)
	var only = want.set.id if want != null and _r() < want.share else null
	if only != null and not state.showcase.any(func(it): return it.s == only):
		_remember_miss(state, only)
		_tell_scene({"looks": [], "miss": only})
		return
	var looks := []
	var budget := customer_budget(state)
	var rich := _is_rich(budget, state)
	var lenience := RICH_LENIENCE if rich else 0.0
	var looked := {} # showcase entries already seen (by identity)
	var i := 0
	while i < CUSTOMER_LOOKS and state.showcase.size():
		i += 1
		var total := 0.0
		var weights := []
		weights.resize(state.showcase.size())
		for j in state.showcase.size():
			var it: Dictionary = state.showcase[j]
			var cset = sets.get(it.s)
			var card = cset.by_id.get(it.c) if cset != null else null
			var w := 0.0
			if card != null and it.p <= budget and not looked.has(_id(it)) and (only == null or it.s == only):
				w = _weigh(rich, market_value(state, cset, card))
			weights[j] = w
			total += w
		if total <= 0:
			break
		var r := _r() * total
		var pick := 0
		while pick < weights.size() - 1:
			r -= weights[pick]
			if r > 0:
				pick += 1
			else:
				break
		var it: Dictionary = state.showcase[pick]
		looked[_id(it)] = true
		var cset: Dictionary = sets[it.s]
		var card: Dictionary = cset.by_id[it.c]
		var mv := market_value(state, cset, card)
		var bought := _r() < buy_chance(it.p, mv, lenience)
		var f := feeling(it.p, mv)
		_remember(state, it, f, bought)
		var look := {"s": it.s, "c": it.c, "p": it.p, "f": f, "b": bought, "paid": 0.0}
		looks.append(look)
		if not bought:
			continue
		state.showcase.remove_at(pick)
		budget -= it.p
		var paid: float = it.p * _sale_multiplier(state, it.s)
		look.paid = paid
		_earn(state, paid, "cards")
		state.stats.cardsSold += 1
		if sale_listener.is_valid() and not quiet:
			sale_listener.call(paid)
	_tell_scene({"looks": looks})


## Identity of a showcase or shelf entry (JS compares objects by reference).
static var _ids := 0
static func _id(it: Dictionary) -> int:
	if not it.has("_oid"):
		_ids += 1
		it["_oid"] = _ids
	return it._oid


static func _sealed_visit(state: Dictionary, sets: Dictionary) -> void:
	var looks := []
	var budget := customer_budget(state)
	var rich := _is_rich(budget, state)
	var lenience := RICH_LENIENCE if rich else 0.0
	var looked := {}
	var i := 0
	while i < SEALED_LOOKS and state.shelf.size():
		i += 1
		var total := 0.0
		var weights := []
		for it in state.shelf:
			var w := 0.0
			if it.p <= budget and not looked.has(_id(it)):
				w = _weigh(rich, maxf(0.01, good_value(state, sets, it.g)))
			weights.append(w)
			total += w
		if total <= 0:
			break
		var r := _r() * total
		var pick := 0
		while pick < weights.size() - 1:
			r -= weights[pick]
			if r > 0:
				pick += 1
			else:
				break
		var it: Dictionary = state.shelf[pick]
		looked[_id(it)] = true
		var mv := good_value(state, sets, it.g)
		var bought := _r() < buy_chance(it.p, mv, lenience)
		var look := {"g": it.g, "p": it.p, "f": feeling(it.p, mv), "b": bought, "paid": 0.0}
		looks.append(look)
		if not bought:
			continue
		it.n -= 1
		if it.n <= 0:
			state.shelf.remove_at(pick)
		budget -= it.p
		var paid: float = it.p * reputation_bonus(state)
		look.paid = paid
		_earn(state, paid, "sealed")
		state.stats.sealedSold += 1
		if sale_listener.is_valid() and not quiet:
			sale_listener.call(paid)
	_tell_scene({"looks": looks})


# ---------- Sealed goods (Storage tab) ----------
# Goods ids: "b:<set>" sealed booster (state.stock), "x:<set>" box,
# "a:<accessory id>" accessory (state.goods).

static func set_accessories(list) -> void:
	_accessories = {}
	if not list is Array:
		return
	for a in list:
		if a is Dictionary and a.get("id") is String and JS.truthy(a.get("name")) and JS.num(a.get("cost")) > 0 and JS.num(a.get("value")) > 0:
			_accessories[a.id] = a


static func accessories() -> Array:
	return _accessories.values()


static func good_info(sets: Dictionary, g: String):
	var kind := g.substr(0, 1)
	var id := g.substr(2)
	if kind == "a":
		return {"kind": kind, "acc": _accessories[id], "name": _accessories[id].name} if _accessories.has(id) else null
	var cset = sets.get(id)
	if cset == null or (kind != "b" and kind != "x"):
		return null
	return {"kind": kind, "set": cset, "name": "%s %s" % [cset.name, "booster" if kind == "b" else "booster box"]}


static func good_value(state: Dictionary, sets: Dictionary, g: String) -> float:
	var info = good_info(sets, g)
	if info == null:
		return 0.0
	if info.kind == "a":
		return info.acc.value * (1.0 + ACC_SWING * (Market.rand(["acc", info.acc.id, int(state.day)]) * 2.0 - 1.0))
	var v := market_booster_value(state, info.set)
	return v * BOX_SIZE if info.kind == "x" else v


static func goods_owned(state: Dictionary, g: String) -> float:
	if g.begins_with("b:"):
		return JS.num(state.stock.get(g.substr(2)))
	return JS.num(state.goods.get(g))


static func _take_goods(state: Dictionary, g: String, n: float) -> int:
	var k := int(maxf(0.0, minf(goods_owned(state, g), floorf(n))))
	if not k:
		return 0
	if g.begins_with("b:"):
		state.stock[g.substr(2)] -= k
	else:
		state.goods[g] -= k
		if not state.goods[g]:
			state.goods.erase(g)
	return k


static func _add_goods(state: Dictionary, g: String, n: float) -> void:
	if g.begins_with("b:"):
		state.stock[g.substr(2)] = JS.num(state.stock.get(g.substr(2))) + n
	else:
		state.goods[g] = JS.num(state.goods.get(g)) + n


static func shelf_capacity(s: Dictionary) -> int:
	return SHELF_BASE + SHELF_PER_LEVEL * int(s.upgrades.showcase)


static func shelf_count(s: Dictionary) -> float:
	var n := 0.0
	for it in s.shelf:
		n += it.n
	return n


static func shelf_free(s: Dictionary) -> float:
	return maxf(0.0, shelf_capacity(s) - shelf_count(s))


static func list_good(state: Dictionary, sets: Dictionary, g: String, n: float, price: float) -> int:
	if not (price > 0) or good_info(sets, g) == null:
		return 0
	var k := _take_goods(state, g, minf(n, shelf_free(state)))
	if not k:
		return 0
	var p := JS.round(price * 100.0) / 100.0
	for it in state.shelf:
		if it.g == g and it.p == p:
			it.n += k
			return k
	state.shelf.append({"g": g, "p": p, "n": k})
	return k


static func recall_shelf_item(state: Dictionary, i: int) -> int:
	if i < 0 or i >= state.shelf.size():
		return 0
	var it: Dictionary = state.shelf[i]
	_add_goods(state, it.g, it.n)
	state.shelf.remove_at(i)
	return int(it.n)


static func recall_shelf(state: Dictionary) -> int:
	var n := 0
	for it in state.shelf:
		_add_goods(state, it.g, it.n)
		n += int(it.n)
	state.shelf = []
	return n


static func box_price(state: Dictionary, cset: Dictionary) -> float:
	return BOX_SIZE * booster_price(state, cset) * BOX_DISCOUNT


static func can_buy_box(state: Dictionary, cset: Dictionary) -> bool:
	return set_unlocked(state, cset) and supply(state, cset).left >= BOX_SIZE and room_for(state, BOX_SPACE) != "" \
		and state.money >= box_price(state, cset) - 1e-9


static func buy_box(state: Dictionary, cset: Dictionary) -> bool:
	if not can_buy_box(state, cset):
		return false
	_spend(state, box_price(state, cset), "goods")
	supply(state, cset).left -= BOX_SIZE
	_receive(state, "x:" + cset.id, 1, room_for(state, BOX_SPACE))
	state.stats.boxesBought += 1
	return true


static func can_open_box(state: Dictionary, cset: Dictionary) -> bool:
	return goods_owned(state, "x:" + cset.id) > 0 and storage_free(state) >= BOX_SIZE - BOX_SPACE


static func open_box(state: Dictionary, cset: Dictionary) -> bool:
	if not can_open_box(state, cset):
		return false
	_take_goods(state, "x:" + cset.id, 1)
	_add_goods(state, "b:" + cset.id, BOX_SIZE)
	state.stats.boxesOpened += 1
	return true


static func buy_accessory(state: Dictionary, id: String, n: int = 1) -> int:
	var a = _accessories.get(id)
	if a == null:
		return 0
	var k := 0
	while k < n and state.money >= a.cost - 1e-9 and room_for(state) != "":
		_spend(state, a.cost, "goods")
		_receive(state, "a:" + id, 1, room_for(state))
		k += 1
	state.stats.accessoriesBought += k
	return k


# ---------- Properties: warehouses ----------

static func warehouse_levels(s: Dictionary) -> int:
	var n := 0
	for w in s.properties.warehouses:
		n += int(w.level)
	return n


static func warehouse_capacity(s: Dictionary) -> int:
	return WAREHOUSE.space * warehouse_levels(s)


static func warehouse_used(s: Dictionary) -> float:
	var n := 0.0
	for g in s.properties.goods.keys():
		n += good_space(g) * s.properties.goods[g]
	return n


static func warehouse_free(s: Dictionary) -> float:
	return maxf(0.0, warehouse_capacity(s) - warehouse_used(s))


static func warehouse_fee_per_day(s: Dictionary) -> float:
	return WAREHOUSE.fee * warehouse_levels(s)


static func upgrade_warehouse_cost(level: int) -> float:
	return WAREHOUSE.upgrade * level


static func ship_days(space: float) -> int:
	for p in SHIP_DAYS:
		if space <= p[0]:
			return p[1]
	return 3


static func warehouse_owned(s: Dictionary, g: String) -> float:
	return JS.num(s.properties.goods.get(g))


static func in_transit(s: Dictionary, g: String) -> float:
	var n := 0.0
	for sh in s.properties.ships:
		if sh.g == g:
			n += sh.n
	return n


static func _transit_space(s: Dictionary) -> float:
	var n := 0.0
	for sh in s.properties.ships:
		n += good_space(sh.g) * sh.n
	return n


static func buy_warehouse(state: Dictionary) -> bool:
	if state.money < WAREHOUSE.cost - 1e-9:
		return false
	_spend(state, WAREHOUSE.cost, "properties")
	state.properties.warehouses.append({"id": state.nextId, "level": 1})
	state.nextId += 1
	return true


static func upgrade_warehouse(state: Dictionary, id) -> bool:
	var w = null
	for x in state.properties.warehouses:
		if x.id == id:
			w = x
			break
	if w == null or w.level >= WAREHOUSE.maxLevel:
		return false
	var cost := upgrade_warehouse_cost(int(w.level))
	if state.money < cost - 1e-9:
		return false
	_spend(state, cost, "properties")
	w.level += 1
	return true


static func _add_warehouse(state: Dictionary, g: String, n: float) -> void:
	state.properties.goods[g] = JS.num(state.properties.goods.get(g)) + n


static func buy_to_warehouse(state: Dictionary, sets: Dictionary, g: String, n: float) -> int:
	var info = good_info(sets, g)
	if info == null:
		return 0
	var room := floorf(warehouse_free(state) / good_space(g))
	var want := minf(n, room)
	var k := 0
	if info.kind == "a":
		while k < want and state.money >= info.acc.cost - 1e-9:
			_spend(state, info.acc.cost, "goods")
			k += 1
		state.stats.accessoriesBought += k
	else:
		var cset: Dictionary = info.set
		var per := BOX_SIZE if info.kind == "x" else 1
		if not set_unlocked(state, cset):
			return 0
		while k < want:
			var lot := minf(minf(want - k, 1 if info.kind == "x" else 100), floorf(supply(state, cset).left / per))
			if lot <= 0:
				break
			var unit := box_price(state, cset) if info.kind == "x" else booster_price(state, cset)
			var afford := minf(lot, floorf((state.money + 1e-9) / unit))
			if afford <= 0:
				break
			_spend(state, unit * afford, "goods" if info.kind == "x" else "boosters")
			supply(state, cset).left -= afford * per
			k += int(afford)
			if afford < lot:
				break
		if info.kind == "x":
			state.stats.boxesBought += k
		else:
			state.stats.boostersBought += k
	if k:
		_add_warehouse(state, g, k)
	return k


static func store_in_warehouse(state: Dictionary, g: String, n: float) -> int:
	var room := floorf(warehouse_free(state) / good_space(g))
	var k := _take_goods(state, g, minf(n, room))
	if k:
		_add_warehouse(state, g, k)
	return k


static func ship_to_shop(state: Dictionary, g: String, n: float) -> int:
	var free := floorf(maxf(0.0, storage_free(state) - _transit_space(state)) / good_space(g))
	var k := int(minf(minf(n, warehouse_owned(state, g)), free))
	if k <= 0:
		return 0
	var p: Dictionary = state.properties
	p.goods[g] -= k
	if not p.goods[g]:
		p.goods.erase(g)
	p.ships.append({"g": g, "n": k, "arrive": state.day + ship_days(k * good_space(g))})
	state.stats.shipments += 1
	return k


static func set_target(state: Dictionary, g: String, n) -> void:
	var v := int(maxf(0.0, floorf(JS.num(n) if not n is String else (n.to_float() if n.is_valid_float() else 0.0))))
	if v:
		state.properties.targets[g] = v
	else:
		state.properties.targets.erase(g)


static func _tick_properties(state: Dictionary, sets: Dictionary, dt: float) -> void:
	var p: Dictionary = state.properties
	if p.warehouses.is_empty() and p.ships.is_empty():
		return
	var due := warehouse_fee_per_day(state) * dt / DAY_SECONDS
	var paid: bool = state.money >= due
	if paid and due:
		_spend(state, due, "properties")
		state.stats.feesPaid += due
	state["_feesUnpaid"] = not paid
	if p.ships.size():
		var keep := []
		for sh in p.ships:
			if sh.arrive <= state.day and good_info(sets, sh.g) != null:
				_add_goods(state, sh.g, sh.n)
			elif good_info(sets, sh.g) != null:
				keep.append(sh)
		if keep.size() != p.ships.size():
			p.ships = keep
	state["_shipT"] = JS.num(state.get("_shipT")) + dt
	if not paid or state._shipT < 5:
		return
	state._shipT = 0.0
	for g in JS.keys(p.targets):
		if good_info(sets, g) == null:
			continue
		var need: float = p.targets[g] - goods_owned(state, g) - in_transit(state, g)
		if need > 0:
			ship_to_shop(state, g, need)


# ---------- Achievements ----------

static func earn_achievement(state: Dictionary, id: String, name: String, silent: bool) -> bool:
	if state.achievements.get(id) != null:
		return false
	state.achievements[id] = state.day
	if not silent:
		notify(state, "achievement", "Achievement: %s" % name, "See all of them in Awards.")
		if achievement_listener.is_valid() and not quiet:
			achievement_listener.call(name)
	return true


# ---------- Progressive reveal (GDD section 11) ----------

static func _check_unlocks(state: Dictionary, sets: Dictionary) -> void:
	var u: Dictionary = state.unlocked
	if not u.priceList and state.stats.boostersOpened > 0:
		u.priceList = true
		u.binder = true
	if not u.showcase and state.stats.cardsSold > 0:
		u.showcase = true
	if not u.finances and u.showcase:
		u.finances = true
	if not u.storage and u.market:
		u.storage = true
	if not u.marketing and u.upgrades and state.stats.earned >= 1000:
		u.marketing = true
	if not u.properties and state.stats.earned >= 25000:
		u.properties = true
	if not u.upgrades and state.money >= 40:
		u.upgrades = true
	if not u.staff and state.money >= 50:
		u.staff = true
	if not u.market:
		var new_day: bool = state.firstDay != null and state.day != state.firstDay
		var pricey := false
		if not new_day and state.stats.boostersOpened > 0:
			for sid in JS.keys(state.binder):
				var cset = sets.get(sid)
				for cid in JS.keys(state.binder[sid]):
					var card = cset.by_id.get(cid) if cset != null else null
					if card != null and market_value(state, cset, card) > 5:
						pricey = true
						break
				if pricey:
					break
			if not pricey:
				pricey = state.showcase.any(func(it): return it.p > 5)
		if new_day or pricey:
			u.market = true


# ---------- Loop ----------

static func tick(state: Dictionary, sets: Dictionary, dt: float, now: int) -> void:
	state.lastTick = now
	state.stats.playTime += dt
	var day := day_at(state, now)
	if day != state.day:
		var first := not JS.truthy(state.day)
		state.day = day
		if state.firstDay == null:
			state.firstDay = day
		if not first:
			_log(state, "day", "New market day: %s" % Market.day_label(day, int(state.firstDay)))
		advance_supply(state, sets)
	state.customerTimer -= dt
	var guard := 0
	while state.customerTimer <= 0 and guard < 1000:
		guard += 1
		_customer_visit(state, sets)
		state.customerTimer += customer_interval(state) * (0.5 + _r())
	for emp in state.staff.duplicate():
		_tick_employee(state, sets, emp, dt)
	if state.campaign != null:
		state.campaign.left -= dt
		if state.campaign.left <= 0:
			state.campaign = null
	_tick_properties(state, sets, dt)
	_check_unlocks(state, sets)
	state["_achT"] = JS.num(state.get("_achT")) + dt
	if state._achT >= 5 and achievement_check.is_valid():
		state._achT = 0.0
		achievement_check.call(state, sets, false)


static func advance_supply(state: Dictionary, sets: Dictionary) -> void:
	for cset in sets.values():
		if not set_unlocked(state, cset):
			continue
		var m := supply(state, cset)
		if not m.out:
			m.out = true
			if cset.release_index > 0:
				_log(state, "release", "%s is out" % cset.name)
				notify(state, "release", "%s is out" % cset.name, "Boosters are at the distributor. Some customers will ask for it.")
		var age: float = state.day - Supply.release_day(state, cset)
		var next := INF
		for o in sets.values():
			if o.release_index > cset.release_index:
				next = minf(next, Supply.release_day(state, o))
		var left0: float = m.left
		var bought := 0.0
		var reprinted := 0.0
		var names := []
		while m.age < age:
			var latest: bool = Supply.release_day(state, cset) + m.age + 1 < next
			for n in Supply.step_day(cset, m, latest):
				if n.kind == "rival":
					bought += n.n
					var nm: String = Strings.RIVAL_NAMES[n.rival] if n.rival < Strings.RIVAL_NAMES.size() else "A rival shop"
					if not names.has(nm):
						names.append(nm)
				elif n.kind == "reprint":
					reprinted += n.n
		if bought and bought >= RIVAL_NOTICE * left0:
			var who: String
			if names.size() > 2:
				who = "%s and %d more" % [", ".join(PackedStringArray(names.slice(0, 2))), names.size() - 2]
			else:
				who = " and ".join(PackedStringArray(names))
			notify(state, "rival", "%s: rival shops stock up" % cset.name,
				"%s bought %s boosters. Distributor supply %s. Booster prices may rise." % [who, _fmt_count(bought), _pct_change(-bought, left0)])
		if reprinted:
			_log(state, "reprint", "%s: reprint hits the market" % cset.name)
			notify(state, "reprint", "%s: reprint hits the market" % cset.name,
				"%s new boosters. Distributor supply %s. Booster prices may drop." % [_fmt_count(reprinted), _pct_change(reprinted, maxf(1.0, m.left - reprinted))])
	_refresh_open(state, sets)


static func _pct_change(d: float, base: float) -> String:
	var p := JS.round((d / base) * 100.0) if base > 0 else 100.0
	return "%s%d%%" % ["+" if p >= 0 else "−", int(absf(p))]


static func _fmt_count(n: float) -> String:
	if n >= 1e6:
		return "%sM" % JS.to_fixed(n / 1e6, 0 if n >= 1e7 else 1)
	if n >= 1e3:
		return "%sK" % JS.to_fixed(n / 1e3, 0 if n >= 1e4 else 1)
	return str(int(n))


static func _refresh_open(state: Dictionary, sets: Dictionary) -> void:
	state["_open"] = {}
	for cset in sets.values():
		if cset.release_index > 0:
			state._open[cset.id] = set_unlocked(state, cset)


## Recomputes derived caches after load.
static func prepare(state: Dictionary, sets: Dictionary) -> void:
	Market.set_seed(state.seed)
	for cset in sets.values():
		for c in cset.cards:
			c["_mvDay"] = null
	state["_bonus"] = {}
	for id in sets.keys():
		_refresh_bonus(state, sets, id)
	_refresh_open(state, sets)
	if achievement_check.is_valid():
		achievement_check.call(state, sets, true)


## Replays [from, to) in steps of 1 s (2 s past a day), like js catchUp but
## synchronous: the simulation thread (S9) calls it in slices.
static func catch_up_slice(state: Dictionary, sets: Dictionary, from_ms: int, total: int, done: int, until_usec: int) -> int:
	var step := 2 if total > 86400 else 1
	quiet = true
	while done < total and Time.get_ticks_usec() < until_usec:
		var dt := mini(step, total - done)
		done += dt
		tick(state, sets, dt, from_ms + done * 1000)
	quiet = false
	return done
