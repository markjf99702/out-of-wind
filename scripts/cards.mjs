// A person following each board's card, for the tests and for setting par. They plane the way the
// card says and judge the face only by what the page shows: the winding sticks, the light under the
// straightedge, rough-sawn patches, the grain on the front edge (on a panel, each board's own) and
// tear-out. They never see the heights themselves, the way the solver does.
//
// A plan is the card's opening and then the finish every board shares: full-length passes lane by
// lane, with the grain, and before each round the straightedge along every lane, with short strokes
// wherever it rocks on a high stretch. Then fine smoother passes over any tear-out.
//   node scripts/cards.mjs            every board, with three lane spacings
//   node scripts/cards.mjs 3 7        only boards 3 and 7

import { Board, WIND, readEdge } from '../js/board.js';
import { BOARDS } from '../js/boards.js';
import { Stroke, PLANES } from '../js/plane.js';
import { rng } from '../js/rng.js';

// Each board's card, as steps.
//   sticks: strokes from one high corner diagonally to the other until the sticks line up
//   edges: the edge lanes, hanging off, until a straightedge across shows no light in the middle
//   midlanes: the middle lanes until a straightedge across stops rocking on the middle
//   middle a b n: short strokes from a to b (fractions along) on every lane, n times over
//   passes [any]: the finish (any: interlocked or curly, where no way is the right way)
//   clean: the smoother over the lanes with tear-out
export const PLANS = {
  1: [['passes']],
  2: [['edges'], ['passes']],
  3: [['sticks'], ['passes']],
  4: [['middle', 0.25, 0.75, 3], ['passes']],
  5: [['passes'], ['clean']],
  6: [['sticks'], ['edges'], ['passes'], ['clean']],
  7: [['middle', 0.15, 0.7, 3], ['passes'], ['clean']],
  8: [['sticks'], ['passes'], ['clean']],
  9: [['passes', 'any'], ['clean']],
  10: [['sticks'], ['passes'], ['clean']],
  11: [['sticks'], ['midlanes'], ['passes'], ['clean']],
  12: [['passes', 'any'], ['clean']],
  13: [['sticks'], ['midlanes'], ['passes'], ['clean']],
};

