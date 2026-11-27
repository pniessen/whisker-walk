import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';

// Headless document stub (test/flattrace.test.js's), for modules that listen on it.
vi.stubGlobal('document', {
  createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }),
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

const H = await import('../src/world/houseplan.js');
const W = await import('../src/world/housewingplan.js');
const { houseFlood } = await import('./helpers/houseflood.js');
const { MAX_PATH_GRADE } = await import('../src/ground.js');

const {
  HOUSE_LEVELS, HOUSE_ROOMS, HOUSE_STAIRS, HOUSE_DOORWAYS, HOUSE_BOUNDS, HOUSE_FURNITURE, HOUSE_LAMPS, HOUSE_ZONES,
  houseArea, roomAt, levelAt, stairAt, wingZoneAt, isWingZone,
} = H;
const { WING_ROOMS, WING_FURNITURE, WING_STAIRS, WING_DOORWAYS, WING_JOINS, WING_ZONES, ZONE_NEAR, ZONE_LEAVE } = W;

const area = houseArea();
const levelY = (id) => HOUSE_LEVELS.find((l) => l.id === id).y;
const room = (id) => HOUSE_ROOMS.find((r) => r.id === id);
const overlap = (a, b) =>
  Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) * Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));
const stairRect = (s) => {
  const hw = s.width / 2;
  return Math.abs(s.z1 - s.z0) >= Math.abs(s.x1 - s.x0)
    ? { minX: s.x0 - hw, maxX: s.x0 + hw, minZ: Math.min(s.z0, s.z1), maxZ: Math.max(s.z0, s.z1) }
    : { minX: Math.min(s.x0, s.x1), maxX: Math.max(s.x0, s.x1), minZ: s.z0 - hw, maxZ: s.z0 + hw };
};
const footprint = (f) => {
  const turned = Math.abs(Math.sin(f.rotY)) > 0.5;
  const hx = (turned ? f.d : f.w) / 2;
  const hz = (turned ? f.w : f.d) / 2;
  return { minX: f.x - hx, maxX: f.x + hx, minZ: f.z - hz, maxZ: f.z + hz };
};

