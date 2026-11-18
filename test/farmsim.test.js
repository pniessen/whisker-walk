import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The headless canvas stub every world test uses (test/farm.test.js).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build, PASTURE, GOAT_PADDOCK, POND, JETTY } = await import('../src/world/farm.js');
const sim$ = await import('../src/farmsim.js');
const {
  createFarmSim, ridePose, dismountSpot, clearance, createTrail, polyline,
  FARM_ANIMAL_TYPES, CAT_WALK, COW, GOAT, HEN, CHICK, DOG, DOG_MODES, DUCKLING,
} = sim$;
const { bestPerch, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { JOURNAL_TYPES } = await import('../src/progression.js');
const { CRITTER_INFO } = await import('../src/journal.js');
const { labelFor } = await import('../src/game/labels.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { snapshotWalk } = await import('../src/game/walkresume.js');

const area = build(new THREE.Scene());
const A = area.anchors;
const DT = 1 / 30;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inRect = (r, p, slack = 0) => p.x >= r.minX - slack && p.x <= r.maxX + slack && p.z >= r.minZ - slack && p.z <= r.maxZ + slack;
// A cat standing far from everything (the farm gate), for runs that are about the animals alone.
const awayCat = () => ({ x: 0, z: 46, speed: 0, running: false, inWater: false, perched: false, jumping: false, riding: null, fx: 0, fz: -1 });
const catAt = (x, z, more = {}) => ({ ...awayCat(), x, z, ...more });
// Runs the sim for `seconds`, calling each(sim, t) after every step.
function run(sim, seconds, cat, each = () => {}, env = {}) {
  for (let t = 0; t < seconds; t += DT) {
    const c = typeof cat === 'function' ? cat(t) : cat;
    sim.step(DT, c, env);
    each(sim, t, c);
  }
}

describe('the Farm\'s animals: who is there', () => {
  const sim = createFarmSim(area);

  it('has cows, goats, hens, chicks, a sheepdog and ducklings', () => {
    expect(sim.cows.length).toBeGreaterThanOrEqual(2);
    expect(sim.cows.length).toBeLessThanOrEqual(3);
    expect(sim.goats).toHaveLength(2);
    expect(sim.hens.length).toBeGreaterThanOrEqual(4);
    expect(sim.chicks.length).toBeGreaterThanOrEqual(3);
    expect(sim.dog.type).toBe('sheepdog');
    expect(sim.ducklings.length).toBeGreaterThanOrEqual(3);
    expect(new Set(sim.all.map((a) => a.type))).toEqual(new Set(FARM_ANIMAL_TYPES));
    expect(new Set(sim.all.map((a) => a.id)).size).toBe(sim.all.length);
  });

  it('starts every animal in its own place, on free ground or on the pond', () => {
    for (const cow of sim.cows) {
      expect(inRect(A.pasture, cow), cow.id).toBe(true);
      expect(clearance(area.colliders, cow.x, cow.z), cow.id).toBeGreaterThanOrEqual(COW.CLEAR * cow.scale - 1e-9);
    }
    for (const g of sim.goats) expect(inRect(A.goatPaddock, g), g.id).toBe(true);
    for (const a of [...sim.goats, ...sim.hens, ...sim.chicks, sim.dog]) {
      expect(isWalkableAt(area, a.x, a.z), a.id).toBe(true);
      expect(clearance(area.colliders, a.x, a.z), a.id).toBeGreaterThan(0.2);
    }
    expect(dist(sim.dog, A.kennelFront)).toBeLessThan(0.5);
    for (const k of sim.ducklings) expect(Math.hypot(k.x - POND.x, k.z - POND.z), k.id).toBeLessThan(POND.r - 0.5);
    // the chicks begin beside their hen
    for (const c of sim.chicks) expect(dist(c, c.hen), c.id).toBeLessThan(1);
  });

  it('is the same on every run from the same seed, and draws nothing from Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    const a = createFarmSim(area);
    const b = createFarmSim(area);
    run(a, 60, awayCat());
    run(b, 60, awayCat());
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    expect(a.all.map((x) => [x.x, x.z, x.yaw])).toEqual(b.all.map((x) => [x.x, x.z, x.yaw]));
  });
});

describe('cows', () => {
  it('amble about the pasture for half an hour and never leave it, touch anything solid or crowd each other', () => {
    const sim = createFarmSim(area);
    let walked = 0;
    let closest = Infinity;
    const last = sim.cows.map((c) => ({ x: c.x, z: c.z }));
    run(sim, 1800, awayCat(), (s) => {
      s.cows.forEach((cow, i) => {
        expect(inRect(A.pasture, cow, 1e-9)).toBe(true);
        expect(inRect(PASTURE, cow, -0.9)).toBe(true); // a body's width inside the fence
        expect(clearance(area.colliders, cow.x, cow.z)).toBeGreaterThanOrEqual(COW.CLEAR * cow.scale - 1e-6);
        const step = dist(cow, last[i]);
        expect(step).toBeLessThanOrEqual(COW.AMBLE * DT + 1e-6); // never startled, never hurried
        walked += step;
        last[i].x = cow.x; last[i].z = cow.z;
        // the perch is on her back, wherever she is
        expect(cow.perch.x).toBe(cow.x);
        expect(cow.perch.z).toBe(cow.z);
      });
      closest = Math.min(closest, dist(s.cows[0], s.cows[1]));
    });
    expect(walked).toBeGreaterThan(100); // they really do wander
    expect(closest).toBeGreaterThan(1.2);
  });

  it('do not care about a cat running straight at them', () => {
    const sim = createFarmSim(area);
    const cow = sim.cows[0];
    const calm = createFarmSim(area);
    // a zooming cat runs in circles right round her
    run(sim, 30, (t) => catAt(cow.x + Math.sin(t * 4) * 1.2, cow.z + Math.cos(t * 4) * 1.2, { speed: 6.5, running: true }));
    run(calm, 30, awayCat());
    expect([cow.x, cow.z, cow.yaw, cow.mode]).toEqual([calm.cows[0].x, calm.cows[0].z, calm.cows[0].yaw, calm.cows[0].mode]);
  });

  it('answer a meow: every cow in earshot looks up, and the nearest one moos', () => {
    const sim = createFarmSim(area);
    const cow = sim.cows[0];
    const cat = catAt(cow.x - 3, cow.z);
    sim.step(DT, cat);
    const mooer = sim.meow(cat);
    expect(mooer).toBe(cow);
    expect(sim.events.filter((e) => e.type === 'moo')).toEqual([{ type: 'moo', id: cow.id }]);
    expect(cow.mode).toBe('look');
    expect(cow.lookAt).toEqual({ x: cat.x, z: cat.z });
    const at = { x: cow.x, z: cow.z };
    run(sim, 1, cat);
    expect(cow.headDown).toBe(false);
    expect(dist(cow, at)).toBe(0); // she looks; she does not come or go
    run(sim, COW.LOOK_TIME + 0.2, cat);
    expect(cow.mode).not.toBe('look'); // and goes back to her grass
    // out of earshot: nothing
    const far = createFarmSim(area);
    expect(far.meow({ x: 0, z: 46 })).toBe(null);
    expect(far.cows.every((c) => c.mode !== 'look')).toBe(true);
  });
});

describe('riding a cow', () => {
  const budget = BASE_CLIMB_BUDGET;

  it('her back is a perch a cat with no skills reaches from the grass beside her, front, back and both sides', () => {
    const sim = createFarmSim(area);
    for (const cow of sim.cows) {
      expect(cow.perch.y).toBeLessThanOrEqual(budget.climb);
      expect(cow.perch.ride).toBe(cow.id);
      // no label and no vantage: riding is no scenic award and no climbing feat
      expect(cow.perch.label).toBeUndefined();
      expect(cow.perch.vantage).toBeUndefined();
      const reach = cow.perch.y > 1 ? 1.5 : 1.0;
      for (const [dx, dz] of [[reach, 0], [-reach, 0], [0, reach], [0, -reach]]) {
        const from = { x: cow.x + dx, z: cow.z + dz };
        expect(bestPerch([...area.perches, cow.perch], from, 0, null, budget, {}), `${cow.id} from ${dx},${dz}`).toBe(cow.perch);
      }
    }
  });

  it('carries the cat: for ten minutes the rider is on her back, in the pasture, clear of everything solid', () => {
    const sim = createFarmSim(area);
    const cow = sim.cows[0];
    let carried = 0;
    let prev = ridePose(cow);
    run(sim, 600, () => ({ ...awayCat(), ...ridePose(cow), perched: true, riding: cow.id }), () => {
      const pose = ridePose(cow);
      expect(pose.x).toBe(cow.x);
      expect(pose.z).toBe(cow.z);
      expect(pose.y).toBe(cow.perch.y);
      expect(cow.ridden).toBe(true);
      expect(inRect(area.bounds, pose, -0.5)).toBe(true);
      expect(inRect(A.pasture, pose, 1e-9)).toBe(true);
      expect(clearance(area.colliders, pose.x, pose.z)).toBeGreaterThan(CAT_RADIUS + 0.3);
      carried += dist(pose, prev);
      prev = pose;
    });
    expect(carried).toBeGreaterThan(40); // a ride, not a seat: she walks more with a cat aboard
    expect(sim.cows[1].ridden).toBe(false);
  });

  it('lets the cat off on free ground inside the bounds, on the side she asks for, wherever the cow stands', () => {
    const sim = createFarmSim(area);
    const world = { colliders: area.colliders, bounds: area.bounds, waters: area.waters };
    let checked = 0;
    run(sim, 900, awayCat(), (s, t) => {
      if (Math.round(t / DT) % 15) return;
      for (const cow of s.cows) {
        for (const toward of [null, { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]) {
          const spot = dismountSpot(cow, toward, world);
          expect(isWalkableAt(area, spot.x, spot.z)).toBe(true);
          expect(clearance(area.colliders, spot.x, spot.z)).toBeGreaterThanOrEqual(CAT_RADIUS);
          expect(inRect(area.bounds, spot, -0.4)).toBe(true);
          const off = dist(spot, cow);
          expect(off).toBeGreaterThan(0.5 * cow.scale); // beside her, not under her
          expect(off).toBeLessThan(4.1);
          checked++;
        }
      }
    });
    expect(checked).toBeGreaterThan(1000);
    // the side: with her nose to +z, her right is +x
    const cow = { x: 34, z: 0, yaw: 0, scale: 1 };
    expect(dismountSpot(cow, { x: 1, z: 0 }, world).x).toBeGreaterThan(34.5);
    expect(dismountSpot(cow, { x: -1, z: 0 }, world).x).toBeLessThan(33.5);
    // hard against a wall on one side, she gets off on the other
    const walled = dismountSpot(cow, { x: 1, z: 0 }, { ...world, colliders: [{ x: 35, z: 0, r: 0.6 }] });
    expect(walled.x).toBeLessThan(33.5);
    // boxed in on every side but one
    const boxed = dismountSpot(cow, null, { bounds: { minX: 33, maxX: 35, minZ: -0.5, maxZ: 4 }, colliders: [] });
    expect(boxed.z).toBeGreaterThan(1);
  });

  it('leaves nothing in the note of a walk put down while riding: she comes back on the ground where she was', () => {
    const sim = createFarmSim(area);
    const cow = sim.cows[0];
    const session = {
      areaId: 'farm', soloSeed: 7, walkStamp: 'walk-1', cat: { position: { x: cow.x, y: cow.perch.y, z: cow.z } },
      perched: cow.perch, collectibleMeshes: new Map(), areaData: area, walk: { carried: 0 }, startPoints: 0,
    };
    const note = snapshotWalk(session, { yaw: 0, now: 1 });
    expect(note.x).toBe(cow.x);
    expect(note.z).toBe(cow.z);
    expect(JSON.stringify(note)).not.toMatch(/perch|ride|cow/);
    // no cow has a collider, so that spot is ground a cat can stand on
    expect(isWalkableAt(area, note.x, note.z)).toBe(true);
  });
});

describe('the job cow follows the cat to the milking shed (step 3\'s hook)', () => {
  // The cat walks the route a little ahead of the cow, never more than 3 m in front.
  function lead(sim, cow, { speed = 2.2, starts = null } = {}) {
    const f = sim.startCowFollow(cow);
    let sCat = 0;
    let t = 0;
    const seen = [];
    while (!f.arrived && t < 400) {
      if (sCat - f.s < 3) sCat = Math.min(f.line.length, sCat + speed * DT);
      const p = f.line.at(sCat);
      sim.step(DT, catAt(p.x, p.z, { speed }));
      seen.push({ x: cow.x, z: cow.z });
      t += DT;
    }
    return { f, t, seen, starts };
  }

  it('reaches the milking shed door, along a path clear of every wall, at an amble', () => {
    const sim = createFarmSim(area);
    const cow = sim.jobCow;
    const events = [];
    const f = sim.startCowFollow(cow);
    let sCat = 0;
    let prev = { x: cow.x, z: cow.z };
    for (let t = 0; t < 400 && !f.arrived; t += DT) {
      if (sCat - f.s < 3) sCat = Math.min(f.line.length, sCat + 2.2 * DT);
      const p = f.line.at(sCat);
      sim.step(DT, catAt(p.x, p.z, { speed: 2.2 }));
      events.push(...sim.events);
      expect(dist(cow, prev)).toBeLessThanOrEqual(COW.FOLLOW_SPEED * DT + 1e-6);
      expect(clearance(area.colliders, cow.x, cow.z)).toBeGreaterThan(CAT_RADIUS + 0.3);
      expect(inRect(area.bounds, cow, -1)).toBe(true);
      prev = { x: cow.x, z: cow.z };
    }
    expect(f.arrived).toBe(true);
    expect(events.filter((e) => e.type === 'cow-arrived')).toEqual([{ type: 'cow-arrived', id: cow.id }]);
    expect(dist(cow, A.milkingShedDoor)).toBeLessThan(COW.FOLLOW_GAP + 0.6);
    // the line goes out by the pasture gate
    expect(f.line.points.some((p) => dist(p, A.pastureGate) < 0.01)).toBe(true);
    expect(dist(f.line.points[f.line.points.length - 1], A.milkingShedDoor)).toBeLessThan(0.01);
  });

  it('finds a clear way to the gate from anywhere a cow can stand in the pasture', () => {
    let tried = 0;
    for (let x = A.pasture.minX + 0.5; x <= A.pasture.maxX; x += 2.4) {
      for (let z = A.pasture.minZ + 0.5; z <= A.pasture.maxZ; z += 2.9) {
        if (clearance(area.colliders, x, z) < COW.CLEAR) continue;
        const sim = createFarmSim(area);
        const cow = sim.jobCow;
        cow.x = x; cow.z = z;
        const f = sim.startCowFollow(cow);
        for (let s = 0; s <= f.line.length; s += 0.25) {
          const p = f.line.at(s);
          expect(clearance(area.colliders, p.x, p.z), `from ${x},${z} at ${s}`).toBeGreaterThan(CAT_RADIUS + 0.3);
        }
        tried++;
      }
    }
    expect(tried).toBeGreaterThan(40);
  });

  it('waits for a cat that stops, wanders off or turns back, for as long as it takes', () => {
    const sim = createFarmSim(area);
    const cow = sim.jobCow;
    const f = sim.startCowFollow(cow);
    // the cat stays where she is: the cow does not go on alone
    run(sim, 60, catAt(cow.x, cow.z));
    expect(f.s).toBe(0);
    // the cat is far away at the gate: nothing
    run(sim, 60, awayCat());
    expect(f.s).toBe(0);
    expect(f.arrived).toBe(false);
    // a cat 4 m along: she comes to a stop behind her, not on top of her
    const p = f.line.at(4);
    run(sim, 30, catAt(p.x, p.z));
    expect(f.s).toBeCloseTo(4 - COW.FOLLOW_GAP, 5);
    // the cat goes back to the start: the cow stays (she never walks backward after the cat)
    const before = f.s;
    run(sim, 20, catAt(f.line.points[0].x, f.line.points[0].z));
    expect(f.s).toBe(before);
    // a cat on her back is not led anywhere
    run(sim, 20, { ...catAt(cow.x, cow.z), perched: true, riding: cow.id });
    expect(f.s).toBe(before);
  });

  it('goes home and grazes again when let go', () => {
    const sim = createFarmSim(area);
    const cow = sim.jobCow;
    const home = { x: cow.x, z: cow.z };
    const { f } = lead(sim, cow);
    expect(f.arrived).toBe(true);
    sim.stopCowFollow(cow);
    run(sim, 200, awayCat());
    expect(cow.follow).toBe(null);
    expect(cow.mode === 'graze' || cow.mode === 'amble').toBe(true);
    expect(inRect(A.pasture, cow, 1e-9)).toBe(true);
    expect(dist(cow, home)).toBeLessThan(12);
    // and wanders as before
    run(sim, 300, awayCat(), (s) => expect(inRect(A.pasture, s.jobCow, 1e-9)).toBe(true));
  });
});

describe('goats', () => {
  it('stay in the paddock, hop onto the stand and the rock, and never share a spot', () => {
    const sim = createFarmSim(area);
    const on = { stand: 0, rock: 0 };
    let hops = 0;
    run(sim, 900, awayCat(), (s) => {
      for (const g of s.goats) {
        expect(inRect(GOAT_PADDOCK, g, 1e-9)).toBe(true);
        expect(g.y).toBeGreaterThanOrEqual(0);
        expect(g.y).toBeLessThan(A.goatStand.y + 1.2);
        if (g.hop) hops++;
        if (!g.hop && g.spot) {
          expect(g.y).toBeCloseTo(g.spot.y, 6);
          expect(dist(g, g.spot)).toBeLessThan(1e-6);
          on[g.spot.name]++;
        }
      }
      const [a, b] = s.goats;
      if (a.spot && b.spot && !a.hop && !b.hop) expect(a.spot).not.toBe(b.spot);
    });
    expect(on.stand).toBeGreaterThan(100);
    expect(on.rock).toBeGreaterThan(100);
    expect(hops).toBeGreaterThan(100);
  });

  it('trots up to a cat in the paddock, slower than she walks, and butts heads: a nudge, never a shove', () => {
    const sim = createFarmSim(area);
    const cat = catAt(-31, -22);
    const last = sim.goats.map((g) => ({ x: g.x, z: g.z }));
    let butts = 0;
    let moved = 0;
    run(sim, 120, cat, (s) => {
      s.goats.forEach((g, i) => {
        if (!g.hop) expect(dist(g, last[i]) / DT).toBeLessThanOrEqual(GOAT.TROT + 1e-6);
        last[i] = { x: g.x, z: g.z };
      });
      if (s.nudge) {
        butts++;
        const push = Math.hypot(s.nudge.dx, s.nudge.dz);
        expect(push).toBeLessThanOrEqual(GOAT.NUDGE + 1e-9);
        moved += push;
        expect(s.events.some((e) => e.type === 'goat-butt')).toBe(true);
      }
    });
    expect(GOAT.TROT).toBeLessThan(CAT_WALK);
    expect(GOAT.NUDGE).toBeLessThanOrEqual(0.25);
    expect(butts).toBeGreaterThanOrEqual(2);
    // not a nag: at most one hello every GREET_REST seconds
    expect(butts).toBeLessThanOrEqual(Math.ceil(120 / GOAT.GREET_REST) + 1);
    expect(moved).toBeLessThan(3);
  });

  it('gives up on a cat that walks away, and never follows her out of the paddock', () => {
    const sim = createFarmSim(area);
    let hello = false;
    for (let t = 0; t < 12 && !hello; t += DT) { sim.step(DT, catAt(-31, -22)); hello = sim.goats.some((g) => g.mode === 'greet'); }
    expect(hello).toBe(true);
    // she walks out through the gate and off down the track
    run(sim, 60, (t) => catAt(Math.min(0, -22 + t * 3), -22.5, { speed: 3 }), (s) => {
      for (const g of s.goats) expect(inRect(GOAT_PADDOCK, g, 1e-9)).toBe(true);
    });
    expect(sim.goats.every((g) => g.mode !== 'greet' && g.mode !== 'butt')).toBe(true);
  });

  it('leaves a cat on the stand or up a tree alone', () => {
    const sim = createFarmSim(area);
    let fuss = 0;
    run(sim, 120, catAt(A.goatStand.x, A.goatStand.z, { perched: true }), (s) => {
      if (s.nudge || s.goats.some((g) => g.mode === 'greet' || g.mode === 'butt')) fuss++;
      // and no goat jumps onto the spot she has taken
      for (const g of s.goats) if (!g.hop && g.spot) expect(g.spot.name).not.toBe('stand');
    });
    expect(fuss).toBe(0);
  });

  it('copies her jump: one hop for each jump of hers, when she is near', () => {
    const sim = createFarmSim(area);
    const g = sim.goats[0];
    // she stands outside the fence (no hello), and the goat is given nothing else to do
    const near = { x: g.x + 6.4, z: g.z };
    expect(near.x).toBeGreaterThan(GOAT_PADDOCK.maxX + 1);
    g.timer = 999;
    let copies = 0;
    let peak = 0;
    const jumpAt = (t) => (t % 5) < 0.3; // she jumps every 5 seconds
    run(sim, 20, (t) => catAt(near.x, near.z, { jumping: jumpAt(t) }), (s) => {
      copies += s.events.filter((e) => e.type === 'goat-copy' && e.id === g.id).length;
      if (g.mode === 'idle' && g.hop && !g.spot) peak = Math.max(peak, g.y);
    });
    expect(copies).toBe(4);
    // far away she jumps unanswered
    const far = createFarmSim(area);
    let none = 0;
    run(far, 12, (t) => ({ ...awayCat(), jumping: jumpAt(t) }), (s) => { none += s.events.filter((e) => e.type === 'goat-copy').length; });
    expect(none).toBe(0);
    expect(peak).toBeLessThanOrEqual(GOAT.COPY_HEIGHT + 1.6);
  });

  it('has clean hooks for step 3: a script takes a goat over, and it can hold a thing', () => {
    const sim = createFarmSim(area);
    const g = sim.goats[0];
    expect(g.carry).toBe(null);
    expect(g.script).toBe(null);
    const calls = [];
    g.script = (goat, dt, cat) => { calls.push([goat.id, dt, cat.x]); goat.x += 1 * dt; };
    const x0 = g.x;
    run(sim, 1, awayCat());
    expect(calls.length).toBeGreaterThanOrEqual(30);
    expect(g.x).toBeCloseTo(x0 + calls.length * DT, 5);
    g.script = null;
    run(sim, 30, awayCat(), (s) => expect(Number.isFinite(s.goats[0].x)).toBe(true));
  });
});

describe('hens', () => {
  // A cat running a straight line through the yard hens' ground.
  const pass = (speed, running) => (t) => {
    const x = -14 + (t * speed) % 28;
    return catAt(x, -1.5 + Math.sin(x) * 2, { speed, running, fx: 1, fz: 0 });
  };

  it('are not disturbed by a walking cat, however close', () => {
    const sim = createFarmSim(area);
    let flutters = 0;
    run(sim, 120, (t) => {
      const h = sim.hens[3];
      return catAt(h.x + Math.sin(t) * 0.5, h.z + Math.cos(t) * 0.5, { speed: 4.2, running: false });
    }, (s) => { flutters += s.events.filter((e) => e.type === 'cluck').length; for (const h of s.hens) expect(h.mode).not.toBe('flutter'); });
    expect(flutters).toBe(0);
  });

  it('flutter aside a metre or two from a running cat and are pecking again at once', () => {
    const sim = createFarmSim(area);
    let flutters = 0;
    const startOf = new Map();
    run(sim, 120, pass(6.5, true), (s, t) => {
      for (const h of s.hens) {
        if (h.mode === 'flutter') {
          if (!startOf.has(h.id)) { startOf.set(h.id, t); flutters++; }
          // bounded in time and in distance
          expect(t - startOf.get(h.id)).toBeLessThanOrEqual(HEN.FLUTTER_TIME + 2 * DT);
          expect(Math.hypot(h.flutter.x1 - h.flutter.x0, h.flutter.z1 - h.flutter.z0)).toBeLessThanOrEqual(HEN.FLUTTER_MAX + 0.4);
          expect(h.y).toBeLessThanOrEqual(HEN.FLUTTER_HOP + 1e-9);
        } else {
          startOf.delete(h.id);
          expect(h.y).toBe(0);
        }
        expect(isWalkableAt(area, h.x, h.z) || h.mode === 'flutter').toBe(true);
        expect(inRect(area.bounds, h)).toBe(true);
      }
    });
    expect(flutters).toBeGreaterThan(3);
    // the cat stops: within one flutter every hen is settled
    run(sim, HEN.FLUTTER_TIME + 0.1, awayCat());
    for (const h of sim.hens) expect(['peck', 'stroll']).toContain(h.mode);
    expect(HEN.FLUTTER_TIME).toBeLessThanOrEqual(0.6);
  });

  it('stay near home for half an hour, the run\'s hens inside the run, run past or not', () => {
    for (const cat of [awayCat(), pass(6.5, true)]) {
      const sim = createFarmSim(area);
      run(sim, 1800, cat, (s) => {
        for (const h of s.hens) {
          expect(dist(h, h.home), h.id).toBeLessThan(HEN.HOME_R + 3 * HEN.FLUTTER_MAX + 1);
          if (h.zone === A.henRun) expect(inRect(A.henRun, h, 1e-9), h.id).toBe(true);
          expect(clearance(area.colliders, h.x, h.z), h.id).toBeGreaterThan(0.1);
        }
      });
    }
  });
});

describe('chicks', () => {
  const hen = (sim) => sim.hens[0];

  it('stay by their hen when no cat is near', () => {
    const sim = createFarmSim(area);
    run(sim, 300, awayCat(), (s) => {
      for (const c of s.chicks) { expect(dist(c, c.hen), c.id).toBeLessThan(2.5); expect(c.following).toBe(false); }
    });
  });

  it('follow a walking cat in a little line, each behind the last', () => {
    const sim = createFarmSim(area);
    const h = hen(sim);
    // she walks up to the hen, then away east across the yard at a trot
    const walk = (t) => catAt(h.x + 1 + Math.max(0, t - 3) * 3.4 * 0.5, h.z + 1.2 + Math.max(0, t - 3) * 3.4 * 0.5, { speed: t < 3 ? 0 : 3.4, fx: 0.7, fz: 0.7 });
    let cat;
    run(sim, 7, walk, (s, t, c) => { cat = c; });
    expect(sim.chicks.every((c) => c.following)).toBe(true);
    const line = [...sim.chicks].sort((a, b) => a.order - b.order);
    expect(line.map((c) => c.order)).toEqual([0, 1, 2, 3]);
    line.forEach((c, i) => {
      // on her trail, at its place in the line
      expect(dist(c, cat), c.id).toBeCloseTo(CHICK.FIRST + CHICK.GAP * i, 0);
      if (i) expect(dist(c, cat)).toBeGreaterThan(dist(line[i - 1], cat));
    });
    expect(sim.chicks.every((c) => clearance(area.colliders, c.x, c.z) > 0.1)).toBe(true);
  });

  it('never follow a runner: they scatter a short way, stop, and regroup when she is calm', () => {
    const sim = createFarmSim(area);
    const h = hen(sim);
    // a zooming cat tears round and through them for 20 seconds
    run(sim, 20, (t) => catAt(h.x + Math.sin(t * 3) * 2, h.z + Math.cos(t * 2) * 2, { speed: 6.5, running: true, fx: Math.cos(t * 3), fz: -Math.sin(t * 2) }), (s) => {
      for (const c of s.chicks) {
        expect(c.following).toBe(false);
        expect(c.mode).not.toBe('follow');
      }
    });
    // a short way: nobody has been driven off
    sim.chicks.forEach((c) => expect(dist(c, c.hen), c.id).toBeLessThan(3 + 2 * CHICK.SCATTER_DIST + HEN.FLUTTER_MAX));
    expect(CHICK.SCATTER_DIST).toBeLessThanOrEqual(1.5);
    expect(CHICK.SCATTER_TIME).toBeLessThanOrEqual(0.5);
    // she goes away: they are back with their hen
    run(sim, 20, awayCat());
    for (const c of sim.chicks) expect(dist(c, c.hen), c.id).toBeLessThan(2.5);

    // following chicks whose cat breaks into a run stop following, and take it up again when she walks
    const again = createFarmSim(area);
    const g = hen(again);
    run(again, 4, catAt(g.x + 1, g.z + 1));
    expect(again.chicks.every((c) => c.following)).toBe(true);
    run(again, 3, (t) => catAt(g.x + 1 + t * 6.5, g.z + 1, { speed: 6.5, running: true, fx: 1, fz: 0 }), (s) => {
      for (const c of s.chicks) expect(c.following).toBe(false);
    });
    const stop = { x: g.x + 1 + 3 * 6.5 - 14, z: g.z + 1 };
    run(again, 6, catAt(stop.x, stop.z));
    expect(again.chicks.filter((c) => c.following).length).toBeGreaterThanOrEqual(3);
  });

  it('wait on the bank for a cat in the water, and below for a cat up on something', () => {
    const sim = createFarmSim(area);
    const h = hen(sim);
    run(sim, 4, catAt(h.x + 1, h.z + 1));
    const at = sim.chicks.map((c) => ({ x: c.x, z: c.z }));
    run(sim, 10, catAt(h.x + 1, h.z + 1, { perched: true }));
    sim.chicks.forEach((c, i) => expect(dist(c, at[i])).toBeLessThan(0.2));
    for (const c of sim.chicks) expect(c.y).toBe(0);
  });

  it('go home to their hen when the cat gets too far ahead or leads them too far', () => {
    const sim = createFarmSim(area);
    const h = hen(sim);
    run(sim, 4, catAt(h.x + 1, h.z + 1));
    expect(sim.chicks.every((c) => c.following)).toBe(true);
    // a long calm walk away south: past the leash they turn for home
    run(sim, 30, (t) => catAt(h.x + 1, h.z + 1 + t * 3.4, { speed: 3.4, fx: 0, fz: 1 }));
    expect(sim.chicks.every((c) => !c.following)).toBe(true);
    run(sim, 40, awayCat());
    for (const c of sim.chicks) expect(dist(c, c.hen), c.id).toBeLessThan(2.5);
  });

  it('gives step 3 what the round-up needs: ids, a place to put a chick, its following state, and the coop', () => {
    const sim = createFarmSim(area);
    expect(sim.chicks.map((c) => c.id)).toEqual(['chick-1', 'chick-2', 'chick-3', 'chick-4']);
    // lost by the well
    const lost = sim.placeChick('chick-2', 3, 12);
    expect(lost).toBe(sim.chicks[1]);
    expect(sim.placeChick('no-such', 0, 0)).toBe(null);
    run(sim, 120, awayCat());
    expect(dist(lost, { x: 3, z: 12 })).toBeLessThan(0.6); // it waits where it was put
    expect(sim.chickAtCoop('chick-2')).toBe(false);
    expect(lost.following).toBe(false);
    // a calm cat finds it and walks it home, a long way (no leash for a lost chick)
    let p = { x: 3.8, z: 12 };
    run(sim, 3, catAt(p.x, p.z));
    expect(lost.following).toBe(true);
    const to = { x: sim.coop.x + 0.4, z: sim.coop.z };
    let t = 0;
    while (dist(p, to) > 0.05 && t < 60) {
      const d = dist(p, to);
      const step = Math.min(d, 3.2 * DT);
      p = { x: p.x + ((to.x - p.x) / d) * step, z: p.z + ((to.z - p.z) / d) * step };
      sim.step(DT, catAt(p.x, p.z, { speed: 3.2, fx: (to.x - p.x) / d, fz: (to.z - p.z) / d }));
      t += DT;
    }
    run(sim, 2, catAt(to.x, to.z));
    expect(lost.following).toBe(true);
    expect(sim.chickAtCoop('chick-2')).toBe(true);
    expect(dist(sim.coop, A.coopDoor)).toBe(0);
    // sent back to its hen, it stops following and goes to her
    sim.homeChick('chick-2');
    expect(lost.following).toBe(false);
    expect(lost.placed).toBe(null);
    run(sim, 20, awayCat());
    expect(dist(lost, lost.hen)).toBeLessThan(2.5);
  });
});

describe('the sheepdog', () => {
  it('has no chasing and no barking in him', () => {
    expect(DOG_MODES).toEqual(['lie', 'come', 'beside', 'home']);
    expect(DOG.TROT).toBeLessThan(CAT_WALK);
  });

  it('lies by his kennel, wags at a cat who comes near, trots over, walks beside her and goes home to lie down', () => {
    const sim = createFarmSim(area);
    const dog = sim.dog;
    run(sim, 30, awayCat());
    expect(dog.mode).toBe('lie');
    expect(dog.wag).toBe(false);
    expect(dist(dog, A.kennelFront)).toBeLessThan(0.01);

    const seen = new Set();
    const events = [];
    // she stops 5 m off for a while, then walks a slow loop out toward the yard and stands
    const k0 = { x: A.kennelFront.x, z: A.kennelFront.z };
    const cat = (t) => {
      const k = Math.max(0, Math.min(1, (t - 8) / 6));
      return catAt(k0.x + 5 + k * 6, k0.z + 1 - k * 4, { speed: t > 8 && t < 14 ? 1.2 : 0, fx: 0.83, fz: -0.55 });
    };
    let beside = 0;
    run(sim, 40, cat, (s, t, c) => {
      seen.add(dog.mode);
      events.push(...s.events);
      expect(DOG_MODES).toContain(dog.mode);
      if (dog.mode === 'beside') {
        beside++;
        // at her side, never in front: not ahead of her along the way she faces
        const ahead = (dog.x - c.x) * c.fx + (dog.z - c.z) * c.fz;
        if (dist(dog, c) < 1.3) expect(ahead).toBeLessThan(0.6);
      }
      if (t < 5) expect(dog.wag).toBe(true);
    });
    expect([...seen].sort()).toEqual(['beside', 'come', 'home', 'lie']);
    expect(beside * DT).toBeGreaterThan(10);
    expect(events.filter((e) => e.type === 'dog-hello')).toHaveLength(1);
    expect(dog.mode).toBe('lie');
    expect(dist(dog, A.kennelFront)).toBeLessThan(0.2);
    expect(dog.restT).toBeGreaterThan(0); // and he rests before the next hello
  });

  it('never comes toward her faster than she walks, whatever she does', () => {
    const paths = [
      (t) => catAt(-8, 13, { speed: 0 }),                                                        // standing
      (t) => catAt(-8 + Math.sin(t * 0.7) * 5, 12 + Math.cos(t * 0.5) * 6, { speed: 3.5, fx: 1, fz: 0 }), // wandering
      (t) => catAt(-9 + Math.sin(t * 2.4) * 4, 13 + Math.cos(t * 2.4) * 4, { speed: 6.8, running: true }), // zoomies round him
      (t) => catAt(-10 + t * 1.5, 13.2, { speed: 1.5, fx: 1, fz: 0 }),                              // creeping away east
    ];
    for (const path of paths) {
      const sim = createFarmSim(area);
      const dog = sim.dog;
      let prev = { x: dog.x, z: dog.z };
      run(sim, 90, path, (s, t, c) => {
        const speed = dist(dog, prev) / DT;
        const d = dist(dog, c);
        expect(speed).toBeLessThanOrEqual(Math.max(DOG.TROT, Math.min(c.speed, DOG.HEEL_MAX)) + 1e-6);
        // more than a few steps away he only ever trots
        if (d > DOG.HEEL_RANGE + 0.5) expect(speed).toBeLessThanOrEqual(DOG.TROT + 1e-6);
        expect(DOG_MODES).toContain(dog.mode);
        expect(dist(dog, A.kennelFront)).toBeLessThan(DOG.LEASH + DOG.LOST + 1);
        expect(clearance(area.colliders, dog.x, dog.z)).toBeGreaterThan(0.1);
        prev = { x: dog.x, z: dog.z };
      });
    }
  });

  it('waits below a cat who climbs up, and stays out of the pond', () => {
    const sim = createFarmSim(area);
    const dog = sim.dog;
    run(sim, 1, catAt(dog.x + 4, dog.z));
    expect(dog.mode).toBe('come');
    const at = { x: dog.x, z: dog.z };
    run(sim, 5, catAt(dog.x + 4, dog.z, { perched: true }));
    expect(dist(dog, at)).toBeLessThan(0.01);
    // she walks down to the pond and wades in: he does not follow into the water
    const wet = createFarmSim(area);
    run(wet, 200, (t) => {
      const k = Math.min(1, t / 20);
      return catAt(-10 + (POND.x + 5.8 - -10) * k, 13 + (POND.z - 13) * k, { speed: k < 1 ? 1.4 : 0, inWater: k >= 1, fx: -0.7, fz: 0.7 });
    }, (s) => {
      expect(Math.hypot(s.dog.x - POND.x, s.dog.z - POND.z)).toBeGreaterThan(POND.r);
    });
    expect(wet.dog.mode).toBe('lie');
  });
});

describe('ducklings', () => {
  const ducks = (t) => [{ x: -31 + Math.cos(t * 0.3) * 2, z: 33 + Math.sin(t * 0.3) * 2 }];
  const onPond = (k) => Math.hypot(k.x - POND.x, k.z - POND.z) < POND.r - 0.5;
  const onJetty = (k) => k.x > JETTY.minX && k.x < JETTY.maxX && k.z > JETTY.minZ && k.z < JETTY.maxZ;

  it('paddle after the duck in a line, on the water and off the jetty', () => {
    const sim = createFarmSim(area);
    let t = 0;
    for (; t < 300; t += DT) {
      const d = ducks(t);
      sim.step(DT, awayCat(), { ducks: d });
      for (const k of sim.ducklings) { expect(onPond(k), k.id).toBe(true); expect(onJetty(k), k.id).toBe(false); }
      if (t > 20) {
        sim.ducklings.forEach((k, i) => expect(dist(k, d[0]), k.id).toBeLessThan(DUCKLING.FIRST + DUCKLING.GAP * i + 0.6));
      }
    }
    expect(sim.ducklingsWithCat).toBe(false);
  });

  it('swim after a cat in the pond, in a line, and go back to the duck when she climbs out', () => {
    const sim = createFarmSim(area);
    let t = 0;
    const stepAll = (seconds, cat) => {
      const end = t + seconds;
      const events = [];
      for (; t < end; t += DT) { const c = typeof cat === 'function' ? cat(t) : cat; sim.step(DT, c, { ducks: ducks(t) }); events.push(...sim.events); }
      return events;
    };
    stepAll(20, awayCat());
    // a cat on the bank is not followed
    stepAll(10, catAt(-31, 26.2));
    expect(sim.ducklingsWithCat).toBe(false);
    // she swims slowly across the pond
    const t0 = t;
    const swim = (now) => catAt(-32 + (now - t0) * 0.35, 31 + Math.sin((now - t0) * 0.4), { inWater: true, speed: 0.4, fx: 1, fz: 0 });
    const events = stepAll(14, swim);
    expect(events.filter((e) => e.type === 'ducklings-follow')).toHaveLength(1);
    expect(sim.ducklingsWithCat).toBe(true);
    const cat = swim(t);
    sim.ducklings.forEach((k, i) => {
      expect(dist(k, cat), k.id).toBeLessThan(DUCKLING.FIRST + DUCKLING.GAP * i + 0.5);
      expect(onPond(k)).toBe(true);
      expect(onJetty(k)).toBe(false);
    });
    // out she gets
    stepAll(25, catAt(-20, 30));
    expect(sim.ducklingsWithCat).toBe(false);
    sim.ducklings.forEach((k, i) => expect(dist(k, ducks(t)[0]), k.id).toBeLessThan(DUCKLING.FIRST + DUCKLING.GAP * i + 0.8));
  });

  it('still paddle about if the pond has no duck', () => {
    const sim = createFarmSim(area);
    const at = sim.ducklings.map((k) => ({ x: k.x, z: k.z }));
    run(sim, 60, awayCat(), (s) => { for (const k of s.ducklings) expect(onPond(k)).toBe(true); });
    expect(sim.ducklings.some((k, i) => dist(k, at[i]) > 0.5)).toBe(true);
  });
});

describe('nothing at the Farm can be hunted, and each animal has its journal page', () => {
  it('none of them is a creature critters.js knows how to chase, stalk or pounce on', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('../src/critters.js', import.meta.url), 'utf8');
    const sets = Object.fromEntries(['CHASEABLE', 'STALKABLE', 'PREY'].map((name) => {
      const m = src.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`));
      return [name, m[1].split(',').map((s) => s.trim().replace(/'/g, ''))];
    }));
    for (const type of FARM_ANIMAL_TYPES) {
      for (const [name, members] of Object.entries(sets)) expect(members, `${type} in ${name}`).not.toContain(type);
    }
    // and the Farm asks critters.js for none of them (they are not critters at all)
    const spawned = new Set(area.critterSpawns.map((c) => c.type));
    for (const type of [...FARM_ANIMAL_TYPES, 'goat', 'dog']) expect(spawned.has(type), type).toBe(false);
  });

  it('has a journal page, a label and child-sized words for each', () => {
    for (const type of FARM_ANIMAL_TYPES) {
      expect(JOURNAL_TYPES).toContain(type);
      const page = CRITTER_INFO.find((c) => c.id === type);
      expect(page, type).toBeTruthy();
      expect(page.name.split(' ').length).toBeLessThanOrEqual(3);
      expect(page.hint.split(' ').length).toBeLessThanOrEqual(10);
      expect(labelFor(type)).not.toBe('something interesting');
      // the Farm is shared by both word sets: no borrowed words
      expect(`${page.name} ${page.hint} ${labelFor(type)}`).not.toMatch(/clan|warrior|twoleg|kittypet|loner|rogue|prey|fresh-kill/i);
    }
    // the mountain goat and the yard dog keep their own pages
    expect(CRITTER_INFO.find((c) => c.id === 'goat').name).toBe('Mountain Goat');
    expect(CRITTER_INFO.find((c) => c.id === 'dog').name).toBe('Friendly Dog');
  });
});

describe('the little helpers', () => {
  it('a trail gives the spot a set way behind its leader', () => {
    const trail = createTrail(0.2);
    for (let x = 0; x <= 10; x += 0.1) trail.push(x, 0);
    const p = trail.behind(10, 0, 3);
    expect(p.x).toBeCloseTo(7, 5);
    expect(p.z).toBeCloseTo(0, 5);
    // a short trail: its far end
    const short = createTrail();
    short.push(1, 1);
    expect(short.behind(1, 1, 5)).toEqual({ x: 1, z: 1 });
  });

  it('a polyline knows its length, a point along it and how far along a spot is', () => {
    const line = polyline([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }]);
    expect(line.length).toBe(7);
    expect(line.at(5)).toMatchObject({ x: 4, z: 1 });
    expect(line.at(99)).toMatchObject({ x: 4, z: 3 });
    expect(line.project(2, 1)).toBeCloseTo(2, 9);
    expect(line.project(5, 2)).toBeCloseTo(6, 9);
  });
});
