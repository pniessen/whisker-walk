import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Polish-waterlife Task 2: a little silver fish now and then jumps out of a
// lake (src/render/fishjump.js). Each case builds the real area into a fresh
// scene, exactly as walk.js does (test/waterdress.test.js's way).

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
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

const {
  createFishJumps, NO_FISH, fishSpots, jumpAt,
  FISH_SLOT, FISH_JITTER, FISH_DUR, FISH_NEAR, FISH_FAR, FISH_CAP,
} = await import('../src/render/fishjump.js');
const { resolveQuality } = await import('../src/render/quality.js');
const HIGH = resolveQuality({ override: 'high' });
const { waterClearance, waterGap } = await import('../src/world/builder.js');
const WORLDS = {
  park: await import('../src/world/park.js'),
  docks: await import('../src/world/docks.js'),
  gorge: await import('../src/world/gorge.js'),
  woods: await import('../src/world/woods.js'),
  river: await import('../src/world/river.js'),
  moor: await import('../src/world/moor.js'),
  pines: await import('../src/world/pines.js'),
  seaside: await import('../src/world/seaside.js'),
  neighborhood: await import('../src/world/neighborhood.js'),
};

const DT = 1 / 60;
const built = new Map();
function area(id) {
  if (!built.has(id)) {
    const scene = new THREE.Scene();
    const areaData = WORLDS[id].build(scene);
    built.set(id, { scene, areaData });
  }
  return built.get(id);
}

function stubSplash() {
  const calls = [];
  return { calls, emitAt(x, z, opts) { calls.push({ x, z, ...opts }); } };
}

// A cat 10 m from `spot`, and a camera behind the cat looking at it.
function rig(spot) {
  const cat = new THREE.Group();
  cat.position.set(spot.x + 10, 0, spot.z);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(spot.x + 14, 2, spot.z);
  camera.lookAt(spot.x, 0, spot.z);
  return { cat, camera };
}

function fishOn(id, extra = {}) {
  const { areaData } = area(id);
  const scene = new THREE.Scene();
  const splash = stubSplash();
  const spots = fishSpots(id, areaData);
  const { cat, camera } = rig(spots[0]);
  let t = 0;
  const clock = { set: (v) => { t = v; }, get: () => t };
  const fish = createFishJumps(scene, {
    areaId: id, areaData, tier: HIGH, reducedMotion: false, splash, cat, camera, now: () => t, ...extra,
  });
  return { scene, fish, splash, clock, spots, areaData };
}

describe('fishjump constants', () => {
  it('are the spec values', () => {
    expect([FISH_SLOT, FISH_JITTER, FISH_DUR, FISH_NEAR, FISH_FAR, FISH_CAP]).toEqual([14, 6, 0.9, 6, 25, 3]);
  });
});

describe('fishSpots', () => {
  it('woods, pines, moor, river and park have lake spots; streams do not', () => {
    for (const id of ['woods', 'pines', 'moor', 'river', 'park']) {
      const { areaData } = area(id);
      const spots = fishSpots(id, areaData);
      expect(spots.length, id).toBeGreaterThan(0);
      expect(spots.length, id).toBeLessThanOrEqual(64);
      for (const s of spots) {
        expect(waterClearance(areaData.waters, s.x, s.z), id).toBeLessThan(-2.5);
        const h = areaData.waterFx.find((w) => waterGap(w.footprint, s.x, s.z) < 0 && w.style !== 'sea' && w.style !== 'bog');
        expect(h, id).toBeTruthy();
        expect(Number.isFinite(s.y)).toBe(true);
      }
    }
    const { areaData } = area('woods');
    const lakes = areaData.waterFx.filter((h) => h.footprint.id === 'lake' || h.footprint.id === 'pond');
    for (const s of fishSpots('woods', areaData)) {
      expect(lakes.some((h) => waterGap(h.footprint, s.x, s.z) < 0)).toBe(true);
    }
  }, 120_000);

  it('neighbourhood, docks, seaside and gorge get NO_FISH', () => {
    for (const id of ['neighborhood', 'docks', 'seaside', 'gorge']) {
      const { areaData } = area(id);
      expect(fishSpots(id, areaData), id).toEqual([]);
      const scene = new THREE.Scene();
      const fish = createFishJumps(scene, { areaId: id, areaData, tier: HIGH, reducedMotion: false, splash: stubSplash() });
      expect(fish, id).toBe(NO_FISH);
      expect(scene.children).toHaveLength(0);
    }
    expect(fishSpots('den', { waters: [], waterFx: [] })).toEqual([]);
    const scene = new THREE.Scene();
    const rm = createFishJumps(scene, { areaId: 'woods', areaData: area('woods').areaData, tier: HIGH, reducedMotion: true, splash: stubSplash() });
    expect(rm).toBe(NO_FISH);
    expect(scene.children).toHaveLength(0);
    expect(Object.isFrozen(NO_FISH)).toBe(true);
    expect(NO_FISH.meshes).toEqual([]);
    expect(NO_FISH.spots).toEqual([]);
    expect(NO_FISH.drawCount).toBe(0);
    expect(() => { NO_FISH.update(DT); NO_FISH.dispose(); }).not.toThrow();
  }, 120_000);
});

