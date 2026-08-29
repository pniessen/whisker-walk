import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial, repeatFor, surfaceProps } from '../render/materials.js';
import { createWater } from '../render/water.js';
import { SURE_CLAWS_ID } from '../climbing.js';

// The same two opt-in helpers world/builder.js keeps at the top of itself, for
// the props this file builds locally rather than borrowing. They are duplicated
// rather than exported because they are three lines each and exporting them
// would make "how a prop takes a surface" a cross-module contract instead of a
// local one; the RULES they encode (below) are the shared part, and those live
// in builder.js's header.
//
// The repeat is always DERIVED from the face's real size via repeatFor(), never
// typed — a picked number on a 24m pier is a visible plaid.
const surfMat = (color, surface, w, h) =>
  litMaterial(color, { surface, repeat: repeatFor(surface, w, h) });
// A preset's light response with its MAP DELIBERATELY LEFT OFF, for the two
// shapes builder.js's header says a tiling map makes worse: members thinner
// than about a third of a tile (the plank tile is four boards across 1.0m, so
// a 0.15m driftwood plank would get four 4cm stripes) and cylinders (a planar
// tile smears at a 6-sided silhouette).
const surfNoMap = (color, surface) => litMaterial(color, surfaceProps(surface));

// =============================================================================
// Seaside.
//
// THE SEA — v19 "make water real".
//
// The sea is a 80 x 140 plane covering everything east of x = 25. The walkable
// bounds run to x = 36, so ELEVEN METRES of this map are already out over open
// water — more standable-but-wet ground than any other area has. Water carries
// no collider today, so the cat currently strolls out onto it; a later wave
// makes it solid, and this file is authored so that nothing breaks when it
// does. The footprint is declared as data in `waters` below (see the WATER
// note at the bottom of builder.js), and:
//
//   * THE PIER IS THE CROSSING. It is the seaside's equivalent of the Docks'
//     two bridges: the one dry structure standing over the water, running from
//     the sand at x 22 out to x 46 on a 3m deck centred on z -10. It is
//     declared as a `deck` of the sea, which is how this area says "a future
//     water collider must leave this hole in itself". Everything the player is
//     asked to reach east of x 25 is ON that deck.
//   * No collectible, golden mouse, scenic, POI, tippable, perch, box, puddle
//     or spawn point sits in open water. Three things did before v19 and all
//     three moved — the `fish-1` collectible, the `pier-end` scenic and the
//     third cardboard box; each carries a note at its new coordinates.
//   * Gulls still wheel over the sea and the gull-heist moment still comes in
//     off it. A critterSpawn or a moment's `from` is a bird's starting point,
//     never a place the cat is asked to stand.
//
// test/water.test.js pins all of that, the same way test/docks.test.js has
// pinned the canal since v18.
// =============================================================================

// The pier deck, as data. Declared before the sea because the sea carries it.
const PIER = { minX: 22, maxX: 46, minZ: -11.5, maxZ: -8.5 };
// The sea footprint. Both meshes below are BUILT from these records rather
// than standing beside them, so the drawn water and the declared water — and
// the drawn pier and the declared deck — cannot drift apart.
const SEA = {
  id: 'sea', kind: 'rect', minX: 25, maxX: 105, minZ: -70, maxZ: 70, decks: [PIER],
};

