// THE OLD HOUSE, THE PLAN (Old House step 1). The pure data of the place: its
// split levels, rooms, stairs, doorways and windows, the ground they make, the
// wall sections that sink when the camera needs the view, and the collider
// chains that stop the cat. No THREE, no randomness, no clock: the headless
// tests walk it, and house.js draws it. Sibling of roofsplan.js.
//
// x east, z south (north is -z), metres. Split levels (spec): no two rooms or
// stairs on different levels share any floor, so the cat's x, z names her level.
//
//   z -16 +--------+--------+ ...
//         | attic  |back st.| bedroom   (upstairs 2.4, attic 4.2)
//   z  -6 +--------+--------+----+
//                         main stair  (ground 0 -> upstairs 2.4, 8.4 m)
//   z   2 +-----------+----+-----+------+  kitchen [4,14] x [-8,2] --cellar
//         | library   |hall|parlour     |  stair east to the cellar (-1.8)
//   z  12 +-----------+--*-+------------+  * = spawn, front door on the south
//
// The lawn around it is ground at 0, so the camera beside the sunken cellar
// can never drop below the drawn grass (ruling H4).

import { createGround } from '../ground.js';

export const HOUSE_ID = 'house';
export const BASE_Y = -3;
export const LAWN_Y = 0;
export const WALL_H = 2.8;
export const WALL_T = 0.2;
export const STUB_H = 0.25;
export const DOOR_W = 2.0;
export const DOOR_H = 2.2;
export const SECTION_MAX = 4.0;
export const COLLIDER_R = 0.2;
export const COLLIDER_STEP = 0.25;
export const TALL_H = 1.6;
const LAWN_MARGIN = 12;

const freeze = Object.freeze;
const frozenAll = (list) => freeze(list.map((o) => freeze(o)));

export const HOUSE_LEVELS = frozenAll([
  { id: 'cellar', y: -1.8 },
  { id: 'ground', y: 0 },
  { id: 'upstairs', y: 2.4 },
  { id: 'attic', y: 4.2 },
]);

export const HOUSE_ROOMS = frozenAll([
  { id: 'hall', level: 'ground', minX: -4, maxX: 4, minZ: 2, maxZ: 12 },
  { id: 'library', level: 'ground', minX: -14, maxX: -4, minZ: 2, maxZ: 12 },
  { id: 'parlour', level: 'ground', minX: 4, maxX: 14, minZ: 2, maxZ: 12 },
  { id: 'kitchen', level: 'ground', minX: 4, maxX: 14, minZ: -8, maxZ: 2 },
  { id: 'bedroom', level: 'upstairs', minX: -8, maxX: 2, minZ: -16, maxZ: -6.4 },
  { id: 'attic', level: 'attic', minX: -24, maxX: -14, minZ: -16, maxZ: -6 },
  { id: 'cellar', level: 'cellar', minX: 20, maxX: 30, minZ: -10, maxZ: 0 },
]);

export const HOUSE_STAIRS = frozenAll([
  { id: 'main', from: 'ground', to: 'upstairs', x0: 0, z0: 2, x1: 0, z1: -6.4, width: 3.0 },
  { id: 'back', from: 'upstairs', to: 'attic', x0: -8, z0: -11, x1: -14, z1: -11, width: 2.4 },
  { id: 'cellar', from: 'ground', to: 'cellar', x0: 14, z0: -5, x1: 20, z1: -5, width: 2.4 },
]);

export const LEVEL_LINKS = freeze(HOUSE_STAIRS.map((s) => freeze([s.from, s.to])));

// `axis` is the wall line's fixed coordinate: 'x' means the wall runs along z at x.
export const HOUSE_DOORWAYS = frozenAll([
  { id: 'hall-library', rooms: freeze(['hall', 'library']), x: -4, z: 7, axis: 'x', width: DOOR_W },
  { id: 'hall-parlour', rooms: freeze(['hall', 'parlour']), x: 4, z: 7, axis: 'x', width: DOOR_W },
  { id: 'parlour-kitchen', rooms: freeze(['parlour', 'kitchen']), x: 9, z: 2, axis: 'z', width: DOOR_W },
]);

