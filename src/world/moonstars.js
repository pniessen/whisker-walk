// =============================================================================
// THE MOON'S STAR PICTURES (milestone 5): the data and the pure solver of the telescope game. No THREE, no canvas, no clock, no random
// number: world/moonscope.js draws and listens, world/moonstarlive.js saves. Five star pictures (the Mouse, the Cat, the Fish, the Crown
// and the Paw: 27 stars in all), each a hand-placed chain of stars in the order they are pinned, and the Great Cat that they join into.
//
// THE GAME. She looks through the telescope at a 60 by 40 degree window of the sky and pins a picture's stars one after another. A star is
// pinned when it is the NEXT one of its picture; any other star is a soft "hmm" and NOTHING is lost (every picture keeps its own progress,
// so she may leave one half drawn and start another). A picture whose last star is pinned is DONE: it is saved (state.moon.scope, one bit
// each, in the order below), it glows in the real sky and on the Star Table, and the next time the scope opens it is drawn lit. After 20
// seconds without a pin the next star of the picture she is on pulses (the hint); the meow button asks at once. There is no fail state.
//
// POSITIONS are bearing and elevation in degrees, north 0, east 90 (the convention of Earth's place in the sky: world/moonplan.js EARTH).
// A star's offset [u, v] from its picture's middle is degrees east and degrees up on the sky, u widened by 1 / cos(elevation) so the
// picture is not squashed up high.
// =============================================================================

const DEG = Math.PI / 180;

// The pictures, in the order of their save bits (bit 0 the Mouse ... bit 4 the Paw). `pts` is the order they are pinned (and the chain of
// lines drawn between them). The story needs the Mouse and the Cat (the first two bits); the others are for the finding.
export const CONSTELLATIONS = Object.freeze([
  { id: 'mouse', bearing: 338, elev: 30, pts: [[-8, -2.5], [-2.5, 0], [4, -0.5], [1.5, 3.5]] },
  { id: 'cat', bearing: 40, elev: 42, pts: [[-10, -5], [-6, -3], [-2, 0], [2, 4], [3, 8], [5.5, 6], [7.5, 8.5]] },
  { id: 'fish', bearing: 95, elev: 30, pts: [[-9, 3.5], [-5, 0], [-9, -3.5], [-1, -3], [6, 0], [-1, 3]] },
  { id: 'crown', bearing: 160, elev: 52, pts: [[-7, -2], [-5, 3], [0, 0], [5, 3], [7, -2]] },
  { id: 'paw', bearing: 262, elev: 36, pts: [[-6, 2], [-2, 5], [2, 5], [6, 2], [0, -3]] },
].map((c) => Object.freeze({ ...c, pts: Object.freeze(c.pts.map((p) => Object.freeze(p))) })));
export const STAR_COUNT = CONSTELLATIONS.reduce((n, c) => n + c.pts.length, 0); // 27
export const ALL_BITS = (1 << CONSTELLATIONS.length) - 1; // 31
export const STORY_BITS = 3; // the Mouse and the Cat: what finds Earth (mission step 5)
export const HINT_SECS = 20;
export const WINDOW = Object.freeze({ w: 60, h: 40 }); // degrees the telescope shows
export const TOLERANCE = Object.freeze({ touch: 40, mouse: 28, snap: 70 }); // px: a tap this near a star pins it; a reticle snaps this near

// The Great Cat: a sitting cat seen from the front (a closed outline, a tail and two eyes), drawn on the sky once all five are traced and
// on the observatory's ceiling always (faint until then). Units: x -1.3..1.3, y 0..2.3; `scale` is degrees per unit on the sky.
export const GREAT_CAT = Object.freeze({
  bearing: 305, elev: 50, scale: 19,
  outline: Object.freeze([
    [-0.55, 2.25], [-0.2, 1.95], [0.2, 1.95], [0.55, 2.25], [0.72, 1.85], [0.5, 1.5], [0.78, 1.15], [0.85, 0.5], [0.8, 0], [0.3, 0],
    [-0.3, 0], [-0.8, 0], [-0.85, 0.5], [-0.78, 1.15], [-0.5, 1.5], [-0.72, 1.85],
  ].map((p) => Object.freeze(p))),
  tail: Object.freeze([[0.85, 0.35], [1.15, 0.5], [1.25, 0.95], [1.05, 1.3]].map((p) => Object.freeze(p))),
  eyes: Object.freeze([[-0.28, 1.7], [0.28, 1.7]].map((p) => Object.freeze(p))),
});

const wrap = (b) => ((b % 360) + 360) % 360;
// A star's place on the sky: { b: bearing, e: elevation } in degrees.
export function starSky(c, i) {
  const [u, v] = c.pts[i];
  return { b: wrap(c.bearing + u / Math.cos(c.elev * DEG)), e: c.elev + v };
}
// The Great Cat's point (x, y in its units) on the sky.
export function catSky(x, y) {
  const g = GREAT_CAT;
  const e = g.elev + (y - 1.15) * g.scale;
  return { b: wrap(g.bearing + (x * g.scale) / Math.cos(g.elev * DEG)), e };
}
// The unit direction of a bearing and elevation (north is -z, east is +x, up is +y), the same as Earth's.
export function skyDir(b, e, out = { x: 0, y: 0, z: 0 }) {
  out.x = Math.sin(b * DEG) * Math.cos(e * DEG);
  out.y = Math.sin(e * DEG);
  out.z = -Math.cos(b * DEG) * Math.cos(e * DEG);
  return out;
}
// The sky's direction of a point in the seeded star field (moonsky.js starField puts a star at pos = dir * radius with x = cos az cos el).
export function bearingOf(x, y, z) {
  const h = Math.hypot(x, z);
  return { b: wrap(Math.atan2(x, -z) / DEG), e: Math.atan2(y, h) / DEG };
}

