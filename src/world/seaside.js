import * as THREE from 'three';
import * as b from './builder.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { withLocalUuids } from './localuuids.js';
import { litMaterial, repeatFor, surfaceProps } from '../render/materials.js';
import { createWater, WATER_TUNING } from '../render/water.js';
import { SURE_CLAWS_ID } from '../climbing.js';
import { tintGround } from './dressing.js';
import { propsFor } from '../propsets.js';
import { sandTint, dressBeach, KERB_COL } from './beachdress.js';

// The edge dressing's dusk tint (render/dusk.js duskLawnColor): greyer and
// darker than the default { desat 0.25, dark 0.72 }, and a touch cooler.
export const HUT_DUSK_TINT = Object.freeze({ desat: 0.45, dark: 0.46, cool: Object.freeze([0.92, 0.98, 1.1]) });

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

// -----------------------------------------------------------------------------
// STREAM 4 ROUND THREE — the beach (2026-10-31).
//
// From the cat's camera the Seaside read as a white plain with a ruler-straight
// edge where it met the sea and a flat tan wall at the back. Four changes, all
// in this file and grass.js, none adding a shadow-pass draw:
//
//   * BEACH 0xe0d0a0 -> 0xdcc28e. Under ACES and this area's bright bounce the
//     old hex rendered within a few values of white, so the beach read as snow.
//     The new one is the same sand a step warmer and a touch deeper. This is
//     the AUTHORED colour changing, not texture compensation, so the "sand is
//     not colour-compensated" rule further down still holds.
//   * A WET-SAND BAND (+1 draw) from under the boardwalk out to just past the
//     waterline: darker, a little smoother, with a wavy wet edge, so the sea
//     meets damp sand instead of dry.
//   * CLIFF STRATA (0 draws): the bluff and the overlook take vertex-coloured
//     rock layers and an uneven top edge. Their faces only ever move INTO the
//     rock (polish "edges" Task 3 cut gullies), so the cliff colliders still
//     line up.
//   * DUNE GRASS on the back beach — render/grass.js's 'dune' style (+1 draw).
// -----------------------------------------------------------------------------
export const BEACH = 0xdcc28e;

// Wet sand at the waterline: how far it reaches, and its darkest multiplier.
// The band starts at x 21.8, under the boardwalk (x 18..22), so its dry edge
// is hidden, and runs 0.4m under the sea (x 25) so there is no gap at the
// waterline.
const WET_FROM = 21.8;
const WET_TO = 25.4;
// Strong on purpose: the beach is lit so far up ACES's shoulder that a 0.7
// multiplier measured 207 against the dry sand's 221 on screen (invisible) and
// 0.5 only 191. At ~0.35 the damp sand lands near 165, which reads as wet.
// Polish-water Task 4 takes it a step darker again (0.37/0.34/0.31 before):
// with the white foam strip lying along the waterline the soaked sand behind
// it needs the contrast, or foam and sand blur into one pale stripe.
export const WET_TINT = [0.31, 0.28, 0.25];

// A deterministic 0..1 value for an integer, for the strata tones.
function hash1(n) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// The wet band's vertex colour at (x, z): 1 (dry, the beach itself) at
// WET_FROM, WET_TINT at the waterline, with a wavy edge where the last wave
// reached.
export function wetness(x, z) {
  // The wet edge wanders +-0.5m along the beach; the ramp itself runs 1.7m,
  // and reaches full wet ~0.5m short of the foam strip's lace edge
  // (waterdress.js, x ~24.1..25), so the soaked sand shows behind the foam
  // instead of only under it (polish-water Task 4; it ran 22.4..24.4 before).
  const reach = 0.32 * Math.sin(z * 0.33 + 1.3) + 0.16 * Math.sin(z * 0.91);
  const t = Math.min(1, Math.max(0, (x - 22.2 + reach) / 1.7));
  return t * t * (3 - 2 * t);
}

// Sky top for the bay: a deeper blue than the first pass so the pale horizon
// (0xe8e0d0, the fog colour) reads as haze rather than as the sky itself.
export const SKY_TOP = 0x88bce6;