// Plays a board by its card. step: how far apart the lanes are, as a share of the blade's width;
// over: how far off each end the full-length strokes start and stop (mm; less than 0 puts them down
// on the board and lifts them before its far end, as a finger on a phone does).
// Returns whether it was ever done (the page grades a board the moment it is), the strokes that took
// (only strokes that cut count, as on the page) and how thick it was then, and the board as it was
// left after any smoothing.
export function follow(def, { step = 0.75, over = 60, seed = 11, max = 200, plan = PLANS[def.no], log = null } = {}) {
  const b = new Board(def), rand = rng(seed);
  const { L, W, NX, NY } = b;
  let strokes = 0, tries = 0, anyway = false, doneAt = null, thickAt = null;
  const alive = () => b.thinnest().t >= b.tmin && strokes < max && tries < max * 2;
  const go = (tool, x0, x1, y0, y1 = y0) => {
    const s = new Stroke(b, tool, x0, y0, rand);
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 20));
    for (let k = 1; k <= n; k++) s.move(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
    const r = s.end();
    tries++;
    if (r.counts) strokes++;
    if (doneAt === null && b.done()) { doneAt = strokes; thickAt = b.thinnest().t; } // graded here, as on the page
    if (log) log(`${tool} ${Math.round(x0)}>${Math.round(x1)} @${Math.round(y0)}${y1 !== y0 ? '>' + Math.round(y1) : ''}: ${r.cells} cells, flat ${b.flatness().toFixed(3)}, wind ${b.wind().wind.toFixed(2)}, thinnest ${b.thinnest().t.toFixed(2)}`);
    return r;
  };
  const tool = 'jointer', t = PLANES[tool];
  // Which way to plane, read off the front edge (a panel's boards each show their own).
  const grainAt = (i, y) => (def.strips ? b.grain[i * NY + Math.max(0, Math.min(NY - 1, Math.floor(y / b.dy)))] : b.grain[i * NY + NY - 1]);
  const runsAt = y => {
    const out = [];
    let s = 0;
    for (let i = 1; i <= NX; i++) if (i === NX || grainAt(i, y) !== grainAt(s, y)) { out.push([s, i - 1, grainAt(s, y)]); s = i; }
    return out;
  };
  const wild = runsAt(W / 2).length > 8; // curl: it turns every inch
  // A stroke over [xa, xb] at y, split where the grain turns so each part goes with it.
  const along = (xa, xb, y, tl = tool) => {
    if (wild || anyway) return go(tl, xa, xb, y);
    for (const [a, z, d] of runsAt(y)) {
      const sa = Math.max(xa, a === 0 ? -Infinity : a * b.dx), sb = Math.min(xb, z === NX - 1 ? Infinity : (z + 1) * b.dx);
      if (sb - sa < 30) continue;
      if (d > 0) go(tl, sa, sb, y); else go(tl, sb, sa, y);
    }
  };
  const lo = t.blade / 2 - 6, hi = W - t.blade / 2 + 6; // the edge lanes hang 6 mm off
  const lanes = [];
  for (let y = lo; y < hi - 1; y += t.blade * step) lanes.push(y);
  lanes.push(hi);
  const across = xf => b.straightedge(xf * L, 0.5, xf * L, W - 0.5);
  let k = 0;
  const steps = {
    sticks() {
      for (let n = 0; n < 30 && alive() && Math.abs(b.wind().wind) >= WIND; n++, k++) {
        const w = b.wind().wind; // > 0: the far right and near left corners are high
        const o = [0, 0.6, -0.6, 1.2, -1.2, 0.3, -0.3, 0.9, -0.9][k % 9] * t.blade * 0.5;
        // The same line from corner to corner however far off the ends it starts and stops.
        const ya = (w > 0 ? lo : hi) + o, yb = (w > 0 ? hi : lo) + o, yAt = x => ya + ((yb - ya) * (x + 60)) / (L + 120);
        go(tool, -over, L + over, yAt(-over), yAt(L + over));
      }
    },
    edges() {
      for (let n = 0; n < 8 && alive(); n++) {
        const lit = [0.25, 0.5, 0.75].filter(xf => { const r = across(xf); return r.gap > 0.05 && r.at > 0.25 && r.at < 0.75; }).length;
        if (lit < 2) break;
        along(-over, L + over, lo - 4); along(-over, L + over, hi + 4);
      }
    },
    midlanes() {
      for (let n = 0; n < 8 && alive(); n++) {
        const rocks = [0.25, 0.5, 0.75].filter(xf => { const r = across(xf); return r.gap > 0.05 && (r.at < 0.25 || r.at > 0.75); }).length;
        if (rocks < 2) break;
        for (const y of lanes.slice(1, -1)) along(-over, L + over, y);
      }
    },
    middle(a, z, rounds) {
      for (let n = 0; n < rounds && alive(); n++) for (const y of lanes) along(a * L, z * L, y);
    },
    passes(any) {
      if (any) anyway = true; // and for the smoother after, too
      let best = b.flatness(), since = 0;
      for (let q = 0; alive() && !b.done(); q++) {
        if (q % lanes.length === 0) {
          if (Math.abs(b.wind().wind) >= WIND * 1.5) steps.sticks();
          // The straightedge along each lane: where it rocks on a high stretch, short strokes there.
          for (const y of lanes) {
            const r = readEdge(b.straightedge(0.5, y, L - 0.5, y));
            if (r.kind === 'rocks' && alive() && !b.done()) along(Math.max(0, (r.t0 - 0.1) * L), Math.min(L, (r.t1 + 0.1) * L), y);
          }
        }
        along(-over, L + over, lanes[q % lanes.length]);
        const f = b.flatness();
        if (f < best - 0.003) { best = f; since = 0; } else if (++since > lanes.length * 5) break;
      }
    },
    clean() {
      const ts = PLANES.smoother, last = W - ts.blade / 2 + 4;
      for (let n = 0; n < 3 && b.done() && b.tornSpots() > 0 && alive(); n++) {
        for (let y = ts.blade / 2 - 4; ; y += ts.blade * 0.8) {
          const yy = Math.min(y, last);
          const j0 = Math.max(0, Math.floor((yy - 25) / b.dy)), j1 = Math.min(NY - 1, Math.floor((yy + 25) / b.dy));
          let torn = 0;
          for (let i = 0; i < NX; i++) for (let j = j0; j <= j1; j++) torn += b.torn[i * NY + j];
          if (torn && b.done() && alive()) along(-over, L + over, yy, 'smoother');
          if (yy >= last) break;
        }
      }
    },
  };
  for (const [name, ...args] of plan) { if (!alive()) break; steps[name](...args); }
  const th = b.thinnest().t;
  return {
    done: doneAt !== null, culled: doneAt === null && th < b.tmin, strokes: doneAt ?? strokes, thick: thickAt ?? th,
    flat: b.flatness(), torn: b.tornSpots(), board: b,
  };
}

// The card followed with lanes at three spacings (a person's lanes are never quite even), and once
// more with every stroke put down 8 mm onto the board and lifted 8 mm short of the far end, the way a
// finger on a phone starts and stops (onBoard).
export const SPACINGS = [0.6, 0.75, 0.9];
export function followAll(def) {
  const runs = SPACINGS.map(step => follow(def, { step }));
  const counts = runs.map(r => r.strokes).sort((a, z) => a - z);
  const onBoard = follow(def, { step: 0.75, over: -8 });
  return { runs, done: runs.every(r => r.done) && onBoard.done, median: counts[1], onBoard };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
  for (const def of BOARDS) {
    if (only.length && !only.includes(def.no)) continue;
    const r = followAll(def);
    const each = [...r.runs, r.onBoard].map(x => (x.done ? x.strokes : x.culled ? 'cull' : 'stuck'));
    console.log(`No. ${String(def.no).padStart(2)}  ${r.done ? 'done' : 'NOT DONE'}  strokes ${each.slice(0, 3).join(', ')} (median ${r.median}, par ${def.par}); started on the board ${each[3]}`);
  }
}
