import { describe, it, expect } from 'vitest';
import {
  MARKET_BOUNDS, MARKET_SPAWN, FOUNTAIN, CAFE, STALLS, TREAT_STALLS, stallById, toStall, fromStall,
  MARKET_COLLIDERS, MARKET_HIDES, MARKET_KEEPOUT, marketArea, MARKET_REGISTRATION, MARKET_POIS, MARKET_COLLECTIBLES,
} from '../src/world/marketplan.js';
import { isWalkableAt } from '../src/player.js';
import { keepOutPoint } from '../src/keepout.js';

const a = marketArea();
const TREAT_REACH = 0.8;
// Task 9 replaces these with MARKET.WATCH_DEPTH and MARKET.WATCH_SIDE.
const WATCH_DEPTH = 3.2;
const WATCH_SIDE = 1.0;
const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const inZone = (s, x, z) => {
  const { lx, lz } = toStall(s, x, z);
  return Math.abs(lx) <= s.w / 2 + WATCH_SIDE && lz >= s.d / 2 && lz <= s.d / 2 + WATCH_DEPTH;
};

describe('the plan of the Market Square', () => {
  it('is a calm square, about 60 by 60 metres', () => {
    const w = MARKET_BOUNDS.maxX - MARKET_BOUNDS.minX, h = MARKET_BOUNDS.maxZ - MARKET_BOUNDS.minZ;
    expect(w).toBeGreaterThanOrEqual(55); expect(w).toBeLessThanOrEqual(65);
    expect(h).toBeGreaterThanOrEqual(55); expect(h).toBeLessThanOrEqual(65);
    expect(isWalkableAt(a, MARKET_SPAWN.x, MARKET_SPAWN.z)).toBe(true);
  });

  it('has the seven stalls of the spec, four of them watched', () => {
    expect(STALLS.map((s) => s.id)).toEqual(['fish', 'baker', 'cheese', 'milk', 'flowers', 'fruit', 'cafe']);
    expect(STALLS.filter((s) => s.kind === 'treat').map((s) => s.id)).toEqual(TREAT_STALLS);
    expect(STALLS.filter((s) => s.treat).map((s) => s.treat.kind)).toEqual(['fishhead', 'sausageroll', 'cheddar', 'cream', 'crumbs']);
  });

  it('the local frame round-trips', () => {
    for (const s of STALLS) {
      const p = fromStall(s, 1.3, -0.7), q = toStall(s, p.x, p.z);
      expect(q.lx).toBeCloseTo(1.3, 9); expect(q.lz).toBeCloseTo(-0.7, 9);
    }
    expect(stallById('fish').face.x).toBeGreaterThan(0.9);
  });

  it('no stallholder can be reached: each keeper stands where no cat can', () => {
    for (const s of STALLS.filter((s) => s.keeper)) expect(isWalkableAt(a, s.keeper.x, s.keeper.z), s.id).toBe(false);
  });

  it('every treat can be reached from the cobbles', () => {
    for (const s of STALLS.filter((s) => s.treat)) {
      let found = false;
      for (let dx = -TREAT_REACH; dx <= TREAT_REACH + 1e-9 && !found; dx += 0.1) {
        for (let dz = -TREAT_REACH; dz <= TREAT_REACH + 1e-9 && !found; dz += 0.1) {
          if (Math.hypot(dx, dz) <= TREAT_REACH && isWalkableAt(a, s.treat.x + dx, s.treat.z + dz)) found = true;
        }
      }
      expect(found, s.id).toBe(true);
    }
  });

  it('every watched stall has a hide a short dash from its treat', () => {
    for (const id of TREAT_STALLS) {
      const s = stallById(id);
      expect(s.hide, id).not.toBeNull();
      expect(isWalkableAt(a, s.hide.x, s.hide.z), id).toBe(true);
      const d = dist(s.hide, s.treat);
      expect(d - TREAT_REACH, id).toBeLessThanOrEqual(3.0);
      // the straight line, up to the point within reach of the treat, is walkable
      for (let t = 0; t <= 1; t += 0.1 / Math.max(d, 1e-6)) {
        const x = s.hide.x + (s.treat.x - s.hide.x) * t, z = s.hide.z + (s.treat.z - s.hide.z) * t;
        if (Math.hypot(x - s.treat.x, z - s.treat.z) < TREAT_REACH) break;
        expect(isWalkableAt(a, x, z), `${id} line at ${t.toFixed(2)}`).toBe(true);
      }
    }
  });

  it('the first treat is close: the café crumbs within 14 m of the spawn, on a walkable straight line', () => {
    const c = CAFE.crumbs;
    expect(dist(c, MARKET_SPAWN)).toBeLessThanOrEqual(14);
    const d = dist(c, MARKET_SPAWN);
    for (let t = 0; t <= 1; t += 0.1 / d) {
      expect(isWalkableAt(a, MARKET_SPAWN.x + (c.x - MARKET_SPAWN.x) * t, MARKET_SPAWN.z + (c.z - MARKET_SPAWN.z) * t)).toBe(true);
    }
    expect(MARKET_HIDES).toContainEqual(expect.objectContaining({ x: CAFE.tables[0].x, z: CAFE.tables[0].z }));
  });

  it('every stall is clear of the fountain and of each other by 2 m, and inside the bounds', () => {
    const inB = (p) => p.x >= MARKET_BOUNDS.minX && p.x <= MARKET_BOUNDS.maxX && p.z >= MARKET_BOUNDS.minZ && p.z <= MARKET_BOUNDS.maxZ;
    for (const s of STALLS) {
      expect(inB(s.at), s.id).toBe(true);
      if (s.hide) expect(inB(s.hide), s.id).toBe(true);
      if (s.kind !== 'cafe') expect(dist(s.at, FOUNTAIN) - FOUNTAIN.r, s.id).toBeGreaterThanOrEqual(2);
      for (const o of STALLS) if (o !== s) expect(dist(s.at, o.at), `${s.id}/${o.id}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('one stall watches each treat: no treat spot lies in front of another stall', () => {
    for (const s of STALLS.filter((s) => s.treat)) {
      for (const o of STALLS.filter((o) => o !== s && o.kind !== 'cafe')) {
        expect(inZone(o, s.treat.x, s.treat.z), `${s.id} in ${o.id}'s zone`).toBe(false);
      }
    }
  });

  it('strays are kept out of every counter\'s zone', () => {
    for (const id of TREAT_STALLS) {
      const s = stallById(id);
      for (let lx = -(s.w / 2 + WATCH_SIDE); lx <= s.w / 2 + WATCH_SIDE + 1e-9; lx += 0.25) {
        for (let lz = s.d / 2; lz <= s.d / 2 + WATCH_DEPTH + 1e-9; lz += 0.25) {
          const p = fromStall(s, lx, lz);
          const q = keepOutPoint(a, p.x, p.z);
          for (const o of TREAT_STALLS.map(stallById)) expect(inZone(o, q.x, q.z), `${id} ${lx},${lz} still in ${o.id}'s zone`).toBe(false);
        }
      }
      // her own cat is never kept out of a hide
      expect(isWalkableAt(a, s.hide.x, s.hide.z), id).toBe(true);
    }
    expect(MARKET_KEEPOUT.capsules.length).toBe(8);
  });

  it('has 12 POIs and 5 collectibles on free cobbles, 3 m from every collider', () => {
    expect(MARKET_POIS).toHaveLength(12);
    expect(MARKET_COLLECTIBLES).toHaveLength(5);
    for (const p of [...MARKET_POIS, ...MARKET_COLLECTIBLES]) {
      expect(isWalkableAt(a, p.x, p.z), JSON.stringify(p)).toBe(true);
      for (const c of MARKET_COLLIDERS) expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, JSON.stringify(p)).toBeGreaterThanOrEqual(3);
      // the strip behind the spawn is kept free for step 4's gateway
      expect(Math.hypot(p.x, p.z - 32)).toBeGreaterThan(3);
    }
    expect(new Set(MARKET_COLLECTIBLES.map((c) => c.id)).size).toBe(5);
  });

  it('nothing offers it yet, and strays are allowed', () => {
    expect(MARKET_REGISTRATION.catalog).toBeNull();
    expect('strays' in MARKET_REGISTRATION).toBe(false);
    expect(MARKET_REGISTRATION.colony).toBe(false);
  });
});
