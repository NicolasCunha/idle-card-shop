extends TabPanel
## Upgrades (ui.js PANELS.upgrades).


func sig() -> String:
	return str(Game.UPGRADE_KEYS.map(func(k): return App.state.upgrades[k]))


func build() -> void:
	var g := U.grid(4, [], 8)
	for key in Game.UPGRADE_KEYS:
		var k: String = key
		var lvl: int = App.state.upgrades[k]
		var d: Dictionary = Game.UPGRADES[k]
		var txt: Dictionary = Strings.UPGRADE_TEXT[k]
		var mx: bool = lvl >= d.max
		var start: int = d.get("start", 0)
		var effect: String = txt.effect
		if k == "storage":
			effect += " · " + Fmt.num(Game.storage_at(lvl)) + ("" if mx else " → " + Fmt.num(Game.storage_at(lvl + 1)))
		g.add_child(U.label(txt.name))
		g.add_child(U.expand(U.label(effect, "Muted")))
		g.add_child(U.label("Lv %d / %d" % [lvl + start, d.max + start], "Muted"))
		if mx:
			g.add_child(U.label("Max", "Muted"))
		else:
			var cost := Game.upgrade_cost(k, lvl)
			g.add_child(cost_btn(U.btn(Fmt.money(cost), func(): App.main.act(func(): return Game.buy_upgrade(App.state, k), "coin")), cost))
	add_child(U.box([g]))
