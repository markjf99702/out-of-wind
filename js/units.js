// Millimetres or inches. The model works in millimetres; the page shows whichever you picked.
// Inches follow the US default in the browser's language, and thicknesses read like calipers.

let unit = 'mm';
export const setUnit = u => { unit = u === 'in' ? 'in' : 'mm'; };
export const getUnit = () => unit;
export const defaultUnit = lang => (/^en-(US|LR|MM)\b/i.test(lang || '') ? 'in' : 'mm');

const IN = 25.4;

// A thickness: "20.41 mm" or "0.804″".
export function thick(mm) {
  return unit === 'in' ? (mm / IN).toFixed(3) + '″' : mm.toFixed(2) + ' mm';
}

// A small amount, like a gap or how far out of flat: "0.12 mm" or "0.005″".
export function small(mm) {
  if (unit === 'in') return (Math.max(0, mm) / IN).toFixed(3) + '″';
  return Math.max(0, mm).toFixed(2) + ' mm';
}

// How far from flat, a place finer than small(), since the last few thou are where a board is won:
// "0.0062″" or "0.164 mm". side rounds it down (-1) or up (+1), so a face that isn't flat yet never
// reads the same as what flat is, and one that is never reads more.
export function flat(mm, side = 0) {
  const inch = unit === 'in', k = inch ? 1e4 : 1e3, v = (Math.max(0, mm) / (inch ? IN : 1)) * k;
  const n = side > 0 ? Math.ceil(v - 1e-6) : side < 0 ? Math.floor(v + 1e-6) : Math.round(v);
  return inch ? (n / k).toFixed(4) + '″' : (n / k).toFixed(3) + ' mm';
}

// A board's size: "30 × 6½ in" or "762 × 165 mm".
export function size(L, W) {
  if (unit === 'mm') return Math.round(L) + ' × ' + Math.round(W) + ' mm';
  const f = v => {
    const q = Math.round((v / IN) * 4) / 4, whole = Math.floor(q), frac = q - whole;
    return (whole || '') + (frac ? ['', '¼', '½', '¾'][Math.round(frac * 4)] : '') || '0';
  };
  return f(L) + ' × ' + f(W) + ' in';
}

// The tabletop's thickness, the way a woodworker says it.
export function line(mm) {
  return unit === 'in' ? '¾″' : mm.toFixed(2) + ' mm';
}
