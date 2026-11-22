// =============================================================================
// THE STREET MUSICIAN (Market step 3, V7). Part of the Market chunk: imported
// only by world/marketlife.js, which stands them at the plan's pitch (MUSICIAN,
// marketplan.js) once a walk, when the walk hands it the people factory.
//
// createMusician(scene, spot, { figure = marketFigure, people, lodNear, reducedMotion, y })
//   → { group, figure, fiddle, bow, rest, update(t), detail(d), dispose() }
//   spot    { x, z, yaw } (the plan's MUSICIAN): where they stand and which way
//           they face; y the ground's height there (FLAT_GROUND's without it)
//   figure  THE one figure function the stallholders are built through
//           (marketkeeper.js's marketFigure), called once with
//           { x, y, z, yaw, people, mode: 'juggle' }: the people's juggling
//           pose at t 0 holds both forearms up in front, still. The people
//           have no fiddler's pose, so this then sets the two arms' joints
//           once (FIDDLER): the left hand up and out in front at the
//           fiddle's scroll, the right elbow out with the bow. Nobody poses
//           the person again.
//   people  the people factory (the pack's createPeopleKit), handed on to it,
//           with lodNear (the live rung's near distance, the walk's).
//   group   the figure's own group, renamed 'marketMusician', in the scene. It
//           is placed once, by the figure, and never moved: they never step
//           toward her, never turn to her, never follow her (anti-goal
//           "people in the way"). They stand inside the pitch's solid circle.
//   fiddle  one mesh on the group: the fiddle, from under the chin out to the
//           left hand (the left arm never moves), and the open fiddle case on
//           the cobbles at their feet
//   bow     one mesh on the bowing arm (the figure's `arm`, the right upper
//           arm), its frog in the right hand, across the fiddle's strings
//   rest    the arm's rotation.z as posed
//   update(t)  t the walk's seconds: arm.rotation.z = rest + swing x
//           sin(rate x t) (MUSICIAN_BOW; `still`'s smaller swing under reduced
//           motion). Nothing else moves.
//   detail(d)  d her cat's distance: the figure's near/far switch (marketkeeper.js)
//   dispose takes it all out of the scene and frees what it made (the figure
//           frees its own person). Twice is harmless.
// The fiddle, its case and the bow are under 200 triangles, cast nothing (the
// walk's caster sweep leaves noCast alone) and are made inside withLocalUuids:
// making a musician draws nothing from Math.random.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { marketFigure, HAND_MID } from '../marketkeeper.js';
import { withLocalUuids } from './localuuids.js';
import { painted } from './marketparts.js';

// The bowing: rad of the arm's swing out from its rest, and how fast (rad/s)
export const MUSICIAN_BOW = Object.freeze({ swing: 0.25, still: 0.08, rate: 2.4 });

// The fiddler's arms (each joint's rotation, rad, the people's XYZ joints),
// set once over the juggling pose: the left upper arm forward and up, its
// forearm bent so the hand is at the shoulder's height half a metre out in
// front and to the left; the right elbow out to the side, the forearm folded
// back in so the hand (and the bow's frog) is in front of the chest.
const FIDDLER = Object.freeze({
  upperArmL: Object.freeze([1.1, -0.2, -0.4]),
  forearmL: Object.freeze([1.1, 0, 0]),
  upperArmR: Object.freeze([0.3, 0.5, 0.75]),
  forearmR: Object.freeze([2.1, 0, 0]),
});
// the fiddle, in its own frame: tail at z 0, scroll toward +z, top +y (m)
const FIDDLE = Object.freeze({ lower: 0.1, upper: 0.085, thick: 0.045, body: 0.34, neck: 0.2, tilt: 0.6 });
const BOW_LEN = 0.62;
const VARNISH = 0x9a4f22;
const EBONY = 0x2a1d17;
const STICK = 0x5a3620;
const HAIR = 0xe9e2cf;
const CASE = 0x3b2a26;
const VELVET = 0x8c2230;

