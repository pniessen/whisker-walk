import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import { HEN_SKULL } from './hen.js';
import { SKULL } from './torso.js';

// -----------------------------------------------------------------------------
// GLASSES THAT READ (polish-catlooks, 2026-11-02). The old glasses were two
// thin gold torus rings (tube 6 mm on a cat) that vanished at walk-camera
// distance, and on Hagrid they were invisible: his eyes sit on the sides of
// his head and the rings faced straight forward, edge-on to anyone looking at
// an eye. Now: thick frames, a faint blue-grey lens (so the eye still shows),
// a small white glint that says "glass", each rim centred on its eye and
// facing out along that eye's own direction.
//
// Three meshes, always (accessory-mesh-delta.json pins glasses 3, sunglasses
// 3): the frames (both rims + bridge merged), the lenses (both merged), the
// glints (both merged). None casts a shadow: they are small and the shadow
// pass is the one we pay for per caster.

export const GLASSES_FRAME = 0xd4a24c;    // warm gold frame
export const SUNGLASSES_DARK = 0x26262e;  // dark frame and lens
const GLASS_TINT = 0xbfd8e8;              // a faint blue-grey: reads as glass, hides nothing
const GLASS_OPACITY = 0.3;
const GLINT = 0xffffff;

const RIM_SIDES = 6;      // round enough at 1 cm thick
const RIM_SEGMENTS = 12;
const BRIDGE_SEGMENTS = 6;
const LENS_SEGMENTS = 12;
// The bridge's centreline stays this far (plus its own radius) off the skull.
const BRIDGE_CLEAR = 0.003;

// One spec per head, in head space. `eyes` is the right eye's centre (x > 0;
// the left is its mirror). `normal` says which way a rim faces: straight
// forward (−z) on a cat, or out of the skull ellipsoid `skull` at the eye on
// Hagrid (the way buildChicken turns his eyes). Each rim sits `lift` out from
// its eye along that direction; `ringR` is the rim's ring radius (to the
// tube's centre) and `tube` its thickness. `bridge` bends the bridge's middle
// up (`rise`) and forward (`out`, toward −z) from the straight line between
// the rims' inner edges; `attach` is how far above the inner edge's midline
// (radians round the rim) the bridge meets each rim.
export const GLASSES = Object.freeze({
  cat: Object.freeze({
    // today's eye spot; the eye's front (pupil included) is at z −0.193
    eyes: Object.freeze([Object.freeze([0.083, 0.03, -0.17])]),
    normal: 'forward',
    yaw: 0.35,
    skull: Object.freeze(SKULL.SCALE.map((s) => SKULL.R * s)),
    ringR: 0.038,
    tube: 0.010,
    lift: 0.026,
    glintR: 0.008,
    bridge: Object.freeze({ rise: 0.014, out: 0.016, attach: 0.3 }),
  }),
  hen: Object.freeze({
    // his eye: radius 0.022, pupil front 15.6 mm out along its normal
    eyes: Object.freeze([Object.freeze([0.09, 0.03, -0.1])]),
    normal: 'skull',
    skull: HEN_SKULL,
    ringR: 0.022 + 0.012,
    tube: 0.008,
    lift: 0.024,
    glintR: 0.0065,
    // the bridge climbs over the top of the beak's root (beak top ~2 cm up there)
    bridge: Object.freeze({ rise: 0.02, out: 0.004, attach: 0.35 }),
  }),
});

const _Z = new THREE.Vector3(0, 0, 1);
const _UP = new THREE.Vector3(0, 1, 0);

// Where a rim sits and how it faces, for side ±1: its centre, the facing
// direction n, and the in-plane up and outward (away from the midline).
function rimFrame(spec, side) {
  const [x, y, z] = spec.eyes[0];
  const eye = new THREE.Vector3(side * x, y, z);
  let n;
  if (spec.normal === 'skull') {
    const [ax, ay, az] = spec.skull;
    n = new THREE.Vector3(eye.x / (ax * ax), eye.y / (ay * ay), eye.z / (az * az)).normalize();
  } else {
    // forward, turned out toward the cheek by `yaw` (so the frame's outer
    // edge follows the face round instead of standing off it)
    const yaw = spec.yaw ?? 0;
    n = new THREE.Vector3(side * Math.sin(yaw), 0, -Math.cos(yaw));
  }
  const centre = eye.clone().addScaledVector(n, spec.lift);
  const up = _UP.clone().addScaledVector(n, -n.dot(_UP)).normalize();
  const outward = new THREE.Vector3(side, 0, 0).addScaledVector(n, -n.x * side).addScaledVector(up, -up.x * side).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_Z, n);
  return { eye, n, centre, up, outward, q };
}

