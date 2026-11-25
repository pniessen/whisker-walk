// =============================================================================
// THE MOON'S STAR PICTURES (milestone 5): the data and the pure solver of the telescope game. No THREE, no canvas, no clock, no random
// number: world/moonscope.js draws and listens, world/moonstarlive.js saves. Five star pictures (the Mouse, the Cat, the Fish, the Crown
// and the Paw: 51 stars in all), each a hand-placed chain of stars in the order they are pinned, and the Great Cat that they join into.
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

// The pictures, in the order of their save bits (bit 0 the Mouse ... bit 4 the Paw). `pts` is the order they are pinned. Lines join each star to the one before
// it, except where `gaps` lists a star that starts a new stroke (the Paw's four toes are lone stars), and `join` lists extra [from, to] lines drawn once both
// stars are pinned (the closing line of an outline). The story needs the Mouse and the Cat (the first two bits); the others are for the finding.
// (scope usability pass, 2026-11-25) Each picture is now an outline a child knows at a glance: the old shapes (a zigzag, an arc, a "W") were not. Every star is at
// least 4 degrees from every other of its picture (test/moonscopeux.test.js); a picture is under 31 degrees wide so a phone upright (40 degrees across) shows it all.
// Two designs of the Cat are kept: the recommended sitting cat with its tail (11 stars) and a front-facing head with two pointed ears (9). CAT_DESIGN picks one.
export const CAT_DESIGNS = Object.freeze({
  sitting: Object.freeze({ pts: [[9.8, -2], [9.8, -8], [5.3, -10], [-9.8, -10], [-7.3, 1], [-8.3, 5], [-6.8, 10], [-2.3, 7.5], [2.3, 10], [3.8, 5], [2.8, 1]], join: [[10, 2]] }),
  head: Object.freeze({ pts: [[-8, 1], [-6, 8], [0, 4], [6, 8], [8, 1], [8.5, -4], [4, -8], [-4, -8], [-8.5, -4]], join: [[8, 0]] }),
});
export const CAT_DESIGN = 'sitting'; // the owner may switch this to 'head'
export const CONSTELLATIONS = Object.freeze([
  { id: 'mouse', bearing: 338, elev: 30, pts: [[13, 2.3], [10, -2.8], [6, -4.8], [1.5, 1.3], [-3, 1.3], [-4.5, 6.8], [-8.5, 1.3], [-13, -5.8], [-4.5, -6.8]], join: [[8, 2]] },
  { id: 'cat', bearing: 40, elev: 42, ...CAT_DESIGNS[CAT_DESIGN] },
  { id: 'fish', bearing: 95, elev: 30, pts: [[-10.5, 0], [-4.5, 4.5], [2.5, 3], [10.5, 5.5], [8, 0], [10.5, -5.5], [2.5, -3], [-4.5, -4.5]], join: [[7, 0]] },
  { id: 'crown', bearing: 160, elev: 52, pts: [[-8, 3.5], [-4, -0.5], [0, 4.5], [4, -0.5], [8, 3.5], [8, -4.5], [-8, -4.5]], join: [[6, 0]] },
  { id: 'paw', bearing: 262, elev: 36, pts: [[-4, -0.5], [4, -0.5], [6, -5], [0, -8], [-6, -5], [-8, 4.5], [-3, 8], [3, 8], [8, 4.5]], join: [[4, 0]], gaps: [5, 6, 7, 8] },
].map((c) => Object.freeze({ ...c, gaps: Object.freeze(c.gaps ?? []), join: Object.freeze((c.join ?? []).map((j) => Object.freeze(j))), pts: Object.freeze(c.pts.map((p) => Object.freeze(p))) })));
export const STAR_COUNT = CONSTELLATIONS.reduce((n, c) => n + c.pts.length, 0); // 51 (9 + 11 + 8 + 7 + 9)
export const ALL_BITS = (1 << CONSTELLATIONS.length) - 1; // 31
export const STORY_BITS = 3; // the Mouse and the Cat: what finds Earth (mission step 5)
// The next star pulses almost at once (owner, 2026-11-25: "otherwise it will take 5 minutes to connect all the stars"): HINT_SECS after the scope
// opens and after each pin; the three optional pictures may wait longer (HINT_SECS_OPTIONAL: the same today, one number to change if the owner wants
// them to be more of a puzzle). A wrong star never hides it. A finished picture rests HINT_GRACE seconds before the next picture's first star pulses.
export const HINT_SECS = 0.6;
export const HINT_SECS_OPTIONAL = 0.6;
export const HINT_GRACE = 5;
export const WINDOW = Object.freeze({ w: 60, h: 40 }); // degrees the telescope shows
export const TOLERANCE = Object.freeze({ touch: 40, mouse: 28, snap: 70 }); // px: the OLD fixed reach (kept for callers that name it); the scope now uses scopeRing below
// (scope usability pass) The ring (the reticle) and the capture reach, in px, from the screen's short side, so the ring you see and the reach you get agree
// on every screen. kind: 'touch' (a phone or tablet, or a pad on a laptop), 'tv' (the 10-foot view) or 'mouse' (a laptop). `reach` is the ring plus a star's
// own size and glow (`star` px, in the page's couch multiplier `m`): a star counts when its centre is inside the ring, or the ring just overlaps it.
export const RING = Object.freeze({ touch: { f: 0.075, lo: 34, hi: 96 }, tv: { f: 0.065, lo: 48, hi: 190 }, mouse: { f: 0.035, lo: 26, hi: 44 } });
export function scopeRing(w, h, kind = 'mouse', m = 1) {
  const q = RING[kind] ?? RING.mouse;
  const ring = Math.round(Math.min(q.hi, Math.max(q.lo, Math.min(w, h) * q.f)));
  const star = Math.round(8 * (kind === 'tv' ? m : 1));
  return { ring, reach: ring + star, star };
}

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