// `at` is the window's centre along its wall (x for n and s, z for e and w).
const win = (room, side, at, width = 1.2, sill = 0.9, head = 2.0, round = false) => ({ room, side, at, width, sill, head, round });
export const HOUSE_WINDOWS = frozenAll([
  win('hall', 's', -2), win('hall', 's', 2),
  win('library', 'w', 3.7), win('library', 'w', 10.3),
  win('parlour', 's', 5.7), win('parlour', 's', 12.3),
  win('kitchen', 'n', 5.7), win('kitchen', 'n', 12.3),
  win('bedroom', 'n', -3),
  win('attic', 'w', -11, 1.0, 1.2, 2.2, true),
  win('cellar', 'e', -5, 0.8, 1.6, 2.1),
]);

export const HOUSE_BOUNDS = freeze({ minX: -24, maxX: 30, minZ: -16, maxZ: 12 });

// The shut front door on the hall's south wall, and where she lands coming in
// (yaw 0 faces -z). Data only in step 1; step 4 opens it.
export const HOUSE_FRONT_DOOR = freeze({
  x: 0,
  z: 12,
  faces: 'south',
  arrive: freeze({ x: 0, z: 9.5, yaw: 0 }),
});
export const HOUSE_SPAWN = freeze({ x: HOUSE_FRONT_DOOR.arrive.x, z: HOUSE_FRONT_DOOR.arrive.z });

// Task 5 fills this: { x, z, r, level, ... }.
export const HOUSE_FURNITURE = freeze([]);

const levelY = (id) => HOUSE_LEVELS.find((l) => l.id === id).y;
const roomById = (id) => HOUSE_ROOMS.find((r) => r.id === id);

// ---- ground ----

// outer minus holes, as non-overlapping rectangles: cut on the holes' edge
// coordinates, keep each cell no hole covers, and join a row's neighbours.
function rectMinus(outer, holes) {
  const xs = [...new Set([outer.minX, outer.maxX, ...holes.flatMap((h) => [h.minX, h.maxX])])]
    .filter((v) => v >= outer.minX && v <= outer.maxX).sort((a, b) => a - b);
  const zs = [...new Set([outer.minZ, outer.maxZ, ...holes.flatMap((h) => [h.minZ, h.maxZ])])]
    .filter((v) => v >= outer.minZ && v <= outer.maxZ).sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j + 1 < zs.length; j++) {
    let run = null;
    for (let i = 0; i + 1 < xs.length; i++) {
      const mx = (xs[i] + xs[i + 1]) / 2;
      const mz = (zs[j] + zs[j + 1]) / 2;
      const covered = holes.some((h) => mx > h.minX && mx < h.maxX && mz > h.minZ && mz < h.maxZ);
      if (covered) {
        if (run) out.push(run);
        run = null;
      } else if (run) run.maxX = xs[i + 1];
      else run = { minX: xs[i], maxX: xs[i + 1], minZ: zs[j], maxZ: zs[j + 1] };
    }
    if (run) out.push(run);
  }
  return out;
}

// A stair as its axis-aligned rectangle (the centreline, +- width/2 across it).
function stairRect(s) {
  const hw = s.width / 2;
  return stairAlongZ(s)
    ? { minX: s.x0 - hw, maxX: s.x0 + hw, minZ: Math.min(s.z0, s.z1), maxZ: Math.max(s.z0, s.z1) }
    : { minX: Math.min(s.x0, s.x1), maxX: Math.max(s.x0, s.x1), minZ: s.z0 - hw, maxZ: s.z0 + hw };
}
const stairAlongZ = (s) => Math.abs(s.z1 - s.z0) >= Math.abs(s.x1 - s.x0);

export function houseGroundSpec() {
  const strips = [];
  for (const r of HOUSE_ROOMS) {
    strips.push({ x0: r.minX, z0: (r.minZ + r.maxZ) / 2, x1: r.maxX, z1: (r.minZ + r.maxZ) / 2, width: r.maxZ - r.minZ, y: levelY(r.level) });
  }
  for (const s of HOUSE_STAIRS) {
    strips.push({ x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, width: s.width, y0: levelY(s.from), y1: levelY(s.to) });
  }
  const outer = {
    minX: HOUSE_BOUNDS.minX - LAWN_MARGIN, maxX: HOUSE_BOUNDS.maxX + LAWN_MARGIN,
    minZ: HOUSE_BOUNDS.minZ - LAWN_MARGIN, maxZ: HOUSE_BOUNDS.maxZ + LAWN_MARGIN,
  };
  // the lawn is cut out where the ground drops: the cellar and the stair down to it
  const holes = [roomById('cellar'), stairRect(HOUSE_STAIRS.find((s) => s.to === 'cellar'))];
  for (const r of rectMinus(outer, holes)) {
    const z = (r.minZ + r.maxZ) / 2;
    strips.push({ x0: r.minX, z0: z, x1: r.maxX, z1: z, width: r.maxZ - r.minZ, y: LAWN_Y });
  }
  return { base: BASE_Y, strips, discs: [], ceilings: [] };
}

