// Shop floor: a small pixel-art view of the shop (docs/sdd/shop-floor.md).
// Purely visual. The rules in game.js report each customer visit through
// G.onCustomer; this file only draws it. Nothing here touches the state, and
// offline catch-up never reaches it.

export const H = 112;                     // native height; width follows the panel
const MIN_W = 200, MAX_W = 400;          // native width range
const TARGET_CSS_H = 230;                 // about this tall on screen
let W = 240;
const SPRITE_W = 16, SPRITE_H = 32;
const SHEETS = 12;
const SPEED = 42;                         // average px per second; each customer varies
// Customers on the floor at once: 5 in a narrow room, up to 8 in a wide one.
const maxOnFloor = () => Math.max(5, Math.min(8, Math.floor(W / 48)));
const rand = (a, b) => a + Math.random() * (b - a);
const DOOR = { x: 20, y: 50 };
const LANE_Y = 96;                        // where customers walk
const LOOK_Y = 84;                        // where they stand in front of the case

// Bought: what they say when they buy at that feeling. Passed: when they leave.
const BOUGHT = { cheap: 'Good price!', fair: 'Fair price.', pricey: 'Pricey, but ok.', steep: 'Steep... I want it.' };
const PASSED = { cheap: 'Maybe later.', fair: 'Maybe later.', pricey: 'Bit pricey...', steep: 'Too pricey!' };
const EMPTY = 'Nothing here...';

let ctx = null, canvas = null, host = null, scale = 0;
let getState = () => null, sets = {}, onPaid = null;
const sheets = [];
const people = [];
let last = 0, running = false;

export function initScene(opts) {
  getState = opts.getState;
  sets = opts.sets;
  onPaid = opts.onPaid || null;
  for (let i = 1; i <= SHEETS; i++) {
    const img = new Image();
    img.src = `images/sprites/customer-${i}.png`;
    sheets.push(img);
  }
  canvas = document.createElement('canvas');
  canvas.className = 'floor-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Shop floor');
  scale = 2; canvas.width = W * scale; canvas.height = H * scale;
  ctx = canvas.getContext('2d');
  window.addEventListener('resize', () => resize());
}

// Called after every panel render with the Shop floor host element, or null
// on other tabs. The floor keeps going while another tab is open, so the
// customers are still there when the player comes back; only drawing stops.
export function mount(el) {
  host = el;
  if (!canvas) return;
  if (host && canvas.parentNode !== host) host.appendChild(canvas);
  resize();
  if (!running) {
    running = true; last = performance.now();
    requestAnimationFrame(loop);
    // Animation frames stop in a hidden or minimized browser tab; timers
    // still fire (throttled), so they keep the customers moving.
    setInterval(() => { if (document.hidden) advance(performance.now()); }, 250);
  }
}

// Whole-number scale for crisp pixels; the native width stretches to fill the
// panel, so the room gets wider on desktop instead of taller.
function resize() {
  if (!host || !host.clientWidth) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = host.clientWidth * dpr;
  const s = Math.max(1, Math.min(Math.round(TARGET_CSS_H * dpr / H), Math.floor(cw / MIN_W)));
  const w = Math.max(MIN_W, Math.min(MAX_W, Math.round(cw / s)));
  if (s !== scale || w !== W) {
    scale = s; W = w;
    canvas.width = W * scale;
    canvas.height = H * scale;
  }
}

const reduced = () => document.documentElement.classList.contains('reduce-motion');
// The floor is live while the page is open, on any game tab and with the
// browser tab hidden or minimized; it is drawn only on the Shop tab.
const visible = () => running;
const onScreen = () => host && host.isConnected;

// True while the floor is live: sales then play when the buyer reacts
// instead of at the sale (main.js).
export const showing = () => visible();

