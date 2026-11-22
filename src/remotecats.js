import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { wireLook } from './customcats.js';
import { wireScars } from './scars.js';
import { animateCat } from './cat/animator.js';
import { aimHead } from './cat/headaim.js';
import { makeNameTag } from './nametag.js';
import { PERSONALITIES } from './cat/brain.js';
import { safeRemoteName } from './net.js';
import { createWaterState, stepWaterState, shakeProgress } from './waterstate.js';
import { waterPose, applyWaterLook } from './cat/waterlook.js';
import { FLAT_GROUND, groundTilt, easeTilt } from './ground.js';

const INTERP_WINDOW = 0.15; // seconds — matches the 8Hz state broadcast cadence
const DESPAWN_AFTER = 5; // seconds of silence before a remote pet is removed
// The highest a co-walker is ever drawn above the ground under her (the top of
// the big wheel is about 12 m): a bigger `h` on the wire is cut to this.
export const MAX_LIFT = 20;
const SEAT_ID = /^[a-z]+(-[a-z]+)*(-\d{1,2})?$/; // a ride seat's id: 'mgr-horse-3', 'coaster-car-0', 'wheel-lookout'

// HEIGHT ON THE WIRE (partner-height, 2026-11-20). Two optional fields on the
// 8 Hz state message, both left out when they say nothing, so a cat on the
// ground sends exactly what she always did:
//   h     metres above the ground under her (her perch, roof or seat), to the cm
//   seat  the id of the ride seat she is on (src/fairsim.js), while she is on one
// net.js's state check reads only the fields it knows, so a build from before
// these accepts the message and draws her on the ground, as it always has; a
// message from such a build has neither, and she is drawn on the ground here.
// A seat is drawn where THIS device's rides have it (the rides are a pure
// function of the time, the same on both), so she moves with the horse or the
// car smoothly every frame instead of jumping between 8 Hz samples. The
// helter-skelter's chute is not sent: each device runs its own slide.
export function liftForState(perchY, seat) {
  const out = {};
  if (Number.isFinite(perchY) && perchY >= 0.005) out.h = Math.round(Math.min(perchY, MAX_LIFT) * 100) / 100;
  if (seat && typeof seat.id === 'string' && seat.rideId !== 'slide') out.seat = seat.id;
  return out;
}
const liftOf = (state) => (Number.isFinite(state.h) ? Math.min(Math.max(state.h, 0), MAX_LIFT) : 0);
const seatOf = (state) => (typeof state.seat === 'string' && state.seat.length <= 24 && SEAT_ID.test(state.seat) ? state.seat : null);

