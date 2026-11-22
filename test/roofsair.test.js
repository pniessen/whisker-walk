import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WASH, SMOKE, washSwayAt, swayAttribute, downwindSide, puffAt, puffShape, createRoofsSmoke, makeWashMaterial } from '../src/world/roofsair.js';
import { ROOFS_WIND, downwind } from '../src/world/roofsplan.js';

// =============================================================================
// What the wind moves on the Rooftops (Rooftops step 3, Task 5): the washing's
// sway (the shader's offset, on the CPU) and the chimney smoke's puffs.
// =============================================================================

const [WX, WZ] = downwind();
const TIMES = Array.from({ length: 400 }, (_, k) => k * 0.173);

describe('the wind', () => {
  it('blows from the vane\'s heading; downwind is the other way', () => {
    expect(ROOFS_WIND.from).toBe(0.6);
    expect(WX).toBeCloseTo(-Math.cos(0.6), 12);
    expect(WZ).toBeCloseTo(-Math.sin(0.6), 12);
    // a line's downwind side: unit, square to the line, and with the wind
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -2], [3, 4]]) {
      const [nx, nz] = downwindSide(dx, dz);
      expect(Math.hypot(nx, nz)).toBeCloseTo(1, 12);
      expect(nx * dx + nz * dz).toBeCloseTo(0, 12);
      expect(nx * WX + nz * WZ).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the washing', () => {
  it('the washing sways from its line: nothing on the line moves, the hem the most, always downwind, never more than 0.45 of its drop', () => {
    const [nx, nz] = downwindSide(1, 0);
    const out = {};
    for (const phase of [0, 1.3, 4.4]) {
      // on the line: still
      for (const t of TIMES) {
        washSwayAt({ x: 0, z: 0, phase }, t, WASH.amp, out);
        expect([out.x, out.y, out.z]).toEqual([0, 0, 0]);
      }
      // down it: further the lower, always downwind, never more than 0.45 of the drop
      for (const t of TIMES) {
        let last = 0;
        for (const depth of [0.1, 0.3, 0.5, 0.8]) {
          washSwayAt({ x: nx * depth, z: nz * depth, phase }, t, WASH.amp, out);
          const moved = Math.hypot(out.x, out.y, out.z);
          expect(moved).toBeGreaterThan(last);
          expect(moved).toBeLessThanOrEqual(0.45 * depth + 1e-12);
          expect(out.x * WX + out.z * WZ).toBeGreaterThan(0);
          expect(out.y).toBeGreaterThanOrEqual(0); // a swing lifts the hem, never pulls it down
          last = moved;
        }
      }
    }
  });

  it('it swings in time, and holds a still lean with no amplitude', () => {
    const [nx, nz] = downwindSide(0, 1);
    const hem = { x: nx * 0.6, z: nz * 0.6, phase: 2.1 };
    const out = {};
    const swing = TIMES.map((t) => Math.hypot(washSwayAt(hem, t, WASH.amp, out).x, out.z));
    expect(Math.max(...swing) - Math.min(...swing)).toBeGreaterThan(0.08);
    // the same at the same time
    expect(washSwayAt(hem, 7.25, WASH.amp, {})).toEqual(washSwayAt(hem, 7.25, WASH.amp, {}));
    // two things on a line with different phases swing apart
    const other = { ...hem, phase: hem.phase + 2 };
    expect(TIMES.some((t) => Math.abs(washSwayAt(hem, t, WASH.amp, {}).x - washSwayAt(other, t, WASH.amp, {}).x) > 0.03)).toBe(true);
    // no amplitude: the rest lean, downwind, the same at every time
    const still = TIMES.map((t) => washSwayAt(hem, t, 0, {}));
    for (const s of still) {
      expect(s.x).toBeCloseTo(hem.x * WASH.rest, 12);
      expect(s.z).toBeCloseTo(hem.z * WASH.rest, 12);
      expect(s.x * WX + s.z * WZ).toBeGreaterThan(0);
    }
    expect(washSwayAt(hem, 3, WASH.amp, out)).toBe(out); // filled in place
  });

  it('swayAttribute gives each vertex its drop under the line, on the line\'s downwind side', () => {
    const g = new THREE.PlaneGeometry(0.6, 0.8, 2, 4).toNonIndexed(); // in the plane z 0, top at y 0.4
    g.translate(3, 1.5, -2); // its top on a line at y 1.9
    const [nx, nz] = downwindSide(1, 0);
    expect(swayAttribute(g, { lineY: 1.9, nx, nz, phase: 0.75 })).toBe(g);
    const a = g.attributes.aSway;
    const p = g.attributes.position;
    expect(a.itemSize).toBe(3);
    expect(a.count).toBe(p.count);
    for (let i = 0; i < p.count; i++) {
      const depth = Math.max(0, 1.9 - p.getY(i));
      expect(a.getX(i)).toBeCloseTo(nx * depth, 6);
      expect(a.getY(i)).toBeCloseTo(nz * depth, 6);
      expect(a.getZ(i)).toBeCloseTo(0.75, 6);
      expect(a.getX(i) * WX + a.getY(i) * WZ).toBeGreaterThanOrEqual(0);
    }
    // a piece given no normal never moves
    const still = swayAttribute(new THREE.PlaneGeometry(1, 1).toNonIndexed(), { lineY: 5, nx: 0, nz: 0, phase: 0 });
    for (let i = 0; i < still.attributes.aSway.count; i++) {
      expect(Math.hypot(still.attributes.aSway.getX(i), still.attributes.aSway.getY(i))).toBe(0);
    }
  });

  it('the wash material keeps its uniforms and patches the cloth\'s vertex shader', () => {
    const mat = new THREE.MeshStandardMaterial();
    const u = makeWashMaterial(mat);
    expect(mat.userData.wash).toBe(u);
    expect(Object.keys(u).sort()).toEqual(['uWashAmp', 'uWashRest', 'uWashT']);
    expect(u.uWashRest.value).toBe(WASH.rest);
    expect(mat.customProgramCacheKey()).toBe('roofs-wash-v1');
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader };
    mat.onBeforeCompile(shader);
    expect(shader.uniforms.uWashT).toBe(u.uWashT);
    expect(shader.vertexShader).toContain('attribute vec3 aSway');
    expect(shader.vertexShader).toContain('transformed.xz += aSway.xy');
  });
});

