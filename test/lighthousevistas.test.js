// Lighthouse Point, beauty pass 7: photogenic vistas. Net zero triangles, no mesh, no caster; the chime only on the game's own audio.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VISTAS, vistaAt, easeVista, newGolden, goldenStep, GOLDEN, createLighthouseVistas, gradeVista } from '../src/world/lighthousebeauty7.js';
import { createLighthouseSound } from '../src/world/lighthousesound.js';

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' }) }) };

describe('the five vistas', () => {
  it('are found by where she stands and nowhere else', () => {
    expect(VISTAS.length).toBe(5);
    VISTAS.forEach((s, i) => { const o = vistaAt(s.x, s.z); expect(o.v).toBe(i); expect(o.w).toBe(1); });
    expect(vistaAt(-40, 30).v).toBe(-1);
  });
  it('ease in and out with no jump', () => {
    const st = { v: -1, w: 0 }; const tg = vistaAt(14, 36);
    for (let i = 0; i < 30; i++) easeVista(st, tg, 1 / 30);
    expect(st.v).toBe(0); expect(st.w).toBeGreaterThan(0.4); expect(st.w).toBeLessThan(0.95);
    for (let i = 0; i < 200; i++) easeVista(st, vistaAt(-40, 30), 1 / 30);
    expect(st.w).toBe(0);
  });
});

describe('the golden moment', () => {
  it('comes after three still seconds, once, and not again until she leaves', () => {
    const g = newGolden(); let n = 0; let peak = 0;
    for (let i = 0; i < 30 * 40; i++) { if (goldenStep(g, 1 / 30, 1, false)) n++; peak = Math.max(peak, g.k); }
    expect(n).toBe(1); expect(peak).toBeGreaterThan(0.9); expect(g.k).toBe(0);
    for (let i = 0; i < 10; i++) goldenStep(g, 1 / 30, 0, false);
    for (let i = 0; i < 30 * (GOLDEN.still + 1); i++) if (goldenStep(g, 1 / 30, 1, false)) n++;
    expect(n).toBe(2);
  });
  it('does not come while she walks', () => {
    const g = newGolden(); let n = 0;
    for (let i = 0; i < 30 * 20; i++) if (goldenStep(g, 1 / 30, 1, true)) n++;
    expect(n).toBe(0);
  });
  it('the chime sounds only on the game audio object, silent when muted, no throw on a bare stub', () => {
    expect(() => createLighthouseSound({}).chime()).not.toThrow();
    expect(createLighthouseSound(null).chime()).toBe(false);
  });
});

describe('the vistas add no mesh, triangle or caster', () => {
  it('only three Points, the grade restored by the weather, all gone on dispose', () => {
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xf0c080, 45, 160);
    const sun = new THREE.DirectionalLight(0xffb066, 1.2); const fill = new THREE.HemisphereLight(0xaab4dc, 0x886644, 0.62);
    scene.add(sun, fill);
    const before = scene.children.length; let chimes = 0;
    const v = createLighthouseVistas({ scene, ground: { y: () => 0 } });
    expect(scene.children.length - before).toBe(3);
    expect(scene.children.filter((o) => o.isMesh).length).toBe(0);
    const cat = { x: 14, y: 0, z: 36 };
    const wx = { state: { storm: 0, fog: 0, stars: 0 }, rig: { sun, fill, fog: scene.fog } };
    for (let i = 0; i < 30 * 5; i++) { v.update(1 / 30, i / 30, cat, wx, { chime: () => chimes++ }); sun.intensity = 1.2; }
    expect(chimes).toBe(1); expect(v.spark.visible).toBe(true);
    v.update(1 / 30, 9, cat, wx, null);
    expect(sun.intensity).toBeGreaterThan(1.2);
    v.dispose(); expect(scene.children.length).toBe(before);
  });
  it('reduced motion never chimes; the grade does nothing outside a vista', () => {
    const scene = new THREE.Scene(); const sun = new THREE.DirectionalLight(0xffb066, 1.2);
    const v = createLighthouseVistas({ scene, reducedMotion: true }); let chimes = 0;
    for (let i = 0; i < 300; i++) v.update(1 / 30, i / 30, { x: 14, y: 0, z: 36 }, null, { chime: () => chimes++ });
    expect(chimes).toBe(0);
    gradeVista({ v: -1, w: 0 }, 0, { sun }); expect(sun.intensity).toBe(1.2);
    v.dispose();
  });
});