function wetSandBand() {
  const w = WET_TO - WET_FROM;
  const len = 140;
  const geo = new THREE.PlaneGeometry(w, len, 8, 140);
  geo.rotateX(-Math.PI / 2); // local x -> world x, local y -> world -z
  const pos = geo.attributes.position;
  const cx = (WET_FROM + WET_TO) / 2;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = wetness(pos.getX(i) + cx, pos.getZ(i));
    // The dry sand beside it carries sandTint, so the band wears the same
    // authored variation or its edge would show as a seam.
    const t = sandTint(pos.getX(i) + cx, pos.getZ(i));
    for (let c = 0; c < 3; c++) col[i * 3 + c] = (1 + (WET_TINT[c] - 1) * k) * t[c];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // Roughness 0.8, not wet stone's 0.55: damp sand is darker, not shiny, and
  // the camera faces this band with the sun behind it.
  const m = new THREE.Mesh(geo, litMaterial(BEACH, {
    surface: 'sand', repeat: repeatFor('sand', w, len), vertexColors: true, roughness: 0.8,
  }));
  m.name = 'wet-sand';
  // Tagged like the dry ground so rain and dusk darken it with the sand next
  // to it (walk.js collects scene children with userData.ground).
  m.userData.ground = true;
  // Under the contact-shadow decals (0.015) with room to spare, above the
  // ground (0) and below the boardwalk (0.03) and the sea (0.05).
  m.position.set(cx, 0.008, 0);
  m.receiveShadow = true;
  return m;
}