// One customer visit from the rules: { looks: [{ s, c, p, f, b, paid }], miss, empty }.
// Returns false when the visit is not drawn.
export function customer(ev) {
  if (!visible()) return false;
  const st = getState();
  const bought = ev.looks.filter(l => l.b);
  const paid = bought.reduce((a, l) => a + l.paid, 0);
  // A full floor makes room for a buyer by sending the oldest non-buyer
  // away. When everyone there is buying (a busy shop), the visit is not
  // drawn, but its sale still sounds and floats.
  if (people.length >= maxOnFloor()) {
    if (!bought.length) return false;
    const i = people.findIndex(p => !p.paid && p.phase !== 'out');
    if (i < 0) { if (onPaid) onPaid(paid); return false; }
    people.splice(i, 1);
  }
  const lookAt = bought[0] || ev.looks[ev.looks.length - 1];
  let text, happy;
  if (ev.miss) { text = `No ${sets[ev.miss]?.name || 'new set'}?`; happy = false; }
  else if (ev.empty || !lookAt) { text = EMPTY; happy = false; }
  else if (bought.length) { text = BOUGHT[lookAt.f]; happy = true; }
  else { text = PASSED[lookAt.f]; happy = false; }
  // Where along the case they stop (0-1); resolved against the case each frame
  // because the room's width follows the panel.
  // Each customer has their own pace: walking speed, how long they browse,
  // whether they move along the case, and a small delay at the door so
  // arrivals do not line up like clockwork.
  const { frac, row } = freeSpot();
  const lane = LANE_Y + Math.round(rand(-3, 3));
  const look = LOOK_Y + Math.round(rand(-1, 1)) + row * 9;
  const p = {
    sheet: Math.floor(Math.random() * SHEETS),
    x: DOOR.x, y: DOOR.y, dir: 0, t: 0, frac, row, look, lane,
    speed: SPEED * rand(0.75, 1.2),
    delay: rand(0, 1.6),
    browse: rand(1, 3.5),
    moves: Math.random() < 0.45 ? 1 : 0,
    path: [{ x: DOOR.x, y: lane }, { frac, y: lane }, { frac, y: look }],
    phase: 'in', wait: 0, text, happy, feeling: lookAt?.f || null, paid, n: bought.length,
  };
  if (reduced()) { p.x = spotX(st, frac); p.y = LOOK_Y; p.path = []; p.delay = 0; p.moves = 0; }
  people.push(p);
  return true;
}

// ---------- Loop ----------
// Drawn at most 30 times a second: plenty for pixel art, half the work of a
// 60 Hz screen.
let lastDraw = 0;
function loop(now) {
  advance(now);
  if (onScreen() && !document.hidden && now - lastDraw >= 32) { lastDraw = now; resize(); draw(); }
  requestAnimationFrame(loop);
}

// Moves everyone forward to `now` in small steps, so a long gap (throttled
// timers in a hidden tab) plays out the same as live frames. Gaps over a
// minute are cut short; the rules catch up on their own.
function advance(now) {
  let dt = Math.min(60, Math.max(0, (now - last) / 1000));
  last = now;
  while (dt > 0) {
    const s = Math.min(0.1, dt);
    dt -= s;
    for (const p of people) step(p, s);
    for (let i = people.length - 1; i >= 0; i--) if (people[i].phase === 'gone') people.splice(i, 1);
    if (!people.length) break;
  }
}

// A spot along the case away from where others stand or are heading:
// frac 0-1 along the case (a little past each end), row 0 at the glass or
// row 1 just behind when the front is crowded.
function freeSpot(skip) {
  const span = spotX(getState(), 1) - spotX(getState(), 0) || 1;
  const others = people.filter(o => o !== skip && o.phase !== 'out' && o.frac != null);
  let best = { frac: Math.random(), row: 0 }, bestGap = -1;
  for (const row of [0, 1]) {
    const taken = others.filter(o => (o.row || 0) === row).map(o => o.frac);
    for (let i = 0; i < 8; i++) {
      const f = rand(-0.08, 1.08);
      const gap = taken.length ? Math.min(...taken.map(t => Math.abs(t - f))) * span : 999;
      // The back row is only used when it gives clearly more room.
      const score = row ? gap - 10 : gap;
      if (score > bestGap) { best = { frac: f, row }; bestGap = score; }
    }
    if (bestGap >= 14) break;
  }
  return best;
}

// Someone close by is talking: wait for them to finish first.
const someoneTalking = p => people.some(o => o !== p && (o.phase === 'talk') && Math.abs(o.x - p.x) < 40);

function spotX(st, frac) {
  const c = caseRect(st);
  return c.x + 8 + frac * Math.max(4, c.w - 16);
}

