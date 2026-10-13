// Out of Wind: the page. The rack of boards, the bench, strokes from your finger, the checks,
// the grading, and keeping each board you've started so you can come back to it.

import { Board, FLAT, WIND, readEdge } from './board.js';
import { Stroke, PLANES } from './plane.js';
import { BOARDS, boardName, keepFor } from './boards.js';
import { WOODS, rgb } from './woods.js';
import { Scene } from './draw.js';
import { woodTextures } from './wood.js';
import * as sound from './sound.js';
import * as U from './units.js';
import { load, save, better } from './store.js';
import { rng } from './rng.js';

const $ = id => document.getElementById(id);
const state = load();
state.benches = state.benches || {};
state.attempts = state.attempts || {};
U.setUnit(state.unit || U.defaultUnit(navigator.language));
sound.setSound(state.sound !== false);

const GRADES = ['No. 2 Common', 'No. 1 Common', 'Select', 'FAS'];
const SHORT = ['No. 2', 'No. 1', 'Select', 'FAS'];
const scene = new Scene($('cv'));
const stage = $('stage');

let def = null, board = null, rand = null;
let strokes = 0, tool = state.tool || 'jointer', mode = 'plane';
let stroke = null, shaving = null, finished = false, failed = false, keepGoing = false;
let edgeFrom = null, hover = false;
let windWas = 0; // how far out of wind the board was, to notice when the sticks line up
let flatLog = []; // flatness after each stroke, to notice when it stops coming down
let fullSaid = false; // the first full-length shaving on a board gets a word; the rest just the sound

// ---------- the rack ----------
const unlocked = no => no === 1 || !!state.best[no - 1];

function renderRack() {
  const rack = $('rack');
  rack.textContent = '';
  for (const d of BOARDS) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'plank';
    btn.dataset.no = d.no;
    const wood = WOODS[d.panel ? d.strips[d.strips.length >> 1].wood : d.wood]; // the plank shows a panel's middle board
    const [r, g, b] = rgb(wood.early);
    if (0.299 * r + 0.587 * g + 0.114 * b < 140) btn.classList.add('dark');
    const cvs = document.createElement('canvas');
    const label = document.createElement('span');
    label.className = 'label';
    const best = state.best[d.no];
    label.innerHTML = `<b>${esc(boardName(d, WOODS))}</b><span>${esc(d.title)} · ${esc(U.size(d.L, d.panel ? d.strips.reduce((s, x) => s + x.w, 0) : d.W))}</span>`;
    btn.append(cvs, label);
    if (best) {
      const gr = document.createElement('span');
      gr.className = 'grade';
      gr.textContent = SHORT[best.marks - 1];
      gr.title = GRADES[best.marks - 1];
      btn.append(gr);
    }
    if (!unlocked(d.no)) btn.setAttribute('aria-disabled', 'true');
    btn.setAttribute('aria-label', `${boardName(d, WOODS)}, ${d.title}${best ? ', graded ' + GRADES[best.marks - 1] : ''}${unlocked(d.no) ? '' : ', locked'}`);
    li.append(btn);
    rack.append(li);
  }
  // Paint the wood a board at a time, so the list shows straight away.
  const planks = [...rack.querySelectorAll('.plank')];
  let k = 0;
  const next = () => {
    if (k >= planks.length) return;
    paintPlank(planks[k], BOARDS[k]);
    k++;
    setTimeout(next, 0);
  };
  setTimeout(next, 30);
  // How far along you are, pencilled under the title.
  const done = BOARDS.filter(d => state.best[d.no]), fas = done.filter(d => state.best[d.no].marks === 4).length;
  $('progress').hidden = !done.length;
  $('progress').textContent = done.length === BOARDS.length
    ? `All ${BOARDS.length} done${fas ? ', ' + fas + ' graded FAS' : ''}. The tabletop’s ready.`
    : `${done.length} of ${BOARDS.length} done${fas ? ', ' + fas + ' graded FAS' : ''}`;
  const bench = state.last && state.benches[state.last];
  const resume = $('resumeBtn');
  if (bench && !bench.finished && !bench.failed && unlocked(state.last)) {
    resume.hidden = false;
    resume.textContent = 'Back to ' + boardName(BOARDS[state.last - 1], WOODS);
  } else resume.hidden = true;
}

