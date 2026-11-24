// =============================================================================
// THE MOON'S ZONES (milestone 5): which wing is drawn in detail and which is held as a stand-in. Pure (no THREE, no clock). A wing's detail
// is far from the landing (the spec's 4.2: all more than 60 m), so the plain draws only what is near her: within NEAR metres the wing's
// detail is on, beyond it the wing is its stand-in (for Star Hill the tower and its ramp: world/moonwing.js 'moon:wingfar'). A hysteresis
// keeps a cat standing on the line from flickering the wing on and off. Zone A (the base, the landing, the crater field) is always drawn.
// docs/superpowers/specs/2026-11-23-moon-design.md section 7.2; the plan's milestone 5.
// =============================================================================

import { STAR_HILL } from './moonplan.js';

export const NEAR = 55; // m: the wing's detail is drawn within this
export const HYSTERESIS = 6; // m: once drawn it stays drawn out to NEAR + HYSTERESIS

// The wings and where each stands (milestones 6 and 8 add the Launch Complex and the Lava Tube here).
export const WINGS = Object.freeze({
  B: Object.freeze({ id: 'B', x: STAR_HILL.x, z: STAR_HILL.z }),
});

// wingNear(distance, was) -> boolean: true within NEAR; once true it stays true until NEAR + HYSTERESIS.
export const wingNear = (distance, was = false) => distance <= (was ? NEAR + HYSTERESIS : NEAR);

// createZones() -> { update(x, z) -> { B: boolean }, near(id) }: the state kept between frames.
export function createZones(wings = WINGS) {
  const on = {};
  for (const id of Object.keys(wings)) on[id] = false;
  return {
    update(x, z) {
      for (const [id, w] of Object.entries(wings)) on[id] = wingNear(Math.hypot(x - w.x, z - w.z), on[id]);
      return on;
    },
    near: (id) => !!on[id],
  };
}
