// Found outfits: the walk's one find, out on the ground. The outfit (or the
// coin pouch) at its spot, a warm-gold twinkle a metre above it seen from
// about 20 m (it keeps its size on the screen out there), a soft chime when
// she comes within about 6 m, and the pick-up at the golden mouse's distance
// (rules.js). "No marker on the map, no arrow, no prompt": nothing here
// touches the minimap, the HUD or the prompt; the caller plays the chime from
// onNear and shows the card on an arrival.
//
// Per frame it allocates nothing: closure scratch, and `update` returns null
// or the one arrival object made here and reused. Two meshes, the outfit (or
// pouch) and its twinkle, and their materials belong to this find alone, so
// take() disposes them. Nothing is random or reads the clock: the twinkle's
// pulse runs off the `t` it is handed, its turn off the spot's id.
import * as THREE from 'three';
import { FLAT_GROUND } from '../ground.js';
import { seedFromCode } from '../rng.js';
import { hasSkill } from '../skills.js';
import { AUTO_SNIFF_STILL_S, AUTO_SNIFF_EVERY_S } from '../game/autosniff.js';
import { LOOK_POSE, buildFindDisplay, buildTwinkle } from './display.js';
import { TWINKLE_RANGE, NOSE_RANGE, catReaches, partnerReaches, createChime } from './rules.js';

// The twinkle hangs this far above the find: clear of the Park's bushes, whose
// finds sit low in their branches, so a leaf never hides it.
export const TWINKLE_LIFT = 1.0;
// Out to this many metres from the camera the twinkle is its built size (32 cm
// point to point); further off it grows with the distance, so it stays the
// same size on the screen and still reads as a glint at 20 m (decision 7,
// "twinkles from about 20 m"). It never shrinks below its built size.
export const TWINKLE_FULL_AT = 12.5;
// Its pulse: the size between these times the floor above, the opacity between
// these. Under reduced motion it holds still at the floor, at STEADY_OPACITY.
export const TWINKLE_PULSE = Object.freeze({ min: 0.85, max: 1.0 });
export const TWINKLE_OPACITY = Object.freeze({ min: 0.6, max: 0.95 });
const STEADY_OPACITY = 0.85;
// The Twitchy Nose trail runs this far toward the find, as the collectibles'.
const NOSE_TRAIL_M = 6;

// The walk with no find (the den, the guided first walk, a room that does not
// agree, a place with no spots): it is already taken and never arrives.
export const NO_FIND = Object.freeze({
  spot: null, item: null, taken: true, worldY: 0,
  update: () => null,
  take() {},
  dispose() {},
});