describe('jumpAt', () => {
  it('jumpAt is deterministic and starts 8–20 s apart', () => {
    expect(jumpAt('woods', 7)).toEqual(jumpAt('woods', 7));
    expect(jumpAt('woods', 7)).not.toEqual(jumpAt('moor', 7));
    let prev = null;
    for (let k = 0; k <= 200; k++) {
      const j = jumpAt('woods', k);
      expect(j.at).toBeGreaterThanOrEqual(k * FISH_SLOT);
      expect(j.at).toBeLessThan(k * FISH_SLOT + FISH_JITTER);
      for (const key of ['pick', 'len', 'height', 'yaw']) {
        expect(j[key]).toBeGreaterThanOrEqual(0);
        expect(j[key]).toBeLessThan(1);
      }
      if (prev) {
        expect(j.at - prev.at).toBeGreaterThanOrEqual(8);
        expect(j.at - prev.at).toBeLessThanOrEqual(20);
      }
      prev = j;
    }
  });
});

describe('createFishJumps', () => {
  it('one non-casting InstancedMesh, invisible until a fish jumps, ≤ 24 triangles', () => {
    const { scene, fish } = fishOn('woods');
    expect(scene.children).toHaveLength(1);
    const [m] = fish.meshes;
    expect(m.isInstancedMesh).toBe(true);
    expect(m.name).toBe('fishJump');
    expect(m.instanceMatrix.count).toBe(FISH_CAP);
    expect(m.castShadow).toBe(false);
    expect(m.receiveShadow).toBe(false);
    expect(m.userData.noCast).toBe(true);
    expect(m.frustumCulled).toBe(false);
    expect(m.visible).toBe(false);
    expect(fish.drawCount).toBe(0);
    const g = m.geometry;
    const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    expect(tris).toBeLessThanOrEqual(24);
    expect(m.material.isMeshStandardMaterial).toBe(true);
    expect(m.material.color.getHex()).toBe(0xc9d3dc);
    expect(m.material.flatShading).toBe(true);
  }, 120_000);

  it('a fish arcs out and back within FISH_DUR and splashes twice', () => {
    const { fish, splash, clock, spots } = fishOn('woods');
    const k = 1000;
    const j = jumpAt('woods', k);
    const m = fish.meshes[0];
    const mat = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const water = spots[0].y;
    let visibleFrames = 0;
    let peak = -Infinity;
    for (let i = 0; i <= FISH_SLOT * 60; i++) {
      clock.set(k * FISH_SLOT + i * DT);
      fish.update(DT);
      if (splash.calls.length === 0) expect(m.visible).toBe(false);
      if (m.visible) {
        visibleFrames++;
        expect(m.count).toBe(1);
        m.getMatrixAt(0, mat);
        p.setFromMatrixPosition(mat);
        peak = Math.max(peak, p.y - water);
      }
      if (splash.calls.length === 2) expect(fish.drawCount).toBe(0);
    }
    expect(splash.calls).toHaveLength(2);
    expect(splash.calls[0]).toMatchObject({ ring: true, drops: 5 });
    expect(splash.calls[1]).toMatchObject({ ring: true, drops: 7 });
    const d = Math.hypot(splash.calls[1].x - splash.calls[0].x, splash.calls[1].z - splash.calls[0].z);
    expect(d).toBeCloseTo(0.7 + 0.5 * j.len, 1);
    expect(visibleFrames).toBeGreaterThanOrEqual(Math.floor(FISH_DUR * 60) - 2);
    expect(visibleFrames).toBeLessThanOrEqual(Math.ceil(FISH_DUR * 60) + 1);
    expect(peak).toBeGreaterThanOrEqual(0.44);
    expect(peak).toBeLessThanOrEqual(0.75);
    expect(peak).toBeCloseTo(0.45 + 0.3 * j.height, 1);
    expect(fish.drawCount).toBe(0);
    expect(m.visible).toBe(false);
    // The leap leaves from a spot 6–25 m from the cat.
    const leave = splash.calls[0];
    expect(fish.spots.some((s) => s.x === leave.x && s.z === leave.z)).toBe(true);
  }, 120_000);

  it('skips a slot when no spot is 6–25 m from the cat and in front of the camera', () => {
    const { areaData, spots } = fishOn('woods');
    const s0 = spots[0];
    const splash = stubSplash();
    let t = 0;
    const cat = new THREE.Group();
    const cam = new THREE.PerspectiveCamera();
    const fish = createFishJumps(new THREE.Scene(), {
      areaId: 'woods', areaData, tier: HIGH, reducedMotion: false, splash, cat, camera: cam, now: () => t,
    });
    // Far from every lake: nothing, ever.
    cat.position.set(5000, 0, 5000);
    cam.position.set(5004, 2, 5000);
    cam.lookAt(5000, 0, 5000);
    for (let i = 0; i <= FISH_SLOT * 60 * 3; i++) {
      t = 500 * FISH_SLOT + i * DT;
      fish.update(DT);
      expect(fish.drawCount).toBe(0);
    }
    expect(splash.calls).toHaveLength(0);
    // Beside the lake, looking away from spots[0]: any leap is from a spot in
    // range and inside the forward cone.
    cat.position.set(s0.x + 10, 0, s0.z);
    cam.position.set(s0.x + 6, 2, s0.z);
    cam.lookAt(s0.x + 30, 0, s0.z);
    for (let i = 0; i <= FISH_SLOT * 60 * 4; i++) {
      t = 600 * FISH_SLOT + i * DT;
      fish.update(DT);
    }
    const cos = Math.cos((55 * Math.PI) / 180);
    for (const c of splash.calls.filter((c) => c.drops === 5)) {
      const dx = c.x - cat.position.x;
      const dz = c.z - cat.position.z;
      const d = Math.hypot(dx, dz);
      expect(d).toBeGreaterThanOrEqual(FISH_NEAR);
      expect(d).toBeLessThanOrEqual(FISH_FAR);
      expect(dx / d).toBeGreaterThan(cos);
    }
    fish.dispose();
  }, 120_000);

  it('a clock jump of 10 minutes starts at most one fish and never leaves one mid-air', () => {
    const { fish, splash, clock } = fishOn('woods');
    const k = 2000;
    const j = jumpAt('woods', k);
    // Mid-air: 0.3 s into slot k's jump.
    let t = j.at;
    for (let i = 0; i < 18; i++) { clock.set(t); fish.update(DT); t += DT; }
    expect(fish.drawCount).toBe(1);
    // The tab sleeps for 10 minutes; then three seconds at 60 fps, and a
    // second with the clock stopped (no slot can start while it is stopped).
    splash.calls.length = 0;
    t += 600;
    for (let i = 0; i < 180; i++) { clock.set(t); fish.update(DT); t += DT; }
    for (let i = 0; i < 60; i++) fish.update(DT);
    expect(splash.calls.filter((c) => c.drops === 5).length).toBeLessThanOrEqual(1);
    // The fish that was mid-air landed.
    expect(splash.calls.filter((c) => c.drops === 7).length).toBeGreaterThanOrEqual(1);
    expect(fish.drawCount).toBe(0);
    expect(fish.meshes[0].visible).toBe(false);
    // Landing at a slot's start + 0.25 s (inside the 0.5 s window) fires that
    // slot's fish; landing 3 s after its start fires nothing.
    const k2 = 9000;
    const j2 = jumpAt('woods', k2);
    splash.calls.length = 0;
    clock.set(j2.at + 0.25);
    fish.update(DT);
    expect(fish.drawCount).toBe(1);
    for (let i = 0; i < 60; i++) fish.update(DT);
    expect(fish.drawCount).toBe(0);
    const k3 = 9100;
    const j3 = jumpAt('woods', k3);
    splash.calls.length = 0;
    clock.set(j3.at + 3);
    for (let i = 0; i < 60; i++) { fish.update(DT); }
    expect(splash.calls).toHaveLength(0);
  }, 120_000);

  it('each slot jumps at most once', () => {
    const { fish, splash, clock } = fishOn('woods');
    const k = 3000;
    const j = jumpAt('woods', k);
    clock.set(j.at + 0.1);
    for (let i = 0; i < 300; i++) fish.update(DT);
    clock.set(j.at + 0.2);
    for (let i = 0; i < 60; i++) fish.update(DT);
    expect(splash.calls.filter((c) => c.drops === 5)).toHaveLength(1);
  }, 120_000);

  it('allocates nothing over 60 s of updates', () => {
    const { scene, fish, clock } = fishOn('woods');
    const children = scene.children.length;
    const arrays = fish.meshes.map((m) => m.instanceMatrix.array);
    const geo = fish.meshes[0].geometry;
    let jumped = 0;
    for (let i = 0; i < 3600; i++) {
      clock.set(4000 * FISH_SLOT + i * DT);
      fish.update(DT);
      if (fish.drawCount) jumped++;
    }
    expect(jumped).toBeGreaterThan(0);
    expect(scene.children.length).toBe(children);
    fish.meshes.forEach((m, i) => expect(m.instanceMatrix.array).toBe(arrays[i]));
    expect(fish.meshes[0].geometry).toBe(geo);
  }, 120_000);

  it('dispose removes the mesh', () => {
    const { scene, fish } = fishOn('woods');
    expect(scene.children).toHaveLength(1);
    fish.dispose();
    expect(scene.children).toHaveLength(0);
  }, 120_000);
});
