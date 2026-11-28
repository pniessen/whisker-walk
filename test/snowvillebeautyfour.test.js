import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { createWonder, seasonOf, SEASON_LOOK, auroraAt, auroraTint, sleighAt, burstAt, WONDER, SLOTS, spanOf } = await import('../src/world/snowvillewonder.js');
const { createSnowvilleLight } = await import('../src/world/snowvillelight.js');
const { bellStrings } = await import('../src/world/snowvillebeauty.js');
const { loadSnowvilleStages } = await import('../src/world/snowvillestages.js');
await loadSnowvilleStages();
const { build } = await import('../src/world/snowville.js');
const L = await import('../src/world/snowvillelore.js');
const P = await import('../src/world/snowvilleplan.js');
const D = await import('../src/world/snowvilledetailplan.js');

function fakeAudio() {
  const log = { osc: 0, src: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '' });
  const ac = { currentTime: 0, sampleRate: 8000, destination: {}, createGain: node, createBiquadFilter: node, createOscillator: () => { log.osc++; return node(); }, createBufferSource: () => { log.src++; return node(); }, createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }) };
  return { log, isMuted: () => false, getContext: () => ac, getMaster: () => null };
}
const cam = () => { const c = new THREE.PerspectiveCamera(); c.position.set(0, 3, 14); c.lookAt(0, 1, 5); c.updateMatrixWorld(); return c; };
const run = (w, c, t0, secs) => { let t = t0; for (let i = 0; i < secs * 10; i++) { t += 0.1; w.update(0.1, t, { x: 0, y: 0, z: 12 }, c); } return t; };
const fresh = (opts = {}) => { const scene = new THREE.Scene(); const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff })); g.name = 'snowville:ground'; scene.add(g); return { scene, g, w: createWonder({ scene, ...opts }) }; };

