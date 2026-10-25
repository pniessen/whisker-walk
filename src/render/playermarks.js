import * as THREE from 'three';
import { buildCarryMesh } from '../carryables.js';
import { markKey, markOpacity, MARKS_PER_AREA } from '../marks.js';

// =============================================================================
// Player marks — the renderer half of the private per-area marks (v21 Stream
// 3b). The rules live in marks.js; this draws them.
//
//   createPlayerMarks(scene, areaId, marks, { keepSlots = [] } = {})
//     → { list: [{ key, kind, mesh, contested }], sync(marks), setContested(key),
//         update(t), dispose() }
//
// THE DEN HALF (this file, Task 7). In the den, the `den` marks are what the
// player carried home. They are laid NEWEST FIRST into keepSlots[0..7] (a
// mark's stored x/z are ignored: the den lays its own table), each as
// buildCarryMesh(item) resting on the floor, faded by markOpacity(rank). The
// den keeps its own cap of eight (ruling P4), the same MARKS_PER_AREA the save
// trims to, so a ninth arriving has already pushed the oldest out of the list
// by the time sync() sees it. Any other mark kind in the den is ignored.
//
// OUTDOORS comes in Task 11: until then a non-den area builds nothing, but the
// shape above is the whole API so that task only extends it.
//
// Everything here is a scene child created per mark and disposed exactly once,
// the goldmice.js pattern. buildCarryMesh makes fresh geometry per call; the
// materials are cloned per mesh on top, so fading one item (or one part of an
// item) can never fade another. sync() rebuilds only what changed, by markKey;
// a survivor keeps its mesh and just moves to its new slot and opacity.
// =============================================================================

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// A mesh's own materials, cloned so no two meshes ever share one. buildCarryMesh
// already shares nothing between items, but a part-sharing group (one material
// across a sock's two cylinders) would fade as one, and the brief asks for one
// each. The originals are freed straight away; only the clones are ever kept.
function ownMaterials(root) {
  const originals = new Set();
  root.traverse((o) => {
    if (!o.material) return;
    if (Array.isArray(o.material)) {
      o.material.forEach((m) => originals.add(m));
      o.material = o.material.map((m) => m.clone());
    } else {
      originals.add(o.material);
      o.material = o.material.clone();
    }
  });
  originals.forEach((m) => m.dispose());
}

function setOpacity(root, opacity) {
  root.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      m.transparent = opacity < 1;
      m.opacity = opacity;
    }
  });
}

// Free every geometry and material under a mesh, once each.
function freeMesh(scene, root) {
  scene.remove(root);
  const geos = new Set();
  const mats = new Set();
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m);
    }
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
}

export function createPlayerMarks(scene, areaId, marks, { keepSlots = [] } = {}) {
  const list = [];
  let disposed = false;

  // The den marks that get a slot, newest first. Outdoors: none, for now.
  function wanted(all) {
    if (areaId !== 'den' || !Array.isArray(all)) return [];
    const seen = new Set();
    const dens = [];
    for (const m of all) {
      if (m?.kind !== 'den') continue;
      const key = markKey(m);
      if (seen.has(key)) continue;
      seen.add(key);
      dens.push(m);
    }
    // Stable sort, newest first.
    dens.sort((a, b) => b.at - a.at);
    return dens.slice(0, Math.min(MARKS_PER_AREA, keepSlots.length));
  }

  function build(mark, key) {
    const mesh = buildCarryMesh(mark.item);
    ownMaterials(mesh);
    // Rest on the floor: lift by however far it extends below its origin. Taken
    // before the yaw (turning about Y never changes the lowest point).
    const box = new THREE.Box3().setFromObject(mesh);
    const lift = Number.isFinite(box.min.y) ? -box.min.y : 0;
    // A fixed turn per keepsake, from the mark itself, so the table is not a
    // row of identical bearings. No random draw: a reload lays it the same way.
    mesh.rotation.y = (hash(key) % 628) / 100;
    mesh.userData.lift = lift;
    scene.add(mesh);
    return { key, kind: mark.kind, mesh, contested: mark.contested === true };
  }

  function place(entry, rank) {
    const slot = keepSlots[rank];
    entry.mesh.position.set(slot.x, (slot.y ?? 0) + entry.mesh.userData.lift, slot.z);
    setOpacity(entry.mesh, markOpacity(rank));
  }

  function sync(next) {
    if (disposed) return;
    const want = wanted(next);
    const byKey = new Map(list.map((e) => [e.key, e]));
    const keep = new Set(want.map(markKey));
    for (const e of list) {
      if (!keep.has(e.key)) freeMesh(scene, e.mesh);
    }
    list.length = 0;
    want.forEach((m, rank) => {
      const key = markKey(m);
      let entry = byKey.get(key);
      if (!entry) entry = build(m, key);
      entry.contested = m.contested === true;
      place(entry, rank);
      list.push(entry);
    });
  }

  sync(marks);

  return {
    list,
    sync,
    // A contested mark changes appearance, never goes away. A den keepsake is
    // never contested (marks.js refuses it), so for now this only records it.
    setContested(key) {
      const e = list.find((x) => x.key === key);
      if (e) e.contested = true;
    },
    // Nothing in the den moves; the outdoor half (Task 11) animates here.
    update() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const e of list) freeMesh(scene, e.mesh);
      list.length = 0;
    },
  };
}
