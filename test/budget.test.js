import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (test/neighborhood.js,
// test/park.js, ...): the world builders touch the DOM in exactly two places
// (document.createElement('canvas') for the billboard poster, and
// render/textures.js's tile painters), and the painters read back their own
// canvas via getImageData, so a blanket no-op Proxy isn't enough — it has to
// answer getImageData with something clampToFloor can iterate.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { build: buildSeaside } = await import('../src/world/seaside.js');
const { build: buildDen } = await import('../src/world/den.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');

// ---------------------------------------------------------------------------
// Wave 3.4 (docs/VISUAL-PASS.md): lock the draw-call budget in with a test, so
// a future density pass trips over a failing assertion instead of quietly
// spending the headroom Wave 3.3 just recovered.
//
// THREE CEILINGS, DELIBERATELY SIZED DIFFERENTLY. That asymmetry — tight on
// meshes, looser on casters, loose on triangles — IS the whole strategy from
// docs/VISUAL-PASS.md section 0, written down here so it can't be forgotten:
//
//   * MESH COUNT is the real budget, and its ceiling is the tightest one.
//     Section 0's measurement is unambiguous: this scene is draw-call bound,
//     not triangle bound, and one mesh is still roughly one draw call in the
//     main pass. A future prop pass that wants to add meshes should have to
//     make a conscious budget decision, not sail past an assertion nobody
//     wrote. Wave 3.1's merge (see the second describe block at the bottom of
//     this file) then folds a share of these away again — but it can only
//     merge what SHARES a material inside one prop, so authoring a prop out of
//     ten differently-tinted panels still costs ten draws and still has to
//     clear this ceiling.
//   * SHADOW-CASTER COUNT is the thing Wave 3.3 just reduced (see
//     applyShadowCasting-equivalent predicate below, mirroring
//     src/game/walk.js), and it gets a ceiling with a little more headroom
//     than the mesh ceiling but is still meant to bite: it exists so a future
//     pass that adds large, opaque, standing props (which DO legitimately
//     keep casting) can't silently regress the whole area back to
//     "everything casts" by adding them one at a time under the mesh
//     ceiling's radar.
//   * TRIANGLE COUNT is nearly free at this scene's scale (a mid-range phone
//     GPU chews through far more than this in a frame) and gets a generous
//     ceiling on purpose — the plan (Wave 4) wants room to spend triangles on
//     bevels and segment counts precisely BECAUSE meshes and casters are the
//     scarce resource and triangles are not. A tight triangle ceiling here
//     would fight the next wave for no measured benefit.
//
// WHY THIS DUPLICATES THE PREDICATE INSTEAD OF IMPORTING WALK.JS. Every
// existing wiring test that pins something inside src/game/walk.js
// (test/shadowfit.test.js, test/contactshadows.test.js) reads walk.js's
// SOURCE TEXT with readFileSync rather than importing it, because walk.js's
// import graph pulls in the chat UI, audio and the rest of the live game —
// far more than a headless area-build test wants to bootstrap. This file
// follows that same convention for its own reason: it needs the caster rule
// evaluated against a bare `build(scene)` (world props only — no cat, no
// critters, no strays, no contact decals, all of which are wired up later in
// startWalk, not by the area builder), which is a different call shape than
// anything walk.js exports. The predicate below is a literal copy of the one
// in src/game/walk.js's shadow-casting sweep (same three constants, same
// per-top-level-child bounding-box logic, same transparency check) — if the
// two drift, this test is measuring the wrong rule, so keep them in sync by
// hand when either changes.
//
// WHY THE NUMBERS ARE WHAT THEY ARE. Measured directly off `build(scene)` for
// each area (no walk.js session, matching what test/neighborhood.test.js,
// test/park.test.js etc. already measure), while a concurrent density/segment
// pass was landing in world/builder.js — meshes and casters were stable
// across repeated measurements (expected: raising a cylinder's segment count
// or adding a box bevel changes triangles, not mesh count), but triangle
// counts moved noticeably between runs:
//
//   area          meshes  casters  triangles (as measured)
//   neighborhood     380      313      ~22300
//   park             171      133      ~13200
//   docks            519      423      ~34100
//   seaside           64       32       ~8700
//   den              284      173      ~13600
//
// Ceilings below sit at roughly +15-20% over the measured mesh count and
// +20-40% over the measured caster count (a little looser, per the bullet
// above, and proportionally looser still for the smaller areas so a handful
// of props doesn't trip the test on rounding). Triangles get roughly 2.5-3x
// the ABOVE already-elevated numbers, deliberately: Wave 4 of this same plan
// (docs/VISUAL-PASS.md) exists specifically to spend triangles here — rounded
// box bevels, higher segment counts on trunks/bollards/lamp globes, a
// horizon band — and none of it should have to renegotiate this ceiling.
// ---------------------------------------------------------------------------

const CAST_FLAT_HEIGHT = 0.12;
const CAST_TALL_HEIGHT = 1.3;
const CAST_WIDE_SPAN = 1.0;

function isTransparentMat(material) {
  return Array.isArray(material) ? material.some(isTransparentMat) : !!material?.transparent;
}

// Mirrors src/game/walk.js's shadow-casting sweep exactly, minus the
// userData.contactDecal exclusion (a bare area build never contains the
// contact-shadow InstancedMeshes — those are added later, by
// render/contactshadows.js, from within startWalk, not by the area builder).
function budgetStats(scene) {
  let meshes = 0;
  let casters = 0;
  let triangles = 0;
  const box = new THREE.Box3();
  for (const child of scene.children) {
    box.setFromObject(child);
    let eligible = false;
    if (!box.isEmpty()) {
      const height = box.max.y - box.min.y;
      const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      eligible = height >= CAST_FLAT_HEIGHT
        && (height >= CAST_TALL_HEIGHT || span >= CAST_WIDE_SPAN);
    }
    child.traverse((obj) => {
      if (!obj.isMesh) return;
      meshes++;
      const geo = obj.geometry;
      const vertexCount = geo.index ? geo.index.count : geo.attributes.position.count;
      triangles += vertexCount / 3;
      if (eligible && !isTransparentMat(obj.material)) casters++;
    });
  }
  return { meshes, casters, triangles: Math.round(triangles) };
}

const AREAS = [
  // name, builder, [meshCeiling, casterCeiling, triangleCeiling]
  ['neighborhood', buildNeighborhood, 450, 380, 60000],
  ['park', buildPark, 210, 170, 40000],
  ['docks', buildDocks, 600, 500, 90000],
  ['seaside', buildSeaside, 85, 45, 30000],
  ['den', buildDen, 340, 220, 40000],
];

// ---------------------------------------------------------------------------
// WAVE 3.1's half of the same budget.
//
// The ceilings above measure `build(scene)`, which is what the area builders
// author and what a density pass edits — and merging is deliberately NOT part
// of that: game/walk.js runs render/mergeprops.js over the built scene, after
// the contact-decal scan and before anything animated joins it. So the numbers
// above did not move when 3.1 landed, and should not.
//
// What DID move is what the renderer is actually handed, and that needs its
// own ceiling or the win is unprotected: a future prop that merges badly (a
// per-prop material tint where a shared colour would do, say) would cost draw
// calls while sailing under the build-time ceilings. Measured post-merge:
//
//   area          meshes  casters   (from, unmerged)
//   neighborhood     218      169    381 / 314
//   park             113       89    172 / 134
//   docks            312      233    520 / 424
//   seaside           48       28     65 /  33
//   den              151       86    284 / 173
//
// Same +15-20% headroom rule as above. Note casters fall at least as fast as
// meshes everywhere, which is the point: a merged mesh that was a caster is
// one shadow-pass draw instead of several.
// ---------------------------------------------------------------------------

const MERGED_AREAS = [
  // name, builder, [meshCeiling, casterCeiling]
  ['neighborhood', buildNeighborhood, 260, 205],
  ['park', buildPark, 140, 110],
  ['docks', buildDocks, 370, 280],
  ['seaside', buildSeaside, 60, 40],
  ['den', buildDen, 185, 110],
];

describe('Wave 3.1 — per-area budget as the renderer actually sees it', () => {
  for (const [name, build, meshCeiling, casterCeiling] of MERGED_AREAS) {
    it(`${name}: merged, stays under ${meshCeiling} meshes and ${casterCeiling} casters`, () => {
      const scene = new THREE.Scene();
      build(scene);
      const before = budgetStats(scene);
      mergeStaticProps(scene);
      const after = budgetStats(scene);
      expect(after.meshes).toBeLessThan(before.meshes);
      expect(after.casters).toBeLessThan(before.casters);
      expect(after.meshes).toBeLessThanOrEqual(meshCeiling);
      expect(after.casters).toBeLessThanOrEqual(casterCeiling);
      // Merging moves geometry between meshes; it never adds or drops a
      // triangle. Restated here as well as in test/mergeprops.test.js because
      // this is the file a density pass will be reading.
      expect(after.triangles).toBe(before.triangles);
    });
  }
});

describe('Wave 3.4 — per-area draw-call budget', () => {
  for (const [name, build, meshCeiling, casterCeiling, triangleCeiling] of AREAS) {
    describe(name, () => {
      const stats = () => {
        const scene = new THREE.Scene();
        build(scene);
        return budgetStats(scene);
      };

      it(`stays under the ${meshCeiling}-mesh ceiling (the tight, real budget)`, () => {
        const { meshes } = stats();
        expect(meshes).toBeGreaterThan(0);
        expect(meshes).toBeLessThanOrEqual(meshCeiling);
      });

      it(`stays under the ${casterCeiling}-caster ceiling (what Wave 3.3 reduced)`, () => {
        const { casters } = stats();
        expect(casters).toBeLessThanOrEqual(casterCeiling);
      });

      it(`stays under the ${triangleCeiling}-triangle ceiling (generous — triangles are cheap here)`, () => {
        const { triangles } = stats();
        expect(triangles).toBeGreaterThan(0);
        expect(triangles).toBeLessThanOrEqual(triangleCeiling);
      });

      // Belt-and-suspenders regression guard for Wave 3.3 itself, independent
      // of where the ceilings above happen to sit: if a future edit reverts
      // the trim (e.g. by widening CAST_WIDE_SPAN to the point everything
      // qualifies), casters would drift back up toward meshes even while both
      // stay under their ceilings. This fails the moment that gap closes.
      it('still trims a meaningful share of casters below the mesh count', () => {
        const { meshes, casters } = stats();
        expect(casters).toBeLessThan(meshes);
      });
    });
  }
});
