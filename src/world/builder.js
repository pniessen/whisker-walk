import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial, repeatFor, surfaceProps } from '../render/materials.js';
import { skyBackground } from '../render/sky.js';

const mat = (color) => litMaterial(color);

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

const box = (w, h, d, color) => new THREE.Mesh(roundedBox(w, h, d), mat(color));

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
const surfMat = (color, surface, w, h) =>
  litMaterial(color, { surface, repeat: repeatFor(surface, w, h) });
// `fw`/`fh` default to the box's own width/height — override them when the
// face that should drive the tiling is not the front one.
const surfBox = (w, h, d, color, surface, fw = w, fh = h) =>
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
const surfNoMap = (color, surface) => litMaterial(color, surfaceProps(surface));

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
const TRUNK_SIDES = 10;

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
const swayFor = (scale) => SWAY_TREE * Math.sqrt(Math.max(0.01, scale));

// The size hints. A bush and a flower patch have no `scale` parameter and are
// visually small and light no matter how big they are drawn, so they are
// pinned low (wind.js clamps to MIN_SCALE 0.4) and come out quick: sizeHint
// 0.55 puts a bush on a ~2.0s cycle against a scale-1 tree's ~3.6s.
const BUSH_SIZE_HINT = 0.55;
const FLOWER_SIZE_HINT = 0.4;

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
// see the GROUND-PLANE MACRO VARIATION block above tree() for why: vertex
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
  applyMacroVariation(m, surface, size);
  return m;
}

// `surface` is opt-in for the same reason ground()'s and platform()'s are: a
// park's winding path is gravel ('sand' is the fine-speckle tile and is what a
// gravel walk actually looks like), a neighbourhood's is packed earth, and the
// Docks' four paths are deliberately flat because they run over cobbles that
// are already tiled — see the docks.js surface note. None of those three
// should have to change for either of the others, so nobody is defaulted into
// a surface here.
export function path(x1, z1, x2, z2, w = 2, { surface } = {}) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  // Segmented along both axes — see segsFor()/GROUND-PLANE MACRO VARIATION
  // above tree(). Width gets at most a handful of segments (paths run 1-5m
  // wide; more than that resolves nothing), length gets enough to carry a
  // patch wavelength derived from the path's OWN length via wavelengthFor(),
  // not a constant shared with the 120m ground plane.
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, len, segsFor(w, 1, 6), segsFor(len, 4, 64)),
    surface ? surfMat(0xcbb8a0, surface, w, len) : mat(0xcbb8a0),
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
  // AFTER rotation/position are set — see applyMacroVariation()'s own
  // comment for why (it reads mesh.matrix for each vertex's world (x, z)).
  applyMacroVariation(m, surface, len);
  return m;
}

// `bodySurface` is 'siding' or 'brick', exactly as warehouse() takes it, and
// for the same reason: which one a house wants is a colour decision the caller
// has already made. The default is 'siding', because every house shipped today
// is a pale painted body (0xe8d8b0, 0xd8c8a8) and painted lap boards are what
// that colour has always been drawing.
export function house(x, z, bodyColor = 0xe8d8b0, roofColor = 0xb05a4a, bodySurface = 'siding') {
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
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2, 4),
    surfMat(roofColor, 'shingle', 11, 4.4));
  roof.position.y = 4;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  // A plank door, at last literally: the plank tile is four boards across its
  // 1.0m, so a 0.9m leaf reads as four ~22cm boards running the right way up.
  const door = surfBox(0.9, 1.8, 0.1, 0x7a5230, 'wood');
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
  g.position.set(x, 0, z);
  return g;
}

// ---------------------------------------------------------------------------
// ORGANIC CANOPY (dice-fix pass). tree()'s and bush()'s canopies used to be a
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
function hash01(x, z, salt) {
  const h = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// A deterministic per-(x, z) hue/saturation/lightness nudge on a base colour.
// Real canopies are not all one green; this is nearly free (one Color per
// tree, already allocated for the material) and reads as instance variety
// the moment two trees stand side by side.
function organicTint(hex, x, z, salt, hueDeg = 10) {
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
// tree()/bush() call sites for the caching trade-off this settles.
//
// `saltBase` namespaces the hash per call site (tree vs bush) so two props
// that could in principle share an (x, z) don't also land on the same
// "random" shape by coincidence — cheap hygiene, never actually load-bearing
// in this game's placement data.
function blobGeometry(x, z, radius, { lobes = 1, saltBase = 0 } = {}) {
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
  // specifically to read as "just rained on" (roughness dropped to 0.42 —
  // see materials.js), so a cooler, darker streak on top is the same idea
  // carried from the light response into the colour.
  wetStone: { patches: 6, tint: [0.92, 0.94, 0.96] },
  // The Docks' dry paths/sidewalks over the same cobble map, no dampness
  // implied — closer to neutral than wetStone's tint.
  cobble: { patches: 6, tint: [0.92, 0.92, 0.93] },
  // Packed-earth/gravel paths and lanes.
  gravel: { patches: 5, tint: [0.92, 0.91, 0.91] },
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

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
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
 *             the same data test/water.test.js reads). Cells whose centre
 *             falls in one are dropped, which is how the Seaside's dunes stop
 *             at the tideline instead of paving the bay.
 *   headland  { x, z, r, h } — one extra smooth lobe added to the height
 *             field, for the promontory the plan asks the Seaside for.
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
} = {}) {
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
  const heightAt = (x, z, d) => -BAND_SINK + ringHeight * relief(x, z) * lift(d);
  const wet = (x, z) => avoid.length > 0 && waterClearance(avoid, x, z) < 0;

  // ---- the ring surface ----------------------------------------------------
  const pos = [];
  const uv = [];
  for (let i = 0; i < around; i++) {
    const [px, pz] = squarePoint(i / around);
    for (let j = 0; j <= outSegs; j++) {
      const t = j / outSegs;
      const s = inner + t * span;
      const x = px * s;
      const z = pz * s;
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
      if (wet(cx * cs, cz * cs)) continue;
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
      const bw = 6 + 13 * hash01(k, 2, salt + 3);
      const bd = 5 + 11 * hash01(k, 3, salt + 4);
      const bh = height * (0.40 + 0.75 * hash01(k, 4, salt + 5));
      // Sunk half a metre into the band's own surface so a block never floats
      // above a dip in it — the land under a town is not a table.
      const base = heightAt(x, z, t * span) - 0.5;
      // Turned to face the middle of the area, so the town presents elevations
      // rather than corners. Squares of the perimeter parameter, not of the
      // block's own position, so a block on a side wall is parallel to it.
      const yaw = Math.atan2(px, pz);
      const g = new THREE.BoxGeometry(bw, bh, bd);
      g.rotateY(yaw);
      g.translate(x, base + bh / 2, z);
      parts.push(g);
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
      }
    }
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
  const m = new THREE.Mesh(geo, litMaterial(color, { flatShading: true }));
  // Named so a test (and a future draw-call audit) can find it without the
  // area files having to publish it as a record — the same trick path() uses.
  m.name = 'horizonBand';
  // Never culled: the camera is always INSIDE the ring's bounding sphere, so
  // the test can only ever come back true. Saying so costs nothing and stops
  // a future reader wondering whether it should have been split up.
  m.frustumCulled = false;
  return m;
}