describe('snowville beauty pass 4: seasons, surprises, stories', () => {
  it('reads the season from the date (early snow, deep winter, thaw)', () => {
    expect(seasonOf(new Date(2026, 10, 28))).toBe('early'); expect(seasonOf(new Date(2026, 9, 20))).toBe('early');
    expect(seasonOf(new Date(2026, 11, 25))).toBe('deep'); expect(seasonOf(new Date(2027, 1, 2))).toBe('deep');
    expect(seasonOf(new Date(2027, 2, 15))).toBe('thaw'); expect(seasonOf(new Date(2027, 3, 29))).toBe('thaw');
    expect(Object.keys(SEASON_LOOK)).toEqual(['early', 'deep', 'thaw']);
  });
  it('adds one Points and no mesh, tints the ground and puts it back', () => {
    const { scene, g, w } = fresh({ season: 'thaw' });
    const pts = scene.children.filter((o) => o.isPoints); expect(pts).toHaveLength(2);
    expect(pts.map((o) => o.name).sort()).toEqual(['snowville:aurora', 'snowville:wonder']); expect(pts[0].userData.noCast).toBe(true); expect(scene.children.filter((o) => o.isMesh)).toHaveLength(1);
    expect(g.material.color.r).toBeLessThan(0.9);
    w.dispose(); expect(g.material.color.getHex()).toBe(0xffffff); expect(scene.children.filter((o) => o.isPoints)).toHaveLength(0);
  });
  it('thaw drips fall and puddles sparkle; deep winter and early snow have none', () => {
    const thaw = fresh({ season: 'thaw' }); const c = cam(); run(thaw.w, c, 0, 3);
    const scl = thaw.scene.children.find((o) => o.name === 'snowville:wonder').geometry.attributes.aS.array;
    expect(Array.from(scl.slice(SLOTS - 22)).some((v) => v > 0)).toBe(true);
    const deep = fresh({ season: 'deep' }); run(deep.w, c, 0, 3);
    expect(Array.from(deep.scene.children.find((o) => o.name === 'snowville:wonder').geometry.attributes.aS.array.slice(SLOTS - 22)).every((v) => v === 0)).toBe(true);
  });
  it('each rare surprise runs its span, lights its dots and ends; the bells and the sleigh are heard; muted is silent', () => {
    for (const kind of ['aurora', 'sleigh', 'globe', 'bells']) {
      const audio = fakeAudio(); const { scene, w } = fresh({ season: 'deep', audio }); const c = cam();
      w.trigger(kind); const t = run(w, c, 0, 5);
      expect(w.state.kind, kind).toBe(kind);
      const scl = scene.children.find((o) => o.name === (kind === 'aurora' ? 'snowville:aurora' : 'snowville:wonder')).geometry.attributes.aS.array;
      expect(Array.from(scl.slice(0, 78)).some((v) => v > 0), kind).toBe(true);
      if (kind !== 'aurora') expect(audio.log.osc, kind).toBeGreaterThan(3);
      run(w, c, t, spanOf(kind, 300 + w.state.events) + 1);
      expect(w.state.kind, kind).toBe(null); expect(Array.from(scl.slice(0, 78)).every((v) => v === 0)).toBe(true);
      w.dispose();
    }
    const muted = { ...fakeAudio(), isMuted: () => true }; const m = fresh({ season: 'deep', audio: muted }); m.w.trigger('sleigh'); run(m.w, cam(), 0, 3); expect(muted.getContext().createOscillator).toBeTypeOf('function');
  });
  it('is rare: the first not before 150 s, then every three to five minutes, never the same twice, the globe only near the tree', () => {
    const { w } = fresh({ season: 'deep' }); const c = cam();
    run(w, c, 0, 140); expect(w.state.events).toBe(0);
    let t = run(w, c, 140, 20); expect(w.state.events).toBe(1);
    const seen = [w.state.last];
    for (let i = 0; i < 5400; i++) { t += 0.1; const n = w.state.events; w.update(0.1, t, { x: 0, y: 0, z: 12 }, c); if (w.state.events > n) seen.push(w.state.last); }
    expect(seen.length).toBeGreaterThanOrEqual(3); expect(seen.length).toBeLessThanOrEqual(13);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    const far = fresh({ season: 'deep' }); let tf = 0; const seenFar = [];
    for (let i = 0; i < 9000; i++) { tf += 0.1; const n = far.w.state.events; far.w.update(0.1, tf, { x: 40, y: 0, z: 30 }, c); if (far.w.state.events > n) seenFar.push(far.w.state.last); }
    expect(seenFar.length).toBeGreaterThan(2); expect(seenFar).not.toContain('globe');
    expect(WONDER.first).toBe(150);
  });
  it('reduced motion makes none of it (a still tint only); the light carries it', () => {
    const { scene, g, w } = fresh({ season: 'thaw', reducedMotion: true });
    expect(scene.children.filter((o) => o.isPoints)).toHaveLength(0); expect(w.active).toBe(false); expect(w.trigger('aurora')).toBe(false);
    w.dispose(); expect(g.material.color.getHex()).toBe(0xffffff);
    const s2 = new THREE.Scene(); const l = createSnowvilleLight({ scene: s2, reducedMotion: false, season: 'deep' });
    expect(l.wonder.state.season).toBe('deep'); expect(s2.children.filter((o) => o.name === 'snowville:wonder')).toHaveLength(1); l.dispose();
  });
  it('pure shapes stay in range: aurora (over the sky, in front), sleigh (over the roofs), burst (settling), bell strings (eight bulbs each)', () => {
    const o = { x: 0, y: 0, z: 0, v: 0, h: 0 };
    for (let r = 0; r < 3; r++) for (let j = 0; j < 26; j++) { auroraAt(r, j, 12, 0, 3, 0, 0, -1, 26, o); expect(o.y).toBeGreaterThan(5); expect(o.z).toBeLessThan(-60); expect(o.v).toBeGreaterThan(0); expect(o.v).toBeLessThanOrEqual(1); }
    const t = auroraTint(0.5); expect(t[1]).toBeGreaterThan(t[0]); const e = auroraTint(1); expect(e[2]).toBeGreaterThan(e[1]);
    for (let u = 0; u <= 1; u += 0.1) { sleighAt(u, 0, 3, 0, 0, -1, o); expect(o.y).toBeGreaterThan(9); expect(o.y).toBeLessThan(25); }
    const tip = { x: -4, y: 6, z: 8 };
    for (let k = 0; k < 40; k++) { burstAt(k, 0, tip, o); expect(Math.hypot(o.x - tip.x, o.y - tip.y, o.z - tip.z)).toBeLessThan(0.01); burstAt(k, 4, tip, o); expect(Math.hypot(o.x - tip.x, o.z - tip.z)).toBeLessThan(7); }
    expect(bellStrings().map((s) => s.length)).toEqual([8, 8]);
  });
  it('the stories are only drawing: no mesh or caster beyond the village\'s own, no collider; the fort and the snowlings sit in open ground', () => {
    const scene = new THREE.Scene(); const area = build(scene);
    expect(scene.children.filter((o) => o.isMesh).length).toBe(6);
    const names = scene.children.filter((o) => o.isMesh).map((o) => o.name); expect(names.filter((n) => n.includes('lore'))).toHaveLength(0);
    expect(L.fortSpot()).not.toBeNull();
    const [fx, fz] = L.fortSpot(); for (const c of area.colliders) expect(Math.hypot(fx - c.x, fz - c.z), `${c.x},${c.z}`).toBeGreaterThan(c.r + 0.5);
    for (const s of L.SNOWLINGS) for (const c of area.colliders) expect(Math.hypot(P.SNOWMAN.x + s.dx - c.x, P.SNOWMAN.z + s.dz - c.z), `snowling vs ${c.x},${c.z}`).toBeGreaterThan(0.3);
    expect(Object.keys(L.TRADES).sort()).toEqual(P.COTTAGES.map((c) => c.id).sort());
    expect(D.isOpen).toBeTypeOf('function');
  });
});
