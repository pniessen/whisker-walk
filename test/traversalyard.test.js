import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Headless document stub (test/flattrace.test.js's): createPlayer, in the tours below, listens on it.
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

const Y = await import('../src/world/traversalyard.js');
const { validateGround } = await import('../src/ground.js');
const { validateTraversal, BASE_ABILITIES, GAP_MAX, DROP_MAX } = await import('../src/traversal.js');
const { floodTraversal } = await import('./helpers/traversalflood.js');
const { yardWalk } = await import('./helpers/traversalwalk.js');
const area = Y.yardArea();

describe('the test yard', () => {
  it('the yard’s ground and moves pass their rules', () => {
    expect(validateGround(Y.YARD_GROUND)).toEqual([]);
    expect(validateTraversal(Y.YARD_TRAVERSAL, { ground: area.ground, bounds: area.bounds })).toEqual([]);
  });
  it('has what step 1 promised: planks, a ridge, a washing line, three gaps, two raised levels joined by drops in steps', () => {
    const kinds = area.traversal.crossings.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'plank').length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain('ridge');
    expect(kinds).toContain('line');
    const gaps = area.traversal.hops.filter((h) => h.kind === 'leap');
    expect(gaps).toHaveLength(3);
    expect(gaps.filter((g) => g.dist > GAP_MAX)).toHaveLength(1);
    const drops = area.traversal.hops.filter((h) => h.kind === 'drop');
    expect(drops.every((d) => -d.dy <= DROP_MAX)).toBe(true);
    expect(drops.map((d) => d.id)).toEqual(expect.arrayContaining(['drop-1', 'drop-4']));
  });

  const all = floodTraversal(area, { abilities: { ...BASE_ABILITIES, longLeap: true } });
  const base = floodTraversal(area);
  const yard = base.regionAt(Y.YARD_SPAWN.x, Y.YARD_SPAWN.z);

  it('is never stuck: from every place she can get to, there is a way back to the yard without Long Leap', () => {
    const visitable = all.reachable(all.regionAt(Y.YARD_SPAWN.x, Y.YARD_SPAWN.z));
    const stuck = [...visitable].filter((r) => !base.reachable(r).has(yard)).map((r) => base.levelOf(r));
    expect(stuck).toEqual([]);
  });
  it('every roof but lowS can be reached without Long Leap; lowS only with it', () => {
    const got = base.reachable(yard);
    const places = { west: [-12, -10], east: [3, -10], east2: [3, 0], lowE: [14, 0], chimney: [13.4, -11], tank: [-14, -3.5], shed: [-12, 2] };
    for (const [name, [x, z]] of Object.entries(places)) expect([name, got.has(base.regionAt(x, z))]).toEqual([name, true]);
    const lowS = base.regionAt(14, 10);
    expect(got.has(lowS)).toBe(false);
    expect(all.reachable(all.regionAt(Y.YARD_SPAWN.x, Y.YARD_SPAWN.z)).has(lowS)).toBe(true);
  });
  it('a plank over the yard leaves the yard walkable under it', () => {
    expect(area.ground.y(-5, -13)).toBe(0);
    expect(area.ground.canStep(-5, -14, -5, -12)).toBe(true);
  });
});

