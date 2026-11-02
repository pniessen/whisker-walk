import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial, repeatFor, surfaceProps, tileMetres } from '../render/materials.js';
import { skyBackground } from '../render/sky.js';
import { conformTriangles } from './meshconform.js';
import { createRockRelief, strataBand, noise3, CREST_BAND, RELIEF_DEPTH } from './rockrelief.js';

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
// Docks' four paths are 'flagstone' (Stream 4 round two: big slabs, so they
// read apart from the small cobbles they run over). None of those three
// should have to change for either of the others, so nobody is defaulted into
// a surface here. `color` replaces the shared path beige where an area's
// palette needs it (the Docks, again).
export function path(x1, z1, x2, z2, w = 2, { surface, color = 0xcbb8a0 } = {}) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  // Segmented along both axes — see segsFor()/GROUND-PLANE MACRO VARIATION
  // above tree(). Width gets at most a handful of segments (paths run 1-5m
  // wide; more than that resolves nothing), length gets enough to carry a
  // patch wavelength derived from the path's OWN length via wavelengthFor(),
  // not a constant shared with the 120m ground plane.
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
function addRoofBlock(parts, tones, bases, { k, x, z, yaw, base, bh, salt, tint }) {
  const before = parts.length;
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
  }
  for (let i = before; i < parts.length; i++) bases.push(tint);
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
  const shore = (x, z, d) => {
    if (avoid.length === 0) return 1;
    const c = waterClearance(avoid, x, z);
    const dry = smoothstep(0, SHORE_RAMP, c);
    const far = closeWater ? smoothstep(CLOSE_FROM * span, CLOSE_TO * span, d) : 0;
    const f = Math.max(c < 0 ? 0 : dry, far);
    return keepLow.length ? Math.min(f, lowZone(x, z)) : f;
  };
  const heightAt = (x, z, d) => -BAND_SINK + ringHeight * relief(x, z) * lift(d) * shore(x, z, d);
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
      if (wet(cx * cs, cz * cs)
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

  if (rooftops) {
    // Salted apart from the skyline kind's own blocks, so a band that has both
    // does not stack two blocks on the same spot.
    const rsalt = salt + ROOFTOP_SALT;
    rooftopSpots(rooftops, inner, outer, rsalt).forEach(({ x, z, yaw }, k) => {
      if (wet(x, z)) return;
      // No height given: the band's own, the same default the skyline kind's
      // blocks are scaled from. Without it every block would be NaN tall.
      const bh = (rooftops.height ?? height) * (0.40 + 0.75 * hash01(k, 4, rsalt + 5));
      const base = heightAt(x, z, Math.max(Math.abs(x), Math.abs(z)) - inner) - 0.5;
      addRoofBlock(parts, tones, bases, {
        k, x, z, yaw, base, bh, salt: rsalt, tint: sideTints ? sideTintColor(x, z, sideTints) : null,
      });
    });
  }

  // Vertex colours: the skyline's per-block tones, and/or the side tints. A
  // part's colour is its tint (white when there are none) times its tone.
  const coloured = kind === 'skyline' || !!sideTints || !!rooftops;
  if (coloured) {
    parts.forEach((p, i) => {
      const [r, g2, bl] = tones[i];
      const n = p.attributes.position.count;
      const pp = p.attributes.position;
      const c = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) {
        // The ring takes its tint per vertex; a block takes one for the lot.
        const t = i === 0 && sideTints ? sideTintColor(pp.getX(v), pp.getZ(v), sideTints) : bases[i];
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
  const m = new THREE.Mesh(geo, litMaterial(sideTints ? 0xffffff : color, { flatShading: true, vertexColors: coloured }));
  // Named so a test (and a future draw-call audit) can find it without the
  // area files having to publish it as a record — the same trick path() uses.
  m.name = 'horizonBand';
  // Never culled: the camera is always INSIDE the ring's bounding sphere, so
  // the test can only ever come back true. Saying so costs nothing and stops
  // a future reader wondering whether it should have been split up.
  m.frustumCulled = false;
  return m;
}

// THE TREES' OCCLUDER SHAPES (src/fightcam.js). Each tree carries, in its
// Group's own unscaled frame, a few simple solids that hold every vertex it
// draws: vertical cylinders { t: 'cyl', r, y0, y1 } on the tree's axis and
// ellipsoids { t: 'ell', y, r, ry } centred on it. The fight camera keeps its
// lines to both cats clear of them. test/fightcam.test.js rebuilds trees at
// many spots and scales and checks every vertex sits inside. Data only: no
// mesh, no draw, nothing changes on screen.
//
// The oak's canopy blob reaches 1.90 of its 1.6 nominal radius (its second
// lobe bulges out and down to y 0.9), hence the 1.95 sphere.
const OAK_TRUNK = Object.freeze({ t: 'cyl', r: 0.35, y0: 0, y1: 2 });
export const TREE_OCCLUDER = Object.freeze([OAK_TRUNK, Object.freeze({ t: 'ell', y: 2.8, r: 1.95, ry: 1.95 })]);
function willowOccluder(curtainFloor) {
  return Object.freeze([
    OAK_TRUNK,
    Object.freeze({ t: 'ell', y: 2.8, r: 1.95, ry: 1.95 * 0.75 }),
    // the curtain: strands out to 1.55 (plus their own half-width), from the
    // floor (or 0.1 under the top, whichever is lower) to the top
    Object.freeze({ t: 'cyl', r: 1.6, y0: Math.min(curtainFloor, 2.8), y1: 2.9 }),
  ]);
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
  // Where the canopy is, in the Group's own (unscaled) frame. render/ambient.js
  // reads this off the scene at walk time to drop leaves from under real
  // canopies; it survives mergeStaticProps, which keeps every top-level Group.
  g.userData.canopy = { y: leaves.position.y, r: 1.6 };
  g.userData.occluder = TREE_OCCLUDER;
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
  // The globe's height, for render/ambient.js's dusk moths (read off the
  // scene, so a lamp added in a world file gets moths with no second edit).
  g.userData.lampGlobeY = lamp.position.y;
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
export function puddle(x, z, r = 0.8, y = 0) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 12), surfMat(0x8ab8d8, 'water'));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + 0.02, z);
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

// One long plank from (x1, z1) to (x2, z2), its top at about `y`: the lake's
// island bridge. A plain box, not roundedBox, so its length and width can be
// read straight off its geometry. Dock timber at the Seaside pier's scale, the
// repeat taken from the top face's real w x len, so the boards run along it.
export function plankBridge(x1, z1, x2, z2, w, y, thick) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const geo = new THREE.BoxGeometry(w, thick, len);
  plankEdgeUVs(geo, w, thick, len);
  const m = new THREE.Mesh(geo, surfMat(0x8a6a44, 'wood', w, len));
  m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  m.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  // A plank lying on the water: flat ground dressing, out of the shadow pass
  // like reedBed and steppingStones. Its thickness sits right on rig.js's
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

// A trunk laid across a stream as a bridge, its top hewn flat to walk on, the
// way a real log bridge is. Like bridgeDeck it emits no collider: the walkable
// part is the area's own crossing record, this is the picture of it. `w` is
// the trunk's diameter and `flat` the width of the hewn top, which sits level
// at `y` from end to end; the trunk's round flanks fall away on either side
// and into the water. A deck record should be no wider than `flat`, so a cat
// on the deck is on the log.
//
// Extruded from the trunk's cross-section (a circle with its top sliced off)
// rather than built as a sunk cylinder: a sunk 12-sided cylinder shows only
// the ridge between its two top facets, about 7.5 x its height above the
// water, so a walkable width meant a trunk several metres across.
export function logBridge(x1, z1, x2, z2, w = 1.6, y = 0.14, flat = w * 0.6) {
  const g = new THREE.Group();
  const len = Math.hypot(x2 - x1, z2 - z1);
  const r = w / 2;
  const hw = Math.min(flat / 2, r * 0.98);
  const c = Math.sqrt(r * r - hw * hw);
  const phi = Math.atan2(c, hw);
  const shape = new THREE.Shape();
  shape.moveTo(-hw, c);
  shape.lineTo(hw, c);
  // clockwise from the flat's right end, round under the bottom, to its left end
  shape.absarc(0, 0, r, phi, Math.PI - phi, true);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 20 });
  geo.translate(0, -c, -len / 2);
  const trunk = new THREE.Mesh(geo, surfNoMap(0x6e4a2c, 'bark'));
  trunk.position.y = y;
  g.add(trunk);
  g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
  g.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  return g;
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
    stone.rotateY(hash01(i, 4, 61) * Math.PI);
    stone.translate(sx, (i % 2 ? -0.5 : 0.5) * stagger, sz);
    geoms.push(stone);
  }
  const geo = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
  if (geoms.length > 1) for (const p of geoms) p.dispose();
  const m = new THREE.Mesh(geo, surfNoMap(0x8a8a84, 'cobble'));
  m.castShadow = false;
  m.userData.noCast = true;
  return m;
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

// Clumps of reeds at `spots`, one merged mesh. Blades are thin leaning boxes,
// at most 1.0 m before the lean (the budget is 1.1 m). A bed is wide and low,
// so it opts out of the caster sweep like the stones do.
const REED_BLADES = 5;
export function reedBed(spots, seed) {
  const geoms = [];
  spots.forEach((sp, i) => {
    for (let k = 0; k < REED_BLADES; k++) {
      const h = 0.6 + 0.4 * hash01(sp.x + k, sp.z + i, seed + 1);
      const blade = new THREE.BoxGeometry(0.04, h, 0.04);
      blade.translate(0, h / 2, 0);
      blade.rotateX((hash01(sp.x, sp.z + k, seed + 2) - 0.5) * 0.3);
      blade.rotateZ((hash01(sp.x + k, sp.z, seed + 3) - 0.5) * 0.3);
      blade.translate(
        sp.x + (hash01(k, i, seed + 4) - 0.5) * 0.5,
        0,
        sp.z + (hash01(i, k, seed + 5) - 0.5) * 0.5,
      );
      geoms.push(blade);
    }
  });
  const geo = geoms.length === 0 ? new THREE.BufferGeometry()
    : geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
  if (geoms.length > 1) for (const p of geoms) p.dispose();
  const m = new THREE.Mesh(geo, surfNoMap(0x8aa05a, 'foliage'));
  m.castShadow = false;
  m.userData.noCast = true;
  return m;
}