function step(p, dt) {
  if (p.delay > 0) { p.delay -= dt; return; }
  p.t += dt;
  if (p.path.length) {
    const tgt = p.path[0];
    if (tgt.frac != null) tgt.x = spotX(getState(), tgt.frac);
    const dx = tgt.x - p.x, dy = tgt.y - p.y;
    const d = Math.hypot(dx, dy);
    const move = (p.speed || SPEED) * dt;
    if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 3 : 2; else p.dir = dy > 0 ? 0 : 1;
    if (d <= move) { p.x = tgt.x; p.y = tgt.y; p.path.shift(); } else { p.x += dx / d * move; p.y += dy / d * move; }
    p.walking = true;
    return;
  }
  p.walking = false;
  p.wait += dt;
  if (p.phase === 'in') { p.phase = 'look'; p.wait = 0; p.dir = 1; }
  else if (p.phase === 'look') {
    // Glance along the case now and then.
    p.dir = Math.floor(p.t * 0.9 + p.frac * 7) % 5 === 0 ? (p.frac < 0.5 ? 3 : 2) : 1;
    if (p.wait < p.browse) return;
    if (p.moves > 0) {
      // Step over to another part of the case and browse a bit more.
      p.moves--; p.wait = 0; p.browse = rand(0.8, 2);
      const spot = freeSpot(p);
      p.frac = spot.frac; p.row = spot.row;
      p.look = LOOK_Y + Math.round(rand(-1, 1)) + spot.row * 9;
      p.path = [{ frac: p.frac, y: p.look }];
      return;
    }
    if (someoneTalking(p)) return;
    p.phase = 'talk'; p.wait = 0; p.dir = 0;
  }
  else if (p.phase === 'talk' && p.wait > 1.8) {
    p.phase = 'react'; p.wait = 0;
    if (p.paid && onPaid) onPaid(p.paid);
  }
  else if (p.phase === 'react' && p.wait > 1.3) {
    p.phase = 'out'; p.wait = 0;
    if (reduced()) { p.phase = 'gone'; return; }
    const lane = p.lane ?? LANE_Y;
    p.path = [{ x: p.x, y: lane }, { x: DOOR.x, y: lane }, { x: DOOR.x, y: DOOR.y }];
  } else if (p.phase === 'out') p.phase = 'gone';
}

// ---------- Drawing ----------
const C = {
  wall: '#c9a77c', wallDark: '#b08e66', trim: '#7a5536', floorA: '#d9c19a', floorB: '#cfb48a', floorLine: '#bda077',
  door: '#5b3f2a', doorIn: '#2e2219', glass: 'rgba(190,225,235,0.35)', glassEdge: '#e8f4f6', caseWood: '#8a5a3a',
  caseTop: '#a06c46', shadow: 'rgba(40,25,15,0.25)', outline: '#2a1f1a', bubble: '#fffaf0', text: '#2a1f1a',
  window: '#a9d3e6', windowFrame: '#f3ead8', plant: '#5f9a4e', pot: '#b3643d', rug: '#a8504a', rugEdge: '#e0b45c',
};

function caseRect(st) {
  const lvl = st?.upgrades?.showcase || 0;
  const w = Math.min(W - 120, 76 + lvl * 8);
  return { x: Math.round(56 + (W - 112 - w) / 2), y: 46, w, h: 26, shelves: lvl >= 4 ? 3 : 2 };
}

