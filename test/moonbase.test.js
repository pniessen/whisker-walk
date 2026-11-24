// The Moon, milestone 2: the base as built. The dome's walls and its one way in (the airlock), every place a prompt or a find needs is
// walkable from the spawn, the Ridge cell's climb (impossible on any Earth budget, possible on the Moon's, with the walk's own rules),
// the Rover cell's placeholder, and what is switched off on the Moon (strays, clan cats, rivals, the daily goals, the air's sounds).
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import { build } from '../src/world/moon.js';
import { createMoonLife } from '../src/world/moonlife.js';
import { placeBudget } from '../src/placephysics.js';
import { climbBudget, canReach, bestPerch, BASE_CLIMB_BUDGET } from '../src/climbing.js';
import { CAT_RADIUS } from '../src/player.js';
import { createStrayCats } from '../src/straycats.js';
import { castFor } from '../src/clancast.js';
import { rivalForWalk } from '../src/edition.js';
import { isIndoor, INDOOR_AREAS } from '../src/indoor.js';
import { perchHops } from './helpers/findreach.js';
import { canvasDocument } from './helpers/canvas.js';
import { createProgression } from '../src/progression.js';
import { mem } from './helpers/lighthouselife.js';
import { readFileSync, globSync } from 'node:fs';

const built = () => { const scene = new THREE.Scene(); return { scene, area: build(scene) }; };

// The walk's own collision: a cat is a circle (CAT_RADIUS) that may not overlap a collider circle. A 0.3 m grid flood from the spawn.
function floodFrom(colliders, from, step = 0.3) {
  const b = P.MOON_BOUNDS;
  const nx = Math.round((b.maxX - b.minX) / step) + 1;
  const nz = Math.round((b.maxZ - b.minZ) / step) + 1;
  const free = new Uint8Array(nx * nz);
  const seen = new Uint8Array(nx * nz);
  const near = (x, z) => colliders.filter((c) => Math.abs(c.x - x) < c.r + 1 && Math.abs(c.z - z) < c.r + 1);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = b.minX + i * step; const z = b.minZ + j * step;
    free[j * nx + i] = near(x, z).every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + CAT_RADIUS) ? 1 : 0;
  }
  const start = (Math.round((from.z - b.minZ) / step)) * nx + Math.round((from.x - b.minX) / step);
  const q = [start];
  seen[start] = 1;
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    const i = k % nx; const j = (k / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di; const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const kk = jj * nx + ii;
      if (free[kk] && !seen[kk]) { seen[kk] = 1; q.push(kk); }
    }
  }
  return { reaches: (x, z) => { const i = Math.round((x - b.minX) / step); const j = Math.round((z - b.minZ) / step); return !!seen[j * nx + i]; },
    anyWithin: (x, z, r) => { for (let dz = -r; dz <= r; dz += step) for (let dx = -r; dx <= r; dx += step) if (dx * dx + dz * dz <= r * r) { const i = Math.round((x + dx - b.minX) / step); const j = Math.round((z + dz - b.minZ) / step); if (seen[j * nx + i]) return true; } return false; } };
}