// Rock for a sandstone box (the cliff and the overlook): layered bands, a
// grass cap, gullies and a broken top edge (polish "edges" Task 3).
//
//   * BANDS about a metre thick that dip gently along the face, in four tones
//     (cream, ochre, rust, pale) picked per band by hash1, never the same tone
//     twice running, as multipliers on cliffMat's white. The damp foot stays.
//   * A GRASS CAP: BoxGeometry gives the top face its own vertices, so they
//     turn green as a block; the back face's top edge keeps its rock colour,
//     and the seaward and end faces carry a ragged green lip (see below).
//   * RELIEF: every vertex lying on the seaward (+z) face or either end face is
//     pushed INTO the rock by 0..0.9m — vertical gullies about every 3.5m plus
//     a small per-column hash. The push is a function of the vertex's original
//     position only, so the top, bottom and side faces' copies of an edge
//     vertex all move together and no seam opens. It depends on x (seaward
//     face) or z (end faces) and not on y: each column stays a column, which
//     is what the cliff's own shape test reads its top edge from. Never
//     outward, so the colliders on z -37 still stand on the face.
//   * THE TOP JAG is +-0.8m of sine, eased into the 7..8.5m the bluff has
//     always stood at, and spread over the top 1.5m of the face so the finer
//     rows below the edge never fold over it. Still y only.
//
// Fix round 1, from the live look: the four tones are SCALED so their mean is
// the old cliff's, 0xb09878 x 0.9 (on white they lifted the bluff into the
// haze); vertices are darkened by how deep they are pushed (baked
// occlusion, so a gully reads as a shadowed cleft at walk distance); and the
// grass spills over the top edge of the seaward and end faces, a ragged lip
// about 0.2..0.45m deep, so the cap shows from the beach below.
const meanOf = (c) => (c.r + c.g + c.b) / 3;
const ROCK_TONES = (() => {
  const tones = [0xe2cfa8, 0xc9a46c, 0xb07c58, 0xd8c4a0].map((h) => new THREE.Color(h));
  // 0.9: the old cliff was 0xb09878 times a band multiplier that averaged 0.9.
  const k = 0.9 * meanOf(new THREE.Color(0xb09878)) / (tones.reduce((a, c) => a + meanOf(c), 0) / tones.length);
  return tones.map((c) => c.multiplyScalar(k));
})();
const GULLY_MAX = 0.9;
const CAP_TONES = [0x8a9a5a, 0x7d8f50].map((h) => new THREE.Color(h));
// How far a face point sits inside the rock, 0..0.9m, by its position along
// the face. The ridges between gullies come out at 0, so the outermost ribs
// still stand on the face's old plane (and on the collider line).
function gully(u, salt) {
  const g = Math.abs(Math.sin(u * 0.9 + salt)) ** 3;
  const n = hash1(Math.round(u * 4) + salt * 31);
  return Math.min(GULLY_MAX, Math.max(0, 0.85 * g + 0.25 * n - 0.2));
}
// A band's tone index: hashed, then nudged off the band below's FINAL tone,
// so two neighbours never match. Carried up from a fixed floor band (a face's
// lowest band is -1: h >= 0 and the wobble is under 0.4), so it is
// deterministic and every vertex of a band agrees.
const BAND_FLOOR = -2;
function bandTone(band, salt) {
  const n = ROCK_TONES.length;
  const pick = (k) => Math.floor(hash1(k + salt * 13) * n) % n;
  let prev = -1;
  for (let b = Math.min(band, BAND_FLOOR); b <= band; b++) {
    const t = pick(b);
    prev = t === prev ? (t + 1) % n : t;
  }
  return prev;
}
function strata(geo, worldX, salt) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const top = max.y;
  const bottom = min.y;
  const eps = 1e-4;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const x = lx + worldX;
    let y = pos.getY(i);
    const raw = 0.8 * Math.sin(x * 0.41 + salt) + 0.3 * Math.sin(x * 1.13 + lz * 0.6 + salt * 2);
    const jag = -0.25 + 0.74 * Math.tanh(raw / 0.74); // inside -0.99..+0.49
    if (y > top - 1.5 - eps) {
      y += jag * Math.min(1, (y - (top - 1.5)) / 1.5);
      pos.setY(i, y);
    }
    // Pushes, by original position (so coincident copies agree); the deeper
    // of the two at a corner sets the occlusion.
    let push = 0;
    let lipKey = null;
    if (lz > max.z - eps) {
      const p = gully(x, salt);
      pos.setZ(i, lz - p);
      push = p;
      lipKey = Math.round(x * 3);
    }
    if (lx > max.x - eps || lx < min.x + eps) {
      const p = lx > 0 ? gully(lz - 50, salt + 0.7) : gully(lz + 50, salt + 1.3);
      pos.setX(i, lx > 0 ? lx - p : lx + p);
      push = Math.max(push, p);
      lipKey = lipKey ?? 1000 + Math.round(lz * 3) * (lx > 0 ? 1 : -1);
    }
    const capTone = () => CAP_TONES[Math.floor(hash1(Math.round(x * 3) * 7 + Math.round(lz * 3) + salt) * 2) % 2];
    const side = nrm.getY(i) <= 0.9;
    // The grass lip: a seaward or end face vertex within a ragged 0.2..0.45m
    // of its column's (jagged) top.
    const lip = side && lipKey !== null && Math.abs(nrm.getY(i)) < 0.5
      && y > top + jag - (0.2 + 0.25 * hash1(lipKey + salt * 17)) - eps;
    let c;
    let v = 1;
    if (!side || lip) {
      c = capTone();
    } else {
      const h = y - bottom;
      const band = Math.floor(h / 1.05 + 0.35 * Math.sin(x * 0.17 + salt));
      c = ROCK_TONES[bandTone(band, salt)];
      if (h < 0.9) v = 0.86 + 0.14 * (h / 0.9); // a darker, damp foot
      v *= 1 - 0.35 * (push / GULLY_MAX); // the cleft's shadow
    }
    col[i * 3] = c.r * v;
    col[i * 3 + 1] = c.g * v;
    col[i * 3 + 2] = c.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}
const cliffMat = (w, h) =>
  litMaterial(0xffffff, { surface: 'sand', repeat: repeatFor('sand', w, h), vertexColors: true, flatShading: true });