// Ferns, a clump at each spot, one merged mesh: FERN_FRONDS thin fronds
// arching out from the middle, under 0.6 m tall, so they dress the floor of a
// wood without hiding a cat or a path. Low and wide like the reeds, so they
// opt out of the caster sweep the same way.
const FERN_FRONDS = 7;
export function fernBed(spots, seed) {
  const geoms = [];
  spots.forEach((sp, i) => {
    const turn = hash01(sp.x, sp.z, seed + 1) * Math.PI * 2;
    const size = 0.8 + 0.4 * hash01(sp.z, sp.x, seed + 2);
    for (let k = 0; k < FERN_FRONDS; k++) {
      const len = (0.5 + 0.2 * hash01(i, k, seed + 3)) * size;
      const frond = new THREE.BoxGeometry(0.17 * size, 0.015, len);
      frond.translate(0, 0, len / 2);
      // lifted 30-50 degrees off the ground, then turned to its place in the ring
      frond.rotateX(-(0.52 + 0.35 * hash01(k, i, seed + 4)));
      frond.rotateY(turn + (k / FERN_FRONDS) * Math.PI * 2 + (hash01(k, i, seed + 5) - 0.5) * 0.5);
      frond.translate(sp.x, 0, sp.z);
      geoms.push(frond);
    }
  });
  return mergedNoCast(geoms, 0x467f36, 'foliage');
}

// Bramble thickets, one merged mesh: each spot is three or four squashed
// low-poly lobes huddled together, under a metre tall. No collider, like a
// bush: a cat pushes through. Low and wide, so out of the caster sweep too.
export function brambleBed(spots, seed) {
  const geoms = [];
  spots.forEach((sp, i) => {
    const lobes = 3 + Math.floor(hash01(sp.x, sp.z, seed + 1) * 2);
    for (let k = 0; k < lobes; k++) {
      const r = 0.45 + 0.25 * hash01(i, k, seed + 2);
      const lobe = new THREE.IcosahedronGeometry(r, 0);
      lobe.scale(1, 0.62, 1);
      const a = hash01(k, i, seed + 3) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.45 + 0.35 * hash01(i + k, k, seed + 4);
      lobe.rotateY(hash01(k, i, seed + 5) * Math.PI);
      lobe.translate(sp.x + Math.cos(a) * d, r * 0.62 * 0.8, sp.z + Math.sin(a) * d);
      geoms.push(lobe);
    }
  });
  return mergedNoCast(geoms, 0x3b5e2e, 'foliage');
}

// Heather, one merged mesh: each spot is two flat purple cushions, the second
// shoved 0.3-0.5 m to one side. Under half a metre, so a cat pushes through it
// as through any bed, and out of the caster sweep like the other beds.
export function heatherBed(spots, seed) {
  const geoms = [];
  spots.forEach((sp, i) => {
    for (let k = 0; k < 2; k++) {
      const r = 0.35 + 0.2 * hash01(i, k, seed + 1);
      const cushion = new THREE.IcosahedronGeometry(r, 0);
      cushion.scale(1, 0.5, 1);
      cushion.computeBoundingBox();
      // sat on the ground: its lowest point at y 0
      cushion.translate(0, -cushion.boundingBox.min.y, 0);
      const a = hash01(k, i, seed + 2) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.3 + 0.2 * hash01(i, k, seed + 3);
      cushion.translate(sp.x + Math.cos(a) * d, 0, sp.z + Math.sin(a) * d);
      geoms.push(cushion);
    }
  });
  return mergedNoCast(geoms, 0x8a5a86, 'foliage');
}

// Gorse: brambleBed's huddle of squashed lobes in dark green, plus a second
// merged mesh of yellow flecks on the upper half of each lobe. Two meshes
// because one mesh has one colour. A bed a cat pushes through (no collider),
// under 0.95 m, out of the caster sweep.
export function gorseBed(spots, seed) {
  const lobes = [];
  const flecks = [];
  spots.forEach((sp, i) => {
    const count = 3 + Math.floor(hash01(sp.x, sp.z, seed + 1) * 2);
    for (let k = 0; k < count; k++) {
      const r = 0.4 + 0.2 * hash01(i, k, seed + 2);
      const a = hash01(k, i, seed + 3) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.4 + 0.3 * hash01(i + k, k, seed + 4);
      const cx = sp.x + Math.cos(a) * d;
      const cy = r * 0.62 * 0.8;
      const cz = sp.z + Math.sin(a) * d;
      const lobe = new THREE.IcosahedronGeometry(r, 0);
      lobe.scale(1, 0.62, 1);
      lobe.rotateY(hash01(k, i, seed + 5) * Math.PI);
      lobe.translate(cx, cy, cz);
      lobes.push(lobe);
      for (let f = 0; f < 2; f++) {
        const fa = hash01(k + f, i, seed + 6 + f) * Math.PI * 2;
        const el = 0.6 + 0.6 * hash01(i, k + f, seed + 8 + f); // upper half only
        const fleck = new THREE.IcosahedronGeometry(0.07, 0);
        fleck.translate(
          cx + Math.cos(fa) * Math.cos(el) * r * 0.95,
          cy + Math.sin(el) * r * 0.62 * 0.95,
          cz + Math.sin(fa) * Math.cos(el) * r * 0.95,
        );
        flecks.push(fleck);
      }
    }
  });
  const g = new THREE.Group();
  const gorse = mergedNoCast(lobes, 0x4d6630, 'foliage');
  gorse.name = 'gorse';
  const bloom = mergedNoCast(flecks, 0xe8c43a, 'foliage');
  bloom.name = 'gorseBloom';
  g.add(gorse, bloom);
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

// A weeping willow: tree()'s trunk, a lower, wider crown, and one merged
// curtain of thin strands hanging from the crown's rim. The curtain stops at
// `curtainFloor` (local y) and never lower, so a cat walks under a willow and
// the chase camera can see in; the Old Willow passes a higher floor so the
// camera sees under it to the golden mouse. Strand placement comes from
// hash01, never Math.random, so every client builds the same tree. No collider
// here; the area declares one, as for tree().
const WILLOW_STRANDS = 18;
export function willow(x, z, scale = 1, { wind, curtainFloor = 1.2 } = {}) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2, TRUNK_SIDES),
    surfMat(0x7a5230, 'bark'));
  trunk.position.y = 1;
  g.add(trunk);
  const crown = new THREE.Mesh(
    blobGeometry(x, z, 1.6, { lobes: 2, saltBase: 40 }),
    surfMat(organicTint(0x7fa04a, x, z, 10), 'foliage'),
  );
  crown.position.y = 2.8;
  crown.scale.y = 0.75;
  crown.rotation.y = hash01(x, z, 31) * Math.PI * 2;
  g.add(crown);
  const strands = [];
  for (let i = 0; i < WILLOW_STRANDS; i++) {
    // evenly spaced round the rim, each nudged so the ring is not a fence
    const a = ((i + hash01(x, z, 50 + i) * 0.8) / WILLOW_STRANDS) * Math.PI * 2;
    const rad = 1.35 + 0.2 * hash01(z, x, 70 + i);
    const top = 2.9;
    const bottom = Math.min(top - 0.1, Math.max(curtainFloor, top - (0.9 + 1.0 * hash01(x + i, z, 90))));
    const len = top - bottom;
    const strand = new THREE.BoxGeometry(0.06, len, 0.06);
    strand.translate(Math.cos(a) * rad, bottom + len / 2, Math.sin(a) * rad);
    strands.push(strand);
  }
  const curtain = new THREE.Mesh(mergeGeometries(strands, false), surfMat(0x8aaa52, 'foliage'));
  for (const p of strands) p.dispose();
  curtain.name = 'willowCurtain';
  g.add(curtain);
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  g.userData.canopy = { y: crown.position.y, r: 1.6 };
  g.userData.occluder = willowOccluder(curtainFloor);
  if (wind) wind.add(g, { sizeHint: scale, amplitude: swayFor(scale) });
  return g;
}

// A pine's shape, shared by `pine` and `pineStand` so the two can never drift
// apart: trunk radii, length and centre height, then each cone's
// [radius, height, centre height]. Exported (frozen) so test/pines.test.js can
// rebuild a pine's solid shape and keep the chase camera out of it.
export const PINE_TRUNK = Object.freeze({ rTop: 0.18, rBottom: 0.26, h: 1.6, y: 0.8 });
export const PINE_CONES = Object.freeze([[1.3, 1.8, 2.0], [1.0, 1.6, 2.9], [0.65, 1.3, 3.7]].map((c) => Object.freeze(c)));
// A pine's occluder shapes (see TREE_OCCLUDER): the trunk, and each cone as
// two stacked cylinders, its full radius over its lower half and half of it
// over the upper half, which holds the cone and wastes little round its tip.
export const PINE_OCCLUDER = Object.freeze([
  Object.freeze({ t: 'cyl', r: PINE_TRUNK.rBottom, y0: PINE_TRUNK.y - PINE_TRUNK.h / 2, y1: PINE_TRUNK.y + PINE_TRUNK.h / 2 }),
  ...PINE_CONES.flatMap(([r, h, y]) => [
    Object.freeze({ t: 'cyl', r, y0: y - h / 2, y1: y }),
    Object.freeze({ t: 'cyl', r: r / 2, y0: y, y1: y + h / 2 }),
  ]),
]);
const PINE_TRUNK_COLOR = 0x7a5230;
const PINE_FOLIAGE_COLOR = 0x2f5a3a;
const PINE_TRUNK_SIDES = 6;
const PINE_CONE_SIDES = 7;

// One pine's unplaced geometry: the trunk (already lifted to its centre
// height) and the three cones, built in one place for `pine` and `pineStand`.
function pineParts() {
  const trunk = new THREE.CylinderGeometry(PINE_TRUNK.rTop, PINE_TRUNK.rBottom, PINE_TRUNK.h, PINE_TRUNK_SIDES);
  trunk.translate(0, PINE_TRUNK.y, 0);
  const cones = PINE_CONES.map(([r, h, y]) => {
    const c = new THREE.ConeGeometry(r, h, PINE_CONE_SIDES);
    c.translate(0, y, 0);
    return c;
  });
  return { trunk, cones };
}

