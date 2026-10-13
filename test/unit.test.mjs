// The parts that don't need a browser:  node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Board, restLine, readEdge, FLAT, WIND, TABLETOP } from '../js/board.js';
import { Stroke, PLANES, stroke } from '../js/plane.js';
import { BOARDS, parFor, keepFor } from '../js/boards.js';
import { WOODS } from '../js/woods.js';
import { solve, aim } from '../js/solver.js';
import { rng } from '../js/rng.js';
import { followAll } from '../scripts/cards.mjs';
import * as U from '../js/units.js';

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

test('a stroke counts when it takes a shaving, and dragging back lifts the iron', () => {
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

test('a stroke put down or lifted near an end counts as off it, the way a finger starts and stops', () => {
  // A hollow: the ends stand high, and an end the plane never reaches holds it up on every stroke after.
  const ends = b => { const j = b.NY >> 1; return [b.cut[j], b.cut[(b.NX - 1) * b.NY + j]]; };
  const pushed = plain({ bow: 1.2 });
  stroke(pushed, 'jointer', 8, pushed.L - 8, 90, 90, rng(1));
  assert.deepEqual(ends(pushed), [1, 1], 'put down 8 mm on and lifted 8 mm short, it takes both ends');
  const pulled = plain({ bow: 1.2 });
  stroke(pulled, 'jointer', pulled.L - 8, 8, 90, 90, rng(1));
  assert.deepEqual(ends(pulled), [1, 1], 'pulled toward you, too');
  const inside = plain({ bow: 1.2 });
  const r = stroke(inside, 'jointer', 60, inside.L - 60, 90, 90, rng(1));
  assert.deepEqual(ends(inside), [0, 0], 'put down well onto the board, it starts where it is put down');
  assert.ok(r.startIn === 60 && r.stopShort === 60, 'and says how far in: ' + r.startIn + ', ' + r.stopShort);
  assert.ok(stroke(plain({}), 'jointer', 8, 400, 90).startIn === 0, 'near the end counts as off it');
  // The page passes its own reach, from how big the board is on the screen.
  const wide = plain({ bow: 1.2 });
  const s = new Stroke(wide, 'jointer', 30, 90, rng(1), 35);
  for (let x = 50; x <= wide.L - 30; x += 20) s.move(x, 90);
  assert.equal(s.liftTo(), wide.L + 1, 'lifted within reach of the far end, it runs off it');
  s.end();
  assert.deepEqual(ends(wide), [1, 1]);
});

test('swipes put down and lifted 8 mm inside both ends finish board 1 within par', () => {
  // The way a finger on a phone goes "end to end": lane by lane, a little wobbly, never quite off the ends.
  const def = BOARDS[0], b = new Board(def), r = rng(3);
  const lanes = [24, 52, 80, 103];
  let strokes = 0;
  for (let k = 0; k < 80 && !b.done(); k++) {
    const y = lanes[k % lanes.length], s = new Stroke(b, 'jointer', 8, y, r);
    for (let q = 1; q <= 24; q++) s.move(8 + ((b.L - 16) * q) / 24, y + (q < 24 ? Math.sin(q * 1.7) * 1.5 : 0));
    if (s.end().counts) strokes++;
  }
  assert.equal(b.done(), true, `not flat after ${strokes} strokes: ${b.flatness().toFixed(3)}, ${b.roughLeft()} cells rough`);
  assert.ok(strokes <= def.par, `${strokes} strokes, over par ${def.par}`);
});

test('a stroke that cuts nothing is free, and says whether it skated or went across', () => {
  // A short jointer stroke in the middle of a hollow rides over it: no shaving, so no stroke.
  const hollow = plain({ bow: 1.2 });
  const r = stroke(hollow, 'jointer', 300, 460, 90, 90, rng(1));
  assert.equal(r.cells, 0);
  assert.equal(r.counts, false, 'it doesn’t count');
  assert.equal(r.skated, true, 'the plane went along the board and took nothing');
  assert.ok(r.from >= 290 && r.to <= 470, 'and it stayed in the middle: ' + r.from + '..' + r.to);
  // A swipe across the board isn't a stroke either, and is told apart from one that skated.
  const across = new Stroke(plain({}), 'jointer', 300, 10, rng(1));
  for (let y = 20; y <= 170; y += 15) across.move(300, y);
  const a = across.end();
  assert.equal(a.counts, false);
  assert.equal(a.across, true);
  assert.equal(a.skated, false);
  // And a stroke from one corner diagonally to the other isn't a straight one (board 3's hint is for those).
  assert.equal(stroke(plain({ twist: 0.5 }), 'jointer', -40, 800, 20, 160, rng(1)).straight, false);
  assert.equal(stroke(plain({ twist: 0.5 }), 'jointer', -40, 800, 20, 20, rng(1)).straight, true);
});

test('the straightedge says what it sees: hollow, rocking on a high spot, or the face falling away', () => {
  const along = b => readEdge(b.straightedge(0.5, 90, b.L - 0.5, 90));
  assert.equal(along(plain({})).kind, 'none', 'no light on a flat face');
  assert.equal(along(plain({ bow: 0.6 })).kind, 'hollow', 'light in the middle of a hollow');
  const crown = along(plain({ bow: -0.6 }));
  assert.equal(crown.kind, 'rocks', 'a crown rocks it');
  assert.ok(crown.t0 > 0.3 && crown.t1 < 0.7, 'on the middle: ' + crown.t0.toFixed(2) + '..' + crown.t1.toFixed(2));
  const hump = along(plain({ humps: [[0.75, 0.5, 60, 3000, 0.4]] }));
  assert.equal(hump.kind, 'rocks');
  assert.ok(hump.t0 > 0.55, 'a hump toward the far end rocks it there');
  const droop = along(plain({ humps: [[1, 0.5, 120, 3000, -0.5]] }));
  assert.equal(droop.kind, 'end', 'the far end falls away');
  const cup = plain({ cup: 0.6 });
  assert.equal(readEdge(cup.straightedge(380, 0.5, 380, cup.W - 0.5)).kind, 'hollow', 'across a cup');
  assert.equal(along(plain({ twist: 0.8 })).kind, 'none', 'a twisted face is straight along each line');
});

test('the winding sticks line up on a finished face, and not on a twisted one', () => {
  assert.equal(plain({ twist: 0.3 }).outOfWind(), false);
  assert.equal(plain({}).outOfWind(), true);
  assert.ok(Math.abs(plain({ twist: 0.04 }).wind().wind) < WIND, 'a hair of twist reads as lined up');
});

test('board 3 is in wind and a little hollow, and nothing else: no crown for its card to miss', () => {
  const sh = new Board(BOARDS[2]).shape();
  assert.ok(sh.twist > 0.2, 'in wind: ' + sh.twist.toFixed(3));
  assert.ok(sh.bow >= 0 && sh.bow < 0.25, 'the ends a little high, never a crown: ' + sh.bow.toFixed(3));
  assert.ok(Math.abs(sh.cup) < 0.05, 'no cup: ' + sh.cup.toFixed(3));
});

test('each board’s card can be followed to the finish by someone who sees only what the page shows', () => {
  // scripts/cards.mjs plays each board the way its card says, judging the face only by the sticks,
  // the straightedge's light, the rough patches, the grain on the edge and tear-out, with lanes at
  // three spacings. Every board up to the panel has to come out flat, above the line, within par.
  // Once more, every stroke is put down 8 mm onto the board and lifted 8 mm short of the other end,
  // as a finger does, and that has to finish too, in no more strokes than the lanes off the ends took.
  for (const def of BOARDS.filter(d => !d.panel)) {
    const r = followAll(def);
    for (const run of [...r.runs, r.onBoard]) {
      assert.equal(run.culled, false, `board ${def.no}: through the line following its card`);
      assert.equal(run.done, true, `board ${def.no}: not finished following its card (flat ${run.flat.toFixed(3)} after ${run.strokes} strokes)`);
    }
    assert.ok(r.median <= def.par, `board ${def.no}: the card takes ${r.median} strokes, over par ${def.par}`);
    const most = Math.max(...r.runs.map(x => x.strokes));
    assert.ok(r.onBoard.strokes <= most, `board ${def.no}: started on the board it takes ${r.onBoard.strokes} strokes, against ${most} off the ends`);
  }
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

test('the shape that’s left is named: bow, cup or twist', () => {
  const near = (v, want, msg) => assert.ok(Math.abs(v - want) < 0.03, `${msg}: ${v.toFixed(3)} vs ${want}`);
  let sh = plain({ bow: 0.6 }).shape();
  near(sh.bow, 0.6, 'ends high'); near(sh.cup, 0, 'no cup'); near(sh.twist, 0, 'no twist');
  sh = plain({ bow: -0.4, cup: 0.3 }).shape();
  near(sh.bow, -0.4, 'a crown'); near(sh.cup, 0.3, 'edges high');
  sh = plain({ twist: 0.5 }).shape();
  near(sh.twist, 0.5, 'twist');
  assert.ok(plain({ twist: 0.5 }).wind().wind > 0, 'the same sign the winding sticks give');
  near(plain({}).shape().bow, 0, 'flat');
});

test('how flat a face is reads finer than the aim, and never reads as the aim until it is flat', () => {
  const num = t => parseFloat(t);
  for (const unit of ['in', 'mm']) {
    U.setUnit(unit);
    const aim = U.flat(FLAT, -1);
    for (let k = 1; k <= 400; k++) {
      const over = FLAT + k * 0.0002, under = FLAT - k * 0.0002; // up to 0.08 mm either side
      assert.ok(num(U.flat(over, 1)) > num(aim), `${unit}: ${over.toFixed(4)} mm reads ${U.flat(over, 1)}, aim ${aim}`);
      if (under >= 0) assert.ok(num(U.flat(under, -1)) <= num(aim), `${unit}: ${under.toFixed(4)} mm reads ${U.flat(under, -1)}`);
    }
  }
  U.setUnit('in');
  assert.equal(U.flat(FLAT, -1), '0.0059″');
  assert.equal(U.flat(0.164, 1), '0.0065″', 'the playtest’s 0.164 mm no longer reads 0.006″ under “aim 0.006″”');
  U.setUnit('mm');
  assert.equal(U.flat(FLAT, -1), '0.150 mm');
  assert.equal(U.flat(0.1504, 1), '0.151 mm');
});

test('a nearly flat face knows where it stands highest', () => {
  const b = plain({ humps: [[0.85, 0.85, 40, 25, 0.08]] }); // a patch by the far right corner
  const h = b.highest();
  assert.ok(h.x > b.L * 2 / 3 && h.y > b.W * 0.7, `toward the far end, by the right edge: ${h.x.toFixed(0)}, ${h.y.toFixed(0)}`);
  const f = b.fit(), k = h.i * b.NY + h.j;
  assert.ok(Math.abs(h.h - (b.top[k] - (f.a + f.b * (h.x - b.L / 2) + f.c * (h.y - b.W / 2)))) < 1e-6, 'its height above the best plane');
  b.torn[k] = 1;
  const t = b.highest();
  assert.notEqual(t.i * b.NY + t.j, k, 'tear-out is left out, as it is from flatness');
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
    const keep = keepFor(def);
    assert.ok(keep > TABLETOP + 0.2 && keep < def.best - 0.2, `board ${def.no}: the thickness mark (${keep}) sits between the line and the solver's finish`);
  });
});

test('the solver flattens board 1 at its par and its best', () => {
  const b = new Board(BOARDS[0]);
  const r = solve(b);
  assert.equal(r.done, true);
  assert.equal(parFor(r.par), BOARDS[0].par);
  assert.ok(Math.abs(r.thinnest - BOARDS[0].best) < 0.02, 'thinnest ' + r.thinnest);
  assert.ok(r.thinnest >= keepFor(BOARDS[0]), 'the solver keeps the thickness mark');
  assert.ok(r.par < BOARDS[0].par, 'par leaves a person room');
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
