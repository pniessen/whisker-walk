import * as THREE from 'three';
import { mulberry32, seedFromCode } from '../rng.js';
import { shorePieces } from '../world/builder.js';

// =============================================================================
// WATER — the visual for one `waters` footprint record.
//
// v19 made water DATA: every area returns `waters`, a list of
// { id, kind: 'circle'|'rect', … } records, and each area's water mesh is now
// built FROM its record rather than beside it (see the WATER FOOTPRINTS block
// at the bottom of world/builder.js, and the "draws that footprint from the
// declaration" case in test/water.test.js). This module is the other half of
// that: given the same record, it returns the mesh — so the footprint stays
// the single source of truth for both where the water IS and what it LOOKS
// LIKE, and the two still cannot drift.
//
// What ships today is three flat single-colour planes wearing litMaterial's
// roughness 0.9 — the same matte surface as tree bark. That is the right call
// for bark and wrong for the one surface in the game whose entire read is
// "it catches the sky". This module changes four things and no more:
//
//   1. MOVEMENT — a tileable procedural normal map, scrolled slowly across the
//      surface. Nothing else moves: the mesh is the declared footprint, at the
//      declared size, unsubdivided.
//   2. SPECULAR — roughness drops to 0.22 out in the deep, so the baked
//      RoomEnvironment IBL (materials.js buildEnvMap, hung on scene.environment
//      by walk.js) finally shows up in something.
//   3. DEPTH — a baked colour ramp from a pale shallow at the rim to a deeper,
//      more saturated centre.
//   4. A SHORELINE HINT — a soft light band in the same ramp, right at the
//      water's edge.
//
// And, since polish-waterlife, one evening tint (eveningWater / WATER_EVENING):
// warm and a touch amber at sunset, dark and blue at dusk, via material.color
// and emissive, so the day's look is untouched when no mode is passed.
//
// WHY NORMAL-MAP SCROLL AND NOT VERTEX DISPLACEMENT. Displacement moves the
// SILHOUETTE, and at this camera — a third-person cat, eye height ~2m, looking
// across a surface that is by definition horizontal — the silhouette of a
// 10cm swell is invisible. What actually reads as "water" from here is the
// specular highlight sliding around, which is a NORMALS effect. Scrolling
// normals give exactly that for two Vector2 writes per frame, need no shader
// injection for the MOVEMENT (onBeforeCompile against a version-specific chunk
// name is the most fragile thing we could put in a PWA that must keep working
// offline; the one small exception, a specular clamp, is described at SPEC_CAP
// and is tested against three's own physical shader), and
// cost zero CPU per vertex — where displacing the seaside's 80x140 plane finely
// enough to see would mean thousands of CPU-touched vertices every frame on
// the very devices that get the low tier.
//
// WHY IT STILL DOESN'T LOOK LIKE A CONVEYOR BELT. A single scrolling normal
// map usually does. Two things stop it here: the height field is a sum of six
// sine trains running at six different ANGLES (see WAVE_TRAINS), so no single
// direction dominates and the eye cannot latch onto one crest and follow it;
// and normalScale breathes on an 11-second cycle, which is slower than the
// scroll and coprime with it, so the surface swells rather than merely slides.
//
// ASSET-FREE, AND DOM-FREE. Every texture here is a THREE.DataTexture filled
// by arithmetic — no fetch, no HDRI, no canvas. That is stronger than the
// document.createElement('canvas') pattern in world/builder.js for this
// particular job: the world tests build all three areas headless behind a stub
// canvas whose getContext() returns a Proxy, so createRadialGradient() and
// createImageData() come back undefined there. A DataTexture needs neither a
// document nor a WebGL context, so this module imports and CONSTRUCTS cleanly
// under vitest, which is what lets test/water.test.js keep building the real
// areas after the integration pass swaps them over.
//
// NO BARE Math.random. The ripple phases come from mulberry32 seeded off the
// footprint's own id (see walk.js:266-287 for why a lazy per-frame consumer of
// the shared walk stream desyncs co-walkers — this module never touches that
// stream at all, and never draws a number after construction).
//
// COSY, NOT AN OCEAN DEMO. The dials that would take this to photoreal are all
// deliberately left low: deep roughness 0.22 rather than the 0.05 that would
// mirror the sky, envMapIntensity BELOW 1 so the grazing Fresnel sheen never
// blows out, ripple wavelengths of 3.5m down to 1m rather than centimetres,
// the foam a 45%-strength tint rather than a white ring,
// the surface stays fully opaque (see the note on OPACITY below), and there is
// no reflection probe, no refraction, no caustics and no depth-buffer edge
// fade. The target is "an inviting pond in a picture book", and the test for
// whether we overshot is whether a five-year-old would call it water — not
// whether an artist would call it accurate.
//
// OPACITY. A transparent surface is the obvious "deep water" trick and it is
// wrong here: what sits under all three bodies is b.ground(), a single flat
// colour plane. Blending against it would only mud the ramp we just baked,
// while costing a transparent draw and a sort. The depth read comes from the
// colour ramp instead, which is all a low-poly game needs.
// =============================================================================

// --- ripple (normal map) -----------------------------------------------------

// 128 is the whole budget: the map tiles every RIPPLE_TILE_M metres, so a
// texel is under 3cm of world at the surface and mipmaps carry everything past
// a few metres out. 256 would double the upload to buy detail that the scroll
// speed smears away anyway.
const RIPPLE_TEX = 128;

// Metres of world per tile of the ripple map. WAVE_TRAINS' lowest train is one
// cycle per tile, so this IS the longest wavelength on the water: 3.5m, with
// the finest chop (the |k| = 3.6 trains) just under a metre.
//
// This started at 9m, on the reasoning that a long low swell is calmer. On
// screen it was simply invisible: at the game camera (catcam.js — 4.5m behind
// the cat, 2.2m up) a 9m wave across a 14m pond is barely more than one crest,
// and a surface with one crest on it reads as a flat gradient. 3.5m is the
// value at which the pond first reads as WATER rather than as a blue disc, and
// it is still four times the wavelength that would read as choppy.
//
// It is deliberately the SAME for all three bodies — a canal ripple and a sea
// ripple are the same size of ripple; only the body around them differs —
// which is why the repeat is derived from each footprint's extent below rather
// than being a constant.
const RIPPLE_TILE_M = 3.5;

// Six sine trains, as [cyclesU, cyclesV, amplitude]. Integer cycle counts are
// what make the field exactly tileable, so any non-integer texture.repeat
// still wraps seamlessly and we never have to round a footprint's extent up to
// a whole tile. Amplitude falls roughly as 1/|k| (pink-ish), which puts about
// the same slope energy in every train: one long swell with progressively
// finer chop riding on it, and no single direction to follow.
const WAVE_TRAINS = [
  [1, 0, 1.00],
  [0, 1, 0.78],
  [2, 1, 0.44],
  [1, -2, 0.36],
  [3, 2, 0.21],
  [-2, 3, 0.17],
];

// Peak tangent-space slope baked into the map, before normalScale. 0.5 is a
// ~27-degree face at the very steepest texel of the field and much less
// everywhere else; the artistic dial the integration pass would actually turn
// is NORMAL_SCALE below, and this only sets the headroom it works within.
const SLOPE = 0.5;

// The default normalScale. 0.9 of a 0.5 peak slope leaves the steepest face on
// the water at about 24 degrees and the great majority far shallower — enough
// to break the specular into moving facets, nowhere near enough to read as a
// wave with a face. This was 0.4 until it was looked at: against a soft,
// low-intensity IBL probe rather than a hard sun, a 0.4 tilt moves the
// reflected radiance so little that the ripple does not survive tone mapping.
// Gloss and normal strength trade off, and this module spends its budget on
// normals (visible, moving, cheap) rather than on lower roughness (a mirror,
// and the thing the art direction is most afraid of).
const NORMAL_SCALE = 0.9;

