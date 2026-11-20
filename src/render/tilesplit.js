import * as THREE from 'three';

// =============================================================================
// Which item each triangle of a merged scatter mesh belongs to (bigger areas,
// step 2; the seam is described in world/streamcore.js).
//
// An area builds its small scatter (reeds, tussocks, flowers...) as ONE merged
// mesh, exactly as it always has, and hands in the list of things it was
// built from. With the switch on, render/striptiles.js draws that mesh in
// runs, one per tile (render/runs.js), and needs to know each triangle's
// tile: the tile its ITEM stands on. A triangle's item is the item whose
// centre is nearest its lowest vertex, less the item's own reach `r`, so a
// clump is never cut in two by a tile line. A triangle that is not within
// `reach` metres of any item (the moss on a bridge, say) is no scatter: it is
// always drawn.
// =============================================================================

const CELL = 2; // metres, the items' lookup grid

// The index of the tile (x, z) is on (the nearest, off the grid).
export function tileOf(tiles, x, z) {
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (x >= t.minX && x < t.maxX && z >= t.minZ && z < t.maxZ) return t.index;
  }
  // on the far edge of the grid, or just past it: the nearest tile
  let best = -1, bd = Infinity;
  for (const t of tiles) {
    const dx = x < t.minX ? t.minX - x : x > t.maxX ? x - t.maxX : 0;
    const dz = z < t.minZ ? t.minZ - z : z > t.maxZ ? z - t.maxZ : 0;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = t.index; }
  }
  return best;
}

/**
 * itemOwners(geometry, matrix, items, reach) -> Int32Array, one per triangle:
 * the index of the item it belongs to, or -1. `matrix` (or null) is applied
 * to the vertices first.
 */
export function itemOwners(geo, matrix, items, reach = 1.2) {
  const pos = geo.attributes.position;
  const index = geo.index;
  const triCount = (index ? index.count : pos.count) / 3;
  const grid = new Map();
  const key = (cx, cz) => `${cx},${cz}`;
  items.forEach((it, i) => {
    const span = (it.r ?? 0) + reach;
    for (let cz = Math.floor((it.z - span) / CELL); cz <= Math.floor((it.z + span) / CELL); cz++) {
      for (let cx = Math.floor((it.x - span) / CELL); cx <= Math.floor((it.x + span) / CELL); cx++) {
        const k = key(cx, cz);
        let list = grid.get(k);
        if (!list) grid.set(k, (list = []));
        list.push(i);
      }
    }
  });
  const out = new Int32Array(triCount);
  const v = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    let lx = 0, ly = Infinity, lz = 0;
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(pos, index ? index.getX(t * 3 + k) : t * 3 + k);
      if (matrix) v.applyMatrix4(matrix);
      if (v.y < ly) { ly = v.y; lx = v.x; lz = v.z; }
    }
    const list = grid.get(key(Math.floor(lx / CELL), Math.floor(lz / CELL)));
    let best = -1, bd = Infinity;
    if (list) {
      for (const i of list) {
        const it = items[i];
        const d = Math.hypot(lx - it.x, lz - it.z) - (it.r ?? 0);
        if (d < bd) { bd = d; best = i; }
      }
    }
    out[t] = best >= 0 && bd <= reach ? best : -1;
  }
  return out;
}
