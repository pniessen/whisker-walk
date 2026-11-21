import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (test/roofs.test.js).
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
});

const { build } = await import('../src/world/roofs.js');
const { createRoofsBirds, BIRD_LOOK } = await import('../src/world/roofsbirds.js');
const {
  BIRD_KINDS, ROOFS_BIRDS, GUIDE, FLIGHT,
  flockPerches, perchIndex, flightGraph, flightPlan, flightPoint, chooseFlight, roofsCritterSpawns,
} = await import('../src/world/roofsflock.js');
const { ROOFS_TRAVERSAL, BLOCKS, STREETS, ROOFS_BOUNDS, LEVELS, YARD } = await import('../src/world/roofsplan.js');

// =============================================================================
// The flock drawn, perched (Rooftops step 3, Task 3): fourteen birds in two
// instanced meshes, on the built place's perches (no critters: the picture
// pages' case). And ruling R3: the roster's checks that need the drawn
// perches (pots, aerials, parapets, posts, walls), on the built area.
// =============================================================================

const area = build(new THREE.Scene());
const P = area.birdPerches;
const I = perchIndex(P);
const G = flightGraph(P, ROOFS_TRAVERSAL);
const BLOCK = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));
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
const linkOf = (a, b) => (G.links.get(a.id) || []).find((l) => l.to === b.id);
const at = (a, b, s) => flightPoint(a, b, flightPlan(a, b, linkOf(a, b)?.shape ?? 'arc'), s, { x: 0, y: 0, z: 0 });
function keepsOffHer(from, to, cat) {
  if (d3(to, cat) < FLIGHT.landFromCat - 1e-9) return 'lands within 4 m of her';
  if (d3(to, cat) <= d3(from, cat) + 0.5) return 'lands no further from her';
  for (let s = 0.1; s <= 0.9 + 1e-9; s += 0.05) if (d3(at(from, to, s), cat) < FLIGHT.clearCat - 1e-9) return `passes within 1.5 m of her at s ${s.toFixed(2)}`;
  return null;
}

// A drawn instance's pose: where it stands, its heading (yaw: 0 faces +z),
// how far its nose dips (pitch) and its scale.
const m4 = new THREE.Matrix4();
const v = new THREE.Vector3();
const q = new THREE.Quaternion();
const sc = new THREE.Vector3();
function pose(mesh, i) {
  mesh.getMatrixAt(i, m4);
  m4.decompose(v, q, sc);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  return { x: v.x, y: v.y, z: v.z, yaw: Math.atan2(fwd.x, fwd.z), pitch: -Math.asin(fwd.y), scale: sc.x };
}
const angle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
// Puts bird `b` on perch `p` (the live state the flights write, Task 4).
const placeOn = (b, p) => { b.at = p.id; Object.assign(b.pos, { x: p.x, y: p.y, z: p.z }); };
function run(f, seconds, cat = null, dt = 1 / 60, each = null) {
  const n = Math.round(seconds / dt);
  for (let k = 0; k < n; k++) {
    f.update(dt, cat, null);
    each?.(k);
  }
}
const triangles = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

afterEach(() => vi.restoreAllMocks());

