import { describe, it, expect, vi } from 'vitest';

// Headless document stub (test/flattrace.test.js's), for modules that listen on it.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
  }),
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

const H = await import('../src/world/houseplan.js');
const { validateGround, MAX_PATH_GRADE } = await import('../src/ground.js');
const { isWalkableAt } = await import('../src/player.js');
const { houseFlood } = await import('./helpers/houseflood.js');
const { LAMP_LOOK } = await import('../src/render/dusk.js');

const {
  HOUSE_LEVELS, HOUSE_ROOMS, HOUSE_STAIRS, LEVEL_LINKS, HOUSE_DOORWAYS, HOUSE_WINDOWS, HOUSE_BOUNDS,
  HOUSE_SPAWN, HOUSE_FRONT_DOOR, HOUSE_FURNITURE, LAWN_Y, SECTION_MAX, DOOR_H, WALL_H, STUB_H, COLLIDER_R,
  COLLIDER_STEP, TALL_H, HOUSE_LAMPS, LAMP_R, houseGroundSpec, houseSections, houseColliders, roomAt, stairAt, houseArea,
} = H;

const area = houseArea();
const levelY = (id) => HOUSE_LEVELS.find((l) => l.id === id).y;
const cx = (r) => (r.minX + r.maxX) / 2;
const cz = (r) => (r.minZ + r.maxZ) / 2;
const stair = (id) => HOUSE_STAIRS.find((s) => s.id === id);
const rise = (s) => levelY(s.to) - levelY(s.from);
const run = (s) => Math.hypot(s.x1 - s.x0, s.z1 - s.z0);

// A stair as its axis-aligned rectangle (centreline +- width/2 across it).
function stairRect(s) {
  const hw = s.width / 2;
  const alongZ = Math.abs(s.z1 - s.z0) >= Math.abs(s.x1 - s.x0);
  return alongZ
    ? { minX: s.x0 - hw, maxX: s.x0 + hw, minZ: Math.min(s.z0, s.z1), maxZ: Math.max(s.z0, s.z1) }
    : { minX: Math.min(s.x0, s.x1), maxX: Math.max(s.x0, s.x1), minZ: s.z0 - hw, maxZ: s.z0 + hw };
}
const footprints = [
  ...HOUSE_ROOMS.map((r) => ({ id: r.id, kind: 'room', levels: [r.level], rect: r })),
  ...HOUSE_STAIRS.map((s) => ({ id: s.id, kind: 'stair', levels: [s.from, s.to], rect: stairRect(s) })),
];
const overlapArea = (a, b) =>
  Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) *
  Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));
const shrink = (r, e) => ({ minX: r.minX + e, maxX: r.maxX - e, minZ: r.minZ + e, maxZ: r.maxZ - e });
function circleOverlapsRect(c, r) {
  const nx = Math.min(Math.max(c.x, r.minX), r.maxX);
  const nz = Math.min(Math.max(c.z, r.minZ), r.maxZ);
  return Math.hypot(c.x - nx, c.z - nz) < c.r;
}
// Footprints a collider on `level` must not touch. A stair's footprint may touch
// only the rooms of its own two levels at its ends (a stair straddles them), so a
// stair is exempt for a collider whose level it joins, and a collider standing on
// a stair's own long edge takes both of that stair's levels.
function stairLevelsOf(c) {
  const levels = new Set([c.level]);
  for (const s of HOUSE_STAIRS) {
    const grown = shrink(stairRect(s), -0.25);
    if (c.x >= grown.minX && c.x <= grown.maxX && c.z >= grown.minZ && c.z <= grown.maxZ) for (const l of [s.from, s.to]) levels.add(l);
  }
  return levels;
}
function footprintsNotOn(level, allowed) {
  return footprints.filter((f) => !f.levels.some((l) => allowed.has(l))).map((f) => f.rect);
}
function offsetFromMid(s, d) {
  const mx = (s.x0 + s.x1) / 2;
  const mz = (s.z0 + s.z1) / 2;
  const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
  return [mx + (-(s.z1 - s.z0) / len) * d, mz + ((s.x1 - s.x0) / len) * d];
}
// Door point `o` metres along the wall from its centre.
const alongDoor = (d, o) => (d.axis === 'x' ? [d.x, d.z + o] : [d.x + o, d.z]);

