import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// THE RUFF (body refinement, R9): a fluffy cat's ruff is a small bib tucked
// under the chin and close to the chest, a little fluff behind each jaw that
// blends the coat into the bib, and a short fringe of five soft points along
// the bib's lower edge, so it reads as fur. It replaces the old torus round the
// neck, which on a dark coat read as a life preserver. The owner approved this
// look after shrinking it twice ("sausages", then "a gigantic chest"): nothing
// goes round the back of the neck, and it stays small.
//
// Shapes and sizes are the sketch's (docs/superpowers/specs/2026-11-01-body-
// refinement-sketch.html, newRuff, R9's numbers). All in the cat's frame;
// undersideGeometry carries it into the torso's.
//
// The anchor departs from R9 (controller's ruling (2026-11-02), shown to the owner in the before/after sheet; Task 6 fix round 1). R9 put AT
// where the torus sat, z -0.30, on the belief that the sketch's chest differs
// from the game's; it does not (both (0, 0.49, -0.33), r 0.15·(1.05, 1.1, 0.9)),
// and at -0.30 every ruff vertex is inside the chest or the skull: no ruff
// shows at all. AT z -0.37 (the sketch's -0.36, 1 cm on) puts the bib under
// the chin, close to the chest; the jaw fluff peeks out below the cheeks at
// R9's y -0.02. The fringe hangs straight down (TILT 0, no backward rise for
// the outer points, where the sketch tipped them 0.25 and 0.03·|a| back):
// tipped back, the points' tips sink into the chest and their open bases
// stand out of the bib; upright, each base stays buried in the bib.
//
// Task 10 fix (the live check). The bib is flatter (z scale 0.55 -> 0.5): its
// front stands about 5 mm proud of the chest (was 9), so when requestPet or
// perch lifts the head off it, it reads as a bib on the chest, not a round
// white ball. The five cones read as small white teeth; each point is now a
// blunt rounded one (softPoint), a little wider and shorter, its tip 7-11 mm
// below the bib's edge (RISE 0.03 -> 0.02 so the outer ones show as much),
// its base buried in the flatter bib (Z -0.08 -> -0.072).
//
// Fix round 2: Z -0.07 -> -0.068. On a simple build the bib's 10x6 facets sag
// inside its ellipsoid, and 6 of the 25 base vertices stood up to 0.41 mm out
// of every faceted solid; 2 mm nearer the bib's middle buries all of them, in
// both builds; more than that hides the fringe in the chest (the test ray-casts
// the merged underside's triangles).
export const RUFF = Object.freeze({
  AT: Object.freeze([0, 0.58, -0.37]),
  // a sphere of radius R, scaled, centred at AT + OFF
  BIB: Object.freeze({ R: 0.10, SCALE: Object.freeze([1.05, 1.05, 0.5]), OFF: Object.freeze([0, -0.07, -0.05]) }),
  // one each side at AT + (±X, Y, Z), rolled ±ROLL about z
  JAW: Object.freeze({ R: 0.055, SCALE: Object.freeze([0.6, 1.0, 0.8]), X: 0.10, Y: -0.02, Z: -0.03, ROLL: 0.3 }),
  // N cones, tip down, spread over SPREAD radians along the bib's lower edge
  // KNEE: each point's one middle ring, this far from its base along its
  // length and this fraction of R wide, so the tip is a short blunt round
  // rather than a cone's spike (Task 10 fix: the cones read as teeth)
  FRINGE: Object.freeze({ N: 5, R: 0.03, LEN: 0.05, KNEE: Object.freeze([0.5, 0.85]), ZSCALE: 0.6, SPREAD: 1.3, EDGE: 0.075, Y: -0.16, Z: -0.068, RISE: 0.02, TILT: 0 }),
  // the jaw fluff's colour: the base coat this far toward the belly, then kept
  // within JAW_CAP (linear RGB distance) of the belly (jawFluffColour)
  JAW_MIX: 0.35,
  JAW_CAP: 0.25,
});

// Segments: [bib w, h], [jaw w, h], fringe sides. A simple build has fewer
// segments, never a different shape. A fringe point is 3 triangles a side (two
// rows, the tip's a fan). Full 192 + 2·36 + 5·18 = 354 triangles (≤ 360);
// simple 100 + 2·24 + 5·12 = 208 (≤ 210). The jaw fluff took fewer segments
// (was 8×5 / 6×4) to pay for the rounded points; it is small. The points are open at the base: it is buried in the bib.
const SEG = { full: { bib: [12, 9], jaw: [6, 4], fringe: 6 }, simple: { bib: [10, 6], jaw: [4, 4], fringe: 4 } };

const placed = (geo, pos, rot, scale) => geo.applyMatrix4(new THREE.Matrix4().compose(
  new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));