// wrap an angle delta into (-PI, PI] so yaw interpolation always takes the
// short way around, e.g. from 3.1 to -3.1 goes forward ~0.08 rad, not ~6.2.
function wrapAngleDelta(delta) {
  return (((delta + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

const defaultNow = () => performance.now() / 1000;

// mirrors endWalk's scene-teardown traversal in main.js — dispose every
// geometry/material (and any material.map, which covers the name-tag's
// CanvasTexture) reachable from a detached group so despawning/replacing a
// remote pet doesn't leak GPU resources across joins/leaves.
function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
}

function accessoriesKey(accessories) {
  try {
    return JSON.stringify(accessories ?? null);
  } catch {
    return String(accessories);
  }
}

function profileUnchanged(entry, profile) {
  return (
    entry.breed === profile.breed &&
    entry.petName === profile.petName &&
    accessoriesKey(entry.accessories) === accessoriesKey(profile.accessories)
  );
}

// createRemoteCats(scene) -> remotes
//
// Renders other players' pets during a co-walk. Each remote pet is built
// once on first sight (upsert, driven by net.onRoster) and then driven
// purely by interpolating toward the most recent network state
// (applyState, driven by net.onState) — never by local input. Despawns
// itself if a player's state goes quiet for DESPAWN_AFTER seconds (covers
// both a clean leave, reported via remove(), and a silent drop).
//
// Swimming (Task 6): a remote only LOOKS wet. Nothing new is on the wire;
// each entry runs its own water state from where it is drawn, against the
// `waters` update() is given (null: always dry, the old look). Its shake and
// bob follow THIS viewer's reducedMotion (the ruling), a snapshot taken at
// the start of the walk.
// `ground` (Gorge part 1, R13): a co-walker stands at THIS device's ground
// under its streamed [x, z], lifted by the `h` she sends (liftForState above).
export function createRemoteCats(scene, { reducedMotion = false, ground = FLAT_GROUND } = {}) {
  const rm = !!reducedMotion;
  const remotes = new Map(); // playerId -> entry
  const tiltTarget = { pitch: 0, roll: 0 }; // leanOf's scratch
  // `list` is read several times a frame (main.js, avatar.js), so it hands
  // back one cached snapshot, rebuilt only when a cat joins or leaves
  // (Polish 3). A snapshot, not a live array: a holder of an older one (the
  // crossing's "who walks on with me") never sees it change underneath it.
  let listCache = null;
  // F6 (R16): the cats that have had a first state, the ones drawn (the
  // corner map's dots and the flaps they push read this). Cached like `list`,
  // rebuilt when a cat joins, leaves or is first placed.
  let placedCache = null;

  // Remote profiles arrive over the network from other players' clients,
  // which may not have enforced the same validation the local client does
  // (an old build, a tampered client, a wire glitch) — whitelist breed
  // against the known personality set and petName against the same rule
  // net.js's safeRemoteName enforces (validPetName and more), falling back to safe
  // defaults rather than handing an unknown breed key to buildCat (which
  // would throw) or an unvalidated string into the name tag.
  function sanitizeProfile(profile) {
    const breed = Object.prototype.hasOwnProperty.call(PERSONALITIES, profile.breed)
      ? profile.breed
      : 'tabby';
    const petName = safeRemoteName(profile.petName);
    const accessories =
      profile.accessories && typeof profile.accessories === 'object' ? profile.accessories : {};
    return { ...profile, breed, petName, accessories, look: wireLook(accessories) };
  }

  function upsert(rawProfile, now = defaultNow()) {
    const profile = sanitizeProfile(rawProfile);
    const existing = remotes.get(profile.playerId);
    if (existing && profileUnchanged(existing, profile)) return existing;
    // a new look (a find put on mid-walk) or a rejoin with a different pet:
    // the stale mesh is dropped (below, once the new one is built) and the cat
    // rebuilt. `existing` is kept to start the new cat where the old one stood.

    // Fight moves and scars (R7): her scars ride accessories.scars, repaired
    // here; a changed scars key rebuilds through profileUnchanged above.
    const group = buildCat(profile.breed, profile.accessories, { simple: true, look: profile.look, scars: wireScars(profile.accessories) });
    const tag = makeNameTag(profile.petName);
    if (tag) {
      tag.userData.partner = true; // bigger on a phone (nametag.js)
      tag.visible = true; // remote pets are always labeled, unlike strays
      group.add(tag);
    }
    // F6 (R16): not drawn until its first state places it (applyState), so a
    // co-walker still loading its place never stands frozen at the origin.
    // Its name tag is a child of the group and hides with it.
    group.visible = false;
    scene.add(group);

    const entry = {
      playerId: profile.playerId,
      petName: profile.petName,
      breed: profile.breed,
      accessories: profile.accessories,
      look: profile.look,
      group,
      tag,
      fromPos: new THREE.Vector3(0, 0, 0),
      toPos: new THREE.Vector3(0, 0, 0),
      fromYaw: 0,
      toYaw: 0,
      // her height above the ground (liftForState): drawn, eased from, eased to
      h: 0,
      fromH: 0,
      toH: 0,
      seatId: null, // the ride seat she is on, drawn where this device's rides have it
      seatAt: 0, // when she got onto it: from then she is eased onto it once, not at every state
      seatFrom: { x: 0, z: 0, h: 0, yaw: 0 }, // where she was drawn then
      pose: 'follow',
      speed: 0,
      lookAt: null, // where her head turns to look, or null (set by this device's Market, marketlive.js; never sent)
      stateAt: now,
      lastSeenAt: now,
      // Not placed until its first state: until then the group sits at the
      // origin, which may well be in water, so it must not sink or shake there.
      water: { ...createWaterState(), placed: false },
      tilt: null, // its eased lean into a slope (R7), made on its first frame on raised ground
    };
    // Found outfits step 1: a rebuilt cat carries on from the old one's
    // stride: where it stood, which way it faced, the move it was making and
    // its water state (still placed, so it never slides in from the origin).
    // Its lean is made again from its first frame on raised ground.
    if (existing) {
      // Every sprite the walk hung on the old cat that is not its own name tag
      // (a chat bubble, chatbubble.js) moves to the new one before the old is
      // dropped, as cat/redress.js keeps them on her own cat: a line she had
      // just said stays over her head for the rest of its time.
      for (const child of [...existing.group.children]) {
        if (child.isSprite && child !== existing.tag) group.add(child); // add() takes it off the old group
      }
      remove(profile.playerId);
      group.position.copy(existing.group.position);
      group.rotation.y = existing.group.rotation.y;
      entry.fromPos.copy(existing.fromPos);
      entry.toPos.copy(existing.toPos);
      entry.fromYaw = existing.fromYaw;
      entry.toYaw = existing.toYaw;
      entry.h = existing.h;
      entry.fromH = existing.fromH;
      entry.toH = existing.toH;
      entry.seatId = existing.seatId;
      entry.seatAt = existing.seatAt;
      entry.seatFrom = existing.seatFrom;
      entry.pose = existing.pose;
      entry.speed = existing.speed;
      entry.stateAt = existing.stateAt;
      entry.lastSeenAt = existing.lastSeenAt;
      entry.water = existing.water;
      group.visible = existing.water.placed; // shown as it was
    }
    remotes.set(profile.playerId, entry);
    listCache = null;
    placedCache = null;
    return entry;
  }

  function applyState(state, now = defaultNow()) {
    const entry = remotes.get(state.id);
    if (!entry) return; // state before roster upsert — drop it, roster wins the race in practice

    entry.toPos.set(state.pos[0], ground.y(state.pos[0], state.pos[1]), state.pos[1]);
    // The first state puts a new co-walker straight where it is. Sliding it in
    // from the origin would carry it through any water on the way (the Moor's
    // river-west holds the origin), and it would dip there on arrival.
    entry.toH = liftOf(state);
    // ...and at her height: first seen on a roof or a seat, she does not rise out of the ground
    if (!entry.water.placed) {
      entry.group.position.copy(entry.toPos);
      entry.h = entry.toH;
      entry.group.visible = true;
      placedCache = null;
    }
    entry.fromPos.copy(entry.group.position);
    entry.fromYaw = entry.group.rotation.y;
    entry.toYaw = state.yaw;
    entry.fromH = entry.h;
    const seat = seatOf(state);
    if (seat !== entry.seatId) {
      // onto a new seat (or off one): eased from where she is drawn now
      entry.seatId = seat;
      entry.seatAt = now;
      const f = entry.seatFrom;
      f.x = entry.group.position.x; f.z = entry.group.position.z; f.h = entry.h; f.yaw = entry.group.rotation.y;
    }
    entry.pose = state.pose;
    entry.speed = state.speed;
    entry.stateAt = now;
    entry.lastSeenAt = now;
    entry.water.placed = true;
  }

  // Every way a remote leaves the scene runs through remove(), and callers
  // reach it only through upsert/remove/update. In a walk those three are
  // wrapped by game/netevents.js's takeHeldItemsWithRemotes, which hides
  // whatever the departed cat was carrying so carryables never follows a
  // disposed group. A new public path that removes a remote must be added to
  // that wrapper too. dispose() is walk teardown, after carryables is gone.
  function remove(playerId) {
    const entry = remotes.get(playerId);
    if (!entry) return;
    scene.remove(entry.group);
    disposeGroup(entry.group);
    remotes.delete(playerId);
    listCache = null;
    placedCache = null;
  }

  // update(dt, now, waters, rides): `rides` is the walk's Fairground rides
  // (src/fairlive.js seatById; NO_FAIR elsewhere), for a co-walker on a seat.
  function update(dt, now, waters = null, rides = null) {
    // The cached snapshot, so a remove() mid-loop is safe and nothing is allocated.
    for (const entry of api.list) {
      if (now - entry.lastSeenAt > DESPAWN_AFTER) {
        remove(entry.playerId);
        continue;
      }

      const frac = THREE.MathUtils.clamp((now - entry.stateAt) / INTERP_WINDOW, 0, 1);
      // On a ride's seat: eased onto the seat where this device's ride has it
      // now, and from then on carried with it every frame.
      const seat = entry.seatId && rides?.seatById ? rides.seatById(entry.seatId) : null;
      if (seat) {
        // eased once, from where she was drawn as she got on (not again at every state: the seat moves on)
        const k = THREE.MathUtils.clamp((now - entry.seatAt) / INTERP_WINDOW, 0, 1);
        const f = entry.seatFrom;
        const p = entry.group.position;
        p.x = f.x + (seat.x - f.x) * k;
        p.z = f.z + (seat.z - f.z) * k;
        entry.h = f.h + (seat.y - f.h) * k;
        entry.group.rotation.y = f.yaw + wrapAngleDelta(seat.yaw - f.yaw) * k;
      } else {
        entry.group.position.lerpVectors(entry.fromPos, entry.toPos, frac);
        entry.h = entry.fromH + (entry.toH - entry.fromH) * frac;
        const delta = wrapAngleDelta(entry.toYaw - entry.fromYaw);
        entry.group.rotation.y = entry.fromYaw + delta * frac;
      }
      if (!entry.water.placed) {
        animateCat(entry.group, entry.pose, now, entry.speed, rm);
        aimHead(entry.group, entry.lookAt, dt, entry.pose, entry.speed);
        continue;
      }
      const { x, z } = entry.group.position;
      // up on a perch or a seat she is dry, whatever is under her
      const up = entry.h > 0.05 || !!seat;
      stepWaterState(entry.water, up ? null : waters, x, z, dt);
      const amount = Math.sin(Math.PI * shakeProgress(entry.water));
      const drawn = waterPose(entry.pose, entry.water, { hagrid: entry.breed === 'hagrid', reducedMotion: rm });
      animateCat(entry.group, drawn, now, entry.speed, rm, amount);
      aimHead(entry.group, entry.lookAt, dt, drawn, entry.speed);
      applyWaterLook(entry.group, entry.water, now, dt, rm, ground.y(x, z) + entry.h, amount, null, ground.flat || up ? null : leanOf(entry, x, z, dt));
    }
  }

  // A co-walker's lean into the slope under it (R7), eased at TILT_RATE like
  // her own cat's; made at the slope's tilt the first time, then reused.
  function leanOf(entry, x, z, dt) {
    groundTilt(ground, x, z, entry.group.rotation.y, tiltTarget);
    if (!entry.tilt) {
      entry.tilt = { pitch: tiltTarget.pitch, roll: tiltTarget.roll };
      return entry.tilt;
    }
    return easeTilt(entry.tilt, tiltTarget, dt);
  }

  function nearest(pos, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const entry of remotes.values()) {
      if (!entry.water.placed) continue; // not drawn yet: nothing to reach
      const d = entry.group.position.distanceTo(pos);
      if (d < bestD) {
        bestD = d;
        best = entry;
      }
    }
    return best;
  }

  function dispose() {
    for (const playerId of Array.from(remotes.keys())) remove(playerId);
  }

  const api = {
    upsert,
    applyState,
    remove,
    update,
    nearest,
    dispose,
    get list() {
      return (listCache ??= Array.from(remotes.values()));
    },
    get placed() {
      return (placedCache ??= api.list.filter((e) => e.water.placed));
    },
  };
  return api;
}
