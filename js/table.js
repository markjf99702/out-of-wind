// The tabletop, finished: the glued-up panel (board 13) planed and oiled, set on a walnut base, drawn
// in a three-quarter view the way you'd stand back and look at it. The top is the panel's own planed
// wood, skewed into place; the rest is drawn with a few gradients.

import { Board } from './board.js';
import { BOARDS } from './boards.js';
import { WOODS, rgb } from './woods.js';
import { woodTextures } from './wood.js';

let tex = null; // the panel's planed face, drawn once
const css = (c, k = 1, a = 1) => `rgba(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0},${a})`;

// Draws the table into cv, sized w x h CSS pixels at dpr.
export function drawTable(cv, w, h, dpr = 1) {
  const def = BOARDS[BOARDS.length - 1], L = def.L, D = def.strips.reduce((s, st) => s + st.w, 0);
  if (!tex) tex = woodTextures(new Board(def), 1.1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  // The view: along the top runs across the picture, its depth runs back and up to the right.
  const sh = 0.42, fs = 0.36, T = 24, legH = 400, apron = 80, inset = 34, legW = 42, foot = 26;
  const k = Math.min((w * 0.9) / (L + sh * D), (h * 0.9) / (fs * D + T + legH + 30));
  const x0 = (w - k * (L + sh * D)) / 2, y0 = (h - k * (fs * D + T + legH)) / 2 + k * fs * D; // the front left corner of the top
  // A point on the table: a along the top, d back from its front edge, z down from its face (mm).
  const P = (a, d, z = 0) => [x0 + k * (a + sh * d), y0 - k * fs * d + k * z];
  const poly = (pts, fill) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = fill; c.fill(); };
  const walnut = rgb(WOODS.walnut.early), walnutD = rgb(WOODS.walnut.late);

  // Its shadow on the floor.
  const [fx, fy] = P(L / 2, D / 2, T + legH);
  const g0 = c.createRadialGradient(fx, fy, 4, fx, fy, k * L * 0.62);
  g0.addColorStop(0, 'rgba(40,25,15,.32)'); g0.addColorStop(1, 'rgba(40,25,15,0)');
  c.save(); c.translate(fx, fy); c.scale(1, 0.2); c.translate(-fx, -fy);
  c.fillStyle = g0; c.beginPath(); c.arc(fx, fy, k * L * 0.62, 0, Math.PI * 2); c.fill();
  c.restore();

  // A tapered leg standing at (a, d): its front face and its right face.
  const leg = (a, d, back) => {
    const top = T, bot = T + legH, t = (legW - foot) / 2;
    const k2 = back ? 0.78 : 1;
    poly([P(a, d, top), P(a + legW, d, top), P(a + legW - t, d, bot), P(a + t, d, bot)], css(walnut, 0.95 * k2));
    poly([P(a + legW, d, top), P(a + legW, d + legW, top), P(a + legW - t, d + legW - t, bot), P(a + legW - t, d, bot)], css(walnutD, 0.78 * k2));
  };
  const la = inset, ra = L - inset - legW, fd = inset, bd = D - inset - legW;
  leg(la, bd, true); leg(ra, bd, true);
  // The aprons between the legs, under the top: the front one, and the right one running back.
  poly([P(la, fd + 6, T), P(ra + legW, fd + 6, T), P(ra + legW, fd + 6, T + apron), P(la, fd + 6, T + apron)], css(walnut, 0.82));
  poly([P(ra + legW - 6, fd, T), P(ra + legW - 6, bd + legW, T), P(ra + legW - 6, bd + legW, T + apron), P(ra + legW - 6, fd, T + apron)], css(walnutD, 0.7));
  const ga = c.createLinearGradient(...P(0, fd, T), ...P(0, fd, T + apron));
  ga.addColorStop(0, 'rgba(0,0,0,.35)'); ga.addColorStop(0.35, 'rgba(0,0,0,0)');
  poly([P(la, fd + 6, T), P(ra + legW, fd + 6, T), P(ra + legW, fd + 6, T + apron), P(la, fd + 6, T + apron)], ga);
  leg(la, fd, false); leg(ra, fd, false);

  // The top's right end: the three boards' end grain, front to back, darker than their faces.
  const ends = def.strips.map((st, i) => ({ st, y0: def.strips.slice(0, i).reduce((s, x) => s + x.w, 0) }));
  for (const { st, y0: sy } of ends) {
    const d0 = D - sy - st.w, d1 = D - sy; // a strip at y (across the panel) sits d = D - y back from the front
    poly([P(L, d0, 0), P(L, d1, 0), P(L, d1, T), P(L, d0, T)], css(rgb(WOODS[st.wood].late), 0.72));
  }
  // The front edge: the board along the front (the panel's last), its long grain in the light.
  const front = rgb(WOODS[def.strips[def.strips.length - 1].wood].early);
  const ge = c.createLinearGradient(...P(0, 0, 0), ...P(0, 0, T));
  ge.addColorStop(0, css(front, 1.02)); ge.addColorStop(1, css(front, 0.66));
  poly([P(0, 0, 0), P(L, 0, 0), P(L, 0, T), P(0, 0, T)], ge);
  poly([P(0, 0, 0), P(L, 0, 0), P(L, 0, 1.5), P(0, 0, 1.5)], 'rgba(255,245,225,.35)'); // its arris, catching the light

  // The top itself: the panel's planed face, skewed into the view. Texture y runs across the panel,
  // and its last board is the front edge.
  c.save();
  const face = [P(0, 0), P(L, 0), P(L, D), P(0, D)];
  c.beginPath(); face.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip();
  // texture (u, v) in pixels -> mm (u / ppm along, v / ppm across) -> the view, with d = D - v / ppm
  const s = k / tex.ppm, [ox, oy] = P(0, D);
  c.transform(s, 0, -sh * s, fs * s, ox, oy);
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(tex.planed, 0, 0);
  c.restore();
  // Oil: the colour deepened, and the lamp's sheen across it.
  c.save();
  c.beginPath(); face.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.clip();
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = 'rgba(214,170,120,.35)';
  c.fill();
  c.globalCompositeOperation = 'source-over';
  const gs = c.createLinearGradient(...P(L * 0.15, D), ...P(L * 0.85, 0));
  gs.addColorStop(0, 'rgba(255,248,232,.30)'); gs.addColorStop(0.45, 'rgba(255,248,232,.06)'); gs.addColorStop(1, 'rgba(30,18,10,.18)');
  c.fillStyle = gs;
  c.fill();
  c.restore();
}
