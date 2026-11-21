import { describe, it, expect, vi, afterEach } from 'vitest';
import { createGround } from '../src/ground.js';
import {
  ROOFS_TRAVERSAL, ROOFS_GROUND, LEVELS, STREETS, PITCHED, BLOCKS, skylineY, ROOFS_SPAWN, ROOFS_BOUNDS,
  ROOFS_COLLIDERS, ROOFS_DISCOVERIES, ROOFS_PERCHES, WASHING_POSTS, YARD_WALLS,
} from '../src/world/roofsplan.js';
import {
  FLIGHT, BIRD_KINDS, ROOFS_BIRDS, GUIDE, LOFT_REST, OUT_OF_SIGHT, DRAWN_ID, PERCH_LIFT,
  flockPerches, perchIndex, flightGraph, flightPlan, flightPoint, chooseFlight, roofsCritterSpawns,
} from '../src/world/roofsflock.js';

// The flock's plan (Rooftops step 3), pure: where the birds perch, the short
// flights between perches, the fourteen birds, the guide's route, and the
// choice of flight that leads her up the place and never toward her. On the
// plan alone (ruling R3: no drawn spots here; test/roofs.test.js checks the
// built area's), except where a test passes its own SYNTHETIC drawn spots.

const ground = createGround(ROOFS_GROUND);
const P = flockPerches({ traversal: ROOFS_TRAVERSAL, ground });
const I = perchIndex(P);
const G = flightGraph(P, ROOFS_TRAVERSAL);
const L = LEVELS;
const BLOCK = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));
const HOPS = [...ROOFS_TRAVERSAL.gaps, ...ROOFS_TRAVERSAL.climbs, ...ROOFS_TRAVERSAL.drops];
const LOCKED = ROOFS_TRAVERSAL.gaps.filter((g) => g.requires); // leaps that need a skill: none in step 3
const UNLOCKED = HOPS.filter((h) => !h.requires);
// Every move she makes, as [take-off id, landing id, its crossing or null]:
// each crossing both ways, every leap she can make, every climb and drop.
const MOVES = [
  ...ROOFS_TRAVERSAL.crossings.flatMap((c) => [[`${c.id}:0`, `${c.id}:1`, c], [`${c.id}:1`, `${c.id}:0`, c]]),
  ...UNLOCKED.map((h) => [`${h.id}:from`, `${h.id}:to`, null]),
];
// The far ends of her moves: a crossing's end 1, a leap's, climb's or drop's landing.
const FAR_ENDS = new Set([...ROOFS_TRAVERSAL.crossings.map((c) => `${c.id}:1`), ...UNLOCKED.map((h) => `${h.id}:to`)]);
// The perches where her moves end: both of a crossing's ends, every landing she can make.
const MOVE_ENDS = new Set([
  ...ROOFS_TRAVERSAL.crossings.flatMap((c) => [`${c.id}:0`, `${c.id}:1`]),
  ...UNLOCKED.map((h) => `${h.id}:to`),
].map((id) => I.get(id).id));
const NONE = new Set();

const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const allowed = (kind, p) => BIRD_KINDS[kind].perches.includes(p.kind) && p.y < BIRD_KINDS[kind].below;
const bird = (kind, at, extra = {}) => ({ index: 3, kind, at, flights: 0, guideStep: -1, ...extra });
const ring = (p, r = 2.2, n = 16) => Array.from({ length: n }, (_, k) => {
  const a = (2 * Math.PI * k) / n;
  return { x: p.x + r * Math.cos(a), y: p.y, z: p.z + r * Math.sin(a) };
});
// Her spot `back` metres behind `p`, against the way from `from` to `p`.
const behind = (p, from, back) => {
  const n = d2(p, from);
  return { x: p.x + ((from.x - p.x) / n) * back, y: p.y, z: p.z + ((from.z - p.z) / n) * back };
};
const linkOf = (a, b) => (G.links.get(a.id) || []).find((l) => l.to === b.id);

// The flight's s for a share f of its way across (x and z run on smoothstep),
// by bisection: the test's own, not the module's.
const sOf = (f) => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (m * m * (3 - 2 * m) < f) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
};
// a flight's spot, in the shape of the link that joins its ends (the arc when none does)
const at = (a, b, s, shape = linkOf(a, b)?.shape ?? 'arc') => flightPoint(a, b, flightPlan(a, b, shape), s, { x: 0, y: 0, z: 0 });
// the rail's height at its point nearest (x, z)
const railY = (c, x, z) => {
  let best = Infinity;
  let y = 0;
  for (let i = 1; i < c.points.length; i++) {
    const [p, q] = [c.points[i - 1], c.points[i]];
    const [dx, dz] = [q.x - p.x, q.z - p.z];
    const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz)));
    const e = Math.hypot(x - p.x - dx * t, z - p.z - dz * t);
    if (e < best) { best = e; y = p.y + (q.y - p.y) * t; }
  }
  return y;
};

// The flight rules near her, checked from the outside.
function keepsOffHer(from, to, cat) {
  if (d3(to, cat) < FLIGHT.landFromCat - 1e-9) return 'lands within 4 m of her';
  if (d3(to, cat) <= d3(from, cat) + 0.5) return 'lands no further from her';
  for (let s = 0.1; s <= 0.9 + 1e-9; s += 0.05) if (d3(at(from, to, s), cat) < FLIGHT.clearCat - 1e-9) return `passes within 1.5 m of her at s ${s.toFixed(2)}`;
  return null;
}