describe('the flock drawn, perched', () => {
  it('the flock is two meshes, casting nothing, fourteen birds at their homes', () => {
    const scene = new THREE.Scene();
    const before = scene.children.length;
    const f = createRoofsBirds(area, { scene });
    const [flock, wings] = f.meshes;
    expect(f.meshes).toHaveLength(2);
    expect(scene.children.length).toBe(before + 2);
    expect(flock.isInstancedMesh && wings.isInstancedMesh).toBe(true);
    expect([flock.name, wings.name]).toEqual(['roofsFlock', 'roofsFlockWings']);
    expect([flock.count, wings.count]).toEqual([14, 28]);
    for (const m of f.meshes) {
      expect(scene.children).toContain(m);
      expect(m.castShadow).toBe(false);
      expect(m.userData.noCast).toBe(true);
      expect(m.frustumCulled).toBe(false);
      expect(m.material.vertexColors).toBe(true);
      expect(m.geometry.attributes.color).toBeDefined();
      expect(m.instanceColor).toBeTruthy();
    }
    // low poly: a body, head, beak and tail in at most 64 triangles; a wing in at most 4
    expect(triangles(flock.geometry)).toBeLessThanOrEqual(64);
    expect(triangles(wings.geometry)).toBeLessThanOrEqual(4);
    // each bird coloured by its kind, its wings a shade of their own
    expect(BIRD_LOOK).toEqual({
      pigeon: { body: 0x8d93a0, wing: 0x7a8090 },
      sparrow: { body: 0x8a6040, wing: 0x6e4a30 },
      gull: { body: 0xeceae4, wing: 0xb8bcc2 },
    });
    const c = new THREE.Color();
    // the birds, at their homes, at rest
    expect(f.birds.map((b) => b.id)).toEqual(ROOFS_BIRDS.map((b) => b.id));
    ROOFS_BIRDS.forEach((r, i) => {
      const b = f.birds[i];
      const home = I.get(r.home);
      expect(b).toMatchObject({ id: r.id, kind: r.kind, at: r.home, flying: false });
      expect(b.pos).toEqual({ x: home.x, y: home.y, z: home.z });
      const p = pose(flock, i);
      // (the instance buffers are float32)
      expect(p.x).toBeCloseTo(home.x, 4);
      expect(p.y).toBeCloseTo(home.y, 4);
      expect(p.z).toBeCloseTo(home.z, 4);
      expect(p.scale).toBeCloseTo(BIRD_KINDS[r.kind].scale, 5);
      flock.getColorAt(i, c);
      expect(c.getHex(), r.id).toBe(new THREE.Color(BIRD_LOOK[r.kind].body).getHex());
      for (const w of [2 * i, 2 * i + 1]) {
        wings.getColorAt(w, c);
        expect(c.getHex(), r.id).toBe(new THREE.Color(BIRD_LOOK[r.kind].wing).getHex());
      }
    });
    // the wings folded: each lies along its own bird's body, one on either side
    const box = new THREE.Box3();
    const wv = new THREE.Vector3();
    const bodyBox = flock.geometry.boundingBox ?? (flock.geometry.computeBoundingBox(), flock.geometry.boundingBox);
    for (let i = 0; i < 14; i++) {
      flock.getMatrixAt(i, m4);
      const inv = m4.clone().invert();
      const sides = [];
      for (const w of [2 * i, 2 * i + 1]) {
        const wm = new THREE.Matrix4();
        wings.getMatrixAt(w, wm);
        box.makeEmpty();
        const pos = wings.geometry.attributes.position;
        for (let k = 0; k < pos.count; k++) box.expandByPoint(wv.fromBufferAttribute(pos, k).applyMatrix4(wm).applyMatrix4(inv));
        // in the bird's own frame, inside its body's box (2 cm to spare)
        expect(bodyBox.clone().expandByScalar(0.02).containsBox(box), `${f.birds[i].id} wing ${w}`).toBe(true);
        sides.push((box.min.x + box.max.x) / 2);
      }
      expect(sides[0] * sides[1]).toBeLessThan(0);
    }
    // and taken away
    const disposed = [];
    for (const m of f.meshes) {
      m.geometry.addEventListener('dispose', () => disposed.push(m.name));
      m.material.addEventListener('dispose', () => disposed.push(`${m.name}:material`));
    }
    f.dispose();
    expect(scene.children.length).toBe(before);
    expect(disposed.sort()).toEqual(['roofsFlock', 'roofsFlock:material', 'roofsFlockWings', 'roofsFlockWings:material']);
  });

  it('pigeons and sparrows on the flat roofs peck; a bird on a ridge, a pot or an aerial sits; near her, each faces her', () => {
    const scene = new THREE.Scene();
    const f = createRoofsBirds(area, { scene });
    const [flock] = f.meshes;
    const kindAt = (b) => I.get(b.at).kind;
    // the first view, at their homes: a pigeon and two sparrows on peck spots, a pigeon on an aerial
    const peckers = f.birds.map((b, i) => i).filter((i) => kindAt(f.birds[i]) === 'roof');
    expect(peckers.map((i) => f.birds[i].kind).sort()).toEqual(['pigeon', 'sparrow', 'sparrow']);
    const onAerial = f.birds.findIndex((b) => kindAt(b) === 'aerial');
    expect(f.birds[onAerial].kind).toBe('pigeon');
    // and two more sitters put on a ridge and a pot
    const ridgeBird = f.birds.findIndex((b) => b.kind === 'pigeon' && kindAt(b) === 'move');
    const potBird = f.birds.findIndex((b) => b.kind === 'gull');
    placeOn(f.birds[ridgeBird], P.find((p) => p.kind === 'ridge'));
    placeOn(f.birds[potBird], P.find((p) => p.kind === 'pot'));
    const sitters = [onAerial, ridgeBird, potBird];
    // twenty seconds alone (she is nowhere near)
    const dt = 1 / 60;
    const pecks = peckers.map(() => []);
    const peaked = peckers.map(() => 0);
    const yaws = sitters.map(() => []);
    run(f, 20, null, dt, (k) => {
      const t = (k + 1) * dt;
      peckers.forEach((i, j) => {
        const p = pose(flock, i);
        if (p.pitch > 0.01) {
          const last = pecks[j].at(-1);
          if (!last || t - last.end > 2 * dt) pecks[j].push({ start: t, end: t });
          else last.end = t;
        }
        peaked[j] = Math.max(peaked[j], p.pitch);
        expect(p.x).toBeCloseTo(f.birds[i].pos.x, 4); // it pecks where it stands
      });
      sitters.forEach((i, j) => {
        const s = pose(flock, i);
        expect(Math.abs(s.pitch), f.birds[i].id).toBeLessThan(1e-6); // a sitter never dips
        yaws[j].push(s.yaw);
      });
    });
    // a peck: its nose down 0.35 rad for 0.25 s, every 1.5 to 3 s
    peckers.forEach((i, j) => {
      const id = f.birds[i].id;
      expect(peaked[j], id).toBeGreaterThan(0.34);
      expect(peaked[j], id).toBeLessThanOrEqual(0.35 + 1e-9);
      expect(pecks[j].length, id).toBeGreaterThanOrEqual(6);
      expect(pecks[j].length, id).toBeLessThanOrEqual(14);
      for (const p of pecks[j]) expect(p.end - p.start, id).toBeLessThanOrEqual(0.25 + 1e-9);
      for (let k = 1; k < pecks[j].length; k++) {
        const gap = pecks[j][k].start - pecks[j][k - 1].start;
        expect(gap, id).toBeGreaterThanOrEqual(1.5 - 2 * dt);
        expect(gap, id).toBeLessThanOrEqual(3 + 2 * dt);
      }
    });
    // a sitter turns its head every few seconds: several looks, none a full turn round
    for (const ys of yaws) {
      const turns = ys.filter((y, k) => k > 0 && angle(y, ys[k - 1]) > 1e-6 && (k < 2 || angle(ys[k - 1], ys[k - 2]) <= 1e-6)).length;
      expect(turns).toBeGreaterThanOrEqual(3);
      expect(Math.max(...ys.map((y) => angle(y, ys[0])))).toBeLessThan(2);
    }
    // near her (3 m off, within 6 m), each bird turns to face her, and none pecks
    f.birds.forEach((b, i) => {
      const cat = { x: b.pos.x + 2.4, y: b.pos.y, z: b.pos.z - 1.8 };
      run(f, 1.5, cat);
      const p = pose(flock, i);
      expect(angle(p.yaw, Math.atan2(cat.x - p.x, cat.z - p.z)), b.id).toBeLessThan(0.02);
      run(f, 3, cat, dt, () => expect(Math.abs(pose(flock, i).pitch), b.id).toBeLessThan(1e-6));
    });
    f.dispose();
  });

  it('its update adds nothing to the scene and keeps its instance buffers', () => {
    const scene = new THREE.Scene();
    const f = createRoofsBirds(area, { scene });
    const [flock, wings] = f.meshes;
    const n = scene.children.length;
    const arrays = [flock.instanceMatrix.array, wings.instanceMatrix.array, flock.instanceColor.array, wings.instanceColor.array];
    const versions = [flock.instanceMatrix.version, wings.instanceMatrix.version];
    const cat = { ...f.birds[0].pos, x: f.birds[0].pos.x + 3 };
    for (let k = 0; k < 600; k++) f.update(1 / 60, k % 2 ? cat : null, null);
    expect(scene.children.length).toBe(n);
    expect([flock.instanceMatrix.array, wings.instanceMatrix.array, flock.instanceColor.array, wings.instanceColor.array]).toEqual(arrays);
    arrays.forEach((a, k) => expect([flock.instanceMatrix.array, wings.instanceMatrix.array, flock.instanceColor.array, wings.instanceColor.array][k]).toBe(a));
    // and it did write them, every frame
    expect(flock.instanceMatrix.version).toBeGreaterThanOrEqual(versions[0] + 600);
    expect(wings.instanceMatrix.version).toBeGreaterThanOrEqual(versions[1] + 600);
    // a frame with no time in it, or a long one, is fine
    expect(() => { f.update(0, null, null); f.update(2, cat, null); }).not.toThrow();
    f.dispose();
  });

  it('making the flock draws nothing on Math.random', () => {
    const scene = new THREE.Scene(); // its own uuid, before the count starts
    const real = Math.random;
    const [realNow, realPerf] = [Date.now, performance.now];
    let draws = 0;
    let clocks = 0;
    Math.random = () => { draws++; return real(); };
    Date.now = () => { clocks++; return realNow(); };
    performance.now = () => { clocks++; return realPerf.call(performance); };
    let a;
    let b;
    try {
      a = createRoofsBirds(area, { scene });
      for (let k = 0; k < 300; k++) a.update(1 / 30, k > 150 ? { ...a.birds[2].pos } : null, null);
      a.dispose();
      b = createRoofsBirds(area, { scene });
      for (let k = 0; k < 300; k++) b.update(1 / 30, k > 150 ? { ...b.birds[2].pos } : null, null);
    } finally {
      Math.random = real;
      Date.now = realNow;
      performance.now = realPerf;
    }
    expect(draws).toBe(0);
    expect(clocks).toBe(0);
    // and two walks draw the same flock at the same walk time
    const c = createRoofsBirds(area, { scene: new THREE.Scene() });
    for (let k = 0; k < 600; k++) c.update(1 / 60, k >= 300 ? { ...c.birds[2].pos } : null, null);
    for (let i = 0; i < 14; i++) {
      const [pb, pc] = [pose(b.meshes[0], i), pose(c.meshes[0], i)];
      expect(pc.yaw).toBeCloseTo(pb.yaw, 6);
      expect(pc.pitch).toBeCloseTo(pb.pitch, 6);
    }
    b.dispose();
    c.dispose();
  });
});

