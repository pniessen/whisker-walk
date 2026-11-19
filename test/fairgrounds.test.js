import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The Fairground's polish pass on the place itself (P3 "fair-grounds"): the
// trodden ground, the strings raised clear of the camera, the dusk pools
// under the poles, the faces nobody sees, the flower tubs, the puddles, the
// squeeze gap's hay bales and the dressing round the edges (fairedge.js).

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

const fair = await import('../src/world/fair.js');
const {
  build, STALLS, DUCK_POOL, FIELD, FAIR_REGISTRATION: REG, FAIR_TRAILS, POLE_H, LAMP_POOLS, FLOWER_TUBS, FAIR_PUDDLES,
  GROUND_CULL, cullGroundFaces, fairWear, fairBare, fairGroundTint,
} = fair;
const { TEACUPS, HELTER } = await import('../src/world/fairrides.js');
const { STALL, BANDSTAND } = await import('../src/world/fairparts.js');
const { TUB, BALE } = await import('../src/world/fairedge.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { frameColliders } = await import('../src/propsets.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { createLampPools } = await import('../src/render/dusk.js');
const { rectDist } = await import('../src/world/dressing.js');

const scene = new THREE.Scene();
const area = build(scene);
scene.updateMatrixWorld(true);
const dist = (a, c) => Math.hypot(a.x - c.x, a.z - c.z);
const standable = (x, z) => isWalkableAt(area, x, z);
const v = new THREE.Vector3();
// Every vertex of a mesh, in the world.
function eachVertex(mesh, fn) {
  const p = mesh.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) fn(v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
}
// Triangles lying on the ground (all three corners below 3 cm) facing down.
function groundFaces(mesh) {
  const p = mesh.geometry.attributes.position;
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3(); const n = new THREE.Vector3(); const u = new THREE.Vector3();
  let under = 0;
  for (let t = 0; t < p.count / 3; t++) {
    a.fromBufferAttribute(p, t * 3).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(p, t * 3 + 1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(p, t * 3 + 2).applyMatrix4(mesh.matrixWorld);
    n.subVectors(b, a).cross(u.subVectors(c, a)).normalize();
    if (Math.max(a.y, b.y, c.y) < 0.03 && n.y < -0.9) under++;
  }
  return under;
}

// Every spot a grounded cat can walk to from the gate (the hedge gap's frame
// is solid, as in the game; its opening is not), on a 0.5 m grid.
const CELL = 0.5;
const solid = { ...area, colliders: [...area.colliders, ...REG.propSet.flaps.flatMap((f) => frameColliders(f))] };
const walk = (x, z) => isWalkableAt(solid, x, z);
const grid = (() => {
  const b = area.bounds;
  const W = Math.floor((b.maxX - b.minX) / CELL) + 1;
  const H = Math.floor((b.maxZ - b.minZ) / CELL) + 1;
  const seen = new Uint8Array(W * H);
  const at = (i, j) => [b.minX + i * CELL, b.minZ + j * CELL];
  const i0 = Math.round((area.spawn.x - b.minX) / CELL);
  const j0 = Math.round((area.spawn.z - b.minZ) / CELL);
  const queue = [[i0, j0]];
  seen[j0 * W + i0] = 1;
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di; const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H || seen[nj * W + ni]) continue;
      if (!walk(...at(ni, nj))) continue;
      seen[nj * W + ni] = 1;
      queue.push([ni, nj]);
    }
  }
  return { W, H, seen, at };
})();
const reached = (x, z) => {
  const b = area.bounds;
  const i = Math.round((x - b.minX) / CELL);
  const j = Math.round((z - b.minZ) / CELL);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (grid.seen[(j + dj) * grid.W + i + di]) return true;
  return false;
};

