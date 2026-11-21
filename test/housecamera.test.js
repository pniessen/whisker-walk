import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// The headless document stub every world test uses (test/flattrace.test.js):
// createPlayer listens on it, and the build draws on canvases.
vi.stubGlobal('document', canvasStub);

const { createHouseWalk } = await import('./helpers/housewalk.js');
const { houseFlood } = await import('./helpers/houseflood.js');
const { DEFAULT_PITCH, isWalkableAt } = await import('../src/player.js');
const { maxZoomStep } = await import('../src/camzoom.js');
const { SINK, makeView, createWallSink, blockers } = await import('../src/housewalls.js');
const { WALL_T, STUB_H, WALL_H, HOUSE_ROOMS, HOUSE_STAIRS, HOUSE_LEVELS, HOUSE_SPAWN, HOUSE_CELLAR_LID, roomAt, underCellarLid } = await import('../src/world/houseplan.js');
const { HOUSE_SHOTS } = await import('../src/world/housetour.js');
const { behindYaw } = await import('../src/traversal.js');
const { cameraOffset } = await import('../src/catcam.js');
const { build } = await import('../src/world/house.js');

// =============================================================================
// The Old House, Task 6: "If the camera ever shows a wall instead of the cat,
// the house has failed. That holds for any room, any corner and either player."
// The real player's camera (every view step, pitch and yaw) and the walls' sink,
// frame by frame; then the life hook on the built meshes.
// =============================================================================

const ZOOMS = [0, 1, 2, 3];
const levelY = (id) => HOUSE_LEVELS.find((l) => l.id === id).y;

// The flood's cells on a coarser grid (every `step` metres from the spawn).
function gridOf(cells, step) {
  const on = (v, o) => Math.abs((v - o) / step - Math.round((v - o) / step)) < 1e-6;
  return cells.filter((c) => on(c.x, HOUSE_SPAWN.x) && on(c.z, HOUSE_SPAWN.z)).map((c) => [c.x, c.z]);
}

// Spots on every stair: every `step` metres along it, down its middle and as far
// to each side as she can stand (her centre stays 0.55 m off the wall line).
function stairCells(step, area) {
  const out = [];
  for (const s of HOUSE_STAIRS) {
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    const ux = (s.x1 - s.x0) / len;
    const uz = (s.z1 - s.z0) / len;
    const side = s.width / 2 - 0.6;
    for (let d = 0; d <= len + 1e-9; d += step) {
      for (const o of [-side, 0, side]) {
        const x = s.x0 + ux * d - uz * o;
        const z = s.z0 + uz * d + ux * o;
        if (isWalkableAt(area, x, z)) out.push([x, z]);
      }
    }
  }
  return out;
}

// Is the camera inside a section's standing part (its box at its eased height), give or take `pad`?
function cameraInsideStanding(w, pad = 0.1) {
  const c = w.camera.position;
  for (const s of w.area.sections) {
    const h = w.sink.fraction(s.id) * s.height;
    if (!(h > 0)) continue;
    const dx = s.x1 - s.x0;
    const dz = s.z1 - s.z0;
    const len = Math.hypot(dx, dz);
    const u = ((c.x - s.x0) * dx + (c.z - s.z0) * dz) / len;
    const v = (-(c.x - s.x0) * dz + (c.z - s.z0) * dx) / len;
    const half = WALL_T / 2 + pad;
    if (u >= -half && u <= len + half && Math.abs(v) <= half && c.y >= s.base - pad && c.y <= s.base + h + pad) return true;
  }
  return false;
}

// Horizontal distance from a point to a section's centreline (housewalls.js's rule 3 measure).
function distToLine(s, px, pz) {
  const dx = s.x1 - s.x0;
  const dz = s.z1 - s.z0;
  const l2 = dx * dx + dz * dz;
  const t = Math.min(1, Math.max(0, ((px - s.x0) * dx + (pz - s.z0) * dz) / l2));
  return Math.hypot(px - (s.x0 + t * dx), pz - (s.z0 + t * dz));
}