// A pine: a short bark trunk under three stacked cones, merged into one
// foliage mesh. Taller and narrower than an oak and it sheds no leaves, so it
// carries no `canopy` tag. No collider here.
export function pine(x, z, scale = 1, { wind } = {}) {
  const g = new THREE.Group();
  const { trunk: trunkGeo, cones } = pineParts();
  const trunk = new THREE.Mesh(trunkGeo, surfMat(PINE_TRUNK_COLOR, 'bark'));
  g.add(trunk);
  const foliage = new THREE.Mesh(mergeGeometries(cones, false), surfMat(PINE_FOLIAGE_COLOR, 'foliage'));
  for (const c of cones) c.dispose();
  g.add(foliage);
  g.scale.setScalar(scale);
  g.position.set(x, 0, z);
  g.userData.occluder = PINE_OCCLUDER;
  // The crown's radius for the corner map (ui/minimap.js), in the Group's own
  // frame: the bottom cone's. Not `canopy`, which would drop leaves.
  g.userData.mapCrown = PINE_CONES[0][0];
  if (wind) wind.add(g, { sizeHint: scale, amplitude: swayFor(scale) });
  return g;
}

// A stand of pines as two merged meshes, `standTrunks` and `standFoliage`: each
// tree is exactly `pine(x, z, scale)`'s trunk and three cones, scaled, turned
// about y by hash01(x, z, seed) x 2pi and put in place. One stand is two draw
// calls and two shadow casters however many pines it holds, where a swaying
// `pine` is two of each on its own. Dense forest is built this way. Both
// meshes cast (they are tall solids), the stand is still (no wind), and no
// collider is made here. A tree may carry a `y` (default 0), the height its
// foot stands at: the Gorge's stand grows on the 9 m west top.
export function pineStand(trees, seed) {
  const trunks = [];
  const cones = [];
  for (const t of trees) {
    const turn = hash01(t.x, t.z, seed) * Math.PI * 2;
    const place = (geo) => {
      geo.scale(t.scale, t.scale, t.scale);
      geo.rotateY(turn);
      geo.translate(t.x, t.y ?? 0, t.z);
      return geo;
    };
    const parts = pineParts();
    trunks.push(place(parts.trunk));
    for (const c of parts.cones) cones.push(place(c));
  }
  const merge = (geoms) => {
    const geo = geoms.length === 0 ? new THREE.BufferGeometry() : mergeGeometries(geoms, false);
    for (const p of geoms) p.dispose();
    return geo;
  };
  const g = new THREE.Group();
  const trunkMesh = new THREE.Mesh(merge(trunks), surfMat(PINE_TRUNK_COLOR, 'bark'));
  trunkMesh.name = 'standTrunks';
  const foliageMesh = new THREE.Mesh(merge(cones), surfMat(PINE_FOLIAGE_COLOR, 'foliage'));
  foliageMesh.name = 'standFoliage';
  trunkMesh.castShadow = true;
  foliageMesh.castShadow = true;
  g.add(trunkMesh, foliageMesh);
  // Each pine's spot for the fight camera (TREE_OCCLUDER): one merged pair
  // cannot be told apart by mesh, so the stand lists its trees.
  // A lifted tree keeps its y here (a stand with none lists exactly what it did).
  g.userData.occluderStand = {
    shapes: PINE_OCCLUDER,
    trees: trees.map(({ x, z, scale, y }) => (y === undefined ? { x, z, scale } : { x, z, scale, y })),
  };
  // And each crown for the corner map (ui/minimap.js), in the stand's frame.
  g.userData.mapCrowns = trees.map(({ x, z, scale }) => ({ x, z, r: PINE_CONES[0][0] * scale }));
  return g;
}

// Lily pads: flat discs with a wedge missing, one merged mesh floating just
// above the water. Thin and wide, so out of the caster sweep like the beds.
export function lilyPads(pads, seed, y = 0.06) {
  const geoms = pads.map((p, i) => {
    const notch = hash01(p.x, p.z, seed + i) * Math.PI * 2;
    const pad = new THREE.CircleGeometry(p.r, 10, notch, Math.PI * 2 - 0.5);
    pad.rotateX(-Math.PI / 2);
    pad.translate(p.x, y, p.z);
    return pad;
  });
  return mergedNoCast(geoms, 0x4f8a3a, 'foliage');
}

// The shared tail of the ground-dressing beds: merge, map-less material, and
// out of the caster sweep (see the reedBed note).
function mergedNoCast(geoms, color, surface) {
  const geo = geoms.length === 0 ? new THREE.BufferGeometry()
    : geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
  if (geoms.length > 1) for (const p of geoms) p.dispose();
  const m = new THREE.Mesh(geo, surfNoMap(color, surface));
  m.castShadow = false;
  m.userData.noCast = true;
  return m;
}

// Toadstools, two merged meshes: each spot is a cluster of two to four, within
// 0.3 m of the spot, a pale stem under a red half-dome cap (about 30 triangles
// each). Never taller than 0.3 m, so they dress the ground without hiding a
// cat, and out of the caster sweep like the other low beds.
export function toadstools(spots, seed) {
  const stems = [];
  const caps = [];
  spots.forEach((sp, i) => {
    const n = 2 + Math.floor(hash01(sp.x, sp.z, seed + 1) * 3);
    for (let k = 0; k < n; k++) {
      const h = 0.08 + 0.08 * hash01(i, k, seed + 2);
      const r = 0.07 + 0.05 * hash01(k, i, seed + 3);
      const a = hash01(k, i, seed + 4) * Math.PI * 2;
      const d = 0.3 * hash01(i + k, k, seed + 5);
      const x = sp.x + Math.cos(a) * d;
      const z = sp.z + Math.sin(a) * d;
      const stem = new THREE.CylinderGeometry(0.03, 0.04, h, 5);
      stem.translate(x, h / 2, z);
      stems.push(stem);
      const cap = new THREE.SphereGeometry(r, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.translate(x, h, z);
      caps.push(cap);
    }
  });
  const g = new THREE.Group();
  const stemMesh = mergedNoCast(stems, 0xe8dcc0, 'foliage');
  stemMesh.name = 'toadstoolStems';
  const capMesh = mergedNoCast(caps, 0xc0392b, 'foliage');
  capMesh.name = 'toadstoolCaps';
  g.add(stemMesh, capMesh);
  return g;
}

// =============================================================================
// THE GORGE'S ROCK, drawn from its own ground record (G4).
// =============================================================================
// rockTerrain takes the same shape records the ground is built from (walkable
// shapes, rock masses and cave/den ceilings; see world/gorgeshape.js) and
// draws them, so a rim the cat stops at and the rock she sees can never
// disagree. Nothing here imports the Gorge: the shapes are passed in.
//
// A shape is { minX, maxX, minZ, maxZ, y0, y1, along: 'z'|null, kind }, flat
// at y0 or a ramp along z from y0 at minZ to y1 at maxZ. Each one is a solid
// column over its rectangle:
//   * a mass, a walkable shape or a lip: from 0 up to its top;
//   * a ceiling cap: from the ceiling up to the top of the rock it was cut
//     from, which is the highest mass that shares an edge with it.
// Only EXPOSED faces are drawn. A side face is drawn over the heights where
// the column just outside it is empty: above its ground and below its own
// ceiling, or above its cap. So a wall runs down to the lower ground beside
// it (or to 0), two masses of one height share no face, a lip is a column from
// its lower neighbour's ground up to its top, and faces on the outermost
// edges of the map's shapes (the +-62 frame) are not drawn. Tops are always
// drawn: the highest camera sees over the rims (G6).
//
// How finely it is cut (the cuts are there so the relief has vertices to
// move):
//   * every side face, in every mesh, is cut into steps along its edge (at
//     each boundary of a shape touching the edge's line, where what lies
//     outside can change, then into cells about ROCK_CELL across) and each
//     step into rows at whole multiples of ROCK_ROW, clipped to the face's
//     band (a ramp's sloped edge cuts through the rows; a row line within
//     ROW_MIN of a face's foot or top is left out), so the rows of faces
//     meeting at a vertical line up;
//   * a rock top (a mass or a ceiling cap) has a band of cells CREST_BAND
//     deep along each side that is a crest (some face rises to its edge),
//     cut at that edge's step breakpoints, round the inner rectangle as one
//     quad (the whole top gridded when it is too narrow for both). A side
//     with no face up to it (a seam with rock as high, or the frame) has no
//     crest to break and no band. Walkable and lip tops are one quad.
// Then the three meshes are made CONFORMING together (world/meshconform.js):
// positions quantised to 1e-6, and every triangle with another's vertex
// inside one of its edges (a T-junction: a top's edge against the wall
// steps below it, a ramp's sloped edge against the rows beside it) fanned
// through that vertex. So moving each vertex by a pure function of its
// position cannot open a crack.
//
// The relief (world/rockrelief.js; `relief: false` draws the shell unmoved).
// One field per call moves every vertex by createRockRelief's at(), asked
// once per distinct quantised position, so every copy of a vertex moves
// alike and the shell stays closed; normals are then recomputed (flat). Its
// bounds, which the gameplay relies on:
//   * walkable tops (every walk, cave and den floor, the camp den) and the
//     wall feet on them don't move, so every seam with them stays closed;
//   * a wall over walkable ground stands at most ROCK_PROUD (0.15 m) proud of
//     its line, and inside a cave or den at most CAVE_PROUD (0.02 m) proud;
//     it may be recessed up to RELIEF_DEPTH plus a corner cut, but never more
//     than half the rock's thickness, so the two faces of thin rock never
//     cross;
//   * a ceiling's underside never comes down (dy is 0 on it);
//   * a rock top within CREST_BAND of a drop (a crest) is jagged up or down
//     (at most about 1 m up on the 20 m rims), except in the `keep` discs,
//     where things stand on the rock and its top stays still.
//
// Three merged meshes:
//   rockFaces  masses and ceiling caps; vertex colours from ROCK_LOW (cool
//              grey-brown) at y 0 to ROCK_HIGH (sandstone) at the highest top,
//              by each vertex's y BEFORE the relief, in the relief's own 1.1 m
//              strata bands (so colour and shelves line up): each band +-9%,
//              alternately tinted warm or cream, and darker in a recess (up
//              to 25% at RELIEF_DEPTH). Casts.
//   ledgeTops  raised walkable shapes: their tops (ramps sloped) and exposed
//              sides, warm sand-grey, one plain material. Casts.
//   lips       the low rock bands at the edges (G3), coloured as the rock.
//              noCast: they are thin, and the sweep would cast anything wide.
// The dressing (rockDressing, below) is appended to rockFaces and lips after
// their shells: lip stones along every lip, boulders at the wall feet.
// userData.shellTris counts the shells alone; userData.dressing counts
// { lipStones, footBoulders }.
// G4 names a 'stone' surface; materials.js has no such preset (it would warn
// and fall back), so the rock takes 'cobble's light response, as tor() does.
export const ROCK_LOW = 0x6f6a66;
export const ROCK_HIGH = 0xc8b496;
export const LEDGE_COLOR = 0x9c8a70;
const ROCK_CELL = 1.6; // side faces (and a top's ring) are cut into steps about this wide
const ROCK_ROW = 1.4; // and walls into rows at whole multiples of this height
// (CREST_BAND, how deep the cut ring round a rock top is, is the relief's own.)
const ROW_MIN = 0.35; // a row line this close to a face's foot or top is left out (no slivers)
const ROCK_STRATA = 0.09; // each strata band is +-9% lighter or darker
const STRATA_WARM = [1.03, 0.99, 0.95]; // alternate bands tinted warm
const STRATA_CREAM = [1.01, 1.01, 1.00]; // and cream
const RECESS_DARK = 0.25; // the deepest recess is this much darker
const SIDE_EPS = 1e-4; // how far outside a face its neighbour is looked up
const FLAT_EPS = 1e-7; // a face thinner than this is not drawn

// A shape's height at (x, z): flat, or a ramp along z.
function shapeY(s, x, z) {
  if (s.along !== 'z' || s.maxZ === s.minZ) return s.y0;
  const f = Math.min(1, Math.max(0, (z - s.minZ) / (s.maxZ - s.minZ)));
  return s.y0 + f * (s.y1 - s.y0);
}

const strictlyIn = (s, x, z) => x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ;

// The highest mass touching r along an edge, or overlapping it: how high a
// cave or den ceiling's cap is drawn (exported for test/gorge.test.js).
export function capTopFor(r, masses) {
  let top = -Infinity;
  for (const m of masses) {
    const ox = Math.min(r.maxX, m.maxX) - Math.max(r.minX, m.minX);
    const oz = Math.min(r.maxZ, m.maxZ) - Math.max(r.minZ, m.minZ);
    if ((ox >= 0 && oz > 0) || (ox > 0 && oz >= 0)) top = Math.max(top, m.y0, m.y1);
  }
  return top;
}

// The breakpoints along [t0, t1]: its ends, every cut strictly inside, and
// then cells of about ROCK_CELL between those.
function stepPoints(t0, t1, cuts) {
  const ts = [t0, ...cuts.filter((c) => c > t0 && c < t1), t1].sort((a, c) => a - c);
  const out = [t0];
  for (let i = 0; i + 1 < ts.length; i++) {
    const len = ts[i + 1] - ts[i];
    const n = Math.max(1, Math.round(len / ROCK_CELL));
    for (let k = 1; k < n; k++) out.push(ts[i] + (len * k) / n);
    out.push(ts[i + 1]);
  }
  return out;
}

// A polygon of (t, y) points clipped to y >= c (sign 1) or y <= c (sign -1).
function clipY(poly, c, sign) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = sign * (a[1] - c);
    const db = sign * (b[1] - c);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) out.push([a[0] + ((b[0] - a[0]) * da) / (da - db), c]);
  }
  return out;
}