const thumbs = new Map();
function paintPlank(btn, d) {
  const cvs = btn.querySelector('canvas');
  const w = btn.clientWidth, h = btn.clientHeight;
  if (!w) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr);
  // Only the middle band of the board shows on a plank, so only that is drawn, and not too finely.
  const ppm = Math.min(0.8, (w * dpr) / d.L);
  const bw = d.panel ? d.strips.reduce((a, x) => a + x.w, 0) : d.W;
  const band = Math.min(bw, (d.L * h) / w);
  let t = thumbs.get(d.no);
  if (!t) {
    t = woodTextures(new Board(d), ppm, [(bw - band) / 2, (bw + band) / 2]);
    thumbs.set(d.no, t);
  }
  const c = cvs.getContext('2d');
  // Planed if you've finished it, rough from the mill if not.
  const img = state.best[d.no] ? t.planed : t.rough;
  const sh = Math.min(img.height, band * t.ppm);
  c.drawImage(img, 0, (img.height - sh) / 2, img.width, sh, 0, 0, cvs.width, cvs.height);
  const g = c.createLinearGradient(0, 0, 0, cvs.height);
  g.addColorStop(0, 'rgba(255,245,225,.12)'); g.addColorStop(1, 'rgba(0,0,0,.18)');
  c.fillStyle = g;
  c.fillRect(0, 0, cvs.width, cvs.height);
}

$('rack').addEventListener('click', e => {
  const btn = e.target.closest('.plank');
  if (!btn) return;
  const no = +btn.dataset.no;
  if (!unlocked(no)) { toastHome('Finish No. ' + (no - 1) + ' first.'); return; }
  go(no);
});
$('resumeBtn').addEventListener('click', () => go(state.last));

function toastHome(text) {
  const b = $('resumeBtn');
  const old = b.textContent, wasHidden = b.hidden;
  b.hidden = false; b.textContent = text; b.disabled = true;
  setTimeout(() => { b.textContent = old; b.hidden = wasHidden; b.disabled = false; }, 1600);
}

// ---------- moving between the rack and the bench ----------
function go(no) { location.hash = no ? '#' + no : ''; }
function route() {
  const no = parseInt(location.hash.slice(1), 10);
  if (no >= 1 && no <= BOARDS.length && unlocked(no)) openBoard(no);
  else showHome();
}
window.addEventListener('hashchange', route);

function showHome() {
  closeSheets();
  if (stroke) endStroke();
  $('bench').hidden = true;
  $('home').hidden = false;
  document.title = 'Out of Wind';
  renderRack();
  updateSettings();
}

function openBoard(no, fresh = false) {
  closeSheets();
  def = BOARDS[no - 1];
  board = new Board(def);
  const saved = !fresh && state.benches[no];
  strokes = 0; finished = false; failed = false; keepGoing = false; mode = 'plane'; flatLog = []; fullSaid = false;
  rand = rng(def.seed * 7919 + (state.attempts[no] || 0) * 104729 + 1);
  scene.scribbleSeed = null;
  let resumed = false;
  if (saved && !saved.failed && board.load(saved.board)) {
    strokes = saved.strokes || 0;
    rand.set(saved.rs | 0);
    scene.scribbleSeed = saved.scribble ?? null;
    finished = !!saved.finished;
    keepGoing = finished;
    resumed = true;
  }
  state.last = no;
  save(state);
  $('home').hidden = true;
  $('bench').hidden = false;
  document.title = boardName(def, WOODS) + ' · Out of Wind';
  $('boardName').textContent = 'No. ' + def.no;
  $('boardTitle').textContent = (def.panel ? 'Glued-up panel' : WOODS[def.wood].name) + ' · ' + def.title;
  scene.sticks = false;
  $('sticksBtn').setAttribute('aria-pressed', 'false');
  selectTool(tool);
  setMode('plane');
  updateHud();
  if (!resumed) showIntro();
  windWas = Math.abs(board.wind().wind);
  // Drawing the wood takes a moment on a phone, so the card goes up first and the board after.
  const opened = board;
  setTimeout(() => { if (board === opened) ready(); }, 30);
}