// `opts.wind` is the per-walk sway registry (see the WIND block at the top of
// this file). Passing it plants the tree AND registers it in one line; leaving
// it out is the tree this function has always returned.
//
// The whole Group is registered, so trunk and canopy lean together as one
// rigid body — which is the entire point of wind.js's rotation-only design:
// `g.position.x/z` never moves, so the collider and the perch this tree may
// carry stay exactly where the area declared them.
export function tree(x, z, scale = 1, { wind } = {}) {
  const g = new THREE.Group();
  // 'bark' is the roughest thing in the game (0.98) and ships MAP-LESS on
  // purpose — a 6-sided trunk is the cylinder rule's worked example. What
  // sells the trunk is the roughness step against the canopy above it.
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2, TRUNK_SIDES),
    surfMat(0x7a5230, 'bark'));
  trunk.position.y = 1;
  g.add(trunk);
  // 'foliage' at 0.8 — a leaf has a waxy cuticle and a canopy in sun carries a
  // sheen band that bark simply does not. Also map-less: a single facet is far
  // bigger than any tile, so a map here would be one stretched smear per face.
  // See the ORGANIC CANOPY block above for why this is a merged, irregular,
  // deterministic-per-(x,z) blob rather than a bare regular icosahedron.
  const leaves = new THREE.Mesh(
    blobGeometry(x, z, 1.6, { lobes: 2, saltBase: 0 }),
    surfMat(organicTint(0x4e9440, x, z, 10), 'foliage'),
  );
  leaves.position.y = 2.8;
  // A fixed per-tree orientation — the same rotation every time this exact
  // (x, z) is built, so co-walkers agree, but different from every other
  // tree's rotation so a row of them doesn't read as one object stamped
  // repeatedly.
  leaves.rotation.y = hash01(x, z, 30) * Math.PI * 2;
  g.add(leaves);
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  // Registered AFTER position/scale are set: wind.add derives this tree's
  // phase from its (x, z), so a tree registered at the origin would sway in
  // lockstep with every other tree in the area.
  //
  // sizeHint carries the frequency (a big oak is slower than a sapling, which
  // is wind.js's own falloff and is right), amplitude is overridden to grow
  // WITH the tree rather than against it — see the WIND block's note on why
  // the brief beat the inertia model here.
  if (wind) wind.add(g, { sizeHint: scale, amplitude: swayFor(scale) });
  return g;
}

// A bush. Returns the same bare Mesh it always has — UNLESS `opts.wind` is
// passed, in which case it comes back as a Group with that mesh inside it.
//
// That is not decoration, it is the pivot. wind.js rotates a registered object
// around its OWN origin, and this mesh's origin is its belly at y 0.5, so
// registering it directly would hinge the bush about its middle and slide its
// base sideways. wind.js offers `pivotY` for exactly this — but pivotY works
// by reparenting under a pivot Group, and at the moment a builder registers,
// the prop has no parent yet (the caller has not called scene.add). So the
// builder makes the hinge itself: a Group at (x, 0, z) — ground contact, the
// same origin every compound prop here already has — with the mesh at local
// y 0.5, so the bush is in exactly the same place either way and no geometry,
// collider or hide-spot record moves a millimetre.
export function bush(x, z, { wind } = {}) {
  // 'foliage', same as a tree canopy and map-less for the same reason. Same
  // organic-blob treatment as tree(), scaled down and salted differently (see
  // the ORGANIC CANOPY block above) so a bush never coincidentally matches a
  // tree's shape or a neighbouring bush's.
  const m = new THREE.Mesh(
    blobGeometry(x, z, 0.7, { lobes: 2, saltBase: 1000 }),
    surfMat(organicTint(0x5aa04e, x, z, 1010, 8), 'foliage'),
  );
  m.rotation.y = hash01(x, z, 1030) * Math.PI * 2;
  if (!wind) {
    m.position.set(x, 0.5, z);
    return m;
  }
  const g = new THREE.Group();
  m.position.set(0, 0.5, 0);
  g.add(m);
  g.position.set(x, 0, z);
  // Explicit on both counts, because a bush has no `scale` to infer from: the
  // low sizeHint makes it QUICK (a ~2.0s cycle against a tree's ~3.6s) and the
  // small amplitude makes it stir rather than wave.
  wind.add(g, { sizeHint: BUSH_SIZE_HINT, amplitude: SWAY_BUSH });
  return g;
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

export function car(x, z, color = 0xd06048, rotY = 0) {
  const g = new THREE.Group();
  // The preset the table was written for: automotive paint is a clearcoat over
  // pigment, the metal is UNDER the paint, and metalness 0 is what keeps a red
  // car red instead of tinting its highlight and killing the diffuse term.
  const body = surfBox(1.8, 0.6, 4, color, 'paintedMetal');
  body.position.y = 0.6;
  g.add(body);
  const cabin = surfBox(1.6, 0.55, 2, 0xa8d8e8, 'glass');
  cabin.position.set(0, 1.15, -0.2);
  g.add(cabin);
  for (const [wx, wz] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) {
    // Tyres stay explicitly 'matte'. Rubber loaded with carbon black is about
    // the least specular thing in the world, and it is the one material in the
    // game that has a reason to be flatter than the paint beside it.
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16),
      surfMat(0x2a2a30, 'matte'));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.35, wz);
    g.add(wheel);
  }
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
  g.add(lamp);
  g.position.set(x, 0, z);
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
export function puddle(x, z, r = 0.8) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), surfMat(0x8ab8d8, 'water'));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.02, z);
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

