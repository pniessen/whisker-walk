import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// The headless document stub every world test uses (test/flattrace.test.js's):
// createPlayer listens on it, and the build draws on canvases.
vi.stubGlobal('document', canvasStub);

const { HOUSE_LEVELS, HOUSE_LEDGES, HOUSE_FURNITURE, HOUSE_STAIRS, houseFloorGround, houseColliders, roomAt, levelAt } = await import('../src/world/houseplan.js');
const { HOUSE_MOVES, HOUSE_PERCHES, HOUSE_ROUTES, houseMovesArea } = await import('../src/world/housemoves.js');
const { validateTraversal, BASE_ABILITIES, stickToWorld, spotFor } = await import('../src/traversal.js');
const { PAW_PADS, PAW_APART } = await import('../src/world/houseparts.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { STEP_MAX } = await import('../src/ground.js');
const { createPlayer, isWalkableAt } = await import('../src/player.js');
const { floodTraversal } = await import('./helpers/traversalflood.js');
const { build } = await import('../src/world/house.js');
const { LEVEL_SWITCH } = await import('../src/houselevels.js');

// =============================================================================
// The Old House, step 2, Task 2 (rulings D1-D4): furniture tops she can stand on
// are ledges (ground), joined to the floor and to each other by the Rooftops'
// moves; the knock-over pieces are perches; the levels are drawn for the floor
// under her, not her paws.
// =============================================================================

const area = houseMovesArea();
const floor = houseFloorGround();
const levelY = (id) => HOUSE_LEVELS.find((l) => l.id === id).y;
const cx = (r) => (r.minX + r.maxX) / 2;
const cz = (r) => (r.minZ + r.maxZ) / 2;
// a collider's centre inside a rectangle grown by `pad` (shrunk when pad < 0)
const inRect = (c, r, pad = 0) => c.x >= r.minX - pad && c.x <= r.maxX + pad && c.z >= r.minZ - pad && c.z <= r.maxZ + pad;
const onLedge = (l, x, z, y) => inRect({ x, z }, l) && Math.abs(y - l.y) <= STEP_MAX;

// Every place a move starts or ends: { x, z, y, start }.
function moveEnds() {
  const out = [];
  for (const h of area.traversal.hops) {
    out.push({ x: h.x0, z: h.z0, y: h.y0, start: true });
    out.push({ x: h.x1, z: h.z1, y: h.y1, start: false });
  }
  for (const c of area.traversal.crossings) for (const e of c.ends) out.push({ x: e.x, z: e.z, y: e.y, start: true });
  return out;
}
const ledgesWithMoves = () => HOUSE_LEDGES.filter((l) => moveEnds().some((e) => onLedge(l, e.x, e.z, e.y)));

// Floor spots round a perch she can stand on (clear of every collider) on the perch's own floor.
function floorSpotsNear(p) {
  const out = [];
  const y = floor.y(p.x, p.z);
  for (let dx = -2.6; dx <= 2.6 + 1e-9; dx += 0.05) {
    for (let dz = -2.6; dz <= 2.6 + 1e-9; dz += 0.05) {
      const x = p.x + dx;
      const z = p.z + dz;
      if (!isWalkableAt(area, x, z)) continue;
      if (Math.abs(area.ground.y(x, z) - y) > 1e-9) continue;
      out.push({ x, z });
    }
  }
  return out;
}

// The real player on houseMovesArea(), with no traversal runtime: the stick held in a
// world direction, frame by frame.
function playerAt(x, z) {
  const cat = new THREE.Group();
  cat.position.set(x, area.ground.y(x, z), z);
  const player = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
  player.setAvatar(cat, 3.5);
  player.setGround(area.ground);
  player.setReducedMotion(true);
  player.setViewYaw(0);
  player.enable();
  const stick = { x: 0, z: 0 };
  return {
    cat,
    hold(wx, wz) {
      stickToWorld(wx, wz, -player.viewYaw(), stick);
      player.setTouchMove({ x: stick.x, z: stick.z, mag: Math.hypot(wx, wz) });
    },
    frame(dt = 1 / 60) { player.update(dt, area.colliders, area.bounds, []); },
  };
}

describe('the moves', () => {
  it('every move is valid', () => {
    expect(validateTraversal(HOUSE_MOVES, { ground: area.ground, bounds: area.bounds, colliders: area.colliders })).toEqual([]);
  });

  it('every move is hers on her first walk: no Long Leap, no Spring Paws, short drops', () => {
    expect(area.traversal.hops.length).toBeGreaterThan(0);
    for (const h of area.traversal.hops) {
      expect(h.requires, h.id).toBe(null);
      if (h.kind === 'climb') expect(h.dy, h.id).toBeLessThanOrEqual(1.5);
      if (h.kind === 'drop') expect(-h.dy, h.id).toBeLessThanOrEqual(1.5);
      if (h.kind === 'leap') {
        expect(h.dist, h.id).toBeGreaterThanOrEqual(1.5);
        expect(h.dist, h.id).toBeLessThanOrEqual(3.0);
        expect(Math.abs(h.dy), h.id).toBeLessThanOrEqual(0.6);
      }
    }
    expect(area.traversal.crossings.map((c) => c.kind)).toEqual(['plank']);
    for (const list of [HOUSE_MOVES.gaps, HOUSE_MOVES.climbs, HOUSE_MOVES.drops, HOUSE_MOVES.crossings]) {
      for (const m of list) expect(m.requires ?? null, m.id).toBe(null);
    }
  });

  it('never stuck: every ledge with a move is reached from the spawn, and the spawn from it', () => {
    const f = floodTraversal(area, { abilities: BASE_ABILITIES });
    const home = f.regionAt(area.spawn.x, area.spawn.z);
    const ledges = ledgesWithMoves();
    // the two routes' eight ledges and the two short climbs; the piano's body has no move onto it
    expect(ledges.map((l) => l.id).sort()).toEqual([
      'attic-seat', 'bedroom-chest', 'bedroom-shelf', 'bedroom-wardrobe', 'library-bigbooks', 'library-books-n1',
      'library-books-n2', 'library-books-w', 'library-steps', 'parlour-keys',
    ]);
    for (const l of ledges) {
      const r = f.regionAt(cx(l), cz(l), l.y);
      expect(r, l.id).toBeGreaterThanOrEqual(0);
      expect(f.reachable(home).has(r), l.id).toBe(true);
      expect(f.reachable(r).has(home), l.id).toBe(true);
    }
  });

  it('runs each route in walking order, from the floor back to the floor', () => {
    const f = floodTraversal(area, { abilities: BASE_ABILITIES });
    const home = f.regionAt(area.spawn.x, area.spawn.z);
    const byId = new Map();
    for (const h of area.traversal.hops) byId.set(h.id, { from: f.regionAt(h.x0, h.z0, h.y0), to: f.regionAt(h.x1, h.z1, h.y1) });
    for (const c of area.traversal.crossings) {
      const [a, b] = c.ends.map((e) => f.regionAt(e.x, e.z, e.y));
      byId.set(c.id, { from: a, to: b });
    }
    expect(Object.keys(HOUSE_ROUTES).sort()).toEqual(['attic', 'bedroom', 'library', 'piano']);
    for (const [name, ids] of Object.entries(HOUSE_ROUTES)) {
      let at = home;
      for (const id of ids) {
        const m = byId.get(id);
        expect(m, `${name} ${id}`).toBeTruthy();
        expect(m.from, `${name} ${id}`).toBe(at);
        at = m.to;
      }
      expect(at, name).toBe(home);
    }
    // every move is on some route but the library's three ways back: off n2, off the steps, and the leap back to n1
    const named = new Set(Object.values(HOUSE_ROUTES).flat());
    const all = [...area.traversal.crossings, ...area.traversal.hops].map((m) => m.id);
    expect(all.filter((id) => !named.has(id)).sort()).toEqual(['library-n2-steps', 'library-steps-floor', 'library-w-n1']);
    expect([...named].every((id) => all.includes(id))).toBe(true);
  });

  it('the obvious jump: wherever a route\'s hop lands her, facing as she lands, a jump does its next hop', () => {
    const hops = new Map(area.traversal.hops.map((h) => [h.id, h]));
    const out = { hop: null, look: false };
    const checked = [];
    for (const [name, ids] of Object.entries(HOUSE_ROUTES)) {
      for (let i = 1; i < ids.length; i++) {
        const prev = hops.get(ids[i - 1]);
        const next = hops.get(ids[i]);
        if (!prev || !next) continue; // a crossing: she walks onto it (or off it to the next take-off)
        const fx = (prev.x1 - prev.x0) / prev.dist;
        const fz = (prev.z1 - prev.z0) / prev.dist;
        const got = spotFor(area.traversal, prev.x1, prev.z1, prev.y1, fx, fz, BASE_ABILITIES, out);
        expect(got?.hop.id, `${name}: after ${prev.id}`).toBe(next.id);
        expect(got.look, `${name}: after ${prev.id}`).toBe(false);
        checked.push(prev.id);
      }
    }
    // every hop followed by a hop: the library's three (all but onto and off the plank), the bedroom's
    // five, one each on the seat and the keys
    expect(checked.length).toBe(10);
    // a spot in no room is a mistake in the data, and says so
    expect(() => levelAt(-8, -2)).toThrow(/no room/);
  });
});

describe('the ledges', () => {
  it('makes a ledge of every climbable top, the furniture\'s footprint at its height', () => {
    const ids = HOUSE_FURNITURE.filter((f) => f.ledge).map((f) => f.id).sort();
    expect(ids).toEqual([
      'attic-seat', 'bedroom-chest', 'bedroom-shelf', 'bedroom-wardrobe', 'library-bigbooks', 'library-books-n1', 'library-books-n2',
      'library-books-w', 'library-steps', 'parlour-keys', 'parlour-piano',
    ]);
    expect(HOUSE_LEDGES.map((l) => l.id).sort()).toEqual(ids);
    for (const l of HOUSE_LEDGES) {
      const f = HOUSE_FURNITURE.find((q) => q.id === l.id);
      expect(l.room, l.id).toBe(f.room);
      expect(l.level, l.id).toBe(f.level);
      expect(l.y, l.id).toBeCloseTo(levelY(f.level) + f.h, 9);
      expect(cx(l), l.id).toBeCloseTo(f.x, 9);
      expect(cz(l), l.id).toBeCloseTo(f.z, 9);
      const along = Math.abs(Math.sin(f.rotY)) > 0.5;
      expect(l.maxX - l.minX, l.id).toBeCloseTo(along ? f.d : f.w, 9);
      expect(l.maxZ - l.minZ, l.id).toBeCloseTo(along ? f.w : f.d, 9);
      expect(roomAt(cx(l), cz(l)), l.id).toBe(f.room);
    }
    // the new pieces, at the sizes and heights of ruling D2
    const size = (id) => { const f = HOUSE_FURNITURE.find((q) => q.id === id); return [f.w, f.d, f.h]; };
    expect(size('library-steps')).toEqual([0.6, 0.6, 0.9]);
    expect(size('library-bigbooks')).toEqual([0.7, 0.5, 1.0]);
    expect(size('bedroom-chest')).toEqual([0.8, 0.5, 0.6]);
    expect(size('parlour-keys')).toEqual([1.3, 0.3, 0.75]);
    expect(size('attic-seat').slice(0, 2)).toEqual([1.6, 0.6]);
    expect(size('bedroom-shelf')[0]).toBe(0.9);
    expect(size('bedroom-shelf')[2]).toBe(1.6);
  });

  it('a ledge is one height: no collider stands on it and the floor under it is its room\'s', () => {
    for (const l of HOUSE_LEDGES) {
      expect(area.ground.y(cx(l), cz(l)), l.id).toBeCloseTo(l.y, 9);
      expect(houseFloorGround().y(cx(l), cz(l)), l.id).toBe(levelY(l.level));
      expect(area.colliders.filter((c) => inRect(c, l, -0.05)), l.id).toEqual([]);
    }
    // the ledge rows have no colliders of their own; every other solid piece keeps its own
    const cols = houseColliders();
    for (const f of HOUSE_FURNITURE.filter((q) => q.r > 0)) {
      const own = cols.filter((c) => c.r === f.r && Math.hypot(c.x - f.x, c.z - f.z) <= Math.max(f.w, f.d) / 2 + 1e-6 && c.level === f.level);
      if (f.ledge) expect(own.filter((c) => inRect(c, HOUSE_LEDGES.find((l) => l.id === f.id), -0.05)), f.id).toEqual([]);
      else expect(own.length, f.id).toBeGreaterThanOrEqual(1);
    }
    // nothing but the ledges is raised: a stair, a room's middle read the same with or without them
    for (const s of HOUSE_STAIRS) {
      const x = (s.x0 + s.x1) / 2;
      const z = (s.z0 + s.z1) / 2;
      expect(area.ground.y(x, z), s.id).toBe(floor.y(x, z));
    }
  });

  it('pushing off any ledge\'s edge keeps her on it, and a way down is within 1 m', () => {
    const bad = [];
    for (const l of HOUSE_LEDGES) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const p = playerAt(cx(l), cz(l));
        p.hold(Math.cos(a), Math.sin(a));
        for (let i = 0; i < 60; i++) {
          p.frame();
          const y = area.ground.y(p.cat.position.x, p.cat.position.z);
          if (Math.abs(y - l.y) > 0.01) { bad.push(`${l.id} dir ${k} frame ${i}: ${y}`); break; }
        }
      }
    }
    expect(bad).toEqual([]);
    // from every 0.25 m cell of a ledge with a move, a take-off or a crossing's end on it is a metre away
    const starts = moveEnds().filter((e) => e.start);
    const far = [];
    for (const l of ledgesWithMoves()) {
      const mine = starts.filter((e) => Math.abs(e.y - l.y) <= STEP_MAX && onLedge(l, e.x, e.z, e.y));
      for (let x = l.minX; x <= l.maxX + 1e-9; x += 0.25) {
        for (let z = l.minZ; z <= l.maxZ + 1e-9; z += 0.25) {
          if (!mine.some((e) => Math.hypot(e.x - x, e.z - z) <= 1.0)) far.push(`${l.id} ${x.toFixed(2)},${z.toFixed(2)}`);
        }
      }
      for (const e of [[l.maxX, l.minZ], [l.maxX, l.maxZ], [l.minX, l.maxZ]]) {
        if (!mine.some((s) => Math.hypot(s.x - e[0], s.z - e[1]) <= 1.0)) far.push(`${l.id} corner ${e}`);
      }
    }
    expect(far).toEqual([]);
  }, 60_000);
});

