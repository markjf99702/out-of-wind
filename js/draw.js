// Draws the bench: the board with its layers, the plane, shavings, the checks and the side view.
//
// Everything is drawn in "board space": u runs along the board (near end at u = 0), v across it,
// in CSS pixels. On a landscape screen that's the screen itself; on a portrait phone the scene is
// turned a quarter turn, so the board stands up the screen with its near end at the bottom.
//   above the board (small v): the shavings pile on the bench
//   the board, then its front edge (where you read the grain)
//   below: the side view, magnified: the face along one line, the gauge line, the plane or straightedge

import { rgb } from './woods.js';
import { PLANES } from './plane.js';
import { woodTextures, canvas } from './wood.js';
import { rng } from './rng.js';

const LIGHT = norm([0.55, -0.5, 0.67]); // raking light from the far end and the top edge, low
const RELIEF = 48; // how much the shading exaggerates slopes

function norm(v) { const l = Math.hypot(...v); return v.map(c => c / l); }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;

export class Scene {
  constructor(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.board = null;
    this.dpr = 1;
    this.plane = { tool: 'jointer', x: 0, y: 0, dir: 1, down: false, show: false, rideZ: null };
    this.curl = null; // the shaving coming out of the mouth: { len, w, torn, color }
    this.flying = []; // shavings and chips on their way to the pile
    this.pile = []; // shavings lying on the bench
    this.loupe = { mode: 'plane', y: null, line: null };
    this.straight = null; // { x0, y0, x1, y1, res }
    this.sticks = false;
    this.scribble = null; // pencil being drawn: { paths, t0, dur }
    this.mark = null; // a spot to point at: { x, y, kind }
    this.glow = 0; // the face lit up when it's finished
    this.dirtyShade = true;
  }

  // ---------- layout ----------
  resize(w, h, dpr) {
    this.dpr = dpr;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
    this.W = w; this.H = h;
    this.portrait = h > w * 1.05;
    this.BU = this.portrait ? h : w; // board-space length available
    this.BV = this.portrait ? w : h;
    if (this.board) this.layout();
  }

  layout() {
    const b = this.board, BU = this.BU, BV = this.BV;
    const lh = clamp(Math.round(BV * 0.2), 64, 104); // the side view's height
    const eh = 13, gap = 10, pad = this.portrait ? 10 : 14, ends = 26;
    const s = Math.min((BU - 2 * ends - 8) / b.L, (BV - lh - eh - gap - pad - 30) / b.W);
    this.s = s;
    this.bw = b.L * s; this.bh = b.W * s;
    this.u0 = (BU - this.bw) / 2;
    const group = this.bh + eh + gap + lh;
    // Leave the pile some room above, but don't let the board drift to the top of a big screen.
    const top = Math.max(26, Math.min(BV - pad - group, (BV - group) * 0.62));
    this.v0 = top;
    this.edgeV = top + this.bh;
    this.lv0 = this.edgeV + eh + gap;
    this.eh = eh;
    this.lh = lh;
    this.ppm = clamp(s * this.dpr, 0.6, 3.2);
    this.buildLayers();
  }

  // ---------- board layers ----------
  setBoard(board) {
    this.board = board;
    this.pile = []; this.flying = []; this.curl = null; this.straight = null; this.mark = null; this.glow = 0;
    this.loupe = { mode: 'plane', y: board.W / 2, line: null };
    this.texKey = null;
    if (this.W) this.layout();
  }

  buildLayers() {
    const b = this.board;
    const key = b.def.no + ':' + this.ppm.toFixed(2) + ':' + b.def.seed;
    if (this.texKey !== key) {
      this.tex = woodTextures(b, this.ppm);
      this.texKey = key;
      this.edges = this.drawEdges();
    }
    const { w, h } = this.tex;
    this.cellW = w / b.NX; this.cellH = h / b.NY;
    // Masks one pixel per cell, scaled up smoothly: where the face is still rough, where there's pencil.
    this.roughMask = canvas(b.NX, b.NY);
    this.roughMaskD = this.roughMask.getContext('2d').createImageData(b.NX, b.NY);
    this.pencilMask = canvas(b.NX, b.NY);
    this.pencilMaskD = this.pencilMask.getContext('2d').createImageData(b.NX, b.NY);
    this.roughComp = canvas(w, h);
    this.pencilLines = canvas(w, h);
    this.pencilComp = canvas(w, h);
    this.tearC = canvas(w, h);
    this.shade = canvas(b.NX, b.NY);
    this.shadeData = this.shade.getContext('2d').createImageData(b.NX, b.NY);
    this.redrawTears();
    this.redrawPencil();
    this.syncMasks();
    this.fit = b.fit();
    this.dirtyShade = true;
  }

