import { describe, it, expect } from 'vitest';
import {
  MARKET_BOUNDS, MARKET_SPAWN, FOUNTAIN, CAFE, STALLS, TREAT_STALLS, stallById, toStall, fromStall,
  MARKET_COLLIDERS, MARKET_HIDES, MARKET_KEEPOUT, marketArea, MARKET_REGISTRATION, MARKET_POIS, MARKET_COLLECTIBLES,
  MARKET_CLUTTER, MARKET_LAMPS, FRUIT_CRATE, FLOUR_SACKS,
  MARKET_PERCHES, CLIMB_STACKS, CLIMB_STACK, AWNING, awningHeight, stallClimb, BICYCLE_BASKET, TRESTLE_PERCH, RIM_PERCHES, TABLE_PERCHES,
  MUSICIAN, PIGEON_PATCH,
} from '../src/world/marketplan.js';
import { MARKET_SPOTS } from '../src/foundwear/spots/market.js';
import { MARKET } from '../src/marketrules.js';
import { isWalkableAt, CAT_RADIUS } from '../src/player.js';
import { keepOutPoint } from '../src/keepout.js';
import { canReach, bestPerch, BASE_CLIMB_BUDGET } from '../src/climbing.js';

const a = marketArea();
const TREAT_REACH = 0.8;
const WATCH_DEPTH = MARKET.WATCH_DEPTH;
const WATCH_SIDE = MARKET.WATCH_SIDE;
const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const DRAWN = STALLS.filter((s) => s.w > 0);
// a walkable point within r of p that `ok` accepts, or null
function walkableNear(p, r, ok) {
  for (let dx = -r; dx <= r + 1e-9; dx += 0.05) {
    for (let dz = -r; dz <= r + 1e-9; dz += 0.05) {
      const q = { x: p.x + dx, z: p.z + dz };
      if (Math.hypot(dx, dz) <= r && isWalkableAt(a, q.x, q.z) && ok(q)) return q;
    }
  }
  return null;
}
// where player.js's collider push (one pass a frame) leaves a grounded cat set down at x, z
function pushOut(x, z) {
  const p = { x, z };
  for (let f = 0; f < 60; f++) {
    for (const c of a.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + CAT_RADIUS;
      if (d < min && d > 0.0001) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
    }
  }
  return p;
}
// the distance from p to the segment a-b
function segDist(p, a0, b0) {
  const vx = b0.x - a0.x, vz = b0.z - a0.z, L2 = vx * vx + vz * vz;
  const t = Math.max(0, Math.min(1, ((p.x - a0.x) * vx + (p.z - a0.z) * vz) / L2));
  return Math.hypot(p.x - (a0.x + vx * t), p.z - (a0.z + vz * t));
}
const inZone = (s, x, z) => {
  const { lx, lz } = toStall(s, x, z);
  return Math.abs(lx) <= s.w / 2 + WATCH_SIDE && lz >= s.d / 2 && lz <= s.d / 2 + WATCH_DEPTH;
};