const coloured = (geo, colour) => {
  geo.deleteAttribute('uv');
  const col = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) { col[i] = colour.r; col[i + 1] = colour.g; col[i + 2] = colour.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
};

// The jaw fluff's colour (R9, with a cap): the coat toward the belly by
// JAW_MIX, so it blends the coat into the bib, but never further than JAW_CAP
// from the bib's colour (Euclidean, linear RGB). A coat close to its belly
// (persian, mainecoon) is unchanged by the cap; a dark coat on a white chest
// (D2, a dark custom look) would otherwise show as grey patches on the bib.
export function jawFluffColour(s) {
  const belly = new THREE.Color(s.belly);
  const j = new THREE.Color(s.base).lerp(belly, RUFF.JAW_MIX);
  const d = Math.hypot(j.r - belly.r, j.g - belly.g, j.b - belly.b);
  return d > RUFF.JAW_CAP ? belly.clone().lerp(j, RUFF.JAW_CAP / d) : j;
}

// One fringe point, tip up (placed flips it): an open cone (its base is buried
// in the bib) with one middle ring pushed out to FRINGE.KNEE, so its sides
// stay full most of the way and close in a blunt rounded tip, with smooth
// round normals so it shades as one soft lobe, not facets.
function softPoint(sides) {
  const { R, LEN, KNEE: [along, wide] } = RUFF.FRINGE;
  const g = new THREE.ConeGeometry(R, LEN, sides, 2, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getY(i)) > 1e-9) continue; // the middle ring (y 0, half width)
    p.setXYZ(i, p.getX(i) * 2 * wide, -LEN / 2 + along * LEN, p.getZ(i) * 2 * wide);
  }
  // smooth round normals (not the facets'): each ring's point outward, tipping
  // toward the tip as the ring narrows, the tip's along the axis
  const n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), r = Math.hypot(p.getX(i), p.getZ(i));
    if (r < 1e-9) { n.setXYZ(i, 0, 1, 0); continue; }
    const lift = y > -LEN / 2 + 1e-9 ? 0.9 : 0.15; // knee ring : base ring
    v.set(p.getX(i) / r, lift, p.getZ(i) / r).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// The ruff for style row `s` (reads s.belly and s.base), in the cat's frame,
// vertex-coloured, without uv. userData.parts gives the
// bib's, the jaw fluff's and the fringe's vertex ranges; userData.fringeBases
// each point's open base ring as [first vertex, count].
export function ruffGeometry(s, simple = false) {
  const seg = SEG[simple ? 'simple' : 'full'];
  const [ax, ay, az] = RUFF.AT;
  const belly = new THREE.Color(s.belly);
  const { BIB, JAW, FRINGE } = RUFF;
  const bib = [coloured(placed(new THREE.SphereGeometry(BIB.R, ...seg.bib),
    [ax + BIB.OFF[0], ay + BIB.OFF[1], az + BIB.OFF[2]], [0, 0, 0], BIB.SCALE), belly)];
  const jaw = [-1, 1].map((side) => coloured(placed(new THREE.SphereGeometry(JAW.R, ...seg.jaw),
    [ax + side * JAW.X, ay + JAW.Y, az + JAW.Z], [0, 0, side * JAW.ROLL], JAW.SCALE), jawFluffColour(s)));
  const fringe = [];
  for (let i = 0; i < FRINGE.N; i++) {
    const a = (i / (FRINGE.N - 1) - 0.5) * FRINGE.SPREAD;
    fringe.push(coloured(placed(softPoint(seg.fringe),
      [ax + Math.sin(a) * FRINGE.EDGE, ay + FRINGE.Y + Math.abs(a) * FRINGE.RISE, az + FRINGE.Z],
      [Math.PI - FRINGE.TILT, 0, -a * 0.5], [1, 1, FRINGE.ZSCALE]), belly));
  }
  const parts = {};
  let at = 0;
  for (const [k, list] of Object.entries({ bib, jaw, fringe })) {
    const n = list.reduce((sum, g) => sum + g.attributes.position.count, 0);
    parts[k] = [at, at + n];
    at += n;
  }
  // each point's open base ring (its last row: sides + 1 vertices with the seam)
  const fringeBases = [];
  let from = parts.fringe[0];
  for (const g of fringe) {
    const n = g.attributes.position.count;
    fringeBases.push([from + n - (seg.fringe + 1), seg.fringe + 1]);
    from += n;
  }
  const all = [...bib, ...jaw, ...fringe];
  const geo = mergeGeometries(all);
  for (const g of all) g.dispose();
  geo.userData.parts = parts;
  geo.userData.fringeBases = fringeBases;
  return geo;
}
