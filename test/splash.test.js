import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { splashEmits, createSplash, NO_SPLASH, RING_Y } from '../src/render/splash.js';
import { createWaterState } from '../src/waterstate.js';
import { LADDER } from '../src/render/quality.js';

const DT = 1 / 60;
const AREA = { waters: [{ kind: 'rect', x: 0, z: 0, w: 40, d: 40 }] };

function emitsOver(mode, speed, seconds, rm = false) {
  const st = { ...createWaterState(), mode };
  const out = { drops: 0, wake: 0, ring: 0, puff: 0 };
  const total = { drops: 0, dropBursts: 0, wake: 0, ring: 0, puff: 0 };
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    splashEmits(st, speed, DT, rm, out);
    total.drops += out.drops;
    if (out.drops > 0) total.dropBursts++;
    total.wake += out.wake;
    total.ring += out.ring;
    total.puff += out.puff;
  }
  return total;
}

describe('splashEmits', () => {
  it('wading while moving throws 9 bursts of 3 drops in 2 s', () => {
    const t = emitsOver('wade', 1, 2);
    expect(t.dropBursts).toBeGreaterThanOrEqual(8);
    expect(t.dropBursts).toBeLessThanOrEqual(10);
    expect(t.drops).toBe(t.dropBursts * 3);
    expect(t.wake + t.ring + t.puff).toBe(0);
  });

  it('swimming while moving leaves 12 wake pairs and 3 rings in 2 s', () => {
    const t = emitsOver('swim', 1, 2);
    expect(t.wake).toBeGreaterThanOrEqual(11);
    expect(t.wake).toBeLessThanOrEqual(13);
    expect(t.ring).toBeGreaterThanOrEqual(2);
    expect(t.ring).toBeLessThanOrEqual(4);
    expect(t.drops + t.puff).toBe(0);
  });

  it('swimming still leaves 1 or 2 rings in 2 s and nothing else', () => {
    const t = emitsOver('swim', 0, 2);
    expect(t.ring).toBeGreaterThanOrEqual(1);
    expect(t.ring).toBeLessThanOrEqual(2);
    expect(t.drops + t.wake + t.puff).toBe(0);
  });

  it('a dry cat emits nothing', () => {
    const t = emitsOver('dry', 2, 2);
    expect(t.drops + t.wake + t.ring + t.puff).toBe(0);
  });

  it('a running entry throws 6 drops that frame', () => {
    const st = { ...createWaterState(), mode: 'wade', entered: true };
    const out = splashEmits(st, 1.5, DT, false, { drops: 0, wake: 0, ring: 0, puff: 0 });
    expect(out.drops).toBe(6);
    const slow = splashEmits({ ...createWaterState(), mode: 'wade', entered: true }, 0.5, DT, false, {});
    expect(slow.drops).toBe(0);
  });

  it('a shake puffs 16 droplets', () => {
    const st = { ...createWaterState(), mode: 'dry', shook: true };
    const out = splashEmits(st, 1, DT, false, { drops: 0, wake: 0, ring: 0, puff: 0 });
    expect(out.puff).toBe(16);
  });

  it('under reduced motion only the shake emits, as a puff of 6', () => {
    for (const [mode, speed] of [['wade', 1], ['swim', 1], ['swim', 0]]) {
      const t = emitsOver(mode, speed, 2, true);
      expect(t.drops + t.wake + t.ring + t.puff).toBe(0);
    }
    const entered = splashEmits({ ...createWaterState(), mode: 'wade', entered: true }, 2, DT, true, {});
    expect(entered.drops + entered.wake + entered.ring + entered.puff).toBe(0);
    const shook = splashEmits({ ...createWaterState(), mode: 'dry', shook: true }, 1, DT, true, {});
    expect(shook).toEqual({ drops: 0, wake: 0, ring: 0, puff: 6 });
  });

  it('advances the clocks on the state and returns the out object it was given', () => {
    const st = { ...createWaterState(), mode: 'swim' };
    const out = { drops: 0, wake: 0, ring: 0, puff: 0 };
    expect(splashEmits(st, 1, 0.1, false, out)).toBe(out);
    expect(st.fxClock).toBeCloseTo(0.1);
    expect(st.ringClock).toBeCloseTo(0.1);
  });
});

function run(splash, st, seconds, { x = 0, z = 0, yaw = 0, speed = 1, scale = 1 } = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    splash.track(st, x, z, yaw, speed, scale, DT);
    st.entered = false;
    st.shook = false;
    splash.update(DT);
  }
}

