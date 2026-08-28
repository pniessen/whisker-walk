import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless stub every world test uses — see test/docks.test.js for
// why a blanket Proxy is not enough (the surface painters need real answers
// from getImageData and create*Gradient).
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

const b = await import('../src/world/builder.js');
const { createWind } = await import('../src/render/wind.js');
const { surfaceProps } = await import('../src/render/materials.js');

// The peak lean a registered object reaches, measured by sweeping absolute
// time rather than by reading wind.js's internals: the module deliberately
// returns no per-object handle, and what this pass actually cares about is the
// pose on screen. The sweep is dense and long enough to catch a gust peak.
function sway(obj, wind) {
  const base = { x: obj.rotation.x, z: obj.rotation.z };
  let peak = 0;
  let crossings = 0;
  let prev = 0;
  for (let i = 0; i <= 6000; i++) {
    const t = i * 0.01; // 60s at 100Hz — GUST_FREQUENCY's period is ~52s
    wind.update(t);
    const d = obj.rotation.z - base.z;
    peak = Math.max(peak, Math.abs(d));
    if (i > 0 && Math.sign(d) !== Math.sign(prev) && d !== 0) crossings++;
    prev = d;
  }
  return { peak, crossings };
}

describe('builder — additive surface pass', () => {
  it('leaves every existing call site alone: no options object is required', () => {
    // The whole four-agent handover depends on this. Each of these is a call
    // shape that ships in a world file today.
    expect(() => {
      b.ground(70, 0x6aa04e);
      b.path(0, 0, 0, 10);
      b.sidewalk(-16, -14.5, 16, -14.5, 1.6);
      b.house(1.5, -22);
      b.tree(-5.5, -18, 1.1);
      b.bush(-2.4, -17);
      b.flowerPatch(0, -18);
      b.fenceRun(-13, -16, 13, -16);
      b.bench(2, 2);
      b.car(1, 1);
      b.lampPost(5, -16.6);
      b.puddle(3, 3);
      b.rock(0, 0);
      b.platform(0, 0, 1.2);
    }).not.toThrow();
  });

  it('keeps bush() a bare Mesh at its shipped position when no wind is passed', () => {
    const m = b.bush(-2.4, -17);
    expect(m.isMesh).toBe(true);
    expect([m.position.x, m.position.y, m.position.z]).toEqual([-2.4, 0.5, -17]);
  });

  it('gives the puddle the water preset — the one prop walk.js builds for every area', () => {
    const p = b.puddle(3, 3, 0.8);
    expect(p.material.roughness).toBe(surfaceProps('water').roughness);
    // Still a cheap disc, never a createWater rig.
    expect(p.geometry.type).toBe('CircleGeometry');
  });

  it('compensates a grass lawn for the tile mean, and only when it is textured', () => {
    // 0x6aa04e lifted by 1/0.955 — the world file's authored hex is untouched
    // and still lands on the colour it ships.
    expect(b.ground(70, 0x6aa04e, { surface: 'grass' }).material.color)
      .toEqual(new THREE.Color(0x6fa852));
    expect(b.ground(70, 0x6aa04e).material.color).toEqual(new THREE.Color(0x6aa04e));
    // A non-grass surface is NOT lifted (the Docks' cobbles want the drop).
    expect(b.ground(120, 0x4e4e58, { surface: 'wetStone' }).material.color)
      .toEqual(new THREE.Color(0x4e4e58));
  });

  it('compensates a brick house body the way warehouse() already does', () => {
    const brick = b.house(0, 0, 0x8a6a5a, 0xb05a4a, 'brick');
    expect(brick.children[0].material.color).toEqual(new THREE.Color(0x92705f));
    // Siding's 0.988 mean is inside the noise and is left alone.
    const painted = b.house(0, 0, 0x8a6a5a);
    expect(painted.children[0].material.color).toEqual(new THREE.Color(0x8a6a5a));
  });

  it('uses no metalness anywhere — bareMetal stays unused across the shared props', () => {
    const scene = new THREE.Group();
    for (const prop of [
      b.house(0, 0), b.tree(0, 0), b.bush(0, 0), b.fenceRun(0, 0, 4, 0),
      b.mailbox(0, 0), b.car(0, 0), b.bench(0, 0), b.lampPost(0, 0), b.bike(0, 0),
      b.rock(0, 0), b.puddle(0, 0), b.flowerPatch(0, 0), b.radiator(0, 0),
      b.dresser(0, 0), b.bookcase(0, 0), b.tvSet(0, 0), b.pottedPlant(0, 0),
      b.petBowls(0, 0), b.logBasket(0, 0), b.wallShelf(0, 1, 0),
    ]) scene.add(prop);
    scene.traverse((o) => {
      if (o.material && o.material.metalness !== undefined) {
        expect(o.material.metalness).toBe(0);
      }
    });
  });
});

