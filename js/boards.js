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
    no: 1, wood: 'pine', L: 610, W: 127, seed: 101, bow: 0.28, rough: 0.12, spare: 1.2,
    title: 'Hollow', t0: 20.75, par: 21, best: 20.25,
    note: 'The ends stand high. Scribble pencil across it, then take long strokes with the jointer: it rides on the ends and cuts them down until it reaches the middle.',
  },
  {
    no: 2, wood: 'pine', L: 762, W: 152, seed: 202, cup: 0.34, rough: 0.12, knots: [[0.7, 0.3, 9]], spare: 1,
    title: 'Cupped', t0: 20.56, par: 23, best: 20.05,
    note: 'Cupped: the edges stand high. Lay the straightedge across it to see the hollow, then plane down the edges, letting the plane hang a little off each side.',
  },
  {
    no: 3, wood: 'poplar', L: 762, W: 165, seed: 303, twist: 0.3, rough: 0.12, spare: 0.9,
    title: 'In wind', t0: 20.52, par: 28, best: 19.95,
    note: 'Twisted, or in wind: two opposite corners stand high, and long strokes straight down the board won’t touch that. Sight down the winding sticks to find the high corners, plane those (short strokes, or from one high corner diagonally to the other) until the sticks line up, then take full-length passes.',
  },
  {
    no: 4, wood: 'poplar', L: 813, W: 178, seed: 404, bow: -0.32, humps: [[0.62, 0.35, 70, 40, 0.22]], rough: 0.12, spare: 0.8,
    title: 'Crowned', t0: 20.29, par: 31, best: 19.85,
    note: 'High in the middle, with a hump on top. Full-length strokes just follow a crown down, so take short strokes on the high middle and leave the ends alone until the straightedge stops rocking. The jack takes the hump down fast; stop before you dig a dip.',
  },
  {
    no: 5, wood: 'ash', L: 762, W: 152, seed: 505, cup: 0.2, bow: 0.16, flips: [[0.55, 0.25]], rough: 0.12, spare: 0.8,
    title: 'Turning grain', t0: 20.37, par: 48, best: 19.85,
    note: 'Partway along, the grain turns around. Read the edge: plane each end the way its grain runs downhill, or it will tear.',
  },
  {
    no: 6, wood: 'redoak', L: 838, W: 165, seed: 606, twist: 0.24, cup: 0.15, rough: 0.12, flips: [[0.3, -0.2]], spare: 0.7,
    title: 'Wind and cup', t0: 20.33, par: 57, best: 19.75,
    note: 'In wind and cupped, with the grain turning around near the near end. Oak’s open pores tear if you plane against it, so read the edge and take each end its own way.',
  },
  {
    no: 7, wood: 'cherry', L: 762, W: 178, seed: 707, bow: -0.21, humps: [[0.3, 0.6, 60, 45, 0.17]], knots: [[0.3, 0.62, 11]], rough: 0.12, spare: 0.6,
    title: 'A knot', t0: 20.19, par: 50, best: 19.65,
    note: 'High in the middle, with a hump around a knot toward the near end. The grain swirls round a knot and tears whichever way you go, so take the knot down with the smoother.',
  },
  {
    no: 8, wood: 'walnut', L: 838, W: 190, seed: 808, twist: 0.28, bow: 0.21, knots: [[0.45, 0.68, 10]], rough: 0.12, spare: 0.6,
    title: 'Bowed and in wind', t0: 20.29, par: 41, best: 19.65,
    note: 'Bowed with the ends high, and in wind. Sight down the sticks first, then let the jointer bring the ends down. There’s a knot just short of the middle.',
  },
  {
    no: 9, wood: 'mahogany', L: 762, W: 165, seed: 909, cup: 0.17, twist: 0.1, ribbon: 46, rough: 0.12, spare: 0.6,
    title: 'Interlocked', t0: 20.21, par: 58, best: 19.65,
    note: 'Interlocked grain: stripes down the board run opposite ways, so every stroke goes against some of it. Flatten it, then take fine passes with the smoother until the tear-out is gone.',
  },
  {
    no: 10, wood: 'whiteoak', L: 762, W: 165, seed: 1010, bow: 0.24, twist: 0.17, flips: [[0.42, 0.35]], rough: 0.12, spare: 0.5,
    title: 'Quartersawn', t0: 20.17, par: 52, best: 19.55,
    note: 'Quartersawn white oak, hollow and in wind, with the grain turning around just before the middle. The ray fleck lifts if you go against it.',
  },
  {
    no: 11, wood: 'maple', L: 838, W: 178, seed: 1111, twist: 0.28, cup: -0.17, flips: [[0.6, -0.4]], knots: [[0.25, 0.4, 8]], rough: 0.12, spare: 0.5,
    title: 'Hard and twisted', t0: 20.18, par: 72, best: 19.55,
    note: 'Twisted, and high along the middle across its width, with the grain turning around past the middle and a knot toward the near end. Hard maple tears at the first wrong move.',
  },
  {
    no: 12, wood: 'curly', L: 762, W: 165, seed: 1212, cup: 0.17, bow: 0.15, curl: 52, rough: 0.12, spare: 0.5,
    title: 'Curly', t0: 20.22, par: 64, best: 19.55,
    note: 'The curl turns every inch, so there’s no right way to plane it. Flatten it with the jointer and expect tear-out, then take fine passes with the smoother until it’s gone.',
  },
  {
    no: 13, panel: true, L: 686, seed: 1313, twist: 0.18, rough: 0.12, spare: 0.7,
    strips: [
      { w: 140, wood: 'walnut', grain: 1, cup: 0.12, step: 0 },
      { w: 140, wood: 'maple', grain: -1, cup: -0.1, step: 0.12 },
      { w: 140, wood: 'cherry', grain: 1, cup: 0.12, step: -0.06 },
    ],
    title: 'The tabletop', t0: 20.29, par: 70, best: 19.75,
    note: 'Three boards glued up into the top itself, with the middle one turned end for end and standing a little proud.',
  },
];

// Par: what the solver took, with a tenth more for a person who can't place every lane so exactly.
export const parFor = solverStrokes => solverStrokes + Math.round(solverStrokes * 0.1);

// A board's name as the page shows it: "No. 7 · Cherry", "No. 13 · Panel".
export function boardName(b, woods) {
  return 'No. ' + b.no + ' · ' + (b.panel ? 'Panel' : woods[b.wood].name);
}