function layout() {
  const dpr = Math.min(2, devicePixelRatio || 1); // sharp enough, and a third the pixels of 3x
  scene.resize(stage.clientWidth, stage.clientHeight, dpr);
  kick();
}
// The board goes onto the bench a moment after it's opened; anything that needs it puts it there now.
function ready() {
  if (!board) return false;
  if (scene.board !== board) {
    scene.setBoard(board); // lays itself out if the bench has been sized before
    if (!scene.W) layout();
    syncLoupe();
  }
  return true;
}
new ResizeObserver(() => { if (!$('bench').hidden) layout(); }).observe(stage);

// ---------- the intro card ----------
function showIntro() {
  const wood = def.panel ? null : WOODS[def.wood];
  $('introKicker').textContent = 'No. ' + def.no + ' · ' + def.title;
  $('introTitle').textContent = def.panel ? 'Walnut, maple and cherry' : wood.name;
  const facts = [
    ['Rough', `${U.size(def.L, board.W)}, ${U.thick(board.thinnest().t)} thick`],
    ['Finish', `${U.line(board.tmin)} at the least, for the tabletop`],
    ['Keep', `${U.thick(keepFor(def))} or more for the thickness mark`],
    ['Par', `${def.par} strokes`],
  ];
  $('introFacts').innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  $('introNote').textContent = def.note || wood.note;
  openSheet('intro');
}
$('introGo').addEventListener('click', () => {
  sound.wake(); ready(); closeSheets();
  // The first time on the bench: show what a stroke is.
  if (def.no === 1 && !state.seen.swipe && !strokes) {
    scene.ghost = { t0: performance.now(), y: board.W / 2, tool };
    hint('swipe', 'Swipe along the board, end to end, to take a stroke.');
    kick();
  }
});

// ---------- tools ----------
document.querySelectorAll('.tool[data-tool]').forEach(b => b.addEventListener('click', () => {
  sound.wake();
  selectTool(b.dataset.tool);
  setMode('plane');
}));

function selectTool(t) {
  tool = t;
  state.tool = t;
  document.querySelectorAll('.tool[data-tool]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.tool === t)));
  scene.plane.tool = t;
  kick();
}

function setMode(m) {
  mode = m;
  $('edgeBtn').setAttribute('aria-pressed', String(m === 'straightedge'));
  if (m === 'straightedge') {
    document.querySelectorAll('.tool[data-tool]').forEach(b => b.setAttribute('aria-checked', 'false'));
  } else selectTool(tool);
  syncLoupe();
}

function syncLoupe() {
  scene.loupe.mode = stroke ? 'plane' : mode === 'straightedge' ? 'straightedge' : scene.sticks ? 'sticks' : 'plane';
  describeLoupe();
  kick();
}

$('pencilBtn').addEventListener('click', () => {
  if (!ready() || failed) return;
  sound.wake();
  board.pencil.fill(1);
  const seed = (Date.now() & 0xffffff) ^ (strokes * 2654435761);
  scene.startScribble(seed);
  sound.pencil(650);
  hint('pencil', 'Now plane. The pencil goes first from the high spots.');
  persist();
  kick();
});

$('edgeBtn').addEventListener('click', () => {
  if (!ready()) return;
  sound.wake();
  if (mode === 'straightedge') { setMode('plane'); return; }
  setMode('straightedge');
  if (!scene.straight) layStraightedge({ x: board.L * 0.5, y: board.W * 0.5 }, { x: board.L * 0.5 + 10, y: board.W * 0.5 }, true);
  else sound.tink();
  hint('edge', 'Drag along or across the board to lay the straightedge somewhere else.');
});

$('sticksBtn').addEventListener('click', () => {
  if (!ready()) return;
  sound.wake();
  scene.sticks = !scene.sticks;
  $('sticksBtn').setAttribute('aria-pressed', String(scene.sticks));
  if (scene.sticks) { sound.tock(); if (mode === 'straightedge') setMode('plane'); }
  syncLoupe();
});

// Lays the straightedge right across the board along the line you dragged.
function layStraightedge(a, b, quiet) {
  let dx = b.x - a.x, dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 12) { dx = 0; dy = 1; } // a tap lays it straight across
  if (Math.abs(dx) > Math.abs(dy) * 4) dy = 0; // nearly along: along
  else if (Math.abs(dy) > Math.abs(dx) * 4) dx = 0; // nearly across: across
  const seg = clipLine(a.x, a.y, dx, dy, board.L, board.W);
  if (!seg) return;
  const res = board.straightedge(seg[0], seg[1], seg[2], seg[3]);
  scene.straight = { x0: seg[0], y0: seg[1], x1: seg[2], y1: seg[3], res };
  if (!quiet) sound.tink();
  syncLoupe();
}

