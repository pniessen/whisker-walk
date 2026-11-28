// Greenhouse beauty pass 9: night life. Points slots and uniforms only; no mesh, triangle or caster.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();
const N = await import('../src/world/greenhousenight.js');
const { createCreatures } = await import('../src/world/greenhousecreatures.js');
const { build } = await import('../src/world/greenhouse.js');
const { NIGHT } = await import('../src/world/greenhouseglass.js');

const BEFORE = { meshes: 74, triangles: 58693 }; // pass 8's after
const mk = (o = {}) => { const scene = new THREE.Scene(); const c = createCreatures({ scene, dusk: !!o.dusk, lite: !!o.lite }); const hoots = []; const n = N.createNight({ pool: c.pool, scene, hoot: (l) => hoots.push(l), ...o }); return { c, n, hoots }; };
const shown = (c) => { const a = c.points.geometry.attributes; let k = 0; for (let i = 0; i < a.aSize.count; i++) if (a.aSize.array[i] > 0 && a.color.array[i * 4 + 3] > 0.05) k++; return k; };
const run = (m, secs, cat = { x: 0, y: 0, z: -3 }) => { for (let i = 0; i < secs * 30; i++) { m.n.update(1 / 30, i / 30, cat, { x: 0, y: 2, z: 2 }); m.c.update(1 / 30, i / 30, cat, false); } };

describe('pass 9: the build', () => {
  it('adds no mesh and no triangle', () => {
    const scene = new THREE.Scene(); build(scene, {});
    let meshes = 0, triangles = 0;
    scene.traverse((o) => { if (!o.isMesh) return; meshes++; const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; });
    expect(meshes).toBeLessThanOrEqual(BEFORE.meshes); expect(triangles).toBeLessThanOrEqual(BEFORE.triangles);
  });
  it('uses no random number, no clock and no new three.js symbol', () => {
    const src = readFileSync(new URL('../src/world/greenhousenight.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date|DataTexture|THREE\./);
  });
});
describe('the night', () => {
  it('reads the hour: dark 21 to 5, ramps either side, none at noon', () => {
    expect(N.nightLook(23)).toBe(1); expect(N.nightLook(3)).toBe(1); expect(N.nightLook(12)).toBe(0); expect(N.nightLook(20)).toBeCloseTo(0.5); expect(N.nightLook(5.75)).toBeCloseTo(0.5);
  });
  it('a dusk walk at night shows stars, glows and visitors, sets the night uniform, and hoots now and then', () => {
    const m = mk({ dusk: true, hour: 23 }); run(m, 40); expect(shown(m.c)).toBeGreaterThan(50); expect(NIGHT.value).toBeGreaterThan(0.9); expect(m.hoots.length).toBeGreaterThanOrEqual(1); expect(m.hoots.length).toBeLessThanOrEqual(4);
    m.n.dispose(); expect(NIGHT.value).toBe(0);
  });
  it('a day walk shows none of it; the real night alone shows only the creatures, no grade', () => {
    const d = mk({ hour: 12 }); run(d, 3); expect(NIGHT.value).toBe(0);
    const day = shown(d.c);
    const r = mk({ hour: 23 }); run(r, 3); expect(NIGHT.value).toBe(0); expect(shown(r.c)).toBeGreaterThan(day);
    const off = mk({ dusk: true, hour: 23, enabled: false }); run(off, 40); expect(off.hoots.length).toBe(0); expect(NIGHT.value).toBe(0);
  });
  it('reduced motion holds everything still; lite draws fewer', () => {
    const a = mk({ dusk: true, hour: 23, reducedMotion: true }); run(a, 1); const p1 = Array.from(a.c.points.geometry.attributes.position.array.slice(-90)); run(a, 2); expect(Array.from(a.c.points.geometry.attributes.position.array.slice(-90))).toEqual(p1);
    const f = mk({ dusk: true, hour: 23 }); run(f, 1); const l = mk({ dusk: true, hour: 23, lite: true }); run(l, 1); expect(shown(l.c)).toBeLessThan(shown(f.c));
  });
  it('a muted or missing hoot never throws', () => {
    const m = mk({ dusk: true, hour: 23, hoot: () => { throw new Error('x'); } }); expect(() => run(m, 30)).not.toThrow();
  });
});
