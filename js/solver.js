// A bot that flattens a board the way a careful woodworker would, to prove each board can be done
// inside its thickness and to set par. It works out the plane it's aiming for (the one that leaves
// the board thickest, less about a jointer cut) and treats it like a gauge line it never planes
// past. Each stroke it tries the useful lanes and stretches with the right plane on a copy of the
// board, going with the grain wherever the grain has a direction, and keeps the stroke that takes
// the most off the high spots without tearing out where it would show. When the face is flat it
// takes fine smoother passes to get below whatever tear-out is left. Only aims lower when there's
// nothing else it can do.

import { Stroke, PLANES } from './plane.js';
import { rng } from './rng.js';

// The plane that leaves the most wood: below the face everywhere, and as far above the underside
// as it can be at the thinnest point. Returns { a, b, c } as in Board.fit(), and the thickness t.
export function aim(board, skip = null) {
  const { NX, NY, top, bottom } = board, L2 = board.L / 2, W2 = board.W / 2;
  const xs = new Float64Array(NX), ys = new Float64Array(NY);
  for (let i = 0; i < NX; i++) xs[i] = board.xOf(i) - L2;
  for (let j = 0; j < NY; j++) ys[j] = board.yOf(j) - W2;
  const score = (b, c) => {
    let a = Infinity;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      if (skip && skip[i * NY + j]) continue;
      const v = top[i * NY + j] - b * xs[i] - c * ys[j];
      if (v < a) a = v;
    }
    let t = Infinity;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      const v = a + b * xs[i] + c * ys[j] - bottom[i * NY + j];
      if (v < t) t = v;
    }
    return { a, t };
  };
  const f0 = board.fit();
  const golden = (f, lo, hi, n) => {
    const g = 0.6180339887;
    let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo), f1 = f(x1), f2 = f(x2);
    for (let k = 0; k < n; k++) {
      if (f1 < f2) { lo = x1; x1 = x2; f1 = f2; x2 = lo + g * (hi - lo); f2 = f(x2); }
      else { hi = x2; x2 = x1; f2 = f1; x1 = hi - g * (hi - lo); f1 = f(x1); }
    }
    return (lo + hi) / 2;
  };
  const sb = 6 / board.L, sc = 6 / board.W;
  let bestC = f0.c;
  const bestB = golden(b => {
    const c = golden(c => score(b, c).t, f0.c - sc, f0.c + sc, 22);
    return score(b, c).t;
  }, f0.b - sb, f0.b + sb, 22);
  bestC = golden(c => score(bestB, c).t, f0.c - sc, f0.c + sc, 22);
  const { a, t } = score(bestB, bestC);
  return { a, b: bestB, c: bestC, t };
}

function clone(board) {
  const c = Object.create(Object.getPrototypeOf(board));
  Object.assign(c, board);
  c.top = board.top.slice(); c.cut = board.cut.slice(); c.pencil = board.pencil.slice(); c.torn = board.torn.slice();
  return c;
}
function restore(board, from) {
  board.top.set(from.top); board.cut.set(from.cut); board.pencil.set(from.pencil); board.torn.set(from.torn);
}

// Plays a stroke the way the page does: the blade put down at x0, swiped to x1.
export function play(board, tool, x0, x1, y, rand) {
  const s = new Stroke(board, tool, x0, y, rand);
  const steps = Math.max(2, Math.ceil(Math.abs(x1 - x0) / 25));
  for (let k = 1; k <= steps; k++) s.move(x0 + ((x1 - x0) * k) / steps, y);
  return s.end();
}