// The part of the infinite line through (x, y) in direction (dx, dy) that lies on the board.
function clipLine(x, y, dx, dy, L, W) {
  let t0 = -Infinity, t1 = Infinity;
  for (const [p, d, lo, hi] of [[x, dx, 0, L], [y, dy, 0, W]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return null; continue; }
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  if (t1 <= t0) return null;
  const e = 0.5;
  return [x + dx * t0 + Math.sign(dx) * e, y + dy * t0 + Math.sign(dy) * e, x + dx * t1 - Math.sign(dx) * e, y + dy * t1 - Math.sign(dy) * e];
}

// ---------- strokes ----------
const cv = $('cv');
let activePointer = null;

cv.addEventListener('pointerdown', e => {
  if (!ready() || activePointer != null || !$('intro').hidden) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  sound.wake();
  activePointer = e.pointerId;
  try { cv.setPointerCapture(e.pointerId); } catch { /* fine */ }
  const p = scene.toBoard(e.clientX, e.clientY);
  if (mode === 'straightedge') { edgeFrom = p; return; }
  if (failed) { hint('failed', 'This one went through the line. Start it again from the menu.', true); return; }
  beginStroke(p);
});
cv.addEventListener('pointermove', e => {
  const p = scene.toBoard(e.clientX, e.clientY);
  if (e.pointerId === activePointer) {
    if (stroke) moveStroke(p);
    else if (edgeFrom && Math.hypot(p.x - edgeFrom.x, p.y - edgeFrom.y) > 12) layStraightedge(edgeFrom, p, true);
  } else if (e.pointerType === 'mouse' && activePointer == null && mode === 'plane' && !failed && ready()) {
    // With a mouse, the plane hovers where it would go down.
    hover = true;
    Object.assign(scene.plane, { show: true, down: false, x: p.x, y: p.y, tool });
    kick();
  }
});
const lift = e => {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  if (stroke) endStroke();
  if (edgeFrom) {
    const p = scene.toBoard(e.clientX, e.clientY);
    layStraightedge(edgeFrom, p);
    edgeFrom = null;
  }
};
cv.addEventListener('pointerup', lift);
cv.addEventListener('pointercancel', lift);
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && hover && activePointer == null) { hover = false; scene.plane.show = false; kick(); } });

function beginStroke(p) {
  stroke = new Stroke(board, tool, p.x, p.y, rand);
  shaving = null;
  Object.assign(scene.plane, { tool, x: p.x, y: p.y, down: true, show: true, rideZ: null });
  scene.curl = null;
  scene.loupe.y = p.y;
  syncLoupe();
  const j = Math.max(0, Math.min(board.NY - 1, Math.floor(p.y / board.dy)));
  sound.startCut(board.wood(j).hard, PLANES[tool].depth);
  kick();
}

