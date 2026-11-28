extends TabPanel
## Marketing (ui.js PANELS.marketing): one campaign at a time.


func sig() -> String:
	return str(App.state.campaign.kind) if App.state.get("campaign") else ""


func build() -> void:
	add_child(U.label("Marketing", "Head"))
	var c = App.state.get("campaign")
	if c:
		var t: Dictionary = Strings.CAMPAIGN_TEXT[c.kind]
		var total: float = Game.CAMPAIGNS[c.kind].days * Game.DAY_SECONDS
		var bar := U.bar("", 3)
		live_bar(bar, func(): return 1.0 - App.state.campaign.left / total if App.state.get("campaign") else 1.0)
		add_child(U.box([U.hbox([U.label(t.name), U.label(t.effect, "Muted"), U.grow(),
			live_text(U.label(""), func(): return Fmt.duration(App.state.campaign.left) if App.state.get("campaign") else "")]), bar]))
	var g := U.grid(4, [], 8)
	for key in Game.CAMPAIGNS:
		var k: String = key
		var d: Dictionary = Game.CAMPAIGNS[k]
		g.add_child(U.label(Strings.CAMPAIGN_TEXT[k].name))
		g.add_child(U.expand(U.label(Strings.CAMPAIGN_TEXT[k].effect, "Muted")))
		g.add_child(U.label("%d %s" % [d.days, "day" if d.days == 1 else "days"], "Muted"))
		var b := U.btn(Fmt.money(d.cost), func(): App.main.act(func(): return Game.start_campaign(App.state, k), "coin"))
		live_dis(b, func(): return App.state.get("campaign") != null or App.state.money < d.cost)
		g.add_child(b)
	add_child(U.box([g]))
