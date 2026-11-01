import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createPlayer, isWadeableAt, SWIM_SPEED } from '../src/player.js';
import { WADE_SPEED, SHAKE_PACE } from '../src/waterstate.js';
import { inWater, shallowExcess, waterClearance } from '../src/world/builder.js';

// ---------------------------------------------------------------------------
// Wading. Every cat walks into a shallow band at the shore and stops at its
// inner line, dead still; a cat with Sea Legs swims on past it. These drive
// the real player.update, the same way test/waterblock.test.js does.
// ---------------------------------------------------------------------------

// Same stub as test/waterblock.test.js: createPlayer needs document's
// listeners, the world builders need a canvas.
vi.stubGlobal('document', {
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
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

const { build: buildSeaside } = await import('../src/world/seaside.js');
const { build: buildRiver } = await import('../src/world/river.js');
const SEASIDE = buildSeaside(new THREE.Scene());
const RIVER = buildRiver(new THREE.Scene());

const CAT_RADIUS = 0.35;
const PACE = 3.5;
const FRAME = 1 / 60;

const POND = { id: 'pond', kind: 'circle', x: 0, z: 0, r: 5 };
const SHALLOW_POND = { ...POND, shallow: 1.2 };
const BIG = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };

function harness() {
  const player = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
  const cat = new THREE.Object3D();
  player.setAvatar(cat, PACE);
  player.enable();
  return { player, cat };
}

function drive(player, cat, dir, seconds, opts = {}) {
  const { colliders = [], bounds = BIG, waters = [SHALLOW_POND], onFrame } = opts;
  player.setTouchMove({ x: dir.x, z: dir.z, mag: 1 });
  for (let t = 0; t < seconds; t += FRAME) {
    player.update(FRAME, colliders, bounds, waters);
    if (onFrame) onFrame(cat.position);
  }
}

function driveIn(player, cat, area, dir, seconds, onFrame) {
  drive(player, cat, dir, seconds, {
    colliders: area.colliders, bounds: area.bounds, waters: area.waters, onFrame,
  });
}

describe('a cat without Sea Legs wades', () => {
  let player, cat;
  beforeEach(() => { ({ player, cat } = harness()); });
  afterEach(() => player.disable());

  it('a non-swimmer wades in to the band and stops there, dead still', () => {
    cat.position.set(12, 0, 0);
    const xs = [];
    let wetFor = 0;
    let entered = false;
    drive(player, cat, { x: -1, z: 0 }, 6, {
      onFrame: (p) => {
        xs.push(p.x);
        if (player.water !== 'dry') entered = true;
        if (entered) {
          expect(player.water).toBe('wade');
          wetFor += FRAME;
        }
        // Velocity eases (1 − 0.001^dt per frame), and the cat arrives
        // zooming, so it is close to wading pace after 0.5 s and at it,
        // to 1e-6, by 2.5 s.
        if (wetFor >= 0.5) expect(player.speed).toBeLessThanOrEqual(PACE * WADE_SPEED + 0.1);
        if (wetFor >= 2.5) expect(player.speed).toBeLessThanOrEqual(PACE * WADE_SPEED + 1e-6);
      },
    });
    expect(entered).toBe(true);
    expect(wetFor).toBeGreaterThan(2.5);
    const settled = cat.position.x;
    expect(settled).toBeCloseTo(3.8, 1);
    expect(Math.abs(settled - 3.8)).toBeLessThan(0.01);
    for (const x of xs.slice(-180)) expect(Math.abs(x - settled)).toBeLessThan(1e-9);
  });

  it('slides along the band at an angle instead of sticking', () => {
    cat.position.set(6, 0, 0);
    // 30° off the inward shore normal (−x).
    const dir = { x: -Math.cos(Math.PI / 6), z: Math.sin(Math.PI / 6) };
    drive(player, cat, dir, 2, {
      onFrame: (p) => expect(shallowExcess([SHALLOW_POND], p.x, p.z)).toBeLessThanOrEqual(1e-9),
    });
    const a0 = Math.atan2(cat.position.z, cat.position.x);
    drive(player, cat, dir, 2, {
      onFrame: (p) => expect(shallowExcess([SHALLOW_POND], p.x, p.z)).toBeLessThanOrEqual(1e-9),
    });
    const a1 = Math.atan2(cat.position.z, cat.position.x);
    // arc length along the ~3.8 m band line
    expect(Math.abs(a1 - a0) * 3.79).toBeGreaterThanOrEqual(1);
  });

  it("settles into the River's inside corner without jitter", () => {
    const area = RIVER;
    cat.position.set(10, 0, -25);
    const dir = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
    const ps = [];
    driveIn(player, cat, area, dir, 4, (p) => {
      ps.push([p.x, p.z]);
      expect(isWadeableAt(area, p.x, p.z), `${p.x},${p.z}`).toBe(true);
    });
    expect(player.water).toBe('wade');
    const last = ps[ps.length - 1];
    for (const [x, z] of ps.slice(-60)) {
      expect(Math.abs(x - last[0])).toBeLessThan(1e-6);
      expect(Math.abs(z - last[1])).toBeLessThan(1e-6);
    }
  });

  it('a non-swimmer driving along the pier edge holds its line', () => {
    const area = SEASIDE;
    cat.position.set(27, 0, -8.5);
    let frames = 0;
    driveIn(player, cat, area, { x: 1, z: 0.1 }, 4, (p) => {
      frames++;
      expect(Math.abs(p.z - -8.5), `frame ${frames} at x ${p.x}`).toBeLessThanOrEqual(0.01);
    });
    expect(cat.position.x).toBeGreaterThan(33);
  });

  it('a pond without shallow still behaves exactly as v20', () => {
    cat.position.set(12, 0, 0);
    const gaps = [];
    drive(player, cat, { x: -1, z: 0 }, 6, {
      waters: [POND], onFrame: (p) => gaps.push(waterClearance([POND], p.x, p.z)),
    });
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0);
    expect(cat.position.x).toBeCloseTo(POND.r + CAT_RADIUS, 6);
    expect(cat.position.z).toBeCloseTo(0, 6);
    expect(player.water).toBe('dry');
  });
});

