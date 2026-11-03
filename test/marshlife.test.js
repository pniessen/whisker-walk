import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The River's life on a walk (polish-rivermoor Task 3): a soft low mist over
// the water at dusk and at sunset, and small jewel-coloured dragonflies
// darting over the water by day. Looks only: two noCast meshes driven by the
// walk's life hook.

// The same headless canvas stub every world test uses (see test/budget.test.js).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const river = await import('../src/world/river.js');
const L = await import('../src/world/marshlife.js');
const { inWater } = await import('../src/world/builder.js');

const { build, RIVER_WATERS, RIVER_DECKS } = river;
const { marshMist, dragonflies, riverDragonflyHomes, createMarshLife } = L;

const BOUNDS = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
const OPEN = RIVER_WATERS.map((w) => ({ ...w, decks: [] }));
const rectDist = (d, x, z) => Math.hypot(Math.max(d.minX - x, 0, x - d.maxX), Math.max(d.minZ - z, 0, z - d.maxZ));
const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

const makeMist = () => marshMist(RIVER_WATERS, BOUNDS);
const makeFlies = () => dragonflies(riverDragonflyHomes());
const clear = { condition: 'clear', isRaining: () => false };
const sunset = { condition: 'sunset', isRaining: () => false };
const rain = { condition: 'rain', isRaining: () => true };

function run(life, steps = 100, dt = 0.1) {
  for (let i = 0; i < steps; i++) life.update(dt, i * dt, new THREE.Vector3(), null);
}

