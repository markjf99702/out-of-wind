// Out of Wind: the page. The rack of boards, the bench, strokes from your finger, the checks,
// the grading, and keeping each board you've started so you can come back to it.

import { Board, FLAT, WIND, readEdge } from './board.js';
import { Stroke, PLANES, REACH } from './plane.js';
import { BOARDS, boardName, keepFor } from './boards.js';
import { WOODS, rgb } from './woods.js';
import { Scene } from './draw.js';
import { woodTextures } from './wood.js';
import { drawTable } from './table.js';
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
const SHORT = ['#2 Com', '#1 Com', 'Select', 'FAS']; // pencilled on a plank, the way a lumberyard marks them, and never "No. 1" beside board No. 1
const scene = new Scene($('cv'));
const stage = $('stage');

let def = null, board = null, rand = null;
let strokes = 0, tool = state.tool || 'jointer', mode = 'plane';
let stroke = null, shaving = null, finished = false, failed = false, keepGoing = false;
let settling = false; // from the stroke that finishes a board until its card is up: no more strokes
let edgeFrom = null, hover = false;
let windWas = 0; // how far out of wind the board was, to notice when the sticks line up
let flatLog = []; // flatness after each stroke, to notice when it stops coming down
let stuckAt = -99; // the stroke when the bench last said what shape is left
let fullSaid = false; // the first full-length shaving on a board gets a word; the rest just the sound
let missSaid = false; // the first stroke on a board that cuts nothing gets the long explanation
let endsSaid = false; // starting well onto the board, once a board
let nearSaid = null; // where the bench last said a nearly flat face stands highest

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
    if (!unlocked(d.no)) {
      btn.setAttribute('aria-disabled', 'true');
      const lock = document.createElement('span');
      lock.className = 'lock';
      lock.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11V8a4 4 0 0 1 8 0v3"/><rect x="5.5" y="11" width="13" height="9.5" rx="2"/></svg>';
      btn.append(lock);
    }
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
    ? `All ${BOARDS.length} done${fas ? ', ' + fas + ' graded FAS' : ''}.`
    : `${done.length} of ${BOARDS.length} done${fas ? ', ' + fas + ' graded FAS' : ''}`;
  $('tableBtn').hidden = done.length < BOARDS.length;
  const back = resumable(), resume = $('resumeBtn');
  resume.hidden = !back;
  if (back) {
    resume.dataset.no = back;
    resume.textContent = 'Back to ' + boardName(BOARDS[back - 1], WOODS);
  }
}

// The board to come back to: the one part-way through that you worked on last. Opening a board you've
// finished, to look or to plane it again, doesn't count until you plane it.
function resumable() {
  let pick = null;
  for (const [k, b] of Object.entries(state.benches)) {
    const no = +k;
    if (!b || b.finished || b.failed || !BOARDS[no - 1] || !unlocked(no)) continue;
    const t = b.t || (no === state.last ? 1 : 0); // benches saved before they were timed
    if (!pick || t > pick.t || (t === pick.t && no > pick.no)) pick = { no, t };
  }
  return pick ? pick.no : 0;
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
  if (!unlocked(no)) { lockedNote(btn); return; }
  go(no);
});
$('resumeBtn').addEventListener('click', e => go(+e.currentTarget.dataset.no));
$('tableBtn').addEventListener('click', showTable);

// ---------- the tabletop ----------
// Every board done: the panel as the finished top, and every board's grade pencilled in a tally.
const allDone = () => BOARDS.every(d => state.best[d.no]);
function showTable() {
  const tally = $('tally');
  tally.textContent = '';
  let strokes = 0, par = 0, fas = 0;
  for (const d of BOARDS) {
    const b = state.best[d.no];
    if (!b) continue;
    strokes += b.strokes; par += d.par; if (b.marks === 4) fas++;
    const li = document.createElement('li');
    li.innerHTML = `<span class="n">No. ${d.no}</span><span class="w">${esc(d.panel ? 'Panel' : WOODS[d.wood].name)} · ${esc(d.title)}</span><span class="g" title="${GRADES[b.marks - 1]}">${SHORT[b.marks - 1]}</span>`;
    tally.append(li);
  }
  $('tableNote').textContent = `Walnut, maple and cherry, glued up and planed flat. ${fas} of ${BOARDS.length} boards graded FAS, in ${strokes} strokes against a par of ${par}.`;
  openSheet('table');
  const cv = $('tableCv');
  drawTable(cv, cv.clientWidth, cv.clientHeight, Math.min(2, devicePixelRatio || 1));
}
$('tableClose').addEventListener('click', () => { if ($('bench').hidden) closeSheets(); else go(0); });