// The choice, worked out the long way from the rules (for the guide test).
function expectedChoice(b, cat, taken) {
  const K = BIRD_KINDS[b.kind];
  const from = I.get(b.at);
  const scored = [];
  for (const l of G.links.get(from.id)) {
    const to = I.get(l.to);
    if (!allowed(b.kind, to) || taken.has(to.id)) continue;
    if (l.kind === 'hop' ? l.d < K.hop.min || l.d > K.hop.max : !K.leads && l.d > K.hop.max) continue;
    if (keepsOffHer(from, to, cat)) continue;
    const nearer = G.homeDist.get(to.id) < G.homeDist.get(from.id);
    const level = G.homeDist.get(to.id) <= G.homeDist.get(from.id);
    const end = MOVE_ENDS.has(to.id) && (l.kind === 'move' || level);
    const score = (K.leads ? 2 * (l.kind === 'move') + nearer + end : -Math.abs(l.d - 5) / 5);
    scored.push([score, l]);
  }
  if (!scored.length) return null;
  scored.sort((p, q) => q[0] - p[0]);
  // the hash's tie-break adds under 0.25: a runner-up that close may win
  return scored.length > 1 && scored[1][0] > scored[0][0] - 0.25 ? 'tie' : scored[0][1];
}

afterEach(() => vi.restoreAllMocks());

