// The parts that don't need a browser:  node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Board, restLine, FLAT, TABLETOP } from '../js/board.js';
import { Stroke, PLANES, stroke } from '../js/plane.js';
import { BOARDS, parFor } from '../js/boards.js';
import { WOODS } from '../js/woods.js';
import { solve, aim } from '../js/solver.js';
import { rng } from '../js/rng.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// A clean test board: no saw marks, no wander, so only the shape we give it.
const plain = extra => new Board({ L: 760, W: 180, wood: 'pine', t0: 22, seed: 5, rough: 0, vary: 0, wander: 0, ...extra });
// Which rows along the middle got cut.
const cutAlong = (b, j = Math.floor(b.NY / 2)) => Array.from({ length: b.NX }, (_, i) => b.cut[i * b.NY + j]);
const took = (b, i, j) => b.start[i * b.NY + j] - b.top[i * b.NY + j];

test('a board comes out the same from the same seed', () => {
  const a = new Board(BOARDS[4]), b = new Board(BOARDS[4]);
  assert.deepEqual(a.top, b.top);
  assert.deepEqual(a.grain, b.grain);
  const c = new Board({ ...BOARDS[4], seed: 9 });
  assert.notDeepEqual(a.top, c.top);
});

test('a straightedge rests on the highest points under it', () => {
  // A hollow: it rests on the two ends.
  let r = restLine([0, 1, 2, 3, 4], [2, 1, 0.5, 1, 2], 5, 2);
  assert.equal(r.z, 2);
  assert.equal(r.s, 0);
  // A crown: it rocks on the top.
  r = restLine([0, 1, 2, 3, 4], [0, 1, 1.5, 1, 0], 5, 2);
  assert.equal(r.z, 1.5);
  // Balanced off-centre on a slope, it follows the hull's edge.
  r = restLine([0, 1, 2], [0, 1, 2], 3, 0.5);
  assert.equal(r.z, 0.5);
  assert.equal(r.s, 1);
});

test('the jointer rides over a hollow and takes the high ends down first', () => {
  const b = plain({ bow: 1.2 });
  stroke(b, 'jointer', -300, 1100, 90, 90, rng(1));
  const cut = cutAlong(b);
  assert.equal(cut[0], 1, 'it cuts the near end');
  assert.equal(cut[b.NX - 1], 1, 'and the far end');
  assert.equal(cut[b.NX >> 1], 0, 'but not the bottom of the hollow');
});

test('on a crown the jointer cuts the middle and leaves the low ends', () => {
  const b = plain({ bow: -1.2 });
  stroke(b, 'jointer', -300, 1100, 90, 90, rng(1));
  const cut = cutAlong(b);
  assert.equal(cut[b.NX >> 1], 1);
  assert.equal(cut[0], 0, 'pressure on the heel at the end of the stroke: no dive off the end');
});

test('the smoother dips into a broad hollow that the jointer bridges', () => {
  // Over the jointer's length it sags 0.12 mm, more than its cut; over the smoother's, 0.024, less than its cut.
  const dip = { humps: [[0.5, 0.5, 400, 3000, -0.55]] };
  const j = plain(dip), s = plain(dip);
  const mid = j.NX >> 1, col = j.NY >> 1;
  stroke(j, 'jointer', -300, 1100, 90, 90, rng(1));
  stroke(s, 'smoother', -300, 1100, 90, 90, rng(1));
  assert.equal(took(j, mid, col), 0, 'the long sole bridges it');
  assert.ok(took(s, mid, col) > 0.005, 'the short sole follows it down');
});

test('the jack hogs off more than the jointer, deepest in the middle of its curved edge', () => {
  const a = plain({}), b = plain({});
  stroke(a, 'jack', -300, 1100, 90, 90, rng(1));
  stroke(b, 'jointer', -300, 1100, 90, 90, rng(1));
  const i = a.NX >> 1, mid = Math.floor(90 / a.dy), edge = Math.ceil((90 - 23) / a.dy - 0.5);
  assert.ok(took(a, i, mid) > took(b, i, mid) * 1.8, 'a heavy cut');
  assert.ok(took(a, i, mid) > took(a, i, edge) + 0.1, 'scalloped by the camber');
  assert.ok(Math.abs(took(a, i, mid) - PLANES.jack.depth) < 0.03);
});

test('a plane can only go one cut deeper than the wood beside its blade', () => {
  const b = plain({});
  const r = rng(2);
  stroke(b, 'jointer', -300, 1100, 90, 90, r);
  const after1 = took(b, b.NX >> 1, 18);
  stroke(b, 'jointer', -300, 1100, 90, 90, r);
  assert.equal(took(b, b.NX >> 1, 18), after1, 'the sole rides on the uncut strips either side');
});

