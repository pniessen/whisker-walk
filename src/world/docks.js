import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial } from '../render/materials.js';
import { createWater } from '../render/water.js';
import { SURE_CLAWS_ID } from '../climbing.js';

const mat = (color) => litMaterial(color);

// =============================================================================
// The Old Docks — v18 Task 2.6, the fourth walkable area.
//
// A night-lit canal and warehouse district, chosen because it is the one
// setting that exercises all four ability families at once:
//
//   Traversal  the warehouse roof chain tops out at y 6.2 — half again the
//              height of the neighborhood ridge (y 4.1), and the longest
//              chain in the game at five hops on the baseline budget.
//   Senses     it is dark. skyDusk here is near-black, which is what finally
//              gives Night Eyes something to brighten.
//   Mischief   twelve tippables, against four or five everywhere else.
//   Social     the most compact bounds of any walk area (76 x 80 against the
//              neighborhood's 110 x 110), so the same 22 strays walk.js
//              spawns read as an alley-cat colony rather than a scattering.
//   Sea Legs   a canal cuts the district in two.
//
// -----------------------------------------------------------------------------
// SEA LEGS SHIPPED (v19 collider wave) — and nothing here depends on it.
//
// This block used to open "SEA LEGS MAY NEVER SHIP", because the ability was a
// Stage 3 descope candidate and was in fact cut (v18 CF-12). It shipped in the
// v19 collider wave once water became solid. The authoring rule below did NOT
// change and is now load-bearing in the other direction: it is what makes the
// ability a shortcut rather than a key. Everything here stays completable with
// no swimming at all:
//
//   * The canal WAS scenery — water carried no colliders anywhere in the game,
//     so it blocked nothing. It blocks now: a cat without Sea Legs is held out
//     of the footprint, and a cat with it swims at 0.55x pace.
//   * Both banks are joined by TWO dry crossings — the main bridge at x 0 and
//     the plank bridge at x -24 — which is what kept the district fully
//     connected when the water-collider task landed. test/waterblock.test.js
//     now drives both crossings at 0.25m steps, and test/water.test.js
//     flood-fills the dry land as one component joined to spawn on foot.
//   * No collectible, golden mouse, scenic, POI (and therefore no race
//     checkpoint or quest target, both of which derive from `pois`), tippable
//     or perch sits inside the canal footprint |z| <= 3.5. The two moored
//     barges are the only things in the water and they hold nothing.
//
// test/docks.test.js pins all of that, so an accidental drift into the water
// fails the suite rather than quietly requiring an ability that may not exist.
// -----------------------------------------------------------------------------
//
// THE CANAL runs east-west across the full map at z in [-3.5, 3.5]. North of
// it is the warehouse row; south of it is the night market and the crane yard.
//
// v19 amendment: the footprint above, and the two bridges that cross it, are
// now DECLARED as data in `waters` below rather than living only in this
// comment and in test/docks.test.js's CANAL_HALF literal. The park pond and
// the seaside sea gained the same declaration, so the future water-collider
// wave has one shape to read for all three instead of three sets of mesh
// literals to re-derive. Nothing about the district's content changed: it was
// already clean, and test/docks.test.js already proved it.
// =============================================================================

const CANAL_HALF = 3.5;
// The canal footprint. A band is just a rect that spans the whole map, so it
// needs no third geometry kind. The two `decks` are the dry crossings — the
// hole a future water collider has to leave in itself, which is the same
// property the Sea Legs note above has always claimed and test/docks.test.js
// has always walked. Their extents are the bridgeDeck() calls below read back
// as rectangles: the main bridge is 5 wide at x 0 spanning z -6.5..6.5, and
// the plank bridge is 2.2 wide at x -24 spanning z -5.5..5.5.
const CANAL = {
  id: 'canal', kind: 'rect', minX: -45, maxX: 45, minZ: -CANAL_HALF, maxZ: CANAL_HALF,
  decks: [
    { minX: -2.5, maxX: 2.5, minZ: -6.5, maxZ: 6.5 },
    { minX: -25.1, maxX: -22.9, minZ: -5.5, maxZ: 5.5 },
  ],
};

