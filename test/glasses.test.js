import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { GLASSES, buildGlasses } from '../src/cat/glasses.js';
import { HEN_SKULL, henBeakGeometry } from '../src/cat/hen.js';
import { SKULL } from '../src/cat/torso.js';
import { meshCount } from './helpers/catfingerprint.js';

// polish-catlooks (2026-11-02), Task 3: glasses that read. Thick frames, a
// faint tinted lens, a small white glint, fitted per head: forward on a cat,
// out of the skull over each of Hagrid's side-set eyes, a bridge that arcs
// over his beak's root.

const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
const PARTS = ['frames', 'lenses', 'glints'];

const headOf = (breed, face) => buildCat(breed, { ...BARE, face }).userData.parts.head;
const partsOf = (head) => Object.fromEntries(PARTS.map((k) => [k, head.children.find((o) => o.userData.glassesPart === k)]));

// A mesh's vertices in head space (glasses parts hang straight off the head).
function verts(mesh, range) {
  mesh.updateMatrix();
  const p = mesh.geometry.attributes.position, out = [];
  const [s, n] = range ?? [0, p.count];
  for (let i = s; i < s + n; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrix));
  return out;
}
// Welded (deduplicated) points, so a torus's seam rows do not bias a mean.
function weld(pts) {
  const m = new Map();
  for (const v of pts) m.set(v.toArray().map((x) => x.toFixed(5)).join(','), v);
  return [...m.values()];
}
const mean = (pts) => pts.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / pts.length);
// The plane normal of a ring of points: the covariance's least eigenvector
// (power iteration on trace·I − C).
function ringAxis(pts) {
  const c = mean(pts), C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const v of pts) {
    const d = v.clone().sub(c).toArray();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j];
  }
  const tr = C[0][0] + C[1][1] + C[2][2];
  let a = new THREE.Vector3(0.3, 0.2, 0.9).normalize();
  for (let k = 0; k < 200; k++) {
    const x = a.toArray();
    const y = [0, 1, 2].map((i) => tr * x[i] - (C[i][0] * x[0] + C[i][1] * x[1] + C[i][2] * x[2]));
    a = new THREE.Vector3(...y).normalize();
  }
  return a;
}
// How far a point sits inside an origin-centred ellipsoid (0 when outside).
function depthIn(v, [ax, ay, az], c = [0, 0, 0]) {
  const d = v.clone().sub(new THREE.Vector3(...c));
  const f = Math.hypot(d.x / ax, d.y / ay, d.z / az);
  return f >= 1 ? 0 : d.length() * (1 / f - 1);
}
const henNormal = (side) => {
  const [ax, ay, az] = HEN_SKULL;
  return new THREE.Vector3(side * 0.09 / (ax * ax), 0.03 / (ay * ay), -0.1 / (az * az)).normalize();
};
// Inside a closed mesh: odd crossings along two directions.
function insideMesh(mesh, p) {
  const rc = new THREE.Raycaster();
  return [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.3, 0.2, -1).normalize()].every((dir) => {
    rc.set(p, dir);
    return rc.intersectObject(mesh, false).length % 2 === 1;
  });
}