// Flowers. Takes `opts.wind` like tree() and bush() — the Group's origin is
// already ground contact, so it hinges at the soil for free with no pivot.
//
// The blooms and stems stay FLAT: nothing here is over 8cm, and the whole
// patch is smaller than one tile of any surface in the vocabulary. The stems
// take 'foliage' rather than a map for the same reason a canopy does.
export function flowerPatch(x, z, { wind } = {}) {
  const g = new THREE.Group();
  const colors = [0xf2a0c0, 0xf2e04e, 0xffffff, 0xe07040];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(colors[i % 4]));
    f.position.set((Math.sin(i * 2.4) * 0.5), 0.25, (Math.cos(i * 1.7) * 0.5));
    g.add(f);
    const stem = new THREE.Mesh(roundedBox(0.03, 0.25, 0.03),
      surfMat(0x4e9440, 'foliage'));
    stem.position.set(f.position.x, 0.12, f.position.z);
    g.add(stem);
  }
  g.position.set(x, 0, z);
  // The quickest and one of the lightest things in the area: thin stems in the
  // slowest air there is, so a pinned-low sizeHint and a small amplitude.
  if (wind) wind.add(g, { sizeHint: FLOWER_SIZE_HINT, amplitude: SWAY_FLOWERS });
  return g;
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
// stones down the strip. It is NOT defaulted on, because the Docks' two
// sidewalks were deliberately left flat by the pilot (they run over a ground
// plane that is already carrying the same cobble tile, and two grids at
// different densities on top of each other is the one way to make a tiled
// surface look like a mistake).
export function sidewalk(x1, z1, x2, z2, w = 1.2, { surface } = {}) {
  // a lighter strip beside a street — reuses path() geometry with pavement color
  const len = Math.hypot(x2 - x1, z2 - z1);
  // Segmented the same way path() is — see its comment and segsFor() above.
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, len, segsFor(w, 1, 6), segsFor(len, 4, 64)),
    surface ? surfMat(0xd8d0c0, surface, w, len) : mat(0xd8d0c0),
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
export function warehouse(x, z, w, d, h, bodyColor = 0x8a7c74, roofColor = 0x4a4650, bodySurface = 'brick') {
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
  door.position.set(0, 1.1, d / 2 + 0.03);
  g.add(door);
  const lintel = box(2.0, 0.16, 0.2, 0x5e5450);
  lintel.position.set(0, 2.3, d / 2 + 0.05);
  g.add(lintel);
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

// A moored canal barge. Sits IN the water on purpose and carries no perch and
// no collectible: the Docks canal is scenery plus a bridged crossing, never a
// place the player has to reach (see docks.js's header — Sea Legs may never
// ship, so nothing may depend on swimming).
export function barge(x, z, rotY = 0, color = 0x3a5a78) {
  const g = new THREE.Group();
  // Painted steel hull; the cabin and gunwale stay flat (a 2.2m cabin is too
  // small for a siding tile to read as anything but stripes), and the deck
  // cargo is the same dock timber as the crates ashore.
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
  stack.position.set(0, 2.2, -2.8);
  g.add(stack);
  for (let i = 0; i < 3; i++) { // deck cargo
    const crate = surfBox(0.9, 0.7, 0.9, 0xc8a678, 'wood');
    crate.position.set(0, 1.0, 1.4 + i * 1.1);
    g.add(crate);
  }
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

// =============================================================================
// INTERIOR PROPS — the Cozy Den density pass.
//
// The den shipped in v17 with six purchasable pieces and almost no room around
// them, while the outdoor areas had four density waves. These are the props
// that furnish an INSIDE: skirting and picture rails, shelves and bookcases,
// pictures, plants, bowls, toys, a radiator, a telly. They live here rather
// than in world/den.js for the same reason the dockside block above does —
// builder.js is where a second interior (a shop, a vet's waiting room, a
// neighbour's kitchen) goes shopping.
//
// Two rules carried over from the dockside block, both load-bearing:
//
//   * Anything with a WALKABLE TOP exports that height as a constant, because
//     src/world/den.js authors its perch chain against these numbers. A silent
//     0.1 here leaves a cat hovering, or pushes a chain step out of the 1.6
//     climb budget (src/climbing.js).
//   * Everything is deterministic — no rng, injected or otherwise. Two clients
//     walking the same den must draw the same room (the CF-7 desync rule), so
//     the "scattered" props scatter by index arithmetic, never by a draw.
//
// Orientation convention, shared by every wall-mounted prop below: at rotY 0
// the prop FACES +z. A north wall (at -z, facing the room) is rotY 0, a west
// wall is +PI/2, an east wall is -PI/2.
//
// SURFACES INDOORS (v20). This block is surfaced by the shared pass even
// though only ONE area uses it, which is the opposite of the rule the rest of
// this file follows, and the reason is file ownership rather than art: the
// area agents own only their own world file, and every stick of den furniture
// is built here. Nobody but this pass can give the den's furniture a light
// response at all.
//
// The vocabulary indoors is narrower than outdoors, and the gaps are real:
// there is no cloth tile, no wicker, no carpet and no paper, so upholstery,
// rugs, curtains, baskets and bags stay explicitly flat rather than borrowing
// the nearest wrong grain — a rug wearing the plank tile is a rug with
// floorboards printed on it. What the room DOES get is the timber/paint/glaze
// step: carcasses and shelves take 'wood', painted joinery takes 'siding's
// paint film without its lap boards, and the enamel and glaze take
// 'paintedMetal'. The thin-member and cylinder rules at the top of this file
// apply here more than anywhere, because furniture is mostly 5-10cm members.
// =============================================================================

// A rectangular rug with a border trim. Flat and collider-free by design: a
// rug is the one furnishing that must never change where the cat can walk.
// Flat in the material sense too, and deliberately: wool pile is matte, there
// is no textile tile in the vocabulary, and the two nearest ones would print
// floorboards or brickwork onto a rug.
export function rugRect(x, z, w, d, color = 0xb8564e, border = 0xe8d0a8) {
  const g = new THREE.Group();
  const trim = box(w + 0.3, 0.012, d + 0.3, border);
  trim.position.y = 0.012;
  g.add(trim);
  const pile = box(w, 0.02, d, color);
  pile.position.y = 0.02;
  g.add(pile);
  // two woven stripes, so a big rug doesn't read as a painted rectangle
  for (const sz of [-d * 0.28, d * 0.28]) {
    const stripe = box(w * 0.92, 0.006, d * 0.08, border);
    stripe.position.set(0, 0.028, sz);
    g.add(stripe);
  }
  g.position.set(x, 0, z);
  return g;
}

// LEFT FLAT: 5cm strips a centimetre off the floor. This IS the den's
// floorboards — the seams are the grain, drawn as geometry, which is why the
// den's floor plane does not want the plank tile underneath them either (two
// board rhythms disagreeing, the same trap the Docks' bridge decks fell into).
//
// Floorboard seams: thin dark strips across a floor plane, `count` of them
// spread over `size`. Costs nothing (no collider, 1cm off the floor) and is
// the single cheapest thing that stops a big flat quad reading as a big flat
// quad.
export function floorSeams(size, count, color = 0x7a5230) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const seam = box(0.05, 0.01, size, color);
    seam.position.set(-size / 2 + (i + 0.5) * (size / count), 0.008, 0);
    g.add(seam);
  }
  return g;
}

