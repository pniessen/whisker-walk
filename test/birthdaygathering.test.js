import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as THREE from 'three';
import { fakeDocument } from './helpers/walkharness.js';
import { withOffWords } from './helpers/offwords.js';

// The birthday Gathering on the island (world/birthdaygathering.js), over the
// real built Pines: where the cake and the ring go, that the island stays open
// to her and kept for every other cat, and the candles going out once.
vi.stubGlobal('document', fakeDocument());
const { build } = await import('../src/world/pines.js');
const G = await import('../src/world/birthdaygathering.js');
const { speakerFor } = await import('../src/birthday.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { keepOutPoint } = await import('../src/keepout.js');
const { ISLAND_LAND, ISLAND_POIS, ISLAND_SCENICS, ISLAND_PERCHES, MEETING_STONES, BRIDGE_DECK } = await import('../src/world/island.js');
const { pickableClans } = await import('../src/clanhomes.js');
const { phrase } = await import('../src/clanphrases.js');

let area;
let plan;
beforeAll(() => {
  area = build(new THREE.Scene());
  plan = G.planGathering(area, { speaker: speakerFor({ clanPick: { mine: 'river' } }) });
});
const withCake = () => ({ ...area, colliders: [...area.colliders, plan.cake] });

describe('the plan', () => {
  it('puts the very big cake below the Watch Rock, on the island, solid and clear of everything', () => {
    const { cake, rock } = plan;
    expect(rock).toMatchObject({ x: 38, z: 28 });
    const toRock = Math.hypot(cake.x - rock.x, cake.z - rock.z);
    expect(toRock).toBeGreaterThan(2);
    expect(toRock).toBeLessThan(3.6);
    expect(Math.hypot(cake.x - ISLAND_LAND.x, cake.z - ISLAND_LAND.z) + cake.r).toBeLessThan(ISLAND_LAND.r - 2);
    for (const c of area.colliders) {
      expect(Math.hypot(cake.x - c.x, cake.z - c.z) - c.r - cake.r, `${c.x},${c.z}`).toBeGreaterThanOrEqual(0.7 - 1e-9);
    }
    // its size: 1.0-1.4 m across, 0.8-1.0 m to the frosting, the flames above
    const built = G.buildCake();
    const box = new THREE.Box3().setFromObject(built.group);
    expect(box.max.x - box.min.x).toBeGreaterThanOrEqual(1.0);
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(1.4);
    expect(G.CAKE_TOP).toBeGreaterThanOrEqual(0.8);
    expect(G.CAKE_TOP).toBeLessThanOrEqual(1.0);
    expect(G.CAKE.tiers.length).toBeGreaterThanOrEqual(2);
    expect(G.CAKE.candles).toBe(11);
    expect(cake.r).toBeCloseTo(G.CAKE.plate.r, 6);
  });

  it('seats cats of all five clans in a ring facing the rock, with the cake inside it', () => {
    const clans = new Set(plan.cats.map((m) => m.clan));
    expect([...clans].sort()).toEqual([...pickableClans()].sort());
    expect(plan.seats.length).toBe(plan.cats.length);
    expect(plan.seats.length).toBeGreaterThanOrEqual(12);
    expect(plan.cats.some((m) => m.id === plan.speaker.id)).toBe(false);
    const cakeD = Math.hypot(plan.cake.x - plan.rock.x, plan.cake.z - plan.rock.z);
    const solid = withCake();
    for (const [i, s] of plan.seats.entries()) {
      expect(Math.hypot(s.x - plan.rock.x, s.z - plan.rock.z)).toBeGreaterThan(cakeD + 1);
      expect(isWalkableAt(solid, s.x, s.z), `seat ${i}`).toBe(true);
      expect(Math.hypot(s.x - ISLAND_LAND.x, s.z - ISLAND_LAND.z)).toBeLessThan(ISLAND_LAND.r - 1.3);
      for (const t of plan.seats.slice(i + 1)) expect(Math.hypot(s.x - t.x, s.z - t.z)).toBeGreaterThanOrEqual(0.75);
    }
    // a LOW device brings two a clan, the same seats' first part
    const low = G.planGathering(area, { speaker: plan.speaker, perClan: 2 });
    expect(low.cats.length).toBe(10);
    expect(low.seats).toEqual(plan.seats.slice(0, 10));
  });

  it('is the same every time: no dice', () => {
    const again = G.planGathering(area, { speaker: plan.speaker });
    expect(again).toEqual(plan);
  });

  it('the cake blocks no seat, perch, find or path on the island', () => {
    // Every spot she could reach from the bridge before the cake is still
    // reachable with it, except the cake's own footprint.
    const CELL = 0.25;
    const N = Math.ceil((ISLAND_LAND.r * 2 + 4) / CELL);
    const x0 = ISLAND_LAND.x - ISLAND_LAND.r - 2;
    const z0 = ISLAND_LAND.z - ISLAND_LAND.r - 2;
    const flood = (a) => {
      const seen = new Uint8Array(N * N);
      const ok = (i, j) => i >= 0 && j >= 0 && i < N && j < N && isWalkableAt(a, x0 + i * CELL, z0 + j * CELL);
      const si = Math.round((BRIDGE_DECK.x1 - 1 - x0) / CELL);
      const sj = Math.round((BRIDGE_DECK.z1 - 1 - z0) / CELL);
      expect(ok(si, sj)).toBe(true);
      const q = [[si, sj]];
      seen[si * N + sj] = 1;
      while (q.length) {
        const [i, j] = q.pop();
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj;
          if (ok(ni, nj) && !seen[ni * N + nj]) { seen[ni * N + nj] = 1; q.push([ni, nj]); }
        }
      }
      return seen;
    };
    const before = flood(area);
    const after = flood(withCake());
    let lost = 0;
    let kept = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (!before[i * N + j]) continue;
        const x = x0 + i * CELL, z = z0 + j * CELL;
        const underCake = Math.hypot(x - plan.cake.x, z - plan.cake.z) < plan.cake.r + CAT_RADIUS;
        if (underCake) continue;
        kept += 1;
        if (!after[i * N + j]) lost += 1;
      }
    }
    expect(kept).toBeGreaterThan(1000);
    expect(lost).toBe(0);
    // and the named spots are all well clear of it
    const spots = [...ISLAND_POIS, ...ISLAND_SCENICS, ...ISLAND_PERCHES, ...MEETING_STONES];
    for (const p of spots) expect(Math.hypot(p.x - plan.cake.x, p.z - plan.cake.z), `${p.x},${p.z}`).toBeGreaterThan(plan.cake.r + 1);
  });
});