// Where a linear f(u) (f0 at u0, f1 at u1) crosses zero strictly inside, or null.
function crossing(u0, u1, f0, f1) {
  if (!(f0 * f1 < 0) || !Number.isFinite(f0) || !Number.isFinite(f1)) return null;
  return u0 + ((u1 - u0) * f0) / (f0 - f1);
}

export function rockTerrain({ walks, masses, ceilings, seed = 0, relief = true, keep = [], dressing = true, mouths = [] }) {
  const groundShapes = [...walks, ...masses];
  const caps = ceilings
    .map((c) => ({ ...c, top: capTopFor(c, masses) }))
    .filter((c) => c.top > c.y0);

  // Every solid column, and the mesh its faces go into.
  const solids = [
    ...masses.map((s) => ({ s, out: 'rock', lo: () => 0, hi: (x, z) => shapeY(s, x, z), bottom: false })),
    ...walks.filter((s) => Math.max(s.y0, s.y1) > 0).map((s) => ({
      s, out: s.kind === 'lip' ? 'lip' : 'ledge', lo: () => 0, hi: (x, z) => shapeY(s, x, z), bottom: false,
    })),
    ...caps.map((c) => ({ s: c, out: 'rock', lo: () => c.y0, hi: () => c.top, bottom: true })),
  ];

  // The frame: faces on the outermost edges are not drawn.
  const frame = {
    minX: Math.min(...groundShapes.map((s) => s.minX)),
    maxX: Math.max(...groundShapes.map((s) => s.maxX)),
    minZ: Math.min(...groundShapes.map((s) => s.minZ)),
    maxZ: Math.max(...groundShapes.map((s) => s.maxZ)),
  };
  // The breakpoints along an edge (at x = `at` running along z for axis 'x',
  // at z = `at` along x for 'z'): the boundaries of every shape that touches
  // its line (only those can change what lies just outside it), then cells.
  const cutters = [...groundShapes, ...caps];
  const edgePoints = (axis, at, t0, t1) => {
    const cuts = [];
    for (const c of cutters) {
      if (axis === 'x' ? c.minX <= at && at <= c.maxX : c.minZ <= at && at <= c.maxZ) {
        if (axis === 'x') cuts.push(c.minZ, c.maxZ);
        else cuts.push(c.minX, c.maxX);
      }
    }
    return stepPoints(t0, t1, cuts);
  };
  let topY = 0;
  for (const s of groundShapes) topY = Math.max(topY, s.y0, s.y1);
  for (const c of caps) topY = Math.max(topY, c.top);

  const low = new THREE.Color(ROCK_LOW);
  const high = new THREE.Color(ROCK_HIGH);
  const tint = new THREE.Color();
  // A vertex's colour, from where it was before the relief moved it (so a
  // stratum's colour stays with its shelf) and how deep it was recessed.
  const rockColour = (x, y, z, recess) => {
    tint.copy(low).lerp(high, topY > 0 ? clamp01(y / topY) : 0);
    const band = strataBand(x, y, z, seed);
    const shade = (1 + ROCK_STRATA * (2 * noise3(band, 0, 0, seed + 5) - 1))
      * (1 - RECESS_DARK * clamp01(recess / RELIEF_DEPTH));
    const hue = band % 2 === 0 ? STRATA_WARM : STRATA_CREAM;
    return [tint.r * shade * hue[0], tint.g * shade * hue[1], tint.b * shade * hue[2]];
  };

  const bins = { rock: [], ledge: [], lip: [] };
  const tri = (out, a, c, d, nx, ny, nz) => {
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const dot = cx * nx + cy * ny + cz * nz;
    if (Math.abs(dot) < 1e-9) return; // no area
    if (dot > 0) bins[out].push(a, c, d);
    else bins[out].push(a, d, c);
  };
  const quad = (out, a, c, d, e, n) => {
    tri(out, a, c, d, ...n);
    tri(out, a, d, e, ...n);
  };

  // One side face from (u0, l0..h0) to (u1, l1..h1), cut into rows at whole
  // multiples of ROCK_ROW (each row the face clipped to its slab).
  const wall = (out, at, u0, l0, h0, u1, l1, h1) => {
    const tall = Math.max(h0 - l0, h1 - l1);
    if (tall < FLAT_EPS) return;
    const poly = [[u0, l0], [u1, l1], [u1, h1], [u0, h0]];
    const lo = Math.min(l0, l1);
    const hi = Math.max(h0, h1);
    const levels = [lo];
    for (let k = Math.floor(lo / ROCK_ROW) + 1; k * ROCK_ROW < hi - ROW_MIN; k++) {
      if (k * ROCK_ROW > lo + ROW_MIN) levels.push(k * ROCK_ROW);
    }
    levels.push(hi);
    for (let r = 0; r + 1 < levels.length; r++) {
      const piece = clipY(clipY(poly, levels[r], 1), levels[r + 1], -1);
      for (let i = 1; i + 1 < piece.length; i++) {
        tri(out, at(...piece[0]), at(...piece[i]), at(...piece[i + 1]), ...at.normal);
      }
    }
  };

  for (const solid of solids) {
    const { s, out } = solid;
    const edges = [
      { axis: 'x', at: s.minX, dir: -1, t0: s.minZ, t1: s.maxZ, onFrame: s.minX <= frame.minX },
      { axis: 'x', at: s.maxX, dir: 1, t0: s.minZ, t1: s.maxZ, onFrame: s.maxX >= frame.maxX },
      { axis: 'z', at: s.minZ, dir: -1, t0: s.minX, t1: s.maxX, onFrame: s.minZ <= frame.minZ },
      { axis: 'z', at: s.maxZ, dir: 1, t0: s.minX, t1: s.maxX, onFrame: s.maxZ >= frame.maxZ },
    ];
    for (const e of edges) e.ts = e.onFrame ? [e.t0, e.t1] : edgePoints(e.axis, e.at, e.t0, e.t1);
    for (const e of edges) {
      if (e.onFrame) continue;
      // (x, z) of the point t along this edge, `off` outward of it
      const xz = (t, off = 0) => (e.axis === 'x' ? [e.at + e.dir * off, t] : [t, e.at + e.dir * off]);
      const at = (t, y) => {
        const [x, z] = xz(t);
        return [x, y, z];
      };
      at.normal = e.axis === 'x' ? [e.dir, 0, 0] : [0, 0, e.dir];
      // breakpoints: every shape boundary on this edge, then cells
      const ts = e.ts;
      const steps = ts.slice(1).map((t, i) => [ts[i], t]);
      for (const [u0, u1] of steps) {
        if (u1 - u0 < FLAT_EPS) continue;
        const [mx, mz] = xz((u0 + u1) / 2, SIDE_EPS);
        // the column just outside: its ground, its ceiling and its cap's top
        let nb = null;
        for (const g of groundShapes) {
          if (strictlyIn(g, mx, mz) && (!nb || shapeY(g, mx, mz) > shapeY(nb, mx, mz))) nb = g;
        }
        const cap = caps.find((c) => strictlyIn(c, mx, mz));
        const g = (t) => (nb ? shapeY(nb, ...xz(t)) : 0);
        const ceil = cap ? cap.y0 : Infinity;
        const capTop = cap ? cap.top : Infinity;
        const a = (t) => solid.lo(...xz(t));
        const b = (t) => solid.hi(...xz(t));
        const bands = [[(t) => Math.max(a(t), g(t)), (t) => Math.min(b(t), ceil), [(t) => a(t) - g(t), (t) => b(t) - ceil]]];
        if (Number.isFinite(capTop)) bands.push([(t) => Math.max(a(t), capTop), b, [(t) => a(t) - capTop]]);
        for (const [L, U, kinks] of bands) {
          // split where L or U changes branch, then where the band closes
          let us = [u0, u1];
          for (const f of [...kinks, (t) => U(t) - L(t)]) {
            const next = [us[0]];
            for (let i = 0; i + 1 < us.length; i++) {
              const c = crossing(us[i], us[i + 1], f(us[i]), f(us[i + 1]));
              if (c !== null) next.push(c);
              next.push(us[i + 1]);
            }
            us = next;
          }
          for (let i = 0; i + 1 < us.length; i++) {
            const p = us[i];
            const q = us[i + 1];
            const l0 = L(p);
            const l1 = L(q);
            const h0 = Math.max(l0, U(p));
            const h1 = Math.max(l1, U(q));
            if (h0 - l0 < FLAT_EPS && h1 - l1 < FLAT_EPS) continue;
            wall(out, at, p, l0, h0, q, l1, h1);
            // a face up to the top's own edge: a crest, so the top gets its band here
            if (Math.abs(h0 - b(p)) < FLAT_EPS || Math.abs(h1 - b(q)) < FLAT_EPS) e.crest = true;
          }
        }
      }
    }
    // the top (sloped on a ramp) and, for a cap, its underside
    const corner = (x, z, y) => [x, y, z];
    const { minX, maxX, minZ, maxZ } = s;
    const hi = solid.hi;
    const topQuad = (x0, x1, z0, z1) => quad(out,
      corner(x0, z0, hi(x0, z0)), corner(x0, z1, hi(x0, z1)),
      corner(x1, z1, hi(x1, z1)), corner(x1, z0, hi(x1, z0)), [0, 1, 0]);
    if (out === 'rock') {
      // a band CREST_BAND deep along each side that is a crest (a face rises
      // to it), cut at that edge's own breakpoints (the ones its wall is cut
      // at), round one inner quad; a side with no face up to it (a seam with
      // rock as high, or the frame) has no crest and no band
      const [W, E, S, N] = edges;
      const merge = (...lists) => {
        const all = lists.flat().sort((m, n) => m - n);
        return all.filter((v, i) => i === 0 || v - all[i - 1] > FLAT_EPS);
      };
      const ix0 = W.crest ? minX + CREST_BAND : minX;
      const ix1 = E.crest ? maxX - CREST_BAND : maxX;
      const iz0 = S.crest ? minZ + CREST_BAND : minZ;
      const iz1 = N.crest ? maxZ - CREST_BAND : maxZ;
      if (ix1 - ix0 > FLAT_EPS && iz1 - iz0 > FLAT_EPS) {
        const corners = [...(W.crest ? [ix0] : []), ...(E.crest ? [ix1] : [])];
        if (S.crest) {
          const xs = merge(S.ts, corners);
          for (let i = 0; i + 1 < xs.length; i++) topQuad(xs[i], xs[i + 1], minZ, iz0);
        }
        if (N.crest) {
          const xs = merge(N.ts, corners);
          for (let i = 0; i + 1 < xs.length; i++) topQuad(xs[i], xs[i + 1], iz1, maxZ);
        }
        const along = (list) => merge(list.filter((v) => v > iz0 && v < iz1), [iz0, iz1]);
        if (W.crest) {
          const zs = along(W.ts);
          for (let j = 0; j + 1 < zs.length; j++) topQuad(minX, ix0, zs[j], zs[j + 1]);
        }
        if (E.crest) {
          const zs = along(E.ts);
          for (let j = 0; j + 1 < zs.length; j++) topQuad(ix1, maxX, zs[j], zs[j + 1]);
        }
        topQuad(ix0, ix1, iz0, iz1);
      } else {
        // too narrow for a band and an inner quad: the whole top gridded at
        // its crests' breakpoints
        const X = merge(S.crest ? S.ts : [minX, maxX], N.crest ? N.ts : []);
        const Z = merge(W.crest ? W.ts : [minZ, maxZ], E.crest ? E.ts : []);
        for (let i = 0; i + 1 < X.length; i++) {
          for (let j = 0; j + 1 < Z.length; j++) topQuad(X[i], X[i + 1], Z[j], Z[j + 1]);
        }
      }
    } else {
      topQuad(minX, maxX, minZ, maxZ);
    }
    if (solid.bottom) {
      const y = solid.lo();
      quad(out, corner(minX, minZ, y), corner(maxX, minZ, y), corner(maxX, maxZ, y), corner(minX, maxZ, y), [0, -1, 0]);
    }
  }

  const conf = conformTriangles(bins);

  // The relief: one field for the call, asked once per distinct (quantised)
  // position, so every copy of a vertex moves the same and the conforming
  // shell stays closed.
  const field = relief ? createRockRelief({ walks, masses, ceilings, seed, keep }) : null;
  const moves = new Map();
  const moveOf = (v) => {
    const key = `${v[0]},${v[1]},${v[2]}`;
    let m = moves.get(key);
    if (!m) {
      m = field ? field.at(v[0], v[1], v[2]) : { dx: 0, dy: 0, dz: 0, recess: 0 };
      moves.set(key, m);
    }
    return m;
  };

  // The dressing, appended after the shells (see rockDressing below).
  const dress = dressing
    ? rockDressing({ walks, masses, ceilings, seed, mouths, field: field ?? createRockRelief({ walks, masses, ceilings, seed, keep }), rockColour })
    : { rock: { pos: [], col: [] }, lip: { pos: [], col: [] }, lipStones: 0, footBoulders: 0 };

  const meshOf = (verts, coloured, extra = { pos: [], col: [] }) => {
    const n = verts.length * 3;
    const pos = new Float32Array(n + extra.pos.length);
    const col = coloured ? new Float32Array(n + extra.col.length) : null;
    verts.forEach((v, i) => {
      const m = moveOf(v);
      pos[3 * i] = v[0] + m.dx;
      pos[3 * i + 1] = v[1] + m.dy;
      pos[3 * i + 2] = v[2] + m.dz;
      if (col) col.set(rockColour(v[0], v[1], v[2], m.recess), 3 * i);
    });
    pos.set(extra.pos, n);
    if (col) col.set(extra.col, n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals(); // non-indexed: flat, from the moved triangles
    return geo;
  };
  const rockMat = () => litMaterial(0xffffff, { ...surfaceProps('cobble'), vertexColors: true });
  const group = new THREE.Group();
  group.name = 'rockTerrain';
  const rockFaces = new THREE.Mesh(meshOf(conf.rock, true, dress.rock), rockMat());
  rockFaces.name = 'rockFaces';
  rockFaces.castShadow = true;
  const ledgeTops = new THREE.Mesh(meshOf(conf.ledge, false), surfNoMap(LEDGE_COLOR, 'cobble'));
  ledgeTops.name = 'ledgeTops';
  ledgeTops.castShadow = true;
  const lips = new THREE.Mesh(meshOf(conf.lip, true, dress.lip), rockMat());
  lips.name = 'lips';
  lips.castShadow = false;
  lips.userData.noCast = true;
  group.add(rockFaces, ledgeTops, lips);
  // The shell's triangles per mesh, before any dressing (appended after them).
  group.userData.shellTris = { rockFaces: conf.rock.length / 3, ledgeTops: conf.ledge.length / 3, lips: conf.lip.length / 3 };
  group.userData.dressing = { lipStones: dress.lipStones, footBoulders: dress.footBoulders };
  return group;
}

// The rock's dressing (`dressing: false` leaves it out). Written as raw
// triangles, already where they stand (after the shell's conforming and
// relief: nothing here moves), appended to the merged meshes after their
// shells, so no new mesh and no new draw call. Every choice is from the
// integer hash (noise3 on whole lattice points), no trig, no random.
//
//   Lip stones (into `lips`): each lip is laid along its long axis with
//   stones LIP_STONE_LEN long, LIP_JOINT apart (the last ones fitted to its
//   end). A stone is a box of 12 triangles across the lip's 0.4 m plus 0.04
//   to 0.10 each side, from 0.18 under the lip's top to 0.04..0.12 over it,
//   following its ramp; its eight corners pulled toward the box's centre by
//   0..0.05 per axis (never pushed out). Coloured as the rock at that
//   height, x 0.9..1.05 a stone.
//
//   Foot boulders (into `rockFaces`): candidates every FOOT_STEP (+-1 m) along
//   each mass and lip wall whose outward foot is walkable ground (a walk, or
//   the floor) with no ceiling over it, where the rock rises 1 m or more
//   over it. A boulder is the 12 icosahedron vertices (golden-ratio
//   constants), each scaled 0.8..1.1, flattened x0.7 in y, re-centred on
//   their mean, of radius 0.45..0.9; set so its farthest vertex stands
//   FOOT_PROUD outward of the true wall plane, 30% of its height sunk below
//   the ground. It is kept only where rock is at its centre 0.3 m up, it is
//   a metre or more from every cave and den mouth, and every vertex is
//   either in rock (and 0.3 m inside it along the wall and inward, so
//   another face's relief can't bare it) or on its wall's open side, within
//   FOOT_PROUD of the plane, over no cave or den, and with the wall still
//   rock behind it at its height and a metre over its own ground. So none
//   pokes through a lip onto the walk behind it, into a void, or out of
//   thin rock's far side. At most FOOT_MAX, evenly picked.
const LIP_STONE_LEN = [0.35, 0.75];
const LIP_JOINT = [0.03, 0.08];
const FOOT_STEP = 3.2;
const FOOT_PROUD = 0.1195; // under 0.12 m, with room for the float32 positions
const FOOT_MAX = 90;
const PHI = (1 + Math.sqrt(5)) / 2;
// The 12 icosahedron vertices (THREE's order) on the unit sphere, and its 20 faces.
const ICO = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map((v) => v.map((c) => c / Math.sqrt(1 + PHI * PHI)));
const ICO_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];
// A box's 12 triangles over its corners, corner index iu + 2 iv + 4 iw.
const STONE_FACES = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];

