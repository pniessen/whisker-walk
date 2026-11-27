// =============================================================================
// THE MOON'S ZONES (milestone 5): which wing is drawn in detail and which is held as a stand-in. Pure (no THREE, no clock). A wing's detail
// is far from the landing (the spec's 4.2: all more than 60 m), so the plain draws only what is near her: within NEAR metres the wing's
// detail is on, beyond it the wing is its stand-in (for Star Hill the tower and its ramp: world/moonwing.js 'moon:wingfar'). A hysteresis
// keeps a cat standing on the line from flickering the wing on and off. Zone A (the base, the landing, the crater field) is always drawn.
// docs/superpowers/specs/2026-11-23-moon-design.md section 7.2; the plan's milestone 5.
// =============================================================================

import { STAR_HILL, PAD, LAVA_WING } from './moonplan.js';

export const NEAR = 55; // m: the wing's detail is drawn within this
export const HYSTERESIS = 6; // m: once drawn it stays drawn out to NEAR + HYSTERESIS

// The wings and where each stands. A wing may carry its own `near` (milestone 8: the Lava Tube's detail is drawn within 32 m of the tube's middle, the cave being small and its dome
// of rock enclosing it; B and C use NEAR).
export const WINGS = Object.freeze({
  B: Object.freeze({ id: 'B', x: STAR_HILL.x, z: STAR_HILL.z }),
  C: Object.freeze({ id: 'C', x: PAD.x, z: PAD.z }), // milestone 6: the Launch Complex's arm, plume, smoke and board
  D: Object.freeze({ id: 'D', x: LAVA_WING.x, z: LAVA_WING.z, near: LAVA_WING.near }), // milestone 8: the Lava Tube's floor, crystals and pedestal
  E: Object.freeze({ id: 'E', x: 44, z: 36, near: 26 }), // M1: the Old Relay Station's detail (its stand-in always drawn; the numbers equal world/moonstationplan.js STATION)
});

// wingNear(distance, was) -> boolean: true within NEAR; once true it stays true until NEAR + HYSTERESIS.
export const wingNear = (distance, was = false, near = NEAR) => distance <= (was ? near + HYSTERESIS : near);

// createZones() -> { update(x, z) -> { B: boolean }, near(id) }: the state kept between frames.
export function createZones(wings = WINGS) {
  const on = {};
  for (const id of Object.keys(wings)) on[id] = false;
  return {
    update(x, z) {
      for (const [id, w] of Object.entries(wings)) on[id] = wingNear(Math.hypot(x - w.x, z - w.z), on[id], w.near ?? NEAR);
      return on;
    },
    near: (id) => !!on[id],
  };
}
