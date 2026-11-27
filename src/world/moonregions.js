// =============================================================================
// THE MOON'S CLOSED-OFF REGIONS (background loading). While a late stage is not in, what it brings is absent, and the places it brings are shut by a
// ring of small invisible colliders (the same circles the walk already stops at), so she never walks into a missing solid, a find, a story point or a
// prompt that is not there yet. The ring is taken away the moment the stage arrives. A stage whose download failed (twice) keeps its rings and the
// area says one friendly line near them. Pure data and pure functions (no THREE, no clock, no random number).
// Discs: where each stage's things stand (the plan: world/moonplan.js).
// =============================================================================

export const RING_R = 1.1; // m: each blocking circle
export const RING_STEP = 1.5; // m between their middles (they overlap: no gap a cat fits through)
export const WAIT_NEAR = 3; // m: within this of a closed ring the waiting line is said

export const REGIONS = Object.freeze({
  rover: Object.freeze([
    Object.freeze({ x: 28, z: 38, r: 10 }), // the depot, the shed and Dot
    Object.freeze({ x: 46, z: 0, r: 8 }), // the Far Beacon and the second power cell
    Object.freeze({ x: -47, z: 2.5, r: 15 }), // the Lava Tube, the Old Dish's ledge
  ]),
  hill: Object.freeze([Object.freeze({ x: -34, z: -29, r: 13 })]), // the tower, the observatory and the Star Table
  launch: Object.freeze([
    Object.freeze({ x: 38, z: -34, r: 16 }), // the pad, the rocket, the Launch Desk and the count board
    Object.freeze({ x: 31, z: 11, r: 15 }), // the Beam Hops
    Object.freeze({ x: -37, z: 20.8, r: 2.6 }), // the Message Desk
    Object.freeze({ x: -1.1, z: -46.9, r: 3 }), // the binocular stand
  ]),
});

/** ringFor(disc) -> the blocking circles along a disc's edge. */
export function ringFor(d) {
  const n = Math.max(6, Math.ceil((2 * Math.PI * d.r) / RING_STEP));
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: Math.round((d.x + Math.cos(a) * d.r) * 100) / 100, z: Math.round((d.z + Math.sin(a) * d.r) * 100) / 100, r: RING_R, moonRing: true };
  });
}

/** Is (x, z) inside any of these stages' discs, or within `pad` m of one's edge? */
export function nearRegion(x, z, ids, pad = WAIT_NEAR, table = REGIONS) {
  for (const id of ids) for (const d of table[id] ?? []) if (Math.hypot(x - d.x, z - d.z) <= d.r + pad) return id;
  return null;
}