describe('a cat with Sea Legs swims', () => {
  let player, cat;
  beforeEach(() => { ({ player, cat } = harness()); player.setSwim(true); });
  afterEach(() => player.disable());

  it('a swimmer is never pushed and swims past the band at SWIM_SPEED', () => {
    cat.position.set(12, 0, 0);
    player.setTouchMove({ x: -1, z: 0, mag: 1 });
    let guard = 0;
    while (cat.position.x > 0 && guard++ < 1000) player.update(FRAME, [], BIG, [SHALLOW_POND]);
    expect(player.water).toBe('swim');
    expect(player.swimming).toBe(true);
    expect(player.inWater).toBe(true);
    expect(player.wading).toBe(false);
    drive(player, cat, { x: -1, z: 0 }, 0.5);
    expect(player.water).toBe('swim');
    expect(Math.abs(player.speed - PACE * SWIM_SPEED)).toBeLessThanOrEqual(0.02);
  });

  it('swimming still beats walking round, band included', () => {
    const r = SHALLOW_POND.r;
    const s = SHALLOW_POND.shallow;
    expect(2 * s / WADE_SPEED + (2 * r - 2 * s) / SWIM_SPEED).toBeLessThan(2 * r + Math.PI * r);
  });

  it('a pier-edge walk never jams the cat', () => {
    const area = SEASIDE;
    cat.position.set(22, 0, -8.5);
    driveIn(player, cat, area, { x: 1, z: 0 }, 3);
    expect(cat.position.x - 22).toBeGreaterThanOrEqual(5);
  });
});

describe('zoomies and the shake', () => {
  let player, cat;
  beforeEach(() => { ({ player, cat } = harness()); });
  afterEach(() => player.disable());

  it('no zoomies in water', () => {
    cat.position.set(30, 0, 0);
    player.setTouchMove({ x: -1, z: 0, mag: 1 });
    let wasZooming = false;
    let checked = false;
    for (let t = 0; t < 12 && !checked; t += FRAME) {
      wasZooming = player.zooming;
      player.update(FRAME, [], BIG, [SHALLOW_POND]);
      if (player.waterState.entered) {
        expect(wasZooming).toBe(true);
        expect(player.zooming).toBe(false);
        checked = true;
      }
    }
    expect(checked).toBe(true);

    // 8 s of circling in the shallows never zooms.
    const { player: p2, cat: c2 } = harness();
    c2.position.set(4.3, 0, 0);
    let wet = 0;
    for (let t = 0; t < 8; t += FRAME) {
      p2.setTouchMove({ x: Math.cos(t * 3), z: Math.sin(t * 3), mag: 1 });
      p2.update(FRAME, [], BIG, [SHALLOW_POND]);
      expect(p2.zooming).toBe(false);
      if (p2.inWater) wet++;
    }
    expect(wet).toBeGreaterThan(8 / FRAME / 2);
    p2.disable();
  });

  it('slows to SHAKE_PACE while shaking, then recovers', () => {
    cat.position.set(4.4, 0, 0);
    player.setTouchMove(null);
    for (let t = 0; t < 3.5; t += FRAME) player.update(FRAME, [], BIG, [SHALLOW_POND]);
    expect(player.water).toBe('wade');
    player.setTouchMove({ x: 1, z: 0, mag: 1 });
    let guard = 0;
    while (!player.waterState.shook && guard++ < 120) player.update(FRAME, [], BIG, [SHALLOW_POND]);
    expect(player.waterState.shook).toBe(true);
    expect(player.shaking).toBe(true);
    expect(player.water).toBe('dry');
    for (let i = 0; i < 42; i++) player.update(FRAME, [], BIG, [SHALLOW_POND]); // 0.7 s
    expect(player.shaking).toBe(true);
    expect(Math.abs(player.speed - PACE * SHAKE_PACE)).toBeLessThanOrEqual(0.02);
    drive(player, cat, { x: 1, z: 0 }, 1);
    expect(player.shaking).toBe(false);
    expect(player.speed).toBeGreaterThanOrEqual(PACE - 0.02);
  });
});

describe('the api fields', () => {
  it('reports dry on land, and setAvatar resets the state in place', () => {
    const { player, cat } = harness();
    const st = player.waterState;
    expect(player.water).toBe('dry');
    cat.position.set(4.4, 0, 0);
    player.update(FRAME, [], BIG, [SHALLOW_POND]);
    expect(player.water).toBe('wade');
    expect(player.wading).toBe(true);
    expect(player.inWater).toBe(true);
    expect(player.swimming).toBe(false);
    expect(player.waterState).toBe(st);
    player.setAvatar(cat, PACE);
    expect(player.waterState).toBe(st);
    expect(st.mode).toBe('dry');
    expect(inWater([SHALLOW_POND], cat.position.x, cat.position.z)).toBe(true);
    player.disable();
  });
});