function moveStroke(p) {
  const out = stroke.move(p.x, p.y);
  const sp = scene.plane;
  if (stroke.dir) sp.dir = stroke.dir;
  sp.x = p.x; sp.y = p.y;
  if (stroke.ride) { sp.rideZ = stroke.ride.z; sp.rideSlope = stroke.ride.slope; }
  scene.loupe.y = p.y;
  if (stroke.changed.length) { scene.cellsChanged(stroke.changed); stroke.changed.length = 0; }
  // The shaving in the mouth: it grows while the blade keeps cutting, and breaks off when it stops.
  if (stroke.current !== shaving) {
    if (scene.curl) scene.dropCurl(scene.curl);
    shaving = stroke.current;
    if (shaving) {
      const j = Math.max(0, Math.min(board.NY - 1, Math.floor(p.y / board.dy)));
      const c = rgb(board.wood(j).early);
      scene.curl = { len: 0, w: 0, color: [Math.min(255, c[0] * 1.06 + 8), Math.min(255, c[1] * 1.05 + 8), Math.min(255, c[2] * 1.02 + 6)] };
    } else scene.curl = null;
  }
  if (shaving && scene.curl) {
    scene.curl.len = shaving.length * board.dx;
    const last = shaving[shaving.length - 1];
    scene.curl.w = scene.curl.w ? scene.curl.w * 0.7 + last.w * 0.3 : last.w;
  }
  if (out.torn) {
    sound.crackle(out.torn);
    const j = Math.max(0, Math.min(board.NY - 1, Math.floor(p.y / board.dy)));
    scene.chips(out.torn, p.x, p.y, rgb(board.wood(j).early));
    if (!state.seen.tear) {
      hint('tear', 'Tear-out: that’s against the grain. The lines on the edge slope down the way to plane.');
    }
  }
  sound.cutLevel(out.rows ? out.width / PLANES[tool].blade : 0, out.rows > 0);
  kick();
}

function endStroke() {
  const r = stroke.end();
  stroke = null;
  sound.endCut(r.fullLength);
  if (scene.curl) scene.dropCurl(scene.curl);
  scene.curl = null;
  shaving = null;
  scene.plane.down = false;
  if (!hover) scene.plane.show = false;
  if (r.counts) strokes++;
  scene.refit();
  const gapBefore = scene.straight ? scene.straight.res.gap : null;
  if (scene.straight) layStraightedge({ x: scene.straight.x0, y: scene.straight.y0 }, { x: scene.straight.x1, y: scene.straight.y1 }, true);
  syncLoupe();
  if (r.counts) flatLog.push(board.flatness());
  if (board.thinnest().t >= board.tmin) {
    const wind = Math.abs(board.wind().wind);
    if (r.counts && !r.cells) hint('nocut', 'Nothing to cut there: the sole is riding on higher wood. Try beside it, or another plane.');
    else if (windWas > 0.3 && wind < 0.12) { toast('The winding sticks line up: out of wind.'); sound.tock(); }
    else if (gapBefore > 0.08 && scene.straight.res.gap < 0.04) { toast('No light under the straightedge.'); sound.tink(); }
    else if (r.counts && stuck()) { /* said what's left */ }
    else if (r.fullLength && r.fullWidth && !fullSaid) { fullSaid = true; toast('A full-length shaving.'); }
    else if (r.counts) coach(r);
    windWas = Math.max(wind, windWas > 0.3 && wind >= 0.12 ? windWas : wind);
  }
  check();
  updateHud();
  persist();
  kick();
}

// What the first boards say as you go, once each.
function coach(r) {
  const no = def.no, rough = board.roughLeft(), fl = board.flatness();
  if (no === 1 && strokes === 1 && tool === 'jointer') hint('c1a', 'The jointer only cut where the board stands high. Keep taking full-length strokes, lane by lane, until the pencil’s gone.');
  else if (no === 1 && strokes === 1) hint('c1b', 'Try the jointer: long strokes, the whole length of the board.');
  else if (no <= 2 && rough && fl < 0.3 && rough < board.cut.length * 0.06) hint('edges', 'Nearly flat. Let the plane hang off the edges to reach the last rough strips.');
  else if (no === 3 && strokes === 4 && Math.abs(board.wind().wind) > WIND * 1.5) hint('c3', 'Still in wind? Straight full-length strokes can’t take out twist. Work the two high corners.');
  if (fl <= FLAT && rough && rough < board.cut.length * 0.03) toast('Flat, but rough-sawn spots are left ' + roughWhere() + '.', 3600);
}

