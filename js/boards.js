// The twelve boards and the glued-up panel. Each comes rough from the sawmill with its own warp,
// grain and knots, made from its seed, and has to finish at three-quarters of an inch for the
// tabletop. Sizes are in millimetres.
//   bow: ends high (+) or middle high (-); cup: edges high (+) or middle high (-);
//   twist: one pair of opposite corners high; humps: [x, y as fractions, spread x, spread y mm, height];
//   flips: where the grain turns around [x as a fraction, slant]; knots: [x, y as fractions, radius mm];
//   curl / ribbon: the wavelength of curly or interlocked figure (mm).
// t0 (the rough thickness) and par come from the solver: `npm run par` works them out and checks
// them. spare is how much thicker than the solver's result each board starts.

export const BOARDS = [
  {
    no: 1, wood: 'pine', L: 610, W: 140, seed: 101, bow: 0.42, rough: 0.2, spare: 1.2,
    title: 'Hollow', t0: 20.93, par: 20, best: 20.25,
    note: 'The ends stand high. Scribble pencil across it, then take long strokes with the jointer: it rides on the ends and cuts them down until it reaches the middle.',
  },
  {
    no: 2, wood: 'pine', L: 762, W: 152, seed: 202, cup: 0.42, rough: 0.2, knots: [[0.7, 0.3, 9]], spare: 1,
    title: 'Cupped', t0: 20.78, par: 24, best: 20.05,
    note: 'Cupped: the edges stand high. Lay the straightedge across it to see the hollow, then plane down the edges, letting the plane hang a little off each side.',
  },
  {
    no: 3, wood: 'poplar', L: 762, W: 165, seed: 303, twist: 0.42, rough: 0.2, spare: 0.9,
    title: 'In wind', t0: 20.73, par: 26, best: 19.95,
    note: 'Twisted, or in wind: two opposite corners stand high. Sight down the winding sticks, then take the high corners down with the jack.',
  },
  {
    no: 4, wood: 'poplar', L: 813, W: 178, seed: 404, bow: -0.45, humps: [[0.62, 0.35, 70, 40, 0.3]], rough: 0.22, spare: 0.8,
    title: 'Crowned', t0: 20.4, par: 27, best: 19.85,
    note: 'High in the middle, with a hump on top. The jack takes the hump down fast, but stop before you dig a dip.',
  },
  {
    no: 5, wood: 'ash', L: 762, W: 152, seed: 505, cup: 0.25, bow: 0.2, flips: [[0.55, 0.25]], rough: 0.22, spare: 0.8,
    title: 'Turning grain', t0: 20.46, par: 39, best: 19.85,
    note: 'Partway along, the grain turns around. Read the edge: plane each end the way its grain runs downhill, or it will tear.',
  },
  {
    no: 6, wood: 'redoak', L: 838, W: 165, seed: 606, twist: 0.35, cup: 0.22, rough: 0.25, flips: [[0.3, -0.2]], spare: 0.7,
    title: 'Wind and cup', t0: 20.51, par: 65, best: 19.75,
  },
  {
    no: 7, wood: 'cherry', L: 762, W: 178, seed: 707, bow: -0.3, humps: [[0.3, 0.6, 60, 45, 0.25]], knots: [[0.3, 0.62, 11]], rough: 0.22, spare: 0.6,
    title: 'A knot', t0: 20.48, par: 42, best: 19.65,
  },
  {
    no: 8, wood: 'walnut', L: 838, W: 190, seed: 808, twist: 0.4, bow: 0.3, rough: 0.25, spare: 0.6,
    title: 'Bowed and in wind', t0: 20.47, par: 28, best: 19.65,
  },
  {
    no: 9, wood: 'mahogany', L: 762, W: 165, seed: 909, cup: 0.25, twist: 0.15, ribbon: 46, rough: 0.22, spare: 0.6,
    title: 'Interlocked', t0: 20.41, par: 62, best: 19.65,
  },
  {
    no: 10, wood: 'whiteoak', L: 762, W: 165, seed: 1010, bow: 0.35, twist: 0.25, flips: [[0.42, 0.35]], rough: 0.25, spare: 0.5,
    title: 'Quartersawn', t0: 20.39, par: 47, best: 19.55,
  },
  {
    no: 11, wood: 'maple', L: 838, W: 178, seed: 1111, twist: 0.4, cup: -0.25, flips: [[0.6, -0.4]], knots: [[0.25, 0.4, 8]], rough: 0.22, spare: 0.5,
    title: 'Hard maple', t0: 20.5, par: 76, best: 19.55,
  },
  {
    no: 12, wood: 'curly', L: 762, W: 165, seed: 1212, cup: 0.25, bow: 0.22, curl: 52, rough: 0.22, spare: 0.5,
    title: 'Curly', t0: 20.56, par: 71, best: 19.55,
  },
  {
    no: 13, panel: true, L: 762, seed: 1313, twist: 0.3, rough: 0.22, spare: 0.7,
    strips: [
      { w: 152, wood: 'walnut', grain: 1, cup: 0.2, step: 0 },
      { w: 152, wood: 'maple', grain: -1, cup: -0.15, step: 0.18 },
      { w: 152, wood: 'cherry', grain: 1, cup: 0.2, step: -0.1 },
    ],
    title: 'The tabletop', t0: 20.72, par: 80, best: 19.75,
    note: 'Three boards glued up into the top itself, with the middle one turned end for end and standing a little proud.',
  },
];

// A board's name as the page shows it: "No. 7 · Cherry".
export function boardName(b, woods) {
  return 'No. ' + b.no + ' · ' + (b.panel ? 'Walnut, maple and cherry' : woods[b.wood].name);
}
