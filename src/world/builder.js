import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial, repeatFor, surfaceProps, tileMetres } from '../render/materials.js';
import { skyBackground } from '../render/sky.js';
import { withLocalUuids } from './localuuids.js';
import { bakeWarehouse } from './warehouselook.js';
import { waterClearance } from './water.js';
import { softenFoliageNormals } from './plants.js';

// Some of builder.js's jobs live in their own files; their exports are
// re-exported here so every importer keeps importing from builder.js.
export {
  waterGap, onDeck, deckDistance, onAnyDeck, waterClearance, inWater,
  shorePieces, shallowExcess, nearestShallow, nearestDry,
} from './water.js';
export {
  rugRect, floorSeams, trimRun, pictureFrame, wallClock, curtain, wallShelf,
  bookStack, BOOKCASE_H, bookcase, PLANT_H, pottedPlant, RADIATOR_H, radiator,
  ARMCHAIR_SEAT, ARMCHAIR_BACK, armchair, DRESSER_H, dresser, TV_TOP, tvSet,
  toyBasket, catTunnel, petBowls, catToys, paperBag, logBasket,
} from './interiors.js';
export {
  TREE_OCCLUDER, CANOPY_KINDS, canopyKind, canopyGeometry, tree, bush,
  flowerPatch, reedBed, fernBed, brambleBed, HEATHER_BASE, heatherBed,
  gorseBed, willow, PINE_TRUNK, PINE_CONES, PINE_OCCLUDER, pine, pineStand,
  lilyPads, toadstools,
} from './plants.js';
export {
  ROCK_LOW, ROCK_HIGH, LEDGE_COLOR, ROCK_CREASE, capTopFor, rockTerrain,
  SCREE_COLOR, SCREE_SANDSTONE, scree, CRYSTAL_SIZE, CRYSTAL_SPREAD,
  caveCrystals, FLECK_SIZE, FLECK_OFF, caveFlecks,
} from './rocks.js';

export const mat = (color) => litMaterial(color);

// =============================================================================
// CHAMFERED BOXES (VISUAL-PASS.md Wave 4.1).
// =============================================================================
// Every box in this file used to be a bare BoxGeometry, i.e. twelve perfectly
// sharp 90-degree arrises. A perfect arris is the one edge condition that
// never exists on a real object and never catches a highlight: both faces
// meeting at it are lit by their own normals and nothing in between, so the
// edge is a colour STEP with no width. That step is most of what makes a box
// read as a primitive rather than as a thing.
//
// roundedBox() replaces it with a CHAMFER — one flat 45-degree facet per edge,
// with its own flat normal — and the reason it is a chamfer and not a fillet
// is the art direction. A fillet is a smooth-shaded arc; it is the CAD-model
// read, and it fights every other flat-shaded facet in the game. A chamfer is
// a third flat face whose normal sits exactly between its two neighbours', so
// under any light it takes a third distinct value and draws a crisp bright (or
// crisp dark) line along the edge. Three tones instead of two.
//
// WHY THIS MATTERS MORE NOW THAN IT WOULD HAVE BEFORE WAVE 1. The sun is at
// 19.1 degrees (game/walk.js SUN_POSITION). A grazing light is precisely the
// condition under which a chamfer earns its keep: on a vertical corner whose
// two walls sit either side of the sun's azimuth, the two walls differ by
// maybe 30% while the chamfer between them — a facet turned 45 degrees from
// both — can differ from either by twice that. Under the old near-noon sun the
// same chamfer would have been three near-identical greys.
//
// COST. 44 triangles against BoxGeometry's 12, so +32 per box, and roughly
// +6,000 triangles across an area's ~190 boxes. Section 0 of the plan is the
// authority on why that is noise: this scene is draw-call bound at ~15k
// triangles and a mid-range phone GPU will not notice 21k. A chamfered box is
// still ONE MESH, which is the number that is actually scarce.
//
// THE BOUNDING BOX IS UNCHANGED, and this is load-bearing rather than
// incidental. The chamfer cuts the CORNERS back; the six face planes stay
// exactly at +-w/2, +-h/2, +-d/2, so the extreme vertex along every axis is
// still on that plane. render/contactshadows.js sizes every decal from
// Box3.setFromObject and world/den.js + world/docks.js author their perch
// heights against a box's top FACE — both of those read the same numbers after
// this change as before it. A test pins it.
// ---------------------------------------------------------------------------
// THE SIZING RULE, which is the one real judgement here.
//
// A chamfer is a MANUFACTURING feature, not a scale feature. The arris break
// on a sawn plank, a moulded plastic casing and a cast kerb is set by the tool
// that made it, and it comes out roughly the same physical size whether the
// piece is 30cm or 3m long. So the default is ABSOLUTE:
//
//   CHAMFER = 25mm, the middle of the 20-30mm the plan asks for. Read as a
//   fraction of the frame rather than of the object: at the 2m the cat sees a
//   wall from, 25mm is ~10 screen pixels at 790px wide — a legible line. At
//   1m it is a visible bevel; by 15m it is under a pixel and correctly
//   disappears. A proportional rule would give a 5m warehouse wall a 45cm
//   chamfer, which is not an edge break, it is a fillet on a CAD model — the
//   exact failure this file is trying not to commit.
//
// Absolute alone breaks on thin members, and this file is FULL of thin
// members: 45mm fire-escape rungs, 60mm bicycle tubes, 80mm bench legs. A
// 25mm chamfer on a 45mm rung eats the rung. So the absolute figure is capped
// by a proportional one:
//
//   CHAMFER_BITE = 0.15 of the box's SMALLEST dimension. Two things at once.
//   It is a look decision — at 0.15 the flat faces still own 70% of every
//   dimension, so the prop stays a box with broken edges rather than turning
//   into an octahedral pebble. And it is a safety property: 0.15 x minDim is
//   0.30 of the smallest HALF-extent, so `r` can never reach the middle of the
//   member and the geometry below can never invert.
//
// And below a floor there is nothing worth paying for:
//
//   CHAMFER_MIN = 5mm. Under 5mm the chamfer is sub-pixel at every distance
//   this game is played from, so it would cost 32 triangles to draw nothing.
//   It also happens to fall exactly where boxes stop being OBJECTS and start
//   being LAMINAE — a rug's 20mm pile, a floorboard seam at 10mm, a cardboard
//   box's 30mm walls, the 20mm canvas inside a picture frame. Those want a
//   sharp edge on their own merits (a painting with a bevelled edge is a
//   painting on the wrong side of the canvas), and a chamfer on a 30mm card
//   wall would open a 4mm slit at each corner of the box. They fall out of the
//   rule rather than needing a list.
//
// Worked through, the members this file actually builds:
//     house wall     5.00 x 3.00 x 4.00  -> 25mm   (absolute)
//     car body       1.80 x 0.60 x 4.00  -> 25mm   (absolute)
//     crate          1.20 x 1.10 x 1.20  -> 25mm   (absolute)
//     bench slat     1.60 x 0.08 x 0.50  -> 12mm   (bite)
//     fence post     0.10 x 1.00 x 0.10  -> 15mm   (bite)
//     bike tube      0.06 x 0.06 x 0.90  ->  9mm   (bite)
//     ladder rung    0.56 x 0.045 x 0.045 -> 6.8mm (bite)
//     card-box wall  0.55 x 0.30 x 0.03  ->  0     (floor: stays sharp)
//     rug pile       w    x 0.02 x d     ->  0     (floor: stays sharp)
export const CHAMFER = 0.025;
export const CHAMFER_BITE = 0.15;
export const CHAMFER_MIN = 0.005;

export function chamferFor(w, h, d) {
  const r = Math.min(CHAMFER, Math.min(Math.abs(w), Math.abs(h), Math.abs(d)) * CHAMFER_BITE);
  return r < CHAMFER_MIN ? 0 : r;
}

// The six faces, in three's own BoxGeometry order and with three's own UV
// convention, because preserving that convention EXACTLY is what makes this a
// drop-in swap. surfBox() derives every repeat from repeatFor() on the
// assumption that a box maps 0..1 per face with v running up +y on the sides
// (see the surfaces block below), and materials.js's whole tiling vocabulary
// is written against it.
//
// Each row is [wAxis, wSign, uAxis, uDir, vAxis, vDir], read off three's own
// buildPlane() calls in src/geometries/BoxGeometry.js. The projection they
// imply is planar and continuous, so it is applied to the vertex's REAL
// position rather than to a 0..1 corner index: the inset main face gets the
// 0..1 interval minus its two chamfer slivers and each bevel carries the
// sliver it took, which keeps the tile at exactly the density the flat box
// had. (Handing the shrunken face a full 0..1 instead would compress the tile
// by 2r/w — 1% on a house wall, but 17% on a 30cm one.)
const AXIS = { x: 0, y: 1, z: 2 };
const BOX_FACES = [
  ['x', +1, 'z', -1, 'y', -1], // px
  ['x', -1, 'z', +1, 'y', -1], // nx
  ['y', +1, 'x', +1, 'z', +1], // py
  ['y', -1, 'x', +1, 'z', -1], // ny
  ['z', +1, 'x', +1, 'y', -1], // pz
  ['z', -1, 'x', -1, 'y', -1], // nz
];

// A chamfered box, built by hand: 6 inset face quads + 12 edge bevel quads +
// 8 corner triangles = 44 triangles, NON-INDEXED so every facet keeps its own
// flat normal (the same reason irregularLobe() below stays non-indexed —
// shared vertices would smooth the chamfer back into a fillet).
//
// It is built ON TOP OF a real BoxGeometry, whose 24 vertices are then thrown
// away, and that is not laziness. `geometry.type` and `geometry.parameters`
// are the only way anything outside this file can ask a mesh what shape it is,
// and things do ask: test/neighborhood.test.js finds the eight house bodies by
// `type === 'BoxGeometry' && parameters.width === 5`, which is a perfectly
// reasonable thing for a world test to do and is exactly the kind of contract
// a "mechanical swap" is not allowed to break. Inheriting the shell keeps that
// reflection surface exact, at the cost of building 24 vertices once per
// distinct dimension triple and immediately discarding them.
function chamferedBoxGeometry(w, h, d, r) {
  const half = [w / 2, h / 2, d / 2];
  const inner = [half[0] - r, half[1] - r, half[2] - r];
  const ext = [w, h, d];
  const pos = [];
  const nrm = [];
  const uvs = [];

  // The uv projection for one face, applied to any point in space. Used for
  // the face's own quad AND for the bevels and corners that borrow it.
  const projector = ([, , uAxis, uDir, vAxis, vDir]) => {
    const iu = AXIS[uAxis];
    const iv = AXIS[vAxis];
    return (p) => [0.5 + (p[iu] * uDir) / ext[iu], 0.5 - (p[iv] * vDir) / ext[iv]];
  };
  // The face a bevel or a corner takes its uv from: the first of x, y, z among
  // the axes involved, with that axis's own sign. Arbitrary but fixed — the
  // facet is 25mm wide and any of its neighbours' projections is within a
  // texel of any other's; what matters is that the choice is deterministic so
  // two co-walkers build identical geometry.
  const faceFor = (axis, sign) => BOX_FACES.find((f) => f[0] === axis && f[1] === sign);

  // Winding is DERIVED, not typed: push the corners in any order and let the
  // intended outward normal decide whether the triangle needs flipping. Twelve
  // bevels and eight corners is exactly the amount of sign bookkeeping that
  // produces one inside-out facet nobody notices until a walk at dusk.
  const tri = (a, bp, c, n, uv) => {
    const e1 = [bp[0] - a[0], bp[1] - a[1], bp[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    const verts = (cx * n[0] + cy * n[1] + cz * n[2]) >= 0 ? [a, bp, c] : [a, c, bp];
    for (const v of verts) {
      pos.push(v[0], v[1], v[2]);
      nrm.push(n[0], n[1], n[2]);
      const [u, vv] = uv(v);
      uvs.push(u, vv);
    }
  };
  const quad = (a, bp, c, dd, n, uv) => { tri(a, bp, c, n, uv); tri(a, c, dd, n, uv); };

  // 1. the six inset faces
  for (const face of BOX_FACES) {
    const [wAxis, wSign] = face;
    const k = AXIS[wAxis];
    const [i, j] = [0, 1, 2].filter((a) => a !== k);
    const n = [0, 0, 0];
    n[k] = wSign;
    const at = (si, sj) => {
      const p = [0, 0, 0];
      p[k] = wSign * half[k];
      p[i] = si * inner[i];
      p[j] = sj * inner[j];
      return p;
    };
    quad(at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), n, projector(face));
  }

  // 2. the twelve edge bevels. `f` is the axis the edge runs along; `p`/`q`
  // are the two faces it separates.
  const SQ2 = Math.SQRT1_2;
  for (const f of [0, 1, 2]) {
    const [i, j] = [0, 1, 2].filter((a) => a !== f);
    for (const si of [-1, 1]) {
      for (const sj of [-1, 1]) {
        const n = [0, 0, 0];
        n[i] = si * SQ2;
        n[j] = sj * SQ2;
        const at = (sf, onI) => {
          const p = [0, 0, 0];
          p[f] = sf * inner[f];
          p[i] = si * (onI ? half[i] : inner[i]);
          p[j] = sj * (onI ? inner[j] : half[j]);
          return p;
        };
        const parent = i < j
          ? faceFor(['x', 'y', 'z'][i], si)
          : faceFor(['x', 'y', 'z'][j], sj);
        quad(at(-1, true), at(1, true), at(1, false), at(-1, false), n, projector(parent));
      }
    }
  }

  // 3. the eight corner triangles
  const SQ3 = 1 / Math.sqrt(3);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const s = [sx, sy, sz];
        const corner = (k) => {
          const p = [sx * inner[0], sy * inner[1], sz * inner[2]];
          p[k] = s[k] * half[k];
          return p;
        };
        tri(corner(0), corner(1), corner(2), [sx * SQ3, sy * SQ3, sz * SQ3],
          projector(faceFor('x', sx)));
      }
    }
  }

  const geo = new THREE.BoxGeometry(w, h, d);
  geo.setIndex(null);
  // BoxGeometry ships six material groups, one per face; they index the 36
  // indices it just built and mean nothing against the 132 vertices below.
  // Three ignores groups for a single-material mesh and nothing in this game
  // gives a box a material array, but leaving a stale group table on a
  // geometry is how the next person to try one gets a puzzle.
  geo.clearGroups();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeBoundingSphere();
  return geo;
}

// MEMOISED BY DIMENSION, and the cache is app-lifetime rather than per-walk.
//
// The saving is not the arithmetic — 44 triangles is nothing to build — it is
// that a neighbourhood plants eight houses, five fence runs and ninety-odd
// posts, and there is no reason for ninety identical 0.1 x 1 x 0.1 palings to
// hold ninety copies of the same 4KB buffer and to upload ninety of them. One
// geometry, ninety meshes; the mesh count, which is the number that costs
// draw calls, does not move at all.
//
// SURVIVING endWalk's TEARDOWN, which is the one thing an app-lifetime
// geometry cache has to get right. game/walk.js:1292 traverses the whole
// scene at the end of every walk and calls geometry.dispose() on everything it
// finds, so these geometries WILL be disposed — repeatedly. That is safe, and
// checked against three r185's own source rather than assumed:
// BufferGeometry.dispose() only dispatches an event; WebGLGeometries's handler
// frees the GPU buffers, unregisters itself and forgets the geometry, and the
// next render re-registers it and re-uploads the attributes from the CPU-side
// arrays, which dispose() never touches. The listener is removed inside the
// handler, so ninety meshes sharing one geometry produce exactly ONE decrement
// of renderer.info.memory.geometries against the one increment they caused —
// the count stays honest, which it would not have done for ninety separate
// buffers either.
//
// Keys are the three dimensions to 6dp. Not exact float identity: `depth - 0.1`
// and a literal 0.5 should share a geometry, and two dimensions that differ
// below a micrometre are the same object.
const boxGeometries = new Map();

/**
 * roundedBox(w, h, d) — a chamfered box geometry with BoxGeometry's signature,
 * BoxGeometry's UV layout and BoxGeometry's bounding box. Returns a genuine
 * BoxGeometry when the chamfer would fall under CHAMFER_MIN, so a lamina keeps
 * its sharp edge and its 12 triangles.
 *
 * The returned geometry is SHARED. Do not mutate it in place — nothing in this
 * file does (applyMacroVariation, the one function here that writes into a
 * geometry, only ever sees the PlaneGeometry of a ground/path/sidewalk).
 */
export function roundedBox(w, h, d) {
  const key = `${w.toFixed(6)},${h.toFixed(6)},${d.toFixed(6)}`;
  let geo = boxGeometries.get(key);
  if (!geo) {
    const r = chamferFor(w, h, d);
    geo = r === 0 ? new THREE.BoxGeometry(w, h, d) : chamferedBoxGeometry(w, h, d, r);
    boxGeometries.set(key, geo);
  }
  return geo;
}

export const box = (w, h, d, color) => new THREE.Mesh(roundedBox(w, h, d), mat(color));

// ---------------------------------------------------------------------------
// Surfaces (v20 surface-foundation wave).
//
// `mat`/`box` above are unchanged and still the default for every prop: the
// art direction is flat and matte, and a prop that reads fine flat stays
// flat. These two are the opt-in, used by the props the wave has actually
// been through — today that is the Docks' own builders plus the two shared
// ones (ground, platform) that take a surface only when a caller asks.
//
// The repeat is always DERIVED from the face's real size via repeatFor(),
// never typed: repeatFor speaks the 16-preset vocabulary of materials.js
// (NOT the 7 texture names of textures.js — see the two-namespaces note in
// both headers) and returns null for a preset that carries no map, which
// litMaterial reads as "take the surface's own default density".
//
// A BoxGeometry maps 0..1 per FACE, so one repeat serves all six: pass the
// dimensions of the face that matters (a wall's w x h) and accept that the
// end faces tile at a slightly different density. On the side faces v runs
// up +y, which is what puts brick courses and siding laps horizontal and
// plank grain vertical without any per-face bookkeeping.
export const surfMat = (color, surface, w, h) =>
  litMaterial(color, { surface, repeat: repeatFor(surface, w, h) });
// `fw`/`fh` default to the box's own width/height — override them when the
// face that should drive the tiling is not the front one.
export const surfBox = (w, h, d, color, surface, fw = w, fh = h) =>
  new THREE.Mesh(roundedBox(w, h, d), surfMat(color, surface, fw, fh));

// A preset's light response with its MAP DELIBERATELY LEFT OFF. Reads the
// roughness/metalness straight off materials.js's table rather than typing the
// numbers, so it can never drift from the preset it names.
//
// This exists because of two shapes that a tiling map makes WORSE, both found
// by the Docks pilot and both binding on this pass:
//
//   THE THIN-MEMBER RULE. repeatFor() rounds to a minimum of one whole tile,
//   so any face narrower than one tile gets the entire tile squashed into it.
//   The plank tile is four boards across 1.0m; on a 0.1m fence post that is
//   four 2.5cm stripes, which reads as corduroy, not as timber. The pilot hit
//   the same thing on the warehouse parapet lips and left them flat. Anything
//   under roughly a third of a tile in its narrow dimension comes here instead.
//
//   THE CYLINDER RULE. A planar tiling map on a 6-to-12-sided cylinder or a
//   faceted solid (trunks, barrels, posts, drums, plant pots, boulders) smears
//   at the silhouette and looks worse than no map at all — which is why the
//   'bark' and 'foliage' presets ship map-less in the first place. Roughness-
//   only is still entirely welcome on those shapes, and that is what this is.
//
// Note it takes the FAST path through litMaterial (no `surface` key), so it
// never touches the texture cache at all.
export const surfNoMap = (color, surface) => litMaterial(color, surfaceProps(surface));

// =============================================================================
// ROUND PRIMITIVES — the segment-count pass (VISUAL-PASS.md Wave 4.2).
// =============================================================================
// Same budget argument as the chamfer above and the same conclusion: triangles
// are the free resource, meshes are not (section 0). A cylinder costs 4 * n
// triangles, so taking a trunk from 6 sides to 10 is 16 triangles. Nothing in
// this pass costs a draw call, a mesh, a byte of texture memory or a material.
//
// THE RULE FOR DECIDING n, so this does not become "raise everything":
//
//   Raise where the SILHOUETTE is seen close up, leave it where it is not.
//   A cylinder's silhouette error is the sagitta of one facet — r * (1 -
//   cos(pi/n)) — and what matters is that error against the prop's own size on
//   screen. A 0.6m trunk at 6 sides bulges/flats by 13% of its radius and is
//   seen from a metre away by a cat sitting under it; a 3cm radiator pipe at 6
//   sides is wrong by 2mm and is never anything but a line. So the trunk moves
//   and the pipe barely does.
//
//   The practical target is a facet under ~10cm of arc on anything the cat
//   stands next to, which is roughly the width of the cat's own head — the
//   scale at which a facet stops being a face and starts being a curve.
//
//   Nothing here goes past 24. Beyond that the silhouette is already smooth
//   and all that is left is smoothing the SHADING, which is not wanted: these
//   are three's default smooth-normal cylinders and the low-poly read comes
//   from their facet count being legible, not from it being hidden.
//
// TWO SHAPES ARE DELIBERATELY LEFT COARSE, because their low count is the
// design rather than a corner cut: house()'s 4-sided roof cone (it is a
// pyramid — four pitches, not a smoothed spire; its own comment says so) and
// pictureFrame()'s 4-sided hill (a stylised shape inside a painting).
//
// THE MAP-PROMOTION QUESTION the plan raises with this item — "raising the
// segment count may make some of those trunks mappable again" — was checked
// call site by call site and the honest answer for this file is ONE prop. The
// reasoning, because the negative result is the useful part:
//
//   * The TRUNK cannot be promoted at any segment count. materials.js's 'bark'
//     preset carries no `texture` key, and there is no bark tile among
//     textures.js's eight; the preset's comment blames the cylinder rule, but
//     the binding reason is that the art does not exist. Promoting it would
//     mean spending 'wood' (the plank tile) and its roughness 0.75 on
//     something whose whole identity is being the roughest surface in the game
//     at 0.98 — a materials decision, in a file this wave does not own.
//   * Everything else map-less on a round shape here is map-less for a reason
//     segments cannot touch: 'paintedMetal', 'matte', 'foliage' and 'water'
//     carry no map at all (bollards, wheels, valves, bowls); the wall clock's
//     dial and the potted plant's pot suppress a map they COULD now carry
//     (siding, brick) because the pattern is wrong for the object, not because
//     the silhouette smeared — a clock face with clapboards on it and a
//     terracotta pot with a brick bond are both worse at 16 sides than at 10;
//     and toyBasket/catTunnel/logBasket are wicker and nylon, which the
//     vocabulary simply does not have.
//   * roofTank() IS the one, and it is promoted below. See its own comment.
//
// The one named constant, because it is read in two places (here and, in
// spirit, by climbing.js's sureClawsTreePerch, which is authored against the
// trunk's 2-unit height rather than its sides — but a reader comparing the two
// should not have to count arguments).
export const TRUNK_SIDES = 10;

// ---------------------------------------------------------------------------
// WIND (v20). Foliage builders take an optional `wind` — the per-walk sway
// registry walk.js creates and threads into every area build — and register
// THEMSELVES with it as they are planted, so an area gets sway from the same
// line that plants the tree rather than from a second bookkeeping list that
// can fall out of step with the first.
//
// It is opt-in and defaults to nothing: `tree(x, z, 1.2)` is exactly the tree
// it has always been, which is what keeps every world file and every world
// test working while the four remaining areas land one at a time.
//
// THE SIZE-HINT DIRECTION, which was left open by render/wind.js and is
// settled here. wind.js derives BOTH amplitude and frequency from `sizeHint`
// on one physical reading — inertia — so a smaller prop comes out swaying
// faster AND FURTHER, like a thin branch against a thick trunk. The original
// brief asked for the opposite on amplitude: "a bush jitters faster and less".
//
// The brief wins, and it wins on observation rather than on authority. Stand
// in real wind and the hedge barely stirs while the tree crowns swing: a
// canopy is a large sail carried at 3-4m, up out of the ground boundary layer
// and on top of a springy trunk, whereas a bush is a dense low mass of stems
// sitting in the slowest air there is. It also happens to be the reading this
// game needs, because sway is an ANGLE and the arc it sweeps is proportional
// to the prop's height: 1.5° on a 4m tree is a canopy moving ~10cm and reads
// as weather, while the same 1.5° on a 0.7m bush is 2cm and reads as nothing.
// Give the small prop MORE angle and it becomes the twitchiest thing on
// screen while the trees stand still — exactly backwards.
//
// So the builders keep wind.js's frequency falloff (bigger really is slower)
// and OVERRIDE the amplitude half through wind.add's own `amplitude` escape
// hatch, using the two constants below. Every registration passes an EXPLICIT
// sizeHint as well, so what a prop does is a decision written down here rather
// than a consequence of whatever `scale` a call site happened to pass.
//
// Both are radians, and both sit at or under wind.js's UNIT_AMPLITUDE band —
// over-swaying flat-shaded low-poly foliage reads as jelly, not as weather.
// A scale-1 tree is deliberately set to UNIT_AMPLITUDE exactly, so the
// vocabulary's "ordinary prop" and this file's "ordinary tree" are the same
// 1.5°, and the two constants below are read as steps away from it.
export const SWAY_TREE = 0.026; // ~1.5° at scale 1; see swayFor() for the growth
export const SWAY_BUSH = 0.014; // ~0.8°: a bush stirs, it does not wave
export const SWAY_FLOWERS = 0.020; // ~1.1°: light, on thin stems, quickest of the three

// A tree's lean grows with the SQUARE ROOT of its scale, not linearly. Two
// reasons, and they agree:
//   * the arc a canopy sweeps is already proportional to its height, so a
//     linear angle on top of that compounds twice and a big oak ends up
//     wobbling like a sapling in a gale;
//   * the worst case this system can reach is not the resting pose — main.js
//     drives `intensity` to 1.7 in rain and wind.js's gust envelope peaks at
//     1.4x on top of that, so every number here is multiplied by ~2.4 before
//     a player ever sees the extreme. sqrt keeps the biggest tree in the game
//     under ~4.5° even at that peak, which is still "a few degrees".
// sqrt is also the same falloff shape wind.js's own amplitude derivation uses,
// so the two are at least speaking the same language while disagreeing about
// which way it points.
export const swayFor = (scale) => SWAY_TREE * Math.sqrt(Math.max(0.01, scale));

// The size hints. A bush and a flower patch have no `scale` parameter and are
// visually small and light no matter how big they are drawn, so they are
// pinned low (wind.js clamps to MIN_SCALE 0.4) and come out quick: sizeHint
// 0.55 puts a bush on a ~2.0s cycle against a scale-1 tree's ~3.6s.
export const BUSH_SIZE_HINT = 0.55;
export const FLOWER_SIZE_HINT = 0.4;

// Per-channel multiply, clamped. The one use is colour compensation against a
// texture's mean luminance (render/textures.js's header carries the table);
// `factor` is 1/mean, so the textured prop lands back on its authored colour.
function lift(hex, factor) {
  const ch = (shift) => Math.min(255, Math.round(((hex >> shift) & 0xff) * factor));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function applySky(scene, top, horizon) {
  // skyBackground paints a vertical gradient rather than a flat fill — see
  // render/sky.js for why, and why its horizon stop MUST be this same
  // `horizon` value: fog fades geometry toward it, so the sky and the fade it
  // recedes into have to agree.
  scene.background = skyBackground(top, horizon);
  scene.fog = new THREE.Fog(horizon, 40, 130);
  // The authored pair, kept for weather.js's clear-day grade (CLEAR_DAY_LOOK),
  // which needs the stops and cannot read them back off a canvas texture.
  if (scene.userData) scene.userData.daySky = { top, horizon };
}

// `surface` is opt-in and defaults to nothing at all, so every area that does
// not ask keeps the flat colour plane it ships with. The repeat comes from the
// ground's own size, which is the only sane density for a plane this big — a
// hand-picked number here is a plaid at 40m.
// Colour compensation lives HERE and not in the world files, so the authored
// hexes in park.js/neighborhood.js stay the colours a human picked. Grass is
// one of the two tiles worth compensating (mean 0.955 — see the luminance
// table in render/textures.js's header): a lawn is the largest single surface
// in the game and 4.5% off is a visible drop in the one colour the area is
// named for. Every other surface a ground plane takes is left alone — the
// Docks' cobbles are DELIBERATELY uncompensated (its own comment says so:
// four percent darker is the right direction for an overcast harbour), and
// sand is at 0.998 by design.
// Segmented at SEG_METRES/segment (segsFor(), defined with the ground-macro
// helpers above) rather than the bare two-triangle plane this used to be —
// see the GROUND-PLANE MACRO VARIATION block further down this file for why: vertex
// colours need vertices to carry, and triangles are this scene's one cheap
// resource (VISUAL-PASS.md section 0). applyMacroVariation() below then
// paints the actual patches; note it runs AFTER rotation.x is set, so its
// per-vertex hash01 input is the plane's real world (x, z), matching the
// rest of this file's convention (tree/wind hashing always keys off world
// position, never local mesh-space coordinates).
export function ground(size, color, { surface } = {}) {
  const segs = segsFor(size);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size, segs, segs),
    surface
      ? surfMat(surface === 'grass' ? lift(color, 1 / 0.955) : color, surface, size, size)
      : mat(color),
  );
  m.rotation.x = -Math.PI / 2;
  // Tagged so the rain can find the lawn and darken it (weather.js's wet ground).
  m.userData.ground = true;
  applyMacroVariation(m, surface, size);
  return m;
}

// Bigger areas: more of the SAME ground, for a strip outside the square plane
// (`main`, what ground() returned, already tinted or not). A flat rectangle
// `rect` ({ minX, maxX, minZ, maxZ }, its edges on the main plane's vertex
// grid), sharing the main plane's material so the texture, the rain's wet
// look and the dusk tint carry straight on; its uvs continue the main
// plane's, and its macro patches are the same field (the main plane's own
// wavelength), so the join cannot be seen. The caller wraps this in
// withLocalUuids and tints it as it tinted the main plane.
export function groundPatch(main, rect, { surface } = {}) {
  const size = main.geometry.parameters.width;
  const step = size / segsFor(size);
  const w = rect.maxX - rect.minX;
  const d = rect.maxZ - rect.minZ;
  const geo = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / step)), Math.max(1, Math.round(d / step)));
  const cx = (rect.minX + rect.maxX) / 2;
  const cz = (rect.minZ + rect.maxZ) / 2;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  // local (x, y) -> world (cx + x, cz - y) once laid flat; the main plane's
  // uv at world (X, Z) is (X / size + 0.5, 0.5 - Z / size)
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (cx + pos.getX(i)) / size + 0.5, 0.5 - (cz - pos.getY(i)) / size);
  }
  const m = new THREE.Mesh(geo, main.material);
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, 0, cz);
  m.userData.ground = true;
  applyMacroVariation(m, surface, size);
  return m;
}

