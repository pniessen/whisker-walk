import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { createWater } from '../render/water.js';
import { addTrails } from './pathribbon.js';
import { BASIN_PROFILE, SPIRE_PROFILE, BASIN_WATER, latheGeometry, dressFountain } from './parkfountain.js';
import { sureClawsTreePerch, SURE_CLAWS_ID } from '../climbing.js';

// =============================================================================
// City Park.
//
// THE POND — v19 "make water real".
//
// The duck pond is a 7m circle at (-14, 2) and, like every other body of water
// in the game, it carries no collider today: the cat walks straight across it.
// A later wave makes water solid, so this file declares the footprint as data
// (see `waters` in the returned object, and the WATER note at the bottom of
// builder.js) and keeps everything the player has to REACH out of it:
//
//   * No collectible, golden mouse, scenic, POI, tippable, perch, box, puddle
//     or spawn point sits inside the circle. The POI that used to sit on the
//     pond's exact centre moved to the north shore in v19 — see the note on it
//     below; it was by far the worst of these, because `pois` is what the
//     daily race's five rings and every quest target are derived from, and
//     race.js checks only the CURRENT ring, with no skip and no timeout.
//   * The pond is an island of water in the middle of open lawn, so it cannot
//     cut the map in two the way the Docks canal could; there is dry grass all
//     the way round it and test/water.test.js walks it.
//   * The ducks still swim in it, and the duckling-parade moment still starts
//     from the middle of it — a moment's `from` is a critter's starting point,
//     not somewhere the cat is ever asked to stand.
//
// test/water.test.js pins all of that, for this area and for the seaside,
// exactly the way test/docks.test.js has pinned the canal since v18.
// =============================================================================

// The pond footprint. The mesh below is BUILT from this record rather than
// standing beside it, so the drawn water and the declared water cannot drift
// apart.
const POND = { id: 'pond', kind: 'circle', x: -14, z: 2, r: 7, shallow: 1.2 };

// builder.js's own roughness-only helper, restated here because it is
// module-local there and the fountain is the one assembly this file builds
// itself. Same two rules it exists for (see the block above surfNoMap in
// builder.js): a planar tile smears on a 12- or 8-sided cylinder, and a member
// narrower than one tile gets a whole tile squashed into it. The fountain is
// both, so it takes the preset's light response with the map left off.
const surfNoMap = (color, surface) => litMaterial(color, surfaceProps(surface));

// -----------------------------------------------------------------------------
// SURFACES AND WATER (v20). The Docks pilot's brief governs here too: the art
// direction is flat and matte, and a prop that reads fine flat stays flat. What
// this area is literally made of is lawn, gravel, foliage and stone, and that
// is what it now asks for:
//
//   * the ground is 'grass' — the largest single surface in the game, and the
//     one colour the area is named for. builder.ground applies the grass tile's
//     own luminance compensation, so the authored 0x6cb058 is untouched here;
//   * the five path segments are 'gravel' — the road-aggregate tile, whose
//     22-33mm stones are what a park walk is actually made of. They were
//     'sand' before gravel existed, and at sand's 11mm grain the walks
//     measured 2-5 sRGB units of variation and were nearly invisible;
//   * the fountain's basin and spire take 'cobble's dressed-stone response with
//     the map off (see surfNoMap above);
//   * the pond becomes real water — see the createWater call.
//
// DELIBERATELY FLAT, each with its reason:
//   * the fountain's own water disc keeps the 'water' PRESET rather than
//     becoming a second createWater — see the note on it below;
//   * everything else the park plants (benches, lamp posts, the billboard,
//     leaf litter, cardboard boxes, rocks, puddles, tree bark and canopies)
//     is built by builder.js, which already made and documented each of those
//     calls in the foundation wave. This file adds no surface to them, because
//     re-deciding a shared prop's material from one area is exactly how five
//     areas end up disagreeing about what a bench is made of.
//
// `opts.water` is the tier/reduced-motion pair walk.js threads in and
// `opts.wind` is the per-walk sway registry; both default, so a bare
// build(scene) — which every world test does — still builds the high-tier
// surface rather than throwing.
//
// WIND. Unlike the Docks, this area is nothing BUT foliage: seventeen trees,
// eight bushes and five flower patches register themselves as they are planted
// (thirty objects), from the same lines that plant them. Nothing else does.
// Wind is a rotation about each prop's own origin — position.x/z never moves —
// so not one collider, perch or Sure Claws fork record shifts a millimetre.
// -----------------------------------------------------------------------------
// Where a walk places the cat. Exported so rivalclans' tests can prove a rival disc never covers it.
export const SPAWN = Object.freeze({ x: 0, z: 45 });