// Once on each board: when eight strokes haven't brought the face any nearer flat, say what shape
// is left and what takes it out.
function stuck() {
  const n = flatLog.length, now = flatLog[n - 1];
  if (n < 9 || now <= 2 * FLAT || now < flatLog[n - 9] * 0.9 || state.seen['stuck' + def.no]) return false;
  const sh = board.shape(), bow = Math.abs(sh.bow), cup = Math.abs(sh.cup), twist = 2 * Math.abs(sh.twist);
  let text;
  if (twist >= bow && twist >= cup) {
    text = `Still in wind. Straight passes take an even shaving off a twisted face: plane the high corners, ${sh.twist > 0 ? 'far right and near left' : 'far left and near right'}.`;
  } else if (cup >= bow) {
    text = sh.cup > 0 ? 'Still cupped, the edges high. Passes down the middle lower the whole face; plane just the edge lanes until a straightedge across sits flat.'
      : 'Still high along the middle. Plane the middle lanes until a straightedge laid across stops rocking.';
  } else {
    text = sh.bow > 0 ? 'Still hollow. Keep taking full-length jointer strokes: it rides on the high ends.'
      : 'Still crowned. Full-length strokes just follow it down: take short strokes on the high middle and leave the ends.';
  }
  state.seen['stuck' + def.no] = 1;
  save(state);
  toast(text, 6500);
  return true;
}

// Where the last rough cells are, in words: "near the far end, along the left edge".
function roughWhere() {
  let sx = 0, sy = 0, n = 0;
  for (let k = 0; k < board.cut.length; k++) if (!board.cut[k]) { sx += Math.floor(k / board.NY); sy += k % board.NY; n++; }
  if (!n) return '';
  const fx = sx / n / board.NX, fy = sy / n / board.NY;
  const along = fx < 0.33 ? 'near the near end' : fx > 0.67 ? 'near the far end' : 'in the middle';
  const across = fy < 0.25 ? ', along the left edge' : fy > 0.75 ? ', along the right edge' : '';
  return along + across;
}

// ---------- done, or too thin ----------
function check() {
  const th = board.thinnest();
  if (th.t < board.tmin) {
    failed = true;
    clearTimeout(toastTimer);
    $('toast').classList.remove('on');
    scene.mark = { x: board.xOf(th.i), y: board.yOf(th.j) };
    sound.thud();
    persist();
    setTimeout(showFailed, 650);
    return;
  }
  if (board.done()) {
    const result = evaluate();
    const prev = state.best[def.no];
    if (better(result, prev)) state.best[def.no] = result;
    save(state);
    if (!finished) {
      finished = true;
      keepGoing = false;
      scene.glow = 1;
      sound.done();
      setTimeout(() => showResult(result), 900);
    } else if (keepGoing) {
      toast(result.torn ? `Still flat. ${result.torn} ${result.torn === 1 ? 'spot' : 'spots'} of tear-out left.` : 'Still flat, and no tear-out left.');
    }
  } else if (finished) {
    finished = false;
    toast('Not flat any more.');
  } else {
    const margin = th.t - board.tmin;
    if (margin < 0.25 && !state.seen['thin' + def.no]) {
      state.seen['thin' + def.no] = 1;
      toast(`Careful: ${U.small(margin)} above the line at the thinnest spot.`, 3600);
    }
  }
}

function evaluate() {
  const th = board.thinnest().t, spots = board.tornSpots(), fl = board.flatness();
  const marks = [
    { ok: true, label: 'Flat', v: 'within ' + U.small(fl) },
    { ok: th >= keepFor(def), label: th >= keepFor(def) ? 'Thickness kept' : 'Thickness', v: th >= keepFor(def) ? U.thick(th) : U.thick(th) + ', under ' + U.thick(keepFor(def)) },
    { ok: spots === 0, label: spots ? 'Tear-out' : 'No tear-out', v: spots ? spots + (spots === 1 ? ' spot' : ' spots') : '' },
    { ok: strokes <= def.par, label: 'Within par', v: strokes + ' of ' + def.par },
  ];
  const n = marks.filter(m => m.ok).length;
  return { marks: n, list: marks, strokes, thick: +th.toFixed(3), torn: spots, flat: +fl.toFixed(3) };
}