describe('builder — wind registration', () => {
  it('registers a tree with the wind it is handed, and nothing without one', () => {
    const wind = createWind();
    const still = b.tree(3, 4, 1);
    wind.update(1.5);
    expect(still.rotation.z).toBe(0);

    const swayed = b.tree(3, 4, 1, { wind });
    wind.update(1.5);
    expect(swayed.rotation.z).not.toBe(0);
    // The whole point of wind.js's rotation-only design: the collider record
    // this tree carries reads position.x/z, and those must never move.
    expect([swayed.position.x, swayed.position.z]).toEqual([3, 4]);
  });

  it('hinges a windy bush at its base rather than its belly', () => {
    const wind = createWind();
    const g = b.bush(-2.4, -17, { wind });
    // A Group whose origin IS ground contact, so the rotation wind.js applies
    // pivots at the root with no reparenting (which could not work anyway —
    // a builder registers before the caller has called scene.add).
    expect(g.isGroup).toBe(true);
    expect([g.position.x, g.position.y, g.position.z]).toEqual([-2.4, 0, -17]);
    // The mesh is exactly where the flat version put it.
    const m = g.children[0];
    expect(m.isMesh).toBe(true);
    expect(m.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(0.5, 6);
  });

  it('sways a bush LESS and FASTER than a tree (the brief, not the inertia model)', () => {
    const wind = createWind();
    // Same position, so the only difference between them is the tuning.
    const tree = b.tree(5, 5, 1, { wind });
    const bush = b.bush(5, 5, { wind });
    const t = sway(tree, wind);
    const s = sway(bush, wind);
    expect(s.peak).toBeLessThan(t.peak);      // less
    expect(s.crossings).toBeGreaterThan(t.crossings); // faster
  });

  it('gives a bigger tree more lean and a slower cycle', () => {
    const wind = createWind();
    const big = b.tree(5, 5, 1.6, { wind });
    const small = b.tree(5, 5, 0.7, { wind });
    const B = sway(big, wind);
    const S = sway(small, wind);
    expect(B.peak).toBeGreaterThan(S.peak);
    expect(B.crossings).toBeLessThan(S.crossings);
  });

  it('keeps every sway under a few degrees, foliage-not-jelly', () => {
    const wind = createWind();
    const props = [
      b.tree(5, 5, 1.6, { wind }),
      b.bush(2, -3, { wind }),
      b.flowerPatch(-7, 1, { wind }),
    ];
    for (const p of props) {
      // Worst case the system can produce: a gust peak at the rain intensity
      // main.js drives, on the biggest amplitude here.
      let peak = 0;
      for (let i = 0; i <= 6000; i++) {
        const t = i * 0.01;
        wind.update(t, 1.7);
        peak = Math.max(peak, Math.abs(p.rotation.z), Math.abs(p.rotation.x));
      }
      expect(peak).toBeLessThan(0.09); // ~5°
    }
  });

  it('reducedMotion registers but never moves anything', () => {
    const wind = createWind({ reducedMotion: true });
    const tree = b.tree(3, 4, 1.2, { wind });
    const bush = b.bush(3, 4, { wind });
    wind.update(12.5, 1.7);
    expect(tree.rotation.z).toBe(0);
    expect(bush.rotation.z).toBe(0);
  });
});
