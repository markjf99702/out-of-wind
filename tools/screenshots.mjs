// Renders the README screenshots (docs/phone-*.png) and the link preview (og.png):  node tools/screenshots.mjs
// Math.random is seeded, so the same pictures come out every time.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const UPNG = require('upng-js'); // a dev dependency: npm install
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
const SEED = 4;
const browser = await pw.chromium.launch();
await mkdir(join(root, 'docs'), { recursive: true });

// Someone a few boards in: graded on the first ones, every first-time note already seen.
const grade = (marks, strokes, thick) => ({ marks, strokes, thick, torn: 0, flat: 0.12 });
const played = upTo => ({
  v: 1, unit: 'in', sound: true, tool: 'jointer', attempts: {}, benches: {},
  best: Object.fromEntries([grade(4, 24, 20.21), grade(3, 34, 19.9), grade(4, 31, 19.92), grade(2, 47, 19.6), grade(4, 58, 19.8), grade(3, 50, 19.7)].slice(0, upTo).map((g, k) => [k + 1, g])),
  seen: { swipe: 1, pencil: 1, edge: 1, tear: 1, c1a: 1, c1b: 1, edges: 1, c3: 1 },
});

async function open(viewport, deviceScaleFactor, state, touch = true) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: touch, isMobile: touch, locale: 'en-US', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(([seed, saved]) => {
    let a = seed; // mulberry32
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    if (saved && !sessionStorage.getItem('seeded')) { localStorage.setItem('out-of-wind.v1', JSON.stringify(saved)); sessionStorage.setItem('seeded', '1'); }
  }, [SEED, state]);
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const settle = (page, ms = 900) => page.waitForTimeout(ms);
// Saved with a 256-colour palette: a fraction of the size, and the wood still looks like wood.
async function save(page, file) {
  const img = UPNG.decode(await page.screenshot());
  await writeFile(join(root, file), Buffer.from(UPNG.encode([UPNG.toRGBA8(img)[0]], img.width, img.height, 256)));
}
const toClient = (page, x, y) => page.evaluate(([x, y]) => window.outOfWind.toClient(x, y), [x, y]);

// Opens a board on the bench, scribbles pencil and planes a few lanes, then puts a finger down and
// pushes the plane partway along, so the shot catches a shaving in the mouth.
async function midStroke(page, no, lanes, stroke) {
  await page.evaluate(n => { location.hash = '#' + n; }, no);
  await page.waitForSelector('#intro', { state: 'visible' });
  await page.click('#introGo');
  await settle(page, 300);
  await page.click('#pencilBtn');
  await settle(page, 800);
  await page.evaluate(ls => { const b = window.outOfWind.board(); for (const [y, x0, x1] of ls) window.outOfWind.swipe('jointer', x0 ?? -60, x1 ?? b.L + 60, y); }, lanes);
  await settle(page, 900);
  await page.evaluate(() => document.getElementById('toast').classList.remove('on')); // a picture of the bench, not of a note
  const [y, x0, x1] = stroke;
  const a = await toClient(page, x0, y), z = await toClient(page, x1, y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(z.x, z.y, { steps: 18 });
  await settle(page, 250);
}

// ---------- phone screenshots for the README ----------
{
  const page = await open({ width: 390, height: 844 }, 2, played(4));
  await settle(page, 1200); // the planks paint a board at a time
  await save(page, 'docs/phone-rack.png');
  await page.context().close();
}
{
  const page = await open({ width: 390, height: 844 }, 2, played(6), false);
  await midStroke(page, 7, [[30], [75], [120]], [150, -40, 420]);
  await save(page, 'docs/phone-planing.png');
  await page.context().close();
}
{
  const page = await open({ width: 390, height: 844 }, 2, played(2));
  await page.evaluate(() => { location.hash = '#3'; });
  await page.waitForSelector('#intro', { state: 'visible' });
  await page.click('#introGo');
  await page.evaluate(() => { const b = window.outOfWind.board(); for (const y of [24, 66, 108, 141]) window.outOfWind.swipe('jointer', -60, b.L + 60, y); });
  await page.click('#sticksBtn');
  await settle(page, 1500);
  await save(page, 'docs/phone-sticks.png');
  await page.context().close();
}

// ---------- the link preview, 1200 x 630 ----------
// A card: the name and one line on the left, and the bench on the right, mid-stroke on the cherry board.
{
  const page = await open({ width: 700, height: 630 }, 2, played(6), false);
  // The card shows the side view's top, but not the start of its label, which the fade would cut off.
  await page.evaluate(() => {
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) { if (!/^UNDER THE/.test(text)) fill.call(this, text, ...rest); };
  });
  await midStroke(page, 7, [[30], [75], [120], [165]], [100, -40, 470]);
  const bench = await page.evaluate(() => document.getElementById('cv').toDataURL('image/png'));
  await page.context().close();
  const font = async f => 'data:font/woff2;base64,' + (await readFile(join(root, 'fonts', f))).toString('base64');
  const card = await open({ width: 1200, height: 630 }, 1, null, false);
  await card.setContent(`<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family: "Young Serif"; src: url(${await font('young-serif.woff2')}); }
    @font-face { font-family: "Alegreya Sans"; src: url(${await font('alegreya-sans-400.woff2')}); }
    @font-face { font-family: "Reenie Beanie"; src: url(${await font('reenie-beanie.woff2')}); }
    html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #1d1712; }
    .words { position: absolute; left: 64px; top: 0; bottom: 0; width: 440px; display: flex; flex-direction: column; justify-content: center; color: #f3e9d8; }
    h1 { margin: 0; font: 400 78px/0.98 "Young Serif", Georgia, serif; letter-spacing: -0.01em; }
    p { margin: 22px 0 0; font: 400 31px/1.3 "Alegreya Sans", sans-serif; color: rgba(243, 233, 216, .78); }
    .stamp { margin-top: 26px; font: 400 54px/1 "Reenie Beanie", cursive; color: #e0533a; transform: rotate(-7deg); transform-origin: left; }
    /* The bench, closer in: the shavings, the board with the plane on it, and the top of the side view. */
    .bench { position: absolute; right: 0; top: 0; width: 720px; height: 630px; background: url(${bench}) no-repeat; background-size: 950px auto; background-position: -175px -50px;
      -webkit-mask-image: linear-gradient(to right, transparent 0, transparent 40px, #000 190px); mask-image: linear-gradient(to right, transparent 0, transparent 40px, #000 190px); }
  </style><div class="bench"></div><div class="words"><h1>Out of Wind</h1><p>Flatten rough boards<br>with hand planes.</p><div class="stamp">FAS</div></div>`);
  await card.evaluate(() => document.fonts.ready);
  await save(card, 'og.png');
  await card.context().close();
}

await browser.close();
server.close();
console.log('screenshots written');