function showResult(result) {
  if (!board || failed) return;
  $('resultStamp').textContent = SHORT[result.marks - 1];
  $('resultStamp').hidden = false;
  $('resultTitle').textContent = 'Flat and out of wind';
  const ul = $('resultMarks');
  ul.textContent = '';
  result.list.forEach((m, k) => {
    const li = document.createElement('li');
    if (!m.ok) li.className = 'miss';
    li.innerHTML = `<span class="tick">${m.ok ? '✓' : '–'}</span><span>${esc(m.label)}</span><span class="v">${esc(m.v)}</span>`;
    ul.append(li);
  });
  const next = BOARDS[def.no];
  $('resultNote').textContent = GRADES[result.marks - 1] + (result.marks === 4 ? ': the best grade there is.' : '.')
    + ` ${U.thick(result.thick)} at its thinnest, ${U.small(result.thick - board.tmin)} above the line.`;
  $('nextBtn').hidden = !next;
  $('nextBtn').textContent = next ? 'Next: No. ' + next.no : 'Next board';
  $('againBtn').textContent = 'Plane it again';
  $('keepBtn').hidden = false;
  $('keepBtn').textContent = result.torn ? 'Plane out the tear-out' : 'Keep planing';
  if (!next) $('resultNote').textContent += ' That’s the tabletop: every board done.';
  openSheet('result');
}

function showFailed() {
  const th = board.thinnest();
  $('resultStamp').textContent = 'Cull';
  $('resultTitle').textContent = 'Too thin for the tabletop';
  $('resultMarks').textContent = '';
  const where = th.i < board.NX / 3 ? 'near end' : th.i > (2 * board.NX) / 3 ? 'far end' : 'middle';
  $('resultNote').textContent = `It went through the gauge line toward the ${where}: ${U.small(board.tmin - th.t)} under ${U.line(board.tmin)}. A plane takes the high spots first; take only those.`;
  $('nextBtn').hidden = true;
  $('againBtn').textContent = 'Start it again';
  $('keepBtn').hidden = true;
  openSheet('result');
}

$('nextBtn').addEventListener('click', () => { const next = BOARDS[def.no]; if (next) go(next.no); });
$('againBtn').addEventListener('click', restart);
$('keepBtn').addEventListener('click', () => { keepGoing = true; closeSheets(); });

function restart() {
  if (!def) return;
  state.attempts[def.no] = (state.attempts[def.no] || 0) + 1;
  delete state.benches[def.no];
  save(state);
  openBoard(def.no, true);
}

// ---------- the HUD ----------
function updateHud() {
  $('strokes').textContent = strokes;
  $('par').textContent = 'par ' + def.par;
  const fl = board.flatness(), rough = board.roughLeft();
  $('flat').textContent = U.small(fl);
  $('flatSub').textContent = rough ? 'rough ' + Math.ceil((rough / board.cut.length) * 100) + '%' : fl <= FLAT ? 'flat' : 'to go';
  const th = board.thinnest().t, margin = th - board.tmin;
  $('thick').textContent = U.thick(th);
  $('line').textContent = 'line ' + U.line(board.tmin);
  scene.lineLabel = U.line(board.tmin) + ' line';
  // Amber once it's thinner than the thickness mark allows, red through the line.
  const st = $('thick').parentElement;
  st.classList.toggle('warn', th < keepFor(def) && margin >= 0);
  st.classList.toggle('over', margin < 0);
}

function describeLoupe() {
  if (!board) return;
  let text = '';
  if (scene.loupe.mode === 'straightedge' && scene.straight) {
    const g = scene.straight.res.gap;
    text = g < 0.05 ? 'No light under the straightedge.' : `Light under the straightedge: ${U.small(g)} at most.`;
  } else if (scene.loupe.mode === 'sticks') {
    const w = board.wind().wind;
    text = Math.abs(w) < 0.12 ? 'The winding sticks line up: out of wind.'
      : `The sticks don’t line up: ${U.small(Math.abs(w))} of wind, the ${w > 0 ? 'far right and near left' : 'far left and near right'} corners high.`;
  }
  $('loupeNote').textContent = text;
}

// ---------- notes ----------
let toastTimer = 0;
function toast(text, ms = 2600) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
// A hint you only need to see once.
function hint(key, text, always) {
  if (!always && state.seen[key]) return;
  state.seen[key] = 1;
  save(state);
  toast(text, 4200);
}

// ---------- saving the bench ----------
function persist() {
  if (!board) return;
  state.benches[def.no] = {
    strokes, rs: rand.state(), board: board.save(), scribble: scene.scribbleSeed ?? null, finished, failed,
  };
  save(state);
}