// `surface` is opt-in for the same reason ground()'s and platform()'s are: a
// park's winding path is gravel ('sand' is the fine-speckle tile and is what a
// gravel walk actually looks like), a neighbourhood's is packed earth, and the
// Docks' four paths are 'flagstone' (Stream 4 round two: big slabs, so they
// read apart from the small cobbles they run over). None of those three
// should have to change for either of the others, so nobody is defaulted into
// a surface here. `color` replaces the shared path beige where an area's
// palette needs it (the Docks, again).
//
// `footprint: true` makes the hidden DATA strip pathribbon.js's soft trail is
// drawn over: same width/length parameters, transform, name and material as
// the visible strip (one 1x1 plane, no macro paint, visible = false). It stays
// in the scene because grass.js's flatFootprints, pawprints.js's groundStrips,
// walk.js's wet/dusk lists and the water/grass/gorge tests all read 'path'
// meshes. It makes exactly the same Three objects as a visible strip, so the
// Math.random draw count is identical either way.
export function path(x1, z1, x2, z2, w = 2, { surface, color = 0xcbb8a0, footprint = false } = {}) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  // Segmented along both axes — see segsFor()/GROUND-PLANE MACRO VARIATION
  // further down this file. Width gets at most a handful of segments (paths run 1-5m
  // wide; more than that resolves nothing), length gets enough to carry a
  // patch wavelength derived from the path's OWN length via wavelengthFor(),
  // not a constant shared with the 120m ground plane.
  const m = new THREE.Mesh(
    footprint
      ? new THREE.PlaneGeometry(w, len, 1, 1)
      : new THREE.PlaneGeometry(w, len, segsFor(w, 1, 6), segsFor(len, 4, 64)),
    surface ? surfMat(color, surface, w, len) : mat(color),
  );
  m.rotation.x = -Math.PI / 2;
  // atan2 of the NEGATED delta, not the negated atan2 — they are not the same
  // thing, and the difference is a bug this drew for as long as the park has
  // existed. After rotation.x = -PI/2 the plane's local +Y (its length axis)
  // maps to world (-sin0, 0, -cos0), so matching the segment direction
  // (dx, dz) needs 0 = atan2(-dx, -dz). The old `-atan2(dx, dz)` agrees with
  // that ONLY when the segment is axis-aligned, where the two differ by pi and
  // a rectangle is symmetric under it — which is why every path in the
  // neighbourhood, the Docks and the den looked right and nobody noticed. On a
  // diagonal they differ by up to 90 degrees, and the strip was drawn along
  // the WRONG DIAGONAL of its own bounding box: park's (0,20)->(-14,6) walk
  // was rendered running (-14,20)->(0,6) instead.
  m.rotation.z = Math.atan2(-(x2 - x1), -(z2 - z1));
  m.position.set((x1 + x2) / 2, 0.01, (z1 + z2) / 2);
  // Tagged so a test can find every path in every area without the world
  // files having to publish their vertices as data. It exists for the water
  // invariant: paths carry no collider and are not content, so nothing ever
  // checked where they ran, and the park's winding walk had a vertex three
  // metres INSIDE the duck pond from the day it was authored. That was
  // invisible while water was a walk-over surface and became a path running
  // into a lake the moment the v19 collider wave landed.
  m.name = 'path';
  if (footprint) {
    m.visible = false;
    return m;
  }
  // AFTER rotation/position are set — see applyMacroVariation()'s own
  // comment for why (it reads mesh.matrix for each vertex's world (x, z)).
  applyMacroVariation(m, surface, len);
  return m;
}

// =============================================================================
// DRESSED HOUSES (polish-twolegplace).
// =============================================================================
// house()'s optional `look` turns the shipped box-and-pyramid into a storybook
// cottage: corner boards, a plinth, a fascia, framed windows with sills, side
// windows, shutters, a flower box, a door step and mat, a hood / canopy /
// porch, pots, a chimney, and optionally a gable roof. All of it costs TWO
// meshes per house (houseTrim, vertex-coloured; houseGlass, the dusk-glowing
// side panes and door lantern), and nothing in the shipped five moves.
//
// THREE RULES THE CODE BELOW KEEPS, all for systems that read houses:
//   * Math.random. Three takes 4 draws per Object3D / geometry / material, and
//     every area build's draw count is pinned (test/waterlooks.test.js). The
//     trim and glass are built inside withLocalUuids, intermediate geometries
//     included. The gable roof is NOT: it replaces the cone's geometry one for
//     one (one geometry, the same surfMat call, one mesh), so it draws exactly
//     what the cone drew. Variety comes from look data and hash01, never
//     Math.random. Nothing here goes through roundedBox(): its cache would let a
//     geometry made under local uuids satisfy a later real-stream call.
//   * The non-precise Box3. contactshadows.js and rig.js classify each
//     top-level child by Box3.setFromObject; the dressing stays inside the
//     cone's box and the gable roof carries the cone's box explicitly.
//   * Windows. houseGlass is userData.window so dusk.js lights it and
//     mergeprops.js leaves it alone; treefade.js builds the house's fade box
//     from every mesh that starts below half height, which is why the dressing
//     stays within x, z +-2.8.
const HOUSE_LOOK = {
  roof: 'pyramid', door: 0x7a5230, trim: 0xf4efe4, shutters: null, flowerBox: false,
  entry: 'hood', chimney: null,
};
const EAVE_Y = 2.8;
const RIDGE_Y = 5;
// The shipped cone (r 3.9, turned 45 degrees) has a non-precise box of
// +-3.9 * (cos 45 + sin 45) in x and z.
const CONE_REACH = 3.9 * Math.SQRT2;
// Gable roofs in a canonical frame: ridge along z, eaves at x = +-across, rakes
// at z = +-along; wallAcross / wallAlong are the body's half-sizes in that
// frame. 'sideGable' is the same build turned a quarter about y.
const GABLES = {
  frontGable: { across: 2.8, along: 2.3, wallAcross: 2.5, wallAlong: 2, turn: 0 },
  sideGable: { across: 2.3, along: 2.75, wallAcross: 2, wallAlong: 2.5, turn: Math.PI / 2 },
};
const HOUSE_GLASS = 0xa8d8e8;
const BRASS = 0xd8b04a;
const IRON = 0x3b3a40;
const STEP_STONE = 0xb5aca0;
const DOORMAT = 0x9a5e3c;
const TERRACOTTA = 0xc4673f;
const POT_GREEN = 0x6aa84f;
const LEAF = 0x5f9e4a;
const FLOWERS = [0xf28cb4, 0xf5d04a, 0xd9414b];
const CHIMNEY_BRICK = 0xa0523d;
const CHIMNEY_CAP = 0x7a746e;

const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
// [a, b, c] wound so the face normal points along `out`.
function orientTri(a, b, c, out) {
  _ab.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  _ac.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  _ab.cross(_ac);
  return _ab.x * out[0] + _ab.y * out[1] + _ab.z * out[2] >= 0 ? [a, b, c] : [a, c, b];
}

// The two slope quads of a gable roof, in house space (the mesh sits at y 0).
// UVs give the cone's tile size in metres under the same repeatFor('shingle',
// 11, 4.4): u = metres along the eave / 11, v = metres up the slope / 4.4.
function gableRoofGeometry(roof) {
  const { across: A, along: L, turn } = GABLES[roof];
  const rise = RIDGE_Y - EAVE_Y;
  const slope = Math.hypot(A, rise);
  const pos = [];
  const uv = [];
  for (const s of [1, -1]) {
    const e1 = [s * A, EAVE_Y, -L], e2 = [s * A, EAVE_Y, L];
    const r1 = [0, RIDGE_Y, -L], r2 = [0, RIDGE_Y, L];
    const out = [s * rise, A, 0];
    for (const tri of [orientTri(e1, e2, r2, out), orientTri(e1, r2, r1, out)]) {
      for (const p of tri) {
        pos.push(...p);
        uv.push((p[2] + L) / 11, (p[1] === RIDGE_Y ? slope : 0) / 4.4);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  if (turn) geo.rotateY(turn);
  // Explicit, and wider than the vertices on purpose: the decal scan
  // (contactshadows.js) and the caster rule (rig.js) read the house's
  // NON-precise Box3, which is the union of its meshes' geometry boxes. The
  // cone's was x, z +-CONE_REACH; keeping that here keeps the house's box (and
  // so its decal and caster class) exactly as shipped. y is the vertices' own
  // 2.8..5 — the body already holds the house box's y 0.
  geo.boundingBox = new THREE.Box3(
    new THREE.Vector3(-CONE_REACH, EAVE_Y, -CONE_REACH),
    new THREE.Vector3(CONE_REACH, RIDGE_Y, CONE_REACH),
  );
  return geo;
}

// Collects non-indexed pieces (position + normal, and colour when `colored`)
// for one mergeGeometries call. `turn` spins a piece about the house's y axis
// after it is placed, so a front-wall layout can be reused on a side wall.
// Call only inside withLocalUuids: every piece is a fresh geometry.
function pieceKit(colored) {
  const parts = [];
  const add = (geo, hex, turn) => {
    if (geo.index) geo = geo.toNonIndexed();
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    if (turn) geo.rotateY(turn);
    if (colored) {
      const c = new THREE.Color(hex); // linear r/g/b under Three's colour management
      const col = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    parts.push(geo);
  };
  return {
    box(w, h, d, x, y, z, hex, { rz = 0, turn = 0 } = {}) {
      const geo = new THREE.BoxGeometry(w, h, d);
      if (rz) geo.rotateZ(rz);
      geo.translate(x, y, z);
      add(geo, hex, turn);
    },
    solid(geo, x, y, z, hex) {
      geo.translate(x, y, z);
      add(geo, hex, 0);
    },
    // A convex polygon, fan-triangulated, facing `out`.
    poly(points, out, hex, turn = 0) {
      const pos = [];
      for (let i = 1; i < points.length - 1; i++) {
        for (const p of orientTri(points[0], points[i], points[i + 1], out)) pos.push(...p);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      add(geo, hex, turn);
    },
    merged: () => {
      const out = mergeGeometries(parts);
      for (const g of parts) g.dispose();
      return out;
    },
  };
}

// A framed window on a wall `wall` metres out along +z (turned onto a side
// wall by `turn`): a frame 0.2 wider than the pane with 0.09 bars, a mullion
// cross and a sill. With shutters the frame's side bars sit behind them and
// are left out.
function windowTrim(k, cx, cy, wall, pane, hex, turn, shutters) {
  const outer = pane + 0.2;
  const bar = 0.09;
  const inner = outer - 2 * bar;
  const fz = wall + 0.05;
  k.box(outer, bar, 0.1, cx, cy + (outer - bar) / 2, fz, hex, { turn });
  k.box(outer, bar, 0.1, cx, cy - (outer - bar) / 2, fz, hex, { turn });
  if (shutters == null) {
    k.box(bar, inner, 0.1, cx - (outer - bar) / 2, cy, fz, hex, { turn });
    k.box(bar, inner, 0.1, cx + (outer - bar) / 2, cy, fz, hex, { turn });
  }
  k.box(0.06, inner, 0.04, cx, cy, wall + 0.085, hex, { turn });
  k.box(inner, 0.06, 0.04, cx, cy, wall + 0.085, hex, { turn });
  k.box(outer + 0.15, 0.07, 0.18, cx, cy - outer / 2 - 0.035, wall + 0.09, hex, { turn });
  if (shutters != null) {
    const rail = new THREE.Color(shutters).multiplyScalar(0.75);
    for (const s of [-1, 1]) {
      const sx = cx + s * (pane / 2 + 0.21);
      k.box(0.42, 0.95, 0.05, sx, cy, wall + 0.125, shutters, { turn });
      for (const dy of [-0.2, 0.2]) k.box(0.34, 0.06, 0.03, sx, cy + dy, wall + 0.165, rail, { turn });
    }
  }
}

// Height of the roof's top surface over local (px, pz).
function roofHeightAt(roof, px, pz) {
  if (roof === 'pyramid') return RIDGE_Y - 2 * Math.max(Math.abs(px), Math.abs(pz)) / (3.9 * Math.SQRT1_2);
  const { across } = GABLES[roof];
  return RIDGE_Y - (RIDGE_Y - EAVE_Y) * Math.abs(roof === 'frontGable' ? px : pz) / across;
}

// Gable ends (in the `gable` colour), bargeboards along every rake and one
// soffit quad closing the eaves' underside at y 2.8. Built in the canonical
// frame and turned with the roof.
function gableTrim(k, roof, gableHex, trimHex) {
  const { across: A, along: L, wallAcross: W, wallAlong: D, turn } = GABLES[roof];
  const rise = RIDGE_Y - EAVE_Y;
  const yAt = (a) => RIDGE_Y - rise * a / A;
  for (const e of [-1, 1]) {
    const z = e * D;
    k.poly([[-W, 3, z], [W, 3, z], [W, yAt(W), z], [0, RIDGE_Y, z], [-W, yAt(W), z]], [0, 0, e], gableHex, turn);
  }
  const len = Math.hypot(A, rise);
  for (const s of [-1, 1]) {
    const nx = s * rise / len, ny = A / len; // the slope's outward normal
    const drop = 0.1; // half the board's 0.18 plus 0.01 clear of the shingles
    for (const e of [-1, 1]) {
      k.box(len, 0.18, 0.06, s * A / 2 - nx * drop, (EAVE_Y + RIDGE_Y) / 2 - ny * drop, e * (L - 0.03), trimHex,
        { rz: -s * Math.atan2(rise, A), turn });
    }
  }
  k.poly([[-A, EAVE_Y, -L], [A, EAVE_Y, -L], [A, EAVE_Y, L], [-A, EAVE_Y, L]], [0, -1, 0], trimHex, turn);
}

// Everything on a dressed house that is not glass, as one vertex-coloured
// geometry. Front door face is +z (door at z 2.01-2.06); body is 5 x 3 x 4.
function houseTrimGeometry(bodyColor, look, x, z) {
  const k = pieceKit(true);
  const T = look.trim;
  const porch = look.entry === 'porch';

  // Plinth, a darker band of the body colour, 0.04 proud.
  const plinth = new THREE.Color(bodyColor).multiplyScalar(0.72);
  for (const e of [-1, 1]) {
    k.box(5.08, 0.25, 0.04, 0, 0.125, e * 2.02, plinth);
    k.box(0.04, 0.25, 4, e * 2.52, 0.125, 0, plinth);
  }
  // Corner boards, from the plinth to the eaves.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.14, 2.57, 0.14, sx * 2.46, 1.535, sz * 1.96, T);
  // Fascia under the pyramid's eaves. A gable's soffit encloses this band, so
  // gable houses skip it.
  if (look.roof === 'pyramid') {
    for (const e of [-1, 1]) {
      k.box(5.1, 0.18, 0.05, 0, 2.91, e * 2.025, T);
      k.box(0.05, 0.18, 4, e * 2.525, 2.91, 0, T);
    }
  } else {
    gableTrim(k, look.roof, look.gable, T);
  }

  // Windows: the shipped front pair (0.9 panes) and one 0.8 pane per side wall.
  for (const wx of [-1.6, 1.6]) windowTrim(k, wx, 1.8, 2, 0.9, T, 0, look.shutters);
  for (const turn of [Math.PI / 2, -Math.PI / 2]) windowTrim(k, 0, 1.8, 2.5, 0.8, T, turn, null);

  // Door: frame, brass knob, stone step, mat.
  for (const s of [-1, 1]) k.box(0.1, 1.9, 0.1, s * 0.5, 0.95, 2.05, T);
  k.box(1.1, 0.1, 0.1, 0, 1.85, 2.05, T);
  k.box(0.07, 0.07, 0.07, 0.3, 0.9, 2.095, BRASS);
  k.box(porch ? 1.9 : 1.4, 0.14, 0.6, 0, 0.07, 2.3, STEP_STONE);
  k.box(0.8, 0.03, 0.4, 0, 0.155, 2.28, DOORMAT);
  // Lantern's iron: base, cap and the arm to the wall (its pane is glass).
  k.box(0.16, 0.05, 0.16, 0.64, 1.425, 2.12, IRON);
  k.box(0.16, 0.05, 0.16, 0.64, 1.675, 2.12, IRON);
  k.box(0.06, 0.06, 0.06, 0.64, 1.6, 2.03, IRON);

  // Entry over the door.
  if (look.entry === 'flat') {
    k.box(1.4, 0.08, 0.55, 0, 2, 2.275, T);
    for (const s of [-1, 1]) k.box(0.08, 0.2, 0.35, s * 0.62, 1.86, 2.175, T);
  } else if (porch) {
    for (const s of [-1, 1]) k.box(0.12, 2.3, 0.12, s * 0.85, 1.15, 2.65, T);
    k.box(2, 0.1, 0.78, 0, 2.35, 2.39, T);
  } else {
    // 'hood': two pitched boards from eaves (+-0.7, 2.0) to a ridge at 2.3,
    // with a little gable infill under them.
    const len = Math.hypot(0.7, 0.3) + 0.06;
    for (const s of [-1, 1]) {
      const nx = s * 0.3 / Math.hypot(0.7, 0.3), ny = 0.7 / Math.hypot(0.7, 0.3);
      k.box(len, 0.06, 0.55, s * 0.35 + nx * 0.03, 2.15 + ny * 0.03, 2.275, T, { rz: -s * Math.atan2(0.3, 0.7) });
    }
    k.poly([[-0.68, 2.01, 2.53], [0.68, 2.01, 2.53], [0, 2.29, 2.53]], [0, 0, 1], T);
  }

  // Flower box under the left front window: box, leaves, 7 blooms.
  if (look.flowerBox) {
    k.box(0.95, 0.2, 0.2, -1.6, 1.08, 2.16, look.shutters ?? look.door);
    k.box(0.85, 0.08, 0.14, -1.6, 1.22, 2.2, LEAF);
    for (let i = 0; i < 7; i++) {
      k.solid(new THREE.OctahedronGeometry(0.07, 0), -1.6 + (i - 3) * 0.13, 1.3 + hash01(x + i, z, 31) * 0.05,
        2.2 + (i % 2 ? 0.03 : -0.02), FLOWERS[i % 3]);
    }
  }
  // Two terracotta pots either side of the step.
  const potX = porch ? 1.25 : 1;
  for (const s of [-1, 1]) {
    k.solid(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 8), s * potX, 0.15, 2.45, TERRACOTTA);
    k.solid(new THREE.IcosahedronGeometry(0.17, 0), s * potX, 0.36, 2.45, POT_GREEN);
  }
  // Chimney: from just under the roof at its lowest footprint corner up to a
  // cap whose top is at y 4.95.
  if (look.chimney) {
    const [cx, cz] = look.chimney;
    let bottom = Infinity;
    for (const dx of [-0.3, 0.3]) for (const dz of [-0.3, 0.3]) bottom = Math.min(bottom, roofHeightAt(look.roof, cx + dx, cz + dz));
    bottom -= 0.05;
    const top = 4.85;
    k.box(0.6, Math.max(0.1, top - bottom), 0.6, cx, (Math.min(bottom, top - 0.1) + top) / 2, cz, CHIMNEY_BRICK);
    k.box(0.75, 0.1, 0.75, cx, 4.9, cz, CHIMNEY_CAP);
  }
  return k.merged();
}

// The dressed house's extra glass, one geometry: a 0.8 pane on each side wall
// and the door lantern. Tagged window by the caller, so it glows at dusk.
function houseGlassGeometry() {
  const k = pieceKit(false);
  for (const s of [-1, 1]) k.box(0.04, 0.8, 0.8, s * 2.53, 1.8, 0, 0);
  k.box(0.14, 0.2, 0.14, 0.64, 1.55, 2.12, 0);
  return k.merged();
}

// `bodySurface` is 'siding' or 'brick', exactly as warehouse() takes it, and
// for the same reason: which one a house wants is a colour decision the caller
// has already made. The default is 'siding', because every house shipped today
// is a pale painted body (0xe8d8b0, 0xd8c8a8) and painted lap boards are what
// that colour has always been drawing.
// `look` (optional) dresses the house — see DRESSED HOUSES above. Every field
// is optional: { roof: 'pyramid' | 'frontGable' | 'sideGable', door, trim,
// shutters (hex or null), flowerBox, entry: 'hood' | 'flat' | 'porch',
// chimney: [lx, lz] or null, gable (defaults to bodyColor) }. With no look the
// house is exactly the shipped five meshes.
export function house(x, z, bodyColor = 0xe8d8b0, roofColor = 0xb05a4a, bodySurface = 'siding', look = null) {
  const L = look && { ...HOUSE_LOOK, gable: bodyColor, ...look };
  const gabled = L && L.roof !== 'pyramid';
  const g = new THREE.Group();
  // Same compensation warehouse() applies, for the same reason: the brick
  // tile's mean is 0.948, so a textured wall lands ~5% under the hex the
  // caller typed. Siding's 0.988 is inside the noise and is left alone.
  const body = surfBox(5, 3, 4, bodySurface === 'brick' ? lift(bodyColor, 1 / 0.948) : bodyColor,
    bodySurface);
  body.position.y = 1.5;
  g.add(body);
  // Roof tabs. The 4-sided cone is the one place on this pass where the
  // cylinder rule is deliberately NOT applied, and it needs its reasoning
  // written down because it looks like a contradiction.
  //
  // A trunk smears because a tiling map fights a silhouette curving away from
  // the camera. A pyramid roof does not: three's cone UVs are parametric
  // (u around the plan, v up the slope), so each of the four pitches is a flat
  // triangle carrying a properly laid-out tile, seen face-on.
  //
  // What it DOES have is taper. u spans the whole 22m eaves perimeter at the
  // bottom and nothing at all at the apex, so one repeat cannot be right
  // everywhere: the tile density doubles by mid-height and keeps going. So the
  // repeat is derived from the MID-HEIGHT perimeter (~11m) rather than the
  // eaves — right where the pitch reads largest, a little coarse at the gutter,
  // and fine enough near the peak that mipmapping resolves it to flat colour,
  // which is the correct answer up there anyway. If a reviewer decides the
  // taper is not worth it, this is one line: drop back to mat(roofColor).
  //
  // A gable look swaps ONLY the geometry (see gableRoofGeometry): same
  // material call and repeat, one mesh, so the same Math.random draws.
  const roof = new THREE.Mesh(gabled ? gableRoofGeometry(L.roof) : new THREE.ConeGeometry(3.9, 2, 4),
    surfMat(roofColor, 'shingle', 11, 4.4));
  if (!gabled) {
    roof.position.y = 4;
    roof.rotation.y = Math.PI / 4;
  }
  g.add(roof);
  // A plank door, at last literally: the plank tile is four boards across its
  // 1.0m, so a 0.9m leaf reads as four ~22cm boards running the right way up.
  const door = surfBox(0.9, 1.8, 0.1, L ? L.door : 0x7a5230, 'wood');
  door.position.set(0, 0.9, 2.01);
  g.add(door);
  for (const wx of [-1.6, 1.6]) {
    // 'glass', matching warehouse() — a pane is the one thing on a house
    // elevation that should catch a highlight, and the dusk pass replaces the
    // material outright, so the preset and the glow never fight.
    const win = surfBox(0.9, 0.9, 0.1, 0xa8d8e8, 'glass');
    win.userData.window = true;
    win.position.set(wx, 1.8, 2.01);
    g.add(win);
  }
  if (L) {
    withLocalUuids(`house:${x},${z}`, () => {
      const trim = new THREE.Mesh(houseTrimGeometry(bodyColor, L, x, z),
        litMaterial(0xffffff, { vertexColors: true, ...surfaceProps('wood') }));
      trim.name = 'houseTrim';
      g.add(trim);
      const glass = new THREE.Mesh(houseGlassGeometry(), surfNoMap(HOUSE_GLASS, 'glass'));
      glass.name = 'houseGlass';
      glass.userData.window = true;
      // flush panes and a tiny lantern: nothing worth a shadow draw
      glass.userData.noCast = true;
      g.add(glass);
    });
  }
  g.position.set(x, 0, z);
  return g;
}

// ---------------------------------------------------------------------------
// ORGANIC CANOPY (dice-fix pass). The canopies of tree() and bush() (plants.js) used to be a
// bare `IcosahedronGeometry(r, 0)` — a REGULAR icosahedron: 20 identical
// triangular faces meeting at identical dihedral angles. Nothing in nature is
// regular, so a perfectly regular convex solid reads as a manufactured object
// (a d20) no matter how many line a street — regularity, not face count, is
// the dominant cause. Raising `detail` alone does not fix this: three's
// PolyhedronGeometry switches to smoothed, sphere-radiating normals the
// moment detail > 0 (`node_modules/three/src/geometries/PolyhedronGeometry.js`
// — `detail === 0` calls `computeVertexNormals()` for flat facets, anything
// higher calls `normalizeNormals()`, which is smooth shading), so a
// higher-detail icosahedron trades a faceted die for a smooth green ball —
// losing the low-poly stylisation for nothing.
//
// The fix stays ONE mesh (draw calls are this scene's budget — see
// docs/VISUAL-PASS.md section 0 — triangles are effectively free) and buys
// irregularity three ways, layered on top of each other:
//   1. Per-vertex radial displacement, so no two facets on one canopy are the
//      same size or angle any more (attacks regularity, the dominant cause).
//   2. A second, smaller, offset lobe merged into the same geometry, so the
//      silhouette is a clump rather than one round hull (also attacks
//      regularity, and gives a clumpier read than a single blob would).
//   3. A deterministic per-tree Y rotation, non-uniform axis scale and a
//      small foliage hue shift, so no two trees on the same street are the
//      same object at the same orientation and colour (attacks uniformity
//      across instances).
// Detail is raised one notch (0 -> 1, 20 -> 80 faces per lobe) mainly so (1)
// has enough vertices to displace into a visibly irregular hull rather than a
// visibly regular one nudged slightly — that is cause (2), face size, along
// for the ride, not the headline fix.
//
// DETERMINISM — this is the multiplayer-critical part. See wind.js's
// `windPhase` for the identical concern and the identical fix, and its
// header comment for why: two co-walkers build the SAME area data from the
// SAME room seed, so the SAME (x, z) is available to both without either
// client drawing from anything shared or ordered (`walkRng`) or unshared
// (`Math.random`). `hash01` below is that same GLSL sin-hash, widened with a
// `salt` argument so one (x, z) cheaply yields several independent-looking
// numbers (lobe placement, per-vertex noise, rotation, hue) without them
// colliding. It must never be replaced with `Math.random()` or draw from
// `walkRng` — either would render a different canopy for the same tree on
// two clients, which is a desync of the visible world exactly as wind.js's
// header warns walkRng's per-frame misuse would be.
export function hash01(x, z, salt) {
  const h = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// A deterministic per-(x, z) hue/saturation/lightness nudge on a base colour.
// Real canopies are not all one green; this is nearly free (one Color per
// tree, already allocated for the material) and reads as instance variety
// the moment two trees stand side by side.
export function organicTint(hex, x, z, salt, hueDeg = 10) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  hsl.h = (hsl.h + (hash01(x, z, salt) - 0.5) * 2 * (hueDeg / 360) + 1) % 1;
  hsl.s = clamp01(hsl.s + (hash01(x, z, salt + 1) - 0.5) * 0.08);
  hsl.l = clamp01(hsl.l + (hash01(x, z, salt + 2) - 0.5) * 0.06);
  c.setHSL(hsl.h, hsl.s, hsl.l);
  return c.getHex();
}

// A smooth, LOW-FREQUENCY radial displacement field over the unit sphere,
// built from 3 arbitrary-direction sine waves (a cheap stand-in for a
// low-order spherical harmonic). Everything about the 3 waves — their axes,
// frequencies and phases — is drawn once per lobe from (x, z, salt), so the
// field itself is a pure function of the tree's position, exactly like
// windPhase().
//
// WHY NOT PER-VERTEX NOISE. An earlier version of this hashed each vertex
// independently by its index. That is high-frequency: two vertices that
// share an edge (and so sit right next to each other in space) can land on
// wildly different hash values, because non-indexed geometry gives them
// unrelated indices. The result rendered as a crumpled, shattered ball —
// technically irregular, but not organic. Hashing by the vertex's own
// DIRECTION instead (and keeping the wave frequencies to 1-2 cycles across
// the whole sphere) means spatially close vertices get near-identical
// displacement, so the surface reads as a few big lumps — an actual organic
// blob — rather than static.
function blobField(x, z, salt) {
  const axes = [];
  for (let i = 0; i < 3; i++) {
    const s = salt + i * 5;
    const theta = hash01(x, z, s + 1) * Math.PI * 2;
    const phi = hash01(x, z, s + 2) * Math.PI;
    axes.push({
      dx: Math.sin(phi) * Math.cos(theta),
      dy: Math.cos(phi),
      dz: Math.sin(phi) * Math.sin(theta),
      freq: 1 + (i % 2), // 1 or 2 full cycles across the sphere — stays low
      phase: hash01(x, z, s + 3) * Math.PI * 2,
      weight: 0.5 + 0.5 * hash01(x, z, s + 4), // 0.5-1
    });
  }
  const wsum = axes.reduce((a, b) => a + b.weight, 0);
  return (ux, uy, uz) => {
    let sum = 0;
    for (const a of axes) {
      const d = ux * a.dx + uy * a.dy + uz * a.dz; // [-1, 1]
      sum += Math.sin(d * Math.PI * a.freq + a.phase) * a.weight;
    }
    return sum / wsum; // roughly [-1, 1]
  };
}

// One irregular lobe: an icosahedron (detail 1, 80 faces, non-indexed —
// every vertex belongs to exactly one triangle) with every vertex pushed
// in/out along its own radius by blobField() above, up to +-DISPLACE of the
// lobe's radius. Normals are recomputed AFTER displacement so the facets
// stay flat-shaded (the whole point — see the block comment above) rather
// than smoothed.
const DISPLACE = 0.26; // +-26% peak, smoothly varying — see blobField()
function irregularLobe(x, z, radius, salt, detail = 1) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const field = blobField(x, z, salt);
  const pos = geo.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
    const len = Math.hypot(px, py, pz) || 1;
    const push = 1 + field(px / len, py / len, pz / len) * DISPLACE;
    pos.setXYZ(v, px * push, py * push, pz * push);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals(); // re-flatten: non-indexed, so this is per-face flat shading, not smoothing
  return geo;
}

// blobGeometry(x, z, radius, opts) — the merged, irregular canopy/bush
// geometry, built once at area-build time (never per frame) and never cached:
// every tree sits at a different (x, z), so every canopy's geometry is
// unique by construction and a geometry cache would never hit. See the
// tree()/bush() call sites in plants.js for the caching trade-off this settles.
//
// `saltBase` namespaces the hash per call site (tree vs bush) so two props
// that could in principle share an (x, z) don't also land on the same
// "random" shape by coincidence — cheap hygiene, never actually load-bearing
// in this game's placement data.
export function blobGeometry(x, z, radius, { lobes = 1, saltBase = 0 } = {}) {
  // Primary lobe carries the detail (80 faces, detail 1) since it defines
  // most of the silhouette and needs enough vertices for the displacement
  // above to read as an irregular hull rather than a regular one nudged
  // slightly. Secondary lobes stay at detail 0 (20 faces each) — they are
  // smaller, mostly hidden behind the primary lobe, and the per-vertex
  // displacement breaks their regularity just as well at 20 vertices as at
  // 80; spending 80 there too would be triangle cost with no visible return.
  const geoms = [irregularLobe(x, z, radius * 0.88, saltBase + 1, 1)];
  for (let i = 1; i < lobes; i++) {
    const s = saltBase + i * 13;
    // Smaller than the primary lobe AND offset far enough that it bulges out
    // past the primary lobe's own surface, rather than sitting mostly buried
    // inside it — a buried lobe just pokes a few stray slivers through the
    // main hull (reads as "shattered", not "clumpy"); an offset one reads as
    // a second mass of foliage stuck onto the first, which is the clump this
    // is meant to add.
    const lobeR = radius * (0.3 + 0.1 * hash01(x, z, s + 2));
    const lobe = irregularLobe(x, z, lobeR, s + 3, 0);
    const ang = hash01(x, z, s + 4) * Math.PI * 2;
    const off = radius * (0.45 + 0.15 * hash01(x, z, s + 5));
    lobe.translate(Math.cos(ang) * off, (hash01(x, z, s + 6) - 0.5) * radius * 0.35, Math.sin(ang) * off);
    geoms.push(lobe);
  }
  const merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
  if (geoms.length > 1) for (const g of geoms) g.dispose();
  // Deterministic non-uniform scale — a canopy squashed/stretched a little
  // differently per tree, on top of the per-vertex noise, so two trees never
  // read as the same object even at a distance where individual facets blur
  // together. Kept close to 1 (+-8%) so the footprint stays roughly what it
  // was (constraint: colliders/perches are fixed {x,z,r} records elsewhere).
  merged.scale(
    1 + (hash01(x, z, saltBase + 20) - 0.5) * 0.16,
    1 + (hash01(x, z, saltBase + 21) - 0.5) * 0.16,
    1 + (hash01(x, z, saltBase + 22) - 0.5) * 0.16,
  );
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------------------
// GROUND-PLANE MACRO VARIATION (VISUAL-PASS.md Wave 2.2).
// ---------------------------------------------------------------------------
// ground()/path()/sidewalk() are each still one flat colour across their
// whole span — a 120m lawn is two triangles today. Section 2 of the plan is
// explicit that the surface TEXTURES are not the problem: a tile is designed
// to resolve to its flat mean at any real viewing distance, so no amount of
// re-tuning textures.js produces a patch of lusher grass twenty metres
// across or a damp streak the length of a quay — that scale is strictly
// above what any repeating tile can ever carry. Vertex colours are the right
// tool for exactly the reason the plan gives: they multiply the material
// colour the same way `map` does (so they ride the existing pipeline for
// free), and the triangles a segmented plane costs are the one thing this
// scene has to spare (section 0: ~7,300 triangles against a DRAW-CALL
// budget; see segsFor()/wavelengthFor() below for the actual counts chosen).
//
// LOW FREQUENCY, ON PURPOSE — the 2D analogue of blobField() above, and for
// the identical reason: blobField's own header explains why hashing each
// vertex independently reads as noise rather than an organic lump, because
// neighbouring vertices (adjacent in space, unrelated in index) land on
// unrelated values. The exact same failure mode applies to a segmented
// ground plane — per-vertex hash01(x, z, salt) is famously NOT a smooth
// function of (x, z) (it's a chaotic sin-hash, that's what makes it useful
// as a hash), so sampling it once per vertex would paint a ground plane that
// looks like television static, not like patches of grass. macroField()
// below sums 3 broad plane waves instead. Their direction, wavelength and
// phase are each drawn ONCE from `salt` (i.e. hash01 is only ever called
// with fixed (0, 0) coordinates to pick the wave's constants — it never sees
// a vertex position), and then the resulting smooth wave is evaluated at
// each vertex's own (x, z). Two vertices a few centimetres apart necessarily
// get nearly the same value, because they're evaluating the same smooth
// wave at nearly the same point — which is what makes this read as a patch
// instead of dirt.
//
// DETERMINISM — the same multiplayer concern as the canopy code above and
// wind.js's windPhase, restated because it applies just as hard here: two
// co-walkers build the SAME area from the SAME builder calls, so the ground/
// path/sidewalk each client draws must be byte-identical. Everything below
// is a pure function of (x, z, salt) via hash01 — never Math.random, never
// walkRng.
//
// LUMINANCE — textures.js holds every map texel at or above FLOOR_LUM (0.87)
// by darkening a white canvas and never lightening it. "The same reasoning
// applies" (this wave's brief, quoting the plan) does NOT mean "the same
// number": colour map and vertex colour multiply together, and stacking two
// independent 0.87 floors gives a worst-case COMBINED texel of 0.87 x 0.87 =
// 0.757 — visibly muddy, the exact failure this file's discipline exists to
// prevent. Two choices avoid that instead of assuming it away:
//
//   1. Vertex colour is darken-only from WHITE (1, 1, 1), exactly like a map
//      painter, and patchT() below is shaped so most of a plane's vertices
//      sit at t = 0 — i.e. AT white, a true no-op — with the chosen tint
//      only reached at the (rarer) peak of a patch. The "hint" is the patch;
//      the rest of the plane is unmodified, same as a map's white ground.
//   2. Each surface's peak tint (GROUND_TREATMENTS[*].tint) is sized against
//      that SURFACE'S OWN measured map MEAN from textures.js's header table
//      — the number that governs a whole patch's worth of pixels — not its
//      single worst texel, which mipmapping resolves away at any distance
//      this game actually renders a lawn or a quay from. At the very peak of
//      a patch, darkest channel x that surface's map mean:
//        grass    0.90 x 0.988 = 0.889     sand    0.91 x 0.969 = 0.882
//        cobble/  0.92 x 0.954 = 0.878     gravel  0.91 x 0.961 = 0.874
//         wetStone
//        no map (den floor)    1.00 x 0.90 = 0.900
//      Every surface clears 0.87 at its worst point, with a small margin —
//      tight enough that this reads as a hint layered on a hint, not a
//      second independent paint job undoing the first mechanism's work.
function macroField(x, z, salt, wavelength) {
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < 3; i++) {
    const s = salt + i * 9;
    const theta = hash01(0, 0, s + 1) * Math.PI * 2; // wave direction, fixed per wave
    const wl = wavelength * (0.7 + 0.6 * hash01(0, 0, s + 2)); // +-30%, so 3 waves don't beat into a visible grid
    const phase = hash01(0, 0, s + 3) * Math.PI * 2;
    const weight = 0.5 + 0.5 * hash01(0, 0, s + 4); // 0.5-1
    const d = x * Math.cos(theta) + z * Math.sin(theta);
    sum += Math.sin((d / wl) * Math.PI * 2 + phase) * weight;
  }
  return sum; // weights sum to at most 3, so this is not normalised to [-1,1] — patchT() below owns the shaping and it doesn't need a tight bound.
}

// Remaps macroField()'s output (roughly in [-2, 2], per the 3 waves' weights)
// to a 0..1 "patch strength": 0 across most of the domain, rising to 1 only
// near the field's own peaks. This is what makes the result read as
// "occasional patches" rather than a 50/50 wash — see the luminance note
// above, which depends on most vertices landing at t = 0.
//
// The denominator was widened from an initial 0.8 to 1.5 after measuring the
// actual result at this pass's segment spacing (SEG_METRES = 2.5): at 0.8 the
// steepest zero-crossings could carry a vertex from t=0 to t=1 across one
// 2.5m segment (max per-segment |dt| ~0.9-1.0, sampled over a 120m grid),
// which reads as a hard-edged cutout rather than a patch. At 1.5 the same
// sweep tops out around 0.5-0.6 per segment — still a real edge (patches, like
// real damp streaks, DO have a defined boundary) but one that ramps across
// more than a single triangle rather than snapping.
function patchT(field) {
  return clamp01((field - 0.5) / 1.5);
}

// One segment per this many world metres — enough that a wavelength of even
// a few multiples of it (the shortest this pass ever asks for, ~4m on a
// stubby path) still gets several segments to curve across, while a 120m
// lawn doesn't pay for triangles nothing will ever resolve (mipmapping-style
// reasoning applied to geometry instead of texels: past a certain density,
// more segments changes nothing a camera can see). See VISUAL-PASS.md
// section 0 — triangles are the free resource here, but "free" isn't
// "infinite", and this is the number that keeps a 140m Seaside plane and an
// 18m den floor both comfortably inside "changes nothing that matters".
const SEG_METRES = 2.5;
function segsFor(extent, min = 8, max = 64) {
  return Math.max(min, Math.min(max, Math.round(extent / SEG_METRES)));
}

// A patch wavelength sized to the CALLER's own extent, not one constant for
// every mesh — the plan explicitly flags this: ground() spans 120m+ where
// path()/sidewalk() span a few metres to a few tens of metres, and "patches
// on the scale of metres to tens of metres" means something different at
// each scale. `patches` (from GROUND_TREATMENTS) is how many wavelengths
// should fit across `extent`; floored at 4m so a short path segment doesn't
// get a wavelength so small it reads as noise rather than a streak.
function wavelengthFor(extent, patches) {
  return Math.max(4, extent / patches);
}

// Per-surface character (constraint: "grass, sand, wet stone, cobble and the
// den's floorboards should not all get the same treatment" — damp streaks on
// stone and lush patches on a lawn are different phenomena). `tint` is the
// vertex colour AT THE PEAK of a patch (patchT() == 1); everywhere else it
// lerps toward white, i.e. no change — see the luminance note above for why
// each tuple is sized the way it is. `patches` sets the wavelength via
// wavelengthFor() above.
const GROUND_TREATMENTS = {
  // Drier (the plain lawn colour, unshifted) vs lusher patches: greener and
  // a shade darker. Kept the gentlest of the tinted surfaces on purpose —
  // grass is the single biggest surface in the game and already carries a
  // 4.5% texture-mean compensation (see ground()'s own comment); stacking a
  // heavy vertex tint on top of that compensation would just re-introduce
  // the washed-out lawn that compensation exists to fix.
  grass: { patches: 4, tint: [0.90, 0.95, 0.90] },
  // Wind-drift on Seaside's sand: packed/damp streaks read a shade darker
  // and a hair cooler than the dry sand around them, not a hue change.
  sand: { patches: 5, tint: [0.94, 0.93, 0.91] },
  // Damp streaks on the Docks' stone — deliberately the strongest of the six
  // tints. This is the one macro effect the plan calls out by name, and
  // wetStone already has the most headroom for it: its own preset exists
  // specifically to read as "just rained on" (roughness dropped to 0.55 —
  // see materials.js), so a cooler, darker streak on top is the same idea
  // carried from the light response into the colour.
  wetStone: { patches: 6, tint: [0.92, 0.94, 0.96] },
  // The Docks' dry paths/sidewalks over the same cobble map, no dampness
  // implied — closer to neutral than wetStone's tint.
  cobble: { patches: 6, tint: [0.92, 0.92, 0.93] },
  // Packed-earth/gravel paths and lanes.
  gravel: { patches: 5, tint: [0.92, 0.91, 0.91] },
  // The Docks' quays and pavements (Stream 4 round two): dry weathered stone,
  // the same neutral streak as dry cobble, so a quay and the cobbles beside it
  // weather alike and differ only in their slabs and their sheen.
  flagstone: { patches: 5, tint: [0.92, 0.92, 0.93] },
  // Fallback for a ground/path/sidewalk with no `surface` at all — today
  // that's only the den's indoor floor, which is deliberately map-less (see
  // ground()'s own call site comment: floorSeams() already draws real board
  // geometry, and a tiled plank grain on top would be two rhythms fighting).
  // A warm/cool timber drift, not a hue shift — just enough that two boards
  // don't read as the identical plank.
  default: { patches: 3, tint: [0.94, 0.92, 0.90] },
};

// Writes low-frequency vertex colours onto a ground/path/sidewalk mesh.
//
// MUST be called after `mesh.rotation.*` and `mesh.position` are set (ground/
// path/sidewalk all do their rotation and positioning before calling this) —
// it reads the mesh's own matrix so each vertex's field input is its real
// WORLD (x, z), the same coordinate space hash01 is documented against
// everywhere else in this file, not the plane's local pre-rotation (x, y).
//
// This is also what puts `vertexColors: true` on the material: litMaterial()
// forwards unrecognised `extra` keys straight to MeshStandardMaterial in
// both its surfaced and un-surfaced branches (see materials.js), so nothing
// there needed to change — it just needed a geometry `color` attribute and
// this flag, both of which are set here, once, after the material already
// exists.
function applyMacroVariation(mesh, surface, extent) {
  const treatment = GROUND_TREATMENTS[surface] ?? GROUND_TREATMENTS.default;
  const wavelength = wavelengthFor(extent, treatment.patches);
  const salt = macroSalt(surface);
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  mesh.updateMatrix();
  const v = new THREE.Vector3();
  const [tr, tg, tb] = treatment.tint;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
    const t = patchT(macroField(v.x, v.z, salt, wavelength));
    colors[i * 3 + 0] = 1 + (tr - 1) * t;
    colors[i * 3 + 1] = 1 + (tg - 1) * t;
    colors[i * 3 + 2] = 1 + (tb - 1) * t;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  mesh.material.vertexColors = true;
}

// A small deterministic mix so different surfaces don't all draw the same
// three wave directions/phases — pure bookkeeping, NOT part of the
// determinism guarantee (that's macroField/hash01 themselves, which are
// already a pure function of world (x, z) and need no help from this).
function macroSalt(surface) {
  const name = String(surface ?? 'default');
  let s = 0;
  for (let i = 0; i < name.length; i++) s = (s * 31 + name.charCodeAt(i)) % 99991;
  return s;
}

// =============================================================================
// THE HORIZON BAND (VISUAL-PASS.md Wave 4.3).
// =============================================================================
// The ground plane ends in a dead-straight line. Stand anywhere on the open
// lawn and look out and the world is two flat fields — green below, blue above
// — meeting at a ruled edge; stand at the corner of `bounds` and the plane's
// two edges converge to a literal point, which is the "the map ends here" read
// in its purest form. Nothing else in this pass shows up in a wide shot, and
// this is the only thing in it that does.
//
// WHAT THIS IS NOT. It is not terrain. The plan is explicit and it is right:
// displacing the ground plane collides with the collider system (2D circles at
// y=0), with spawn placement, with spots.js's clearSpot and with water
// clearance — a systems change wearing a visual change's clothes. Everything
// below sits BEYOND every area's `bounds`, carries no collider, no perch, no
// POI and no record of any kind, and is never walked on, climbed, hidden
// behind or collided with. It is scenery in the strictest sense: an area file
// adds it to the scene and returns nothing about it.
//
// ONE MESH PER AREA. The band is a single merged geometry — ~3,000 triangles,
// one draw call — because meshes are this scene's budget and triangles are
// not (section 0). It is deliberately NOT split into per-side meshes for
// frustum culling: four meshes would cull three of four, saving three draw
// calls' worth of *triangles* nobody is counting, at the cost of four
// bounding-sphere tests and four calls in the frame where you can see two
// sides at once. One mesh is one call, always, which is also the easiest
// number to hold anyone to.
//
// IT IS NOT A CONTACT-SHADOW CANDIDATE, and this was verified rather than
// assumed. render/contactshadows.js's scanFootprints() walks the scene's
// TOP-LEVEL children and qualifies() rejects anything whose larger horizontal
// span exceeds MAX_SPAN (6.5m). The narrowest band this file builds is 224m
// across. It is excluded by a factor of 34, by the same clause that already
// excludes every building — and a test pins it, because "obviously excluded"
// is exactly the kind of claim that stops being true when someone changes a
// constant.
//
// DETERMINISM. Every number below comes from hash01 — the same GLSL sin-hash
// the canopies, the ground macro variation and render/wind.js's windPhase all
// use, and for the identical multiplayer reason spelled out in the ORGANIC
// CANOPY block: two co-walkers build the same area from the same seed and must
// draw the same hills. No Math.random, no walkRng. The skyline's blocks hash
// off their index rather than off a world position, which is the same
// guarantee by a shorter route — the index is a loop counter, identical on
// both clients, and the position is derived FROM it.
// -----------------------------------------------------------------------------
// THE THREE NUMBERS THAT DECIDE WHETHER THIS WORKS, and they are all about
// where the band sits relative to things that already exist:
//
//   INNER, the ring's inner half-size, is set a few metres INSIDE the ground
//   plane's own edge and the surface there is sunk to BAND_SINK (3cm) below
//   y=0. That buries the seam under an opaque plane rather than butting two
//   surfaces edge to edge, which is the difference between "the land carries
//   on" and "a second sheet of paper was slid under the first". 3cm is chosen
//   against the depth buffer, not by eye: the overlap only extends to the
//   plane's edge, the furthest any point of it can be from inside `bounds` is
//   ~120m, and at 120m with a 0.1m near plane the 24-bit depth resolution is
//   ~9mm — so 30mm still separates cleanly, while being small enough that the
//   step where the plane ends is under two pixels at the closest a player can
//   get to it.
//
//   FLAT, how far out the surface stays sunk before it starts to rise. This is
//   the one that keeps a hill from becoming a wall. Every area's `bounds` come
//   within a few metres of its ground plane's edge — the neighbourhood's cat
//   can stand at 55 on a plane that ends at 60 — so ground is NOT the thing
//   that sets the distance to the nearest hill; FLAT is. At the default the
//   land does not begin to lift until ~10m past the inner rim and does not
//   reach full height for ~25m more, which puts the nearest crest ~35m from
//   the furthest a player can walk. A 7m hill at 35m subtends 6.5 degrees:
//   a low ridge, which is what was ordered, rather than a cliff.
//
//   TAPER, how far the OUTER rim falls back down. Without it the band's outer
//   edge is a hard line against the sky and the whole ring reads as a raised
//   tray. Dropping the last stretch back to 30% height guarantees the outer
//   rim is always hidden BEHIND the crests in front of it from any eye height
//   a cat camera reaches: the crest at ~90m and 7m tall sits ~2.0 degrees
//   above horizontal, the tapered rim at ~118m and 2.1m tall sits ~0.4 degrees
//   BELOW it. The silhouette against the sky is the ridge, which is the point.
//
// The band lives entirely inside the fog (`applySky` sets Fog(horizon, 40,
// 130)) and that is doing most of the art direction: from the middle of an
// area the crests are 55-70% faded into the horizon colour, which is what
// makes them read as distance rather than as a green fence.
// =============================================================================
const BAND_SINK = 0.03;
// The band at the water (see `shore` in horizonBand): how far from a footprint
// the hills take to come down to it, where past the water they rise again (as
// fractions of the band's span), and the height under which a wet cell is
// left out because the water drawn over it hides it anyway (water is at 0.03).
const SHORE_RAMP = 12;
const CLOSE_FROM = 0.4;
const CLOSE_TO = 0.65;
const DROP_AT = 0.02;
// Within this many metres of a `keepLow` zone the band rises back from the
// waterline to its usual height.
const KEEP_LOW_RAMP = 4;
// A `shoreLip` (see horizonBand): how high its flat stretch stands over the
// band's sunk zero (just above the 0.03 waterline), how far in front of
// CLOSE_FROM it climbs out of the water, and over how much height above the
// lip its colour fades back into the hills'.
const LIP_H = 0.3;
const LIP_RISE = 2;
const LIP_FADE = 1.2;

// The unit square's perimeter at parameter u in [0, 1): four sides, corner to
// corner. A SQUARE ring rather than a circular one, because every area's
// ground plane and every area's `bounds` are squares — a circular band would
// come 22% closer at the sides than at the corners and there is no reason to
// pay for that asymmetry.
function squarePoint(u) {
  const s = Math.floor(u * 4) % 4;
  const f = u * 4 - Math.floor(u * 4);
  if (s === 0) return [1, -1 + 2 * f];
  if (s === 1) return [1 - 2 * f, 1];
  if (s === 2) return [-1, 1 - 2 * f];
  return [-1 + 2 * f, -1];
}

export function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
}

// Bigger areas: the ring round a RECTANGLE instead of the square. `rect` is
// { cx, cz, ex, ez }: the rectangle's centre and how much longer than the
// square each half-side is. A point `s` out along squarePoint (px, pz) lands
// at (cx + px * (s + ex), cz + pz * (s + ez)), so the corners stay mitred and
// the long sides are stretched evenly. With no rect every caller keeps its
// own px * s arithmetic, untouched.
const rectAt = (rect, px, pz, s) => [rect.cx + px * (s + rect.ex), rect.cz + pz * (s + rect.ez)];
// How far out (x, z) is, in the square's own measure (the `s` above).
const rectOut = (rect, x, z) => Math.max(Math.abs(x - rect.cx) - rect.ex, Math.abs(z - rect.cz) - rect.ez);
// The same point as the square ring would have it, for the side tints.
function rectSquare(rect, x, z) {
  const s = Math.max(rectOut(rect, x, z), 1e-6);
  return [((x - rect.cx) / (s + rect.ex)) * s, ((z - rect.cz) / (s + rect.ez)) * s];
}

// Distance from (x, z) to a capsule's spine: the segment (x1, z1)-(x2, z2),
// or the point (x1, z1) when x2/z2 are left out.
function segmentDist(x, z, { x1, z1, x2 = x1, z2 = z1 }) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? clamp01(((x - x1) * dx + (z - z1) * dz) / len2) : 0;
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
}

// Skyline facade tones, as multipliers on the band's own colour (so an area's
// palette still decides the overall value; these only vary hue and value a
// little between buildings). Kept within about +-18%: the far bank is seen
// through 60-110m of fog, and anything stronger turns a hazy town into a
// patchwork of coloured boxes.
const SKYLINE_PLAIN = [1, 1, 1];
const SKYLINE_TONES = [
  SKYLINE_PLAIN,
  [1.18, 0.94, 0.86], // brick
  [1.12, 1.05, 0.88], // ochre render
  [0.9, 0.95, 1.06], // slate
  [0.84, 0.85, 0.9], // soot-dark
];
// Window glass, darker and a touch blue: daylight windows read darker than
// the wall around them, which is the whole cue that a box is a building.
const SKYLINE_WINDOW = [0.6, 0.66, 0.78];

// Adds a grid of window quads to `out`, on the block's local -z face (the face
// that looks back at the area once horizonBand rotates the block to its yaw),
// in the block's own local frame, centred on the block like the BoxGeometry.
// Floors every 2.6m, bays every 2.4m, a few windows left out per block by hash
// so no two buildings share a pattern. Each window is one 2-triangle quad, so
// a full 52-block skyline adds roughly a thousand triangles and no draw calls.
function addSkylineWindows(out, bw, bh, bd, k, salt) {
  const floors = Math.floor((bh - 1.6) / 2.6);
  const bays = Math.floor((bw - 1.4) / 2.4);
  if (floors < 1 || bays < 1) return;
  const x0 = -((bays - 1) * 2.4) / 2;
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < bays; c++) {
      if (hash01(k * 31 + f, c, salt + 11) < 0.14) continue;
      const w = new THREE.PlaneGeometry(1.1, 1.3);
      w.rotateY(Math.PI);
      w.translate(x0 + c * 2.4, -bh / 2 + 1.5 + f * 2.6, -bd / 2 - 0.04);
      out.push(w);
    }
  }
}