describe('glasses that read (polish-catlooks Task 3)', () => {
  it('glasses are three meshes on a cat and on Hagrid', () => {
    for (const breed of ['tabby', 'hagrid']) {
      const bare = meshCount(buildCat(breed, BARE));
      for (const face of ['glasses', 'sunglasses']) {
        expect([breed, face, meshCount(buildCat(breed, { ...BARE, face })) - bare]).toEqual([breed, face, 3]);
        const parts = partsOf(headOf(breed, face));
        for (const k of PARTS) expect([breed, face, k, !!parts[k]?.isMesh]).toEqual([breed, face, k, true]);
      }
    }
    // the builder on its own: exactly three meshes for either kind
    for (const kind of ['glasses', 'sunglasses']) for (const spec of [GLASSES.cat, GLASSES.hen]) {
      expect(buildGlasses(kind, spec).length).toBe(3);
    }
  });

  it('the frames are thick enough to read', () => {
    for (const [breed, spec, minTube] of [['tabby', GLASSES.cat, 0.009], ['hagrid', GLASSES.hen, 0.007]]) {
      const { frames } = partsOf(headOf(breed, 'glasses'));
      const ud = frames.geometry.userData;
      expect(ud.tube).toBeGreaterThanOrEqual(minTube);
      expect(ud.ringR).toBe(spec.ringR);
      // measured: each rim's ring radius off its own vertices
      for (const range of ud.ranges.rims) {
        const pts = weld(verts(frames, range)), c = mean(pts), a = ringAxis(pts);
        const radial = pts.map((v) => { const d = v.clone().sub(c); return d.sub(a.clone().multiplyScalar(d.dot(a))).length(); });
        const lo = Math.min(...radial), hi = Math.max(...radial);
        expect((lo + hi) / 2).toBeCloseTo(spec.ringR, 3);
        expect((hi - lo) / 2).toBeGreaterThanOrEqual(minTube * 0.95); // the tube really is that thick
      }
    }
    // the brief said 0.034; measured, the cat's eye (0.036 wide, 0.041 tall)
    // showed past a 0.034 rim at the three-quarter view, so 0.038
    expect(GLASSES.cat.ringR).toBe(0.038);
    expect(GLASSES.hen.ringR).toBeCloseTo(0.022 + 0.012, 10);
  });

  it('the monocle rim is as thick as the glasses on a cat', () => {
    const head = headOf('tabby', 'monocle');
    const rim = head.children.find((o) => o.isMesh && o.geometry.type === 'TorusGeometry');
    expect(rim.geometry.parameters.tube).toBeGreaterThanOrEqual(GLASSES.cat.tube);
  });

  it('Hagrid\'s rims sit over his eyes, facing out of the skull', () => {
    const { frames, lenses, glints } = partsOf(headOf('hagrid', 'glasses'));
    const { ranges } = frames.geometry.userData;
    const lift = GLASSES.hen.lift;
    const got = ranges.rims.map((range) => {
      const pts = weld(verts(frames, range));
      return { c: mean(pts), a: ringAxis(pts) };
    });
    for (const side of [-1, 1]) {
      const n = henNormal(side);
      const want = new THREE.Vector3(side * 0.09, 0.03, -0.1).addScaledVector(n, lift);
      const rim = got.find((r) => Math.sign(r.c.x) === side);
      expect(rim.c.distanceTo(want)).toBeLessThanOrEqual(0.006);
      expect(Math.acos(Math.min(1, Math.abs(rim.a.dot(n))))).toBeLessThanOrEqual(0.15);
    }
    // nothing of the glasses (rims, bridge, lenses, glints) inside the skull
    for (const m of [frames, lenses, glints]) {
      const deepest = Math.max(...verts(m).map((v) => depthIn(v, HEN_SKULL)));
      expect(deepest).toBeLessThanOrEqual(0.001);
    }
    // the bridge arcs over the beak's root: none of it inside the beak, and
    // its lowest point (with its tube) clear of the beak's top there
    const beak = new THREE.Mesh(henBeakGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const bridge = verts(frames, ranges.bridge);
    expect(bridge.filter((v) => insideMesh(beak, v)).map((v) => v.toArray())).toEqual([]);
    const beakPts = verts(beak);
    const closest = Math.min(...bridge.map((v) => Math.min(...beakPts.map((b) => b.distanceTo(v)))));
    expect(closest).toBeGreaterThan(0.004);
  });

  it('a cat\'s frames clear the skull and the muzzle', () => {
    const { frames, lenses, glints } = partsOf(headOf('tabby', 'glasses'));
    const skull = SKULL.SCALE.map((s) => SKULL.R * s);
    for (const m of [frames, lenses, glints]) {
      const vs = verts(m);
      expect(Math.max(...vs.map((v) => depthIn(v, skull)))).toBeLessThanOrEqual(0.001);
      expect(Math.max(...vs.map((v) => depthIn(v, [0.09 * 1.25, 0.09 * 0.75, 0.09 * 0.9], [0, -0.06, -0.16])))).toBeLessThanOrEqual(0.001);
    }
  });

  it('the lens is a faint tint that never hides the eye', () => {
    for (const breed of ['tabby', 'hagrid']) {
      const head = headOf(breed, 'glasses');
      const { lenses, glints } = partsOf(head);
      const m = lenses.material;
      expect(m.transparent).toBe(true);
      expect(m.opacity).toBeGreaterThanOrEqual(0.25);
      expect(m.opacity).toBeLessThanOrEqual(0.35);
      expect(m.depthWrite).toBe(false);
      expect(m.color.getHex()).toBe(0xbfd8e8);
      // the glint: small, white, and in front of the lens
      expect(glints.material.color.getHex()).toBe(0xffffff);
      expect(glints.geometry.attributes.position.count).toBeLessThanOrEqual(2 * 7 * 5);
    }
    // cat: along each rim's facing (forward, turned out by its yaw), the lens
    // is beyond the eye's front, pupil and shine included
    {
      const head = headOf('tabby', 'glasses');
      const { lenses } = partsOf(head);
      const yaw = GLASSES.cat.yaw;
      for (const side of [-1, 1]) {
        const c = new THREE.Vector3(side * 0.083, 0.03, -0.17), n = new THREE.Vector3(side * Math.sin(yaw), 0, -Math.cos(yaw));
        const eyeParts = head.children.filter((o) => o.isMesh && !o.userData.glassesPart
          && [0.083, 0.07].includes(side * o.position.x) && [0.03, 0.048].includes(o.position.y));
        expect(eyeParts.length).toBe(3);
        const eyeFront = Math.max(...eyeParts.flatMap((o) => verts(o).map((v) => v.clone().sub(c).dot(n))));
        const lensBack = Math.min(...verts(lenses).filter((v) => Math.sign(v.x) === side).map((v) => v.clone().sub(c).dot(n)));
        expect(lensBack).toBeGreaterThan(eyeFront);
      }
    }
    // Hagrid: along each eye's skull normal, the lens is beyond the eye's front
    {
      const head = headOf('hagrid', 'glasses');
      const { lenses } = partsOf(head);
      for (const side of [-1, 1]) {
        const c = new THREE.Vector3(side * 0.09, 0.03, -0.1), n = henNormal(side);
        const eye = head.children.find((o) => o.isMesh && !o.userData.glassesPart && o.position.distanceTo(c) < 1e-9);
        const eyeFront = Math.max(...verts(eye).map((v) => v.clone().sub(c).dot(n)));
        const lens = verts(lenses).filter((v) => Math.sign(v.x) === side);
        const lensBack = Math.min(...lens.map((v) => v.clone().sub(c).dot(n)));
        expect(lensBack).toBeGreaterThan(eyeFront);
      }
    }
  });

  it('no part casts a shadow', () => {
    for (const breed of ['tabby', 'hagrid']) for (const face of ['glasses', 'sunglasses']) {
      for (const m of Object.values(partsOf(headOf(breed, face)))) {
        expect([breed, face, m.userData.glassesPart, m.castShadow, m.userData.noCast]).toEqual([breed, face, m.userData.glassesPart, false, true]);
      }
    }
  });
});
