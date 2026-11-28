// The Jungle lodge, beauty pass 9: night life. Points and a grade only: no mesh, no triangle, no caster.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();
const N = await import('../src/world/junglebeauty9.js');
const { dayAt, DAY } = await import('../src/world/junglereact.js');
const { beauty2Plan } = await import('../src/world/junglebeauty2.js');

const plan = beauty2Plan(); const o = { x: 0, y: 0, z: 0, g: 0, size: 1 }; const cat = { x: 0, z: 20 };
const lit = (pts, t, n, hoot = { t: -9, i: -1 }) => pts.filter((p) => N.nightPoint(p, t, n, cat, hoot, o).g > 0.01).length;

describe('the night', () => {
  it('is deep about a day phase of 0.92 and gone at noon', () => {
    expect(dayAt((0.92 - 0.12) * DAY).night).toBeGreaterThan(0.9); expect(dayAt((0.42 - 0.12) * DAY).night).toBe(0); expect(dayAt(0).night).toBe(0);
  });
  it('points are dark by day, lit at night, and fewer on the lower rungs', () => {
    const hi = N.nightPlan('high', plan); expect(hi.length).toBeLessThan(100); expect(lit(hi, 100, 0)).toBe(0); expect(lit(hi, 340, 1)).toBeGreaterThan(40);
    expect(N.nightPlan('lite', plan).length).toBeLessThan(N.nightPlan('low', plan).length); expect(N.nightPlan('low', plan).length).toBeLessThan(hi.length);
  });
  it('an owl\'s eyes brighten with its hoot, and the shy eyes fade as she comes near', () => {
    const hi = N.nightPlan('high', plan); const eye = hi.find((p) => p.k === 'oe');
    let a = 0; let b = 0; for (let t = 300; t < 330; t += 0.5) { a = Math.max(a, N.nightPoint(eye, t, 1, cat, { t: -9, i: -1 }, o).g); b = Math.max(b, N.nightPoint(eye, t, 1, cat, { t, i: eye.i }, o).g); } expect(b).toBeGreaterThan(a);
    const ge = hi.find((p) => p.k === 'ge'); const near = { x: ge.x, z: ge.z + 0.3 }; let far = 0; let close = 0;
    for (let t = 300; t < 310; t += 0.25) { far = Math.max(far, N.nightPoint(ge, t, 1, { x: ge.x, z: ge.z + 30 }, { t: -9, i: -1 }, o).g); close = Math.max(close, N.nightPoint(ge, t, 1, near, { t: -9, i: -1 }, o).g); }
    expect(far).toBeGreaterThan(0.3); expect(close).toBe(0);
  });
});

describe('the moonlit grade', () => {
  it('dims the sun, cools the fill and deepens the haze, and does nothing by day', () => {
    const mk = () => ({ sun: Object.assign(new THREE.DirectionalLight(0xffffff, 1)), fill: new THREE.HemisphereLight(0xffffff, 0x888888, 1), scene: Object.assign(new THREE.Scene(), { environmentIntensity: 1 }), fog: new THREE.Fog(0xaaccaa, 10, 100) });
    const d = mk(); N.gradeNight(0, d); expect(d.sun.intensity).toBe(1); expect(d.fog.near).toBe(10);
    const n = mk(); N.gradeNight(1, n); expect(n.sun.intensity).toBeLessThan(0.4); expect(n.fill.color.b).toBeGreaterThan(n.fill.color.r); expect(n.fog.color.b).toBeLessThan(0.2); expect(n.scene.environmentIntensity).toBeLessThan(0.5);
  });
});