function rockDressing({ walks, masses, ceilings, seed, mouths, field, rockColour }) {
  const out = { rock: { pos: [], col: [] }, lip: { pos: [], col: [] }, lipStones: 0, footBoulders: 0 };
  // A hash in [0, 1) at a whole lattice point.
  const H = (i, j, k, salt) => noise3(i, j, k, seed + salt);
  // One triangle wound outward of c, coloured as the rock at each vertex's height x shade.
  const put = (bin, a, p, q, c, shade) => {
    const ux = p[0] - a[0], uy = p[1] - a[1], uz = p[2] - a[2];
    const vx = q[0] - a[0], vy = q[1] - a[1], vz = q[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const mx = (a[0] + p[0] + q[0]) / 3 - c[0];
    const my = (a[1] + p[1] + q[1]) / 3 - c[1];
    const mz = (a[2] + p[2] + q[2]) / 3 - c[2];
    const tri = nx * mx + ny * my + nz * mz >= 0 ? [a, p, q] : [a, q, p];
    for (const v of tri) {
      out[bin].pos.push(v[0], v[1], v[2]);
      const k = rockColour(v[0], v[1], v[2], 0);
      out[bin].col.push(k[0] * shade, k[1] * shade, k[2] * shade);
    }
  };

  // ---- lip stones ----
  walks.filter((w) => w.kind === 'lip').forEach((l, li) => {
    const alongZ = l.maxZ - l.minZ >= l.maxX - l.minX;
    const u1 = alongZ ? l.maxZ : l.maxX;
    const v0 = alongZ ? l.minX : l.minZ;
    const v1 = alongZ ? l.maxX : l.maxZ;
    // (along, across, height over the lip's top) to the world
    const world = (u, v, w) => {
      const x = alongZ ? v : u;
      const z = alongZ ? u : v;
      return [x, shapeY(l, x, z) + w, z];
    };
    const [LMIN, LMAX] = LIP_STONE_LEN;
    let u = alongZ ? l.minZ : l.minX;
    for (let k = 0; u1 - u > 1e-6; k++) {
      const r = u1 - u;
      let len = LMIN + (LMAX - LMIN) * H(li, k, 0, 101);
      let joint = LIP_JOINT[0] + (LIP_JOINT[1] - LIP_JOINT[0]) * H(li, k, 1, 101);
      if (r <= LMAX) {
        len = r; // the last stone takes the rest (never under LMIN: see below)
        joint = 0;
      } else {
        // leave at least LMIN for the stones after this one
        joint = Math.min(joint, r - 2 * LMIN);
        len = Math.min(len, r - joint - LMIN);
      }
      const a0 = [u, v0 - (0.04 + 0.06 * H(li, k, 2, 101)), -0.18];
      const a1 = [u + len, v1 + (0.04 + 0.06 * H(li, k, 3, 101)), 0.04 + 0.08 * H(li, k, 4, 101)];
      const mid = [0, 1, 2].map((d) => (a0[d] + a1[d]) / 2);
      const corners = [];
      for (let i = 0; i < 8; i++) {
        const p = [i & 1 ? a1[0] : a0[0], i & 2 ? a1[1] : a0[1], i & 4 ? a1[2] : a0[2]];
        for (let d = 0; d < 3; d++) p[d] += Math.sign(mid[d] - p[d]) * 0.05 * H(li, k, 10 + 3 * i + d, 101);
        corners.push(world(...p));
      }
      const c = world(...mid);
      const shade = 0.9 + 0.15 * H(li, k, 5, 101);
      for (const [p, q, s, t] of STONE_FACES) {
        put('lip', corners[p], corners[q], corners[s], c, shade);
        put('lip', corners[p], corners[s], corners[t], c, shade);
      }
      out.lipStones++;
      u += len + joint;
    }
  });

  // ---- foot boulders ----
  const groundShapes = [...walks, ...masses];
  const walkable = (s) => s.kind === 'walk' || s.kind === 'cave' || s.kind === 'den';
  const inside = (s, x, z) => x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ;
  const inClosed = (s, x, z) => x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ;
  const covered = (x, z) => ceilings.some((c) => inClosed(c, x, z));
  // the highest walkable top under (x, z) at or below y, else the floor
  const walkTop = (x, y, z) => {
    let g = 0;
    for (const s of walks) {
      if (s.kind === 'lip' || !inClosed(s, x, z)) continue;
      const t = shapeY(s, x, z);
      if (t <= y + 1e-6 && t > g) g = t;
    }
    return g;
  };
  const frame = {
    minX: Math.min(...groundShapes.map((s) => s.minX)),
    maxX: Math.max(...groundShapes.map((s) => s.maxX)),
    minZ: Math.min(...groundShapes.map((s) => s.minZ)),
    maxZ: Math.max(...groundShapes.map((s) => s.maxZ)),
  };
  const kept = [];
  const walls = [...masses, ...walks.filter((w) => w.kind === 'lip')];
  walls.forEach((s, si) => {
    const edges = [
      { axis: 'x', at: s.minX, dir: -1, t0: s.minZ, t1: s.maxZ, onFrame: s.minX <= frame.minX },
      { axis: 'x', at: s.maxX, dir: 1, t0: s.minZ, t1: s.maxZ, onFrame: s.maxX >= frame.maxX },
      { axis: 'z', at: s.minZ, dir: -1, t0: s.minX, t1: s.maxX, onFrame: s.minZ <= frame.minZ },
      { axis: 'z', at: s.maxZ, dir: 1, t0: s.minX, t1: s.maxX, onFrame: s.maxZ >= frame.maxZ },
    ];
    edges.forEach((e, ei) => {
      if (e.onFrame) return;
      // world (x, z) of t along the edge, `off` outward of it
      const xz = (t, off) => (e.axis === 'x' ? [e.at + e.dir * off, t] : [t, e.at + e.dir * off]);
      for (let k = 0; ; k++) {
        const t = e.t0 + FOOT_STEP / 2 + FOOT_STEP * k + (2 * H(si, ei, k, 202) - 1);
        if (t >= e.t1) break;
        if (t <= e.t0) continue;
        // the foot: walkable ground just outside, no ceiling over it
        const [fx, fz] = xz(t, 0.05);
        let top = 0;
        let ok = true;
        for (const g of groundShapes) {
          if (!inside(g, fx, fz)) continue;
          const y = shapeY(g, fx, fz);
          if (y > top + 1e-9) { top = y; ok = walkable(g); } else if (y > top - 1e-9 && !walkable(g)) ok = false;
        }
        if (!ok || covered(fx, fz)) continue;
        const [wx, wz] = xz(t, -0.05);
        if (shapeY(s, wx, wz) - top < 1.0) continue;
        // the shape, about its own mean
        const R = 0.45 + 0.45 * H(si, ei, k, 203);
        let local = ICO.map((v, i) => {
          const sc = R * (0.8 + 0.3 * H(si * 16 + ei, k, i, 204));
          return [v[0] * sc, v[1] * sc * 0.7, v[2] * sc];
        });
        const mean = [0, 1, 2].map((d) => local.reduce((a, v) => a + v[d], 0) / local.length);
        local = local.map((v) => [v[0] - mean[0], v[1] - mean[1], v[2] - mean[2]]);
        const ai = e.axis === 'x' ? 0 : 2; // the outward axis
        let maxOut = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const v of local) {
          maxOut = Math.max(maxOut, v[ai] * e.dir);
          minY = Math.min(minY, v[1]);
          maxY = Math.max(maxY, v[1]);
        }
        const [cx, cz] = xz(t, FOOT_PROUD - maxOut);
        const cy = top - minY - 0.3 * (maxY - minY);
        if (!field.rockAt(cx, top + 0.3, cz)) continue;
        if (mouths.some((m) => (cx - m.x) ** 2 + (cz - m.z) ** 2 < 1.01 * 1.01)) continue;
        const verts = local.map((v) => [cx + v[0], cy + v[1], cz + v[2]]);
        const safe = verts.every((v) => {
          const [x, y, z] = v.map(Math.fround); // as drawn
          const d = ((ai === 0 ? x : z) - e.at) * e.dir; // outward of the plane
          const inward = (dd) => (ai === 0 ? [x - e.dir * dd, z] : [x, z - e.dir * dd]);
          if (field.rockAt(x, y, z)) {
            // buried: 0.3 m inside along the wall both ways and inward
            const side = ai === 0 ? [[x, z + 0.3], [x, z - 0.3]] : [[x + 0.3, z], [x - 0.3, z]];
            const [ix, iz] = inward(Math.max(0, d) + 0.3);
            return field.rockAt(ix, y, iz) && side.every(([sx, sz]) => field.rockAt(sx, y, sz));
          }
          if (d < 0 || d > FOOT_PROUD + 1e-6 || covered(x, z)) return false;
          const [px, pz] = inward(d + 0.01); // just behind the plane, at its height
          return field.rockAt(px, y, pz) && field.rockAt(px, walkTop(x, y, z) + 1.0, pz);
        });
        if (!safe) continue;
        kept.push({ verts, c: [cx, cy, cz], shade: 0.9 + 0.15 * H(si, ei, k, 205) });
      }
    });
  });
  // at most FOOT_MAX, evenly picked from the list
  const n = Math.min(FOOT_MAX, kept.length);
  for (let i = 0; i < n; i++) {
    const { verts, c, shade } = kept[Math.floor((i * kept.length) / n)];
    for (const [a, p, q] of ICO_FACES) put('rock', verts[a], verts[p], verts[q], c, shade);
    out.footBoulders++;
  }
  return out;
}

