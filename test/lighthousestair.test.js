import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_t, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        if (key === 'measureText') return () => ({ width: 10 });
        return () => {};
      },
      set: () => true,
    }),
  }),
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

const L = await import('../src/world/lighthouseplan.js');
const { validateTraversal, BASE_ABILITIES, countsAsCrossing, behindYaw } = await import('../src/traversal.js');
const { floodTraversal } = await import('./helpers/traversalflood.js');
const { yardWalk } = await import('./helpers/traversalwalk.js');
const { inWater } = await import('../src/world/water.js');
const { STEP_MAX } = await import('../src/ground.js');
const { traversalEventEffects } = await import('../src/traversallive.js');

// Lighthouse Point, milestone 2: the climb on the real plan. The stair, the gallery, the lamp room, the
// railing walk, the leaps and the drops, as data, walked by the real runtime and the real player.

const area = L.lighthouseArea();
const T = area.traversal;
const CAT = 0.35;
const byId = (id) => T.crossings.find((c) => c.id === id) ?? T.hops.find((h) => h.id === id);
const wet = (x, z) => inWater(area.waters, x, z);

describe('the moves as data', () => {
  it('validateTraversal passes on the real ground, colliders and waters', () => {
    expect(validateTraversal(L.LIGHTHOUSE_TRAVERSAL, { ground: area.ground, bounds: area.bounds, colliders: area.colliders, wet })).toEqual([]);
  });

  it('the stair is three flights and the railing walk; two base leaps, two Long Leaps, two drops, no climbs', () => {
    expect(T.crossings.map((c) => [c.id, c.kind])).toEqual([['stair-1', 'stair'], ['stair-2', 'stair'], ['stair-3', 'stair'], ['rail-walk', 'pipe']]);
    expect(T.hops.map((h) => [h.id, h.kind, h.requires])).toEqual([
      ['leap-pinnacle-out', 'leap', null], ['leap-pinnacle-back', 'leap', null],
      ['long-gull-out', 'leap', 'long-leap'], ['long-gull-back', 'leap', 'long-leap'],
      ['drop-landing-1', 'drop', null], ['drop-gallery', 'drop', null],
    ]);
  });

  it('the stair\'s flights join the ground at both ends and at each landing', () => {
    const [f1, f2, f3] = T.crossings;
    expect(f1.ends[0].y).toBe(6);
    expect(area.ground.y(f1.ends[0].x, f1.ends[0].z)).toBe(6); // the foot, on the plateau
    for (const [a, b, y] of [[f1, f2, 8.5], [f2, f3, 11]]) {
      expect(a.ends[1]).toMatchObject({ x: b.ends[0].x, z: b.ends[0].z, y });
      expect(Math.abs(area.ground.y(a.ends[1].x, a.ends[1].z) - y)).toBeLessThanOrEqual(STEP_MAX); // a stone ledge
    }
    expect(f3.ends[1].y).toBe(13.5);
    expect(area.ground.y(f3.ends[1].x, f3.ends[1].z)).toBe(13.5); // the top ledge, the gallery's level
    for (const c of [f1, f2, f3]) expect(c.length).toBeLessThan(12);
    // every flight walks up at a grade she can: 1 in 3.3 at most
    for (const c of [f1, f2, f3]) for (const s of c.segs) expect(Math.abs(s.grade)).toBeLessThanOrEqual(1 / 3);
  });

  it('a stair is not a Tightrope crossing, the railing walk is', () => {
    expect(T.crossings.filter(countsAsCrossing).map((c) => c.id)).toEqual(['rail-walk']);
    const rail = byId('rail-walk');
    expect(rail.length).toBeGreaterThan(8.9);
    expect(rail.length).toBeLessThanOrEqual(12);
  });

  it('a drop from the gallery is at most 3 m and lands on a ledge; the other lands on the plateau', () => {
    const g = byId('drop-gallery');
    expect(g.y0).toBe(13.5);
    expect(g.y1).toBe(11);
    expect(g.y0 - g.y1).toBeLessThanOrEqual(3);
    expect(Math.hypot(g.x1 - L.LANDINGS[2].x, g.z1 - L.LANDINGS[2].z)).toBeLessThan(L.STAIR.ledge);
    const d = byId('drop-landing-1');
    expect([d.y0, d.y1]).toEqual([8.5, 6]);
  });

  it('the leaps: a base leap of under 3.5 m, a Long Leap of over 3.5 m and no more than 4.5, each both ways', () => {
    expect(byId('leap-pinnacle-out').dist).toBeLessThanOrEqual(3.5);
    expect(byId('leap-pinnacle-out').dist).toBeGreaterThan(1);
    expect(byId('long-gull-out').dist).toBeGreaterThan(3.5);
    expect(byId('long-gull-out').dist).toBeLessThanOrEqual(4.5);
    expect(byId('leap-pinnacle-back').dist).toBe(byId('leap-pinnacle-out').dist);
    expect(byId('long-gull-back').dist).toBe(byId('long-gull-out').dist);
  });
});