// ---- lookups ----

const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
export function roomAt(x, z) {
  for (const r of HOUSE_ROOMS) if (inRect(r, x, z)) return r.id;
  return null;
}
export function stairAt(x, z) {
  for (const s of HOUSE_STAIRS) if (inRect(stairRect(s), x, z)) return s.id;
  return null;
}

// ---- wall sections ----

// Cut [lo, hi] into equal pieces no longer than SECTION_MAX.
function pieces(lo, hi) {
  const n = Math.max(1, Math.ceil((hi - lo) / SECTION_MAX - 1e-9));
  const out = [];
  for (let k = 0; k < n; k++) out.push([lo + ((hi - lo) * k) / n, lo + ((hi - lo) * (k + 1)) / n]);
  return out;
}

// The solid runs left of [lo, hi] once the openings ([a, b] pairs) are taken out.
function solidRuns(lo, hi, openings) {
  const sorted = [...openings].sort((p, q) => p[0] - q[0]);
  const runs = [];
  let at = lo;
  for (const [a, b] of sorted) {
    if (a - at > 1e-9) runs.push([at, a]);
    at = Math.max(at, b);
  }
  if (hi - at > 1e-9) runs.push([at, hi]);
  return runs;
}

const EDGES = ['n', 's', 'w', 'e'];
// A room's edge: `fixed` is the wall line's coordinate, [lo, hi] runs along it.
function edgeOf(r, side) {
  if (side === 'n') return { fixed: r.minZ, run: 'x', lo: r.minX, hi: r.maxX };
  if (side === 's') return { fixed: r.maxZ, run: 'x', lo: r.minX, hi: r.maxX };
  if (side === 'w') return { fixed: r.minX, run: 'z', lo: r.minZ, hi: r.maxZ };
  return { fixed: r.maxX, run: 'z', lo: r.minZ, hi: r.maxZ };
}
// A section along an edge from `a` to `b` (coordinates along its run).
function along(edge, a, b) {
  return edge.run === 'x'
    ? { x0: a, z0: edge.fixed, x1: b, z1: edge.fixed }
    : { x0: edge.fixed, z0: a, x1: edge.fixed, z1: b };
}

// Which of the stair's two ends meets this room's edge, as an opening [a, b].
function stairOpenings(room, edge) {
  const out = [];
  for (const s of HOUSE_STAIRS) {
    const ends = [[s.x0, s.z0, s.from], [s.x1, s.z1, s.to]];
    for (const [px, pz, level] of ends) {
      if (level !== room.level) continue;
      // the stair must run across this edge, not along it
      if (edge.run === 'x' ? stairAlongZ(s) : !stairAlongZ(s)) {
        const fixedAt = edge.run === 'x' ? pz : px;
        const alongAt = edge.run === 'x' ? px : pz;
        if (Math.abs(fixedAt - edge.fixed) < 1e-9 && alongAt > edge.lo && alongAt < edge.hi) {
          out.push([alongAt - s.width / 2, alongAt + s.width / 2]);
        }
      }
    }
  }
  return out;
}