// The bits traced as a list of picture indices, and the first picture still to do (in the order above), or -1 when all five are.
export const bitsOf = (n) => CONSTELLATIONS.map((_, i) => ((n >> i) & 1) === 1);
export const firstUndone = (bits) => { for (let i = 0; i < CONSTELLATIONS.length; i++) if (!((bits >> i) & 1)) return i; return -1; };
export const cleanBits = (n) => (Number.isInteger(n) && n >= 0 ? n & ALL_BITS : 0);

// ---- the solver ----------------------------------------------------------------------------------------------------------
// createSolver(done) -> { tap(c, i), pins(c), done(c), bits, focus, next() }. `done` is the saved bits. Each picture keeps its own count
// of pinned stars; tap(c, i) answers what happened, as { kind, c, i, bits }:
//   'pin'    the star was the next one of its picture: pinned
//   'done'   it was the last: the picture is traced (bits has its bit now)
//   'again'  it is a star already pinned: nothing
//   'hmm'    any other star: a soft "hmm", nothing lost
//   'known'  a star of a picture already traced: nothing
//   'miss'   no star there: nothing
// (milestone 9) `list` is the pictures in play: the five, plus the day's guest as a sixth while Pip's errand asks for it (its bit is never saved: the save keeps five).
export function createSolver(doneBits = 0, list = CONSTELLATIONS) {
  let bits = cleanBits(doneBits);
  const n = list.map((cc, i) => (((bits >> i) & 1) ? cc.pts.length : 0));
  let last = -1; // the picture pinned last (the hint follows it)
  const api = {
    get bits() { return bits; },
    get last() { return last; },
    pins: (c) => n[c] ?? 0,
    done: (c) => ((bits >> c) & 1) === 1,
    tap(c, i) {
      if (!Number.isInteger(c) || !Number.isInteger(i) || !list[c] || i < 0 || i >= list[c].pts.length) return { kind: 'miss', c: -1, i: -1, bits };
      if ((bits >> c) & 1) return { kind: 'known', c, i, bits };
      if (i < n[c]) return { kind: 'again', c, i, bits };
      if (i !== n[c]) return { kind: 'hmm', c, i, bits };
      n[c]++;
      last = c;
      if (n[c] === list[c].pts.length) { bits |= 1 << c; return { kind: 'done', c, i, bits }; }
      return { kind: 'pin', c, i, bits };
    },
    // the picture she is on: the one pinned last if it is not done, else the first with a star pinned, else the first not done; -1 when all are done
    focus() {
      if (last >= 0 && !((bits >> last) & 1)) return last;
      for (let c = 0; c < n.length; c++) if (n[c] > 0 && !((bits >> c) & 1)) return c;
      for (let c = CONSTELLATIONS.length; c < n.length; c++) if (!((bits >> c) & 1)) return c; // (milestone 9) today's guest picture comes before the five she may still do
      for (let c = 0; c < n.length; c++) if (!((bits >> c) & 1)) return c;
      return -1;
    },
    // the next star to pin in the focus picture: { c, i }, or null when every picture is done
    next() {
      const c = api.focus();
      return c < 0 ? null : { c, i: n[c] };
    },
  };
  return api;
}

// The hint: createHint(solver) -> { tick(dt) -> null | { c, i }, reset(), ask() }. After HINT_SECS without a pin (reset() on every pin and
// on opening) tick answers the next star to pulse, and keeps answering it until the next reset; ask() (the meow) shows it at once.
export function createHint(solver, secs = HINT_SECS) {
  let idle = 0;
  let asked = false;
  return {
    get idle() { return idle; },
    tick(dt) {
      if (dt > 0) idle += dt;
      return asked || idle >= secs ? solver.next() : null;
    },
    reset() { idle = 0; asked = false; },
    ask() { asked = true; },
  };
}

// Which star is nearest a screen point: `list` is [{ c, i, x, y }] in pixels; the nearest within `tol` pixels, or null. Ties go to the first.
export function nearestStar(list, x, y, tol) {
  let best = null;
  let bd = tol * tol;
  for (const s of list) {
    const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
    if (best ? d < bd : d <= bd) { bd = d; best = s; }
  }
  return best;
}

// The window's pixel scale: px per degree so that at least 40 by 32 degrees are shown, whatever the screen's shape (a phone held upright
// shows a tall window, a television a wide one).
export const scopeScale = (w, h) => Math.max(1, Math.min(w / 40, h / 32));
// The shortest signed angle (degrees) from a to b.
export const angleTo = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;
