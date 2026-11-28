class_name Fmt
## Number and time formatting (port of js/format.js). Money as $1,234.50, short
## form for large values ($12.4K): .claude/rules/ui-copy.md.


## Integer with thousands separators, like toLocaleString('en-US').
static func num(n) -> String:
	var i := int(floor(float(n)))
	var s := str(absi(i))
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return ("-" if i < 0 else "") + s + out


static func money(v: float) -> String:
	var sign := "-" if v < 0 else ""
	v = absf(v)
	if v >= 1e9:
		return "%s$%.2fB" % [sign, v / 1e9]
	if v >= 1e6:
		return "%s$%.2fM" % [sign, v / 1e6]
	if v >= 1e4:
		return "%s$%.1fK" % [sign, v / 1e3]
	var cents := int(round(v * 100.0))
	return "%s$%s.%02d" % [sign, num(cents / 100), cents % 100]


static func pct(x: float) -> String:
	var p := x * 100.0
	return ("+" if p > 0 else "") + "%.1f%%" % p


static func sec(s: float) -> String:
	if s < 1:
		return "%dms" % int(round(s * 1000.0))
	if s < 60:
		var r := roundf(s * 10.0) / 10.0
		return ("%d" % int(r) if r == floor(r) else "%.1f" % r) + "s"
	return duration(s)


static func duration(s: float) -> String:
	var t := maxi(0, int(round(s)))
	var d := t / 86400
	var h := (t % 86400) / 3600
	var m := (t % 3600) / 60
	var x := t % 60
	if d:
		return "%dd %dh" % [d, h]
	if h:
		return "%dh %dm" % [h, m]
	if m:
		return "%dm %ds" % [m, x]
	return "%ds" % x


static func clock(ms: float) -> String:
	var t := maxi(0, int(floor(ms / 1000.0)))
	var h := t / 3600
	var m := (t % 3600) / 60
	var x := t % 60
	var mm := ("%02d" % m if h else str(m)) + ":%02d" % x
	return ("%d:" % h + mm) if h else mm


## Short counts for big numbers (ui.js fmtCount): 12K, 1.20M.
static func count(n: float) -> String:
	if n >= 995000:
		return "%.2fM" % (n / 1e6)
	if n >= 1e4:
		return "%dK" % int(round(n / 1e3))
	return num(n)