describe('the flock’s plan', () => {
  it('its constants are the plan’s, frozen', () => {
    expect(FLIGHT).toEqual({ min: 3, maxHop: 10, maxMove: 12, up: 5, down: 6, clearSky: 0.25, clearCat: 1.5, landFromCat: 4, speed: 6 });
    expect(LOFT_REST).toBe(90);
    expect(OUT_OF_SIGHT).toBe(30);
    expect(BIRD_KINDS.pigeon).toMatchObject({ critter: 'bird', scale: 1, hop: { min: 3, max: 10 }, leads: true });
    expect(BIRD_KINDS.sparrow).toMatchObject({ critter: 'bird', scale: 0.65, hop: { min: 3, max: 6 }, below: 7, leads: false });
    expect(BIRD_KINDS.gull).toMatchObject({ critter: 'seagull', scale: 1.6, hop: { min: 4, max: 10 }, leads: false });
    expect([...BIRD_KINDS.pigeon.perches].sort()).toEqual(['aerial', 'ground', 'loft', 'move', 'parapet', 'pot', 'ridge', 'roof', 'wall']);
    expect([...BIRD_KINDS.sparrow.perches].sort()).toEqual(['gutter', 'move', 'post', 'roof', 'wall']);
    expect([...BIRD_KINDS.gull.perches].sort()).toEqual(['aerial', 'parapet', 'pot']);
    for (const o of [FLIGHT, BIRD_KINDS, BIRD_KINDS.pigeon, BIRD_KINDS.pigeon.perches, ROOFS_BIRDS, ROOFS_BIRDS[0], GUIDE, GUIDE.route, DRAWN_ID, P, P[0], P[0].aliases]) {
      expect(Object.isFrozen(o)).toBe(true);
    }
  });

  it('the drawn spots’ ids are the plan’s scheme', () => {
    expect(DRAWN_ID.pot(-10, -1)).toBe('pot:-10:-1');
    expect(DRAWN_ID.aerial(20)).toBe('aerial:20');
    expect(DRAWN_ID.parapet('warehouse', 3)).toBe('parapet:warehouse:3');
    expect(DRAWN_ID.parapet('tower-1', 0)).toBe('parapet:tower-1:0');
    expect(() => DRAWN_ID.parapet('terrace', 0)).toThrow(/terrace/);
    expect(DRAWN_ID.post(1, 0)).toBe('post:1:0');
    expect(DRAWN_ID.wall(4)).toBe('wall:4');
  });

  it('every move end is a perch, standing where she stands', () => {
    for (const c of ROOFS_TRAVERSAL.crossings) {
      for (const [k, q] of [[0, c.points[0]], [1, c.points[c.points.length - 1]]]) {
        const p = I.get(`${c.id}:${k}`);
        expect(p, `${c.id}:${k}`).toBeDefined();
        expect(p.kind).toBe('move');
        expect(Math.abs(p.y - q.y), `${c.id}:${k}`).toBeLessThan(0.02);
        expect(d2(p, q)).toBeLessThan(0.5);
      }
    }
    for (const h of HOPS) {
      for (const [k, q] of [['from', h.from], ['to', h.to]]) {
        const p = I.get(`${h.id}:${k}`);
        expect(p, `${h.id}:${k}`).toBeDefined();
        expect(p.kind).toBe('move');
        // on the ground there, or on the soft heap drawn over it (PERCH_LIFT: the bin bags)
        expect(Math.abs(p.y - ground.y(q.x, q.z) - (PERCH_LIFT[p.id] ?? 0)), `${h.id}:${k}`).toBeLessThan(0.02);
        expect(d2(p, q)).toBeLessThan(0.5);
      }
    }
    // one perch per spot: no two within 0.5 m and 0.3 m of height
    for (let i = 0; i < P.length; i++) {
      for (let j = i + 1; j < P.length; j++) {
        expect(d2(P[i], P[j]) >= 0.5 || Math.abs(P[i].y - P[j].y) > 0.3, `${P[i].id} ${P[j].id}`).toBe(true);
      }
    }
    // the index finds every id and alias, and nothing else
    expect(I.size).toBe(P.reduce((n, p) => n + 1 + p.aliases.length, 0));
  });

  it('ridges every 2 m, peck spots on the flat roofs, six on the loft, the guide in the alley', () => {
    for (const c of ROOFS_TRAVERSAL.crossings.filter((r) => r.kind === 'ridge')) {
      const on = P.filter((p) => p.kind === 'ridge' && p.id.startsWith(`${c.id}:`));
      expect(on.length, c.id).toBeGreaterThanOrEqual(2);
      const a = c.points[0];
      const b = c.points[c.points.length - 1];
      const stops = [a, ...on.sort((p, q) => d2(p, a) - d2(q, a)), b];
      for (let i = 1; i < stops.length; i++) expect(d2(stops[i - 1], stops[i]), c.id).toBeLessThanOrEqual(2 + 1e-9);
      for (const p of on) {
        expect(p.y).toBe(L.RIDGE);
        expect(Math.abs(p.z - a.z)).toBeLessThan(1e-9);
      }
    }
    const want = { garages: 3, 'ext-3': 1, 'ext-6': 1, 'ext-9': 1, 'ext-12': 1, flatHouse: 1, dormer: 1, cornerShop: 2, warehouse: 8 };
    const roofs = P.filter((p) => p.kind === 'roof');
    expect(roofs.length).toBe(Object.values(want).reduce((s, n) => s + n, 0));
    const takeoffs = [
      ...HOPS.flatMap((h) => [h.from, h.to]),
      ...ROOFS_TRAVERSAL.crossings.flatMap((c) => [c.points[0], c.points[c.points.length - 1]]),
    ];
    const toRail = (p, c) => Math.min(...c.points.slice(1).map((b, i) => {
      const a = c.points[i];
      const [dx, dz] = [b.x - a.x, b.z - a.z];
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
    }));
    for (const [id, n] of Object.entries(want)) {
      const on = roofs.filter((p) => p.id.startsWith(`roof:${id}:`));
      expect(on.length, id).toBe(n);
      for (const p of on) {
        expect(p.peck).toBe(true);
        expect(inRect(BLOCK[id], p.x, p.z), p.id).toBe(true);
        expect(p.y).toBe(BLOCK[id].y);
        // on the 1 m grid
        expect(Math.abs(((p.x - BLOCK[id].x0 - 0.5) % 1 + 1) % 1)).toBeLessThan(1e-9);
        expect(Math.abs(((p.z - BLOCK[id].z0 - 0.5) % 1 + 1) % 1)).toBeLessThan(1e-9);
        // 0.4 m from the roof's edge: the roof's own height all round
        for (const [dx, dz] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4], [0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28]]) {
          expect(ground.y(p.x + dx, p.z + dz), p.id).toBe(BLOCK[id].y);
        }
        expect(skylineY(p.x, p.z)).toBe(BLOCK[id].y);
        for (const t of takeoffs) expect(d2(p, t), p.id).toBeGreaterThanOrEqual(0.8);
        for (const c of ROOFS_TRAVERSAL.crossings) expect(toRail(p, c), `${p.id} ${c.id}`).toBeGreaterThanOrEqual(0.5);
        for (const c of ROOFS_COLLIDERS) expect(d2(p, c) - c.r, p.id).toBeGreaterThanOrEqual(1.2);
        for (const q of [...Object.values(ROOFS_DISCOVERIES), ...ROOFS_PERCHES]) expect(d2(p, q), p.id).toBeGreaterThanOrEqual(1.2);
      }
    }
    const loft = P.filter((p) => p.kind === 'loft');
    expect(loft.length).toBe(6);
    for (const p of loft) {
      expect(inRect(BLOCK.loft, p.x, p.z)).toBe(true);
      expect(p.y).toBe(L.TANK);
      expect(ground.y(p.x, p.z)).toBe(L.TANK);
    }
    const g = I.get('guide:alley');
    expect(g.kind).toBe('ground');
    expect(g.id).toBe('guide:alley');
    expect(Math.hypot(g.x - 5.5, g.z - 36.5)).toBeLessThanOrEqual(1);
    expect(g.y).toBe(ground.y(g.x, g.z));
    const r = Math.hypot(g.x - ROOFS_SPAWN.x, g.z - ROOFS_SPAWN.z);
    expect(r).toBeGreaterThanOrEqual(3);
    expect(r).toBeLessThanOrEqual(6);
    // north is -z: within 25 degrees of it
    expect(Math.abs(Math.atan2(g.x - ROOFS_SPAWN.x, ROOFS_SPAWN.z - g.z))).toBeLessThanOrEqual((25 * Math.PI) / 180);
    for (const c of ROOFS_COLLIDERS) expect(d2(g, c) - c.r).toBeGreaterThanOrEqual(0.5);
  });

  it('no perch over the street, under a pitched roof’s void or on a smoking pot', () => {
    const check = (perches) => {
      for (const p of perches) {
        for (const s of STREETS) expect(inRect(s, p.x, p.z), p.id).toBe(false);
        if (!['ridge', 'pot', 'aerial'].includes(p.kind)) {
          for (const r of PITCHED) expect(inRect(r, p.x, p.z) && p.y < L.FLAT, p.id).toBe(false);
        }
      }
    };
    check(P);
    // SYNTHETIC drawn spots, standing in for roofs.js's: two pots, one smoking;
    // a parapet over the street, one over the ginnel; a post low over the slates
    const pot = (id, z) => ({ id, kind: 'pot', x: -10, y: 8.7, z });
    const drawn = [
      pot('pot:a', 6.95), pot('pot:b', 8.05),
      { id: 'parapet:warehouse:street', kind: 'parapet', x: 0, y: 11.67, z: -12.875 },
      { id: 'parapet:warehouse:ginnel', kind: 'parapet', x: 38.125, y: 11.67, z: -20 },
      { id: 'post:slates', kind: 'post', x: -15, y: 6.3, z: 5 },
    ];
    const withDrawn = flockPerches({ traversal: ROOFS_TRAVERSAL, ground, drawn, smoking: ['pot:a'] });
    check(withDrawn);
    expect(withDrawn.filter((p) => p.kind === 'pot').map((p) => p.id)).toEqual(['pot:b']);
    expect(withDrawn.filter((p) => p.kind === 'parapet').map((p) => p.id)).toEqual(['parapet:warehouse:ginnel']);
    expect(withDrawn.some((p) => p.id === 'post:slates')).toBe(false);
    // the plan's perches are the same with or without the drawn ones
    expect(withDrawn.filter((p) => !drawn.some((q) => q.id === p.id))).toEqual(P);
    expect(() => flockPerches({ traversal: ROOFS_TRAVERSAL, ground, drawn: [{ id: 'x', kind: 'chimney', x: 0, y: 9, z: 7.5 }] })).toThrow(/chimney/);
  });

  it('every link is short and clears the roofs between', () => {
    let n = 0;
    for (const [id, links] of G.links) {
      const a = I.get(id);
      expect(a.id).toBe(id);
      for (const l of links) {
        n++;
        const b = I.get(l.to);
        expect(b.id).toBe(l.to);
        expect(l.d).toBeCloseTo(d2(a, b), 9);
        if (l.kind === 'move') {
          expect(l.d, `${id} -> ${l.to}`).toBeLessThanOrEqual(FLIGHT.maxMove);
        } else {
          expect(l.kind).toBe('hop');
          expect(l.d).toBeGreaterThanOrEqual(FLIGHT.min);
          expect(l.d).toBeLessThanOrEqual(FLIGHT.maxHop);
        }
        expect(b.y - a.y).toBeLessThanOrEqual(FLIGHT.up);
        expect(a.y - b.y).toBeLessThanOrEqual(FLIGHT.down);
        // what it keeps 0.25 m over: a crossing's own rail, else the skyline
        const crossing = l.kind === 'move' && MOVES.find(([f, t, c]) => c && I.get(f) === a && I.get(t) === b)?.[2];
        const under = crossing ? (x, z) => railY(crossing, x, z) : skylineY;
        // a climb or a drop flies up and over, every other link the arc
        const climbOrDrop = [...ROOFS_TRAVERSAL.climbs, ...ROOFS_TRAVERSAL.drops].some((h) => I.get(`${h.id}:from`) === a && I.get(`${h.id}:to`) === b);
        expect(l.shape, `${id} -> ${l.to}`).toBe(l.kind === 'move' && climbOrDrop ? 'step' : 'arc');
        // the arc every 0.5 m across; the step, finer, by s
        const k = l.shape === 'step' ? 200 : Math.max(1, Math.ceil(l.d / 0.5));
        const samples = Array.from({ length: k + 1 }, (_, i) => (l.shape === 'step' ? i / k : sOf(i / k)));
        for (const s of samples) {
          const q = at(a, b, s);
          if (Math.hypot(q.x - a.x, q.z - a.z) < 0.6 || Math.hypot(q.x - b.x, q.z - b.z) < 0.6) continue;
          expect(q.y, `${id} -> ${l.to} at s ${s.toFixed(3)}`).toBeGreaterThanOrEqual(under(q.x, q.z) + FLIGHT.clearSky - 1e-6);
        }
      }
      expect(new Set(links.map((l) => l.to)).size).toBe(links.length);
    }
    expect(n).toBeGreaterThan(500);
    // every move she makes is a move link: each crossing both ways, every
    // leap she can make, every climb and drop (none is over 12 m)
    expect(MOVES.length).toBe(2 * ROOFS_TRAVERSAL.crossings.length + UNLOCKED.length);
    for (const [f, t] of MOVES) {
      const [a, b] = [I.get(f), I.get(t)];
      expect(d2(a, b), `${f} -> ${t}`).toBeLessThanOrEqual(FLIGHT.maxMove);
      expect(linkOf(a, b)?.kind, `${f} -> ${t}`).toBe('move');
    }
    // and nothing else is: no move link but hers
    let moves = 0;
    for (const [id, links] of G.links) {
      for (const l of links.filter((k) => k.kind === 'move')) {
        moves++;
        expect(MOVES.some(([f, t]) => I.get(f).id === id && I.get(t).id === l.to), `${id} -> ${l.to}`).toBe(true);
      }
    }
    expect(moves).toBe(MOVES.length);
  });

  it('a leap she cannot make yet leads nowhere: no move link, no far end, no lead', () => {
    expect(LOCKED.map((g) => g.id).sort()).toEqual(['long-dormer', 'long-lantern', 'long-terrace']);
    for (const g of LOCKED) {
      const [a, b] = [I.get(`${g.id}:from`), I.get(`${g.id}:to`)];
      // at most a hop, by the hop's rules (long-lantern's is one: tank to lantern, 4.35 m)
      const l = linkOf(a, b);
      if (l) expect(l.kind, g.id).toBe('hop');
      // chased from behind, a pigeon at its take-off never flies it as a move
      const f = chooseFlight(G, I, bird('pigeon', a.id), behind(a, b, -2), NONE);
      expect(f?.kind === 'move' && f.to === b.id, g.id).toBe(false);
    }
    expect(linkOf(I.get('long-lantern:from'), I.get('long-lantern:to'))?.kind).toBe('hop');
    for (const b of ROOFS_BIRDS) for (const g of LOCKED) expect([`${g.id}:from`, `${g.id}:to`]).not.toContain(b.home);
  });

  it('a flight is a short arc, never more than 1.4 m over its higher end', () => {
    let steps = 0;
    for (const [id, links] of G.links) {
      const a = I.get(id);
      for (const l of links) {
        const b = I.get(l.to);
        const plan = flightPlan(a, b, l.shape);
        expect(plan.shape).toBe(l.shape);
        expect(plan.d).toBeCloseTo(l.d, 9);
        if (l.shape === 'step') {
          // up and over: 0.4 m over the higher end, its time along its way
          steps++;
          const top = Math.max(a.y, b.y) + 0.4;
          expect(plan.top).toBeCloseTo(top, 9);
          expect(plan.time).toBeCloseTo(0.5 + (l.d + (top - a.y) + (top - b.y)) / FLIGHT.speed, 9);
          let peak = -Infinity;
          for (let s = 0; s <= 1 + 1e-9; s += 0.01) peak = Math.max(peak, at(a, b, s).y);
          expect(peak).toBeCloseTo(top, 6);
        } else {
          expect(plan.h).toBeCloseTo(Math.min(1.4, 0.6 + 0.08 * l.d), 9);
          expect(plan.time).toBeCloseTo(0.5 + l.d / FLIGHT.speed, 9);
        }
        const top = Math.max(a.y, b.y) + 1.4 + 1e-9;
        for (let s = 0; s <= 1 + 1e-9; s += 0.01) expect(at(a, b, s).y).toBeLessThanOrEqual(top);
        for (const [s, end] of [[0, a], [1, b]]) {
          const q = at(a, b, s);
          expect(d3(q, end)).toBeLessThan(1e-9);
        }
      }
    }
    expect(steps).toBe(ROOFS_TRAVERSAL.climbs.length + ROOFS_TRAVERSAL.drops.length);
    expect(flightPlan(I.get('plank-3:0'), I.get('plank-3:1')).shape).toBe('arc'); // the default
    // the out object is the one written and returned
    const out = { x: 0, y: 0, z: 0 };
    const a = I.get('plank-3:0');
    const b = I.get('plank-3:1');
    expect(flightPoint(a, b, flightPlan(a, b), 0.5, out)).toBe(out);
    expect(out.y).toBeCloseTo((a.y + b.y) / 2 + Math.min(1.4, 0.6 + 0.08 * d2(a, b)), 9);
  });

  it('every pigeon’s home has a way to the loft', () => {
    // on the plan alone: the drawn home (an aerial) is test/roofsbirds.test.js's, on the built place (R3)
    for (const b of ROOFS_BIRDS.filter((r) => r.kind === 'pigeon' && !r.home.startsWith('aerial:'))) {
      expect(I.get(b.home), b.home).toBeDefined();
      expect(Number.isFinite(G.homeDist.get(I.get(b.home).id)), b.home).toBe(true);
    }
    for (const p of P.filter((q) => q.kind === 'loft')) expect(G.homeDist.get(p.id)).toBe(0);
    expect(Number.isFinite(G.homeDist.get(I.get(GUIDE.start).id))).toBe(true);
  });

  it('the flock: eight pigeons, four sparrows, two gulls, at the homes their kinds allow', () => {
    const of = (kind) => ROOFS_BIRDS.filter((b) => b.kind === kind);
    expect(ROOFS_BIRDS.length).toBe(14);
    expect(of('pigeon').length).toBe(8);
    expect(of('sparrow').length).toBe(4);
    expect(of('gull').length).toBe(2);
    expect(new Set(ROOFS_BIRDS.map((b) => b.id)).size).toBe(14);
    expect(ROOFS_BIRDS.find((b) => b.id === GUIDE.bird)).toMatchObject({ kind: 'pigeon', home: 'plank-3:1' });
    // a drawn home is named by the scheme (R3: test/roofs.test.js resolves it on the built area)
    const DRAWN = /^(pot:-?\d+(\.\d+)?:-?1|aerial:-?\d+(\.\d+)?|parapet:(warehouse|cornerShop|tower-1):\d+|post:\d+:[01]|wall:\d+)$/;
    const kindOf = (home) => (I.has(home) ? I.get(home).kind : home.split(':')[0]);
    for (const b of ROOFS_BIRDS) {
      if (!I.has(b.home)) expect(b.home, b.id).toMatch(DRAWN);
      expect(BIRD_KINDS[b.kind].perches, b.id).toContain(kindOf(b.home));
      if (I.has(b.home)) expect(I.get(b.home).y).toBeLessThan(BIRD_KINDS[b.kind].below);
    }
    const pigeons = of('pigeon').map((b) => b.home);
    // every pigeon on the plan's perches but one on a chimney's aerial (drawn), and one pecking on the warehouse
    expect(pigeons.filter((h) => !I.has(h))).toEqual([DRAWN_ID.aerial(5)]);
    expect(pigeons.filter((h) => I.get(h)?.kind === 'roof' && h.startsWith('roof:warehouse:')).length).toBe(1);
    expect(pigeons.filter((h) => FAR_ENDS.has(h) && I.get(h).kind === 'move').length).toBeGreaterThanOrEqual(4);
    expect(pigeons.filter((h) => I.get(h)?.y >= L.WAREHOUSE).length).toBeGreaterThanOrEqual(2);
    const sparrows = of('sparrow').map((b) => b.home);
    expect(sparrows.filter((h) => /^(post|wall):/.test(h)).length).toBe(2);
    for (const h of sparrows.filter((s) => s.startsWith('post:'))) {
      const [, i, end] = h.split(':').map(Number);
      expect(i).toBeLessThan(WASHING_POSTS.length);
      expect([0, 1]).toContain(end);
    }
    for (const h of sparrows.filter((s) => s.startsWith('wall:'))) expect(+h.split(':')[1]).toBeLessThan(YARD_WALLS.length);
    expect(sparrows.filter((h) => h.startsWith('roof:garages:') && I.get(h)?.kind === 'roof').length).toBe(1);
    expect(sparrows.filter((h) => /^roof:(flatHouse|dormer|roofTerrace):/.test(h) && I.get(h)?.kind === 'roof').length).toBe(1);
    const gulls = of('gull').map((b) => b.home);
    expect(gulls.filter((h) => h.startsWith('parapet:warehouse:')).length).toBe(1);
    // the warehouse gull's parapet, by DRAWN_ID's numbering (3 m apart clockwise
    // from the north-west corner, 0.125 m out from the edge): inside the bounds,
    // over no street
    const W = BLOCK.warehouse;
    for (const h of gulls.filter((g) => g.startsWith('parapet:warehouse:'))) {
      let t = 3 * +h.split(':')[2];
      const sides = [
        [W.x1 - W.x0, (u) => [W.x0 + u, W.z0 - 0.125]], [W.z1 - W.z0, (u) => [W.x1 + 0.125, W.z0 + u]],
        [W.x1 - W.x0, (u) => [W.x1 - u, W.z1 + 0.125]], [W.z1 - W.z0, (u) => [W.x0 - 0.125, W.z1 - u]],
      ];
      const [len, spot] = sides.find(([n]) => (t < n ? true : ((t -= n), false)));
      expect(t).toBeLessThan(len);
      const [x, z] = spot(t);
      expect(x >= ROOFS_BOUNDS.minX && x <= ROOFS_BOUNDS.maxX && z >= ROOFS_BOUNDS.minZ && z <= ROOFS_BOUNDS.maxZ, `${h} at ${x}, ${z}`).toBe(true);
      for (const s of STREETS) expect(inRect(s, x, z), h).toBe(false);
    }
    expect(gulls.filter((h) => h.startsWith('parapet:tower-1:')).length).toBe(1);
    // no two birds share a home, by id or through an alias
    const homes = ROOFS_BIRDS.map((b) => (I.has(b.home) ? I.get(b.home).id : b.home));
    expect(new Set(homes).size).toBe(14);
  });

  it('the guide’s route is the alley, the bin, the shed and plank-3’s two ends', () => {
    expect(GUIDE.bird).toBe('pigeon-guide');
    expect(I.get(GUIDE.start).id).toBe('guide:alley');
    expect(GUIDE.route.map((id) => I.get(id).id)).toEqual(['bin-up:to', 'shed-up:to', 'plank-3:0', 'plank-3:1']);
    // consecutive stops: each is a flight of the graph, and she gets from one
    // to the next by a move she makes (walking level to its take-off first)
    const stops = [GUIDE.start, ...GUIDE.route].map((id) => I.get(id));
    const level = (a, q) => {
      for (let f = 0; f <= 1 + 1e-9; f += 0.05) {
        if (Math.abs(ground.y(a.x + (q.x - a.x) * f, a.z + (q.z - a.z) * f) - a.y) > 0.02) return false;
      }
      return true;
    };
    const moves = [
      ...HOPS.map((h) => [h.from, h.to]),
      ...ROOFS_TRAVERSAL.crossings.flatMap((c) => [[c.points[0], c.points[c.points.length - 1]], [c.points[c.points.length - 1], c.points[0]]]),
    ];
    for (let i = 1; i < stops.length; i++) {
      const [a, b] = [stops[i - 1], stops[i]];
      expect(linkOf(a, b), `${a.id} -> ${b.id}`).toBeDefined();
      const walk = level(a, b);
      const byMove = moves.some(([f, t]) => d2(t, b) < 0.5 && level(a, f));
      expect(walk || byMove, `${a.id} -> ${b.id}`).toBe(true);
    }
  });

  it('its critters: a bird or a seagull for each bird, at its home', () => {
    // SYNTHETIC drawn spots at the roster's drawn homes (roofs.js draws the real ones)
    const drawnHomes = ROOFS_BIRDS.filter((b) => !I.has(b.home)).map((b, k) => ({
      id: b.home, kind: b.home.split(':')[0], x: -36 + 3 * k, y: 11.67, z: -50.125,
    }));
    const index = perchIndex(flockPerches({ traversal: ROOFS_TRAVERSAL, ground, drawn: drawnHomes }));
    const spawns = roofsCritterSpawns(ROOFS_BIRDS, index);
    expect(spawns.length).toBe(14);
    ROOFS_BIRDS.forEach((b, i) => {
      const home = index.get(b.home);
      expect(spawns[i]).toEqual({ type: b.kind === 'gull' ? 'seagull' : 'bird', x: home.x, z: home.z, roofBird: b.id });
      expect(Object.isFrozen(spawns[i])).toBe(true);
    });
    // a home that is not a perch fails loudly, naming it
    expect(() => roofsCritterSpawns(ROOFS_BIRDS, I)).toThrow(/aerial:|parapet:|post:|wall:/);
  });

  it('no flight ends nearer her than it began, and none passes within 1.5 m of her', () => {
    let flights = 0;
    for (const p of P) {
      for (const kind of Object.keys(BIRD_KINDS).filter((k) => allowed(k, p))) {
        for (const cat of ring(p)) {
          const f = chooseFlight(G, I, bird(kind, p.id), cat, NONE);
          if (f === null) continue;
          flights++;
          const to = I.get(f.to);
          expect(keepsOffHer(p, to, cat), `${kind} ${p.id} -> ${f.to}`).toBe(null);
          expect(allowed(kind, to), `${kind} ${p.id} -> ${f.to}`).toBe(true);
          expect(linkOf(p, to)?.kind).toBe(f.kind);
        }
      }
    }
    expect(flights).toBeGreaterThan(1000);
  });

  it('a pigeon at a plank’s or a gap’s near end, chased from behind, flies to its far end', () => {
    const moves = [
      ...ROOFS_TRAVERSAL.crossings.filter((c) => c.kind === 'plank').map((c) => [`${c.id}:0`, `${c.id}:1`]),
      ...ROOFS_TRAVERSAL.gaps.filter((g) => !g.requires).map((g) => [`${g.id}:from`, `${g.id}:to`]),
    ];
    expect(moves.length).toBe(3 + 22);
    for (const [near, far] of moves) {
      const [a, b] = [I.get(near), I.get(far)];
      const cat = behind(a, b, -2); // 2 m behind her quarry, the far end beyond it
      expect(chooseFlight(G, I, bird('pigeon', near), cat, NONE), near).toEqual({ to: b.id, kind: 'move', shape: 'arc' });
    }
  });

  it('chased on and on, a pigeon’s flights lead up the place to the loft', () => {
    // from plank-1:1 (the plan's case) and from every other pigeon's home, she
    // coming over the move that lands there; always 2.2 m behind along the last flight
    const starts = [['plank-1:1', 'plank-1:0'], ...ROOFS_BIRDS
      .filter((b) => b.kind === 'pigeon' && FAR_ENDS.has(b.home) && b.home !== 'plank-1:1')
      .map((b) => [b.home, b.home.replace(/:1$/, ':0').replace(/:to$/, ':from')])];
    // five: the roster's far-end pigeons (pigeon-5 and pigeon-6 moved to an
    // aerial and a warehouse peck spot, Task 3's C3), plank-1:1 among them
    expect(starts.length).toBe(5);
    let flights = 0;
    let onEnds = 0;
    let moves = 0;
    starts.forEach(([start, before], index) => {
      let p = I.get(start);
      let from = I.get(before);
      let landed = false;
      for (let n = 0; n < 40 && !landed; n++) {
        const cat = behind(p, from, 2.2);
        const f = chooseFlight(G, I, bird('pigeon', p.id, { index, flights: n }), cat, NONE);
        expect(f, `${start}: flight ${n} from ${p.id}`).not.toBe(null);
        expect(linkOf(p, I.get(f.to))).toBeDefined();
        [from, p] = [p, I.get(f.to)];
        landed = p.kind === 'loft';
        flights++;
        onEnds += MOVE_ENDS.has(p.id);
        moves += f.kind === 'move';
      }
      expect(landed, start).toBe(true);
    });
    // on the way they wait where her moves end, and fly her moves. Measured
    // 2026-11-21 over the seven chases then: 58 of 135 landings (43%) on a move
    // end and 16 move flights; without the move-end term, 27 of 111 (24%) and 5.
    // Over these five (Task 3's C3): 52 of 109 (48%) and 16
    expect(onEnds / flights).toBeGreaterThanOrEqual(0.38);
    expect(moves).toBeGreaterThanOrEqual(12);
  });

  it('the move ends she can make are the graph’s, and no skill leap’s landing is one', () => {
    expect([...G.moveEnds].sort()).toEqual([...MOVE_ENDS].sort());
    for (const g of LOCKED) {
      const b = I.get(`${g.id}:to`);
      // a locked landing counts only where one of her own moves also ends there
      if (G.moveEnds.has(b.id)) expect(MOVES.some(([, t]) => I.get(t) === b), g.id).toBe(true);
    }
    expect(G.moveEnds.has(I.get('long-lantern:to').id)).toBe(false);
  });

  it('sparrows and gulls make local hops and never lead', () => {
    expect(BIRD_KINDS.sparrow.leads).toBe(false);
    expect(BIRD_KINDS.gull.leads).toBe(false);
    let sparrowFlights = 0;
    for (const p of P.filter((q) => allowed('sparrow', q))) {
      for (const cat of ring(p)) {
        const f = chooseFlight(G, I, bird('sparrow', p.id), cat, NONE);
        if (!f) continue;
        sparrowFlights++;
        const to = I.get(f.to);
        expect(d2(p, to)).toBeLessThanOrEqual(6);
        expect(to.y).toBeLessThan(7);
      }
    }
    expect(sparrowFlights).toBeGreaterThan(100);
    // a sparrow at a plank's near end, chased from behind, does not lead her over it
    const near = I.get('plank-2:0');
    const far = I.get('plank-2:1');
    const f = chooseFlight(G, I, bird('sparrow', near.id), behind(near, far, -2), NONE);
    expect(f?.to).not.toBe(far.id);
    // SYNTHETIC drawn spots for the gulls: parapets every 3 m along the
    // warehouse's north side, the tower's ring corners, a pot and an aerial
    const drawn = [
      ...Array.from({ length: 26 }, (_, n) => ({ id: DRAWN_ID.parapet('warehouse', n), kind: 'parapet', x: -39 + 3 * n, y: 11.67, z: -50.125 })),
      ...[[22.5, -20.5], [29.5, -20.5], [29.5, -13.5], [22.5, -13.5]].map(([x, z], n) => ({ id: DRAWN_ID.parapet('tower-1', n), kind: 'parapet', x, y: 12.6, z })),
      { id: DRAWN_ID.pot(20, -1), kind: 'pot', x: 20, y: 8.7, z: 6.95 },
      { id: DRAWN_ID.aerial(10), kind: 'aerial', x: 10.3, y: 9.4, z: 6.8 },
    ];
    const P2 = flockPerches({ traversal: ROOFS_TRAVERSAL, ground, drawn });
    const I2 = perchIndex(P2);
    const G2 = flightGraph(P2, ROOFS_TRAVERSAL);
    let gullFlights = 0;
    for (const p of P2.filter((q) => allowed('gull', q))) {
      for (const cat of ring(p)) {
        const g = chooseFlight(G2, I2, bird('gull', p.id), cat, NONE);
        if (!g) continue;
        gullFlights++;
        const to = I2.get(g.to);
        expect(['parapet', 'pot', 'aerial']).toContain(to.kind);
        expect(d2(p, to)).toBeGreaterThanOrEqual(4);
        expect(d2(p, to)).toBeLessThanOrEqual(10);
      }
    }
    expect(gullFlights).toBeGreaterThan(100);
  });

  it('cornered, it flies away from her or flutters where it is', () => {
    const cases = [];
    // the tower top, she coming up its last climb
    const top = I.get('towerTop-up:to');
    cases.push([top, behind(top, I.get('towerTop-up:from'), 1.0)]);
    // the loft's far corner (the loft perch furthest from the way up), she 1 m off
    const up = I.get('loft-up:to');
    const corner = P.filter((p) => p.kind === 'loft').sort((p, q) => d2(q, up) - d2(p, up))[0];
    cases.push([corner, behind(corner, up, 1.0)]);
    // plank-3's far end, she on the plank 1 m short of it
    const end = I.get('plank-3:1');
    cases.push([end, { ...behind(end, I.get('plank-3:0'), 1.0), y: end.y }]);
    for (const [p, cat] of cases) {
      for (const flights of [0, 1, 2, 3]) {
        const f = chooseFlight(G, I, bird('pigeon', p.id, { flights }), cat, NONE);
        if (f) expect(keepsOffHer(p, I.get(f.to), cat), `${p.id} -> ${f.to}`).toBe(null);
      }
    }
  });

  it('a bird on the rail ahead of her leaves ahead, never back over her', () => {
    const ridge = ROOFS_TRAVERSAL.crossings.find((c) => c.id === 'ridge-2');
    const [a, b] = [ridge.points[0], ridge.points[1]];
    const ux = Math.sign(b.x - a.x);
    for (const p of P.filter((q) => q.kind === 'ridge' && q.id.startsWith('ridge-2:'))) {
      for (const dir of [ux, -ux]) {
        const cat = { x: p.x - dir * 1.5, y: p.y, z: p.z };
        for (const flights of [0, 1, 2]) {
          const f = chooseFlight(G, I, bird('pigeon', p.id, { flights }), cat, NONE);
          expect(f, `${p.id} chased ${dir > 0 ? 'east' : 'west'}`).not.toBe(null);
          const to = I.get(f.to);
          expect(keepsOffHer(p, to, cat)).toBe(null);
          for (let s = 0; s <= 1 + 1e-9; s += 0.05) expect(d3(at(p, to, s), cat)).toBeGreaterThanOrEqual(FLIGHT.clearCat - 1e-9);
          expect((to.x - p.x) * dir, `${p.id} -> ${to.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('the guide flies stop by stop, then is a pigeon like the others', () => {
    const stops = [GUIDE.start, ...GUIDE.route].map((id) => I.get(id));
    const guideIndex = ROOFS_BIRDS.findIndex((b) => b.id === GUIDE.bird);
    // the way she comes at each stop: from the spawn, up the bin's climb, up
    // the shed's, across the shed from where that lands
    const comes = [ROOFS_SPAWN, I.get('bin-up:from'), I.get('shed-up:from'), I.get('shed-up:to')];
    for (let k = 0; k < GUIDE.route.length; k++) {
      const p = stops[k];
      // 2.2 m behind it, on the ground there
      const c = behind(p, comes[k], 2.2);
      const cat = { ...c, y: ground.y(c.x, c.z) };
      const f = chooseFlight(G, I, { index: guideIndex, kind: 'pigeon', at: p.id, flights: k, guideStep: k }, cat, NONE);
      expect(f, `step ${k} from ${p.id}`).not.toBe(null);
      expect(f.to).toBe(stops[k + 1].id);
      // too close to her for the next stop's flight: it flutters, never flies at her
      const near = { ...stops[k + 1], y: stops[k + 1].y };
      expect(chooseFlight(G, I, { index: guideIndex, kind: 'pigeon', at: p.id, flights: k, guideStep: k }, near, NONE)).toBe(null);
      // a bird on the next stop: it flutters
      expect(chooseFlight(G, I, { index: guideIndex, kind: 'pigeon', at: p.id, flights: k, guideStep: k }, cat, new Set([stops[k + 1].id]))).toBe(null);
    }
    // the route done (guideStep -1): the ordinary choice, by the rules
    let checked = 0;
    for (const p of [stops[4], stops[0], I.get('plank-1:1'), I.get('cornerShop-up:to')]) {
      for (const cat of ring(p)) {
        for (const flights of [0, 1, 2, 3, 4, 5]) {
          const b = { index: guideIndex, kind: 'pigeon', at: p.id, flights, guideStep: -1 };
          const want = expectedChoice(b, cat, NONE);
          if (want === 'tie') continue; // within the hash's 0.25: the hash decides
          const got = chooseFlight(G, I, b, cat, NONE);
          expect(got, `${p.id}`).toEqual(want ? { to: want.to, kind: want.kind, shape: want.shape } : null);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('a perch another bird is on is never landed on', () => {
    const p = I.get('return-4-east:from');
    const far = I.get('return-4-east:to');
    const cat = behind(p, far, -2);
    expect(chooseFlight(G, I, bird('pigeon', p.id), cat, NONE).to).toBe(far.id);
    // by its id or by an alias
    for (const id of [far.id, ...far.aliases]) {
      const f = chooseFlight(G, I, bird('pigeon', p.id), cat, new Set([id]));
      expect(f?.to).not.toBe(far.id);
    }
  });

  it('the same chase gives the same flight, and nothing draws on Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const P2 = flockPerches({ traversal: ROOFS_TRAVERSAL, ground });
    const I2 = perchIndex(P2);
    const G2 = flightGraph(P2, ROOFS_TRAVERSAL);
    expect(P2).toEqual(P);
    expect([...G2.links]).toEqual([...G.links]);
    expect([...G2.homeDist]).toEqual([...G.homeDist]);
    for (const p of P.slice(0, 60)) {
      for (const cat of ring(p, 2.2, 4)) {
        const b = bird('pigeon', p.id, { flights: 2 });
        expect(chooseFlight(G2, I2, b, cat, NONE)).toEqual(chooseFlight(G, I, b, cat, NONE));
      }
    }
    expect(spy).not.toHaveBeenCalled();
  });
});