describe('the dome', () => {
  const { area } = built();
  const flood = floodFrom(area.colliders, P.MOON_SPAWN);
  it('has one way in: the airlock. Sealed there, nothing inside is reachable; open, the Core, the board, every planter and the dome\'s floor are', () => {
    for (const [x, z] of [[P.DOME.x, P.DOME.z + 3], [P.DOME.x - 5, P.DOME.z], [P.DOME.x + 4, P.DOME.z - 4]]) expect(flood.reaches(x, z), `${x},${z}`).toBe(true);
    // a plug across the tunnel's mouth: the dome's inside is no longer reachable from outside
    const seal = [...area.colliders, { x: P.AIRLOCK.x1 - 0.2, z: P.AIRLOCK.z, r: P.AIRLOCK.half }];
    const sealed = floodFrom(seal, P.MOON_SPAWN);
    for (const [x, z] of [[P.DOME.x, P.DOME.z + 3], [P.DOME.x - 5, P.DOME.z], [P.DOME.x + 4, P.DOME.z - 4]]) expect(sealed.reaches(x, z), `sealed ${x},${z}`).toBe(false);
  });
  it('the wall closes on itself: neighbouring pillars overlap, so no cat slips between them', () => {
    const ring = P.DOME_RING;
    expect(ring.length).toBeGreaterThan(30);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]; const b = ring[(i + 1) % ring.length];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 3) expect(d, `pillar ${i}`).toBeLessThanOrEqual(a.r + b.r);
    }
  });
  it('the airlock is wide enough for a cat (clear width at least a cat\'s diameter and a half) and every tunnel wall piece is inside the plan\'s tunnel', () => {
    const tunnel = area.colliders.filter((c) => c.x >= P.AIRLOCK.x0 && c.x <= P.AIRLOCK.x1 && Math.abs(c.z - P.AIRLOCK.z) > 1);
    expect(tunnel.length).toBe(10);
    const clear = 2 * (P.AIRLOCK.half - 0.45);
    expect(clear).toBeGreaterThan(CAT_RADIUS * 3);
  });
  it('every place a prompt or a find needs is walkable from the spawn: Pip\'s bed, the flag, the Core\'s sockets, the board, each planter, the Old Dish, the Rover cell, the foot of each Skip pillar', () => {
    expect(flood.anyWithin(P.PIP_SLEEP.x, P.PIP_SLEEP.z, 2.3)).toBe(true);
    expect(flood.anyWithin(P.FLAG.x, P.FLAG.z, 2.4)).toBe(true);
    for (const s of P.SOCKETS) expect(flood.anyWithin(s.x, s.z, 3.0)).toBe(true);
    expect(flood.anyWithin(P.BOARD.x + 1.5, P.BOARD.z, 2.7)).toBe(true);
    for (const p of P.PLANTERS) expect(flood.anyWithin(p.x, p.z, 1.9), `planter ${p.x}`).toBe(true);
    expect(flood.anyWithin(P.OLD_DISH.x, P.OLD_DISH.z, 3.0)).toBe(true);
    expect(flood.anyWithin(P.ROVER_CELL.x, P.ROVER_CELL.z, 1.9)).toBe(true);
    for (const p of P.SKIP) expect(flood.anyWithin(p.x, p.z, 3.5)).toBe(true);
  });
  it('the spawn\'s walk to the airlock\'s front is open, and Pip\'s lead path keeps clear of every collider', () => {
    expect(flood.reaches(P.AIRLOCK.front.x, P.AIRLOCK.front.z)).toBe(true);
    const pts = [P.PIP_SLEEP, ...P.PIP_LEAD];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]; const b = pts[i + 1];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
      for (let k = 0; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n; const z = a.z + ((b.z - a.z) * k) / n;
        for (const c of area.colliders) expect(Math.hypot(x - c.x, z - c.z), `leg ${i} at ${x.toFixed(1)},${z.toFixed(1)} vs ${c.x},${c.z}`).toBeGreaterThan(c.r + 0.4);
      }
    }
  });
  it('the base is inside the bounds, clear of the landing site and the gate ring, and no boulder is in or on it', () => {
    const inb = (x, z, m = 0) => x >= P.MOON_BOUNDS.minX + m && x <= P.MOON_BOUNDS.maxX - m && z >= P.MOON_BOUNDS.minZ + m && z <= P.MOON_BOUNDS.maxZ - m;
    for (const c of P.BASE_COLLIDERS) expect(inb(c.x, c.z, 0.5), JSON.stringify(c)).toBe(true);
    for (const b of P.BOULDERS) {
      expect(Math.hypot(b.x - P.DOME.x, b.z - P.DOME.z), 'boulder in the dome').toBeGreaterThan(P.DOME.r + b.r + 1);
      expect(Math.hypot(b.x - P.OLD_DISH.x, b.z - P.OLD_DISH.z)).toBeGreaterThan(b.r + 3);
      for (const s of P.SKIP) expect(Math.hypot(b.x - s.x, b.z - s.z)).toBeGreaterThan(b.r + s.r + 1);
    }
    expect(Math.hypot(P.DOME.x - P.RETURN_GATE.x, P.DOME.z - P.RETURN_GATE.z)).toBeGreaterThan(P.DOME.r + 5);
  });
});