// Scree: loose stones at the foot of the rock. Each spot is a cluster of three
// to six small flattened icosahedra within half a metre of it, turned about y,
// resting on y 0 (a caller seats them on raised ground). One merged mesh,
// never taller than 0.25 m, out of the caster sweep like the other low beds.
export const SCREE_COLOR = 0x857f76;
export function scree(spots, seed) {
  const stones = [];
  spots.forEach((sp, i) => {
    const n = 3 + Math.floor(hash01(sp.x, sp.z, seed + 1) * 4);
    for (let k = 0; k < n; k++) {
      const r = 0.08 + 0.1 * hash01(i, k, seed + 2);
      const flat = 0.4 + 0.2 * hash01(k, i, seed + 3);
      const a = hash01(k, i, seed + 4) * Math.PI * 2;
      const d = 0.5 * hash01(i + k, k, seed + 5);
      const geo = new THREE.IcosahedronGeometry(r, 0);
      geo.scale(1, flat, 1);
      geo.rotateY(hash01(i, k, seed + 6) * Math.PI * 2);
      geo.computeBoundingBox();
      geo.translate(sp.x + Math.cos(a) * d, -geo.boundingBox.min.y, sp.z + Math.sin(a) * d);
      stones.push(geo);
    }
  });
  const g = new THREE.Group();
  const m = mergedNoCast(stones, SCREE_COLOR, 'cobble');
  m.name = 'scree';
  g.add(m);
  return g;
}

// =============================================================================
// THE CAVES' SOFT GLOW (the Gorge, part 3): crystals at the foot of a cave's
// walls and gold flecks on them. Both are emissive at a gentle 0.6, so they
// read in the dark of a chamber without lighting anything, and nothing on
// them moves or flickers.
// =============================================================================
const CAVE_GLOW = 0.6;
const caveGlowMaterial = (color) => litMaterial(color, { emissive: color, emissiveIntensity: CAVE_GLOW });