// A fishing boat's hull, stripe, wheelhouse and sail, in the boat's own frame
// (bow toward -z, 4.5m long, 2m beam, keel at y 0), each part non-indexed
// with position, normal, uv and colour so mergeGeometries takes them all.
// Must be called inside withLocalUuids: every part is a throwaway geometry.
const BOAT_MAST_Z = -0.7;
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let v = 0; v < col.length; v += 3) { col[v] = c.r; col[v + 1] = c.g; col[v + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// A box whose bow-end (-z) vertices are pulled in to bowW wide: three
// segments along its length, so only the front third tapers to the stem.
function boatBox(w, h, d, bowW, y0) {
  const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 3);
  const pos = geo.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    if (pos.getZ(v) < -d / 2 + 1e-6) pos.setX(v, Math.sign(pos.getX(v)) * bowW / 2);
  }
  geo.translate(0, y0 + h / 2, 0);
  // Non-indexed BEFORE the normals, so each face keeps its own flat normal
  // instead of smearing across the bow-taper seam.
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}
// One flat triangle wound both ways, so it shows from either side.
function sailTri(a, b, c, hex) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
  geo.computeVertexNormals();
  return paint(geo, hex);
}
function boatParts(color, striped) {
  const parts = [
    paint(boatBox(2, 0.8, 4.5, 0.2, 0), color),
    // The gunwale stripe: 2cm proud of the hull sides, its top 1cm under the
    // deck so the two never fight for the same pixels.
    paint(boatBox(2.04, 0.12, 4.52, 0.24, 0.67), 0xf2efe6),
  ];
  const cabin = new THREE.BoxGeometry(1.1, 0.9, 1.2);
  cabin.translate(0, 0.8 + 0.45, 1.6);
  parts.push(paint(cabin, 0xf2ead8));
  const roof = new THREE.BoxGeometry(1.3, 0.1, 1.4);
  roof.translate(0, 1.75, 1.6);
  parts.push(paint(roof, 0x5a4a3e));
  // The sail: from the mast at y 0.9 to the masthead at y 3.4, its foot 1.6m
  // aft along +z, which ends just short of the wheelhouse at z 1.0.
  const zm = BOAT_MAST_Z;
  const tack = [0.07, 0.9, zm];
  const head = [0.07, 3.4, zm];
  const clew = [0.07, 0.9, zm + 1.6];
  const sail = 0xf4efe2;
  if (striped) {
    const mid = [0.07, 2.15, zm];
    parts.push(sailTri(tack, clew, mid, color), sailTri(mid, clew, head, sail));
  } else {
    parts.push(sailTri(tack, clew, head, sail));
  }
  return parts;
}

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
  id: 'sea', kind: 'rect', minX: 25, maxX: 105, minZ: -70, maxZ: 70, shallow: 1.5, decks: [PIER],
};
// The sea as the horizon band sees it: the slab carried on north and south
// past the band's outer rim (126), so no dune stands across either end. Data
// only (see the horizon band below).
export const SEA_VIEW = Object.freeze({ id: 'sea-view', kind: 'rect', minX: 25, maxX: 105, minZ: -140, maxZ: 140 });

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
// BEACH (0xdcc28e since round three, above) is still the hex a human picked.
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
// Where a walk places the cat. Exported so rivalclans' tests can prove a rival disc never covers it.
export const SPAWN = Object.freeze({ x: 18, z: 42 });

// Where build() places the beach's scenery, shared with beachdress.js so its
// keep-outs and post clearances read the same numbers (frozen [x, z] pairs).
const pairs = (list) => Object.freeze(list.map((p) => Object.freeze(p)));
export const SEASIDE_ROCKS = pairs([[-8, 10], [-20, -2], [4, 24], [-28, 18]]);
export const SEASIDE_ROCKS_EXTRA = pairs([[-32, 30], [12, -10], [-32, -10]]);
export const SEASIDE_BUSHES = pairs([[-14, 30], [-2, -14], [-24, -20], [8, 2]]);
export const SEASIDE_BUSHES_EXTRA = pairs([[-30, 5], [12, 20]]);
export const BILLBOARD = Object.freeze({ x: 15, z: 34, yaw: Math.PI / 2 });
export const BENCHES = pairs([[18, 14], [18, -18]]);
export const LAMPS = pairs([[20, 30], [20, -30]]);
export const SEASIDE_BOXES = pairs([[19, 24], [-14, 4], [23, -6]]);

