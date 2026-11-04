import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The headless canvas stub every world test uses (see test/camp.test.js).
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

// addCamp gets the area's colliders as they stand when the world file calls
// it, not the finished list: the ring drawn in addCamp can only dodge what is
// already there. Record that list per area so the real-map test checks the
// ring addCamp will actually draw against every collider the finished map has.
const callTime = vi.hoisted(() => ({}));
vi.mock('../src/world/camp.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    addCamp: (scene, area, areaId) => {
      callTime[areaId] = area.colliders.map((c) => ({ ...c }));
      return mod.addCamp(scene, area, areaId);
    },
  };
});

const { campDressing, campLayout, CAMP_TURN } = await import('../src/world/camp.js');
const { DISCS } = await import('../src/rivalclans.js');
const { roamHomes } = await import('../src/clancast.js');
const { clanWalkableFor } = await import('../src/world/clanground.js');
const { gorgeGround, WIDE_LEDGE_RECT, CAMP_DEN } = await import('../src/world/gorgeshape.js');

const CAMPS = ['woods', 'river', 'moor', 'pines'];
const WORLDS = {
  woods: () => import('../src/world/woods.js'),
  river: () => import('../src/world/river.js'),
  moor: () => import('../src/world/moor.js'),
  pines: () => import('../src/world/pines.js'),
};
const seatsOf = (L) => [L.seats.leader, L.seats.deputy, ...L.seats.elders, ...L.seats.kits];
const angleOff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);

