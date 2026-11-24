// =============================================================================
// THE MOON: ITS LIFE ON A WALK (milestone 1). What the Moon does each frame, all of it drawing and none of it a rule:
//   * the sky dress (world/moonsky.js: stars, Earth, the drifting cloud disc) hung on the camera, and a black sky;
//   * the camera's EASE: a Moon hop is 1.4 m high (3.6 m with Spring Paws), so the camera follows only 60 percent of
//     it (CAMERA_FOLLOW); the rest of the rise shows as the cat leaving the middle of the picture;
//   * the SKIP: a small 0.1 m bounce each stride while she walks, through session.hopLift (game/avatar.js adds it to
//     the drawn height, as the Market's shoo hop does), none in reduced motion;
//   * the LANDING DUST: ten slow puffs that hang about 1.2 s, on the very frame the pounce window ends (the frame
//     game/avatar.js plays the thump on), five on the lite rung, none in reduced motion (fx.burst's own rule).
// Nothing here is saved, sent or drawn from a random number or a clock of its own. The numbers below are the
// spec's section 5.2.
// =============================================================================

import * as THREE from 'three';
import { pounceArc, hopOffset } from '../player.js';
import { placeArc } from '../placephysics.js';
import { createMoonSky } from './moonsky.js';
import { MOON_SPAWN } from './moonplan.js';

export const CAMERA_FOLLOW = 0.6; // the camera rises this much of a hop's height
export const SKIP_HEIGHT = 0.1; // m, the bounce of one stride
export const SKIP_STRIDE = 1.1; // m walked per stride
export const DUST = Object.freeze({ count: 10, lite: 5, ttl: 1.2, gravity: 0.35, speed: 0.9, size: 0.14, color: 0xb9b3aa });
const SKY_BLACK = 0x03050d;

// The height of the hop now, from the pounce window the walk keeps (session.pounceTime counts down from arc.time): the
// same parabola player.js draws, so the camera and the cat agree. 0 when she is not hopping.
export function hopNow(arc, pounceTime) {
  if (!(pounceTime > 0)) return 0;
  return hopOffset(arc.time - pounceTime, arc);
}

// createMoonLife(ctx) -> { update(dt, t, catPos, camera, session), dispose() }; ctx is walk.js's life context.
export function createMoonLife({ scene, reducedMotion = false, tier, progression }) {
  scene.background = new THREE.Color(SKY_BLACK); // no horizon haze under the stars: the Moon has no air
  const sky = createMoonSky({ scene, tier, reducedMotion });
  // placed for the Ready card, before the first frame of the walk moves the camera (it looks north from behind the spawn)
  const first = new THREE.PerspectiveCamera();
  first.position.set(MOON_SPAWN.x, 2.9, MOON_SPAWN.z + 4.4);
  sky.update(first, 0);
  const lite = tier?.shadows === false;
  let lastX = null;
  let lastZ = 0;
  let phase = 0;
  let wasUp = false;
  let held = null;

  return {
    sky,
    update(dt, t, catPos, camera, session) {
      held = session;
      sky.update(camera, t);
      const arc = placeArc(pounceArc(progression.state, { reducedMotion }), 'moon');
      const left = session.pounceTime ?? 0;
      // the camera ease: the hop's height she is at, less what the camera follows
      const lift = hopNow(arc, left);
      if (lift > 0) camera.position.y -= lift * (1 - CAMERA_FOLLOW);
      // the landing dust, on the frame the window ends (game/avatar.js takes dt off pounceTime later in this same frame)
      if (left > 0) wasUp = true;
      if (wasUp && left > 0 && left - dt <= 0) {
        wasUp = false;
        session.fx?.burst(catPos, DUST.color, lite ? DUST.lite : DUST.count, { ttl: DUST.ttl, gravity: DUST.gravity, speed: DUST.speed, size: DUST.size });
      }
      // the skip: a bounce each stride while she walks on the ground, none in the air, on a perch or in reduced motion
      let skip = 0;
      if (lastX !== null && dt > 0) {
        const d = Math.hypot(catPos.x - lastX, catPos.z - lastZ);
        const speed = d / dt;
        if (!reducedMotion && left <= 0 && !session.perched && speed > 0.5 && speed < 12) {
          phase += (d / SKIP_STRIDE) * Math.PI;
          skip = SKIP_HEIGHT * Math.abs(Math.sin(phase)) * Math.min(1, speed / 2);
        }
      }
      lastX = catPos.x;
      lastZ = catPos.z;
      session.hopLift = skip;
    },
    dispose() {
      sky.dispose();
      if (held) held.hopLift = 0;
    },
  };
}