describe('the gallery and the lamp room', () => {
  // a flood of the gallery's own level, on a 0.25 m grid, through the real colliders and steps
  const STEP = 0.25;
  const seen = new Set();
  const key = (i, j) => `${i},${j}`;
  const cell = (x, z) => [Math.round(x / STEP), Math.round(z / STEP)];
  {
    const [i0, j0] = cell(L.LANDINGS[3].x, L.LANDINGS[3].z);
    const stack = [[i0, j0]];
    seen.add(key(i0, j0));
    while (stack.length) {
      const [i, j] = stack.pop();
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = i + di;
        const q = j + dj;
        const x = p * STEP;
        const z = q * STEP;
        if (seen.has(key(p, q))) continue;
        if (!area.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + CAT)) continue;
        if (!area.ground.canStep(i * STEP, j * STEP, x, z)) continue;
        if (area.ground.y(x, z) !== 13.5) continue;
        seen.add(key(p, q));
        stack.push([p, q]);
      }
    }
  }
  const reached = (x, z, tol = 0.2) => {
    const [ci, cj] = cell(x, z);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) if (seen.has(key(i, j)) && Math.hypot(i * STEP - x, j * STEP - z) <= tol + STEP) return true;
    return false;
  };
  const on = (deg, r) => [L.TOWER.x + r * Math.cos((deg * Math.PI) / 180), L.TOWER.z + r * Math.sin((deg * Math.PI) / 180)];

  it('the gallery is walkable all round', () => {
    for (let a = 0; a < 360; a += 10) expect(reached(...on(a, 3.8)), `${a} deg`).toBe(true);
  });

  it('the lamp room is entered by its door, and walked round the lens to the lever', () => {
    const door = L.LAMP_ROOM.door;
    for (const r of [3.8, 3.0, 2.3, 1.6]) expect(reached(...on(door, r)), `door r${r}`).toBe(true);
    for (let a = 0; a < 360; a += 20) expect(reached(...on(a, 1.35)), `${a} deg inside`).toBe(true);
    expect(reached(L.LEVER.x, L.LEVER.z)).toBe(true);
    // the lens (a collider) and the wall are not walked through: the middle and the wall away from the door are not
    expect(reached(L.TOWER.x, L.TOWER.z)).toBe(false);
    expect(reached(...on(door + 180, 2.3))).toBe(false);
    expect(reached(...on(door + 90, 2.3))).toBe(false);
  });

  it('the lever is 1.3 m or less from a spot she can stand', () => {
    const lever = area.tippables.find((t) => t.kind === 'lever');
    expect(lever).toMatchObject({ x: L.LEVER.x, z: L.LEVER.z });
    expect(area.tippables.filter((t) => t.kind === 'lever')).toHaveLength(1);
    let best = Infinity;
    for (const k of seen) {
      const [i, j] = k.split(',').map(Number);
      const x = i * STEP;
      const z = j * STEP;
      if (area.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + CAT)) best = Math.min(best, Math.hypot(x - lever.x, z - lever.z));
    }
    expect(best).toBeLessThan(0.6);
  });

  it('the lamp room has a roof 3.2 m over its floor, and nothing else on the gallery does', () => {
    expect(area.ground.ceil(L.TOWER.x, L.TOWER.z)).toBe(16.7);
    expect(area.ground.ceil(...on(L.LAMP_ROOM.door, 3.8))).toBe(Infinity);
    expect(area.ground.ceil(...on(L.LAMP_ROOM.door + 180, 3.8))).toBe(Infinity);
  });

  it('the lamp room\'s wall is a ring of colliders with the door open and every other gap shut', () => {
    // no gap in the wall wide enough for her except the door's (a cat of 0.35 needs 0.7 between collider surfaces)
    const ring = L.LAMP_ROOM_WALL;
    const gaps = ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length];
      return Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
    });
    expect(gaps.filter((g) => g > 2 * CAT)).toHaveLength(1);
    expect(Math.max(...gaps)).toBeGreaterThan(1.3);
    // and no collider stands on the plateau side of the gallery's rim (nothing that is not on the gallery)
    for (const k of area.colliders.filter((c) => Math.hypot(c.x - L.TOWER.x, c.z - L.TOWER.z) < 4.6)) expect(area.ground.y(k.x, k.z)).toBe(13.5);
  });
});

