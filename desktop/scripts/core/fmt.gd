class_name Fmt
## Number formatting (subset of js/format.js; the rest comes with the UI stages).


## Integer with thousands separators, like toLocaleString('en-US').
static func num(n: int) -> String:
	var s := str(absi(n))
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return ("-" if n < 0 else "") + s + out
