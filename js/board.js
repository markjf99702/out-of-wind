// A rough board on the bench, as a coarse grid of heights (millimetres).
//   x runs along the board (the grain), 0 at the near end; y runs across it; z is up.
//   bottom is the underside, which carries the warp; top is the face you plane.
//   The board's thickness anywhere is top - bottom, and it mustn't go under tmin.
// Nothing here touches the page, so the tests (and the solver that sets par) can use it in Node.

import { rng, noise2 } from './rng.js';
import { WOODS } from './woods.js';

export const CELL = 5; // mm: one grid cell is 5 mm square
export const FLAT = 0.15; // mm: a face this close to a plane counts as flat (about six thou)
export const TABLETOP = 19.05; // mm: three-quarters of an inch, what the tabletop needs

export class Board {
  constructor(def) {
    this.def = def;
    this.L = def.L;
    this.W = def.strips ? def.strips.reduce((s, st) => s + st.w, 0) : def.W;
    this.NX = Math.round(this.L / CELL);
    this.NY = Math.round(this.W / CELL);
    this.dx = this.L / this.NX;
    this.dy = this.W / this.NY;
    this.tmin = def.tmin ?? TABLETOP;
    const n = this.NX * this.NY;
    this.top = new Float32Array(n);
    this.bottom = new Float32Array(n);
    this.start = new Float32Array(n); // the face as it came from the sawmill
    this.cut = new Uint8Array(n); // 1 once a plane has cut here: no longer rough-sawn
    this.pencil = new Uint8Array(n); // 1 where there's pencil on the face
    this.torn = new Uint8Array(n); // 1 where the last cut tore the fibres out
    this.grain = new Int8Array(n); // +1: planing toward far end (+x) is with the grain; -1: the other way
    this.tear = new Float32Array(n); // how readily this spot tears out, 0..1
    this.strip = new Uint8Array(n); // which board of a glued-up panel the cell belongs to
    this.knotAt = new Uint8Array(n); // 1 inside a knot
    this.generate();
  }

  idx(i, j) { return i * this.NY + j; }
  xOf(i) { return (i + 0.5) * this.dx; }
  yOf(j) { return (j + 0.5) * this.dy; }
  wood(j) { return WOODS[this.strips[this.col[j]].wood || this.def.wood]; }

  generate() {
    const d = this.def, { L, W, NX, NY } = this;
    const r = rng(d.seed);
    const strips = d.strips || [{ w: W, wood: d.wood, grain: d.grain ?? 1, cup: 0, step: 0 }];
    this.strips = strips;
    const stripOf = new Uint8Array(NY), stripY0 = [];
    let acc = 0;
    strips.forEach((st, k) => { stripY0.push(acc); acc += st.w; });
    for (let j = 0; j < NY; j++) {
      const y = this.yOf(j);
      let k = 0;
      while (k < strips.length - 1 && y >= stripY0[k + 1]) k++;
      stripOf[j] = k;
    }
    this.col = stripOf; // which board of the panel each column across belongs to
    this.stripY0 = stripY0;
    const lowNoise = noise2(d.seed * 7 + 1, 170), varyNoise = noise2(d.seed * 7 + 2, 110);
    const roughNoise = noise2(d.seed * 7 + 3, 9), curlNoise = noise2(d.seed * 7 + 4, 60);
    const humps = d.humps || [], knots = d.knots || [];
    const curl = d.curl || 0; // curl wavelength in mm, 0 for none
    const ribbon = d.ribbon || 0; // interlocked stripes across the width, wavelength in mm
    const flips = d.flips || []; // [[x as a fraction of L, slant in mm along per mm across], ...]
    const phase = r() * Math.PI * 2;
    this.figure = { phase, curlNoise, curl, ribbon }; // the page draws curl and ribbon stripes where the grain turns

    for (let i = 0; i < NX; i++) {
      const x = this.xOf(i), xn = (2 * x) / L - 1;
      for (let j = 0; j < NY; j++) {
        const y = this.yOf(j), yn = (2 * y) / W - 1, k = stripOf[j], st = strips[k];
        const ys = (2 * (y - stripY0[k])) / st.w - 1; // across this one board, -1..1
        // The warp, carried by the whole board, both faces.
        let w = (d.bow || 0) * (xn * xn - 1 / 3) + (d.cup || 0) * (yn * yn - 1 / 3) + (d.twist || 0) * xn * yn;
        w += (st.cup || 0) * (ys * ys - 1 / 3) + (st.step || 0) + (st.twist || 0) * xn * ys;
        w += (d.wander ?? 0.08) * lowNoise(x, y);
        for (const [hx, hy, rx, ry, h] of humps) {
          const u = (x - hx * L) / rx, v = (y - hy * W) / ry;
          w += h * Math.exp(-0.5 * (u * u + v * v));
        }
        const id = this.idx(i, j);
        this.bottom[id] = w;
        // Thickness wanders a little, and the sawn face is rough on top of that.
        const t = d.t0 + (d.vary ?? 0.14) * varyNoise(x, y);
        const rough = (d.rough ?? 0.3) * (0.5 + 0.35 * roughNoise(x, y) + 0.15 * (r() * 2 - 1));
        this.top[id] = w + t + rough;
        this.strip[id] = k;

        // Which way the grain runs out to the face here.
        let g = st.grain ?? d.grain ?? 1;
        for (const [fx, slant = 0] of flips) if (x > fx * L + slant * (y - W / 2)) g = -g;
        if (curl) g = Math.sin((2 * Math.PI * x) / curl + phase + 1.2 * curlNoise(x, y)) >= 0 ? g : -g;
        if (ribbon) g = Math.sin((2 * Math.PI * y) / ribbon + phase + 0.6 * curlNoise(x, y)) >= 0 ? g : -g;
        let tear = WOODS[st.wood || d.wood].tear;
        for (const [kx, ky, kr] of knots) {
          const dxk = x - kx * L, dyk = (y - ky * W) * 1.6, dist = Math.hypot(dxk, dyk);
          if (dist < kr) { this.knotAt[id] = 1; tear = Math.min(1, tear * 2.2 + 0.2); }
          else if (dist < kr * 3) {
            tear = Math.min(1, tear * (1 + 1.2 * (1 - dist / (kr * 3))));
            if (dxk * g > 0) g = -g; // the grain dives around the knot and comes up the other way
          }
        }
        this.grain[id] = g;
        this.tear[id] = tear;
      }
    }
    this.start.set(this.top);
  }

