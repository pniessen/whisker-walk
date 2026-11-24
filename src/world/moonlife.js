// =============================================================================
// THE MOON: ITS LIFE ON A WALK (milestone 1). What the Moon does each frame, all of it drawing and none of it a rule:
//   * the sky dress (world/moonsky.js: stars, Earth, the drifting cloud disc) hung on the camera, and a black sky;
//   * the camera's EASE: a Moon hop is 1.4 m high (3.6 m with Spring Paws), so the camera follows only 60 percent of
//     it (CAMERA_FOLLOW); the rest of the rise shows as the cat leaving the middle of the picture;
//   * the SKIP: a small 0.1 m bounce each stride while she walks, through session.hopLift (game/avatar.js adds it to
//     the drawn height, as the Market's shoo hop does), none in reduced motion;
//   * the LANDING DUST: ten slow puffs that hang about 1.2 s, on the very frame the pounce window ends (the frame
//     game/avatar.js plays the thump on), five on the lite rung, none in reduced motion (fx.burst's own rule).
//   * (milestone 4) the DRAW BUDGET: the walk's own pebbles and golden mice (about 17 draws if all are in view on this wide plain) are
//     hidden beyond DRAW_NEAR metres of her (a 0.2 m thing at 50 m is a dot), so a frame stays under the 120-draw gate; nothing reads a
//     mesh's `visible` to decide anything (the walk uses the collectible Map and the mice's own list);
//   * (milestone 3) DOT the rover: hop in at the depot, steer, hop out (world/moonroverlive.js); she hangs her hooks on the walk's session.fair.
//   * (milestone 2) the BASE: Pip, the two power cells, the Core, the dome, the door, the board, the finds, the gold ring and the
//     switching-off of the daily goals and the air's sounds (world/moonbaselive.js); this life hands the walk its promptAt, interact
//     and credit.
// The base's own saves go through its life (state.moon); nothing else here is saved, sent or drawn from a random number or a clock of
// its own. The numbers below are the spec's section 5.2.
// =============================================================================

import * as THREE from 'three';
import { pounceArc, hopOffset } from '../player.js';
import { placeArc } from '../placephysics.js';
import { createMoonSky } from './moonsky.js';
import { createBaseLife } from './moonbaselive.js';
import { createRoverLive } from './moonroverlive.js';
import { MOON_SPAWN } from './moonplan.js';

export const CAMERA_FOLLOW = 0.6; // the camera rises this much of a hop's height
export const SKIP_HEIGHT = 0.1; // m, the bounce of one stride
export const SKIP_STRIDE = 1.1; // m walked per stride
export const DRAW_NEAR = 50; // m: the walk's pebbles and golden mice farther than this from her are not drawn (milestone 4's draw budget)
export const DUST = Object.freeze({ count: 10, lite: 5, ttl: 1.2, gravity: 0.35, speed: 0.9, size: 0.14, color: 0xb9b3aa });
const SKY_BLACK = 0x03050d;

// The height of the hop now, from the pounce window the walk keeps (session.pounceTime counts down from arc.time): the
// same parabola player.js draws, so the camera and the cat agree. 0 when she is not hopping.
export function hopNow(arc, pounceTime) {
  if (!(pounceTime > 0)) return 0;
  return hopOffset(arc.time - pounceTime, arc);
}

// cullFar(catPos, session, near) -> how many of the walk's pebbles and golden mice are drawn now. A mesh beyond `near` metres (sideways) is
// hidden, one within it shown; the walk's collectible Map and the mice's list are not touched.
export function cullFar(catPos, session, near = DRAW_NEAR) {
  let shown = 0;
  const set = (obj) => {
    const on = Math.hypot(obj.position.x - catPos.x, obj.position.z - catPos.z) <= near;
    obj.visible = on;
    if (on) shown++;
  };
  const metres = session?.collectibleMeshes;
  if (metres && typeof metres.values === 'function') for (const m of metres.values()) set(m);
  for (const mo of session?.goldMice?.list ?? []) if (mo?.group) set(mo.group);
  return shown;
}

// createMoonLife(ctx) -> { update(dt, t, catPos, camera, session), dispose() }; ctx is walk.js's life context.
export function createMoonLife({ scene, reducedMotion = false, tier, progression, ground, colliders, log, audio }) {
  scene.background = new THREE.Color(SKY_BLACK); // no horizon haze under the stars: the Moon has no air
  const sky = createMoonSky({ scene, tier, reducedMotion });
  const base = createBaseLife({ scene, reducedMotion, ground, colliders, progression, log, audio });
  // (milestone 3) Dot: hop in at the depot, steer by the stick, hop out; she hooks the walk's session.fair on the first frame (moonroverlive.js)
  const rover = createRoverLive({ scene, reducedMotion, ground, colliders, tier, audio, progression, onDismount: () => base.pip.rejoin() });
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
  let owner = null; // whose offer the action button is showing: 'base' | 'rover' | null

  return {
    sky,
    base,
    rover,
    // the action button: Dot's "Hop in" / "Hop out" first (riding), else the base's own offers, else "Hop in" when nothing else is asked
    promptAt(catPos) {
      const b = base.promptAt(catPos);
      const r = rover.promptAt(catPos);
      owner = rover.riding ? 'rover' : b ? 'base' : r ? 'rover' : null;
      return owner === 'rover' ? r : owner === 'base' ? b : null;
    },
    interact() { return owner === 'rover' ? rover.interact() : base.interact(); },
    credit: (ev) => (typeof ev?.kind === 'string' && ev.kind.startsWith('rover-') ? rover.credit(ev) : base.credit(ev)),
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
      rover.update(dt, t, catPos, camera, session);
      base.update(dt, t, catPos, camera, session);
      cullFar(catPos, session);
    },
    dispose() {
      rover.dispose();
      base.dispose();
      sky.dispose();
      if (held) held.hopLift = 0;
      for (const m of held?.collectibleMeshes?.values?.() ?? []) m.visible = true;
      for (const mo of held?.goldMice?.list ?? []) if (mo?.group) mo.group.visible = true;
    },
  };
}