// One merged, emissive, out-of-the-shadow-pass mesh.
function glowMesh(geoms, color, name) {
  const geo = geoms.length === 0 ? new THREE.BufferGeometry()
    : geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
  if (geoms.length > 1) for (const p of geoms) p.dispose();
  const m = new THREE.Mesh(geo, caveGlowMaterial(color));
  m.name = name;
  m.castShadow = false;
  m.userData.noCast = true;
  return m;
}

// Crystals. Each spot { x, z, y, nx, nz } is at the foot of a wall, with
// (nx, nz) the unit normal pointing off the wall into the cave. A spot is a
// cluster of three to five small octahedra, 0.06-0.18 m across and 1.6 times
// as tall (so never taller than 0.3 m), spread 0.2 m either way along the
// wall and up to 0.05 m further out, each leaning gently away from the wall
// and resting on y. Every vertex stays within 0.1 m of its crystal's centre
// across the ground, so a spot 0.1 m or more off its wall keeps every crystal
// off the wall's face. One merged noCast mesh, the same every time for one
// seed.
export const CRYSTAL_SIZE = Object.freeze([0.06, 0.18]);
export const CRYSTAL_SPREAD = 0.2;
const CRYSTAL_OUT = 0.05;
const CRYSTAL_STRETCH = 1.6;
const CRYSTAL_LEAN = Object.freeze([0.1, 0.35]);
export function caveCrystals(spots, seed, { color = 0x9fc7d8 } = {}) {
  const geoms = [];
  const axis = new THREE.Vector3();
  const lean = new THREE.Matrix4();
  spots.forEach((sp, i) => {
    const nx = sp.nx ?? 0;
    const nz = sp.nz ?? 0;
    const n = 3 + Math.floor(hash01(sp.x, sp.z, seed + 1) * 3);
    for (let k = 0; k < n; k++) {
      const s = CRYSTAL_SIZE[0] + (CRYSTAL_SIZE[1] - CRYSTAL_SIZE[0]) * hash01(i, k, seed + 2);
      const u = (hash01(k, i, seed + 3) * 2 - 1) * CRYSTAL_SPREAD;
      const v = CRYSTAL_OUT * hash01(i + k, k, seed + 4);
      const tilt = CRYSTAL_LEAN[0] + (CRYSTAL_LEAN[1] - CRYSTAL_LEAN[0]) * hash01(k, i, seed + 5);
      const geo = new THREE.OctahedronGeometry(s / 2, 0);
      geo.scale(1, CRYSTAL_STRETCH, 1);
      geo.rotateY(hash01(i, k, seed + 6) * Math.PI * 2);
      // Tip the top toward the cave: about up x n.
      if (nx !== 0 || nz !== 0) geo.applyMatrix4(lean.makeRotationAxis(axis.set(nz, 0, -nx).normalize(), tilt));
      geo.computeBoundingBox();
      // The wall runs along (-nz, nx).
      const x = sp.x - nz * u + nx * v;
      const z = sp.z + nx * u + nz * v;
      geo.translate(x, (sp.y ?? 0) - geo.boundingBox.min.y, z);
      geoms.push(geo);
    }
  });
  const g = new THREE.Group();
  g.add(glowMesh(geoms, color, 'caveCrystals'));
  return g;
}

// Gold flecks on a wall: each spot { x, y, z, nx, nz } is a point on the
// wall's face with (nx, nz) its normal into the cave, and gets one tiny flat
// diamond 0.04-0.09 m long, turned in the wall's plane and set 0.015 m off
// the face, facing out. One merged noCast mesh.
export const FLECK_SIZE = Object.freeze([0.04, 0.09]);
export const FLECK_OFF = 0.015;
export function caveFlecks(spots, seed, { color = 0xe8b84a } = {}) {
  const geoms = [];
  spots.forEach((sp, i) => {
    const s = FLECK_SIZE[0] + (FLECK_SIZE[1] - FLECK_SIZE[0]) * hash01(sp.x + sp.y, sp.z, seed + 1);
    const geo = new THREE.PlaneGeometry(s, s * 0.6);
    geo.rotateZ(Math.PI / 4 + hash01(i, sp.y, seed + 2) * Math.PI);
    geo.rotateY(Math.atan2(sp.nx, sp.nz));
    geo.translate(sp.x + sp.nx * FLECK_OFF, sp.y, sp.z + sp.nz * FLECK_OFF);
    geoms.push(geo);
  });
  const g = new THREE.Group();
  g.add(glowMesh(geoms, color, 'caveFlecks'));
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
// A footprint may also carry `shallow`, in metres (missing means 0): the width
// of the wadeable band along its REAL shore. Real shore means the footprint's
// outline minus the parts that run under another water (see shorePieces), so
// two touching bodies of water have one shore, not two. Depth is measured to
// that shore (shallowExcess); waterGap, waterClearance, inWater and nearestDry
// ignore `shallow` entirely.
//
// A rect footprint may carry `islands: [{ x, z, r }]`: round holes of dry
// ground cut out of the water. An island is not a deck, because a deck means
// raised boards (ruling R42: carrying will not set things down on one, and
// paw prints skip it); an island is ground, so it gets neither rule. A circle
// footprint does not support islands. An island's rim is shore (outline
// chords it), so depth near an island is measured to the island.
//
// A deck may also be a strip `{ x1, z1, x2, z2, halfW }` — a centreline from
// end 1 to end 2 and a half-width — instead of an axis-aligned rect, so a
// bridge on a diagonal is still one deck. `Number.isFinite(d.x1)` tells the
// two shapes apart.
//
// All of this is plain data and pure geometry: no THREE, no renderer, so the
// world files stay unit-testable headless.
// =============================================================================

// Signed distance from (x, z) to a footprint's edge: negative inside the
// water, positive on dry land. For a rect the inside case reports the
// SHALLOWEST penetration (the nearest way out), which is what makes the
// push-out below take the short route to shore.
//
// Islands only exist on rects; a circle's `islands`, if one were ever given,
// is ignored. An island is a hole in the water, so the gap is the larger of
// the rect's own and each island's "how far inside its rim".
export function waterGap(w, x, z) {
  if (w.kind === 'circle') return Math.hypot(x - w.x, z - w.z) - w.r;
  const dx = Math.max(w.minX - x, x - w.maxX);
  const dz = Math.max(w.minZ - z, z - w.maxZ);
  let gap = (dx > 0 || dz > 0)
    ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0))
    : Math.max(dx, dz);
  for (const i of w.islands ?? []) gap = Math.max(gap, i.r - Math.hypot(x - i.x, z - i.z));
  return gap;
}

// A strip deck's frame: start point a, unit vector u along it, side normal n
// = (-u.z, u.x), and its length. A strip is how a diagonal bridge stays one
// deck rather than a staircase of axis-aligned rects.
const isStrip = (d) => Number.isFinite(d.x1);
function stripFrame(d) {
  const len = Math.hypot(d.x2 - d.x1, d.z2 - d.z1);
  const ux = (d.x2 - d.x1) / len, uz = (d.z2 - d.z1) / len;
  return { ax: d.x1, az: d.z1, ux, uz, nx: -uz, nz: ux, len };
}

// A point built exactly on a strip's end or edge (a + t·u + s·n) comes back
// from the dot products a few 1e-16 off, so the strip test allows 1e-9 of
// slack. A rect deck needs none: its edges are compared as given.
const STRIP_EPS = 1e-9;
function onOneDeck(d, x, z) {
  if (!isStrip(d)) return x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ;
  const f = stripFrame(d);
  const px = x - f.ax, pz = z - f.az;
  const t = px * f.ux + pz * f.uz;
  const s = px * f.nx + pz * f.nz;
  return t >= -STRIP_EPS && t <= f.len + STRIP_EPS && Math.abs(s) <= d.halfW + STRIP_EPS;
}

// Is (x, z) standing on one of this footprint's dry decks?
export function onDeck(w, x, z) {
  return (w.decks ?? []).some((d) => onOneDeck(d, x, z));
}

// Signed distance from (x, z) to the nearest deck of any of these waters:
// negative inside (how far in from the nearest edge), positive outside, and
// Infinity where there are no decks. Beside onDeck: when onDeck learns a new
// kind of deck, this must too. A strip is measured in its own frame, as the
// rectangle onOneDeck reads (flat at both ends, not a capsule), so its sign
// agrees with onDeck everywhere but onOneDeck's STRIP_EPS of slack. Any other
// shape fails the guard in test/shore.test.js ("uses only shapes the shore
// and deck code understand").
function boxDistance(dx, dz) {
  return dx > 0 || dz > 0
    ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0))
    : Math.max(dx, dz);
}
function oneDeckDistance(d, x, z) {
  if (!isStrip(d)) return boxDistance(Math.max(d.minX - x, x - d.maxX), Math.max(d.minZ - z, z - d.maxZ));
  const f = stripFrame(d);
  const px = x - f.ax, pz = z - f.az;
  const t = px * f.ux + pz * f.uz;
  const s = px * f.nx + pz * f.nz;
  return boxDistance(Math.max(-t, t - f.len), Math.abs(s) - d.halfW);
}
export function deckDistance(waters, x, z) {
  let min = Infinity;
  for (const w of waters ?? []) {
    for (const d of w.decks ?? []) {
      const g = oneDeckDistance(d, x, z);
      if (g < min) min = g;
    }
  }
  return min;
}