describe('the island: kept for every cat, open to the Gathering only on her birthday', () => {
  it('a normal Pines walk keeps cats off the island, the bridge and the lake', () => {
    const shut = G.gatheringGround(area, false);
    for (const s of plan.seats) {
      expect(shut(s.x, s.z)).toBe(false);
      // the area's own keep-out (strays, ghosts) is untouched either way
      const p = keepOutPoint(area, s.x, s.z);
      expect(p.x !== s.x || p.z !== s.z).toBe(true);
    }
    const mid = { x: (BRIDGE_DECK.x1 + BRIDGE_DECK.x2) / 2, z: (BRIDGE_DECK.z1 + BRIDGE_DECK.z2) / 2 };
    expect(shut(mid.x, mid.z)).toBe(false);
  });

  it('the birthday opens the island’s dry land and the bridge, never the lake', () => {
    const open = G.gatheringGround(area, true);
    for (const s of plan.seats) expect(open(s.x, s.z)).toBe(true);
    const mid = { x: (BRIDGE_DECK.x1 + BRIDGE_DECK.x2) / 2, z: (BRIDGE_DECK.z1 + BRIDGE_DECK.z2) / 2 };
    expect(open(mid.x, mid.z)).toBe(true);
    // the lake, east of the island, and the bay
    expect(open(ISLAND_LAND.x + ISLAND_LAND.r + 4, ISLAND_LAND.z)).toBe(false);
    expect(open(ISLAND_LAND.x, ISLAND_LAND.z - ISLAND_LAND.r - 3)).toBe(false);
    expect(open(60, 50)).toBe(false);
  });
});

