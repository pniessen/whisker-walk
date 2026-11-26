// A perch climb (or hop down) drawn as a short jump. RENDER ONLY: the game has already moved the cat; this says how far
// behind its logical spot to draw it. Pure numbers: no THREE, no clock, no random.
// climbArc(from, to, { height, time, reducedMotion }) -> arc; climbArcOffset(arc, elapsed) -> { x, y, z } to ADD to the
// logical position. `height`/`time` are the place's pounce arc (placeArc), so Spring Paws and the Moon lift and slow it.
export function climbArc(from, to, { height = 0.35, time = 0.3, reducedMotion = false } = {}) {
  const dx = from.x - to.x, dy = from.y - to.y, dz = from.z - to.z;
  const d = Math.hypot(dx, dz);
  const rise = -dy;
  // Earth: 0.28 s + 0.07 s per metre, capped at 0.6 s; the place's own hop time is the floor (the Moon hangs ~1.1 s).
  const dur = reducedMotion || !(d >= 0) || !(time >= 0) ? 0 : Math.max(Math.min(0.6, 0.28 + 0.07 * d), time);
  // A climb rises at least the hop's height (longer hang time, as on the Moon, lifts it more); a drop only arcs for the ground it crosses.
  const apex = rise >= 0 ? Math.max(height, Math.sqrt(Math.max(1, time / 0.3)) * (0.25 * d + 0.5 * rise)) : 0.25 * d;
  return { dx, dy, dz, dur, apex };
}

const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });
export function climbArcOffset(arc, elapsed, out = { x: 0, y: 0, z: 0 }) {
  if (!arc || !(arc.dur > 0) || !(elapsed < arc.dur)) return Object.assign(out, ZERO);
  const s = elapsed > 0 ? elapsed / arc.dur : 0;
  const k = 1 - s;
  out.x = arc.dx * k;
  out.z = arc.dz * k;
  out.y = arc.dy * k + arc.apex * 4 * s * k;
  return out;
}