// Scroll velocity in UV per second, i.e. RIPPLE_TILE_M * this in metres per
// second: 0.21 and 0.13 m/s. Real pond ripples travel at roughly a quarter of
// a metre a second, so this is about right and reads as drift rather than
// current — a crest takes 17 seconds to cross a tile. These are expressed in
// UV rather than metres because they must be retuned WITH RIPPLE_TILE_M: when
// the tile shrank from 9m the old UV numbers silently became a third of the
// world speed they were chosen for, and the surface stopped moving.
//
// The two axes are deliberately unequal so the drift is diagonal, and their
// ratio is not a simple fraction, so the pattern does not re-register with
// itself on any short cycle.
const DRIFT_U = 0.060;
const DRIFT_V = 0.038;

// The swell: normalScale oscillates +/- 22% on an 11-second cycle. Long
// against the scroll (a tile crosses itself in ~69s) so the two never beat
// into a visible rhythm, and slow enough to sit under a child's notice as
// motion while still killing the conveyor read.
const SWELL_PERIOD = 11;
const SWELL_DEPTH = 0.22;

// --- depth ramp + shoreline (colour and roughness maps) ----------------------

// Target world size of one texel in the ramp map. 0.35m keeps the foam band
// (0.9m) about three texels wide, which is the minimum that still reads as a
// LINE at the water's edge rather than as a smear, without paying for a
// resolution the ramp's smooth gradients cannot use.
const RAMP_TEXEL_M = 0.35;
const RAMP_MIN = 16;
const RAMP_MAX = 256; // caps the seaside's 140m axis at ~0.55m/texel

// How far in from the shore the water reaches its full deep colour.
//
// Three metres, and the constraint that sets it is the PARK POND, the smallest
// body: at 5m (the first value tried) the shallow ramp owned the outer 5 of
// the pond's 7m radius, which is two thirds of its area, and a low camera saw
// almost nothing but pale shelf. At 3m the pond has a proper deep middle and
// still shows a believable shallow margin. It suits the other two as a
// consequence rather than by separate tuning: the sea is deep 3m off the sand,
// which is what a sea should be, and the canal (half-width 3.5) just reaches
// its deep colour on the centre line.
const SHELF_M = 3.0;

// Width of the foam/shallow-break band at the very edge, and how strongly it
// tints toward the foam colour. 0.7m is roughly the wet band a gentle break
// leaves; 0.45 keeps it a HINT of foam rather than a painted white ring, which
// is the difference between "a lake" and "a swimming pool". Both were pulled
// down from 0.9 / 0.55 for the same reason SHELF_M came down — at a grazing
// camera the near rim is enormously foreshortened, so a band that measures
// modestly in metres reads as a wide halo on screen.
const FOAM_M = 0.7;
const FOAM_STRENGTH = 0.45;

// Roughness at the rim and out in the deep, baked into the roughness map, plus
// what the foam band pushes toward.
//
// 0.22 sits deliberately ABOVE the floor materials.js's SURFACE_PRESETS note
// establishes: below about 0.15 the baked RoomEnvironment probe is too
// low-resolution to blur, and its texel structure shows through as hard bright
// blobs. That table's own `water` preset is 0.12 — a hair under that floor,
// and its comment says why it accepts the risk: "the plane has no ripple
// geometry at all, so this small roughness is standing in for the fine surface
// chop that the mesh does not have". This module supplies that chop, as a
// normal map, so it does not need to borrow gloss to fake it and can stay on
// the safe side of the probe's limit.
//
// THE TWO OVERLAP, and the integration pass has to be told which wins where.
// The preset's own line is "Still water — ponds, the harbour, puddles", and
// the first two of those are exactly the three bodies this module takes over.
// The split is the footprint record: a body with a `waters` entry is drawn by
// createWater and does not want the preset; water WITHOUT a footprint record —
// the park fountain's disc (park.js, a r-2.2 cylinder inside the fountain's
// own collider, which is why v19 deliberately did not declare it), puddles —
// is small, still, unreachable or both, and the preset is exactly right for
// it. Neither should be applied twice.
//
// It is 0.22 rather than 0.15 for a second reason found by looking at it: the
// world's lighting (a 2.2-intensity sun plus a 0.9 ambient) already drives the
// diffuse term near clipping, and a tighter specular lobe on top of that turns
// the whole near half of a pond into an undifferentiated white wash under ACES.
// The ripple, not the gloss, is what carries the read; the gloss only has to be
// enough to let the ripple catch something.
//
// The rim is far rougher because shallow, broken, sand-stirred water genuinely
// is, and because a uniform mirror across 80x140m of sea would be the exact
// tech-demo look we are avoiding. Foam is rougher still: froth has no specular.
const ROUGH_DEEP = 0.22;
const ROUGH_SHORE = 0.62;
const ROUGH_FOAM = 0.85;

// Roughness for the low tier, which carries no roughness map at all. Halfway
// between the deep and shore values: still glossier than the world's 0.9, but
// a single uniform number and one fewer sampler in the shader.
const ROUGH_LOW = 0.55;

// envMapIntensity. walk.js hands the scene environmentIntensity 0.45 (high)
// or 0.32 (low) via composerRig.applyLighting, calibrated so that MATTE
// surfaces pick up a believable ambient bounce. This multiplies that global
// rather than replacing it, so a re-calibration of the tier numbers, or Night
// Eyes' 1.6x dusk gain, still carries through proportionally.
//
// It is BELOW 1 on the high tier, which is the opposite of what "water should
// catch the sky" suggests and is what looking at it argued for. A low-roughness
// dielectric already reflects almost everything at a grazing angle (Fresnel),
// and a horizontal plane viewed from a 2.2m-high camera is nothing BUT grazing
// angles; the probe is a bright neutral room, so at 1.35 the near half of every
// body went white. 0.85 keeps a clear sheen on the far half — where the surface
// is seen closer to face-on and the reflection is genuinely worth having —
// without the near half blowing out. The low tier, having no normal map to
// scatter that reflection into ripples, can afford the full 1.0.
const ENV_INTENSITY = 0.85;
const ENV_INTENSITY_LOW = 1.0;

// GLARE — how strong the water's specular is, as a scale on its whole
// Fresnel curve. At some sun angles the sun's highlight (and the probe's hot
// facets) broke up through the ripple into white patches across the near half
// of a lake or pond (the swim screenshots). Roughness was no good for it: up
// to twice as rough, the patches only got broader. So the material is a
// MeshPhysicalMaterial with specularIntensity = GLARE: for a dielectric that
// scales both F0 and F90 (three's lights_physical_fragment), so the highlight
// and the grazing sheen come down together and the ripple still sparkles. 0.4
// was picked side by side against 1, 0.55 and 0.3 at the same moment of the
// same walk: at 0.55 a low sun still nearly whited out the Pines lake, at
// 0.3 the water went dull. The one small shader patch is the SPEC_CAP clamp below.
//
// The sea keeps closer to today's look (GLARE_SEA): its pale, sunny palette is
// the Seaside's identity, and its glare reads as a bright day at the beach.
const GLARE = 0.4;
const GLARE_SEA = 0.8;

