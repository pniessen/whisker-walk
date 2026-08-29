import * as b from './builder.js';
import { sureClawsTreePerch, SURE_CLAWS_ID } from '../climbing.js';

// -----------------------------------------------------------------------------
// SURFACES AND WIND (v20). The Docks pilot set the brief and it governs here
// too: materials.js opens with "cozy low-poly art direction stays flat/matte",
// every tile is capped at a 13% value range, and a prop that reads fine flat
// stays flat. What gets a surface here is what the street is literally made of
// — lawn, road grit, paving slabs, brick and painted boards, crate timber.
// Everything else in this file is a SHARED builder prop (mailboxes, cars,
// benches, lamp posts, the bike, the billboard, the rocks, the fences, the
// cardboard boxes, the leaf litter, the puddles), and every one of those had
// its surface decided once in builder.js — including the ones deliberately
// left flat there, which is where their reasons live rather than here.
//
// `opts.wind` is the per-walk sway registry walk.js threads in, and unlike the
// Docks — which registers nothing at all, because the district has neither a
// tree nor a fence — THIS is the area the rig was built for: twelve trees, ten
// bushes and twelve flower patches, 34 registrations, each one planted and
// registered from the same line so the two lists cannot drift apart.
//
// The five FENCE RUNS are deliberately still, and that is worth saying out
// loud because wind.js's own docstring lists fenceRun as a candidate. Two
// reasons, and they agree: builder.fenceRun's note says a fence is posts
// driven into the ground and does not sway; and four of the runs here carry a
// perch at y 0.85 (two Sure Claws front-fence tops, the dog yard's shipped
// pair plus its CF-9b east run), so a visibly leaning rail would be the one
// piece of sway in the game a cat is asked to stand on.
//
// `opts.water` is accepted and DELIBERATELY UNUSED. The neighborhood declares
// no `waters` — test/spots.test.js's clearance case names it as the area with
// none — and its two puddles are builder.puddle's static discs, which that
// function's docstring says must NOT become a createWater rig. The key is in
// the signature anyway so all five areas take the same options object and
// walk.js never has to know which of them has water; a pond added here later
// picks up the tier and reduced-motion pair without touching the call site.
//
// Both keys default, so a bare build(scene) — which every world test does —
// still builds the full surface set rather than throwing.
// -----------------------------------------------------------------------------
export function build(scene, { water = {}, wind } = {}) { // `water`: see above
  b.applySky(scene, 0x9fd4e8, 0xcfe8f0);
  // The lawn, at last literally. 'grass' is a mottle-only tile at 3m, so at
  // 120m the derived repeat is 40x40 — coarse enough that a single patch is
  // still bigger than the cat and never reads as a pattern, which is exactly
  // what the preset's docstring asks for.
  //
  // The hex below is the one a human picked and is left ALONE: builder.ground
  // applies grass's luminance compensation (mean 0.955) itself, so the plane
  // lands back on 0x7cb860 rather than 4.5% under it. That compensation lives
  // in the builder precisely so this line does not have to know about it.
  scene.add(b.ground(120, 0x7cb860, { surface: 'grass' }));

  // The horizon band (VISUAL-PASS.md Wave 4.3) — low hills out past the end of
  // the lawn, purely decorative: no collider, no perch, no POI, no record of
  // any kind returned below. See builder.horizonBand's own block for the
  // geometry and for why it is not terrain.
  //
  // 56 puts the ring's inner rim four metres INSIDE the 120m lawn's own edge,
  // so the seam is buried under an opaque plane rather than butted against it;
  // 116 puts the outer rim 116m from the middle of the area, inside the fog's
  // 130m far distance, so the far side fades out rather than being cut off.
  // The default FLAT keeps the first hill ~35m beyond the furthest a cat can
  // walk (`bounds` stop at 55), which is what makes these a ridge rather than
  // a wall.
  //
  // 7m crests at 34m spacing: the gentlest of the four areas on purpose. This
  // is a suburb on flat ground — the joke of the place is that nothing much
  // happens here — so what belongs past the last garden fence is farmland
  // rolling away, not a mountain range.
  //
  // The colour is the lawn's own 0x7cb860 carried about a third of the way to
  // the sky's horizon stop (0xcfe8f0, the same hex applySky above hands the
  // fog). Distance does two things to a colour — it desaturates it and it
  // lifts it toward the sky — and fog only starts doing that at 40m, so the
  // near corner of the band would otherwise arrive at full lawn-green with no
  // aerial perspective at all. This is that perspective, painted in.
  scene.add(b.horizonBand({
    kind: 'hills', inner: 56, outer: 116, height: 7, wavelength: 34,
    color: 0x94bd84, salt: 11,
  }));

  const colliders = [];
  const addC = (x, z, r) => colliders.push({ x, z, r });

  // v18 CF-9b — "props that were scenery become climbable" (Sure Claws).
  //
  // Every record pushed here carries `requires: SURE_CLAWS_ID`, which
  // climbing.js's perchAllowed filters on BEFORE any geometry is considered:
  // a cat without the ability walks the exact perch graph that shipped, and a
  // cat with it finds the trees and fences it has been walking past for
  // eleven abilities suddenly climbable.
  //
  // None of them carries a `label` or `vantage`. That is deliberate and it is
  // three things at once: a labelled perch pays awardOnce('scenic', …) and
  // tallies feats.perch (game/interactions.js), so labelling these would let
  // a Mischief ability quietly buy the two Traversal ones; the discovery log
  // would fill with "an oak tree" a dozen times per walk; and test/docks.test
  // pins the Docks as the area with the most vantage perches, an invariant a
  // handful of labelled trees in the neighborhood would silently break.
  const clawPerches = [];

  // main street running north-south, side street east-west
  //
  // 'gravel' — the road-aggregate tile. The colour is builder.path's fixed
  // 0xcbb8a0, a pale warm tan: no tarmac is that colour, so what these two
  // strips have always been is a quiet unmetalled lane, and 22-33mm chippings
  // are exactly what an unmetalled lane is surfaced with.
  //
  // They were 'sand' before gravel existed, which was the closest the
  // vocabulary could get and was wrong on SCALE rather than on name: sand's
  // grains are ~11mm at its 0.8m tile, which is beach fines, not road metal.
  // Gravel also carries more contrast where a road needs it (sigma 7.9
  // against sand's 6.2). Nothing to compensate on the colour — path()'s tan
  // is fixed and no call site passes one, so gravel's 0.961 mean applies
  // uniformly to every path in the game with no untextured neighbour to
  // match.
  //
  // The repeat is derived, 5m x 100m over gravel's 1.4m tile => [4, 71].
  // Deriving matters more here than almost anywhere: this is a 100m strip,
  // and a hand-picked number would stretch the chippings along the street.
  scene.add(b.path(0, -50, 0, 50, 5, { surface: 'gravel' }));
  scene.add(b.path(-50, 0, 50, 0, 5, { surface: 'gravel' }));

  // sidewalks flanking both streets
  //
  // 'cobble' — the sett grid is the closest thing in the vocabulary to paving
  // slabs, and builder.sidewalk's docstring names it as the obvious pick while
  // refusing to default it on. It is right HERE and was wrong at the Docks for
  // one reason: the Docks' pavements run over a ground plane already carrying
  // the same cobble tile, and two grids at different densities stacked on each
  // other is the one way to make a tiled surface look like a mistake. Here the
  // ground is grass and the neighbours are the gravel roads, so nothing is
  // stacked and nothing repeats a rhythm.
  //
  // The derived repeat is [1, 83]: exactly one 1.2m tile across the walk's
  // 1.2m width, i.e. four 30cm slabs kerb to kerb, which is a pavement. This
  // is the one place on this pass where the thin-member rule was checked and
  // came out fine — the strip is a full tile wide, not a fraction of one.
  scene.add(b.sidewalk(-3.2, -50, -3.2, 50, undefined, { surface: 'cobble' }));
  scene.add(b.sidewalk(3.2, -50, 3.2, 50, undefined, { surface: 'cobble' }));
  scene.add(b.sidewalk(-50, -3.2, 50, -3.2, undefined, { surface: 'cobble' }));
  scene.add(b.sidewalk(-50, 3.2, 50, 3.2, undefined, { surface: 'cobble' }));

  // houses along the streets
  //
  // The fourth column is house()'s `bodySurface`, and it is a COLOUR reading
  // rather than a spread: brick is fired clay, and fired clay comes out of the
  // kiln in a narrow band of warm earths. Three of these eight are buff/straw
  // (0xe8d8b0, 0xf2e0c0, 0xe8e0b8) — yellow stock brick, which is an entirely
  // ordinary way for a street to be built — so they get the bond. The other
  // five are lilac, mint, lavender, pale green and peach: nobody has ever
  // fired a mint brick, those are paint colours, and painted lap boards is
  // what house() defaults to. Leaving them on the default is the decision, not
  // the absence of one.
  //
  // The hexes are untouched. house() applies brick's luminance compensation
  // (mean 0.948) itself, exactly as warehouse() does, so a brick body still
  // lands on the colour typed here rather than 5% under it.
  //
  // The three bricks are also spread one per stretch of street rather than
  // adjacent, so the run reads as a mixed street and not as two terraces.
  const lots = [
    [-12, -30, 0xe8d8b0, 'brick'], [-12, -15, 0xd8c8e8], [-12, 15, 0xf2e0c0, 'brick'], [-12, 30, 0xc8e0d0],
    [12, -30, 0xf0d8c8], [12, -15, 0xe0e8c8], [12, 15, 0xd8d0f0], [12, 30, 0xe8e0b8, 'brick'],
  ];
  for (const [x, z, color, bodySurface] of lots) {
    // `undefined` for the roof colour keeps house()'s default while still
    // reaching the body-surface argument behind it.
    scene.add(b.house(x, z, color, undefined, bodySurface));
    addC(x, z, 3.4);
    scene.add(b.mailbox(x + (x < 0 ? 4 : -4), z + 2));
    scene.add(b.flowerPatch(x + (x < 0 ? 5 : -5), z - 2, { wind }));
  }

  // trees, bushes, parked cars, lamps
  for (const [x, z] of [[-6, -40], [7, -22], [-8, 8], [6, 40], [-20, 22], [20, -8], [24, 18], [-24, -18]]) {
    // The scale expression is lifted into a local because the tree's fork
    // perch is derived from it (climbing.js's sureClawsTreePerch reads
    // builder.js's 2-unit trunk), and a fork authored from a hand-copied
    // scale is exactly how world data drifts from the model it sits on.
    const scale = 0.9 + ((x * z) % 5) * 0.08;
    // The wind registry goes in on the same line that plants the tree, which
    // is the whole design: no second list to fall out of step with this one.
    // builder.tree registers the GROUP and sways it by rotation only, so
    // `g.position.x/z` never moves and the collider added on the next line —
    // and the Sure Claws fork perch derived from `scale` on the line after —
    // stay exactly where this area declared them.
    scene.add(b.tree(x, z, scale, { wind }));
    addC(x, z, 0.6);
    clawPerches.push(sureClawsTreePerch(x, z, scale));
  }
  // A bush comes back as a GROUP rather than a Mesh once it is handed a wind
  // (builder.bush makes the hinge itself so the sway pivots at the soil rather
  // than at the bush's belly). The bush is in the same place either way; the
  // difference is invisible to everything in this file, which only adds it.
  for (const [x, z] of [[-4, -12], [5, 25], [18, 4], [-18, -4]]) scene.add(b.bush(x, z, { wind }));

  // low front fences along two west-side lots (curbside, just outside the house footprint)
  // Scenery until CF-9b: both runs now carry a mid-run fence-top perch at
  // 0.85, the same height the dog-yard tops already ship at (builder.js's
  // fenceRun is a 1m paling with its rail at 0.8). The cat cannot stand at
  // x -9 — the house collider at (-12, z) pushes it out to x -8.25 — but
  // 0.75 of that is well inside the 1.2 baseline reachLow, so the hop is
  // taken from the curb side, which is where a cat would jump a front fence.
  scene.add(b.fenceRun(-9, -17, -9, -13));
  scene.add(b.fenceRun(-9, 13, -9, 17));
  clawPerches.push(
    { x: -9, z: -15, y: 0.85, kind: 'fence', requires: SURE_CLAWS_ID },
    { x: -9, z: 15, y: 0.85, kind: 'fence', requires: SURE_CLAWS_ID },
  );

  // extra scatter trees in the open lawn corners (with colliders) + leaves swept beneath
  const scatterTrees = [[-30, -12], [30, 12], [-32, 38], [32, -38]];
  for (const [x, z] of scatterTrees) {
    scene.add(b.tree(x, z, 1.0, { wind }));
    addC(x, z, 0.6);
    clawPerches.push(sureClawsTreePerch(x, z, 1.0));
  }
  const leafSpots = [[-30, -12, 1], [30, 12, 2], [-32, 38, 3], [32, -38, 4], [-8, 8, 5]];
  for (const [x, z, seed] of leafSpots) scene.add(b.leafLitter(x, z, seed));

  // scatter bushes near lot frontages
  for (const [x, z] of [[-6, -22], [-6, 22], [9, -24], [9, 22], [-24, 5], [24, -30]]) scene.add(b.bush(x, z, { wind }));

  // flowerbeds beside houses. The quickest sway in the area and the smallest:
  // thin stems in the slowest air there is, which is builder.js's own reading.
  for (const [x, z] of [[-16, -28], [16, -28], [-17, 29], [16, 32]]) scene.add(b.flowerPatch(x, z, { wind }));

  // a bike left leaning in a side yard
  scene.add(b.bike(-14, 8, 0.9));
  addC(-14, 8, 0.5);

  // a couple more rocks scattered on the lawns
  for (const [x, z] of [[6, -45], [-30, 20]]) scene.add(b.rock(x, z));
  scene.add(b.car(4, -35, 0xd06048, 0));
  addC(4, -35, 1.8);
  scene.add(b.car(-4, 20, 0x4a6ea5, 0));
  addC(-4, 20, 1.8);
  for (const [x, z] of [[3, -10], [-3, 10], [10, 3], [-10, -3]]) scene.add(b.lampPost(x, z));

  // a little roadside advertising
  scene.add(b.billboard(7, -14, -Math.PI / 2));
  addC(7, -14, 2.3);

  // crate stack beside the billboard — a two-tier step up onto its top,
  // clear of the billboard's own collider (2.4 from its center, just
  // outside the 2.3 radius) but still within climbing reach of it.
  // Crate timber, the same call the Docks' crate stacks take: the plank tile
  // is four boards across its 1.0m, so a 1.0 and a 0.8 crate come out as four
  // ~25cm and four ~20cm boards, which is a packing crate. `undefined` for the
  // colour keeps builder.platform's shipped 0xc8a678 while still reaching the
  // options object behind it — these are the same crates, with grain on them.
  scene.add(b.platform(9.4, -14, 1.1, 0, 1.0, undefined, { surface: 'wood' }));
  scene.add(b.platform(9.4, -14, 2.0, 1.1, 0.8, undefined, { surface: 'wood' }));
  addC(9.4, -14, 0.5);

  // a lean-to porch roof against the fence corner by the (-12,15) house —
  // first step of the rooftop climb chain up to its ridge.
  // 'wood' rather than 'shingle', which is the tempting answer for anything
  // called a roof and is wrong for this shape. builder.platform is a BOX and a
  // box maps 0..1 per face, so one surface serves all six: shingle would hang
  // roof tabs down the porch's two side walls and its front, where a passing
  // cat sees them from 30cm away. Board it instead — the 1.6 x 1.3 body is
  // [2, 1] of the plank tile either way, and a lean-to porch is timber before
  // it is anything else. Its 0xa8846a is the shipped colour, untouched: plank's
  // 0.980 mean is inside the noise and needs no compensation.
  scene.add(b.platform(-9, 17.5, 1.3, 0, 1.6, 0xa8846a, { surface: 'wood' }));
  addC(-9, 17.5, 0.9);

  // small playground: slide-ish ramp + swing frame
  scene.add(b.bench(28, 28, Math.PI / 4));
  scene.add(b.bench(32, 24, Math.PI / 4));
  const puddles = [{ x: -7, z: -8, r: 0.9 }, { x: 9, z: 12, r: 0.8 }];
  for (const p of puddles) scene.add(b.puddle(p.x, p.z, p.r));

  // fenced yard with the dog (scare event source). Two of its three runs
  // have carried a fence-top perch since v11; the east run never did, so
  // CF-9b opens it — and that completes the U, because (26,-24) is 5.66 from
  // the shipped (22,-28) top, inside Fence Runner's 6.0 level dash. A Sure
  // Claws + Fence Runner cat can now run the dog yard's whole fence line
  // over the dog's head, which is the single best sentence in this feature.
  scene.add(b.fenceRun(18, -28, 26, -28));
  scene.add(b.fenceRun(18, -28, 18, -20));
  scene.add(b.fenceRun(26, -28, 26, -20));
  clawPerches.push({ x: 26, z: -24, y: 0.85, kind: 'fence', requires: SURE_CLAWS_ID });

  // cardboard boxes
  for (const b2 of [[-6, -24], [16, 21], [-18, 8]]) scene.add(b.cardboardBox(b2[0], b2[1], b2[0] * 0.7));

  return {
    name: 'Cozy Neighborhood',
    colliders,
    bounds: { minX: -55, maxX: 55, minZ: -55, maxZ: 55 },
    spawn: { x: 0, z: 45 },
    boxes: [{ x: -6, z: -24 }, { x: 16, z: 21 }, { x: -18, z: 8 }],
    pois: [
      { x: -8, z: 4 }, { x: 4, z: -35 }, { x: 16, z: 2 }, { x: -12, z: 32 },
      { x: 8, z: 27 }, { x: -6, z: -40 }, { x: 20, z: -8 }, { x: 28, z: 28 },
    ],
    collectibles: [
      { id: 'yarn-1', x: -14, z: 33.5, label: 'a red yarn ball' },
      { id: 'yarn-2', x: 5.5, z: -36.5, label: 'a blue yarn ball' },
      { id: 'yarn-3', x: 25, z: 21, label: 'a golden yarn ball' },
      { id: 'yarn-4', x: -21, z: -19, label: 'a green yarn ball' },
      { id: 'yarn-roof', x: -11.5, z: 15.5, y: 4.1, label: 'a legendary silver yarn ball' },
    ],
    scenics: [
      { id: 'playground', x: 30, z: 26, label: 'the little playground' },
      { id: 'crossroads', x: 0, z: 0, label: 'the sunny crossroads' },
    ],
    critterSpawns: [
      { type: 'bird', x: -6, z: -40 }, { type: 'bird', x: 6, z: 40 }, { type: 'bird', x: 24, z: 18 },
      { type: 'squirrel', x: -20, z: 22, x2: 7, z2: -22 },
      { type: 'squirrel', x: 20, z: -8, x2: -8, z2: 8 },
      { type: 'butterfly', x: -12, z: 28 }, { type: 'butterfly', x: 12, z: -12 },
      { type: 'mouse', x: -4, z: -10, x2: 2, z2: -6 },
      { type: 'mouse', x: 16, z: 30, x2: 10, z2: 25 },
      { type: 'dog', x: 22, z: -24 },
      { type: 'villager', x: -16, z: 12 }, { type: 'villager', x: 14, z: 34 },
    ],
    moments: [
      { id: 'feeder-raid', label: 'a squirrel raiding the bird feeder!', x: -12, z: 30, from: { x: -20, z: 22 } },
      { id: 'mail-nap', label: 'a delivery drone bothering the mailbox birds', x: 12, z: 32, from: { x: 6, z: 40 } },
    ],
    puddles,
    // The colour the hemisphere fill bounces up off this area's floor
    // (game/walk.js). It is the LAWN's own hex from the b.ground() call at the
    // top of build — the raw albedo, not a pre-darkened "bounce" value, because
    // walk.js's HEMI_INTENSITY is the single dial for how much of it lands and
    // splitting that decision across five area files would guarantee they
    // drifted. The neighbourhood is grass wall to wall, so the choice is easy.
    groundBounce: 0x7cb860,
    skyDusk: { top: 0x2a3a5e, horizon: 0x6a5a7e },
    tippables: [
      { x: -8, z: -32, kind: 'pot' }, { x: 10.5, z: -9.5, kind: 'pot' },
      { x: -17, z: 19, kind: 'can' }, { x: 15, z: 32, kind: 'pot' },
      { x: 5, z: 22, kind: 'bin' },
    ],
    // `kind` (v18 CF-9b) names the prop each perch sits on, from
    // climbing.js's closed PERCH_KINDS vocabulary. It is what makes Sure
    // Claws' height lift per-prop instead of global; an untagged perch reads
    // as 'prop' and climbs by exactly the baseline rule.
    perches: [
      { x: 28, z: 28, y: 0.58, kind: 'furniture' }, { x: 32, z: 24, y: 0.58, kind: 'furniture' },
      { x: 4, z: -35, y: 1.35, kind: 'car', label: 'king of the car roof', vantage: true },
      { x: -4, z: 20, y: 1.35, kind: 'car' },
      // dog-yard fence tops
      { x: 22, z: -28, y: 0.85, kind: 'fence' }, { x: 18, z: -24, y: 0.85, kind: 'fence' },
      // billboard crate-stack chain: ground -> crate -> crate top -> billboard
      { x: 9.4, z: -14, y: 1.1, kind: 'crate' }, { x: 9.4, z: -14, y: 2.0, kind: 'crate' },
      { x: 7, z: -14, y: 3.3, kind: 'roof', label: 'billboard lookout', vantage: true },
      // rooftop chain: ground -> porch roof -> rooftop -> ridge
      { x: -9, z: 17.5, y: 1.3, kind: 'roof' },
      { x: -9.5, z: 15.5, y: 2.9, kind: 'roof', label: 'rooftop scout', vantage: true },
      { x: -11.5, z: 15.5, y: 4.1, kind: 'roof', label: 'king of the roof', vantage: true },
      // Sure Claws only: twelve tree forks and three fence tops. Last in the
      // array on purpose — bestPerch keeps the FIRST of two equally high
      // candidates (`pp.y > best.y` is strict), so declaring the shipped
      // chain steps ahead of the gated records means a gated perch can never
      // displace one on a tie. It also keeps the array readable as "the
      // world, and then the ability".
      ...clawPerches,
    ],
  };
}
