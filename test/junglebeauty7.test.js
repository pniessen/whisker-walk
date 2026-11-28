// The Jungle lodge, beauty pass 7: photogenic vistas. Net zero triangles, no mesh, no caster.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const V = await import('../src/world/junglebeauty7.js');
const B = await import('../src/world/junglebeauty2.js');

const mk = (o = {}) => B.createJungleBeauty2({ scene: new THREE.Scene(), reducedMotion: false, tier: { name: 'high' }, ...o });

describe('the five vistas', () => {
  it('are found by where she stands, strongest on the spot, nothing far from them', () => {
    expect(V.VISTAS.length).toBe(5);
    V.VISTAS.forEach((s, i) => { const o = V.vistaAt(s.x, s.z); expect(o.v).toBe(i); expect(o.w).toBe(1); });
    expect(V.vistaAt(-40, -30).w).toBe(0); expect(V.vistaAt(-40, -30).v).toBe(-1);
  });
  it('ease in and out without a jump', () => {
    const st = { v: -1, w: 0 }; const tg = V.vistaAt(0, 31.5);
    for (let i = 0; i < 30; i++) V.easeVista(st, tg, 1 / 30); expect(st.v).toBe(0); expect(st.w).toBeGreaterThan(0.4); expect(st.w).toBeLessThan(0.9);
    for (let i = 0; i < 200; i++) V.easeVista(st, V.vistaAt(-40, -30), 1 / 30); expect(st.w).toBe(0); expect(st.v).toBe(-1);
  });
});

describe('the golden moment', () => {
  it('comes after three still seconds in a vista, once, and not again until she has left', () => {
    const g = V.newGolden(); let n = 0; let peak = 0;
    for (let i = 0; i < 30 * 40; i++) { if (V.goldenStep(g, 1 / 30, 1, false)) n++; peak = Math.max(peak, g.k); }
    expect(n).toBe(1); expect(peak).toBeGreaterThan(0.9); expect(g.k).toBe(0);
    for (let i = 0; i < 10; i++) V.goldenStep(g, 1 / 30, 0, false);
    for (let i = 0; i < 30 * 4; i++) if (V.goldenStep(g, 1 / 30, 1, false)) n++;
    expect(n).toBe(2);
  });
  it('does not come while she walks or outside a vista', () => {
    const g = V.newGolden(); let n = 0;
    for (let i = 0; i < 30 * 20; i++) { if (V.goldenStep(g, 1 / 30, 1, true)) n++; if (V.goldenStep(g, 1 / 30, 0.1, false)) n++; }
    expect(n).toBe(0);
  });
});

describe('the points and the grade', () => {
  it('lower rungs keep fewer, and the points show only inside a vista', () => {
    expect(V.vistaPoints('lite').length).toBeLessThan(V.vistaPoints('low').length); expect(V.vistaPoints('low').length).toBeLessThan(V.vistaPoints('high').length);
    const o = { size: 1 }; const c = { x: 0, z: 31.5 };
    for (const p of V.vistaPoints('high')) { expect(V.vistaPoint(p, 5, { v: -1, w: 0 }, 0, c, 0, o).g).toBe(0); }
    let on = 0; for (const p of V.vistaPoints('high')) on += V.vistaPoint(p, 5, { v: 0, w: 1 }, 1, c, 0, o).g; expect(on).toBeGreaterThan(0.5);
    let wet = 0; for (const p of V.vistaPoints('high')) wet += V.vistaPoint(p, 5, { v: 0, w: 1 }, 0, c, 1, o).g; expect(wet).toBeLessThan(on / 3);
  });
  it('the grade does nothing outside a vista and warms the sun and fill inside one', () => {
    const mkL = () => ({ fog: { color: new THREE.Color(0.3, 0.5, 0.4), near: 10, far: 100 }, sun: { color: new THREE.Color(0.8, 0.8, 0.8), intensity: 1 }, fill: { color: new THREE.Color(0.5, 0.6, 0.7), intensity: 1 }, scene: { environmentIntensity: 1 } });
    const a = mkL(); V.gradeVista({ v: -1, w: 0 }, a); expect(a.sun.intensity).toBe(1); expect(a.fog.near).toBe(10);
    const b = mkL(); V.gradeVista({ v: 0, w: 1 }, b); expect(b.sun.color.r - b.sun.color.b).toBeGreaterThan(0.2); expect(b.fill.color.r).toBeGreaterThan(0.5); expect(b.fog.near).toBeLessThan(10); expect(b.scene.environmentIntensity).toBeLessThan(1);
    const c = V.vistaCloth({ v: 0, w: 1 }, [1, 1, 1]); expect(c[0]).toBeLessThan(1); expect(V.vistaShaft({ v: 0, w: 1 })).toBeGreaterThan(1);
  });
  it('adds points only: no new mesh and no triangle, and a still stand in a vista chimes once on the walk audio', () => {
    const rec = []; const node = () => new Proxy(function () {}, { get: (_t, k) => node(), apply: () => node(), set: (_o, k, v) => { if (k === 'value' && [784, 880, 1047, 1175, 1319].includes(v)) rec.push(v); return true; } });
    const ac = new Proxy({ currentTime: 0, sampleRate: 8000, destination: {} }, { get: (o, k) => (k in o ? o[k] : () => node()) });
    const audio = { isMuted: () => false, getContext: () => ac };
    const a = mk({ audio }); const bare = mk(); const kids = (x) => x.motes.parent?.children?.length ?? 0; void kids;
    expect(a.counts.swayTriangles).toBe(bare.counts.swayTriangles);
    for (let i = 0; i < 30 * 8; i++) a.update(1 / 30, 100 + i / 30, { x: 0, z: 31.5 }, 0, null);
    expect(rec.length).toBeGreaterThan(0);
    const n = rec.length; for (let i = 0; i < 30 * 8; i++) a.update(1 / 30, 400 + i / 30, { x: 0, z: 31.5 }, 0, null); expect(rec.length).toBe(n);
  });
});
