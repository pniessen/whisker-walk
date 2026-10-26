// Placing furniture in the RUNNING den (v21 Stream 5, Task 6: the den shop
// moved inside the den). den.build's areaData.furniture.place swaps one spot's
// piece together with its collider, perches and hide-box; this is the walk's
// half — everything startWalk did to every prop after the build, done again
// for the one piece that changed:
//
//   * mergeStaticProps — its leaves merged per material, exactly as at build
//     (the merge is strictly within one top-level child, so merging one piece
//     on its own gives the same result as merging it in the whole scene);
//   * the contact decal — added through the rig's addStatic, using the very
//     qualifies/footprintFor rule the build-time scan used, or removed;
//   * the shadow casting — the same per-top-level-child rule as the sweep;
//   * a cat sitting on a perch that just went away is set down on the floor
//     (player.update pushes a grounded cat out of any new collider by itself);
//   * the old piece's geometry and materials freed, the way endWalk frees the
//     whole scene (shared builder geometries are safe to dispose: three
//     re-uploads them on next use, see world/builder.js's roundedBox note).
//
// The den cats are NOT re-seated: they found their places among the
// furniture at walk start and keep them until the next den visit.
import * as THREE from 'three';
import { mergeStaticProps } from '../render/mergeprops.js';
import { assignShadowCastersFor } from '../render/rig.js';

function mergeOne(mesh) {
  const holder = new THREE.Group();
  holder.add(mesh);
  mergeStaticProps(holder);
  holder.remove(mesh);
}

function free(object3d) {
  object3d.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) {
        // Same rule as endWalk: the memoised 'surface:' tiles outlive the walk.
        if (m.map && !m.map.name?.startsWith('surface:')) m.map.dispose();
        m.dispose();
      }
    }
  });
}

/**
 * applyDenSpot(session, spotId, itemId | null, { player }) → bool
 *
 * True when the running den changed. False (and nothing touched) when this is
 * not a den walk, the spot is unknown, or that piece is already there.
 */
export function applyDenSpot(session, spotId, itemId, { player } = {}) {
  const furniture = session?.areaData?.furniture;
  if (!furniture || typeof furniture.place !== 'function') return false;
  const { added, removed, removedPerches } = furniture.place(spotId, itemId ?? null, { prepare: mergeOne });
  if (!added && !removed) return false;

  if (removed) {
    session.decals?.removeStatic?.(removed);
    free(removed);
    if (session.perched && removedPerches.includes(session.perched)) {
      session.perched = null;
      if (player) {
        player.perchY = 0;
        player.halt?.();
      }
      if (session.cat) session.cat.position.y = 0;
    }
  }
  if (added) {
    assignShadowCastersFor(added);
    session.decals?.addStatic?.(added);
  }
  return true;
}
