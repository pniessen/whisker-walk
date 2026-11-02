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
// The anchor departs from R9 (owner's ruling, Task 6 fix round 1). R9 put AT
// where the torus sat, z -0.30, on the belief that the sketch's chest differs
// from the game's; it does not (both (0, 0.49, -0.33), r 0.15·(1.05, 1.1, 0.9)),
// and at -0.30 every ruff vertex is inside the chest or the skull: no ruff
// shows at all. AT z -0.37 (the sketch's -0.36, 1 cm on) puts the bib's front
// about 9 mm proud of the chest front under the chin, so it reads as the
// sketch's modest bib outline, close to the chest; the jaw fluff peeks out
// below the cheeks at R9's y -0.02. The fringe hangs straight down (TILT 0,
// no backward rise for the outer points, where the sketch tipped them 0.25
// and 0.03·|a| back): tipped back, the points' tips sink into the chest and
// their open bases stand out of the bib; upright, each base stays buried in
// the bib and each tip pokes 7-10 mm out below its edge, a soft zig-zag.
export const RUFF = Object.freeze({
  AT: Object.freeze([0, 0.58, -0.37]),
  // a sphere of radius R, scaled, centred at AT + OFF
  BIB: Object.freeze({ R: 0.10, SCALE: Object.freeze([1.05, 1.05, 0.55]), OFF: Object.freeze([0, -0.07, -0.05]) }),
  // one each side at AT + (±X, Y, Z), rolled ±ROLL about z
  JAW: Object.freeze({ R: 0.055, SCALE: Object.freeze([0.6, 1.0, 0.8]), X: 0.10, Y: -0.02, Z: -0.03, ROLL: 0.3 }),
  // N cones, tip down, spread over SPREAD radians along the bib's lower edge
  FRINGE: Object.freeze({ N: 5, R: 0.026, LEN: 0.07, ZSCALE: 0.6, SPREAD: 1.3, EDGE: 0.075, Y: -0.15, Z: -0.08, RISE: 0.03, TILT: 0 }),
  // the jaw fluff's colour, this far from the coat (base) toward the belly
  JAW_MIX: 0.35,
});

// Segments: [bib w, h], [jaw w, h], fringe sides. A simple build has fewer
// segments, never a different shape. Full 192 + 2·64 + 5·6 = 350 triangles
// (≤ 360); simple 100 + 2·36 + 5·4 = 192 (≤ 210). The fringe cones are open
// at the base: it is buried in the bib.
const SEG = { full: { bib: [12, 9], jaw: [8, 5], fringe: 6 }, simple: { bib: [10, 6], jaw: [6, 4], fringe: 4 } };

const placed = (geo, pos, rot, scale) => geo.applyMatrix4(new THREE.Matrix4().compose(
  new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));

const coloured = (geo, colour) => {
  geo.deleteAttribute('uv');
  const col = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) { col[i] = colour.r; col[i + 1] = colour.g; col[i + 2] = colour.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
};

// The ruff for style row `s` (reads s.base and s.belly), in the cat's frame,
// vertex-coloured, without uv. userData.parts gives the bib's, the jaw fluff's
// and the fringe's vertex ranges.
export function ruffGeometry(s, simple = false) {
  const seg = SEG[simple ? 'simple' : 'full'];
  const [ax, ay, az] = RUFF.AT;
  const belly = new THREE.Color(s.belly);
  const jawColour = new THREE.Color(s.base).lerp(new THREE.Color(s.belly), RUFF.JAW_MIX);
  const { BIB, JAW, FRINGE } = RUFF;
  const bib = [coloured(placed(new THREE.SphereGeometry(BIB.R, ...seg.bib),
    [ax + BIB.OFF[0], ay + BIB.OFF[1], az + BIB.OFF[2]], [0, 0, 0], BIB.SCALE), belly)];
  const jaw = [-1, 1].map((side) => coloured(placed(new THREE.SphereGeometry(JAW.R, ...seg.jaw),
    [ax + side * JAW.X, ay + JAW.Y, az + JAW.Z], [0, 0, side * JAW.ROLL], JAW.SCALE), jawColour));
  const fringe = [];
  for (let i = 0; i < FRINGE.N; i++) {
    const a = (i / (FRINGE.N - 1) - 0.5) * FRINGE.SPREAD;
    fringe.push(coloured(placed(new THREE.ConeGeometry(FRINGE.R, FRINGE.LEN, seg.fringe, 1, true),
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
  const all = [...bib, ...jaw, ...fringe];
  const geo = mergeGeometries(all);
  for (const g of all) g.dispose();
  geo.userData.parts = parts;
  return geo;
}