// A skirting board / picture rail run along a wall, from (x1,z1) to (x2,z2).
// Same signature shape as fenceRun above so the two read alike. `y` is the
// strip's CENTRE height: 0.11 for skirting, ~2.0 for a picture rail.
//
// Painted joinery, so it takes 'siding's light response — 0.7, the paint-film
// step, because what you see on a skirting board is gloss over timber and not
// the timber — with the lap-board tile left off. It is 8cm deep and 22cm tall:
// thin-member rule, and the tile would put clapboards on the skirting anyway.
export function trimRun(x1, z1, x2, z2, y = 0.11, h = 0.22, color = 0xf0e4d0) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(roundedBox(0.08, h, len), surfNoMap(color, 'siding'));
  m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  m.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  return m;
}

// A framed picture. Hung, so it takes an explicit `y` (its centre) and never
// a collider — the cat walks under it.
export function pictureFrame(x, y, z, rotY = 0, w = 0.7, h = 0.55, artColor = 0xa8c8d8) {
  const g = new THREE.Group();
  // A 5cm moulding: thin-member rule, so wood's roughness without its tile.
  // The ART stays flat — it is a painting, and a painting with wood grain
  // showing through it is a painting on the wrong side of the canvas.
  const frame = new THREE.Mesh(roundedBox(w + 0.09, h + 0.09, 0.05),
    surfNoMap(0x7a5230, 'wood'));
  g.add(frame);
  const art = box(w, h, 0.02, artColor);
  art.position.z = 0.03;
  g.add(art);
  const hill = new THREE.Mesh(new THREE.ConeGeometry(w * 0.3, h * 0.42, 4), mat(0x5a8a5a));
  hill.position.set(-w * 0.14, -h * 0.16, 0.05);
  g.add(hill);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(h * 0.13, 10), mat(0xf2e0a0));
  sun.position.set(w * 0.26, h * 0.2, 0.05);
  g.add(sun);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

// A wall clock — a disc with two hands, permanently at ten past ten.
// A 24cm dial and a 3cm rim: everything here is inside the thin-member rule,
// so the clock takes light responses only. The face is a painted dial, the rim
// is a turned wooden bezel, and the hands are left at the default.
export function wallClock(x, y, z, rotY = 0) {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 24),
    surfNoMap(0xf0e4d0, 'siding'));
  face.rotation.x = Math.PI / 2;
  g.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 8, 28),
    surfNoMap(0x7a5230, 'wood'));
  g.add(rim);
  for (const [len, ang] of [[0.16, -0.9], [0.11, 1.05]]) {
    const hand = box(0.025, len, 0.02, 0x3a3a42);
    hand.position.set(Math.sin(ang) * len / 2, Math.cos(ang) * len / 2, 0.04);
    hand.rotation.z = -ang;
    g.add(hand);
  }
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

// A gathered curtain hanging beside a window. Two folds, no collider.
// LEFT FLAT: heavy cotton is matte, and there is no cloth tile — see the
// vocabulary-gap note in this block's header. (Nor does it sway: wind is an
// outdoor system and there is no draught model indoors.)
export function curtain(x, y, z, rotY = 0, w = 0.5, h = 1.7, color = 0xc07a6a) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const fold = box(w / 3, h, 0.08 + (i % 2) * 0.05, color);
    fold.position.set(-w / 2 + (i + 0.5) * (w / 3), -h / 2, 0);
    g.add(fold);
  }
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

