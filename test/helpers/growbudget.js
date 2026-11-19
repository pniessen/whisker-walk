import { budgetOf } from './growriver.js';

// =============================================================================
// Bigger areas, step 2: the most an area can put on screen with the switch on
// (world/streamcore.js's seam; the area agents use this and do not edit it).
//
// measureStreams(scene, tiles, strips, rig) takes a walk's scene as
// test/budget.test.js counts it (built, merged, casters swept) with its strip
// tiles made (render/striptiles.js) with every layer in range (ALL_LAYERS) and
// settled, so that every slot's things are there, and works out, once:
//   fixed     what is drawn whatever the cat does (everything not streamed)
//   cost      each slot's own meshes, casters and triangles, drawn in full
//   standIn   each slot's stand-in triangles
// Then at(x, z, layers) is what is drawn with the cat at (x, z) at the most
// the hysteresis allows: every slot within its layer's `hide` range in full
// and every other slot as its stand-ins. A mesh drawn in runs
// (render/runs.js) is one draw if any of its runs is drawn; the stand-ins are
// one draw for all. worstSpot() walks a grid over the bounds for the largest
// sum.
// =============================================================================

export const ALL_LAYERS = Object.freeze([
  { id: 'fine', show: 1e9, hide: 2e9 }, { id: 'small', show: 1e9, hide: 2e9 }, { id: 'trees', show: 1e9, hide: 2e9 },
]);

export function tileDistance(t, x, z) {
  const dx = x < t.minX ? t.minX - x : x > t.maxX ? x - t.maxX : 0;
  const dz = z < t.minZ ? t.minZ - z : z > t.maxZ ? z - t.maxZ : 0;
  return Math.hypot(dx, dz);
}

export function measureStreams(scene, tiles, strips, rig) {
  const inv = tiles.inventory();
  const streamed = new Set();
  for (const s of inv.slots.values()) for (const o of s.objects) streamed.add(o);
  const runMeshes = inv.runMeshes.map((r) => r.mesh);
  const runCast = new Map(inv.runMeshes.map((r) => [r.mesh, budgetOf([r.mesh], rig).casters > 0]));
  const fixedKids = scene.children.filter((c) => c !== inv.standIns.mesh && !streamed.has(c) && !runMeshes.includes(c));
  const fixed = budgetOf(fixedKids, rig);
  const cost = new Map();
  for (const [k, s] of inv.slots) {
    const b = budgetOf(s.objects, rig);
    let triangles = b.triangles;
    for (const r of s.runs) triangles += r.triangles;
    cost.set(k, { meshes: b.meshes, casters: b.casters, triangles, runs: s.runs.map((r) => r.mesh) });
  }
  const standIn = new Map();
  for (const s of strips) {
    for (const t of s.tiles) {
      for (const layer of ['fine', 'small', 'trees']) {
        const k = `${s.id}|${t.index}|${layer}`;
        standIn.set(k, inv.standIns.triangles(k));
      }
    }
  }
  const always = inv.runMeshes.reduce((n, r) => n + r.always, 0);
  const at = (x, z, layers) => {
    const sum = { meshes: fixed.meshes, casters: fixed.casters, triangles: fixed.triangles + always, standIns: 0 };
    const drawn = new Set(inv.runMeshes.filter((r) => r.always > 0).map((r) => r.mesh));
    for (const s of strips) {
      for (const layer of layers) {
        if (!(s.layerIds ?? (s.prebuilt ? ['fine', 'small', 'trees'] : ['small', 'trees'])).includes(layer.id)) continue;
        for (const t of s.tiles) {
          const k = `${s.id}|${t.index}|${layer.id}`;
          if (tileDistance(t, x, z) <= layer.hide) {
            const c = cost.get(k);
            if (!c) continue;
            sum.meshes += c.meshes; sum.casters += c.casters; sum.triangles += c.triangles;
            for (const m of c.runs) drawn.add(m);
          } else {
            sum.standIns += standIn.get(k) ?? 0;
          }
        }
      }
    }
    for (const m of drawn) { sum.meshes++; if (runCast.get(m)) sum.casters++; }
    if (sum.standIns > 0) { sum.meshes += 1; sum.triangles += sum.standIns; }
    return sum;
  };
  return { fixed, cost, standIn, always, at };
}

export function worstSpot(measure, layers, bounds, step = 5) {
  let worst = null;
  for (let x = bounds.minX; x <= bounds.maxX; x += step) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += step) {
      const s = measure.at(x, z, layers);
      if (!worst || s.triangles > worst.triangles) worst = { ...s, x, z };
    }
  }
  return worst;
}
