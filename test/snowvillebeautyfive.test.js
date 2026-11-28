import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { createLiving, breathAt, hourAt, wakeAt, hareStep, hopY, BREATH_PERIOD } = await import('../src/world/snowvilleliving.js');
const { createSnowvilleLight } = await import('../src/world/snowvillelight.js');
const { createZoneBed, zoneWeights, villageBell, chimeClock } = await import('../src/world/snowvillesound.js');
const { SHARED, smokeLean } = await import('../src/world/snowvillealive.js');
const P = await import('../src/world/snowvilleplan.js');

function fakeAudio() {
  const log = { osc: 0, src: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = () => ({ connect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '' });
  const ac = { currentTime: 0, sampleRate: 8000, destination: {}, createGain: node, createBiquadFilter: node, createOscillator: () => { log.osc++; return node(); }, createBufferSource: () => { log.src++; return { ...node(), buffer: null, loop: false }; }, createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }) };
  return { log, isMuted: () => false, getContext: () => ac, getMaster: () => null };
}
const cam = () => { const c = new THREE.PerspectiveCamera(); c.position.set(0, 3, 14); c.lookAt(0, 1, 5); c.updateMatrixWorld(); return c; };

describe('snowville beauty pass 5: living creatures and one shared world', () => {
  it('draws only Points (no mesh, no caster) and puts the ground and sun back', () => {
    const scene = new THREE.Scene(); const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff })); g.name = 'snowville:ground'; scene.add(g);
    const sun = new THREE.DirectionalLight(0xffd7a2); const before = sun.color.getHex();
    const l = createLiving({ scene, sun });
    expect(scene.children.filter((o) => o.isMesh)).toHaveLength(1); expect(scene.children.filter((o) => o.isPoints).map((o) => o.name).sort()).toEqual(['snowville:living', 'snowville:skyband']);
    for (const o of scene.children.filter((x) => x.isPoints)) expect(o.userData.noCast).toBe(true);
    const c = cam(); for (let i = 0; i < 400; i++) l.update(0.1, 240 + i * 0.1, { x: -2, y: 0, z: 12 }, c);
    expect(SHARED.hour).toBeLessThan(0.6); expect(g.material.color.b).toBeGreaterThan(g.material.color.r);
    l.dispose(); expect(g.material.color.getHex()).toBe(0xffffff); expect(sun.color.getHex()).toBe(before); expect(scene.children.filter((o) => o.isPoints)).toHaveLength(0);
  });
  it('the arrival: a bell, a flurry and windows that wake in a sequence along the lane; asleep before', () => {
    const audio = fakeAudio(); const scene = new THREE.Scene(); const l = createLiving({ scene, audio });
    expect(l.wakeAt(0, 0, 0)).toBe(0.5);
    const c = cam(); l.update(0.1, 1, { x: 0, y: 0, z: 30 }, c); expect(l.state.arrivals).toBe(0);
    l.update(0.1, 2, { x: -2, y: 0, z: 12 }, c); expect(l.state.arrivals).toBe(1); expect(audio.log.osc).toBeGreaterThanOrEqual(3);
    const near = l.wakeAt(-2, 12, 2.5); const far = l.wakeAt(30, 12, 2.5); expect(near).toBeGreaterThan(far); expect(l.wakeAt(30, 12, 12)).toBe(1);
    l.update(0.1, 3, { x: -2, y: 0, z: 12 }, c); expect(l.state.arrivals).toBe(1); // (not again while she stays)
    const w = scene.getObjectByName('snowville:living').geometry.attributes.aS.array; expect(Array.from(w).filter((v) => v > 0).length).toBeGreaterThan(40);
    l.dispose();
  });
  it('a hare freezes while she looks, lands first, crosses, hides, and comes back the other way', () => {
    const h = { s: 0, ph: 0, wait: 0, dir: 1 };
    for (let i = 0; i < 20; i++) hareStep(h, 0.1, false, 30, 10); expect(h.s).toBeGreaterThan(1);
    for (let i = 0; i < 20; i++) hareStep(h, 0.1, true, 30, 10); const s = h.s; expect(h.ph).toBe(0);
    for (let i = 0; i < 20; i++) hareStep(h, 0.1, true, 30, 10); expect(h.s).toBe(s);
    for (let i = 0; i < 600; i++) hareStep(h, 0.1, false, 30, 10); expect(h.dir).toBe(-1);
    expect(hopY(0)).toBe(0); expect(hopY(0.4)).toBeGreaterThan(0.2); expect(hopY(1)).toBeLessThan(0.01);
  });
  it('one breath, one hour, one wind: the swell follows the carol chime, the hour stays in range, the smoke leans the flakes\' way', () => {
    expect(breathAt(10, 9)).toBeGreaterThan(breathAt(10, -99)); expect(breathAt(5, 5)).toBeGreaterThan(1.05);
    for (let t = 0; t < 600; t += 7) { expect(breathAt(t)).toBeGreaterThan(0.9); expect(breathAt(t)).toBeLessThan(1.1); expect(hourAt(t)).toBeGreaterThan(0.44); expect(hourAt(t)).toBeLessThanOrEqual(1); }
    expect(BREATH_PERIOD).toBeCloseTo(12 * 0.46, 5); expect(hourAt(0)).toBeCloseTo(1, 2);
    expect(SHARED.wx).toBeGreaterThan(SHARED.wz); expect(SHARED.wz).toBeGreaterThan(0); expect(smokeLean(1, 1)).toBeGreaterThan(0);
    expect(wakeAt(0, 5, -1)).toBe(0.5);
  });
  it('the light uses the shared look and reduced motion draws the creatures still', () => {
    const scene = new THREE.Scene(); const l = createSnowvilleLight({ scene, reducedMotion: true, season: 'deep' });
    expect(l.living.active).toBe(true); const c = cam(); l.update(0.1, 5, { x: -2, y: 0, z: 12 }, c); const a = Array.from(scene.getObjectByName('snowville:living').geometry.attributes.position.array.slice(0, 60));
    l.update(0.1, 50, { x: -2, y: 0, z: 12 }, c); expect(Array.from(scene.getObjectByName('snowville:living').geometry.attributes.position.array.slice(0, 60))).toEqual(a);
    expect(l.living.state.arrivals).toBe(0); expect(l.living.wakeAt(0, 0, 0)).toBe(1); l.dispose();
    const s2 = new THREE.Scene(); const lite = createSnowvilleLight({ scene: s2, tier: { name: 'low', rung: 5, shadows: false }, season: 'deep' }); lite.update(0.1, 5, { x: -2, y: 0, z: 12 }, cam());
    expect(lite.living.state.owlFirs.length).toBe(1); lite.dispose();
  });
  it('the zone sounds cross-fade by where she stands, are heard in their zone only, and are silent when muted', () => {
    const w0 = zoneWeights(-24, -10); expect(w0.ice).toBe(1); expect(w0.oven).toBe(0);
    const a = zoneWeights(-12, -10).ice; const b = zoneWeights(-14, -10).ice; expect(a).toBeLessThan(b); expect(a).toBeGreaterThan(0); // (a smooth blend, no switch)
    expect(zoneWeights(11, 1).oven).toBe(1); expect(zoneWeights(-4, 8).square).toBe(1);
    const audio = fakeAudio(); const bed = createZoneBed(audio, () => 0.5); for (let t = 0; t < 40; t += 0.5) bed.update(t, -24, -10); const inIce = audio.log.osc; expect(inIce).toBeGreaterThan(2); expect(audio.log.src).toBeGreaterThan(0);
    const far = fakeAudio(); const bed2 = createZoneBed(far, () => 0); for (let t = 0; t < 40; t += 0.5) bed2.update(t, 38, 33); expect(far.log.osc).toBe(0);
    const muted = { ...fakeAudio(), isMuted: () => true }; const bed3 = createZoneBed(muted, () => 0); for (let t = 0; t < 40; t += 0.5) bed3.update(t, -4, 8); expect(muted.log.osc).toBe(0); expect(muted.log.src).toBe(0);
    expect(villageBell(audio, 1, 1)).toBe(true); expect(villageBell(muted, 1, 1)).toBe(false); bed.dispose(); expect(chimeClock.t).toBeTypeOf('number');
  });
});