const box = (w, h, d, x, y, z, hex) => painted(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
// a flat round bout, `r` across, FIDDLE.thick deep, its middle at z
const bout = (r, z) => painted(new THREE.CylinderGeometry(r, r, FIDDLE.thick, 10).translate(0, 0, z), VARNISH);

function fiddleGeometry() {
  const F = FIDDLE;
  return mergeGeometries([
    bout(F.lower, F.lower),
    bout(F.upper, F.body - F.upper),
    box(0.032, 0.022, F.neck, 0, F.thick / 2 + 0.006, F.body + F.neck / 2 - 0.02, EBONY), // the neck and fingerboard
    box(0.036, 0.036, 0.04, 0, F.thick / 2, F.body + F.neck, VARNISH), // the scroll
  ]);
}

// the open case at their feet, in the group's frame (front +z): within the
// pitch's circle, its lid up behind it
function caseGeometry() {
  const yaw = 0.3;
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(0.05, 0, 0.3);
  const lid = new THREE.Matrix4().makeRotationX(-0.25).setPosition(0, 0.13, -0.135);
  return mergeGeometries([
    box(0.72, 0.07, 0.24, 0, 0.035, 0, CASE).applyMatrix4(m),
    box(0.66, 0.012, 0.19, 0, 0.074, 0, VELVET).applyMatrix4(m),
    box(0.72, 0.22, 0.02, 0, 0, 0, CASE).applyMatrix4(lid).applyMatrix4(m),
  ]);
}

// the bow along its own +x: the frog at 0, the tip at BOW_LEN
function bowGeometry() {
  return mergeGeometries([
    box(BOW_LEN, 0.011, 0.011, BOW_LEN / 2, 0, 0, STICK),
    box(BOW_LEN - 0.06, 0.004, 0.016, BOW_LEN / 2 + 0.02, -0.018, 0, HAIR),
    box(0.05, 0.026, 0.018, 0.02, -0.01, 0, EBONY), // the frog, in her fingers
  ]);
}

const noCast = (m) => {
  m.castShadow = false;
  m.receiveShadow = false;
  m.userData.noCast = true;
  return m;
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _a2 = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

export function createMusician(scene, spot, { figure = marketFigure, people, lodNear, reducedMotion = false, y } = {}) {
  const k = figure({ x: spot.x, y, z: spot.z, yaw: spot.yaw, people, mode: 'juggle', ...(lodNear ? { lodNear } : {}) });
  const group = k.group;
  group.name = 'marketMusician';
  scene.add(group);
  const bones = k.person?.bones ?? null;
  if (bones) for (const [joint, r] of Object.entries(FIDDLER)) bones[joint]?.rotation.set(r[0], r[1], r[2]);
  group.updateMatrixWorld(true);
  const arm = k.arm;
  const rest = arm.rotation.z;
  const swing = reducedMotion ? MUSICIAN_BOW.still : MUSICIAN_BOW.swing;

  let made;
  try {
    made = withLocalUuids(`market-musician:${spot.x.toFixed(3)},${spot.z.toFixed(3)}`, () => {
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
      const B = bones ?? {};
      const dims = k.person?.look?.dims ?? { hand: 0.18 };
      // in the group's own frame: front +z, right -x (the figure turned by pi inside it)
      const local = (o, v) => group.worldToLocal(o.localToWorld(v));
      // the fiddle's tail: under the chin, a little to the left, in front of the neck
      const tail = B.neck ? local(B.neck, _a.set(0, 0, 0)) : _a.set(0, 1.45, 0);
      tail.add(_b.set(0.05, -0.04, 0.1));
      // its scroll: in the left hand
      const grip = B.handL ? local(B.handL, _b.set(0, -HAND_MID * dims.hand, 0)) : _b.set(0.3, 1.36, 0.58);
      _z.subVectors(grip, tail);
      const length = _z.length();
      _z.normalize();
      _x.crossVectors(UP, _z).normalize();
      _y.crossVectors(_z, _x);
      // the fiddle's top turned toward the player's right (the bow's side), as a fiddle is held
      const c = Math.cos(FIDDLE.tilt), s = Math.sin(FIDDLE.tilt);
      _a2.copy(_x).multiplyScalar(c).addScaledVector(_y, s);
      _y.multiplyScalar(c).addScaledVector(_x, -s);
      _x.copy(_a2);
      const geo = fiddleGeometry();
      // stretched (or squeezed) along its length so the scroll sits in the hand
      geo.scale(1, 1, length / (FIDDLE.body + FIDDLE.neck));
      geo.applyMatrix4(_m.makeBasis(_x, _y, _z).setPosition(tail));
      const fiddleGeo = mergeGeometries([geo, caseGeometry()]);
      geo.dispose();
      const fiddle = noCast(new THREE.Mesh(fiddleGeo, material));
      fiddle.name = 'marketMusicianFiddle';
      group.add(fiddle);
      // the bow: from the bowing hand across the strings, just past the body's middle
      const bridge = _a.copy(tail).addScaledVector(_z, FIDDLE.body * 0.62 * (length / (FIDDLE.body + FIDDLE.neck))).addScaledVector(_y, FIDDLE.thick / 2 + 0.02);
      group.localToWorld(bridge);
      // the right hand's grip in the arm's own frame, as the arms now are
      // (the figure's `hand` was the pose's, before FIDDLER)
      const hand = B.handR
        ? arm.worldToLocal(B.handR.localToWorld(_b.set(0, -HAND_MID * dims.hand, 0)))
        : _b.set(k.hand?.x ?? 0, k.hand?.y ?? -0.5, k.hand?.z ?? 0);
      const frog = arm.localToWorld(_x.copy(hand));
      const dir = _y.subVectors(bridge, frog).normalize();
      // that way in the arm's own frame
      arm.getWorldQuaternion(_q).invert();
      dir.applyQuaternion(_q);
      const bow = noCast(new THREE.Mesh(bowGeometry(), material));
      bow.name = 'marketMusicianBow';
      bow.position.copy(hand);
      bow.quaternion.setFromUnitVectors(X, dir);
      // back a little behind the grip, so the frog is in the fingers
      bow.position.addScaledVector(dir, -0.03);
      arm.add(bow);
      return { material, fiddle, bow };
    });
  } catch (e) {
    k.dispose();
    throw e;
  }
  const { material, fiddle, bow } = made;

  let gone = false;
  return {
    group,
    figure: k,
    fiddle,
    bow,
    rest,
    update(t) {
      if (gone || !Number.isFinite(t)) return;
      arm.rotation.z = rest + swing * Math.sin(MUSICIAN_BOW.rate * t);
    },
    detail(d) {
      if (!gone) k.detail?.(d);
    },
    dispose() {
      if (gone) return;
      gone = true;
      bow.removeFromParent();
      fiddle.removeFromParent();
      bow.geometry.dispose();
      fiddle.geometry.dispose();
      material.dispose();
      k.dispose();
      group.removeFromParent();
    },
  };
}