describe('the plan of the house', () => {
  it('splits the levels: no two rooms or stairs on different levels share any floor', () => {
    for (let i = 0; i < footprints.length; i++) {
      for (let j = i + 1; j < footprints.length; j++) {
        const a = footprints[i];
        const b = footprints[j];
        const ownEnd = (a.kind === 'stair') !== (b.kind === 'stair') && a.levels.some((l) => b.levels.includes(l));
        const sameLevelRooms = a.kind === 'room' && b.kind === 'room' && a.levels[0] === b.levels[0];
        if (ownEnd && !sameLevelRooms) continue; // a stair meets the rooms of its own two levels
        expect(overlapArea(a.rect, b.rect), `${a.id} / ${b.id}`).toBeLessThan(1e-9);
      }
    }
  });

  it('has a valid ground with no ceilings, and each room reads its own level', () => {
    expect(validateGround(houseGroundSpec())).toEqual([]);
    expect(houseGroundSpec().ceilings).toEqual([]);
    for (const r of HOUSE_ROOMS) expect(area.ground.y(cx(r), cz(r))).toBe(levelY(r.level));
    expect(area.ground.y(-8, -2)).toBe(LAWN_Y); // the courtyard lawn
    expect(area.ground.y(17, -5)).toBeCloseTo(-0.9, 6); // halfway down the cellar stair
  });

  it('rises 1 in 3 or less on every stair; a storey takes 7 to 9 m', () => {
    for (const s of HOUSE_STAIRS) expect(Math.abs(rise(s)) / run(s)).toBeLessThanOrEqual(MAX_PATH_GRADE + 1e-9);
    expect(run(stair('main'))).toBeGreaterThanOrEqual(7);
    expect(run(stair('main'))).toBeLessThanOrEqual(9);
    expect(LEVEL_LINKS).toEqual([['ground', 'upstairs'], ['upstairs', 'attic'], ['ground', 'cellar'], ['ground', 'upstairs']]);
    expect(HOUSE_LEVELS.at(-1).id).toBe('attic');
    expect(HOUSE_LEVELS[0].id).toBe('cellar');
  });

  it('from the spawn reaches every room and stair, and nowhere else', () => {
    const f = houseFlood(area);
    for (const r of HOUSE_ROOMS) expect(f.reachesWithin(cx(r), cz(r), 2.5), r.id).toBe(true);
    for (const s of HOUSE_STAIRS) {
      expect(f.reachesWithin((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, 0.5), s.id).toBe(true);
    }
    for (const c of f.cells) expect(roomAt(c.x, c.z) ?? stairAt(c.x, c.z), `${c.x},${c.z}`).not.toBeNull();
  });

  it('walls every room edge except doorways and stair openings; no section is longer than 4 m', () => {
    const secs = houseSections();
    const ids = secs.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const len = (s) => Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    for (const s of secs.filter((q) => q.kind !== 'lintel')) expect(len(s)).toBeLessThanOrEqual(SECTION_MAX + 1e-9);
    // an opening in a room's edge: a doorway on it, or the end of a stair that meets it
    const on = (r, side) => ({
      n: { fixed: r.minZ, axis: 'z', lo: r.minX, hi: r.maxX },
      s: { fixed: r.maxZ, axis: 'z', lo: r.minX, hi: r.maxX },
      w: { fixed: r.minX, axis: 'x', lo: r.minZ, hi: r.maxZ },
      e: { fixed: r.maxX, axis: 'x', lo: r.minZ, hi: r.maxZ },
    })[side];
    for (const [ri, r] of HOUSE_ROOMS.entries()) {
      for (const side of ['n', 's', 'w', 'e']) {
        const e = on(r, side);
        const drawnEarlier = HOUSE_ROOMS.slice(0, ri).some((q) => q.level === r.level && ['n', 's', 'w', 'e'].some((sd) => {
          const o = on(q, sd);
          return o.axis === e.axis && Math.abs(o.fixed - e.fixed) < 1e-9 && Math.min(o.hi, e.hi) - Math.max(o.lo, e.lo) > 1e-9;
        }));
        const mine = secs.filter((q) => q.owner === r.id && q.side === side && q.kind === 'wall');
        if (drawnEarlier) {
          expect(mine, `${r.id}-${side}`).toEqual([]);
          continue;
        }
        let openings = 0;
        for (const d of HOUSE_DOORWAYS) {
          if (!d.rooms.includes(r.id) || d.axis !== e.axis || Math.abs(d.axis === 'x' ? d.x - e.fixed : d.z - e.fixed) > 1e-9) continue;
          openings += d.width;
        }
        for (const s of HOUSE_STAIRS) {
          const alongZ = Math.abs(s.z1 - s.z0) >= Math.abs(s.x1 - s.x0);
          // a stair end sits on this edge when its end point is on the edge line and inside the edge
          for (const [px, pz] of [[s.x0, s.z0], [s.x1, s.z1]]) {
            if (!(s.from === r.level || s.to === r.level)) continue;
            const levelOk = (px === s.x0 && pz === s.z0 ? s.from : s.to) === r.level;
            const fixedCoord = e.axis === 'x' ? px : pz;
            const alongCoord = e.axis === 'x' ? pz : px;
            if (levelOk && Math.abs(fixedCoord - e.fixed) < 1e-9 && alongCoord > e.lo && alongCoord < e.hi) {
              // the stair must run across this edge, not along it
              if ((e.axis === 'x') === !alongZ) openings += s.width;
            }
          }
        }
        const total = mine.reduce((a, q) => a + len(q), 0) + openings;
        expect(total, `${r.id}-${side}`).toBeCloseTo(e.hi - e.lo, 6);
      }
    }
    // every window sits wholly inside one section of its room's side
    for (const w of HOUSE_WINDOWS) {
      const room = HOUSE_ROOMS.find((r) => r.id === w.room);
      const inside = secs.filter((q) => q.window === w);
      expect(inside.length, `${w.room}-${w.side}@${w.at}`).toBe(1);
      const q = inside[0];
      expect(q.owner).toBe(room.id);
      expect(q.side).toBe(w.side);
      const along = w.side === 'n' || w.side === 's' ? [q.x0, q.x1] : [q.z0, q.z1];
      expect(w.at - w.width / 2).toBeGreaterThanOrEqual(Math.min(...along) - 1e-9);
      expect(w.at + w.width / 2).toBeLessThanOrEqual(Math.max(...along) + 1e-9);
    }
    // lintels: over each doorway, flush with its head, sinking to nothing
    for (const d of HOUSE_DOORWAYS) {
      const l = secs.filter((q) => q.kind === 'lintel' && Math.abs((q.x0 + q.x1) / 2 - d.x) < 1e-6 && Math.abs((q.z0 + q.z1) / 2 - d.z) < 1e-6);
      expect(l.length, d.id).toBe(1);
      expect(l[0].height).toBeCloseTo(WALL_H - DOOR_H, 9);
      expect(l[0].stub).toBe(0);
    }
    for (const s of secs.filter((q) => q.kind === 'wall')) expect(s.stub).toBe(STUB_H);
  });

  it('keeps the cat 0.45 m off every solid wall, and no collider touches another level', () => {
    for (const s of houseSections().filter((q) => q.kind !== 'lintel')) {
      for (const side of [-1, 1]) {
        expect(isWalkableAt(area, ...offsetFromMid(s, 0.45 * side)), `${s.id} ${side}`).toBe(false);
      }
    }
    for (const c of area.colliders) {
      for (const fp of footprintsNotOn(c.level, stairLevelsOf(c))) {
        expect(circleOverlapsRect(c, shrink(fp, 0.01)), `${c.x},${c.z} ${c.level}`).toBe(false);
      }
    }
    expect(COLLIDER_R).toBe(0.2);
    // spacing: every wall section has circles at both ends, at most one step apart
    for (const s of houseSections().filter((q) => q.kind === 'wall' || q.kind === 'stair')) {
      const mine = area.colliders.filter((c) => Math.abs((c.x - s.x0) * (s.z1 - s.z0) - (c.z - s.z0) * (s.x1 - s.x0)) < 1e-6
        && c.x >= Math.min(s.x0, s.x1) - 1e-6 && c.x <= Math.max(s.x0, s.x1) + 1e-6
        && c.z >= Math.min(s.z0, s.z1) - 1e-6 && c.z <= Math.max(s.z0, s.z1) + 1e-6);
      expect(mine.some((c) => Math.hypot(c.x - s.x0, c.z - s.z0) < 1e-6), `${s.id} start`).toBe(true);
      expect(mine.some((c) => Math.hypot(c.x - s.x1, c.z - s.z1) < 1e-6), `${s.id} end`).toBe(true);
    }
    expect(COLLIDER_STEP).toBe(0.25);
    expect(houseColliders()).toEqual(area.colliders);
  });

  it('leaves every doorway a clear path for her centre across its middle 0.6 m', () => {
    // a 0.25 m flood: a doorway's clear centre band is 0.9 m wide, which a 0.5 m grid can sample only once
    const f = houseFlood(area, area.spawn, 0.25);
    for (const d of HOUSE_DOORWAYS) {
      for (const o of [-0.3, 0, 0.3]) expect(f.reachesWithin(...alongDoor(d, o), 0.26), `${d.id} ${o}`).toBe(true);
    }
  });

  it('keeps the front door on the hall south wall, with its arrival spot reachable', () => {
    const door = HOUSE_FRONT_DOOR;
    const hall = HOUSE_ROOMS.find((r) => r.id === 'hall');
    expect(door.z).toBe(hall.maxZ);
    expect(door.faces).toBe('south');
    const piece = houseSections().find((s) => s.id.startsWith('hall-s-') && door.x >= Math.min(s.x0, s.x1) - 1e-9 && door.x <= Math.max(s.x0, s.x1) + 1e-9);
    expect(piece).toBeTruthy();
    expect(HOUSE_SPAWN).toEqual({ x: door.arrive.x, z: door.arrive.z });
    expect(door.arrive.yaw).toBe(0);
    const f = houseFlood(area, area.spawn);
    expect(isWalkableAt(area, door.arrive.x, door.arrive.z)).toBe(true);
    expect(f.reaches(door.arrive.x, door.arrive.z)).toBe(true);
    expect(roomAt(door.arrive.x, door.arrive.z)).toBe('hall');
    expect(HOUSE_BOUNDS).toEqual({ minX: -24, maxX: 30, minZ: -16, maxZ: 12 });
  });
});

// A piece's footprint as a world rectangle (w across its front, d deep, turned by rotY).
function footprintOf(f) {
  const c = Math.abs(Math.cos(f.rotY));
  const sn = Math.abs(Math.sin(f.rotY));
  const hx = (f.w * c + f.d * sn) / 2;
  const hz = (f.w * sn + f.d * c) / 2;
  return { minX: f.x - hx, maxX: f.x + hx, minZ: f.z - hz, maxZ: f.z + hz };
}
const roomOf = (id) => HOUSE_ROOMS.find((r) => r.id === id);
const edgeDistances = (r, x, z) => ({ w: x - r.minX, e: r.maxX - x, n: z - r.minZ, s: r.maxZ - z });

describe('the furniture', () => {
  it('furnishes every room with the named pieces, each in its own room on its own level', () => {
    const kinds = (room) => HOUSE_FURNITURE.filter((f) => f.room === room).map((f) => f.kind);
    const has = (room, kind, n = 1) => expect(kinds(room).filter((k) => k === kind).length, `${room} ${kind}`).toBeGreaterThanOrEqual(n);
    has('hall', 'clock'); has('hall', 'console'); has('hall', 'bench'); has('hall', 'umbrellas'); has('hall', 'runner');
    has('library', 'bookcase', 3); has('library', 'ladder'); has('library', 'armchair'); has('library', 'desk'); has('library', 'globe'); has('library', 'rug');
    has('kitchen', 'counter'); has('kitchen', 'range'); has('kitchen', 'table'); has('kitchen', 'chair', 2); has('kitchen', 'dresser'); has('kitchen', 'sink');
    has('parlour', 'fireplace'); has('parlour', 'armchair', 2); has('parlour', 'piano'); has('parlour', 'sidetable'); has('parlour', 'rug');
    has('bedroom', 'bed'); has('bedroom', 'wardrobe'); has('bedroom', 'drawers'); has('bedroom', 'bedside'); has('bedroom', 'rug');
    has('attic', 'boxes'); has('attic', 'trunk'); has('attic', 'chair'); has('attic', 'rug');
    has('cellar', 'barrels'); has('cellar', 'jarshelf'); has('cellar', 'crates'); has('cellar', 'cobweb');
    const ids = HOUSE_FURNITURE.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of HOUSE_FURNITURE) {
      const room = roomOf(f.room);
      expect(room, f.id).toBeTruthy();
      expect(f.level, f.id).toBe(room.level);
      const fp = footprintOf(f);
      expect(fp.minX, f.id).toBeGreaterThanOrEqual(room.minX + 0.1 - 1e-6);
      expect(fp.maxX, f.id).toBeLessThanOrEqual(room.maxX - 0.1 + 1e-6);
      expect(fp.minZ, f.id).toBeGreaterThanOrEqual(room.minZ + 0.1 - 1e-6);
      expect(fp.maxZ, f.id).toBeLessThanOrEqual(room.maxZ - 0.1 + 1e-6);
      expect(f.h, f.id).toBeGreaterThan(0);
      expect(f.r, f.id).toBeGreaterThanOrEqual(0);
    }
    // the attic's boxes are stacked no higher than 1.4 m
    for (const f of HOUSE_FURNITURE.filter((q) => q.room === 'attic' && q.kind === 'boxes')) expect(f.h, f.id).toBeLessThanOrEqual(1.4);
  });

  it('stands every tall piece with its back to its room\'s wall', () => {
    const tall = HOUSE_FURNITURE.filter((f) => f.h >= TALL_H);
    expect(tall.length).toBeGreaterThanOrEqual(8);
    for (const f of tall) {
      const d = edgeDistances(roomOf(f.room), f.x, f.z);
      const [side, near] = Object.entries(d).sort((a, b) => a[1] - b[1])[0];
      expect(near, f.id).toBeLessThanOrEqual(0.8);
      // and it faces away from that wall: its front (local +z turned by rotY) points into the room
      const fx = Math.sin(f.rotY);
      const fz = Math.cos(f.rotY);
      const inward = { w: [1, 0], e: [-1, 0], n: [0, 1], s: [0, -1] }[side];
      expect(fx * inward[0] + fz * inward[1], f.id).toBeGreaterThan(0.99);
    }
  });

  it('never stands a tall piece in front of a window', () => {
    for (const f of HOUSE_FURNITURE.filter((q) => q.h >= TALL_H)) {
      const fp = footprintOf(f);
      const room = roomOf(f.room);
      for (const w of HOUSE_WINDOWS.filter((q) => q.room === f.room)) {
        const line = { n: room.minZ, s: room.maxZ, w: room.minX, e: room.maxX }[w.side];
        const ns = w.side === 'n' || w.side === 's';
        const off = ns ? Math.min(Math.abs(fp.minZ - line), Math.abs(fp.maxZ - line)) : Math.min(Math.abs(fp.minX - line), Math.abs(fp.maxX - line));
        if (off > 1.2) continue; // nowhere near that wall
        const [lo, hi] = ns ? [fp.minX, fp.maxX] : [fp.minZ, fp.maxZ];
        const apart = hi <= w.at - w.width / 2 - 0.1 || lo >= w.at + w.width / 2 + 0.1;
        expect(apart, `${f.id} / ${w.room}-${w.side}@${w.at}`).toBe(true);
      }
    }
  });

  it('gives every solid piece colliders on its own level, and walks over the flat ones', () => {
    for (const f of HOUSE_FURNITURE) {
      const near = area.colliders.filter((c) => c.r === f.r && Math.hypot(c.x - f.x, c.z - f.z) <= Math.max(f.w, f.d) / 2 + 1e-6);
      if (f.r === 0) continue;
      // step 2 (D18, ruling D1): a ledge piece has none; its top is ground at its height
      if (f.ledge) {
        expect(area.ground.y(f.x, f.z), f.id).toBeCloseTo(levelY(f.level) + f.h, 9);
        continue;
      }
      expect(near.length, f.id).toBeGreaterThanOrEqual(1);
      for (const c of near) expect(c.level, f.id).toBe(f.level);
      // a piece's own centre is never walkable
      expect(isWalkableAt(area, f.x, f.z), f.id).toBe(false);
    }
    for (const f of HOUSE_FURNITURE.filter((q) => q.r === 0)) expect(f.h, f.id).toBeLessThanOrEqual(0.7);
  });

  it('keeps every stair mouth and the front door\'s arrival spot clear', () => {
    const f = houseFlood(area, area.spawn, 0.25);
    for (const s of HOUSE_STAIRS) {
      const alongZ = Math.abs(s.z1 - s.z0) >= Math.abs(s.x1 - s.x0);
      const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      const ux = (s.x1 - s.x0) / len;
      const uz = (s.z1 - s.z0) / len;
      // a metre out of each end, into its room, across the middle of the stair
      for (const [px, pz, out] of [[s.x0, s.z0, -1], [s.x1, s.z1, 1]]) {
        for (const o of [-0.5, 0, 0.5]) {
          const x = px + ux * out * 1.0 + (alongZ ? o : 0);
          const z = pz + uz * out * 1.0 + (alongZ ? 0 : o);
          expect(isWalkableAt(area, x, z), `${s.id} ${out} ${o}`).toBe(true);
          expect(f.reachesWithin(x, z, 0.26), `${s.id} ${out} ${o}`).toBe(true);
        }
      }
    }
    const a = HOUSE_FRONT_DOOR.arrive;
    for (const [dx, dz] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) {
      expect(isWalkableAt(area, a.x + dx, a.z + dz), `arrive ${dx},${dz}`).toBe(true);
    }
  });
});

