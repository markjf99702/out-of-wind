// Works out each board's rough thickness (t0), par and best finish by letting the solver plane it:
//   node scripts/par.mjs            prints the table
//   node scripts/par.mjs --write    also writes the numbers into js/boards.js
//   node scripts/par.mjs 3 7        only boards 3 and 7
// The solver's choices don't depend on how thick the board starts, so one run per board is enough:
// t0 is set so the solver finishes `spare` millimetres above the tabletop's three-quarters.
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Board, TABLETOP } from '../js/board.js';
import { BOARDS } from '../js/boards.js';
import { solve } from '../js/solver.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const only = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const results = [];

for (const def of BOARDS) {
  if (only.length && !only.includes(def.no)) continue;
  const t = performance.now();
  const board = new Board({ ...def, t0: 22 });
  const r = solve(board);
  if (!r.done) console.log(`board ${def.no}: the solver didn't finish (flat ${r.flat.toFixed(3)})`);
  const t0 = +(22 + TABLETOP + def.spare - r.thinnest).toFixed(2);
  const best = +(TABLETOP + def.spare).toFixed(2);
  const tools = r.strokes.slice(0, r.par).reduce((m, s) => ((m[s.tool] = (m[s.tool] || 0) + 1), m), {});
  results.push({ no: def.no, t0, par: r.par, best });
  console.log(`No. ${String(def.no).padStart(2)}  t0 ${t0.toFixed(2)}  par ${String(r.par).padStart(3)}  best ${best.toFixed(2)}  `
    + `(${Object.entries(tools).map(([k, v]) => k + ' ' + v).join(', ')}; tear-out left ${r.torn}; ${Math.round(performance.now() - t)} ms)`);
}

if (write) {
  const file = join(root, 'js/boards.js');
  let src = await readFile(file, 'utf8');
  for (const { no, t0, par, best } of results) {
    const re = new RegExp(`(no: ${no}, [\\s\\S]*?)t0: [\\d.]+, par: \\d+, best: [\\d.]+`);
    if (!re.test(src)) throw new Error('could not find board ' + no);
    src = src.replace(re, `$1t0: ${t0}, par: ${par}, best: ${best}`);
  }
  await writeFile(file, src);
  console.log('wrote js/boards.js');
}