describe('the perches', () => {
  it('every knock-over perch is one jump from the floor', () => {
    expect(HOUSE_PERCHES.map((p) => p.id).sort()).toEqual([
      'bedroom-bed', 'hall-console', 'kitchen-counter-a', 'kitchen-counter-b', 'kitchen-table', 'library-desk', 'parlour-fire',
    ]);
    const tops = { 'kitchen-counter-a': 0.92, 'kitchen-counter-b': 0.92, 'kitchen-table': 0.76, 'parlour-fire': 1.3, 'hall-console': 0.8, 'library-desk': 0.8, 'bedroom-bed': 0.6 };
    for (const p of HOUSE_PERCHES) {
      expect(p.kind, p.id).toBe('furniture');
      expect(p.y, p.id).toBe(tops[p.id]);
      // standing on its own piece, on its room's floor
      const f = HOUSE_FURNITURE.find((q) => q.id === p.id);
      expect(Math.hypot(p.x - f.x, p.z - f.z), p.id).toBeLessThanOrEqual(Math.max(f.w, f.d) / 2);
      expect(area.ground.y(p.x, p.z), p.id).toBe(levelY(f.level));
      expect(floorSpotsNear(p).some((s) => canReach(p, s, 0, BASE_CLIMB_BUDGET)), p.id).toBe(true);
    }
    expect(area.perches).toBe(HOUSE_PERCHES);
  });
});