// The five gravel walks, [x1, z1, x2, z2], in the order the old path() calls
// made them (the hidden footprint strips keep that order; see addTrails).
// South gate -> fountain, fountain -> pond bend, bend -> south-west lawn,
// on to the east corner, and the fountain's east spur.
export const PARK_PATHS = Object.freeze([
  Object.freeze([0, 48, 0, 20]),
  Object.freeze([0, 20, -4, 4]),
  Object.freeze([-4, 4, -8, -18]),
  Object.freeze([-8, -18, 12, -30]),
  Object.freeze([0, 20, 16, 10]),
]);
// The walks' look (polish-park2): pathribbon.js's 'gravel' look over the
// gravel tile, in a pale warm stone a shade lighter than path()'s 0xcbb8a0.
export const PARK_PATH_STYLE = Object.freeze({ surface: 'gravel', color: 0xd6c6a8, look: 'gravel' });
// The south walk's (0, 48) end counts as a map edge (edge: 48) and runs on
// PARK_PATH_EXTEND metres, out through the hedge's field gate at z = 60.6
// (PARK_HORIZON.edge.gaps) instead of stopping square in the lawn. 19, not
// the plan's ~13: the horizon band lies flat (y -0.03) out to z ~66 and only
// then rises, so a 13 m run left the round tip on show 2 m past the gate; at
// 19 the walk runs on to z 67 and its tip goes in under the rising band
// (which crosses the trail's y 0.01 at z ~66.3).
export const PARK_PATH_EDGE = 48;
export const PARK_PATH_EXTEND = 19;

// The horizon band (see the note at its scene.add in build). Polish "edges":
// the strip past the lawn's edge is the lawn's own colour, and a clipped
// hedge runs round the edge with a field gate where the gravel path from the
// south gate (3 m wide, on x = 0) runs out.
export const PARK_HORIZON = Object.freeze({
  kind: 'hills', inner: 56, outer: 116, height: 8, wavelength: 40,
  color: 0x8ac27e, salt: 23,
  nearColor: 0x6cb058,
  edge: Object.freeze({
    half: 60, style: 'hedge', avoid: Object.freeze([POND]),
    gaps: Object.freeze([Object.freeze({ x: 0, z: 60.6, r: 2 })]),
  }),
});

