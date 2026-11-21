// The people kit: the public face of src/people/. The game imports only this.
import * as THREE from 'three';
import { withLocalUuids } from '../world/localuuids.js';
import { LOW_RUNG } from '../render/quality.js';
import { buildSpot } from './figure.js';

export { personFor, pairFor, spotKind } from './look.js';
export { pose, applyPose, strideFor } from './pose.js';
export { createGaze, stepGaze, GAZE } from './gaze.js';
export { REACH, headTopOffset, catVolumes, createScratch, stepScratch } from './reach.js';

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

export function createPeopleKit({ camera, reducedMotion = false, lodNear = () => LOD.NEAR } = {}) {
  // one material for everyone, its uuid drawn locally (no real Math.random)
  const material = withLocalUuids('people-kit', () => new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    flatShading: false,
  }));
  const kit = {
    material,
    people: [],
    reducedMotion,
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
        _sphere.copy(p.mesh.boundingSphere).applyMatrix4(p.mesh.matrixWorld);
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