describe('the drawing', () => {
  const scene = new THREE.Scene();
  const record = build(scene);
  scene.updateMatrixWorld(true);

  it('hands the walk its moves, its perches and the floor without the ledges', () => {
    expect(record.traversal.hops.map((h) => h.id)).toEqual(area.traversal.hops.map((h) => h.id));
    expect(record.traversal.crossings.map((c) => c.id)).toEqual(area.traversal.crossings.map((c) => c.id));
    expect(record.perches.map((p) => p.id)).toEqual(HOUSE_PERCHES.map((p) => p.id));
    for (const l of HOUSE_LEDGES) {
      expect(record.ground.y(cx(l), cz(l)), l.id).toBeCloseTo(l.y, 9);
      expect(record.house.floor.y(cx(l), cz(l)), l.id).toBe(levelY(l.level));
    }
  });

  it('hands the camera the floor without the ledges, the same ground the levels are drawn for', () => {
    expect(record.cameraGround).toBe(record.house.floor);
    for (const l of HOUSE_LEDGES) expect(record.cameraGround.y(cx(l), cz(l)), l.id).toBe(levelY(l.level));
    // and the stairs as the walk's ground has them
    for (const s of HOUSE_STAIRS) {
      const mx = (s.x0 + s.x1) / 2;
      const mz = (s.z0 + s.z1) / 2;
      expect(record.cameraGround.y(mx, mz), s.id).toBeCloseTo(record.ground.y(mx, mz), 9);
    }
  });

  it('marks every take-off faintly, one mesh per level, and lays the plank on its crossing', () => {
    const marks = scene.children.filter((c) => c.userData?.houseMarks);
    const levels = new Set(area.traversal.hops.map((h) => levelAt(h.x0, h.z0)));
    expect(marks.map((m) => m.userData.houseLevel).sort()).toEqual([...levels].sort());
    for (const m of marks) {
      expect(m.isMesh, m.name).toBe(true);
      expect(m.userData.noCast, m.name).toBe(true);
      expect(m.userData.noMerge, m.name).toBe(true);
      expect(m.userData.houseDetail, m.name).toBe(true);
      expect(m.castShadow, m.name).toBe(false);
      m.geometry.computeBoundingBox();
    }
    // a mark lies at every take-off, a hair over the ground she springs from: straight down
    // onto each print's main pad (local (+-PAW_APART, -0.02), turned by the hop's yaw), a hit
    const ray = new THREE.Raycaster();
    const [padX, padZ] = PAW_PADS[0];
    for (const h of area.traversal.hops) {
      const yaw = Math.atan2(h.x1 - h.x0, h.z1 - h.z0);
      for (const side of [-1, 1]) {
        const lx = padX + side * PAW_APART;
        const x = h.x0 + lx * Math.cos(yaw) + padZ * Math.sin(yaw);
        const z = h.z0 - lx * Math.sin(yaw) + padZ * Math.cos(yaw);
        ray.set(new THREE.Vector3(x, h.y0 + 1, z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObjects(marks, false)[0];
        expect(hit, `${h.id} ${side}`).toBeTruthy();
        expect(hit.object.userData.houseLevel, h.id).toBe(levelAt(h.x0, h.z0));
        expect(hit.point.y - h.y0, h.id).toBeGreaterThan(0);
        expect(hit.point.y - h.y0, h.id).toBeLessThan(0.03);
      }
    }
    // the plank: a board along the crossing, its top the rail she walks
    const plank = area.traversal.crossings[0];
    let board = null;
    scene.traverse((o) => { if (o.name === `housePlank:${plank.id}`) board = o; });
    expect(board).toBeTruthy();
    const box = new THREE.Box3().setFromObject(board);
    const [a, b] = plank.ends;
    expect(box.min.x).toBeLessThanOrEqual(Math.min(a.x, b.x) + 1e-6);
    expect(box.max.x).toBeGreaterThanOrEqual(Math.max(a.x, b.x) - 1e-6);
    expect(box.max.y).toBeCloseTo(a.y, 3);
  });

  it('draws every new piece, and the stand-ins keep the ledge pieces', () => {
    for (const id of ['library-steps', 'library-bigbooks', 'bedroom-chest', 'bedroom-shelf', 'attic-seat', 'parlour-keys']) {
      let found = false;
      scene.traverse((o) => { if (o.name === `houseFurniture:${id}`) found = true; });
      expect(found, id).toBe(true);
    }
    for (const l of HOUSE_LEVELS) {
      const m = scene.children.find((c) => c.userData?.houseSimple === l.id);
      const pieces = HOUSE_FURNITURE.filter((f) => f.level === l.id && f.ledge);
      if (!pieces.length) continue;
      m.geometry.computeBoundingBox();
      const top = Math.max(...HOUSE_FURNITURE.filter((f) => f.level === l.id && (f.r > 0 || f.ledge)).map((f) => f.h));
      expect(m.geometry.boundingBox.max.y + m.position.y, l.id).toBeCloseTo(levelY(l.id) + 0.9 * top, 3);
    }
  });

  it('on the wardrobe she is still upstairs; on a bookcase, still on the ground floor', () => {
    const life = record.life({ scene, reducedMotion: true });
    const camera = new THREE.PerspectiveCamera();
    const at = (id) => {
      const l = HOUSE_LEDGES.find((q) => q.id === id);
      return new THREE.Vector3(cx(l), l.y, cz(l) + 0.1);
    };
    const look = (p) => camera.position.set(p.x, p.y + 2.2, p.z + 4.5);
    const wardrobe = at('bedroom-wardrobe');
    look(wardrobe);
    life.settle(wardrobe, camera);
    expect(life.drawing.current).toBe('upstairs');
    for (let i = 0; i < 30; i++) life.update(1 / 60, i / 60, wardrobe, camera);
    expect(life.drawing.current).toBe('upstairs');
    const books = at('library-books-n2');
    look(books);
    life.settle(books, camera);
    expect(life.drawing.current).toBe('ground');
    for (let i = 0; i < 30; i++) life.update(1 / 60, i / 60, books, camera);
    expect(life.drawing.current).toBe('ground');
    // up the main stair, step 1's hysteresis holds: the upper floor must be 0.3 m nearer
    // her than the lower before it switches, so it comes 0.15 m past the stair's middle
    const s = HOUSE_STAIRS.find((q) => q.id === 'main');
    const at1 = (levelY(s.from) + levelY(s.to) + LEVEL_SWITCH) / 2;
    const cat = new THREE.Vector3();
    life.settle(cat.set(s.x0, levelY(s.from), s.z0 + 1), camera);
    expect(life.drawing.current).toBe('ground');
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const x = s.x0 + (s.x1 - s.x0) * t;
      const z = s.z0 + (s.z1 - s.z0) * t;
      cat.set(x, area.ground.y(x, z), z);
      look(cat);
      life.update(1 / 60, t, cat, camera);
      if (cat.y < at1 - 0.02) expect(life.drawing.current, `${cat.y}`).toBe('ground');
      if (cat.y > at1 + 0.02) expect(life.drawing.current, `${cat.y}`).toBe('upstairs');
    }
    life.dispose();
  }, 60_000);
});
