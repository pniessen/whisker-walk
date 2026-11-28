// The Treehouse, beauty pass 2 (2026-11-28): colour, light and wind with no new geometry (treehouseglow.js), pollen motes, gust-led leaves, a chime that answers the cat.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const G = await import('../src/world/treehouseglow.js');
const C = await import('../src/world/treehousecritters.js');
const P = await import('../src/world/treehouseplan.js');
const { K } = { K: await import('../src/world/treehouseparts.js') };

describe('lamp pools and gusts', () => {
  it('lampPoints: every deck corner, bridge end and hut window, all over the walk', () => {
    const l = G.lampPoints();
    expect(l.length).toBe(P.DECKS.length * 2 + P.BRIDGE_LINES.length * 2 + P.DECKS.filter((k) => k.hut).length);
    for (const p of l) { expect(Math.abs(p.x)).toBeLessThan(40); expect(p.y).toBeGreaterThan(1); expect(p.w).toBeGreaterThan(0); }
  });
  it('skyPatch patches both lit materials, adds no mesh, picks the lamps nearest the cat, and holds still under reduced motion and on LITE', () => {
    const M = K.treehouseMaterials();
    const sky = G.skyPatch(M);
    expect(M.paint.userData.sky).toBe(sky); expect(M.leaves.userData.sky).toBe(sky);
    const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>' };
    M.leaves.onBeforeCompile(shader);
    expect(shader.vertexShader).toContain('uSway'); expect(shader.fragmentShader).toContain('uLamp');
    const cat = { x: -12, y: 1.4, z: 10 };
    sky.update(10, cat, false, 'high');
    const live = sky.uniforms.uLamp.value.filter((v) => v.w > 0);
    expect(live.length).toBe(G.LIVE.high);
    const near = Math.min(...G.lampPoints().map((l) => Math.hypot(l.x - cat.x, l.z - cat.z)));
    expect(Math.min(...live.map((v) => Math.hypot(v.x - cat.x, v.z - cat.z)))).toBeCloseTo(near, 5);
    sky.update(10, cat, false, 'lite'); expect(sky.uniforms.uLamp.value.filter((v) => v.w > 0).length).toBe(G.LIVE.lite); expect(sky.uniforms.uSway.value).toBe(0);
    sky.update(10, cat, true, 'high'); expect(sky.uniforms.uTime.value).toBe(0); expect(sky.uniforms.uSway.value).toBe(0);
  });
});

describe('the life', () => {
  it('motes drift up through the village, dim, and the falling leaves lean on the gust', () => {
    const o = {};
    for (let k = 0; k < C.COUNTS.high.motes; k++) for (const t of [0, 31, 77]) { C.moteAt(k, t, o); expect(o.y).toBeGreaterThan(1); expect(o.y).toBeLessThan(8.3); expect(o.glow).toBeGreaterThan(0.1); expect(o.glow).toBeLessThan(0.5); }
    expect(C.COUNTS.high.motes).toBeGreaterThan(C.COUNTS.low.motes); expect(C.COUNTS.lite.motes).toBe(0);
    const a = {}; const b = {};
    C.leafAt(3, 5, a); C.leafAt(3, 5, b); expect(a.x).toBe(b.x);
  });
  it('a chime answers the cat that brushes past it, once, then rests', () => {
    const c = C.CHIME_SPOTS[0];
    expect(C.nearChime(c.x, c.y - 2.2, c.z)).toBe(true);
    expect(C.nearChime(0, 0, 25)).toBe(false);
    let rings = 0;
    const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => ({ connect() {}, gain: param(), frequency: param(), start() { rings++; }, stop() {} });
    const ac = { currentTime: 0, destination: {}, createGain: node, createOscillator: node };
    const audio = { isMuted: () => false, getContext: () => ac };
    const life = C.createTreehouseCritters({ scene: new THREE.Scene(), audio });
    const at = { x: c.x, y: c.y - 2.2, z: c.z };
    life.update(0.1, 1, { x: 0, y: 0, z: 25 }); const base = rings;
    life.update(0.1, 2, at); expect(rings).toBeGreaterThan(base);
    const after = rings;
    life.update(0.1, 3, at); life.update(0.1, 4, { x: 0, y: 0, z: 25 }); life.update(0.1, 5, at); expect(rings).toBe(after);
    life.dispose();
  });
});
