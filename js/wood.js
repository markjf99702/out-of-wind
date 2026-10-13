// Draws a board's wood, pixel by pixel, from its seed: the planed face (growth rings cut by the
// face into cathedral arches, latewood, pores, ray fleck, curl, ribbon stripe, knots, sapwood) and
// the rough-sawn face over it (greyed, fuzzy, with band-saw marks). Both are canvases sized to the
// board at ppm pixels per millimetre.

import { WOODS, rgb } from './woods.js';
import { noise2, rng } from './rng.js';

const frac = v => v - Math.floor(v);
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function woodTextures(board, ppm) {
  const w = Math.max(2, Math.round(board.L * ppm)), h = Math.max(2, Math.round(board.W * ppm));
  const planed = canvas(w, h), rough = canvas(w, h);
  const pc = planed.getContext('2d'), rc = rough.getContext('2d');
  const P = pc.createImageData(w, h), R = rc.createImageData(w, h);
  const d = board.def, seed = d.seed;
  const r = rng(seed * 31 + 7);
  const strips = board.strips;
  // Each board of a panel is its own tree.
  const trees = strips.map((st, k) => {
    const wood = WOODS[st.wood || d.wood];
    return {
      wood, early: rgb(wood.early), late: rgb(wood.late), rgh: rgb(wood.rough),
      sap: wood.sap ? rgb(wood.sap) : null, streak: wood.streak ? rgb(wood.streak) : null,
      pithY: board.stripY0[k] + st.w * (0.2 + r() * 0.6), // where the heart of the tree was, across
      depth0: 18 + r() * 40, depthL: (r() - 0.5) * 40, // how far under the face it ran, near and far
      quarter: wood.rays > 0.5, // quartersawn: straight stripes and ray fleck
      sapEdge: r() < 0.5 ? 0 : 1, streakY: board.stripY0[k] + st.w * (0.25 + r() * 0.5),
      n1: noise2(seed + k * 101 + 1, 140), n2: noise2(seed + k * 101 + 2, 26), n3: noise2(seed + k * 101 + 3, 9),
      fib: noise2(seed + k * 101 + 4, 3), pore: noise2(seed + k * 101 + 5, 1),
    };
  });
  const knots = (d.knots || []).map(([kx, ky, kr]) => ({ x: kx * board.L, y: ky * board.W, r: kr }));
  const fig = board.figure;
  const saw = noise2(seed + 909, 30), fuzz = noise2(seed + 910, 1.2), sawJit = noise2(seed + 911, 8);
  const sawPitch = 4 + r() * 1.5, sawSlant = (r() - 0.5) * 0.25;

  for (let py = 0; py < h; py++) {
    const y = (py + 0.5) / ppm;
    let k = 0;
    while (k < strips.length - 1 && y >= board.stripY0[k + 1]) k++;
    const T = trees[k], wood = T.wood, st = strips[k];
    const yLocal = y - board.stripY0[k];
    for (let px = 0; px < w; px++) {
      const x = (px + 0.5) / ppm;
      // Growth rings.
      const wob = 3.5 * T.n1(x, y) + 1.2 * T.n2(x, y) + 0.25 * T.n3(x, y);
      let ring;
      if (T.quarter) ring = (yLocal + wob * 1.4) / wood.ring;
      else {
        const dep = Math.max(2, T.depth0 + (T.depthL * x) / board.L + 6 * T.n1(x * 0.7 + 500, 0));
        ring = Math.sqrt((y - T.pithY) ** 2 + dep * dep) / wood.ring + wob / wood.ring;
      }
      let knotDark = 0;
      for (const kn of knots) {
        const dx = x - kn.x, dy = (y - kn.y) * 1.6, dist = Math.hypot(dx, dy);
        if (dist < kn.r) { knotDark = 1 - (dist / kn.r) * 0.5; ring = dist / (wood.ring * 0.35); }
        else ring += (kn.r * 1.6) / (dist + kn.r * 0.3) * Math.exp(-dist / (kn.r * 5)) * 2.2;
      }
      const f = frac(ring);
      const late = smooth(0.62, 0.86, f) * (1 - smooth(0.93, 1, f)) * wood.contrast;
      let cr = T.early[0] + (T.late[0] - T.early[0]) * late;
      let cg = T.early[1] + (T.late[1] - T.early[1]) * late;
      let cb = T.early[2] + (T.late[2] - T.early[2]) * late;
      // Fibres, pores and rays.
      let shade = 1 + 0.045 * T.fib(x * 0.15, y * 4) + 0.02 * T.n3(x, y);
      if (wood.pores && f < 0.2) {
        const p = T.pore(x * 0.35, y * 2.2);
        if (p > 0.55 - wood.pores * 0.25) shade -= 0.16 * wood.pores * smooth(0.55 - wood.pores * 0.25, 0.9, p);
      }
      if (wood.rays) {
        const rr = T.n3(x * 0.6 + 77, y * 2.4);
        if (rr > 0.5) shade += 0.12 * wood.rays * smooth(0.5, 0.85, rr);
      }
      // Curl and ribbon stripes, exactly where the grain turns.
      if (fig.curl) {
        const s = Math.sin((2 * Math.PI * x) / fig.curl + fig.phase + 1.2 * fig.curlNoise(x, y));
        shade += 0.11 * s;
      }
      if (fig.ribbon) {
        const s = Math.sin((2 * Math.PI * y) / fig.ribbon + fig.phase + 0.6 * fig.curlNoise(x, y));
        shade += 0.07 * Math.sign(s) * Math.min(1, Math.abs(s) * 3);
      }
      if (T.sap) {
        const edge = T.sapEdge ? st.w - yLocal : yLocal;
        const sp = smooth(st.w * 0.16 + 5 * T.n1(x, 300), st.w * 0.1 + 5 * T.n1(x, 300), edge);
        cr += (T.sap[0] - cr) * sp; cg += (T.sap[1] - cg) * sp; cb += (T.sap[2] - cb) * sp;
      }
      if (T.streak) {
        const sk = smooth(14, 4, Math.abs(y - T.streakY - 10 * T.n1(x, 900))) * (0.5 + 0.5 * T.n1(x * 2, 40));
        cr += (T.streak[0] - cr) * sk * 0.7; cg += (T.streak[1] - cg) * sk * 0.7; cb += (T.streak[2] - cb) * sk * 0.7;
      }
      if (knotDark) {
        const kd = 0.55 + 0.25 * (1 - knotDark) + 0.15 * Math.sin(ring * 6.28);
        cr = T.late[0] * kd; cg = T.late[1] * kd * 0.92; cb = T.late[2] * kd * 0.85;
      }
      const o = (py * w + px) * 4;
      P.data[o] = clamp8(cr * shade); P.data[o + 1] = clamp8(cg * shade); P.data[o + 2] = clamp8(cb * shade); P.data[o + 3] = 255;

      // The rough-sawn face: greyed, fuzzy, saw marks running across.
      // Band-saw marks: a dark score with a lit ridge after it, every few millimetres.
      const m = frac((x + y * sawSlant + 1.5 * sawJit(x, y)) / sawPitch);
      const mark = smooth(0.0, 0.14, m) * (1 - smooth(0.14, 0.42, m));
      const ridge = smooth(0.42, 0.55, m) * (1 - smooth(0.55, 0.8, m));
      const fz = fuzz(x, y * 0.6), sv = 0.55 + 0.45 * saw(x, y);
      let rs = 0.93 + 0.09 * fz - 0.24 * mark * sv + 0.08 * ridge * sv + 0.03 * late;
      const mix = 0.22; // a little of the grain shows through the fuzz
      R.data[o] = clamp8((T.rgh[0] * (1 - mix) + cr * mix) * rs);
      R.data[o + 1] = clamp8((T.rgh[1] * (1 - mix) + cg * mix) * rs);
      R.data[o + 2] = clamp8((T.rgh[2] * (1 - mix) + cb * mix) * rs);
      R.data[o + 3] = 255;
    }
  }
  pc.putImageData(P, 0, 0);
  rc.putImageData(R, 0, 0);
  // Glue lines between the boards of a panel.
  if (strips.length > 1) {
    pc.fillStyle = 'rgba(40,25,15,.55)';
    for (let k = 1; k < strips.length; k++) pc.fillRect(0, Math.round(board.stripY0[k] * ppm) - 0.5, w, Math.max(1, ppm * 0.4));
  }
  return { planed, rough, ppm, w, h };
}

function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

export function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