// Side tints. The ring is a square, so "which side is a point on" is whichever
// axis it is furthest along, and "how far along that side" is the other
// coordinate over the first. Within CORNER_BLEND of a side's length from a
// corner the neighbouring side's colour mixes in by smoothstep, reaching an
// even mix at the corner itself, so two sides with different tints meet
// without a seam. Returns a THREE.Color in the working (linear) space, which is
// what a vertex colour wants; sideTint() is the same rule as a hex.
const CORNER_BLEND = 0.15;
const tintScratch = new THREE.Color();
function sideTintColor(x, z, tints) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  let side;
  let adjacent;
  let along;
  if (ax >= az) {
    side = x >= 0 ? tints.east : tints.west;
    along = ax > 0 ? z / ax : 0;
    adjacent = along >= 0 ? tints.south : tints.north;
  } else {
    side = z >= 0 ? tints.south : tints.north;
    along = az > 0 ? x / az : 0;
    adjacent = along >= 0 ? tints.east : tints.west;
  }
  // A side's length is 2 in these units, so 15% of it is 0.3 from the corner.
  const mix = 0.5 * smoothstep(1 - 2 * CORNER_BLEND, 1, Math.abs(along));
  const c = new THREE.Color(side);
  if (mix > 0) c.lerp(tintScratch.set(adjacent), mix);
  return c;
}

export function sideTint(x, z, tints) {
  return sideTintColor(x, z, tints).getHex();
}

// Where `count` rooftop blocks go on the perimeter arc u in [from, to): the
// same hash01 draws the skyline kind uses, so a rooftop row looks like the
// Docks' far bank. Pure, so a test can check the placement without a mesh.
// The outer half of the band only, for the reason given in horizonBand.
// What a band's `rooftops` add to its salt, so their blocks are salted apart
// from the skyline kind's: rooftopSpots(rooftops, inner, outer, salt +
// ROOFTOP_SALT) are the spots horizonBand draws them at (wet ones skipped).
export const ROOFTOP_SALT = 100;
export function rooftopSpots({ from, to, count }, inner, outer, salt) {
  const span = outer - inner;
  const spots = [];
  for (let k = 0; k < count; k++) {
    const u = from + (to - from) * ((k + 0.15 + 0.7 * hash01(k, 0, salt + 1)) / count);
    const [px, pz] = squarePoint(u);
    const s = inner + (0.50 + 0.44 * hash01(k, 1, salt + 2)) * span;
    spots.push({ x: px * s, z: pz * s, yaw: Math.atan2(px, pz) });
  }
  return spots;
}

// One skyline block (a box, its window quads and maybe a roof feature) in the
// band's local frame, pushed onto `parts` with its tone and, when the band has
// side tints, the tint its position falls under. Shared by the skyline kind and
// by `rooftops` so the two cannot drift apart.
//
// `pitched` (rooftops only; the skyline kind leaves it off and is unchanged):
// the walls take the side tint warmed toward cream, and a terracotta prism
// roof is added, its colour not multiplied by any tint. `tint` must then be a
// Color (the band's own colour when it has no side tints).
const ROOF_TERRACOTTA = [0xb5533c, 0xa04a36, 0x8e4a3a].map((h) => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
});
const WALL_CREAM = new THREE.Color(0xe6d6bc);
const WHITE_TINT = new THREE.Color(1, 1, 1);

// A triangular prism over a bw x bd footprint, ridge (along local x) `rise`
// above its base at y = 0, indexed with position/normal/uv like a Box.
function roofPrism(bw, bd, rise) {
  const hw = bw / 2;
  const hd = bd / 2;
  const pos = [
    -hw, 0, -hd, hw, 0, -hd, // 0,1 back eave
    -hw, 0, hd, hw, 0, hd, // 2,3 front eave
    -hw, rise, 0, hw, rise, 0, // 4,5 ridge
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([
    2, 3, 5, 2, 5, 4, // front slope
    1, 0, 4, 1, 4, 5, // back slope
    0, 2, 4, // gable -x
    3, 1, 5, // gable +x
  ]);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2));
  return g;
}

function addRoofBlock(parts, tones, bases, { k, x, z, yaw, base, bh, salt, tint, pitched = false }) {
  const before = parts.length;
  const wallTint = pitched ? tint.clone().lerp(WALL_CREAM, 0.55) : tint;
  const bw = 6 + 13 * hash01(k, 2, salt + 3);
  const bd = 5 + 11 * hash01(k, 3, salt + 4);
  const g = new THREE.BoxGeometry(bw, bh, bd);
  // Stream 4 round two: each block gets its own facade tone and a grid of
  // windows on the face that looks back at the area, both carried as
  // vertex colours on the SAME merged mesh — still one draw call. Before
  // this the far bank was 52 identical grey boxes, the flattest thing on
  // screen right behind the cat at the Docks' spawn.
  const tone = SKYLINE_TONES[Math.floor(hash01(k, 9, salt + 10) * SKYLINE_TONES.length)];
  const facade = [g];
  addSkylineWindows(facade, bw, bh, bd, k, salt);
  for (const f of facade) {
    f.rotateY(yaw);
    f.translate(x, base + bh / 2, z);
    parts.push(f);
    tones.push(f === g ? tone : SKYLINE_WINDOW);
    if (pitched) bases.push(f === g ? wallTint : tint);
  }
  // A roof feature on the taller half, because a skyline with a level top
  // edge is a wall. Chimneys and tanks are what break a real one.
  if (hash01(k, 5, salt + 6) > 0.45) {
    const cw = 1.2 + 2.4 * hash01(k, 6, salt + 7);
    const ch = 1.5 + 3.5 * hash01(k, 7, salt + 8);
    const cx2 = (hash01(k, 8, salt + 9) - 0.5) * bw * 0.5;
    const c = new THREE.BoxGeometry(cw, ch, cw);
    c.rotateY(yaw);
    c.translate(x + Math.cos(yaw) * cx2, base + bh + ch / 2, z - Math.sin(yaw) * cx2);
    parts.push(c);
    tones.push(tone);
    if (pitched) bases.push(wallTint);
  }
  if (pitched) {
    const rt = ROOF_TERRACOTTA[Math.floor(hash01(k, 10, salt + 11) * ROOF_TERRACOTTA.length)];
    const roof = withLocalUuids(`band-roofs-${salt}`, () => roofPrism(bw, bd, 0.35 * bd));
    roof.rotateY(yaw);
    roof.translate(x, base + bh, z);
    parts.push(roof);
    tones.push(rt);
    bases.push(WHITE_TINT);
    return;
  }
  for (let i = before; i < parts.length; i++) bases.push(tint);
}

// rooftops.style 'houses' (polish-places): the Woods' Twolegplace as small
// cottages sunk behind the crest, rather than skyline blocks. The blocks were
// up to 19 x 16 m and 7 m tall on a 6 m wall of hill, windowless at that
// distance, and from the Woods' spawn they filled the top of the screen.
// Each cottage is 5-8.5 m by 4-6.5 m, its walls `height` x 0.75-1.1, sunk
// 55% of that into the band (so from the area it is mostly roof over the
// crest), with a terracotta pitched roof (rise 0.45 of its depth), 1-3 small
// windows and a door on the face turned toward the area, and sometimes a
// short chimney. Same arc, spots and tints as the blocks. Made under the
// caller's withLocalUuids, so it moves no area's Math.random draw count.
const HOUSE_WINDOW = [0.16, 0.17, 0.21];
const HOUSE_DOOR = [0.3, 0.19, 0.12];
const HOUSE_SINK = 0.55;
// Lit windows at dusk: a second, slightly smaller quad (leaving a dark frame) just in front of most
// windows (and always the first), collected apart from the band's own
// geometry so the dusk look can reveal them as one hidden mesh.
const HOUSE_LIGHT = 0xffd27a;
function addHouse(parts, tones, bases, { k, x, z, yaw, surface, height, salt, tint }, lit = null) {
  const bw = 5 + 3.5 * hash01(k, 2, salt + 3);
  const bd = 4 + 2.5 * hash01(k, 3, salt + 4);
  const wh = height * (0.75 + 0.35 * hash01(k, 4, salt + 5));
  const rise = 0.45 * bd;
  const base = surface - HOUSE_SINK * wh;
  const wallTint = tint.clone().lerp(WALL_CREAM, 0.7);
  const tone = SKYLINE_TONES[Math.floor(hash01(k, 9, salt + 10) * 3)];
  const place = (g, tn, tt, y) => {
    g.rotateY(yaw);
    g.translate(x, y, z);
    parts.push(g);
    tones.push(tn);
    bases.push(tt);
  };
  // The walls: a box without its buried bottom face.
  place(dropBottom(new THREE.BoxGeometry(bw, wh, bd)), tone, wallTint, base + wh / 2);
  // The face toward the area is local -z (yaw turns +z outward). A door at
  // one end of it, then 1-3 windows spread along the rest, all up in the
  // part of the wall that shows over the crest.
  const front = -bd / 2 - 0.06;
  const doorAt = (hash01(k, 12, salt + 13) < 0.5 ? -1 : 1) * (bw / 2 - 1.1);
  const door = new THREE.PlaneGeometry(0.9, 1.7);
  door.rotateY(Math.PI);
  door.translate(doorAt, wh / 2 - 0.3 - 0.85, front);
  place(door, HOUSE_DOOR, WHITE_TINT, base + wh / 2);
  // The windows share out the stretch of wall from the far corner to the door.
  const sd = Math.sign(doorAt);
  const from = -sd * (bw / 2 - 0.6);
  const to = doorAt - sd * 0.9;
  const nWin = Math.max(1, Math.min(1 + Math.floor(hash01(k, 13, salt + 14) * 2.999), Math.floor(Math.abs(to - from) / 1.1)));
  for (let i = 0; i < nWin; i++) {
    const w = new THREE.PlaneGeometry(0.7, 0.8);
    w.rotateY(Math.PI);
    w.translate(from + (to - from) * (i + 0.5) / nWin, wh / 2 - 0.7, front);
    place(w, HOUSE_WINDOW, WHITE_TINT, base + wh / 2);
    if (lit && (i === 0 || hash01(k, 20 + i, salt + 21) >= 0.2)) {
      const l = new THREE.PlaneGeometry(0.62, 0.72);
      l.rotateY(Math.PI);
      l.translate(from + (to - from) * (i + 0.5) / nWin, wh / 2 - 0.7, front - 0.04);
      l.rotateY(yaw);
      l.translate(x, base + wh / 2, z);
      lit.push(l);
    }
  }
  // The roof, with a little eave over the front and back walls.
  const rt = ROOF_TERRACOTTA[Math.floor(hash01(k, 10, salt + 11) * ROOF_TERRACOTTA.length)];
  place(roofPrism(bw + 0.2, bd + 0.4, rise), rt, WHITE_TINT, base + wh);
  // A short chimney on some, its top under the ridge + 0.4 m.
  if (hash01(k, 5, salt + 6) > 0.5) {
    const cx2 = (hash01(k, 8, salt + 9) - 0.5) * bw * 0.6;
    const ch = 0.6 * rise + 0.4;
    const c = new THREE.BoxGeometry(0.55, ch, 0.55);
    c.translate(cx2, 0, bd * 0.15);
    place(c, tone, wallTint, base + wh + 0.4 * rise + ch / 2);
  }
}

