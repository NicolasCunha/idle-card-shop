// All sound is generated with the Web Audio API; there are no audio files
// (GDD section 10). Audio starts only after the first user gesture.

let ctx = null, master, musicBus, fxBus;
let prefs = null;
let musicTimer = null;
let lastSale = 0;

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic
const ROOT = 196; // G3
const CHORDS = [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [2, 5, 9]]; // I vi IV ii (semitones)

const hz = semi => ROOT * Math.pow(2, semi / 12);

export function setPrefs(p) {
  prefs = p;
  applyVolumes();
}

function vol(v, muted) { return muted ? 0 : v / 100; }

function applyVolumes() {
  if (!ctx || !prefs) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(vol(prefs.master, prefs.muteMaster), t, 0.05);
  musicBus.gain.setTargetAtTime(vol(prefs.music, prefs.muteMusic) * 0.35, t, 0.2);
  fxBus.gain.setTargetAtTime(vol(prefs.effects, prefs.muteEffects) * 0.6, t, 0.05);
}

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  fxBus = ctx.createGain();
  // Soft echo on the music for a calm, roomy feel.
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.45;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1800;
  musicBus.connect(lp);
  lp.connect(master);
  lp.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(master);
  fxBus.connect(master);
  musicBus.gain.value = 0;
  fxBus.gain.value = 0;
  applyVolumes();
  startMusic();
}

function tone(bus, freq, start, dur, { type = 'sine', gain = 0.2, attack = 0.01, release = null } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + (release ?? dur));
  o.connect(g);
  g.connect(bus);
  o.start(start);
  o.stop(start + (release ?? dur) + 0.05);
}

function noise(start, dur, { gain = 0.15, freq = 3000, q = 0.8 } = {}) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f);
  f.connect(g);
  g.connect(fxBus);
  src.start(start);
}

// ---------- Music: long soft chords + sparse pentatonic notes, no beat ----------
function startMusic() {
  let bar = 0;
  const playBar = () => {
    if (!ctx) return;
    const t = ctx.currentTime + 0.1;
    const chord = CHORDS[bar % CHORDS.length];
    for (const s of chord) tone(musicBus, hz(s - 12), t, 8, { type: 'sine', gain: 0.07, attack: 2.5, release: 8 });
    tone(musicBus, hz(chord[0] - 24), t, 8, { type: 'triangle', gain: 0.05, attack: 3, release: 8 });
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      if (Math.random() < 0.3) continue;
      const semi = PENTA[Math.floor(Math.random() * PENTA.length)] + 12 * (Math.random() < 0.5 ? 0 : 1);
      tone(musicBus, hz(semi), t + 0.8 + i * (1.2 + Math.random() * 1.4), 3, { type: 'sine', gain: 0.045, attack: 0.04, release: 3 });
    }
    bar++;
  };
  playBar();
  musicTimer = setInterval(playBar, 7000);
}

// ---------- Effects ----------
export const sfx = {
  click() {
    if (!ctx) return;
    tone(fxBus, 660, ctx.currentTime, 0.06, { type: 'triangle', gain: 0.08, release: 0.06 });
  },
  coin() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(fxBus, 988, t, 0.1, { type: 'square', gain: 0.04, release: 0.1 });
    tone(fxBus, 1319, t + 0.07, 0.25, { type: 'square', gain: 0.035, release: 0.25 });
  },
  // Soft coin for sales, at most one every few seconds.
  sale() {
    if (!ctx) return;
    const now = performance.now();
    if (now - lastSale < 3500) return;
    lastSale = now;
    const t = ctx.currentTime;
    tone(fxBus, 1175, t, 0.3, { type: 'sine', gain: 0.06, release: 0.3 });
    tone(fxBus, 1568, t + 0.06, 0.4, { type: 'sine', gain: 0.04, release: 0.4 });
  },
  tear() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noise(t, 0.35, { gain: 0.35, freq: 2500, q: 0.6 });
    noise(t + 0.05, 0.25, { gain: 0.2, freq: 5000, q: 1 });
  },
  slide() {
    if (!ctx) return;
    noise(ctx.currentTime, 0.12, { gain: 0.18, freq: 1800, q: 1.5 });
  },
  highlight() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(fxBus, hz(19), t, 0.6, { type: 'sine', gain: 0.08, release: 0.8 });
  },
  big() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [12, 16, 19, 24].forEach((s, i) => tone(fxBus, hz(s), t + i * 0.07, 1.4, { type: 'sine', gain: 0.07, release: 1.6 }));
    tone(fxBus, hz(31), t + 0.3, 1, { type: 'triangle', gain: 0.03, release: 1.2 });
  },
};
