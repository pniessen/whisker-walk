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
const { propsFor } = await import('../src/propsets.js');
const { addGatewayDressing } = await import('../src/world/gateway.js');
const { itemsOf: docksItems } = await import('../src/world/docksdressing.js');
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
// Built as a Clan Edition walk builds them: walk.js hands each builder the
// gate ends it then draws (`gateEnds`), and the Fair and the Farm cut their
// front fences for them. A Legacy walk (and a bare build) hands none.
for (const id of IDS) areas[id] = MODS[id].build(scenes[id] = new THREE.Scene(), { gateEnds: endsFor(id) });

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
      // No collider of the place on the fence line near the gate: the fence
      // has none (a cat slips between the pickets). If it ever gets them, this
      // fails, and the check that they meet each post with no cat-sized gap
      // (and leave the opening clear) has to be written then, on purpose.
      const onLine = areas[a].colliders.filter((c) => Math.abs(c.z - line) < c.r + 0.3 && Math.abs(c.x - e.x) < 12);
      expect(onLine, `${a} colliders on the front fence line by ${id}`).toEqual([]);
    });
  }

  // Legacy Edition draws no gates (walk.js: Clan Edition only), so its builds
  // get no `gateEnds` and keep the front fence whole, as it always was.
  for (const [a, id, meshName] of [['fair', 'fair-park', 'fairFence'], ['farm', 'farm-park', 'farmFences']]) {
    it(`${a}: built for Legacy (no gate ends), the front fence runs on unbroken where ${id} would stand`, () => {
      const scene = new THREE.Scene();
      MODS[a].build(scene);
      const e = endById(id).end;
      const line = FENCE_LINE[a];
      const mesh = scene.getObjectByName(meshName);
      mesh.updateWorldMatrix(true, false);
      const pos = mesh.geometry.attributes.position;
      const v = new THREE.Vector3();
      const xs = [];
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        if (Math.abs(v.z - line) <= 0.3 && Math.abs(v.x - e.x) <= GATE_HALF + 1) xs.push(v.x);
      }
      // pickets all the way across where the opening would be: no stretch of
      // more than half a metre without fence
      const sorted = [...new Set(xs.map((x) => +x.toFixed(3)))].sort((p, q) => p - q);
      expect(sorted[0]).toBeLessThanOrEqual(e.x - GATE_HALF - 0.5);
      expect(sorted.at(-1)).toBeGreaterThanOrEqual(e.x + GATE_HALF + 0.5);
      const gaps = sorted.slice(1).map((x, i) => x - sorted[i]);
      expect(Math.max(...gaps), `${a}: widest stretch with no fence by ${id}`).toBeLessThan(0.5);
    });
  }
});

// P2 (the owner, 2026-11-21): the Docks' gate to the Seaside stood alone in an
// open yard. A railing now runs on from each of its posts along the edge line,
// one way (-z) to the bounds and the other (+z) to the south quay's pavement,
// so the gate reads as the way through it.
describe('P2: the Docks\' gate to the Seaside stands in a railing', () => {
  const e = endById('docks-seaside').end;
  const area = areas.docks;
  const scene = new THREE.Scene();
  const gates = addGatewayDressing(scene, 'docks');
  const gate = scene.children.find((o) => o.name === 'gateway' && o.userData.endId === e.id);
  const wings = scene.children.filter((o) => o.name === 'gateWings' && o.userData.endId === e.id);
  scene.updateMatrixWorld(true);
  const PAVEMENT_Z = -9.6; // the south quay's pavement (docks.js: sidewalk at z -9, 1.2 wide)
  const HINGE_END = area.bounds.minZ; // the hinge side runs to the bounds
  // Along the line x 35: z from the bounds to just short of the pavement.
  const along = (z0, z1, step) => {
    const out = [];
    for (let z = z0; z <= z1 + 1e-9; z += step) out.push(z);
    return out;
  };

  it('has a railing on both sides, drawn on the edge line, joining each post and running out to the bounds and the quay', () => {
    expect(gate).toBeTruthy();
    expect(wings).toHaveLength(1);
    const body = gate.getObjectByName('gateBody');
    const ray = new THREE.Raycaster();
    const hits = (z, y) => {
      ray.set(new THREE.Vector3(e.x - 1, y, z), new THREE.Vector3(1, 0, 0));
      ray.far = 2;
      return ray.intersectObjects([body, ...wings], false).length > 0;
    };
    // At the top rail's height, the railing is there everywhere from each
    // post out to the end of its run (the posts' own width included)...
    const miss = [];
    for (const z of [...along(HINGE_END + 0.05, e.z - GATE_HALF, 0.1), ...along(e.z + GATE_HALF, PAVEMENT_Z - 0.75, 0.1)]) {
      if (!hits(z, 0.9)) miss.push(+z.toFixed(2));
    }
    expect(miss, 'no rail across the line at these z').toEqual([]);
    // ... and nowhere past those ends, nor in the gate's opening (the leaf is
    // not the railing).
    for (const z of [HINGE_END - 0.4, PAVEMENT_Z - 0.3, ...along(e.z - GATE_HALF + 0.2, e.z + GATE_HALF - 0.2, 0.1)]) {
      expect(hits(z, 0.9), `rail at z ${z.toFixed(2)}`).toBe(false);
    }
  });

  it('its colliders block her cat everywhere along it except through the gate', () => {
    const blocked = (x, z) => gates.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + CAT_RADIUS);
    const open = [];
    const shut = [];
    for (const z of along(HINGE_END, PAVEMENT_Z - 0.75, 0.02)) {
      const inOpening = Math.abs(z - e.z) < GATE_HALF;
      if (!inOpening && !blocked(e.x, z)) open.push(+z.toFixed(2));
      if (Math.abs(z - e.z) <= GATE_HALF - GATE_POST_R - CAT_RADIUS && blocked(e.x, z)) shut.push(+z.toFixed(2));
    }
    expect(open, 'a cat gets through the railing at these z').toEqual([]);
    expect(shut, 'the open gate is blocked at these z').toEqual([]);
    // and never the area's own list: walk.js pushes them on the live one
    expect(area.colliders.some((c) => Math.abs(c.x - e.x) < 0.01 && c.z < e.z - GATE_HALF)).toBe(false);
  });

  it('stands clear of everything in the yard: colliders, points, perches, props and the dressing', () => {
    const seg = [e.x, HINGE_END, e.x, PAVEMENT_Z - 0.6];
    for (const c of area.colliders) expect(segDist(c.x, c.z, seg) - c.r, `collider (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(0.5);
    const props = propsFor('docks');
    for (const t of [...(area.pois ?? []), ...(area.collectibles ?? []), ...(area.scenics ?? []), ...(area.perches ?? []), ...(GOLD_MICE.docks ?? []),
      ...props.carryables, ...props.knockables, ...props.markables, ...props.flaps, ...props.rests]) {
      expect(segDist(t.x, t.z, seg), `(${t.x}, ${t.z}) by the railing`).toBeGreaterThanOrEqual(1.0);
    }
    for (const it of docksItems()) {
      expect(segDist(it.x, it.z, seg) - it.r, `the dressing's ${it.what} at (${it.x}, ${it.z}) on the railing`).toBeGreaterThanOrEqual(0.3);
    }
    const arr = arrivalFor('seaside-docks');
    for (const c of gates.colliders) expect(Math.hypot(arr.x - c.x, arr.z - c.z) - c.r, 'the arrival spot vs the railing').toBeGreaterThanOrEqual(1.2);
  });
});

