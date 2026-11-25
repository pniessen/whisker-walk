// =============================================================================
// THE MOON'S WAY DOWN (the Skip Ridge fix, 2026-11-25). Pure rules, no THREE, no clock, no random number.
// The walk's paw button picks the HIGHEST perch in reach, drops included (climbing.js bestPerch), and hops to the ground only when nothing at all is in reach. On
// a chain's last stone a lower stone is always in reach (the one she came from), so the button hopped her back DOWN one stone and the next press climbed her up again:
// she ping-ponged on the top two stones and the button never took her to the dust (the stick always did). On the Moon, where the courses are chains of stones, a
// press from a perch with no HIGHER perch in reach is a hop to the dust. `wayDown` answers that question: null when the ordinary climb takes the press (a higher
// stone is in reach), else the free dust beside the perch where she lands. world/moonroverlive.js hangs it on the walk's session.fair (jump and pawKind).
// =============================================================================

import { bestPerch } from '../climbing.js';
import { dismountSpot } from './moonrover.js';

// wayDown({ perches, perched, cat, perchY, budget, state, ground, colliders, bounds, fwd }) -> { x, z } the dust she hops down to, or null (the ordinary press stands:
// she is not on a perch, or a higher perch is in reach and the climb takes her). The landing is Dot's own "Hop out" spot (moonrover.js dismountSpot): the free ground
// beside the perch, on the side she faces first, clear of every collider and inside the bounds; it always answers.
export function wayDown({ perches, perched, cat, perchY, budget, state, ground, colliders, bounds, fwd }) {
  if (!perched) return null;
  const next = bestPerch(perches, cat, perchY, perched, budget, { state, ground });
  if (next && next.y > perchY + 0.05) return null;
  const s = dismountSpot({ x: perched.x, z: perched.z, yaw: 0 }, { colliders, bounds }, fwd);
  return { x: s.x, z: s.z };
}
