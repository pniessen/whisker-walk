import * as THREE from 'three';

// 'Nothing pokes out of the back' (body refinement Task 1's method,
// baseline.md): each limb vertex with |x| <= its leg's hip |x|, lowered onto
// the torso mesh alone by a ray straight down; poke = vertex y - hit y.
// Shared by folds.test.js and scarmesh.test.js.
const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const _v = new THREE.Vector3();
const _o = new THREE.Vector3();

// The worst poke of the cat's legs, split by `isFolded(legIndex)` into
// { folded, standing } (-Infinity where no vertex qualifies). The cat's
// matrices are updated here.
export function pokes(cat, isFolded = () => false) {
  cat.updateMatrixWorld(true);
  const { body, legs } = cat.userData.parts;
  const out = { folded: -Infinity, standing: -Infinity };
  // Only a vertex over the torso's footprint, and above its lowest point, can
  // poke out of its top (a shortcut: the rays are the cost).
  const torso = new THREE.Box3().setFromObject(body, true);
  legs.forEach((leg, i) => {
    const limb = leg.children[0];
    const key = isFolded(i) ? 'folded' : 'standing';
    const hipX = Math.abs(leg.position.x);
    const pos = limb.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      _v.fromBufferAttribute(pos, k).applyMatrix4(limb.matrixWorld);
      if (Math.abs(_v.x) > hipX + 1e-9) continue;
      if (_v.y < torso.min.y || _v.z < torso.min.z || _v.z > torso.max.z || Math.abs(_v.x) > Math.max(-torso.min.x, torso.max.x)) continue;
      ray.set(_o.set(_v.x, 5, _v.z), DOWN);
      const hit = ray.intersectObject(body, false)[0];
      if (hit) out[key] = Math.max(out[key], _v.y - hit.point.y);
    }
  });
  return out;
}

// Task 1's worst poke per state (baseline.md, the old legs): tabby (every
// standard-frame cat) and digit.
export const T1 = {
  tabby: { follow: -0.0010, nap: 0.1482, stretch: 0.0389, groom: -0.0001, requestPet: 0.0367, perch: 0.0367, sniff: -0.0001, stalk: 0.1657, pounce: -0.0314, scared: 0.0599, cross: 0.0260, land: 0.0618, wade: -0.0001, swim: 0.0169, shake: -0.0001, swipe: 0.0355, backUp: -0.0176, rearUp: -0.0001, flinch: -0.0090, pinned: 0.1440, pinning: 0.1661, roll: -0.0603, arch: -0.0531, walk: 0.0366 },
  digit: { follow: 0.0023, nap: 0.3117, stretch: 0.0426, groom: 0.0031, requestPet: 0.2331, perch: 0.2331, sniff: 0.0031, stalk: 0.2956, pounce: 0.0120, scared: 0.0631, cross: 0.0064, land: 0.0575, wade: 0.0031, swim: 0.0180, shake: 0.0031, swipe: -0.0141, backUp: -0.0280, rearUp: 0.0031, flinch: 0.0720, pinned: 0.3053, pinning: 0.1321, roll: -0.0190, arch: -0.0027, walk: 0.0713 },
};
