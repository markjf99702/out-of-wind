// The three bench planes, and what a stroke of one does to the board.
//
// A plane is a rigid, flat sole with a blade sticking a fraction of a millimetre out of its mouth.
// It can only rest on the highest parts of the face under it. Along the stroke it sits on the
// upper hull of the face under its sole, so a long sole bridges a hollow and a short one dips into
// it; across the board it's held square to the face as a whole. Where the face beneath the mouth
// rises above the blade's edge, the blade cuts it down to that edge. The pressure follows good
// technique: on the front of the sole as the plane comes onto the board, on the back as it leaves,
// so it doesn't dive off the ends.

export const PLANES = {
  jack: {
    id: 'jack', name: 'Jack', full: 'Jack plane', len: 356, sole: 60, blade: 50, depth: 0.35, camber: 0.25, tear: 1,
    what: 'Fourteen inches, with a curved edge set deep. It hogs off high spots fast and leaves a scalloped face.',
  },
  jointer: {
    id: 'jointer', name: 'Jointer', full: 'Jointer plane', len: 560, sole: 73, blade: 60, depth: 0.09, camber: 0.025, tear: 0.45,
    what: 'Twenty-two inches long. It rides over hollows and takes the high spots down until the face is true.',
  },
  smoother: {
    id: 'smoother', name: 'Smoother', full: 'Smoothing plane', len: 240, sole: 60, blade: 50, depth: 0.035, camber: 0.015, tear: 0.002,
    what: 'Nine inches, set fine. It follows the face rather than flattening it, and gets through wild grain clean.',
  },
};

// How near an end of the board counts as off it (mm). A finger can't start a stroke exactly at the end
// of the board, or stop exactly at the other, so a stroke put down this close to the end it moves away
// from starts at that end, and one lifted this close to the end it's heading for runs off it. The page
// passes its own, from how big the board is on the screen.
export const REACH = 12;

const XS = new Float64Array(1024), ZS = new Float64Array(1024);
const HX = new Float64Array(1024), HZ = new Float64Array(1024);

export class Stroke {
  // x, y: where the blade is put down (mm). rand: the board's random stream (for tear-out).
  // reach: how near an end counts as off it (mm).
  constructor(board, tool, x, y, rand, reach = REACH) {
    this.b = board;
    this.t = typeof tool === 'string' ? PLANES[tool] : tool;
    this.rand = rand;
    this.reach = reach;
    this.x = x; this.y = y; // where the blade is now
    this.x0 = x; this.y0 = y;
    this.spanX = 0; this.spanY = 0; // how far the finger has gone along and across from where it started
    this.dir = 0; // +1 toward the far end, -1 toward the near end, 0 until the plane has moved
    this.next = -1; // the next row the mouth will cut
    this.roll = board.fit().c;
    this.halfRows = Math.round(this.t.len / 2 / board.dx);
    this.tearing = new Float32Array(board.NY);
    this.travel = 0; // how far the mouth has moved along the board, over it, in the stroke's direction
    this.over = false; // whether the blade was ever over the board
    this.rows = 0; this.cells = 0; this.volume = 0; this.tornNew = 0;
    this.run = 0; this.longest = 0; this.fullWidthRows = 0;
    this.shavings = []; // each continuous cut: [{ i, w: cut width in mm, d: depth }, ...]
    this.current = null;
    this.changed = []; // cells cut since the page last looked, so it can redraw just those
  }