const say = (x, z, rest) => `${x.toFixed(2)},${z.toFixed(2)} ${rest}`;

describe('never lost behind a wall', () => {
  it('never lost behind a wall: every reachable spot, 8 directions, all four view steps', () => {
    const w = createHouseWalk();
    const spots = [...gridOf(houseFlood(w.area).cells, 2.0), ...stairCells(0.5, w.area)];
    expect(spots.length).toBeGreaterThan(200);
    const bad = [];
    for (const [x, z] of spots) for (let k = 0; k < 8; k++) for (const zoom of ZOOMS) {
      w.place(x, z, (k * Math.PI) / 4, zoom);
      const b = w.blockers();
      if (b.length) bad.push(say(x, z, `yaw ${k} zoom ${zoom}: ${b.join(' ')}`));
      if (cameraInsideStanding(w)) bad.push(say(x, z, `yaw ${k} zoom ${zoom}: camera inside a wall`));
    }
    expect(bad).toEqual([]);
  }, 90_000);

  it('never lost in any corner, 16 directions, three pitches', () => {
    const w = createHouseWalk();
    // a 0.25 m flood: a corner spot 0.6 m in lies within 0.36 m of one of its cells
    const flood = houseFlood(w.area, w.area.spawn, 0.25);
    const corners = [];
    for (const r of HOUSE_ROOMS) {
      for (const [x, z] of [[r.minX + 0.6, r.minZ + 0.6], [r.maxX - 0.6, r.minZ + 0.6], [r.maxX - 0.6, r.maxZ - 0.6], [r.minX + 0.6, r.maxZ - 0.6]]) {
        if (isWalkableAt(w.area, x, z) && flood.reachesWithin(x, z, 0.36)) {
          corners.push([r.id, x, z]);
          continue;
        }
        // furniture or a lamp in the way: the nearest spot she can reach, if within 1 m
        let best = null;
        for (const c of flood.cells) {
          const d = Math.hypot(c.x - x, c.z - z);
          if (d <= 1.0 && (!best || d < best.d)) best = { d, x: c.x, z: c.z };
        }
        if (best) corners.push([r.id, best.x, best.z]);
      }
    }
    // 28 corners: 21 stood on, 3 moved to a reached spot within 1 m, 4 the flood never comes near
    expect(corners.length).toBe(24);
    const bad = [];
    for (const [room, x, z] of corners) for (let k = 0; k < 16; k++) for (const zoom of ZOOMS) {
      for (const pitch of [-0.25, DEFAULT_PITCH, 0.85]) {
        w.place(x, z, (k * Math.PI) / 8, zoom, pitch);
        const b = w.blockers();
        if (b.length) bad.push(say(x, z, `${room} yaw ${k} zoom ${zoom} pitch ${pitch}: ${b.join(' ')}`));
        if (cameraInsideStanding(w)) bad.push(say(x, z, `${room} yaw ${k} zoom ${zoom} pitch ${pitch}: camera inside a wall`));
      }
    }
    expect(bad).toEqual([]);
  }, 90_000);

  it('on every stair at every view step: never lost, and the camera eases', () => {
    // the slowest and the fastest cat (walk.js: pace = 2.2 + breed speed * 0.8, speeds 1.2 to 2.8)
    for (const pace of [2.2 + 1.2 * 0.8, 2.2 + 2.8 * 0.8]) {
      const w = createHouseWalk({ reducedMotion: false, pace });
      for (const s of HOUSE_STAIRS) {
        const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
        const ux = (s.x1 - s.x0) / len;
        const uz = (s.z1 - s.z0) / len;
        for (const up of [true, false]) {
          const [sx, sz] = up ? [s.x0 - ux * 0.6, s.z0 - uz * 0.6] : [s.x1 + ux * 0.6, s.z1 + uz * 0.6];
          const [dx, dz] = up ? [ux, uz] : [-ux, -uz];
          const far = levelY(up ? s.to : s.from);
          for (const zoom of ZOOMS) {
            const tag = `${s.id} ${up ? 'up' : 'down'} zoom ${zoom} pace ${pace.toFixed(2)}`;
            w.place(sx, sz, behindYaw(dx, dz), zoom);
            expect(w.blockers(), `${tag} at the start`).toEqual([]);
            w.push(dx, dz);
            const prev = w.camera.position.clone();
            let run = 0;
            let longest = 0;
            let worstDy = 0;
            let worstDxz = 0;
            const n = Math.round(((len + 1.2) / 2.5 + 1) * 60);
            for (let i = 0; i < n; i++) {
              w.frame(1 / 60);
              const c = w.camera.position;
              worstDy = Math.max(worstDy, Math.abs(c.y - prev.y));
              worstDxz = Math.max(worstDxz, Math.hypot(c.x - prev.x, c.z - prev.z));
              prev.copy(c);
              run = w.blockers().length ? run + 1 : 0;
              longest = Math.max(longest, run);
            }
            w.release();
            expect(worstDy, `${tag} camera dy`).toBeLessThanOrEqual(0.06);
            expect(worstDxz, `${tag} camera dxz`).toBeLessThanOrEqual(0.2);
            expect(longest, `${tag} frames lost`).toBeLessThanOrEqual(15);
            expect(Math.abs(w.cat.position.y - far), `${tag} ends at ${w.cat.position.y}`).toBeLessThanOrEqual(0.05);
          }
        }
      }
    }
  }, 90_000);

  it('is a dollhouse zoomed out: the parlour\'s near walls go down, its far wall stands', () => {
    const w = createHouseWalk({ reducedMotion: false });
    const parlour = HOUSE_ROOMS.find((r) => r.id === 'parlour');
    const x = (parlour.minX + parlour.maxX) / 2;
    const z = (parlour.minZ + parlour.maxZ) / 2;
    w.place(x, z, 0, 3);
    w.run(1);
    const cam = w.camera.position;
    const catDist = Math.hypot(cam.x - x, cam.z - z);
    expect(catDist).toBeGreaterThanOrEqual(SINK.cutawayDist);
    const near = w.area.sections.filter((s) => distToLine(s, cam.x, cam.z) < catDist - SINK.frontMargin);
    const ids = near.map((s) => s.id);
    // the parlour's south wall and the near halves of hall-e and parlour-e
    for (const s of w.area.sections.filter((q) => q.owner === 'parlour' && q.side === 's')) expect(ids).toContain(s.id);
    expect(ids.some((id) => id.startsWith('hall-e-'))).toBe(true);
    expect(ids.some((id) => id.startsWith('parlour-e-'))).toBe(true);
    expect(w.area.sections.filter((q) => q.id.startsWith('hall-e-')).every((q) => ids.includes(q.id))).toBe(false);
    expect(w.area.sections.filter((q) => q.id.startsWith('parlour-e-')).every((q) => ids.includes(q.id))).toBe(false);
    for (const s of near) expect(w.sink.fraction(s.id), s.id).toBeCloseTo(s.stub / s.height, 9);
    const northWall = w.area.sections.filter((q) => q.id.startsWith('parlour-n-'));
    expect(northWall.length).toBeGreaterThan(0);
    for (const s of northWall) expect(w.sink.fraction(s.id), s.id).toBe(1);
    expect(w.blockers()).toEqual([]);
  });

  it('low views from a stair under the floor above, or beside a raised room: the stub goes too', () => {
    // On a stair just under the floor it climbs to (or on the ground by the bedroom), with the
    // camera low over that floor, the line to her paws passes under the top of that floor's sunk
    // stubs (by up to 0.18 m, found by a sweep of every 0.25 m cell). Those stubs go on down.
    const w = createHouseWalk();
    const spots = stairCells(0.25, w.area);
    // and the kitchen's corner by the bedroom, every 0.25 m she can stand
    const bedroom = HOUSE_ROOMS.find((r) => r.id === 'bedroom');
    for (let x = 4.25; x <= bedroom.maxX + 3 + 1e-9; x += 0.25) for (let z = -8; z <= bedroom.maxZ + 1.5 + 1e-9; z += 0.25) {
      if (roomAt(x, z) === 'kitchen' && isWalkableAt(w.area, x, z)) spots.push([x, z]);
    }
    expect(spots.length).toBeGreaterThan(250);
    const bad = [];
    for (const [x, z] of spots) for (let k = 0; k < 32; k++) for (const zoom of ZOOMS) {
      for (const pitch of [-0.25, -0.15, -0.05]) {
        w.place(x, z, (k * Math.PI) / 16, zoom, pitch);
        const b = w.blockers();
        if (b.length) bad.push(say(x, z, `yaw ${k}/32 zoom ${zoom} pitch ${pitch}: ${b.join(' ')}`));
      }
    }
    expect(bad).toEqual([]);
  }, 90_000);

  it('a stub that stood in the line stays down while the wall is wanted, and rises only after', () => {
    // a raised floor at 0.5 with its wall at z 0; she is below it at z 1.5, the camera over it
    const wall = { id: 'r', kind: 'wall', x0: -2, z0: 0, x1: 2, z1: 0, base: 0.5, height: 2.8, stub: 0.25 };
    const cat = { x: 0, y: 0, z: 1.5 };
    const low = makeView(cat, { x: 0, y: 1.0, z: -2 }, 0.74); // the line to her paws crosses the stub
    const high = makeView(cat, { x: 0, y: 3.0, z: -2 }, 0.74); // it crosses the wall above the stub
    for (const reducedMotion of [false, true]) {
      const sink = createWallSink([wall], { reducedMotion });
      let prev = 1;
      for (let i = 0; i < 120; i++) {
        sink.update(1 / 60, Math.floor(i / 6) % 2 === 0 ? low : high);
        expect(sink.fraction('r')).toBeLessThanOrEqual(prev + 1e-12);
        prev = sink.fraction('r');
      }
      expect(sink.fraction('r')).toBe(0);
      expect(blockers([wall], sink, low)).toEqual([]);
      // unwanted: waits holdS, then rises to full height
      const away = makeView(cat, { x: 0, y: 3.0, z: 5 }, 0.74);
      for (let i = 0; i < Math.round((SINK.holdS + SINK.upS) * 60 / (1 - 0.25 / 2.8)) + 4; i++) sink.update(1 / 60, away);
      expect(sink.fraction('r')).toBe(1);
      // and on her own floor a wall goes down to its stub, as before
      const own = { ...wall, base: 0 };
      const s2 = createWallSink([own], { reducedMotion });
      for (let i = 0; i < 30; i++) s2.update(1 / 60, makeView({ x: 0, y: 0, z: -0.55 }, { x: 0, y: 0.83, z: 2.4 }, 0.74));
      expect(s2.fraction('r')).toBeCloseTo(0.25 / 2.8, 9);
    }
  });

  it('keeps every view step in the house (the den cap is the den\'s only)', () => {
    expect(maxZoomStep(false)).toBe(3);
  });
});

