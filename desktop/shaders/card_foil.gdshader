shader_type canvas_item;
// Rarity foil on a card scan (card detail, docs/desktop/foil.md). Drawn on the
// scan inside the tilt viewport, before the tilt, so UV is the scan's UV.
// mode: 0 none, 1 holo (artwork window), 2 ex (window + faint sheen),
//       3 secret (window + whole card), 4 gold star (fancy).
// art_rect: artwork window in UV (x, y, w, h). tilt: -1..1 (card_tilt.gd).
// grid: card size in base pixels; the foil is drawn in base pixels.
// motion: 0 under Reduce motion (no twinkle, no moving sheen).

uniform vec2 tilt = vec2(0.0);
uniform vec4 art_rect = vec4(0.09, 0.12, 0.81, 0.40);
uniform int mode = 0;
uniform vec2 grid = vec2(110.0, 154.0);
uniform float motion = 1.0;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 hue(float h) {
	return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

float in_rect(vec2 uv, vec4 r) {
	vec2 a = step(r.xy, uv) * step(uv, r.xy + r.zw);
	return a.x * a.y;
}

// Posterized rainbow bands that slide with the tilt.
vec3 rainbow(vec2 q, vec2 t, float freq, float steps) {
	float h = dot(q, vec2(0.7, 1.2)) * freq + t.x * 0.8 - t.y * 0.55;
	return mix(hue(floor(h * steps) / steps), vec3(1.0), 0.35);
}

// A light band that sweeps across the card as it tilts.
float band(vec2 q, vec2 t, float width) {
	float d = dot(q - 0.5, normalize(vec2(1.0, 1.4))) - (t.x * 0.55 + t.y * 0.45);
	return exp(-d * d / (width * width));
}

// One glint per lucky grid cell; it lights up at its own tilt angle.
float sparkle(vec2 cell, vec2 t, float density, float time) {
	if (hash(cell) > density) {
		return 0.0;
	}
	float ph = hash(cell + 7.31) * 6.2832;
	return pow(max(sin(ph + t.x * 5.0 + t.y * 3.5 + time * 1.3), 0.0), 12.0);
}

vec3 screen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }

float steps(float v, float n) { return floor(v * n + 0.5) / n; }

void fragment() {
	vec4 c = texture(TEXTURE, UV);
	if (mode > 0) {
		float time = TIME * motion;
		vec2 cell = floor(UV * grid);
		vec2 q = (cell + 0.5) / grid;
		float art = in_rect(q, art_rect);
		float border = 1.0 - in_rect(q, vec4(0.05, 0.035, 0.90, 0.93));
		vec3 base = c.rgb;
		float lum = dot(base, vec3(0.299, 0.587, 0.114));
		float dark = 1.0 - lum;
		float b = band(q, tilt, 0.20);

		// Artwork window: soft rainbow, strongest on the darker background.
		float k = steps((0.10 + 0.45 * b) * (0.25 + 0.75 * dark * dark), 5.0);
		float sp = sparkle(cell, tilt, mode == 4 ? 0.08 : 0.03, time) * (0.4 + 0.6 * b);
		vec3 art_col = screen(base, rainbow(q, tilt, 2.0, 6.0) * k) + vec3(sp);

		vec3 rest = base;
		if (mode == 2) {
			// ex: a faint plain sheen over the card
			rest = screen(base, vec3(steps(0.14 * b, 4.0)));
		} else if (mode == 3) {
			// secret: faint diagonal rainbow lines over the whole card
			float line = step(0.5, fract((cell.x + cell.y) / 4.0));
			float k2 = steps((0.04 + 0.26 * b) * line, 5.0);
			rest = screen(base, rainbow(q * 1.7, tilt * 1.3, 3.0, 8.0) * k2);
		} else if (mode == 4) {
			// gold star: gold border, a slow sheen over everything, twinkling stars
			float sheen = steps(band(q, tilt + vec2(sin(time * 0.5) * 0.2, 0.0), 0.09), 3.0);
			vec3 gold = mix(vec3(0.55, 0.36, 0.08), vec3(1.0, 0.88, 0.50), smoothstep(0.2, 0.9, lum));
			vec3 g = mix(base, gold, border * 0.85);
			float line = step(0.5, fract((cell.x - cell.y) / 4.0));
			g = screen(g, rainbow(q * 1.3, tilt, 2.5, 6.0) * (0.03 + 0.18 * b) * line);
			g = screen(g, vec3(1.0, 0.9, 0.6) * sheen * 0.45);
			rest = g + vec3(1.0, 0.95, 0.7) * sparkle(cell + 13.0, tilt, 0.06, time * 2.0) * border;
			art_col = screen(art_col, vec3(1.0, 0.85, 0.4) * sheen * 0.35);
		}
		c.rgb = clamp(mix(rest, art_col, art), 0.0, 1.0);
	}
	COLOR = c * COLOR;
}
