// =============================================================================
// THE ECHO DEEP: THE PRISM PUZZLE (second story, C1). Pure. Three stands, three faces each: 0 rose circle, 1 blue diamond, 2 gold star (colour and shape are the SAME index, so colour is never the only clue).
// The door-crystal shows the face each stand must show. The action button turns a stand to its next face (0 to 1 to 2 to 0), any order, any number of times. The solved state is a pure function
// of the three face indices and is always reachable by turns alone; a turn is never a mistake, nothing counts, nothing fails. Once solved, the stands hold (a further turn changes nothing).
// =============================================================================
export const FACES = 3;
export const FACE_NAMES = Object.freeze(['rose', 'blue', 'gold']);
export const FACE_SHAPES = Object.freeze(['circle', 'diamond', 'star']);
export const COLOURS = Object.freeze([0xff8fb8, 0x6fb8ff, 0xffd060]);
export const START = Object.freeze([0, 1, 2]); // where the stands begin: none of them is right yet
export const TARGET = Object.freeze([1, 2, 0]); // what the door-crystal asks

const face = (v) => (Number.isInteger(v) ? ((v % FACES) + FACES) % FACES : 0);
/** Any three numbers become three faces. */
export const clean = (faces) => [0, 1, 2].map((i) => face(Array.isArray(faces) ? faces[i] : 0));
export const matches = (faces, target = TARGET) => { const f = clean(faces); const t = clean(target); return f.map((v, i) => v === t[i]); };
export const solved = (faces, target = TARGET) => matches(faces, target).every(Boolean);
/** Turn stand i one face on; returns the new faces (never touches the input). A solved set, or a stand that does not exist, is left as it is. */
export function turn(faces, i, target = TARGET) {
  const f = clean(faces);
  if (!(i === 0 || i === 1 || i === 2) || solved(f, target)) return f;
  f[i] = (f[i] + 1) % FACES;
  return f;
}
/** How many turns the stands still need (0 to 6): a pure count, for the guide. */
export const turnsLeft = (faces, target = TARGET) => { const f = clean(faces); const t = clean(target); return f.reduce((n, v, i) => n + ((t[i] - v + FACES) % FACES), 0); };
/** The stand to turn next (the lowest wrong one), or -1. */
export const nextStand = (faces, target = TARGET) => matches(faces, target).indexOf(false);