// -----------------------------------------------------------------------------
// SURFACES AND WATER (v20). The district is the pilot for both, and the whole
// brief is SUBTLETY: materials.js opens with "cozy low-poly art direction
// stays flat/matte", every tile is under a 14% value range, and a prop that
// reads fine flat stays flat. What got a surface here is what the area is
// literally described as being made of — wet cobbles underfoot, brick and
// painted-timber warehouse walls, roofing felt, dock timber, yard-painted
// steel, glass. What did NOT: the quay edging, the paths and sidewalks, the
// bollard ropes, the barrels, the roof tank, the awning canvas, the bridge
// decks (their planking is already geometry, and the plank tile's boards run
// along the deck where the raised strips run across it — two rhythms
// disagreeing is worse than none) and the puddles (the `water` preset is
// right for them, but walk.js builds rain puddles for every area from one
// shared call, so they belong to the global pass, not to this pilot).
//
// `opts.water` is the tier/reduced-motion pair walk.js threads in, widened
// the way den.js's build(scene, { placed }) already does it. Both keys
// default, so a bare build(scene) — which every world test does — still
// produces the high-tier surface rather than throwing.
//
// walk.js also passes `opts.wind`, the per-walk sway registry, and THE OLD
// DOCKS DELIBERATELY REGISTERS NOTHING WITH IT — not an omission. Wind sways
// foliage, and there is no foliage here: the perch-chain note at the bottom of
// this file already says it in as many words ("there is not a tree or a fence
// in the district"), which is why Sure Claws' height lift is inert in this
// area. So the rig is created, driven and torn down for every walk, and the
// content that will actually move lands with the other three areas.
//
// The one candidate a reviewer might want to overrule that with is the eight
// market awnings — canvas over a night market is the most wind-shaped thing in
// the district. It is left alone here because sway leans the WHOLE stall, and
// every stall carries a 1.2 collider and a CF-9b gated perch at its awning:
// the lean is ~3cm at that height and the records do not move, but "rock the
// prop the cat is standing on" is a judgement about content, not materials,
// and this pass is not the place to make it unasked.
// -----------------------------------------------------------------------------
export function build(scene, { water = {} } = {}) {
  // Overcast harbour daylight — muted rather than cheerful, so the area reads
  // as "the old docks" even before dusk. skyDusk (returned below) drops it to
  // near-black, which is the Night Eyes showcase.
  b.applySky(scene, 0x5e7290, 0x8e9aae);
  // Wet cobbles, at last literally: 'wetStone' is the cobble tile at roughness
  // 0.42, the one preset in the table that is a sheen rather than a matte, and
  // its own docstring names this exact surface. The repeat is derived from the
  // plane's real 120m (100 tiles of 1.2m, i.e. 0.3m setts) rather than picked
  // — a picked number on a plane this size is a visible plaid. The colour is
  // NOT lifted for the cobble tile's 0.961 mean: four percent darker is the
  // right direction for an overcast harbour, and this is the one surface the
  // area's name is about.
  scene.add(b.ground(120, 0x4e4e58, { surface: 'wetStone' }));

  // The horizon band (VISUAL-PASS.md Wave 4.3) — see builder.horizonBand's own
  // block for the geometry and for why it carries no collider, no perch and no
  // record. Purely what is on the far side of the water.
  //
  // 'skyline', and it is the only area that gets it. The other three look out
  // at land; the Docks look out at MORE DOCKS. This district is the industrial
  // edge of somewhere much bigger — its own header calls it the most compact
  // bounds in the game — and the thing that sells that is a rank of warehouse
  // gables and chimneys standing along the far quay, not a hill. The kind
  // flattens the ring surface to a gentle swell and puts the height into 52
  // merged rooftop blocks instead, half of them carrying a chimney or a tank
  // so the roofline never runs level for long. All of it merges into the SAME
  // single mesh as the ring: 52 buildings, one draw call.
  //
  // 9m roofs against the area's own 3.4m warehouses is deliberate and is the
  // only depth cue available at this distance — the far bank has to read as
  // bigger than the near one or the two collapse into one plane. The ring
  // itself is a 1.8m swell (kind 'skyline' derives that; see horizonBand) so
  // the town stands on flat ground the way a town does.
  //
  // 56/112: the inner rim is buried four metres inside the 120m quay plane and
  // the outer one stops well inside the fog's 130m — which matters more here
  // than anywhere, because this is the darkest palette in the game and its
  // horizon stop (0x8e9aae) is a pale overcast grey. The silhouette IS the
  // fog gradient. The colour is the quay's own 0x4e4e58 carried a bit over a
  // third of the way to that stop, which is more lift than the green areas get
  // for the same reason: an overcast sky puts more haze between you and a
  // building than a clear one does.
  scene.add(b.horizonBand({
    kind: 'skyline', inner: 56, outer: 112, height: 9,
    wavelength: 46, blocks: 52, color: 0x646976, salt: 41,
  }));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });

  // v18 CF-9b — Sure Claws' gated perches (see the same block in
  // neighborhood.js for why they carry no label and no vantage).
  //
  // THE CANAL RULE APPLIES TO THESE TOO. Every record pushed here must sit at
  // |z| > CANAL_HALF, exactly like a shipped perch: test/docks.test.js walks
  // `perches` in full and does not care whether a perch is gated, because a
  // future water-collider wave will not care either. The market stalls sit at
  // |z| >= 9 and the two quayside benches at |z| = 8.6, so the nearest gated
  // perch is five metres clear of the water.
  const clawPerches = [];
  // The collision system is circles only, so a rectangular building is
  // approximated by two circles laid along its long axis. Each radius is
  // chosen to cover the SHORT axis fully (the same generous, slightly
  // over-covering convention house() + addC(x, z, 3.4) uses in
  // neighborhood.js) — the cat is stopped a little off the wall rather than
  // being able to clip a corner.
  // `bodySurface` picks masonry or painted lap boards per building — the warm
  // bodies are brick, the two cool grey-blue ones are painted siding, which is
  // the read their colours already implied and now have a light response to
  // match. builder.warehouse compensates brick's 0.948 mean itself, so the
  // hexes below are still the shipped ones.
  const warehouseAt = (x, z, w, d, h, bodyColor, roofColor, r, spread, bodySurface) => {
    scene.add(b.warehouse(x, z, w, d, h, bodyColor, roofColor, bodySurface));
    addC(x - spread, z, r);
    addC(x + spread, z, r);
  };

  // --- the canal ------------------------------------------------------------
  // Still drawn from CANAL, so the water on screen and the water in the data
  // are the same rectangle by construction — createWater builds its geometry
  // from the footprint verbatim, which is what keeps test/water.test.js's
  // "draws that footprint from the declaration" case honest. The mesh goes
  // into the scene DIRECTLY and never into a Group: that case matches against
  // scene.children, and a nested mesh is invisible to it.
  //
  // y 0.04 and 0x24445e are the plane's own shipped values, so nothing
  // re-stacks against the quays and the canal keeps the dour dark-slate
  // identity the overcast palette needs (createWater derives its shallow,
  // deep and foam ends from that one hex).
  //
  // foamStrength 0.35 rather than the 0.45 default, on the module's own
  // advice for this body: the canal is 7m across, so its two foam bands are a
  // large fraction of the whole surface, and at a grazing camera a band that
  // measures modestly in metres reads as a wide halo. All four edges are land
  // here — unlike the seaside, the canal really is walled on every side.
  const canal = createWater(CANAL, {
    y: 0.04,
    color: 0x24445e,
    foamStrength: 0.35,
    quality: water.quality ?? 'high',
    reducedMotion: water.reducedMotion ?? false,
  });
  scene.add(canal.mesh);
  // stone quay edging on both banks (visual only — see the header note: no
  // collider may ever be added here, or the bridges stop being the crossing
  // and the canal becomes a Sea Legs dependency)
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(90, 0.3, 0.5), mat(0x6a6a72));
    edge.position.set(0, 0.15, side * (CANAL_HALF + 0.25));
    scene.add(edge);
  }

  // --- streets and quays ----------------------------------------------------
  scene.add(b.path(-36, 6.5, 36, 6.5, 4));   // north quay
  scene.add(b.path(-36, -6.5, 36, -6.5, 4)); // south quay
  scene.add(b.path(0, 6.5, 0, 36, 3));       // north bridge road
  scene.add(b.path(0, -6.5, 0, -36, 3));     // south bridge road
  scene.add(b.sidewalk(-36, 9, 36, 9));
  scene.add(b.sidewalk(-36, -9, 36, -9));

  // --- the two dry crossings ------------------------------------------------
  // Load-bearing, not decoration. See the Sea Legs note in the header.
  scene.add(b.bridgeDeck(0, -6.5, 0, 6.5, 5));
  scene.add(b.bridgeDeck(-24, -5.5, -24, 5.5, 2.2, 0.1));

  // --- north bank: the warehouse row ---------------------------------------
  // W1 is the tall one. Its flat roof (deck y 5.0, parapet top y 5.3) is the
  // top of the game's longest perch chain — see the chain table at the bottom
  // of this file before moving it a single metre.
  warehouseAt(20, 16, 10, 8, 5.0, 0x8a6a5a, 0x44404a, 4.2, 2.8, 'brick');
  warehouseAt(-6, 20, 12, 9, 4.2, 0x7a7a86, 0x3e3a46, 4.6, 3.0, 'siding');
  warehouseAt(-26, 15, 9, 8, 3.6, 0x86766a, 0x44404a, 4.3, 2.2, 'brick');
  warehouseAt(12, 32, 11, 8, 4.6, 0x74707e, 0x3e3a46, 4.3, 2.6, 'siding');

  // crate stack against W1's south-west corner: two tiers, tops at y 1.15 and
  // y 2.4. Tier 1 is the only thing on this whole chain a grounded cat can
  // reach (1.15 <= the 1.6 baseline climb budget).
  // Dock timber. `undefined` for the colour keeps builder.platform's default
  // while still reaching the options object — the crates are the same crates,
  // with the plank tile's grain and seams on them.
  scene.add(b.platform(16.2, 9.2, 1.15, 0, 1.1, undefined, { surface: 'wood' }));
  scene.add(b.platform(16.2, 9.2, 2.4, 1.15, 0.9, undefined, { surface: 'wood' }));
  addC(16.2, 9.2, 0.6);
  // fire escape hung off W1's south wall (the wall is at z 12; this stands
  // 1.6 clear of it so a grounded cat can get directly underneath — W1's
  // nearest collider centre is 5.66 away, well past its 4.2 + 0.35 stop).
  scene.add(b.fireEscape(18.0, 10.4, 0, [1.9, 3.9]));
  addC(18.0, 10.4, 0.5);
  // rooftop water tank, standing on W1's deck (y 5.0) — top y 6.2, the
  // highest standable point in the game.
  scene.add(b.roofTank(18.6, 13.6, 5.0, 1.2));

  // dark alley between W2 and W3 — the ground golden mouse hides here among
  // barrels and crates, none of which carry colliders (same trick as the
  // neighborhood's cardboard box at (-18, 8)), so the cat can walk right in.
  for (const [x, z, c] of [[-15.4, 18.4, 0x4a6a5a], [-17.4, 16.9, 0x6a5a4a], [-17.8, 19.2, 0x4a5a6a]]) {
    scene.add(b.barrel(x, z, c));
  }
  scene.add(b.cardboardBox(-15.6, 16.6, 0.4));
  scene.add(b.lampPost(-14, 20.5));

  // shipping containers stacked around the yards
  for (const [x, z, rot, color, cx, cz] of [
    [24, -21, 0, 0xb05a4a, 1.6, 0],
    [26.5, -25.5, 0, 0x3a5a78, 1.6, 0],
    [-30, -9, Math.PI / 2, 0x3a5a78, 0, 1.6],
    [19, 24, Math.PI / 2, 0xb05a4a, 0, 1.6],
    [-14, 30, 0, 0x3a5a78, 1.6, 0],
  ]) {
    scene.add(b.shippingContainer(x, z, rot, color));
    addC(x - cx, z - cz, 1.9);
    addC(x + cx, z + cz, 1.9);
  }

  // --- south bank: the night market ----------------------------------------
  const stalls = [
    [-25.0, -19.0, 0.35, 0xc85a5a], [-13.2, -9.4, 0.3, 0x5a7ac8], [-8.6, -13.2, -0.2, 0x5ac87a],
    [-3.0, -9.0, 0.1, 0xc8a05a], [2.6, -12.6, -0.35, 0xc85a5a], [10.2, -9.4, 0.2, 0x8a5ac8],
    [15.0, -13.0, -0.15, 0x5a7ac8], [20.4, -9.6, 0.25, 0x5ac87a],
  ];
  for (const [x, z, rot, color] of stalls) {
    scene.add(b.marketStall(x, z, rot, color));
    addC(x, z, 1.2);
    // CF-9b: the awnings were the largest block of pure scenery in the game —
    // eight canvas roofs at builder.js's STALL_AWNING, standing over the
    // densest tippable field in the game, and not one of them climbable. A
    // 1.3 hop is inside even the baseline climb, so what gates them is the
    // ability, not the height; the stall's own 1.2 collider stops the cat at
    // 1.55, comfortably inside the 2.6 reachHigh a perch above y 1 gets.
    clawPerches.push({ x, z, y: b.STALL_AWNING, kind: 'roof', requires: SURE_CLAWS_ID });
  }

  // the fish market shed — a LOW warehouse (h 1.8, parapet top y 2.1). Its
  // roof is deliberately just above the 1.6 baseline climb budget and just
  // under Spring Paws' 2.2, so it is the one chain in the area that visibly
  // collapses from two hops to one the moment that ability is earned.
  // painted timber rather than brick: it is a shed, not a warehouse
  scene.add(b.warehouse(6.5, -23.5, 6, 5, 1.8, 0x7a6a5a, 0x44404a, 'siding'));
  addC(6.5, -23.5, 3.2);
  scene.add(b.platform(4.0, -20.2, 1.1, 0, 1.0, undefined, { surface: 'wood' }));
  addC(4.0, -20.2, 0.55);

  // the dock crane. Its four legs get small colliders rather than one big
  // one, so the cat can walk underneath the gantry. The deck top is y 4.0 and
  // the operator cab's roof is y 5.4 (builder.js's CRANE_DECK / CRANE_CAB) —
  // the two tall steps of chain C.
  scene.add(b.dockCrane(-16, -12));
  for (const [lx, lz] of [[-18.2, -14.2], [-13.8, -14.2], [-18.2, -9.8], [-13.8, -9.8]]) addC(lx, lz, 0.45);
  // chain C step 2: a container broadside to the crane, its east end 1.3
  // clear of the nearest leg so nothing overlaps and nothing traps the cat.
  scene.add(b.shippingContainer(-22.5, -14.0, 0, 0xb05a4a));
  addC(-24.1, -14.0, 1.9);
  addC(-20.9, -14.0, 1.9);
  // chain C step 1: a crate stack south of the container's east end. Small
  // enough (0.55 collider) to sit in the gap between the container and the
  // crane leg, which a market stall's 1.2 collider could not.
  scene.add(b.platform(-19.6, -16.6, 1.3, 0, 1.0, undefined, { surface: 'wood' }));
  addC(-19.6, -16.6, 0.55);

  // --- quayside dressing ----------------------------------------------------
  for (const [x, z] of [[-30, 4.2], [-18, 4.2], [-6, 4.2], [6, 4.2], [18, 4.2], [30, 4.2],
    [-30, -4.2], [-18, -4.2], [-6, -4.2], [6, -4.2], [18, -4.2], [30, -4.2]]) {
    scene.add(b.bollard(x, z));
  }
  for (const [x, z] of [[-28, 8], [-12, 8], [4, 8], [22, 8], [-28, -8], [-12, -8], [4, -8], [22, -8],
    [0, 24], [0, -24], [-33, 26], [26, -30]]) {
    scene.add(b.lampPost(x, z));
  }
  // two moored barges. They sit IN the canal and carry nothing — no perch, no
  // collectible, no collider (a collider out here could trap a cat that
  // wandered onto the water surface).
  scene.add(b.barge(14, 0, Math.PI / 2));
  scene.add(b.barge(-14, 0, Math.PI / 2, 0x5a6a4a));

  for (const [x, z, c] of [[-9.5, -6.0, 0x6a5a4a], [11.5, -6.2, 0x4a6a5a], [27.5, 7.6, 0x4a5a6a],
    [-25.5, -19.5, 0x6a5a4a], [30.5, -14.5, 0x4a6a5a], [-33.0, 12.0, 0x4a5a6a]]) {
    scene.add(b.barrel(x, z, c));
  }
  for (const [x, z] of [[-31, -26], [29, -31], [-32, 27], [24, 34], [8, -30], [-8, 32]]) scene.add(b.rock(x, z));
  // The two quay benches, one a side. Scenery until CF-9b, and the only
  // gated perches on the north bank — without them a Sure Claws cat would
  // find eight new things to climb in the market and nothing at all among the
  // warehouses. Both are 5.1 clear of the canal edge.
  scene.add(b.bench(-2.4, 8.6, Math.PI / 2));
  scene.add(b.bench(2.4, -8.6, Math.PI / 2));
  clawPerches.push(
    { x: -2.4, z: 8.6, y: 0.58, kind: 'furniture', requires: SURE_CLAWS_ID },
    { x: 2.4, z: -8.6, y: 0.58, kind: 'furniture', requires: SURE_CLAWS_ID },
  );
  scene.add(b.billboard(-4, -30, 0, 'FRESH CATCH', 'the old docks fish market · open late'));
  addC(-4, -30, 2.3);
  scene.add(b.bike(9.5, 7.6, 1.2));
  addC(9.5, 7.6, 0.5);

  const puddles = [{ x: 3, z: 11, r: 0.9 }, { x: -9.5, z: -7.4, r: 0.85 },
    { x: 22, z: -16.5, r: 0.8 }, { x: -27, z: 20, r: 0.9 }];
  for (const p of puddles) scene.add(b.puddle(p.x, p.z, p.r));

  for (const [x, z, rot] of [[-19, 6.8, 0.5], [9, -18.5, -0.4], [26, 8.5, 1.1]]) {
    scene.add(b.cardboardBox(x, z, rot));
  }

  return {
    name: 'The Old Docks',
    colliders,
    // The most compact walk area in the game (76 x 80). That is the whole
    // reason the district reads as a colony: walk.js spawns the same 22
    // strays here as everywhere else, over roughly half the neighborhood's
    // area, without needing a per-area stray count.
    bounds: { minX: -38, maxX: 38, minZ: -40, maxZ: 40 },
    spawn: { x: 0, z: -34 },
    // The canal and its two dry crossings. See the header.
    waters: [CANAL],
    // The visual half of that same record: walk.js bundles these into a
    // waterRig and drives update(dt)/dispose() with the walk's other per-walk
    // systems. One entry, one footprint — they are the same list twice.
    waterFx: [canal],
    boxes: [{ x: -19, z: 6.8 }, { x: 9, z: -18.5 }, { x: 26, z: 8.5 }],
    // Four POIs a side, all at |z| >= 6 — clear of the canal, so the daily
    // race course (five waypoints derived from these) and every quest target
    // are dry land, crossing between banks over the bridges.
    pois: [
      { x: 12, z: 8.5 }, { x: -14, z: 8.5 }, { x: 27, z: 27 }, { x: -31, z: 26 },
      { x: 10, z: -17 }, { x: -24, z: -6.5 }, { x: 28, z: -32 }, { x: -30, z: -32 },
    ],
    collectibles: [
      { id: 'tin-1', x: -30, z: -26, label: 'a dented sardine tin' },
      { id: 'tin-2', x: 28, z: -30, label: 'a rusted fishhook charm' },
      { id: 'tin-3', x: -31, z: 27, label: 'a glass float from a net' },
      { id: 'tin-4', x: 25, z: 33, label: 'a brass porthole ring' },
      // On W1's parapet, four hops up the warehouse chain. Reachable only by
      // climbing — the collectible pickup gate is 1.6 horizontal AND 0.9
      // vertical of the cat's perch height, and this sits exactly on the
      // 'warehouse parapet' perch.
      { id: 'tin-5', x: 17.0, z: 12.1, y: 5.3, label: 'a legendary brass ship’s bell' },
    ],
    scenics: [
      { id: 'canal-bridge', x: 4.5, z: 8.5, label: 'the old canal bridge' },
      { id: 'crane-yard', x: -16, z: -6.5, label: 'the great dock crane' },
      { id: 'lamplit-alley', x: -16.5, z: 18, label: 'the lamplit alley' },
    ],
    critterSpawns: [
      { type: 'seagull', x: 8, z: 6.8 }, { type: 'seagull', x: -20, z: 7.2 },
      { type: 'seagull', x: 24, z: -6.8 }, { type: 'seagull', x: 30, z: 12 },
      // The Docks' own critter — the eleventh journal entry. Rats patrol like
      // mice do (anchor -> anchor+span), so they take the same x2/z2 pair.
      { type: 'rat', x: -16.5, z: 18, x2: -12, z2: 20.5 },
      { type: 'rat', x: 5, z: -15.5, x2: 12, z2: -18 },
      { type: 'rat', x: 24, z: -22, x2: 28.5, z2: -18 },
      { type: 'rat', x: -28, z: -20, x2: -22, z2: -24 },
      { type: 'mouse', x: 18, z: 26, x2: 23, z2: 30 },
      { type: 'mouse', x: -30, z: 4, x2: -25, z2: 8 },
      // Ducks paddle in the canal on a radius-2 circle, so they stay inside
      // |z| <= 2 — and both sit within spotting range (6m) of the quay, so
      // the journal entry never needs swimming.
      { type: 'duck', x: 5, z: 0 }, { type: 'duck', x: -8, z: 0 },
      { type: 'crab', x: -33, z: -5.2 },
      { type: 'villager', x: 14, z: 7 }, { type: 'villager', x: -10, z: -8 },
      { type: 'butterfly', x: -6, z: 26 }, { type: 'butterfly', x: 20, z: -28 },
      { type: 'dog', x: 30, z: 20 },
    ],
    moments: [
      { id: 'rat-raid', type: 'rat', label: 'a rat gang raiding a spilled fish crate!', x: -6, z: -12, from: { x: -28, z: -20 } },
      { id: 'bridge-dash', type: 'rat', label: 'a rat bolting straight across the bridge!', x: 0.5, z: 9, from: { x: 0.5, z: -11 } },
    ],
    puddles,
    // The darkest dusk in the game — the Night Eyes showcase.
    // The hemisphere fill's ground term (game/walk.js) — the wet stone hex
    // from b.ground() above. Dark and near-neutral, so the Docks get almost no
    // upward bounce at all: undersides here stay cold and unlit, which is the
    // read this area has always been going for.
    groundBounce: 0x4e4e58,
    skyDusk: { top: 0x101828, horizon: 0x2e2842 },
    // Twelve, against four or five in every other area: the densest tippable
    // field in the game, which is what makes the Docks the place to grind
    // Sure Claws (25 tip-overs) and Big Swat (40), and the place Big Swat's
    // cascade radius actually cascades. Each sits ~2m off its stall so the
    // cat can reach it past the stall's own 1.2 collider.
    tippables: [
      { x: -25.0, z: -17.4, kind: 'bin' }, { x: -14.8, z: -8.2, kind: 'pot' },
      { x: -10.2, z: -14.4, kind: 'can' }, { x: -4.6, z: -7.8, kind: 'bin' },
      { x: 1.0, z: -13.8, kind: 'pot' }, { x: 8.6, z: -8.2, kind: 'can' },
      { x: 16.6, z: -14.2, kind: 'bin' }, { x: 22.0, z: -8.4, kind: 'pot' },
      { x: -11.5, z: 8.2, kind: 'bin' }, { x: 6.0, z: 9.0, kind: 'can' },
      { x: 22.5, z: 8.4, kind: 'bin' }, { x: -26.0, z: 8.0, kind: 'pot' },
    ],
    // =======================================================================
    // PERCH CHAINS — the numbers, so the next task can place things here
    // without re-deriving the geometry.
    //
    // The rule (src/climbing.js): one hop may gain at most `budget.climb` of
    // height (1.6 with no skills, 2.2 with Spring Paws; Sure Claws lifts
    // that only on 'tree' and 'fence' perches, of which the Docks has none,
    // so every chain below is climbed on 1.6 or 2.2 and nothing else), and
    // the target must be within `reachHigh` (2.6 / 3.2) if it
    // sits above y 1, or `reachLow` (1.2 / 1.7) if it does not. On the ground
    // the cat can walk to any (x, z), so a ground -> perch hop is measured
    // straight up; while perched it is snapped to the perch's own
    // coordinates, so a perch -> perch hop is measured between the two
    // perch positions. That is what makes a chain a chain.
    //
    // A — WAREHOUSE ROOF (north bank). Five hops, the longest in the game.
    //   ground -> crate      (16.2,  9.2, 1.15)  climb 1.15
    //          -> crate top  (16.2,  9.2, 2.40)  climb 1.25, horiz 0.00
    //          -> landing 2  (18.0, 10.4, 3.90)  climb 1.50, horiz 2.16
    //          -> parapet    (17.0, 12.1, 5.30)  climb 1.40, horiz 1.97
    //          -> roof tank  (18.6, 13.6, 6.20)  climb 0.90, horiz 2.19
    //   Landing 1 (y 1.9) is a side branch off the crate, not a step: at the
    //   baseline budget 1.9 -> 3.9 is a 2.0 climb and refused, so the chain
    //   still runs through the crate top. WITH Spring Paws (2.2) the ground
    //   reaches landing 1 and landing 1 reaches landing 2, which is the one
    //   place the ability shortens this chain — five hops become four. It
    //   never becomes one; the tank is out of ground reach under every
    //   budget. The y 1.9 landing used to sit just above Sure Claws' old
    //   global 1.85 lift; since CF-9b made that lift per-kind, the landing is
    //   a 'roof' and Sure Claws does not reach it off the cobbles at all.
    //
    // B — FISH MARKET ROOF (south bank). Two hops, one with Spring Paws.
    //   ground -> crate      ( 4.0,-20.2, 1.10)  climb 1.10
    //          -> shed roof  ( 5.2,-21.1, 2.10)  climb 1.00, horiz 1.50
    //   The roof sits above the 1.6 baseline and under Spring Paws' 2.2, so
    //   this is the chain that visibly rewards the ability.
    //
    // C — DOCK CRANE (south bank). Four hops, unchanged by every skill.
    //   ground -> crate      (-19.6,-16.6, 1.30)  climb 1.30
    //          -> container  (-20.2,-14.9, 2.60)  climb 1.30, horiz 1.80
    //          -> crane deck (-18.4,-13.6, 4.00)  climb 1.40, horiz 2.22
    //          -> crane cab  (-17.0,-13.0, 5.40)  climb 1.40, horiz 1.52
    //   Every rung is a 1.3-1.4 climb, i.e. inside the baseline budget and
    //   outside every double of it, so no budget under 2.6 can skip a step —
    //   not Spring Paws (2.2), and not Sure Claws, which does not lift
    //   anything on this chain's kinds at all. This chain stays honest.
    //
    // Six vantage perches — more than any other area, and the reason the
    // Docks is where Spring Paws ("reach 10 vantage perches") and Fence
    // Runner ("reach 25") actually get finished.
    // =======================================================================
    // `kind` (v18 CF-9b) names the prop under each perch. The Docks is all
    // 'crate' and 'roof': there is not a tree or a fence in the district, so
    // Sure Claws' height lift is inert here BY CONTENT and every chain above
    // is climbed on the same numbers it shipped with. What the ability does
    // in this area is open the market awnings and the quay benches.
    perches: [
      // chain A
      { x: 16.2, z: 9.2, y: 1.15, kind: 'crate' },
      { x: 16.2, z: 9.2, y: 2.4, kind: 'crate' },
      { x: 18.0, z: 10.4, y: 1.9, kind: 'roof' },
      { x: 18.0, z: 10.4, y: 3.9, kind: 'roof' },
      { x: 17.0, z: 12.1, y: 5.3, kind: 'roof', label: 'warehouse parapet', vantage: true },
      { x: 18.6, z: 13.6, y: 6.2, kind: 'roof', label: 'the high roof tank', vantage: true },
      // chain B
      { x: 4.0, z: -20.2, y: 1.1, kind: 'crate' },
      { x: 5.2, z: -21.1, y: 2.1, kind: 'roof', label: 'fish-market roof', vantage: true },
      // chain C
      { x: -19.6, z: -16.6, y: 1.3, kind: 'crate' },
      { x: -20.2, z: -14.9, y: 2.6, kind: 'crate', label: 'stacked container', vantage: true },
      { x: -18.4, z: -13.6, y: 4.0, kind: 'roof', label: 'crane deck', vantage: true },
      { x: -17.0, z: -13.0, y: 5.4, kind: 'roof', label: 'crane cab', vantage: true },
      // quayside bollards — standalone low perches (3.5 clear of the water,
      // so none of them is a stepping stone into the canal)
      { x: -18, z: 4.2, y: 0.55, kind: 'furniture' }, { x: 6, z: 4.2, y: 0.55, kind: 'furniture' },
      { x: -6, z: -4.2, y: 0.55, kind: 'furniture' }, { x: 18, z: -4.2, y: 0.55, kind: 'furniture' },
      // Sure Claws only: eight market awnings and the two quay benches.
      ...clawPerches,
    ],
  };
}