// MOOR_STREAM_LOOK (polish-moorlook, Pass 10) — the Moor's own streams
// (river-south, river-west, river-mouth; not the lake, which is one water with
// the Woods and the Pines). A moorland stream runs over peat: tea-dark, not
// the lake's clear blue, and it has no business mirroring a white sky. The
// default look turned the straight stream into a saturated blue canal with
// big white sky blotches (survey 10, w-moor-day-desk-9-water). So: a darker
// peaty teal-brown body, the sky probe at ENV_INTENSITY_PEAT (about 70% of
// ENV_INTENSITY), and a softer sun glint (glare, specCap). moor.js spreads
// this into createWater for those three pieces only; no other area's water
// changes.
const ENV_INTENSITY_PEAT = 0.6;
export const MOOR_STREAM_LOOK = Object.freeze({
  color: 0x62857a,
  glare: 0.32,
  specCap: 0.4,
  envIntensity: ENV_INTENSITY_PEAT,
});

// PARK_POND_LOOK (polish-fountainglow, Pass 11) — the Park's duck pond only.
// Survey 11 found it the most saturated blue in the game, with white sky
// blotches: the authored 0x7ab0d8 is a bright sky-cyan, and at the default
// ENV_INTENSITY the open lawn's pale sky sat on it in big white patches. A
// town-park pond is a deeper, quieter green-blue, so: a less saturated teal
// body (lightness ~0.58, saturation ~0.26 instead of 0.66 / 0.55), the sky
// probe at ENV_INTENSITY_POND, and a softer sun glint. park.js spreads this
// into its createWater call; no other area's water changes.
const ENV_INTENSITY_POND = 0.5;
export const PARK_POND_LOOK = Object.freeze({
  color: 0x76aab0,
  glare: 0.3,
  specCap: 0.4,
  envIntensity: ENV_INTENSITY_POND,
});

// SPEC_CAP — a ceiling on the specular light, per channel, linear. Cutting
// GLARE alone to tame the sun's glint (0.3 was tried) dulled the whole
// surface; capping the peak leaves the rest of the sparkle alone and just
// stops the one hot patch from blowing out to white. It is a one-line patch
// after lights_fragment_end; if three ever renames that chunk the test in
// test/waterglare.test.js fails loudly rather than the glint silently returning.
const SPEC_CAP = 0.55;

// Segments around a circular footprint's rim. The shipped pond used 20, whose
// 2.2m chords are plainly visible as a polygon once there is a light foam band
// tracing the edge — the band draws the eye straight to the faceting. 48 costs
// 28 more triangles and makes the rim read as a curve.
const CIRCLE_SEGMENTS = 48;

// Every rect edge is land unless the caller says otherwise. See `shores` in
// createWater's options for the one case (the seaside) that must say otherwise.
const ALL_SHORES = Object.freeze(['minX', 'maxX', 'minZ', 'maxZ']);

export const WATER_TUNING = Object.freeze({
  RIPPLE_TEX, RIPPLE_TILE_M, SLOPE, NORMAL_SCALE, DRIFT_U, DRIFT_V,
  SWELL_PERIOD, SWELL_DEPTH, RAMP_TEXEL_M, RAMP_MIN, RAMP_MAX,
  SHELF_M, FOAM_M, FOAM_STRENGTH, ROUGH_DEEP, ROUGH_SHORE, ROUGH_FOAM,
  ROUGH_LOW, ENV_INTENSITY, ENV_INTENSITY_LOW, CIRCLE_SEGMENTS, GLARE, GLARE_SEA, SPEC_CAP,
  ENV_INTENSITY_PEAT, ENV_INTENSITY_POND,
});

// --- small pure helpers ------------------------------------------------------

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const mix = (a, b, t) => a + (b - a) * t;

// Nearest power of two at or above `v`, clamped. Powers of two are not
// required by WebGL2, but they keep mipmap chains exact and the memory
// arithmetic obvious.
function pow2Ceil(v, lo, hi) {
  const p = 2 ** Math.ceil(Math.log2(Math.max(1, v)));
  return Math.min(hi, Math.max(lo, p));
}

/**
 * The footprint's axis-aligned bounding box in world x/z. Both kinds reduce to
 * one, which is what lets a single texel->world mapping serve both.
 */
export function waterBox(w) {
  if (w.kind === 'circle') {
    return { minX: w.x - w.r, maxX: w.x + w.r, minZ: w.z - w.r, maxZ: w.z + w.r };
  }
  return { minX: w.minX, maxX: w.maxX, minZ: w.minZ, maxZ: w.maxZ };
}

/**
 * Metres from (x, z) IN from the nearest shore: 0 at the water's edge, growing
 * toward the middle. Infinity when the footprint has no shore facing this
 * point at all — a legitimate configuration (see `shores`), read downstream as
 * "open water, fully deep".
 *
 * Deliberately NOT builder.js's waterGap(): that measures every rect edge
 * unconditionally, because a future collider has to push the cat out over any
 * of them. Here an edge that is 22m outside the walkable bounds is not a
 * shore, it is the far horizon, and painting surf on it would be a lie.
 */
export function shoreDepth(w, x, z, shores = ALL_SHORES) {
  if (w.kind === 'circle') return w.r - Math.hypot(x - w.x, z - w.z);
  let d = Infinity;
  for (const edge of shores) {
    if (edge === 'minX') d = Math.min(d, x - w.minX);
    else if (edge === 'maxX') d = Math.min(d, w.maxX - x);
    else if (edge === 'minZ') d = Math.min(d, z - w.minZ);
    else if (edge === 'maxZ') d = Math.min(d, w.maxZ - z);
  }
  // An island's rim is always a shore, whatever `shores` says: it is ground
  // the cat can stand on, right there in the water, never open horizon.
  for (const i of w.islands ?? []) d = Math.min(d, Math.hypot(x - i.x, z - i.z) - i.r);
  return d;
}

// --- real shore --------------------------------------------------------------
//
// Where two footprints overlap (the Woods pond over its river, the Moor's
// river mouth over the lake, the Pines lake under its bay, the Black Mire's
// corner), a stretch of one water's outline runs under the other: open water,
// not a bank. shoreDepth measures to the whole outline, so it painted a short
// pale foam stripe across the open water there. With the area's `waters`
// handed in, depth is measured instead to this water's own pieces of REAL
// shore, the ones builder.js's shorePieces keeps (the same pieces the swim
// code wades by), still limited to the `shores` edges the area lists.
//
// Only a water whose box meets another's takes this path: everything else
// paints exactly the texels it always did. And only texels within `shelf` of
// the outline pay for it, since real shore is part of the outline and can
// only be further away.
function boxesMeet(a, b) {
  const p = waterBox(a), q = waterBox(b);
  return p.minX <= q.maxX && q.minX <= p.maxX && p.minZ <= q.maxZ && q.minZ <= p.maxZ;
}

const ON_EDGE = 1e-6;
function onAllowedEdge(w, piece, shores) {
  if (w.kind === 'circle') return true;
  const on = (a, b, v) => Math.abs(a - v) < ON_EDGE && Math.abs(b - v) < ON_EDGE;
  const edges = [];
  if (on(piece.ax, piece.bx, w.minX)) edges.push('minX');
  if (on(piece.ax, piece.bx, w.maxX)) edges.push('maxX');
  if (on(piece.az, piece.bz, w.minZ)) edges.push('minZ');
  if (on(piece.az, piece.bz, w.maxZ)) edges.push('maxZ');
  // Not on any rect edge: an island's rim, which is always shore.
  return edges.length === 0 || edges.some((e) => shores.includes(e));
}

/**
 * realShoreOf(w, waters, shores) — w's own real-shore segments on its allowed
 * edges, or null when no other water overlaps w (shoreDepth is then exact).
 */
export function realShoreOf(w, waters, shores = ALL_SHORES) {
  if (!waters || !waters.some((o) => o !== w && o.id !== w.id && boxesMeet(o, w))) return null;
  return shorePieces(waters).filter((p) => p.id === w.id && onAllowedEdge(w, p, shores));
}