// =============================================================================
// THE GROUND'S EDGE (polish "edges"). Turning round at a spawn used to show the
// lawn stopping at a hard line, a flat pale strip (the band's sunk FLAT
// stretch, in the band's muted colour), then hills. Two band options fix it:
// `nearColor` paints that strip the lawn's own colour, and `edge` sets a low
// ring of dressing straddling the ground plane's edge — clipped hedges, scrub,
// reeds, a dry-stone wall, dark pine scrub — with a sparse row of trees well
// outside it. Every variation is hash01 so two co-walkers see the same hedge.
//
// The dressing is its OWN mesh, 'horizonEdge', a child of the band (round 2:
// merged into the band it put 4,800-6,300 triangles into a shadow caster and
// pushed four areas over their triangle ceilings, which stay where the iPhone
// measurement put them). One more draw call per green area, no shadow pass
// (userData.noCast), vertex-coloured and flat-shaded like the band, and dusk
// tints it with the band (userData.duskTint, render/dusk.js). Its pieces are
// hand-built low-poly solids (a mound is 10 triangles, a reed blade 1, a wall
// block 14, a tree 18-26). A style may limit its ring to arcs of the
// perimeter (`arcs`); none does now (the River's and the Moor's ran only along
// the arc behind the spawn until polish-places freed room for the whole ring).
//
// The heights are set by the camera, not by taste: the main camera can stand
// up to 11m behind the cat at 6.5m up, and every area's bounds come within 5m
// of the ground's edge, so anything near the edge stays under 1.6m (the camera
// looks over it, never into it) and the trees stand at least 12m past the edge.
// Every piece stands on the band's own surface under it, sunk EDGE_SINK into
// it (the lowest point under its footprint), so nothing floats on a slope.
// =============================================================================
const freezeDeep = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freezeDeep(v);
  return Object.freeze(o);
};
// Per style: the palette and the sizes its pieces are drawn from. `max` is the
// tallest any near piece may reach; `crowns` colour the far tree row, `tree`
// is its shape ('oak', 'round' or 'pine'). `arcs` [[u0, u1], ...] limits the
// near ring to those arcs of the perimeter (squarePoint's u: 0-0.25 the +x
// side running toward +z, 0.25-0.5 the +z side running toward -x, ...);
// omitted, it runs all the way round. `trees: false` leaves the far row out;
// `treeSkip` is the share of the row's spots left empty (TREE_SKIP when
// omitted), and a round tree's `treeShape` { trunk: [min, range], r: [min,
// range], ry, lean } sets its trunk height, crown radius, crown height (as a
// share of the radius) and how far the crown is blown downwind (+x, the
// moor's westerly), omitted: the Woods' bushy low round tree.
// `jitter` is how far a piece wanders in and out of the line (EDGE_JITTER
// when omitted): a wall is laid straighter than a hedge grows.
export const EDGE_STYLES = freezeDeep({
  hedge: {
    step: 2.2, greens: [0x3f7a3a, 0x4d8a42], len: 2.4, depth: 1.0, hMin: 1.0, hMax: 1.3, lift: 0.12,
    gate: 0x8a6a48, gateH: 1.1, crowns: [0x4f7f3e, 0x5a8a46, 0x48743a], trunk: 0x5e4632, tree: 'oak', max: 1.6,
  },
  // polish-hedgesky: the scrub's two greens are blended along the run (no
  // more pale yellow-olive third), and it is laid straighter.
  scrub: {
    step: 2.9, greens: [0x4d7b3d, 0x5a8a45], rMin: 0.7, rMax: 1.1, hMin: 0.6, hMax: 0.9, jitter: 0.25,
    crowns: [0x4a7a3c, 0x557f40, 0x5f8a46], trunk: 0x5e4632, tree: 'round', max: 1.4,
  },
  reeds: {
    step: 2.9, greens: [0x8a9a5a, 0x9aa868, 0x7f9a56, 0xa7a86a], blades: 12, wMin: 0.16, wMax: 0.3, hMin: 0.7, hMax: 1.25,
    // The far row: low round marsh trees (alder, willow), half the spots
    // empty, under 3.6m.
    crowns: [0x6f8a4e, 0x7a9256, 0x66804a], trunk: 0x5a4a38, tree: 'round', max: 1.3, treeSkip: 0.5,
    treeShape: { trunk: [0.8, 0.3], r: [1.3, 0.6], ry: 0.72, lean: 0 },
  },
  wall: {
    step: 2.2, greys: [0x7f7b73, 0x938f86, 0x726f69], cap: 0xaba79c, hMin: 0.7, hMax: 0.9, jitter: 0.08,
    gorse: 0x5a6630, bloom: 0xd8b84a, rMin: 0.6, rMax: 0.85, gorseH: 0.6,
    // The far row: lone wind-bent hawthorns, two spots in three empty, each a
    // leaning trunk under a squat crown blown east, under 3.5m.
    crowns: [0x5a6a3a, 0x64703e, 0x545f36], trunk: 0x4a3c30, tree: 'round', max: 1.2, treeSkip: 0.65,
    treeShape: { trunk: [1.2, 0.4], r: [1.0, 0.4], ry: 0.7, lean: 0.6 },
  },
  pinescrub: {
    step: 2.9, greens: [0x2f4a34, 0x3a5a3c], rMin: 0.6, rMax: 1.0, hMin: 0.6, hMax: 0.95, jitter: 0.25,
    sapling: { r: 0.6, h: 1.5, sides: 5 }, crowns: [0x2a4430, 0x34503a, 0x2f4a36], trunk: 0x4a3a2c,
    tree: 'pine', max: 1.6,
  },
  // The Seaside's backing dunes (polish-places): marram tufts (single-triangle
  // blades fanned from one root, pale sea-green and straw), every third spot
  // a pair of weathered grey sand-fence posts with a sagging rope between,
  // and the area's own `props` (beach huts, a lifeguard chair) past the edge.
  dune: {
    step: 3.2, greens: [0x8fa47c, 0x9db287, 0xaab68a, 0xc2b680, 0xb7a873], blades: 7, tufts: 3,
    wMin: 0.1, wMax: 0.18, hMin: 0.45, hMax: 0.95,
    post: [0x8c877e, 0x9d978c, 0x7d796f], postH: 1.0, rope: 0xb09a78,
    huts: [[0xf2a7b5, 0xd9707f], [0x9fdcc0, 0x5fae8c], [0x9cc8ec, 0x5c8fc2], [0xf3dc7a, 0xd8a842], [0xc4b0e6, 0x8f78c0]],
    trim: 0xf6f2ea, chair: 0xf2efe8, chairRed: 0xd8463c,
    max: 1.1, trees: false,
  },
});
// An edge style by name; an unknown one is a typo in an area file, and a
// silent fallback would ship an undressed band, so it throws.
function edgeStyle(style) {
  const S = EDGE_STYLES[style];
  if (!S) throw new Error(`horizonBand edge: unknown style '${style}' (one of ${Object.keys(EDGE_STYLES).join(', ')})`);
  return S;
}

// The near ring: just outside the ground's edge, a piece every style `step`
// (EDGE_STEP when a style has none) along it, jittered in and out. A piece is
// skipped this close to water (its centre).
const EDGE_OUT = 0.6;
const EDGE_STEP = 2.2;
const EDGE_JITTER = 0.4;
const EDGE_DRY = 1.5;
// What no vertex of a piece may come closer to water than.
const EDGE_VERTEX_DRY = 1.0;
// How far a piece's base is sunk below the lowest band surface under it.
const EDGE_SINK = 0.08;
// The far tree row: 12-18m past the edge, one every ~9m, 40% left out.
const TREE_FROM = 12;
const TREE_TO = 18;
const TREE_STEP = 9;
const TREE_SKIP = 0.4;
const EDGE_SALT = 200;

// The perimeter side squarePoint(u) is on, as the yaw that runs a piece's
// local x along it: the east and west sides run along z.
function sideYaw(u) {
  const s = Math.floor(u * 4) % 4;
  return s === 0 || s === 2 ? Math.PI / 2 : 0;
}

// Is perimeter parameter u on one of `arcs` (none given: everywhere)?
const onArcs = (arcs, u) => !arcs || arcs.some(([a, b]) => u >= a && u <= b);

/**
 * edgeSpots(edge, salt, avoid) — where horizonBand's `edge` puts its pieces,
 * as [{ x, z, yaw, kind, u }]: 'piece' (or the style's variant, 'gorse' for
 * the wall, 'sapling' for the pine scrub and 'post' for the dunes), 'corner',
 * 'gate' (hedges only, one per gap, with the gap's `r`), the edge's own
 * `props` ({ x, z, yaw, kind: 'hut' | 'chair' }, `u` null) and 'tree' (the
 * far row). `u` is the spot's
 * perimeter parameter (see EDGE_STYLES' `arcs`). Pure, so a test can check
 * placement without a mesh. A spot within EDGE_DRY of water in `avoid`, inside
 * a gap disc or off the style's arcs is left out (a gate is the gap's own).
 */
export function edgeSpots({ half, style, gaps = [], props = [], rect = null }, salt = 0, avoid = []) {
  const S = edgeStyle(style);
  const st = salt + EDGE_SALT;
  const spots = [];
  const inGap = (x, z) => gaps.some((g) => Math.hypot(x - g.x, z - g.z) < g.r);
  const dry = (x, z) => waterClearance(avoid, x, z) >= EDGE_DRY;
  if (rect) return edgeSpotsRect({ half, style, rect }, S, st, dry);
  const s0 = half + EDGE_OUT;
  const perSide = Math.max(1, Math.round((2 * s0) / (S.step ?? EDGE_STEP)));
  const n = 4 * perSide;
  const jitter = S.jitter ?? EDGE_JITTER;
  for (let k = 0; k < n; k++) {
    const u = k / n;
    if (!onArcs(S.arcs, u)) continue;
    const [px, pz] = squarePoint(u);
    const s = s0 + (hash01(k, 1, st) * 2 - 1) * jitter;
    const x = px * s;
    const z = pz * s;
    if (!dry(x, z) || inGap(x, z)) continue;
    const yaw = sideYaw(u) + (hash01(k, 2, st) - 0.5) * 0.1;
    let kind = 'piece';
    if (k % perSide === 0) kind = 'corner';
    else if (style === 'wall' && k % 3 === 0) kind = 'gorse';
    else if (style === 'pinescrub' && k % 4 === 0) kind = 'sapling';
    else if (style === 'dune' && k % 3 === 0) kind = 'post';
    spots.push({ x, z, yaw, kind, u });
  }
  // An area's own props (the Seaside's huts and lifeguard chair), where it
  // put them, with the yaw it gave; dropped like any piece when wet.
  for (const p of props) {
    if (!dry(p.x, p.z)) continue;
    spots.push({ x: p.x, z: p.z, yaw: p.yaw ?? 0, kind: p.kind, u: null });
  }
  if (style === 'hedge') {
    for (const g of gaps) {
      if (!dry(g.x, g.z)) continue;
      spots.push({ x: g.x, z: g.z, yaw: Math.abs(g.x) >= Math.abs(g.z) ? Math.PI / 2 : 0, kind: 'gate', r: g.r, u: null });
    }
  }
  if (S.trees === false) return spots;
  const tMid = half + (TREE_FROM + TREE_TO) / 2;
  const m = 4 * Math.max(1, Math.round((2 * tMid) / TREE_STEP));
  for (let k = 0; k < m; k++) {
    if (hash01(k, 3, st) < (S.treeSkip ?? TREE_SKIP)) continue;
    const u = (k + 0.2 + 0.6 * hash01(k, 4, st)) / m;
    if (Array.isArray(S.trees) && !onArcs(S.trees, u)) continue;
    const [px, pz] = squarePoint(u);
    const s = half + TREE_FROM + (TREE_TO - TREE_FROM) * hash01(k, 5, st);
    const x = px * s;
    const z = pz * s;
    if (!dry(x, z) || inGap(x, z)) continue;
    spots.push({ x, z, yaw: hash01(k, 6, st) * Math.PI * 2, kind: 'tree', u });
  }
  return spots;
}

// Bigger areas: edgeSpots round a rectangle (`rect`, see rectAt). Each side
// gets its own count, so the pieces keep the style's spacing on a long side.
// Each spot carries (ox, oz), the way out of the ground, since "whichever axis
// it is furthest along" no longer says. No gaps, gates, props or arcs so far
// (the River, the Pines and the Moor have none); a style with `arcs` throws
// rather than draw the wrong thing. The wall keeps its gorse, as the square's.
const SIDE_OUT = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function edgeSpotsRect({ half, style, rect }, S, st, dry) {
  if (S.arcs || Array.isArray(S.trees)) throw new Error('horizonBand edge: a rect edge does not support arcs yet');
  const spots = [];
  const sideLen = (i, s) => 2 * (s + (i % 2 === 0 ? rect.ez : rect.ex));
  const ring = (s, step) => [0, 1, 2, 3].map((i) => Math.max(1, Math.round(sideLen(i, s) / step)));
  const s0 = half + EDGE_OUT;
  const jitter = S.jitter ?? EDGE_JITTER;
  let k = 0;
  ring(s0, S.step ?? EDGE_STEP).forEach((count, side) => {
    for (let j = 0; j < count; j++, k++) {
      const u = (side + j / count) / 4;
      const [px, pz] = squarePoint(u);
      const [x, z] = rectAt(rect, px, pz, s0 + (hash01(k, 1, st) * 2 - 1) * jitter);
      if (!dry(x, z)) continue;
      const yaw = sideYaw(u) + (hash01(k, 2, st) - 0.5) * 0.1;
      const [ox, oz] = SIDE_OUT[side];
      // as the square edge: a corner first, then the wall's gorse every
      // third piece (k counts all the way round, as the square's does)
      let kind = 'piece';
      if (j === 0) kind = 'corner';
      else if (style === 'wall' && k % 3 === 0) kind = 'gorse';
      spots.push({ x, z, yaw, kind, u, ox, oz });
    }
  });
  if (S.trees === false) return spots;
  const tMid = half + (TREE_FROM + TREE_TO) / 2;
  k = 0;
  ring(tMid, TREE_STEP).forEach((count, side) => {
    for (let j = 0; j < count; j++, k++) {
      if (hash01(k, 3, st) < (S.treeSkip ?? TREE_SKIP)) continue;
      const u = (side + (j + 0.2 + 0.6 * hash01(k, 4, st)) / count) / 4;
      const [px, pz] = squarePoint(u);
      const [x, z] = rectAt(rect, px, pz, half + TREE_FROM + (TREE_TO - TREE_FROM) * hash01(k, 5, st));
      if (!dry(x, z)) continue;
      const [ox, oz] = SIDE_OUT[side];
      spots.push({ x, z, yaw: hash01(k, 6, st) * Math.PI * 2, kind: 'tree', u, ox, oz });
    }
  });
  return spots;
}