let sectionCache = null;
function buildSections() {
  const sections = [];
  const make = (o) => freeze({ window: null, ...o });
  HOUSE_ROOMS.forEach((room, ri) => {
    const y = levelY(room.level);
    for (const side of EDGES) {
      const edge = edgeOf(room, side);
      // an edge shared with an earlier room on this level is that room's to draw
      const shared = HOUSE_ROOMS.slice(0, ri).some((q) => q.level === room.level && EDGES.some((sd) => {
        const o = edgeOf(q, sd);
        return o.run === edge.run && Math.abs(o.fixed - edge.fixed) < 1e-9 && Math.min(o.hi, edge.hi) - Math.max(o.lo, edge.lo) > 1e-9;
      }));
      if (shared) continue;
      const doors = HOUSE_DOORWAYS.filter((d) => d.rooms.includes(room.id) && (edge.run === 'z' ? d.axis === 'x' && Math.abs(d.x - edge.fixed) < 1e-9 : d.axis === 'z' && Math.abs(d.z - edge.fixed) < 1e-9));
      const doorSpans = doors.map((d) => { const c = edge.run === 'z' ? d.z : d.x; return [c - d.width / 2, c + d.width / 2]; });
      const openings = [...doorSpans, ...stairOpenings(room, edge)];
      let k = 0;
      for (const [a, b] of solidRuns(edge.lo, edge.hi, openings)) {
        for (const [pa, pb] of pieces(a, b)) {
          const seg = along(edge, pa, pb);
          const probe = side === 'n' ? [(seg.x0 + seg.x1) / 2, seg.z0 - 0.5] : side === 's' ? [(seg.x0 + seg.x1) / 2, seg.z0 + 0.5]
            : side === 'w' ? [seg.x0 - 0.5, (seg.z0 + seg.z1) / 2] : [seg.x0 + 0.5, (seg.z0 + seg.z1) / 2];
          const farRoom = roomAt(probe[0], probe[1]);
          const outer = !(farRoom && roomById(farRoom).level === room.level);
          const window = HOUSE_WINDOWS.find((w) => w.room === room.id && w.side === side && w.at - w.width / 2 >= pa - 1e-9 && w.at + w.width / 2 <= pb + 1e-9) ?? null;
          sections.push(make({ id: `${room.id}-${side}-${k++}`, kind: 'wall', level: room.level, owner: room.id, side, ...seg, base: y, height: WALL_H, stub: STUB_H, outer, window }));
        }
      }
      for (const d of doors) {
        const c = edge.run === 'z' ? d.z : d.x;
        const seg = along(edge, c - d.width / 2, c + d.width / 2);
        sections.push(make({ id: `${room.id}-${side}-${k++}`, kind: 'lintel', level: room.level, owner: room.id, side, ...seg, base: y + DOOR_H, height: WALL_H - DOOR_H, stub: 0, outer: false }));
      }
    }
  });
  for (const s of HOUSE_STAIRS) {
    const y0 = levelY(s.from);
    const y1 = levelY(s.to);
    const hw = s.width / 2;
    const alongZ = stairAlongZ(s);
    // a stair named like a room (the cellar stair) gets its own id stem
    const stem = roomById(s.id) ? `${s.id}stair` : s.id;
    // the two long edges, named by the side they face
    const edges = alongZ
      ? [['w', s.x0 - hw, -1], ['e', s.x0 + hw, 1]]
      : [['n', s.z0 - hw, -1], ['s', s.z0 + hw, 1]];
    for (const [side, fixed, dir] of edges) {
      const n = Math.max(1, Math.ceil(Math.hypot(s.x1 - s.x0, s.z1 - s.z0) / SECTION_MAX - 1e-9));
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const lerp = (a, b, t) => a + (b - a) * t;
        const seg = alongZ
          ? { x0: fixed, z0: lerp(s.z0, s.z1, t0), x1: fixed, z1: lerp(s.z0, s.z1, t1) }
          : { x0: lerp(s.x0, s.x1, t0), z0: fixed, x1: lerp(s.x0, s.x1, t1), z1: fixed };
        const mx = (seg.x0 + seg.x1) / 2 + (alongZ ? dir * 0.5 : 0);
        const mz = (seg.z0 + seg.z1) / 2 + (alongZ ? 0 : dir * 0.5);
        const far = roomAt(mx, mz);
        const outer = !(far && roomById(far).level === s.from);
        sections.push(make({ id: `${stem}-${side}-${k}`, kind: 'stair', level: s.from, owner: s.id, side, ...seg, base: Math.min(y0, y1), height: Math.abs(y1 - y0) + WALL_H, stub: STUB_H, outer }));
      }
    }
  }
  return freeze(sections);
}

export function houseSections() {
  if (!sectionCache) sectionCache = buildSections();
  return sectionCache;
}

// ---- colliders ----

export function houseColliders() {
  const out = [];
  for (const s of houseSections()) {
    if (s.kind === 'lintel') continue;
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    const n = Math.max(1, Math.ceil(len / COLLIDER_STEP - 1e-9));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push({ x: s.x0 + (s.x1 - s.x0) * t, z: s.z0 + (s.z1 - s.z0) * t, r: COLLIDER_R, level: s.level });
    }
  }
  for (const f of HOUSE_FURNITURE) if (f.r > 0) out.push({ x: f.x, z: f.z, r: f.r, level: f.level });
  return out;
}

export function houseArea() {
  return {
    ground: createGround(houseGroundSpec()),
    colliders: houseColliders(),
    bounds: HOUSE_BOUNDS,
    spawn: HOUSE_SPAWN,
    levels: HOUSE_LEVELS,
    links: LEVEL_LINKS,
    rooms: HOUSE_ROOMS,
    stairs: HOUSE_STAIRS,
    sections: houseSections(),
  };
}