describe('the plan of the Market Square', () => {
  it('is a calm square, 40 to 46 metres each way', () => {
    // controller's ruling (Task 6, 2026-11-21): 60 x 62 m read as big and empty to a cat
    const w = MARKET_BOUNDS.maxX - MARKET_BOUNDS.minX, h = MARKET_BOUNDS.maxZ - MARKET_BOUNDS.minZ;
    expect(w).toBeGreaterThanOrEqual(40); expect(w).toBeLessThanOrEqual(46);
    expect(h).toBeGreaterThanOrEqual(40); expect(h).toBeLessThanOrEqual(46);
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
    for (const s of STALLS.filter((s) => s.keeper)) {
      expect(isWalkableAt(a, s.keeper.x, s.keeper.z), s.id).toBe(false);
      for (let x = s.keeper.x - 0.6; x <= s.keeper.x + 0.6; x += 0.05) {
        for (let z = s.keeper.z - 0.6; z <= s.keeper.z + 0.6; z += 0.05) {
          if (Math.hypot(x - s.keeper.x, z - s.keeper.z) <= 0.6) expect(isWalkableAt(a, x, z), `${s.id} ${x},${z}`).toBe(false);
        }
      }
    }
  });

  it('no cat can stand overlapping a counter: no walkable centre within 0.2 m of its rectangle', () => {
    for (const s of STALLS.filter((s) => s.w > 0)) {
      for (let lx = -s.w / 2 - 0.2; lx <= s.w / 2 + 0.2 + 1e-9; lx += 0.05) {
        for (let lz = -s.d / 2 - 0.2; lz <= s.d / 2 + 0.2 + 1e-9; lz += 0.05) {
          const gx = Math.max(Math.abs(lx) - s.w / 2, 0), gz = Math.max(Math.abs(lz) - s.d / 2, 0);
          if (Math.hypot(gx, gz) >= 0.2) continue;
          const p = fromStall(s, lx, lz);
          expect(isWalkableAt(a, p.x, p.z), `${s.id} local ${lx.toFixed(2)},${lz.toFixed(2)}`).toBe(false);
        }
      }
    }
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

  it('stall centres are 2 m from the fountain edge and from each other, and inside the bounds', () => {
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
      expect(Math.hypot(p.x, p.z - MARKET_BOUNDS.maxZ)).toBeGreaterThan(3);
    }
    expect(new Set(MARKET_COLLECTIBLES.map((c) => c.id)).size).toBe(5);
  });

  it('a treat stall is close: the nearest about 12 m from the spawn', () => {
    const near = Math.min(...TREAT_STALLS.map((id) => dist(stallById(id).at, MARKET_SPAWN)));
    expect(near).toBeLessThanOrEqual(12.5);
  });

  it('lanes: 2.5 m of free cobbles between any two stalls, and between each stall and the fountain', () => {
    // a stall's footprint is its counter's rectangle (the café has none)
    const corners = (s) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => fromStall(s, (a * s.w) / 2, (b * s.d) / 2));
    const drawn = STALLS.filter((s) => s.w > 0);
    const gap = (s, o) => {
      // the nearest two points of two rectangles, sampled along their edges
      let m = Infinity;
      const edge = (cs) => cs.flatMap((c, i) => { const n = cs[(i + 1) % 4]; return Array.from({ length: 21 }, (_, k) => ({ x: c.x + ((n.x - c.x) * k) / 20, z: c.z + ((n.z - c.z) * k) / 20 })); });
      const ea = edge(corners(s)), eb = edge(corners(o));
      for (const p of ea) for (const q of eb) m = Math.min(m, dist(p, q));
      return m;
    };
    for (const s of drawn) {
      for (const o of drawn) if (o !== s) expect(gap(s, o), `${s.id}/${o.id}`).toBeGreaterThanOrEqual(2.5);
      expect(Math.min(...corners(s).map((c) => dist(c, FOUNTAIN))) - FOUNTAIN.r, s.id).toBeGreaterThanOrEqual(2.5);
    }
  });

  it('the clutter stands clear of every watch zone, every hide, the fountain and the gateway\'s lane', () => {
    expect(MARKET_CLUTTER.length).toBeGreaterThanOrEqual(10);
    const treat = TREAT_STALLS.map(stallById);
    for (const c of MARKET_CLUTTER) {
      // its whole footprint (its half-extent, in its own frame, turned by its yaw:
      // own +x is world (cos yaw, -sin yaw), own +z is (sin yaw, cos yaw)) and
      // each solid circle's edge points
      const [hx, hz] = c.half;
      const foot = [];
      for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
        const u = (i / 4) * hx, v = (j / 4) * hz;
        foot.push({ x: c.x + u * Math.cos(c.yaw) + v * Math.sin(c.yaw), z: c.z - u * Math.sin(c.yaw) + v * Math.cos(c.yaw) });
      }
      const pts = [...foot, ...c.solid.flatMap((q) => Array.from({ length: 8 }, (_, k) => ({ x: q.x + q.r * Math.cos((k * Math.PI) / 4), z: q.z + q.r * Math.sin((k * Math.PI) / 4) })))];
      for (const s of treat) {
        for (const p of pts) expect(inZone(s, p.x, p.z), `${c.id} in ${s.id}'s zone`).toBe(false);
        expect(dist(c, s.hide), `${c.id} by ${s.id}'s hide`).toBeGreaterThan(1.5);
      }
      expect(dist(c, FOUNTAIN) - FOUNTAIN.r, c.id).toBeGreaterThanOrEqual(2.5);
      for (const p of foot) {
        // the gateway's lane (U3): x within 1.6 of 0, behind the spawn
        expect(Math.abs(p.x) > 1.6 || p.z < MARKET_SPAWN.z, c.id).toBe(true);
        // inside the bounds, footprint and all
        expect(p.x > MARKET_BOUNDS.minX && p.x < MARKET_BOUNDS.maxX && p.z > MARKET_BOUNDS.minZ && p.z < MARKET_BOUNDS.maxZ, c.id).toBe(true);
      }
      // off the crumbs' straight line from the spawn (the first treat's walk), by a cat's width
      const cr = CAFE.crumbs, sp = MARKET_SPAWN, L = dist(cr, sp);
      for (const p of foot) {
        const t = Math.max(0, Math.min(1, ((p.x - sp.x) * (cr.x - sp.x) + (p.z - sp.z) * (cr.z - sp.z)) / (L * L)));
        expect(Math.hypot(p.x - (sp.x + (cr.x - sp.x) * t), p.z - (sp.z + (cr.z - sp.z) * t)), `${c.id} on the crumbs' line`).toBeGreaterThan(0.6);
      }
      // what a cat would walk through is solid; the bench (she goes under its seat) is not
      expect(c.solid.length > 0, c.id).toBe(c.kind !== 'bench');
      for (const q of c.solid) expect(MARKET_COLLIDERS, c.id).toContainEqual(q);
    }
    // and the lamps stand out of every zone too
    for (const l of MARKET_LAMPS) for (const s of treat) expect(inZone(s, l.x, l.z), `lamp ${l.x},${l.z} in ${s.id}'s zone`).toBe(false);
    // and out of each counter's view lane: the chase camera sits behind her as
    // she faces a counter, so nothing tall may stand in front of one (out to
    // 9 m, across its width and 1.6 m either side). The final review found two
    // posts 4.7 m in front of the baker's and the cheese counters.
    // Step 3 (V4): all six stalls with a counter, not only the four watched ones.
    for (const l of MARKET_LAMPS) {
      for (const s of STALLS.filter((q) => q.w > 0)) {
        const { lx, lz } = toStall(s, l.x, l.z);
        const inLane = lz > s.d / 2 - 0.5 && lz < s.d / 2 + 9 && Math.abs(lx) < s.w / 2 + 1.6;
        expect(inLane, `lamp ${l.x},${l.z} in front of ${s.id}'s counter`).toBe(false);
      }
    }
  });

  it('no lamp stands where it stood in front of the fruit and flower stalls', () => {
    expect(MARKET_LAMPS).toHaveLength(4);
    for (const old of [[0, -10.4], [5.5, 1]]) {
      expect(MARKET_LAMPS.some((l) => l.x === old[0] && l.z === old[1]), `${old}`).toBe(false);
    }
  });

  it('both playable stalls have a hide a short dash from their front', () => {
    for (const id of ['flowers', 'fruit']) {
      const s = stallById(id);
      expect(s.hide, id).not.toBeNull();
      expect(isWalkableAt(a, s.hide.x, s.hide.z), id).toBe(true);
      // the counter's front middle is a short dash away, and the straight line
      // to the front corner on the hide's side (where a treat's spot would be:
      // the way in is left open there), up to a cat's reach of it, is walkable
      const front = fromStall(s, 0, s.d / 2);
      expect(dist(s.hide, front), id).toBeLessThanOrEqual(3);
      const stand = fromStall(s, s.hideSide * (s.w / 2 - 0.3), s.d / 2 + 0.35);
      const d = dist(s.hide, stand);
      for (let t = 0; t <= 1; t += 0.1 / d) {
        const x = s.hide.x + (stand.x - s.hide.x) * t, z = s.hide.z + (stand.z - s.hide.z) * t;
        if (Math.hypot(x - stand.x, z - stand.z) < TREAT_REACH) break;
        expect(isWalkableAt(a, x, z), `${id} line at ${t.toFixed(2)}`).toBe(true);
      }
    }
    expect(MARKET_HIDES).toContainEqual(stallById('fruit').hide);
  });

  it("the fruit stall's hide is on the side away from its crate", () => {
    const s = stallById('fruit');
    const h = toStall(s, s.hide.x, s.hide.z);
    expect(Math.sign(h.lx)).toBe(-Math.sign(FRUIT_CRATE.lx));
    // and the flower stall's is on its default side
    const f = stallById('flowers');
    expect(toStall(f, f.hide.x, f.hide.z).lx).toBeGreaterThan(0);
  });

  it('the rests are reached from the cobbles, the knockables sit on their ledge and land on free cobbles', () => {
    const ps = MARKET_REGISTRATION.propSet;
    expect(ps.rests.map((r) => r.kind).sort()).toEqual(['drink', 'nap']);
    expect(ps.rests.every((r) => r.mesh === false)).toBe(true);
    const nap = ps.rests.find((r) => r.kind === 'nap');
    expect(nap.x).toBeCloseTo(FLOUR_SACKS.x, 1);
    expect(nap.z).toBeCloseTo(FLOUR_SACKS.z, 1);
    for (const r of ps.rests) {
      let found = false;
      for (let dx = -0.8; dx <= 0.8 + 1e-9 && !found; dx += 0.1) {
        for (let dz = -0.8; dz <= 0.8 + 1e-9 && !found; dz += 0.1) {
          if (Math.hypot(dx, dz) <= 0.8 && isWalkableAt(a, r.x + dx, r.z + dz)) found = true;
        }
      }
      expect(found, r.id).toBe(true);
    }
    expect(ps.knockables.map((k) => k.kind).sort()).toEqual(['bucket', 'cup']);
    const treat = TREAT_STALLS.map(stallById);
    for (const k of ps.knockables) {
      expect(k.fallTo, k.id).toBeDefined();
      expect(isWalkableAt(a, k.fallTo.x, k.fallTo.z), k.id).toBe(true);
      for (const c of MARKET_COLLIDERS) expect(Math.hypot(k.fallTo.x - c.x, k.fallTo.z - c.z) - c.r, k.id).toBeGreaterThanOrEqual(0.3);
      for (const s of treat) expect(inZone(s, k.fallTo.x, k.fallTo.z), `${k.id} lands in ${s.id}'s zone`).toBe(false);
      expect(dist(k, k.fallTo), k.id).toBeLessThan(3);
    }
    const bucket = ps.knockables.find((k) => k.kind === 'bucket');
    expect(bucket.y).toBe(0.775); // on the trestle's cloth (its top 0.775, market.js)
    // the bucket stands on the flower trestle: over the flower stall's hide, falls toward the fountain side
    const f = stallById('flowers');
    expect(dist(bucket, f.hide)).toBeLessThan(0.3);
    expect(toStall(f, bucket.fallTo.x, bucket.fallTo.z).lz).toBeGreaterThan(toStall(f, bucket.x, bucket.z).lz);
    // the cup is on café table 2 (the third), its top about 0.74
    const cup = ps.knockables.find((k) => k.kind === 'cup');
    expect(dist(cup, CAFE.tables[2])).toBeLessThan(0.4);
    expect(cup.y).toBeCloseTo(0.74, 2);
    // markables and carryables are on free cobbles
    expect(ps.markables).toHaveLength(2);
    expect(ps.carryables).toHaveLength(2);
    for (const p of [...ps.markables, ...ps.carryables]) expect(isWalkableAt(a, p.x, p.z), p.id).toBe(true);
  });

  // ---- Step 3, Task 3 (V5): up onto the awnings, and the things to hop on ----
  it('every awning is two hops from the cobbles, with no skill', () => {
    for (const s of DRAWN) {
      const { stack, crate, roof } = stallClimb(s.id);
      expect(MARKET_PERCHES, s.id).toContain(crate);
      expect(MARKET_PERCHES, s.id).toContain(roof);
      expect([crate.kind, roof.kind], s.id).toEqual(['crate', 'roof']);
      // the crates' top, 0.9 to 1.0 up, one hop from a walkable spot beside the stack
      expect(crate.y, s.id).toBeGreaterThanOrEqual(0.9);
      expect(crate.y, s.id).toBeLessThanOrEqual(1.0);
      expect(dist(crate, stack), s.id).toBeLessThan(CLIMB_STACK.r);
      expect(walkableNear(stack, 1.2, (p) => canReach(crate, p, 0, BASE_CLIMB_BUDGET)), s.id).toBeTruthy();
      // and from the crates' top the awning is one hop up
      expect(canReach(roof, crate, crate.y, BASE_CLIMB_BUDGET), s.id).toBe(true);
      // where nobody notices her (marketrules.js isHidden reads `high`)
      expect(roof.y, s.id).toBeGreaterThanOrEqual(MARKET.HIGH_Y);
      // on the awning's own sheet, inside its edges
      const l = toStall(s, roof.x, roof.z);
      expect(Math.abs(l.lx), s.id).toBeLessThanOrEqual((s.w + AWNING.over) / 2 - 0.2);
      expect(l.lz, s.id).toBeGreaterThanOrEqual(-s.d / 2 - AWNING.back + 0.2);
      expect(l.lz, s.id).toBeLessThanOrEqual(s.d / 2 + AWNING.front - 0.2);
      expect(roof.y, s.id).toBeCloseTo(awningHeight(s, l.lx, l.lz), 2);
      // never straight up off the cobbles: no walkable spot within the reach reaches it in one hop
      for (let dx = -3; dx <= 3; dx += 0.25) {
        for (let dz = -3; dz <= 3; dz += 0.25) {
          const p = { x: roof.x + dx, z: roof.z + dz };
          if (isWalkableAt(a, p.x, p.z)) expect(canReach(roof, p, 0, BASE_CLIMB_BUDGET), `${s.id} from ${p.x},${p.z}`).toBe(false);
        }
      }
      // the four treat stalls' awnings are lookouts, with plain names; the two others are not
      if (TREAT_STALLS.includes(s.id)) {
        expect(roof.vantage, s.id).toBe(true);
        expect(roof.label, s.id).toMatch(/^the [a-z’ ]+ awning$/);
      } else {
        expect(roof.label, s.id).toBeUndefined();
        expect(roof.vantage, s.id).toBeUndefined();
      }
    }
    expect(new Set(MARKET_PERCHES.filter((p) => p.label).map((p) => p.label)).size).toBe(4);
  });

  it('from an awning the button takes her back to its crates, never down into a counter or onto a stallholder', () => {
    for (const s of DRAWN) {
      const { crate, roof } = stallClimb(s.id);
      // perched on the awning, the next press is the crates (a drop in reach), not a bare hop
      // down into the counter's middle; perched on the crates, it is the awning again
      expect(bestPerch(MARKET_PERCHES, roof, roof.y, roof), s.id).toBe(crate);
      expect(bestPerch(MARKET_PERCHES, crate, crate.y, crate), s.id).toBe(roof);
    }
    // from every other perch a bare hop down lands her where the player's push puts her:
    // on free cobbles, never inside a counter
    const roofs = new Set(DRAWN.map((s) => stallClimb(s.id).roof));
    for (const p of MARKET_PERCHES.filter((q) => !roofs.has(q))) {
      const at = pushOut(p.x, p.z);
      // (the push sets her exactly c.r + CAT_RADIUS off: within a hair of it is free)
      const free = a.colliders.every((c) => Math.hypot(at.x - c.x, at.z - c.z) >= c.r + CAT_RADIUS - 1e-6);
      expect(free, `${p.x},${p.z} lands at ${at.x},${at.z}`).toBe(true);
      for (const s of DRAWN) {
        const l = toStall(s, at.x, at.z);
        const gx = Math.max(Math.abs(l.lx) - s.w / 2, 0), gz = Math.max(Math.abs(l.lz) - s.d / 2, 0);
        expect(Math.hypot(gx, gz), `${p.x},${p.z} in ${s.id}'s counter`).toBeGreaterThan(0.2);
      }
    }
    // and no perch is over a stallholder's spot
    for (const p of MARKET_PERCHES) {
      for (const s of STALLS.filter((q) => q.keeper)) expect(dist(p, s.keeper), `${p.x},${p.z} over ${s.id}'s keeper`).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("the stacks stand beside each stall, never in a watch zone, a lane or on a hide's line", () => {
    expect(CLIMB_STACKS.map((c) => c.stall)).toEqual(DRAWN.map((s) => s.id));
    const treat = TREAT_STALLS.map(stallById);
    // the lines a cat dashes along: each treat stall's hide to its treat, each playable stall's hide to its front corner
    const lines = DRAWN.filter((s) => s.hide).map((s) => [s.hide, s.treat ?? fromStall(s, s.hideSide * (s.w / 2 - 0.3), s.d / 2 + 0.35)]);
    for (const c of CLIMB_STACKS) {
      const s = stallById(c.stall);
      expect(c.kind, c.id).toBe('crates');
      expect(c.solid, c.id).toEqual([{ x: c.x, z: c.z, r: CLIMB_STACK.r }]);
      expect(CLIMB_STACK.r).toBe(0.3);
      for (const q of c.solid) expect(MARKET_COLLIDERS, c.id).toContainEqual(q);
      // beside its own stall, on the side away from its hide, clear of the counter
      const l = toStall(s, c.x, c.z);
      expect(Math.sign(l.lx), c.id).toBe(-s.hideSide);
      expect(Math.abs(l.lx), c.id).toBeGreaterThan(s.w / 2 + c.solid[0].r);
      expect(Math.abs(l.lx), c.id).toBeLessThan(s.w / 2 + 1);
      expect(l.lz, c.id).toBeGreaterThanOrEqual(-s.d / 2 - 0.5);
      expect(l.lz, c.id).toBeLessThanOrEqual(s.d / 2);
      const edge = Array.from({ length: 16 }, (_, k) => ({ x: c.x + c.solid[0].r * Math.cos((k * Math.PI) / 8), z: c.z + c.solid[0].r * Math.sin((k * Math.PI) / 8) }));
      for (const p of [c, ...edge]) {
        for (const o of treat) expect(inZone(o, p.x, p.z), `${c.id} in ${o.id}'s zone`).toBe(false);
        // out of every counter's view lane (the lamps' rule)
        for (const o of DRAWN) {
          const q = toStall(o, p.x, p.z);
          expect(q.lz > o.d / 2 - 0.5 && q.lz < o.d / 2 + 9 && Math.abs(q.lx) < o.w / 2 + 1.6, `${c.id} in front of ${o.id}'s counter`).toBe(false);
        }
      }
      // a cat's width clear of every dash from a hide
      for (const [h, t] of lines) expect(segDist(c, h, t), `${c.id} on a hide's line`).toBeGreaterThan(c.solid[0].r + CAT_RADIUS);
      expect(dist(c, s.hide ?? c), c.id).toBeGreaterThan(1.5);
    }
  });

  it('the basket, the trestle, the rims and the café tables are one hop from the cobbles', () => {
    for (const p of [BICYCLE_BASKET, TRESTLE_PERCH, ...RIM_PERCHES, ...TABLE_PERCHES]) {
      expect(MARKET_PERCHES, `${p.x},${p.z}`).toContain(p);
      expect(walkableNear(p, 1.2, (q) => canReach(p, q, 0, BASE_CLIMB_BUDGET)), `${p.x},${p.z}`).toBeTruthy();
    }
    expect(BICYCLE_BASKET).toMatchObject({ kind: 'crate' });
    expect(TRESTLE_PERCH).toMatchObject({ kind: 'crate' });
    expect(RIM_PERCHES.map((p) => p.kind)).toEqual(['crate', 'crate']);
    // the rims stand on stack-w and stack-e
    for (const [p, id] of RIM_PERCHES.map((q, i) => [q, ['stack-w', 'stack-e'][i]])) {
      const c = MARKET_CLUTTER.find((q) => q.id === id);
      expect(dist(p, c), id).toBeLessThan(c.solid[0].r);
    }
    // the trestle's top is the flower stall's hide, and the café tables' tops are the tables
    expect(dist(TRESTLE_PERCH, stallById('flowers').hide)).toBeLessThan(stallById('flowers').hide.r + 0.1);
    TABLE_PERCHES.forEach((p, i) => expect(dist(p, CAFE.tables[i])).toBeLessThan(0.3));
    expect(TABLE_PERCHES.map((p) => p.kind)).toEqual(['furniture', 'furniture', 'furniture']);
  });

  it('each knockable is knocked from a perch beside it at its own height, one hop up', () => {
    // knockables.js nearest(): a perch within 0.3 m of the ledge's height; interactions.js KNOCK_REACH 1.0
    for (const k of MARKET_REGISTRATION.propSet.knockables) {
      const from = MARKET_PERCHES.filter((p) => Math.abs(p.y - k.y) < 0.3 && dist(p, k) <= 1.0 && dist(p, k) >= 0.25);
      expect(from.length, k.id).toBeGreaterThan(0);
      expect(from.some((p) => walkableNear(p, 1.2, (q) => canReach(p, q, 0, BASE_CLIMB_BUDGET))), k.id).toBe(true);
    }
  });

  // Step 3 (V7): the street musician's pitch, and (Task 6) the pigeons' patch.
  // What both must keep clear of: every counter's view lane (the lamps' rule),
  // every treat counter's watch zone, every dash from a hide (a cat's width
  // clear), and 1.5 m round each golden mouse and each found-outfit spot.
  const inLane = (o, p) => { const q = toStall(o, p.x, p.z); return q.lz > o.d / 2 - 0.5 && q.lz < o.d / 2 + 9 && Math.abs(q.lx) < o.w / 2 + 1.6; };
  const hideLines = () => [
    ...DRAWN.filter((s) => s.hide).map((s) => [s.hide, s.treat ?? fromStall(s, s.hideSide * (s.w / 2 - 0.3), s.d / 2 + 0.35)]),
    [stallById('cafe').hide, stallById('cafe').treat],
  ];
  const ring = (c, r, n = 16) => Array.from({ length: n }, (_, k) => ({ x: c.x + r * Math.cos((k * 2 * Math.PI) / n), z: c.z + r * Math.sin((k * 2 * Math.PI) / n) }));
  function clearOfEverything(c, r, what) {
    const treat = TREAT_STALLS.map(stallById);
    const pts = [c, ...ring(c, r), ...ring(c, r / 2, 8)];
    for (const p of pts) {
      for (const o of DRAWN) expect(inLane(o, p), `${what} in front of ${o.id}'s counter`).toBe(false);
      for (const o of treat) expect(inZone(o, p.x, p.z), `${what} in ${o.id}'s zone`).toBe(false);
    }
    for (const [h, t] of hideLines()) expect(segDist(c, h, t), `${what} on a hide's line`).toBeGreaterThan(r + CAT_RADIUS);
    for (const m of [...MARKET_REGISTRATION.goldMice, ...MARKET_SPOTS]) expect(dist(c, m) - r, `${what} by ${m.id}`).toBeGreaterThanOrEqual(1.5);
  }

  it('the musician stands where no cat can, out of every lane, zone and hide line, 3 m from every point of interest', () => {
    expect(MUSICIAN.r).toBe(0.45);
    expect(Object.isFrozen(MUSICIAN)).toBe(true);
    for (const k of ['x', 'z', 'yaw']) expect(Number.isFinite(MUSICIAN[k]), k).toBe(true);
    // solid: their pitch and the open fiddle case, so nobody walks into them
    expect(MARKET_COLLIDERS).toContainEqual({ x: MUSICIAN.x, z: MUSICIAN.z, r: MUSICIAN.r });
    for (const p of [MUSICIAN, ...ring(MUSICIAN, MUSICIAN.r + CAT_RADIUS - 0.01), ...ring(MUSICIAN, 0.3)]) {
      expect(isWalkableAt(a, p.x, p.z), `${p.x},${p.z}`).toBe(false);
    }
    // by the fountain: within 1.5 m of its rim, and turned away from it, out to the square
    expect(dist(MUSICIAN, FOUNTAIN) - FOUNTAIN.r).toBeLessThanOrEqual(1.5);
    const out = { x: (MUSICIAN.x - FOUNTAIN.x) / dist(MUSICIAN, FOUNTAIN), z: (MUSICIAN.z - FOUNTAIN.z) / dist(MUSICIAN, FOUNTAIN) };
    expect(Math.sin(MUSICIAN.yaw) * out.x + Math.cos(MUSICIAN.yaw) * out.z).toBeGreaterThan(0.7);
    clearOfEverything(MUSICIAN, MUSICIAN.r, 'the musician');
    // 3 m from every point of interest, every collectible, every prop and perch
    for (const p of [...MARKET_POIS, ...MARKET_COLLECTIBLES]) expect(dist(p, MUSICIAN) - MUSICIAN.r, JSON.stringify(p)).toBeGreaterThanOrEqual(3);
    const props = Object.values(MARKET_REGISTRATION.propSet).filter(Array.isArray).flat();
    for (const p of [...props, ...MARKET_PERCHES]) expect(dist(p, MUSICIAN) - MUSICIAN.r, JSON.stringify(p)).toBeGreaterThanOrEqual(1.5);
    // no pocket a cat could be pushed into: each other solid thing either
    // overlaps the pitch or leaves a cat's width and more between them
    for (const c of MARKET_COLLIDERS) {
      if (c.x === MUSICIAN.x && c.z === MUSICIAN.z) continue;
      const gap = dist(c, MUSICIAN) - c.r - MUSICIAN.r;
      expect(gap < 0 || gap > 2 * CAT_RADIUS + 0.2, `${c.x},${c.z}`).toBe(true);
    }
    // the fountain's drink is still reached, and the spawn's walk up to the fountain is open
    expect(dist(MUSICIAN, MARKET_REGISTRATION.propSet.rests[0]) - MUSICIAN.r).toBeGreaterThan(1);
    expect(segDist(MUSICIAN, MARKET_SPAWN, { x: 0, z: FOUNTAIN.r + 0.3 })).toBeGreaterThan(MUSICIAN.r + 2 * CAT_RADIUS);
  });

  it("the pigeons' patch is free cobbles, off every lane and zone", () => {
    expect(Object.isFrozen(PIGEON_PATCH)).toBe(true);
    expect(PIGEON_PATCH.r).toBeGreaterThanOrEqual(0.8);
    for (const p of [PIGEON_PATCH, ...ring(PIGEON_PATCH, PIGEON_PATCH.r), ...ring(PIGEON_PATCH, PIGEON_PATCH.r / 2, 8)]) {
      expect(isWalkableAt(a, p.x, p.z), `${p.x},${p.z}`).toBe(true);
    }
    clearOfEverything(PIGEON_PATCH, PIGEON_PATCH.r, "the pigeons' patch");
    // the birds peck their own patch, a way off from the musician's
    expect(dist(PIGEON_PATCH, MUSICIAN) - PIGEON_PATCH.r - MUSICIAN.r).toBeGreaterThanOrEqual(3);
  });

  it('nothing offers it yet, and strays are allowed', () => {
    expect(MARKET_REGISTRATION.catalog).toBeNull();
    expect('strays' in MARKET_REGISTRATION).toBe(false);
    expect(MARKET_REGISTRATION.colony).toBe(false);
  });
});