  syncMasks() {
    const b = this.board, { NX, NY } = b, rd = this.roughMaskD.data, pd = this.pencilMaskD.data;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      const k = i * NY + j, o = (j * NX + i) * 4 + 3;
      rd[o] = b.cut[k] ? 0 : 255;
      pd[o] = b.pencil[k] ? 255 : 0;
    }
    this.roughMask.getContext('2d').putImageData(this.roughMaskD, 0, 0);
    this.pencilMask.getContext('2d').putImageData(this.pencilMaskD, 0, 0);
    this.compose(this.roughComp, this.tex.rough, this.roughMask);
    this.compose(this.pencilComp, this.pencilLines, this.pencilMask);
  }

  // layer = image, shown only where the mask is.
  compose(out, img, mask) {
    const c = out.getContext('2d');
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, out.width, out.height);
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(mask, 0, 0, out.width, out.height);
    c.globalCompositeOperation = 'source-over';
  }

  cellRect(k) {
    const NY = this.board.NY, i = Math.floor(k / NY), j = k % NY;
    const x0 = Math.round(i * this.cellW), x1 = Math.round((i + 1) * this.cellW);
    const y0 = Math.round(j * this.cellH), y1 = Math.round((j + 1) * this.cellH);
    return [x0, y0, x1 - x0, y1 - y0];
  }

  // Cells changed under the plane: cut (no longer rough, pencil gone), torn or cleaned.
  cellsChanged(list) {
    const b = this.board;
    let cleaned = false;
    for (const k of list) {
      if (b.torn[k]) { if (!this.tornShown[k]) { this.drawTear(k); this.tornShown[k] = 1; } }
      else if (this.tornShown[k]) cleaned = true;
    }
    if (cleaned) this.redrawTears();
    this.masksDirty = true;
    this.dirtyShade = true;
  }

  redrawTears() {
    const b = this.board;
    this.tearC.getContext('2d').clearRect(0, 0, this.tearC.width, this.tearC.height);
    this.tornShown = new Uint8Array(b.torn.length);
    for (let k = 0; k < b.torn.length; k++) if (b.torn[k]) { this.drawTear(k); this.tornShown[k] = 1; }
  }

  drawTear(k) {
    const b = this.board, tc = this.tearC.getContext('2d'), [x, y, w, h] = this.cellRect(k);
    const r = rng(k * 2654435761 + b.def.seed);
    const wood = b.wood(k % b.NY), late = rgb(wood.late), early = rgb(wood.early);
    // Torn fibres: a ragged dark hollow drawn out along the grain, with pale lifted splinters.
    tc.fillStyle = `rgba(${late[0] * 0.5 | 0},${late[1] * 0.42 | 0},${late[2] * 0.36 | 0},0.78)`;
    tc.beginPath();
    const n = 8, cx = x + w / 2 + (r() - 0.5) * w * 0.3, cy = y + h / 2 + (r() - 0.5) * h * 0.3;
    for (let q = 0; q < n; q++) {
      const a = (q / n) * Math.PI * 2, rr = 0.45 + r() * 0.4;
      const px = cx + Math.cos(a) * w * rr * 1.3, py = cy + Math.sin(a) * h * rr * 0.6;
      q ? tc.lineTo(px, py) : tc.moveTo(px, py);
    }
    tc.closePath();
    tc.fill();
    tc.strokeStyle = `rgba(${Math.min(255, early[0] * 1.15) | 0},${Math.min(255, early[1] * 1.12) | 0},${Math.min(255, early[2] * 1.05) | 0},0.9)`;
    tc.lineWidth = Math.max(0.7, w * 0.09);
    tc.lineCap = 'round';
    for (let q = 0; q < 3; q++) {
      const sx = x + r() * w, sy = y + r() * h;
      tc.beginPath();
      tc.moveTo(sx, sy);
      tc.lineTo(sx + (r() - 0.2) * w * 1.1, sy + (r() - 0.5) * h * 0.35);
      tc.stroke();
    }
  }

  // ---------- pencil ----------
  // A quick looping scribble down the face, the way you'd cover a board before planing:
  // loops that run right across it, stretched out along its length.
  makeScribble(seed) {
    const b = this.board, r = rng(seed);
    const ry = b.W / 2 - 7, cy = b.W / 2, rx = 8 + r() * 3, v = 2.6 + r() * 0.6;
    const path = [];
    let x = 6 + r() * 4, wob = 0;
    const end = (b.L - 12 - x) / v;
    for (let t = 0; t <= end; t += 0.18) {
      wob += (r() - 0.5) * 0.08;
      wob *= 0.96;
      const yy = cy - ry * (0.9 + 0.1 * Math.sin(t * 0.37)) * Math.cos(t + wob);
      const xx = x + v * t - rx * Math.sin(t + wob) + (r() - 0.5) * 0.6;
      path.push([xx, yy]);
    }
    return [path];
  }

  startScribble(seed, dur = 650) {
    this.scribble = { paths: this.makeScribble(seed), t0: performance.now(), dur, seed };
    this.scribbleSeed = seed;
    this.pencilLines.getContext('2d').clearRect(0, 0, this.pencilLines.width, this.pencilLines.height);
    this.masksDirty = true;
  }

  // The last scribble's lines; the pencil mask hides them wherever the plane has cut since.
  redrawPencil() {
    const pc = this.pencilLines.getContext('2d');
    pc.clearRect(0, 0, this.pencilLines.width, this.pencilLines.height);
    if (this.scribbleSeed == null) return;
    this.strokePencil(pc, this.makeScribble(this.scribbleSeed), 1);
  }

  // Soft graphite: a main line and a fainter one over it, a hair off, for the grain of the lead.
  strokePencil(pc, paths, upto) {
    const p = this.ppm;
    pc.save();
    pc.lineCap = 'round'; pc.lineJoin = 'round';
    for (const [off, col, w] of [[0, 'rgba(52,52,60,0.55)', 1.25], [0.12, 'rgba(30,30,36,0.3)', 0.6]]) {
      pc.strokeStyle = col;
      pc.lineWidth = Math.max(0.9, w * p);
      for (const path of paths) {
        const n = Math.max(2, Math.floor(path.length * upto));
        pc.beginPath();
        for (let q = 0; q < n; q++) {
          const x = (path[q][0] + off) * p, y = (path[q][1] + off) * p;
          q ? pc.lineTo(x, y) : pc.moveTo(x, y);
        }
        pc.stroke();
      }
    }
    pc.restore();
  }

  // ---------- shading ----------
  // The lamp shows the board's shape, not its saw marks: shade a smoothed copy of the face.
  updateShade() {
    const b = this.board, { NX, NY } = b, d = this.shadeData.data, f = this.fit;
    const top = this.smoothed(b.top, NX, NY);
    for (let i = 0; i < NX; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(NX - 1, i + 1);
      for (let j = 0; j < NY; j++) {
        const j0 = Math.max(0, j - 1), j1 = Math.min(NY - 1, j + 1);
        const gx = (top[i1 * NY + j] - top[i0 * NY + j]) / ((i1 - i0) * b.dx) - f.b;
        const gy = (top[i * NY + j1] - top[i * NY + j0]) / ((j1 - j0) * b.dy) - f.c;
        const nx = -gx * RELIEF, ny = -gy * RELIEF, l = Math.hypot(nx, ny, 1);
        const dot = (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / l - LIGHT[2];
        const o = (j * NX + i) * 4;
        const v = clamp(128 + dot * 300, 0, 255);
        d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255;
      }
    }
    // The shading canvas runs x across, y down, like the board in board space.
    this.shade.getContext('2d').putImageData(this.shadeData, 0, 0);
    this.dirtyShade = false;
  }

  refit() { this.fit = this.board.fit(); this.dirtyShade = true; }

  // A blur three cells wide each way (binomial weights), along then across.
  smoothed(src, NX, NY) {
    if (!this.tmpA || this.tmpA.length !== src.length) { this.tmpA = new Float32Array(src.length); this.tmpB = new Float32Array(src.length); }
    const a = this.tmpA, out = this.tmpB, w = [1, 6, 15, 20, 15, 6, 1];
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      let s = 0, n = 0;
      for (let k = -3; k <= 3; k++) { const ii = i + k; if (ii < 0 || ii >= NX) continue; s += src[ii * NY + j] * w[k + 3]; n += w[k + 3]; }
      a[i * NY + j] = s / n;
    }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      let s = 0, n = 0;
      for (let k = -3; k <= 3; k++) { const jj = j + k; if (jj < 0 || jj >= NY) continue; s += a[i * NY + jj] * w[k + 3]; n += w[k + 3]; }
      out[i * NY + j] = s / n;
    }
    return out;
  }

  // ---------- coordinates ----------
  toBoard(clientX, clientY) {
    const r = this.cv.getBoundingClientRect();
    const sx = clientX - r.left, sy = clientY - r.top;
    const u = this.portrait ? this.BU - sy : sx, v = this.portrait ? sx : sy;
    return { x: (u - this.u0) / this.s, y: (v - this.v0) / this.s };
  }
  // Board millimetres to client coordinates (for tests and pointing things out).
  toClient(x, y) {
    const r = this.cv.getBoundingClientRect();
    const u = this.u0 + x * this.s, v = this.v0 + y * this.s;
    return this.portrait ? { x: r.left + v, y: r.top + this.BU - u } : { x: r.left + u, y: r.top + v };
  }

  // Text that stays upright when the scene is turned.
  text(ctx, str, u, v, opts = {}) {
    ctx.save();
    ctx.translate(u, v);
    if (this.portrait) ctx.rotate(Math.PI / 2);
    ctx.font = opts.font || '500 12px "Alegreya Sans", system-ui, sans-serif';
    ctx.fillStyle = opts.color || 'rgba(243,233,216,.75)';
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.base || 'middle';
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  // ---------- the frame ----------
  frame(now) {
    const ctx = this.ctx, b = this.board;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    if (!b) return;
    const dpr = this.dpr;
    if (this.portrait) ctx.setTransform(0, -dpr, dpr, 0, 0, this.BU * dpr);
    else ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.dirtyShade) this.updateShade();
    this.drawBench(ctx);
    this.drawBoard(ctx, now);
    this.drawPile(ctx);
    if (this.sticks && !this.plane.down) this.drawSticks(ctx);
    if (this.straight && this.loupe.mode === 'straightedge') this.drawStraightedge(ctx);
    this.drawPlane(ctx, now);
    this.drawFlying(ctx, now);
    this.drawLoupe(ctx);
    this.drawInset(ctx);
  }

  drawBench(ctx) {
    const { BU, BV } = this;
    // A beech bench top in strips, dark with oil and years.
    ctx.fillStyle = '#3b2c20';
    ctx.fillRect(0, 0, BU, BV);
    const r = rng(77);
    for (let v = -10; v < BV; v += 38) {
      ctx.fillStyle = `rgba(${90 + r() * 30 | 0},${62 + r() * 20 | 0},${40 + r() * 14 | 0},0.35)`;
      ctx.fillRect(0, v, BU, 37);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.fillRect(0, v + 37, BU, 1);
    }
    // Lamp light pooled on the board, falling off to the edges.
    const g = ctx.createRadialGradient(this.u0 + this.bw * 0.55, this.v0 + this.bh * 0.4, 20, this.u0 + this.bw * 0.5, this.v0 + this.bh * 0.5, Math.max(BU, BV) * 0.75);
    g.addColorStop(0, 'rgba(255,214,150,.10)');
    g.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BU, BV);
  }

  drawBoard(ctx, now) {
    const { u0, v0, bw, bh, s } = this, b = this.board;
    // Shadow, the planing stop at the far end, and the end grain at the near end.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5; ctx.shadowOffsetX = 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(u0, v0, bw, bh + 8);
    ctx.restore();
    ctx.fillStyle = '#5b4330';
    ctx.fillRect(u0 + bw + 2, v0 - 6, 10, bh + 12);
    ctx.fillStyle = 'rgba(255,230,190,.12)';
    ctx.fillRect(u0 + bw + 2, v0 - 6, 2, bh + 12);
    ctx.drawImage(this.edges.end, u0 - 7, v0, 7, bh);
    ctx.drawImage(this.edges.edge, u0, this.edgeV, bw, this.eh);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (this.masksDirty) { this.syncMasks(); this.masksDirty = false; }
    ctx.drawImage(this.tex.planed, u0, v0, bw, bh);
    ctx.drawImage(this.roughComp, u0, v0, bw, bh);
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.drawImage(this.shade, u0, v0, bw, bh);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(this.shade, u0, v0, bw, bh);
    ctx.restore();
    ctx.drawImage(this.tearC, u0, v0, bw, bh);
    // Pencil, drawn as it's scribbled.
    if (this.scribble) {
      const t = (now - this.scribble.t0) / this.scribble.dur;
      const pc = this.pencilLines.getContext('2d');
      pc.clearRect(0, 0, this.pencilLines.width, this.pencilLines.height);
      this.strokePencil(pc, this.scribble.paths, Math.min(1, t));
      if (t >= 1) this.scribble = null;
      this.compose(this.pencilComp, this.pencilLines, this.pencilMask);
    }
    ctx.drawImage(this.pencilComp, u0, v0, bw, bh);
    if (this.glow > 0) {
      ctx.fillStyle = `rgba(255,240,205,${0.22 * this.glow})`;
      ctx.fillRect(u0, v0, bw, bh);
      this.glow = Math.max(0, this.glow - 0.012);
    }
    if (this.mark) {
      const { x, y } = this.mark, pu = u0 + x * s, pv = v0 + y * s;
      ctx.strokeStyle = '#e0533a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(pu, pv, 11 + 2 * Math.sin(now / 160), 0, Math.PI * 2); ctx.stroke();
    }
  }

  // The front edge, where you read the grain, and the end grain at the near end.
  // The lines are the fibres running out to the face: they slope down into the board the way to plane.
  drawEdges() {
    const b = this.board, ppm = this.ppm;
    const w = Math.round(b.L * ppm), eh = Math.max(6, Math.round(13 * this.dpr));
    const edge = canvas(w, eh), ec = edge.getContext('2d');
    const j = b.NY - 1, wood = b.wood(j), early = wood.early, late = rgb(wood.late);
    ec.fillStyle = early;
    ec.fillRect(0, 0, w, eh);
    ec.fillStyle = 'rgba(0,0,0,.18)';
    ec.fillRect(0, 0, w, eh);
    ec.strokeStyle = `rgba(${late[0] * 0.62 | 0},${late[1] * 0.55 | 0},${late[2] * 0.5 | 0},.95)`;
    ec.lineWidth = Math.max(1.2, 1.5 * this.dpr);
    ec.lineCap = 'round';
    const r = rng(b.def.seed + 5);
    const pitch = eh * 1.5, run = eh * 1.25;
    for (let px = -run; px < w + run; px += pitch * (0.85 + r() * 0.3)) {
      const i = clamp(Math.floor((px + run / 2) / ppm / b.dx), 0, b.NX - 1);
      const g = b.grain[i * b.NY + j];
      ec.beginPath();
      ec.moveTo(px, 0.5);
      ec.quadraticCurveTo(px + g * run * 0.45, eh * 0.45, px + g * run, eh - 0.5);
      ec.stroke();
    }
    ec.fillStyle = 'rgba(255,240,210,.22)';
    ec.fillRect(0, 0, w, Math.max(1, eh * 0.1));
    // End grain: growth rings in section.
    const hh = Math.round(b.W * ppm), ew = Math.max(4, Math.round(7 * this.dpr));
    const end = canvas(ew, hh), nc = end.getContext('2d');
    nc.fillStyle = early;
    nc.fillRect(0, 0, ew, hh);
    nc.fillStyle = 'rgba(40,25,15,.35)';
    nc.fillRect(0, 0, ew, hh);
    nc.strokeStyle = `rgba(${late[0] * 0.6 | 0},${late[1] * 0.55 | 0},${late[2] * 0.5 | 0},.75)`;
    nc.lineWidth = Math.max(0.8, ppm * 0.5);
    const cy = hh * (0.3 + r() * 0.4);
    for (let rad = wood.ring * ppm; rad < hh * 1.5; rad += wood.ring * ppm * 1.4) {
      nc.beginPath(); nc.arc(ew * 4, cy, rad, 0, Math.PI * 2); nc.stroke();
    }
    return { edge, end };
  }

  // ---------- the plane ----------
  drawPlane(ctx, now) {
    const p = this.plane;
    if (!p.show) return;
    const t = PLANES[p.tool], s = this.s;
    const u = this.u0 + p.x * s, v = this.v0 + p.y * s;
    ctx.save();
    ctx.translate(u, v);
    ctx.scale(s * (p.dir || 1), s);
    ctx.globalAlpha = p.down ? 1 : 0.92;
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 10 * s; ctx.shadowOffsetY = 4;
    drawPlaneBody(ctx, t);
    ctx.shadowColor = 'transparent';
    if (this.curl && p.down) drawCurl(ctx, t, this.curl, now);
    ctx.restore();
  }

  // ---------- shavings ----------
  // The shaving in the mouth breaks off and drops beside the board.
  dropCurl(curl) {
    if (!curl || curl.len < 4) return;
    const s = this.s, p = this.plane;
    const r = Math.random;
    const from = { u: this.u0 + p.x * s, v: this.v0 + p.y * s };
    // It falls off beside the board somewhere along the stretch it came from.
    const back = Math.min(curl.len, 400) * s * (p.dir || 1);
    const room = Math.max(12, this.v0 - 16);
    const to = {
      u: clamp(from.u - back * (0.2 + r() * 0.6) + (r() - 0.5) * 30, 12, this.BU - 12),
      v: clamp(this.v0 - 10 - Math.pow(r(), 0.7) * room, 8, Math.max(10, this.v0 - 6)),
    };
    this.flying.push({ ...curl, from, to, t0: performance.now(), rot0: r() * 6.28, spin: (r() - 0.5) * 6 });
  }
  chips(n, x, y, color) {
    const s = this.s, r = Math.random;
    for (let q = 0; q < Math.min(n, 6); q++) {
      const from = { u: this.u0 + x * s, v: this.v0 + y * s };
      const to = { u: from.u + (r() - 0.5) * 60, v: this.v0 - 6 - r() * 40 };
      this.flying.push({ chip: true, len: 3 + r() * 4, w: 2 + r() * 3, color, from, to, t0: performance.now(), rot0: r() * 6.28, spin: (r() - 0.5) * 10 });
    }
  }

  drawFlying(ctx, now) {
    const keep = [];
    for (const f of this.flying) {
      const t = Math.min(1, (now - f.t0) / 520);
      const e = 1 - (1 - t) * (1 - t);
      const u = mix(f.from.u, f.to.u, e), v = mix(f.from.v, f.to.v, e) - Math.sin(t * Math.PI) * 26;
      const rot = f.rot0 + f.spin * t;
      drawLoose(ctx, f, u, v, rot, this.s);
      if (t < 1) keep.push(f);
      else if (!f.chip || Math.random() < 0.5) { this.pile.push({ ...f, u: f.to.u, v: f.to.v, rot }); if (this.pile.length > 140) { this.pile.splice(0, 40); this.pileDrawn = Infinity; } }
    }
    this.flying = keep;
  }

  // Shavings that have landed are drawn once into their own layer.
  drawPile(ctx) {
    const dpr = this.dpr, W = Math.round(this.BU * dpr), H = Math.round(this.BV * dpr);
    if (!this.pileC || this.pileC.width !== W || this.pileC.height !== H || this.pileDrawn > this.pile.length) {
      this.pileC = canvas(W, H);
      this.pileDrawn = 0;
    }
    if (this.pileDrawn < this.pile.length) {
      const pc = this.pileC.getContext('2d');
      pc.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let k = this.pileDrawn; k < this.pile.length; k++) {
        const f = this.pile[k];
        pc.save();
        pc.shadowColor = 'rgba(0,0,0,.4)'; pc.shadowBlur = 3 * dpr; pc.shadowOffsetY = 1.5 * dpr;
        drawLoose(pc, f, f.u, f.v, f.rot, this.s);
        pc.restore();
      }
      this.pileDrawn = this.pile.length;
    }
    ctx.drawImage(this.pileC, 0, 0, this.BU, this.BV);
  }

  // ---------- checks ----------
  drawSticks(ctx) {
    const b = this.board, { u0, v0, s } = this, w = b.wind();
    for (const [i, dark] of [[w.near, true], [w.far, false]]) {
      const u = u0 + b.xOf(i) * s;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
      ctx.fillStyle = dark ? '#2d211a' : '#e8d9b6';
      ctx.fillRect(u - 7, v0 - 16, 14, this.bh + 32);
      ctx.restore();
      if (!dark) {
        ctx.fillStyle = '#2d211a';
        ctx.fillRect(u - 4, v0 - 13, 8, 10);
        ctx.fillRect(u - 4, v0 + this.bh + 3, 8, 10);
      } else {
        ctx.fillStyle = '#e8d9b6';
        ctx.fillRect(u - 3, v0 - 13, 6, 5);
        ctx.fillRect(u - 3, v0 + this.bh + 8, 6, 5);
      }
    }
  }

  drawStraightedge(ctx) {
    const st = this.straight, { u0, v0, s } = this;
    const a = { u: u0 + st.x0 * s, v: v0 + st.y0 * s }, c = { u: u0 + st.x1 * s, v: v0 + st.y1 * s };
    const ang = Math.atan2(c.v - a.v, c.u - a.u), len = Math.hypot(c.u - a.u, c.v - a.v);
    ctx.save();
    ctx.translate(a.u, a.v);
    ctx.rotate(ang);
    // Light leaking under it, brightest where the gap is widest.
    const res = st.res, n = res.gaps.length;
    for (let q = 0; q < n - 1; q++) {
      const g = res.gaps[q];
      if (g < 0.02) continue;
      ctx.fillStyle = `rgba(255,236,170,${clamp(g * 1.6, 0.12, 0.95)})`;
      ctx.fillRect((q / (n - 1)) * len, 5, len / (n - 1) + 0.5, clamp(1 + g * 7, 1.5, 6));
    }
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    const g = ctx.createLinearGradient(0, -5, 0, 5);
    g.addColorStop(0, '#d7dadd'); g.addColorStop(0.5, '#a9aeb3'); g.addColorStop(1, '#7c8186');
    ctx.fillStyle = g;
    ctx.fillRect(-6, -5, len + 12, 10);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(30,30,34,.55)';
    for (let q = 0; q <= len; q += 25.4 * s / 2) ctx.fillRect(q, -5, 0.8, q % (25.4 * s) < 1 ? 4 : 2.2);
    ctx.restore();
  }

  // ---------- the side view ----------
  drawLoupe(ctx) {
    const b = this.board, u0 = this.u0, bw = this.bw, V = this.lv0, H = this.lh;
    ctx.save();
    ctx.fillStyle = '#15100c';
    roundRect(ctx, u0 - 6, V, bw + 12, H, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(243,233,216,.10)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    roundRect(ctx, u0 - 6, V, bw + 12, H, 7);
    ctx.clip();
    if (this.loupe.mode === 'sticks' && !this.portrait) this.drawSighting(ctx, u0, V, bw, H);
    else this.drawProfile(ctx, u0, V, bw, H);
    ctx.restore();
  }

  // On a portrait phone the side view is a tall strip, so the sighting view gets its own inset,
  // level across the bottom of the bench.
  drawInset(ctx) {
    if (!(this.portrait && this.loupe.mode === 'sticks')) return;
    const dpr = this.dpr, W = this.W, H = this.H;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Over the middle of the board: the sticks themselves sit near its ends.
    const h = Math.min(118, H * 0.2), x = 10, y = (H - h) / 2, w = W - 20;
    ctx.save();
    ctx.fillStyle = 'rgba(21,16,12,.94)';
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(243,233,216,.14)';
    ctx.stroke();
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, 10);
    ctx.clip();
    const keep = this.portrait;
    this.portrait = false; // draw it level, whatever way the bench is turned
    this.drawSighting(ctx, x, y, w, h);
    this.portrait = keep;
    ctx.restore();
  }

  // The face along a line, from the side, magnified, with the gauge line and whatever rests on it.
  drawProfile(ctx, U, V, bw, H) {
    const b = this.board, L = this.loupe;
    let line = L.mode === 'straightedge' && this.straight ? this.straight : null;
    const y = clamp(L.y ?? b.W / 2, 0, b.W);
    const x0 = line ? line.x0 : 0, y0 = line ? line.y0 : y, x1 = line ? line.x1 : b.L, y1 = line ? line.y1 : y;
    const n = 120, zs = [], gz = [];
    for (let q = 0; q < n; q++) {
      const t = q / (n - 1), x = x0 + (x1 - x0) * t, yy = y0 + (y1 - y0) * t;
      zs.push(b.at(x, yy));
      gz.push(b.bottomAt(x, yy) + b.tmin);
    }
    // Lengthwise lines line up with the board; anything else is drawn across the full width.
    const along = Math.abs(y1 - y0) < 1e-6;
    const ua = along ? U + Math.min(x0, x1) * this.s : U + 8, ub = along ? U + Math.max(x0, x1) * this.s : U + bw - 8;
    const flip = along && x1 < x0;
    const xu = q => (flip ? mix(ub, ua, q / (n - 1)) : mix(ua, ub, q / (n - 1)));
    let zTop = -Infinity, zBot = Infinity;
    for (let q = 0; q < n; q++) { zTop = Math.max(zTop, zs[q]); zBot = Math.min(zBot, gz[q]); }
    const range = Math.max(0.5, zTop - zBot + 0.15);
    const mag = clamp((H - 22) / range, 14, 110); // pixels per millimetre, up and down
    const vy = z => V + 9 + (zTop - z) * mag;
    // The wood.
    const wood = b.wood(Math.floor(clamp(y, 0, b.W - 1) / b.dy)), c = rgb(wood.early);
    const g = ctx.createLinearGradient(0, V, 0, V + H);
    g.addColorStop(0, `rgb(${c[0]},${c[1]},${c[2]})`);
    g.addColorStop(1, `rgb(${c[0] * 0.45 | 0},${c[1] * 0.4 | 0},${c[2] * 0.36 | 0})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(xu(0), V + H);
    for (let q = 0; q < n; q++) ctx.lineTo(xu(q), vy(zs[q]));
    ctx.lineTo(xu(n - 1), V + H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,245,225,.65)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let q = 0; q < n; q++) q ? ctx.lineTo(xu(q), vy(zs[q])) : ctx.moveTo(xu(q), vy(zs[q]));
    ctx.stroke();
    // The gauge line: three-quarters of an inch up from the underside.
    ctx.strokeStyle = 'rgba(40,20,12,.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    for (let q = 0; q < n; q++) q ? ctx.lineTo(xu(q), vy(gz[q])) : ctx.moveTo(xu(q), vy(gz[q]));
    ctx.stroke();
    ctx.setLineDash([]);
    // Labels along the strip (on a phone they read up the strip, like the spine of a book).
    const lab = { font: '600 11px "Alegreya Sans", system-ui, sans-serif', color: 'rgba(243,233,216,.62)', base: 'top' };
    const title = line ? (along ? 'Under the straightedge' : 'Across, under the straightedge') : 'Under the plane, from the side';
    ctx.save();
    ctx.font = lab.font; ctx.fillStyle = lab.color; ctx.textBaseline = 'top';
    ctx.fillText(title.toUpperCase(), U + 4, V + H - 15);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(70,40,25,.95)';
    ctx.fillText(this.lineLabel || 'gauge line', U + bw - 4, Math.min(V + H - 15, vy(gz[n - 1]) + 3));
    ctx.restore();

    if (line && line.res) {
      // The straightedge resting on it, and the light underneath.
      const ra = vy(line.res.z0), rb = vy(line.res.z1);
      ctx.fillStyle = 'rgba(255,236,170,.85)';
      ctx.beginPath();
      ctx.moveTo(xu(0), ra);
      for (let q = 0; q < n; q++) ctx.lineTo(xu(q), Math.max(mix(ra, rb, q / (n - 1)), vy(zs[q])));
      ctx.lineTo(xu(n - 1), rb);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#c8ccd0';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(xu(0), ra - 1.5); ctx.lineTo(xu(n - 1), rb - 1.5); ctx.stroke();
    }
    if (L.mode === 'plane' && this.plane.down && this.plane.rideZ != null && along) {
      // The plane's sole riding on the high spots, and its blade.
      const p = this.plane, t = PLANES[p.tool], s = this.s;
      const ux = U + p.x * s, half = (t.len / 2) * s;
      const zr = vy(p.rideZ), slope = (p.rideSlope || 0) * mag / s;
      const a = zr - slope * -half, c = zr - slope * half;
      // The plane's body sits above its sole, which rests on the high spots.
      ctx.fillStyle = 'rgba(20,21,24,.92)';
      ctx.beginPath();
      ctx.moveTo(ux - half, a); ctx.lineTo(ux + half, c); ctx.lineTo(ux + half, c - 9); ctx.lineTo(ux - half, a - 9);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c3c8cd';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ux - half, a); ctx.lineTo(ux + half, c); ctx.stroke();
      // The blade, standing proud of the sole by the depth of cut.
      ctx.fillStyle = '#eef0f2';
      ctx.beginPath();
      ctx.moveTo(ux - 3, zr - 1); ctx.lineTo(ux + 3, zr - 1); ctx.lineTo(ux, zr + Math.max(2.5, t.depth * mag)); ctx.closePath();
      ctx.fill();
    }
  }

  // Sighting down the winding sticks from the near end. You crouch until the near stick's top edge
  // just hides the bottom of the far one; what shows of the far stick above it is a sliver, even
  // all along when the face is out of wind, a wedge when it's in wind (exaggerated a great deal).
  drawSighting(ctx, U, V, bw, H) {
    const b = this.board, w = b.wind();
    const lined = Math.abs(w.wind) < 0.12;
    const ang = lined ? 0 : clamp(Math.atan((w.wind / b.W) * 12), -0.16, 0.16);
    const cx = U + bw / 2, top = V + H * 0.5;
    const span = Math.min(bw * 0.86, 300), far = span * 0.82;
    // The far stick: pale, dark inlays at its ends, pivoting about its middle.
    ctx.save();
    ctx.translate(cx, top);
    ctx.rotate(-ang);
    ctx.fillStyle = '#e8d9b6';
    ctx.fillRect(-far / 2, -8, far, 26);
    ctx.fillStyle = '#2d211a';
    ctx.fillRect(-far / 2, -8, 14, 7);
    ctx.fillRect(far / 2 - 14, -8, 14, 7);
    ctx.restore();
    // The near stick, square to your eye, hiding all but the top of the far one.
    ctx.fillStyle = '#2d211a';
    ctx.fillRect(cx - span / 2, top - 2, span, H);
    ctx.fillStyle = 'rgba(232,217,182,.9)';
    ctx.fillRect(cx - span / 2, top - 2, 16, 4);
    ctx.fillRect(cx + span / 2 - 16, top - 2, 16, 4);
    const msg = lined ? 'Out of wind' : (w.wind > 0 ? 'In wind: the far right and near left corners are high' : 'In wind: the far left and near right corners are high');
    this.text(ctx, msg, cx, V + H * 0.78, { align: 'center', color: lined ? '#cfe3b8' : 'rgba(243,233,216,.8)' });
  }
}

// ---------- drawing a bench plane from above ----------
// Local units are millimetres, the mouth at the origin, the toe toward +x.
function drawPlaneBody(ctx, t) {
  const L = t.len, W = t.sole, h = L / 2, w = W / 2, rr = Math.min(9, W * 0.16);
  // The sole and cheeks, machined bright at the edges.
  const side = ctx.createLinearGradient(0, -w, 0, w);
  side.addColorStop(0, '#b9bec4'); side.addColorStop(0.5, '#868b91'); side.addColorStop(1, '#5d6268');
  ctx.fillStyle = side;
  roundRect(ctx, -h, -w, L, W, rr);
  ctx.fill();
  // The japanned body between the cheeks.
  const body = ctx.createLinearGradient(0, -w, 0, w);
  body.addColorStop(0, '#2a2c31'); body.addColorStop(0.35, '#16171a'); body.addColorStop(1, '#0d0e10');
  ctx.fillStyle = body;
  roundRect(ctx, -h + 3, -w + 3.2, L - 6, W - 6.4, Math.max(2, rr - 2));
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  roundRect(ctx, -h + 8, -w + 4.5, L - 16, 2.2, 1.1);
  ctx.fill();
  // The mouth in front of the iron.
  ctx.fillStyle = '#030304';
  ctx.fillRect(2, -w * 0.78, 4.5, w * 0.78 * 2);
  ctx.fillStyle = 'rgba(210,215,220,.55)';
  ctx.fillRect(1.2, -w * 0.74, 0.9, w * 0.74 * 2);
  // Frog, iron and lever cap, nickel-plated.
  const lc = Math.min(66, L * 0.22), lw = w * 0.74;
  const cap = ctx.createLinearGradient(0, -lw, 0, lw);
  cap.addColorStop(0, '#f2f3f5'); cap.addColorStop(0.4, '#c3c7cc'); cap.addColorStop(1, '#7a7f85');
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.moveTo(1, -lw);
  ctx.lineTo(-lc * 0.72, -lw);
  ctx.quadraticCurveTo(-lc, -lw, -lc, -lw * 0.45);
  ctx.lineTo(-lc, lw * 0.45);
  ctx.quadraticCurveTo(-lc, lw, -lc * 0.72, lw);
  ctx.lineTo(1, lw);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,42,46,.35)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = 'rgba(25,26,30,.6)'; // the cap's keyhole
  roundRect(ctx, -lc * 0.5, -lw * 0.2, lc * 0.24, lw * 0.4, lw * 0.12);
  ctx.fill();
  ctx.fillStyle = '#9ea3a8'; // lever
  roundRect(ctx, -lc * 0.95, -lw * 0.34, lc * 0.2, lw * 0.68, 2);
  ctx.fill();
  // Brass depth wheel behind the frog.
  const bx = -lc - 8, by = Math.min(10, w * 0.4);
  const brass = ctx.createLinearGradient(bx - 5, 0, bx + 5, 0);
  brass.addColorStop(0, '#8a6a2c'); brass.addColorStop(0.5, '#e3c27a'); brass.addColorStop(1, '#8a6a2c');
  ctx.fillStyle = brass;
  roundRect(ctx, bx - 4, -by, 8, by * 2, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(70,48,14,.55)';
  for (let k = -by + 2; k < by - 1; k += 2.2) ctx.fillRect(bx - 4, k, 8, 0.7);
  // Rosewood: the knob at the toe and the tote at the heel.
  const wood = '#5e2617', wood2 = '#9a4b2c';
  const kx = h - Math.min(52, L * 0.16), kr = Math.min(17, W * 0.29);
  let g = ctx.createRadialGradient(kx - kr * 0.35, -kr * 0.35, kr * 0.1, kx, 0, kr);
  g.addColorStop(0, wood2); g.addColorStop(1, wood);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(kx, 0, kr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.arc(kx, 0, kr * 0.28, 0, Math.PI * 2); ctx.fill();
  const tx = -h + Math.min(30, L * 0.1), tl = Math.min(92, L * 0.3), tw = Math.min(11, w * 0.42);
  g = ctx.createLinearGradient(0, -tw, 0, tw);
  g.addColorStop(0, wood2); g.addColorStop(0.5, '#7a3520'); g.addColorStop(1, wood);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(tx, -tw * 0.6);
  ctx.quadraticCurveTo(tx - tw * 0.5, 0, tx, tw * 0.6); // the horn at the back
  ctx.lineTo(tx + tl * 0.82, tw);
  ctx.quadraticCurveTo(tx + tl, 0, tx + tl * 0.82, -tw);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,220,190,.2)';
  roundRect(ctx, tx + tl * 0.12, -tw * 0.35, tl * 0.6, tw * 0.22, tw * 0.11);
  ctx.fill();
}

// The shaving rising out of the mouth: a curl that grows with every row it cuts.
function drawCurl(ctx, t, curl, now) {
  const w = Math.max(3, Math.min(curl.w, t.blade)) / 2;
  const d = clamp(4 + Math.sqrt(curl.len) * 1.6, 5, 26);
  const c = curl.color;
  ctx.save();
  ctx.translate(7 + d / 2, 0);
  const g = ctx.createLinearGradient(-d / 2, 0, d / 2, 0);
  g.addColorStop(0, `rgba(${c[0] * 0.8 | 0},${c[1] * 0.78 | 0},${c[2] * 0.72 | 0},.95)`);
  g.addColorStop(0.45, `rgba(${Math.min(255, c[0] * 1.12) | 0},${Math.min(255, c[1] * 1.1) | 0},${Math.min(255, c[2] * 1.05) | 0},.97)`);
  g.addColorStop(1, `rgba(${c[0] * 0.7 | 0},${c[1] * 0.66 | 0},${c[2] * 0.6 | 0},.95)`);
  ctx.fillStyle = g;
  roundRect(ctx, -d / 2, -w, d, w * 2, d / 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${c[0] * 0.55 | 0},${c[1] * 0.5 | 0},${c[2] * 0.45 | 0},.55)`;
  ctx.lineWidth = 0.8;
  const turns = Math.min(4, 1 + curl.len / 120);
  for (let k = 1; k <= turns; k++) {
    const x = -d / 2 + (d * k) / (turns + 1);
    ctx.beginPath(); ctx.moveTo(x, -w + 1); ctx.lineTo(x, w - 1); ctx.stroke();
  }
  ctx.restore();
}

// A loose shaving or chip lying on (or flying to) the bench. A shaving is drawn the way you'd draw
// one: a curl of pale ribbon with a darker edge, bigger and looser the longer it ran.
function drawLoose(ctx, f, u, v, rot, s) {
  const c = f.color;
  ctx.save();
  ctx.translate(u, v);
  ctx.rotate(rot);
  if (f.chip) {
    ctx.fillStyle = `rgb(${c[0] * 0.85 | 0},${c[1] * 0.8 | 0},${c[2] * 0.75 | 0})`;
    ctx.beginPath();
    ctx.moveTo(-f.len * s * 0.5, 0); ctx.lineTo(0, -f.w * s * 0.25); ctx.lineTo(f.len * s * 0.5, f.w * s * 0.08); ctx.lineTo(0, f.w * s * 0.25);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    return;
  }
  const seed = f.seed ?? (f.seed = Math.random() * 1000);
  const scale = 0.55 + s * 0.5;
  const R = clamp(5 + Math.sqrt(f.len) * 0.42, 5, 17) * scale; // outer radius of the curl
  const turns = clamp(1.1 + f.len / 300, 1.1, 2.4);
  const lw = clamp(f.w * s * 0.1, 2.2, 6) * (0.8 + 0.2 * scale); // the ribbon, seen mostly edge-on
  const tail = clamp(f.len * s * 0.02, 0, 9);
  const squash = 0.75 + (seed % 0.25);
  const path = () => {
    ctx.beginPath();
    const n = Math.round(turns * 28);
    for (let k = 0; k <= n; k++) {
      const t = k / n, a = t * turns * Math.PI * 2;
      const r = R * (0.2 + 0.8 * t);
      const x = Math.cos(a) * r, y = Math.sin(a) * r * squash;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    // the end that ran out before it curled, bending away
    const a = turns * Math.PI * 2, ex = Math.cos(a) * R, ey = Math.sin(a) * R * squash;
    ctx.quadraticCurveTo(ex + tail * 0.6, ey - tail * 0.5, ex + tail, ey - tail * 0.2);
  };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = `rgba(${c[0] * 0.55 | 0},${c[1] * 0.48 | 0},${c[2] * 0.4 | 0},.85)`;
  ctx.lineWidth = lw + 1.6;
  path(); ctx.stroke();
  ctx.strokeStyle = `rgba(${Math.min(255, c[0] * 1.08 + 10) | 0},${Math.min(255, c[1] * 1.06 + 10) | 0},${Math.min(255, c[2] * 1.02 + 6) | 0},.97)`;
  ctx.lineWidth = lw;
  path(); ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