// Is (x, z) on any deck of any of these waters? The carry's "never put a
// thing down here" test (v21 3b ruling R42): a deck is raised structure, and a
// thing set down lands at ground height, under its boards. Total: no waters,
// or no decks, is false.
export function onAnyDeck(waters, x, z) {
  return (waters ?? []).some((w) => onDeck(w, x, z));
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

// -----------------------------------------------------------------------------
// THE REAL SHORE, AND DEPTH MEASURED TO IT (swimming). Contiguous block.
// -----------------------------------------------------------------------------
const CIRCLE_CHORDS = 64;
const SHORE_STEP = 0.25;
const SHORE_INSIDE = -1e-6;

// Extending the shore: a new kind of water edge needs two things.
//   1. Give outline(w) its segments. Each `islands` disc adds CIRCLE_CHORDS
//      chords, phased as a circle footprint's are.
//   2. Make waterGap see it as not-water (waterGap's island term does).
// Decks are never shore, so strip decks need nothing here.
//
// Each segment is [ax, az, bx, bz, kind]. A rect's own edge ('edge') is not
// shore where it runs across one of its own islands (that is dry ground), and
// an island's rim ('rim') is shore only where it faces its own rect's water:
// an island that overhangs its rect's edge, or one shared by two waters (the
// Pines' lake and bay), gives each water just its own side of the rim.
function circleChords(segs, cx, cz, r, kind) {
  for (let k = 0; k < CIRCLE_CHORDS; k++) {
    // Half a chord of phase, so a chord's midpoint (not a vertex) faces due east.
    const a0 = ((k + 0.5) / CIRCLE_CHORDS) * Math.PI * 2;
    const a1 = ((k + 1.5) / CIRCLE_CHORDS) * Math.PI * 2;
    segs.push([
      cx + Math.cos(a0) * r, cz + Math.sin(a0) * r,
      cx + Math.cos(a1) * r, cz + Math.sin(a1) * r, kind,
    ]);
  }
}
function outline(w) {
  const segs = [];
  if (w.kind === 'circle') {
    circleChords(segs, w.x, w.z, w.r, 'edge');
    return segs;
  }
  segs.push([w.minX, w.minZ, w.maxX, w.minZ, 'edge']);
  segs.push([w.maxX, w.minZ, w.maxX, w.maxZ, 'edge']);
  segs.push([w.maxX, w.maxZ, w.minX, w.maxZ, 'edge']);
  segs.push([w.minX, w.maxZ, w.minX, w.minZ, 'edge']);
  for (const i of w.islands ?? []) circleChords(segs, i.x, i.z, i.r, 'rim');
  return segs;
}

// Is a point of one of w's own outline segments not shore of w? A rect edge
// inside one of w's islands, or an island rim outside w's rect.
function offOwnWater(w, kind, x, z) {
  if (w.kind === 'circle') return false;
  if (kind === 'rim') {
    return Math.max(w.minX - x, x - w.maxX, w.minZ - z, z - w.maxZ) > -SHORE_INSIDE;
  }
  for (const i of w.islands ?? []) if (i.r - Math.hypot(x - i.x, z - i.z) > -SHORE_INSIDE) return true;
  return false;
}

// The runs of one outline segment that lie outside every other footprint (and
// on w's own water, see offOwnWater). Walk in steps of at most SHORE_STEP,
// bisect where "strictly inside" flips, keep the outside runs. Clips by
// waterGap alone, so any shape waterGap understands clips correctly.
function clipOutside(list, w, seg) {
  const [ax, az, bx, bz, kind] = seg;
  const inside = (t) => {
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (offOwnWater(w, kind, x, z)) return true;
    for (const o of list) if (o !== w && waterGap(o, x, z) < SHORE_INSIDE) return true;
    return false;
  };
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / SHORE_STEP));
  const edge = (t0, t1, from) => {
    let lo = t0, hi = t1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inside(mid) === from) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const runs = [];
  let prevT = 0;
  let prevIn = inside(0);
  let runStart = prevIn ? -1 : 0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const cur = inside(t);
    if (cur !== prevIn) {
      const e = edge(prevT, t, prevIn);
      if (cur) runs.push([runStart, e]); else runStart = e;
    }
    prevT = t;
    prevIn = cur;
  }
  if (!prevIn) runs.push([runStart, 1]);
  return runs.map(([t0, t1]) => [
    ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1,
  ]);
}

const shoreCache = new WeakMap();
const NO_SHORE = Object.freeze([]);

/**
 * shorePieces(waters) — the real shore as segments { ax, az, bx, bz, shallow,
 * id }: every footprint's outline, minus the stretches strictly inside another
 * footprint. Not clipped by decks (water under a deck is still deep). Cached
 * per `waters` array.
 */
export function shorePieces(waters) {
  if (!waters || waters.length === 0) return NO_SHORE;
  let pieces = shoreCache.get(waters);
  if (pieces) return pieces;
  pieces = [];
  for (const w of waters) {
    for (const seg of outline(w)) {
      for (const [ax, az, bx, bz] of clipOutside(waters, w, seg)) {
        if (Math.hypot(bx - ax, bz - az) < 1e-9) continue;
        pieces.push({ ax, az, bx, bz, shallow: w.shallow ?? 0, id: w.id });
      }
    }
  }
  Object.freeze(pieces);
  shoreCache.set(waters, pieces);
  return pieces;
}

// Parameter (0..1) of the point on piece p nearest (x, z).
function pieceParam(p, x, z) {
  const dx = p.bx - p.ax, dz = p.bz - p.az;
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) return 0;
  const t = ((x - p.ax) * dx + (z - p.az) * dz) / l2;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function pieceExcess(p, t, x, z) {
  return Math.hypot(x - (p.ax + (p.bx - p.ax) * t), z - (p.az + (p.bz - p.az) * t)) - p.shallow;
}

/**
 * shallowExcess(waters, x, z) — how far past the wadeable band (positive) or
 * how far inside it (negative) a point in the water is. -Infinity on dry
 * ground and on decks. <= 0 is the shallow band; > 0 is deep.
 */
export function shallowExcess(waters, x, z) {
  if (waterClearance(waters, x, z) >= 0) return -Infinity;
  let min = Infinity;
  for (const p of shorePieces(waters)) {
    const d = pieceExcess(p, pieceParam(p, x, z), x, z);
    if (d < min) min = d;
  }
  return min;
}

/**
 * nearestShallow(waters, x, z, out) — fills `out` with the nearer of the
 * shallow band's edge and the edge of any deck over the water the point is in.
 * A point already in the band, or dry, is returned as it is. The deck margin
 * is 0 on purpose: onDeck is inclusive, so a cat 5 cm off a deck lands exactly
 * on its edge (a margin would throw it inward every frame).
 */
export function nearestShallow(waters, x, z, out) {
  out.x = x;
  out.z = z;
  if (!(shallowExcess(waters, x, z) > 0)) return out;
  let best = null, bestT = 0, bestD = Infinity;
  for (const p of shorePieces(waters)) {
    const t = pieceParam(p, x, z);
    const d = pieceExcess(p, t, x, z);
    if (d < bestD) { bestD = d; best = p; bestT = t; }
  }
  if (best) {
    const qx = best.ax + (best.bx - best.ax) * bestT;
    const qz = best.az + (best.bz - best.az) * bestT;
    const dist = Math.hypot(x - qx, z - qz);
    out.x = qx + ((x - qx) / dist) * best.shallow;
    out.z = qz + ((z - qz) / dist) * best.shallow;
  }
  for (const w of waters ?? []) {
    if (!w.decks || waterGap(w, x, z) >= 0) continue;
    for (const d of w.decks) {
      const c = clampInto(d, x, z, 0);
      const dd = Math.hypot(c.x - x, c.z - z);
      if (dd < bestD) { bestD = dd; out.x = c.x; out.z = c.z; }
    }
  }
  return out;
}

function pushOutOf(w, x, z, margin) {
  if (w.kind === 'circle') {
    let dx = x - w.x, dz = z - w.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = 1; dz = 0; d = 1; } // dead-centre: fixed +x push
    const need = w.r + margin;
    return { x: w.x + (dx / d) * need, z: w.z + (dz / d) * need };
  }
  // An island is a way out too: onto the ground, `margin` inside its rim,
  // straight along the line from its centre (a fixed +x at the dead centre).
  const islandExits = (w.islands ?? []).map((i) => {
    let dx = x - i.x, dz = z - i.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
    const need = i.r - margin;
    return { x: i.x + (dx / d) * need, z: i.z + (dz / d) * need };
  });
  return nearestOf(x, z, [
    { x: w.minX - margin, z }, { x: w.maxX + margin, z },
    { x, z: w.minZ - margin }, { x, z: w.maxZ + margin },
    ...islandExits,
  ]);
}

function clampInto(d, x, z, margin) {
  if (isStrip(d)) {
    // The strip's own frame: clamp along it and across it, then map back.
    // Too short or too narrow for the margin, it takes the middle instead.
    const f = stripFrame(d);
    const px = x - f.ax, pz = z - f.az;
    const t = f.len <= 2 * margin
      ? f.len / 2
      : Math.min(f.len - margin, Math.max(margin, px * f.ux + pz * f.uz));
    const side = d.halfW - margin;
    const s = d.halfW <= margin ? 0 : Math.min(side, Math.max(-side, px * f.nx + pz * f.nz));
    return { x: f.ax + t * f.ux + s * f.nx, z: f.az + t * f.uz + s * f.nz };
  }
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
// A point exactly `margin` out is dry; float rounding in a push (18 - 0.35 is
// not exactly 17.65) must not make it count as wet and start another push.
const DRY_EPS = 1e-9;
const tooClose = (w, x, z, margin) => !onDeck(w, x, z) && waterGap(w, x, z) < margin - DRY_EPS;

export function nearestDry(waters, x, z, margin = 0.6) {
  let p = { x, z };
  const list = waters ?? [];
  // A push out of one footprint can land inside, or within the margin of,
  // another where two bodies of water touch, and the Woods has two such
  // places: its pond sits over the river, and the river's two reaches meet at
  // a right angle. So the push repeats a few times, and if that still has not
  // reached dry ground (an inside corner can bounce between the two waters),
  // the ring search below finds the nearest point that is.
  for (let pass = 0; pass < 4; pass++) {
    const w = list.find((wt) => tooClose(wt, p.x, p.z, margin));
    if (!w) return p;
    p = nearestOf(x, z, [
      pushOutOf(w, p.x, p.z, margin),
      ...(w.decks ?? []).map((d) => clampInto(d, p.x, p.z, margin)),
    ]);
  }
  if (!list.some((w) => tooClose(w, p.x, p.z, margin))) return p;
  return ringSearchDry(list, x, z, margin) ?? p;
}

// The nearest dry point to (x, z), to within RING_STEP: rings outward from the
// point, each sampled at RING_ANGLES evenly spaced angles from due east.
// Deterministic (no rng), as nearestDry must be. Only reached when the pushes
// above fail, so its cost (a few thousand footprint tests at worst) is rare.
const RING_STEP = 0.05;
const RING_ANGLES = 64;
const RING_MAX = 30;
function ringSearchDry(list, x, z, margin) {
  for (let r = RING_STEP; r <= RING_MAX; r += RING_STEP) {
    for (let k = 0; k < RING_ANGLES; k++) {
      const a = (k / RING_ANGLES) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (!list.some((w) => tooClose(w, px, pz, margin))) return { x: px, z: pz };
    }
  }
  return null;
}