// A wall-hung shelf. `y` IS the walkable top of the plank (the caller's perch
// height), and the plank is centred on the group's origin in depth, so a
// shelf on a wall at world x = -9 with depth 1.05 has its origin at
// -9 + depth/2 and reaches (depth/2) into the room.
export function wallShelf(x, y, z, rotY = 0, w = 1.4, depth = 1.05, color = 0x9a7048) {
  const g = new THREE.Group();
  // The one shelf face a cat ever looks at is the top, 1.4 x 1.05 — one whole
  // plank tile, i.e. four ~35cm boards. Derived from those two, not the 7cm
  // thickness.
  const plank = surfBox(w, 0.07, depth, color, 'wood', w, depth);
  plank.position.y = y - 0.035;
  g.add(plank);
  for (const bx of [-w / 2 + 0.16, w / 2 - 0.16]) {
    const bracket = new THREE.Mesh(roundedBox(0.06, 0.24, depth * 0.55),
      surfNoMap(0x6a5230, 'wood'));
    bracket.position.set(bx, y - 0.19, -depth * 0.2);
    g.add(bracket);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A stack of books lying flat. `seed` only picks colours and offsets off an
// integer — no rng (see this block's header). Left flat: a 7cm-thick book is
// the thin-member rule twice over, and cloth boards are matte.
export function bookStack(x, y, z, count = 3, seed = 0) {
  const g = new THREE.Group();
  const colors = [0x9a4a3a, 0x3a5a78, 0x4a6a4a, 0xb08a3a, 0x6a4a6a];
  for (let i = 0; i < count; i++) {
    const bk = box(0.3 - (i % 2) * 0.04, 0.07, 0.22, colors[(seed + i) % colors.length]);
    bk.position.set(Math.sin(seed + i) * 0.03, y + 0.035 + i * 0.075, Math.cos(seed * 2 + i) * 0.03);
    bk.rotation.y = Math.sin(seed * 3 + i) * 0.25;
    g.add(bk);
  }
  g.position.set(x, 0, z);
  return g;
}

// A bookcase. Walkable top is BOOKCASE_H — high enough that no cat reaches it
// off the floor inside the 1.6 climb budget, which is the whole point: it is
// the top of a chain, not a step.
export const BOOKCASE_H = 1.9;

export function bookcase(x, z, rotY = 0, w = 1.5, depth = 0.5) {
  const g = new THREE.Group();
  // The backer is the one big face here — 1.5 x 1.9, so [2, 2] of the plank
  // tile — and it is the surface you see THROUGH the shelves, which is what
  // makes the whole piece read as timber rather than as painted boxes.
  const backer = surfBox(w, BOOKCASE_H, 0.06, 0x7a5230, 'wood');
  backer.position.set(0, BOOKCASE_H / 2, -depth / 2 + 0.03);
  g.add(backer);
  for (const sx of [-w / 2 + 0.05, w / 2 - 0.05]) { // uprights, 0.1 — thin-member rule
    const side = new THREE.Mesh(roundedBox(0.1, BOOKCASE_H, depth),
      surfNoMap(0x9a7048, 'wood'));
    side.position.set(sx, BOOKCASE_H / 2, 0);
    g.add(side);
  }
  const shelfYs = [0.06, 0.62, 1.18, BOOKCASE_H - 0.04];
  for (const sy of shelfYs) {
    // Tiled off the shelf's top face (w x depth), not its 8cm edge.
    const shelf = surfBox(w, 0.08, depth, 0x9a7048, 'wood', w, depth);
    shelf.position.set(0, sy, 0);
    g.add(shelf);
  }
  // spines: a row of upright books per shelf, leaning where the row runs out
  const colors = [0x9a4a3a, 0x3a5a78, 0x4a6a4a, 0xb08a3a, 0x6a4a6a, 0xc06a48];
  for (let s = 0; s < 3; s++) {
    const base = shelfYs[s] + 0.04;
    for (let i = 0; i < 7; i++) {
      const h = 0.34 + ((s * 7 + i) % 3) * 0.05;
      const spine = box(0.09, h, depth * 0.62, colors[(s * 5 + i) % colors.length]);
      spine.position.set(-w / 2 + 0.18 + i * 0.16, base + h / 2, 0.02);
      spine.rotation.z = i === 6 ? 0.22 : 0;
      g.add(spine);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A potted houseplant. PLANT_H is the height at scale 1; nothing perches on
// it (leaves are not a surface) so it is a constant for collider/camera
// bookkeeping rather than for a perch.
export const PLANT_H = 1.15;

// Takes NO wind, deliberately, though it is foliage: it is an indoor prop and
// there is no draught model inside the den. If a later area puts one on a
// balcony, give it the same `{ wind }` option tree() and bush() carry.
export function pottedPlant(x, z, scale = 1) {
  const g = new THREE.Group();
  // Terracotta — fired clay, so it takes 'brick's response (0.88, the faint
  // vitrified sheen a fired face has and a plastered one does not) with the
  // bond pattern left off, because a 10-sided cylinder is the cylinder rule.
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.36, 16),
    surfNoMap(0xc06a48, 'brick'));
  pot.position.y = 0.18;
  g.add(pot);
  // Potting compost: 'matte' out loud. It is the flattest thing in the room
  // and the one surface that should stay flatter than the pot around it.
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 16),
    surfMat(0x4a3a30, 'matte'));
  soil.position.y = 0.36;
  g.add(soil);
  const stem = new THREE.Mesh(roundedBox(0.05, 0.5, 0.05), surfMat(0x4e7a40, 'bark'));
  stem.position.y = 0.6;
  g.add(stem);
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0),
      surfMat(i % 2 ? 0x4e9440 : 0x5aa04e, 'foliage'));
    leaf.position.set(Math.sin(i * 2.3) * 0.22, 0.72 + (i % 3) * 0.14, Math.cos(i * 1.9) * 0.22);
    leaf.scale.set(1, 0.7, 1);
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  return g;
}

// A wall radiator with fins and a valve. RADIATOR_H is its top; it is only a
// perch if the caller can put the cat within reach of it, which against a
// wall it usually cannot (see world/den.js).
export const RADIATOR_H = 0.62;