describe('the east wing: the plan', () => {
  it('adds the living room, solarium, kids\' room and bathroom, on the old levels, over the lawn', () => {
    expect(WING_ROOMS.map((r) => r.id)).toEqual(['livingroom', 'solarium', 'kids', 'bath', 'wonder']);
    expect(HOUSE_ROOMS).toHaveLength(12); // the seven old rooms, the wing's four and the secret wonder room (milestone 3)
    expect(HOUSE_STAIRS).toHaveLength(6); // the old four, the wing's and the wonder room's secret one
    for (const r of WING_ROOMS) expect(levelAt((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2), r.id).toBe(r.level);
  });

  it('no two rooms overlap, and no stair overlaps a room except at its mouths', () => {
    for (let i = 0; i < HOUSE_ROOMS.length; i++) {
      for (let j = i + 1; j < HOUSE_ROOMS.length; j++) expect(overlap(HOUSE_ROOMS[i], HOUSE_ROOMS[j]), `${HOUSE_ROOMS[i].id}/${HOUSE_ROOMS[j].id}`).toBeLessThan(1e-9);
    }
    const wing = HOUSE_STAIRS.find((s) => s.id === 'wing');
    const r = stairRect(wing);
    for (const q of HOUSE_ROOMS) expect(overlap(r, q), q.id).toBeLessThan(1e-9);
  });

  it('every x, z has one level: the wing\'s floors do not stack over another room\'s', () => {
    for (let x = -24; x <= 52; x += 0.5) {
      for (let z = -16; z <= 12; z += 0.5) {
        const here = HOUSE_ROOMS.filter((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ).map((r) => r.level);
        expect(new Set(here).size, `${x},${z}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the wing stair rises 1 in 3 or gentler, and its mouths meet the room edges', () => {
    const s = WING_STAIRS[0];
    const rise = levelY(s.to) - levelY(s.from);
    const run = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    expect(rise / run).toBeCloseTo(0.2857, 3);
    expect(rise / run).toBeLessThanOrEqual(MAX_PATH_GRADE + 1e-9);
    expect(run).toBeGreaterThanOrEqual(7);
    expect(run).toBeLessThanOrEqual(9);
    expect(s.x0).toBe(room('solarium').maxX); // the solarium's east wall
    expect(s.x1).toBe(room('kids').minX); // the kids' room's west wall
    expect(s.z0).toBeGreaterThan(room('kids').minZ);
    expect(s.z0).toBeLessThan(room('kids').maxZ);
  });

  it('the doorways are on shared edges: D1 in the parlour\'s east wall, D2, D4', () => {
    const d1 = HOUSE_DOORWAYS.find((d) => d.id === 'parlour-livingroom');
    expect(d1).toMatchObject({ x: 14, z: 10.2, axis: 'x' });
    expect(room('parlour').maxX).toBe(14);
    expect(room('livingroom').minX).toBe(14);
    // clear of the fireplace (z 6.05 to 7.95) and the armchair at (11, 8.5)
    expect(d1.z - d1.width / 2).toBeGreaterThan(7.95);
    const d2 = HOUSE_DOORWAYS.find((d) => d.id === 'livingroom-solarium');
    expect(d2).toMatchObject({ x: 22, z: 7 });
    expect(room('livingroom').maxX).toBe(22);
    expect(room('solarium').minX).toBe(22);
    const d4 = HOUSE_DOORWAYS.find((d) => d.id === 'kids-bath');
    expect(d4).toMatchObject({ x: 41, z: 2, axis: 'z' });
    expect(room('kids').minZ).toBe(2);
    expect(room('bath').maxZ).toBe(2);
    expect(WING_DOORWAYS).toHaveLength(3);
  });

  it('no furniture stands in a doorway or in front of the wing stair\'s mouths', () => {
    for (const d of WING_DOORWAYS) {
      const span = d.axis === 'x'
        ? { minX: d.x - 1.1, maxX: d.x + 1.1, minZ: d.z - d.width / 2 - 0.9, maxZ: d.z + d.width / 2 + 0.9 }
        : { minX: d.x - d.width / 2 - 0.9, maxX: d.x + d.width / 2 + 0.9, minZ: d.z - 1.1, maxZ: d.z + 1.1 };
      for (const f of HOUSE_FURNITURE.filter((q) => q.r > 0 || q.ledge)) expect(overlap(footprint(f), span), `${f.id} / ${d.id}`).toBeLessThan(1e-9);
    }
    const s = WING_STAIRS[0];
    for (const [px, side] of [[s.x0, -1], [s.x1, 1]]) {
      const mouth = { minX: Math.min(px, px + side * 1.8), maxX: Math.max(px, px + side * 1.8), minZ: s.z0 - 1.5, maxZ: s.z0 + 1.5 };
      for (const f of HOUSE_FURNITURE.filter((q) => q.r > 0 || q.ledge)) expect(overlap(footprint(f), mouth), `${f.id} / stair`).toBeLessThan(1e-9);
    }
  });

  it('every wing piece is inside its room, and stands on its room\'s level', () => {
    expect(WING_FURNITURE.length).toBeGreaterThanOrEqual(20);
    for (const f of HOUSE_FURNITURE.filter((q) => WING_ROOMS.some((r) => r.id === q.room))) {
      const r = room(f.room);
      const fp = footprint(f);
      expect(f.level, f.id).toBe(r.level);
      expect(fp.minX, f.id).toBeGreaterThanOrEqual(r.minX + 0.1 - 1e-6);
      expect(fp.maxX, f.id).toBeLessThanOrEqual(r.maxX - 0.1 + 1e-6);
      expect(fp.minZ, f.id).toBeGreaterThanOrEqual(r.minZ + 0.1 - 1e-6);
      expect(fp.maxZ, f.id).toBeLessThanOrEqual(r.maxZ - 0.1 + 1e-6);
    }
  });

  it('the old rooms\' furniture and lamps are the rows they were (a hash of them)', () => {
    const old = HOUSE_FURNITURE.filter((f) => !WING_ROOMS.some((r) => r.id === f.room));
    expect(old).toHaveLength(HOUSE_FURNITURE.length - WING_FURNITURE.length);
    const oldLamps = HOUSE_LAMPS.filter((l) => !WING_ROOMS.some((r) => r.id === l.room));
    expect(oldLamps).toHaveLength(8);
    const sha = createHash('sha1').update(JSON.stringify([old.map((f) => [f.id, f.x, f.z, f.rotY, f.w, f.d, f.h]), oldLamps])).digest('hex');
    expect(sha).toBe(OLD_ROWS_SHA);
  });

  it('HOUSE_BOUNDS covers the wing, and the corner of the wing is inside it', () => {
    for (const r of WING_ROOMS) {
      expect(r.maxX).toBeLessThanOrEqual(HOUSE_BOUNDS.maxX);
      expect(r.minZ).toBeGreaterThanOrEqual(HOUSE_BOUNDS.minZ);
      expect(r.maxZ).toBeLessThanOrEqual(HOUSE_BOUNDS.maxZ);
    }
  });

  it('the spawn reaches every wing room and the wing stair\'s two mouths', () => {
    const f = houseFlood(area);
    for (const r of WING_ROOMS) expect(f.reachesWithin((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2, 2.5), r.id).toBe(true);
    const s = WING_STAIRS[0];
    expect(f.reachesWithin((s.x0 + s.x1) / 2, s.z0, 0.5)).toBe(true);
  });
});

describe('the east wing: zones', () => {
  it('names the old four levels and the two wing zones; wingZoneAt reads position, not height', () => {
    expect(HOUSE_ZONES.map((z) => z.id)).toEqual(['cellar', 'ground', 'upstairs', 'attic', 'living', 'sun', 'kids', 'bath', 'wonder']);
    expect(WING_ZONES.map((z) => z.id)).toEqual(['living', 'sun', 'kids', 'bath', 'wonder']); // a zone a room, the wing stair with the solarium, the secret stair with the wonder room
    expect(wingZoneAt(18, 6)).toBe('living');
    expect(wingZoneAt(26, 6)).toBe('sun'); // the solarium
    expect(wingZoneAt(43, 7)).toBe('kids');
    expect(wingZoneAt(41, 0)).toBe('bath');
    expect(wingZoneAt(0, 8)).toBeNull(); // the hall: an old level
    expect(wingZoneAt(11, 8)).toBeNull(); // the parlour
    expect(wingZoneAt(31, 7)).toBe('sun'); // the foot of the wing stair, drawn with the solarium
    expect(wingZoneAt(37, 7)).toBe('kids'); // its top half
    expect(isWingZone('living')).toBe(true);
    expect(isWingZone('ground')).toBe(false);
    expect(roomAt(18, 6)).toBe('livingroom');
    expect(stairAt(34, 7)).toBe('wing');
  });

  it('the joins sit on the openings, and a joined zone is drawn only within ZONE_NEAR (5 m)', () => {
    expect(ZONE_NEAR).toBe(5);
    expect(ZONE_LEAVE).toBeGreaterThan(ZONE_NEAR);
    expect(WING_JOINS.filter((j) => !j.outside).map((j) => [j.a, j.b])).toEqual([['ground', 'living'], ['living', 'sun'], ['sun', 'kids'], ['kids', 'bath'], ['kids', 'wonder']]);
    expect(WING_JOINS[0].keep).toEqual(['parlour']); // beside the wing, the old ground keeps only the parlour in full
    const d1 = WING_JOINS[0];
    expect(d1).toMatchObject({ x: 14, z: 10.2 });
  });
});

// The old rows' fingerprint (their ids, spots and sizes, and the eight old lamps), taken on the
// branch's base before the wing: a change here means an old room moved.
const OLD_ROWS_SHA = 'b72c0a450918421ee47a82c7e78008520fa7e0ce';