describe('the yard drawn, and its two tours', () => {
  it.each(['climbs', 'leaps'])('the %s tour runs to its end on the real player and runtime', (name) => {
    const tour = Y.YARD_TOURS[name];
    let abilities = BASE_ABILITIES;
    const w = yardWalk({ at: [tour.start.x, tour.start.z], face: tour.start.face, abilities: () => abilities });
    const pilot = Y.createYardPilot(tour, { setAbilities: (a) => { abilities = { ...BASE_ABILITIES, ...a }; } });
    let r; let frames = 0;
    do { r = pilot.step(1 / 30, w); w.frame(1 / 30); frames++; } while (!r.done && frames < 30 * 90);
    expect(r.failed ?? null).toBeNull();
    const kinds = w.events.map((e) => `${e.type}:${e.id ?? e.kind}`);
    if (name === 'climbs') expect(kinds).toEqual(expect.arrayContaining(['climb:climb-1', 'climb:climb-2', 'climb:climb-3', 'cross:plank-1', 'cross:line-1', 'drop:drop-1', 'drop:drop-4']));
    else expect(kinds).toEqual(expect.arrayContaining(['cross:ridge-1', 'leap:gap-1', 'leap:gap-2', 'look:gap-3', 'leap:gap-3', 'drop:drop-3']));
    expect(w.area.ground.y(w.cat.position.x, w.cat.position.z)).toBe(0); // back in the yard
    expect(frames / 30).toBeLessThan(60);
  });

  const runTour = (name) => {
    const tour = Y.YARD_TOURS[name];
    let abilities = BASE_ABILITIES;
    const w = yardWalk({ at: [tour.start.x, tour.start.z], face: tour.start.face, abilities: () => abilities });
    const pilot = Y.createYardPilot(tour, { setAbilities: (a) => { abilities = { ...BASE_ABILITIES, ...a }; } });
    let r; let frames = 0;
    do { r = pilot.step(1 / 30, w); w.frame(1 / 30); frames++; } while (!r.done && frames < 30 * 90);
    return w;
  };
  it('a tour ends where its last walk and hop say, and runs the same twice', () => {
    const ends = { climbs: [-6.6, 2], leaps: [14, 15.4] };
    for (const [name, [ex, ez]] of Object.entries(ends)) {
      const w = runTour(name);
      expect([name, Math.hypot(w.cat.position.x - ex, w.cat.position.z - ez) < 0.5]).toEqual([name, true]);
      expect(runTour(name).trace).toEqual(w.trace);
    }
  });

  it('the pilot gives up on a step that takes longer than 20 s, naming it', () => {
    const tour = { start: { x: 0, z: 14, face: [0, -1] }, steps: [{ say: 'Nowhere to hop' }, { jump: true }] };
    const w = yardWalk({ at: [0, 14], face: [0, -1] });
    const pilot = Y.createYardPilot(tour, { setAbilities() {} });
    let r; let frames = 0;
    do { r = pilot.step(1 / 30, w); w.frame(1 / 30); frames++; } while (!r.done && frames < 30 * 30);
    expect(r.done).toBe(true);
    expect(r.failed).toBe(1);
    expect(r.caption).toBe('Nowhere to hop');
    expect(frames / 30).toBeGreaterThan(19.9);
    expect(frames / 30).toBeLessThan(21);
  });

  it('draws each roof with its top at its ground height, and a mark for each spot', () => {
    const scene = new THREE.Scene();
    const built = Y.buildTraversalYard(scene);
    expect(built.traversal.hops.length).toBe(area.traversal.hops.length);
    expect(built.ground.y(-12, 2)).toBe(area.ground.y(-12, 2));
    scene.updateMatrixWorld(true);
    for (const m of built.meshes) expect(scene.getObjectById(m.id)).toBe(m);
    const byName = (n) => built.meshes.filter((m) => m.name === n);
    const box = (m) => new THREE.Box3().setFromObject(m);
    Y.YARD_GROUND.strips.forEach((s, i) => {
      if (s.y1 !== undefined) return; // the fire escape, a slope
      const [m] = byName(`roof:${i}`);
      const b = box(m);
      expect(b.min.y).toBeCloseTo(0, 6);
      expect(b.max.y).toBeCloseTo(s.y0, 6);
      const cx = (b.min.x + b.max.x) / 2;
      const cz = (b.min.z + b.max.z) / 2;
      expect(built.ground.y(cx, cz)).toBeCloseTo(b.max.y, 6);
      expect(b.min.x).toBeCloseTo(s.x0, 6);
      expect(b.max.x).toBeCloseTo(s.x1, 6);
      expect(b.max.z - b.min.z).toBeCloseTo(s.width, 6);
    });
    Y.YARD_GROUND.discs.forEach((d, i) => {
      const b = box(byName(`disc:${i}`)[0]);
      expect(b.min.y).toBeCloseTo(0, 6);
      expect(b.max.y).toBeCloseTo(d.y, 6);
      expect(built.ground.y(d.x, d.z)).toBe(d.y);
    });
    const marks = built.meshes.filter((m) => m.name.startsWith('mark:'));
    expect(marks).toHaveLength(2 * area.traversal.hops.length);
    for (const m of marks) expect(m.position.y).toBeCloseTo(built.ground.y(m.position.x, m.position.z) + 0.01, 9);
    const colour = { leap: 0xf0a640, drop: 0x6aa0d8, climb: 0x7cc46a };
    for (const h of area.traversal.hops) {
      const [from] = byName(`mark:${h.id}:from`);
      const [to] = byName(`mark:${h.id}:to`);
      expect([h.id, from.position.x, from.position.z, from.material.color.getHex()]).toEqual([h.id, h.x0, h.z0, colour[h.kind]]);
      expect([h.id, to.position.x, to.position.z, to.material.color.getHex()]).toEqual([h.id, h.x1, h.z1, 0xf4ead0]);
    }
    // The pitched house roof: eaves at 1.0, its ridge at 3.5 along z = -11.
    const roof = box(byName('house-roof')[0]);
    expect(roof.min.y).toBeCloseTo(1.0, 6);
    expect(roof.max.y).toBeCloseTo(3.5, 6);
    expect((roof.min.z + roof.max.z) / 2).toBeCloseTo(-11, 6);
    // Shared geometry: far fewer geometries than meshes.
    const geoms = new Set(built.meshes.map((m) => m.geometry));
    expect(geoms.size).toBeLessThan(built.meshes.length / 2);
  });

  it('the yard is a test page: it is not one of the game’s areas', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/world/traversalyard.js', import.meta.url), 'utf8');
    expect(/\blife\s*:/.test(src)).toBe(false);
    expect(/Math\.random|walkRng|Date\.now|performance\.now/.test(src)).toBe(false);
  });
});