describe('the strings overhead, clear of the camera', () => {
  // the chase camera's zoom step 2 rides 3.8 m over the cat
  const ZOOM2 = 3.8;
  it('hangs the bunting and the bulbs over the midway and the plaza above zoom step 2', () => {
    expect(POLE_H).toBeGreaterThanOrEqual(5);
    let over = 0;
    for (const name of ['fairBunting', 'fairBulbs']) {
      const m = scene.getObjectByName(name);
      eachVertex(m, (p) => {
        const onMidway = Math.abs(p.x) <= 3.2 && p.z >= 11.5 && p.z <= 43.2; // (the gate's own bunting starts lower, at the gate)
        const onPlaza = Math.hypot(p.x, p.z) <= 12.2 && p.z < 11.5;
        if (!onMidway && !onPlaza) return;
        over++;
        expect(p.y, `${name} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBeGreaterThan(ZOOM2 + 0.2);
      });
    }
    expect(over).toBeGreaterThan(500);
  });
});

describe('pools of light at dusk', () => {
  const lamps = [];
  scene.traverse((o) => { if (o.userData?.lampGlobeY > 0) lamps.push(o); });

  it('tags an empty anchor at the foot of each lit pole, one of each midway pair and all eight round the plaza', () => {
    expect(lamps).toHaveLength(LAMP_POOLS.length);
    expect(LAMP_POOLS).toHaveLength(5 + 8);
    for (const o of lamps) {
      expect(o.isMesh).toBeFalsy();
      expect(o.children).toHaveLength(0);
      const w = o.getWorldPosition(new THREE.Vector3());
      expect(w.y).toBe(0); // the pool lies at the anchor's height
      expect(o.userData.lampGlobeY).toBe(POLE_H);
      expect(LAMP_POOLS.some(([x, z]) => Math.hypot(w.x - x, w.z - z) < 1e-9)).toBe(true);
    }
    // side to side down the midway
    const midway = LAMP_POOLS.slice(0, 5).map(([x]) => Math.sign(x));
    for (let i = 1; i < midway.length; i++) expect(midway[i]).toBe(-midway[i - 1]);
  });

  it('keeps them through the prop merge, and dusk lays a pool under each', () => {
    const s = new THREE.Scene();
    build(s);
    mergeStaticProps(s);
    let n = 0;
    s.traverse((o) => { if (o.userData?.lampGlobeY > 0) n++; });
    expect(n).toBe(LAMP_POOLS.length);
    const pools = createLampPools(s);
    expect(pools).toBeTruthy();
    expect(pools.geometry.attributes.position.count).toBe(LAMP_POOLS.length * (1 + 2 * 20));
  });
});

describe('the faces nobody sees', () => {
  it('leaves no face lying on the ground facing down in the fair’s static meshes', () => {
    for (const name of GROUND_CULL) {
      const m = scene.getObjectByName(name);
      expect(m, name).toBeTruthy();
      expect(groundFaces(m), name).toBe(0);
    }
  });

  it('drops only downward faces on the ground, and only from the meshes it is given', () => {
    const s = new THREE.Scene();
    // a plain triangle soup, as the kit's merged meshes are
    const soup = (y) => { const g = new THREE.BoxGeometry(1, 1, 1).translate(0, y, 0).toNonIndexed(); g.clearGroups(); return g; };
    const onGround = new THREE.Mesh(soup(0.5), new THREE.MeshBasicMaterial());
    onGround.name = 'onGround';
    const lifted = new THREE.Mesh(soup(0.6), new THREE.MeshBasicMaterial());
    lifted.name = 'lifted';
    const other = new THREE.Mesh(soup(0.5), new THREE.MeshBasicMaterial());
    other.name = 'other';
    s.add(onGround, lifted, other);
    expect(cullGroundFaces(s, ['onGround', 'lifted', 'missing'])).toBe(2);
    expect(onGround.geometry.attributes.position.count).toBe(30);
    expect(onGround.geometry.attributes.normal.count).toBe(30);
    expect(lifted.geometry.attributes.position.count).toBe(36);
    expect(other.geometry.attributes.position.count).toBe(36);
    expect(cullGroundFaces(s, ['onGround'])).toBe(0);
    // a mesh in a group is judged where it stands in the world
    const g = new THREE.Group();
    g.position.y = 2;
    const up = new THREE.Mesh(soup(0.5), new THREE.MeshBasicMaterial());
    up.name = 'up';
    g.add(up);
    s.add(g);
    expect(cullGroundFaces(s, ['up'])).toBe(0);
  });

  it('names nothing that moves: no ride’s turning parts, the train or the games’ pieces', () => {
    const moving = [];
    for (const r of Object.values(area.rides)) {
      for (const o of [r?.turn, r?.train, ...(Array.isArray(r) ? r : []), ...(r?.horses ?? []), ...(r?.gondolas ?? []), ...(r?.cups ?? []), r?.marker]) {
        if (o?.isObject3D) o.traverse((m) => moving.push(m.name));
      }
    }
    for (const name of GROUND_CULL) expect(moving, name).not.toContain(name);
  });
});

describe('the trodden ground', () => {
  it('is worn round the rides, the bandstand, the duck pool and in front of every counter, not out in the field', () => {
    const near = [
      { x: -26 + TEACUPS.baseR + 0.6, z: 2 },
      { x: -33 + HELTER.baseR + 0.6, z: -33 },
      { x: -25 + BANDSTAND.r + 0.5, z: 35 },
      { x: DUCK_POOL.x + DUCK_POOL.r + 0.6, z: DUCK_POOL.z },
      ...STALLS.map((s) => ({ x: s.x + Math.sign(-s.x) * (STALL.d / 2 + 0.5), z: s.z })),
    ];
    for (const p of near) expect(fairWear(p.x, p.z), `${p.x},${p.z}`).toBeGreaterThan(0.45);
    expect(fairWear((FIELD.minX + FIELD.maxX) / 2, (FIELD.minZ + FIELD.maxZ) / 2)).toBe(0);
    expect(fairWear(-40, 0)).toBe(0);
    expect(fairWear(3, 4)).toBe(0); // under the merry-go-round, in the plaza's sand
  });

  it('turns the lawn browner where it is worn, inside the tint’s usual range elsewhere', () => {
    const p = { x: -26 + TEACUPS.baseR + 0.4, z: 2 };
    const [r, g] = fairGroundTint(p.x, p.z);
    expect(r).toBeGreaterThan(1.4);
    expect(g).toBeLessThan(0.85);
    for (const q of [[-15, -22], [-40, 0], [30, 40]]) for (const c of fairGroundTint(...q)) { expect(c).toBeGreaterThan(0.8); expect(c).toBeLessThan(1.2); }
  });

  it('grows no tufts in a thin strip along every counter and round the rides’ rims', () => {
    for (const s of STALLS) expect(fairBare(s.x + Math.sign(-s.x) * (STALL.d / 2 + 0.25), s.z), s.id).toBe(true);
    expect(fairBare(-26 + TEACUPS.baseR + 0.25, 2)).toBe(true);
    expect(fairBare(-33, -33 + HELTER.baseR + 0.3)).toBe(true);
    expect(fairBare(-26 + TEACUPS.baseR + 1.2, 2)).toBe(false); // a strip, not a disc
  });
});

describe('flower tubs, puddles and the squeeze gap', () => {
  it('plants a tub of flowers by each of the butterflies’ corners, solid, with room for the butterfly', () => {
    expect(FLOWER_TUBS).toHaveLength(4);
    const butterflies = area.critterSpawns.filter((c) => c.type === 'butterfly');
    for (const b of butterflies) expect(FLOWER_TUBS.some((t) => dist(t, b) < 2), `${b.x},${b.z}`).toBe(true);
    for (const t of FLOWER_TUBS) {
      expect(area.colliders.some((c) => dist(c, t) < 1e-6 && c.r >= TUB.r)).toBe(true);
      expect(standable(t.x, t.z)).toBe(false);
      // off the paths
      for (const g of FAIR_TRAILS) for (const [x1, z1, x2, z2] of g.segs) {
        const L2 = (x2 - x1) ** 2 + (z2 - z1) ** 2;
        const k = Math.max(0, Math.min(1, ((t.x - x1) * (x2 - x1) + (t.z - z1) * (z2 - z1)) / L2));
        expect(Math.hypot(t.x - x1 - (x2 - x1) * k, t.z - z1 - (z2 - z1) * k), `${t.x},${t.z}`).toBeGreaterThan(g.w / 2 + TUB.r);
      }
    }
    // the shared builder's flower patches are gone (their spheres were a mesh each)
    let spheres = 0;
    scene.traverse((o) => { if (o.isMesh && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius === 0.08) spheres++; });
    expect(spheres).toBe(0);
  });

  it('puts the puddles out on the lawn, off the midway, the plaza and every path', () => {
    expect(area.puddles).toEqual(FAIR_PUDDLES.map((p) => ({ ...p })));
    for (const p of area.puddles) {
      expect(rectDist(area.anchors.midway, p.x, p.z)).toBeGreaterThan(5);
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(area.anchors.plaza.r + 5);
      for (const g of FAIR_TRAILS) for (const [x1, z1, x2, z2] of g.segs) {
        const L2 = (x2 - x1) ** 2 + (z2 - z1) ** 2;
        const k = Math.max(0, Math.min(1, ((p.x - x1) * (x2 - x1) + (p.z - z1) * (z2 - z1)) / L2));
        expect(Math.hypot(p.x - x1 - (x2 - x1) * k, p.z - z1 - (z2 - z1) * k)).toBeGreaterThan(g.w / 2 + p.r + 1);
      }
    }
  });

  it('stands the hedge gap between two stacks of bales, solid, square to its path, leaving the way through open', () => {
    const gap = REG.propSet.flaps.find((f) => f.id === 'fair-gap-1');
    const ax = Math.cos(gap.rotY);
    const az = -Math.sin(gap.rotY);
    const frame = frameColliders(gap);
    const hedgeEnd = Math.max(...frame.map((c) => Math.abs((c.x - gap.x) * ax + (c.z - gap.z) * az) + c.r));
    for (const side of [-1, 1]) {
      // solid ground under the bales, all the way along each stack
      for (let u = 0.2; u < 2 * BALE.l; u += 0.25) {
        const s = side * (hedgeEnd + 0.05 + u);
        expect(standable(gap.x + ax * s, gap.z + az * s), `side ${side} at ${u.toFixed(2)}`).toBe(false);
      }
      // and open ground past the end of each stack
      const s = side * (hedgeEnd + 2 * BALE.l + 0.6 + CAT_RADIUS);
      expect(standable(gap.x + ax * s, gap.z + az * s)).toBe(true);
    }
    // the bales are in the props' one mesh: nothing new to draw
    expect(scene.getObjectByName('fairProps').isMesh).toBe(true);
  });

  it('can walk round the bale row from one side of the gap to the other', () => {
    const gap = REG.propSet.flaps.find((f) => f.id === 'fair-gap-1');
    const nx = Math.sin(gap.rotY);
    const nz = Math.cos(gap.rotY);
    expect(reached(gap.x + nx * 1.5, gap.z + nz * 1.5)).toBe(true);
    expect(reached(gap.x - nx * 1.5, gap.z - nz * 1.5)).toBe(true);
  });
});
