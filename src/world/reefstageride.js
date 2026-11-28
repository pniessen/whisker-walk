// Stage "ride" of the Reef: the two mounts (see reefstages.js). Milestone R12 fills it: the plan (racks, keepOut), the drawing (racks, the Sea Scooter and the yellow
// Diving Saucer) and the live (hop on and off, steering, the camera, the air gauge's pause). reef.js draws the racks in build() (so they are in the scene before the
// walk starts) and makes the live in its life. R18 adds the divers, the research ship and the big spotted shark here (reefdiverslive.js: no collider, no stage of its own). three comes in through the kit (like the lab stage), so this chunk never takes it out of start-up.
import { ST } from './reefstages.js';
import * as plan from './reefrideplan.js';
import { useKit, buildRacks } from './reefrideparts.js';
import { createRideLive } from './reefridelive.js';
import { createReefDiversLive } from './reefdiverslive.js';
import { makeEel } from './reefrideeel.js';
import { createSealRide } from './reefsealride.js'; // the free seal ride lives in this stage's chunk (the landing is near its ceiling)

function draw(scene, kit, reefY, tier) {
  useKit(kit);
  return buildRacks(scene, reefY, !!tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3));
}
// The Reef's life hands over its own pieces: the walk's ctx, the area record (the live colliders and the ground), the story's base life and the plan P.
function live(kit, ctx, area, base, P) {
  return createRideLive({
    THREE: kit.THREE, scene: ctx.scene, reefY: P.reefY, ground: area.ground, colliders: area.colliders, keepOut: ST.wreck.rideKeepOut?.() ?? [], bounds: P.REEF_BOUNDS,
    player: ctx.player, reducedMotion: ctx.reducedMotion, tier: ctx.tier, progression: ctx.progression, say: base.say,
  });
}

Object.assign(ST, { ride: Object.freeze({ plan, buildRacks: draw, createRideLive: live, colliders: plan.rackColliders, createDiversLive: createReefDiversLive, makeEel, createSealRide }) });