// Chords round a circle when it has no neighbour to clip against: the same 64
// builder.js's shorePieces uses, so a bank drawn from either source is the
// same polygon.
const SHORE_CHORDS = 64;
function ringPieces(id, x, z, r) {
  const out = [];
  for (let i = 0; i < SHORE_CHORDS; i++) {
    const a0 = (2 * Math.PI * i) / SHORE_CHORDS, a1 = (2 * Math.PI * (i + 1)) / SHORE_CHORDS;
    out.push({ ax: x + Math.cos(a0) * r, az: z + Math.sin(a0) * r, bx: x + Math.cos(a1) * r, bz: z + Math.sin(a1) * r, id });
  }
  return out;
}

/**
 * bankPieces(w, waters, shores) — the stretches of w's outline that are a
 * bank someone stands on: realShoreOf when w meets another water, otherwise
 * its own allowed edges (a circle all round; a rect's listed `shores`, in the
 * outline's walk order, plus any island rims). `shores: []` is no bank at
 * all. For the render-side dressing (waterdress.js).
 */
export function bankPieces(w, waters, shores = w.shores ?? ALL_SHORES) {
  const real = realShoreOf(w, waters, shores);
  if (real) return real;
  if (w.kind === 'circle') return ringPieces(w.id, w.x, w.z, w.r);
  const { minX, maxX, minZ, maxZ } = w;
  const edges = {
    minZ: [minX, minZ, maxX, minZ], maxX: [maxX, minZ, maxX, maxZ],
    maxZ: [maxX, maxZ, minX, maxZ], minX: [minX, maxZ, minX, minZ],
  };
  const out = [];
  for (const e of ['minZ', 'maxX', 'maxZ', 'minX']) {
    if (!shores.includes(e)) continue;
    const [ax, az, bx, bz] = edges[e];
    out.push({ ax, az, bx, bz, id: w.id });
  }
  for (const i of w.islands ?? []) out.push(...ringPieces(w.id, i.x, i.z, i.r));
  return out;
}

function distToPieces(pieces, x, z) {
  let min = Infinity;
  for (const p of pieces) {
    const dx = p.bx - p.ax, dz = p.bz - p.az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - p.ax) * dx + (z - p.az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (p.ax + dx * t), z - (p.az + dz * t));
    if (d < min) min = d;
  }
  return min;
}

/**
 * A rect minus round discs, in world x/z: the outline to draw and the discs
 * to cut out of it as holes.
 *
 * The outline walks the rect's perimeter from (minX, minZ) through
 * (maxX, minZ), (maxX, maxZ) and (minX, maxZ). Each disc is one of three
 * things:
 *   - wholly inside (every edge at least 1e-6 beyond its rim): a hole;
 *   - wholly outside: dropped, it has nothing to cut;
 *   - crossing the perimeter: a notch. The stretch of perimeter inside the
 *     disc is replaced by the disc's arc that lies inside the rect, sampled
 *     no coarser than 2π / segments, from where the walk enters the disc to
 *     where it leaves. A disc over one corner crosses two different edges and
 *     its arc stands in for the corner.
 *
 * Why a crossing disc must be a notch and not a hole: ShapeGeometry's
 * triangulator assumes every hole lies inside the outline. A hole that pokes
 * through it drops triangles or fills the wrong ones, so the water would
 * either cover part of the island or vanish beside it. The only correct way
 * to draw a disc that crosses the edge is to bend the edge round it.
 *
 * A disc over two corners crosses the perimeter twice too, so it is a notch
 * like any other: its arc stands in for both corners.
 *
 * It throws, saying which, for a disc that crosses the perimeter more than
 * twice (it would cut the rect apart), for one that covers the whole rect,
 * for one inside that only touches an edge (within 1e-6) without crossing it,
 * and for two discs that overlap (a hole would cross a hole, or two notches
 * would share a stretch). No map needs any of them, so none is handled.
 */
export function rectMinusDiscs(box, discs, segments) {
  const { minX, maxX, minZ, maxZ } = box;
  const W = maxX - minX;
  const H = maxZ - minZ;
  const P = 2 * (W + H);
  const EPS = 1e-6;
  // Distance along the walk to a point on the perimeter.
  const along = (x, z) => {
    if (Math.abs(z - minZ) < 1e-9) return x - minX;
    if (Math.abs(x - maxX) < 1e-9) return W + (z - minZ);
    if (Math.abs(z - maxZ) < 1e-9) return W + H + (maxX - x);
    return 2 * W + H + (maxZ - z);
  };
  const pointAt = (s) => {
    const t = ((s % P) + P) % P;
    if (t <= W) return [minX + t, minZ];
    if (t <= W + H) return [maxX, minZ + (t - W)];
    if (t <= 2 * W + H) return [maxX - (t - W - H), maxZ];
    return [minX, maxZ - (t - 2 * W - H)];
  };
  const inRect = (x, z) => x >= minX - 1e-9 && x <= maxX + 1e-9 && z >= minZ - 1e-9 && z <= maxZ + 1e-9;
  // Strictly between a and b, walking forward from a (wrapping past 0).
  const between = (s, a, b) => (a <= b ? s > a && s < b : s > a || s < b);

  const holes = [];
  const notches = [];
  const kept = [];
  for (const d of discs) {
    const { x: cx, z: cz, r } = d;
    if (cx - r >= minX + EPS && cx + r <= maxX - EPS && cz - r >= minZ + EPS && cz + r <= maxZ - EPS) {
      holes.push({ x: cx, z: cz, r });
      kept.push(d);
      continue;
    }
    const nx = Math.min(maxX, Math.max(minX, cx));
    const nz = Math.min(maxZ, Math.max(minZ, cz));
    if (Math.hypot(cx - nx, cz - nz) >= r) continue;
    kept.push(d);

    // Where the circle crosses each edge, deduplicated where two edges share
    // a corner.
    const cross = [];
    const add = (x, z) => {
      if (!inRect(x, z)) return;
      if (cross.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1e-9)) return;
      cross.push([x, z]);
    };
    for (const z0 of [minZ, maxZ]) {
      const dz = z0 - cz;
      if (Math.abs(dz) < r) {
        const dx = Math.sqrt(r * r - dz * dz);
        add(cx - dx, z0);
        add(cx + dx, z0);
      }
    }
    for (const x0 of [minX, maxX]) {
      const dx = x0 - cx;
      if (Math.abs(dx) < r) {
        const dz = Math.sqrt(r * r - dx * dx);
        add(x0, cz - dz);
        add(x0, cz + dz);
      }
    }
    if (cross.length === 0) {
      // No crossing, yet not wholly inside: it covers the rect, or it is
      // inside and touches an edge (within 1e-6) without crossing it.
      const covers = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]]
        .every(([x, z]) => Math.hypot(x - cx, z - cz) <= r);
      throw new Error(covers
        ? `rectMinusDiscs: disc (${cx}, ${cz}, r ${r}) covers the whole rect; there is no water left to draw`
        : `rectMinusDiscs: disc (${cx}, ${cz}, r ${r}) touches the rect's edge without crossing it; move it at least 1e-6 in from the edge, or across it`);
    }
    if (cross.length !== 2) {
      throw new Error(`rectMinusDiscs: disc (${cx}, ${cz}, r ${r}) crosses the rect's edge ${cross.length} times, cutting it apart; only a two-crossing notch is drawn`);
    }

    // Which way round is the perimeter inside the disc? Test the middle of
    // the forward stretch from the first crossing to the second.
    let [a, b] = cross.map(([x, z]) => along(x, z));
    const mid = a < b ? (a + b) / 2 : (a + b + P) / 2;
    const [mx, mz] = pointAt(mid);
    if (Math.hypot(mx - cx, mz - cz) >= r) [a, b] = [b, a];
    const [ex, ez] = pointAt(a);
    const [xx, xz] = pointAt(b);

    // The arc from entry to exit that lies inside the rect: of the two ways
    // round, the one whose midpoint is in the rect.
    const t0 = Math.atan2(ez - cz, ex - cx);
    let sweep = Math.atan2(xz - cz, xx - cx) - t0;
    sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const midT = t0 + sweep / 2;
    if (!inRect(cx + r * Math.cos(midT), cz + r * Math.sin(midT))) sweep -= 2 * Math.PI;
    const n = Math.max(1, Math.ceil(Math.abs(sweep) / ((2 * Math.PI) / segments) - 1e-9));
    const arc = [[ex, ez]];
    for (let k = 1; k < n; k++) {
      const t = t0 + (sweep * k) / n;
      arc.push([cx + r * Math.cos(t), cz + r * Math.sin(t)]);
    }
    arc.push([xx, xz]);
    notches.push({ start: a, end: b, arc });
  }

  for (let i = 0; i < kept.length; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      const p = kept[i];
      const q = kept[j];
      if (Math.hypot(p.x - q.x, p.z - q.z) < p.r + q.r) {
        throw new Error(`rectMinusDiscs: discs (${p.x}, ${p.z}) and (${q.x}, ${q.z}) overlap`);
      }
    }
  }

  // Walk the perimeter: each corner not inside a notch, and each notch's arc
  // in its place.
  const events = [
    ...[0, W, W + H, 2 * W + H].map((s) => ({ s, corner: pointAt(s) })),
    ...notches.map((nt) => ({ s: nt.start, notch: nt })),
  ].sort((p, q) => p.s - q.s);
  const outline = [];
  for (const e of events) {
    if (e.notch) outline.push(...e.notch.arc);
    else if (!notches.some((nt) => between(e.s, nt.start, nt.end))) outline.push(e.corner);
  }
  return { outline, holes };
}

