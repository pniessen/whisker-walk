import { describe, it, expect, vi } from 'vitest';

// gorge.js imports builder.js, which paints canvases at import: the same
// headless stub test/builder.test.js uses.
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
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { ROCK_WALKS } = await import('../src/world/gorge.js');
const { MASSES, CEILINGS } = await import('../src/world/gorgeshape.js');
const { capTopFor } = await import('../src/world/builder.js');
const { mulberry32 } = await import('../src/rng.js');
const R = await import('../src/world/rockrelief.js');
const { createRockRelief, noise3, ROCK_PROUD, CAVE_PROUD } = R;

const SWEEP = 120_000;
const KEEP = [{ x: 8, z: -12.5, r: 1.2 }, { x: 3.5, z: -16, r: 1.2 }, { x: 5.5, z: -16, r: 1.2 }, { x: 7.5, z: -16, r: 1.2 }];
const OPTS = { walks: ROCK_WALKS, masses: MASSES, ceilings: CEILINGS, seed: 7, keep: KEEP };
const field = createRockRelief(OPTS);

function shapeY(s, x, z) {
  if (s.along !== 'z' || s.maxZ === s.minZ) return s.y0;
  const f = Math.min(1, Math.max(0, (z - s.minZ) / (s.maxZ - s.minZ)));
  return s.y0 + f * (s.y1 - s.y0);
}
const inRect = (s, x, z) => x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ;
const FRAME = 62;

// Every solid the rock is drawn from: mass and walk columns from 0 up, and
// the ceiling caps from the ceiling up to capTopFor (builder.js's own rule).
const SOLIDS = [
  ...MASSES.map((s) => ({ s, lo: () => 0, hi: (x, z) => shapeY(s, x, z) })),
  ...ROCK_WALKS.filter((s) => Math.max(s.y0, s.y1) > 0).map((s) => ({ s, lo: () => 0, hi: (x, z) => shapeY(s, x, z) })),
  ...CEILINGS.map((c) => ({ s: c, top: capTopFor(c, MASSES) })).filter((c) => c.top > c.s.y0)
    .map((c) => ({ s: c.s, lo: () => c.s.y0, hi: () => c.top })),
];
// Each ceiling's floor: the cave or den rect it covers.
const CAVES = CEILINGS.map((c) => {
  const f = ROCK_WALKS.find((w) => w.minX === c.minX && w.maxX === c.maxX && w.minZ === c.minZ && w.maxZ === c.maxZ);
  return { c, floor: f ? f.y0 : 0 };
});
const inCaveVoid = (x, y, z) => CAVES.some(({ c, floor }) => inRect(c, x, z) && y > floor && y < c.y0);

// Points on the true wall planes: a solid's edge where rock is on the inside
// and air on the outside at that height. Frame edges (never drawn) are left out.
function wallPoints(n, seed = 11) {
  const rnd = mulberry32(seed);
  const edges = [];
  for (const sol of SOLIDS) {
    const { s } = sol;
    edges.push({ sol, axis: 'x', at: s.minX, n: -1, t0: s.minZ, t1: s.maxZ });
    edges.push({ sol, axis: 'x', at: s.maxX, n: 1, t0: s.minZ, t1: s.maxZ });
    edges.push({ sol, axis: 'z', at: s.minZ, n: -1, t0: s.minX, t1: s.maxX });
    edges.push({ sol, axis: 'z', at: s.maxZ, n: 1, t0: s.minX, t1: s.maxX });
  }
  const live = edges.filter((e) => Math.abs(e.at) < FRAME);
  const total = live.reduce((a, e) => a + (e.t1 - e.t0), 0);
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 200) {
    let pick = rnd() * total;
    let e = live[0];
    for (const c of live) { pick -= c.t1 - c.t0; if (pick <= 0) { e = c; break; } }
    const t = e.t0 + rnd() * (e.t1 - e.t0);
    const x = e.axis === 'x' ? e.at : t;
    const z = e.axis === 'x' ? t : e.at;
    const lo = e.sol.lo(x, z);
    const hi = e.sol.hi(x, z);
    if (!(hi > lo)) continue;
    const y = lo + rnd() * (hi - lo);
    const ox = e.axis === 'x' ? e.n * 1e-4 : 0;
    const oz = e.axis === 'z' ? e.n * 1e-4 : 0;
    if (!field.rockAt(x - ox, y, z - oz) || field.rockAt(x + ox, y, z + oz)) continue;
    out.push({ x, y, z, cave: inCaveVoid(x + ox, y, z + oz) });
  }
  return out;
}
const WALL = wallPoints(2000);