export function radiator(x, z, rotY = 0, w = 1.5) {
  const g = new THREE.Group();
  // Stove-enamelled pressed steel throughout, including the brass valve and
  // pipe. 'paintedMetal' and never 'bareMetal': the whole assembly is off-
  // white, and at metalness 0.85 an off-white prop loses its diffuse term and
  // becomes a mirror of a dim room — see the note on fireEscape.
  const enamel = (bw, bh, bd, color) => surfBox(bw, bh, bd, color, 'paintedMetal');
  const panel = enamel(w, RADIATOR_H - 0.12, 0.1, 0xf0ece4);
  panel.position.y = 0.12 + (RADIATOR_H - 0.12) / 2;
  g.add(panel);
  const fins = Math.max(4, Math.round(w / 0.16));
  for (let i = 0; i < fins; i++) {
    const fin = enamel(0.06, RADIATOR_H - 0.16, 0.17, 0xe4dfd4);
    fin.position.set(-w / 2 + 0.08 + i * ((w - 0.16) / (fins - 1)), 0.12 + (RADIATOR_H - 0.12) / 2, 0);
    g.add(fin);
  }
  const cap = enamel(w, 0.06, 0.2, 0xf0ece4);
  cap.position.y = RADIATOR_H;
  g.add(cap);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10),
    surfMat(0xb0a070, 'paintedMetal'));
  valve.position.set(w / 2 - 0.02, 0.2, 0.08);
  g.add(valve);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8),
    surfMat(0xb0a070, 'paintedMetal'));
  pipe.position.set(w / 2 - 0.02, 0.1, 0.08);
  g.add(pipe);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// An armchair. Two walkable tops — the seat and the back — and they are
// 0.45 apart on purpose: a cat on the seat can always step up to the back.
export const ARMCHAIR_SEAT = 0.5;
export const ARMCHAIR_BACK = 0.95;

export function armchair(x, z, rotY = 0, color = 0x8a5a6a) {
  const g = new THREE.Group();
  const seat = box(1.0, 0.16, 0.9, color);
  seat.position.y = ARMCHAIR_SEAT - 0.08;
  g.add(seat);
  const cushion = box(0.86, 0.1, 0.76, 0xa8707e);
  cushion.position.y = ARMCHAIR_SEAT + 0.03;
  g.add(cushion);
  const back = box(1.0, ARMCHAIR_BACK - 0.34, 0.18, color);
  back.position.set(0, 0.34 + (ARMCHAIR_BACK - 0.34) / 2, -0.36);
  g.add(back);
  for (const ax of [-0.5, 0.5]) {
    const arm = box(0.16, 0.28, 0.9, color);
    arm.position.set(ax, 0.58, 0);
    g.add(arm);
  }
  // The seat, cushion, back and arms stay FLAT on purpose: they are
  // upholstery, and the vocabulary has no cloth. The turned legs are the one
  // timber part, and at 9cm they are the thin-member rule.
  for (const [lx, lz] of [[-0.42, 0.38], [0.42, 0.38], [-0.42, -0.38], [0.42, -0.38]]) {
    const leg = new THREE.Mesh(roundedBox(0.09, 0.34, 0.09),
      surfNoMap(0x6a4a30, 'wood'));
    leg.position.set(lx, 0.17, lz);
    g.add(leg);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A chest of drawers. DRESSER_H is the walkable top — inside the 1.6 climb
// budget from the floor, so it is a one-hop perch rather than a chain.
export const DRESSER_H = 1.25;

export function dresser(x, z, rotY = 0, w = 1.2, depth = 0.6) {
  const g = new THREE.Group();
  // 1.2 x 1.11 carcass and a 1.2 x 0.6 lid, so roughly one plank tile each —
  // four ~30cm boards, which is a chest of drawers. The drawer fronts get the
  // same tile at their own density so their grain lines up with the carcass
  // rather than running at a second scale across it.
  const carcass = surfBox(w, DRESSER_H - 0.14, depth, 0x9a7048, 'wood');
  carcass.position.y = 0.14 + (DRESSER_H - 0.14) / 2;
  g.add(carcass);
  const top = surfBox(w + 0.08, 0.07, depth + 0.08, 0xb08a58, 'wood', w + 0.08, depth + 0.08);
  top.position.y = DRESSER_H - 0.035;
  g.add(top);
  for (let i = 0; i < 3; i++) {
    const front = surfBox(w - 0.16, 0.28, 0.04, 0xb08a58, 'wood');
    front.position.set(0, 0.3 + i * 0.34, depth / 2 + 0.02);
    g.add(front);
    for (const kx of [-w * 0.22, w * 0.22]) {
      // 4.5cm turned knobs, and a sphere besides: thin-member and cylinder
      // rules both, so light response only.
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 7),
        surfNoMap(0x5a4028, 'wood'));
      knob.position.set(kx, 0.3 + i * 0.34, depth / 2 + 0.06);
      g.add(knob);
    }
  }
  for (const lx of [-w / 2 + 0.1, w / 2 - 0.1]) {
    const foot = new THREE.Mesh(roundedBox(0.12, 0.14, depth - 0.1),
      surfNoMap(0x6a4a30, 'wood'));
    foot.position.set(lx, 0.07, 0);
    g.add(foot);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A boxy old telly on a low stand. Deliberately a CRT: a flatscreen's top
// edge is not somewhere a cat can sit, and sitting on the telly is the whole
// joke. TV_TOP is that walkable top. The screen is emissive but carries NO
// userData.window — the dusk pass swaps window materials for a warm glow, and
// a telly that turns into a lamp at dusk would read as a bug.
export const TV_TOP = 1.3;

export function tvSet(x, z, rotY = 0) {
  const g = new THREE.Group();
  // Veneered stand, moulded set. The stand and its lid are timber and carry
  // the plank tile; the CASING is 1970s injection-moulded plastic, which
  // 'paintedMetal' at roughness 0.35 draws better than anything else here — a
  // continuous polymer skin with a broad soft highlight, which is exactly what
  // that preset is (its metalness is 0, so no metal read sneaks in).
  const stand = surfBox(1.3, 0.5, 0.55, 0x8a6a42, 'wood');
  stand.position.y = 0.25;
  g.add(stand);
  const shelf = surfBox(1.2, 0.05, 0.5, 0x6a5230, 'wood', 1.2, 0.5);
  shelf.position.y = 0.22;
  g.add(shelf);
  const body = surfBox(1.1, TV_TOP - 0.52, 0.5, 0x53433a, 'paintedMetal');
  body.position.y = 0.52 + (TV_TOP - 0.52) / 2;
  g.add(body);
  const screen = new THREE.Mesh(
    roundedBox(0.86, 0.52, 0.04),
    litMaterial(0xa8d8e8, { emissive: 0x3a6a80 })
  );
  screen.position.set(0, 0.9, 0.26);
  g.add(screen);
  const lid = surfBox(1.16, 0.06, 0.56, 0x6a5648, 'wood', 1.16, 0.56); // the walkable top
  lid.position.y = TV_TOP - 0.03;
  g.add(lid);
  for (const ax of [-0.2, 0.2]) { // rabbit ears, purely for the silhouette
    const ear = surfBox(0.03, 0.5, 0.03, 0x8a8a92, 'paintedMetal');
    ear.position.set(ax, TV_TOP + 0.25, -0.1);
    ear.rotation.z = ax * 1.6;
    g.add(ear);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A basket of toys. Low and collider-free — a cat should be able to stand in
// its own toy basket. LEFT FLAT: woven willow, and there is no wicker tile;
// the plank tile would put straight sawn boards around a curved basket.
export function toyBasket(x, z) {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.34, 20, 1, true), litMaterial(0xc8a678, { side: THREE.DoubleSide }));
  bowl.position.y = 0.17;
  g.add(bowl);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 20), mat(0xb89468));
  base.position.y = 0.02;
  g.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 24), mat(0xb89468));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.34;
  g.add(rim);
  const balls = [0xd8504e, 0x4a8ec8, 0xe0b040];
  for (let i = 0; i < 3; i++) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 9), mat(balls[i]));
    ball.position.set(Math.sin(i * 2.1) * 0.15, 0.3 + (i % 2) * 0.11, Math.cos(i * 2.7) * 0.15);
    g.add(ball);
  }
  g.position.set(x, 0, z);
  return g;
}