// createFind(scene, { plan, item, ground, reducedMotion, onNear }) -> Find.
//   plan    planFind's { areaId, spot, roll } (spot: { id, x, z, y, look })
//   item    pickFindItem's { kind: 'wear', id } or { kind: 'pouch' }
//   onNear  runs once when she comes within CHIME_RANGE, again only after she
//           has been past CHIME_REARM (rules.js createChime)
// Find: { spot, item, worldY, taken, group, update(dt, t, frame), take(), dispose() }.
//   frame   { x, z, pawsY, camera, remotes, busy }, one object the caller
//           reuses; `remotes` are remotecats entries. `busy` stops her own
//           pick-up (a fight, a rest, a photo...), never a partner's.
//   update  -> the arrival { by: 'me' | 'partner', playerId, petName }, the
//           same object every time, or null. Hers first, then each partner
//           with a first state in (water.placed), on toPos. null once taken.
export function createFind(scene, { plan, item, ground = FLAT_GROUND, reducedMotion = false, onNear = () => {} } = {}) {
  const spot = plan.spot;
  const pose = Object.hasOwn(LOOK_POSE, spot.look) ? LOOK_POSE[spot.look] : LOOK_POSE.post;
  const worldY = ground.y(spot.x, spot.z) + (spot.y ?? 0);

  const group = new THREE.Group();
  group.name = 'find';
  group.position.set(spot.x, worldY + pose.lift, spot.z);
  const display = buildFindDisplay(item);
  display.rotation.z = pose.tilt;
  display.rotation.y = (seedFromCode(spot.id) / 2 ** 32) * 2 * Math.PI;
  group.add(display);
  const twinkle = buildTwinkle();
  twinkle.position.y = TWINKLE_LIFT;
  twinkle.visible = false;
  group.add(twinkle);
  const glow = twinkle.material;
  // The twinkle's world height (the group is never moved after this).
  const twinkleY = group.position.y + TWINKLE_LIFT;
  scene.add(group);

  const chime = createChime();
  const arrival = { by: 'me', playerId: null, petName: null };

  function arrive(by, playerId, petName) {
    arrival.by = by;
    arrival.playerId = playerId;
    arrival.petName = petName;
    return arrival;
  }

  function update(dt, t, frame) {
    if (find.taken) return null;
    const dist = Math.hypot(frame.x - spot.x, frame.z - spot.z);
    if (dist < TWINKLE_RANGE) {
      twinkle.visible = true;
      // Its size floor from the camera's distance, in scalars (no vector made).
      let floor = 1;
      const cam = frame.camera;
      if (cam) {
        twinkle.quaternion.copy(cam.quaternion);
        const cp = cam.position;
        if (cp) {
          const camDist = Math.hypot(cp.x - spot.x, cp.y - twinkleY, cp.z - spot.z);
          floor = Math.max(1, camDist / TWINKLE_FULL_AT);
        }
      }
      if (reducedMotion) {
        twinkle.scale.setScalar(floor);
        glow.opacity = STEADY_OPACITY;
      } else {
        const s = 0.5 + 0.5 * Math.sin(3.1 * t);
        twinkle.scale.setScalar(floor * (TWINKLE_PULSE.min + (TWINKLE_PULSE.max - TWINKLE_PULSE.min) * s));
        glow.opacity = TWINKLE_OPACITY.min + (TWINKLE_OPACITY.max - TWINKLE_OPACITY.min) * s;
      }
    } else {
      twinkle.visible = false;
    }
    if (chime.step(dist)) onNear();
    if (!frame.busy && catReaches(spot, worldY, frame.x, frame.z, frame.pawsY)) return arrive('me', null, null);
    const remotes = frame.remotes;
    if (remotes) {
      for (let i = 0; i < remotes.length; i++) {
        const r = remotes[i];
        if (r?.water?.placed && r.toPos && partnerReaches(spot, r.toPos.x, r.toPos.z)) {
          return arrive('partner', r.playerId, r.petName);
        }
      }
    }
    return null;
  }

  function take() {
    if (find.taken) return;
    find.taken = true;
    scene.remove(group);
    group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      if (Array.isArray(o.material)) for (const m of o.material) m.dispose();
      else o.material.dispose();
    });
  }

  const find = { spot, item, worldY, taken: false, group, update, take, dispose: take };
  return find;
}

// fixedWobble() -> a fresh run of scent.js standSniff's fixed wobble: the
// trail bends the same way every time and takes no number from the walk's
// stream.
export function fixedWobble() {
  let i = 0;
  return () => {
    i += 1;
    const v = Math.sin(i * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  };
}

// tickFindNose(session, dt, state) -> true when it laid a trail this frame.
// With the Twitchy Nose skill, standing still near the find "draws the
// buried-treasure paw prints to it": the stand-still sniff's rules
// (game/autosniff.js), toward the find, at most once every
// AUTO_SNIFF_EVERY_S, never on the frame a treasure was sniffed, and not
// while the cat is busy. Run it after tickAutoSniff, which advances
// session.walkTime. The cheap gates come first and hasSkill last. hasSkill
// builds lists, so a check it fails counts as a try (findNoseAt is set): it
// is asked again only AUTO_SNIFF_EVERY_S later, never every frame, and a cat
// who learns the skill mid-walk gets her trail within that. Only a frame that
// asks hasSkill or lays a trail allocates (its options and wobble; the
// trail's own prints are new meshes in any case).
export function tickFindNose(session, dt, state) {
  const find = session.find;
  if (!find || find.taken || !find.spot) return false;
  if (!session.scent?.trailTo) return false;
  if ((session.idleTime ?? 0) < AUTO_SNIFF_STILL_S) return false;
  const now = session.walkTime ?? 0;
  if (now - (session.findNoseAt ?? -Infinity) < AUTO_SNIFF_EVERY_S) return false;
  if (session.autoSniffAt === now) return false;
  if (session.prompt?.kind === 'dig' || session.perched || session.cameraMode || session.fight || session.rest
    || session.chasing || session.freezeTime > 0) return false;
  const pos = session.cat?.position;
  if (!pos || Math.hypot(pos.x - find.spot.x, pos.z - find.spot.z) >= NOSE_RANGE) return false;
  if (!hasSkill(state, 'twitchy-nose')) {
    session.findNoseAt = now;
    return false;
  }
  session.scent.trailTo(pos, find.spot, { maxDist: NOSE_TRAIL_M, rand: fixedWobble() });
  session.sniffTime = 1; // the nose goes down (avatar.js plays the pose)
  session.findNoseAt = now;
  return true;
}