function px(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

function drawRoom(st) {
  const fame = st?.upgrades?.fame || 0;
  // wall
  px(0, 0, W, 56, C.wall);
  for (let x = 0; x < W; x += 12) px(x, 0, 1, 52, C.wallDark);
  px(0, 52, W, 4, C.trim);
  // window
  const wx = W - 96;
  px(wx, 10, 44, 26, C.windowFrame); px(wx + 2, 12, 19, 22, C.window); px(wx + 23, 12, 19, 22, C.window);
  px(wx + 2, 22, 40, 1, C.windowFrame);
  // posters by Fame
  if (fame >= 1) { px(48, 12, 16, 22, '#f3ead8'); px(50, 14, 12, 12, '#d9a53f'); px(50, 28, 12, 2, '#7a5536'); }
  if (fame >= 5) { px(70, 14, 16, 18, '#e3907f'); px(72, 16, 12, 10, '#6f9fd1'); }
  if (fame >= 10) { px(wx - 30, 12, 22, 14, '#2a1f1a'); px(wx - 28, 14, 18, 10, '#dcae4b'); }
  // door
  px(8, 16, 26, 40, C.trim); px(11, 19, 20, 37, C.doorIn);
  px(14, 22, 14, 10, '#4a6a7a');
  // floor
  px(0, 56, W, H - 56, C.floorA);
  for (let y = 56; y < H; y += 8) {
    px(0, y, W, 1, C.floorLine);
    const off = ((y - 56) / 8) % 2 ? 0 : 16;
    for (let x = off; x < W; x += 32) px(x, y, 1, 8, C.floorLine);
  }
  if (fame >= 15) { px(W / 2 - 55, 90, 110, 16, C.rugEdge); px(W / 2 - 53, 92, 106, 12, C.rug); }
  if (fame >= 5) { px(39, 62, 10, 8, C.pot); px(37, 48, 14, 14, C.plant); px(41, 44, 6, 6, C.plant); }
  // register counter on the right
  const rx = W - 44;
  px(rx, 48, 40, 22, C.caseWood); px(rx, 46, 40, 3, C.caseTop); px(rx + 10, 38, 16, 9, '#4a3c31'); px(rx + 12, 40, 12, 4, '#8cc285');
  drawFameDecor(fame, wx, rx);
}

// Higher Fame levels (saved value; the UI shows +1) dress up the shop.
const BOX_COLORS = ['#d9a53f', '#6f9fd1', '#5f9a4e', '#a8504a', '#8a6fb8'];
const LIGHTS = ['#f2c14e', '#e3907f', '#8cc285', '#6f9fd1'];
function drawFameDecor(fame, wx, rx) {
  if (fame >= 12) {
    // Wall shelf with booster boxes, where the wall has room.
    const x0 = 92, x1 = wx - 36;
    if (x1 - x0 >= 24) {
      px(x0, 40, x1 - x0, 2, C.trim);
      for (let x = x0 + 2, i = 0; x + 8 <= x1 - 2; x += 10, i++) {
        px(x, 32, 8, 8, BOX_COLORS[i % BOX_COLORS.length]); px(x + 1, 33, 6, 2, '#f7f1e3');
      }
    }
  }
  if (fame >= 14) {
    // String lights along the top of the wall.
    for (let x = 4; x < W - 4; x += 2) px(x, 3 + (Math.floor(x / 8) % 2), 2, 1, '#5b3f2a');
    for (let x = 8, i = 0; x < W - 6; x += 16, i++) px(x, 5, 2, 2, LIGHTS[i % LIGHTS.length]);
  }
  if (fame >= 16) {
    // A second plant by the register.
    const x = rx - 14;
    px(x + 2, 62, 10, 8, C.pot); px(x, 48, 14, 14, C.plant); px(x + 4, 44, 6, 6, C.plant);
  }
  if (fame >= 17) {
    // Gold shop sign over the door.
    px(7, 5, 28, 9, C.trim); px(8, 6, 26, 7, '#dcae4b');
    for (let x = 11; x < 32; x += 4) px(x, 8, 2, 3, '#7a5536');
  }
  if (fame >= 18) {
    // Cardboard standee in the front corner, by the register.
    const x = W - 18, y = 76;
    px(x, y, 14, 22, '#f3ead8'); px(x + 1, y + 1, 12, 20, '#e3907f'); px(x + 4, y + 4, 6, 6, '#f2c14e'); px(x + 3, y + 22, 8, 2, C.trim);
  }
  if (fame >= 19) {
    // Top level: a trophy on the register and soft light over the floor.
    px(rx + 30, 40, 6, 5, '#f2c14e'); px(rx + 32, 45, 2, 1, '#d9a53f'); px(rx + 30, 46, 6, 1, '#7a5536');
    ctx.fillStyle = 'rgba(255, 236, 170, 0.10)';
    ctx.fillRect(0, 56, W, H - 56);
  }
}

function drawCase(st) {
  const c = caseRect(st);
  const cap = Math.max(1, st ? showcaseCap(st) : 1);
  const items = st?.showcase || [];
  const per = Math.floor((c.w - 6) / 5);
  const slots = per * c.shelves;
  const shown = Math.min(slots, Math.ceil(items.length / cap * slots));
  // body
  px(c.x + 2, c.y + c.h + 1, c.w, 3, C.shadow);
  px(c.x, c.y, c.w, c.h, C.caseWood);
  px(c.x - 1, c.y - 3, c.w + 2, 3, C.caseTop);
  // glass and cards
  const gy = c.y + 2, gh = c.h - 6;
  px(c.x + 2, gy, c.w - 4, gh, '#e9dcc0');
  const shelfH = Math.floor(gh / c.shelves);
  for (let i = 0; i < shown; i++) {
    const row = Math.floor(i / per), col = i % per;
    const it = items[Math.floor(i / Math.max(1, shown) * items.length)];
    const set = it && sets[it.s];
    const card = set?.byId[it.c];
    const color = card ? set.rarities[card.rarity].color : '#999';
    const x = c.x + 4 + col * 5, y = gy + 1 + row * shelfH;
    px(x, y, 4, 5, '#f7f1e3'); px(x + 1, y + 1, 2, 3, color);
  }
  for (let r = 1; r < c.shelves; r++) px(c.x + 2, gy + r * shelfH - 1, c.w - 4, 1, C.caseTop);
  px(c.x + 2, gy, c.w - 4, gh, C.glass);
  px(c.x + 3, gy + 1, 1, gh - 2, C.glassEdge);
  px(c.x + 2, gy + gh, c.w - 4, 1, C.caseTop);
}

let showcaseCap = st => 40 + 20 * (st.upgrades?.showcase || 0);
export function setCapacity(fn) { showcaseCap = fn; }

function drawPerson(p) {
  const img = sheets[p.sheet];
  let col = 0, row = p.dir;
  if (p.walking) col = Math.floor(p.t * 8) % 4;
  if (p.phase === 'react' && !reduced()) {
    row = 4;
    const alt = Math.floor(p.wait * 4) % 2;
    col = p.happy ? alt : 2 + alt;
  } else if (p.phase === 'react') { row = 4; col = p.happy ? 0 : 2; }
  const x = Math.round(p.x - SPRITE_W / 2), y = Math.round(p.y - SPRITE_H);
  px(x + 3, y + SPRITE_H - 2, 10, 3, C.shadow);
  if (img.complete && img.naturalWidth) ctx.drawImage(img, col * SPRITE_W, row * SPRITE_H, SPRITE_W, SPRITE_H, x, y, SPRITE_W, SPRITE_H);
  if (p.phase === 'react') drawEmote(p, x, y);
  if (p.phase === 'react' && p.paid) drawPaid(p, x, y);
}

function drawPaid(p, x, y) {
  const rise = reduced() ? 0 : Math.min(8, p.wait * 10);
  const text = `+$${p.paid.toFixed(2)}${p.n > 1 ? ` (${p.n})` : ''}`;
  ctx.font = '700 7px system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  const tx = Math.round(Math.max(1, Math.min(W - tw - 1, x + 8 - tw / 2)));
  const ty = Math.round(y - 20 - rise);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.outline;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillText(text, tx + dx * 0.5, ty + dy * 0.5);
  ctx.fillStyle = '#f2c14e';
  ctx.fillText(text, tx, ty);
}

function drawEmote(p, x, y) {
  const ex = x + 5, ey = y - 7;
  if (p.happy) {
    // heart
    px(ex, ey, 2, 2, '#d9534f'); px(ex + 3, ey, 2, 2, '#d9534f'); px(ex, ey + 1, 5, 2, '#d9534f'); px(ex + 1, ey + 3, 3, 1, '#d9534f'); px(ex + 2, ey + 4, 1, 1, '#d9534f');
  } else {
    // small rain cloud
    px(ex - 1, ey, 7, 3, '#8a8f99'); px(ex, ey - 1, 4, 1, '#8a8f99');
    px(ex, ey + 4, 1, 2, '#6f9fd1'); px(ex + 3, ey + 5, 1, 2, '#6f9fd1');
  }
}

function drawBubble(p) {
  ctx.font = '600 7px system-ui, sans-serif';
  const tw = Math.ceil(ctx.measureText(p.text).width);
  const w = tw + 8, h = 11;
  let x = Math.round(p.x - w / 2), y = Math.round(p.y - SPRITE_H - h - 5);
  x = Math.max(1, Math.min(W - w - 1, x));
  y = Math.max(1, y);
  px(x - 1, y, w + 2, h, C.outline); px(x, y - 1, w, h + 2, C.outline);
  px(x, y, w, h, C.bubble);
  const tx = Math.round(Math.max(x + 3, Math.min(x + w - 6, p.x - 1)));
  px(tx, y + h, 3, 2, C.bubble); px(tx - 1, y + h, 1, 2, C.outline); px(tx + 3, y + h, 1, 2, C.outline); px(tx, y + h + 2, 3, 1, C.outline);
  ctx.fillStyle = p.happy ? '#3d7a3a' : (p.feeling === 'steep' || p.feeling === 'pricey' ? '#a8473a' : C.text);
  ctx.textBaseline = 'middle';
  ctx.fillText(p.text, x + 4, y + h / 2 + 0.5);
}

function draw() {
  const st = getState();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawRoom(st);
  drawCase(st);
  const order = people.filter(p => !(p.delay > 0)).sort((a, b) => a.y - b.y);
  for (const p of order) drawPerson(p);
  for (const p of order) if (p.phase === 'talk' || p.phase === 'react') drawBubble(p);
}