describe('the Ridge cell: a ledge-hop chain only the Moon\'s doubled climb takes (the walk\'s own reach rules)', () => {
  const { area } = built();
  const top = P.SKIP[1];
  const cell = { x: P.RIDGE_CELL.x, z: P.RIDGE_CELL.z, y: P.RIDGE_CELL.y };
  const budgets = {
    earthBase: BASE_CLIMB_BUDGET,
    earthSpring: climbBudget({ skills: ['spring-paws'] }),
    earthClaws: climbBudget({ skills: ['sure-claws'] }),
    earthBoth: climbBudget({ skills: ['spring-paws', 'sure-claws'] }),
    moon: placeBudget({}, 'moon'),
    moonSpring: placeBudget({ skills: ['spring-paws'] }, 'moon'),
    moonBoth: placeBudget({ skills: ['spring-paws', 'sure-claws'] }, 'moon'),
  };
  it('on the Moon it takes two hops, every way she can have the skills; on Earth, with every skill, no hop at all', () => {
    for (const k of ['moon', 'moonSpring', 'moonBoth']) expect(perchHops(area.perches, cell, { budget: budgets[k] }), k).toBe(2);
    for (const k of ['earthBase', 'earthSpring', 'earthClaws', 'earthBoth']) expect(perchHops(area.perches, cell, { budget: budgets[k] }), k).toBe(Infinity);
  });
  it('each step is more than Earth\'s best climb and no more than the Moon\'s plainest', () => {
    const steps = [P.SKIP[0].y, P.SKIP[1].y - P.SKIP[0].y];
    for (const s of steps) {
      expect(s).toBeGreaterThan(budgets.earthBoth.climb);
      expect(s).toBeLessThanOrEqual(budgets.moon.climb);
    }
    expect(top.y).toBeGreaterThan(budgets.moonBoth.climb); // never a single hop, even with Spring Paws: a chain
  });
  it('the real pick, as a press of the pounce button makes it: from the dust the first pillar, from it the top, and from the top a way down', () => {
    const ground = area.ground;
    const g = (x, z) => ground.y(x, z);
    const near = (p, d) => ({ x: p.x - d, z: p.z + d * 0.3 });
    const first = bestPerch(area.perches, near(P.SKIP[0], 2.2), 0, null, budgets.moon, { ground });
    expect(first?.y).toBe(P.SKIP[0].y);
    const second = bestPerch(area.perches, { x: first.x, z: first.z }, first.y, first, budgets.moon, { ground });
    expect(second?.y).toBe(top.y);
    // and the cell is where she lands: the perch's own spot
    expect(Math.hypot(second.x - cell.x, second.z - cell.z)).toBeLessThan(1.0); // within the pick-up window of her landing spot, a step to the side of it
    const down = bestPerch(area.perches, { x: second.x, z: second.z }, second.y, second, budgets.moon, { ground });
    expect(down === null || down.y < second.y).toBe(true); // she can always hop down: a lower perch or the ground (no fail state)
    // Earth's cat at the same foot: nothing
    expect(bestPerch(area.perches, near(P.SKIP[0], 2.2), 0, null, budgets.earthBoth, { ground })).toBe(null);
    expect(Math.abs(g(top.x, top.z) - g(P.SKIP[0].x, P.SKIP[0].z))).toBeLessThan(0.5); // the pillars stand on one level (the walk's rule)
  });
  it('she lands in the middle of the first pillar and the second is in reach from there and from the whole half of its top that faces it', () => {
    const dir = Math.atan2(P.SKIP[1].z - P.SKIP[0].z, P.SKIP[1].x - P.SKIP[0].x);
    expect(canReach({ ...P.SKIP[1], kind: 'stone' }, P.SKIP[0], P.SKIP[0].y, budgets.moon)).toBe(true);
    for (let a = 0; a < 16; a++) {
      const th = dir - Math.PI / 2 + (a / 15) * Math.PI;
      const at = { x: P.SKIP[0].x + Math.cos(th) * 1.3, z: P.SKIP[0].z + Math.sin(th) * 1.3 };
      expect(canReach({ ...P.SKIP[1], kind: 'stone' }, at, P.SKIP[0].y, budgets.moon), `angle ${a}`).toBe(true);
    }
  });
  it('the pillars are standing on a flat enough place for the walk\'s level rule, and are colliders the cat cannot walk into', () => {
    for (const p of P.SKIP) {
      expect(area.colliders.some((c) => c.x === p.x && c.z === p.z && c.r >= p.r)).toBe(true);
      expect(area.perches.some((q) => q.x === p.x && q.z === p.z && q.y === p.y && q.kind === 'stone')).toBe(true);
    }
  });
});

describe('the Rover cell (milestone 3: the real Far Beacon; the placeholder is gone)', () => {
  it('is the real thing: no placeholder mark, and it stands where the spec puts the Far Beacon, 70 m from the landing', () => {
    expect(P.ROVER_CELL.placeholder).toBeUndefined();
    expect(P.FAR_BEACON.x).toBe(P.ROVER_CELL.x);
    expect(P.FAR_BEACON.z).toBe(P.ROVER_CELL.z);
    expect(P.ROVER_CELL.x).toBe(46);
    expect(P.ROVER_CELL.z).toBe(0);
    const d = Math.hypot(P.ROVER_CELL.x - P.MOON_SPAWN.x, P.ROVER_CELL.z - P.MOON_SPAWN.z);
    expect(d).toBeGreaterThan(55);
    expect(d).toBeLessThan(75);
  });
});