// A crinkle tunnel. LEFT FLAT: nylon over a wire hoop, no cloth tile, and a
// 12-sided cylinder is the cylinder rule anyway.
//
// Open at both ends and COLLIDER-FREE on purpose: the cat
// walks through it, and world/den.js registers its middle as a `boxes` hide
// spot so "if I fits, I sits" fires inside it.
export function catTunnel(x, z, rotY = 0, len = 1.7, r = 0.36) {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, len, 20, 1, true),
    litMaterial(0x6a9ab8, { side: THREE.DoubleSide })
  );
  tube.rotation.z = Math.PI / 2;
  tube.position.y = r;
  g.add(tube);
  for (let i = 0; i < 4; i++) { // crinkle rings
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.03, 6, 20), mat(0x4a7a98));
    ring.rotation.y = Math.PI / 2;
    ring.position.set(-len / 2 + (i + 0.5) * (len / 4), r, 0);
    g.add(ring);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A food bowl and a water bowl on a mat.
//
// NO WATER RECORD. The bowl is a mesh and nothing else: it is not a `puddles`
// entry and it is not a `waters` footprint (see the block at the bottom of
// this file). The den declares neither, and a 0.2m dish of water is not a
// body of water a cat can fall into — dropping one into `waters` would pull
// the whole v19 invariant set into a room that has no shoreline.
export function petBowls(x, z, rotY = 0) {
  const g = new THREE.Group();
  const mat_ = box(0.9, 0.02, 0.6, 0x6a8a9a);
  mat_.position.y = 0.012;
  g.add(mat_);
  // Glazed ceramic, so 'paintedMetal' — the preset is a smooth continuous
  // coating over an opaque body at metalness 0, which is a glaze as exactly as
  // it is car paint. The WATER bowl's fill takes the 'water' preset (the same
  // one the puddles get) and the food bowl's does not, which is the whole
  // reason the surface is carried in the tuple rather than assumed.
  for (const [bx, color, fill, fillSurface] of [
    [-0.22, 0xd8504e, 0xb08a58, 'matte'],
    [0.22, 0x4a8ec8, 0x8ac8e0, 'water'],
  ]) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.13, 0.1, 18),
      surfMat(color, 'paintedMetal'));
    bowl.position.set(bx, 0.07, 0);
    g.add(bowl);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 18),
      surfMat(fill, fillSurface));
    inner.position.set(bx, 0.115, 0);
    g.add(inner);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// Scattered cat toys — a couple of balls and a felt mouse. Tiny, collider-
// free, and placed off `seed` by arithmetic (no rng). Left flat: nothing here
// is over 9cm, and felt is the mattest material in the house.
export function catToys(x, z, seed = 0) {
  const g = new THREE.Group();
  const colors = [0xd8504e, 0xe0b040, 0x4a8ec8];
  for (let i = 0; i < 2; i++) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 9), mat(colors[(seed + i) % 3]));
    ball.position.set(Math.sin(seed * 2 + i * 2.4) * 0.5, 0.09, Math.cos(seed * 3 + i * 1.7) * 0.5);
    g.add(ball);
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 9), mat(0x9a9aa2));
  body.scale.set(1.5, 0.8, 1);
  body.position.set(0, 0.07, 0);
  g.add(body);
  const tail = box(0.22, 0.02, 0.02, 0xd8b0b8);
  tail.position.set(-0.2, 0.06, 0);
  tail.rotation.y = Math.sin(seed) * 0.6;
  g.add(tail);
  g.position.set(x, 0, z);
  g.rotation.y = Math.sin(seed * 1.3) * 1.2;
  return g;
}

// LEFT FLAT for cardboardBox's reason: kraft paper has no grain to imitate and
// the vocabulary has no fibre tile.
//
// A paper grocery bag, tipped on its side. Cover, like cardboardBox above —
// no collider, and world/den.js registers its mouth as a `boxes` hide spot.
export function paperBag(x, z, rotY = 0) {
  const g = new THREE.Group();
  for (const [w, h, d, px, py, pz] of [
    [0.5, 0.44, 0.03, 0, 0.22, 0.22], [0.5, 0.44, 0.03, 0, 0.22, -0.22],
    [0.03, 0.44, 0.44, 0.24, 0.22, 0], [0.5, 0.03, 0.44, 0, 0.005, 0],
  ]) {
    const panel = box(w, h, d, 0xd8b688);
    panel.position.set(px, py, pz);
    g.add(panel);
  }
  const fold = box(0.5, 0.06, 0.44, 0xc8a678); // the rolled-over top edge
  fold.position.set(-0.24, 0.44, 0);
  fold.rotation.z = 0.3;
  g.add(fold);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// A log basket beside a hearth: a hoop of logs, ends out. The woven hoop stays
// flat (wicker again); the logs take 'bark', which is the preset built for
// exactly this shape and ships map-less because of it.
export function logBasket(x, z) {
  const g = new THREE.Group();
  const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.36, 18, 1, true), litMaterial(0x8a6a42, { side: THREE.DoubleSide }));
  hoop.position.y = 0.18;
  g.add(hoop);
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 10),
      surfMat(i % 2 ? 0x7a5230 : 0x6a4a30, 'bark'));
    log.position.set(Math.sin(i * 2.2) * 0.14, 0.34 + (i % 2) * 0.1, Math.cos(i * 1.6) * 0.14);
    log.rotation.set(Math.PI / 2, Math.sin(i) * 0.4, 0);
    g.add(log);
  }
  g.position.set(x, 0, z);
  return g;
}

