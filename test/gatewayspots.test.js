import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/borderposts.test.js).
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

const { GATEWAY_ENDS, GATE_HALF, GATE_POST_R, GATE_REACH, arrivalFor, endsFor, endById } = await import('../src/gateways.js');
const { BORDER_POSTS } = await import('../src/borderposts.js');
const { floodFrom } = await import('./helpers/flood.js');
const { waterGap } = await import('../src/world/builder.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { setGrow } = await import('../src/grow.js');
const neighborhood = await import('../src/world/neighborhood.js');
const park = await import('../src/world/park.js');
const fair = await import('../src/world/fair.js');
const farm = await import('../src/world/farm.js');
const docks = await import('../src/world/docks.js');
const seaside = await import('../src/world/seaside.js');

const MODS = { neighborhood, park, fair, farm, docks, seaside };
const IDS = Object.keys(MODS);
const T = 60000;

setGrow(false);
const areas = {};
const scenes = {};
for (const id of IDS) areas[id] = MODS[id].build(scenes[id] = new THREE.Scene());

const floods = {};
const flood = (id) => (floods[id] ??= floodFrom(areas[id], MODS[id].SPAWN, (x, z) => isWalkableAt(areas[id], x, z)));
const allEnds = IDS.flatMap((a) => endsFor(a).map((e) => [a, e]));
const edgeEnds = allEnds.filter(([, e]) => e.placement === 'edge');

function segDist(x, z, [x1, z1, x2, z2]) {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
}
const nearestSide = (b, p) => {
  const d = { west: p.x - b.minX, east: b.maxX - p.x, north: p.z - b.minZ, south: b.maxZ - p.z };
  return Object.keys(d).reduce((a, k) => (d[k] < d[a] ? k : a));
};
// The two gate posts: centre +/- GATE_HALF along the edge.
function posts(e) {
  const ns = e.faces === 'north' || e.faces === 'south';
  return ns
    ? [{ x: e.x - GATE_HALF, z: e.z }, { x: e.x + GATE_HALF, z: e.z }]
    : [{ x: e.x, z: e.z - GATE_HALF }, { x: e.x, z: e.z + GATE_HALF }];
}
// The Fair's and the Farm's south edge, for a child, is the white picket
// front fence along the gate arch's line (GATE_AT, z 45), 5 m in from the
// bounds: the strip past it is the lane where a walk starts.
const FENCE_LINE = { fair: fair.GATE_AT.z, farm: farm.GATE_AT.z };
const edgeGap = (b, p) => Math.min(p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z);

describe('gateways: where the gates stand', () => {
  it('has ten ends, all on an edge, in six built areas', () => {
    expect(allEnds).toHaveLength(10);
    expect(edgeEnds).toHaveLength(10);
    for (const id of IDS) expect(areas[id].colliders.length, id).toBeGreaterThan(10);
  });

  it('G1 every edge end faces the side it is nearest', () => {
    for (const [a, e] of edgeEnds) expect(nearestSide(areas[a].bounds, e), `${a}/${e.id}`).toBe(e.faces);
  });

  it('G5 every edge end stands where the border-post rules say', () => {
    for (const [a, e] of edgeEnds) {
      const at = `${a}/${e.id}`;
      const area = areas[a];
      const spawn = MODS[a].SPAWN;
      if (FENCE_LINE[a] !== undefined && e.faces === 'south') {
        // The place's edge on that side is its front fence (P1 below): the
        // gate is set into it, 5 m in from the bounds.
        expect(Math.abs(e.z - FENCE_LINE[a]), `${at} on the front fence`).toBeLessThanOrEqual(0.01);
      } else {
        const g = edgeGap(area.bounds, e);
        expect(g, `${at} inside the edge`).toBeGreaterThanOrEqual(2.5);
        expect(g, `${at} inside the edge`).toBeLessThanOrEqual(3.5);
      }
      for (const p of posts(e)) {
        for (const c of area.colliders) {
          expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, `${at} gate post (${p.x}, ${p.z}) vs collider (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(1.2);
        }
      }
      for (const w of area.waters ?? []) expect(waterGap(w, e.x, e.z), `${at} vs water`).toBeGreaterThanOrEqual(2.0);
      for (const t of [...(area.pois ?? []), ...(area.collectibles ?? []), ...(area.scenics ?? []), ...(GOLD_MICE[a] ?? [])]) {
        expect(Math.hypot(e.x - t.x, e.z - t.z), `${at} vs a point of interest`).toBeGreaterThanOrEqual(3.0);
      }
      for (const t of area.perches ?? []) expect(Math.hypot(e.x - t.x, e.z - t.z), `${at} vs a perch`).toBeGreaterThanOrEqual(2.0);
      expect(Math.hypot(e.x - spawn.x, e.z - spawn.z), `${at} vs the spawn`).toBeGreaterThanOrEqual(GATE_REACH + 2);
      expect(Math.hypot(e.x - (spawn.x + 2), e.z - (spawn.z - 3)), `${at} vs the race start pad`).toBeGreaterThanOrEqual(3.0);
      for (const p of BORDER_POSTS[a] ?? []) expect(Math.hypot(e.x - p.x, e.z - p.z), `${at} vs border post ${p.id}`).toBeGreaterThanOrEqual(3.0);
      expect(flood(a).reachesWithin(e.x, e.z, 1.2), `${at} is reachable on foot`).toBe(true);
    }
  }, T);

  it('every arrival spot is clear, walkable and reachable', () => {
    for (const [, e] of allEnds) {
      const arr = arrivalFor(e.id);
      const a = arr.areaId;
      const at = `${e.id} -> ${a}`;
      const area = areas[a];
      expect(isWalkableAt(area, arr.x, arr.z), `${at} walkable`).toBe(true);
      expect(flood(a).reaches(arr.x, arr.z), `${at} on the flood`).toBe(true);
      for (const c of area.colliders) {
        expect(Math.hypot(arr.x - c.x, arr.z - c.z) - c.r, `${at} vs collider (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(1.2);
      }
      for (const end of endsFor(a)) {
        for (const p of posts(end)) expect(Math.hypot(arr.x - p.x, arr.z - p.z), `${at} vs gate post of ${end.id}`).toBeGreaterThanOrEqual(1.2);
        expect(Math.hypot(arr.x - end.x, arr.z - end.z), `${at} vs end ${end.id}`).toBeGreaterThanOrEqual(GATE_REACH + 2);
      }
      for (const w of area.waters ?? []) expect(waterGap(w, arr.x, arr.z), `${at} vs water`).toBeGreaterThanOrEqual(2.0);
      expect(edgeGap(area.bounds, arr), `${at} inside the bounds`).toBeGreaterThanOrEqual(2.5);
    }
  }, T);

  it('every lane sample is clear and on the flood, and the lane joins the walks to its end', () => {
    for (const [a, e] of allEnds.filter(([, x]) => x.lane)) {
      const at = `${a}/${e.id}`;
      expect(a, 'only the Park has lanes').toBe('park');
      const [x1, z1, x2, z2] = e.lane;
      const n = Math.max(1, Math.round(Math.hypot(x2 - x1, z2 - z1) / 0.5));
      for (let i = 0; i <= n; i++) {
        const x = x1 + ((x2 - x1) * i) / n, z = z1 + ((z2 - z1) * i) / n;
        for (const c of areas[a].colliders) {
          expect(Math.hypot(x - c.x, z - c.z) - c.r, `${at} lane (${x}, ${z}) vs collider (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(1.2);
        }
        expect(flood(a).reaches(x, z), `${at} lane (${x}, ${z}) on the flood`).toBe(true);
      }
      const near = Math.min(...park.PARK_PATHS.map((s) => segDist(x1, z1, s)));
      expect(near, `${at} lane start vs PARK_PATHS`).toBeLessThanOrEqual(0.5);
      expect([x2, z2], `${at} lane ends at the centre`).toEqual([e.x, e.z]);
    }
  }, T);

  it('growing areas build the same bounds (no gate on a growing edge)', () => {
    try {
      for (const id of IDS) {
        setGrow(true);
        const grown = MODS[id].build(new THREE.Scene());
        expect(grown.bounds, id).toEqual(areas[id].bounds);
      }
    } finally {
      setGrow(null);
    }
  }, T);
});

// P1 (the owner, 2026-11-21): the Fair's and the Farm's gates back to the Park
// are set into each place's white picket front fence, the fence meeting both
// gate posts. The front fence runs right across the place along the gate
// arch's line (GATE_AT, z 45); the strip past it, out to the bounds, is the
// lane where a walk starts. It has no collider (fair.js, farm.js: a cat slips
// between the pickets), so what meets the posts is the drawn fence.
describe('P1: the Fair\'s and the Farm\'s gates to the Park are set into the front fence', () => {
  for (const [a, id, meshName] of [['fair', 'fair-park', 'fairFence'], ['farm', 'farm-park', 'farmFences']]) {
    it(`${a}/${id}: both posts on the fence line, nothing of the fence in the opening, the fence meeting each post`, () => {
      const e = endById(id).end;
      const line = FENCE_LINE[a];
      const [p, q] = posts(e).sort((u, w) => u.x - w.x);
      for (const post of [p, q]) expect(Math.abs(post.z - line), `${id} post (${post.x}, ${post.z}) on the fence line z ${line}`).toBeLessThanOrEqual(0.05);
      // The drawn fence: every vertex of the place's fence mesh on the line.
      const mesh = scenes[a].getObjectByName(meshName);
      expect(mesh, meshName).toBeTruthy();
      mesh.updateWorldMatrix(true, false);
      const pos = mesh.geometry.attributes.position;
      const v = new THREE.Vector3();
      const xs = [];
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        if (Math.abs(v.z - line) <= 0.3) xs.push(v.x);
      }
      const lo = p.x + GATE_POST_R;
      const hi = q.x - GATE_POST_R;
      expect(xs.filter((x) => x > lo && x < hi), `${meshName} vertices in the opening of ${id}`).toEqual([]);
      // Meets: the fence's nearest vertex beyond each post is within a cat's
      // half-width of that post's side, so no cat-sized gap is left.
      const left = Math.max(...xs.filter((x) => x <= lo));
      const right = Math.min(...xs.filter((x) => x >= hi));
      expect(p.x - GATE_POST_R - left, `${id}: gap between the fence and the post at x ${p.x}`).toBeLessThan(CAT_RADIUS);
      expect(right - (q.x + GATE_POST_R), `${id}: gap between the fence and the post at x ${q.x}`).toBeLessThan(CAT_RADIUS);
      // No collider of the place in the opening either; and if the fence ever
      // gets colliders, they meet each post too (today it has none).
      const onLine = areas[a].colliders.filter((c) => Math.abs(c.z - line) < c.r + 0.3 && Math.abs(c.x - e.x) < 12);
      for (const c of onLine) {
        expect(c.x + c.r <= lo || c.x - c.r >= hi, `${a} collider (${c.x}, ${c.z}) in the opening of ${id}`).toBe(true);
      }
      const westC = onLine.filter((c) => c.x < e.x);
      const eastC = onLine.filter((c) => c.x > e.x);
      if (westC.length) expect(p.x - GATE_POST_R - Math.max(...westC.map((c) => c.x + c.r))).toBeLessThan(2 * CAT_RADIUS);
      if (eastC.length) expect(Math.min(...eastC.map((c) => c.x - c.r)) - (q.x + GATE_POST_R)).toBeLessThan(2 * CAT_RADIUS);
    });
  }
});