// Flattens the board in place. Returns the strokes it took and how it came out.
export function solve(board, opts = {}) {
  const maxStrokes = opts.max ?? 220;
  const rand = rng(opts.seed ?? 99);
  const band = opts.band ?? 0.07; // bring every spot to within this of the aim
  const sink = opts.sink ?? 0.12; // aim about a jointer cut under the best plane: its last pass sets the face
  const { NX, NY, L, W } = board;
  const floor = new Float32Array(NX * NY);
  const first = aim(board);
  const setFloor = (a, drop) => {
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++)
      floor[i * NY + j] = a.a - drop + a.b * (board.xOf(i) - L / 2) + a.c * (board.yOf(j) - W / 2);
  };
  setFloor(first, sink);
  // When nothing more can be done above the aim, aim lower: at the deepest spot that isn't torn.
  const reaim = () => {
    setFloor(aim(board, board.torn), 0.02);
    if (opts.log) opts.log('reaim');
  };

  const strokes = [];
  const lanesFor = tool => {
    const t = PLANES[tool], out = [], step = t.blade / 3;
    for (let y = t.blade / 2 - 6; y <= W - t.blade / 2 + 6 + 0.1; y += step) out.push(y);
    out.push(W - t.blade / 2 + 6);
    return out;
  };
  // What's still above the band, what's gone under the floor, and what's rough or torn.
  const measure = b => {
    let over = 0, under = 0, deep = 0, rough = 0, torn = 0, tornAll = 0;
    for (let k = 0; k < floor.length; k++) {
      const e = b.top[k] - floor[k];
      if (e > band) over += e - band; else if (e < 0) { under -= e; if (e < -0.03 && !b.torn[k]) deep++; }
      if (!b.cut[k]) rough++;
      if (b.torn[k]) { tornAll++; if (e < band + 0.02) torn++; } // torn: tear-out that reaches the finished face
    }
    return { over, under, deep, rough, torn, tornAll };
  };

  const work = clone(board);
  let stuck = 0, reaims = 0, doneAt = board.done() ? 0 : -1, extra = 0;
  while (strokes.length < maxStrokes) {
    if (board.done()) {
      if (doneAt < 0) doneAt = strokes.length;
      if (board.tornSpots() <= (opts.spots ?? 1) || extra >= (opts.cleanup ?? 40)) break;
    }
    let emax = 0;
    for (let k = 0; k < floor.length; k++) emax = Math.max(emax, board.top[k] - floor[k]);
    const tools = doneAt >= 0 ? ['smoother'] : stuck ? ['jack', 'jointer', 'smoother']
      : emax > 0.6 ? ['jack', 'jointer'] : emax > band + 0.05 || board.roughLeft() > 30 ? ['jointer', 'smoother'] : ['smoother', 'jointer'];
    const before = measure(board);
    let best = null;
    for (const tool of tools) {
      for (const y of lanesFor(tool)) {
        for (const seg of segments(board, tool, y, floor, Math.max(band, PLANES[tool].depth + 0.02))) {
          restore(work, board);
          const r0 = rand.state();
          const res = play(work, tool, seg.x0, seg.x1, y, rand);
          rand.set(r0);
          if (!res.cells) continue;
          const after = measure(work);
          let score;
          if (doneAt >= 0) {
            // Flat already: only fine strokes that take tear-out away, as shallow as they can.
            if (!work.done()) continue;
            const gone = board.tornLeft() - work.tornLeft();
            if (gone <= 0) continue;
            score = gone - 2 * (after.under - before.under) / Math.max(1, res.cells);
          } else {
            if (after.deep > before.deep) continue; // never below the aim
            score = (before.over - after.over) - 3 * (after.under - before.under)
              + 0.05 * (before.rough - after.rough)
              - 1 * (after.torn - before.torn) - 0.05 * Math.max(0, after.tornAll - before.tornAll);
          }
          if (!best || score > best.score) best = { score, tool, y, ...seg };
        }
      }
    }
    if (!best || best.score <= 0.001) {
      if (doneAt >= 0) break;
      if (!stuck) { stuck = 1; continue; } // try every plane before giving up on this aim
      if (++reaims > 12) break;
      reaim();
      stuck = 0;
      continue;
    }
    stuck = 0;
    if (doneAt >= 0) extra++;
    const res = play(board, best.tool, best.x0, best.x1, best.y, rand);
    if (opts.log) opts.log(`${best.tool} y${Math.round(best.y)} ${Math.round(best.x0)}>${Math.round(best.x1)} score ${best.score.toFixed(3)} emax ${emax.toFixed(2)} flat ${board.flatness().toFixed(3)} thin ${board.thinnest().t.toFixed(2)}`);
    strokes.push({ tool: best.tool, x0: best.x0, x1: best.x1, y: best.y, cells: res.cells, torn: res.torn });
  }
  const th = board.thinnest();
  return {
    strokes,
    count: strokes.length,
    flatAt: doneAt >= 0 ? doneAt : strokes.length, // strokes to a flat face planed all over
    par: strokes.length, // and then the tear-out planed away
    done: board.done(),
    flat: board.flatness(),
    thinnest: th.t,
    torn: board.tornSpots(),
    aim: first,
  };
}