/**
 * The ripple height field, in tile-normalised UV. Exported because its ONE
 * load-bearing property — exact periodicity, so the scrolled map has no seam —
 * is a property of this function and is far easier to assert here than by
 * staring at the encoded bytes. h(u, v) === h(u + 1, v) === h(u, v + 1).
 */
export function rippleHeight(u, v, phases) {
  let h = 0;
  for (let k = 0; k < WAVE_TRAINS.length; k++) {
    const [nu, nv, amp] = WAVE_TRAINS[k];
    h += amp * Math.sin(Math.PI * 2 * (nu * u + nv * v) + phases[k]);
  }
  return h;
}

// --- texture builders --------------------------------------------------------

function dataTexture(buf, width, height, { srgb = false, repeat = false } = {}) {
  const tex = new THREE.DataTexture(buf, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  // DataTexture defaults to NearestFilter and no mipmaps, which on a surface
  // this large would alias into a shimmering mess at any distance. Everything
  // here is a smooth gradient, so trilinear is both correct and free.
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  // Only the albedo ramp is a colour; the normal and roughness maps are data
  // and must stay in linear space or three will de-gamma them into nonsense.
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The tileable ripple normal map. Two passes over 128x128: one to find the
 * field's actual peak gradient, one to encode against it. Self-normalising
 * rather than divided by a hand-tuned constant, so retuning WAVE_TRAINS cannot
 * silently make the surface flat or spiky — SLOPE stays exactly the steepest
 * face in the map whatever the trains are.
 */
function buildRippleTexture(seed) {
  const n = RIPPLE_TEX;
  const rng = mulberry32(seed);
  const phases = WAVE_TRAINS.map(() => rng() * Math.PI * 2);
  const gu = new Float32Array(n * n);
  const gv = new Float32Array(n * n);
  let peak = 1e-6;
  for (let j = 0; j < n; j++) {
    const v = (j + 0.5) / n;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      // Analytic gradient of rippleHeight — no finite differences, so the
      // encoded normals stay exact at any texture resolution.
      let du = 0;
      let dv = 0;
      for (let k = 0; k < WAVE_TRAINS.length; k++) {
        const [nu, nv, amp] = WAVE_TRAINS[k];
        const c = Math.cos(Math.PI * 2 * (nu * u + nv * v) + phases[k]) * amp * Math.PI * 2;
        du += c * nu;
        dv += c * nv;
      }
      const idx = j * n + i;
      gu[idx] = du;
      gv[idx] = dv;
      const m = Math.hypot(du, dv);
      if (m > peak) peak = m;
    }
  }
  const buf = new Uint8Array(n * n * 4);
  const k = SLOPE / peak;
  for (let idx = 0; idx < n * n; idx++) {
    // Tangent-space normal of a heightfield: (-dh/du, -dh/dv, 1), normalised.
    let nx = -gu[idx] * k;
    let ny = -gv[idx] * k;
    const nz = 1;
    const len = Math.hypot(nx, ny, nz);
    nx /= len;
    ny /= len;
    const o = idx * 4;
    buf[o] = Math.round((nx * 0.5 + 0.5) * 255);
    buf[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    buf[o + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
    buf[o + 3] = 255;
  }
  return { texture: dataTexture(buf, n, n, { repeat: true }), phases };
}

/**
 * Shallow / deep / foam, derived from the ONE colour a call site already has —
 * the tint its water plane is painted today (pond 0x7ab0d8, sea 0x4a90c0,
 * canal 0x24445e). Deriving rather than asking for three colours is what keeps
 * the integration a one-line change per area and keeps the three bodies
 * recognisably themselves: the Docks canal stays the dour dark-slate water the
 * area's overcast palette needs, the park pond stays a friendly cyan.
 *
 * BOTH ENDS ARE DARKER THAN THE AUTHORED COLOUR, which looks wrong written
 * down and is the single most important thing here. The scene runs a
 * 2.2-intensity sun over a 0.9 ambient, roughly a 2.7x gain on the diffuse
 * term, so any albedo much above mid-grey clips and ACES desaturates it toward
 * white. The pond's authored 0x7ab0d8 is already at lightness 0.66 — i.e. the
 * flat plane that ships today is ALREADY rendering as a near-white disc, which
 * is a good part of why it does not read as water. Lifting a "shallow" tint
 * above it, as the first pass here did, only made that worse. So the authored
 * hex is treated as the body's IDENTITY, not as one of its two ends, and both
 * ends are placed below it.
 *
 * All of this is done explicitly in SRGBColorSpace. THREE.ColorManagement is
 * on by default, so getHSL/setHSL without a colour space argument would work
 * in linear-sRGB, where "lightness * 0.55" is a visibly different (and much
 * darker) operation than the one these numbers were picked against.
 */
export function waterRamp(base, style = 'clear') {
  const hsl = {};
  new THREE.Color(base).getHSL(hsl, THREE.SRGBColorSpace);
  const rgb = (c) => {
    const t = {};
    c.getRGB(t, THREE.SRGBColorSpace);
    return [t.r * 255, t.g * 255, t.b * 255];
  };
  if (style === 'bog') {
    // A bog is peat-stained and still: no bluing with depth, no white rim.
    // The deep end keeps 90% of the authored lightness (the authored hex IS
    // the murk, so darkening it to 55% would turn a small bog into a black
    // hole), and the edge is a dull green-brown, never foam-white.
    const at = (h, sat, l) => rgb(new THREE.Color().setHSL(h, Math.min(1, sat), l, THREE.SRGBColorSpace));
    return {
      deep: at(hsl.h, hsl.s, hsl.l * 0.9),
      shallow: at((hsl.h + 0.01) % 1, hsl.s * 0.85, Math.min(0.42, hsl.l * 1.12)),
      foam: at(hsl.h, hsl.s * 0.6, Math.min(0.42, hsl.l + 0.12)),
    };
  }
  return {
    // Deep: 55% of the authored lightness, a touch more saturated. Depth eats
    // the long wavelengths, so real deep water is both darker and bluer.
    deep: rgb(new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.10), hsl.l * 0.55, THREE.SRGBColorSpace)),
    // Shallow: 85% of the authored lightness — a step DOWN from it, not up
    // (see above) — desaturated, and nudged a hair around the wheel toward
    // green, because shallow water is tinted by the sand and silt it is
    // standing on and not merely by less of the same blue. The rim still reads
    // as the pale end of the ramp: the gap to `deep` is what makes it pale,
    // and the foam band above supplies the actual highlight.
    shallow: rgb(new THREE.Color().setHSL((hsl.h + 0.012) % 1, hsl.s * 0.75, hsl.l * 0.85, THREE.SRGBColorSpace)),
    // Foam: not white. Keeping a quarter of the hue's saturation stops the
    // rim reading as a hard graphic outline against the water.
    foam: rgb(new THREE.Color().setHSL(hsl.h, hsl.s * 0.25, 0.93, THREE.SRGBColorSpace)),
  };
}

/**
 * The depth ramp (albedo) and the matching roughness map, generated in one
 * pass because both are functions of the same shore distance.
 *
 * TEXEL -> WORLD, and why the orientation cannot bite us. Every water mesh
 * here is rotated -PI/2 about x, which sends local +y to world -z. PlaneGeometry
 * and CircleGeometry both run u along local +x and v along local +y, so
 * u = 0..1 is world minX..maxX and v = 0..1 is world maxZ..minZ. DataTexture
 * (unlike CanvasTexture) has flipY false, so data row 0 is v = 0. Hence row j
 * walks SOUTH from maxZ. Getting this backwards would be invisible on the pond
 * and the canal, whose ramps are symmetric in z — but not on the seaside,
 * whose only shore is minX and whose ramp is not symmetric in anything.
 */
function buildRampTextures(w, { shelf, foamWidth, foamStrength, colors, withRoughness, waters }) {
  const box = waterBox(w);
  const width = box.maxX - box.minX;
  const depth = box.maxZ - box.minZ;
  const nx = pow2Ceil(width / RAMP_TEXEL_M, RAMP_MIN, RAMP_MAX);
  const nz = pow2Ceil(depth / RAMP_TEXEL_M, RAMP_MIN, RAMP_MAX);
  const shores = w.kind === 'circle' ? ALL_SHORES : (w.shores ?? ALL_SHORES);
  const real = realShoreOf(w, waters, shores);
  const col = new Uint8Array(nx * nz * 4);
  const rough = withRoughness ? new Uint8Array(nx * nz * 4) : null;
  const { deep, shallow, foam } = colors;
  for (let j = 0; j < nz; j++) {
    const z = box.maxZ - ((j + 0.5) / nz) * depth;
    for (let i = 0; i < nx; i++) {
      const x = box.minX + ((i + 0.5) / nx) * width;
      let d = shoreDepth(w, x, z, shores);
      // Near the outline, and the outline partly under another water: the
      // distance to real shore instead (see realShoreOf).
      if (real && d < shelf) d = Math.max(d, distToPieces(real, x, z));
      // t: 0 at the rim, 1 once we are `shelf` metres in. Infinity (no facing
      // shore) falls out of smoothstep as 1, i.e. open deep water.
      const t = smoothstep(0, shelf, d);
      // f: 1 right at the rim, 0 by `foamWidth` in. Negative d (outside the
      // footprint — only reachable in the corners of a circle's bounding box,
      // which the CircleGeometry never samples) clamps to 1 and is harmless.
      const f = (1 - smoothstep(0, foamWidth, d)) * foamStrength;
      const o = (j * nx + i) * 4;
      for (let c = 0; c < 3; c++) {
        col[o + c] = Math.round(mix(mix(shallow[c], deep[c], t), foam[c], f));
      }
      col[o + 3] = 255;
      if (rough) {
        const r = mix(mix(ROUGH_SHORE, ROUGH_DEEP, t), ROUGH_FOAM, f);
        // roughnessMap is sampled from .g, but every channel is filled: a
        // single-channel format would leave .g at 0 and mirror-finish the
        // whole surface, which is a genuinely spectacular way to fail.
        const b = Math.round(clamp01(r) * 255);
        rough[o] = b;
        rough[o + 1] = b;
        rough[o + 2] = b;
        rough[o + 3] = 255;
      }
    }
  }
  return {
    color: dataTexture(col, nx, nz, { srgb: true }),
    roughness: rough ? dataTexture(rough, nx, nz) : null,
    size: [nx, nz],
  };
}

// --- islands -----------------------------------------------------------------

/**
 * A rect footprint with islands, drawn as the rect minus its discs, in the
 * mesh's local frame: (x - cx, -(z - cz)), because the flat rotation sends
 * local +y to world -z.
 *
 * This is still the declaration verbatim, cut where the record says there is
 * no water, with the area's ground plane showing through the cut. It is not a
 * ground-coloured disc laid over an uncut lake: a cover disc would be a
 * second record of the island's shape that could drift from the first, it
 * would fight the water for depth at the rim, and it would hide the real
 * ground, whose grass, race rings and shore foam are what make the island
 * read as somewhere to walk.
 *
 * The uv is rewritten to PlaneGeometry's mapping, ((x + w/2)/w, (y + h/2)/h).
 * ShapeGeometry's own uv is the raw local position, which would stretch the
 * baked ramp and the ripple tiling to nothing; with the plane's mapping both
 * line up exactly as they do on a rect without islands.
 */
function islandGeometry(w, box, segments) {
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const width = box.maxX - box.minX;
  const height = box.maxZ - box.minZ;
  const { outline, holes } = rectMinusDiscs(box, w.islands, segments);
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x - cx, -(z - cz))));
  for (const h of holes) {
    const path = new THREE.Path();
    path.absarc(h.x - cx, -(h.z - cz), h.r, 0, Math.PI * 2, false);
    shape.holes.push(path);
  }
  const geometry = new THREE.ShapeGeometry(shape, segments);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let k = 0; k < pos.count; k++) {
    uv.setXY(k, (pos.getX(k) + width / 2) / width, (pos.getY(k) + height / 2) / height);
  }
  uv.needsUpdate = true;
  return geometry;
}

