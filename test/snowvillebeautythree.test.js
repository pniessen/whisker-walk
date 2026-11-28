import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createAlive, waveAt, chase, glowNear, smokeLean, footTint, starAt, brushSpots, TRAIL } from '../src/world/snowvillealive.js';
import { createSnowvilleLight } from '../src/world/snowvillelight.js';
import { toDoors } from '../src/world/snowvillebeauty.js';
import * as P from '../src/world/snowvilleplan.js';

function fakeAudio() {
  const log = { osc: 0, src: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '' });
  const ac = { currentTime: 0, sampleRate: 8000, destination: {}, createGain: node, createBiquadFilter: node, createOscillator: () => { log.osc++; return node(); }, createBufferSource: () => { log.src++; return node(); }, createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }) };
  return { log, isMuted: () => false, getContext: () => ac, getMaster: () => null };
}
const walkAlive = (alive, x0, z0, x1, z1, n, t0 = 0, camera = null) => {
  let t = t0; const cat = { x: x0, y: P.snowY(x0, z0), z: z0 };
  for (let i = 1; i <= n; i++) { t += 1 / 30; cat.x = x0 + ((x1 - x0) * i) / n; cat.z = z0 + ((z1 - z0) * i) / n; cat.y = P.snowY(cat.x, cat.z); alive.update(1 / 30, t, cat, camera, null); }
  return t;
};

describe('snowville beauty pass 3: the village reacts and lives', () => {
  it('adds one Points and no mesh, light or caster', () => {
    const scene = new THREE.Scene();
    const a = createAlive({ scene, tier: null, reducedMotion: false });
    expect(scene.children).toHaveLength(1);
    const o = scene.children[0];
    expect(o.isPoints).toBe(true); expect(o.name).toBe('snowville:trail'); expect(o.userData.noCast).toBe(true); expect(o.userData.noMerge).toBe(true);
    a.dispose(); expect(scene.children).toHaveLength(0);
  });
  it('presses footprints behind her that fade back to the snow, and kicks puffs up when she trots', () => {
    const scene = new THREE.Scene();
    const a = createAlive({ scene, tier: null, reducedMotion: false });
    const t = walkAlive(a, 0, 20, 0, 10, 60); // 10 m in 2 s: 5 m/s
    expect(a.state.feet).toBeGreaterThan(10); expect(a.state.puffs).toBeGreaterThan(5);
    const scl = scene.children[0].geometry.attributes.aS.array;
    expect(Array.from(scl.slice(0, TRAIL.feet)).some((v) => v > 0)).toBe(true);
    for (let i = 0; i < 40; i++) a.update(1, t + i + 1, { x: 0, y: P.snowY(0, 10), z: 10 }, null, null); // standing a minute: every print has filled back
    expect(Array.from(scl.slice(0, TRAIL.feet)).every((v) => v === 0)).toBe(true);
    a.dispose();
  });
  it('a print is darkest new and the snow\'s own colour when old; the waves, chase and glow stay in range', () => {
    const n = footTint(0); const o = footTint(1);
    expect(n[0]).toBeLessThan(o[0]);
    for (let t = 0; t < 600; t += 1.3) { expect(waveAt(t)).toBeGreaterThan(0.4); expect(waveAt(t)).toBeLessThanOrEqual(1.1); expect(chase(3, t)).toBeGreaterThanOrEqual(1); expect(chase(3, t)).toBeLessThanOrEqual(1.91); }
    expect(glowNear(0)).toBeCloseTo(1.9, 5); expect(glowNear(50)).toBe(1);
    expect(smokeLean(0, 1)).toBe(0); expect(smokeLean(1, 1)).toBeGreaterThan(smokeLean(1, 0));
  });
  it('shakes snow off a fir she brushes past (once in a while) and jingles at a door; silent while muted', () => {
    const f = brushSpots().firs[0];
    const scene = new THREE.Scene(); const audio = fakeAudio();
    const a = createAlive({ scene, tier: null, reducedMotion: false, audio });
    walkAlive(a, f.x + 5, f.z, f.x + 0.2, f.z, 40);
    expect(a.state.shaken).toBeGreaterThanOrEqual(1); expect(audio.log.src).toBeGreaterThan(0);
    const d = toDoors()[0];
    walkAlive(a, d.x + 3, d.z, d.x, d.z, 30, 40);
    expect(a.state.jingles).toBeGreaterThanOrEqual(1); expect(audio.log.osc).toBeGreaterThan(5);
    a.dispose();
    const muted = { ...fakeAudio(), isMuted: () => true }; const s2 = new THREE.Scene();
    const b = createAlive({ scene: s2, tier: null, reducedMotion: false, audio: muted });
    walkAlive(b, f.x + 5, f.z, f.x + 0.2, f.z, 40);
    expect(b.state.shaken).toBeGreaterThanOrEqual(1); expect(muted.log.src + muted.log.osc).toBe(0);
    b.dispose();
  });
  it('sends a shooting star across the sky ahead of the camera now and then', () => {
    const scene = new THREE.Scene(); const a = createAlive({ scene, tier: null, reducedMotion: false });
    const cam = new THREE.PerspectiveCamera(70, 1.78, 0.1, 300); cam.position.set(0, 3, 10); cam.lookAt(0, 3, -50); cam.updateMatrixWorld();
    walkAlive(a, 0, 10, 0, 10, 700, 0, cam);
    expect(a.state.stars).toBeGreaterThanOrEqual(1);
    const p = starAt(0, 0.5, 0, 3, 10, 0, -1);
    expect(p.z).toBeLessThan(-60); expect(p.y).toBeGreaterThan(15);
    a.dispose();
  });
  it('reduced motion makes nothing; the lite rung keeps half the dots and no star', () => {
    const s1 = new THREE.Scene(); const r = createAlive({ scene: s1, tier: null, reducedMotion: true });
    expect(s1.children).toHaveLength(0); r.update(0.1, 1, { x: 0, y: 0, z: 0 }, null, null); r.dispose();
    const s2 = new THREE.Scene(); const l = createAlive({ scene: s2, tier: null, reducedMotion: false, low: true });
    expect(s2.children[0].geometry.attributes.position.count).toBe(TRAIL.feet / 2 + TRAIL.puffs / 2);
    l.dispose();
  });
  it('the light wires it in: the snowfall waxes and wanes, and reduced motion keeps every flake', () => {
    const scene = new THREE.Scene();
    const l = createSnowvilleLight({ scene, tier: null, reducedMotion: false });
    const fl = scene.getObjectByName('snowville:flakes');
    const counts = new Set();
    for (let t = 0; t < 120; t += 7) { l.update(0.1, t, { x: 0, y: 0, z: 20 }, null, null); counts.add(fl.geometry.drawRange.count); }
    expect(counts.size).toBeGreaterThan(3);
    expect(scene.getObjectByName('snowville:trail')).toBeTruthy();
    l.dispose();
    const s2 = new THREE.Scene(); const r = createSnowvilleLight({ scene: s2, tier: null, reducedMotion: true });
    r.update(0.1, 50, { x: 0, y: 0, z: 20 }, null, null);
    expect(s2.getObjectByName('snowville:trail')).toBeFalsy();
    r.dispose();
  });
});
