// Plays Out of Wind in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// On a phone: opens the first board, scribbles pencil, takes a real touch stroke with the jointer
// and checks it rode the hollow, lays the straightedge and the winding sticks, finishes the board,
// grades it and unlocks the next, keeps a board part-way through a reload, goes through the gauge
// line and starts again, and switches units. Then on a laptop and a phone on its side, and the
// checks every project wants: no errors, nothing loaded from elsewhere, nothing scrolling sideways,
// installable, and it still plays offline.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const peek = page => page.evaluate(() => window.outOfWind.peek());
const at = (page, x, y) => page.evaluate(([x, y]) => window.outOfWind.toClient(x, y), [x, y]);
const step = msg => console.log('  ' + msg);

// A real finger: touch events through Chrome's input layer, from (x0, y) to (x1, y) in board millimetres.
async function touchSwipe(page, cdp, x0, x1, y, steps = 16) {
  const a = await at(page, x0, y), b = await at(page, x1, y);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let k = 1; k <= steps; k++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function mouseDrag(page, x0, y0, x1, y1) {
  const a = await at(page, x0, y0), b = await at(page, x1, y1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

const browser = await pw.chromium.launch();
const problems = [];
const watch = (page, label) => {
  page.on('pageerror', e => problems.push(label + ': ' + e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push(label + ': ' + m.text()); });
  page.on('requestfailed', r => problems.push(label + ': failed ' + r.url()));
  page.on('request', r => { if (!r.url().startsWith(base)) problems.push(label + ': left the site ' + r.url()); });
};

try {
  // ---------- a phone ----------
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' });
  const page = await ctx.newPage();
  watch(page, 'phone');
  const cdp = await ctx.newCDPSession(page);
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);

  step('the rack: thirteen boards, only the first open');
  assert.equal(await page.locator('.plank').count(), 13);
  assert.equal(await page.getAttribute('.plank[data-no="1"]', 'aria-disabled'), null);
  assert.equal(await page.getAttribute('.plank[data-no="2"]', 'aria-disabled'), 'true');
  await page.click('.plank[data-no="2"]', { force: true }); // aria-disabled: Playwright won't tap it unless told to
  assert.ok(await page.isHidden('#bench'), 'a locked board stays shut');
  assert.equal(await page.textContent('#resumeBtn'), 'Finish No. 1 first.');
  assert.match(await page.textContent('.plank[data-no="1"]'), /No\. 1 · Pine.*Hollow · 24 × 5½ in/);

  step('board 1: the intro, then the bench');
  await page.click('.plank[data-no="1"]');
  await page.waitForSelector('#intro', { state: 'visible' });
  assert.match(await page.textContent('#introFacts'), /It has to finish at ¾″/);
  await page.click('#introGo');
  assert.ok(await page.isHidden('#intro'));
  let p = await peek(page);
  assert.equal(p.no, 1);
  assert.equal(p.strokes, 0);
  assert.equal(await page.textContent('#strokes'), '0');
  assert.match(await page.textContent('#par'), /^par \d+$/);
  assert.match(await page.textContent('#thick'), /^0\.\d{3}″$/, 'inches by default in the US');

  step('pencil, then one real stroke of the jointer down the middle');
  await page.click('#pencilBtn');
  assert.equal(await page.evaluate(() => window.outOfWind.board().pencil.every(v => v === 1)), true);
  await touchSwipe(page, cdp, -15, 625, 70);
  p = await peek(page);
  assert.equal(p.strokes, 1, 'a swipe along the board is a stroke');
  const lane = await page.evaluate(() => {
    const b = window.outOfWind.board(), j = Math.floor(70 / b.dy), cut = i => b.cut[i * b.NY + j], pen = i => b.pencil[i * b.NY + j];
    return { nearEnd: cut(1), farEnd: cut(b.NX - 2), middle: cut(b.NX >> 1), pencilMiddle: pen(b.NX >> 1), pencilEnd: pen(1) };
  });
  assert.deepEqual(lane, { nearEnd: 1, farEnd: 1, middle: 0, pencilMiddle: 1, pencilEnd: 0 }, 'it took the high ends and rode over the hollow; the pencil went where it cut');
  assert.equal(await page.textContent('#strokes'), '1');
  // A tap on the board isn't a stroke.
  const mid = await at(page, 300, 70);
  await page.touchscreen.tap(mid.x, mid.y);
  assert.equal((await peek(page)).strokes, 1);

  step('the straightedge shows light under the hollow, along and across');
  await page.click('#edgeBtn');
  p = await peek(page);
  assert.equal(p.mode, 'straightedge');
  assert.equal(p.loupe, 'straightedge');
  await mouseDrag(page, 40, 22, 560, 22); // along a lane the plane hasn't touched
  p = await peek(page);
  const along = await page.evaluate(() => { const s = window.outOfWind.scene.straight; return { x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1 }; });
  assert.ok(Math.abs(along.y0 - along.y1) < 1 && along.x1 - along.x0 > 600, 'laid the whole length along');
  assert.ok(p.straight > 0.25, 'light under it along the hollow: ' + p.straight);
  assert.match(await page.textContent('#loupeNote'), /Light under the straightedge/);
  await mouseDrag(page, 300, 8, 300, 132);
  const across = await page.evaluate(() => { const s = window.outOfWind.scene.straight; return { x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1 }; });
  assert.ok(Math.abs(across.x0 - across.x1) < 1 && across.y1 - across.y0 > 130, 'laid straight across');
  assert.equal((await peek(page)).strokes, 1, 'laying the straightedge is not a stroke');
  await page.click('[data-tool="jointer"]');
  assert.equal((await peek(page)).mode, 'plane');

  step('the winding sticks: this board is hollow but out of wind');
  await page.click('#sticksBtn');
  p = await peek(page);
  assert.equal(p.sticks, true);
  assert.equal(p.loupe, 'sticks');
  assert.match(await page.textContent('#loupeNote'), /line up: out of wind/);
  await page.click('#sticksBtn');

  step('plane it flat (the solver’s strokes through the page), and grade it');
  await page.evaluate(async () => {
    const { solve } = await import('./js/solver.js');
    const { Board } = await import('./js/board.js');
    const { BOARDS } = await import('./js/boards.js');
    const copy = new Board(BOARDS[0]);
    copy.load(window.outOfWind.board().save());
    for (const s of solve(copy).strokes) window.outOfWind.swipe(s.tool, s.x0, s.x1, s.y);
  });
  await page.waitForSelector('#result', { state: 'visible', timeout: 10000 });
  p = await peek(page);
  assert.equal(p.done, true);
  assert.equal(p.finished, true);
  assert.equal(await page.textContent('#resultTitle'), 'Flat and out of wind');
  assert.match(await page.textContent('#resultStamp'), /^(FAS|Select|No\. 1|No\. 2)$/);
  assert.equal(await page.locator('#resultMarks li').count(), 4);
  assert.equal(await page.textContent('#nextBtn'), 'Next: No. 2');
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('out-of-wind.v1')));
  assert.ok(kept.best[1] && kept.best[1].marks >= 1, 'the grade is kept');

  step('next board, then keep it part-way through a reload');
  await page.click('#nextBtn');
  await page.waitForSelector('#intro', { state: 'visible' });
  await page.click('#introGo');
  assert.equal((await peek(page)).no, 2);
  await touchSwipe(page, cdp, -15, 780, 30);
  await touchSwipe(page, cdp, -15, 780, 122);
  const before = await peek(page);
  assert.equal(before.strokes, 2);
  await page.reload();
  await page.waitForFunction(() => window.outOfWind && window.outOfWind.peek());
  assert.ok(await page.isHidden('#intro'), 'a board part-way through opens straight onto the bench');
  const after = await peek(page);
  assert.equal(after.no, 2);
  assert.equal(after.strokes, 2);
  assert.equal(after.rough, before.rough);
  assert.ok(Math.abs(after.thick - before.thick) < 0.002);
  await page.click('#backBtn');
  await page.waitForSelector('#home', { state: 'visible' });
  assert.equal(await page.textContent('#resumeBtn'), 'Back to No. 2 · Pine');
  assert.match(await page.textContent('.plank[data-no="1"] .grade'), /^(FAS|Select|No\. 1|No\. 2)$/);
  await page.click('#resumeBtn');
  assert.equal((await peek(page)).strokes, 2);

  step('through the gauge line: culled, and started again');
  await page.evaluate(() => {
    const b = window.outOfWind.board();
    for (let pass = 0; pass < 12 && !window.outOfWind.peek().failed; pass++) {
      for (const y of [20, 50, 80, 110, 135]) window.outOfWind.swipe('jack', -200, b.L + 200, y);
    }
  });
  await page.waitForSelector('#result', { state: 'visible', timeout: 10000 });
  p = await peek(page);
  assert.equal(p.failed, true);
  assert.equal(await page.textContent('#resultStamp'), 'Cull');
  assert.equal(await page.textContent('#resultTitle'), 'Too thin for the tabletop');
  assert.ok(await page.isHidden('#nextBtn'));
  await page.click('#againBtn');
  p = await peek(page);
  assert.equal(p.failed, false);
  assert.equal(p.strokes, 0);
  assert.equal(p.rough, await page.evaluate(() => window.outOfWind.board().NX * window.outOfWind.board().NY));

  step('millimetres from the menu, remembered');
  await page.click('#introGo');
  await page.click('#menuBtn');
  await page.click('#menuUnitBtn');
  await page.click('#menuClose');
  assert.match(await page.textContent('#thick'), /^\d\d\.\d\d mm$/);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('out-of-wind.v1')).unit), 'mm');
  await page.click('#menuBtn');
  await page.click('#menuSoundBtn');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('out-of-wind.v1')).sound), false);
  await page.click('#menuClose');

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the bench scrolls sideways on a phone');
  await page.click('#backBtn');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the rack scrolls sideways on a phone');

  step('installable');
  const install = await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(install.installabilityErrors, [], 'installability errors');
  const manifest = await cdp.send('Page.getAppManifest');
  assert.deepEqual(manifest.errors, []);
  assert.match(manifest.data, /"name": "Out of Wind"/);

  step('offline: once opened, it plays with no network');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  await ctx.setOffline(true);
  await page.goto(base + '#1');
  await page.reload();
  await page.waitForFunction(() => window.outOfWind && window.outOfWind.peek(), null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  if (await page.isVisible('#intro')) await page.click('#introGo');
  const off0 = (await peek(page)).strokes;
  await touchSwipe(page, cdp, -15, 625, 40);
  assert.equal((await peek(page)).strokes, off0 + 1, 'plays offline');
  await ctx.setOffline(false);
  await ctx.close();

  // ---------- a laptop, and a phone on its side ----------
  for (const [label, viewport] of [['laptop', { width: 1280, height: 800 }], ['sideways', { width: 844, height: 390 }]]) {
    const c = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: label !== 'laptop', isMobile: label !== 'laptop', locale: 'en-GB' });
    const pg = await c.newPage();
    watch(pg, label);
    await pg.goto(base + '#1');
    await pg.evaluate(() => document.fonts.ready);
    await pg.click('#introGo');
    assert.match(await pg.textContent('#thick'), /mm$/, 'millimetres outside the US');
    await mouseDrag(pg, -15, 70, 625, 70);
    assert.equal((await peek(pg)).strokes, 1, label + ': a mouse stroke counts');
    const box = await pg.locator('.tray').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 0.5 && box.y + box.height <= viewport.height + 0.5, label + ': the tools fit');
    assert.equal(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, label + ': no sideways scrolling');
    await c.close();
  }

  assert.deepEqual(problems, [], 'no errors, and nothing loaded from anywhere else');
  console.log('out-of-wind e2e: all passed');
} finally {
  await browser.close();
  server.close();
}