// --- the factory -------------------------------------------------------------

/**
 * createWater(footprint, options) — the visual for one `waters` record.
 *
 * @param {object} footprint  a `waters` entry: { id, kind: 'circle', x, z, r }
 *                            or { id, kind: 'rect', minX, maxX, minZ, maxZ }.
 *                            `decks` is ignored: a deck is dry structure that
 *                            the area draws itself (the pier, the bridges),
 *                            and it stands ABOVE this surface rather than
 *                            cutting a hole in it.
 * @param {object} [options]
 *   y            {number}  surface height. Defaults to 0.03; pass each area's
 *                          existing value (pond 0.02, canal 0.04, sea 0.05) so
 *                          nothing re-stacks against the paths and quays.
 *   color        {number}  the body's tint — the hex it is painted today.
 *                          Shallow/deep/foam are derived from it (waterRamp).
 *   shores       {string[]} rect only: which edges are actually LAND, from
 *                          'minX' | 'maxX' | 'minZ' | 'maxZ'. Defaults to all
 *                          four, which is right for the Docks canal and wrong
 *                          for the seaside: the sea's footprint runs to x 105
 *                          and z +/-70 while the walkable bounds stop at x 36
 *                          and z -34..48, so three of its four edges are open
 *                          horizon that the camera CAN see. The seaside must
 *                          pass ['minX'].
 *   quality      {string|object} 'high' | 'low', or a resolveQuality() tier
 *                          object (its .name is read). See the tier notes on
 *                          the returned handle.
 *   reducedMotion {boolean} freezes the scroll and the swell. Independent of
 *                          the tier: resolveQuality already sends a
 *                          reduced-motion user to the low tier, but an explicit
 *                          quality:'high' override must still not animate.
 *   segments     {number}  circle rim segments (default 48).
 *   shelf        {number}  metres to full deep colour (default 3).
 *   foam         {number}  width of the shoreline band (default 0.7).
 *   foamStrength {number}  how far the band tints toward foam (default 0.45).
 *                          The dial for an area whose water should stay dour:
 *                          the Docks canal is only 7m across, so its band is a
 *                          large fraction of the surface, and the overcast
 *                          harbour palette may want this nearer 0.35.
 *   colors       {object}  { shallow, deep, foam } as [r, g, b] 0-255 sRGB
 *                          triples, overriding what waterRamp() derives from
 *                          `color`. An escape hatch for a body whose look is
 *                          art-directed rather than derived; nothing needs it
 *                          today, and using it gives up the property that one
 *                          hex per area is the whole integration.
 *   waters       {object[]} the area's whole `waters` list. Optional; with
 *                          it, foam and the shallow shelf follow REAL shore
 *                          only, so where this water runs under another no
 *                          pale stripe crosses the open water (realShoreOf).
 *   style        {string}  'clear' (default), 'bog' (peat-murky ramp, dull
 *                          edge) or 'sea' (the seaside's; same ramp as
 *                          'clear' here). Also read by waterdress.js.
 *   glare        {number}  specular strength, 0..1 (default GLARE). The
 *                          seaside passes GLARE_SEA.
 *   specCap      {number}  ceiling on direct + indirect specular, linear per
 *                          channel (default SPEC_CAP).
 *   envIntensity {number}  the sky probe's multiplier on the high tier
 *                          (default ENV_INTENSITY). The Moor's peaty streams
 *                          pass MOOR_STREAM_LOOK's. The low tier keeps
 *                          ENV_INTENSITY_LOW scaled by the same share.
 *   evening      {object}  { dusk?: { mul, glow }, sunset?: { mul, glow } }:
 *                          this water's own evening tints, preferred by
 *                          eveningWater over WATER_EVENING for the modes it
 *                          names (polish-pondrims: the Gorge's grey stream,
 *                          which the default dusk turned royal blue in a grey
 *                          canyon). Default null: the shared tints.
 *   seed         {number}  ripple phase seed. Defaults to the footprint's own
 *                          id, so the three bodies ripple differently and each
 *                          one ripples identically on every walk and on every
 *                          co-walker's machine.
 *
 * @returns {{ mesh, material, textures, animated, update(dt), dispose() }}
 */
