// Plays Out of Wind in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// On a phone: a locked board says which to finish first, by the plank you tapped; the first board
// shows a stroke starting on the board; pencil, then a real touch stroke with the jointer that rides
// the hollow; strokes that cut nothing are free and say why; the straightedge and the winding sticks
// say what they see; the board is finished, graded (with no stale note left up) and unlocks the next;
// a board keeps part-way through a reload; tear-out shows in the top bar; it goes through the gauge
// line and starts again; a finished board opens fresh to plane again; units; and on a crowned board
// planed the obvious way, the bench says what shape is left, again on a second attempt. Then on a
// laptop and a phone on its side, and the checks every project wants: no errors, nothing loaded from
// elsewhere, nothing scrolling sideways, installable, and it still plays offline.
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

  step('the rack: thirteen boards, only the first open, the rest locked');
  assert.equal(await page.locator('.plank').count(), 13);
  assert.equal(await page.getAttribute('.plank[data-no="1"]', 'aria-disabled'), null);
  assert.equal(await page.getAttribute('.plank[data-no="2"]', 'aria-disabled'), 'true');
  assert.equal(await page.locator('.plank .lock').count(), 12, 'a lock on each locked plank');
  await page.click('.plank[data-no="2"]', { force: true }); // aria-disabled: Playwright won't tap it unless told to
  assert.ok(await page.isHidden('#bench'), 'a locked board stays shut');
  assert.equal(await page.textContent('li:has(> .plank[data-no="2"]) .plank-note'), 'Finish No. 1 first.', 'said by the plank tapped');
  assert.ok(await page.isHidden('#resumeBtn'), 'and not in the resume button');
  // Two quick taps: one note, by the second plank, and nothing left behind.
  await page.click('.plank[data-no="3"]', { force: true });
  await page.click('.plank[data-no="4"]', { force: true });
  assert.equal(await page.locator('.plank-note').count(), 1);
  assert.equal(await page.textContent('li:has(> .plank[data-no="4"]) .plank-note'), 'Finish No. 1 first.');
  await page.waitForSelector('.plank-note', { state: 'detached', timeout: 4000 });
  assert.ok(await page.isHidden('#resumeBtn'));
  // Scrolled down to the last boards, the note shows where you tapped.
  await page.locator('.plank[data-no="12"]').scrollIntoViewIfNeeded();
  await page.click('.plank[data-no="12"]', { force: true });
  const note = await page.locator('.plank-note').boundingBox();
  assert.ok(note && note.y > 0 && note.y + note.height < 844, 'the note is on screen: ' + JSON.stringify(note));
  await page.evaluate(() => scrollTo(0, 0));
  assert.match(await page.textContent('.plank[data-no="1"]'), /No\. 1 · Pine.*Hollow · 24 × 5 in/);

  step('board 1: the intro, then the bench');
  await page.click('.plank[data-no="1"]');
  await page.waitForSelector('#intro', { state: 'visible' });
  assert.match(await page.textContent('#introFacts'), /Finish¾″ at the least/);
  assert.match(await page.textContent('#introFacts'), /Keep0\.\d{3}″ or more/);
  await page.click('#introGo');
  assert.ok(await page.isHidden('#intro'));
  assert.equal(await page.textContent('#toast'), 'Swipe along the board, end to end, to take a stroke.', 'the first board shows what a stroke is');
  const ghost = await page.evaluate(() => window.outOfWind.scene.ghost);
  assert.ok(ghost, 'a faint plane shows a stroke');
  // The demonstration runs from just off the near end to just off the far end, starting where a finger
  // can: on the bench, above the tool tray.
  const ghostStart = await at(page, ghost.x0, ghost.y), nearEnd = await at(page, 0, ghost.y), tray = await page.locator('.tray').boundingBox();
  assert.ok(ghost.x0 < 0 && ghost.x1 > 610, 'off both ends: ' + ghost.x0 + '..' + ghost.x1);
  assert.ok(ghostStart.y > nearEnd.y + 8, 'it starts off the near end');
  assert.ok(ghostStart.y < tray.y - 6, `the ghost starts on the bench (${Math.round(ghostStart.y)}), not under the tray (${Math.round(tray.y)})`);
  await page.waitForTimeout(3600);
  assert.ok(await page.evaluate(() => !!window.outOfWind.scene.ghost), 'and shows it again until you take a stroke');
  let p = await peek(page);
  assert.equal(p.no, 1);
  assert.equal(p.strokes, 0);
  assert.equal(await page.textContent('#strokes'), '0');
  assert.match(await page.textContent('#par'), /^par \d+$/);
  assert.match(await page.textContent('#thick'), /^0\.\d{3}″$/, 'inches by default in the US');
  assert.match(await page.textContent('#line'), /^keep 0\.\d{3}″$/, 'the thickness mark shows while planing');
  assert.equal(await page.textContent('#torn'), '0', 'and the tear-out count');
  assert.equal(await page.textContent('#flatSub'), 'rough 100%');

  step('pencil, then one real stroke of the jointer down the middle');
  await page.click('#pencilBtn');
  assert.equal(await page.evaluate(() => window.outOfWind.board().pencil.every(v => v === 1)), true);
  await touchSwipe(page, cdp, -15, 625, 64);
  p = await peek(page);
  assert.equal(p.strokes, 1, 'a swipe along the board is a stroke');
  assert.equal(await page.evaluate(() => window.outOfWind.scene.ghost), null, 'and the demonstration stops');
  // How much of each stretch of that lane got cut, and how much pencil is left there.
  const lane = await page.evaluate(() => {
    const b = window.outOfWind.board(), j = Math.floor(64 / b.dy), n = Math.round(b.NX * 0.12);
    const share = (arr, a, z) => { let c = 0; for (let i = a; i < z; i++) c += arr[i * b.NY + j]; return c / (z - a); };
    const mid = (b.NX - n) >> 1;
    return { nearEnd: share(b.cut, 0, n), farEnd: share(b.cut, b.NX - n, b.NX), middle: share(b.cut, mid, mid + n), pencilMiddle: share(b.pencil, mid, mid + n), pencilEnds: (share(b.pencil, 0, n) + share(b.pencil, b.NX - n, b.NX)) / 2 };
  });
  assert.ok(lane.nearEnd + lane.farEnd > 0.5, 'it took the high ends: ' + JSON.stringify(lane));
  assert.equal(lane.middle, 0, 'and rode over the hollow');
  assert.ok(lane.pencilMiddle === 1 && lane.pencilEnds < 0.8, 'the pencil went where it cut');
  assert.equal(await page.textContent('#strokes'), '1');
  // A tap on the board isn't a stroke.
  const mid = await at(page, 300, 70);
  await page.touchscreen.tap(mid.x, mid.y);
  assert.equal((await peek(page)).strokes, 1);

  step('a stroke that cuts nothing is free, and every one says so');
  await touchSwipe(page, cdp, 250, 360, 100); // the middle of a hollow: the jointer rides over it
  assert.equal((await peek(page)).strokes, 1, 'not counted');
  assert.equal(await page.textContent('#toast'), 'No shaving: the middle of this board is low, so the plane rode over it. Go end to end.');
  await touchSwipe(page, cdp, 260, 350, 30);
  assert.equal((await peek(page)).strokes, 1);
  assert.equal(await page.textContent('#toast'), 'No shaving there. That one doesn’t count.', 'the second one says so too');
  // A swipe across the board isn't a stroke, and says which way to go.
  {
    const a = await at(page, 300, 10), z = await at(page, 300, 118);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
    for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((z.x - a.x) * k) / 8, y: a.y + ((z.y - a.y) * k) / 8 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  assert.equal((await peek(page)).strokes, 1);
  assert.match(await page.textContent('#toast'), /^Plane along the board, from end to end/);

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
  assert.match(await page.textContent('#loupeNote'), /^Light in the middle, 0\.\d{3}″ at most: hollow here\./, 'it says what it sees');
  assert.match(await page.textContent('#toast'), /^Light in the middle/, 'out loud, too');
  await mouseDrag(page, 300, 8, 300, 118);
  const across = await page.evaluate(() => { const s = window.outOfWind.scene.straight; return { x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1, W: window.outOfWind.board().W }; });
  assert.ok(Math.abs(across.x0 - across.x1) < 1 && across.y1 - across.y0 > across.W - 3, 'laid straight across');
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
  const finish = await page.evaluate(async () => {
    const { solve } = await import('./js/solver.js');
    const { Board } = await import('./js/board.js');
    const { BOARDS } = await import('./js/boards.js');
    const copy = new Board(BOARDS[0]);
    copy.load(window.outOfWind.board().save());
    const t = document.getElementById('toast');
    for (const s of solve(copy).strokes) {
      window.outOfWind.toast('A note from the stroke before.'); // whatever was up when the last stroke went in
      window.outOfWind.swipe(s.tool, s.x0, s.x1, s.y);
      if (window.outOfWind.peek().done) return { up: t.classList.contains('on'), text: t.textContent };
    }
    return null;
  });
  assert.ok(finish, 'the solver’s strokes finish it');
  assert.equal(finish.up, false, 'nothing old is left up when it’s done: ' + finish.text);
  // A stroke taken in rhythm, while the face lights up and before the card, isn't planed.
  const finishedAt = await peek(page);
  assert.equal(finishedAt.settling, true, 'the card is on its way');
  await touchSwipe(page, cdp, -15, 625, 40);
  assert.equal((await peek(page)).strokes, finishedAt.strokes, 'no stroke while the card is on its way');
  await page.waitForSelector('#result', { state: 'visible', timeout: 10000 });
  p = await peek(page);
  assert.equal(p.done, true);
  assert.equal(p.finished, true);
  assert.equal(p.strokes, finishedAt.strokes);
  assert.match(await page.textContent('#resultMarks'), new RegExp(`${p.strokes} of ${p.par}`), 'the card counts the strokes the bench does');
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

  step('tear-out shows in the top bar as it happens');
  await page.evaluate(() => { const b = window.outOfWind.board(); for (const y of [40, 75, 110]) window.outOfWind.swipe('jack', b.L + 200, -200, y); });
  const torn = +(await page.textContent('#torn'));
  assert.ok(torn > 0, 'against the grain it tears: ' + torn);
  assert.equal(torn, (await peek(page)).torn);
  assert.ok(await page.evaluate(() => document.getElementById('torn').parentElement.classList.contains('warn')), 'amber, the mark gone');

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

  step('a finished board opens fresh, ready to plane again');
  await page.click('#introGo');
  await page.click('#backBtn');
  await page.waitForSelector('#home', { state: 'visible' });
  await page.click('.plank[data-no="1"]');
  await page.waitForSelector('#intro', { state: 'visible' });
  assert.equal(await page.textContent('#introGo'), 'Plane it again');
  assert.match(await page.textContent('#introFacts'), /Best(FAS|Select|No\. 1 Common|No\. 2 Common), \d+ strokes/);
  p = await peek(page);
  assert.equal(p.no, 1);
  assert.equal(p.strokes, 0);
  assert.equal(p.finished, false);
  assert.equal(p.rough, await page.evaluate(() => window.outOfWind.board().NX * window.outOfWind.board().NY), 'rough from the mill again');
  await page.click('#introGo');
  await page.click('#backBtn');
  await page.click('.plank[data-no="2"]');

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

  step('stuck on a crowned board, the bench says what shape is left, and again on the next attempt');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('out-of-wind.v1'));
    for (const n of [2, 3]) s.best[n] = { marks: 1, strokes: 99, thick: 19.2, torn: 0, flat: 0.1 };
    localStorage.setItem('out-of-wind.v1', JSON.stringify(s));
  });
  await page.reload(); // so the page reads what was just put there
  await page.goto(base + '#4');
  await page.waitForSelector('#intro', { state: 'visible' });
  await page.click('#introGo');
  const fullPasses = () => page.evaluate(() => {
    const b = window.outOfWind.board(), t = document.getElementById('toast'), seen = [];
    for (let pass = 0; pass < 8 && !window.outOfWind.peek().failed; pass++) for (const y of [22, 67, 112, b.W - 22]) {
      window.outOfWind.swipe('jointer', -40, b.L + 40, y); // full passes: they just follow a crown down
      if (t.classList.contains('on') && seen[seen.length - 1] !== t.textContent) seen.push(t.textContent);
    }
    return seen;
  });
  // A straightedge along it rocks on the crown, and says so.
  await page.click('#edgeBtn');
  await mouseDrag(page, 30, 24, 780, 24);
  assert.match(await page.textContent('#toast'), /^It rocks on a high spot in the middle, with 0\.\d{2} mm of light either side\. Plane where it touches, with short strokes\.$/);
  await page.click('[data-tool="jointer"]');
  let said = await fullPasses();
  assert.ok(said.some(x => /^Still crowned\. /.test(x)), 'said: ' + said.join(' | '));
  await page.click('#menuBtn');
  await page.click('#restartBtn');
  await page.click('#introGo');
  said = await fullPasses();
  assert.ok(said.some(x => /^Still crowned\. /.test(x)), 'said again after starting over: ' + said.join(' | '));

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

  // ---------- a finger that never quite reaches the ends ----------
  {
    step('board 1, swiped lane by lane from 8 px onto the board to 8 px short of the far end, finishes within par');
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' });
    const pg = await c.newPage();
    watch(pg, 'finger');
    const cd = await c.newCDPSession(pg);
    await pg.goto(base + '#1');
    await pg.click('#introGo');
    const { L, s } = await pg.evaluate(() => ({ L: window.outOfWind.board().L, s: window.outOfWind.scene.s }));
    const inset = 8 / s; // 8 CSS pixels, in millimetres
    let n = 0;
    for (let k = 0; k < 60 && !(await peek(pg)).done; k++) {
      await touchSwipe(pg, cd, inset, L - inset, [24, 52, 80, 103][k % 4], 12);
      n++;
    }
    const q = await peek(pg);
    assert.equal(q.done, true, `not flat after ${n} swipes: ${JSON.stringify(q)}`);
    assert.ok(q.strokes <= q.par, `${q.strokes} strokes, over par ${q.par}`);
    await c.close();
  }

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
