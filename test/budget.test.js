import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

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
const { build: buildFarm } = await import('../src/world/farm.js');
const { build: buildFair } = await import('../src/world/fair.js');
const { build: buildRoofs } = await import('../src/world/roofs.js');
const { build: buildMarket } = await import('../src/world/market.js');
const { build: buildHouse } = await import('../src/world/house.js');
const { build: buildLighthouse } = await import('../src/world/lighthouse.js');
const { build: buildGreenhouse } = await import('../src/world/greenhouse.js');
const { build: buildMoon } = await import('../src/world/moon.js');
const { HOUSE_LEVELS } = await import('../src/world/houseplan.js');
const { measureHouse } = await import('./helpers/housebudget.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { addBorderDressing } = await import('../src/world/borderpost.js');
const { addGatewayDressing } = await import('../src/world/gateway.js');
const { endsFor } = await import('../src/gateways.js');
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
//   gorge             61       36      63437   (polish-gorge7: was 60,181; the scree
//                                               became chunky heaped sandstone, 4,904 ->
//                                               ~8.2k, still one noCast mesh)
//   gorge             61       36      60179   (polish-gorge6, after the 70k raise: was
//                                               58,959; rounded rock arches at the five
//                                               small dens (denW1, denW2, denE,
//                                               denLookout, denTop), 244 each = 1,220,
//                                               appended to rockFaces: no mesh, no
//                                               caster. The stream's water dressing
//                                               (walk.js, after the build, not counted
//                                               here) went 584 -> 3,397 for fuller
//                                               banks: 63,576 drawn in all, 6,424
//                                               under the 70,000 ceiling)
//   gorge             61       36      58959   (polish-gorge5: was 57,637; rounded rock
//                                               arches appended to rockFaces, no mesh,
//                                               no caster: echo 218, snug 178, glitter
//                                               218, the camp den 324 (its frame twice,
//                                               the copy facing in), and the den's
//                                               rounded lining 384 = 1,322 of the
//                                               build's 1,500; 1,041 tris left under
//                                               the 60,000 cap)
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
//
// 2026-11-04, polish-crossings: the log bridges are rebuilt as one hand-made
// trunk geometry (bark wane, hewn top, end grain, branch stub; 160 -> 167
// triangles each), the stepping stones and the island plank take vertex
// colour (no triangles), and each trail end beside a deck gains one tuck
// quad under it (2 triangles each). No new meshes, no new casters, ceilings
// unchanged. Before is main at aafb451.
//
//   area    meshes  casters  triangles          logBridge   trail tucks
//   woods   184     154      57,910 -> 57,921   160 -> 167  2
//   river   172     135      58,329 -> 58,342   160 -> 167  3
//   moor     88      48      59,055 -> 59,068   160 -> 167  3
//   pines   117      71      54,751 -> 54,768   160 -> 167  5
//   gorge    61      36      57,637 -> 57,639   (none)      1
//
// Left under the 60,000 ceiling: Woods 2,079, River 1,658, Moor 932,
// Pines 5,232, Gorge 2,361.
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

// ---------------------------------------------------------------------------
// polish-logs: the log bridges are rounded (crowned walked top, wavy hewn
// edge, bark shoulders rolling into the flanks, a root flare at one end, a
// sawn end at the other, two bigger branch stubs). Same one mesh per log, no
// new casters; 167 -> 394 triangles a log. The Gorge has no log bridge.
// Below the bulge the trunk closes straight to its bottom (it is under the
// water or the bank everywhere), which keeps the River and Moor inside
// riverdress/moordress's own 59,400 guards. Ceilings unchanged (70k).
// Before is main at 56ecc83.
//
//   area    meshes  triangles          logBridge
//   woods   184     57,921 -> 58,148   167 -> 394
//   river   172     58,342 -> 58,569   167 -> 394
//   moor     88     59,068 -> 59,295   167 -> 394
//   pines   117     54,768 -> 54,995   167 -> 394
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
  ['neighborhood', buildNeighborhood, 450, 380, 70000],
  ['park', buildPark, 210, 170, 40000],
  ['docks', buildDocks, 600, 500, 90000],
  ['seaside', buildSeaside, 85, 45, 30000],
  ['den', buildDen, 340, 220, 40000],
  // The Woods is held to the Cozy Neighborhood's numbers. Raised from 60k to 70k
  // on 2026-11-04 after the owner's iPhone check passed with every area near 60k.
  ['woods', buildWoods, 450, 380, 70000],
  ['river', buildRiver, 450, 380, 70000],
  ['moor', buildMoor, 450, 380, 70000],
  ['pines', buildPines, 450, 380, 70000],
  ['gorge', buildGorge, 450, 380, 70000],
  // Appletree Farm (2026-11-18), measured 244 / 176 / 53,419 (243 until the
  // scarecrow's hat became a mesh of its own, noCast, for step 3): the barn and the
  // four small buildings are three vertex-coloured meshes each (walls, roof,
  // window panes), the fences are one mesh, the wheat one (9,750 triangles,
  // noCast), the vegetable rows one; 21 trees and a willow, 15 of the trees
  // with an apple mesh (noCast); eight flower patches are 96 of the meshes.
  // Ceilings at the usual headroom over that, well under the territories'.
  ['farm', buildFarm, 280, 210, 62000],
  // The Fairground (2026-11-18), the static place as step 1 built it: measured
  // 221 / 157 / 69,452; after the polish pass (2026-11-19) 174 / 109 / 66,692
  // (test/fair.test.js pins the exact numbers). The rides
  // are the densest things in the game and their moving parts cannot be
  // merged: 12 horses, 8 gondolas, 6 cups and 4 coaster cars are a mesh each.
  // Meshes and casters at a small headroom over that. The triangle ceiling,
  // 75,000, is PROVISIONAL: the owner approved 75,000 for the Farm (place,
  // animals and jobs); for the Fairground it is the coordinator's call,
  // flagged to the owner and his to change.
  ['fair', buildFair, 250, 180, 75000],
  // The Rooftops (Rooftops step 2, 2026-11-20), measured 113 / 67 / 32,202
  // (part one alone was 76 / 42 / 13,284); 114 / 68 / 32,506 after
  // follow-up 3 (stack-5 on the flat house, its ridge beam gone); 112 / 68 /
  // 31,218 after follow-up 2 (calmer take-off marks); 113 / 68 / 32,382 after
  // the beauty pass's Task A (the sky glow band, +1 mesh casting nothing, and
  // the far town's lights and landmarks); 113 / 68 / 32,918 after Task B
  // (houses that differ and real roof edges: no mesh or caster added, +536
  // triangles in the buckets it had); 113 / 68 / 33,246 after Task C (windows
  // and the tower: no mesh or caster added, +328 triangles in the buckets it
  // had); 113 / 68 / 33,933 after Task D (readable hints and a lived-in
  // alley: no mesh or caster added, +687 triangles in the buckets it had);
  // 113 / 68 / 34,023 after round two's Task E (the shop's string courses
  // and the garden bench's uprights, +96, in noCast buckets it had; the far
  // town's lower back rows, -6: no mesh or caster added); 113 / 68 / 36,065
  // after round two's Task F (what she walks on: the ridges in single tiles,
  // the felt's drip edges, patches, flashing and outlets, the crates' slats
  // and the bin bags' knots, +2,042 in noCast buckets it had: no mesh or
  // caster added); 114 / 68 / 36,707 after round two's Task G (the street
  // lit: the lamps' halo, +1 mesh casting nothing and never merged, 8
  // triangles; the copings' joints, the road's lines, grates and covers, +632
  // in noCast buckets it had; the far town's back row a little taller, +2);
  // 116 / 68 / 37,335 after Rooftops step 3's Task 6 (two house cats asleep
  // on warm sills: +2 meshes casting nothing and never merged, 314 triangles
  // each). Held to the territories' ceilings,
  // never raised; the place aims for 300 / 120 / 60,000 (test/roofs.test.js
  // pins the exact numbers).
  ['roofs', buildRoofs, 450, 380, 70000],
  // The Market Square (Market step 1, 2026-11-21), measured 101 / 27 / 37,943 after Task 6's rework and its review (the square drawn in, its clutter in one kit; 79 / 26 / 33,005 before, 79 / 30 before the shop fronts stopped casting);
  // 111 / 27 / 39,335 after step 3's Task 8 (the café front, the flower tubs' blooms, the chalkboard; 109 / 27 / 38,329 before it)
  // (test/market.test.js pins the exact numbers). The Farm's ceilings (spec,
  // 2026-11-20), never raised; the place aims for 180 / 110 / 45,000.
  ['market', buildMarket, 280, 210, 62000],
  // Lighthouse Point (Lighthouse milestone 1, 2026-11-22), measured 47 / 14 / 27,332: the headland, cove, six
  // pools, cliff path, cave, tower to the gallery, cottage and garden, Gull Rock. The street places' ruling
  // (the Farm's and the Market's), never raised; the place aims for 150 / 70 / 52,000 when it is whole
  // (milestones 2 and 3 add the stair, lamp room, beam and life).
  // Milestone 2 (the climb) measured 51 / 14 / 33,219: the stair's treads, cleats, rails and piers, the gallery's rail, the
  // lamp room (drum, glass and roof as two meshes of their own, lens, lever housing), two sea stacks, the chalk marks.
  // The life's lamp pieces (beam, halo, glow, pool of light) are made by the walk, after this count: 5 meshes, 0 casters.
  // Milestone 3 (the life) measured 53 / 33,323 built: the fog bell split off the merge (two meshes, so it swings), the sleeper in the lit window.
  // The life it adds (the gull, the crab, the paw prints; and two cats, 58 meshes and about 19,000 triangles, drawn within 48 m of her) is
  // counted in test/lighthousebeam.test.js, never in this build count.
  // The beauty pass (2026-11-23) measured 57 / 15 / 47,995 built (textured cliffs and lawn, tufts, flowers, sand detail, foam, far sea, tower and cottage detail): ceilings unchanged.
  ['lighthouse', buildLighthouse, 280, 210, 62000],
  // The Greenhouse. Milestone 0 (2026-11-22, the spike) measured 11 / 0 / 12,342. Milestone 1 (2026-11-23: the real plants, the koi, the
  // Park's fountain, the potting bench, the kitchen bed, the eight garden pots) measured 31 / 5 / 35,050 built (plants 17,000 of it: palms
  // 3,084, foliage 10,560, orchids 1,884, koi 108; the fountain 6,900; the frame 2,988 and the glass 420). The street places' ruling, never
  // raised; the place aims for 150 / 70 / 52,000 when it is whole.
  ['greenhouse', buildGreenhouse, 280, 210, 62000],
  // The Moon. Milestone 0 (2026-11-23, the seams) was a bare plain, 1 / 0 / 5,408 (the 130 m ground plane's own segments). Milestone 1
  // (the real heightfield ground in the gravel tile, 6,496 triangles in one mesh; four InstancedMeshes of rocks; the lander, the flag, the
  // landing lights and the return gate ring, merged by material) measured 10 / 5 / 7,844 built as this file counts (an InstancedMesh is
  // one geometry here), +12% (the Farm's and the Market's ruling): 12 / 6 / 8,800. Counting every instance the plain draws 14,584 (the
  // plan's row A1 is 15,500; test/moonplace.test.js holds that number too). The plan's A1 row was 40 / 24 / 15,500: this is under it
  // on every count. The sky (700 stars, Earth, a cloud disc) is the walk's life, built after the sweeps, and not in this count. The spec's
  // final ceilings (240 / 150 / 56,000, chunk 94 kB) are set as its stages measure (milestones 2 to 8), never above them. Not in the
  // merged table below: nothing here merges (the kit is already one mesh per material, and a top-level mesh is left alone).
  // Milestone 2 (the base: the dome, the airlock and its two door leaves, the Core, the Mission Board, the six planters, the Old Dish, Skip Ridge's
  // two pillars, the Far Beacon's stand-in; Pip, the cells and the ring are the walk's own, built after this count) measured 20 / 8 / 11,986 built
  // (18,726 counting every rock instance, test/moonplace.test.js), +12%: 23 / 9 / 13,500. The plan's row A (end of milestone 4) is 100 / 56 / 27,500.
  // Milestone 3 (Dot's course: the Rover Depot, 36 lit track posts, the Far Beacon and the Rover cell's plinth, merged into the same buckets plus one
  // more for the lit lamps; Dot herself, her ring and her dust are the walk's own, made after this count, like Pip) measured 21 / 8 / 13,274 built
  // (20,014 counting every rock instance, test/moonplace.test.js), +12%: 24 / 9 / 14,900. The plan's row A (end of milestone 4) is 100 / 56 / 27,500.
  ['moon', buildMoon, 24, 9, 14900],
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
  ['farm', buildFarm, 200, 135], // measured 176 / 119
  ['fair', buildFair, 200, 140], // measured 178 / 124
  ['roofs', buildRoofs, 64, 34], // measured 60 / 30 (59 / 30 before the Rooftops step 5 fix wave's vane, its own mesh so the tower view can fade it, never merged; 57 / 30 before Rooftops step 3's two sleeping cats, Task 6, never merged; 56 / 30 before round two's lamp halo, Task G; 55 / 30 before the beauty pass's sky glow; 57 / 30 before follow-up 2's calmer marks), ceiling unchanged
  ['market', buildMarket, 156, 36], // 2026-11-22: re-measured on purpose for the four new stalls (toys, plants, bric-a-brac, butcher): 139 / 32 merged, +12% (the same ruling); ceilings 280 / 210 / 62000 unchanged. Earlier: measured 98 / 24 after Task 6's rework and review (its clutter, the controller's ruling), +12%; 76 / 23 before; 108 / 24 after step 3's Task 8 (the café front's paint and its chalkboard's contact-shadow box), ceiling unchanged; 110 / 25 with step 4's gate (its body and its bar), re-pinned at +12% (the same ruling)
  ['greenhouse', buildGreenhouse, 33, 5], // 2026-11-23: milestone 1 measured 29 / 4 merged (31 / 5 built), +12% (the Farm's and the Market's ruling); the plan's gate is about 80 / 40
  ['lighthouse', buildLighthouse, 32, 11], // 2026-11-22: milestone 3 measured 28 / 9 merged (26 / 9 at milestone 2, 23 / 9 at milestone 1: the fog bell is two meshes of its own so it can swing), +12% (the Farm's and the Market's ruling); the plan's gate is 70 / 36. Beauty pass 2026-11-23 measured 30 / 10 merged (the cliff faces and the lawn carry the game's own gravel and grass textures, two more merged meshes, one caster more), ceilings unchanged
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
// World map step 3 (gateways): a street place's gates are added by walk.js
// after the build, like the border posts, so the bare rows above stay as they
// are. Each gate is at most 400 triangles. This holds every gated place, built
// with its gates, to the SAME ceilings, as built and as merged; no ceiling
// rose. The Seaside, with about 490 triangles left of 30,000, paid first: its
// cliff lost the hidden bottom face (720 triangles), so
//   seaside triangles   29,513 -> 28,793 bare, 29,125 dressed
// ---------------------------------------------------------------------------
// Rooftops step 4 added the town's third signpost (town-roofs) and the
// Rooftops' alley door (roofs-town), inside the same ceilings. Market step 4
// added the town's fourth (town-market) and the square's gate in its south
// row (market-town), inside the same ceilings too. Old House step 4 added the
// old house's door in town (town-house, look 'none': the town draws the old
// house's front for it, world/oldhousefront.js) and the hall's front door
// (house-town, look 'none': the house draws its opening leaves): the town with
// its four signposts and the front, and the house at every level, inside the
// same ceilings, built and merged.
describe('with the gateways (world map step 3)', () => {
  it('covers every place with a gate, the Rooftops, the Market, the Old House and the town\'s four signposts among them', () => {
    expect(endsFor('neighborhood').map((e) => [e.id, e.look])).toEqual([['town-park', 'signpost'], ['town-docks', 'signpost'], ['town-roofs', 'signpost'], ['town-market', 'signpost'], ['town-house', 'none']]);
    expect(endsFor('roofs').map((e) => [e.id, e.look])).toEqual([['roofs-town', 'alleydoor']]);
    expect(endsFor('market').map((e) => [e.id, e.look])).toEqual([['market-town', 'signpost']]);
    expect(endsFor('house').map((e) => [e.id, e.look])).toEqual([['house-town', 'none']]);
  });
  it('the town draws the old house\'s front for its door', () => {
    const scene = new THREE.Scene();
    buildNeighborhood(scene, { gateEnds: endsFor('neighborhood') });
    expect(scene.getObjectByName('oldhousefront')).toBeTruthy();
  });
  it('the house with its door home: every level under 450 / 380 / 70,000, built and merged', () => {
    const scene = new THREE.Scene();
    const area = buildHouse(scene, { gateEnds: endsFor('house') });
    expect(area.house.parts.frontDoor).toBeTruthy();
    addGatewayDressing(scene, 'house');
    const rig = { castsFromBox, isTransparentMat };
    const check = (tag) => {
      const m = measureHouse(scene, rig);
      for (const l of HOUSE_LEVELS) {
        const at = m.at(l.id);
        if (process.env.BUDGET_LOG) console.log('house', tag, l.id, JSON.stringify(at));
        expect(at.meshes, `${tag} ${l.id}`).toBeLessThanOrEqual(450);
        expect(at.casters, `${tag} ${l.id}`).toBeLessThanOrEqual(380);
        expect(at.triangles, `${tag} ${l.id}`).toBeLessThanOrEqual(70000);
      }
    };
    check('built');
    mergeStaticProps(scene);
    check('merged');
  });
  for (const [name, build, meshCeiling, casterCeiling, triangleCeiling] of AREAS.filter(([n]) => ['neighborhood', 'park', 'fair', 'farm', 'docks', 'seaside', 'roofs', 'market'].includes(n))) {
    const merged = MERGED_AREAS.find(([n]) => n === name);
    it(`${name}: dressed, still under ${meshCeiling} / ${casterCeiling} / ${triangleCeiling}, merged under ${merged[2]} / ${merged[3]}`, () => {
      const scene = new THREE.Scene();
      // as walk.js builds a Clan walk: the gate ends go to the builder too
      // (the Fair and the Farm cut their front fences for them)
      build(scene, { gateEnds: endsFor(name) });
      if (name === 'neighborhood') addBorderDressing(scene, name);
      addGatewayDressing(scene, name);
      const before = budgetStats(scene);
      if (process.env.BUDGET_LOG) console.log(name, JSON.stringify(before));
      expect(before.meshes).toBeLessThanOrEqual(meshCeiling);
      expect(before.casters).toBeLessThanOrEqual(casterCeiling);
      expect(before.triangles).toBeLessThanOrEqual(triangleCeiling);
      mergeStaticProps(scene);
      const after = budgetStats(scene);
      if (process.env.BUDGET_LOG) console.log(name, 'merged', JSON.stringify(after));
      expect(after.meshes).toBeLessThanOrEqual(merged[2]);
      expect(after.casters).toBeLessThanOrEqual(merged[3]);
    });
  }
  it('the Seaside paid for its gate first: 28793 bare, and dressed it is at or under the 29513 it had before the trim', () => {
    const scene = new THREE.Scene();
    buildSeaside(scene);
    expect(budgetStats(scene).triangles).toBe(28793);
    addGatewayDressing(scene, 'seaside');
    if (process.env.BUDGET_LOG) console.log('seaside dressed', JSON.stringify(budgetStats(scene)));
    expect(budgetStats(scene).triangles).toBeLessThanOrEqual(29513);
  });
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