// Ruling R3: what Task 2 could check only by id on the plan alone, on the
// built place's perches.
describe('the flock on the built place (R3)', () => {
  it('the drawn perches add to the plan\'s and change none of them, and none merges', () => {
    const plan = flockPerches({ traversal: ROOFS_TRAVERSAL, ground: area.ground });
    const drawn = P.filter((p) => ['pot', 'aerial', 'parapet', 'post', 'wall'].includes(p.kind));
    expect(P.filter((p) => !drawn.includes(p))).toEqual(plan);
    // no drawn spot fell within 0.5 m (and 0.3 m of height) of another perch
    for (const p of drawn) expect(p.aliases, p.id).toEqual([]);
  });

  it('every home is a built perch its kind allows, and no two birds share one', () => {
    const homes = ROOFS_BIRDS.map((b) => {
      const p = I.get(b.home);
      expect(p, `${b.id}: ${b.home}`).toBeDefined();
      expect(allowed(b.kind, p), `${b.id} on a ${p.kind} at ${p.y}`).toBe(true);
      return p.id;
    });
    expect(new Set(homes).size).toBe(14);
    // the pigeons' rules: at least four at a move's far end, two on the
    // warehouse or higher, one on a chimney's aerial and one pecking on the
    // warehouse roof (the first view's, Task 3's C3)
    const farEnds = new Set([
      ...ROOFS_TRAVERSAL.crossings.map((c) => `${c.id}:1`),
      ...[...ROOFS_TRAVERSAL.gaps, ...ROOFS_TRAVERSAL.climbs, ...ROOFS_TRAVERSAL.drops].filter((h) => !h.requires).map((h) => `${h.id}:to`),
    ]);
    const pigeons = ROOFS_BIRDS.filter((r) => r.kind === 'pigeon').map((r) => I.get(r.home));
    expect(pigeons.filter((p) => p.kind === 'move' && [p.id, ...p.aliases].some((id) => farEnds.has(id))).length).toBeGreaterThanOrEqual(4);
    expect(pigeons.filter((p) => p.y >= LEVELS.WAREHOUSE).length).toBeGreaterThanOrEqual(2);
    expect(pigeons.filter((p) => p.kind === 'aerial')).toHaveLength(1);
    expect(pigeons.filter((p) => p.kind === 'roof' && p.id.startsWith('roof:warehouse:'))).toHaveLength(1);
    const spawns = roofsCritterSpawns(ROOFS_BIRDS, I);
    expect(spawns).toHaveLength(14);
  });

  it('the gulls on a warehouse parapet and on the tower\'s ring; the yard sparrows on a post and a wall', () => {
    const gulls = ROOFS_BIRDS.filter((b) => b.kind === 'gull').map((b) => I.get(b.home));
    const W = BLOCK.warehouse;
    const T1 = BLOCK['tower-1'];
    const BF = BLOCK.belfry;
    const onWarehouse = gulls.filter((p) => p.id.startsWith('parapet:warehouse:'));
    expect(onWarehouse).toHaveLength(1);
    for (const p of onWarehouse) {
      expect(p.kind).toBe('parapet');
      expect(p.y).toBeGreaterThan(W.y);
      // on its edge, inside the bounds, over no street
      expect(Math.min(Math.abs(p.x - W.x0), Math.abs(p.x - W.x1), Math.abs(p.z - W.z0), Math.abs(p.z - W.z1))).toBeLessThan(0.3);
      expect(inRect({ x0: ROOFS_BOUNDS.minX, x1: ROOFS_BOUNDS.maxX, z0: ROOFS_BOUNDS.minZ, z1: ROOFS_BOUNDS.maxZ }, p.x, p.z)).toBe(true);
      for (const s of STREETS) expect(inRect(s, p.x, p.z)).toBe(false);
    }
    const onTower = gulls.filter((p) => p.id.startsWith('parapet:tower-1:'));
    expect(onTower).toHaveLength(1);
    for (const p of onTower) {
      expect(p.kind).toBe('parapet');
      expect(p.y).toBeCloseTo(T1.y, 6);
      expect(inRect(T1, p.x, p.z) && !inRect(BF, p.x, p.z)).toBe(true);
    }
    const yard = ROOFS_BIRDS.filter((b) => b.kind === 'sparrow' && /^(post|wall):/.test(b.home)).map((b) => I.get(b.home));
    expect(yard.map((p) => p.kind).sort()).toEqual(['post', 'wall']);
    for (const p of yard) {
      expect(p.y).toBeLessThan(7);
      expect(p.z).toBeGreaterThanOrEqual(YARD.z0);
      expect(p.z).toBeLessThanOrEqual(YARD.z1);
    }
  });

  it('every pigeon\'s home has a way to the loft over the built perches', () => {
    for (const b of ROOFS_BIRDS.filter((r) => r.kind === 'pigeon')) {
      expect(Number.isFinite(G.homeDist.get(I.get(b.home).id)), b.home).toBe(true);
    }
    expect(Number.isFinite(G.homeDist.get(I.get(GUIDE.start).id))).toBe(true);
    for (const id of GUIDE.route) expect(I.get(id), id).toBeDefined();
  });

  it('sparrows and gulls make local hops among the built perches', () => {
    let sparrows = 0;
    let gulls = 0;
    for (const p of P) {
      for (const cat of ring(p)) {
        if (allowed('sparrow', p)) {
          const f = chooseFlight(G, I, bird('sparrow', p.id), cat, NONE);
          if (f) {
            sparrows++;
            const to = I.get(f.to);
            expect(d2(p, to), `${p.id} -> ${to.id}`).toBeLessThanOrEqual(6);
            expect(to.y).toBeLessThan(7);
          }
        }
        if (allowed('gull', p)) {
          const g = chooseFlight(G, I, bird('gull', p.id), cat, NONE);
          if (g) {
            gulls++;
            const to = I.get(g.to);
            expect(['parapet', 'pot', 'aerial']).toContain(to.kind);
            expect(d2(p, to), `${p.id} -> ${to.id}`).toBeGreaterThanOrEqual(4);
            expect(d2(p, to), `${p.id} -> ${to.id}`).toBeLessThanOrEqual(10);
          }
        }
      }
    }
    expect(sparrows).toBeGreaterThan(100);
    expect(gulls).toBeGreaterThan(100);
  });

  it('no flight among the built perches ends nearer her, or passes within 1.5 m of her', { timeout: 60000 }, () => {
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
        }
      }
    }
    expect(flights).toBeGreaterThan(1000);
  });
});