// A geometry's vertex colours from fn(vertexIndex, x, y, z) -> THREE.Color.
function paintGeo(g, fn) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let v = 0; v < p.count; v++) {
    const col = fn(v, p.getX(v), p.getY(v), p.getZ(v));
    c[v * 3] = col.r;
    c[v * 3 + 1] = col.g;
    c[v * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// A hex nudged in lightness by f (1 = as is), as a linear THREE.Color.
function shade(hex, f) {
  return new THREE.Color(hex).multiplyScalar(f);
}

// The edge mesh merges non-indexed position + colour only (normals are
// computed once on the merged geometry; flat shading needs no uv).
function edgePart(g) {
  let out = g;
  if (g.index) {
    out = g.toNonIndexed();
    g.dispose();
  }
  out.deleteAttribute('normal');
  out.deleteAttribute('uv');
  out.clearGroups();
  return out;
}

// A list of triangles [[a, b, c], ...] (points [x, y, z]) as a non-indexed
// geometry, coloured per face by faceColor(faceIndex). Each face is wound to
// face away from `centre`, so a hand-built convex clump never shows a back
// face whichever order its corners were listed in.
function facetGeo(tris, faceColor, centre) {
  const pos = new Float32Array(tris.length * 9);
  const col = new Float32Array(tris.length * 9);
  tris.forEach(([a, b, c], f) => {
    const ux = b[0] - a[0]; const uy = b[1] - a[1]; const uz = b[2] - a[2];
    const vx = c[0] - a[0]; const vy = c[1] - a[1]; const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const ox = (a[0] + b[0] + c[0]) / 3 - centre[0];
    const oy = (a[1] + b[1] + c[1]) / 3 - centre[1];
    const oz = (a[2] + b[2] + c[2]) / 3 - centre[2];
    const [p, q, r] = nx * ox + ny * oy + nz * oz < 0 ? [a, c, b] : [a, b, c];
    pos.set([...p, ...q, ...r], f * 9);
    const k = faceColor(f);
    for (let i = 0; i < 3; i++) col.set([k.r, k.g, k.b], f * 9 + i * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// A ring of n points at height y, radius r, starting at angle a0, each radius
// nudged by `wob` (a hash per point, so the outline is not a regular polygon).
function ringPts(n, r, y, a0, wob = () => 1) {
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * Math.PI * 2;
    const rr = r * wob(i);
    return [Math.cos(a) * rr, y, Math.sin(a) * rr];
  });
}

// A low mound (scrub, gorse): a hexagon at the ground narrowing to a lifted
// triangle on top — 9 side faces and a top, 10 triangles (an icosahedron
// dome was 15). Its base is at local y 0, which place() sinks into the band.
// h(i) is the piece's own hash.
function mound(r, ht, faceColor, h) {
  const base = ringPts(6, r, 0, h(0) * Math.PI, (i) => 0.85 + 0.3 * h(1 + i));
  // polish-shrubs: the top ring narrower (0.6r -> 0.5r) and lower, under a
  // lifted crown point (below), so the outline is a dome, not a cut prism
  const top = ringPts(3, 0.5 * r, 0, h(0) * Math.PI + 0.3, () => 1)
    .map((p, j) => [p[0] + (h(7) - 0.5) * 0.2 * r, ht * (0.66 + 0.16 * h(8 + j)), p[2] + (h(11) - 0.5) * 0.2 * r]);
  const tris = [];
  for (let j = 0; j < 3; j++) {
    const b0 = base[2 * j];
    const b1 = base[2 * j + 1];
    const b2 = base[(2 * j + 2) % 6];
    tris.push([b0, b1, top[j]], [b1, b2, top[(j + 1) % 3]], [b1, top[(j + 1) % 3], top[j]]);
  }
  // polish-shrubs: the flat top triangle becomes three round a crown point
  // at the mound's full height, so its top domes instead of reading as a cut
  // prism (+2 triangles a mound).
  const cy = ht * (0.97 + 0.06 * h(12));
  const c = [(top[0][0] + top[1][0] + top[2][0]) / 3, cy, (top[0][2] + top[1][2] + top[2][2]) / 3];
  tris.push([top[0], top[1], c], [top[1], top[2], c], [top[2], top[0], c]);
  return facetGeo(tris, faceColor, [0, ht * 0.3, 0]);
}

// An open cone (a sapling, a pine's tier): n side faces, its
// apex leaning by (lx, lz). Base ring at local y `y0`.
function cone(r, ht, n, faceColor, { y0 = 0, lx = 0, lz = 0, a0 = 0 } = {}) {
  const base = ringPts(n, r, y0, a0);
  const apex = [lx, y0 + ht, lz];
  const tris = base.map((p, i) => [p, base[(i + 1) % n], apex]);
  return facetGeo(tris, faceColor, [0, y0 + ht * 0.25, 0]);
}

// A closed tree crown centred on local (0, cy, 0): a pentagon bottom point,
// two staggered pentagon rings and a top point — 20 triangles (the round-1
// crown was two icosahedra, 35).
function crown(r, ry, cy, faceColor, h) {
  const lo = ringPts(5, 0.85 * r, cy - 0.3 * ry, h(0) * 2, (i) => 0.9 + 0.2 * h(1 + i));
  const hi = ringPts(5, 0.9 * r, cy + 0.25 * ry, h(0) * 2 + Math.PI / 5, (i) => 0.9 + 0.2 * h(6 + i));
  const bottom = [0, cy - 0.85 * ry, 0];
  const topP = [(h(11) - 0.5) * 0.3 * r, cy + ry, (h(12) - 0.5) * 0.3 * r];
  const tris = [];
  for (let i = 0; i < 5; i++) {
    const i1 = (i + 1) % 5;
    tris.push([lo[i], lo[i1], bottom], [lo[i], lo[i1], hi[i]], [lo[i1], hi[i1], hi[i]], [hi[i], hi[i1], topP]);
  }
  return facetGeo(tris, faceColor, [0, cy, 0]);
}

// A trunk: an open three-sided prism from below the ground to `top`.
function trunk(r, top, col) {
  const lo = ringPts(3, r, -0.3, 0.4);
  const hi = ringPts(3, r * 0.7, top, 0.4);
  const tris = [];
  for (let i = 0; i < 3; i++) {
    const i1 = (i + 1) % 3;
    tris.push([lo[i], lo[i1], hi[i]], [lo[i1], hi[i1], hi[i]]);
  }
  return facetGeo(tris, () => col, [0, top / 2, 0]);
}

// One dry-stone block along local x, length L, depth d0 at the foot battered
// to d1 at the top: each end its own height (hMid +- 0.1) and each top
// corner nudged +- 0.04 more (hashes), so a run of blocks has a ragged,
// stepped top; a course line across each face
// (at a hashed height, sloping a little) splits it into two courses in two
// greys, with paler capstones on top. 14 triangles: two courses a side, the
// top, the two ends (no bottom).
function wallBlock(L, d0, d1, hMid, greyLo, greyHi, cap, h) {
  const corner = (e, q) => {
    const i = (e > 0 ? 2 : 0) + (q > 0 ? 1 : 0);
    const b = [e * L / 2, 0, q * d0 / 2];
    const t = [e * L / 2, hMid + (h(e > 0 ? 18 : 19) - 0.5) * 0.2 + (h(i) - 0.5) * 0.08, q * d1 / 2 + (h(4 + i) - 0.5) * 0.06];
    const s = 0.4 + 0.2 * h(e > 0 ? 8 : 9);
    const m = [b[0] + (t[0] - b[0]) * s, b[1] + (t[1] - b[1]) * s, b[2] + (t[2] - b[2]) * s];
    return { b, t, m };
  };
  const c = { '-1-1': corner(-1, -1), '-11': corner(-1, 1), '1-1': corner(1, -1), '11': corner(1, 1) };
  const C = (e, q) => c[`${e}${q}`];
  const tris = [];
  const tone = [];
  const quad = (a, b, cc, d, t) => {
    tris.push([a, b, cc], [a, cc, d]);
    tone.push(t, t);
  };
  for (const q of [-1, 1]) {
    quad(C(-1, q).b, C(1, q).b, C(1, q).m, C(-1, q).m, 0);
    quad(C(-1, q).m, C(1, q).m, C(1, q).t, C(-1, q).t, 1);
  }
  quad(C(-1, -1).t, C(1, -1).t, C(1, 1).t, C(-1, 1).t, 2);
  for (const e of [-1, 1]) quad(C(e, -1).b, C(e, 1).b, C(e, 1).t, C(e, -1).t, 0);
  const greys = [greyLo, greyHi, cap];
  return facetGeo(tris, (f) => shade(greys[tone[f]], 0.9 + 0.16 * h(12 + (f % 6))), [0, hMid / 2, 0]);
}

// A square beam of width w from point a to point b (local [x, y, z]), its
// four sides and a cap at b (the foot end is sunk or out of sight): 10
// triangles in one colour, wound out from its own middle.
function beam(a, b, w, col, { capA = false } = {}) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const up = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(d, up).normalize().multiplyScalar(w / 2);
  const v = new THREE.Vector3().crossVectors(d, u).normalize().multiplyScalar(w / 2);
  const ring = (p) => [[1, 1], [-1, 1], [-1, -1], [1, -1]]
    .map(([i, j]) => [p[0] + u.x * i + v.x * j, p[1] + u.y * i + v.y * j, p[2] + u.z * i + v.z * j]);
  const A = ring(a);
  const B = ring(b);
  const tris = [];
  for (let i = 0; i < 4; i++) {
    const i1 = (i + 1) % 4;
    tris.push([A[i], A[i1], B[i1]], [A[i], B[i1], B[i]]);
  }
  tris.push([B[0], B[1], B[2]], [B[0], B[2], B[3]]);
  if (capA) tris.push([A[0], A[1], A[2]], [A[0], A[2], A[3]]);
  return facetGeo(tris, () => col, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
}

// A closed box (12 triangles) centred on c with sizes s, coloured per face by
// faceColor(f).
function slab(c, s, faceColor) {
  const P = (i, j, k) => [c[0] + i * s[0] / 2, c[1] + j * s[1] / 2, c[2] + k * s[2] / 2];
  const tris = [];
  const quad = (a, b2, c2, d) => tris.push([a, b2, c2], [a, c2, d]);
  for (const e of [-1, 1]) {
    quad(P(e, -1, -1), P(e, 1, -1), P(e, 1, 1), P(e, -1, 1));
    quad(P(-1, e, -1), P(1, e, -1), P(1, e, 1), P(-1, e, 1));
    quad(P(-1, -1, e), P(1, -1, e), P(1, 1, e), P(-1, 1, e));
  }
  return facetGeo(tris, faceColor, c);
}

// A beach hut (the Seaside's dune edge), front door facing local +z: walls
// in vertical stripes of its pastel and white, a pastel door, white gables
// and a pitched roof in the deeper pastel, a timber step at the door.
// 2.2m wide, 1.9m deep, 2.6m to the ridge. ~58 triangles, as two parts.
function beachHut([pastel, deep], trim, h) {
  const W = 2.2;
  const D = 1.9;
  const Hw = 1.85;
  const ridge = 2.58;
  const o = 0.14;
  const tris = [];
  const cols = [];
  const quad = (a, b2, c2, d, col) => {
    tris.push([a, b2, c2], [a, c2, d]);
    cols.push(col, col);
  };
  const tone = (col, j) => shade(col, 0.94 + 0.1 * h(50 + j));
  // Stripes across a wall from p0 to p1 (bottom corners), n strips.
  const stripes = (p0, p1, n, j) => {
    for (let i = 0; i < n; i++) {
      const a = i / n;
      const b2 = (i + 1) / n;
      const lerp = (t) => [p0[0] + (p1[0] - p0[0]) * t, 0, p0[2] + (p1[2] - p0[2]) * t];
      const l = lerp(a);
      const r = lerp(b2);
      quad(l, r, [r[0], Hw, r[2]], [l[0], Hw, l[2]], tone(i % 2 ? trim : pastel, j));
    }
  };
  stripes([-W / 2, 0, D / 2], [W / 2, 0, D / 2], 5, 0);
  stripes([W / 2, 0, D / 2], [W / 2, 0, -D / 2], 4, 1);
  stripes([W / 2, 0, -D / 2], [-W / 2, 0, -D / 2], 4, 2);
  stripes([-W / 2, 0, -D / 2], [-W / 2, 0, D / 2], 4, 3);
  // The door, just proud of the front stripes.
  const dz = D / 2 + 0.015;
  quad([-0.34, 0.05, dz], [0.34, 0.05, dz], [0.34, 1.5, dz], [-0.34, 1.5, dz], tone(deep, 4));
  for (const e of [-1, 1]) {
    tris.push([[-W / 2, Hw, e * D / 2], [W / 2, Hw, e * D / 2], [0, ridge, e * D / 2]]);
    cols.push(tone(trim, 5));
  }
  for (const s of [-1, 1]) {
    quad([s * (W / 2 + o), Hw - 0.1, -(D / 2 + o)], [s * (W / 2 + o), Hw - 0.1, D / 2 + o],
      [0, ridge + 0.04, D / 2 + o], [0, ridge + 0.04, -(D / 2 + o)], tone(deep, 6 + (s > 0 ? 1 : 0)));
  }
  const hut = facetGeo(tris, (f) => cols[f], [0, Hw * 0.55, 0]);
  const wood = shade(0x9a7a55, 0.92 + 0.12 * h(58));
  const step = slab([0, 0.06, D / 2 + 0.24], [1.0, 0.16, 0.44], () => wood);
  return [hut, step];
}

// A lifeguard chair (the Seaside's dune edge), facing local +z: four white
// splayed legs with two ladder rungs at the front, a white platform, a red
// seat back and a red sun canopy on two posts. 2.5m tall. ~112 triangles.
function lifeguardChair(white, red, h) {
  const w = (j) => shade(white, 0.94 + 0.08 * h(60 + j));
  const r = (j) => shade(red, 0.92 + 0.1 * h(66 + j));
  const parts = [];
  const legAt = (sx, sz, y) => {
    const t = (y + 0.2) / 1.75;
    return [sx * (0.78 - 0.26 * t), y, sz * (0.68 - 0.22 * t)];
  };
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(beam(legAt(sx, sz, -0.2), legAt(sx, sz, 1.55), 0.1, w(sx + sz + 2)));
  }
  for (const y of [0.5, 1.02]) parts.push(beam(legAt(-1, 1, y), legAt(1, 1, y), 0.07, w(5), { capA: true }));
  parts.push(slab([0, 1.6, 0], [1.2, 0.09, 1.08], () => w(0)));
  parts.push(slab([0, 1.98, -0.46], [1.04, 0.68, 0.07], () => r(0)));
  for (const sx of [-1, 1]) parts.push(beam([sx * 0.5, 1.6, -0.52], [sx * 0.5, 2.42, -0.52], 0.06, w(1)));
  // The canopy tips down toward the front a little, its top red, its
  // underside and rim white.
  const can = slab([0, 2.46, -0.2], [1.3, 0.06, 1.15], (f) => (f === 8 || f === 9 ? r(1) : w(2)));
  can.rotateX(0.1);
  parts.push(can);
  return parts;
}

// A box standing on the ground never shows its underside: leave its bottom
// face out (BoxGeometry's groups run +x, -x, +y, -y, +z, -z).
function dropBottom(g) {
  const bottom = g.groups[3];
  const idx = Array.from(g.index.array).filter((_, i) => i < bottom.start || i >= bottom.start + bottom.count);
  g.setIndex(idx);
  g.clearGroups();
  return g;
}

// Builds the edge's pieces (see edgeSpots) into `out`, a list of non-indexed
// geometries in world space, each already vertex-coloured. `groundAt(x, z)`
// is the band's own surface height there: every piece is seated on the
// lowest of it under its footprint, sunk EDGE_SINK.
// polish-shrubs: how far the hedge's and the mounds' normals are rounded, and
// the foot's share of the top's light (vertex colour, darker toward the
// ground). The walls, trees, reeds and saplings stay flat-faceted.
const HEDGE_SOFT = 0.6;
const HEDGE_CROWN = 0.72; // the top's share of the foot's depth
const MOUND_SOFT = 0.75;
const EDGE_FOOT = 0.68;
// polish-hedgesky: the hedge and scrub runs read as one mass, not a picket
// row of humps. Their height and green follow a slow noise along the
// perimeter (edgeNoise, a knot every HEDGE_KNOT pieces) rather than a roll
// per piece; scrub mounds are stretched MOUND_STRETCH along the edge so
// neighbours overlap (the valley between two is shallow), and about one
// piece in EDGE_LUMP_EVERY lifts one mound EDGE_LUMP_H taller and rounder,
// a bush standing out of the scrub.
const HEDGE_KNOT = 4;
const HEDGE_SLOW = 0.75; // the slow noise's share of a piece's height
const MOUND_STRETCH = 1.6;
const EDGE_LUMP_EVERY = 5.5;
const EDGE_LUMP_H = 1.3;
// A wrap-around value noise in [0, 1] on perimeter parameter u in [0, 1):
// `knots` knots round the ring, smoothstepped between.
function edgeNoise(u, knots, seed) {
  const f = (((u % 1) + 1) % 1) * knots;
  const i = Math.floor(f);
  const t = smoothstep(0, 1, f - i);
  return hash01(i % knots, 5, seed) * (1 - t) + hash01((i + 1) % knots, 5, seed) * t;
}
function footLit(g, ht) {
  const p = g.attributes.position, c = g.attributes.color;
  for (let v = 0; v < p.count; v++) {
    const k = EDGE_FOOT + (1.1 - EDGE_FOOT) * smoothstep(0, ht, p.getY(v));
    c.setXYZ(v, c.getX(v) * k, c.getY(v) * k, c.getZ(v) * k);
  }
}
function buildEdge(out, edge, salt, avoid, groundAt) {
  const S = edgeStyle(edge.style);
  const st = salt + EDGE_SALT;
  const gaps = edge.gaps ?? [];
  const spots = edgeSpots(edge, salt, avoid);
  const isGreen = (c) => c.g > c.r * 1.2;
  const seat = (x, z, r) => Math.min(groundAt(x, z), groundAt(x + r, z), groundAt(x - r, z),
    groundAt(x, z + r), groundAt(x, z - r)) - EDGE_SINK;
  // Places a local-frame geometry at a spot, seated on the band under it
  // (`r` its footprint radius), and keeps it only if it is dry and, unless
  // it is the gate, has no green vertex inside a gap.
  //
  // polish-shrubs: each piece now carries its own normals, flat (one per
  // facet, exactly what flatShading drew) unless `soft` is given, when they
  // are pulled toward the piece's own round (softenFoliageNormals about
  // soft.c in the piece's frame): a hedge's clipped top and a scrub mound
  // read as leafy masses instead of green prisms. The mesh then shades from
  // these normals (see edgeMesh).
  const place = (g0, x, z, yaw, r, { gate = false, soft = null } = {}) => {
    const g = edgePart(g0);
    g.computeVertexNormals(); // non-indexed: flat
    if (soft) softenFoliageNormals(g, soft.s, soft.r, soft.c);
    g.rotateY(yaw);
    g.translate(x, seat(x, z, r), z);
    const p = g.attributes.position;
    const c = g.attributes.color;
    for (let v = 0; v < p.count; v++) {
      const vx = p.getX(v);
      const vz = p.getZ(v);
      if (avoid.length && waterClearance(avoid, vx, vz) < EDGE_VERTEX_DRY) return g.dispose();
      if (!gate && gaps.length && isGreen({ r: c.getX(v), g: c.getY(v) })
        && gaps.some((gp) => Math.hypot(vx - gp.x, vz - gp.z) < gp.r)) return g.dispose();
    }
    out.push(g);
  };
  const pick = (list, hv) => list[Math.min(list.length - 1, Math.floor(hv * list.length))];
  let hutCount = 0;
  // polish-hedgesky: the slow noises along the run (see edgeNoise).
  const knots = Math.max(8, Math.round((8 * (edge.half + EDGE_OUT)) / ((S.step ?? EDGE_STEP) * HEDGE_KNOT)));
  const slowH = (u) => edgeNoise(u ?? 0, knots, st + 31);
  const slowC = (u) => edgeNoise(u ?? 0, Math.max(6, Math.round(knots * 0.6)), st + 37);

  spots.forEach((sp, k) => {
    const { x, z, yaw, kind } = sp;
    const h = (i) => hash01(x, z, st + 10 + i);
    // The tangent along the ground's edge and the outward normal, in world xz.
    const tx = Math.cos(yaw);
    const tz = -Math.sin(yaw);
    const ox = sp.ox ?? (Math.abs(x) >= Math.abs(z) ? Math.sign(x) : 0);
    const oz = sp.oz ?? (Math.abs(x) >= Math.abs(z) ? 0 : Math.sign(z));
    const at = (t, nOut) => [x + tx * t + ox * nOut, z + tz * t + oz * nOut];

    if (kind === 'tree') {
      const crownCol = pick(S.crowns, h(0));
      const faces = (salt2) => (f) => shade(crownCol, 0.86 + 0.24 * hash01(f, k, st + salt2));
      const hh = (i) => h(30 + i);
      if (S.tree === 'pine') {
        // A conifer: a short trunk and two stacked open cones, top under 5.5m.
        const r = 1.2 + 0.5 * h(3);
        const tall = 4.2 + 1.2 * h(4);
        const g = trunk(0.18, 1.4, shade(S.trunk, 0.9 + 0.2 * h(2)));
        place(g, x, z, yaw, r);
        place(cone(r, tall * 0.6, 6, faces(1), { y0: 0.8, a0: h(5) }), x, z, yaw, r);
        place(cone(r * 0.7, tall * 0.5, 6, faces(2), { y0: 0.8 + tall * 0.42, a0: h(6) + 0.5 }), x, z, yaw, r);
        return;
      }
      // A round tree: a trunk and one crown, top under 5m. The hedge's oaks
      // stand taller on their trunks; the Woods' trees are bushier and low.
      const oak = S.tree === 'oak';
      const TS = S.treeShape;
      if (TS) {
        // A style's own round tree (the River's marsh trees, the Moor's
        // hawthorns): its crown pushed `lean` downwind (+x in the world, so
        // the whole row bends one way) and the trunk's top leaning after it.
        const trunkH = TS.trunk[0] + TS.trunk[1] * h(1);
        const r = TS.r[0] + TS.r[1] * h(3);
        const ry = TS.ry * r;
        const lx = TS.lean * Math.cos(yaw);
        const lz = TS.lean * Math.sin(yaw);
        const tg = trunk(0.2, trunkH + 0.3 * ry, shade(S.trunk, 0.9 + 0.2 * h(2)));
        const tp = tg.attributes.position;
        for (let v = 0; v < tp.count; v++) {
          const f = Math.max(0, tp.getY(v)) / (trunkH + 0.3 * ry);
          tp.setXYZ(v, tp.getX(v) + 0.6 * lx * f, tp.getY(v), tp.getZ(v) + 0.6 * lz * f);
        }
        place(tg, x, z, yaw, r);
        place(crown(r, ry, trunkH + 0.85 * ry, faces(1), hh).translate(lx, 0, lz), x, z, yaw, r);
        return;
      }
      const trunkH = oak ? 1.8 + 0.6 * h(1) : 1.0 + 0.4 * h(1);
      const r = oak ? Math.min(1.6 + 0.5 * h(3), (5 - trunkH) / 1.5) : 1.6 + 0.8 * h(3);
      const ry = Math.min(0.85 * r, (5 - trunkH) / 1.85);
      place(trunk(oak ? 0.28 : 0.24, trunkH + 0.3 * ry, shade(S.trunk ?? 0x5e4632, 0.9 + 0.2 * h(2))), x, z, yaw, r);
      place(crown(r, ry, trunkH + 0.85 * ry, faces(1), hh), x, z, yaw, r);
      return;
    }

    if (kind === 'gate') {
      // A five-bar field gate in two leaves across the gap, posts at the ends
      // and in the middle, the whole of it gateH (1.1m) tall at most. Brown,
      // so it reads as wood and not hedge.
      const span = 2 * sp.r;
      const wood = (i) => shade(S.gate, 0.88 + 0.22 * hash01(i, k, st + 3));
      // Not seated like the rest (the gate stands on the flat stretch), but
      // held to the same per-vertex water clearance.
      const put = (g) => {
        const gx = edgePart(g);
        gx.computeVertexNormals(); // flat, like every piece (see place)
        gx.rotateY(yaw);
        gx.translate(x, -BAND_SINK, z);
        const p = gx.attributes.position;
        if (avoid.length) {
          for (let v = 0; v < p.count; v++) {
            if (waterClearance(avoid, p.getX(v), p.getZ(v)) < EDGE_VERTEX_DRY) return gx.dispose();
          }
        }
        out.push(gx);
      };
      const post = (t, i) => {
        const g = new THREE.BoxGeometry(0.16, S.gateH, 0.16);
        g.translate(t, S.gateH / 2, 0);
        paintGeo(g, () => wood(i));
        put(g);
      };
      post(-span / 2 + 0.08, 0);
      post(0, 1);
      post(span / 2 - 0.08, 2);
      const leaf = span / 2 - 0.16;
      for (const side of [-1, 1]) {
        const cxl = side * (span / 4);
        for (let i = 0; i < 5; i++) {
          const rail = new THREE.BoxGeometry(leaf, 0.07, 0.05);
          rail.translate(cxl, 0.22 + i * 0.2, 0);
          paintGeo(rail, () => wood(3 + i));
          put(rail);
        }
        const rise = 0.8;
        const brace = new THREE.BoxGeometry(Math.hypot(leaf, rise), 0.07, 0.05);
        brace.rotateZ(side * Math.atan2(rise, leaf));
        brace.translate(cxl, 0.62, 0.03);
        paintGeo(brace, () => wood(9));
        put(brace);
      }
      return;
    }

    if (kind === 'hut' || kind === 'chair') {
      // The area's own props, each all-or-nothing (one geometry, so the
      // per-vertex water check keeps or drops the whole of it). Huts take
      // the style's pastel pairs in turn, so a row never repeats a colour.
      const parts = kind === 'hut'
        ? beachHut(S.huts[(hutCount++) % S.huts.length], S.trim, h)
        : lifeguardChair(S.chair, S.chairRed, h);
      const g = mergeGeometries(parts, false);
      for (const p of parts) p.dispose();
      place(g, x, z, yaw, kind === 'hut' ? 1.2 : 0.9);
      return;
    }

    if (edge.style === 'dune') {
      // Marram: S.tufts tufts a piece (one more at a corner, one fewer at a
      // post), each S.blades single-triangle blades fanned out from one root
      // and arching away from it, every blade wound to face in toward the
      // area like the reeds'. A 'post' spot also gets two weathered grey
      // sand-fence posts with a rope sagging between them.
      const nT = kind === 'corner' ? S.tufts + 1 : kind === 'post' ? S.tufts - 1 : S.tufts;
      const tris = [];
      const tones = [];
      for (let q = 0; q < nT; q++) {
        const hq = (j) => h(30 + 40 * q + j);
        const tc = nT === 1 ? (hq(0) - 0.5) * 1.2 : ((q + 0.5) / nT - 0.5) * S.step + (hq(0) - 0.5) * 0.6;
        const [cx, cz] = at(tc, (hq(1) - 0.5) * 1.0);
        const tall = 0.8 + 0.4 * hq(2);
        const tone = pick(S.greens, hq(3));
        for (let i = 0; i < S.blades; i++) {
          const hb = (j) => hq(4 + 5 * i + j);
          // Around the root, mostly across the line (a blade turned edge-on
          // to the camera vanishes), leaning out from the root.
          const ang = ((i + 0.5) / S.blades - 0.5) * Math.PI * 1.1 + (hb(0) - 0.5) * 0.3;
          const dx = tx * Math.sin(ang) - ox * Math.cos(ang) * 0.35;
          const dz = tz * Math.sin(ang) - oz * Math.cos(ang) * 0.35;
          const w = S.wMin + (S.wMax - S.wMin) * hb(1);
          const ht = Math.min(S.max, (S.hMin + (S.hMax - S.hMin) * hb(2)) * tall);
          const lean = 0.15 + 0.35 * hb(3);
          const bx = cx - x + dx * 0.08;
          const bz = cz - z + dz * 0.08;
          tris.push([
            [bx - tx * w / 2, 0, bz - tz * w / 2],
            [bx + tx * w / 2, 0, bz + tz * w / 2],
            [bx + dx * lean, ht, bz + dz * lean],
          ]);
          tones.push(i % 3 === 2 ? pick(S.greens, hb(4)) : tone);
        }
      }
      const g = facetGeo(tris, (f) => shade(tones[f], 0.86 + 0.26 * hash01(f, k, st + 21)), [ox * 1e3, 0.4, oz * 1e3]);
      if (kind !== 'post') {
        place(g, x, z, 0, 1.8);
        return;
      }
      // The posts, 1.8m apart along the line just inside the tufts, each
      // leaning its own way, and the rope between their tops.
      const parts = [g];
      const tops = [];
      for (const side of [-1, 1]) {
        const hp = (j) => h(70 + 6 * (side + 1) + j);
        const [px2, pz2] = at(side * 0.9, -0.35);
        const ph = S.postH * (0.82 + 0.18 * hp(0));
        const top = [px2 - x + (hp(1) - 0.5) * 0.12, ph, pz2 - z + (hp(2) - 0.5) * 0.12];
        tops.push(top);
        parts.push(beam([px2 - x, -0.2, pz2 - z], top, 0.11, shade(pick(S.post, hp(3)), 0.9 + 0.15 * hp(4))));
      }
      const sag = 0.2 + 0.1 * h(80);
      const mid = [(tops[0][0] + tops[1][0]) / 2, (tops[0][1] + tops[1][1]) / 2 - sag, (tops[0][2] + tops[1][2]) / 2];
      // Two flat 5cm ribbon segments a little under the post tops.
      const rope = [];
      const dn = (p, d) => [p[0], p[1] - d, p[2]];
      for (const [a, c] of [[tops[0], mid], [mid, tops[1]]]) {
        rope.push([dn(a, 0.06), dn(c, 0.06), dn(c, 0.11)], [dn(a, 0.06), dn(c, 0.11), dn(a, 0.11)]);
      }
      const ropeCol = shade(S.rope, 0.95 + 0.1 * h(81));
      parts.push(facetGeo(rope, () => ropeCol, [ox * 1e3, 0.4, oz * 1e3]));
      const all = mergeGeometries(parts, false);
      for (const p of parts) p.dispose();
      place(all, x, z, 0, 1.8);
      return;
    }

    if (edge.style === 'hedge') {
      // Clipped privet: a box along the edge, its top corners lifted a little
      // so it reads clipped by hand rather than extruded. A corner is square.
      const corner = kind === 'corner';
      const hh = S.hMin + (S.hMax - S.hMin) * (HEDGE_SLOW * slowH(sp.u) + (1 - HEDGE_SLOW) * h(0));
      let a = corner ? -1.0 : -S.len / 2;
      let bEnd = corner ? 1.0 : S.len / 2;
      const depth = corner ? 2.0 : S.depth;
      // Trim the piece where it would run into a gap (the gate fills it).
      for (const gp of gaps) {
        const dx = gp.x - x;
        const dz = gp.z - z;
        const gt = dx * tx + dz * tz;
        const gn = Math.abs(dx * ox + dz * oz);
        const across = Math.max(0, gn - depth / 2);
        if (across >= gp.r) continue;
        const w = Math.sqrt(gp.r * gp.r - across * across) + 0.05;
        if (gt >= 0) bEnd = Math.min(bEnd, gt - w);
        else a = Math.max(a, gt + w);
      }
      if (bEnd - a < 0.8) return;
      const len = bEnd - a;
      const g = dropBottom(new THREE.BoxGeometry(len, hh, depth));
      g.translate((a + bEnd) / 2, hh / 2, 0);
      const p = g.attributes.position;
      const midX = (a + bEnd) / 2;
      for (let v = 0; v < p.count; v++) {
        if (p.getY(v) > hh * 0.75) {
          const lx = Math.round(p.getX(v) * 100);
          const lz = Math.round(p.getZ(v) * 100);
          p.setY(v, p.getY(v) + S.lift * hash01(lx, lz, st + k));
          // polish-shrubs: the top drawn in (narrower across, a little in
          // from each end), so with the rounded normals the hedge's crown
          // reads soft and clipped rather than a sharp-edged block
          p.setZ(v, p.getZ(v) * HEDGE_CROWN);
          p.setX(v, p.getX(v) + Math.sign(midX - p.getX(v)) * 0.12);
        }
      }
      // polish-shrubs: the green drifts between the style's greens (not a
      // pick of two), a lit top over a darker foot, and normals rounded
      // over the top so the run reads as one clipped hedge, not blocks.
      const green = new THREE.Color(S.greens[0]).lerp(new THREE.Color(S.greens[S.greens.length - 1]), h(1));
      const light = 0.92 + 0.14 * h(2);
      paintGeo(g, (v, vx, vy, vz) => green.clone().multiplyScalar(light * (0.95 + 0.1 * hash01(Math.round(vx * 100), Math.round(vz * 100), st + 7))
        * (EDGE_FOOT + (1.1 - EDGE_FOOT) * smoothstep(0, hh, vy))));
      place(g, x, z, yaw, Math.max(Math.abs(a), Math.abs(bEnd)),
        { soft: { s: HEDGE_SOFT, r: 0.5, c: [(a + bEnd) / 2, hh * 0.3, 0] } });
      return;
    }

    if (edge.style === 'wall') {
      // Dry-stone: one block per spot, a little longer than the spacing so
      // the run is unbroken, in two greys (a course each) under paler
      // capstones; a corner is two blocks crossed. Every third piece a gorse
      // mound grows against its inner face (where the kids see it, and on
      // the ground rather than over the wall), a few of its faces in flower.
      const blocks = kind === 'corner' ? [0, Math.PI / 2] : [0];
      blocks.forEach((turn, i) => {
        const hi = (j) => h(20 + 16 * i + j);
        const L = S.step + 0.2 + 0.15 * hi(13);
        const hMid = S.hMin + (S.hMax - S.hMin) * hi(14);
        const g0 = pick(S.greys, hi(15));
        const g1 = S.greys[(S.greys.indexOf(g0) + 1 + Math.floor(hi(10) * 2)) % S.greys.length];
        const g = wallBlock(L, 0.62, 0.46, hMid, g0, g1, S.cap, hi);
        place(g, x, z, yaw + turn + (h(13 + i) - 0.5) * 0.04, L / 2);
      });
      if (kind === 'gorse') {
        const r = S.rMin + (S.rMax - S.rMin) * h(15);
        // Ten faces are too few for flowers of their own (a yellow face is a
        // yellow tent), so the bloom is a tint: a few faces, and the top,
        // part-way to yellow.
        const g = mound(r, S.gorseH * (0.85 + 0.3 * h(16)), (f) => shade(S.gorse, 0.88 + 0.22 * hash01(f, k, st + 19))
          .lerp(new THREE.Color(S.bloom), f >= 9 || hash01(f, k, st + 17) < 0.25 ? 0.25 + 0.2 * hash01(f, k, st + 18) : 0),
        (i) => h(40 + i));
        const gh = S.gorseH * (0.85 + 0.3 * h(16));
        footLit(g, gh);
        const [wx, wz] = at((h(17) - 0.5) * 0.8, -(0.25 + 0.8 * r));
        place(g, wx, wz, yaw, r, { soft: { s: MOUND_SOFT, r: 0.6, c: [0, gh * 0.2, 0] } });
      }
      return;
    }

    if (edge.style === 'reeds') {
      // A reed bed: single-triangle blades, each turned to face in toward the
      // area (the camera is always inside the bounds, looking out, so a
      // blade's back is never seen), at hashed lean, height and angle across
      // the line. One triangle a blade, S.blades a piece, a third more at a
      // corner. (Open cones read as a row of tents.)
      const count = kind === 'corner' ? Math.round(S.blades * 1.33) : S.blades;
      const tris = [];
      const tones = [];
      for (let i = 0; i < count; i++) {
        const hb = (j) => h(30 + 7 * i + j);
        const t = kind === 'corner' ? (hb(0) - 0.5) * 1.6 : ((i + 0.5) / count - 0.5) * S.step + (hb(0) - 0.5) * 0.3;
        const nOut = (hb(1) - 0.5) * 0.8 + (kind === 'corner' ? (hb(6) - 0.5) * 1.2 : 0);
        const [bx, bz] = at(t, nOut);
        // The blade's base runs across at up to ~29 degrees off the line: a
        // blade is one-sided, so turned further it vanishes edge-on from an
        // oblique camera.
        const turn = (hb(2) - 0.5) * 1.0;
        const ax = tx * Math.cos(turn) + ox * Math.sin(turn);
        const az = tz * Math.cos(turn) + oz * Math.sin(turn);
        const w = S.wMin + (S.wMax - S.wMin) * hb(3);
        const ht = S.hMin + (S.hMax - S.hMin) * hb(4);
        const lean = (hb(5) - 0.5) * 0.5;
        tris.push([
          [bx - x - ax * w / 2, 0, bz - z - az * w / 2],
          [bx - x + ax * w / 2, 0, bz - z + az * w / 2],
          [bx - x + ax * lean, ht, bz - z + az * lean],
        ]);
        tones.push(pick(S.greens, hash01(i, k, st + 22)));
      }
      // Wound away from a point far outside: toward the area, that is.
      const g = facetGeo(tris, (f) => shade(tones[f], 0.84 + 0.3 * hash01(f, k, st + 21)), [ox * 1e3, 0.4, oz * 1e3]);
      place(g, x, z, 0, 1.6);
      return;
    }

    // Scrub and pine scrub: two overlapping mounds per piece (pieces every
    // S.step), three at a corner; the pine scrub's every fourth piece also
    // has a sapling. polish-hedgesky: the mounds lie along the edge,
    // stretched so they overlap, their height and green on the run's slow
    // noise (see edgeNoise), now and then one a taller lump.
    const count = kind === 'corner' ? 3 : 2;
    const nH = slowH(sp.u);
    const runGreen = new THREE.Color(S.greens[0]).lerp(new THREE.Color(S.greens[S.greens.length - 1]), slowC(sp.u));
    const lump = kind !== 'corner' && h(26) < 1 / EDGE_LUMP_EVERY ? (h(27) < 0.5 ? 0 : 1) : -1;
    for (let i = 0; i < count; i++) {
      const isLump = i === lump;
      const r = (S.rMin + (S.rMax - S.rMin) * (0.5 * nH + 0.5 * h(1 + i))) * (isLump ? 1.1 : 1);
      const ht = Math.min((S.hMin + (S.hMax - S.hMin) * (HEDGE_SLOW * nH + (1 - HEDGE_SLOW) * h(4 + i)))
        * (isLump ? EDGE_LUMP_H : 1), S.max - 0.1);
      const stretch = isLump ? 1.15 : MOUND_STRETCH;
      const tone = runGreen.clone().multiplyScalar(0.96 + 0.08 * h(7 + i));
      const g = mound(r, ht, (f) => tone.clone().multiplyScalar(0.95 + 0.1 * hash01(f, k * 3 + i, st + 21)), (j) => h(30 + 12 * i + j));
      g.scale(stretch, 1, 1);
      const t = kind === 'corner' ? (i - 1) * 0.6 : (i - 0.5) * 1.4 + (h(11 + i) - 0.5) * 0.3;
      const nOut = kind === 'corner' ? (i === 1 ? 0.6 : 0) : (h(14 + i) - 0.5) * 0.3;
      const [wx, wz] = at(t, nOut);
      footLit(g, ht);
      const turn = kind === 'corner' ? h(17 + i) * Math.PI : (h(17 + i) - 0.5) * 0.3;
      place(g, wx, wz, yaw + turn, r * stretch, { soft: { s: MOUND_SOFT, r: 0.6, c: [0, ht * 0.2, 0] } });
    }
    if (kind === 'sapling') {
      const { r, h: ch, sides } = S.sapling;
      const col = pick(S.greens, h(22));
      const g = cone(r, ch, sides, (f) => shade(col, 0.9 + 0.16 * hash01(f, k, st + 23)),
        { lx: (h(20) - 0.5) * 0.1, lz: (h(21) - 0.5) * 0.1, a0: h(24) * 2 });
      const [wx, wz] = at((h(25) - 0.5) * 1.2, 0.5);
      place(g, wx, wz, 0, r);
    }
  });
}

/**
 * horizonBand(opts) — one decorative mesh that breaks an area's horizon.
 *
 *   kind      'hills' | 'dunes' | 'skyline'. Only 'skyline' differs
 *             structurally: it adds merged rooftop blocks standing on an
 *             otherwise near-flat band, because a smooth height field cannot
 *             make a town and a town is what the Docks look out at.
 *   inner     half-size of the ring's inner edge. Put it a few metres INSIDE
 *             the ground plane's half-size so the seam is buried.
 *   outer     half-size of the outer edge. Keep it inside the fog's 130m far
 *             distance from the middle of the area; past that the band is
 *             fully faded and the triangles draw nothing.
 *   color     the area's own choice — muted toward its horizon hex, so the
 *             band reads distant even at the near corner where fog barely
 *             touches it. Colours belong to the area files everywhere else in
 *             this file and they belong to them here.
 *   height    peak crest height.
 *   wavelength  the ridge spacing, in metres.
 *   avoid     an array of water footprints (an area's own `waters` records —
 *             the same data test/water.test.js reads). The band slopes down
 *             to each one and a cell is dropped where it lies under the water
 *             all round (see `shore`), which is how the Seaside's dunes stop
 *             at the tideline instead of paving the bay.
 *   headland  { x, z, r, h } — one extra smooth lobe added to the height
 *             field, for the promontory the plan asks the Seaside for.
 *   sideTints { north, east, south, west } (hex) — colours the ring by side as
 *             vertex colours on the same mesh, mixing across the corners (see
 *             sideTint). The tint IS the colour then, so the material is white
 *             and `color` is not used. Omitted: the band is as it always was.
 *   rooftops  { from, to, count, height } — `count` skyline blocks on the
 *             perimeter arc u in [from, to) (0-0.25 is the east side), on any
 *             kind, merged into the same mesh. `height` defaults to the
 *             band's. Omitted: none.
 *   closeWater  true (default): a water in `avoid` that runs on past the
 *             bounds meets hills further out (see `shore`). false for the
 *             open sea, which runs to the horizon.
 *   keepLow   [{ x1, z1, x2, z2, r }] capsules (x2/z2 may be left out for a
 *             disc) where the band stays at the waterline, for things drawn
 *             out on the water such as the lake's island and its bridge.
 *   nearColor hex — the ring's colour from the inner rim out to `flat` (the
 *             stretch under and just past the ground plane's edge), blending
 *             by smoothstep to its usual colour (side tint or `color`) by
 *             flat + ramp/2: the lawn carries on instead of stopping at a pale
 *             strip. Vertex colours then, material white. Omitted: none.
 *   shoreLip  { width, color } — where the far side of `shore` lifts the hills
 *             over a water that runs on past the bounds, the band first climbs
 *             out of the water to a flat lip LIP_H over its zero (a beach, in
 *             `color`), holds it for `width` metres, and only then ramps up
 *             into the hills (the ramp moved out by `width`). Without it the
 *             hills rose straight out of the water as a dark face. Vertex
 *             colours then, material white. Omitted: the band is
 *             byte-for-byte what it was.
 *   edge      { half, style, gaps, avoid, props } — low dressing straddling the
 *             ground plane's edge (`half` its half-size) and a sparse tree row
 *             well outside it, in one of EDGE_STYLES (see edgeSpots), as ONE
 *             separate mesh 'horizonEdge', a noCast child of the band (see
 *             edgeMesh). `gaps` [{ x, z, r }] are left open (a hedge gets a
 *             gate in each); `avoid` (default: the band's) is the water the
 *             pieces keep off. `props` [{ x, z, yaw, kind }] are the
 *             area's own set pieces drawn into the same mesh (the dune
 *             edge's 'hut' and 'chair'). The band itself is byte-for-byte
 *             what it is without an edge. Omitted: no child.
 */
export function horizonBand({
  kind = 'hills',
  inner,
  outer,
  color = 0x8aa878,
  height = 7,
  wavelength = 34,
  salt = 7,
  flat = 10,
  ramp = 26,
  taper = 18,
  around = 152,
  outSegs = 12,
  blocks = 46,
  avoid = [],
  headland = null,
  sideTints = null,
  rooftops = null,
  closeWater = true,
  keepLow = [],
  nearColor = null,
  edge = null,
  shoreLip = null,
  rect = null,
} = {}) {
  // Bigger areas: `rect` ({ cx, cz, ex, ez }, see rectAt) rings a rectangle
  // instead of the square. Hills only so far (the River's): a skyline or
  // rooftops would need their blocks placed the same way.
  if (rect && (kind === 'skyline' || rooftops || headland)) throw new Error('horizonBand: rect supports plain hills only');
  const outOf = rect ? (x, z) => rectOut(rect, x, z) : (x, z) => Math.max(Math.abs(x), Math.abs(z));
  const tintOf = rect
    ? (x, z, tints) => { const q = rectSquare(rect, x, z); return sideTintColor(q[0], q[1], tints); }
    : sideTintColor;
  const span = outer - inner;
  // The vertical profile, as a pure function of how far out a point is. See
  // the FLAT/TAPER paragraphs above for why each of the two terms is here.
  const lift = (d) => smoothstep(flat, flat + ramp, d)
    * (1 - 0.7 * smoothstep(span - taper, span, d));
  // The relief. macroField() is reused verbatim from the ground-macro wave
  // above: three broad plane waves whose direction, wavelength and phase are
  // each drawn once from `salt`, then evaluated at the vertex's own world
  // (x, z). Its header explains at length why this and NOT a per-vertex hash
  // — the same failure mode (television static instead of landform) applies
  // exactly as hard to a ridge line as to a lawn.
  const relief = (x, z) => {
    let r = 0.35 + 0.65 * clamp01(macroField(x, z, salt, wavelength) / 3 * 0.5 + 0.5);
    if (headland) {
      const g = Math.hypot(x - headland.x, z - headland.z) / headland.r;
      r += (headland.h ?? 0.8) * (1 - smoothstep(0, 1, clamp01(g)));
    }
    return r;
  };
  // `height` is what the SILHOUETTE reaches; the ring surface under it is a
  // separate number because the two kinds want opposite things from it. Hills
  // and dunes ARE the ring, so it carries the full height. A skyline is
  // buildings standing on flat-ish ground — a town on a 9m ridge is a town
  // sliding off a hill — so the ring drops to a gentle swell and `height`
  // becomes the roofline instead.
  const ringHeight = kind === 'skyline' ? Math.min(2, height * 0.2) : height;
  // Where the band meets water (Polish 2). Dropping the wet cells alone left
  // the dry cells beside them at full hill height, so every lake, river and
  // mire that ran out under the band cut it into flat-edged slabs with white
  // sky under their cut sides. Two terms fix it, both 1 away from any water:
  //   * the shore: within SHORE_RAMP of a footprint the hills come down to
  //     the waterline, so the band meets the water as a slope;
  //   * the far side: from CLOSE_FROM to CLOSE_TO of the span out, the hills
  //     rise again even over the water, so a lake or river that runs on past
  //     the bounds ends at far hills instead of a notch of open sky. The sea
  //     (`closeWater: false`) is meant to run to the horizon, and keeps that.
  // A cell is only dropped now when it is wet AND lies at the waterline all
  // round, so the water mesh covers the gap and no cut edge stands up.
  // `keepLow` zones (the lake's island and its bridge, seen from the Woods,
  // the River and the Moor) hold the band at the waterline whatever the two
  // terms say, so the far hills never bury something drawn out on the water.
  const lowZone = (x, z) => {
    let m = Infinity;
    for (const k of keepLow) m = Math.min(m, segmentDist(x, z, k) - k.r);
    return smoothstep(0, KEEP_LOW_RAMP, m);
  };
  // With a `shoreLip` the far rise starts `width` further out, and `lipAt`
  // (0-1) is how much of the lip stands at a point: past CLOSE_FROM, as much
  // as the point is water rather than dry shore, never over a keepLow zone.
  const lipW = shoreLip ? shoreLip.width : 0;
  const shore = (x, z, d) => {
    if (avoid.length === 0) return 1;
    const c = waterClearance(avoid, x, z);
    const dry = smoothstep(0, SHORE_RAMP, c);
    const far = closeWater
      ? (shoreLip ? smoothstep(CLOSE_FROM * span + lipW, CLOSE_TO * span + lipW, d)
        : smoothstep(CLOSE_FROM * span, CLOSE_TO * span, d))
      : 0;
    const f = Math.max(c < 0 ? 0 : dry, far);
    return keepLow.length ? Math.min(f, lowZone(x, z)) : f;
  };
  const lipAt = (x, z, d) => {
    if (!shoreLip || !closeWater || avoid.length === 0) return 0;
    const c = waterClearance(avoid, x, z);
    const k = (1 - (c < 0 ? 0 : smoothstep(0, SHORE_RAMP, c)))
      * smoothstep(CLOSE_FROM * span - LIP_RISE, CLOSE_FROM * span, d);
    return keepLow.length ? k * lowZone(x, z) : k;
  };
  const heightAt = shoreLip
    ? (x, z, d) => -BAND_SINK + Math.max(ringHeight * relief(x, z) * lift(d) * shore(x, z, d), LIP_H * lipAt(x, z, d))
    : (x, z, d) => -BAND_SINK + ringHeight * relief(x, z) * lift(d) * shore(x, z, d);
  const wet = (x, z) => avoid.length > 0 && waterClearance(avoid, x, z) < 0;

  // ---- the ring surface ----------------------------------------------------
  const pos = [];
  const uv = [];
  for (let i = 0; i < around; i++) {
    const [px, pz] = squarePoint(i / around);
    for (let j = 0; j <= outSegs; j++) {
      const t = j / outSegs;
      const s = inner + t * span;
      const x = rect ? rect.cx + px * (s + rect.ex) : px * s;
      const z = rect ? rect.cz + pz * (s + rect.ez) : pz * s;
      pos.push(x, heightAt(x, z, t * span), z);
      // A plain planar uv so this geometry can be merged with the skyline's
      // BoxGeometries (mergeGeometries requires matching attribute sets) and
      // so a future caller could give the band a surface without rebuilding
      // it. Nothing uses it today — the material carries no map.
      uv.push(i / around, t);
    }
  }
  const index = [];
  const at = (i, j) => (i % around) * (outSegs + 1) + j;
  for (let i = 0; i < around; i++) {
    for (let j = 0; j < outSegs; j++) {
      // Cell centre decides wet/dry, so a dropped cell leaves a clean edge at
      // the waterline rather than a fringe of half-cells.
      const [cx, cz] = squarePoint((i + 0.5) / around);
      const cs = inner + ((j + 0.5) / outSegs) * span;
      if ((rect ? wet(...rectAt(rect, cx, cz, cs)) : wet(cx * cs, cz * cs))
        && [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)].every((v) => pos[v * 3 + 1] <= DROP_AT)) continue;
      // Winding derived once and then trusted: on side 0 of the square,
      // increasing i moves +z and increasing j moves +x, and z-hat cross x-hat
      // is +y — so (i,j), (i+1,j), (i+1,j+1) is counter-clockwise from above.
      index.push(at(i, j), at(i + 1, j), at(i + 1, j + 1));
      index.push(at(i, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
  const ring = new THREE.BufferGeometry();
  ring.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ring.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  ring.setIndex(index);
  ring.computeVertexNormals();

  // ---- the skyline's rooftops ---------------------------------------------
  const parts = [ring];
  // One colour multiplier per part, applied as vertex colours below. Only the
  // skyline uses it; for hills every entry stays white and no attribute is set.
  const tones = [SKYLINE_PLAIN];
  // The side tint under each part (null: none), parallel to `parts`.
  const bases = [null];
  if (kind === 'skyline') {
    for (let k = 0; k < blocks; k++) {
      const u = (k + 0.15 + 0.7 * hash01(k, 0, salt + 1)) / blocks;
      const [px, pz] = squarePoint(u);
      // 0.50-0.94 of the span, i.e. the OUTER HALF of the band, and this range
      // is the one number in the skyline that was tuned by looking rather than
      // by argument. At 0.34 the nearest blocks land ~45m from the corner of
      // `bounds`, and 45m is inside the fog's 40m near plane by only five
      // metres — so they arrived at nearly full contrast as bright white slabs
      // while the rest of the rank was correctly hazed. Pushing the near end
      // out to 0.50 puts every block at least 60m from anywhere a cat can
      // stand, which is where this fog has actually started working (~25%),
      // and the whole rank reads as one distance again.
      const t = 0.50 + 0.44 * hash01(k, 1, salt + 2);
      const s = inner + t * span;
      const x = px * s;
      const z = pz * s;
      if (wet(x, z)) continue;
      const bh = height * (0.40 + 0.75 * hash01(k, 4, salt + 5));
      // Sunk half a metre into the band's own surface so a block never floats
      // above a dip in it — the land under a town is not a table.
      const base = heightAt(x, z, t * span) - 0.5;
      // Turned to face the middle of the area, so the town presents elevations
      // rather than corners. Squares of the perimeter parameter, not of the
      // block's own position, so a block on a side wall is parallel to it.
      const yaw = Math.atan2(px, pz);
      addRoofBlock(parts, tones, bases, { k, x, z, yaw, base, bh, salt, tint: sideTints ? sideTintColor(x, z, sideTints) : null });
    }
  }

  let houseLightGeos = null;
  if (rooftops) {
    // Salted apart from the skyline kind's own blocks, so a band that has both
    // does not stack two blocks on the same spot.
    const rsalt = salt + ROOFTOP_SALT;
    const houses = rooftops.style === 'houses';
    const lit = [];
    rooftopSpots(rooftops, inner, outer, rsalt).forEach(({ x, z, yaw }, k) => {
      if (wet(x, z)) return;
      // No height given: the band's own, the same default the skyline kind's
      // blocks are scaled from. Without it every block would be NaN tall.
      // (Houses: the retired blocks' height, `legacyHeight`, see below.)
      const bh = ((houses ? rooftops.legacyHeight : undefined) ?? rooftops.height ?? height)
        * (0.40 + 0.75 * hash01(k, 4, rsalt + 5));
      const surface = heightAt(x, z, Math.max(Math.abs(x), Math.abs(z)) - inner);
      const base = surface - 0.5;
      const tint = sideTints ? sideTintColor(x, z, sideTints) : new THREE.Color(color);
      if (!houses) {
        addRoofBlock(parts, tones, bases, { k, x, z, yaw, base, bh, salt: rsalt, pitched: true, tint });
        return;
      }
      // The Woods' Math.random draw count is pinned (test/waterlooks.test.js,
      // woods 11344) and the flat trace seeds Math.random before each build:
      // every THREE geometry the old block made outside withLocalUuids drew 4
      // numbers for its uuid. So the old block is still built, at the old
      // height (`legacyHeight`, which sets how many window quads it has), into
      // throwaway arrays and disposed at once; nothing of it is drawn. The
      // cottage itself is made under its own uuid stream.
      const junk = [];
      addRoofBlock(junk, [], [], { k, x, z, yaw, base, bh, salt: rsalt, pitched: true, tint });
      for (const g of junk) g.dispose();
      withLocalUuids(`band-houses-${rsalt}-${k}`, () => addHouse(parts, tones, bases, {
        k, x, z, yaw, surface, height: rooftops.height ?? height, salt: rsalt, tint,
      }, lit));
    });
    if (lit.length) houseLightGeos = lit;
  }

  // Vertex colours: the skyline's per-block tones, and/or the side tints. A
  // part's colour is its tint (white when there are none) times its tone.
  // With `nearColor` or `rooftops` the material is white too, so the band's
  // own colour moves into the vertex colours. (Rooftops: a roof block's tint already IS the band colour, so on a
  // band-coloured material it would be applied twice. Every shipped band with
  // rooftops has sideTints and was white already, so none changes.)
  const white = !!sideTints || nearColor != null || !!rooftops || !!shoreLip;
  const plain = white && !sideTints ? new THREE.Color(color) : null;
  const near = nearColor != null ? new THREE.Color(nearColor) : null;
  const nearMix = new THREE.Color();
  const lipCol = shoreLip ? new THREE.Color(shoreLip.color) : null;
  const lipMix = new THREE.Color();
  const coloured = kind === 'skyline' || !!sideTints || !!rooftops || nearColor != null || !!shoreLip;
  if (coloured) {
    parts.forEach((p, i) => {
      if (p.attributes.color) return;
      const [r, g2, bl] = tones[i];
      const n = p.attributes.position.count;
      const pp = p.attributes.position;
      const c = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) {
        // The ring takes its tint per vertex; a block takes one for the lot.
        let t = i === 0 && sideTints ? tintOf(pp.getX(v), pp.getZ(v), sideTints) : (bases[i] ?? plain);
        if (i === 0 && near) {
          const d = outOf(pp.getX(v), pp.getZ(v)) - inner;
          t = nearMix.copy(near).lerp(t, smoothstep(flat, flat + 0.5 * ramp, d));
        }
        if (i === 0 && lipCol) {
          // The lip in its own colour, fading into the hills' as they rise
          // above it.
          const x = pp.getX(v);
          const z = pp.getZ(v);
          const d = outOf(x, z) - inner;
          const k = lipAt(x, z, d) * (1 - smoothstep(LIP_H - BAND_SINK, LIP_H - BAND_SINK + LIP_FADE, pp.getY(v)));
          if (k > 0) t = lipMix.copy(t).lerp(lipCol, k);
        }
        c[v * 3] = r * (t ? t.r : 1);
        c[v * 3 + 1] = g2 * (t ? t.g : 1);
        c[v * 3 + 2] = bl * (t ? t.b : 1);
      }
      p.setAttribute('color', new THREE.BufferAttribute(c, 3));
    });
  }
  const geo = parts.length === 1 ? ring : mergeGeometries(parts, false);
  if (parts.length > 1) for (const p of parts) p.dispose();
  geo.computeBoundingSphere();

  // flatShading, which is a FIRST for this game — VISUAL-PASS.md section 1
  // notes there is none anywhere — and it is deliberate rather than an
  // oversight corrected. Everything else in the world is a hand-placed prop
  // whose facets are already its shape; this is a swept height field, and a
  // smoothed one reads as a green dome. Faceted, each plane takes its own
  // value off the 19-degree sun and the ridge line resolves into planes
  // catching the light at different angles, which is precisely the low-poly
  // landform vocabulary the rest of the game is written in.
  //
  // No preset and no surface. A tiling map at 90m is smaller than a texel and
  // the band's whole job is to be a SHAPE — see the note in materials.js's
  // header about a texture resolving to its flat mean at distance, which here
  // is not a compromise but the correct answer.
  const m = new THREE.Mesh(geo, litMaterial(white ? 0xffffff : color, { flatShading: true, vertexColors: coloured }));
  // Named so a test (and a future draw-call audit) can find it without the
  // area files having to publish it as a record — the same trick path() uses.
  m.name = 'horizonBand';
  // Never culled: the camera is always INSIDE the ring's bounding sphere, so
  // the test can only ever come back true. Saying so costs nothing and stops
  // a future reader wondering whether it should have been split up.
  m.frustumCulled = false;
  if (houseLightGeos) m.add(houseLightsMesh(houseLightGeos, salt + ROOFTOP_SALT));
  if (edge) m.add(edgeMesh(rect ? { ...edge, rect } : edge, salt, edge.avoid ?? avoid, (x, z) => heightAt(x, z, outOf(x, z) - inner)));
  return m;
}

// The Woods' lit cottage windows: one hidden mesh, a child of the band, that
// render/dusk.js reveals at dusk (userData.duskWindow). Basic material, no fog
// and toneMapped:false, so the panes stay a warm yellow however far off. (On
// the composer path the output pass tone-maps the whole frame, sky and all, so
// they still agree.) Made
// wholly under its own uuid stream (the area's Math.random draw count is pinned).
function houseLightsMesh(geos, rsalt) {
  return withLocalUuids(`band-houselights-${rsalt}`, () => {
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (geos.length > 1) for (const g of geos) g.dispose();
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: HOUSE_LIGHT, fog: false, toneMapped: false }));
    mesh.name = 'houseLights';
    mesh.userData = { duskWindow: true, noCast: true, noMerge: true };
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    return mesh;
  });
}

// The ground's edge as its own mesh (see THE GROUND'S EDGE above), a child of
// the band: the band has the identity transform, so the child's world-space
// vertices are where they are drawn. A child, because everything that treats
// the band specially finds it there and leaves it alone: mergeprops skips
// every top-level mesh (and a mesh with children), the contact shadows scan
// top-level children only and rule the band out by its size, the shadow
// sweep traverses into it and skips it for userData.noCast, and dusk tints
// it with the band for userData.duskTint (render/dusk.js). Every geometry,
// the mesh and its material are made under their own uuid stream, so the
// area builds' pinned Math.random draw counts do not move.
function edgeMesh(edge, salt, avoid, groundAt) {
  return withLocalUuids(`band-edge-${salt}`, () => {
    const out = [];
    buildEdge(out, edge, salt, avoid, groundAt);
    const geo = out.length === 1 ? out[0]
      : out.length ? mergeGeometries(out, false) : new THREE.BufferGeometry();
    if (out.length > 1) for (const p of out) p.dispose();
    geo.computeBoundingSphere();
    // polish-shrubs: shaded from the pieces' own normals (flat for walls,
    // trees and reeds, rounded for hedges and mounds; see buildEdge's place)
    const mesh = new THREE.Mesh(geo, litMaterial(0xffffff, { vertexColors: true }));
    mesh.name = 'horizonEdge';
    mesh.userData.noCast = true;
    mesh.userData.duskTint = true;
    // It rings the camera like the band does, so culling it can only cost.
    mesh.frustumCulled = false;
    return mesh;
  });
}

// A picket fence run. Left FLAT, and deliberately, though wind.js's docstring
// lists fenceRun as a candidate: a fence is posts driven into the ground and it
// does not sway, and the members are 0.06-0.1m — squarely inside the
// thin-member rule, so they take the 'wood' light response (0.75, the paint-
// and-sawn-timber step down from the 0.9 default) with the plank tile left off
// rather than four 2.5cm stripes down every post.
export function fenceRun(x1, z1, x2, z2) {
  const g = new THREE.Group();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.floor(len / 0.8);
  const timber = () => surfNoMap(0xc8b088, 'wood');
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Mesh(roundedBox(0.1, 1, 0.1), timber());
    p.position.set(x1 + (x2 - x1) * t, 0.5, z1 + (z2 - z1) * t);
    g.add(p);
  }
  const rail = new THREE.Mesh(roundedBox(0.06, 0.08, len), timber());
  rail.position.set((x1 + x2) / 2, 0.8, (z1 + z2) / 2);
  rail.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  g.add(rail);
  return g;
}

export function mailbox(x, z) {
  const g = new THREE.Group();
  // 0.08 post: thin-member rule, so wood's roughness without its tile.
  const post = new THREE.Mesh(roundedBox(0.08, 1, 0.08), surfNoMap(0x7a5230, 'wood'));
  post.position.y = 0.5;
  g.add(post);
  // The box itself is a painted pressed-steel drum — 'paintedMetal' keeps
  // metalness at 0 so the blue survives (see fireEscape's bareMetal note), and
  // the preset carries no map, so its size is not a problem.
  const boxTop = surfBox(0.3, 0.25, 0.5, 0x4a6ea5, 'paintedMetal');
  boxTop.position.y = 1.1;
  g.add(boxTop);
  g.position.set(x, 0, z);
  return g;
}

// polish-quayside: the car's real shape. Everything here is built inside the
// car's own withLocalUuids, and stays inside the old two-box car's bounding
// box (x ±1.025 at the tyres, y 0 .. 1.425, z ±2), so its contact shadow, its
// caster class and its collider (r 1.8) are what they were.
//
// The side profile in (z, y), front at +z: a low nose, a bonnet, the
// windscreen base, the waist line back to a short boot, and two wheel arches
// cut into the sill. Extruded across the car with a small bevel, so every
// edge catches a rounded highlight. Authored CAR_BEVEL inside the outline the
// bevel grows it back out to.
const CAR_BEVEL = 0.04;
const CAR_ARCH = { r: 0.44, y: 0.36, z: 1.3 };
function carSideShape() {
  const s = new THREE.Shape();
  const { r, y: ay, z: az } = CAR_ARCH;
  s.moveTo(-1.92, 0.37);
  s.lineTo(-az - r, 0.37);
  s.absarc(-az, ay, r, Math.PI, 0, true);
  s.lineTo(az - r, 0.37);
  s.absarc(az, ay, r, Math.PI, 0, true);
  s.lineTo(1.92, 0.37);
  s.lineTo(1.955, 0.5);
  s.lineTo(1.955, 0.68);
  s.lineTo(1.88, 0.79);
  s.lineTo(1.6, 0.855);
  s.lineTo(0.8, 0.9);
  s.lineTo(-1.36, 0.9);
  s.lineTo(-1.84, 0.87);
  s.lineTo(-1.955, 0.74);
  s.lineTo(-1.955, 0.48);
  s.lineTo(-1.92, 0.37);
  return s;
}
// A closed (z, y) outline extruded `width` across x (centred), bevelled.
function carExtrude(shape, width, bevel, segs = 2) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: segs, curveSegments: 8,
  });
  // extruded along +z from 0: turn so the extrusion runs across x and the
  // shape's u becomes z (rotateY(-PI/2): (u, v, d) -> (-d, v, u))
  g.rotateY(-Math.PI / 2);
  g.translate((width - 2 * bevel) / 2, 0, 0);
  return g;
}
const carPoly = (pts) => {
  const s = new THREE.Shape();
  pts.forEach(([u, v], i) => (i ? s.lineTo(u, v) : s.moveTo(u, v)));
  return s;
};
// Non-indexed, position + normal + uv, so every piece of one material merges.
const carPart = (g, x = 0, y = 0, z = 0) => {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  return out.translate(x, y, z);
};
const carMerge = (parts) => {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
};
// The windows' outline (windscreen, roof line, rear screen) over the waist.
// The roof stays flat at 1.425 from z 0.45 back to -0.95: the car roof is a
// perch ('king of the car roof', y 1.35 at the car's centre) and the
// neighbourhood's knockable cup stands on it at local (0.58, 0), both where
// the old cabin box's flat top was.
const CAR_WHEELS = [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]];
const CAR_GLASS = [[0.8, 0.88], [0.46, 1.33], [-0.96, 1.33], [-1.36, 0.88]];
function carGeometries() {
  // paint: the body, the roof panel, the A/B/C pillars and the door mirrors
  const paint = [carPart(carExtrude(carSideShape(), 1.8, CAR_BEVEL, 2))];
  paint.push(carPart(carExtrude(carPoly([[0.5, 1.33], [0.45, 1.405], [-0.95, 1.405], [-1.0, 1.33]]), 1.6, 0.02, 1)));
  const pillar = (a, b, t = 0.07) => {
    const len = Math.hypot(b[1] - a[1], b[2] - a[2]);
    const g = new THREE.BoxGeometry(t, len, t);
    g.rotateX(Math.atan2(b[2] - a[2], b[1] - a[1]));
    return carPart(g, a[0], (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  };
  for (const sx of [-1, 1]) {
    const x = sx * 0.765;
    paint.push(pillar([x, 0.9, 0.8], [x, 1.36, 0.46]));
    paint.push(pillar([x, 0.9, -1.36], [x, 1.36, -0.96]));
    paint.push(pillar([x, 0.9, -0.3], [x, 1.36, -0.3], 0.08));
    paint.push(carPart(new THREE.BoxGeometry(0.16, 0.1, 0.12), sx * 0.94, 0.96, 0.62));
  }
  const glass = carPart(carExtrude(carPoly(CAR_GLASS), 1.5, 0.03, 1));
  // headlamps share the glass; the trim (bumpers, grille, sills) is the tyres' rubber
  const lamps = [glass];
  for (const sx of [-1, 1]) lamps.push(carPart(new THREE.BoxGeometry(0.34, 0.12, 0.05), sx * 0.58, 0.66, 1.945));
  const trim = [];
  for (const sz of [-1, 1]) trim.push(carPart(roundedBoxFresh(1.84, 0.16, 0.12), 0, 0.42, sz * 1.94));
  trim.push(carPart(new THREE.BoxGeometry(0.8, 0.14, 0.04), 0, 0.64, 1.965));
  const tail = [];
  for (const sx of [-1, 1]) tail.push(carPart(new THREE.BoxGeometry(0.3, 0.14, 0.05), sx * 0.62, 0.68, -1.945));
  return { paint: carMerge(paint), glass: carMerge(lamps), trim: carMerge(trim), tail: carMerge(tail) };
}
// roundedBox's geometry is shared and cached (and must not be mutated or
// disposed), so the bumpers take a fresh chamfered box of their own.
const roundedBoxFresh = (w, h, d) => roundedBox(w, h, d).clone();

export function car(x, z, color = 0xd06048, rotY = 0) {
  const g = new THREE.Group();
  // The preset the table was written for: automotive paint is a clearcoat over
  // pigment, the metal is UNDER the paint, and metalness 0 is what keeps a red
  // car red instead of tinting its highlight and killing the diffuse term.
  // The two boxes below are the shipped constructor calls in the shipped
  // order (the area build's Math.random draws are pinned): their geometry is
  // swapped for the car's real shape inside withLocalUuids.
  const body = surfBox(1.8, 0.6, 4, color, 'paintedMetal');
  g.add(body);
  const cabin = surfBox(1.6, 0.55, 2, 0xa8d8e8, 'glass');
  g.add(cabin);
  const wheels = [];
  for (const [wx, wz] of CAR_WHEELS) {
    // Tyres stay explicitly 'matte'. Rubber loaded with carbon black is about
    // the least specular thing in the world, and it is the one material in the
    // game that has a reason to be flatter than the paint beside it.
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16),
      surfMat(0x2a2a30, 'matte'));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.35, wz);
    g.add(wheel);
    wheels.push(wheel);
  }
  withLocalUuids(`car:${x},${z}`, () => {
    const geo = carGeometries();
    body.geometry = geo.paint;
    // a softer clearcoat than the preset's 0.35: the bonnet and roof are big
    // flat sky-facing panels, and at 0.35 the sun bloomed white across them
    body.material.roughness = 0.5;
    cabin.geometry = geo.glass;
    // bumpers and grille in the tyres' own rubber (non-indexed tyres, so the
    // four tyres and the trim merge into one draw), the tail lamps warm red
    for (const w of wheels) w.geometry = carPart(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16));
    const trim = new THREE.Mesh(geo.trim, surfMat(0x2a2a30, 'matte'));
    const tail = new THREE.Mesh(geo.tail, litMaterial(0xc8302c, { ...surfaceProps('paintedMetal'), emissive: 0x3a0808 }));
    g.add(trim, tail);
  });
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