describe('rock relief: determinism', () => {
  it('noise3 is an integer-hash value noise with pinned values', () => {
    expect(noise3(0.5, 1.25, -3.75, 0)).toBe(NOISE_PINS[0]);
    expect(noise3(12.3, -4.56, 7.89, 7)).toBe(NOISE_PINS[1]);
    expect(noise3(-100.1, 0, 33.3, 12345)).toBe(NOISE_PINS[2]);
    for (let i = 0; i < 200; i++) {
      const v = noise3(i * 0.37 - 20, i * 0.11, -i * 0.53, i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('at() is identical for identical input', () => {
    const other = createRockRelief(OPTS);
    const rnd = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const p = i < 250 ? WALL[i] : { x: (rnd() * 2 - 1) * 62, y: rnd() * 21, z: (rnd() * 2 - 1) * 62 };
      expect(other.at(p.x, p.y, p.z)).toEqual(field.at(p.x, p.y, p.z));
    }
  }, SWEEP);
});

describe('rock relief: rockAt', () => {
  it('reads columns, voids and caps', () => {
    expect(field.rockAt(-10, 1, 0)).toBe(false); // the floor
    expect(field.rockAt(-30, 5, 40)).toBe(true); // in the west top
    expect(field.rockAt(-30, 9.5, 40)).toBe(false); // above it
    expect(field.rockAt(41.5, 13, -30)).toBe(false); // the Glitter Cave's void
    expect(field.rockAt(41.5, 16, -30)).toBe(true); // its cap
    expect(field.rockAt(41.5, 21, -30)).toBe(false); // over the cap
    expect(field.rockAt(2.2, 1, 16)).toBe(true); // lip A (2.35 high here)
    expect(field.rockAt(2.2, 2.4, 16)).toBe(false);
    expect(field.wallNear(1.9, 1, 16, 0.1 + 1e-6)).toBe(true);
    expect(field.wallNear(1.8, 1, 16, 0.1 + 1e-6)).toBe(false);
  });
});

describe('rock relief: what must not move', () => {
  it('walk surfaces (inside and on their edges) do not move', () => {
    const rnd = mulberry32(5);
    const tops = ROCK_WALKS.filter((s) => s.kind !== 'lip');
    for (let i = 0; i < 400; i++) {
      const s = tops[i % tops.length];
      let x = s.minX + rnd() * (s.maxX - s.minX);
      let z = s.minZ + rnd() * (s.maxZ - s.minZ);
      const edge = i % 3;
      if (edge === 1) x = rnd() < 0.5 ? s.minX : s.maxX;
      if (edge === 2) z = rnd() < 0.5 ? s.minZ : s.maxZ;
      const y = shapeY(s, x, z);
      const d = field.at(x, y, z);
      expect([s.tag, x, y, z, d.dx, d.dy, d.dz]).toEqual([s.tag, x, y, z, 0, 0, 0]);
    }
  }, SWEEP);

  it('ceiling undersides do not move up or down', () => {
    for (const c of CEILINGS) {
      for (let i = 0; i <= 6; i++) {
        for (let j = 0; j <= 6; j++) {
          const x = c.minX + ((c.maxX - c.minX) * i) / 6;
          const z = c.minZ + ((c.maxZ - c.minZ) * j) / 6;
          expect([c.tag, x, z, field.at(x, c.y0, z).dy]).toEqual([c.tag, x, z, 0]);
        }
      }
    }
  });

  it('the shoulder top inside the keep discs does not move up or down', () => {
    const shoulder = MASSES.filter((m) => m.y0 === 14);
    let n = 0;
    for (const k of KEEP) {
      for (let i = 0; i <= 24; i++) {
        for (let j = 0; j <= 24; j++) {
          const x = k.x - k.r + (2 * k.r * i) / 24;
          const z = k.z - k.r + (2 * k.r * j) / 24;
          if ((x - k.x) ** 2 + (z - k.z) ** 2 > k.r * k.r) continue;
          if (!shoulder.some((m) => inRect(m, x, z))) continue;
          n++;
          expect([x, z, field.at(x, 14, z).dy]).toEqual([x, z, 0]);
        }
      }
    }
    expect(n).toBeGreaterThan(300);
  });
});

describe('rock relief: bounds', () => {
  it('found 2,000 wall points, some beside cave voids', () => {
    expect(WALL.length).toBe(2000);
    expect(WALL.filter((p) => p.cave).length).toBeGreaterThan(20);
  });

  it('no moved wall point stands proud of its wall by more than ROCK_PROUD (CAVE_PROUD in a cave)', () => {
    const bad = [];
    for (const p of WALL) {
      const d = field.at(p.x, p.y, p.z);
      const bound = (p.cave ? CAVE_PROUD : ROCK_PROUD) + 1e-6;
      if (!field.wallNear(p.x + d.dx, p.y + d.dy, p.z + d.dz, bound)) bad.push({ ...p, ...d });
    }
    expect(bad.slice(0, 5)).toEqual([]);
  }, SWEEP);

  it('the 0.4 m lip never moves more than its thickness allows', () => {
    const lipA = ROCK_WALKS.find((s) => s.tag === 'lipA');
    const legA = ROCK_WALKS.find((s) => s.tag === 'legA');
    const rnd = mulberry32(9);
    for (let i = 0; i < 400; i++) {
      const z = lipA.minZ + ((lipA.maxZ - lipA.minZ) * i) / 399;
      const lo = shapeY(legA, 2.0, z);
      const hi = shapeY(lipA, 2.0, z);
      const y = i % 4 === 0 ? lo : i % 4 === 1 ? hi : lo + rnd() * (hi - lo);
      const d = field.at(2.0, y, z);
      expect(Math.abs(d.dx)).toBeLessThanOrEqual(0.15 + 1e-9);
    }
  }, SWEEP);
});

describe('rock relief: it does something', () => {
  it('walls recess: mean |r| > 0.2 and at least 30% recess more than 0.3', () => {
    const rs = WALL.map((p) => field.at(p.x, p.y, p.z).recess);
    const mean = rs.reduce((a, r) => a + Math.abs(r), 0) / rs.length;
    const deep = rs.filter((r) => r > 0.3).length / rs.length;
    console.log(`[rockrelief] wall points: mean |r| ${mean.toFixed(3)}, share r > 0.3 ${(deep * 100).toFixed(1)}%`);
    expect(mean).toBeGreaterThan(0.2);
    expect(deep).toBeGreaterThanOrEqual(0.3);
  }, SWEEP);

  it('the 20 m rims have jagged crests (max dy > 0.5)', () => {
    let max = 0;
    for (const m of MASSES.filter((s) => s.y0 === 20)) {
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        for (const inset of [0, 0.3, 0.7]) {
          const pts = [
            [m.minX + inset, m.minZ + t * (m.maxZ - m.minZ)],
            [m.maxX - inset, m.minZ + t * (m.maxZ - m.minZ)],
            [m.minX + t * (m.maxX - m.minX), m.minZ + inset],
            [m.minX + t * (m.maxX - m.minX), m.maxZ - inset],
          ];
          for (const [x, z] of pts) max = Math.max(max, field.at(x, 20, z).dy);
        }
      }
    }
    console.log(`[rockrelief] max rim crest dy ${max.toFixed(3)}`);
    expect(max).toBeGreaterThan(0.5);
  }, SWEEP);
});

describe('rock relief: speed', () => {
  it('10,000 at() calls take under a second', () => {
    const pts = [];
    const rnd = mulberry32(21);
    for (let i = 0; i < 10_000; i++) {
      const w = WALL[i % WALL.length];
      pts.push(i % 2 ? w : { x: (rnd() * 2 - 1) * 62, y: [0, 4, 8, 9, 12, 14, 20][i % 7], z: (rnd() * 2 - 1) * 62 });
    }
    for (let i = 0; i < 500; i++) field.at(pts[i].x, pts[i].y, pts[i].z); // warm up
    const t0 = performance.now();
    for (const p of pts) field.at(p.x, p.y, p.z);
    const ms = performance.now() - t0;
    console.log(`[rockrelief] 10,000 at() calls: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(1000);
  }, SWEEP);
});

// Recorded from the implementation (integer hash and + - * / floor only).
const NOISE_PINS = [0.3959183200593088, 0.23028469831976683, 0.6491775598331695];
