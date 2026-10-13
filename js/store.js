// What's kept in the browser: your best result on each board, the board on the bench part-way
// through, and your settings. One key, out-of-wind.v1.

const KEY = 'out-of-wind.v1';

const blank = () => ({ v: 1, best: {}, bench: null, unit: null, sound: true, seen: {} });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return blank();
    return { ...blank(), ...s, best: s.best || {}, seen: s.seen || {} };
  } catch {
    return blank();
  }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode or full: carry on */ }
}

// A result is better if it has more marks, then fewer strokes, then more thickness left.
export function better(a, b) {
  if (!b) return true;
  if (a.marks !== b.marks) return a.marks > b.marks;
  if (a.strokes !== b.strokes) return a.strokes < b.strokes;
  return a.thick > b.thick;
}