export function bench(x, z, rotY = 0) {
  const g = new THREE.Group();
  // Sawn softwood slats. The seat is 1.6 x 0.5, so [2, 1] of the plank tile —
  // eight ~20cm boards, which is a park bench. On the seat's TOP face the
  // boards run across the bench rather than along it (a box maps 0..1 per face
  // and the plank tile always divides along u); at 8cm thick, seen from cat
  // height, that is a fair trade for having timber read as timber at all.
  const seat = surfBox(1.6, 0.08, 0.5, 0x9a7048, 'wood', 1.6, 0.5);
  seat.position.y = 0.5;
  g.add(seat);
  const back = surfBox(1.6, 0.5, 0.08, 0x9a7048, 'wood');
  back.position.set(0, 0.85, -0.25);
  g.add(back);
  for (const lx of [-0.7, 0.7]) {
    // 0.08 legs — thin-member rule.
    const leg = new THREE.Mesh(roundedBox(0.08, 0.5, 0.4), surfNoMap(0x5a4028, 'wood'));
    leg.position.set(lx, 0.25, 0);
    g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// Lamp globes close to the camera (polish-park2). At dusk render/dusk.js
// gives every globe its own emissive material at LAMP_LOOK.emissiveIntensity
// (2.4), well past the bloom threshold (1.1); a globe a metre or two from the
// lens then fills a big patch of screen and blooms into a white sun. So the
// globe dims its own emissive as the camera nears: full strength at >= FAR m,
// easing (smoothstep) down to NEAR_SCALE of it at <= NEAR m. 0.35 x 2.4 = 0.84
// keeps the warm 0xffc870 tint under the threshold, so up close it reads as a
// frosted warm globe rather than a light source; from the path it still glows.
export const LAMP_GLOBE_FADE = Object.freeze({ near: 2.5, far: 9, nearScale: 0.35 });

// Pure: the emissive multiplier for a globe `d` metres from the camera.
export function lampGlobeScale(d, f = LAMP_GLOBE_FADE) {
  const t = Math.min(1, Math.max(0, (d - f.near) / (f.far - f.near)));
  return f.nearScale + (1 - f.nearScale) * t * t * (3 - 2 * t);
}

// The globe mesh's onBeforeRender. Uses the `material` argument (the one
// actually being drawn: dusk's swap, or treefade's per-tree clone) and keeps
// that material's undimmed intensity in material.userData.lampBase. userData
// survives Material.clone() (three deep-copies it), so a treefade clone taken
// while the globe was dimmed still knows the true base; a fresh dusk material
// has no lampBase yet and is read afresh. Only a base above 1 (the dusk glow)
// is touched: the daytime globe (intensity 1) never changes.
// Per-object mutation is safe because every globe owns its material (dusk.js
// calls litMaterial per globe), and three re-uploads uniforms whenever the
// material changes between draws. Only the perspective view camera counts:
// shadow passes call onBeforeShadow, not this, but any other camera (an
// orthographic map view, say) is ignored rather than measured from.
function dimNearGlobe(renderer, scene, camera, geometry, material) {
  if (!material || Array.isArray(material)) return;
  const ud = material.userData;
  if (ud.lampBase === undefined) ud.lampBase = material.emissiveIntensity;
  const base = ud.lampBase;
  if (!(base > 1)) return;
  // Any other camera sees the full glow, not the last view's dimmed value.
  if (!camera?.isPerspectiveCamera) { material.emissiveIntensity = base; return; }
  const a = this.matrixWorld.elements, c = camera.matrixWorld.elements;
  const dx = a[12] - c[12], dy = a[13] - c[13], dz = a[14] - c[14];
  material.emissiveIntensity = base * lampGlobeScale(Math.sqrt(dx * dx + dy * dy + dz * dz));
}

export function lampPost(x, z) {
  const g = new THREE.Group();
  // Painted cast column. 'paintedMetal' is map-less, so the cylinder rule does
  // not bite, and it stays painted rather than bare for the reason recorded on
  // fireEscape: at metalness 0.85 a dark 6-sided pole against this dim baked
  // probe goes to a near-black pin with a chrome rim.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 10),
    surfMat(0x3a3a42, 'paintedMetal'));
  pole.position.y = 1.6;
  g.add(pole);
  // The globe keeps its plain emissive material and takes no preset. It is a
  // LIGHT: 'glass' at roughness 0.08 would resolve this dim probe into a hard
  // bright blob sitting on top of the emissive glow, which reads as an
  // artefact rather than as a lamp.
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10),
    litMaterial(0xfff2c0, { emissive: 0x8a7a40 }));
  lamp.position.y = 3.3;
  // render/dusk.js lights the globe at dusk (a material swap, so the globe
  // must survive render/mergeprops.js's merge as its own mesh).
  lamp.userData.lampGlobe = true;
  lamp.userData.noMerge = true;
  // ...and dims itself when the camera comes close (dimNearGlobe above).
  lamp.onBeforeRender = dimNearGlobe;
  g.add(lamp);
  g.position.set(x, 0, z);
  // The globe's height, for render/ambient.js's dusk moths (read off the
  // scene, so a lamp added in a world file gets moths with no second edit).
  g.userData.lampGlobeY = lamp.position.y;
  // The walk tree fade's tag (polish-viewclear2): the pole and globe shapes.
  g.userData.fadeOccluder = [{ t: 'cyl', r: 0.08, y0: 0, y1: 3.2 }, { t: 'ell', y: 3.3, r: 0.22, ry: 0.22 }];
  return g;
}

// A rain puddle. THE one prop on this pass that every area gets whether it
// authored it or not: game/walk.js drops three more of these on any rainy walk
// from a single shared call, so the surface decision belongs here rather than
// in five world files.
//
// 'water' is materials.js's own named answer for this shape — its docstring
// says "ponds, the harbour, puddles" in as many words. Roughness 0.12 with no
// map: a puddle IS a smooth dielectric film, and the small roughness stands in
// for the fine chop this flat disc has no geometry for. It stays a 12-segment
// CircleGeometry and must NOT become a createWater instance — that rig carries
// an animated normal map, a depth ramp and a foam band, all of which are for a
// body of water with a shoreline, and none of which a 0.8m disc can afford or
// wants.
// `y` is the ground under it (0 on a flat map; the rain's puddles pass it).
//
// The wet look (polish-light) lives in the shader, not in more objects: the
// disc is still ONE mesh, ONE CircleGeometry and ONE material (the area builds
// pin their Math.random draw counts through three's uuids). A dark centre,
// a lighter sky sheen toward the rim, a soft oval glint, and an alpha that
// reaches 0 at 0.94r — inside the 12-gon's inner apothem (cos 15deg = 0.966r),
// so the polygon's corners never show. puddleShade() is the JS mirror.
export const PUDDLE_LOOK = Object.freeze({
  color: 0x5a7890, centreDark: 0.6, rimLight: 1.15,
  fadeStart: 0.72, fadeEnd: 0.94, alpha: 0.9, glint: 0.55,
});

const smooth01 = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Colour multiplier `k` and opacity at normalised radius d (0 centre, 1 rim).
export function puddleShade(d) {
  const L = PUDDLE_LOOK;
  const k = L.centreDark + (L.rimLight - L.centreDark) * smooth01(0, 0.85, d);
  const alpha = L.alpha * (1 - smooth01(L.fadeStart, L.fadeEnd, d));
  return { k, alpha };
}