describe('marsh life', () => {
  it('the mist is one transparent noCast mesh that writes no depth and starts hidden', () => {
    const mist = makeMist();
    expect(mist.isMesh).toBe(true);
    expect(mist.name).toBe('marshMist');
    expect(mist.material.transparent).toBe(true);
    expect(mist.material.depthWrite).toBe(false);
    expect(mist.material.fog).toBe(true);
    expect(mist.userData.noCast).toBe(true);
    expect(mist.castShadow).toBe(false);
    expect(mist.visible).toBe(false);
    expect(mist.renderOrder).toBe(2);
    expect(mist.material.customProgramCacheKey()).toBe('marsh-mist-v2');
    const u = mist.userData.marshMist;
    expect(u.uTime.value).toBe(0);
    expect(u.uMist.value).toBe(0);
    expect(u.uColor.value.isColor).toBe(true);
    // Low sheets: 0.25 and 0.55, over the water, never over the bounds' edge.
    const pos = mist.geometry.attributes.position;
    const ys = new Set();
    for (let i = 0; i < pos.count; i++) {
      ys.add(Math.round(pos.getY(i) * 100) / 100);
      expect(pos.getX(i)).toBeGreaterThanOrEqual(BOUNDS.minX - 1e-6);
      expect(pos.getX(i)).toBeLessThanOrEqual(BOUNDS.maxX + 1e-6);
      expect(pos.getZ(i)).toBeGreaterThanOrEqual(BOUNDS.minZ - 1e-6);
      expect(pos.getZ(i)).toBeLessThanOrEqual(BOUNDS.maxZ + 1e-6);
    }
    expect([...ys].sort()).toEqual([0.25, 0.55]);
  });

  it('the mist shows on a dusk walk and on a sunset, not by day', () => {
    const dusk = { mist: makeMist(), flies: makeFlies() };
    run(createMarshLife({ ...dusk, dusk: true, weather: clear, reducedMotion: false }));
    expect(dusk.mist.visible).toBe(true);
    expect(dusk.mist.userData.marshMist.uMist.value).toBeCloseTo(1, 5);
    expect(dusk.mist.userData.marshMist.uColor.value.getHex()).toBe(0xb8b4c8);

    const day = { mist: makeMist(), flies: makeFlies() };
    run(createMarshLife({ ...day, dusk: false, weather: clear, reducedMotion: false }));
    expect(day.mist.visible).toBe(false);
    expect(day.mist.userData.marshMist.uMist.value).toBe(0);

    const eve = { mist: makeMist(), flies: makeFlies() };
    const life = createMarshLife({ ...eve, dusk: false, weather: sunset, reducedMotion: false });
    // Eased in at 0.5 a second, never popped.
    life.update(0.1, 0, null, null);
    expect(eve.mist.userData.marshMist.uMist.value).toBeCloseTo(0.05, 5);
    run(life);
    expect(eve.mist.visible).toBe(true);
    expect(eve.mist.userData.marshMist.uMist.value).toBeCloseTo(0.7, 5);
    expect(eve.mist.userData.marshMist.uColor.value.getHex()).toBe(0xe8d4c4);
    life.dispose();
    expect(eve.mist.visible).toBe(false);
  });

  it('the mist never shows on low quality', () => {
    const m = { mist: makeMist(), flies: makeFlies() };
    run(createMarshLife({ ...m, dusk: true, weather: clear, reducedMotion: false, quality: 'low' }));
    expect(m.mist.visible).toBe(false);
    expect(m.mist.userData.marshMist.uMist.value).toBe(0);
    const s = { mist: makeMist(), flies: makeFlies() };
    run(createMarshLife({ ...s, dusk: false, weather: sunset, quality: 'low' }));
    expect(s.mist.visible).toBe(false);
    const hi = { mist: makeMist(), flies: makeFlies() };
    run(createMarshLife({ ...hi, dusk: true, weather: clear, quality: 'high' }));
    expect(hi.mist.visible).toBe(true);
  });

  it('river build passes its water quality to the mist', () => {
    const scene = new THREE.Scene();
    const data = river.build(scene, { water: { quality: 'low' } });
    const life = data.life({ dusk: true, weather: clear, reducedMotion: false });
    run(life);
    expect(scene.children.find((c) => c.name === 'marshMist').visible).toBe(false);
    life.dispose();
  }, 120_000);

  it('dragonflies fly by day and rest at dusk and in rain', () => {
    const day = { mist: makeMist(), flies: makeFlies() };
    run(createMarshLife({ ...day, dusk: false, weather: clear, reducedMotion: false }), 10);
    expect(day.flies.visible).toBe(true);
    expect(day.flies.userData.dragonflies.uTime.value).toBeCloseTo(1, 5);
    expect(day.flies.userData.dragonflies.uCalm.value).toBe(0);
    expect(day.mist.userData.marshMist.uTime.value).toBeCloseTo(1, 5);

    const dusk = { mist: makeMist(), flies: makeFlies() };
    run(createMarshLife({ ...dusk, dusk: true, weather: clear, reducedMotion: false }), 1);
    expect(dusk.flies.visible).toBe(false);

    const wet = { mist: makeMist(), flies: makeFlies() };
    run(createMarshLife({ ...wet, dusk: false, weather: rain, reducedMotion: false }), 1);
    expect(wet.flies.visible).toBe(false);

    const f = makeFlies();
    expect(f.name).toBe('dragonflies');
    expect(f.frustumCulled).toBe(false);
    expect(f.userData.noCast).toBe(true);
    expect(f.castShadow).toBe(false);
    expect(f.material.vertexColors).toBe(true);
    expect(f.material.customProgramCacheKey()).toBe('dragonflies-v1');
    for (const a of ['aHome', 'aSeed', 'aWing']) expect(f.geometry.attributes[a]).toBeTruthy();
    // 6 body + 4 wing triangles a fly.
    expect(triCount(f.geometry)).toBe(14 * 10);
  });

  it('the flies shrink away as rain comes, and come back after', () => {
    let raining = false;
    const weather = { condition: 'rain', isRaining: () => raining };
    const m = { mist: makeMist(), flies: makeFlies() };
    const life = createMarshLife({ ...m, dusk: false, weather, reducedMotion: false });
    const u = m.flies.userData.dragonflies;
    run(life, 5);
    expect(u.uShow.value).toBe(1);
    raining = true;
    life.update(0.1, 0, null, null);
    // Easing, not popping.
    expect(m.flies.visible).toBe(true);
    expect(u.uShow.value).toBeCloseTo(0.9, 5);
    run(life, 15);
    expect(u.uShow.value).toBe(0);
    expect(m.flies.visible).toBe(false);
    raining = false;
    life.update(0.1, 0, null, null);
    expect(m.flies.visible).toBe(true);
    expect(u.uShow.value).toBeCloseTo(0.1, 5);
  });

  it('the shader patches land in three\'s basic shader', () => {
    const patched = (mesh) => {
      const shader = {
        vertexShader: THREE.ShaderLib.basic.vertexShader,
        fragmentShader: THREE.ShaderLib.basic.fragmentShader,
        uniforms: {},
      };
      mesh.material.onBeforeCompile(shader);
      return shader;
    };
    const mist = patched(makeMist());
    for (const id of ['attribute float aSheet', 'vMistW = (modelMatrix', 'vSheet = aSheet']) {
      expect(mist.vertexShader).toContain(id);
    }
    for (const id of ['uniform float uMist', 'uniform float uTime', 'uniform vec3 uColor', 'diffuseColor.a *= uMist', 'cameraPosition', 'discard']) {
      expect(mist.fragmentShader).toContain(id);
    }
    expect(Object.keys(mist.uniforms).sort()).toEqual(['uColor', 'uMist', 'uTime']);
    const fly = patched(makeFlies());
    for (const id of ['attribute vec3 aHome', 'attribute float aSeed', 'attribute float aWing', 'uniform float uCalm', 'uniform float uShow', 'transformed = vec3(', 'mod(k, 256.0)', 'uTime * 70.0']) {
      expect(fly.vertexShader).toContain(id);
    }
    expect(Object.keys(fly.uniforms).sort()).toEqual(['uCalm', 'uShow', 'uTime']);
  });

  it('the dragonflies are storybook-sized, 1.6x a 0.1 m fly', () => {
    const pos = makeFlies().geometry.attributes.position;
    // Fly 0's body is its first 18 vertices; its local x runs tail to head.
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 18; i++) { lo = Math.min(lo, pos.getX(i)); hi = Math.max(hi, pos.getX(i)); }
    expect(hi - lo).toBeCloseTo(0.16, 5);
  });

  it('reduced motion calms the dragonflies', () => {
    const m = { mist: makeMist(), flies: makeFlies() };
    run(createMarshLife({ ...m, dusk: false, weather: sunset, reducedMotion: true }), 10);
    expect(m.flies.userData.dragonflies.uCalm.value).toBe(1);
    // The mist does not drift.
    expect(m.mist.userData.marshMist.uTime.value).toBe(0);
  });

  it('homes are over water, off the decks, in bounds', () => {
    const homes = riverDragonflyHomes();
    expect(homes).toHaveLength(14);
    expect(riverDragonflyHomes()).toEqual(homes);
    const hues = new Set();
    for (const h of homes) {
      expect(inWater(OPEN, h.x, h.z)).toBe(true);
      for (const d of RIVER_DECKS) expect(rectDist(d, h.x, h.z)).toBeGreaterThanOrEqual(3);
      expect(h.x).toBeGreaterThanOrEqual(BOUNDS.minX);
      expect(h.x).toBeLessThanOrEqual(BOUNDS.maxX);
      expect(h.z).toBeGreaterThanOrEqual(BOUNDS.minZ);
      expect(h.z).toBeLessThanOrEqual(BOUNDS.maxZ);
      expect(h.y).toBeGreaterThanOrEqual(0.35);
      expect(h.y).toBeLessThanOrEqual(0.9);
      expect([0x2f8fb0, 0x3fa070, 0xc04a3a]).toContain(h.hue);
      hues.add(h.hue);
    }
    expect(hues.size).toBe(3);
    // Not all in one water.
    const ids = new Set(homes.map((h) => OPEN.find((w) => inWater([w], h.x, h.z)).id));
    for (const id of ['river-west', 'river-east', 'pond']) expect(ids.has(id)).toBe(true);
    expect([...ids].some((id) => id.startsWith('pool'))).toBe(true);
  });

  it('river build returns life and the two meshes', () => {
    const scene = new THREE.Scene();
    const data = build(scene);
    const mist = scene.children.find((c) => c.name === 'marshMist');
    const flies = scene.children.find((c) => c.name === 'dragonflies');
    expect(mist).toBeTruthy();
    expect(flies).toBeTruthy();
    expect(typeof data.life).toBe('function');
    const life = data.life({ dusk: true, weather: clear, reducedMotion: false });
    run(life);
    expect(mist.visible).toBe(true);
    expect(flies.visible).toBe(false);
    life.dispose();
  }, 120_000);

  it('mist + flies ≤ 900 triangles', () => {
    const t = triCount(makeMist().geometry) + triCount(makeFlies().geometry);
    expect(t).toBeLessThanOrEqual(900);
  });
});
