// The shop's sounds, made with Web Audio: the shhhk of a shaving (pitched by the wood and the depth
// of cut), the plane skating over a hollow, the crackle of tear-out, the pencil, the steel rule,
// the winding sticks and a quiet chime when a board is done. Nothing is recorded; it's all noise,
// filtered and shaped.

let ac = null, master = null, noiseBuf = null, enabled = true;
let cutSrc = null, cutBand = null, cutBody = null, cutGain = null, bodyGain = null, skateGain = null;

function ensure() {
  if (ac) return true;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return false;
  ac = new Ctx();
  master = ac.createGain();
  master.gain.value = 0.9;
  const soft = ac.createDynamicsCompressor();
  soft.threshold.value = -18; soft.knee.value = 10; soft.ratio.value = 4; soft.attack.value = 0.004; soft.release.value = 0.2;
  master.connect(soft).connect(ac.destination);
  // Two seconds of pink-ish noise.
  const len = ac.sampleRate * 2;
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, peak = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = b0 + b1 + b2 + w * 0.1848;
    peak = Math.max(peak, Math.abs(d[i]));
  }
  for (let i = 0; i < len; i++) d[i] /= peak;
  return true;
}

// Turns sound on or off. The audio itself only starts on the next tap (see wake).
export function setSound(on) {
  enabled = on;
  if (!on) stopCut();
  else if (ac && ac.state === 'suspended') ac.resume();
}
export const soundOn = () => enabled;

// Browsers only start sound from a tap or a key; call this from one.
export function wake() {
  if (!enabled || !ensure()) return;
  if (ac.state === 'suspended') ac.resume();
}

function noise(t, stop, loop = false) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = loop;
  src.start(t, Math.random() * 1.5);
  if (stop) src.stop(stop);
  return src;
}
function filt(type, f, q) {
  const n = ac.createBiquadFilter();
  n.type = type; n.frequency.value = f; n.Q.value = q;
  return n;
}

// ---------- the stroke ----------
// Starts the plane's sound for a stroke; hard is the wood (0 soft .. 1 hard), depth the cut (mm).
export function startCut(hard, depth) {
  if (!enabled || !ensure()) return;
  stopCut();
  const t = ac.currentTime;
  cutSrc = noise(t, 0, true);
  const f = 1500 + hard * 1400 + (0.15 - Math.min(0.15, depth)) * 6000;
  cutBand = filt('bandpass', f, 0.9);
  const lp = filt('lowpass', 7000, 0.5);
  cutGain = ac.createGain(); cutGain.gain.value = 0.0001;
  cutSrc.connect(cutBand).connect(lp).connect(cutGain).connect(master);
  // A lower, woodier body under a thick cut.
  cutBody = filt('bandpass', 380 + hard * 200, 1.1);
  bodyGain = ac.createGain(); bodyGain.gain.value = 0.0001;
  cutSrc.connect(cutBody).connect(bodyGain).connect(master);
  // The sole sliding on the wood when the blade isn't cutting.
  const sk = filt('lowpass', 900, 0.6);
  skateGain = ac.createGain(); skateGain.gain.value = 0.0001;
  cutSrc.connect(sk).connect(skateGain).connect(master);
  cutGain.thick = depth;
  cutGain.base = f;
}

// Every frame of a stroke: how much is being cut (0..1 of the blade's width) and how fast the plane moves.
export function cutLevel(amount, moving) {
  if (!cutGain) return;
  const t = ac.currentTime;
  const a = Math.min(1, amount);
  cutGain.gain.setTargetAtTime(a > 0.01 ? 0.08 + 0.32 * a : 0.0001, t, a > 0.01 ? 0.012 : 0.05);
  bodyGain.gain.setTargetAtTime(a > 0.01 ? Math.min(0.35, cutGain.thick * 1.1) * a : 0.0001, t, 0.02);
  skateGain.gain.setTargetAtTime(moving && a <= 0.01 ? 0.05 : 0.0001, t, 0.04);
  cutBand.frequency.setTargetAtTime(cutGain.base * (0.92 + Math.random() * 0.16), t, 0.03);
}

// The stroke ends: the shaving lets go with a little tick, brighter after a full-length shaving.
export function endCut(full) {
  if (!cutGain) return;
  const t = ac.currentTime;
  cutGain.gain.setTargetAtTime(0.0001, t, 0.035);
  bodyGain.gain.setTargetAtTime(0.0001, t, 0.03);
  skateGain.gain.setTargetAtTime(0.0001, t, 0.03);
  const src = cutSrc;
  setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } }, 400);
  cutSrc = null; cutGain = null;
  if (full) tick(0.18, 5200);
}

function stopCut() {
  if (cutSrc) { try { cutSrc.stop(); } catch { /* already stopped */ } }
  cutSrc = null; cutGain = null;
}

function tick(level, f) {
  const t = ac.currentTime + 0.01;
  const g = ac.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  noise(t, t + 0.08).connect(filt('bandpass', f, 2)).connect(g).connect(master);
}

// Tear-out: dry crackles, a few per torn spot.
export function crackle(n) {
  if (!enabled || !ensure() || !n) return;
  const t0 = ac.currentTime;
  for (let k = 0; k < Math.min(8, n * 2); k++) {
    const t = t0 + Math.random() * 0.06;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35 + Math.random() * 0.3, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012 + Math.random() * 0.02);
    noise(t, t + 0.05).connect(filt('bandpass', 2500 + Math.random() * 3000, 1.5)).connect(g).connect(master);
  }
}

// A pencil scribbling back and forth across the face.
export function pencil(ms) {
  if (!enabled || !ensure()) return;
  const t = ac.currentTime + 0.01, dur = ms / 1000;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  const strokes = Math.round(dur * 14);
  for (let k = 0; k < strokes; k++) {
    const s = t + (k * dur) / strokes;
    g.gain.setTargetAtTime(0.12 + Math.random() * 0.08, s, 0.01);
    g.gain.setTargetAtTime(0.02, s + dur / strokes * 0.6, 0.012);
  }
  g.gain.setTargetAtTime(0.0001, t + dur, 0.02);
  noise(t, t + dur + 0.2, true).connect(filt('bandpass', 4200, 0.8)).connect(filt('highpass', 1800, 0.5)).connect(g).connect(master);
}

// The steel rule laid down.
export function tink() {
  if (!enabled || !ensure()) return;
  const t = ac.currentTime + 0.01;
  for (const [f, lvl, dec] of [[2350, 0.09, 0.25], [3720, 0.05, 0.18], [5900, 0.025, 0.1]]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(lvl, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dec + 0.05);
  }
}

// Wood on wood: the winding sticks set down.
export function tock() {
  if (!enabled || !ensure()) return;
  const t = ac.currentTime + 0.01;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(720, t);
  o.frequency.exponentialRampToValueAtTime(380, t + 0.06);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 0.15);
  tick(0.12, 1800);
}

// The board is done: a soft, low bell.
export function done() {
  if (!enabled || !ensure()) return;
  const t = ac.currentTime + 0.05;
  [[392, 0], [587.3, 0.09], [784, 0.18]].forEach(([f, d]) => {
    for (const [mult, lvl] of [[1, 0.1], [2.76, 0.025]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f * mult;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.linearRampToValueAtTime(lvl, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.6);
      o.connect(g).connect(master);
      o.start(t + d); o.stop(t + d + 1.7);
    }
  });
}

// Gone through the line: a dull knock.
export function thud() {
  if (!enabled || !ensure()) return;
  const t = ac.currentTime + 0.01;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.25);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.4, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 0.45);
}