  // ---------- measurements ----------

  // The least-squares plane through the face: z = a + b (x - L/2) + c (y - W/2).
  // Torn spots are left out: they're scored on their own.
  fit() {
    const { NX, NY, top, torn } = this;
    let n = 0, sz = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
    for (let i = 0; i < NX; i++) {
      const xc = this.xOf(i) - this.L / 2;
      for (let j = 0; j < NY; j++) {
        if (torn[i * NY + j]) continue;
        const yc = this.yOf(j) - this.W / 2, z = top[i * NY + j];
        n++; sz += z; sx += xc; sy += yc; sxx += xc * xc; syy += yc * yc; sxy += xc * yc; sxz += xc * z; syz += yc * z;
      }
    }
    if (!n) return { a: 0, b: 0, c: 0 };
    // Solve the 3x3 normal equations (Cramer's rule).
    const m = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]], v = [sz, sxz, syz];
    const det = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const D = det(m);
    const col = k => m.map((row, r) => row.map((x, c) => (c === k ? v[r] : x)));
    return { a: det(col(0)) / D, b: det(col(1)) / D, c: det(col(2)) / D };
  }

  // How far the face is from flat: the spread of the face around its best plane (mm).
  // Torn spots are left out here too.
  flatness(f = this.fit()) {
    const { NX, NY, top, torn } = this;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < NX; i++) {
      const pz = f.a + f.b * (this.xOf(i) - this.L / 2);
      for (let j = 0; j < NY; j++) {
        if (torn[i * NY + j]) continue;
        const v = top[i * NY + j] - pz - f.c * (this.yOf(j) - this.W / 2);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    return hi > lo ? hi - lo : 0;
  }

  // The thinnest the board is anywhere (mm), and where.
  thinnest() {
    let t = Infinity, at = 0;
    for (let k = 0; k < this.top.length; k++) {
      const v = this.top[k] - this.bottom[k];
      if (v < t) { t = v; at = k; }
    }
    return { t, i: Math.floor(at / this.NY), j: at % this.NY };
  }

  roughLeft() { let n = 0; for (const c of this.cut) if (!c) n++; return n; }
  tornLeft() { let n = 0; for (const c of this.torn) if (c) n++; return n; }

  // Patches of tear-out, counted as separate spots (cells touching side by side are one spot).
  tornSpots() {
    const { NX, NY, torn } = this, seen = new Uint8Array(torn.length);
    let spots = 0;
    for (let k = 0; k < torn.length; k++) {
      if (!torn[k] || seen[k]) continue;
      spots++;
      const stack = [k];
      seen[k] = 1;
      while (stack.length) {
        const c = stack.pop(), i = Math.floor(c / NY), j = c % NY;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= NX || jj >= NY) continue;
          const n = ii * NY + jj;
          if (torn[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
        }
      }
    }
    return spots;
  }

  // The height of the face at any point, interpolated between cells.
  at(x, y) {
    const { NX, NY, top } = this;
    const fx = Math.min(Math.max(x / this.dx - 0.5, 0), NX - 1), fy = Math.min(Math.max(y / this.dy - 0.5, 0), NY - 1);
    const i = Math.min(Math.floor(fx), NX - 2), j = Math.min(Math.floor(fy), NY - 2);
    const u = fx - i, v = fy - j;
    const a = top[i * NY + j], b = top[(i + 1) * NY + j], c = top[i * NY + j + 1], e = top[(i + 1) * NY + j + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
  }
  bottomAt(x, y) {
    const { NX, NY, bottom } = this;
    const i = Math.min(Math.max(Math.round(x / this.dx - 0.5), 0), NX - 1), j = Math.min(Math.max(Math.round(y / this.dy - 0.5), 0), NY - 1);
    return bottom[i * NY + j];
  }

  // A straightedge laid from (x0, y0) to (x1, y1). It rests on the high points under it
  // (balanced at its middle) and the light shows wherever the face falls away beneath it.
  straightedge(x0, y0, x1, y1, n = 96) {
    const xs = new Float64Array(n), zs = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      xs[k] = t;
      zs[k] = this.at(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
    const line = restLine(xs, zs, n, 0.5, 0.5);
    let gap = 0, at = 0;
    const gaps = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      gaps[k] = line.z + line.s * (xs[k] - 0.5) - zs[k];
      if (gaps[k] > gap) { gap = gaps[k]; at = xs[k]; }
    }
    return { zs, gaps, gap, at, z0: line.z - line.s * 0.5, z1: line.z + line.s * 0.5 };
  }

  // A winding stick laid across the board at row i: the slope its top edge takes (mm per mm).
  stickSlope(i) {
    const { NY } = this, xs = new Float64Array(NY), zs = new Float64Array(NY);
    for (let j = 0; j < NY; j++) { xs[j] = this.yOf(j); zs[j] = this.top[i * NY + j]; }
    return restLine(xs, zs, NY, this.W / 2, this.W / 2).s;
  }

  // Winding sticks near each end: how far out of wind the face is, as the difference in height
  // their top edges show across the board's width (mm). Positive: the far stick's right end is high.
  wind() {
    const near = Math.round(this.NX * 0.07), far = this.NX - 1 - near;
    const a = this.stickSlope(near), b = this.stickSlope(far);
    return { wind: (b - a) * this.W, near, far, a, b };
  }

  // Is the face finished: flat, out of wind and planed all over?
  done() {
    return this.roughLeft() === 0 && this.flatness() <= FLAT;
  }

  // ---------- saving a board part-way through ----------

  save() {
    const n = this.top.length, out = new Int16Array(n);
    for (let k = 0; k < n; k++) out[k] = Math.round((this.start[k] - this.top[k]) * 2000);
    return { cut: pack(this.cut, 1), torn: pack(this.torn, 1), pencil: pack(this.pencil, 1), off: b64(new Uint8Array(out.buffer)) };
  }
  load(s) {
    const n = this.top.length, off = new Int16Array(unb64(s.off).buffer);
    if (off.length !== n) return false;
    for (let k = 0; k < n; k++) this.top[k] = this.start[k] - off[k] / 2000;
    unpack(s.cut, this.cut); unpack(s.torn, this.torn); unpack(s.pencil, this.pencil);
    return true;
  }
}

// ---------- resting a straight thing on points ----------
// The lowest line that lies on or above every point (xs[k], zs[k]) (xs ascending), balanced at p:
// the edge of the upper hull above p. toward breaks a tie at a hull corner (the side the line
// should continue on). Returns the line's height z at p and its slope s.
const HX = new Float64Array(4096), HZ = new Float64Array(4096);
export function restLine(xs, zs, n, p, toward = p) {
  let m = 0;
  for (let k = 0; k < n; k++) {
    const x = xs[k], z = zs[k];
    while (m >= 2 && (HZ[m - 1] - HZ[m - 2]) * (x - HX[m - 2]) <= (z - HZ[m - 2]) * (HX[m - 1] - HX[m - 2])) m--;
    HX[m] = x; HZ[m] = z; m++;
  }
  if (m === 1) return { z: HZ[0], s: 0 };
  let k = 0;
  while (k < m - 2 && HX[k + 1] < p) k++;
  if (p === HX[k + 1] && toward > p && k < m - 2) k++;
  const s = (HZ[k + 1] - HZ[k]) / (HX[k + 1] - HX[k]);
  return { z: HZ[k] + s * (p - HX[k]), s };
}

// ---------- compact storage ----------
function pack(arr) {
  const bytes = new Uint8Array(Math.ceil(arr.length / 8));
  for (let k = 0; k < arr.length; k++) if (arr[k]) bytes[k >> 3] |= 1 << (k & 7);
  return b64(bytes);
}
function unpack(s, arr) {
  const bytes = unb64(s);
  for (let k = 0; k < arr.length; k++) arr[k] = (bytes[k >> 3] >> (k & 7)) & 1;
}
function b64(bytes) {
  let s = '';
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
  return btoa(s);
}
function unb64(s) {
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
  return out;
}
