// The people kit: the public face of src/people/. The game imports only this.
import * as THREE from 'three';
import { withLocalUuids } from '../world/localuuids.js';
import { LOW_RUNG } from '../render/quality.js';
import { buildSpot } from './figure.js';
import { pose, applyPose } from './pose.js';
import { createGaze, stepGaze } from './gaze.js';

export { personFor, pairFor, spotKind } from './look.js';
export { pose, applyPose, strideFor, POSE_TIMES } from './pose.js';
export { createGaze, stepGaze, GAZE } from './gaze.js';
export { REACH, headTopOffset, catVolumes, createScratch, stepScratch } from './reach.js';

// Chunk placement, not behaviour. This chunk is loaded by five places, and the
// bundler decides where shared modules live by which chunks reach them. Reaching
// the builder and the ground the way every place does keeps start-up in the same
// few files as before; without these two lines it splits start-up into ten
// files (+4 kB gzipped). Task 10 and 14 will use both for real.
export { puddle } from '../world/builder.js';
export { STEP_MAX } from '../ground.js';

export const LOD = Object.freeze({ NEAR: 12, NEAR_LOW: 7, HYSTERESIS: 1 });

export function lodNearFor(rung) {
  return rung >= LOW_RUNG ? LOD.NEAR_LOW : LOD.NEAR;
}

// scratch, so update() allocates nothing
const _pos = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();

// reducedMotion is kept on the kit for its callers: the kit itself poses no
// one, so the walk reads kit.reducedMotion and passes it on each frame to
// pose() (spec.reducedMotion: no weight shift, breathing or wave swing) and
// stepGaze() (opts.reducedMotion: no glance, turns twice as slow). The head
// scratch has no reduced-motion form (its hand is slow and eased already).
export function createPeopleKit({ camera, reducedMotion = false, lodNear = () => LOD.NEAR } = {}) {
  // one material for everyone, its uuid drawn locally (no real Math.random)
  const material = withLocalUuids('people-shared',() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    flatShading: false,
  }));
  const kit = {
    material,
    people: [],
    reducedMotion, // (for the callers: see above)
    // The posing calls, on the kit for callers outside the place packs
    // (critters.js is in start-up and imports nothing from src/people: it is
    // handed the kit's factory and reaches these through the kit).
    pose,
    applyPose,
    createGaze,
    stepGaze,
    buildSpot(def) {
      const spot = buildSpot(def, { material });
      for (const p of spot.people) kit.people.push(p);
      return spot;
    },
    update() {
      camera.updateMatrixWorld();
      camera.getWorldPosition(_cam);
      _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_m);
      const near = lodNear();
      const nearIn = near - LOD.HYSTERESIS;
      const farOut = near + LOD.HYSTERESIS;
      for (const p of kit.people) {
        p.figure.getWorldPosition(_pos);
        const d = _pos.distanceTo(_cam);
        if (d >= farOut) { if (p.detail !== 'far') p.setDetail('far'); }
        else if (d <= nearIn) { if (p.detail !== 'near') p.setDetail('near'); }
        // (the figure's matrix, just refreshed by getWorldPosition; the
        // mesh's own waits for the render, and its local transform is the
        // identity)
        _sphere.copy(p.mesh.boundingSphere).applyMatrix4(p.figure.matrixWorld);
        p.inView = _frustum.intersectsSphere(_sphere);
      }
    },
    dispose() {
      for (const p of kit.people) p.dispose();
      kit.people.length = 0;
      material.dispose();
    },
  };
  return kit;
}
