import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { createVista, VISTAS, vistaWeight, bestVista, goldenAt, GOLDEN } = await import('../src/world/snowvillevista.js');
const { createSnowvilleLight } = await import('../src/world/snowvillelight.js');

const camAt = (x, z, dx, dz) => { const c = new THREE.PerspectiveCamera(70, 16 / 9); c.position.set(x - dx * 4.4, 2.9, z - dz * 4.4); c.lookAt(x, 0.6, z); c.updateMatrixWorld(); return c; };
const faceOf = (v) => { const l = Math.hypot(v.fx - v.x, v.fz - v.z); return [(v.fx - v.x) / l, (v.fz - v.z) / l]; };
function fakeAudio() { const log = { osc: 0 }; const p = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }); const n = () => ({ connect() {}, start() {}, stop() {}, gain: p(), frequency: p(), type: '' }); const ac = { currentTime: 0, destination: {}, createGain: n, createOscillator: () => { log.osc++; return n(); } }; return { log, isMuted: () => false, getContext: () => ac, getMaster: () => null }; }

describe('snowville beauty pass 7: photogenic vistas', () => {
  it('five spots, each held only near it and facing its focus', () => {
    expect(VISTAS).toHaveLength(5);
    for (const v of VISTAS) { const [dx, dz] = faceOf(v); expect(vistaWeight(v, v.x, v.z, dx, dz)).toBeCloseTo(1, 5); expect(vistaWeight(v, v.x, v.z, -dx, -dz)).toBe(0); expect(vistaWeight(v, v.x + 9, v.z, dx, dz)).toBe(0); expect(bestVista(v.x, v.z, dx, dz).v).toBe(VISTAS.indexOf(v)); }
  });
  it('draws only two Points (no mesh, no caster), grades the light while held and puts it back', () => {
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xe8e0ea, 22, 120);
    const sun = new THREE.DirectionalLight(0xffd7a2); const fill = new THREE.HemisphereLight(0xc4d6ee, 0x8d8c93);
    const was = sun.color.getHex(); const vi = createVista({ scene, sun, fill });
    expect(scene.children.filter((o) => o.isMesh)).toHaveLength(0); const pts = scene.children.filter((o) => o.isPoints); expect(pts.map((o) => o.name).sort()).toEqual(['snowville:vista', 'snowville:vistaglow']);
    for (const o of pts) expect(o.userData.noCast).toBe(true);
    const v = VISTAS[0]; const [dx, dz] = faceOf(v); const cam = camAt(v.x, v.z, dx, dz); const f0 = fill.color.r;
    for (let i = 0; i < 80; i++) { fill.color.setHex(0xc4d6ee); scene.fog.color.setHex(0xe8e0ea); vi.update(0.1, i * 0.1, { x: v.x, y: 0, z: v.z }, cam); }
    expect(vi.weight).toBeGreaterThan(0.9); expect(fill.color.r).toBeGreaterThan(f0); expect(sun.color.r).toBeGreaterThan(new THREE.Color(was).r); expect(pts.every((o) => o.visible)).toBe(true);
    const aS = pts[0].geometry.attributes.aS.array; expect(Array.from(aS).filter((x) => x > 0).length).toBeGreaterThan(12);
    vi.enabled = false; for (let i = 0; i < 80; i++) vi.update(0.1, 8 + i * 0.1, { x: v.x, y: 0, z: v.z }, cam); expect(vi.weight).toBe(0); expect(pts.some((o) => o.visible)).toBe(false);
    vi.dispose(); expect(sun.color.getHex()).toBe(was); expect(scene.children.filter((o) => o.isPoints)).toHaveLength(0);
  });
  it('the golden moment: after three still seconds, once per spot, with a soft chime only on a real audio object', () => {
    const scene = new THREE.Scene(); const audio = fakeAudio(); const vi = createVista({ scene, audio, sun: null, fill: null });
    const v = VISTAS[3]; const [dx, dz] = faceOf(v); const cam = camAt(v.x, v.z, dx, dz); const pos = { x: v.x, y: 0, z: v.z }; let t = 0;
    for (let i = 0; i < 20; i++) { vi.update(0.1, t, pos, cam); t += 0.1; } expect(vi.state.count).toBe(0);
    for (let i = 0; i < 25; i++) { vi.update(0.1, t, pos, cam); t += 0.1; } expect(vi.state.count).toBe(1); expect(audio.log.osc).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) { vi.update(0.1, t, pos, cam); t += 0.1; } expect(vi.state.count).toBe(1);
    const m = { x: 0, y: 0, z: 0, a: 0 }; expect(goldenAt(0, 0, pos, v, m).a).toBe(0); expect(goldenAt(0, 2, pos, v, m).a).toBeGreaterThan(0); expect(goldenAt(0, GOLDEN.dur + 1, pos, v, m).a).toBe(0);
    const bare = createVista({ scene: new THREE.Scene(), audio: {} }); for (let i = 0; i < 60; i++) bare.update(0.1, i * 0.1, pos, cam); expect(bare.state.count).toBe(1);
    vi.dispose(); bare.dispose();
  });
  it('reduced motion is still: no moment, the composition snaps and holds; walking breaks the stillness', () => {
    const scene = new THREE.Scene(); const audio = fakeAudio(); const vi = createVista({ scene, audio, reducedMotion: true });
    const v = VISTAS[1]; const [dx, dz] = faceOf(v); const cam = camAt(v.x, v.z, dx, dz); const pos = { x: v.x, y: 0, z: v.z };
    for (let i = 0; i < 80; i++) vi.update(0.1, i * 0.1, pos, cam); expect(vi.weight).toBeCloseTo(1, 5); expect(vi.state.count).toBe(0); expect(audio.log.osc).toBe(0);
    const live = createVista({ scene: new THREE.Scene() }); let t = 0; for (let i = 0; i < 60; i++) { live.update(0.1, t, { x: v.x + (i % 2) * 0.3, y: 0, z: v.z }, cam); t += 0.1; } expect(live.state.count).toBe(0);
    vi.dispose(); live.dispose();
  });
  it('the light builds it, with the lite rung drawing fewer dots', () => {
    const mk = (tier) => { const scene = new THREE.Scene(); const l = createSnowvilleLight({ scene, tier, season: 'deep' }); const n = scene.getObjectByName('snowville:vistaglow').geometry.attributes.position.count; l.dispose(); return n; };
    expect(mk({ name: 'high', shadows: true })).toBeGreaterThan(mk({ name: 'low', rung: 5, shadows: false }));
  });
});