  // Moves the blade to (x, y). Cuts every row the mouth passes over, going forward.
  // Returns what happened on the way, for the sound and the shaving.
  move(x, y) {
    const b = this.b, out = { rows: 0, cells: 0, volume: 0, torn: 0, width: 0, cutting: false };
    this.spanX = Math.max(this.spanX, Math.abs(x - this.x0));
    this.spanY = Math.max(this.spanY, Math.abs(y - this.y0));
    if (!this.dir) {
      if (Math.abs(x - this.x0) < 3) { this.y = y; return out; }
      this.dir = x > this.x0 ? 1 : -1;
      // Put down within reach of the end it's leaving, it starts from that end.
      const L = b.L, from = this.dir > 0 ? (this.x0 < this.reach ? Math.min(this.x0, 0) : this.x0)
        : (this.x0 > L - this.reach ? Math.max(this.x0, L - 1e-6) : this.x0);
      this.next = this.rowAt(from);
    }
    const px = this.x, py = this.y;
    const ahead = (x - px) * this.dir;
    if (ahead <= 0) { this.y = y; return out; } // dragging back: the iron is lifted
    const target = this.rowAt(x);
    while ((target - this.next) * this.dir >= 0) {
      const i = this.next;
      this.next += this.dir;
      if (i < 0 || i >= b.NX) continue;
      const xi = b.xOf(i), f = Math.min(1, Math.max(0, (xi - px) / (x - px || 1)));
      const r = this.cutRow(i, py + (y - py) * f);
      out.rows++;
      if (r.cells) {
        out.cells += r.cells; out.volume += r.volume; out.torn += r.torn;
        out.width = Math.max(out.width, r.width); out.cutting = true;
      }
    }
    const on0 = Math.min(Math.max(px, 0), b.L), on1 = Math.min(Math.max(x, 0), b.L);
    // Going along the board only counts while the blade is over it, across its width as well.
    const hb = this.t.blade / 2;
    if (Math.max(py, y) + hb > 0 && Math.min(py, y) - hb < b.W && (on1 !== on0 || (x >= 0 && x <= b.L))) {
      this.travel += Math.abs(on1 - on0);
      this.over = true;
    }
    this.from = Math.min(this.from ?? on0, on0, on1); this.to = Math.max(this.to ?? on1, on0, on1);
    this.x = x; this.y = y;
    return out;
  }

  // The row whose cell holds a given x. Past the ends it keeps counting, so the mouth can run off the board.
  rowAt(x) { return Math.floor(x / this.b.dx); }

  // One row under the mouth, with the blade centred at yc.
  cutRow(i, yc) {
    const b = this.b, t = this.t, NY = b.NY, dy = b.dy, top = b.top, roll = this.roll;
    const res = { cells: 0, volume: 0, torn: 0, width: 0 };
    const r0 = Math.max(0, i - this.halfRows), r1 = Math.min(b.NX - 1, i + this.halfRows);
    const c0 = Math.max(0, Math.ceil((yc - t.sole / 2) / dy - 0.5)), c1 = Math.min(NY - 1, Math.floor((yc + t.sole / 2) / dy - 0.5));
    if (c1 < c0) { this.breakShaving(); return res; }
    // The highest point under the sole in each row, with the board's tilt across taken out.
    let n = 0;
    for (let r = r0; r <= r1; r++) {
      let mx = -Infinity;
      const base = r * NY;
      for (let j = c0; j <= c1; j++) {
        const v = top[base + j] - roll * ((j + 0.5) * dy - yc);
        if (v > mx) mx = v;
      }
      XS[n] = r; ZS[n] = mx; n++;
    }
    // Where the hand presses: over the mouth, or as near it as the sole is supported.
    const a = Math.min(Math.round(0.6 * this.halfRows), Math.floor((r1 - r0) / 2));
    const p = Math.min(Math.max(i, r0 + a), r1 - a);
    // Upper hull of the row maxima, then the hull's edge above p.
    let m = 0;
    for (let k = 0; k < n; k++) {
      const x = XS[k], z = ZS[k];
      while (m >= 2 && (HZ[m - 1] - HZ[m - 2]) * (x - HX[m - 2]) <= (z - HZ[m - 2]) * (HX[m - 1] - HX[m - 2])) m--;
      HX[m] = x; HZ[m] = z; m++;
    }
    let zm, sl = 0;
    if (m === 1) zm = HZ[0];
    else {
      let k = 0;
      while (k < m - 2 && HX[k + 1] < p) k++;
      if (p === HX[k + 1] && i > p && k < m - 2) k++;
      sl = (HZ[k + 1] - HZ[k]) / (HX[k + 1] - HX[k]);
      zm = HZ[k] + sl * (i - HX[k]); // the sole's height at the mouth
    }
    this.ride = { z: zm, slope: sl / b.dx, y: yc }; // for the side view: where the sole sits
    // The blade's edge, and the cut.
    const bh = t.blade / 2;
    const k0 = Math.max(0, Math.ceil((yc - bh) / dy - 0.5)), k1 = Math.min(NY - 1, Math.floor((yc + bh) / dy - 0.5));
    const rand = this.rand;
    let lo = NY, hi = -1, depthSum = 0;
    for (let j = k0; j <= k1; j++) {
      const off = (j + 0.5) * dy - yc, q = off / bh;
      const edge = zm + roll * off - t.depth + t.camber * q * q;
      const id = i * NY + j;
      const z = top[id];
      if (z <= edge) { this.tearing[j] = 0; continue; }
      const took = z - edge;
      top[id] = edge;
      b.cut[id] = 1;
      b.pencil[id] = 0;
      this.changed.push(id);
      res.cells++; res.volume += took; depthSum += took;
      if (j < lo) lo = j;
      if (j > hi) hi = j;
      // Tear-out: against the grain the fibres lift ahead of the blade and break off below the cut.
      const against = b.grain[id] * this.dir < 0;
      // With the grain it only happens in knots and wild figure.
      const thin = Math.min(1, took / t.depth) ** 0.6, tear = b.tear[id];
      let chance = tear * t.tear * thin * (against ? 0.2 : Math.max(0, tear - 0.6) * 0.1);
      if (against && this.tearing[j] > 0) chance = Math.max(chance, 0.6 * this.tearing[j] * t.tear);
      if (rand() < chance) {
        const pit = Math.min(0.1, t.depth) * (0.5 + 0.5 * rand()); // it breaks off a little below the cut
        top[id] -= pit;
        b.torn[id] = 1;
        res.torn++;
        res.volume += pit;
        this.tearing[j] = Math.min(1, tear + 0.2);
      } else {
        b.torn[id] = 0;
        this.tearing[j] = 0;
      }
    }
    if (res.cells) {
      res.width = (hi - lo + 1) * dy;
      this.rows++; this.cells += res.cells; this.volume += res.volume * b.dx * dy; this.tornNew += res.torn;
      this.run++;
      if (this.run > this.longest) this.longest = this.run;
      if (res.width >= t.blade * 0.85) this.fullWidthRows++;
      if (!this.current) { this.current = []; this.shavings.push(this.current); }
      this.current.push({ i, lo, hi, w: res.width, d: depthSum / res.cells, torn: res.torn });
    } else this.breakShaving();
    return res;
  }