// =============================================================================
// WATER FOOTPRINTS — v19.
//
// Water in this game has never carried a collider: the park pond, the seaside
// sea and the Docks canal are all walk-over surfaces as shipped. A later wave
// makes them solid (and reinstates Sea Legs with them), and the one thing that
// wave must not have to do is re-derive three footprints from the mesh
// literals that draw them — a PlaneGeometry nudged half a metre would silently
// move the water out from under every invariant that depends on it.
//
// So every area that has water returns `waters`, and everything that needs to
// know where the water is reads THAT: the invariant tests in
// test/water.test.js, scent.js's buried-treat placement, and eventually the
// collider wave itself. In all three areas the mesh is now BUILT FROM the
// declaration rather than sitting beside it, so the two cannot disagree.
//
// Two footprint kinds, which between them cover all three bodies of water:
//
//   { id, kind: 'circle', x, z, r }                the park pond
//   { id, kind: 'rect', minX, maxX, minZ, maxZ }   the seaside sea — and the
//                                                  Docks canal, which is just
//                                                  a rect that happens to span
//                                                  the whole map width, i.e. a
//                                                  band
//
// A footprint may also carry `decks`: axis-aligned rectangles of DRY structure
// standing over the water — the seaside pier, the Docks' two bridges. A deck
// is how an area says "content may stand here, and a future water collider
// must leave this hole in itself". Every function below treats a point on a
// deck as dry land.
//
// All of this is plain data and pure geometry: no THREE, no renderer, so the
// world files stay unit-testable headless.
// =============================================================================

// Signed distance from (x, z) to a footprint's edge: negative inside the
// water, positive on dry land. For a rect the inside case reports the
// SHALLOWEST penetration (the nearest way out), which is what makes the
// push-out below take the short route to shore.
export function waterGap(w, x, z) {
  if (w.kind === 'circle') return Math.hypot(x - w.x, z - w.z) - w.r;
  const dx = Math.max(w.minX - x, x - w.maxX);
  const dz = Math.max(w.minZ - z, z - w.maxZ);
  if (dx > 0 || dz > 0) return Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  return Math.max(dx, dz);
}

// Is (x, z) standing on one of this footprint's dry decks?
export function onDeck(w, x, z) {
  return (w.decks ?? []).some(
    (d) => x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ,
  );
}

// waterClearance(waters, x, z) — how far the point is from the nearest water's
// edge: positive on dry land, negative in the water, Infinity where there is
// no water to be near (an area with none, or a point standing on a deck).
export function waterClearance(waters, x, z) {
  let min = Infinity;
  for (const w of waters ?? []) {
    if (onDeck(w, x, z)) continue;
    min = Math.min(min, waterGap(w, x, z));
  }
  return min;
}

export function inWater(waters, x, z) {
  return waterClearance(waters, x, z) < 0;
}

function pushOutOf(w, x, z, margin) {
  if (w.kind === 'circle') {
    let dx = x - w.x, dz = z - w.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = 1; dz = 0; d = 1; } // dead-centre: fixed +x push
    const need = w.r + margin;
    return { x: w.x + (dx / d) * need, z: w.z + (dz / d) * need };
  }
  return nearestOf(x, z, [
    { x: w.minX - margin, z }, { x: w.maxX + margin, z },
    { x, z: w.minZ - margin }, { x, z: w.maxZ + margin },
  ]);
}

function clampInto(d, x, z, margin) {
  const cl = (v, lo, hi) => (lo + margin >= hi - margin
    ? (lo + hi) / 2
    : Math.min(hi - margin, Math.max(lo + margin, v)));
  return { x: cl(x, d.minX, d.maxX), z: cl(z, d.minZ, d.maxZ) };
}

function nearestOf(x, z, cands) {
  let best = cands[0];
  let bestD = Math.hypot(best.x - x, best.z - z);
  for (const c of cands) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

/**
 * nearestDry(waters, x, z, margin) — the closest point to (x, z) that is out
 * of every water by at least `margin`, or the point itself when it already is.
 * Pure and deterministic (no rng), because its one caller places buried treats
 * for a co-walk both clients must agree on.
 *
 * Two candidate escapes per footprint, because over a long pier the short way
 * out is not the shore:
 *   * straight out over the nearest edge of the footprint;
 *   * onto the nearest of its decks.
 * The closer candidate wins, so a treat that rolled off the seaside's pier POI
 * climbs back onto the pier instead of being flung 11m west to the sand.
 */
export function nearestDry(waters, x, z, margin = 0.6) {
  let p = { x, z };
  const list = waters ?? [];
  // A push out of one footprint can only land inside another where two bodies
  // of water touch — no area does that today, but the relaxation is two lines
  // and stops the function from silently returning a wet point if one ever does.
  for (let pass = 0; pass < 3; pass++) {
    const w = list.find((wt) => !onDeck(wt, p.x, p.z) && waterGap(wt, p.x, p.z) < margin);
    if (!w) break;
    p = nearestOf(x, z, [
      pushOutOf(w, p.x, p.z, margin),
      ...(w.decks ?? []).map((d) => clampInto(d, p.x, p.z, margin)),
    ]);
  }
  return p;
}
