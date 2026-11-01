import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { waterGap, waterClearance } from '../src/world/builder.js';

// Same headless stub every world test uses (see test/water.test.js).
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

const { isWalkableAt, isWadeableAt, CAT_RADIUS } = await import('../src/player.js');
const mods = {
  park: await import('../src/world/park.js'),
  seaside: await import('../src/world/seaside.js'),
  docks: await import('../src/world/docks.js'),
  woods: await import('../src/world/woods.js'),
  river: await import('../src/world/river.js'),
  moor: await import('../src/world/moor.js'),
};
const AREAS = Object.fromEntries(
  Object.entries(mods).map(([n, m]) => [n, m.build(new THREE.Scene())]),
);

const STEP = 0.5;
const DIAG = STEP * Math.SQRT2;
const ROUTE_SLACK = 8;

// ---- the grid ---------------------------------------------------------------
// A 0.5 m grid over area.bounds, 8-connected; a diagonal step needs both side
// cells open (no corner cutting).
function makeGrid(area, open) {
  const b = area.bounds;
  const nx = Math.floor((b.maxX - b.minX) / STEP) + 1;
  const nz = Math.floor((b.maxZ - b.minZ) / STEP) + 1;
  const ok = new Uint8Array(nx * nz);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      ok[i * nz + j] = open(area, b.minX + i * STEP, b.minZ + j * STEP) ? 1 : 0;
    }
  }
  return { nx, nz, ok, minX: b.minX, minZ: b.minZ };
}
const px = (g, i) => g.minX + i * STEP;
const pz = (g, j) => g.minZ + j * STEP;
const cellOf = (g, x, z) => Math.round((x - g.minX) / STEP) * g.nz + Math.round((z - g.minZ) / STEP);

// ---- the search: Dijkstra with a small binary heap ---------------------------
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const { k, v } = this;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const { k, v } = this;
    const top = v[0];
    const key = k.pop(); const val = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= key) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = key; v[i] = val;
    }
    return top;
  }
}

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function dijkstra(g, src) {
  const dist = new Float64Array(g.nx * g.nz).fill(Infinity);
  if (!g.ok[src]) return dist;
  const heap = new Heap();
  dist[src] = 0;
  heap.push(0, src);
  const done = new Uint8Array(dist.length);
  while (heap.size) {
    const c = heap.pop();
    if (done[c]) continue;
    done[c] = 1;
    const ci = Math.floor(c / g.nz);
    const cj = c - ci * g.nz;
    for (const [di, dj] of NEIGHBOURS) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
      const n = i * g.nz + j;
      if (!g.ok[n]) continue;
      if (di !== 0 && dj !== 0 && !(g.ok[(ci + di) * g.nz + cj] && g.ok[ci * g.nz + cj + dj])) continue;
      const nd = dist[c] + (di !== 0 && dj !== 0 ? DIAG : STEP);
      if (nd < dist[n]) { dist[n] = nd; heap.push(nd, n); }
    }
  }
  return dist;
}

// The two masks.
const dryOpen = (area, x, z) => isWalkableAt(area, x, z);
const wadeOpen = (area, x, z) => isWadeableAt(area, x, z);

const KNOWN_WEDGES = { woods: [[-50, -8.5]], river: [[50, -8.5]] };

describe.each(Object.keys(AREAS))('%s wading routes', (name) => {
  const area = AREAS[name];

  it(`${name}: no water gives a non-swimmer a shortcut longer than ROUTE_SLACK (8 m)`, () => {
    const dry = makeGrid(area, dryOpen);
    const wade = makeGrid(area, wadeOpen);
    const spawn = cellOf(dry, area.spawn.x, area.spawn.z);
    const fromSpawn = dijkstra(dry, spawn);
    const wadeCache = new Map();
    const wadeFrom = (c) => {
      if (!wadeCache.has(c)) wadeCache.set(c, dijkstra(wade, c));
      return wadeCache.get(c);
    };
    for (const w of area.waters) {
      const bank = [];
      for (let i = 0; i < dry.nx; i++) {
        for (let j = 0; j < dry.nz; j++) {
          const c = i * dry.nz + j;
          if (!dry.ok[c] || !Number.isFinite(fromSpawn[c])) continue;
          const gap = waterGap(w, px(dry, i), pz(dry, j));
          if (gap < 0 || gap > 1.5) continue;
          if (bank.every((k) => Math.hypot(px(dry, i) - px(dry, k.i), pz(dry, j) - pz(dry, k.j)) >= 3)) {
            bank.push({ c, i, j });
          }
        }
      }
      for (const s of bank) {
        const dDry = dijkstra(dry, s.c);
        const dWade = wadeFrom(s.c);
        for (const t of bank) {
          if (t === s || !Number.isFinite(dDry[t.c])) continue;
          const where = `${name}/${w.id}: (${px(dry, s.i)}, ${pz(dry, s.j)}) -> (${px(dry, t.i)}, ${pz(dry, t.j)}) `
            + `dry ${dDry[t.c].toFixed(2)} m, wade ${dWade[t.c].toFixed(2)} m`;
          expect(Number.isFinite(dWade[t.c]), `${where}: wading cannot reach it`).toBe(true);
          expect(dDry[t.c] - dWade[t.c] <= ROUTE_SLACK, where).toBe(true);
        }
      }
    }
  });

  it(`${name}: with the decks taken away, wading reaches no dry ground that walking can't`, () => {
    // Walled pockets with nothing in them: the one-cell wedges between a pond,
    // a river and the map edge. The test exists so a new one is noticed.
    const bare = { ...area, waters: area.waters.map((w) => ({ ...w, decks: [] })) };
    const dry = makeGrid(bare, dryOpen);
    const wade = makeGrid(bare, wadeOpen);
    const spawn = cellOf(dry, area.spawn.x, area.spawn.z);
    const a = dijkstra(dry, spawn);
    const b = dijkstra(wade, spawn);
    const extra = [];
    for (let i = 0; i < dry.nx; i++) {
      for (let j = 0; j < dry.nz; j++) {
        const c = i * dry.nz + j;
        if (dry.ok[c] && Number.isFinite(b[c]) && !Number.isFinite(a[c])) extra.push([px(dry, i), pz(dry, j)]);
      }
    }
    expect(extra).toEqual(KNOWN_WEDGES[name] ?? []);
  });

  it(`${name}: no collider's keep-out disc reaches water`, () => {
    for (const c of area.colliders ?? []) {
      expect(waterClearance(area.waters, c.x, c.z), `collider at (${c.x}, ${c.z})`)
        .toBeGreaterThanOrEqual(c.r + CAT_RADIUS);
    }
  });
});

describe('the naive band', () => {
  it('the naive band would have failed', () => {
    const area = AREAS.moor;
    const naive = (a, x, z) => isWalkableAt({ ...a, waters: [] }, x, z) && waterClearance(a.waters, x, z) > -1.2;
    const dry = makeGrid(area, dryOpen);
    const g = makeGrid(area, naive);
    const s = cellOf(dry, -41, 6.5);
    const t = cellOf(dry, -34.5, 6.5);
    const dDry = dijkstra(dry, s)[t];
    const dNaive = dijkstra(g, s)[t];
    expect(dDry - dNaive).toBeGreaterThan(80);
  });
});