describe('createSplash', () => {
  it('adds exactly 2 non-casting meshes sized from the tier', () => {
    const scene = new THREE.Scene();
    const splash = createSplash(scene, { areaData: AREA, tier: LADDER[0], reducedMotion: false });
    expect(scene.children).toHaveLength(2);
    expect(splash.meshes).toHaveLength(2);
    for (const m of splash.meshes) {
      expect(scene.children).toContain(m);
      expect(m.isInstancedMesh).toBe(true);
      expect(m.castShadow).toBe(false);
      expect(m.receiveShadow).toBe(false);
    }
    expect(splash.capacity).toEqual({ drops: 64, rings: 32 });
    expect(splash.meshes[0].instanceMatrix.count).toBe(64);
    expect(splash.meshes[1].instanceMatrix.count).toBe(32);
    const low = createSplash(new THREE.Scene(), { areaData: AREA, tier: LADDER[3], reducedMotion: false });
    expect(low.capacity).toEqual({ drops: 32, rings: 20 });
  });

  it('draws nothing before anything happens and after every effect has expired', () => {
    const scene = new THREE.Scene();
    const splash = createSplash(scene, { areaData: AREA, tier: LADDER[0], reducedMotion: false });
    expect(splash.drawCount).toBe(0);
    splash.update(DT);
    expect(splash.drawCount).toBe(0);
    const st = { ...createWaterState(), mode: 'swim', entered: true };
    run(splash, st, 2, { speed: 1.5 });
    expect(splash.drawCount).toBeGreaterThan(0);
    st.mode = 'dry';
    st.shook = true;
    run(splash, st, 0.1);
    run(splash, st, 3);
    expect(splash.drawCount).toBe(0);
    for (const m of splash.meshes) expect(m.visible).toBe(false);
  });

  it('draws 2 while a swimmer is moving and 1 while only rings live', () => {
    const scene = new THREE.Scene();
    const splash = createSplash(scene, { areaData: AREA, tier: LADDER[0], reducedMotion: false });
    const st = { ...createWaterState(), mode: 'swim', entered: true };
    run(splash, st, 0.3, { speed: 1.5 });
    expect(splash.drawCount).toBe(2);
    // Floating still: the entry drops land, and the still rings keep coming.
    run(splash, st, 2, { speed: 0 });
    expect(splash.drawCount).toBe(1);
    expect(splash.meshes[0].visible).toBe(false);
    expect(splash.meshes[1].visible).toBe(true);
  });

  it('a moving wader draws drops; a wading cat standing still draws nothing', () => {
    const splash = createSplash(new THREE.Scene(), { areaData: AREA, tier: LADDER[0], reducedMotion: false });
    const st = { ...createWaterState(), mode: 'wade' };
    run(splash, st, 0.5, { speed: 1 });
    expect(splash.meshes[0].visible).toBe(true);
    expect(splash.meshes[0].count).toBeGreaterThan(0);
    run(splash, st, 1, { speed: 0 });
    expect(splash.drawCount).toBe(0);
  });

  it('every ring sits at RING_Y = 0.06, above the highest water', () => {
    expect(RING_Y).toBe(0.06);
    const splash = createSplash(new THREE.Scene(), { areaData: AREA, tier: LADDER[0], reducedMotion: false });
    const st = { ...createWaterState(), mode: 'swim' };
    run(splash, st, 1, { x: 3, z: -2, yaw: 1.2, speed: 1 });
    const rings = splash.meshes[1];
    expect(rings.count).toBeGreaterThan(4);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < rings.count; i++) {
      rings.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(p.y).toBeCloseTo(0.06, 6);
    }
  });

  it('the wake opens into a V behind the swimmer', () => {
    const splash = createSplash(new THREE.Scene(), { areaData: AREA, tier: LADDER[0], reducedMotion: false });
    const st = { ...createWaterState(), mode: 'swim' };
    // yaw 0 faces -z (player.js: rotation.y = atan2(vx, vz) + PI, swimming +z
    // gives yaw PI). Swim towards -z: every ring lies behind, at z >= 0.
    run(splash, st, 1, { yaw: 0, speed: 1 });
    const rings = splash.meshes[1];
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let left = 0;
    let right = 0;
    for (let i = 0; i < rings.count; i++) {
      rings.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(p.z).toBeGreaterThanOrEqual(-1e-6);
      if (p.x < -0.1) left++;
      if (p.x > 0.1) right++;
    }
    expect(left).toBeGreaterThan(2);
    expect(left).toBe(right);
  });

  it('returns NO_SPLASH for an area with no waters', () => {
    const scene = new THREE.Scene();
    expect(createSplash(scene, { areaData: { waters: [] }, tier: LADDER[0], reducedMotion: false })).toBe(NO_SPLASH);
    expect(createSplash(scene, { areaData: {}, tier: LADDER[0], reducedMotion: false })).toBe(NO_SPLASH);
    expect(scene.children).toHaveLength(0);
    expect(NO_SPLASH.drawCount).toBe(0);
    expect(NO_SPLASH.meshes).toEqual([]);
    const st = { ...createWaterState(), mode: 'swim', shook: true, entered: true };
    expect(() => { NO_SPLASH.track(st, 0, 0, 0, 2, 1, DT); NO_SPLASH.update(DT); NO_SPLASH.dispose(); }).not.toThrow();
    expect(NO_SPLASH.drawCount).toBe(0);
  });

  it('allocates nothing over 10 s of tracking and updating', () => {
    const scene = new THREE.Scene();
    const splash = createSplash(scene, { areaData: AREA, tier: LADDER[0], reducedMotion: false });
    const children = scene.children.length;
    const arrays = splash.meshes.map((m) => m.instanceMatrix.array);
    const alpha = splash.meshes[1].geometry.getAttribute('aAlpha').array;
    const st = { ...createWaterState(), mode: 'swim', entered: true };
    for (let i = 0; i < 600; i++) {
      st.mode = i % 200 < 100 ? 'swim' : 'wade';
      st.shook = i % 150 === 0;
      splash.track(st, i * 0.01, 0, 0.3, 1.2, 1, DT);
      splash.update(DT);
    }
    expect(scene.children.length).toBe(children);
    splash.meshes.forEach((m, i) => expect(m.instanceMatrix.array).toBe(arrays[i]));
    expect(splash.meshes[1].geometry.getAttribute('aAlpha').array).toBe(alpha);
  });

  it('an overfilled pool reuses its oldest slots and count never exceeds capacity', () => {
    const tier = { splashDrops: 8, splashRings: 4 };
    const splash = createSplash(new THREE.Scene(), { areaData: AREA, tier, reducedMotion: false });
    expect(splash.capacity).toEqual({ drops: 8, rings: 4 });
    const st = { ...createWaterState(), mode: 'swim' };
    let maxDrops = 0;
    let maxRings = 0;
    for (let i = 0; i < 60; i++) {
      // A shake every 5 frames: 16 drops into a pool of 8.
      st.shook = i % 5 === 0;
      splash.track(st, 0, 0, 0, 1, 1, DT);
      splash.update(DT);
      maxDrops = Math.max(maxDrops, splash.meshes[0].count);
      maxRings = Math.max(maxRings, splash.meshes[1].count);
    }
    expect(maxDrops).toBe(8);
    expect(maxRings).toBe(4);
    // Swim far away for 0.4 s: the rings left at x = 0 (still alive, a ring
    // lasts 1.2 s) are the oldest, so they are the ones overwritten.
    st.shook = false;
    run(splash, st, 0.4, { x: 30, speed: 1 });
    const rings = splash.meshes[1];
    expect(rings.count).toBe(4);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < rings.count; i++) {
      rings.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(p.x).toBeGreaterThan(28);
    }
  });

  it('under reduced motion a swim draws nothing and the shake is a short small puff', () => {
    const splash = createSplash(new THREE.Scene(), { areaData: AREA, tier: LADDER[0], reducedMotion: true });
    const st = { ...createWaterState(), mode: 'swim', entered: true };
    run(splash, st, 2, { speed: 1.5 });
    expect(splash.drawCount).toBe(0);
    st.mode = 'dry';
    st.shook = true;
    splash.track(st, 0, 0, 0, 1, 1, DT);
    splash.update(DT);
    expect(splash.drawCount).toBe(1);
    expect(splash.meshes[0].count).toBe(6);
    run(splash, st, 0.35);
    expect(splash.drawCount).toBe(0);
  });

  it('dispose removes both meshes', () => {
    const scene = new THREE.Scene();
    const splash = createSplash(scene, { areaData: AREA, tier: LADDER[0], reducedMotion: false });
    splash.dispose();
    expect(scene.children).toHaveLength(0);
  });
});

describe('quality splash knobs', () => {
  it('HIGH carries 64 drops and 32 rings; LOW keeps 20 rings, the floor', () => {
    expect(LADDER[0].splashDrops).toBe(64);
    expect(LADDER[0].splashRings).toBe(32);
    expect(LADDER[1].splashRings).toBe(32);
    expect(LADDER[2].splashDrops).toBe(64);
    expect(LADDER[3].splashDrops).toBe(32);
    expect(LADDER[3].splashRings).toBe(20);
  });
});