describe('what is off on the Moon (spec 5.3)', () => {
  const { scene, area } = built();
  it('no strays, no wanderer and no colony cats: the area says strays false and a real stray build makes none, whatever count the tier asks for', () => {
    expect(area.strays).toBe(false);
    const made = createStrayCats(scene, area, 22, () => 0.5, {});
    expect(made.strays).toHaveLength(0);
  });
  it('no clan cats and no rival: the Moon is no clan\'s territory', () => {
    expect(castFor('moon')).toHaveLength(0);
    for (const edition of ['canon', 'everyday', undefined]) expect(rivalForWalk('moon', edition, [])).toBeFalsy();
  });
  it('the sound is not the den\'s fire: the Moon is not an indoor place (the list is exactly the den and the house)', () => {
    expect(isIndoor('moon')).toBe(false);
    expect(INDOOR_AREAS).toEqual(['den', 'house']);
  });
  it('the daily goals are gone on the first frame (session.goals null, the HUD panel hidden) and the birdsong and crickets are stopped; the den\'s fire is never started', () => {
    const el = { classList: { add: vi.fn() } };
    vi.stubGlobal('document', { ...canvasDocument(), getElementById: (id) => (id === 'hud-goals' ? el : null) });
    try {
      const audio = { stopAmbient: vi.fn(), startAmbient: vi.fn() };
      const sc = new THREE.Scene();
      const a = build(sc);
      const life = a.life({ scene: sc, ground: a.ground, audio, progression: createProgression(mem()), reducedMotion: false, tier: { name: 'high' } });
      const session = { goals: { goals: [{ id: 'x' }] }, pounceTime: 0, fx: null };
      life.update(0.016, 0, { x: 0, y: 0, z: 45 }, new THREE.PerspectiveCamera(), session);
      expect(session.goals).toBe(null);
      expect(el.classList.add).toHaveBeenCalledWith('hidden');
      expect(audio.stopAmbient).toHaveBeenCalledTimes(1);
      life.update(0.016, 0.016, { x: 0, y: 0, z: 45 }, new THREE.PerspectiveCamera(), session);
      expect(audio.stopAmbient).toHaveBeenCalledTimes(1); // once
      expect(audio.startAmbient).not.toHaveBeenCalled();
      life.dispose();
    } finally { vi.unstubAllGlobals(); }
  });
  it('with no document or audio at all (a headless build) the life still runs', () => {
    const sc = new THREE.Scene();
    const a = build(sc);
    const life = createMoonLife({ scene: sc, ground: a.ground, colliders: a.colliders, progression: { state: { skills: [] } } });
    life.update(0.016, 0, { x: 0, y: 0, z: 45 }, new THREE.PerspectiveCamera(), { goals: null, pounceTime: 0 });
    life.dispose();
  });
});

describe('the kit as drawn', () => {
  const { scene } = built();
  it('the pieces the life moves are found by name, each a mesh of its own that nothing merges', () => {
    for (const n of ['moon:lamp', 'moon:coreglow', 'moon:glass', 'moon:doorL', 'moon:doorR', 'moon:board']) {
      const m = scene.getObjectByName(n);
      expect(m, n).toBeTruthy();
      expect(m.userData.noMerge, n).toBe(true);
    }
    expect(scene.getObjectByName('moon:glass').material.transparent).toBe(true);
    expect(scene.getObjectByName('moon:glass').castShadow).toBe(false);
  });
  it('is the same picture every time (no random number, no clock)', () => {
    const sum = (s) => { let n = 0; s.traverse((o) => { if (o.geometry?.attributes?.position) for (const v of o.geometry.attributes.position.array) n += v; }); return n; };
    expect(sum(built().scene)).toBe(sum(built().scene));
  });
});

describe('start-up growth (the Moon\'s budget is spent: this milestone adds none)', () => {
  it('nothing outside the Moon\'s own lazy files imports any of them (the area loader\'s one dynamic import excepted), and no start-up file of the walk changed its imports for the base', () => {
    const files = globSync('src/**/*.js').map((f) => f.split('\\').join('/')).filter((f) => !/^src\/world\/moon[a-z]*\.js$/.test(f));
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;\n]*from\s+'([^']*world\/moon[a-z]*\.js)'/g)) throw new Error(`${f} imports ${m[1]}`);
      if (f !== 'src/world/areas.js') expect(src, f).not.toMatch(/import\(['"][^'"]*world\/moon/);
    }
  });
  it('the moonpages.js the journal reads and the flag are the whole of the Moon\'s start-up code, as milestone 0 left them', () => {
    expect(readFileSync('src/moonpages.js', 'utf8')).not.toMatch(/^import/m);
    expect(readFileSync('src/moonflag.js', 'utf8')).not.toMatch(/^import/m);
  });
});