// Push a point out of the skull ellipsoid until it clears it by `clear`
// (scaling about the skull's centre, the head origin).
function clearOfSkull(p, skull, clear) {
  const f = Math.hypot(p.x / skull[0], p.y / skull[1], p.z / skull[2]);
  const want = 1 + clear / Math.min(...skull);
  if (f < want) p.multiplyScalar(want / f);
  return p;
}

function framesGeometry(spec, frames) {
  const parts = [], counts = [];
  for (const f of frames) {
    const rim = new THREE.TorusGeometry(spec.ringR, spec.tube, RIM_SIDES, RIM_SEGMENTS);
    rim.applyQuaternion(f.q).translate(f.centre.x, f.centre.y, f.centre.z);
    parts.push(rim);
    counts.push(rim.attributes.position.count);
  }
  // the bridge: from each rim's inner edge (a little above its midline), bowed
  // up and forward, and kept off the skull
  const { rise, out, attach } = spec.bridge;
  const ends = frames.map((f) => f.centre.clone()
    .addScaledVector(f.outward, -spec.ringR * Math.cos(attach))
    .addScaledVector(f.up, spec.ringR * Math.sin(attach)));
  const ctrl = ends[0].clone().add(ends[1]).multiplyScalar(0.5).add(new THREE.Vector3(0, rise, -out));
  const bez = new THREE.QuadraticBezierCurve3(ends[0], ctrl, ends[1]);
  const bridgeR = spec.tube * 0.8;
  const pts = bez.getPoints(BRIDGE_SEGMENTS).map((p, i, all) => (i === 0 || i === all.length - 1 ? p : clearOfSkull(p, spec.skull, bridgeR + BRIDGE_CLEAR)));
  const bridge = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), BRIDGE_SEGMENTS, bridgeR, 5, false);
  parts.push(bridge);
  counts.push(bridge.attributes.position.count);
  const geo = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  geo.userData.tube = spec.tube;
  geo.userData.ringR = spec.ringR;
  geo.userData.ranges = { rims: [[0, counts[0]], [counts[0], counts[1]]], bridge: [counts[0] + counts[1], counts[2]] };
  return geo;
}

function lensGeometry(kind, spec, frames) {
  const parts = frames.map((f) => {
    let g;
    if (kind === 'sunglasses') {
      // today's dark flattened lens, filling the rim; thin enough that its
      // back stays in front of the eye
      g = new THREE.SphereGeometry(spec.ringR - spec.tube * 0.3, 10, 4).scale(1, 1, 0.25);
    } else {
      g = new THREE.CircleGeometry(spec.ringR - spec.tube * 0.5, LENS_SEGMENTS);
    }
    return g.applyQuaternion(f.q).translate(f.centre.x, f.centre.y, f.centre.z);
  });
  const geo = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return geo;
}

// A glint: a small flattened white spot on each lens's upper-outer quarter,
// just in front of it, its long side along the rim (a reflected window).
function glintGeometry(kind, spec, frames) {
  const front = kind === 'sunglasses' ? (spec.ringR - spec.tube * 0.3) * 0.25 + 0.0015 : 0.002;
  const parts = frames.map((f) => {
    const radial = f.outward.clone().add(f.up).normalize();
    const along = new THREE.Vector3().crossVectors(radial, f.n).normalize();
    const basis = new THREE.Matrix4().makeBasis(along, radial, f.n);
    const at = f.centre.clone().addScaledVector(radial, spec.ringR * 0.55).addScaledVector(f.n, front);
    return new THREE.SphereGeometry(spec.glintR, 5, 4)
      .scale(1.4, 0.6, 0.3)
      .applyMatrix4(basis)
      .translate(at.x, at.y, at.z);
  });
  const geo = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  return geo;
}

// buildGlasses('glasses' | 'sunglasses', GLASSES.cat | GLASSES.hen) →
// [frames, lenses, glints], each in head space (position 0) for head.add.
export function buildGlasses(kind, spec) {
  const dark = kind === 'sunglasses';
  const frames = [1, -1].map((side) => rimFrame(spec, side));
  const frameMesh = new THREE.Mesh(framesGeometry(spec, frames), litMaterial(dark ? SUNGLASSES_DARK : GLASSES_FRAME));
  const lensMat = dark
    ? litMaterial(SUNGLASSES_DARK)
    : litMaterial(GLASS_TINT, { roughness: 0.3, transparent: true, opacity: GLASS_OPACITY, depthWrite: false });
  const lensMesh = new THREE.Mesh(lensGeometry(kind, spec, frames), lensMat);
  const glintMesh = new THREE.Mesh(glintGeometry(kind, spec, frames), new THREE.MeshBasicMaterial({ color: GLINT }));
  const out = [[frameMesh, 'frames'], [lensMesh, 'lenses'], [glintMesh, 'glints']];
  for (const [m, part] of out) {
    m.userData.glassesPart = part;
    m.castShadow = false;
    m.userData.noCast = true; // render/rig.js's caster sweep skips it
  }
  return out.map(([m]) => m);
}
