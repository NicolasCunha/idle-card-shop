shader_type canvas_item;
// Card tilt (card detail): turns the card quad toward the mouse with a
// perspective projection. UVs are interpolated with a perspective weight so
// the two triangles of the quad do not kink. A soft glare follows the tilt.
// tilt: -1..1 on each axis (x = mouse right, y = mouse down).

uniform vec2 tilt = vec2(0.0);
uniform vec2 size = vec2(110.0, 154.0);
uniform float max_angle = 0.32; // radians at tilt 1
uniform float distance = 260.0; // camera distance in base pixels
uniform float glare = 0.14;

varying vec3 puv;
varying vec2 lp;

void vertex() {
	vec2 p = VERTEX - size * 0.5;
	float ay = tilt.x * max_angle;
	float ax = -tilt.y * max_angle;
	// Rotate around Y, then X; z toward the viewer is positive.
	vec3 q = vec3(p.x * cos(ay), p.y, p.x * sin(ay));
	q = vec3(q.x, q.y * cos(ax) - q.z * sin(ax), q.y * sin(ax) + q.z * cos(ax));
	float s = distance / (distance - q.z);
	VERTEX = q.xy * s + size * 0.5;
	puv = vec3(UV * s, s);
	lp = (UV - 0.5);
}

void fragment() {
	vec2 uv = puv.xy / puv.z;
	vec4 c = texture(TEXTURE, uv);
	// Glare: a soft band across the card that moves against the tilt.
	float band = dot(uv - 0.5 + tilt * 0.35, normalize(vec2(1.0, 1.4)));
	float g = exp(-band * band * 18.0) * glare * length(tilt);
	c.rgb += g * c.a;
	COLOR = c;
}