export function build(scene, { water = {}, wind } = {}) {
  b.applySky(scene, 0xaee0d0, 0xd8f0e0);
  // The lawn. The repeat comes from the plane's own 120m inside ground(), and
  // the hex stays the one a human picked: builder.ground compensates grass's
  // 0.955 mean itself so the authored colour is what lands on screen.
  scene.add(b.ground(120, 0x6cb058, { surface: 'grass' }));

  // The horizon band (VISUAL-PASS.md Wave 4.3) — see builder.horizonBand's own
  // block for the geometry, and neighborhood.js's call for the reasoning
  // behind `inner`/`outer` (56 buries the seam four metres inside the 120m
  // lawn's edge; 116 keeps the far rim inside the fog's 130m).
  //
  // The park's hills are the TALLEST and the WIDEST-SPACED of the four bands,
  // and that is the one place this area's copy differs from the suburb's. A
  // town park is a piece of countryside that a town grew around; what is over
  // its wall should read as more countryside, and further away, rather than as
  // more streets. 8m crests at 40m spacing gives two or three big rolling
  // masses per side instead of the suburb's five or six low swells.
  //
  // The colour is the lawn's 0x6cb058 carried a third of the way to this
  // area's own horizon stop (0xd8f0e0, from applySky above) — aerial
  // perspective painted in, because fog does not begin until 40m and the near
  // corner of the band sits inside that.
  scene.add(b.horizonBand(PARK_HORIZON));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });

  // v18 CF-9b — Sure Claws' "props that were scenery become climbable".
  // Gated by `requires`, unlabelled and non-vantage; see the same block in
  // neighborhood.js for why all three of those matter.
  //
  // The park is the area where the height half of the ability is decided:
  // sixteen scenery trees open here, and the one tree that ALREADY carries a
  // perch — the oak at (4.5, 27.3), branch y 2.1, holding gm-park-2 and
  // feather-5 — is exactly what caps climbing.js's 'tree' ceiling at 2.0. It
  // is not in this list: it is a chain, not scenery, and it stays a chain.
  const clawPerches = [];

  // winding path: south gate → fountain → pond → north meadow
  //
  // 'gravel' — the tile built for exactly this, and the walks are literally
  // described as gravel a few lines up. path() lands it at [2, n] on a 3m
  // width, i.e. 1.5m a tile, the same grit size on all five segments because
  // the repeat is derived from each one's own extent rather than typed.
  //
  // This was 'sand' until gravel existed, and the swap is a measured fix, not
  // a rename. Sand is the beach tile: its grains are ~11mm at its 0.8m tile,
  // and it originally shipped at a mean of 0.998 with a pixel sigma of half a
  // value step. Sampled here at 0.6m eye height standing ON the walk, 1647
  // pixels of gravel spanned 2-5 sRGB units — the surface was very nearly
  // invisible, and this was flagged as the one call on that pass a reviewer
  // might reasonably swap back to a flat path.
  //
  // Gravel is sigma 7.9 against sand's 6.2, and — the part that actually
  // matters here — its stones are 22-33mm rather than 11mm, which is what a
  // walk you can hear underfoot is made of. Nothing to compensate on the
  // colour: gravel's mean is 0.961, and path()'s 0xcbb8a0 is a fixed pale
  // warm tan that no call site passes, so the ~4% is uniform across every
  // path in the game and there is no untextured neighbour to match.
  //
  // polish-park2: the five hard slabs are now ONE soft trail (pathribbon.js,
  // the 'gravel' look: tidy edge, an edging line, round joints, fine stones);
  // PARK_PATHS above holds the five segments. The five hidden 1x1 'path'
  // strips addTrails leaves behind are the same five, same params, same order.
  // The bend at (-4, 4) used to be at (-14, 6) — 4m from the pond's centre,
  // i.e. THREE METRES INSIDE a 7m pond, and shared by both segments, so the
  // walk ran through open water on both legs (measured against the corrected
  // geometry: 3.88m and 6.94m of it). Harmless while water was a walk-over
  // surface; a gravel path into a lake once v19 made water solid.
  //
  // It had to move EAST, not north. Sliding it up the shore keeps the first
  // segment dry and makes the second one worse — that leg still has to reach
  // (-8, -18), so from anywhere north of the pond it cuts through the middle.
  // Going east threads the walk down the eastern shore instead, which is what
  // "south gate -> fountain -> pond" wanted in the first place.
  //
  // (-4, 4) leaves the gravel 1.87m clear of the waterline on the approach and
  // 0.98m at the closest point heading south — near enough to still read as
  // walking beside the pond, which is the point of the path. Measured through
  // the real builder, not estimated; test/water.test.js samples the built
  // meshes and fails if any path ever enters water again.
  addTrails(scene, [{ segs: PARK_PATHS, w: 3 }], PARK_PATH_STYLE, 'park',
    { edge: PARK_PATH_EDGE, extend: PARK_PATH_EXTEND });

  // fountain at the path junction. Dressed stone, map-less: a planar tile
  // smears on a turned profile, and the column is 0.2-0.3m across besides.
  // 'cobble' (0.8) rather than 'wetStone' (0.55) — the sheen preset would put
  // a bright bloom on a pale, sky-facing 2.6m drum, and the art direction's own
  // rule is that between two defensible numbers the matter one wins. The rim
  // is a shipped perch (kind 'stone') and the collider stays r 3.
  //
  // polish-park2 Task 2: the glass-tube spire in a plain saucer becomes a
  // two-tier stone fountain (parkfountain.js). The three constructor slots
  // below are the shipped ones, in the shipped order — only the basin's and
  // spire's geometry TYPE changed (cylinder -> lathe profile), which is still
  // one geometry each, so the area's Math.random draws do not move. Everything
  // new (upper water, falling drops, ripples) is made in dressFountain under
  // local uuids.
  const fountain = new THREE.Group();
  const basin = new THREE.Mesh(latheGeometry(BASIN_PROFILE),
    surfNoMap(0xb8b8c0, 'cobble'));
  basin.name = 'fountainBasin';
  fountain.add(basin);
  // THE FOUNTAIN'S WATER KEEPS THE PRESET, and does not become a second
  // createWater. That is water.js's own split, written down in its ROUGH_DEEP
  // note: a body with a `waters` footprint record is drawn by createWater, and
  // water WITHOUT one — this disc, and the puddles — takes the 'water' preset.
  // The three reasons all hold here. It has no footprint record (v19 left it
  // out deliberately: it is a r-2.3 disc wholly inside the basin's r-3
  // collider, so the cat can never stand on or beside it). It is 4.6m across,
  // which is smaller than createWater's 3m shelf plus 0.7m foam band — the ramp
  // would be all margin and no water. And it is a fountain basin: still, held,
  // and with no shoreline for a foam band to trace. Roughness 0.12 with no map
  // is exactly what a smooth dielectric film on a small disc wants, and the
  // colour is the one builder.puddle uses for the same reason.
  const fountainWater = new THREE.Mesh(
    new THREE.CylinderGeometry(BASIN_WATER.r, BASIN_WATER.r, BASIN_WATER.h, BASIN_WATER.segments),
    litMaterial(0x8ab8d8, { surface: 'water' }));
  fountainWater.position.y = BASIN_WATER.top - BASIN_WATER.h / 2;
  fountainWater.name = 'fountainWater';
  fountain.add(fountainWater);
  const spire = new THREE.Mesh(latheGeometry(SPIRE_PROFILE),
    surfNoMap(0xb8b8c0, 'cobble'));
  spire.name = 'fountainSpire';
  fountain.add(spire);
  dressFountain(fountain, { reducedMotion: !!water.reducedMotion });
  fountain.position.set(0, 0, 20);
  scene.add(fountain);
  addC(0, 20, 3);

  // --- the pond -------------------------------------------------------------
  // Still drawn from POND, so the water on screen and the water in the data are
  // the same circle by construction — createWater builds its geometry from the
  // footprint verbatim (CircleGeometry(POND.r) at POND.x/z), which is what
  // keeps test/water.test.js's "draws that footprint from the declaration" case
  // honest. The mesh goes into the scene DIRECTLY and never into a Group: that
  // case matches against scene.children, and a nested mesh is invisible to it.
  //
  // y 0.02 and 0x7ab0d8 are the plane's own shipped values, so nothing
  // re-stacks against the paths and the pond keeps its friendly cyan identity.
  //
  // THE COLOUR MOVES, AND THAT IS THE FIX. waterRamp puts BOTH ends of its ramp
  // BELOW the authored hex rather than straddling it, and the reason it gives
  // — that this pond is already blowing out — was measured on the real
  // renderer rather than assumed. At walk.js's own lighting (2.2 sun over 0.9
  // ambient, envIntensity 0.45, ACES at exposure 1.1) the flat plane that
  // shipped renders at sRGB 185,213,227 — and at 185,213,227 at every other
  // point on the disc too, near rim and far, at cat height and from above.
  // The authored 0x7ab0d8 is 122,176,216: the surface comes out 50% brighter
  // in red, desaturated from HSL 0.55 to 0.43, and with a value range of
  // exactly zero. It is on the tone curve's shoulder, which the same
  // measurement shows directly — lifting the albedo 25% (to 0x99ddff) moves
  // blue only 227 -> 237, and lifting it again to 0xb8ffff moves it not at
  // all, while dropping it 25% moves red 185 -> 143. So the prediction held.
  //
  // The new surface measures 55,138,188 out in the deep and 144,186,215 in
  // the shallow/foam band at the rim. The pond finally has a value range, it
  // sits back down off the shoulder where the lighting can shape it, and the
  // authored hex is its identity rather than one of its two ends.
  //
  // Everything else is left at the module's defaults ON PURPOSE: SHELF_M (3m),
  // FOAM_M (0.7m) and FOAM_STRENGTH (0.45) were all tuned against THIS body —
  // water.js's SHELF_M note says the park pond is the constraint that sets it —
  // so the 0.35 foam the Docks canal needed would be second-guessing the
  // numbers' own worked example. The pond is a circle ringed by lawn, so the
  // foam band traces the whole rim, which is right: unlike the seaside there is
  // no open horizon here, and unlike the canal every edge really is a shore the
  // camera sees from the grass side. The 48-segment rim is the default too, and
  // it is the one thing that changes shape: 20 segments left 2.2m chords that
  // the new foam band traces straight to, so the pond read as a polygon. Same
  // radius, same centre, same footprint — only the tessellation is finer.
  const pond = createWater(POND, {
    y: 0.02,
    color: 0x7ab0d8,
    quality: water.quality ?? 'high',
    reducedMotion: water.reducedMotion ?? false,
    // softer than the 0.45 default: the water dressing now draws the shore
    foamStrength: 0.25,
  });
  scene.add(pond.mesh);

  // big trees ring the lawns
  const treeSpots = [[-24, 30], [-30, 10], [-26, -14], [-16, -34], [8, -38], [22, -22],
    [28, 0], [24, 24], [12, 36], [-6, 34], [6, -8], [16, -6]];
  for (const [x, z] of treeSpots) {
    // Local, then passed to both the model and the fork perch — see the same
    // note in neighborhood.js. Every park tree is scale 1.2 or more, so all
    // sixteen forks land on TREE_FORK_MAX (1.9) rather than on trunk-top
    // minus 0.1: a big park tree gets a LOW fork, which is both the honest
    // reading of a wide oak and the reason none of them out-tops the 2.1
    // branch on the oak that holds the golden mouse.
    const scale = 1.2 + ((x + z) % 4) * 0.15;
    // `wind` sways the whole tree Group by a small rotation about its own
    // origin. Its lean grows with sqrt(scale), so these 1.2-1.65 oaks move a
    // little more than an ordinary tree and still stay inside a few degrees at
    // the rain-gust peak — and `g.position.x/z` never moves, so the collider on
    // the next line and the Sure Claws fork on the one after are untouched.
    scene.add(b.tree(x, z, scale, { wind }));
    addC(x, z, 0.7);
    clawPerches.push(sureClawsTreePerch(x, z, scale));
  }
  // A bush comes back as a pivot Group once `wind` is passed (builder.bush's
  // note explains why: hinging at the soil rather than about its own belly).
  // Same (x, z), same hide spots, quicker and much smaller motion than a tree.
  for (const [x, z] of [[-10, 26], [10, 18], [-20, -6], [4, -24]]) scene.add(b.bush(x, z, { wind }));

  // extra trees in the far lawn corners (with colliders) + leaves beneath three of them
  const scatterTrees = [[-40, -40], [40, 40], [-40, 40], [40, -40]];
  for (const [x, z] of scatterTrees) {
    scene.add(b.tree(x, z, 1.1, { wind }));
    addC(x, z, 0.6);
    clawPerches.push(sureClawsTreePerch(x, z, 1.1));
  }
  // Leaf litter stays still and stays flat, both by builder decision: 9cm discs
  // lying on the ground are an order of magnitude under any tile, and dead
  // leaves on grass are the one thing in the park the wind should not lift.
  for (const [x, z, seed] of [[-40, -40, 1], [40, 40, 2], [40, -40, 3]]) scene.add(b.leafLitter(x, z, seed));
  for (const [x, z] of [[-35, -20], [35, 20], [-35, 35], [35, -30]]) scene.add(b.bush(x, z, { wind }));
  for (const [x, z] of [[-40, 10], [40, -10]]) scene.add(b.flowerPatch(x, z, { wind }));
  // an oak beside the bench — its branch is the second step of a short
  // climb chain (bench -> branch), 1.98 horizontally and 1.52 vertically
  // from the bench, both inside the reach/climb budget.
  // Swayed like every other tree, and safely so: the branch perch at y 2.1 —
  // the one that caps Sure Claws' tree ceiling and holds gm-park-2 and
  // feather-5 — is a record in `perches` at a fixed (x, z, y), and wind only
  // rotates the Group about its own trunk axis.
  const oak = b.tree(4.5, 27.3, 1.1, { wind });
  // The low limb golden mouse gm-park-2 sits out on (src/goldmice.js). The
  // mouse used to sit on the branch perch's own (x, z), the trunk's axis,
  // inside the trunk and the canopy and hidden from every side. The limb
  // reaches from the trunk away from the bench (the bench side is where the
  // villager critter at (4, 27) stands), under the canopy, to just past
  // the mouse, its top under the mouse's belly. A child of the oak, in its
  // scaled frame, so it sways with it (as the Woods' great oak's limb does).
  const s = 1.1;
  const oakLimb = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05 / s, 0.09 / s, 0.6 / s, 6),
    litMaterial(0x7a5230, surfaceProps('bark')),
  );
  oakLimb.name = 'oakLimb';
  // Along the bench-to-trunk bearing, from 0.2 m out to 0.8 m, its axis at
  // y 1.2 (top 1.28 at the mouse, whose belly is at 1.28).
  const dir = new THREE.Vector3(4.5 - 3, 0, 27.3 - 26).normalize();
  oakLimb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); // thin end out
  oakLimb.position.set((dir.x * 0.5) / s, 1.2 / s, (dir.z * 0.5) / s);
  oak.add(oakLimb);
  scene.add(oak);
  addC(4.5, 27.3, 0.6);
  scene.add(b.bench(3, 26, -0.5));
  scene.add(b.bench(-4, 14, 0.7));
  scene.add(b.bench(-10, -20, 2.2));
  // The meadow bench — the one bench in the park that never got a perch,
  // 24m from the nearest perched bench and so out of every reach and every
  // fence-run dash. Opened by CF-9b at the same 0.58 seat height the other
  // three ship at.
  scene.add(b.bench(14, -28, -2.4));
  clawPerches.push({ x: 14, z: -28, y: 0.58, kind: 'furniture', requires: SURE_CLAWS_ID });
  for (const [x, z] of [[2, 40], [-12, 10], [-4, -14], [10, -32]]) scene.add(b.lampPost(x, z));

  scene.add(b.billboard(6, 38, -0.5));
  addC(6, 38, 2.3);
  for (const [x, z] of [[-18, 22], [20, 12], [6, -16]]) scene.add(b.flowerPatch(x, z, { wind }));
  const puddles = [{ x: 2, z: 32, r: 0.9 }, { x: -10, z: -8, r: 0.8 }];
  for (const p of puddles) scene.add(b.puddle(p.x, p.z, p.r));

  // cardboard boxes
  for (const b2 of [[5, 33], [-12, -14]]) scene.add(b.cardboardBox(b2[0], b2[1]));

  return {
    name: 'City Park',
    colliders,
    bounds: { minX: -45, maxX: 45, minZ: -50, maxZ: 52 },
    spawn: { x: SPAWN.x, z: SPAWN.z },
    boxes: [{ x: 5, z: 33 }, { x: -12, z: -14 }],
    pois: [
      { x: 0, z: 20 },
      // v19: WAS (-14, 2) — the pond's exact centre, and the single worst
      // number in this file once water goes solid. clearSpot could not save
      // it (the pond carries no collider for it to see), race.js picks five
      // of these eight and stalls forever on a ring it cannot cross, and
      // quest completion wants the cat within 2m of it.
      //
      // Now on the north shore beside the `pond-shore` scenic at (-14, 10),
      // which is the convention this area already authored for "at the pond,
      // not in it". 9m from the pond centre, so 2.0 clear of the water edge,
      // which covers all three consumers off dry grass the cat stands on
      // directly: the race ring-cross at 1.2, quest completion at 2.0, and
      // secrets.js's gnome, which hides at a random POI +/- 1.5 and so would
      // otherwise still paddle.
      { x: -14, z: 11 },
      { x: 3, z: 26 }, { x: -10, z: -20 },
      { x: 12, z: -30 }, { x: 22, z: -22 }, { x: -18, z: 22 }, { x: 16, z: 10 },
    ],
    collectibles: [
      { id: 'feather-1', x: -25, z: 29, label: 'a jay feather' },
      { id: 'feather-2', x: 27, z: 1.5, label: 'a dove feather' },
      { id: 'feather-3', x: -15.5, z: -33, label: 'a golden feather' },
      { id: 'feather-4', x: 11, z: 35, label: 'a tiny down feather' },
      { id: 'feather-5', x: 4.5, z: 27.3, y: 2.1, label: 'a downy feather from way up high' },
    ],
    // The park's one body of water. See the POND note in this file's header;
    // the fountain is not listed because its water disc (r 2.29) sits wholly
    // inside the basin's own r-3 collider and has always been unreachable.
    waters: [POND],
    // The visual half of that same record: walk.js bundles these into a
    // waterRig and drives update(dt)/dispose() with the walk's other per-walk
    // systems. One entry, one footprint — they are the same list twice.
    waterFx: [pond],
    scenics: [
      { id: 'fountain', x: 3, z: 23, label: 'the old fountain' },
      // 1.0 clear of the pond's north edge — the shore, not the water. Both
      // gates that consume a scenic are satisfied standing on the spot
      // itself: the 4m visit award and Gift Paws' 3m leave range.
      { id: 'pond-shore', x: -14, z: 10, label: 'the duck pond' },
      { id: 'meadow', x: 12, z: -30, label: 'the quiet meadow' },
    ],
    critterSpawns: [
      { type: 'bird', x: -24, z: 30 }, { type: 'bird', x: 22, z: -22 }, { type: 'bird', x: 12, z: 36 },
      { type: 'bird', x: -26, z: -14 },
      { type: 'squirrel', x: -30, z: 10, x2: -16, z2: -34 },
      { type: 'squirrel', x: 28, z: 0, x2: 8, z2: -38 },
      { type: 'butterfly', x: -18, z: 22 }, { type: 'butterfly', x: 20, z: 12 }, { type: 'butterfly', x: 6, z: -16 },
      { type: 'duck', x: -14, z: 2 }, { type: 'duck', x: -12, z: 0 }, { type: 'duck', x: -16, z: 4 },
      { type: 'mouse', x: -9, z: 25, x2: -4, z2: 30 },
      { type: 'mouse', x: 6, z: -18, x2: 2, z2: -24 },
      { type: 'villager', x: 4, z: 27, standOff: { x: 1.5, z: -1.4 } }, { type: 'villager', x: -8, z: -22 },
    ],
    moments: [
      { id: 'duck-parade', label: 'a duckling parade crossing the path!', x: -8, z: 8, from: { x: -14, z: 2 } },
      { id: 'picnic-thief', label: 'a squirrel making off with a picnic sandwich', x: 3, z: 26, from: { x: -30, z: 10 } },
    ],
    puddles,
    // The hemisphere fill's ground term (game/walk.js) — the lawn hex from
    // b.ground() above. Marginally deeper than the neighbourhood's, which is
    // the point: the park should feel like the greener of the two from below
    // as well as from above.
    groundBounce: 0x6cb058,
    skyDusk: { top: 0x2a3a5e, horizon: 0x6a5a7e },
    tippables: [
      { x: 7, z: 29, kind: 'can' }, { x: -3, z: 15, kind: 'pot' },
      { x: -9, z: -21, kind: 'bin' }, { x: 15, z: -27, kind: 'pot' },
    ],
    // `kind` (v18 CF-9b): the fountain rim is 'stone' and the oak branch is
    // the game's one shipped 'tree' — the perch that caps Sure Claws' tree
    // ceiling at 2.0, one tenth below it, so this chain can never be taken
    // in a single hop off the grass.
    perches: [
      { x: 3, z: 26, y: 0.58, kind: 'furniture' }, { x: -4, z: 14, y: 0.58, kind: 'furniture' },
      { x: -10, z: -20, y: 0.58, kind: 'furniture' },
      { x: 2.8, z: 22.2, y: 0.75, kind: 'stone', label: 'fountain-edge lookout', vantage: true },
      { x: 4.5, z: 27.3, y: 2.1, kind: 'tree', label: 'oak branch lookout', vantage: true },
      // Sure Claws only: sixteen tree forks and the meadow bench.
      ...clawPerches,
    ],
  };
}
