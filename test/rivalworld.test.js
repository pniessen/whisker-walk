import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Same headless stub every world test uses: the only DOM the builders touch
// is document.createElement('canvas') for the billboard texture.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    // A blanket no-op Proxy is enough for the billboard's canvas, but not for
    // render/textures.js's surface tiles, which the world builders now ask
    // for. Two of their calls need a real answer rather than undefined:
    //   * createLinear/RadialGradient — the painters add colour stops to
    //     whatever comes back;
    //   * getImageData — every tile ends with a getImageData/putImageData
    //     readback (clampToFloor, the pass that GUARANTEES no texel falls
    //     below the luminance floor). clampToFloor does guard the headless
    //     path, but it guards it by asking whether getImageData is a
    //     function, which a blanket Proxy always answers yes to.
    // A zeroed buffer is the truthful answer here: nothing was ever actually
    // rasterised into this canvas.
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

const { build: buildNeigh } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildSea } = await import('../src/world/seaside.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { patrolPath, borderMarks, rivalFor, isTrespassing } = await import('../src/rivalclans.js');
const { patrolAt, chaseOutcome, findLanding } = await import('../src/rivalcats.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { waterClearance } = await import('../src/world/builder.js');
const { GOLD_MICE } = await import('../src/goldmice.js');

// The rival's patrol, its marks and its chase against the REAL built areas:
// the pure tests in rivalcats.test.js cannot know where a container is.
const BUILD = { neighborhood: buildNeigh, park: buildPark, seaside: buildSea, docks: buildDocks };
const AREAS = Object.keys(BUILD);
const built = Object.fromEntries(AREAS.map((a) => [a, BUILD[a](new THREE.Scene())]));

describe('the patrol ring in the real areas', () => {
  it('every patrol and mark point clears every collider by the cat\'s radius', () => {
    for (const a of AREAS) {
      for (const p of [...patrolPath(a), ...borderMarks(a)]) {
        for (const c of built[a].colliders) {
          expect(Math.hypot(p.x - c.x, p.z - c.z), `${a} ${p.x},${p.z} vs ${c.x},${c.z}`).toBeGreaterThanOrEqual(c.r + CAT_RADIUS);
        }
      }
    }
  });

  it('the patrol cat itself never stands inside a collider or the water', () => {
    for (const a of AREAS) {
      for (let t = 0; t < 120; t += 0.37) {
        const p = patrolAt(a, t);
        expect(isWalkableAt(built[a], p.x, p.z), `${a} t=${t}`).toBe(true);
      }
    }
  });

  it('clears every collider by about 0.5m beyond the cat\'s radius on the whole ring', () => {
    // sampled finely, not just at the 16 vertices, since the cat walks the chords
    for (const a of AREAS) {
      const { cx, cz, r } = rivalFor(a);
      for (let i = 0; i < 720; i++) {
        const th = (i / 720) * Math.PI * 2;
        const x = cx + Math.cos(th) * r;
        const z = cz + Math.sin(th) * r;
        for (const c of built[a].colliders) {
          expect(Math.hypot(x - c.x, z - c.z)).toBeGreaterThanOrEqual(c.r + CAT_RADIUS + 0.4);
        }
      }
    }
  });

  it('nothing the player must reach is inside a territory', () => {
    for (const a of AREAS) {
      for (const m of GOLD_MICE[a]) expect(isTrespassing(a, m.x, m.z)).toBe(false);
      for (const p of built[a].pois) expect(isTrespassing(a, p.x, p.z)).toBe(false);
    }
  });
});

describe('isWalkableAt', () => {
  it('judges bounds, colliders and water the way player.update pushes them', () => {
    const area = { bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, colliders: [{ x: 0, z: 0, r: 1 }], waters: [{ id: 'p', kind: 'circle', x: 6, z: 0, r: 2 }] };
    expect(isWalkableAt(area, 3, 3)).toBe(true);
    expect(isWalkableAt(area, 11, 0)).toBe(false);          // out of bounds
    expect(isWalkableAt(area, 0, 1 + CAT_RADIUS - 0.01)).toBe(false); // inside a collider's stand-off
    expect(isWalkableAt(area, 0, 1 + CAT_RADIUS + 0.01)).toBe(true);
    expect(isWalkableAt(area, 6, 0)).toBe(false);           // in the water
    expect(isWalkableAt(area, 6, 2 + CAT_RADIUS - 0.01)).toBe(false); // too near the waterline
    expect(isWalkableAt(area, 6, 2 + CAT_RADIUS + 0.01)).toBe(true);
    expect(isWalkableAt(area, NaN, 0)).toBe(false);
    expect(isWalkableAt({}, 1, 1)).toBe(true);
  });

  it('agrees with the water helper on the real areas', () => {
    for (const a of ['park', 'seaside', 'docks']) {
      const area = built[a];
      for (let x = area.bounds.minX; x <= area.bounds.maxX; x += 3) {
        for (let z = area.bounds.minZ; z <= area.bounds.maxZ; z += 3) {
          if (isWalkableAt(area, x, z)) expect(waterClearance(area.waters, x, z)).toBeGreaterThanOrEqual(CAT_RADIUS);
        }
      }
    }
  });
});

describe('a chase in the real areas', () => {
  it('always lands somewhere walkable and outside the disc', () => {
    for (const a of AREAS) {
      const area = built[a];
      const { cx, cz, r } = rivalFor(a);
      const walk = (x, z) => isWalkableAt(area, x, z);
      let n = 0;
      for (let gx = -r; gx <= r; gx += 0.5) {
        for (let gz = -r; gz <= r; gz += 0.5) {
          const cat = { x: cx + gx, z: cz + gz };
          if (!isTrespassing(a, cat.x, cat.z) || !walk(cat.x, cat.z)) continue;
          const out = chaseOutcome(a, cat, { x: cat.x, z: cat.z });
          const land = findLanding(a, out.to, walk);
          expect(land, `${a} ${cat.x},${cat.z}`).not.toBeNull();
          expect(walk(land.x, land.z)).toBe(true);
          expect(isTrespassing(a, land.x, land.z)).toBe(false);
          n++;
        }
      }
      expect(n).toBeGreaterThan(20);
    }
  });
});
