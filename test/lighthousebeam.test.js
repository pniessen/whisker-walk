import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const L = await import('../src/world/lighthouseplan.js');
const { build } = await import('../src/world/lighthouse.js');
const { beamAngle, BEAM, LIGHT_UP } = await import('../src/world/lighthouselife.js');
const { createTippables } = await import('../src/tippables.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');

// Lighthouse Point, milestone 2: where the beam points is a function of walk seconds and the room seed, and
// the beam, the lever and the job draw no random number and read no clock.

const TAU = Math.PI * 2;
const near = (a, b) => Math.abs(((a - b + Math.PI * 3) % TAU) - Math.PI) < 1e-9;

function lit({ roomSeed, tier = { name: 'high' }, chunks = 1 / 30 } = {}) {
  const scene = new THREE.Scene();
  const placed = build(scene);
  const tippables = createTippables(scene, placed.tippables, { ground: placed.ground });
  const log = createDiscoveryLog({ addPoints() {}, recordFeat() {} });
  log.startWalk();
  const life = placed.life({ scene, ground: placed.ground, audio: null, log, progression: {}, tier, roomSeed });
  const session = { tippables };
  const cat = { x: L.LEVER.x + 0.5, y: 13.5, z: L.LEVER.z };
  tippables.tipById(`tip-${placed.tippables.findIndex((t) => t.kind === 'lever')}`);
  const beam = scene.children.find((o) => o.isMesh && o.userData.noMerge && o.children.length === 1);
  const patch = scene.children.find((o) => o.isMesh && o.userData.noMerge && o.scale.x === BEAM.patchLen);
  return { scene, life, session, cat, beam, patch, run(seconds) { for (let i = 0; i < Math.round(seconds / chunks); i++) life.update(chunks, 0, cat, new THREE.PerspectiveCamera(), session); } };
}

describe('the beam angle', () => {
  it('turns once every 18 s, steadily, from 0 on a solo walk', () => {
    expect(BEAM.period).toBe(18);
    expect(beamAngle(0)).toBe(0);
    expect(near(beamAngle(4.5), TAU / 4)).toBe(true);
    expect(near(beamAngle(18), 0)).toBe(true);
    expect(near(beamAngle(36.0), 0)).toBe(true);
    let prev = beamAngle(0);
    for (let s = 0.5; s < 17; s += 0.5) { const a = beamAngle(s); expect(a).toBeGreaterThan(prev); prev = a; }
  });

  it('is a function of the walk second and the room seed alone: two devices of one room agree, other rooms differ', () => {
    for (const seed of [1, 77, 123456, 987654321]) for (const s of [0, 1.234, 40.5, 600.1]) expect(beamAngle(s, seed)).toBe(beamAngle(s, seed));
    const a = [1, 2, 3, 77, 123456, 987654321].map((seed) => beamAngle(10, seed));
    expect(new Set(a.map((v) => v.toFixed(6))).size).toBe(a.length);
    // the phase is in [0, 2pi) and the turn goes on from it
    for (const seed of [5, 6, 7]) expect(near(beamAngle(9, seed) - beamAngle(0, seed), Math.PI)).toBe(true);
  });

  it('the mesh points where beamAngle says, whatever the frame length (two screens at 30 and 60 fps agree)', () => {
    const slow = lit({ roomSeed: 424242, chunks: 1 / 30 });
    const fast = lit({ roomSeed: 424242, chunks: 1 / 60 });
    slow.run(LIGHT_UP + 7.5);
    fast.run(LIGHT_UP + 7.5);
    // the same walk second on each (the sum of the frames), the same angle to a hair
    expect(slow.beam.visible).toBe(true);
    expect(near(-slow.beam.rotation.y, beamAngle(LIGHT_UP + 7.5, 424242))).toBe(true);
    expect(near(-fast.beam.rotation.y, beamAngle(LIGHT_UP + 7.5, 424242))).toBe(true);
    expect(near(slow.beam.rotation.y, fast.beam.rotation.y)).toBe(true);
    slow.life.dispose();
    fast.life.dispose();
  });
});

describe('the lit lamp', () => {
  it('the pool of light lies on low ground only: the sea and the cove, not the headland', () => {
    const w = lit({ roomSeed: 1 });
    w.run(LIGHT_UP + 0.5);
    let sawOn = 0;
    let sawOff = 0;
    for (let i = 0; i < 18 * 30; i++) {
      w.life.update(1 / 30, 0, w.cat, new THREE.PerspectiveCamera(), w.session);
      const { x, z } = w.patch.position;
      const low = w.patch.visible;
      if (low) { sawOn++; expect(w.life.lit).toBe(true); expect(Math.abs(x - L.TOWER.x) + Math.abs(z - L.TOWER.z)).toBeGreaterThan(20); }
      else sawOff++;
    }
    expect(sawOn).toBeGreaterThan(0);
    expect(sawOff).toBeGreaterThan(0);
    w.life.dispose();
  });

  it('the low tier has no pool of light at all', () => {
    const w = lit({ tier: { name: 'low' } });
    expect(w.patch).toBeUndefined();
    w.run(LIGHT_UP + 1);
    expect(w.beam.visible).toBe(true);
    w.life.dispose();
  });

  it('the life is at most 10 meshes, no shadow casters, 3,500 triangles', () => {
    const scene = new THREE.Scene();
    const before = new Set();
    const placed = build(scene);
    scene.traverse((o) => before.add(o));
    const life = placed.life({ scene, ground: placed.ground, audio: null, log: null, progression: {}, tier: { name: 'high' } });
    let meshes = 0; let tris = 0; let casters = 0;
    scene.traverse((o) => {
      if (!o.isMesh || before.has(o)) return;
      meshes++;
      tris += o.geometry.attributes.position.count / 3;
      if (o.castShadow) casters++;
    });
    expect(meshes).toBeLessThanOrEqual(10);
    expect(casters).toBe(0);
    expect(tris).toBeLessThanOrEqual(3500);
    life.dispose();
    scene.traverse((o) => { if (o.isMesh && !before.has(o)) throw new Error('left a mesh behind'); });
  });
});

describe('no random number and no clock', () => {
  it('a lit lamp, a pulled lever and a paid job draw no Math.random, Date.now or performance.now', () => {
    const real = { r: Math.random, d: Date.now, p: performance.now };
    const trap = (name) => () => { throw new Error(`${name} was called`); };
    // (the scene and the area are made first: THREE's own uuids, and the build's local stream, are not the life's)
    const scene = new THREE.Scene();
    const placed = build(scene);
    const tippables = createTippables(scene, placed.tippables, { ground: placed.ground });
    const log = createDiscoveryLog({ addPoints() {}, recordFeat() {} });
    log.startWalk();
    const camera = new THREE.PerspectiveCamera();
    Math.random = trap('Math.random');
    Date.now = trap('Date.now');
    performance.now = trap('performance.now');
    try {
      const life = placed.life({ scene, ground: placed.ground, audio: { isMuted: () => true }, log, progression: {}, tier: { name: 'high' }, roomSeed: 9 });
      const session = { tippables };
      tippables.tipById(`tip-${placed.tippables.findIndex((t) => t.kind === 'lever')}`);
      for (let i = 0; i < 30 * 12; i++) life.update(1 / 30, 0, { x: -23, y: 13.5, z: -20 }, camera, session);
      expect(life.lit).toBe(true);
      life.dispose();
    } finally {
      Math.random = real.r;
      Date.now = real.d;
      performance.now = real.p;
    }
  });
});