const glsl = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export function puddle(x, z, r = 0.8, y = 0) {
  const L = PUDDLE_LOOK;
  const mat = surfMat(L.color, 'water');
  mat.transparent = true;
  mat.depthWrite = false;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;
  // CircleGeometry lies in its local XY plane (the mesh is turned flat below),
  // so position.xy / r is the normalised radius. The uniform is per material:
  // onBeforeCompile runs for every material even when the program is shared.
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPuddleR = { value: r };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uPuddleR;
varying vec2 vPud;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPud = position.xy / uPuddleR;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vPud;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float pudD = length(vPud);
diffuseColor.rgb *= mix(${glsl(L.centreDark)}, ${glsl(L.rimLight)}, smoothstep(0.0, 0.85, pudD));
diffuseColor.a *= ${glsl(L.alpha)} * (1.0 - smoothstep(${glsl(L.fadeStart)}, ${glsl(L.fadeEnd)}, pudD));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(${glsl(L.glint)}) * (1.0 - smoothstep(0.0, 0.22, length((vPud - vec2(-0.32, 0.28)) * vec2(1.0, 2.2))));`);
  };
  mat.customProgramCacheKey = () => 'puddle-v1';
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + 0.02, z);
  m.userData.puddle = true;
  // Transparent now, so it sorts with the other see-through ground layers:
  // after the contact decals (-1) and paw prints (-2), but always before the
  // rain rings, splash rings and dusk lamp pools (0) that sit on top of it.
  m.renderOrder = -0.5;
  // vPud reads the disc's OWN local XY: a merge would bake the world
  // transform into position and break it (today a puddle is always a
  // top-level mesh, which mergeprops skips anyway).
  m.userData.noMerge = true;
  return m;
}

// A boulder. Takes 'cobble's light response (0.8 — stone, a touch smoother
// than the default because weather polishes it) with its map left off: a
// dodecahedron's UVs are a polyhedral unwrap, so a 4x4 grid of setts laid over
// it reads as a net thrown over a rock rather than as the rock's own surface.
// Cylinder rule, applied to a faceted solid.
export function rock(x, z) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), surfNoMap(0x9a9aa2, 'cobble'));
  m.position.set(x, 0.3, z);
  return m;
}

export function billboard(x, z, rotY = 0, title = 'THE DAD SHOW', subtitle = 'now streaming · very good episodes') {
  const g = new THREE.Group();
  for (const px of [-1.7, 1.7]) {
    // 0.18 posts: thin-member rule, wood's response without the tile.
    const post = new THREE.Mesh(roundedBox(0.18, 3.2, 0.18),
      surfNoMap(0x7a5230, 'wood'));
    post.position.set(px, 1.6, 0);
    g.add(post);
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6ecd8';
  ctx.fillRect(0, 0, 512, 288);
  ctx.strokeStyle = '#b05a4a';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 492, 268);
  ctx.fillStyle = '#2a3550';
  ctx.textAlign = 'center';
  ctx.font = 'bold 72px Avenir, Trebuchet MS, sans-serif';
  ctx.fillText(title, 256, 140);
  ctx.font = '28px Avenir, Trebuchet MS, sans-serif';
  ctx.fillStyle = '#b05a4a';
  ctx.fillText(subtitle, 256, 200);
  ctx.font = '34px sans-serif';
  ctx.fillText('📺  🐈  👨', 256, 250);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 2.5),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  panel.position.y = 2.9;
  g.add(panel);
  // The hoarding behind the panel is a board-by-board timber back, 4.5 x 2.6 —
  // [5, 3] of the plank tile, i.e. twenty ~22cm boards. The PANEL itself keeps
  // its MeshBasicMaterial: it is an unlit painted sign, deliberately outside
  // the lighting model so the poster stays legible at dusk.
  const back = surfBox(4.5, 2.6, 0.08, 0x8a7048, 'wood');
  back.position.set(0, 2.9, -0.06);
  g.add(back);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// `surface` is opt-in, exactly like path()'s and for the same reason. The
// obvious candidate is 'cobble' — the sett grid is the closest thing in the
// vocabulary to paving slabs, and at a derived repeat it lays roughly 0.3m
// stones down the strip. It is NOT defaulted on, because a sidewalk over a
// ground plane already carrying the cobble tile would put two grids at
// different densities on top of each other, the one way to make a tiled
// surface look like a mistake. That is why the Docks' two sidewalks use
// 'flagstone' instead (Stream 4 round two): big slabs, not a second grid.
export function sidewalk(x1, z1, x2, z2, w = 1.2, { surface, color = 0xd8d0c0 } = {}) {
  // a lighter strip beside a street — reuses path() geometry with pavement color
  const len = Math.hypot(x2 - x1, z2 - z1);
  // Segmented the same way path() is — see its comment and segsFor() above.
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, len, segsFor(w, 1, 6), segsFor(len, 4, 64)),
    surface ? surfMat(color, surface, w, len) : mat(color),
  );
  m.rotation.x = -Math.PI / 2;
  // atan2 of the NEGATED delta, not the negated atan2 — they are not the same
  // thing, and the difference is a bug this drew for as long as the park has
  // existed. After rotation.x = -PI/2 the plane's local +Y (its length axis)
  // maps to world (-sin0, 0, -cos0), so matching the segment direction
  // (dx, dz) needs 0 = atan2(-dx, -dz). The old `-atan2(dx, dz)` agrees with
  // that ONLY when the segment is axis-aligned, where the two differ by pi and
  // a rectangle is symmetric under it — which is why every path in the
  // neighbourhood, the Docks and the den looked right and nobody noticed. On a
  // diagonal they differ by up to 90 degrees, and the strip was drawn along
  // the WRONG DIAGONAL of its own bounding box: park's (0,20)->(-14,6) walk
  // was rendered running (-14,20)->(0,6) instead.
  m.rotation.z = Math.atan2(-(x2 - x1), -(z2 - z1));
  m.position.set((x1 + x2) / 2, 0.008, (z1 + z2) / 2);
  applyMacroVariation(m, surface, len);
  return m;
}

// Fallen leaves. LEFT FLAT: five 9cm discs lying on the floor, every one of
// them an order of magnitude smaller than any tile in the vocabulary, and
// 'foliage' at 0.8 would put a sheen on dead leaves, which is the one thing
// dead leaves do not have.
export function leafLitter(x, z, seed = 1) {
  const g = new THREE.Group();
  const colors = [0xc8823a, 0xb05a2a, 0xd8a04e];
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.09, 5), mat(colors[(seed + i) % 3]));
    leaf.rotation.x = -Math.PI / 2;
    leaf.position.set(x + Math.sin(seed * 3 + i * 2.1) * 0.8, 0.015, z + Math.cos(seed * 2 + i * 1.7) * 0.8);
    g.add(leaf);
  }
  return g;
}

export function bike(x, z, rotY = 0) {
  const g = new THREE.Group();
  for (const wz of [-0.45, 0.45]) {
    // Tyre, so 'matte' on purpose — same call as the car's wheels.
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 18),
      surfMat(0x3a3a42, 'matte'));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.28, wz);
    g.add(wheel);
  }
  // Enamelled frame tubes. 'paintedMetal' carries no map, so 6cm members are
  // no problem for it — the whole thin-member rule is about tiles, and this
  // preset is pure light response.
  const frame = surfBox(0.06, 0.06, 0.9, 0xd06048, 'paintedMetal');
  frame.position.y = 0.45; frame.rotation.x = 0.2;
  g.add(frame);
  const bars = surfBox(0.4, 0.06, 0.06, 0x3a3a42, 'paintedMetal');
  bars.position.set(0, 0.62, -0.45);
  g.add(bars);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A flat-topped box the cat can stand on — crate stacks, porch/shed roofs,
// dune ledges. Spans y `yBottom`..`yTop` so several calls at the same x/z
// with increasing yBottom stack into a tiered climbing platform.
// `surface` is opt-in for the same reason ground()'s is: the Docks' crates are
// dock timber, the neighborhood's and the seaside's are whatever they already
// were, and neither should have to change for the other. Pass `undefined` for
// `color` to keep the default while still reaching the options object.
export function platform(x, z, yTop, yBottom = 0, size = 1.2, color = 0xc8a678, { surface } = {}) {
  const h = yTop - yBottom;
  const m = surface ? surfBox(size, h, size, color, surface) : box(size, h, size, color);
  m.position.set(x, yBottom + h / 2, z);
  return m;
}

// ---------------------------------------------------------------------------
// Dockside props (v18 Task 2.6, "The Old Docks").
//
// Every one of these is written so its WALKABLE TOP SURFACE is a number the
// caller passes in or can read straight off the signature, because the Docks'
// perch chains are authored against those exact heights. If you change a
// height here, docks.js's perch array (and the hop math in its comments) has
// to move with it — test/climbing.test.js BFSes the real shipped arrays and
// will fail loudly if the two drift apart.
// ---------------------------------------------------------------------------

// A flat-roofed brick warehouse. Unlike house(), whose cone roof has nowhere
// to stand, the roof here is a flat deck at exactly `h` ringed by a parapet
// whose top is `h + PARAPET`. Those are the two numbers the roof chains use:
// docks.js perches sit on the parapet lip, not on the deck.
export const PARAPET = 0.3;

// `bodySurface` is 'brick' or 'siding' — fired masonry or painted lap boards.
// Both are warehouse walls; which one a building wants is a colour decision
// the caller has already made (docks.js's warm bodies are brick, its two cool
// grey-blue ones are painted siding), so it is passed rather than guessed.
//
// `look` (polish-docks2) = { clear?: [{x, z}] world perch points on or near
// the roof, roofline? }. Every mesh below is still made by its shipped call, in
// its shipped order — the Math.random draws and the roundedBox cache are
// exactly what they were — and then warehouselook.js swaps their geometry for
// baked, vertex-coloured masonry, window trim and downpipes on a local uuid
// stream. No mesh is added.
export function warehouse(x, z, w, d, h, bodyColor = 0x8a7c74, roofColor = 0x4a4650, bodySurface = 'brick', look = {}) {
  const g = new THREE.Group();
  // Colour compensation, per the luminance table in render/textures.js's
  // header: a map multiplies the base colour and the brick tile's mean is
  // 0.948, so a textured wall lands ~5% darker than the hex it ships with.
  // Lifting the brick bodies by 1/0.948 puts them back on their authored
  // colour. Siding's mean is 0.988 — inside the noise, left alone.
  const body = surfBox(w, h, d, bodySurface === 'brick' ? lift(bodyColor, 1 / 0.948) : bodyColor, bodySurface);
  body.position.y = h / 2;
  g.add(body);
  // flat roof deck, then a parapet lip on all four sides. The deck is the only
  // part that carries the shingle map: the lips are 0.3 tall and a tile
  // squashed into them would read as a stripe rather than as a roof.
  const deck = surfBox(w, 0.12, d, roofColor, 'shingle', w, d);
  deck.position.y = h + 0.06;
  g.add(deck);
  for (const [lw, ld, lx, lz] of [
    [w, 0.16, 0, d / 2 - 0.08], [w, 0.16, 0, -d / 2 + 0.08],
    [0.16, d, w / 2 - 0.08, 0], [0.16, d, -w / 2 + 0.08, 0],
  ]) {
    const lip = box(lw, PARAPET, ld, roofColor);
    lip.position.set(lx, h + PARAPET / 2, lz);
    g.add(lip);
  }
  // Two rows of windows on the long (x) faces. userData.window is what
  // walk.js's dusk pass looks for when it swaps in the warm emissive glow —
  // the same hook house() uses, so the Docks lights up at dusk for free.
  // 'glass' is the only sub-0.3-roughness preset used anywhere in this file,
  // and a pane is what it is for: small, vertical, and the one thing on a
  // warehouse elevation that should catch a highlight. The dusk pass replaces
  // the material outright, so the two never fight.
  const cols = Math.max(2, Math.floor(w / 2.6));
  for (const face of [1, -1]) {
    for (let i = 0; i < cols; i++) {
      for (const wy of h > 3.4 ? [1.1, 2.7] : [1.1]) {
        const win = surfBox(0.8, 0.7, 0.08, 0xa8d8e8, 'glass');
        win.userData.window = true;
        win.position.set(-w / 2 + (i + 0.5) * (w / cols), wy, face * (d / 2 + 0.02));
        g.add(win);
      }
    }
  }
  // a narrower column of windows on the short (x) faces, so no elevation of
  // the building reads as a blank slab
  for (const face of [1, -1]) {
    for (const wy of h > 3.4 ? [1.1, 2.7] : [1.1]) {
      const win = surfBox(0.08, 0.7, 0.8, 0xa8d8e8, 'glass');
      win.userData.window = true;
      win.position.set(face * (w / 2 + 0.02), wy, 0);
      g.add(win);
    }
  }
  const door = surfBox(1.6, 2.2, 0.12, 0x53433a, 'wood');
  // polish-quayside: a low building (the Docks' fish shed, h 1.8) had a 2.2 m
  // door and its lintel standing up past the roof. The door now stops 0.4 m
  // under the roof (squashed, not a new box: the build's draws are pinned).
  const doorH = Math.min(2.2, h - 0.4);
  door.scale.y = doorH / 2.2;
  door.position.set(0, doorH / 2, d / 2 + 0.03);
  g.add(door);
  const lintel = box(2.0, 0.16, 0.2, 0x5e5450);
  lintel.position.set(0, doorH + 0.1, d / 2 + 0.05);
  g.add(lintel);
  // userData.look: the per-building picks (roofline, loading-bay x, colours),
  // read by test/warehouselook.test.js. A stepped roofline raises the treefade
  // box's maxY by up to 1.28 m (h + 0.3 + 0.98) over the whole footprint,
  // though the panels are only the middle of the long faces — accepted.
  g.userData.look = withLocalUuids(`warehouse-${x},${z}`, () => bakeWarehouse(g, { x, z, w, d, h, roofColor, look }));
  g.position.set(x, 0, z);
  return g;
}

// A rooftop water tank / vent housing — the thing that turns a flat roof into
// one more step of a chain. `yBottom` is the roof deck it stands on; the
// walkable top is `yBottom + height`.
export function roofTank(x, z, yBottom, height = 0.9, r = 0.85) {
  const g = new THREE.Group();
  // THE ONE MAP PROMOTION IN WAVE 4.2 (see the ROUND PRIMITIVES block at the
  // top of this file for the survey that found it, and for the four categories
  // that came back negative).
  //
  // This was a 10-sided cylinder in flat 0x6a5a4a — a brown drum on a
  // warehouse roof, which is a timber-staved water tank and has always been
  // drawn as one. It took no surface because the cylinder rule bound: a planar
  // tile on a 10-sided silhouette smears. At 16 sides that stops being true,
  // and what is left is a cylindrical unwrap — three's CylinderGeometry runs
  // u AROUND the barrel and v UP it — which is the one UV layout the plank
  // tile is perfect for. The tile divides four boards along u, so a repeat
  // derived from the 5.3m CIRCUMFERENCE (not the diameter) lays roughly
  // twenty ~26cm STAVES around the tank, running vertically, exactly the way a
  // real one is built. The lid takes the same tile off its own top face.
  //
  // Colour unchanged: plank's luminance mean is 0.980, inside the noise, so no
  // compensation is due (see the table in render/textures.js's header).
  const circumference = 2 * Math.PI * r;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height, 16),
    surfMat(0x6a5a4a, 'wood', circumference, height));
  drum.position.y = yBottom + height / 2;
  g.add(drum);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.08, 16), mat(0x8a7a62));
  cap.position.y = yBottom + height;
  g.add(cap);
  g.position.set(x, 0, z);
  return g;
}

// A steel shipping container. Long axis runs along local +x, so rotY turns it
// broadside. Walkable top is exactly CONTAINER_H.
export const CONTAINER_H = 2.6;

export function shippingContainer(x, z, rotY = 0, color = 0xb05a4a) {
  const g = new THREE.Group();
  // 'paintedMetal', not 'bareMetal': a container is a painted box, the metal
  // is under the paint, and metalness > 0 would tint the highlight with the
  // body colour and take the red and the blue out of the yard. No map — the
  // corrugation is already geometry, and a tile on top of it is two rhythms.
  const body = surfBox(6, CONTAINER_H, 2.5, color, 'paintedMetal');
  body.position.y = CONTAINER_H / 2;
  g.add(body);
  for (let i = 0; i < 7; i++) { // corrugated ribs
    const ribColor = color === 0xb05a4a ? 0x9a4a3a : 0x3a5a78;
    const rib = surfBox(0.1, CONTAINER_H - 0.3, 2.56, ribColor, 'paintedMetal');
    rib.position.set(-2.6 + i * 0.87, CONTAINER_H / 2, 0);
    g.add(rib);
  }
  const lid = surfBox(6.05, 0.1, 2.55, 0x6a6a72, 'paintedMetal');
  lid.position.y = CONTAINER_H;
  g.add(lid);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A night-market stall: counter, four posts, striped awning. The awning top
// is STALL_AWNING and is the first step of the Docks' crane chain.
export const STALL_AWNING = 1.3;

export function marketStall(x, z, rotY = 0, awningColor = 0xc85a5a) {
  const g = new THREE.Group();
  const counter = surfBox(1.9, 0.75, 1.0, 0x9a7048, 'wood');
  counter.position.y = 0.375;
  g.add(counter);
  for (const [px, pz] of [[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.5], [0.9, 0.5]]) {
    const post = box(0.08, STALL_AWNING, 0.08, 0x6a5230);
    post.position.set(px, STALL_AWNING / 2, pz);
    g.add(post);
  }
  // The awning stays FLAT, and 'matte' says so out loud rather than leaving a
  // reviewer to wonder whether it was missed: it is canvas, there is no cloth
  // tile in the vocabulary, and the nearest ones (siding, plank) would make a
  // striped awning read as a striped plank. The stripes are already geometry.
  const awning = surfBox(2.2, 0.1, 1.3, awningColor, 'matte');
  awning.position.y = STALL_AWNING;
  g.add(awning);
  for (let i = 0; i < 3; i++) { // stripes, so two stalls side by side read apart
    const stripe = box(0.35, 0.12, 1.32, 0xf0e8d8);
    stripe.position.set(-0.7 + i * 0.7, STALL_AWNING, 0);
    g.add(stripe);
  }
  // a crate of fish on the counter, purely so the stall reads as a fish market
  const crate = box(0.5, 0.3, 0.4, 0xc8a678);
  crate.position.set(0.4, 0.9, 0);
  g.add(crate);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A wall-hung fire escape: one grated landing per entry in `heights` (each
// value is the landing's WALKABLE TOP), joined by ladders. The landings are
// the perch steps; the ladders are decoration, since climbing in this game is
// perch-to-perch and not a continuous surface.
//
// `depth` is how far the assembly reaches BACKWARDS (local +z) toward the
// wall it hangs on. The group's origin sits 0.55 in from the landing's front
// edge — that origin is the perch point — so the caller places the origin
// where the cat should stand and sizes `depth` to meet the wall behind it.
// Without that the landings float in open air, which is exactly how the first
// draft of this looked in the browser.
//
// 'paintedMetal', and NOT 'bareMetal' — which is what this was built with
// first, and the swap is recorded because the reasoning applies to every dark
// metal prop in the game. bareMetal is metalness 0.85, i.e. ~85% of the
// diffuse term is thrown away and the prop shows mostly the environment; the
// environment here is a baked RoomEnvironment at envIntensity 0.32-0.45, which
// is dim. Against this assembly's authored greys (0x3e3e46, 0x4a4a52) that
// flattened the whole fire escape to one near-black shape at the range a cat
// actually climbs it — the landings, the stiles and the wall plate stopped
// being separable at all, which is a real change to how a load-bearing perch
// chain reads rather than a material nicety. paintedMetal keeps metalness at 0
// so the greys survive and each member keeps its own value, and its roughness
// 0.35 still tells the steelwork apart from the matte brick behind it.
// bareMetal wants a LIGHT colour and a bright probe; this game has neither.
export function fireEscape(x, z, rotY = 0, heights = [1.9, 3.9], depth = 2.2) {
  const g = new THREE.Group();
  const steel = (w, h, d, color) => surfBox(w, h, d, color, 'paintedMetal');
  const back = depth - 0.55; // local z of the wall face
  let prev = 0;
  for (const h of heights) {
    const landing = steel(1.7, 0.1, depth, 0x4a4a52);
    landing.position.set(0, h - 0.05, depth / 2 - 0.55);
    g.add(landing);
    for (const rx of [-0.85, 0.85]) { // side handrails
      const rail = steel(0.06, 0.55, depth, 0x5a5a62);
      rail.position.set(rx, h + 0.25, depth / 2 - 0.55);
      g.add(rail);
      const top = steel(0.1, 0.08, depth, 0x6a6a72);
      top.position.set(rx, h + 0.55, depth / 2 - 0.55);
      g.add(top);
    }
    const front = steel(1.7, 0.55, 0.06, 0x5a5a62); // front rail
    front.position.set(0, h + 0.25, -0.55);
    g.add(front);
    // ladder up from the previous landing, on the front edge, with rungs
    for (const lx of [-0.28, 0.28]) {
      const stile = steel(0.06, h - prev, 0.06, 0x6a6a72);
      stile.position.set(lx, prev + (h - prev) / 2, -0.52);
      g.add(stile);
    }
    const rungs = Math.max(2, Math.round((h - prev) / 0.32));
    for (let i = 1; i < rungs; i++) {
      const rung = steel(0.56, 0.045, 0.045, 0x6a6a72);
      rung.position.set(0, prev + (i / rungs) * (h - prev), -0.52);
      g.add(rung);
    }
    prev = h;
  }
  // the bracket plate bolted flat to the wall, so the whole thing reads as
  // hung off the building rather than standing in front of it
  const plate = steel(1.9, heights[heights.length - 1] + 0.4, 0.1, 0x3e3e46);
  plate.position.set(0, (heights[heights.length - 1] + 0.4) / 2, back);
  g.add(plate);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A dockside gantry crane. Four legs carry a deck whose top is CRANE_DECK;
// the operator cab stands on the deck and its roof is CRANE_CAB. Those are
// the two tall steps of the Docks' south-bank chain.
export const CRANE_DECK = 4.0;
export const CRANE_CAB = 5.4;

// The crane is the area's one big piece of MACHINERY: yard-painted steel, so
// 'paintedMetal' throughout — the paint is what you see, which is why that
// preset keeps metalness at 0 and the crane stays the colour it ships. The
// cable and hook are painted rather than bare for the reason recorded on
// fireEscape above: against this dim baked probe, bareMetal's 0.85 metalness
// takes a dark prop to near-black rather than to steel.
export function dockCrane(x, z, rotY = 0) {
  const g = new THREE.Group();
  const painted = (w, h, d, color) => surfBox(w, h, d, color, 'paintedMetal');
  for (const [lx, lz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) {
    const leg = painted(0.34, CRANE_DECK, 0.34, 0xb0742a);
    leg.position.set(lx, CRANE_DECK / 2, lz);
    g.add(leg);
    const brace = painted(0.18, 0.18, 4.4, 0x8a5a20);
    brace.position.set(lx, CRANE_DECK * 0.55, 0);
    g.add(brace);
  }
  const deck = painted(5.4, 0.25, 5.4, 0x8a5a20);
  deck.position.y = CRANE_DECK - 0.125;
  g.add(deck);
  // The operator cab stands on the deck at local (-1, -1) and its roof top is
  // CRANE_CAB. docks.js's crane chain places its last perch on that roof, so
  // the offset is part of the contract, not a styling choice.
  const cab = painted(2.0, CRANE_CAB - CRANE_DECK, 2.0, 0xc8862a);
  cab.position.set(-1.0, (CRANE_DECK + CRANE_CAB) / 2, -1.0);
  g.add(cab);
  const cabRoof = painted(2.2, 0.12, 2.2, 0x8a5a20);
  cabRoof.position.set(-1.0, CRANE_CAB, -1.0);
  g.add(cabRoof);
  // jib reaching out over the water on the cab's far side, with a hook block
  const jib = painted(0.3, 0.3, 7, 0xb0742a);
  jib.position.set(1.4, CRANE_DECK + 0.9, 3.2);
  g.add(jib);
  const cable = painted(0.05, 2.4, 0.05, 0x3a3a42);
  cable.position.set(1.4, CRANE_DECK - 0.3, 6.2);
  g.add(cable);
  const hook = painted(0.35, 0.35, 0.35, 0x5a5a62);
  hook.position.set(1.4, CRANE_DECK - 1.6, 6.2);
  g.add(hook);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A mooring bollard with a coil of rope — quayside flavour, and a low perch
// (top BOLLARD_H) for the bank edges.
export const BOLLARD_H = 0.55;

export function bollard(x, z) {
  const g = new THREE.Group();
  // Painted cast iron, and painted rather than bare for the same reason the
  // containers are: at 0.85 metalness an 8-sided cylinder this dark would go
  // to a row of near-black pins with a chrome rim. The rope coil stays flat —
  // there is no rope tile, and hemp is matte anyway.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, BOLLARD_H, 14), surfMat(0x3a3a42, 'paintedMetal'));
  post.position.y = BOLLARD_H / 2;
  g.add(post);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 8), surfMat(0x4a4a52, 'paintedMetal'));
  cap.position.y = BOLLARD_H;
  g.add(cap);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 18), mat(0xc8b088));
  rope.rotation.x = -Math.PI / 2;
  rope.position.y = 0.06;
  g.add(rope);
  g.position.set(x, 0, z);
  return g;
}

// An oil-drum barrel. No collider anywhere it is used — like cardboardBox, it
// is cover to hide things BEHIND rather than an obstacle.
export function barrel(x, z, color = 0x4a6a5a) {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.75, 16), mat(color));
  drum.position.y = 0.375;
  g.add(drum);
  for (const ry of [0.22, 0.53]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), mat(0x2f2f36));
    band.position.y = ry;
    g.add(band);
  }
  g.position.set(x, 0, z);
  return g;
}

// polish-quayside: the barge's real shape, all inside the old box barge's
// bounding box (x ±1.65, y -0.05 .. 2.75, z ±4.55), so its contact shadow
// and caster class do not move. Bow at +z (the deck cargo end), stern at -z.
//
// The plan outline: straight sides, a bluff rounded bow and a rounder stern.
const BARGE = { half: 1.6, bowZ: 2.2, bowLen: 2.3, sternZ: -3.85, sternLen: 0.65, top: 0.65, keel: -0.05 };
function bargeOutline(out = 0) {
  const { half, bowZ, bowLen, sternZ, sternLen } = BARGE;
  const a = half + out, n = 9, pts = [];
  // starboard (+x) side from the stern round the bow to port, then back
  for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI / 2; pts.push([a * Math.cos(t), bowZ + (bowLen + out) * Math.sin(t)]); }
  for (let i = 1; i <= n; i++) { const t = Math.PI / 2 + (i / n) * Math.PI / 2; pts.push([a * Math.cos(t), bowZ + (bowLen + out) * Math.sin(t)]); }
  for (let i = 0; i <= n; i++) { const t = Math.PI + (i / n) * Math.PI / 2; pts.push([a * Math.cos(t), sternZ + (sternLen + out) * Math.sin(t)]); }
  for (let i = 1; i < n; i++) { const t = 1.5 * Math.PI + (i / n) * Math.PI / 2; pts.push([a * Math.cos(t), sternZ + (sternLen + out) * Math.sin(t)]); }
  return pts; // closed, counter-clockwise seen from above (+y)
}
// A wall round a closed outline from y0 to y1, its foot pulled in by `tuck`
// (the hull's tumble-home under the waterline), with smooth outward normals.
function bargeWall(pts, y0, y1, tuck = 0, outward = 1) {
  const n = pts.length, pos = [], nor = [];
  const nrm = pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    return [tz / l * outward, -tx / l * outward];
  });
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, p = pts[i], q = pts[j], np = nrm[i], nq = nrm[j];
    const lo = (v, nn) => [v[0] - nn[0] * tuck * outward, y0, v[1] - nn[1] * tuck * outward];
    const P0 = lo(p, np), Q0 = lo(q, nq), P1 = [p[0], y1, p[1]], Q1 = [q[0], y1, q[1]];
    const quad = outward > 0 ? [P0, Q1, Q0, P0, P1, Q1] : [P0, Q0, Q1, P0, Q1, P1];
    const ns = outward > 0 ? [np, nq, nq, np, np, nq] : [np, nq, nq, np, nq, np];
    for (const v of quad) pos.push(...v);
    for (const nn of ns) { const l = Math.hypot(nn[0], 0.12, nn[1]); nor.push(nn[0] / l, 0.12 * outward / l, nn[1] / l); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
// A flat cap over a closed outline at height y (a fan from its centre).
function bargeCap(pts, y) {
  const pos = [];
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p[0]; cz += p[1]; }
  cx /= pts.length; cz /= pts.length;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    pos.push(cx, y, cz, p[0], y, p[1], q[0], y, q[1]);
  }
  return upGeometry(pos);
}
// Flat triangles (a flat [x, y, z, ...] list), each turned to face up.
function upGeometry(pos) {
  for (let i = 0; i < pos.length; i += 9) {
    const ux = pos[i + 3] - pos[i], uz = pos[i + 5] - pos[i + 2], vx = pos[i + 6] - pos[i], vz = pos[i + 8] - pos[i + 2];
    if (uz * vx - ux * vz < 0) for (let k = 0; k < 3; k++) [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
// Paint a non-indexed geometry one colour (position + normal + color only).
function bargePaint(g, hex) {
  let out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  if (!out.attributes.normal) out.computeVertexNormals();
  if (out.attributes.uv) out.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = out.attributes.position.count, col = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) col.set([c.r, c.g, c.b], v * 3);
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
const bargeBox = (w, h, d, x, y, z, hex) => bargePaint(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), hex);
const bargeRod = (a, b, t, hex) => {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = new THREE.BoxGeometry(t, d.length(), t);
  g.applyMatrix4(new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), new THREE.Vector3(1, 1, 1)));
  return bargePaint(g, hex);
};
// The wheelhouse and everything that is not hull, rail or cargo, as one
// vertex-coloured mesh: windows, roofs, the coachline, the rails, the life
// ring, the stack's band and the tiller post.
function bargeDressing(color) {
  const parts = [];
  const cream = 0xe4d6b8, roof = 0x7a3a2e, glass = 0x26323e, white = 0xf2efe6, red = 0xc8463a, rail = 0xd8d0bc;
  // a cream coachline round the hull, just proud of it
  parts.push(bargePaint(bargeWall(bargeOutline(0.012), 0.4, 0.48), 0xe8dcc0));
  // the deck, inside the gunwale: dark painted steel
  parts.push(bargePaint(bargeCap(bargeOutline(-0.06), 0.6), lerpBargeHex(color, 0x1e2026, 0.55)));
  // the cabin (z -3.7 .. -0.7) is the old cream box; its roof overhangs a
  // little in barge red, and a wheelhouse rises off its aft end
  parts.push(bargeBox(2.36, 0.08, 3.16, 0, 1.75, -2.2, roof));
  parts.push(bargeBox(1.9, 0.62, 1.3, 0, 1.83, -3.0, cream));
  parts.push(bargeBox(2.06, 0.08, 1.46, 0, 2.45, -3.0, roof));
  // windows: wheelhouse all round, portholes-ish squares down the cabin
  const pane = (w, h, x, y, z, nx) => parts.push(bargeBox(nx ? 0.02 : w, h, nx ? w : 0.02, x, y, z, glass));
  for (const sx of [-1, 1]) {
    pane(0.4, 0.34, sx * 0.955, 2.0, -3.3, true);
    pane(0.4, 0.34, sx * 0.955, 2.0, -2.7, true);
    for (const z of [-3.3, -2.7, -1.25]) pane(0.36, 0.3, sx * 1.105, 1.22, z, true);
  }
  for (const x of [-0.5, 0, 0.5]) pane(0.36, 0.34, x, 2.0, -2.345, false);
  pane(0.9, 0.32, 0, 1.24, -0.695, false); // the cabin's front window
  // a red life ring on each side of the wheelhouse
  for (const sx of [-1, 1]) {
    const ring = new THREE.TorusGeometry(0.2, 0.05, 6, 14);
    ring.rotateY(Math.PI / 2);
    parts.push(bargePaint(ring.translate(sx * 1.16, 1.25, -1.95), white));
    const band = new THREE.TorusGeometry(0.2, 0.052, 6, 4, Math.PI / 3);
    band.rotateY(Math.PI / 2);
    parts.push(bargePaint(band.translate(sx * 1.16, 1.25, -1.95), red));
  }
  // the stack's red band
  parts.push(bargePaint(new THREE.CylinderGeometry(0.175, 0.175, 0.22, 12).translate(0, 2.55, -1.3), red));
  // a rail round the foredeck: posts and a top rail each side, and across the bow
  const ry = 0.66, rh = 1.18;
  for (const sx of [-1, 1]) {
    const x = sx * 1.5;
    for (const z of [-0.45, 0.6, 1.65, 2.6]) parts.push(bargeRod([x, ry, z], [x, rh, z], 0.05, rail));
    parts.push(bargeRod([x, rh, -0.45], [x, rh, 2.6], 0.045, rail));
    parts.push(bargeRod([x, rh, 2.6], [sx * 0.6, rh, 4.2], 0.045, rail));
    parts.push(bargeRod([sx * 0.6, ry, 4.2], [sx * 0.6, rh, 4.2], 0.05, rail));
  }
  parts.push(bargeRod([-0.6, rh, 4.2], [0.6, rh, 4.2], 0.045, rail));
  // a bollard on the foredeck and one at the stern
  parts.push(bargePaint(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8).translate(0, 0.75, 4.35), 0x2a2a30));
  parts.push(bargePaint(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8).translate(0, 0.75, -4.1), 0x2a2a30));
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
const lerpBargeHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

// A moored canal barge. Sits IN the water on purpose and carries no perch and
// no collectible: the Docks canal is scenery plus a bridged crossing, never a
// place the player has to reach (see docks.js's header — Sea Legs may never
// ship, so nothing may depend on swimming).
export function barge(x, z, rotY = 0, color = 0x3a5a78) {
  const g = new THREE.Group();
  // Painted steel hull; the cabin and gunwale stay flat (a 2.2m cabin is too
  // small for a siding tile to read as anything but stripes), and the deck
  // cargo is the same dock timber as the crates ashore.
  // These are the shipped constructor calls in the shipped order (the area
  // build's Math.random draws are pinned). polish-quayside swaps the hull and
  // gunwale boxes for the lofted hull and its rubbing strake, moves the stack
  // forward onto the cabin roof, and adds the wheelhouse, windows, rails and
  // life rings as one vertex-coloured mesh, all inside withLocalUuids.
  const hull = surfBox(3.2, 0.7, 9, color, 'paintedMetal');
  hull.position.y = 0.3;
  g.add(hull);
  const gunwale = box(3.3, 0.14, 9.1, 0x2a3a4e);
  gunwale.position.y = 0.65;
  g.add(gunwale);
  const cabin = box(2.2, 1.1, 3, 0xd8cbb0);
  cabin.position.set(0, 1.2, -2.2);
  g.add(cabin);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.1, 12), mat(0x2f2f36));
  stack.position.set(0, 2.2, -1.3);
  g.add(stack);
  for (let i = 0; i < 3; i++) { // deck cargo
    const crate = surfBox(0.9, 0.7, 0.9, 0xc8a678, 'wood');
    crate.position.set(0, 1.0, 1.4 + i * 1.1);
    g.add(crate);
  }
  withLocalUuids(`barge:${x},${z}`, () => {
    const { top, keel } = BARGE;
    // the hull: its sides, tucked in under the water; no top (the deck is in
    // the dressing) and no bottom (it is under the water)
    hull.geometry = bargeWall(bargeOutline(), keel, top - 0.02, 0.18);
    hull.geometry.computeBoundingBox();
    hull.position.y = 0;
    // the rubbing strake round the gunwale: its outer face, top and inner lip
    const outer = bargeOutline(0.05), inner = bargeOutline(-0.06);
    const strake = [bargeWall(outer, 0.58, 0.72), bargeWall(inner, 0.6, 0.72, 0, -1)];
    const ringTop = [];
    for (let i = 0; i < outer.length; i++) {
      const j = (i + 1) % outer.length, a = outer[i], b = outer[j], c = inner[j], d = inner[i];
      ringTop.push(a[0], 0.72, a[1], c[0], 0.72, c[1], b[0], 0.72, b[1], a[0], 0.72, a[1], d[0], 0.72, d[1], c[0], 0.72, c[1]);
    }
    strake.push(upGeometry(ringTop));
    gunwale.geometry = mergeGeometries(strake, false);
    for (const s of strake) s.dispose();
    gunwale.geometry.computeBoundingBox();
    gunwale.position.y = 0;
    const dress = new THREE.Mesh(bargeDressing(color), litMaterial(0xffffff, { vertexColors: true }));
    dress.name = 'bargeDressing';
    g.add(dress);
  });
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A plank bridge deck across a waterway, with railings. NO COLLIDERS are
// emitted for the railings by any caller — the deck has to stay walkable,
// because it is the guaranteed dry crossing between the Docks' two banks.
export function bridgeDeck(x1, z1, x2, z2, w = 4, y = 0.14) {
  const g = new THREE.Group();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const angle = Math.atan2(x2 - x1, z2 - z1);
  const deck = box(w, 0.14, len, 0xa08050);
  deck.position.y = y;
  g.add(deck);
  const planks = Math.floor(len / 1.1);
  for (let i = 0; i < planks; i++) {
    const plank = box(w - 0.1, 0.04, 0.12, 0x8a6a42);
    plank.position.set(0, y + 0.09, -len / 2 + (i + 0.5) * (len / planks));
    g.add(plank);
  }
  for (const side of [-1, 1]) {
    const rail = box(0.08, 0.08, len, 0x6a5230);
    rail.position.set(side * (w / 2 - 0.06), y + 0.65, 0);
    g.add(rail);
    const posts = Math.max(2, Math.floor(len / 2));
    for (let i = 0; i <= posts; i++) {
      const post = box(0.1, 0.65, 0.1, 0x6a5230);
      post.position.set(side * (w / 2 - 0.06), y + 0.33, -len / 2 + i * (len / posts));
      g.add(post);
    }
  }
  g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
  g.rotation.y = angle;
  return g;
}

// One long plank from (x1, z1) to (x2, z2), its top at about `y`: the lake's
// island bridge. A plain box, not roundedBox, so its length and width can be
// read straight off its geometry. Dock timber at the Seaside pier's scale, the
// repeat taken from the top face's real w x len, so the boards run along it.
export function plankBridge(x1, z1, x2, z2, w, y, thick) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const geo = new THREE.BoxGeometry(w, thick, len);
  plankEdgeUVs(geo, w, thick, len);
  // Colour by face: the top is lit warm wood, darker toward one end; the sides
  // and underside are weathered and in shadow, so the box reads as a thick
  // board. Free: setAttribute makes no uuid. The material's tint is raised a
  // touch so the top's mean stays near the old 0x8a6a44.
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const shade = (i, f) => { col[i * 3] = f; col[i * 3 + 1] = f * 0.97; col[i * 3 + 2] = f * 0.94; };
  geo.groups.forEach((g, k) => {
    for (let j = g.start; j < g.start + g.count; j++) {
      const i = geo.index.array[j];
      shade(i, k === 2 ? 1 - 0.14 * (0.5 - pos.getZ(i) / len) : k === 3 ? 0.4 : 0.58);
    }
  });
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, litMaterial(0x947249, { surface: 'wood', repeat: repeatFor('wood', w, len), vertexColors: true }));
  m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  m.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  // A plank lying on the water: flat ground dressing, out of the shadow pass
  // like reedBed (plants.js) and steppingStones. Its thickness sits right on rig.js's
  // CAST_FLAT_HEIGHT, so without this flag whether it cast came down to float
  // rounding in its bounding box.
  m.castShadow = false;
  m.userData.noCast = true;
  return m;
}

// The plank's one material repeats for its top face (w x len). A BoxGeometry
// maps 0..1 on every face, so on the thin long sides that repeat would squash
// the wood some fifteen times across the edge, grain running up it. Here each
// side gets UVs at the wood's true size (one tile per tileMetres, as the top
// has to within repeatFor's rounding) with the texture's v (the plank grain)
// turned to run along the plank, and each end gets the true size up its
// height. The top and bottom are left exactly as they were.
function plankEdgeUVs(geo, w, thick, len) {
  const t = tileMetres('wood');
  const rep = repeatFor('wood', w, len);
  if (!t || !rep) return;
  const [ru, rv] = rep;
  const uv = geo.getAttribute('uv');
  const faceVerts = (g) => [...new Set(geo.index.array.slice(g.start, g.start + g.count))];
  const g = geo.groups; // +x, -x, +y, -y, +z, -z (BoxGeometry's order)
  for (const k of [0, 1]) {
    // the sides: u ran along the length, v up the thickness
    for (const i of faceVerts(g[k])) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, (v * thick) / (ru * t), (u * len) / (rv * t));
    }
  }
  for (const k of [4, 5]) {
    // the ends: u across the width (already at the top's density), v up the thickness
    for (const i of faceVerts(g[k])) uv.setY(i, (uv.getY(i) * thick) / (rv * t));
  }
  uv.needsUpdate = true;
}

// A fallen trunk laid across a stream as a bridge, its top hewn to walk on,
// the way a real log bridge is. Like bridgeDeck it emits no collider: the
// walkable part is the area's own crossing record, this is the picture of
// it. `w` is the trunk's footprint (nothing is drawn wider), `flat` the width
// of the walked top and `y` its height. A deck record should be no wider
// than `flat`, so a cat on the deck is on the log.
//
// The walked top stays where paws expect it: exactly `y` along the log's
// centre line, never above it anywhere, and only a few centimetres below it
// at the flat's edges (a slight crown, so the top shades like the top of a
// log and not a board). Only ~0.13 m of trunk can stand above the water
// under a top that low, so the log is made to read round in the ways that
// fit in that: the hewn wood stops at a wavy line and the bark (the wane)
// carries on over a rounded shoulder that rolls down into a steep bark flank,
// bulging out just under the water line, with smooth normals all the way;
// one end flares into low, round-topped root buttresses either side of the
// walked strip that splay out and down into the water, the other is a sawn
// end with end grain; and two broken branch stubs stand up and out of the
// flanks over the water. Everything stays inside the `w` footprint and
// nothing stands over the walked strip.
//
// Swept by hand into one indexed geometry with vertex colours
// (logTrunkGeometry below): nine cross-sections, closer at the root end.
// Same objects as before (Group, Shape, one BufferGeometry, Mesh, one
// material), because every uuid is a pinned Math.random draw
// (test/waterlooks.test.js); the Shape stays as the record of the section at
// the log's middle. Variation comes from hash01 on the endpoints, so both
// cats' screens agree.
export function logBridge(x1, z1, x2, z2, w = 1.6, y = 0.14, flat = w * 0.6) {
  const g = new THREE.Group();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const seed = (k) => hash01(x1 * 0.37 + x2 * 0.61 + k, z1 * 0.43 + z2 * 0.29 + k * 1.7, 83 + k);
  const sec = logSections(len, w, flat, seed);
  const shape = new THREE.Shape(sec.outline(0).map((p) => new THREE.Vector2(p.x, p.y)));
  const geo = logTrunkGeometry(len, sec, seed);
  const trunk = new THREE.Mesh(geo, litMaterial(0xffffff, { ...surfaceProps('bark'), vertexColors: true }));
  void shape;
  trunk.position.y = y;
  g.add(trunk);
  g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
  g.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  return g;
}

const LOG_BARK = new THREE.Color(0x5a4230);
const LOG_BARK_LOW = new THREE.Color(0x4a3524);
const LOG_BARK_WET = new THREE.Color(0x3a2a1c); // the band at the water line
const LOG_MOSS = new THREE.Color(0x5f7038);
const LOG_WANE_IN = new THREE.Color(0x5e4933); // bark right at the hewn edge, catching the light
const LOG_HEWN_EDGE = new THREE.Color(0x6e5640); // weathered, grey-brown
const LOG_HEWN = new THREE.Color(0x7d6248);
const LOG_HEWN_WORN = new THREE.Color(0x88694a);
const LOG_RIM = new THREE.Color(0x3f2d1e);
const LOG_END = new THREE.Color(0xb89868);
const LOG_RING = new THREE.Color(0x9a7a50);
const LOG_ROOT = new THREE.Color(0x56402c); // the root end: earth and root, no sawn face
const LOG_STUB_TIP = new THREE.Color(0x9c7c56);
// Cross-sections along the log, as fractions from the root end: close where
// the root flare swells, a metre and more apart over the water.
const LOG_FRACS = [0, 0.05, 0.11, 0.18, 0.3, 0.46, 0.63, 0.81, 1];
// End-grain loops at the sawn end, as fractions of the way from the pith to
// the outline: a thin bark rim, pale end grain, one darker ring; the core
// inside stays pale.
const LOG_LOOPS = [1, 0.965, 0.8, 0.76];
const LOG_BANDS = [LOG_RIM, LOG_END, LOG_RING];
const LOG_STUB_SIDES = 6;
const LOG_CROWN = 0.035; // how far the walked top falls from its centre line to the flat's edge (s = 1)

// The log's cross-section as a function of z (along the log, -len/2..len/2),
// in the trunk's own frame: x across, y up from the walked top's centre line.
// Sizes are set for the bridges' own logs (flat 1.9 m) and scale with the
// flat for other calls. Each side is its own: the hewn edge `xh` wanders
// along the log, and so does the flank's bulge.
function logSections(len, w, flat, seed) {
  const R = w / 2;
  const hw = Math.min(flat / 2, R * 0.98);
  const s = hw / 0.95;
  const rootAtStart = seed(7) < 0.5;
  const zRoot = rootAtStart ? -len / 2 : len / 2;
  const flareLen = Math.min(1.8 * s, len * 0.25);
  const phase = (k) => seed(k) * Math.PI * 2;
  const wave = (z, k) => 0.5 + 0.5 * (0.62 * Math.sin(z * 1.7 + phase(k)) + 0.38 * Math.sin(z * 3.1 + phase(k + 1)));
  const yTop = (x) => -LOG_CROWN * s * (x / hw) ** 2;
  const rbBase = Math.min(Math.max(hw * 1.2, hw + 0.06 * s), R);
  const clampX = (x) => Math.min(x, R);
  // 0 over most of the log, rising to 1 at the root end
  const flare = (z) => {
    const d = Math.abs(z - zRoot);
    return d >= flareLen ? 0 : (1 - d / flareLen) ** 1.6;
  };
  // One side's bark profile (x > 0), from the hewn edge out over the
  // shoulder, down the flank and under to the belly, and the hewn edge itself.
  const bark = (z, side) => {
    const k = side > 0 ? 20 : 30;
    const xh = hw * (0.45 + 0.21 * wave(z, k));
    const rb = Math.min(R, Math.max(hw + 0.04 * s, rbBase * (0.975 + 0.05 * wave(z, k + 4))));
    const f = flare(z);
    const lerp = (a, b, t) => a + (b - a) * t;
    // The shoulder is a quarter ellipse from the walked strip's edge (on the
    // top's crown) down to the bulge (vertical), so the bark rolls over
    // instead of meeting the top at a bevel; its third point sits at the
    // bridges' water line (0.13 m under the top), turned about 50 degrees.
    // At the root the middle of it rises into a low buttress hump outside
    // the walked strip (at most 0.13·s above the top): its two raised points
    // stand within 0.005·s of each other, so the crest is a rounded ridge with
    // no single tip, and the bulge splays out to the footprint's edge and
    // down under the water line, so the flare runs down into the water and
    // the bank instead of standing up.
    const x1 = hw - 0.05 * s, y1 = yTop(x1) - 0.006 * s;
    const yb = -0.25 * s, A = rb - x1, B = y1 - yb;
    const ell = (t) => ({ x: x1 + A * Math.sin(t), y: yb + B * Math.cos(t) });
    const e2 = ell(0.16 * Math.PI), e3 = ell(0.3 * Math.PI);
    const pts = [
      { x: xh, y: yTop(xh) },
      { x: x1, y: y1 },
      // kept in order across (each a little short of the footprint's edge,
      // never back inside the walked strip), so a top nearly as wide as the
      // trunk can't fold the hump into a spike
      { x: Math.max(x1 + 0.004 * s, Math.min(e2.x + 0.04 * s * f, R - 0.06 * s)), y: lerp(e2.y, 0.13 * s, f) },
      { x: Math.max(x1 + 0.008 * s, Math.min(lerp(e3.x, Math.max(hw + 0.43 * s, R * 0.92), f), R - 0.03 * s)), y: lerp(e3.y, 0.125 * s, f) },
      { x: clampX(lerp(rb, R, f)), y: lerp(yb, -0.18 * s, f) },
    ];
    // (Below the bulge the trunk is under the water or the bank everywhere,
    // so it closes straight to the bottom.)
    return { xh, pts };
  };
  const bottomY = -0.78 * s;
  // The whole outline at z, as one closed loop: the belly's bottom, up the
  // right flank, over the hewn top right to left, down the left flank.
  const outline = (z) => {
    const r = bark(z, 1), l = bark(z, -1);
    return [
      { x: 0, y: bottomY },
      ...r.pts.slice().reverse(),
      { x: r.xh / 2, y: yTop(r.xh / 2) },
      { x: 0, y: 0 },
      { x: -l.xh / 2, y: yTop(l.xh / 2) },
      ...l.pts.map((p) => ({ x: -p.x, y: p.y })),
    ];
  };
  const zs = LOG_FRACS.map((t) => zRoot - Math.sign(zRoot) * len * t);
  return { R, hw, s, len, zRoot, zs, bark, yTop, bottomY, outline, flare, flareLen };
}

// The trunk in its own frame: along z, the walked top's centre line at y 0.
// `sec` is logSections' description; `seed(k)` the bridge's own hash.
function logTrunkGeometry(len, sec, seed) {
  const { R, s, zs, bark, yTop, bottomY, outline, flareLen } = sec;
  const N = zs.length;
  const pos = [], nor = [], col = [], idx = [];
  const vert = (x, y, z, n, colour) => {
    pos.push(x, y, z); nor.push(n[0], n[1], n[2]); col.push(colour.r, colour.g, colour.b);
    return pos.length / 3 - 1;
  };
  // A triangle, wound to face the way its vertices' normals point; slivers
  // with no area are left out.
  const tri = (a, b, d) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const vx = pos[d * 3] - ax, vy = pos[d * 3 + 1] - ay, vz = pos[d * 3 + 2] - az;
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (Math.hypot(cx, cy, cz) < 1e-7) return;
    let dot = 0;
    for (const i of [a, b, d]) dot += cx * nor[i * 3] + cy * nor[i * 3 + 1] + cz * nor[i * 3 + 2];
    if (dot >= 0) idx.push(a, b, d);
    else idx.push(a, d, b);
  };
  const quad = (a, b, d, e) => { tri(a, b, d); tri(a, d, e); };
  const shade = (base, v) => base.clone().multiplyScalar(v);
  const along = (z) => (z + len / 2) / len; // 0..1 from the log's start

  // The bark: per side, per cross-section, the profile's points with normals
  // from the profile itself (each point's neighbours), shared by the faces
  // either side so the shoulder and flank shade round. Lighter where the
  // wane catches the light, darker down the flank, a wet band at the water;
  // mottled; moss on one side's wane and shoulder toward one end.
  const mossSide = seed(1) < 0.5 ? 1 : -1;
  const mossFromStart = seed(2) < 0.5;
  const BARK_BY_STEP = [LOG_WANE_IN, LOG_BARK, LOG_BARK, LOG_BARK_LOW, LOG_BARK_WET];
  const MOSS_BY_STEP = [0.75, 0.8, 0.7, 0.4, 0];
  const WANE_TURN = [0.17, 0.2, 0.1];
  const bottoms = zs.map((z) => vert(0, bottomY, z, [0, -1, 0], shade(LOG_BARK_LOW, 0.7)));
  const hewnEdge = new Map(); // side -> [ring] the hewn edge's x
  for (const side of [1, -1]) {
    const rows = [], edges = [];
    zs.forEach((z, i) => {
      const { xh, pts } = bark(z, side);
      edges.push(xh);
      const t = along(z);
      const mossAlong = side === mossSide ? Math.max(0, 1 - (mossFromStart ? t : 1 - t) * 1.25) : 0;
      const prof = [...pts, { x: 0, y: bottomY }];
      rows.push(pts.map((p, j) => {
        const a = prof[Math.max(0, j - 1)], b = prof[j + 1];
        // outward normal of the profile, which runs outward and down (right side)
        let nx = -(b.y - a.y), ny = b.x - a.x;
        if (j === 0) { nx = -(b.y - p.y); ny = b.x - p.x; }
        // the wane and the top of the shoulder turn their normals a little
        // further out than the near-flat surface does, so the bark shades as
        // the round it is (not at the root, where the hump has its own shape)
        const extra = (WANE_TURN[j] ?? 0) * (1 - sec.flare(z));
        [nx, ny] = [nx * Math.cos(extra) + ny * Math.sin(extra), ny * Math.cos(extra) - nx * Math.sin(extra)];
        const nl = Math.hypot(nx, ny);
        // the root's buttresses are dry bark in the light, not the wet band
        const cc = shade(BARK_BY_STEP[j].clone().lerp(LOG_WANE_IN, sec.flare(z) * (j >= 2 ? 1 : 0)), 0.86 + 0.24 * seed(100 + i * 13 + j + (side + 1) * 60));
        if (mossAlong > 0) cc.lerp(LOG_MOSS, MOSS_BY_STEP[j] * mossAlong * (0.8 + 0.3 * seed(5 + i)));
        return vert(side * p.x, p.y, z, [side * nx / nl, ny / nl, 0], cc);
      }));
    });
    // The profile runs round the section the same way at every step, so one
    // winding serves the whole side: read it off the bulge (its normal is
    // plain sideways) rather than per face, where a thin root hump's wall can
    // have shading normals on both sides of it.
    const P = (v) => new THREE.Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    const r0 = rows[0], r1 = rows[1];
    const face = P(bottoms[0]).sub(P(r0[4])).cross(P(r1[4]).sub(P(r0[4])));
    const keep = face.x * side >= 0;
    const put = (a, b, d) => (keep ? idx.push(a, b, d) : idx.push(a, d, b));
    for (let i = 0; i < N - 1; i++) {
      const row = rows[i], next = rows[i + 1];
      const ring = [...row, bottoms[i]], ringN = [...next, bottoms[i + 1]];
      for (let j = 0; j < ring.length - 1; j++) {
        put(ring[j], ring[j + 1], ringN[j + 1]);
        put(ring[j], ringN[j + 1], ringN[j]);
      }
    }
    hewnEdge.set(side, edges);
  }

  // The hewn top, its own vertices with the crown's normals: darker toward
  // its wavy edges, a touch lighter down the paw-worn middle; each
  // cross-section a little lighter or darker than the next (±6%). Its edge
  // vertices sit exactly on the bark's first ones, so the line is crisp.
  const hewn = zs.map((z, i) => {
    const xr = hewnEdge.get(1)[i], xl = -hewnEdge.get(-1)[i];
    const ring = 0.94 + 0.12 * seed(60 + i);
    return [xr, xr / 2, 0, xl / 2, xl].map((x, q) => {
      const slope = (2 * LOG_CROWN * s * x) / (sec.hw * sec.hw);
      const nl = Math.hypot(slope, 1);
      const base = [LOG_HEWN_EDGE, LOG_HEWN, LOG_HEWN_WORN, LOG_HEWN, LOG_HEWN_EDGE][q];
      return vert(x, yTop(x), z, [slope / nl, 1 / nl, 0], shade(base, ring));
    });
  });
  for (let i = 0; i < N - 1; i++) {
    for (let q = 0; q < 4; q++) quad(hewn[i][q], hewn[i][q + 1], hewn[i + 1][q + 1], hewn[i + 1][q]);
  }

  // The ends. Each is triangulated from its own outline (the same points the
  // flanks and top end on, so no edge carries another's vertex).
  const toTris = (poly, ids) => {
    for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(poly.map((p) => new THREE.Vector2(p.x, p.y)), [])) tri(ids[a], ids[b], ids[d]);
  };
  // The root end: one face of earth and root under the buttresses (earcut:
  // the notch the walked strip makes between them isn't star-shaped).
  {
    const z = zs[0], n = [0, 0, Math.sign(z)];
    const poly = outline(z);
    toTris(poly, poly.map((p, m) => vert(p.x, p.y, z, n, shade(LOG_ROOT, 0.9 + 0.2 * seed(140 + m)))));
  }
  // The sawn end: concentric loops from the outline toward the pith, each
  // band flat-coloured on its own vertices so the rings stay crisp, every
  // loop sampled at the outline's own points (so no band's edge carries
  // another's vertex); the pale core fanned to the pith.
  {
    const z = zs[N - 1], n = [0, 0, Math.sign(z)];
    const poly = outline(z);
    const pith = { x: 0, y: -0.32 * s };
    const loop = (q, p) => ({ x: pith.x + (p.x - pith.x) * LOG_LOOPS[q], y: pith.y + (p.y - pith.y) * LOG_LOOPS[q] });
    const closed = [...poly, poly[0]];
    LOG_BANDS.forEach((band, q) => {
      const cc = shade(band, 0.95 + 0.08 * seed(80 + q));
      let po = -1, pi = -1;
      closed.forEach((p, a) => {
        const o = loop(q, p), ii = loop(q + 1, p);
        const vo = vert(o.x, o.y, z, n, cc), vi = vert(ii.x, ii.y, z, n, cc);
        if (a > 0) quad(po, vo, vi, pi);
        po = vo; pi = vi;
      });
    });
    const core = shade(LOG_END, 0.97);
    const centre = vert(pith.x, pith.y, z, n, shade(LOG_RING, 1.05));
    const inner = closed.map((p) => { const c = loop(LOG_LOOPS.length - 1, p); return vert(c.x, c.y, z, n, core); });
    for (let a = 0; a < inner.length - 1; a++) tri(centre, inner[a], inner[a + 1]);
  }

  // Two broken branch stubs, one out of each flank over the water: from the
  // shoulder's water line, up and out and a little along, bent up at the
  // middle, with a pale jagged break at the tip. Clamped inside the
  // footprint, and kept off the walked strip.
  const stubSide = seed(3) < 0.5 ? 1 : -1;
  const stubDir = seed(4) < 0.5 ? 1 : -1;
  const room = Math.max(0, len / 2 - flareLen - 0.4 * s);
  [[stubSide, 1, 0.8, 0.16], [-stubSide, -1, 0.52, 0.12]].forEach(([side, sgn, L0, rad0], k) => {
    const zAt = sgn * stubDir * Math.min(room, len * (0.17 + 0.08 * seed(40 + k)));
    const { pts } = bark(zAt, side);
    const base = new THREE.Vector3(side * pts[3].x, pts[3].y, zAt);
    const el = (38 + 14 * seed(42 + k)) * (Math.PI / 180);
    const dir = new THREE.Vector3(side * Math.cos(el), Math.sin(el), sgn * stubDir * (0.25 + 0.2 * seed(44 + k))).normalize();
    const rad = rad0 * s, L1 = L0 * s * (0.9 + 0.2 * seed(46 + k));
    // sunk well into the bark so no part of the open base ring shows
    base.addScaledVector(dir, -0.12 * s).x -= side * 0.05 * s;
    // keep the tip and its bark inside the footprint
    const out = Math.max(1e-3, dir.x * side);
    const L = Math.max(0.1 * s, Math.min(L1, (R - 0.01 - rad * 0.6 - Math.abs(base.x)) / out));
    const upv = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
    const sidev = new THREE.Vector3().crossVectors(dir, upv).normalize();
    const mid = base.clone().addScaledVector(dir, L * 0.55).addScaledVector(upv, 0.03 * s);
    const tip = base.clone().addScaledVector(dir, L);
    const barkC = shade(LOG_BARK, 0.92 + 0.12 * seed(48 + k));
    const ring = (centre, r, colour, jag = 0) => {
      const ids = [];
      for (let m = 0; m < LOG_STUB_SIDES; m++) {
        const a = (m / LOG_STUB_SIDES) * Math.PI * 2;
        const off = upv.clone().multiplyScalar(Math.cos(a)).addScaledVector(sidev, Math.sin(a));
        const p = centre.clone().addScaledVector(off, r).addScaledVector(dir, jag * (m % 2 ? 1 : -0.5) * s);
        p.x = Math.max(-R * 0.999, Math.min(R * 0.999, p.x)); // odd w/flat: never outside the footprint
        ids.push(vert(p.x, p.y, p.z, [off.x, off.y, off.z], colour));
      }
      return ids;
    };
    const r0 = ring(base, rad, barkC);
    const r1 = ring(mid, rad * 0.8, barkC);
    const r2 = ring(tip, rad * 0.58, shade(barkC, 1.05), 0.03);
    for (const [ra, rb] of [[r0, r1], [r1, r2]]) {
      for (let m = 0; m < LOG_STUB_SIDES; m++) {
        const m2 = (m + 1) % LOG_STUB_SIDES;
        quad(ra[m], ra[m2], rb[m2], rb[m]);
      }
    }
    // the break: its own pale vertices, fanned to a splinter standing out of the middle
    const cap = ring(tip, rad * 0.58, LOG_STUB_TIP, 0.03);
    const d = [dir.x, dir.y, dir.z];
    for (const i of cap) nor.splice(i * 3, 3, ...d);
    const peak = tip.clone().addScaledVector(dir, 0.07 * s);
    peak.x = Math.max(-R * 0.999, Math.min(R * 0.999, peak.x));
    const c = vert(peak.x, peak.y, peak.z, d, shade(LOG_STUB_TIP, 1.08));
    for (let m = 0; m < LOG_STUB_SIDES; m++) tri(c, cap[m], cap[(m + 1) % LOG_STUB_SIDES]);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

// Flat stones across a shallow ford, one merged geometry. They are wide and
// low, so rig.js's caster sweep would make them cast; noCast keeps them out of
// the shadow pass. Placement and shape come from hash01, never Math.random, so
// both cats' screens agree.
//
// Options, for a ford a cat should be able to walk across without wetting a
// paw: rMin/rMax (the stones' base radius range), jitter (how far a stone may
// sit off the line, in total) and stagger (alternate stones sit this much
// higher and lower, so stones that overlap never fight for the same pixels)
// and sides (an octagon by default; a rounder stone's dry edge sits closer to
// its drawn edge, which matters when a deck has to match what is drawn).
export function steppingStones(x1, z1, x2, z2, n = 5, { rMin = 0.38, rMax = 0.52, jitter = 0.3, stagger = 0, sides = 8 } = {}) {
  const geoms = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    const sx = x1 + (x2 - x1) * f + (hash01(i, 1, 61) - 0.5) * jitter;
    const sz = z1 + (z2 - z1) * f + (hash01(i, 2, 61) - 0.5) * jitter;
    const r = rMin + (rMax - rMin) * hash01(i, 3, 61);
    const stone = new THREE.CylinderGeometry(r * 0.88, r, 0.2, sides);
    colourStone(stone, i, 0.1, r);
    stone.rotateY(hash01(i, 4, 61) * Math.PI);
    stone.translate(sx, (i % 2 ? -0.5 : 0.5) * stagger, sz);
    geoms.push(stone);
  }
  const geo = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
  if (geoms.length > 1) for (const p of geoms) p.dispose();
  const m = new THREE.Mesh(geo, litMaterial(0xffffff, { ...surfaceProps('cobble'), vertexColors: true }));
  m.castShadow = false;
  m.userData.noCast = true;
  // dusk.js's tintDuskLawn tints vertex colours of meshes carrying this tag
  m.userData.duskTint = true;
  return m;
}

const STONE_WARM = new THREE.Color(0x948b7c);
const STONE_COOL = new THREE.Color(0x7d8590);
const STONE_MOSS = new THREE.Color(0x628a34);
const STONE_DAMP = new THREE.Color(0.58, 0.6, 0.66);

// Paint one stone (a CylinderGeometry, before it is moved) with a vertex-colour
// attribute: its own base tone between warm grey and blue-grey; a damp, cooler
// skirt foot fading up to the base at the top rim; on the cap, a dry lighter
// centre inside a darker rim so each stone's outline reads, and on about 40%
// of the stones a mossy cap (centre strongly green, rim part-way). Neighbours
// alternate between a darker and a lighter lightness band, so two overlapping
// stones never share a tone. Read by position (y, distance from the axis) and
// the cap's up-facing normal, not by three's vertex order.
function colourStone(stone, i, halfH, r) {
  const base = STONE_WARM.clone().lerp(STONE_COOL, hash01(i, 5, 61));
  base.multiplyScalar((i % 2 ? 0.78 : 0.55) + 0.2 * hash01(i, 6, 61));
  const mossy = hash01(i, 7, 61) < 0.4;
  const moss = 0.7 + 0.25 * hash01(i, 8, 61);
  const centre = mossy ? base.clone().lerp(STONE_MOSS, moss) : base.clone().multiplyScalar(1.12);
  const capRim = mossy ? base.clone().multiplyScalar(0.86).lerp(STONE_MOSS, moss * 0.4) : base.clone().multiplyScalar(0.86);
  const foot = base.clone().multiply(STONE_DAMP);
  const pos = stone.getAttribute('position');
  const nor = stone.getAttribute('normal');
  const arr = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    const up = (pos.getY(v) + halfH) / (2 * halfH); // 0 at the foot, 1 at the top
    const rad = Math.hypot(pos.getX(v), pos.getZ(v));
    if (nor.getY(v) > 0.5) c.copy(rad < r * 0.02 ? centre : capRim);
    else c.copy(foot).lerp(base, up);
    arr[v * 3] = c.r; arr[v * 3 + 1] = c.g; arr[v * 3 + 2] = c.b;
  }
  stone.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

// A fallen trunk lying along its local z, turned to `yaw`, its top at y 0.5
// (a hop for a kitten, a seat for a cat). Sunk in the ground, with a broken
// branch stub so it does not read as a pipe. No collider.
export function fallenLog(x, z, length, yaw) {
  const g = new THREE.Group();
  const r = 0.42;
  const geo = new THREE.CylinderGeometry(r * 0.9, r, length, 12);
  geo.rotateX(Math.PI / 2);
  const trunk = new THREE.Mesh(geo, surfNoMap(0x6a4a2e, 'bark'));
  trunk.position.y = 0.5 - r;
  g.add(trunk);
  const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.4, 6), surfNoMap(0x6a4a2e, 'bark'));
  // Negative, so it leans up and away from the trunk rather than into it.
  stub.rotation.z = -0.9;
  stub.position.set(r * 0.9, 0.2, length * 0.15);
  g.add(stub);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return g;
}

// A tor: a granite outcrop of three stacked dodecahedron blocks in one
// geometry, widest at the foot (radius r, the same r a collider would use) and
// narrowing to a top at height h. A real solid a cat climbs, so unlike the
// beds it casts a shadow.
export function tor(x, z, { r = 1.2, h = 1.2, seed = 0 } = {}) {
  // [radius share, bottom share of h, height share of h, sideways drift in r]
  const blocks = [[1, 0, 0.5, 0], [0.7, 0.35, 0.45, 0.15], [0.5, 0.65, 0.35, 0.12]];
  const geoms = blocks.map(([rs, bottom, tall, drift], i) => {
    const g = new THREE.DodecahedronGeometry(1, 0);
    // The foot stays unturned so its x and z reach is near its full radius.
    if (i > 0) g.rotateY(hash01(x, z, seed + i) * Math.PI);
    g.computeBoundingBox();
    const pos = g.attributes.position;
    let reach = 0;
    for (let v = 0; v < pos.count; v++) reach = Math.max(reach, Math.hypot(pos.getX(v), pos.getZ(v)));
    const { min, max } = g.boundingBox;
    g.scale((r * rs) / reach, (h * tall) / (max.y - min.y), (r * rs) / reach);
    g.translate(0, h * bottom - min.y * ((h * tall) / (max.y - min.y)), 0);
    const a = hash01(x, z, seed + 10 + i) * Math.PI * 2;
    g.translate(x + Math.cos(a) * r * drift, 0, z + Math.sin(a) * r * drift);
    return g;
  });
  const geo = mergeGeometries(geoms, false);
  for (const g of geoms) g.dispose();
  const m = new THREE.Mesh(geo, surfNoMap(0x8e8c88, 'cobble'));
  m.castShadow = true;
  return m;
}

// Rabbit burrows: a dark hole laid flat on the ground and a low mound of
// spoil beside it, its centre 0.8 m away (mound radius 0.55 + hole radius
// 0.22 + a little), so the mound never covers the hole. Two merged meshes (two colours), both under 0.2 m
// and out of the caster sweep; a hide for the Moor, not an obstacle.
export function burrows(spots, seed) {
  const spoil = [];
  const holes = [];
  spots.forEach((sp, i) => {
    const hole = new THREE.CircleGeometry(0.22, 10);
    hole.rotateX(-Math.PI / 2);
    hole.translate(sp.x, 0.02, sp.z);
    holes.push(hole);
    const mound = new THREE.SphereGeometry(0.55, 8, 4);
    mound.scale(1, 0.15 / 0.55, 1);
    const a = hash01(sp.x, sp.z, seed + i + 1) * Math.PI * 2;
    mound.translate(sp.x + Math.cos(a) * 0.8, 0, sp.z + Math.sin(a) * 0.8);
    spoil.push(mound);
  });
  const g = new THREE.Group();
  const mounds = mergedNoCast(spoil, 0xa08a62, 'sand');
  mounds.name = 'burrowSpoil';
  const dark = mergedNoCast(holes, 0x2a2420, 'sand');
  dark.name = 'burrowHoles';
  g.add(mounds, dark);
  return g;
}

// The shared tail of the ground-dressing beds: merge, map-less material, and
// out of the caster sweep (see the reedBed note in plants.js).
export function mergedNoCast(geoms, color, surface) {
  const geo = geoms.length === 0 ? new THREE.BufferGeometry()
    : geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
  if (geoms.length > 1) for (const p of geoms) p.dispose();
  const m = new THREE.Mesh(geo, surfNoMap(color, surface));
  m.castShadow = false;
  m.userData.noCast = true;
  return m;
}

// LEFT FLAT, in all five areas. Corrugated board is uncoated pulp — it is
// already at the matte default, and it is the one prop here with no grain at
// all to imitate: the plank tile would give it timber boards it does not have,
// and there is no paper or fibre tile in the vocabulary. Its walls are 3cm
// thick and 0.55m across, so it is inside the thin-member rule besides.
export function cardboardBox(x, z, rotY = 0) {
  const g = new THREE.Group();
  const wallSpecs = [
    [0.55, 0.3, 0.03, 0, 0.15, 0.26], [0.55, 0.3, 0.03, 0, 0.15, -0.26],
    [0.03, 0.3, 0.55, 0.26, 0.15, 0], [0.03, 0.3, 0.55, -0.26, 0.15, 0],
  ];
  for (const [w, h, d, px, py, pz] of wallSpecs) {
    const wall = box(w, h, d, 0xc8a678);
    wall.position.set(px, py, pz);
    g.add(wall);
  }
  const bottom = box(0.55, 0.03, 0.55, 0xb89468);
  bottom.position.y = 0.015;
  g.add(bottom);
  for (const side of [-1, 1]) {
    const flap = box(0.55, 0.02, 0.2, 0xd8b688);
    flap.position.set(0, 0.31, side * 0.34);
    flap.rotation.x = side * -0.7;
    g.add(flap);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}