describe('never stuck', () => {
  const flood = floodTraversal(area);
  const home = flood.regionAt(area.spawn.x, area.spawn.z);
  const reach = flood.reachable(home);
  const spots = [
    ...area.scenics.filter((s) => s.id !== 'lighthouse-gullrock'), ...area.collectibles, ...area.tippables, ...area.boxes, ...area.pois,
    ...area.perches.filter((p) => !p.requires),
  ];

  it('every scenic, collectible, tippable (the lever too), box and poi is reached from the spawn without Long Leap or Spring Paws', () => {
    for (const s of spots) {
      const r = flood.regionAt(s.x, s.z);
      expect(r, `${s.id ?? `${s.x},${s.z}`}`).toBeGreaterThanOrEqual(0);
      expect(reach.has(r), `${s.id ?? s.kind ?? 'spot'} at ${s.x}, ${s.z}`).toBe(true);
    }
  });

  it('from everywhere she can be taken to, there is a way back to the spawn', () => {
    for (const r of reach) expect(flood.reachable(r).has(home), `region ${r} (level ${flood.levelOf(r)})`).toBe(true);
    // in particular from the lamp room, every landing, the gallery and the Pinnacle
    for (const [x, z, y] of [[L.LEVER.x, L.LEVER.z, 13.5], ...L.LANDINGS.map((p) => [p.x, p.z, p.y]), [-43.4, L.PINNACLE.z, 6]]) {
      const r = flood.regionAt(x, z, y);
      expect(reach.has(r), `${x}, ${z}`).toBe(true);
      expect(flood.reachable(r).has(home), `${x}, ${z}`).toBe(true);
    }
  });

  it('the gallery is reached by the stair and the stair alone: without its flights it is a different region', () => {
    const top = flood.regionAt(L.LANDINGS[3].x, L.LANDINGS[3].z, 13.5);
    expect(flood.levelOf(top)).toBe(13.5);
    expect(reach.has(top)).toBe(true);
    expect(flood.regionAt(L.LANDINGS[0].x, L.LANDINGS[0].z, 6)).not.toBe(top);
  });

  it('Gull Rock is reached with Long Leap only, and from there she can come back', () => {
    const gull = flood.regionAt(L.GULL_ROCK.x + 1.5, L.GULL_ROCK.z, 6);
    expect(gull).toBeGreaterThanOrEqual(0);
    expect(reach.has(gull)).toBe(false);
    const long = floodTraversal(area, { abilities: { ...BASE_ABILITIES, longLeap: true } });
    const h2 = long.regionAt(area.spawn.x, area.spawn.z);
    const g2 = long.regionAt(L.GULL_ROCK.x + 1.5, L.GULL_ROCK.z, 6);
    expect(long.reachable(h2).has(g2)).toBe(true);
    expect(long.reachable(g2).has(h2)).toBe(true);
    // the Pinnacle needs none
    expect(reach.has(flood.regionAt(L.PINNACLE.x - 0.5, L.PINNACLE.z, 6))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The real player and the real runtime on the real plan.
// ---------------------------------------------------------------------------
describe('the real player climbs the real stair', () => {
  const foot = L.LANDINGS[0];
  const [f1] = T.crossings;
  const tangent = { x: f1.ends[0].inX, z: f1.ends[0].inZ };
  const atFoot = () => yardWalk({ area, at: [foot.x, foot.z], face: [tangent.x, tangent.z], viewYaw: behindYaw(tangent.x, tangent.z), colliders: area.colliders });
  const up = (w) => w.player.setTouchMove({ x: 0, z: -1, mag: 1 });

  it('one held push climbs three flights in about 25 s and she stands on the gallery, with no cross tallied', () => {
    const w = atFoot();
    up(w);
    let t = 0;
    for (; t < 40 * 60 && !(w.events.filter((e) => e.type === 'mount').length === 3 && !w.live.busy); t++) w.frame();
    expect(w.events.filter((e) => e.type === 'mount')).toHaveLength(3);
    expect(t / 60).toBeLessThan(25);
    w.run(0.2);
    expect(w.cat.position.y).toBeCloseTo(13.5, 6);
    expect(Math.hypot(w.cat.position.x - L.LANDINGS[3].x, w.cat.position.z - L.LANDINGS[3].z)).toBeLessThan(1.2);
    const tally = vi.fn();
    for (const e of w.events) traversalEventEffects(e, { tally });
    expect(tally).not.toHaveBeenCalled();
    w.live.dispose();
  }, 60000);

  it('from the top ledge she walks to the door, in, and round the lens to the lever, on the gallery level', () => {
    const top = L.LANDINGS[3];
    const w = yardWalk({ area, at: [top.x, top.z], face: [L.TOWER.x - top.x, L.TOWER.z - top.z], colliders: area.colliders });
    const lever = { x: L.LEVER.x, z: L.LEVER.z };
    // walk at the door's middle, then at the lever, each as a held world direction
    const toward = (p) => { w.push(p.x - w.cat.position.x, p.z - w.cat.position.z); };
    const door = { x: L.TOWER.x + 1.5 * Math.cos((L.LAMP_ROOM.door * Math.PI) / 180), z: L.TOWER.z + 1.5 * Math.sin((L.LAMP_ROOM.door * Math.PI) / 180) };
    const viaRing = { x: L.TOWER.x + 1.3 * Math.cos(((L.LAMP_ROOM.door + 90) * Math.PI) / 180), z: L.TOWER.z + 1.3 * Math.sin(((L.LAMP_ROOM.door + 90) * Math.PI) / 180) };
    for (const p of [door, viaRing, lever]) {
      for (let i = 0; i < 60 * 6 && Math.hypot(p.x - w.cat.position.x, p.z - w.cat.position.z) > 0.35; i++) { toward(p); w.frame(); }
    }
    w.release();
    expect(Math.hypot(lever.x - w.cat.position.x, lever.z - w.cat.position.z)).toBeLessThan(1.3);
    expect(w.cat.position.y).toBeCloseTo(13.5, 6);
    expect(Math.hypot(w.cat.position.x - L.TOWER.x, w.cat.position.z - L.TOWER.z)).toBeLessThan(2.0);
    w.live.dispose();
  }, 60000);

  it('the railing walk is a balance walk of 9 m and counts as a crossing', () => {
    const rail = byId('rail-walk');
    const e0 = rail.ends[0];
    const w = yardWalk({ area, at: [e0.x, e0.z], face: [e0.inX, e0.inZ], viewYaw: behindYaw(e0.inX, e0.inZ), colliders: area.colliders });
    up(w);
    for (let i = 0; i < 60 * 30 && !w.events.some((e) => e.type === 'cross'); i++) w.frame();
    expect(w.events.filter((e) => e.type === 'mount')).toHaveLength(1);
    expect(w.events.some((e) => e.type === 'cross')).toBe(true);
    const tally = vi.fn();
    for (const e of w.events) traversalEventEffects(e, { tally });
    expect(tally).toHaveBeenCalled();
    w.live.dispose();
  }, 60000);

  it('a hop off the gallery lands on the second ledge', () => {
    const hop = byId('drop-gallery');
    const w = yardWalk({ area, at: [hop.x0, hop.z0], face: [hop.x1 - hop.x0, hop.z1 - hop.z0], colliders: area.colliders });
    w.frame();
    expect(w.jump()).toBeTruthy();
    for (let i = 0; i < 180 && w.live.busy; i++) w.frame();
    expect(w.events.map((e) => e.type)).toEqual(['drop', 'land']);
    expect(w.cat.position.y).toBeCloseTo(11, 6);
    w.live.dispose();
  });

  it('a leap to the Pinnacle (base) lands on its top; the Long Leap to Gull Rock is only looked at without the skill', () => {
    const hop = byId('leap-pinnacle-out');
    const w = yardWalk({ area, at: [hop.x0, hop.z0], face: [hop.x1 - hop.x0, hop.z1 - hop.z0], colliders: area.colliders });
    w.frame();
    expect(w.jump()).toBeTruthy();
    for (let i = 0; i < 240 && w.live.busy; i++) w.frame();
    expect(w.cat.position.x).toBeCloseTo(hop.x1, 6);
    expect(w.cat.position.y).toBeCloseTo(6, 6);
    const g = byId('long-gull-out');
    const v = yardWalk({ area, at: [g.x0, g.z0], face: [g.x1 - g.x0, g.z1 - g.z0], colliders: area.colliders });
    v.frame();
    v.jump();
    for (let i = 0; i < 60 && v.live.busy; i++) v.frame();
    expect(v.cat.position.x).toBeCloseTo(g.x0, 0); // still on the plateau
    w.live.dispose();
    v.live.dispose();
  });
});