// ---------- sheets and settings ----------
function openSheet(id) { closeSheets(); $(id).hidden = false; const f = $(id).querySelector('button.go, button.row, button'); if (f) f.focus({ preventScroll: true }); }
function closeSheets() { for (const id of ['intro', 'result', 'menu', 'how']) $(id).hidden = true; }

$('backBtn').addEventListener('click', () => go(0));
$('menuBtn').addEventListener('click', () => { updateSettings(); openSheet('menu'); });
$('menuClose').addEventListener('click', closeSheets);
$('restartBtn').addEventListener('click', restart);
$('menuHomeBtn').addEventListener('click', () => go(0));
$('menuHowBtn').addEventListener('click', () => openSheet('how'));
$('howBtn').addEventListener('click', () => openSheet('how'));
$('howClose').addEventListener('click', () => { closeSheets(); if (!$('bench').hidden) openSheet('menu'); });
for (const id of ['unitBtn', 'menuUnitBtn']) $(id).addEventListener('click', () => {
  state.unit = U.getUnit() === 'in' ? 'mm' : 'in';
  U.setUnit(state.unit);
  save(state);
  updateSettings();
  if (!$('bench').hidden) { updateHud(); describeLoupe(); } else renderRack();
});
for (const id of ['soundBtn', 'menuSoundBtn']) $(id).addEventListener('click', () => {
  state.sound = !sound.soundOn();
  sound.setSound(state.sound);
  if (state.sound) sound.wake();
  save(state);
  updateSettings();
});
function updateSettings() {
  const inch = U.getUnit() === 'in';
  $('unitBtn').textContent = inch ? 'Inches' : 'Millimetres';
  $('menuUnitBtn').textContent = inch ? 'Show millimetres' : 'Show inches';
  $('soundBtn').textContent = sound.soundOn() ? 'Sound on' : 'Sound off';
  $('soundBtn').setAttribute('aria-pressed', String(sound.soundOn()));
  $('menuSoundBtn').textContent = sound.soundOn() ? 'Sound off' : 'Sound on';
}
document.addEventListener('keydown', e => {
  if (!$('bench').hidden && $('intro').hidden && $('result').hidden && $('menu').hidden && $('how').hidden && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const k = e.key.toLowerCase();
    const plane = { 1: 'jack', 2: 'jointer', 3: 'smoother' }[k];
    if (plane) { selectTool(plane); setMode('plane'); return; }
    if (k === 'p') { $('pencilBtn').click(); return; }
    if (k === 'e') { $('edgeBtn').click(); return; }
    if (k === 'w') { $('sticksBtn').click(); return; }
  }
  if (e.key === 'Escape') {
    if (!$('menu').hidden || !$('how').hidden) closeSheets();
    else if (!$('bench').hidden && $('result').hidden && $('intro').hidden) { updateSettings(); openSheet('menu'); }
  }
});

// ---------- the frame loop ----------
let raf = 0;
function kick() { if (!raf) raf = requestAnimationFrame(loop); }
function loop(now) {
  raf = 0;
  if ($('bench').hidden) return;
  scene.frame(now);
  if (stroke || scene.flying.length || scene.scribble || scene.glow > 0 || scene.mark || scene.ghost) kick();
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

// For the tests: a look inside, and a way to take a stroke without a finger.
window.outOfWind = {
  peek: () => board && ({
    no: def.no, strokes, finished, failed, mode, tool, par: def.par,
    thick: board.thinnest().t, flat: board.flatness(), rough: board.roughLeft(), torn: board.tornSpots(),
    done: board.done(), loupe: scene.loupe.mode, straight: scene.straight && scene.straight.res.gap, sticks: scene.sticks,
  }),
  toClient: (x, y) => scene.toClient(x, y),
  board: () => board,
  scene,
  swipe(t, x0, x1, y) {
    ready();
    selectTool(t); setMode('plane');
    beginStroke({ x: x0, y });
    const steps = Math.max(2, Math.ceil(Math.abs(x1 - x0) / 25));
    for (let k = 1; k <= steps; k++) moveStroke({ x: x0 + ((x1 - x0) * k) / steps, y });
    endStroke();
  },
};

route();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline copy is a bonus */ });
}