// A locked plank says which board opens it, pinned to the plank you tapped.
let noteTimer = 0;
function lockedNote(btn) {
  const next = BOARDS.find(d => !state.best[d.no]); // the board you're on: each opens the next
  const clear = () => { for (const n of document.querySelectorAll('.plank-note')) { n.parentElement.classList.remove('noted'); n.remove(); } };
  clear();
  const note = document.createElement('p');
  note.className = 'plank-note';
  note.setAttribute('role', 'status');
  note.textContent = `Finish No. ${next.no} first.`;
  btn.parentElement.classList.add('noted');
  btn.parentElement.append(note);
  clearTimeout(noteTimer);
  noteTimer = setTimeout(clear, 1800);
}

// ---------- moving between the rack and the bench ----------
// Opening a board from the rack adds one step to the browser's history, so Back on the bench (or
// Android's back gesture) goes to the rack, and Back on the rack leaves the game. Going from board to
// board doesn't add another, and the bench's own back arrow goes back along the one that was added.
let shown = null; // what's showing: a board's number, or 0 for the rack
function go(no) {
  try {
    if (!no) {
      if (history.state && history.state.fromRack) { history.back(); return; } // the rack is the step before
      history.replaceState(null, '', location.href.replace(/#.*$/, ''));
    } else if (!$('bench').hidden) history.replaceState(history.state, '', '#' + no);
    else history.pushState({ fromRack: 1 }, '', '#' + no);
  } catch { /* a page shown inside another may not be let change its address: go there all the same */ }
  route(no);
}
// Shows what the address says, or the board given.
function route(to) {
  const no = typeof to === 'number' ? to : parseInt(location.hash.slice(1), 10);
  const want = no >= 1 && no <= BOARDS.length && unlocked(no) ? no : 0;
  if (want === shown) return; // a back step fires both popstate and hashchange
  if (want) openBoard(want);
  else showHome();
}
window.addEventListener('popstate', () => route());
window.addEventListener('hashchange', () => route());

function showHome() {
  shown = 0;
  closeSheets();
  if (stroke) endStroke();
  $('bench').hidden = true;
  $('home').hidden = false;
  document.title = 'Out of Wind';
  renderRack();
  updateSettings();
}

function openBoard(no, fresh = false) {
  shown = no;
  closeSheets();
  def = BOARDS[no - 1];
  board = new Board(def);
  let saved = !fresh && state.benches[no];
  // A board you finished, or took through the line, starts again from the rough when you come back to
  // it, unless you'd chosen to keep planing it.
  if (saved && ((saved.finished && !saved.keep) || saved.failed)) {
    state.attempts[no] = (state.attempts[no] || 0) + 1;
    delete state.benches[no];
    saved = null;
  }
  strokes = 0; finished = false; failed = false; keepGoing = false; settling = false; mode = 'plane';
  flatLog = []; stuckAt = -99; fullSaid = false; missSaid = false; endsSaid = false; nearSaid = null;
  rand = rng(def.seed * 7919 + (state.attempts[no] || 0) * 104729 + 1);
  scene.scribbleSeed = null;
  let resumed = false;
  if (saved && board.load(saved.board)) {
    strokes = saved.strokes || 0;
    rand.set(saved.rs | 0);
    scene.scribbleSeed = saved.scribble ?? null;
    finished = keepGoing = !!saved.finished;
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
  const best = state.best[def.no];
  if (best) facts.push(['Best', `${GRADES[best.marks - 1]}, ${best.strokes} strokes`]);
  $('introFacts').innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  $('introNote').textContent = def.note || wood.note;
  $('introGo').textContent = best ? 'Plane it again' : 'Start planing';
  openSheet('intro');
}
$('introGo').addEventListener('click', () => {
  sound.wake(); ready(); closeSheets();
  // The first time on the bench: show what a stroke is, off one end and off the other, until you take one.
  if (def.no === 1 && !state.seen.stroke && !state.best[1] && !strokes) {
    const off = 18 / scene.s; // mm: just off each end, still on the bench
    scene.ghost = { t0: performance.now(), y: board.W / 2, x0: -off, x1: board.L + off, tool };
    hint('swipe', 'Swipe along the board, end to end, to take a stroke.', true);
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
  if (state.seen.edge && scene.straight) toast(scene.straight.words.text, 4200);
  hint('edge', 'Drag along or across the board to lay the straightedge somewhere else. It shows light wherever the face dips away beneath it.');
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
  scene.straight.words = edgeWords(scene.straight);
  if (!quiet) { sound.tink(); toast(scene.straight.words.text, 4200); }
  syncLoupe();
}

// What the straightedge shows, in words: a sentence for the note, and a few for the side view.
function edgeWords(st) {
  const r = readEdge(st.res), g = U.small(r.gap);
  const along = Math.abs(st.y1 - st.y0) < 1, across = Math.abs(st.x1 - st.x0) < 1;
  // A point on it (a fraction along), as a place on the board: 'the middle', 'the near end', 'one edge'.
  const place = t => {
    if (across) return t < 0.3 || t > 0.7 ? 'one edge' : 'the middle';
    const x = (st.x0 + (st.x1 - st.x0) * t) / board.L;
    return x < 0.3 ? 'the near end' : x > 0.7 ? 'the far end' : 'the middle';
  };
  const near = where => (where === 'the middle' ? 'in the middle' : 'toward ' + where);
  switch (r.kind) {
    case 'none': return { label: 'no light', text: 'No light under the straightedge.' };
    case 'hollow': return across
      ? { label: 'light in the middle', text: `Light in the middle, ${g} at most: cupped here, the edges high. Plane the edges.` }
      : { label: 'light in the middle', text: `Light in the middle, ${g} at most: hollow here. Full-length jointer strokes ride the high ends down.` };
    case 'rocks': {
      const at = near(place((r.t0 + r.t1) / 2));
      return { label: 'rocks ' + at, text: `It rocks on a high spot ${at}, with ${g} of light either side. Plane where it touches${along ? ', with short strokes' : ''}.` };
    }
    case 'two': return { label: 'two high spots', text: `It rests on two high spots with ${g} of light between them. Plane where it touches.` };
    default: {
      const low = place(r.kind === 'start' ? 0 : 1);
      return { label: 'light toward ' + low, text: `Light toward ${low}, ${g} at most: the face falls away there. Plane where it touches, not the low part.` };
    }
  }
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
  if (!ready() || activePointer != null || !$('intro').hidden || settling) return;
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

// How near an end counts as off it: about a fingertip on the screen, and never less than the model's own.
const reach = () => Math.min(40, Math.max(REACH, 24 / scene.s));

function beginStroke(p) {
  stroke = new Stroke(board, tool, p.x, p.y, rand, reach());
  $('toast').classList.add('dim'); // a note stays out of the way while the plane is down
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
    tornNote(p);
  }
  sound.cutLevel(out.rows ? out.width / PLANES[tool].blade : 0, out.rows > 0);
  kick();
}

// The first tear-out of each kind says why, for the spot where it happened: against the grain (and
// which way it runs there), round a knot, or in figure that turns every inch.
function tornNote(p) {
  const i = Math.max(0, Math.min(board.NX - 1, Math.floor(p.x / board.dx))), j = Math.max(0, Math.min(board.NY - 1, Math.floor(p.y / board.dy)));
  const knot = (def.knots || []).some(([kx, ky, kr]) => Math.hypot(p.x - kx * board.L, (p.y - ky * board.W) * 1.6) < kr * 3);
  if (def.curl || def.ribbon) hint('tearFigure', 'Tear-out: this figure turns every inch or so, so some of it always runs against the plane. Fine passes with the smoother get through it clean.');
  else if (knot) hint('tearKnot', 'Tear-out round the knot: the grain swirls there and tears whichever way you go. Take it down with the smoother.');
  else hint('tear', `Tear-out: against the grain. Here it runs toward the ${board.grain[i * board.NY + j] > 0 ? 'far' : 'near'} end, the way the lines on the edge head from the face into the wood.`);
}

function endStroke() {
  // Lifted near the end it was heading for, the plane runs off it.
  const off = stroke.liftTo();
  if (off !== null) moveStroke({ x: off, y: stroke.y });
  const r = stroke.end();
  stroke = null;
  $('toast').classList.remove('dim');
  sound.endCut(r.fullLength);
  if (scene.curl) scene.dropCurl(scene.curl);
  scene.curl = null;
  shaving = null;
  scene.plane.down = false;
  if (!hover) scene.plane.show = false;
  if (r.counts) {
    strokes++;
    if (scene.ghost) scene.ghost = null; // you've taken one: no more showing
    if (!state.seen.stroke) state.seen.stroke = 1;
  }
  scene.refit();
  const gapBefore = scene.straight ? scene.straight.res.gap : null;
  if (scene.straight) layStraightedge({ x: scene.straight.x0, y: scene.straight.y0 }, { x: scene.straight.x1, y: scene.straight.y1 }, true);
  syncLoupe();
  if (r.counts) flatLog.push(board.flatness());
  if (board.thinnest().t >= board.tmin) {
    const wind = Math.abs(board.wind().wind), lined = board.outOfWind();
    if (!r.counts) missed(r);
    else if (windWas >= WIND * 1.5 && lined) { toast('The winding sticks line up: out of wind.'); sound.tock(); }
    else if (gapBefore > 0.08 && scene.straight.res.gap < 0.04) { toast('No light under the straightedge.'); sound.tink(); }
    else if (endsLeft(r)) { /* said to start off the end */ }
    else if (nearly()) { /* said where it stands highest */ }
    else if (stuck()) { /* said what's left */ }
    else if (r.fullLength && r.fullWidth && !fullSaid) { fullSaid = true; toast('A full-length shaving.'); }
    else coach(r);
    windWas = lined ? wind : Math.max(windWas, wind);
  }
  check();
  updateHud();
  persist();
  kick();
}

// A stroke that cut nothing doesn't count, and every one says why.
function missed(r) {
  if (r.off) toast('That was off the board. Swipe along the board itself to take a stroke.', 3000);
  else if (r.skated) {
    const ends = r.from < board.L * 0.12 || r.to > board.L * 0.88;
    if (def.no === 1 && !ends && !missSaid) toast('No shaving: the middle of this board is low, so the plane rode over it. Go end to end.', 4200);
    else if (!missSaid) toast('No shaving: the plane rode on higher wood around that spot. Strokes that cut nothing don’t count.', 4200);
    else toast('No shaving there. That one doesn’t count.', 1800);
    missSaid = true;
  } else if (r.across) toast('Plane along the board, from end to end: across it, the plane won’t cut.', 3000);
}

// A long stroke put down well onto the board, or lifted well short of the other end, leaves that end
// rough in its lane, and an end left standing high holds the plane up on every stroke after. Said once
// a board, when it has happened: the end it missed is still rough-sawn and stands above where it cut.
function endsLeft(r) {
  if (endsSaid || r.to - r.from < board.L * 0.5) return false;
  const f = board.fit(), NY = board.NY;
  const res = (i, y) => {
    const j = Math.max(0, Math.min(NY - 1, Math.floor(y / board.dy)));
    return { rough: !board.cut[i * NY + j], z: board.top[i * NY + j] - (f.a + f.b * (board.xOf(i) - board.L / 2) + f.c * (board.yOf(j) - board.W / 2)) };
  };
  // gap: how far from the end the stroke began or stopped cutting; far: the far end, not the near.
  const standsHigh = (gap, far, y) => {
    if (gap <= 0) return false;
    const i = far ? board.NX - 1 : 0, k = Math.max(0, Math.min(board.NX - 1, Math.floor((far ? board.L - gap : gap) / board.dx)));
    const a = res(i, y), c = res(k, y);
    return a.rough && a.z > c.z + 0.02;
  };
  const fwd = r.dir > 0, start = standsHigh(r.startIn, !fwd, r.y0), stop = standsHigh(r.stopShort, fwd, r.y);
  if (!start && !stop) return false;
  endsSaid = true;
  // Said for the end it missed: the one it started from, the one it was heading for, or both.
  toast(start && stop ? 'Start each stroke off one end of the board and run it off the other: the blade only cuts between where you put the plane down and where you lift it.'
    : start ? 'Start each stroke off the end of the board: the blade only cuts from where you put the plane down.'
      : 'Run each stroke off the end of the board: the blade stops cutting where you lift the plane.', 5200);
  return true;
}

// What the first boards say as you go, once each.
function coach(r) {
  const no = def.no, rough = board.roughLeft(), fl = board.flatness();
  if (no === 1 && strokes === 1 && tool === 'jointer') hint('c1a', 'The jointer only cut where the board stands high. Keep taking full-length strokes, lane by lane, until the pencil’s gone.');
  else if (no === 1 && strokes === 1) hint('c1b', 'Try the jointer: long strokes, the whole length of the board.');
  else if (no <= 2 && rough && fl < 0.3 && rough < board.cut.length * 0.06) hint('edges', 'Nearly flat. Let the plane hang off the edges to reach the last rough strips.');
  else if (no === 3 && strokes >= 4 && r.straight && r.to - r.from >= board.L * 0.8 && Math.abs(board.wind().wind) > WIND * 1.5) {
    hint('c3', 'Still in wind? Straight full-length strokes can’t take out twist. Work the two high corners.');
  }
  if (fl <= FLAT && rough && rough < board.cut.length * 0.03) toast('Flat, but rough-sawn spots are left ' + roughWhere() + '.', 3600);
}

// Nearly flat and planed all over: the last few thou decide the board, and hunting for them with the
// straightedge isn't the game, so the bench says where the face stands highest after every stroke.
function nearly() {
  const fl = board.flatness();
  if (board.roughLeft() || fl <= FLAT || fl > 1.4 * FLAT) return false;
  const h = board.highest(), where = placeWords(h.x, h.y);
  toast(where === nearSaid ? `Still highest ${where}.`
    : `Nearly flat. It stands highest ${where}: a stroke there${tool === 'smoother' ? '' : ' with the smoother'}.`, 4200);
  nearSaid = where;
  return true;
}

// A spot on the board in words, standing at the near end: "toward the far end, by the right edge".
function placeWords(x, y) {
  const fx = x / board.L, fy = y / board.W;
  const along = fx < 1 / 3 ? 'toward the near end' : fx > 2 / 3 ? 'toward the far end' : 'midway along';
  const across = fy < 0.3 ? 'by the left edge' : fy > 0.7 ? 'by the right edge' : 'down the middle';
  return along === 'midway along' && across === 'down the middle' ? 'in the middle of the board' : along + ', ' + across;
}

// When eight strokes haven't brought the face any nearer flat, say what shape is left and what takes
// it out, and where it stands highest; and again ten strokes later if it still hasn't moved.
// scripts/cards.mjs listens for this note the same way: keep the two in step.
function stuck() {
  const n = flatLog.length, now = flatLog[n - 1];
  if (n < 9 || now <= 1.4 * FLAT || now < flatLog[n - 9] * 0.9 || strokes - stuckAt < 10) return false;
  if (board.roughLeft() > board.cut.length * 0.25) return false; // still taking the saw marks off: too soon to say
  const sh = board.shape(), bow = Math.abs(sh.bow), cup = Math.abs(sh.cup), twist = 2 * Math.abs(sh.twist);
  const h = board.highest(), where = placeWords(h.x, h.y);
  let text;
  if (Math.max(bow, cup, twist) < now * 0.3) {
    text = `What’s left isn’t one shape but high patches, the highest ${where}. Plane there, then lay the straightedge along and across to find the next, and stop where the light starts.`;
  } else if (twist >= bow && twist >= cup) {
    text = `Still in wind. Straight passes take an even shaving off a twisted face: plane the high corners, ${sh.twist > 0 ? 'far right and near left' : 'far left and near right'}.`;
  } else if (cup >= bow) {
    text = sh.cup > 0 ? 'Still cupped, the edges high. Passes down the middle lower the whole face; plane just the edge lanes until a straightedge across sits flat.'
      : 'Still high along the middle. Plane the middle lanes until a straightedge laid across stops rocking.';
  } else {
    text = sh.bow > 0 ? 'Still hollow. Keep taking full-length jointer strokes: it rides on the high ends.'
      : 'Still crowned. Full-length strokes just follow it down: take short strokes on the high middle and leave the ends.'
        + (turnsMidway() ? ' The grain turns around there, so take them with the smoother: set fine, it gets through without tearing.' : '');
  }
  if (!text.startsWith('What’s left')) text += ` It stands highest ${where}.`;
  stuckAt = strokes;
  toast(text, 6500);
  return true;
}

// Where the last rough cells are, in words: "toward the far end, by the left edge".
function roughWhere() {
  let sx = 0, sy = 0, n = 0;
  for (let k = 0; k < board.cut.length; k++) if (!board.cut[k]) { sx += board.xOf(Math.floor(k / board.NY)); sy += board.yOf(k % board.NY); n++; }
  return n ? placeWords(sx / n, sy / n) : '';
}

// Does the grain turn around somewhere in the middle half of the board, along its centre?
function turnsMidway() {
  const j = board.NY >> 1, a = Math.floor(board.NX / 4), z = Math.ceil((3 * board.NX) / 4);
  for (let i = a + 1; i < z; i++) if (board.grain[i * board.NY + j] !== board.grain[a * board.NY + j]) return true;
  return false;
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
      clearTimeout(toastTimer); // whatever the last stroke said is old news now
      $('toast').classList.remove('on');
      scene.glow = 1;
      sound.done();
      // The face lights up for a moment before the card; nothing more is planed meanwhile.
      settling = true;
      const done = board;
      setTimeout(() => {
        settling = false;
        if (board === done && board.done() && !failed) showResult(result);
      }, 900);
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
    { ok: true, label: 'Flat', v: 'within ' + U.flat(fl, -1) },
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
  // The last board, with every one done, goes on to the tabletop itself.
  $('nextBtn').hidden = !next && !allDone();
  $('nextBtn').textContent = next ? 'Next: No. ' + next.no : 'See the tabletop';
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

$('nextBtn').addEventListener('click', () => { const next = BOARDS[def.no]; if (next) go(next.no); else showTable(); });
$('againBtn').addEventListener('click', restart);
$('keepBtn').addEventListener('click', () => {
  keepGoing = true;
  persist();
  closeSheets();
  // Planing out the tear-out: ring each spot for a moment, so you know where to go.
  const spots = board.tornPatches();
  if (spots.length) { scene.rings = { spots, t0: performance.now() }; kick(); }
});

function restart() {
  if (!def) return;
  state.attempts[def.no] = (state.attempts[def.no] || 0) + 1;
  delete state.benches[def.no];
  save(state);
  openBoard(def.no, true);
}

// ---------- the HUD ----------
// The four marks a board is graded on, as you go: strokes against par, how flat (and what flat is),
// the thinnest spot against the thickness mark (then the line, once the mark is gone), and tear-out.
function updateHud() {
  $('strokes').textContent = strokes;
  $('par').textContent = 'par ' + def.par;
  $('strokes').parentElement.classList.toggle('warn', strokes > def.par);
  const fl = board.flatness(), rough = board.roughLeft();
  // A face that isn't flat yet reads above the aim, rounded up; one that is, rounded down.
  $('flat').textContent = U.flat(fl, fl <= FLAT ? -1 : 1);
  $('flatSub').textContent = rough ? 'rough ' + Math.ceil((rough / board.cut.length) * 100) + '%' : fl <= FLAT ? 'flat' : 'aim ' + U.flat(FLAT, -1);
  $('flat').parentElement.classList.toggle('ok', !rough && fl <= FLAT);
  const th = board.thinnest().t, margin = th - board.tmin, keep = keepFor(def);
  $('thick').textContent = U.thick(th);
  $('line').textContent = th >= keep ? 'keep ' + U.thick(keep) : 'line ' + U.line(board.tmin);
  scene.lineLabel = U.line(board.tmin) + ' line';
  // Amber once it's thinner than the thickness mark allows, red through the line.
  const st = $('thick').parentElement;
  st.classList.toggle('warn', th < keep && margin >= 0);
  st.classList.toggle('over', margin < 0);
  const spots = board.tornSpots();
  $('torn').textContent = spots;
  $('tornSub').textContent = spots === 1 ? 'spot' : 'spots';
  $('torn').parentElement.classList.toggle('warn', spots > 0);
}

function describeLoupe() {
  if (!board) return;
  let text = '';
  if (scene.loupe.mode === 'straightedge' && scene.straight) {
    text = scene.straight.words.text;
  } else if (scene.loupe.mode === 'sticks') {
    const w = board.wind().wind;
    text = board.outOfWind() ? 'The winding sticks line up: out of wind.'
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
    strokes, rs: rand.state(), board: board.save(), scribble: scene.scribbleSeed ?? null, finished, failed, keep: keepGoing, t: Date.now(),
  };
  save(state);
}

// ---------- sheets and settings ----------
function openSheet(id) { closeSheets(); $(id).hidden = false; const f = $(id).querySelector('button.go, button.row, button'); if (f) f.focus({ preventScroll: true }); }
function closeSheets() { for (const id of ['intro', 'result', 'menu', 'how', 'table']) $(id).hidden = true; }

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
  if (!$('bench').hidden && $('intro').hidden && $('result').hidden && $('menu').hidden && $('how').hidden && $('table').hidden && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const k = e.key.toLowerCase();
    const plane = { 1: 'jack', 2: 'jointer', 3: 'smoother' }[k];
    if (plane) { selectTool(plane); setMode('plane'); return; }
    if (k === 'p') { $('pencilBtn').click(); return; }
    if (k === 'e') { $('edgeBtn').click(); return; }
    if (k === 'w') { $('sticksBtn').click(); return; }
  }
  if (e.key === 'Escape') {
    if (!$('menu').hidden || !$('how').hidden || !$('table').hidden) closeSheets();
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
  if (stroke || scene.flying.length || scene.scribble || scene.glow > 0 || scene.mark || scene.ghost || scene.rings) kick();
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

// For the tests: a look inside, and a way to take a stroke without a finger.
window.outOfWind = {
  peek: () => board && ({
    no: def.no, strokes, finished, failed, settling, mode, tool, par: def.par,
    thick: board.thinnest().t, flat: board.flatness(), rough: board.roughLeft(), torn: board.tornSpots(),
    done: board.done(), loupe: scene.loupe.mode, straight: scene.straight && scene.straight.res.gap, sticks: scene.sticks,
  }),
  toClient: (x, y) => scene.toClient(x, y),
  board: () => board,
  scene,
  toast,
  swipe(t, x0, x1, y, y1 = y) {
    ready();
    selectTool(t); setMode('plane');
    beginStroke({ x: x0, y });
    const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y) / 25));
    for (let k = 1; k <= steps; k++) moveStroke({ x: x0 + ((x1 - x0) * k) / steps, y: y + ((y1 - y) * k) / steps });
    endStroke();
  },
};

route();
// The one-file copy (data-single) has no service worker to register.
if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline copy is a bonus */ });
}
