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
const { build: buildWoods } = await import('../src/world/woods.js');
const { build: buildRiver } = await import('../src/world/river.js');
const { build: buildMoor } = await import('../src/world/moor.js');
const { build: buildPines } = await import('../src/world/pines.js');
const { build: buildGorge } = await import('../src/world/gorge.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { addBorderDressing } = await import('../src/world/borderpost.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');

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
//     castsFromBox and isTransparentMat, imported from
//     src/render/rig.js), and it gets a ceiling with a little more headroom
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
// The caster predicate is imported from src/render/rig.js, the rule walk.js runs.
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
//   woods            173      152      44474   (171 / 150 merged; +1 mesh for the
//                                               island plank, lake.js, too low to cast)
//   river            159      133      53744   (157 / 131 merged; Polish 2 thickened the west reedbed)
//   moor              79       48      39952   (78 / 47 merged; 10 thorns, 5 pines,
//                                               385 heather, 18 gorse, 127 reeds;
//                                               re-measured for the trail to the Gorge,
//                                               +1 path, -1 heather, -1 gorse; it was
//                                               78 / 48 / 40158 just before, and the
//                                               older 76 / 50 / 40288 predated the
//                                               Pines trail)
//                                               2026-11-02: heather redrawn as green clumps
//                                               with pink flower spikes (was purple lumps
//                                               that read as rocks): ~57,800 triangles,
//                                               meshes +1 (the spikes)
//   pines            112       75      44642   (109 / 72 merged; 27 swaying pines,
//                                               83 in the one merged stand, 136 ferns,
//                                               47 toadstool clusters, 160 reeds (19
//                                               of them round the island's rim),
//                                               20 lily pads; the island is ground,
//                                               with the Old Ash, the Meeting Ring,
//                                               the Watch Rock and its finds; was
//                                               138 / 101, before the canopy rule
//                                               kept pines off the paths' bends)
//   gorge             60       36      57655   (gorge-rock2 beauty pass: was 59,307;
//                                               scree pebbles 12,260 -> 4,904, ground
//                                               plane under the rock trimmed 4,608 ->
//                                               2,436, finer wall grid (shell 10,337
//                                               -> 16,197), round tors 1,188 -> 2,640,
//                                               talus in the meadow +462; 2,345 tris
//                                               of headroom under the cap.
//                                               Before it: polish-edges' red roofs on
//                                               its rooftop blocks, +60 in
//                                               the horizon band, no mesh; it
//                                               was 59,247 after polish-gorgeway,
//                                               from
//                                               59 / 36 / 54,581: the
//                                               narrowsDressing, +1 noCast mesh,
//                                               1,066 tris (30 shelf and 33
//                                               crest tufts, 16 crest shrubs and
//                                               the 560-tri view out to the
//                                               Moor); the corridors' tunnels,
//                                               merged into each caveRoom:<id>
//                                               (no new mesh), 2,935 tris (echo
//                                               942, snug 931, glitter 1,062);
//                                               lumpier chamber moss, +665.
//                                               ONLY 693 TRIANGLES LEFT under
//                                               the 60,000 ceiling (753 before
//                                               the red roofs): the next Gorge
//                                               build must trim or raise it,
//                                               with a written reason.
//                                               Earlier: 54 / 36 / 43051,
//                                               43 / 26 merged; part 4's camp
//                                               adds two meshes: the leader's
//                                               rock (a caster, 36 tris) and the
//                                               den's bedding (noCast, six discs
//                                               merged, 288 tris); before it was
//                                               52 / 35 / 32860, 41 / 25 merged.
//                                               Part 4 also cut the
//                                               camp den into the rock behind
//                                               the Wide Ledge: +42 tris in the
//                                               merged rock, no mesh, it was
//                                               52 / 35 / 32818 before; part 3
//                                               added the caves' insides: four noCast
//                                               meshes, 1,224 tris (12, 13 and
//                                               12 crystal clusters, 40 gold
//                                               flecks), no caster; before them
//                                               it was 48 / 35 / 31594, 37 / 25
//                                               merged. The rock in three
//                                               merged meshes (15,437 tris: the
//                                               shell 8,688 / 398 / 1,251, then
//                                               275 lip stones, 3,300 tris, and
//                                               90 foot boulders, 1,800 tris,
//                                               no new mesh; the shell alone was
//                                               37,951 in all, and the first,
//                                               unrelieved rock 5,570 tris at
//                                               54 / 36 / 33184), 9
//                                               swaying pines, 43 in the stand on
//                                               the west top, 11 tors (one group,
//                                               one draw merged), 134 scree spots
//                                               in one bed (12,260 tris), the
//                                               Summit Rock, 7 paths, the stream
//                                               and its 8 stones; re-measured when
//                                               the pines kept the camera's reach
//                                               off every mouth, scenic and nap:
//                                               it was 58 / 45 / 32188, 47 / 35
//                                               merged, with 14 and 47 pines)
//
// Ceilings below sit at roughly +15-20% over the measured mesh count and
// +20-40% over the measured caster count (a little looser, per the bullet
// above, and proportionally looser still for the smaller areas so a handful
// of props doesn't trip the test on rounding). Triangles get roughly 2.5-3x
// the ABOVE already-elevated numbers, deliberately: Wave 4 of this same plan
// (docs/VISUAL-PASS.md) exists specifically to spend triangles here — rounded
// box bevels, higher segment counts on trunks/bollards/lamp globes, a
// horizon band — and none of it should have to renegotiate this ceiling.
//
// 2026-11-03, polish "edges": each green area's horizon band gained a ring of
// low hedges (with field gates), scrub, reeds, pine scrub or a dry-stone wall
// along the ground's edge and, where there is room, a sparse tree row past it.
// It is ONE separate mesh per green area, 'horizonEdge' (a child of the band,
// userData.noCast, so it is +1 mesh and +0 casters, and its triangles draw
// once, not again in the shadow pass), built from hand-made low-poly pieces.
// Its triangles count here like any other mesh's. The ceilings did not move
// (a first cut merged into the band raised four of them; that was undone):
// where there was not room for the whole ring, it ran only along the arc a
// kid sees on turning round at the spawn (builder.js EDGE_STYLES `arcs`; no
// style uses it since polish-places Task 5, below).
//
//   area          edge mesh   build total   ceiling   (ring)
//   neighborhood      3,860        29,759    60,000   all round, tree row
//   park              3,634        20,535    40,000   all round, tree row
//   woods             3,484        53,873    60,000   all round, tree row
//   pines             3,425        52,934    60,000   all round, tree row
//   river               424        59,895    60,000   +x/+z corner arc only,
//                                                     no trees (105 left)
//   moor                756        59,761    60,000   +x/+z corner arc only,
//                                                     no trees (239 left)
//   (river and moor as of that pass; see polish-places Task 5 below for
//   their whole rings.)
//
// At the time the River and the Moor were within a few hundred triangles of
// their ceilings; polish-places Task 1 (below) freed 10,660 and 8,700.
//
// The same pass gave the Seaside's cliff and overlook a finer face grid so
// their gullies can be cut: the two rock boxes went from 2,292 triangles
// (1,872 + 420) to 10,096 (7,776 + 2,320), and with the boats' cabins and
// sails the Seaside's build is 23,740 (it was 15,724 with main's seaside.js),
// still under its 30,000 ceiling. The Gorge's rooftop blocks gained red
// pitched roofs: +60 triangles in its band, 59,307 in all (see its row).
//
// 2026-11-03, polish-places: reeds lost their 4 cm top and buried bottom faces
// (12 -> 8 triangles a blade) and heather cushions their downward faces under
// the ground, freeing room for the next edge work. Build totals, before ->
// after: river 59,895 -> 49,235; moor 59,761 -> 51,061; pines 52,934 ->
// 49,734; woods 53,873 -> 51,953. The other areas, and every ceiling, are
// unchanged.
//
// 2026-11-03, polish-places Task 2: the Woods' Twolegplace is 14 small
// cottages (rooftops style 'houses': walls, roof, door, 1-3 windows, a short
// chimney on some) in place of the skyline blocks, its band 3,782 -> 3,788
// triangles, and the lookout is a lumpy stacked rock (three merged
// icosahedra, 240 triangles) in place of a 7-sided cylinder. Woods 51,953 ->
// 52,171, meshes 181 (unchanged). The Gorge, whose band also has rooftops,
// is byte-identical (59,307).
//
// 2026-11-03, polish-places Task 4: the Seaside's band gained the 'dune' edge
// (marram tufts, sand-fence posts and rope, five beach huts and a lifeguard
// chair, all in one noCast 'horizonEdge' child) and the boardwalk an end (a
// step board and two posts, one noCast mesh). Seaside 23,740 -> 26,904
// triangles, meshes 66 -> 68, casters 33 (unchanged); merged 49 -> 51 meshes,
// 28 casters. Every other area and every ceiling unchanged.
//
// 2026-11-03, polish-places Task 5: the River's reeds and the Moor's wall run
// all the way round (the spawn-corner arc is gone), each with a sparse far
// tree row (low round marsh trees; lone wind-bent hawthorns), and the bands
// gained a `shoreLip` (a flat pale beach where a water running off the map
// meets the far hills: the Moor's lake, the River's lake and rivers), which
// keeps a few more band cells. Meshes and casters unchanged (the edge is the
// same one noCast mesh).
//
//   area     edge mesh         band            build total        left
//   river      424 -> 2,254    3,338 -> 3,384  49,235 -> 51,111   8,889
//   moor       756 -> 3,582    3,434 -> 3,438  51,061 -> 53,891   6,109
//
// The Woods', Pines' and Gorge's bands are byte-identical (test/builder.test.js
// pins their hashes); every other area and every ceiling unchanged.
//
// 2026-11-03, polish-rivermoor: the River becomes a marsh and the Moor a rolling
// granite moor, all visual. Each gains a 'dressing' mesh (tussocks, cattails,
// osier clumps, flowering lily pads, moss on the log and the ford; on the Moor
// wind-bent grass, tor clitter, boulders, lake-shore stones and five far tors
// past the bounds) and a 'groundPaint' decal mesh (mud banks; sheep paths and
// lake shingle), both noCast, built under withLocalUuids so the build draw
// counts and the flat trace do not move; the ground's own vertex colours are
// re-tinted in place (no triangles). The River also gains 'marshMist' (dusk and
// sunset only) and 'dragonflies', two shader-animated noCast meshes driven by
// its life hook (src/world/marshlife.js). Ceilings unchanged.
//
//   area     meshes      casters     merged      triangles          new meshes (triangles)
//   river    167 -> 171  135 -> 135  165 -> 169  51,111 -> 58,501   dressing 5,398, groundPaint 1,320, marshMist 532, dragonflies 140
//   moor      85 -> 87    48 -> 48    84 -> 86    53,891 -> 59,303   dressing 4,840, groundPaint 572
//
// River has 1,499 and the Moor 697 triangles left under the 60,000 ceiling: the
// next build adding to either must trim first.
//
// 2026-11-04, polish-beach: the Seaside's beach is dressed, all visual. It
// gains 'beachPaint' (flat tide lines, wind ripples, a striped towel, the
// umbrella's shade and the castle moats; tagged ground) and 'beachDressing'
// (shells, starfish, pebbles, kelp, driftwood, two sandcastles, a bucket and
// spade, the beach umbrella and the boardwalk's kerb boards and posts), both
// noCast and built under withLocalUuids (src/world/beachdress.js), so the
// build draw count and the flat trace do not move. Seaside 26,904 -> 29,449
// triangles (beachPaint 880, beachDressing 1,665), meshes 68 -> 70, casters
// 33 (unchanged). 551 triangles left under the 30,000 ceiling: the next
// Seaside build trims first.
//
// 2026-11-04, polish-forestfloor: the Woods and the Pines get a forest floor,
// all visual. The fern beds' fronds are redrawn (builder.js fernBed, Lambert
// so their thin edges keep their colour); both grounds are re-tinted in place
// (leaf litter, canopy shade and moss in the Woods; needle beds and moss in
// the Pines; no triangles), and their grass tufts read the same tint. Each
// gains one noCast 'forestFloor' mesh (src/world/forestfloor.js: in the Woods
// two-triangle fallen leaves, moss cushions, mushrooms, bluebells and
// foxgloves; in the Pines needles, cones, moss and blueberries), built under
// withLocalUuids, so the build draw counts and the flat trace do not move.
// Ceilings unchanged. Before is main at b2b06b1.
//
//   area    meshes      casters    merged (meshes/casters)   triangles          ferns              forestFloor
//   woods   183 -> 184  154 -> 154  181/152 -> 182/152     51,977 -> 57,910   17,220 -> 18,655   4,498
//   pines   116 -> 117   71 -> 71   113/68 -> 114/68       49,522 -> 54,751   11,256 -> 12,194   4,291
//
// The Woods has 2,090 and the Pines 5,249 triangles left under the 60,000
// ceiling (the Woods' own floor test holds it to 58,500, the Pines' to
// 56,000).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// polish-twolegplace (survey 5, build 5-5): the Neighbourhood's eight lot
// houses take builder.house()'s `look` (gable or pyramid roofs, trim, frames,
// shutters, flower boxes, chimneys, porches, side windows), adding one
// vertex-coloured 'houseTrim' and one 'houseGlass' window mesh per house,
// both under withLocalUuids. The Seaside's six shrubs become marram and
// sea-holly clumps (bush style 'beach'), at most 100 triangles each; they
// are too low to cast, so the Seaside loses two casters (the Seaside's
// mouse-hide spots are pinned to marram, (-24,-20) to holly). houseGlass is
// userData.noCast (flush panes, nothing worth a shadow draw), so the eight
// houses add only the trim as casters. River, Moor, Gorge: unaffected.
// Ceilings unchanged. Before is main at aafb451.
//
//   area          meshes      casters    merged (meshes/casters)   triangles
//   neighborhood  382 -> 398  314 -> 322  219/169 -> 235/177       29,759 -> 36,786
//   seaside        70 -> 70    33 -> 31    53/28 -> 53/26          29,521 -> 29,513
// ---------------------------------------------------------------------------

// Counts what render/rig.js's assignShadowCasters would set, minus the
// userData.contactDecal exclusion (a bare area build never contains the
// contact-shadow InstancedMeshes — those are added later, by
// render/contactshadows.js, from within startWalk, not by the area builder).
//
// Meshes are counted by traversal, EVERY mesh, because each one is a draw call
// whether or not it casts. That includes userData.noCast meshes (builder.js's
// reed beds and stepping stones): rig.js skips them in its caster sweep and so
// leaves them out of its own mesh tally, which is why that tally is not used
// here. They are left out of the caster count only, as rig.js leaves them out
// of the shadow pass.
function budgetStats(scene) {
  let meshes = 0;
  let casters = 0;
  let triangles = 0;
  const box = new THREE.Box3();
  for (const child of scene.children) {
    box.setFromObject(child);
    const eligible = castsFromBox(box);
    child.traverse((obj) => {
      if (!obj.isMesh) return;
      meshes++;
      const geo = obj.geometry;
      const vertexCount = geo.index ? geo.index.count : geo.attributes.position.count;
      triangles += vertexCount / 3;
      if (eligible && !isTransparentMat(obj.material) && !obj.userData.noCast) casters++;
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
  // The Woods is held to the Cozy Neighborhood's numbers: the area the iPhone
  // was measured holding 60 fps in (plan Global Constraints).
  ['woods', buildWoods, 450, 380, 60000],
  ['river', buildRiver, 450, 380, 60000],
  ['moor', buildMoor, 450, 380, 60000],
  ['pines', buildPines, 450, 380, 60000],
  ['gorge', buildGorge, 450, 380, 60000],
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
//   pines            109       72    112 /  75
//   gorge             43       26     54 /  36   (with CliffClan's camp; 41 / 25 before it, 37 / 25 before the caves' insides)
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
  ['woods', buildWoods, 260, 205],
  ['river', buildRiver, 260, 205],
  ['moor', buildMoor, 260, 205],
  ['pines', buildPines, 260, 205],
  ['gorge', buildGorge, 260, 205],
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

// ---------------------------------------------------------------------------
// Border crossings Task 3: the Clan Edition's posts (and the Neighborhood's
// footpath) are added by walk.js after the build, so the bare-build cases above
// stay as they are (Legacy's Neighborhood is the bare build). This holds the
// dressed maps to the same ceilings, as built and as merged.
// ---------------------------------------------------------------------------
describe('with the Clan dressing', () => {
  for (const [name, build, meshCeiling, casterCeiling] of AREAS.filter(([n]) => ['neighborhood', 'woods', 'river', 'moor', 'pines'].includes(n))) {
    const mergedCeil = MERGED_AREAS.find(([n]) => n === name);
    it(`${name}: built under ${meshCeiling} / ${casterCeiling}, merged under ${mergedCeil[2]} / ${mergedCeil[3]}`, () => {
      const scene = new THREE.Scene();
      build(scene);
      addBorderDressing(scene, name);
      const before = budgetStats(scene);
      expect(before.meshes).toBeLessThanOrEqual(meshCeiling);
      expect(before.casters).toBeLessThanOrEqual(casterCeiling);
      mergeStaticProps(scene);
      const after = budgetStats(scene);
      expect(after.meshes).toBeLessThanOrEqual(mergedCeil[2]);
      expect(after.casters).toBeLessThanOrEqual(mergedCeil[3]);
      if (process.env.BUDGET_LOG) console.log(name, JSON.stringify({ before, after }));
    });
  }
});

// ---------------------------------------------------------------------------
// The Gorge, part 3 (the caves): each deep cave's insides are at most three
// merged meshes (polish-gorgesky added the chamber's room, caveRoom:<id>),
// out of the shadow pass, and they count in the Gorge's rows
// above (built and merged), which stay inside the Cozy Neighborhood's
// ceilings. Only one is ever drawn at a time (gorgelife.js).
// ---------------------------------------------------------------------------
describe('the Gorge: its caves\' insides', () => {
  it('each deep cave\'s interior is at most three merged noCast meshes, as built and merged', () => {
    const scene = new THREE.Scene();
    buildGorge(scene);
    const count = () => scene.children.filter((c) => c.userData.caveId).map((g) => {
      const meshes = [];
      g.traverse((o) => { if (o.isMesh) meshes.push(o); });
      for (const m of meshes) expect(m.userData.noCast).toBe(true);
      return meshes.length;
    });
    expect(count()).toEqual([2, 2, 3]);
    mergeStaticProps(scene);
    expect(count()).toEqual([2, 2, 3]);
  });
});