describe('the Gathering, live', () => {
  const live = ({ scene = new THREE.Scene(), ...opts } = {}) => {
    const calls = { bursts: 0, toasts: [], blown: 0 };
    const g = G.createBirthdayGathering(scene, plan, {
      name: 'Moonpaw',
      burst: () => { calls.bursts += 1; },
      toast: (t) => calls.toasts.push(t),
      onBlown: () => { calls.blown += 1; },
      ...opts,
    });
    return { g, scene, calls };
  };
  const run = (g, secs, pos) => { for (let t = 0; t < secs; t += 0.05) g.update(0.05, t, pos); };
  const far = new THREE.Vector3(10, 0, 4);
  const beside = (a) => new THREE.Vector3(plan.cake.x + Math.cos(a) * (plan.cake.r + 0.5), 0, plan.cake.z + Math.sin(a) * (plan.cake.r + 0.5));

  it('waits for her, and the leader announces when she comes near', () => {
    const { g, scene } = live();
    expect(g.cats.length).toBe(plan.cats.length + 1);
    // the leader sits on the rock
    expect(g.cats[0].group.position.y).toBeCloseTo(plan.rock.y, 6);
    run(g, 5, far);
    expect(g.phase).toBe('wait');
    run(g, 0.1, beside(Math.PI));
    expect(g.phase).toBe('announce');
    run(g, 7, beside(Math.PI));
    expect(['cheer', 'cake']).toContain(g.phase);
    run(g, 4, beside(Math.PI));
    expect(g.phase).toBe('cake');
    g.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('offers the candles from anywhere beside the cake, never from far off', () => {
    const { g } = live();
    for (let k = 0; k < 12; k++) expect(g.promptAt(beside((k / 12) * Math.PI * 2)), String(k)).toBe(true);
    expect(g.promptAt(far)).toBe(false);
    expect(g.promptAt(new THREE.Vector3(plan.cake.x + plan.cake.r + 1.6, 0, plan.cake.z))).toBe(false);
    g.dispose();
  });

  it('blows the 11 candles out one by one, then confetti, a cheer and "Make a wish!", once', () => {
    const { g, calls } = live();
    const pos = beside(Math.PI);
    run(g, 1, pos);
    expect(g.lit).toBe(11);
    expect(g.blow()).toBe(true);
    const seen = new Set();
    for (let t = 0; t < 3; t += 0.05) { g.update(0.05, t, pos); seen.add(g.lit); }
    expect(g.lit).toBe(0);
    // every count from 10 down to 0 was seen: one at a time
    for (let k = 0; k <= 10; k++) expect(seen.has(k), String(k)).toBe(true);
    expect(calls.bursts).toBeGreaterThan(0);
    expect(calls.toasts).toEqual([phrase('bday.wish')]);
    expect(calls.toasts[0]).toBe('Make a wish! 🎂');
    expect(calls.blown).toBe(1);
    expect(g.phase).toBe('cheer2');
    run(g, 4, pos);
    expect(g.phase).toBe('after');
    // the cake stays, unlit; no second go
    expect(g.promptAt(pos)).toBe(false);
    expect(g.blow()).toBe(false);
    run(g, 5, pos);
    expect(calls.blown).toBe(1);
    expect(g.lit).toBe(0);
    g.dispose();
  });

  it('works the same in the everyday words', () => {
    withOffWords(() => {
      const { g, calls } = live();
      g.blow();
      run(g, 3, beside(0));
      expect(calls.toasts).toEqual(['Make a wish! 🎂']);
      g.dispose();
    });
  });

  it('draws no dice', () => {
    const scene = new THREE.Scene(); // its own uuid draws come first
    const spy = vi.spyOn(Math, 'random');
    const { g } = live({ scene });
    run(g, 2, beside(0));
    g.blow();
    run(g, 6, beside(0));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    g.dispose();
  });
});

describe('the bubble’s words', () => {
  it('wraps a long announcement onto lines that fit', () => {
    const measure = (s) => s.length * 20;
    const lines = G.wrapLines("Cats of all the clans, gather! Today is Moonpaw's birthday!", measure, 570);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(570);
  });
});

describe('the show after the candles: fireworks, lanterns, the photo', () => {
  const live = ({ scene = new THREE.Scene(), ...opts } = {}) => {
    const calls = { booms: 0, photos: 0 };
    const g = G.createBirthdayGathering(scene, plan, {
      name: 'Moonpaw', boom: () => { calls.booms += 1; }, onPhoto: () => { calls.photos += 1; }, ...opts,
    });
    return { g, scene, calls };
  };
  const run = (g, secs, pos) => { for (let t = 0; t < secs; t += 0.05) g.update(0.05, t, pos); };
  let pos;
  beforeAll(() => { pos = new THREE.Vector3(plan.cake.x - 1.2, 0, plan.cake.z); });

  it('a few bursts over about ten seconds over the lake, lanterns rising, then all gone', () => {
    const { g, scene, calls } = live();
    expect(g.show).toBeNull();
    g.blow();
    run(g, 3, pos);
    expect(g.show).toBeTruthy();
    const plan0 = g.show.bursts;
    expect(plan0.length).toBeGreaterThanOrEqual(5);
    expect(plan0.length).toBeLessThanOrEqual(9);
    expect(Math.max(...plan0.map((b) => b.at))).toBeLessThanOrEqual(10);
    for (const b of plan0) {
      // over the water east of the island, high up
      expect(Math.hypot(b.x - 28, b.z - 28)).toBeGreaterThan(13);
      expect(b.y).toBeGreaterThan(4);
    }
    expect(g.show.lanterns).toBeGreaterThanOrEqual(8);
    run(g, 12, pos);
    expect(calls.booms).toBe(plan0.length);
    expect(calls.photos).toBe(1);
    run(g, 20, pos);
    expect(g.show.done).toBe(true);
    g.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('reduced motion: fewer, softer bursts', () => {
    const a = live();
    const b = live({ reducedMotion: true });
    a.g.blow(); b.g.blow();
    run(a.g, 3, pos); run(b.g, 3, pos);
    expect(b.g.show.bursts.length).toBeLessThan(a.g.show.bursts.length);
    expect(b.g.show.bursts.length).toBeGreaterThanOrEqual(2);
    expect(b.g.show.sparks).toBeLessThan(a.g.show.sparks);
    a.g.dispose(); b.g.dispose();
  });

  it('the same show every time, on its own stream: no Math.random, no walk dice', () => {
    const scene = new THREE.Scene();
    const spy = vi.spyOn(Math, 'random');
    const a = live({ scene });
    a.g.blow();
    run(a.g, 14, pos);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    const b = live();
    b.g.blow();
    run(b.g, 3, pos);
    expect(b.g.show.bursts).toEqual(a.g.show.bursts);
    a.g.dispose(); b.g.dispose();
  });
});