describe('the smoke', () => {
  const pot = { x: -10, y: 8.72, z: 6.95 };

  it('smoke rises from its pot and drifts downwind, never more than 3.2 m up or 2.5 m away', () => {
    const out = {};
    for (const t of TIMES) {
      for (let i = 0; i < SMOKE.perPot; i++) {
        puffAt(pot, i, t, out);
        const up = out.y - pot.y;
        const [dx, dz] = [out.x - pot.x, out.z - pot.z];
        expect(up).toBeGreaterThanOrEqual(0);
        expect(up).toBeLessThanOrEqual(3.2);
        expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(2.5);
        // downwind of the pot the higher it is (the curl is small across the wind)
        expect(dx * WX + dz * WZ).toBeCloseTo((up / SMOKE.rise) * SMOKE.drift, 6);
        expect(Math.abs(dx * -WZ + dz * WX)).toBeLessThanOrEqual(0.2);
      }
    }
    // a puff rises with its age
    let last = -1;
    for (let t = 0; t < SMOKE.life * 0.9; t += 0.2) {
      puffAt(pot, 0, t, out);
      expect(out.y).toBeGreaterThan(last);
      last = out.y;
    }
    expect(puffAt(pot, 0, 1, out)).toBe(out); // filled in place
  });

  it('each puff is born and gone at alpha 0, only grows, and the column is the same at the same time', () => {
    const out = {};
    // puff i's birth: where its alpha is 0 and it is at the pot (found on a fine
    // sweep of one life), then again every SMOKE.life seconds
    for (let i = 0; i < SMOKE.perPot; i++) {
      let born = 0;
      let low = Infinity;
      for (let t = 0; t < SMOKE.life; t += 0.001) {
        const y = puffAt(pot, i, t, out).y - pot.y;
        if (y < low) { low = y; born = t; }
      }
      for (const k of [0, 1, 5]) {
        puffAt(pot, i, born + k * SMOKE.life + 1e-4, out);
        expect(out.a, `puff ${i} born`).toBeLessThan(0.01);
        expect(out.y - pot.y).toBeLessThan(0.01);
        expect(out.s).toBeCloseTo(SMOKE.size[0], 2);
        puffAt(pot, i, born + (k + 1) * SMOKE.life - 1e-4, out);
        expect(out.a, `puff ${i} gone`).toBeLessThan(0.01);
      }
      // over its life its alpha rises to 1 within the first 10%, holds, and
      // falls over the last 40%; its size only grows
      let last = -1;
      for (let u = 0.001; u < 1; u += 0.001) {
        puffAt(pot, i, born + u * SMOKE.life, out);
        expect(out.s).toBeGreaterThanOrEqual(last - 1e-12);
        last = out.s;
        expect(out.a).toBeGreaterThanOrEqual(0);
        expect(out.a).toBeLessThanOrEqual(1);
        if (u > 0.11 && u < 0.59) expect(out.a).toBeCloseTo(1, 9);
      }
      expect(last).toBeLessThanOrEqual(SMOKE.size[1] + 1e-12);
      expect(last).toBeGreaterThan(0.54);
    }
    // the same column at the same time; the seven spread over the column, unevenly
    const column = (t) => Array.from({ length: SMOKE.perPot }, (_, i) => puffAt(pot, i, t, {}));
    expect(column(12.34)).toEqual(column(12.34));
    const ys = column(2.5).map((q) => q.y).sort((a, b) => a - b);
    expect(ys.at(-1) - ys[0]).toBeGreaterThan(2);
    const gaps = ys.slice(1).map((y, k) => y - ys[k]);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(0.05);
    // each puff its own fixed turn and squash: the same every time, no two alike
    const shapes = Array.from({ length: SMOKE.perPot }, (_, i) => [...puffShape(pot, i)]);
    expect(shapes).toEqual(Array.from({ length: SMOKE.perPot }, (_, i) => [...puffShape(pot, i)]));
    expect(new Set(shapes.map((m) => m.map((v) => v.toFixed(4)).join())).size).toBe(SMOKE.perPot);
    for (const m of shapes) {
      for (let c = 0; c < 3; c++) {
        const len = Math.hypot(m[c * 3], m[c * 3 + 1], m[c * 3 + 2]);
        expect(len).toBeGreaterThanOrEqual(0.75 - 1e-6);
        expect(len).toBeLessThanOrEqual(1.15 + 1e-6);
      }
    }
  });

  it('the smoke is one mesh of 21 puffs, casting nothing; making it draws nothing on Math.random', () => {
    const pots = [pot, { x: 10, y: 8.57, z: 8.05 }, { x: -29.75, y: 8.66, z: 8.05 }];
    const scene = new THREE.Scene();
    const real = Math.random;
    let draws = 0;
    Math.random = () => { draws++; return real(); };
    let smoke;
    try {
      smoke = createRoofsSmoke(scene, pots, {});
      smoke.update(3.3);
    } finally {
      Math.random = real;
    }
    expect(draws).toBe(0);
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes).toEqual([smoke.mesh]);
    const m = smoke.mesh;
    expect(m.isInstancedMesh).toBe(true);
    expect(m.name).toBe('roofsSmoke');
    expect(m.count).toBe(21);
    expect(m.castShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
    expect(m.frustumCulled).toBe(false);
    const g = m.geometry;
    expect(g.attributes.position.count / 3).toBe(20); // an icosahedron
    // smooth: each vertex's normal is the sphere's, its own spot
    const [pos, nor] = [g.attributes.position, g.attributes.normal];
    for (let k = 0; k < pos.count; k++) {
      expect(Math.hypot(pos.getX(k), pos.getY(k), pos.getZ(k))).toBeCloseTo(1, 6);
      expect([nor.getX(k), nor.getY(k), nor.getZ(k)]).toEqual([pos.getX(k), pos.getY(k), pos.getZ(k)]);
    }
    expect(m.material.flatShading).toBe(false);
    expect(m.material.color.getHex()).toBe(0xc6c2be);
    expect(m.material.transparent).toBe(true);
    expect(m.material.opacity).toBe(0.35);
    expect(m.material.depthWrite).toBe(false);
    // its fragment shader fades the rim and the instance's aFade; its own program
    const shader = { vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <normal_fragment_begin>', uniforms: {} };
    m.material.onBeforeCompile(shader);
    expect(shader.vertexShader).toContain('vFade = aFade');
    expect(shader.fragmentShader).toContain('diffuseColor.a *= vFade * smoothstep(0.1, 0.8, abs(dot(normalize(vNormal), normalize(vViewPosition))))');
    expect(m.material.customProgramCacheKey()).toBe('roofs-smoke-v1');
    const fade = g.attributes.aFade;
    expect(fade.isInstancedBufferAttribute).toBe(true);
    expect(fade.count).toBe(21);
    // each puff where puffAt puts it, at its size
    const mat = new THREE.Matrix4();
    const [p, q, s] = [new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];
    pots.forEach((pt, k) => {
      for (let i = 0; i < SMOKE.perPot; i++) {
        m.getMatrixAt(k * SMOKE.perPot + i, mat);
        mat.decompose(p, q, s);
        const want = puffAt(pt, i, 3.3, {});
        expect(p.x).toBeCloseTo(want.x, 5);
        expect(p.y).toBeCloseTo(want.y, 5);
        expect(p.z).toBeCloseTo(want.z, 5);
        // its size times its own fixed shape; its alpha
        const shape = puffShape(pt, i);
        for (let c = 0; c < 3; c++) {
          for (let r = 0; r < 3; r++) expect(mat.elements[c * 4 + r]).toBeCloseTo(shape[c * 3 + r] * want.s, 5);
        }
        expect(fade.getX(k * SMOKE.perPot + i)).toBeCloseTo(want.a, 6);
      }
    });
    // update allocates no new buffers
    const [arr, farr] = [m.instanceMatrix.array, fade.array];
    smoke.update(4.4);
    expect(m.instanceMatrix.array).toBe(arr);
    expect(fade.array).toBe(farr);
    smoke.update(3.3);
    // under reduced motion it runs at half speed
    const slow = createRoofsSmoke(new THREE.Scene(), pots, { reducedMotion: true });
    slow.update(6.6);
    for (let n = 0; n < 21; n++) {
      const [a, b] = [new THREE.Matrix4(), new THREE.Matrix4()];
      slow.mesh.getMatrixAt(n, a);
      m.getMatrixAt(n, b);
      expect(a.elements.map((v) => +v.toFixed(5))).toEqual(b.elements.map((v) => +v.toFixed(5)));
      expect(slow.mesh.geometry.attributes.aFade.getX(n)).toBeCloseTo(fade.getX(n), 6);
    }
    // and it is taken away
    const disposed = [];
    m.geometry.addEventListener('dispose', () => disposed.push('geometry'));
    m.material.addEventListener('dispose', () => disposed.push('material'));
    smoke.dispose();
    slow.dispose();
    expect(scene.children).toEqual([]);
    expect(disposed.sort()).toEqual(['geometry', 'material']);
  });
});

// Rooftops step 5, Task 5 (R6): the warm chimney's smoke ring.
describe('the smoke ring', () => {
  const pot = { x: -10, y: 8.72, z: 6.95 };
  it('the ring rises, grows and fades over 3.2 s', async () => {
    const { RING, ringAt } = await import('../src/world/roofsair.js');
    expect(RING).toEqual({ time: 3.2, rise: 1.4, grow: 2.4, opacity: 0.75, drift: 0.5, every: 7 });
    expect(Object.isFrozen(RING)).toBe(true);
    const a = ringAt(0);
    expect(a.y).toBeCloseTo(0, 9);
    expect(a.scale).toBeCloseTo(1, 9);
    expect(a.opacity).toBeCloseTo(0.75, 9);
    expect(a.drift).toBeCloseTo(0, 9);
    const b = ringAt(1);
    expect(b.y).toBeCloseTo(1.4, 9);
    expect(b.scale).toBeCloseTo(2.4, 9);
    expect(b.opacity).toBeCloseTo(0, 9);
    expect(b.drift).toBeCloseTo(0.5, 9);
    let prev = ringAt(0);
    for (let k = 1; k <= 200; k++) {
      const r = ringAt(k / 200);
      expect(r.y).toBeGreaterThanOrEqual(prev.y);
      expect(r.scale).toBeGreaterThanOrEqual(prev.scale);
      expect(r.drift).toBeGreaterThanOrEqual(prev.drift);
      expect(r.opacity).toBeLessThanOrEqual(prev.opacity);
      prev = r;
    }
  });

  it('one mesh, at most 320 triangles, casting nothing, hidden between puffs', async () => {
    const { createSmokeRing, RING } = await import('../src/world/roofsair.js');
    const scene = new THREE.Scene();
    const real = Math.random;
    let draws = 0;
    Math.random = () => { draws++; return real(); };
    let ring;
    try {
      ring = createSmokeRing(scene, pot, {});
    } finally {
      Math.random = real;
    }
    expect(draws).toBe(0);
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes).toEqual([ring.mesh]);
    const m = ring.mesh;
    const g = m.geometry;
    // fix wave (M3): 8 x 20 sides, rounder than the 5 x 14 slab it was
    expect((g.index ? g.index.count : g.attributes.position.count) / 3).toBeLessThanOrEqual(320);
    expect([g.parameters.radius, g.parameters.tube, g.parameters.radialSegments, g.parameters.tubularSegments]).toEqual([0.16, 0.045, 8, 20]);
    expect(m.castShadow).toBe(false);
    expect(m.receiveShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
    expect(m.material.transparent).toBe(true);
    expect(m.material.depthWrite).toBe(false);
    // hidden until it puffs, and again once the puff is over
    expect(m.visible).toBe(false);
    ring.update(1);
    expect(m.visible).toBe(false);
    ring.puff();
    ring.update(0.1);
    expect(m.visible).toBe(true);
    // lying flat over the pot, drifting downwind as it rises
    const up = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
    expect(Math.abs(up.y)).toBeCloseTo(1, 6);
    ring.update(1.5);
    expect(m.position.y).toBeGreaterThan(pot.y);
    const along = (m.position.x - pot.x) * WX + (m.position.z - pot.z) * WZ;
    expect(along).toBeGreaterThan(0);
    expect(m.material.opacity).toBeLessThan(RING.opacity);
    ring.update(1.7);
    expect(m.visible).toBe(false);
    const disposed = [];
    g.addEventListener('dispose', () => disposed.push('geometry'));
    m.material.addEventListener('dispose', () => disposed.push('material'));
    ring.dispose();
    expect(scene.children).toEqual([]);
    expect(disposed.sort()).toEqual(['geometry', 'material']);
  });

  // Fix wave (M3): flat, the ring read as a slab from the follow camera.
  // Each puff tilts it 35 degrees toward where the camera is at the puff.
  it('each puff tilts it 35 degrees toward the camera, turned about the up axis to face it', async () => {
    const { createSmokeRing, RING_TILT } = await import('../src/world/roofsair.js');
    expect(RING_TILT).toBeCloseTo(35 * Math.PI / 180, 12);
    const ring = createSmokeRing(new THREE.Scene(), pot, {});
    const m = ring.mesh;
    for (const eye of [{ x: pot.x + 4, y: pot.y + 2, z: pot.z }, { x: pot.x - 3, y: pot.y + 1, z: pot.z - 3 }, { x: pot.x, y: pot.y + 3, z: pot.z + 5 }]) {
      ring.puff(eye);
      ring.update(0.4);
      m.updateMatrixWorld(true);
      const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
      if (axis.y < 0) axis.negate(); // the hole's top side
      expect(Math.acos(axis.y)).toBeCloseTo(35 * Math.PI / 180, 6);
      // it leans toward the camera, in the camera's own bearing from the pot
      const lean = Math.atan2(axis.x, axis.z);
      expect(Math.abs(Math.atan2(Math.sin(lean - Math.atan2(eye.x - pot.x, eye.z - pot.z)), Math.cos(lean - Math.atan2(eye.x - pot.x, eye.z - pot.z))))).toBeLessThan(1e-6);
      // so the camera sees more of the hole than it would of a flat ring
      const toEye = new THREE.Vector3(eye.x - m.position.x, eye.y - m.position.y, eye.z - m.position.z).normalize();
      expect(axis.dot(toEye)).toBeGreaterThan(toEye.y);
    }
    // no camera given: flat, as before
    ring.puff();
    const up = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);
    expect(Math.abs(up.y)).toBeCloseTo(1, 9);
    ring.dispose();
  });

  it('half speed under reduced motion', async () => {
    const { createSmokeRing } = await import('../src/world/roofsair.js');
    const fast = createSmokeRing(new THREE.Scene(), pot, {});
    const slow = createSmokeRing(new THREE.Scene(), pot, { reducedMotion: true });
    fast.puff();
    slow.puff();
    for (let k = 0; k < 97; k++) {
      fast.update(1 / 30);
      slow.update(1 / 30);
    }
    // just past 3.2 s: the quick ring is gone, the slow one half way
    expect(fast.mesh.visible).toBe(false);
    expect(slow.mesh.visible).toBe(true);
    expect(slow.mesh.material.opacity).toBeGreaterThan(0);
    for (let k = 0; k < 96; k++) slow.update(1 / 30); // just past 6.4 s
    expect(slow.mesh.visible).toBe(false);
    fast.dispose();
    slow.dispose();
  });
});
