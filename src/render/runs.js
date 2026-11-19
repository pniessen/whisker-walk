import * as THREE from 'three';

// =============================================================================
// One mesh, drawn in runs (bigger areas, step 2).
//
// A merged mesh whose triangles are grouped by key (a tile, say): its index is
// rewritten so each key's triangles are one run, and only the runs that are
// shown are drawn. ONE draw call however many tiles are in range, and not a
// vertex is copied or moved: the vertex buffers are the mesh's own; only the
// order of the index changes, and how much of it is drawn.
//
// show(key, on) marks a run; update() writes the shown runs, in a fixed
// order, to the front of the index and draws that much (once in a frame, and
// only when something changed). No allocation after it is made.
// =============================================================================

/**
 * createRuns(mesh, runOf) -> { show, shown, has, triangles, update, drawnTriangles, keys }
 *
 *   mesh    a Mesh (one material, no groups). Its geometry's index is replaced;
 *           a geometry with none is given one.
 *   runOf   (triangle) -> a run's key, or null for a triangle always drawn
 *
 * Every run starts hidden; a mesh with nothing to draw is made invisible.
 */
export function createRuns(mesh, runOf) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const src = geo.index;
  const triCount = (src ? src.count : pos.count) / 3;
  const vert = (t, k) => (src ? src.getX(t * 3 + k) : t * 3 + k);
  // the runs, in first-seen order; the always-drawn triangles first of all
  const byKey = new Map();
  const always = [];
  for (let t = 0; t < triCount; t++) {
    const key = runOf(t);
    if (key === null || key === undefined) { always.push(t); continue; }
    let list = byKey.get(key);
    if (!list) byKey.set(key, (list = []));
    list.push(t);
  }
  const big = pos.count > 65535;
  const all = big ? new Uint32Array(triCount * 3) : new Uint16Array(triCount * 3);
  const live = big ? new Uint32Array(triCount * 3) : new Uint16Array(triCount * 3);
  let w = 0;
  const write = (list) => { for (const t of list) for (let k = 0; k < 3; k++) all[w++] = vert(t, k); };
  write(always);
  const fixed = w;
  const runs = new Map();
  const order = [];
  for (const [key, list] of byKey) {
    const start = w;
    write(list);
    const r = { key, start, count: w - start, on: false };
    runs.set(key, r);
    order.push(r);
  }
  for (let i = 0; i < fixed; i++) live[i] = all[i];
  const idx = new THREE.BufferAttribute(live, 1);
  idx.setUsage(THREE.DynamicDrawUsage);
  geo.setIndex(idx);
  geo.clearGroups();
  let dirty = true;
  let drawn = fixed;
  geo.setDrawRange(0, fixed);
  mesh.visible = fixed > 0;
  return {
    get drawnTriangles() { return drawn / 3; },
    get alwaysTriangles() { return fixed / 3; },
    keys: () => [...runs.keys()],
    show(key, on) {
      const r = runs.get(key);
      if (!r || r.on === !!on) return;
      r.on = !!on;
      dirty = true;
    },
    shown: (key) => !!runs.get(key)?.on,
    has: (key) => runs.has(key),
    triangles: (key) => (runs.get(key)?.count ?? 0) / 3,
    update() {
      if (!dirty) return false;
      dirty = false;
      let n = fixed;
      for (let k = 0; k < order.length; k++) {
        const r = order[k];
        if (!r.on) continue;
        for (let i = 0; i < r.count; i++) live[n + i] = all[r.start + i];
        n += r.count;
      }
      drawn = n;
      geo.setDrawRange(0, n);
      idx.clearUpdateRanges?.();
      if (n > fixed) idx.addUpdateRange?.(fixed, n - fixed);
      idx.needsUpdate = true;
      mesh.visible = n > 0;
      return true;
    },
    // everything shown at once, for a shader compile
    showAll() {
      for (const r of order) r.on = true;
      dirty = true;
    },
  };
}
