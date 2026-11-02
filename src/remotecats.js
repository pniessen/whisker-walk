import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { wireLook } from './customcats.js';
import { wireScars } from './scars.js';
import { animateCat } from './cat/animator.js';
import { makeNameTag } from './nametag.js';
import { PERSONALITIES } from './cat/brain.js';
import { validPetName } from './net.js';
import { createWaterState, stepWaterState, shakeProgress } from './waterstate.js';
import { waterPose, applyWaterLook } from './cat/waterlook.js';
import { FLAT_GROUND, groundTilt, easeTilt } from './ground.js';

const INTERP_WINDOW = 0.15; // seconds — matches the 8Hz state broadcast cadence
const DESPAWN_AFTER = 5; // seconds of silence before a remote pet is removed

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
// under its streamed [x, z]; nothing about height rides the wire.
export function createRemoteCats(scene, { reducedMotion = false, ground = FLAT_GROUND } = {}) {
  const rm = !!reducedMotion;
  const remotes = new Map(); // playerId -> entry
  const tiltTarget = { pitch: 0, roll: 0 }; // leanOf's scratch
  // `list` is read several times a frame (main.js, avatar.js), so it hands
  // back one cached snapshot, rebuilt only when a cat joins or leaves
  // (Polish 3). A snapshot, not a live array: a holder of an older one (the
  // crossing's "who walks on with me") never sees it change underneath it.
  let listCache = null;

  // Remote profiles arrive over the network from other players' clients,
  // which may not have enforced the same validation the local client does
  // (an old build, a tampered client, a wire glitch) — whitelist breed
  // against the known personality set and petName against the same rule
  // net.js's sender-side validPetName enforces, falling back to safe
  // defaults rather than handing an unknown breed key to buildCat (which
  // would throw) or an unvalidated string into the name tag.
  function sanitizeProfile(profile) {
    const breed = Object.prototype.hasOwnProperty.call(PERSONALITIES, profile.breed)
      ? profile.breed
      : 'tabby';
    const petName = validPetName(profile.petName) ? profile.petName : 'Mystery Cat';
    const accessories =
      profile.accessories && typeof profile.accessories === 'object' ? profile.accessories : {};
    return { ...profile, breed, petName, accessories, look: wireLook(accessories) };
  }

  function upsert(rawProfile, now = defaultNow()) {
    const profile = sanitizeProfile(rawProfile);
    const existing = remotes.get(profile.playerId);
    if (existing) {
      if (profileUnchanged(existing, profile)) return existing;
      remove(profile.playerId); // rejoined with a different pet — drop the stale mesh and rebuild
    }

    // Fight moves and scars (R7): her scars ride accessories.scars, repaired
    // here; a changed scars key rebuilds through profileUnchanged above.
    const group = buildCat(profile.breed, profile.accessories, { simple: true, look: profile.look, scars: wireScars(profile.accessories) });
    const tag = makeNameTag(profile.petName);
    if (tag) {
      tag.visible = true; // remote pets are always labeled, unlike strays
      group.add(tag);
    }
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
      pose: 'follow',
      speed: 0,
      stateAt: now,
      lastSeenAt: now,
      // Not placed until its first state: until then the group sits at the
      // origin, which may well be in water, so it must not sink or shake there.
      water: { ...createWaterState(), placed: false },
      tilt: null, // its eased lean into a slope (R7), made on its first frame on raised ground
    };
    remotes.set(profile.playerId, entry);
    listCache = null;
    return entry;
  }

  function applyState(state, now = defaultNow()) {
    const entry = remotes.get(state.id);
    if (!entry) return; // state before roster upsert — drop it, roster wins the race in practice

    entry.toPos.set(state.pos[0], ground.y(state.pos[0], state.pos[1]), state.pos[1]);
    // The first state puts a new co-walker straight where it is. Sliding it in
    // from the origin would carry it through any water on the way (the Moor's
    // river-west holds the origin), and it would dip there on arrival.
    if (!entry.water.placed) entry.group.position.copy(entry.toPos);
    entry.fromPos.copy(entry.group.position);
    entry.fromYaw = entry.group.rotation.y;
    entry.toYaw = state.yaw;
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
  }

  function update(dt, now, waters = null) {
    // The cached snapshot, so a remove() mid-loop is safe and nothing is allocated.
    for (const entry of api.list) {
      if (now - entry.lastSeenAt > DESPAWN_AFTER) {
        remove(entry.playerId);
        continue;
      }

      const frac = THREE.MathUtils.clamp((now - entry.stateAt) / INTERP_WINDOW, 0, 1);
      entry.group.position.lerpVectors(entry.fromPos, entry.toPos, frac);
      const delta = wrapAngleDelta(entry.toYaw - entry.fromYaw);
      entry.group.rotation.y = entry.fromYaw + delta * frac;
      if (!entry.water.placed) {
        animateCat(entry.group, entry.pose, now, entry.speed, rm);
        continue;
      }
      const { x, z } = entry.group.position;
      stepWaterState(entry.water, waters, x, z, dt);
      const amount = Math.sin(Math.PI * shakeProgress(entry.water));
      const drawn = waterPose(entry.pose, entry.water, { hagrid: entry.breed === 'hagrid', reducedMotion: rm });
      animateCat(entry.group, drawn, now, entry.speed, rm, amount);
      applyWaterLook(entry.group, entry.water, now, dt, rm, ground.y(x, z), amount, null, ground.flat ? null : leanOf(entry, x, z, dt));
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
  };
  return api;
}