// The hint: createHint(solver) -> { tick(dt) -> null | { c, i }, reset(grace), ask() }. HINT_SECS after opening or a pin (reset() on every pin and
// on opening; a wrong star does not reset it) tick answers the next star to pulse and keeps answering it; ask() (the bulb) shows it at once, stronger.
export function createHint(solver, secs = HINT_SECS, optSecs = HINT_SECS_OPTIONAL) {
  let idle = 0;
  let asked = false;
  return {
    get idle() { return idle; },
    tick(dt) {
      if (dt > 0) idle += dt;
      if (asked) return solver.next();
      const nx = solver.next();
      if (!nx) return null;
      return idle >= (nx.c >= 2 && nx.c < CONSTELLATIONS.length ? optSecs : secs) ? nx : null;
    },
    // after a pin (or opening) the clock restarts; `grace` seconds of rest first (a picture just finished: the next one waits for her to choose or for the rest to pass)
    reset(grace = 0) { idle = -Math.max(0, grace); asked = false; },
    ask() { asked = true; },
    get asked() { return asked; },
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

// Which star a tap or the ring takes: every star within `reach` px of the point; when the NEXT star to pin ({ c, i }, from solver.next()) is one of them
// it wins (the intended star can never lose to a neighbour), else the nearest. null when none is that near.
export function pickStar(list, x, y, reach, next = null) {
  let near = null;
  let nd = Infinity;
  const r2 = reach * reach;
  for (const s of list) {
    const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
    if (d > r2) continue;
    if (next && s.c === next.c && s.i === next.i) return s;
    if (d < nd) { nd = d; near = s; }
  }
  return near;
}

// The written objective at the top of the telescope: { id, vars } for the lazy line to say (moon.scope.goal.*); `names` are the five pictures' names in order.
export function objectiveOf(solver, pictures, names, earth = false) {
  const nxt = solver.next();
  if (earth && (solver.bits & STORY_BITS) === STORY_BITS && (!nxt || solver.pins(nxt.c) === 0)) return { id: 'moon.scope.earth', vars: {} }; // looking at Earth with the story done: what it is and what to do next
  if (!nxt) return { id: 'moon.scope.goal.all', vars: {} };
  const guest = nxt.c >= CONSTELLATIONS.length;
  const n = solver.pins(nxt.c);
  const t = pictures[nxt.c].pts.length;
  if (guest) return { id: 'moon.scope.goal.guest', vars: { n, t } };
  const name = names[nxt.c];
  if ((solver.bits & STORY_BITS) === STORY_BITS && n === 0) {
    const left = [];
    for (let c = 2; c < CONSTELLATIONS.length; c++) if (!solver.done(c)) left.push(names[c]);
    if (left.length > 1) return { id: 'moon.scope.goal.more', vars: { list: `the ${left.slice(0, -1).join(', the ')} or the ${left[left.length - 1]}` } };
    return { id: 'moon.scope.goal.more', vars: { list: `the ${left[0]}` } };
  }
  return { id: solver.bits === 0 ? 'moon.scope.goal.first' : 'moon.scope.goal.next', vars: { name, n, t } };
}

// The window's pixel scale: px per degree so that at least 40 by 32 degrees are shown, whatever the screen's shape (a phone held upright
// shows a tall window, a television a wide one).
export const scopeScale = (w, h) => Math.max(1, Math.min(w / 40, h / 32));
// The shortest signed angle (degrees) from a to b.
export const angleTo = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;
