import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// The headless document stub every world test uses (test/flattrace.test.js's):
// createPlayer listens on it, and the build draws on canvases.
vi.stubGlobal('document', canvasStub);

const {
  HOUSE_STAIRS, LEVEL_LINKS, SECRET_BOOKCASE, COLLIDER_R, COLLIDER_STEP, houseArea, houseSections, houseColliders, secretColliders,
} = await import('../src/world/houseplan.js');
const { MAX_PATH_GRADE } = await import('../src/ground.js');
const { isWalkableAt } = await import('../src/player.js');
const { houseFlood } = await import('./helpers/houseflood.js');
const { createHouseWalk } = await import('./helpers/housewalk.js');
const { build } = await import('../src/world/house.js');
const { findFadeOccluders } = await import('../src/treefade.js');

// =============================================================================
// The Old House, step 2, Task 1 (ruling D9): a secret stair from the library up to
// the bedroom, through the courtyard step 1 kept free, behind a shut bookcase.
// =============================================================================

const area = houseArea();

// A stair as its axis-aligned rectangle (the centreline, +- width/2 across it).
function stairRect(s) {
  const hw = s.width / 2;
  return Math.abs(s.z1 - s.z0) >= Math.abs(s.x1 - s.x0)
    ? { minX: s.x0 - hw, maxX: s.x0 + hw, minZ: Math.min(s.z0, s.z1), maxZ: Math.max(s.z0, s.z1) }
    : { minX: Math.min(s.x0, s.x1), maxX: Math.max(s.x0, s.x1), minZ: s.z0 - hw, maxZ: s.z0 + hw };
}
const rectInside = (a, b) => a.minX >= b.minX - 1e-9 && a.maxX <= b.maxX + 1e-9 && a.minZ >= b.minZ - 1e-9 && a.maxZ <= b.maxZ + 1e-9;
// The area's colliders with the bookcase's swapped for its open (or shut) ones.
const swapSecret = (colliders, open) => [...colliders.filter((c) => !c.secret), ...secretColliders(open)];

describe('the secret stair', () => {
  it('climbs from the library to the bedroom through the courtyard, 1 in 3 or less', () => {
    const s = HOUSE_STAIRS.find((q) => q.id === 'secret');
    expect(s).toEqual({ id: 'secret', from: 'ground', to: 'upstairs', x0: -6, z0: 2, x1: -6, z1: -6.4, width: 2.4 });
    expect(HOUSE_STAIRS.indexOf(s)).toBe(3);
    expect(rectInside(stairRect(s), { minX: -14, maxX: -1.5, minZ: -6.4, maxZ: 2 })).toBe(true);
    expect(2.4 / 8.4).toBeLessThanOrEqual(MAX_PATH_GRADE);
    expect(area.ground.y(-6, -2.2)).toBeCloseTo(1.2, 6);
    expect(LEVEL_LINKS).toHaveLength(4);
    expect(LEVEL_LINKS[3]).toEqual(['ground', 'upstairs']);
  });

  it('opens the library\'s north wall and the bedroom\'s south wall for it, and no other wall', () => {
    const now = houseSections();
    const before = houseSections(HOUSE_STAIRS.filter((q) => q.id !== 'secret'));
    expect(before.some((q) => q.owner === 'secret')).toBe(false);
    const opened = (q) => (q.owner === 'library' && q.side === 'n') || (q.owner === 'bedroom' && q.side === 's');
    // the two walls it passes through stand either side of it, never across it
    const through = now.filter(opened);
    expect(through.length).toBeGreaterThan(0);
    for (const q of through) {
      const lo = Math.min(q.x0, q.x1);
      const hi = Math.max(q.x0, q.x1);
      expect(hi <= -7.2 + 1e-9 || lo >= -4.8 - 1e-9, q.id).toBe(true);
    }
    // with the gap, each still runs its whole edge
    const run = (list) => list.reduce((a, q) => a + Math.abs(q.x1 - q.x0), 0);
    expect(run(now.filter((q) => q.owner === 'library' && q.side === 'n'))).toBeCloseTo(10 - 2.4, 6);
    expect(run(now.filter((q) => q.owner === 'bedroom' && q.side === 's'))).toBeCloseTo(10 - 3.0 - 2.4, 6);
    // every other section is the step-1 one: same id, same extent, same everything
    const keep = (list) => list.filter((q) => !opened(q) && q.owner !== 'secret');
    expect(keep(now)).toEqual(keep(before));
    // the stair's own walls: down both its sides, on the ground level, as tall as the climb and a wall
    const own = now.filter((q) => q.owner === 'secret');
    expect(own.map((q) => q.id).sort()).toEqual(['secret-e-0', 'secret-e-1', 'secret-e-2', 'secret-w-0', 'secret-w-1', 'secret-w-2']);
    for (const q of own) {
      expect(q.kind).toBe('stair');
      expect(q.level).toBe('ground');
      expect(Math.abs(q.x0 - (q.side === 'w' ? -7.2 : -4.8))).toBeLessThan(1e-9);
    }
  });

  it('shut, the bookcase closes the library side; open, she walks through and up', () => {
    expect(SECRET_BOOKCASE).toEqual({ x: -6, z: 2, w: 2.4, d: 0.42, h: 2.25, hinge: { x: -7.2, z: 2 }, openS: 1.2, reach: 1.1, holdS: 0.6 });
    expect(Object.isFrozen(SECRET_BOOKCASE) && Object.isFrozen(SECRET_BOOKCASE.hinge)).toBe(true);
    for (const x of [-7, -6.5, -6, -5.5, -5]) expect(isWalkableAt(area, x, 2), `${x}`).toBe(false);
    const open = { ...area, colliders: swapSecret(area.colliders, true) };
    for (const x of [-6.5, -6, -5.5]) expect(isWalkableAt(open, x, 2), `open ${x}`).toBe(true);
    expect(houseFlood(open, { x: -6, z: 4 }).reachesWithin(-6, -2.2, 0.5)).toBe(true);
    expect(houseFlood(area, { x: -6, z: 4 }).reachesWithin(-6, -2.2, 0.5)).toBe(true); // round by the hall and the bedroom
  });

  it('its colliders: a row down the leaf, shut across the opening, open along z into the library', () => {
    const shut = secretColliders(false);
    const open = secretColliders(true);
    for (const list of [shut, open]) {
      expect(list.length).toBe(Math.ceil(SECRET_BOOKCASE.w / COLLIDER_STEP - 1e-9) + 1);
      for (const c of list) {
        expect(c).toEqual({ x: c.x, z: c.z, r: COLLIDER_R, level: 'ground', secret: true });
      }
      for (let i = 1; i < list.length; i++) expect(Math.hypot(list[i].x - list[i - 1].x, list[i].z - list[i - 1].z)).toBeLessThanOrEqual(COLLIDER_STEP + 1e-9);
    }
    for (const c of shut) {
      expect(c.z).toBeCloseTo(2, 9);
      expect(c.x).toBeGreaterThanOrEqual(-7.2 - 1e-9);
      expect(c.x).toBeLessThanOrEqual(-4.8 + 1e-9);
    }
    expect(Math.min(...shut.map((c) => c.x))).toBeCloseTo(-7.2, 9);
    expect(Math.max(...shut.map((c) => c.x))).toBeCloseTo(-4.8, 9);
    for (const c of open) {
      expect(c.x).toBeCloseTo(-7.2, 9);
      expect(c.z).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(c.z).toBeLessThanOrEqual(4.4 + 1e-9);
    }
    expect(Math.max(...open.map((c) => c.z))).toBeCloseTo(4.4, 9);
    // the plan's colliders carry the shut ones, and the walk can swap them
    expect(houseColliders().filter((c) => c.secret)).toEqual(shut);
    const walk = createHouseWalk({ secretOpen: true });
    expect(walk.area.colliders.filter((c) => c.secret)).toEqual(open);
    expect(walk.area.colliders.length).toBe(area.colliders.length);
    expect(createHouseWalk().area.colliders.filter((c) => c.secret)).toEqual(shut);
  });

  it('from the stair\'s foot she is never shut in: the bedroom is always a way out', () => {
    expect(houseFlood(area, { x: -6, z: 1.2 }).reachesWithin(-3, -10, 1)).toBe(true);
  });
});