describe('campDressing (pure)', () => {
  it('is null where there is no camp', () => {
    for (const a of ['neighborhood', 'park', 'seaside', 'docks', 'den', 'island', '__proto__', 42, undefined]) {
      expect(campDressing(a), String(a)).toBeNull();
    }
  });

  it('is the same every call, and a fresh object each time', () => {
    for (const a of [...CAMPS, 'gorge']) {
      const one = campDressing(a);
      const two = campDressing(a);
      expect(two).toEqual(one);
      expect(two).not.toBe(one);
      expect(two.nests).not.toBe(one.nests);
      if (one.ring) expect(two.ring.clumps[0]).not.toBe(one.ring.clumps[0]);
    }
  });

  it('does not change campLayout', () => {
    for (const a of [...CAMPS, 'gorge']) {
      const before = campLayout(a);
      campDressing(a);
      expect(campLayout(a)).toEqual(before);
    }
  });

  it('rings each flat camp with clumps in two staggered rows, leaving one gap away from the den', () => {
    for (const a of CAMPS) {
      const { cx, cz, r } = DISCS[a];
      const D = campDressing(a);
      const RING_R = r - 0.6;
      expect(D.ring.r).toBeCloseTo(RING_R, 9);
      expect(angleOff(D.ring.gap.a, CAMP_TURN[a] + Math.PI)).toBeLessThan(1e-9);
      expect(D.ring.gap.half).toBe(0.33);
      // ~0.36 m of arc apiece round the ring less the gap
      const arc = (2 * Math.PI - 2 * D.ring.gap.half) * RING_R;
      expect(D.ring.clumps.length, a).toBeGreaterThanOrEqual(Math.floor(arc / 0.36) - 2);
      expect(D.ring.clumps.length, a).toBeLessThanOrEqual(Math.ceil(arc / 0.36) + 1);
      for (const c of D.ring.clumps) {
        const at = `${a} ${c.x.toFixed(2)},${c.z.toFixed(2)}`;
        const d = Math.hypot(c.x - cx, c.z - cz);
        // the row's 0.16 m in or out, and 0.06 m of jitter
        expect(Math.abs(d - RING_R), at).toBeLessThanOrEqual(0.22 + 1e-9);
        expect(Math.sign(d - RING_R), at).toBe(c.row ? 1 : -1);
        expect(angleOff(Math.atan2(c.z - cz, c.x - cx), D.ring.gap.a), at).toBeGreaterThan(D.ring.gap.half);
        expect(c.s, at).toBeGreaterThanOrEqual(0.8);
        expect(c.s, at).toBeLessThanOrEqual(1.2);
        expect(c.h, at).toBeGreaterThanOrEqual(0.55);
        expect(c.h, at).toBeLessThanOrEqual(c.gate ? 0.95 : 0.8);
        expect(Number.isFinite(c.rot), at).toBe(true);
      }
    }
  });

  it('the ring is a continuous two-row wall', () => {
    for (const a of CAMPS) {
      const { cx, cz } = DISCS[a];
      const L = campLayout(a);
      const D = campDressing(a);
      // round the ring from one gap edge to the other
      const from = (c) => {
        const t = Math.atan2(c.z - cz, c.x - cx) - D.ring.gap.a;
        return ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      };
      const cs = [...D.ring.clumps].sort((p, q) => from(p) - from(q));
      // no clump dropped on an empty map: every seat and the den and rock
      // are well inside the ring
      const arc = (2 * Math.PI - 2 * D.ring.gap.half) * D.ring.r;
      expect(cs.length, a).toBe(Math.round(arc / 0.36));
      for (const c of cs) {
        for (const s of seatsOf(L)) expect(dist(c, s)).toBeGreaterThanOrEqual(0.5);
      }
      for (let i = 0; i < cs.length; i++) {
        expect(cs[i].row, `${a} ${i}`).toBe(i % 2);
        expect(cs[i].gate, `${a} ${i}`).toBe(i === 0 || i === cs.length - 1);
      }
      for (let i = 1; i < cs.length; i++) {
        const p = cs[i - 1];
        const q = cs[i];
        // a slot's step along the ring, rows 0.32 m apart across it: within
        // the 0.6 m a bramble strand bridges, so every neighbour is joined
        expect((from(q) - from(p)) * D.ring.r, `${a} ${i} along`).toBeLessThanOrEqual(0.45);
        expect(dist(p, q), `${a} ${i}`).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it('keeps every clump 0.5 m or more from every seat and from the den and rock edges', () => {
    for (const a of CAMPS) {
      const L = campLayout(a);
      for (const c of campDressing(a).ring.clumps) {
        for (const s of seatsOf(L)) expect(dist(c, s)).toBeGreaterThanOrEqual(0.5);
        for (const p of [L.den, L.rock]) expect(dist(c, p) - p.r).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it('drops the clumps a collider on the ring overlaps, and only those', () => {
    for (const a of CAMPS) {
      const { cx, cz } = DISCS[a];
      const free = campDressing(a);
      const pick = free.ring.clumps[Math.floor(free.ring.clumps.length / 2)];
      const post = { x: pick.x, z: pick.z, r: 0.4 };
      const D = campDressing(a, [post]);
      const dropped = free.ring.clumps.filter((c) => !D.ring.clumps.some((k) => k.x === c.x && k.z === c.z));
      expect(dropped.length, a).toBeGreaterThan(0);
      for (const c of D.ring.clumps) expect(dist(c, post)).toBeGreaterThanOrEqual(post.r + 0.25);
      for (const c of dropped) expect(dist(c, post)).toBeLessThan(post.r + 0.37);
      // the clumps that stay are the very same clumps: a collider never shifts the rest
      for (const c of D.ring.clumps) expect(free.ring.clumps).toContainEqual(c);
      // a collider far off changes nothing
      expect(campDressing(a, [{ x: cx + 40, z: cz, r: 2 }])).toEqual(free);
    }
  });

  it('keeps the clumps where they were before the canes (pinned: the woods camp\'s first clump)', () => {
    const c = campDressing('woods').ring.clumps[0];
    expect(c.x).toBeCloseTo(6.136697890743825, 12);
    expect(c.z).toBeCloseTo(-46.25797754581596, 12);
    expect(c.s).toBeCloseTo(0.9502911537885665, 12);
    expect(c.h).toBeCloseTo(0.7534708831517491, 12);
    expect(c.rot).toBeCloseTo(5.0095855002469465, 12);
    expect(campDressing('woods').ring.clumps.length).toBe(84);
  });

  // A cane point's keep rules (polish-camps4 Task 3): near a kept clump, off
  // every seat, off the den's, the rock's and every collider's edge, and
  // outside the gap.
  const checkCanes = (a, D, cols = []) => {
    const { cx, cz } = DISCS[a];
    const L = campLayout(a);
    for (const cane of D.ring.canes) {
      expect(cane.length, a).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < cane.length; i++) {
        const p = cane[i];
        const at = `${a} ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
        for (const k of ['x', 'y', 'z', 'w']) expect(Number.isFinite(p[k]), at).toBe(true);
        expect(D.ring.clumps.some((c) => dist(p, c) <= 0.45), `${at} near a clump`).toBe(true);
        for (const s of seatsOf(L)) expect(dist(p, s), `${at} seat`).toBeGreaterThanOrEqual(0.4);
        for (const k of [L.den, L.rock, ...cols]) expect(dist(p, k) - k.r, `${at} edge`).toBeGreaterThanOrEqual(0.25);
        expect(angleOff(Math.atan2(p.z - cz, p.x - cx), D.ring.gap.a), `${at} gap`).toBeGreaterThan(D.ring.gap.half);
        // the tube tapers 0.036 -> 0.016 and stays between the ground and 1 m
        expect(p.w, at).toBeGreaterThanOrEqual(0.016 - 1e-9);
        expect(p.w, at).toBeLessThanOrEqual(0.036 + 1e-9);
        expect(p.y - p.w, at).toBeGreaterThanOrEqual(0);
        expect(p.y + p.w, at).toBeLessThanOrEqual(1.0);
        // points every ~0.4 m along the ground; a cane's foot may climb
        // steeply out of the root
        if (i > 0) {
          const q = cane[i - 1];
          expect(Math.hypot(p.x - q.x, p.z - q.z), at).toBeLessThanOrEqual(0.5);
          expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z), at).toBeLessThanOrEqual(0.8);
        }
      }
    }
  };

  it('weaves bramble canes along the ring: arching over the lumps, across both rows', () => {
    for (const a of CAMPS) {
      const { cx, cz } = DISCS[a];
      const D = campDressing(a);
      expect(Array.isArray(D.ring.canes), a).toBe(true);
      expect(D.ring.canes.length, a).toBeGreaterThanOrEqual(4);
      checkCanes(a, D);
      const pts = D.ring.canes.flat();
      // they arch up over the lumps and come down into them
      expect(Math.max(...pts.map((p) => p.y)), a).toBeGreaterThanOrEqual(0.7);
      expect(Math.min(...pts.map((p) => p.y)), a).toBeLessThanOrEqual(0.2);
      // they weave in and out across the two rows
      const rad = pts.map((p) => Math.hypot(p.x - cx, p.z - cz) - D.ring.r);
      expect(Math.min(...rad), a).toBeLessThan(-0.1);
      expect(Math.max(...rad), a).toBeGreaterThan(0.1);
      // they reach most of the way round
      const arc = (2 * Math.PI - 2 * D.ring.gap.half) * D.ring.r;
      expect(pts.length * 0.4, a).toBeGreaterThan(1.5 * arc);
    }
  });

  it('a collider on the ring breaks the canes there too, and moves nothing else', () => {
    for (const a of CAMPS) {
      const free = campDressing(a);
      const pick = free.ring.clumps[Math.floor(free.ring.clumps.length / 2)];
      const post = { x: pick.x, z: pick.z, r: 0.4 };
      const D = campDressing(a, [post]);
      checkCanes(a, D, [post]);
      // every point that stays is one the free camp had
      const key = (p) => `${p.x},${p.y},${p.z},${p.w}`;
      const had = new Set(free.ring.canes.flat().map(key));
      for (const p of D.ring.canes.flat()) expect(had.has(key(p)), a).toBe(true);
    }
  });

  it('clears a sandy floor inside the ring, and lays a nest under every elder and kit', () => {
    for (const a of CAMPS) {
      const { cx, cz } = DISCS[a];
      const L = campLayout(a);
      const D = campDressing(a);
      expect(D.clearing).toEqual({ x: cx, z: cz, r: D.ring.r - 0.7 });
      expect(D.clearing.r).toBeLessThan(D.ring.r);
      expect(D.nests).toEqual([...L.seats.elders, ...L.seats.kits].map((s) => ({ x: s.x, z: s.z, r: 0.4 })));
    }
  });

  it('puts the fresh-kill pile beside the rock, on the centre side, clear of every seat and the den', () => {
    for (const a of CAMPS) {
      const { cx, cz } = DISCS[a];
      const L = campLayout(a);
      const { kill } = campDressing(a);
      for (const s of seatsOf(L)) expect(dist(kill, s), `${a} seat`).toBeGreaterThanOrEqual(0.6);
      for (const p of [L.den, L.rock]) expect(dist(kill, p) - p.r, a).toBeGreaterThanOrEqual(0.3);
      expect(dist(kill, L.rock), `${a} beside the rock`).toBeLessThanOrEqual(1.6);
      const toCentre = Math.atan2(cz - L.rock.z, cx - L.rock.x);
      expect(angleOff(Math.atan2(kill.z - L.rock.z, kill.x - L.rock.x), toCentre), `${a} centre side`).toBeLessThan(Math.PI / 2);
    }
  });
});

describe('campDressing on the real maps', () => {
  const built = {};
  const buildAll = async () => {
    for (const a of CAMPS) {
      if (!built[a]) built[a] = (await WORLDS[a]()).build(new THREE.Scene());
    }
  };

  it('addCamp is called with the colliders the world file has so far', async () => {
    await buildAll();
    for (const a of CAMPS) expect(Array.isArray(callTime[a]), a).toBe(true);
  }, 120_000);

  it('no clump the camp draws meets any collider of the built map', async () => {
    await buildAll();
    for (const a of CAMPS) {
      const D = campDressing(a, callTime[a]);
      for (const c of D.ring.clumps) {
        for (const k of built[a].colliders) {
          expect(dist(c, k), `${a} clump ${c.x.toFixed(2)},${c.z.toFixed(2)} vs ${k.x},${k.z} r${k.r}`).toBeGreaterThanOrEqual(k.r + 0.25);
        }
      }
      // nor does a bramble cane
      for (const p of D.ring.canes.flat()) {
        for (const k of built[a].colliders) {
          expect(dist(p, k) - k.r, `${a} cane ${p.x.toFixed(2)},${p.z.toFixed(2)} vs ${k.x},${k.z} r${k.r}`).toBeGreaterThanOrEqual(0.25);
        }
      }
      // the pile is not in a collider either
      for (const k of built[a].colliders) expect(dist(D.kill, k) - k.r, `${a} pile`).toBeGreaterThanOrEqual(0.3);
    }
  }, 120_000);

  it('no clump is within 0.5 m of a roaming home', async () => {
    await buildAll();
    for (const a of CAMPS) {
      const homes = roamHomes(a, built[a], clanWalkableFor(built[a], a));
      expect(homes.length, a).toBeGreaterThan(0);
      for (const c of campDressing(a, callTime[a]).ring.clumps) {
        for (const h of homes) expect(dist(c, h), a).toBeGreaterThanOrEqual(0.5);
      }
    }
  }, 120_000);
});

describe('campDressing in the Gorge', () => {
  const inRect = (r, p) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;

  it('has no ring and no clearing: the ledge is the camp', () => {
    const D = campDressing('gorge');
    expect(D.ring).toBeNull();
    expect(D.clearing).toBeNull();
  });

  it('lays a nest under every elder and kit, in the den', () => {
    const L = campLayout('gorge');
    const D = campDressing('gorge');
    expect(D.nests).toEqual([...L.seats.elders, ...L.seats.kits].map((s) => ({ x: s.x, z: s.z, r: 0.4 })));
    for (const n of D.nests) expect(inRect(CAMP_DEN, n)).toBe(true);
  });

  it('puts the fresh-kill pile on the Wide Ledge, at the seats\' level, clear of every seat and the rock', () => {
    const L = campLayout('gorge');
    const { kill } = campDressing('gorge');
    const ground = gorgeGround();
    expect(inRect(WIDE_LEDGE_RECT, kill)).toBe(true);
    expect(inRect(CAMP_DEN, kill)).toBe(false);
    expect(ground.y(kill.x, kill.z)).toBe(ground.y(L.seats.deputy.x, L.seats.deputy.z));
    expect(ground.y(kill.x, kill.z)).toBe(8);
    // flat under the whole pile
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * Math.PI * 2;
      expect(ground.y(kill.x + Math.cos(t) * 0.35, kill.z + Math.sin(t) * 0.35)).toBe(8);
    }
    for (const s of seatsOf(L)) expect(dist(kill, s)).toBeGreaterThanOrEqual(0.6);
    expect(dist(kill, L.rock) - L.rock.r).toBeGreaterThanOrEqual(0.6);
  });
});