// The stretches of a lane worth a stroke: the whole length, and the part that stands proud of
// the aim, each split where the grain changes so every piece goes with the grain.
function segments(board, tool, y, tz, band) {
  const { NX, NY, dx, L } = board, t = PLANES[tool];
  const j0 = Math.max(0, Math.ceil((y - t.blade / 2) / board.dy - 0.5)), j1 = Math.min(NY - 1, Math.floor((y + t.blade / 2) / board.dy - 0.5));
  if (j1 < j0) return [];
  const dirAt = new Int8Array(NX), proud = new Uint8Array(NX);
  for (let i = 0; i < NX; i++) {
    let g = 0, e = -1;
    for (let j = j0; j <= j1; j++) { g += board.grain[i * NY + j]; e = Math.max(e, board.top[i * NY + j] - tz[i * NY + j]); }
    dirAt[i] = g >= 0 ? 1 : -1;
    proud[i] = e > band || !board.cut[i * NY + ((j0 + j1) >> 1)] ? 1 : 0;
  }
  // Runs of the same grain direction.
  const runs = [];
  let s = 0;
  for (let i = 1; i <= NX; i++) {
    if (i === NX || dirAt[i] !== dirAt[s]) { runs.push([s, i - 1, dirAt[s]]); s = i; }
  }
  const out = [], seen = new Set();
  const over = t.len * 0.6;
  const add = (x0, x1) => {
    const key = Math.round(x0 / 10) + ',' + Math.round(x1 / 10);
    if (!seen.has(key)) { seen.add(key); out.push({ x0, x1 }); }
  };
  // The proud stretch of [a, b] as a stopped stroke, either way.
  const proudPart = (a, b, d) => {
    let p0 = -1, p1 = -1;
    for (let i = a; i <= b; i++) if (proud[i]) { if (p0 < 0) p0 = i; p1 = i; }
    if (p0 < 0 || (p0 <= a + 3 && p1 >= b - 3)) return;
    const pa = Math.max(p0 * dx - 10, a === 0 ? -over : a * dx), pb = Math.min((p1 + 1) * dx + 10, b === NX - 1 ? L + over : (b + 1) * dx);
    if (d >= 0) add(pa, pb);
    if (d <= 0) add(pb, pa);
  };
  // In wild grain (no long run either way) there's no right way: the whole length and its proud
  // part, both ways. Otherwise a careful woodworker only planes with the grain.
  const longest = runs.reduce((m, [a, b]) => Math.max(m, b - a + 1), 0);
  if (longest < NX * 0.4) {
    add(-over, L + over); add(L + over, -over);
    proudPart(0, NX - 1, 0);
  }
  // Each run of the grain, with the grain.
  for (const [a, b, d] of runs) {
    if ((b - a + 1) * dx < 40) continue;
    const xa = a === 0 ? -over : a * dx, xb = b === NX - 1 ? L + over : (b + 1) * dx;
    if (d > 0) add(xa, xb); else add(xb, xa);
    proudPart(a, b, d);
  }
  return out;
}