describe('the lamps', () => {
  it('stands every lamp in its room, its collider in the plan\'s colliders', () => {
    for (const r of HOUSE_ROOMS) expect(HOUSE_LAMPS.filter((l) => l.room === r.id).length, r.id).toBeGreaterThanOrEqual(r.id === 'cellar' ? 2 : 1);
    for (const l of HOUSE_LAMPS) {
      expect(roomAt(l.x, l.z), `${l.room} lamp`).toBe(l.room);
      const c = houseColliders().find((q) => q.x === l.x && q.z === l.z && q.r === LAMP_R);
      expect(c, `${l.room} lamp`).toBeTruthy();
      expect(c.level).toBe(roomOf(l.room).level);
    }
  });

  it('keeps a raised room\'s lamp a whole pool radius from its walls, so no glow hangs over the lawn', () => {
    const R = LAMP_LOOK.poolRadius;
    const raised = HOUSE_LAMPS.filter((l) => levelY(roomOf(l.room).level) > LAWN_Y);
    expect(raised.map((l) => l.room).sort()).toEqual(['attic', 'bedroom']);
    for (const l of raised) {
      for (const [side, d] of Object.entries(edgeDistances(roomOf(l.room), l.x, l.z))) expect(d, `${l.room} ${side}`).toBeGreaterThanOrEqual(R);
    }
  });
});

