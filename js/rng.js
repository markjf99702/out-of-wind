// Seeded randomness, so a board comes out the same every time and the tests can replay a game.

// mulberry32: a small, fast generator with a 32-bit state. Returns a function giving [0, 1).
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.state = () => a;
  next.set = s => { a = s | 0; };
  return next;
}

// Smooth value noise on a lattice: a field that wanders gently, made from a seed.
// cell is the lattice spacing in the same units as x and y.
export function noise2(seed, cell) {
  const h = (i, j) => {
    let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 2246822519)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (((n ^ (n >>> 16)) >>> 0) / 4294967296) * 2 - 1;
  };
  const s = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell;
    const i = Math.floor(fx), j = Math.floor(fy);
    const u = s(fx - i), v = s(fy - j);
    const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
