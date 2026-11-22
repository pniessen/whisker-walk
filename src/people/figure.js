// The person's figure: one rigidly skinned mesh on a 20-bone skeleton, with a
// near and a far geometry that the mesh swaps between (built far). Nothing in
// the game imports this yet; tests and the picture sheet do.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { withLocalUuids } from '../world/localuuids.js';
import { pairFor, personFor } from './look.js';
import { JOINTS, JOINT_PARENT, jointRest, personParts } from './parts.js';

// The real Math.random draws a person's build takes. The figure it replaces
// made nine uuid'd objects (three meshes, three materials, three merged
// geometries) outside withLocalUuids, 4 draws each, and the area builds are
// pinned to the resulting counts (test/critters.test.js pins 41 for a
// villager: 1 idle phase + 4 for the critter's Group + these 36). Everything
// here is built inside withLocalUuids so its uuids are the same on every
// device, then exactly this many real draws are taken, once per spot (a pair
// too), so the pinned counts do not move. The same burn-to-keep-the-count
// move is the Moor's precedent (ruling F33, test/helpers/flattrace.js).
export const PERSON_REAL_DRAWS = 36;

const YXZ = new Set(['pelvis', 'chest', 'neck', 'head']);

function mergeDetail(look, detail) {
  const parts = personParts(look, detail);
  const geo = mergeGeometries(parts.map((p) => p.geo), false);
  for (const p of parts) p.geo.dispose();
  return { geo, tris: geo.index.count / 3 };
}

function buildPerson(look, material) {
  const rest = jointRest(look.dims);
  const figure = new THREE.Group();
  const bones = {};
  for (const name of JOINTS) {
    const b = new THREE.Bone();
    b.name = name;
    if (YXZ.has(name)) b.rotation.order = 'YXZ';
    const parent = JOINT_PARENT[name];
    const r = rest[name];
    if (parent) {
      const pr = rest[parent];
      b.position.set(r[0] - pr[0], r[1] - pr[1], r[2] - pr[2]);
      bones[parent].add(b);
    } else {
      b.position.set(r[0], r[1], r[2]);
      figure.add(b);
    }
    b.userData.rest = new THREE.Vector3(r[0], r[1], r[2]);
    bones[name] = b;
  }
  const near = mergeDetail(look, 'near');
  const far = mergeDetail(look, 'far');
  const mesh = new THREE.SkinnedMesh(far.geo, material);
  mesh.frustumCulled = true;
  figure.add(mesh);
  figure.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(JOINTS.map((n) => bones[n]));
  mesh.bind(skeleton);
  // the texture is made here, inside the local-uuid block, so the first
  // render never makes one (a texture uuid is 4 real draws)
  skeleton.computeBoneTexture();
  // fixed, so posing never recomputes it and a wave never culls the figure
  const H = look.height;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H / 2, 0), 0.75 * H);

  const person = {
    figure, mesh, look, bones, skeleton,
    geometries: { near: near.geo, far: far.geo },
    detail: 'far',
    inView: false,
    rest: Object.fromEntries(JOINTS.map((n) => [n, bones[n].userData.rest.clone()])),
    target: { rot: new Float32Array(JOINTS.length * 3), pelvis: new Float32Array(3) },
    stats: { nearTris: near.tris, farTris: far.tris, joints: JOINTS.length },
    setDetail(d) {
      person.detail = d === 'near' ? 'near' : 'far';
      mesh.geometry = person.geometries[person.detail];
    },
    dispose() {
      person.geometries.near.dispose();
      person.geometries.far.dispose();
      skeleton.dispose(); // frees its bone texture; the shared material stays
    },
  };
  return person;
}

export function buildSpot(def, { material }) {
  const pair = pairFor(def);
  const looks = pair ? [pair.adult, pair.child] : [personFor(def)];
  const people = withLocalUuids('person', () => looks.map((l) => buildPerson(l, material)));
  for (let i = 0; i < PERSON_REAL_DRAWS; i++) Math.random();
  return { people, pair: !!pair };
}