describe('the life hook', () => {
  it('the life hook sinks the built meshes and hides panes on a sunk wall', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const { sectionMeshes, panes, sections } = area.house;
    expect(typeof area.life).toBe('function');
    const life = area.life({ scene, reducedMotion: true });
    // the camera behind her at the spawn, at the default step
    const cat = new THREE.Vector3(HOUSE_SPAWN.x, 0, HOUSE_SPAWN.z);
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(cat).add(cameraOffset(0, DEFAULT_PITCH, 4.5, 2.2));
    life.update(1 / 60, 0, cat, camera);
    const onLine = sections.filter((s) => s.id.startsWith('hall-s-') && s.kind === 'wall'
      && Math.min(s.x0, s.x1) - WALL_T <= cat.x && Math.max(s.x0, s.x1) + WALL_T >= cat.x);
    expect(onLine.length).toBeGreaterThan(0);
    for (const s of onLine) {
      expect(sectionMeshes.get(s.id).scale.y, s.id).toBeCloseTo(STUB_H / WALL_H, 9);
      expect(sectionMeshes.get(s.id).visible).toBe(true);
    }
    const sunkPanes = onLine.flatMap((s) => panes.get(s.id) ?? []);
    expect(sunkPanes.length).toBeGreaterThan(0);
    for (const p of sunkPanes) expect(p.visible).toBe(false);
    // the far wall of the hall (north, ahead of her) stands
    const hallN = sections.filter((s) => s.id.startsWith('hall-n-'));
    expect(hallN.length).toBeGreaterThan(0);
    for (const s of hallN) expect(sectionMeshes.get(s.id).scale.y, s.id).toBe(1);
    // every pane on a wall at or above paneHide shows
    for (const [id, list] of panes) if (life.sink.fraction(id) >= SINK.paneHide) for (const p of list) expect(p.visible, id).toBe(true);
    expect(life.drawing.current).toBe('ground');

    // a lintel on the line sinks to nothing and is hidden (ruling R11: scale 0 would leave a sheet)
    const lintel = sections.find((s) => s.kind === 'lintel' && s.id.startsWith('hall-e-'));
    const inParlour = new THREE.Vector3(6, 0, 7);
    const high = new THREE.PerspectiveCamera();
    high.position.set(0, 6, 7);
    life.update(1 / 60, 0, inParlour, high);
    expect(life.sink.fraction(lintel.id)).toBe(0);
    expect(sectionMeshes.get(lintel.id).visible).toBe(false);

    // up the stair the level drawing follows her
    for (let i = 0; i < 3; i++) life.update(1 / 60, 0, new THREE.Vector3(0, 2.4, -10), camera);
    expect(life.drawing.current).toBe('upstairs');

    life.dispose();
    for (const [id, m] of sectionMeshes) {
      expect(m.scale.y, id).toBe(1);
      expect(m.visible, id).toBe(true);
    }
    for (const list of panes.values()) for (const p of list) expect(p.visible).toBe(true);
    scene.traverse((o) => {
      if (o.userData.houseDetail || o.userData.houseSimple) expect(o.visible, o.name).toBe(true);
    });
  }, 60_000);

  it('keeps a pane inside its window while the wall sinks and rises', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const { sectionMeshes, panes, sections } = area.house;
    const life = area.life({ scene, reducedMotion: false });
    const cat = new THREE.Vector3(HOUSE_SPAWN.x, 0, HOUSE_SPAWN.z);
    const outside = new THREE.PerspectiveCamera();
    outside.position.copy(cat).add(cameraOffset(0, DEFAULT_PITCH, 4.5, 2.2));
    const inside = new THREE.PerspectiveCamera();
    inside.position.set(HOUSE_SPAWN.x, 2, HOUSE_SPAWN.z - 4);
    const withPane = sections.filter((s) => s.id.startsWith('hall-s-') && panes.has(s.id));
    expect(withPane.length).toBeGreaterThan(0);
    // where each pane sits in its wall, as a fraction of the wall's height (the wall scales about its base)
    const box = new THREE.Box3();
    const rel = (s, p) => {
      box.setFromObject(p);
      const h = sectionMeshes.get(s.id).scale.y * s.height;
      return [(box.min.y - s.base) / h, (box.max.y - s.base) / h];
    };
    const rest = new Map(withPane.map((s) => [s.id, rel(s, panes.get(s.id)[0])]));
    let seen = 0;
    // the walk starts with the camera inside (every hall-s wall settled standing), then
    // down (the camera outside), then up (the camera inside), at the picture page's step
    life.settle(cat, inside);
    for (const s of withPane) expect(life.sink.fraction(s.id), s.id).toBe(1);
    for (const cam of [outside, inside]) {
      for (let k = 0; k < 60; k++) {
        life.update(1 / 30, 0, cat, cam);
        for (const s of withPane) {
          const f = life.sink.fraction(s.id);
          const p = panes.get(s.id)[0];
          if (f > SINK.paneHide && f < 1) {
            seen++;
            const [lo, hi] = rel(s, p);
            expect(lo, s.id).toBeCloseTo(rest.get(s.id)[0], 6);
            expect(hi, s.id).toBeCloseTo(rest.get(s.id)[1], 6);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    life.dispose();
    for (const s of withPane) expect(rel(s, panes.get(s.id)[0])).toEqual(rest.get(s.id));
  }, 60_000);

});

// =============================================================================
// Owner's fix B: the cellar, sunk beside the house, read as a walled pit in the
// garden. A turf lid covers it and its stair from outside, and is out of the way
// whenever she is down there (houseplan.js HOUSE_CELLAR_LID, housewalls.js
// createCellarLid). The helper's blockers() names the lid ('cellarLid') when it
// is shown and in the line, so every sweep above checks it too.
// =============================================================================

const cellar = HOUSE_ROOMS.find((r) => r.id === 'cellar');
const cellarStair = HOUSE_STAIRS.find((q) => q.to === 'cellar');
// Is (x, z) under a lid piece's footprint (its centreline +- half, along its length)?
function underPiece(p, x, z) {
  const len = Math.hypot(p.x1 - p.x0, p.z1 - p.z0);
  const ux = (p.x1 - p.x0) / len;
  const uz = (p.z1 - p.z0) / len;
  const u = (x - p.x0) * ux + (z - p.z0) * uz;
  const v = -(x - p.x0) * uz + (z - p.z0) * ux;
  return u >= -1e-9 && u <= len + 1e-9 && Math.abs(v) <= p.half + 1e-9;
}
// The cellar's inside and its stair's, as a point a ray may land on (below the wall tops).
function insideCellar(pt) {
  if (pt.x > cellar.minX + 0.1 && pt.x < cellar.maxX - 0.1 && pt.z > cellar.minZ + 0.1 && pt.z < cellar.maxZ - 0.1) return pt.y < levelY('cellar') + WALL_H - 0.01;
  const hw = cellarStair.width / 2 - WALL_T / 2;
  if (pt.x > cellarStair.x0 + 0.1 && pt.x < cellarStair.x1 && Math.abs(pt.z - cellarStair.z0) < hw) {
    const d = (pt.x - cellarStair.x0) / (cellarStair.x1 - cellarStair.x0);
    return pt.y < WALL_H + (levelY('cellar') - levelY('ground')) * d - 0.01;
  }
  return false;
}
const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
// From inside the house she may look down the stair through its mouth, the kitchen's doorway
// to it (as anyone may): the line crosses the kitchen's east wall inside that opening, under the lid.
function throughMouth(from, to) {
  const x = cellarStair.x0;
  if ((from.x - x) * (to.x - x) >= 0) return false;
  const f = (x - from.x) / (to.x - from.x);
  const y = from.y + (to.y - from.y) * f;
  const z = from.z + (to.z - from.z) * f;
  return Math.abs(z - cellarStair.z0) < cellarStair.width / 2 && y < HOUSE_CELLAR_LID.pieces[0].y0;
}

describe('the cellar\'s lid', () => {
  it('covers the cellar and its stair from above, and is not ground', () => {
    const w = createHouseWalk();
    for (let x = cellar.minX - 0.1; x <= cellar.maxX + 0.1; x += 0.5) {
      for (let z = cellar.minZ - 0.1; z <= cellar.maxZ + 0.1; z += 0.5) {
        expect(HOUSE_CELLAR_LID.pieces.some((p) => underPiece(p, x, z)), `${x},${z}`).toBe(true);
      }
    }
    for (let x = cellarStair.x0 + WALL_T / 2; x <= cellarStair.x1; x += 0.25) {
      for (const dz of [-1.3, 0, 1.3]) expect(HOUSE_CELLAR_LID.pieces.some((p) => underPiece(p, x, cellarStair.z0 + dz)), `${x}`).toBe(true);
    }
    // the floor under it is the cellar's, and the stair's slope (the lid is no ground)
    expect(w.area.ground.y(25, -5)).toBeCloseTo(levelY('cellar'), 6);
    expect(w.area.ground.y(17, -5)).toBeCloseTo(-0.9, 6);
  });

  it('is on from outside: every spot out of the cellar at every view step, but for a few kitchen views across it', () => {
    const w = createHouseWalk();
    const spots = gridOf(houseFlood(w.area).cells, 1.0).filter(([x, z]) => !underCellarLid(x, z));
    expect(spots.length).toBeGreaterThan(400);
    const off = [];
    let kitchen = 0;
    let kitchenOn = 0;
    for (const [x, z] of spots) for (let k = 0; k < 8; k++) for (const zoom of ZOOMS) {
      w.place(x, z, (k * Math.PI) / 4, zoom);
      const inKitchen = roomAt(x, z) === 'kitchen';
      if (inKitchen) { kitchen++; if (w.lid.shown) kitchenOn++; }
      else if (!w.lid.shown) off.push(say(x, z, `yaw ${k} zoom ${zoom}`));
      // a kitchen view with the lid off is one where it would stand in the line (or a wall under it is down)
      if (inKitchen && !w.lid.shown && !w.lid.wanted) {
        expect(w.area.sections.some((s) => s.owner === 'cellar' && w.sink.isDown(s.id)), say(x, z, `yaw ${k} zoom ${zoom}`)).toBe(true);
      }
    }
    expect(off).toEqual([]);
    expect(kitchenOn / kitchen).toBeGreaterThan(0.85);
  }, 90_000);

  it('is off whenever she is in the cellar or on its stair, at every view step', () => {
    const w = createHouseWalk();
    const spots = [...houseFlood(w.area).cells.map((c) => [c.x, c.z]), ...stairCells(0.5, w.area)].filter(([x, z]) => underCellarLid(x, z));
    expect(spots.length).toBeGreaterThan(300);
    const on = [];
    for (const [x, z] of spots) for (let k = 0; k < 8; k++) for (const zoom of ZOOMS) {
      w.place(x, z, (k * Math.PI) / 4, zoom);
      if (w.lid.shown || !w.lid.wanted) on.push(say(x, z, `yaw ${k} zoom ${zoom}`));
    }
    expect(on).toEqual([]);
  }, 90_000);

  it('down the cellar stair and back up, eased: never in the way, off below, on again once she is back', () => {
    const w = createHouseWalk({ reducedMotion: false });
    for (const zoom of ZOOMS) {
      w.place(10, -5, behindYaw(1, 0), zoom);
      expect(w.lid.shown, `zoom ${zoom} in the kitchen`).toBe(true);
      w.push(1, 0);
      for (let i = 0; i < 6 * 60 && w.cat.position.x < 24; i++) {
        w.frame();
        const b = w.blockers();
        expect(b, `zoom ${zoom} down at ${w.cat.position.x.toFixed(2)}`).toEqual([]);
        if (underCellarLid(w.cat.position.x, w.cat.position.z)) expect(w.lid.shown).toBe(false);
      }
      expect(w.cat.position.x).toBeGreaterThanOrEqual(24);
      w.push(-1, 0);
      for (let i = 0; i < 8 * 60 && w.cat.position.x > 10; i++) {
        w.frame();
        expect(w.blockers(), `zoom ${zoom} up at ${w.cat.position.x.toFixed(2)}`).toEqual([]);
        if (underCellarLid(w.cat.position.x, w.cat.position.z)) expect(w.lid.shown).toBe(false);
      }
      expect(w.cat.position.x).toBeLessThanOrEqual(10);
      w.release();
      w.run(2.5);
      expect(w.lid.shown, `zoom ${zoom} back in the kitchen`).toBe(true);
      for (const s of w.area.sections) if (s.owner === 'cellar') expect(w.sink.fraction(s.id), s.id).toBe(1);
    }
  }, 90_000);

  it('hides the cellar from the shots outside it: every ray to its floor, shelves or stair meets the lid or a wall first', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const life = area.life({ scene, reducedMotion: true });
    const w = createHouseWalk();
    const lidMeshes = area.house.lidMeshes;
    expect(lidMeshes.length).toBe(2);
    // the points to hide: the cellar floor on a 1 m grid, the tops of its furniture, the stair's treads
    const targets = [];
    for (let x = cellar.minX + 0.5; x < cellar.maxX; x += 1) for (let z = cellar.minZ + 0.5; z < cellar.maxZ; z += 1) targets.push(new THREE.Vector3(x, levelY('cellar') + 0.02, z));
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (o.isMesh && o.userData.houseLevel === 'cellar') targets.push(new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()));
    });
    for (let x = cellarStair.x0 + 0.5; x < cellarStair.x1; x += 0.5) targets.push(new THREE.Vector3(x, w.area.ground.y(x, cellarStair.z0) + 0.02, cellarStair.z0));
    const ray = new THREE.Raycaster();
    // the film's shots from outside the cellar, and two more at Farther looking its way
    const names = ['dollhouse', 'dollhouse-far', 'levels', 'hall', 'parlour', 'library', 'bedroom', 'attic', 'stairs-up'];
    const views = {
      ...Object.fromEntries(names.map((n) => [n, HOUSE_SHOTS[n]])),
      'kitchen north, Farther': { at: [11, 1], face: [0, -1], zoom: 3 },
      'parlour north-east, Farther': { at: [13, 10], face: [1, -1], zoom: 3 },
      'kitchen north-east, Far': { at: [8, 0], face: [1, -1], zoom: 2 },
    };
    const seen = [];
    for (const [name, sh] of Object.entries(views)) {
      w.place(sh.at[0], sh.at[1], behindYaw(sh.face[0], sh.face[1]), sh.zoom);
      const cat = w.cat.position.clone();
      life.settle(cat, w.camera);
      life.update(1 / 60, 0, cat, w.camera);
      expect(life.lid.shown, name).toBe(true);
      for (const m of lidMeshes) expect(m.visible, `${name} ${m.name}`).toBe(true);
      const from = w.camera.position;
      for (const t of targets) {
        const dir = t.clone().sub(from);
        const dist = dir.length();
        ray.set(from, dir.normalize());
        ray.far = dist - 0.05;
        const hit = ray.intersectObjects(scene.children, true).find((h) => shown(h.object));
        // nothing on the way: the point itself is in sight
        const p = hit ? hit.point : t;
        if (insideCellar(p) && !throughMouth(from, p)) seen.push(`${name}: ${hit ? hit.object.name : 'in sight'} at ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`);
      }
    }
    expect(seen).toEqual([]);
    life.dispose();
    for (const m of lidMeshes) expect(m.visible).toBe(true);
  }, 90_000);

  it('the life hook: the lid is drawn from the kitchen, gone in the cellar, the cut-away leaves the walls under it standing', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const life = area.life({ scene, reducedMotion: true });
    const w = createHouseWalk();
    const lidMeshes = area.house.lidMeshes;
    const capped = area.house.sections.filter((s) => s.owner === 'cellar');
    expect(capped.length).toBe(15);
    // at Farther in the parlour, looking at the cellar's side: the walls under the lid all stand, and the lid is on
    w.place(14, 9, behindYaw(1, -1), 3);
    life.settle(w.cat.position, w.camera);
    expect(life.lid.shown).toBe(true);
    for (const s of capped) expect(area.house.sectionMeshes.get(s.id).scale.y, s.id).toBe(1);
    // in the cellar: gone, and the walls do as they always did
    w.place(25, -5, behindYaw(0, -1), 2);
    life.settle(w.cat.position, w.camera);
    expect(life.lid.shown).toBe(false);
    for (const m of lidMeshes) expect(m.visible).toBe(false);
    expect(capped.some((s) => area.house.sectionMeshes.get(s.id).scale.y < 1)).toBe(true);
    // back in the kitchen: it waits half a second, and for its walls, then comes back
    w.place(9, -3, behindYaw(0, -1), 1);
    const cat = w.cat.position.clone();
    for (let i = 0; i < 10; i++) life.update(1 / 60, 0, cat, w.camera);
    for (const m of lidMeshes) expect(m.visible).toBe(false);
    for (let i = 0; i < 60; i++) life.update(1 / 60, 0, cat, w.camera);
    for (const m of lidMeshes) expect(m.visible).toBe(true);
    life.dispose();
  });
});