// -----------------------------------------------------------------------------
// SURFACES, WATER AND WIND (v20). The Old Docks was the pilot (see the block at
// the top of docks.js); this is the same pass on the beach, and the brief is
// the same SUBTLETY — materials.js opens with "cozy low-poly art direction
// stays flat/matte", and a prop that reads fine flat stays flat.
//
// What the seaside is literally made of is sand and dock timber, and that is
// what got a surface: the beach, the cliff and the dune ledge are 'sand'; the
// boardwalk and the pier — the area's two pieces of decking, both built here
// rather than in builder.js — are 'wood'. The boat hulls take painted-metal's
// light response, the masts and the driftwood take timber's WITHOUT its tile
// (cylinder rule, thin-member rule); each says so at its own line.
//
// SAND IS NOT COLOUR-COMPENSATED, and that is the one place this file
// deliberately differs from what the brick and grass surfaces do. The sand
// tile's luminance mean is 0.998 BY DESIGN (see the table in
// render/textures.js's header): its whole read is per-texel variance, with no
// shift in overall value, because a beach that goes darker when you texture it
// just looks wet. builder.ground() therefore lifts grass and nothing else, and
// 0xe0d0a0 below is still the hex a human picked.
//
// AND A FINDING ABOUT THAT TILE, measured on screen at the real renderer
// settings rather than reasoned about, because the next person to work here
// will otherwise assume the beach was missed. The sand tile is currently a
// WHISPER: its mean is 0.9985, its darkest texel is 238/255, and only ~2% of
// texels carry a dot at all. Rendered under this world's lighting, the pixel
// standard deviation it contributes is about 0.5/255 even at 0.8m — under a
// single value step, i.e. below anything a player can see. So what this pass
// actually changes on the beach and the bluff is the roughness step (0.92
// against the 0.9 default) and not the grain. The tile is applied anyway, on
// both, because it is CORRECT — it is the surface these things are made of,
// it costs one clone of an already-memoised texture, and if render/textures.js
// ever raises paintSand's dot density or alpha, the beach and the cliff
// strengthen together instead of one of them being remembered. Turning that
// dial is a change to the shared painter and belongs to whoever owns it, not
// to a world file, and it must NOT be faked here by darkening the colour.
//
// `opts.water` is the tier/reduced-motion pair walk.js threads in and
// `opts.wind` is the per-walk sway registry; both keys default, so a bare
// build(scene) — which every world test does — still produces the high-tier
// surface rather than throwing.
//
// WIND registers the six beach-grass tufts and nothing else. There is not a
// tree in the area (the perch note at the bottom of this file already says so
// — it is why Sure Claws' height lift is inert here), and the only other
// candidates are the cliff, the boats and the boardwalk, none of which bend in
// a breeze. The boats are the one a reviewer might want to overrule that with,
// and bobbing them is a motion decision about content rather than a materials
// one: wind.js sways a rigid body about its own origin, which for a hull
// sitting at y 0 would swing the mast and drive the keel through the water.
// -----------------------------------------------------------------------------
export function build(scene, { water = {}, wind } = {}) {
  b.applySky(scene, 0x9fc8e8, 0xe8e0d0);
  // Dry beach sand at roughness 0.92 — a step drier than the game's default,
  // and the tile is a fine speckle whose repeat comes from the plane's own
  // 140m (175 tiles of 0.8m). See the note above on why the colour is not
  // lifted the way a lawn's is.
  scene.add(b.ground(140, 0xe0d0a0, { surface: 'sand' }));

  // The horizon band (VISUAL-PASS.md Wave 4.3) — dunes and a headland. See
  // builder.horizonBand's own block for the geometry; it carries no collider,
  // no perch, no POI and no record, and sits entirely beyond `bounds`.
  //
  // 66/126 rather than the other areas' 56/116, because this ground plane is
  // 140m rather than 120m: the inner rim still lands four metres inside the
  // plane's own edge (70) so the seam is buried under it.
  //
  // `avoid: [SEA]` IS THE WHOLE DIFFERENCE HERE, and it is the same record the
  // sea itself is drawn from and that test/water.test.js reads — so the dunes
  // stop at the declared waterline by construction and cannot drift from it
  // the way a hand-typed keep-out rectangle would. It carves the band into
  // exactly what a bay looks like: sand dunes running north, west and south,
  // open water east, and — because SEA's own footprint stops at x 105 while
  // the band reaches 126 — a low far shore standing across the mouth of the
  // bay where the water ends. That last piece is a free consequence of two
  // numbers that were already authored, and it is the correct one: the sea has
  // to end somewhere, and "at a coastline 70m past the pier" is a better
  // answer than "at the fog".
  //
  // The headland sits off the NORTH-WEST, which is where the cliff already is
  // (it stands at z -46 running x -40..20). Reading the two together, the bluff
  // the beach runs up into carries on out to sea and finishes in a promontory
  // — one landform, drawn twice at two distances, which is the cheapest depth
  // cue there is.
  //
  // 7m dunes at 26m spacing: the CLOSEST-SPACED band of the four, because
  // dunes are small and a beach whose backing dunes read as hills is a valley
  // with sand in it.
  //
  // THE COLOUR GOES THE OTHER WAY HERE, and this is the one place the band's
  // usual rule is inverted. The other three areas lift their band toward their
  // own horizon stop to stand in for the aerial perspective fog does not
  // supply inside 40m. This palette will not take that: 0xe8e0d0 is nearly
  // white by authorship (Wave 1.4's own note flags these near-white horizon
  // hexes), the beach under it is 0xe0d0a0, and lifting pale sand toward pale
  // haze produced dunes that measured correct and were invisible — sand on
  // sand on sky, three values inside a few percent of each other. So they are
  // DARKENED instead, to a duller khaki: real backing dunes are packed, damp
  // at depth and held together with marram grass, and they are visibly duller
  // than the dry beach in front of them. The silhouette needs a value step and
  // this is the physically honest direction to find one in.
  scene.add(b.horizonBand({
    kind: 'dunes', inner: 66, outer: 126, height: 7, wavelength: 26,
    color: 0xc9ba90, salt: 59, avoid: [SEA],
    headland: { x: -92, z: -84, r: 46, h: 0.9 },
  }));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });

  // --- the sea --------------------------------------------------------------
  // Still drawn from SEA, so the water on screen and the water in the data are
  // the same rectangle by construction — createWater builds its geometry from
  // the footprint verbatim, which is what keeps test/water.test.js's "draws
  // that footprint from the declaration" case honest. The mesh goes into the
  // scene DIRECTLY and never into a Group: that case matches against
  // scene.children, and a nested mesh is invisible to it.
  //
  // y 0.05 and 0x4a90c0 are the plane's own shipped values, so nothing
  // re-stacks against the boardwalk (0.03) or the pier deck (0.25), and the
  // sea keeps the bright holiday blue the beach palette was built around
  // (createWater derives its shallow, deep and foam ends from that one hex).
  //
  // `shores: ['minX']` IS THE WHOLE DIFFERENCE between this body and the other
  // two, and it is not optional. createWater paints its shallow ramp and its
  // foam band against the nearest edge of the footprint, and by default every
  // edge counts as land — right for the pond and the canal, which really are
  // walled all round. This footprint is not: it runs east to x 105 and to
  // z +/- 70, while `bounds` below stop at x 36 and z -34..48. Those three
  // edges are open horizon, 20 to 70 metres past anywhere the cat can stand
  // and in plain view under the fog — and a surf line drawn across open ocean
  // is a lie about where the sea ends. Naming minX alone leaves exactly one
  // shore: the beach, which is the only edge that is one.
  //
  // Everything else is the module default, deliberately:
  //   * shelf 3m — createWater's SHELF_M note names this body as its own
  //     sanity check ("the sea is deep 3m off the sand, which is what a sea
  //     should be"). With one shore rather than four, the far side of the
  //     footprint reads as fully deep the whole way out, which is right.
  //   * foamStrength 0.45 — the docks canal pulled this to 0.35 because a 7m
  //     body is nearly all foam band; 0.7m of band on an 80m body is a
  //     hairline, and this is the one water in the game with an actual scenic
  //     called "the crashing shoreline" pointed at it.
  const sea = createWater(SEA, {
    y: 0.05,
    color: 0x4a90c0,
    shores: ['minX'],
    quality: water.quality ?? 'high',
    reducedMotion: water.reducedMotion ?? false,
  });
  scene.add(sea.mesh);

  // boardwalk running north-south along the shore. Dock timber, at a repeat
  // derived from its real 4 x 90 — 4 tiles across the width is sixteen 0.25m
  // boards, which is a promenade. The plank tile always divides along u and
  // runs its grain along v, and on this plane u is world x and v is world z,
  // so the boards run ALONG the walk rather than across it. That is one of the
  // two ways decking is really laid, and it is the one available without
  // rotating the mesh — which would move geometry this pass may not move.
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(4, 90), surfMat(0xa08050, 'wood', 4, 90));
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(20, 0.03, 0);
  scene.add(walk);
  // pier heading out over the water — the area's dry crossing, drawn from
  // PIER. The two rotations put the plane's WIDTH along world z and its
  // LENGTH along world x, which is why the geometry arguments look swapped.
  // The repeat is taken from those same two numbers (3 x 24 => 3 x 24 tiles,
  // i.e. twelve 0.25m boards across the deck) so the pier and the boardwalk it
  // leaves are the same timber at the same scale, which is what makes the
  // crossing read as built rather than as a coloured strip.
  const pier = new THREE.Mesh(
    new THREE.PlaneGeometry(PIER.maxZ - PIER.minZ, PIER.maxX - PIER.minX),
    surfMat(0xa08050, 'wood', PIER.maxZ - PIER.minZ, PIER.maxX - PIER.minX));
  pier.rotation.x = -Math.PI / 2;
  pier.rotation.z = Math.PI / 2;
  pier.position.set((PIER.minX + PIER.maxX) / 2, 0.25, (PIER.minZ + PIER.maxZ) / 2);
  scene.add(pier);

  // fishing boats bobbing offshore
  for (const [x, z, color] of [[40, 8, 0xd06048], [50, -22, 0x4a6ea5], [44, 28, 0x6a9a4a]]) {
    const boat = new THREE.Group();
    // 'paintedMetal' — the same call the Docks' barge hull takes, and for the
    // same two reasons. These are working boats in red, blue and green: what
    // you see is the paint, and paintedMetal is the preset that keeps
    // metalness at 0 so a red boat stays red. It also carries no map, which
    // matters here — a box maps 0..1 per face with v running up +y, so the
    // plank tile's grain would run VERTICALLY up an 0.8m hull side and stave
    // it like a barrel rather than planking it like a boat.
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 4.5),
      litMaterial(color, { surface: 'paintedMetal' }));
    hull.position.y = 0.4;
    boat.add(hull);
    // A 6-sided 12cm spar: cylinder rule and thin-member rule at once, so it
    // takes timber's roughness with the tile left off.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6),
      surfNoMap(0x7a5230, 'wood'));
    mast.position.y = 2;
    boat.add(mast);
    boat.position.set(x, 0, z);
    scene.add(boat);
  }

  // cliff at the north end with a switchback path up.
  //
  // 'sand', not 'cobble' or 'brick': this is a sandstone bluff the beach runs
  // up into, not masonry, and it is the largest vertical face in the game (60
  // x 8) — the one surface here that is genuinely too big to leave as flat
  // colour. The repeat comes from that seaward face, which means the 18m END
  // faces tile about four times denser. Sand is the ONE tile in the vocabulary
  // where that is harmless: it is isotropic speckle, so denser is finer grain
  // rather than a pattern that visibly changes size around a corner (brick
  // courses would do exactly that), and by the distance either end face is
  // seen, mipmapping has resolved both to their mean anyway.
  const cliff = new THREE.Mesh(new THREE.BoxGeometry(60, 8, 18),
    surfMat(0xb09878, 'sand', 60, 8));
  cliff.position.set(-10, 4, -46);
  scene.add(cliff);
  for (let i = 0; i < 12; i++) addC(-38 + i * 5, -37, 2.5); // cliff face blocks walking through
  // Square in plan, so its four faces tile identically — no end-face caveat.
  const overlook = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 10),
    surfMat(0xb09878, 'sand', 10, 8));
  overlook.position.set(-40, 4, -40);
  scene.add(overlook);
  addC(-40, -40, 6);

  // beach props. Two of these four boulders have carried perches since v11
  // ((-8,10) and the "overlook boulder" at (-28,18)); the rest of the sand is
  // scenery, and CF-9b opens it — see clawPerches below.
  for (const [x, z] of [[-8, 10], [-20, -2], [4, 24], [-28, 18]]) scene.add(b.rock(x, z));

  // a dune ledge beside the overlook boulder — second step of a short climb
  // chain (boulder y 0.72 -> ledge y 1.9), 1.41 horizontally and 1.18
  // vertically away, both inside the reach/climb budget.
  // 'sand' for the same reason the cliff takes it — it is a dune, packed sand,
  // and giving the step the beach's own grain is what stops a load-bearing
  // perch reading as an untextured block dropped on a textured floor. Its
  // colour and every number here are the shipped ones.
  scene.add(b.platform(-29, 19, 1.9, 0, 1.8, 0xd8c088, { surface: 'sand' }));
  addC(-29, 19, 1.0);
  scene.add(b.bench(18, 14, Math.PI / 2));
  scene.add(b.bench(18, -18, Math.PI / 2));
  for (const [x, z] of [[20, 30], [20, -30]]) scene.add(b.lampPost(x, z));

  scene.add(b.billboard(15, 34, Math.PI / 2));
  addC(15, 34, 2.3);
  // beach grass tufts — the area's only foliage, and therefore the whole of
  // what registers with the wind rig. builder.bush returns a Group hinged at
  // ground contact when `wind` is passed, so the tuft stands in exactly the
  // same place either way and no hide-spot or scent record moves.
  for (const [x, z] of [[-14, 30], [-2, -14], [-24, -20], [8, 2]]) scene.add(b.bush(x, z, { wind }));

  // a few more rocks and grass tufts scattered on the sand
  for (const [x, z] of [[-32, 30], [12, -10], [-32, -10]]) scene.add(b.rock(x, z));
  for (const [x, z] of [[-30, 5], [12, 20]]) scene.add(b.bush(x, z, { wind }));

  // driftwood washed up at the sand line. Thin-member rule: 0.15 by 0.25, so
  // repeatFor's one-whole-tile minimum would squash the plank tile's four
  // boards into 15cm and read as corduroy. Timber's roughness, no tile.
  const driftwood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.25),
    surfNoMap(0x9a8468, 'wood'));
  driftwood.position.set(24, 0.1, 0);
  driftwood.rotation.y = 0.4;
  scene.add(driftwood);

  // cardboard boxes. The third one WAS at (30, -6) — five metres out to sea
  // and not on the pier, which is a box no cat can ever sit in: avatar.js's
  // "if I fits, I sits" award needs the cat within 0.35 of the box, i.e.
  // standing on it. It is now on the sand at (23, -6), 2.0 clear of the
  // waterline and a couple of metres east of the boardwalk.
  const boxes = [[19, 24], [-14, 4], [23, -6]];
  for (const b2 of boxes) scene.add(b.cardboardBox(b2[0], b2[1]));

  return {
    name: 'Seaside',
    colliders,
    bounds: { minX: -48, maxX: 36, minZ: -34, maxZ: 48 },
    spawn: { x: 18, z: 42 },
    boxes: boxes.map(([x, z]) => ({ x, z })),
    // The sea, and the pier that crosses it. See this file's header.
    waters: [SEA],
    // The visual half of that same record: walk.js bundles these into a
    // waterRig and drives update(dt)/dispose() with the walk's other per-walk
    // systems. One entry, one footprint — they are the same list twice.
    waterFx: [sea],
    pois: [
      { x: 20, z: 14 },
      // Dead on the pier's centreline, 1.5 in from either deck edge — the one
      // POI east of the waterline, and dry because the deck is dry.
      { x: 34, z: -10 },
      { x: -8, z: 10 }, { x: -20, z: -2 },
      { x: 4, z: 24 }, { x: -28, z: 18 }, { x: 18, z: -18 }, { x: -2, z: -14 },
    ],
    collectibles: [
      // v19: WAS (33, -14), two and a half metres off the pier in open water.
      // The pickup gate is 1.6 horizontal, so it needed a cat standing on the
      // sea. Now on the deck itself, 0.9 in from its south edge (z -11.5) —
      // once the water is solid the cat is pushed no further north than
      // z -11.15, so it can stand directly on top of this.
      { id: 'fish-1', x: 33, z: -10.6, label: 'a shiny little fish' },
      { id: 'fish-2', x: -9, z: 8.5, label: 'a striped shell-fish' },
      { id: 'fish-3', x: -29, z: 16.5, label: 'a silver sardine' },
      { id: 'fish-4', x: 19, z: -31, label: 'a lost lure-fish' },
      { id: 'fish-5', x: -29, z: 19, y: 1.9, label: 'a gull-dropped fish' },
    ],
    scenics: [
      // v19: WAS (34, -18), six and a half metres off the side of the pier in
      // open water — outside the 4m visit award and well outside Gift Paws'
      // 3m leave range from anywhere dry. Now at the seaward end of the
      // WALKABLE pier: the deck is drawn out to x 46, but bounds.maxX is 36,
      // so x 35.5 is as far out as a cat can ever get, on the centreline.
      // Both gates are satisfied standing on the spot itself.
      //
      // THE ID IS LOAD-BEARING AND MUST NOT CHANGE. state.gifts persists
      // { area, spot } where `spot` is this id, and gifts.js's resolveGifts
      // joins those records back onto this array at the start of every walk,
      // SKIPPING any id it cannot find. Moving the coordinates under a stable
      // id relocates every gift a player has already stashed here to the new,
      // reachable position; renaming or dropping the id would delete them
      // silently instead.
      { id: 'pier-end', x: 35.5, z: -10, label: 'the end of the pier' },
      { id: 'overlook', x: -33, z: -32, label: 'the cliffside overlook' },
      // 1.0 clear of the waterline at x 25 — the sand the surf breaks on,
      // not the surf.
      { id: 'shoreline', x: 24, z: 20, label: 'the crashing shoreline' },
    ],
    critterSpawns: [
      { type: 'seagull', x: 22, z: 8 }, { type: 'seagull', x: 30, z: -6 },
      { type: 'seagull', x: 16, z: -26 }, { type: 'seagull', x: 8, z: 30 },
      { type: 'crab', x: -6, z: 14 }, { type: 'crab', x: -18, z: 2 }, { type: 'crab', x: 2, z: -10 },
      { type: 'butterfly', x: -14, z: 30 },
      { type: 'mouse', x: -22, z: 20, x2: -14, z2: 25 },
      { type: 'mouse', x: 10, z: 22, x2: 16, z2: 18 },
      { type: 'villager', x: 18, z: 16 }, { type: 'villager', x: 32, z: -10 },
    ],
    moments: [
      { id: 'gull-heist', label: 'a seagull stealing someone\'s sandwich!', x: 18, z: 14, from: { x: 30, z: -6 } },
      { id: 'crab-race', label: 'two crabs racing across the boardwalk', x: 20, z: 0, from: { x: -6, z: 14 } },
    ],
    puddles: [],
    // The hemisphere fill's ground term (game/walk.js) — the sand hex from
    // b.ground() above. The brightest bounce of any area by a distance, which
    // is physically right for pale dry sand and is what will put warm light
    // under the pier and the boat hulls.
    groundBounce: 0xe0d0a0,
    skyDusk: { top: 0x22304e, horizon: 0x7a5a6e },
    tippables: [
      { x: 17, z: 15, kind: 'pot' }, { x: 17, z: -17, kind: 'can' },
      { x: 21, z: 29, kind: 'bin' }, { x: -7, z: 9, kind: 'pot' },
    ],
    // `kind` (v18 CF-9b). The dune ledge is 'stone', NOT 'tree' or 'fence' —
    // which is the whole point of tagging: the ledge at y 1.9 used to be the
    // number that held Sure Claws' global climb lift down to 1.85, and now it
    // simply sits outside the lifted kinds and cannot be reached off the sand
    // at all. The boulder → ledge chain that holds gm-sea-2 and fish-5 is
    // untouched by the ability in either direction.
    perches: [
      { x: 18, z: 14, y: 0.58, kind: 'furniture' }, { x: 18, z: -18, y: 0.58, kind: 'furniture' },
      { x: -8, z: 10, y: 0.72, kind: 'stone' },
      { x: -28, z: 18, y: 0.72, kind: 'stone', label: 'overlook boulder', vantage: true },
      { x: -29, z: 19, y: 1.9, kind: 'stone', label: 'dune ledge', vantage: true },
      // Sure Claws only: the five scenery boulders. The seaside has neither
      // a tree nor a fence, so the ability's height lift never fires in this
      // area — what it opens here is the sand itself, five standing stones
      // scattered from the north dunes to the far south beach, each already
      // inside the baseline climb at the 0.72 the two shipped boulders use.
      //
      // (-32, -10) is deliberately included even though gm-sea-3 hides on the
      // sand beside it: a ground mouse needs no perch, so the boulder cannot
      // shorten anything — it just means a Sure Claws cat can spot the mouse
      // from on top of the rock as well as from beside it.
      ...[[-20, -2], [4, 24], [-32, 30], [12, -10], [-32, -10]].map(([x, z]) => (
        { x, z, y: 0.72, kind: 'stone', requires: SURE_CLAWS_ID }
      )),
    ],
  };
}