export function createWater(footprint, options = {}) {
  const {
    y = 0.03,
    color = 0x4a90c0,
    shores,
    quality = 'high',
    reducedMotion = false,
    segments = CIRCLE_SEGMENTS,
    shelf = SHELF_M,
    foam = FOAM_M,
    foamStrength = FOAM_STRENGTH,
    colors,
    seed,
    waters,
    glare = GLARE,
    specCap = SPEC_CAP,
    envIntensity = ENV_INTENSITY,
    style = 'clear',
    evening = null,
  } = options;

  const tier = (typeof quality === 'string' ? quality : quality?.name) === 'low' ? 'low' : 'high';
  const w = shores ? { ...footprint, shores } : footprint;

  // GEOMETRY IS THE DECLARATION, VERBATIM. CircleGeometry(r) and
  // PlaneGeometry(maxX-minX, maxZ-minZ) at the footprint's own centre — the
  // exact shapes and positions test/water.test.js's "draws that footprint from
  // the declaration" case looks for. Nothing here may round, inset or pad:
  // a mesh half a metre off its record is the precise failure v19 existed to
  // make impossible.
  const box = waterBox(w);
  const geometry = w.kind === 'circle'
    ? new THREE.CircleGeometry(w.r, segments)
    : w.islands?.length
      ? islandGeometry(w, box, segments)
      : new THREE.PlaneGeometry(box.maxX - box.minX, box.maxZ - box.minZ);

  const ramp = buildRampTextures(w, {
    shelf,
    foamWidth: foam,
    foamStrength,
    colors: { ...waterRamp(color, style), ...colors },
    withRoughness: tier === 'high',
    waters,
  });

  // THE LOW TIER. Adaptive Auto's floor rung (a device whose frames stayed
  // slow), manual Low and every reduced-motion device land here, and it is
  // also where the composer is never allocated — so it is the tier that must
  // not pay for anything it cannot afford. It keeps ONLY the baked ramp: one
  // texture, no normal map, no roughness map, two fewer samplers in the
  // shader, and update() is a no-op,
  // so a low-tier walk does exactly as much per-frame work for its water as
  // the flat plane it replaces did — none. What survives is the half of the
  // effect that costs nothing per frame and does most of the work anyway:
  // a pond that is paler at the rim and darker in the middle already reads as
  // a body of water, where a moving specular on a flat colour does not.
  const ripple = tier === 'high' ? buildRippleTexture(seed ?? seedFromCode(footprint.id ?? 'water')) : null;

  const material = new THREE.MeshPhysicalMaterial({
    map: ramp.color,
    // See GLARE: the whole specular, sun and probe alike, scaled down.
    specularIntensity: glare,
    // metalness stays 0. Water is a dielectric, and metalness > 0 would tint
    // the IBL reflection with the base colour AND cancel the diffuse term —
    // i.e. throw away the depth ramp we just baked. The gloss comes entirely
    // from roughness, exactly as materials.js's comment intends.
    metalness: 0.0,
    // roughness multiplies roughnessMap.g, so it is 1 when the map is present
    // (absolute values are baked in) and a single flat number when it is not.
    roughness: ripple ? 1.0 : ROUGH_LOW,
    roughnessMap: ramp.roughness,
    normalMap: ripple?.texture ?? null,
    envMapIntensity: tier === 'high' ? envIntensity : ENV_INTENSITY_LOW * (envIntensity / ENV_INTENSITY),
  });
  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prevCompile?.call(material, shader, renderer);
    shader.uniforms.uSpecCap = { value: specCap };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uSpecCap;\nvoid main() {')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
  reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(uSpecCap));
  reflectedLight.indirectSpecular = min(reflectedLight.indirectSpecular, vec3(uSpecCap));`,
      );
  };
  material.customProgramCacheKey = () => 'whisker-water';
  if (ripple) {
    material.normalScale = new THREE.Vector2(NORMAL_SCALE, NORMAL_SCALE);
    // One ripple tile every RIPPLE_TILE_M metres, derived from the footprint's
    // own extent so the canal, the pond and the sea all get the same SIZE of
    // ripple rather than the same NUMBER of ripples. Non-integer repeats are
    // fine because the field is exactly periodic (see rippleHeight).
    ripple.texture.repeat.set(
      (box.maxX - box.minX) / RIPPLE_TILE_M,
      (box.maxZ - box.minZ) / RIPPLE_TILE_M,
    );
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((box.minX + box.maxX) / 2, y, (box.minZ + box.maxZ) / 2);
  mesh.name = `water:${footprint.id ?? 'water'}`;

  const animated = !!ripple && !reducedMotion;
  let elapsed = 0;
  let disposed = false;

  function disposeOwned() {
    if (disposed) return;
    disposed = true;
    // Material.dispose() does not cascade to textures, and endWalk's scene
    // traversal only reaches `m.map` — so normalMap and roughnessMap would
    // leak a walk's worth of VRAM every walk if this module did not own them.
    // It owns everything it allocated and nothing it did not: the geometry and
    // the material are per-instance too, so there is no shared-geometry
    // question here at all.
    ramp.color.dispose();
    ramp.roughness?.dispose();
    ripple?.texture.dispose();
  }

  // Safety net: endWalk's traversal calls material.dispose() on every mesh in
  // the scene, and three's Material fires a 'dispose' event when it does. So
  // the textures are freed even if the integration pass never wires the
  // explicit dispose() below — and because disposeOwned is idempotent, wiring
  // BOTH (which is what should happen) costs nothing.
  material.addEventListener('dispose', disposeOwned);

  return {
    mesh,
    material,
    // Read-only description of this water, for the render-side dressing
    // (waterdress.js: wet banks, foam line, stones, lily pads).
    footprint: w,
    y,
    color,
    style,
    waters,
    /** this water's own evening tints ({ dusk?, sunset? }), or null: see eveningWater. */
    evening,
    /** the tier actually used — 'high' or 'low'. */
    tier,
    /** false on the low tier and under reduced motion; update() is then a no-op. */
    animated,
    textures: { color: ramp.color, roughness: ramp.roughness, normal: ripple?.texture ?? null },
    /** ramp map dimensions, for tests and for eyeballing memory. */
    rampSize: ramp.size,

    /**
     * Per-frame hook. `dt` in seconds — the render loop's already-clamped
     * value (main.js clamps to 0.05), so a tab that was backgrounded for a
     * minute resumes without the surface lurching.
     *
     * Offsets are computed FROM the accumulated clock rather than accumulated
     * into, so they cannot drift, and are wrapped into [0, 1) so a long walk
     * never grinds the float precision of a texture offset down to visible
     * stepping.
     */
    update(dt = 0) {
      if (!animated || disposed) return;
      elapsed += dt;
      const tex = ripple.texture;
      tex.offset.set((elapsed * DRIFT_U) % 1, (elapsed * DRIFT_V) % 1);
      const swell = 1 + Math.sin((elapsed / SWELL_PERIOD) * Math.PI * 2) * SWELL_DEPTH;
      material.normalScale.set(NORMAL_SCALE * swell, NORMAL_SCALE * swell);
    },

    dispose() {
      material.removeEventListener('dispose', disposeOwned);
      disposeOwned();
      geometry.dispose();
      material.dispose();
    },
  };
}

// Polish-waterlife — the water in the evening. `mul` multiplies the ramp map
// through material.color (dark and blue at dusk); `glow` is a faint emissive
// tint. Sunset stays blue with a faint warm cast: a stronger warm tint (the
// old 1.1 / 0.88 / 0.72 and 0x5a2a0c glow) read as a muddy brown pond in live
// shots. Materials are built fresh per createWater
// call and areas are rebuilt every walk, so setting them never leaks into the
// next walk.
export const WATER_EVENING = Object.freeze({
  sunset: Object.freeze({ mul: Object.freeze([1.0, 0.94, 0.9]), glow: 0x24120a }),
  dusk: Object.freeze({ mul: Object.freeze([0.6, 0.62, 0.78]), glow: 0x000000 }),
});

/**
 * eveningWater(handles, mode) — tint each water handle's material for
 * mode null | 'sunset' | 'dusk'. null leaves the day's look untouched. A
 * handle made with its own `evening` tint for that mode takes it instead of
 * WATER_EVENING's; every other handle gets exactly WATER_EVENING[mode].
 */
export function eveningWater(handles, mode) {
  if (!WATER_EVENING[mode]) return;
  for (const h of handles ?? []) {
    const e = h.evening?.[mode] ?? WATER_EVENING[mode];
    h.material.color.setRGB(e.mul[0], e.mul[1], e.mul[2]);
    h.material.emissive.setHex(e.glow);
  }
}

/**
 * waterRig(handles) — bundles an area's water handles into the one
 * { update(dt), dispose() } shape the walk session already uses for fx,
 * skyLife and the rest, so the render loop and endWalk each gain exactly one
 * line rather than a loop. Safe on an empty list, which is every area without
 * water (the neighborhood, the den).
 */
export function waterRig(handles = []) {
  const list = [...handles];
  return {
    bodies: list,
    update(dt) {
      for (const h of list) h.update(dt);
    },
    dispose() {
      for (const h of list) h.dispose();
      list.length = 0;
    },
  };
}

// =============================================================================
// WHAT THE INTEGRATION PASS HAS TO DO. Nothing outside this file was touched
// building it, so this is the whole list.
//
// 1. EACH AREA, in place of its current water Mesh + litMaterial pair:
//
//      const pond = createWater(POND, { y: 0.02, color: 0x7ab0d8, ...water });
//      scene.add(pond.mesh);
//      ...and return `waterFx: [pond]` alongside `waters: [POND]`.
//
//    Per area: park { y: 0.02, color: 0x7ab0d8 }; docks { y: 0.04,
//    color: 0x24445e } (consider foamStrength ~0.35 — see FOAM_STRENGTH);
//    seaside { y: 0.05, color: 0x4a90c0, shores: ['minX'] }. The `shores` on
//    the seaside is not optional: without it the sea paints a surf line along
//    its z +/-70 and x 105 edges, 20-70m outside the walkable bounds and in
//    plain view.
//
//    ADD THE MESH TO THE SCENE DIRECTLY, not inside a Group.
//    test/water.test.js's "draws that footprint from the declaration" case
//    filters `scene.children` for meshes; a nested water mesh is invisible to
//    it and the case fails with "no mesh matches the declared footprint".
//    test/waterfx.test.js's last block runs that same matcher against what
//    this module produces for all three real footprints, so the geometry side
//    is already pinned — only the parenting is on the integration.
//
// 2. THREADING THE TIER. `build(scene)` has no options argument today except
//    the den's. The cheapest honest change is to widen it the same way:
//
//      AREAS[areaId].build(scene, { water: { quality: tier, reducedMotion } })
//
//    with `tier` the resolveQuality() result (its .name is read) and
//    `reducedMotion` settings.get('reducedMotion') — the same value walk.js
//    already snapshots once per walk for fx and skyLife. Both default safely,
//    so an area that has not been threaded yet renders the high-tier surface
//    rather than crashing; a mobile walk would just pay for it.
//
// 3. THE PER-FRAME HOOK. In walk.js's session object:
//
//      water: waterRig(areaData.waterFx),
//
//    and in main.js's render loop, INSIDE the `if (player.engaged)` block,
//    beside `session.skyLife.update(dt)` (main.js ~line 484, dt already
//    clamped to 0.05):
//
//      session.water.update(dt);
//
//    Real dt, never `wdt`. The slow-mo factor exists to slow CRITTERS for a
//    pounce beat; slowing the water with them would read as the whole world
//    lurching. It belongs with skyLife and weather, which stay on real dt for
//    the same reason.
//
// 4. ENDWALK. Add `session.water.dispose();` beside `session.skyLife.dispose()`.
//    This is belt-and-braces rather than load-bearing: the material fires a
//    'dispose' event, and endWalk's existing scene traversal calls
//    material.dispose() on every mesh, so the normal and roughness maps —
//    which that traversal's `m.map` check does not reach — are freed either
//    way. Wiring it explicitly costs nothing (disposal is idempotent) and
//    means the water does not depend on a subtlety of the traversal.
//
// 5. NOTHING ELSE. No new collider, no change to `waters`, no change to any
//    footprint number, no change to materials.js. Note only that the surface
//    wave's `water` SURFACE_PRESET overlaps this module by name: after the
//    swap the preset's job is the water with no footprint record (the park
//    fountain's disc, puddles) and createWater's is the three that have one.
//    See the ROUGH_DEEP note. Do not apply both to the same mesh.
// =============================================================================
