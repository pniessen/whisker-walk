import * as THREE from 'three';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { makeNameTag } from './nametag.js';

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
export function createRemoteCats(scene) {
  const remotes = new Map(); // playerId -> entry

  function upsert(profile, now = defaultNow()) {
    const existing = remotes.get(profile.playerId);
    if (existing) {
      if (profileUnchanged(existing, profile)) return existing;
      remove(profile.playerId); // rejoined with a different pet — drop the stale mesh and rebuild
    }

    const group = buildCat(profile.breed, profile.accessories, { simple: true });
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
    };
    remotes.set(profile.playerId, entry);
    return entry;
  }

  function applyState(state, now = defaultNow()) {
    const entry = remotes.get(state.id);
    if (!entry) return; // state before roster upsert — drop it, roster wins the race in practice

    entry.fromPos.copy(entry.group.position);
    entry.toPos.set(state.pos[0], 0, state.pos[1]);
    entry.fromYaw = entry.group.rotation.y;
    entry.toYaw = state.yaw;
    entry.pose = state.pose;
    entry.speed = state.speed;
    entry.stateAt = now;
    entry.lastSeenAt = now;
  }

  function remove(playerId) {
    const entry = remotes.get(playerId);
    if (!entry) return;
    scene.remove(entry.group);
    disposeGroup(entry.group);
    remotes.delete(playerId);
  }

  function update(dt, now) {
    for (const entry of Array.from(remotes.values())) {
      if (now - entry.lastSeenAt > DESPAWN_AFTER) {
        remove(entry.playerId);
        continue;
      }

      const frac = THREE.MathUtils.clamp((now - entry.stateAt) / INTERP_WINDOW, 0, 1);
      entry.group.position.lerpVectors(entry.fromPos, entry.toPos, frac);
      const delta = wrapAngleDelta(entry.toYaw - entry.fromYaw);
      entry.group.rotation.y = entry.fromYaw + delta * frac;
      animateCat(entry.group, entry.pose, now, entry.speed);
    }
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

  return {
    upsert,
    applyState,
    remove,
    update,
    nearest,
    dispose,
    get list() {
      return Array.from(remotes.values());
    },
  };
}
