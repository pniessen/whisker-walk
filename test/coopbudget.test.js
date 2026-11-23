import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { triangles, meshCount, PRESETS } from './helpers/catfingerprint.js';

stubCanvasDocument();

const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { build: buildFair } = await import('../src/world/fair.js');
const { buildCat } = await import('../src/cat/model.js');
const { CATALOG } = await import('../src/progression.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');

// Couch play (docs/superpowers/specs/2026-11-22-couch-coop-design.md, section
// 10): the second cat is a SIMPLE cat, and no place ceiling is raised. This
// pins the scene a couch walk draws: the place, the full cat and the simple
// cat, each in the heaviest outfit there is (the heaviest accessory of every
// slot, found outfits included, on the heaviest breed: d2 in the fisherman's
// jumper). Measured at milestone 0 (2026-11-22); every number below is the
// measurement plus 5%, rounded up.
//
// THE SPEC'S CAP ARITHMETIC WAS LOW. It added the cats' own caps (10,350 full,
// 5,500 simple) and got +17,000 triangles. Those caps are for the bare cat;
// accessories are extra and a simple cat wears them in full (the jumper alone
// is +1,270 on a simple cat, a hoodie +1,636, a jetpack +644):
//
//   cat, bare -> heaviest outfit   triangles           meshes
//   full                           9,528  -> 16,588    55 (d2)
//   simple                         5,016  -> 10,008    51 (d2)
//   both                                    26,596    106
//
//   scene (place alone)      triangles  meshes  casters   with both cats: triangles  meshes  casters
//   neighborhood               40,386     402     326                    66,982      508     432
//   docks                      76,938     527     426                   103,534      633     532
//   fair                       68,572     175     109                    95,168      281     215
//
// Casters with the cats count every cat mesh (the worst case). Cat 1 is in
// today's scene already; couch play adds only cat 2, the simple cat.
// Place ceilings (budget.test.js: 70k / 90k / 75k) are untouched.
// Re-measure with `COOP_BUDGET_REPORT=1 npx vitest run test/coopbudget.test.js`.

/** The heaviest accessory of each slot, by triangles added to a tabby. */
function heaviestOutfit() {
  const bySlot = {};
  for (const [id, a] of Object.entries(CATALOG.accessories)) (bySlot[a.slot] ||= []).push(id);
  const outfit = {};
  for (const [slot, ids] of Object.entries(bySlot)) {
    let best = null, bestT = -1;
    for (const id of ids) {
      const t = triangles(buildCat('tabby', { [slot]: id }));
      if (t > bestT) { best = id; bestT = t; }
    }
    outfit[slot] = best;
  }
  return outfit;
}

function stats(root) {
  let meshes = 0, casters = 0, tris = 0;
  const box = new THREE.Box3();
  for (const child of root.children) {
    box.setFromObject(child);
    const eligible = castsFromBox(box);
    child.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      if (eligible && !isTransparentMat(o.material) && !o.userData.noCast) casters++;
    });
  }
  return { meshes, casters, triangles: Math.round(tris) };
}

const OUTFIT = heaviestOutfit();
const heaviestCat = (opts) => {
  let best = null;
  for (const breed of PRESETS) {
    const cat = buildCat(breed, OUTFIT, opts);
    const t = triangles(cat);
    if (!best || t > best.t) best = { t, m: meshCount(cat), breed };
  }
  return best;
};
const FULL = heaviestCat();
const SIMPLE = heaviestCat({ simple: true });

// name, builder, then the ceilings for place + both cats: triangles, meshes, casters
const SCENES = [
  ['neighborhood', buildNeighborhood, 70350, 534, 454],
  ['docks', buildDocks, 108750, 665, 559],
  ['fair', buildFair, 99950, 296, 226],
];

describe('couch play: place + full cat + simple cat, heaviest outfits', () => {
  it('the outfit is one accessory in every slot', () => {
    expect(Object.keys(OUTFIT).sort()).toEqual(['back', 'body', 'collar', 'face', 'feet', 'head', 'neck']);
  });

  it('each cat in the heaviest outfit stays inside its measured ceiling', () => {
    expect(FULL.t).toBeLessThanOrEqual(17420); // measured 16,588
    expect(FULL.m).toBeLessThanOrEqual(58); // 55
    expect(SIMPLE.t).toBeLessThanOrEqual(10510); // 10,008: the second cat's whole bill
    expect(SIMPLE.m).toBeLessThanOrEqual(54); // 51
  });

  it('the bare cats are still inside their own caps (the numbers above are outfits on top)', () => {
    expect(triangles(buildCat('d2'))).toBeLessThanOrEqual(10350);
    expect(triangles(buildCat('d2', undefined, { simple: true }))).toBeLessThanOrEqual(5500);
  });

  for (const [name, build, triCeil, meshCeil, casterCeil] of SCENES) {
    it(`${name}: place + both cats stays under ${triCeil} triangles, ${meshCeil} meshes, ${casterCeil} casters`, () => {
      const scene = new THREE.Scene();
      build(scene);
      const place = stats(scene);
      const total = { triangles: place.triangles + FULL.t + SIMPLE.t, meshes: place.meshes + FULL.m + SIMPLE.m, casters: place.casters + FULL.m + SIMPLE.m };
      if (process.env.COOP_BUDGET_REPORT) console.log(name, place, total);
      expect(total.triangles).toBeLessThanOrEqual(triCeil);
      expect(total.meshes).toBeLessThanOrEqual(meshCeil);
      expect(total.casters).toBeLessThanOrEqual(casterCeil);
    });
  }
});