  breakShaving() { this.run = 0; this.current = null; }

  // Where the plane goes as it's lifted: lifted within reach of the end it's heading for, it runs off
  // that end; otherwise nowhere (null). The page moves it there itself, so the shaving and sound follow.
  liftTo() {
    const L = this.b.L;
    if (this.dir > 0 && this.x < L + 1 && this.x > L - this.reach) return L + 1;
    if (this.dir < 0 && this.x > -1 && this.x < this.reach) return -1;
    return null;
  }

  // The stroke is over. counts: whether it counts as a stroke, which is when it took a shaving.
  // skated: the plane went along the board and cut nothing (the sole rode on higher wood);
  // across: the finger went across the board rather than along it; off: it went along beside the
  // board, never over it.
  end() {
    const off = this.liftTo();
    if (off !== null) this.move(off, this.y);
    const b = this.b, L = b.L;
    const longest = this.longest * b.dx;
    // How far onto the board it was put down, and how far short of the other end it was lifted, past
    // what counts as off the ends (mm).
    const fwd = this.dir >= 0;
    const startIn = fwd ? (this.x0 < this.reach ? 0 : Math.min(L, this.x0)) : (this.x0 > L - this.reach ? 0 : Math.min(L, L - this.x0));
    const stopShort = !this.dir ? 0 : fwd ? Math.max(0, Math.min(L, L - this.x)) : Math.max(0, Math.min(L, this.x));
    const across = this.cells === 0 && this.spanY > 25 && this.spanY > this.spanX;
    return {
      counts: this.cells > 0,
      skated: this.cells === 0 && this.travel >= 30,
      across,
      off: this.cells === 0 && !across && !this.over && this.spanX >= 30,
      straight: this.spanY < 25, // straight down the board, not from corner to corner
      from: this.from ?? 0, to: this.to ?? 0, // the stretch of the board the mouth went over (mm)
      startIn, stopShort, y0: this.y0, y: this.y,
      dir: this.dir,
      cells: this.cells,
      volume: this.volume,
      torn: this.tornNew,
      longest, // mm of the longest unbroken shaving
      fullLength: longest >= b.L * 0.97,
      fullWidth: this.rows > 0 && this.fullWidthRows >= this.rows * 0.9,
      shavings: this.shavings,
    };
  }
}

// Plays one straight stroke from x0 to x1 at y (or from y0 to y1), as a person's swipe would.
export function stroke(board, tool, x0, x1, y0, y1 = y0, rand = Math.random) {
  const s = new Stroke(board, tool, x0, y0, rand);
  const steps = Math.max(2, Math.ceil(Math.abs(x1 - x0) / 20));
  for (let k = 1; k <= steps; k++) s.move(x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps);
  return s.end();
}