describe('the bookcase drawn', () => {
  it('draws the bookcase shut in the opening: a tall piece on the ground level that fades', () => {
    const scene = new THREE.Scene();
    const data = build(scene);
    const found = [];
    scene.traverse((o) => { if (o.userData.secretBookcase) found.push(o); });
    expect(found.length).toBe(1);
    const g = found[0];
    expect(g.parent).toBe(scene);
    // it fades as a tall piece does: its fade shape round the leaf's middle, so it holds
    // the leaf and no more (one round the hinge would fade it from the stair behind)
    const leaf = g.userData.leaf;
    expect(leaf.parent).toBe(g);
    expect(leaf.userData.fadeOccluder).toEqual([{ t: 'cyl', r: Math.hypot(2.4, 0.42) / 2, y0: 0, y1: 2.25 }]);
    const occ = findFadeOccluders(scene).filter((e) => e.obj === g || e.obj.parent === g);
    expect(occ.length).toBe(1);
    expect(occ[0].x).toBeCloseTo(-6, 6);
    expect(occ[0].z).toBeCloseTo(2, 6);
    expect(g.userData.noContactShadow).toBe(true);
    expect(g.userData.houseDetail).toBe(true);
    expect(g.userData.houseLevel).toBe('ground');
    // its pivot is the hinge
    expect(g.position.x).toBeCloseTo(SECRET_BOOKCASE.hinge.x, 9);
    expect(g.position.z).toBeCloseTo(SECRET_BOOKCASE.hinge.z, 9);
    const box = new THREE.Box3().setFromObject(g);
    expect(Math.abs(box.min.x - -7.2)).toBeLessThanOrEqual(0.25);
    expect(Math.abs(box.max.x - -4.8)).toBeLessThanOrEqual(0.25);
    expect(box.min.z).toBeGreaterThanOrEqual(2 - 0.25);
    expect(box.max.z).toBeLessThanOrEqual(2 + 0.25);
    expect(box.max.y).toBeGreaterThan(2);
    // the walk's record hands it over with both collider rows
    expect(data.house.secret.group).toBe(g);
    expect(data.house.secret.shut).toEqual(secretColliders(false));
    expect(data.house.secret.open).toEqual(secretColliders(true));
    expect(data.colliders.filter((c) => c.secret)).toEqual(secretColliders(false));
  }, 60_000);
});