// The backing dunes' band and their edge (see the horizon band in build()).
export const SEASIDE_HORIZON = Object.freeze({
  kind: 'dunes', inner: 66, outer: 126, height: 7, wavelength: 26,
  color: 0xc9ba90, salt: 59, avoid: Object.freeze([SEA_VIEW]), closeWater: false,
  headland: Object.freeze({ x: -92, z: -84, r: 46, h: 0.9 }),
  edge: Object.freeze({
    half: 70, style: 'dune', avoid: Object.freeze([SEA_VIEW]),
    props: Object.freeze([
      { x: 9.2, z: 74.1, yaw: Math.PI + 0.04, kind: 'hut' },
      { x: 12.0, z: 74.3, yaw: Math.PI - 0.03, kind: 'hut' },
      { x: 14.8, z: 74.0, yaw: Math.PI + 0.02, kind: 'hut' },
      { x: 20.6, z: 73.2, yaw: Math.PI - 0.25, kind: 'chair' },
      { x: -61.5, z: 73.8, yaw: 2.75, kind: 'hut' },
      { x: -58.6, z: 74.5, yaw: 2.88, kind: 'hut' },
    ].map((p) => Object.freeze(p))),
  }),
});

export function build(scene, { water = {}, wind } = {}) {
  b.applySky(scene, SKY_TOP, 0xe8e0d0);
  // Dry beach sand at roughness 0.92 — a step drier than the game's default,
  // and the tile is a fine speckle whose repeat comes from the plane's own
  // 140m (175 tiles of 0.8m). See the note above on why the colour is not
  // lifted the way a lawn's is.
  // sandTint is an authored colour variation (warmer, patchier, a paler back
  // beach), not a correction for the sand texture.
  const g = b.ground(140, BEACH, { surface: 'sand' });
  g.updateMatrix();
  tintGround(g, sandTint);
  scene.add(g);
  scene.add(wetSandBand());

  // The horizon band (VISUAL-PASS.md Wave 4.3) — dunes and a headland. See
  // builder.horizonBand's own block for the geometry; it carries no collider,
  // no perch, no POI and no record, and sits entirely beyond `bounds`.
  //
  // 66/126 rather than the other areas' 56/116, because this ground plane is
  // 140m rather than 120m: the inner rim still lands four metres inside the
  // plane's own edge (70) so the seam is buried under it.
  //
  // `avoid` IS THE WHOLE DIFFERENCE HERE (SEA, carried on past its ends since
  // polish-water Task 4 — see SEA_VIEW below), and it is the same rectangle the
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
  // hexes), the beach under it is BEACH (0xdcc28e), and lifting pale sand toward pale
  // haze produced dunes that measured correct and were invisible — sand on
  // sand on sky, three values inside a few percent of each other. So they are
  // DARKENED instead, to a duller khaki: real backing dunes are packed, damp
  // at depth and held together with marram grass, and they are visibly duller
  // than the dry beach in front of them. The silhouette needs a value step and
  // this is the physically honest direction to find one in.
  //
  // NO DUNES ACROSS THE SEA'S ENDS (polish-water Task 4). With `avoid: [SEA]`
  // the dunes rose straight off the slab's north and south edges (z +-70),
  // so the beach's straight waterline ran into a straight crosswise edge and
  // stopped in a corner far down the beach. They avoid SEA_VIEW instead: the
  // same water carried on north and south past the fog, so the dunes slope
  // down to the beach's own line (x 25) on both sides and the shore runs on
  // into the haze. The open water past the slab is waterdress.js's far-sea
  // apron, render-side; SEA_VIEW is a plain record, no object, and not a
  // `waters` entry (nothing swims in it).
  //
  // THE DUNES' EDGE (polish-places). Turning round at the spawn showed the
  // boardwalk stopping in bare sand under a featureless pale dune. The band
  // now carries the 'dune' edge (builder.js EDGE_STYLES): marram tufts along
  // the ground's edge with weathered sand-fence posts and rope, a row of
  // three striped beach huts and a lifeguard chair just past the back edge
  // behind the spawn (the chair nearest the sea), and a pair of huts toward
  // the far south-west corner. Every one stands 22m or more past the bounds,
  // so the 2.6m huts never come between the camera and the cat.
  const band = b.horizonBand(SEASIDE_HORIZON);
  scene.add(band);
  // polish-quayside: the huts, the lifeguard chair and the marram past the
  // edge dim and cool at dusk like the cliff, not just a little like the sand.
  // Their pastels and whites are the lightest things on the beach, and under
  // the area's soft dusk tint they stayed bright against a night sky.
  const edge = band.getObjectByName('horizonEdge');
  if (edge) edge.userData.duskLawnTint = HUT_DUSK_TINT;

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
    // waterdress.js reads it: a wavy foam strip on the sand instead of a
    // bank, and a far-sea apron so the slab's corners never show.
    style: 'sea',
    glare: WATER_TUNING.GLARE_SEA,
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
  // The boardwalk's +z end (polish-places): it used to stop dead in the sand
  // behind the spawn. A low step board across the end and a short post at
  // each corner finish it. One merged mesh, its geometry, material and mesh
  // all made under their own uuid stream (the area's Math.random draw count
  // is pinned), noCast, and NO collider: the cat walks over the board and
  // past the posts as it always walked off the end.
  scene.add(withLocalUuids('seaside-boardwalk-end', () => {
    const parts = [];
    const piece = (w, h, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      parts.push(g);
    };
    piece(4.3, 0.12, 0.4, 20, 0.04, 45.2);
    for (const x of [17.85, 22.15]) piece(0.18, 0.6, 0.18, x, 0.26, 45.3);
    // Weathered timber, the same as the beach kerbs (polish-beach): 0x8a6a48 read orange at sunset.
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), surfNoMap(KERB_COL, 'wood'));
    for (const g of parts) g.dispose();
    mesh.name = 'boardwalkEnd';
    mesh.userData.noCast = true;
    return mesh;
  }));
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

  // fishing boats bobbing offshore — each a pointed hull with a white stripe
  // at the gunwale, a wheelhouse at the stern and a sail on the mast
  // (polish "edges" Task 3), all ONE geometry: the parts are made under
  // withLocalUuids (so their throwaway uuids leave Math.random alone) and
  // merged outside it, which makes exactly the one geometry uuid the plain
  // box hull used to. Group, hull, mast: the same objects as before.
  for (const [i, [x, z, color]] of [[40, 8, 0xd06048], [50, -22, 0x4a6ea5], [44, 28, 0x6a9a4a]].entries()) {
    const boat = new THREE.Group();
    boat.userData.boat = true;
    // 'paintedMetal' — the same call the Docks' barge hull takes, and for the
    // same two reasons. These are working boats in red, blue and green: what
    // you see is the paint, and paintedMetal is the preset that keeps
    // metalness at 0 so a red boat stays red. It also carries no map, which
    // matters here — a box maps 0..1 per face with v running up +y, so the
    // plank tile's grain would run VERTICALLY up an 0.8m hull side and stave
    // it like a barrel rather than planking it like a boat. The paint now
    // rides in the vertex colours, so the material itself is white.
    const hull = new THREE.Mesh(
      mergeGeometries(withLocalUuids('seaside-boat-' + i, () => boatParts(color, i === 0))),
      litMaterial(0xffffff, { surface: 'paintedMetal', vertexColors: true }));
    boat.add(hull);
    // A 6-sided 12cm spar: cylinder rule and thin-member rule at once, so it
    // takes timber's roughness with the tile left off. It stands a little
    // forward of amidships so the sail's foot clears the wheelhouse.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 6),
      surfNoMap(0x7a5230, 'wood'));
    mast.position.set(0, 2, BOAT_MAST_Z);
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
  // A 1m x 0.33m grid on the faces (Task 3): fine enough for gullies every
  // ~3.5m and for metre-thick bands that change tone in a third of a metre
  // rather than smearing across a whole metre-tall row.
  const cliff = new THREE.Mesh(strata(new THREE.BoxGeometry(60, 8, 18, 60, 24, 6), -10, 1.7),
    cliffMat(60, 8));
  cliff.position.set(-10, 4, -46);
  cliff.userData.duskTint = true; // dims and cools at dusk like the ground (render/dusk.js tintDuskLawn)
  scene.add(cliff);
  for (let i = 0; i < 12; i++) addC(-38 + i * 5, -37, 2.5); // cliff face blocks walking through
  // Square in plan, so its four faces tile identically — no end-face caveat.
  const overlook = new THREE.Mesh(strata(new THREE.BoxGeometry(10, 8, 10, 10, 24, 10), -40, 4.2),
    cliffMat(10, 8));
  overlook.position.set(-40, 4, -40);
  overlook.userData.duskTint = true;
  scene.add(overlook);
  addC(-40, -40, 6);

  // beach props. Two of these four boulders have carried perches since v11
  // ((-8,10) and the "overlook boulder" at (-28,18)); the rest of the sand is
  // scenery, and CF-9b opens it — see clawPerches below.
  for (const [x, z] of SEASIDE_ROCKS) scene.add(b.rock(x, z));

  // a dune ledge beside the overlook boulder — second step of a short climb
  // chain (boulder y 0.72 -> ledge y 1.9), 1.41 horizontally and 1.18
  // vertically away, both inside the reach/climb budget.
  // 'sand' for the same reason the cliff takes it — it is a dune, packed sand,
  // and giving the step the beach's own grain is what stops a load-bearing
  // perch reading as an untextured block dropped on a textured floor. Its
  // colour and every number here are the shipped ones.
  scene.add(b.platform(-29, 19, 1.9, 0, 1.8, 0xd8c088, { surface: 'sand' }));
  addC(-29, 19, 1.0);
  for (const [x, z] of BENCHES) scene.add(b.bench(x, z, Math.PI / 2));
  for (const [x, z] of LAMPS) scene.add(b.lampPost(x, z));

  scene.add(b.billboard(BILLBOARD.x, BILLBOARD.z, BILLBOARD.yaw));
  addC(BILLBOARD.x, BILLBOARD.z, 2.3);
  // beach plants — marram grass clumps and sea holly (builder.bush's 'beach'
  // style picks the kind per spot), in place of the garden shrubs that used
  // to sit on the sand. They are the area's only foliage, and therefore the
  // whole of what registers with the wind rig. builder.bush returns a Group
  // hinged at ground contact when `wind` is passed, so each plant stands in
  // exactly the same place either way and no hide-spot or scent record moves.
  // The mouse hides (propsets.js) are bush spots: critters flee there and
  // vanish, so those must be the tall marram. (-24,-20) is sea holly so the
  // six spots hold at least two of each.
  const hideAt = new Set(propsFor('seaside').hides.map((h) => `${h.x},${h.z}`));
  const beachKind = (x, z) => (hideAt.has(`${x},${z}`) ? 'marram' : (x === -24 && z === -20 ? 'holly' : undefined));
  for (const [x, z] of SEASIDE_BUSHES) scene.add(b.bush(x, z, { wind, style: 'beach', kind: beachKind(x, z) }));

  // a few more rocks and beach plants scattered on the sand
  for (const [x, z] of SEASIDE_ROCKS_EXTRA) scene.add(b.rock(x, z));
  for (const [x, z] of SEASIDE_BUSHES_EXTRA) scene.add(b.bush(x, z, { wind, style: 'beach', kind: beachKind(x, z) }));

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
  const boxes = SEASIDE_BOXES;
  for (const b2 of boxes) scene.add(b.cardboardBox(b2[0], b2[1]));

  const area = {
    name: 'Seaside',
    colliders,
    bounds: { minX: -48, maxX: 36, minZ: -34, maxZ: 48 },
    spawn: { x: SPAWN.x, z: SPAWN.z },
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
    groundBounce: BEACH,
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
  // The painted beach (beachdress.js): looks only, built from the record
  // it is about to return so its keep-outs are the real ones.
  dressBeach(scene, area, { ground: g });
  return area;
}