test('planing against the grain tears out; with the grain it does not', () => {
  const r = rng(3);
  const lanes = (b, tool, x0, x1) => { for (const y of [30, 75, 120]) for (let k = 0; k < 3; k++) stroke(b, tool, x0, x1, y, y, r); };
  const pine = () => new Board({ ...BOARDS[1], knots: [] }); // straight pine, grain running toward the far end
  const withGrain = pine(), against = pine(), fine = pine();
  lanes(withGrain, 'jointer', -400, 1200);
  assert.equal(withGrain.tornLeft(), 0, 'no tear-out with the grain in straight pine');
  lanes(against, 'jointer', 1200, -400);
  assert.ok(against.tornLeft() > 10, 'tear-out the wrong way: ' + against.tornLeft());
  lanes(fine, 'smoother', 1200, -400);
  assert.ok(fine.tornLeft() <= 2, 'a finely set smoother gets away with it');
});

test('a stroke counts once the plane travels, and dragging back lifts the iron', () => {
  const b = plain({});
  const s = new Stroke(b, 'smoother', 100, 90, rng(4));
  s.move(101, 90);
  assert.equal(s.end().counts, false, 'a tap is not a stroke');
  const t = new Stroke(b, 'smoother', 100, 90, rng(4));
  t.move(300, 90);
  const cells = t.cells;
  t.move(150, 90);
  assert.equal(t.cells, cells, 'nothing cut on the way back');
  const e = t.end();
  assert.equal(e.counts, true);
  assert.equal(e.dir, 1);
});

test('winding sticks see twist, and a straightedge sees light in a hollow', () => {
  const tw = plain({ twist: 0.8 });
  assert.ok(Math.abs(tw.wind().wind) > 1, 'out of wind');
  assert.ok(Math.abs(plain({}).wind().wind) < 0.01, 'a flat board is out of wind');
  const hollow = plain({ bow: 1 });
  const se = hollow.straightedge(0, 90, 760, 90);
  assert.ok(se.gap > 0.6 && Math.abs(se.at - 0.5) < 0.1, 'light in the middle');
  const across = plain({ cup: 1 }).straightedge(380, 0, 380, 180);
  assert.ok(across.gap > 0.6, 'light under a cup');
});

test('flatness and thickness', () => {
  const b = plain({});
  assert.ok(b.flatness() < 1e-3);
  assert.ok(Math.abs(b.thinnest().t - 22) < 1e-3);
  assert.ok(!b.done(), 'not done until it has been planed all over');
  const bowed = plain({ bow: 0.6 });
  assert.ok(Math.abs(bowed.flatness() - 0.6) < 0.02);
});

test('a board part-way through saves and loads exactly', () => {
  const b = new Board({ ...BOARDS[2] });
  const r = rng(5);
  for (const y of [40, 90]) stroke(b, 'jack', -200, 1000, y, y, r);
  stroke(b, 'jointer', 1000, -200, 120, 120, r); // some tear-out
  b.pencil.fill(1, 0, 400);
  const saved = JSON.parse(JSON.stringify(b.save()));
  const c = new Board({ ...BOARDS[2] });
  assert.equal(c.load(saved), true);
  for (let k = 0; k < b.top.length; k++) assert.ok(Math.abs(b.top[k] - c.top[k]) < 0.001);
  assert.deepEqual(c.cut, b.cut);
  assert.deepEqual(c.torn, b.torn);
  assert.deepEqual(c.pencil, b.pencil);
  assert.equal(new Board({ ...BOARDS[3] }).load(saved), false, 'a different board refuses it');
});

test('every board is planned: sized for the tabletop with its spare', () => {
  assert.equal(BOARDS.length, 13);
  BOARDS.forEach((def, k) => {
    assert.equal(def.no, k + 1);
    assert.ok(def.title && def.par > 0 && def.t0 > TABLETOP, 'board ' + def.no);
    if (!def.panel) assert.ok(WOODS[def.wood], 'a known wood for board ' + def.no);
    const b = new Board(def);
    const best = aim(b).t;
    assert.ok(best >= def.best - 0.02, `board ${def.no}: the best plane leaves ${best.toFixed(2)}, short of ${def.best}`);
    assert.ok(b.thinnest().t > TABLETOP + def.spare, 'starts thicker than it needs');
  });
});

test('the solver flattens board 1 at its par and its best', () => {
  const b = new Board(BOARDS[0]);
  const r = solve(b);
  assert.equal(r.done, true);
  assert.equal(parFor(r.par), BOARDS[0].par);
  assert.ok(Math.abs(r.thinnest - BOARDS[0].best) < 0.02, 'thinnest ' + r.thinnest);
  assert.ok(b.flatness() <= FLAT);
});

test('the offline copy lists every file the page needs, and nothing else', async () => {
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  const listed = new Set([...sw.matchAll(/'([^']+\.(?:js|css|woff2|svg|html|webmanifest))'/g)].map(m => m[1]));
  const page = (await readdir(join(root, 'js'))).filter(f => f.endsWith('.js') && f !== 'solver.js').map(f => 'js/' + f);
  const fonts = (await readdir(join(root, 'fonts'))).map(f => 'fonts/' + f);
  const needed = [...page, ...fonts, 'css/app.css', 'index.html', 'icon.svg', 'manifest.webmanifest'];
  for (const f of needed) assert.ok(listed.has(f), `sw.js doesn't list ${f}`);
  for (const f of listed) assert.ok(needed.includes(f), `sw.js lists ${f}, which the page doesn't load`);
});
