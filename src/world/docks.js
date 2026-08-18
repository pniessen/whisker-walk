import * as THREE from 'three';
import * as b from './builder.js';
import { litMaterial } from '../render/materials.js';

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
// SEA LEGS MAY NEVER SHIP — and nothing here depends on it.
//
// Sea Legs is a Stage 3 descope candidate. Everything in this area is
// therefore authored to be completable with no swimming at all:
//
//   * The canal is scenery. Water in this game has never carried colliders
//     (the park pond and the seaside sea are both walk-over surfaces today),
//     so the canal does not block anything as shipped.
//   * Both banks are joined by TWO dry crossings — the main bridge at x 0 and
//     the plank bridge at x -24 — so if a future Sea Legs task adds water
//     colliders, the district stays fully connected without swimming.
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
// =============================================================================

const CANAL_HALF = 3.5;

export function build(scene) {
  // Overcast harbour daylight — muted rather than cheerful, so the area reads
  // as "the old docks" even before dusk. skyDusk (returned below) drops it to
  // near-black, which is the Night Eyes showcase.
  b.applySky(scene, 0x5e7290, 0x8e9aae);
  scene.add(b.ground(120, 0x4e4e58)); // wet cobbles

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });
  // The collision system is circles only, so a rectangular building is
  // approximated by two circles laid along its long axis. Each radius is
  // chosen to cover the SHORT axis fully (the same generous, slightly
  // over-covering convention house() + addC(x, z, 3.4) uses in
  // neighborhood.js) — the cat is stopped a little off the wall rather than
  // being able to clip a corner.
  const warehouseAt = (x, z, w, d, h, bodyColor, roofColor, r, spread) => {
    scene.add(b.warehouse(x, z, w, d, h, bodyColor, roofColor));
    addC(x - spread, z, r);
    addC(x + spread, z, r);
  };

  // --- the canal ------------------------------------------------------------
  const canal = new THREE.Mesh(new THREE.PlaneGeometry(90, CANAL_HALF * 2), mat(0x24445e));
  canal.rotation.x = -Math.PI / 2;
  canal.position.set(0, 0.04, 0);
  scene.add(canal);
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
  warehouseAt(20, 16, 10, 8, 5.0, 0x8a6a5a, 0x44404a, 4.2, 2.8);
  warehouseAt(-6, 20, 12, 9, 4.2, 0x7a7a86, 0x3e3a46, 4.6, 3.0);
  warehouseAt(-26, 15, 9, 8, 3.6, 0x86766a, 0x44404a, 4.3, 2.2);
  warehouseAt(12, 32, 11, 8, 4.6, 0x74707e, 0x3e3a46, 4.3, 2.6);

  // crate stack against W1's south-west corner: two tiers, tops at y 1.15 and
  // y 2.4. Tier 1 is the only thing on this whole chain a grounded cat can
  // reach (1.15 <= the 1.6 baseline climb budget).
  scene.add(b.platform(16.2, 9.2, 1.15, 0, 1.1));
  scene.add(b.platform(16.2, 9.2, 2.4, 1.15, 0.9));
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
  }

  // the fish market shed — a LOW warehouse (h 1.8, parapet top y 2.1). Its
  // roof is deliberately just above the 1.6 baseline climb budget and just
  // under Spring Paws' 2.2, so it is the one chain in the area that visibly
  // collapses from two hops to one the moment that ability is earned.
  scene.add(b.warehouse(6.5, -23.5, 6, 5, 1.8, 0x7a6a5a, 0x44404a));
  addC(6.5, -23.5, 3.2);
  scene.add(b.platform(4.0, -20.2, 1.1, 0, 1.0));
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
  scene.add(b.platform(-19.6, -16.6, 1.3, 0, 1.0));
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
  scene.add(b.bench(-2.4, 8.6, Math.PI / 2));
  scene.add(b.bench(2.4, -8.6, Math.PI / 2));
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
    // height (1.6 with no skills, 2.2 with Spring Paws, 1.85 with Sure
    // Claws), and the target must be within `reachHigh` (2.6 / 3.2) if it
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
    //   budget. Sure Claws' 1.85 sits deliberately just under the 1.9
    //   landing, exactly as it sits just under the seaside dune ledge.
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
    //   outside every double of it, so neither Spring Paws (2.2) nor Sure
    //   Claws (1.85) can skip a step. This is the chain that stays honest.
    //
    // Six vantage perches — more than any other area, and the reason the
    // Docks is where Spring Paws ("reach 10 vantage perches") and Fence
    // Runner ("reach 25") actually get finished.
    // =======================================================================
    perches: [
      // chain A
      { x: 16.2, z: 9.2, y: 1.15 },
      { x: 16.2, z: 9.2, y: 2.4 },
      { x: 18.0, z: 10.4, y: 1.9 },
      { x: 18.0, z: 10.4, y: 3.9 },
      { x: 17.0, z: 12.1, y: 5.3, label: 'warehouse parapet', vantage: true },
      { x: 18.6, z: 13.6, y: 6.2, label: 'the high roof tank', vantage: true },
      // chain B
      { x: 4.0, z: -20.2, y: 1.1 },
      { x: 5.2, z: -21.1, y: 2.1, label: 'fish-market roof', vantage: true },
      // chain C
      { x: -19.6, z: -16.6, y: 1.3 },
      { x: -20.2, z: -14.9, y: 2.6, label: 'stacked container', vantage: true },
      { x: -18.4, z: -13.6, y: 4.0, label: 'crane deck', vantage: true },
      { x: -17.0, z: -13.0, y: 5.4, label: 'crane cab', vantage: true },
      // quayside bollards — standalone low perches (3.5 clear of the water,
      // so none of them is a stepping stone into the canal)
      { x: -18, z: 4.2, y: 0.55 }, { x: 6, z: 4.2, y: 0.55 },
      { x: -6, z: -4.2, y: 0.55 }, { x: 18, z: -4.2, y: 0.55 },
    ],
  };
}
