import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
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
  // createPlayer (the walks after the guide, below) listens on it
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
});

const { build } = await import('../src/world/roofs.js');
const { createRoofsBirds, BIRD_LOOK, WINGBEAT, FLUTTER, GUIDE_KEY, GUIDE_CROSSED } = await import('../src/world/roofsbirds.js');
const {
  BIRD_KINDS, ROOFS_BIRDS, GUIDE, FLIGHT, LOFT_REST, OUT_OF_SIGHT,
  flockPerches, perchIndex, flightGraph, flightPlan, flightPoint, chooseFlight, roofsCritterSpawns,
} = await import('../src/world/roofsflock.js');
const { ROOFS_TRAVERSAL, BLOCKS, STREETS, ROOFS_BOUNDS, LEVELS, YARD, ROOFS_SPAWN, ROOFS_TOURS } = await import('../src/world/roofsplan.js');
const { createCritters } = await import('../src/critters.js');
const { mulberry32 } = await import('../src/rng.js');
const { createYardPilot } = await import('../src/world/traversalyard.js');
const { yardWalk } = await import('./helpers/traversalwalk.js');
const { followBird } = await import('./helpers/followbird.js');
const { lifecycle, fakeEl, memStorage } = await import('./helpers/walklife.js');
const { createAreaLoader } = await import('../src/game/areaload.js');
const { setRoofs } = await import('../src/roofsflag.js');

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
// A guide store ({ get, set }) in memory, holding `value`; `throws` makes
// every call throw, as storage that cannot be reached does.
function memStore(value = null, { throws = false } = {}) {
  let v = value;
  return {
    get() { if (throws) throw new Error('no storage'); return v; },
    set(x) { if (throws) throw new Error('no storage'); v = x; },
    value: () => v,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('the flock drawn, perched', () => {
  it('the flock is two meshes, casting nothing, fourteen birds at their homes', () => {
    const scene = new THREE.Scene();
    const before = scene.children.length;
    const f = createRoofsBirds(area, { scene, guideStore: memStore(GUIDE_CROSSED) }); // the guide retired: at its home too
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

// =============================================================================
// Task 4: the birds are the walk's critters for tag (critters.js: a pounce,
// the bell, a meow, the journal), and the flock flies them roof to roof. Each
// test runs the real createCritters on the built place's critterSpawns with
// the flock, frame by frame in main.js's order: critters.update, then the
// flock's update.
// =============================================================================

const v3 = (p) => new THREE.Vector3(p.x, p.y, p.z);
function liveFlock({ visits = 0, guideStore = memStore(), reducedMotion = false, fleeScale = 1 } = {}) {
  const scene = new THREE.Scene();
  const critters = createCritters(scene, area.critterSpawns, { ground: area.ground, motionRng: mulberry32(7), fleeScale });
  const flock = createRoofsBirds(area, { scene, critters, visits, reducedMotion, guideStore });
  let t = 0;
  const live = {
    scene, critters, flock, guideStore,
    step(dt, cat, camera = null) {
      t += dt;
      critters.update(dt, t, cat, cat);
      flock.update(dt, cat, camera);
    },
    run(seconds, cat, { dt = 1 / 30, camera = null, each = null } = {}) {
      const n = Math.round(seconds / dt);
      for (let k = 0; k < n; k++) {
        live.step(dt, cat, camera);
        if (each?.(k) === false) return;
      }
    },
    time: () => t,
    index: (id) => flock.birds.findIndex((b) => b.id === id),
    bird: (id) => flock.birds.find((b) => b.id === id),
    proxy: (id) => critters.list.find((c) => c.def.roofBird === id),
    // where chooseFlight would send bird `id` from where it is, with her at `cat`
    flightFor(id, cat) {
      const i = live.index(id);
      const b = flock.birds[i];
      const taken = new Set(flock.birds.filter((o) => o !== b).map((o) => (o.flying ? o.to : o.at)));
      return chooseFlight(G, I, { index: i, kind: b.kind, at: b.at, flights: b.flights, guideStep: b.guideStep }, cat, taken);
    },
  };
  return live;
}
// Bird `id` put on perch `p`, its critter with it (the state a landing leaves).
function putOn(live, id, p) {
  const b = live.bird(id);
  placeOn(b, p);
  const c = live.proxy(id);
  c.group.position.set(p.x, p.y, p.z);
  c.anchor.set(p.x, 0, p.z);
  c.anchorHome.set(p.x, 0, p.z);
}
// Runs until bird `id` has landed from a flight (not a flutter), or `limit` s.
function untilLanded(live, id, cat, limit = 4, o = {}) {
  const b = live.bird(id);
  const flights = b.flights;
  const t0 = live.time();
  let peak = -Infinity;
  let from = null;
  let to = null;
  let fled = false;
  live.run(limit, cat, {
    ...o,
    each: (k) => {
      if (live.proxy(id).fleeing) fled = true;
      if (b.flying && b.to !== b.at) { from ??= I.get(b.at); to = I.get(b.to); peak = Math.max(peak, b.pos.y); }
      o.each?.(k);
      return b.flights === flights;
    },
  });
  return { landed: b.flights > flights, after: live.time() - t0, peak, from, to, fled };
}
// A spot on her level `r` m from perch p (2D) where she would flush it and it
// could fly: the first of 32 round it, for the bird's own kind.
function flushSpot(live, id, r, ok = () => true) {
  const b = live.bird(id);
  const p = I.get(b.at);
  for (let k = 0; k < 32; k++) {
    const a = (2 * Math.PI * k) / 32;
    const x = p.x + r * Math.cos(a);
    const z = p.z + r * Math.sin(a);
    const cat = new THREE.Vector3(x, area.ground.y(x, z), z);
    if (ok(cat) && live.flightFor(id, cat)) return cat;
  }
  throw new Error(`no spot ${r} m from ${id} where it can fly`);
}
const posOf = (c) => ({ x: c.group.position.x, y: c.group.position.y, z: c.group.position.z });

describe('the critters contract', () => {
  it('near a pigeon, it flutters to another roof nearby, never up into the sky', () => {
    const live = liveFlock();
    const id = 'pigeon-1';
    const b = live.bird(id);
    const home = I.get(b.at);
    expect(home.id).toBe('plank-1:1');
    // she walks plank-1 up to 1.5 m short of it, and stands there 4 s
    const plank = ROOFS_TRAVERSAL.crossings.find((c) => c.id === 'plank-1').points;
    const zc = home.z + 1.5;
    const cat = new THREE.Vector3(home.x, plank[1].y + ((plank[2].y - plank[1].y) * (plank[1].z - zc)) / (plank[1].z - plank[2].z), zc);
    expect(d3(cat, home)).toBeCloseTo(1.5, 1);
    const r = untilLanded(live, id, cat, 4);
    expect(r.fled).toBe(true); // critters.js flagged it
    expect(r.landed).toBe(true);
    expect(r.after).toBeLessThanOrEqual(4);
    expect(r.to.id).not.toBe(home.id);
    expect(d2(home, r.to)).toBeGreaterThanOrEqual(3);
    expect(d2(home, r.to)).toBeLessThanOrEqual(12);
    expect(r.peak).toBeLessThanOrEqual(Math.max(home.y, r.to.y) + 1.4 + 1e-9);
    expect(d3(r.to, cat)).toBeGreaterThan(d3(home, cat));
    const c = live.proxy(id);
    expect(c.fleeing).toBe(false);
    expect(posOf(c)).toEqual(b.pos);
    expect(b.pos).toEqual({ x: r.to.x, y: r.to.y, z: r.to.z });
    // and it stays: 4 m or more from her, nothing flushes it again
    live.run(2, cat);
    expect(I.get(b.at)).toBe(r.to);
    expect(posOf(c)).toEqual(b.pos);
  });

  it('a pounce tags a pigeon: it flaps off, nobody is removed, and it cannot be tagged again for 20 s', () => {
    // with the bell on (critters.js fleeScale 0.5) she gets near enough to pounce
    const live = liveFlock({ fleeScale: 0.5 });
    const id = 'pigeon-2';
    const b = live.bird(id);
    const cat = flushSpot(live, id, 1.8);
    live.run(1, cat);
    expect(b.flying).toBe(false); // the bell: 1.8 m does not flush it
    const n = live.critters.list.length;
    expect(live.critters.pounceCatch(v3(b.pos))).toMatchObject({ type: 'bird' });
    const r = untilLanded(live, id, cat, 4);
    expect(r.landed).toBe(true);
    expect(r.to.id).not.toBe('plank-2:1');
    expect(live.critters.list.length).toBe(n);
    // 5 s after the catch, at its new perch: still caught
    live.run(5 - r.after, cat);
    expect(live.critters.pounceCatch(v3(b.pos))).toBe(null);
    // 21 s after: it can be tagged again
    live.run(16, cat);
    expect(live.critters.pounceCatch(v3(b.pos))).toMatchObject({ type: 'bird' });
    expect(live.critters.list.length).toBe(n);
  });

  it('a gull flutters off but is not tagged, as at the seaside', () => {
    const live = liveFlock();
    const id = 'gull-1';
    const b = live.bird(id);
    expect(live.proxy(id).type).toBe('seagull');
    expect(live.critters.pounceCatch(v3(b.pos))).toBe(null);
    // she comes within 3.4 m (a gull keeps 1.4 times further off than a pigeon)
    const cat = flushSpot(live, id, 3.2, (c) => d3(c, b.pos) < 3.4);
    const r = untilLanded(live, id, cat, 4);
    expect(r.fled).toBe(true);
    expect(r.landed).toBe(true);
    expect(['parapet', 'pot', 'aerial']).toContain(r.to.kind);
    expect(live.critters.pounceCatch(v3(b.pos))).toBe(null);
  });

  it('a meow within 5 m sends a bird off', () => {
    const live = liveFlock();
    const id = 'pigeon-3';
    const b = live.bird(id);
    const cat = flushSpot(live, id, 4.2, (c) => d3(c, b.pos) < 4.8);
    live.run(1, cat);
    expect(b.flying).toBe(false); // 4.2 m: she is too far to flush it
    live.critters.reactToMeow(cat);
    const r = untilLanded(live, id, cat, 4);
    expect(r.landed).toBe(true);
    expect(d3(r.to, cat)).toBeGreaterThan(d3(r.from, cat));
  });
});

it('flushed again while flying, it keeps its flight; a 2 s frame lands it on its perch', () => {
  const live = liveFlock();
  const id = 'pigeon-1';
  const b = live.bird(id);
  const cat = flushSpot(live, id, 2);
  live.step(1 / 30, cat);
  expect(b.flying).toBe(true);
  const to = b.to;
  expect(to).not.toBe(b.at);
  const p = I.get(to);
  // on its way, a third of the flight or more
  live.run(0.5, cat);
  expect(b.flying).toBe(true);
  // flushed again: the flag set, a meow
  const c = live.proxy(id);
  c.fleeing = true;
  live.critters.reactToMeow(cat);
  live.step(1 / 30, cat);
  expect(b.flying).toBe(true);
  expect(b.to).toBe(to);
  // a tab coming back: one long frame
  live.step(2.0, cat);
  expect(b.flying).toBe(false);
  expect(I.get(b.at)).toBe(p);
  for (const k of ['x', 'y', 'z']) {
    expect(Math.abs(b.pos[k] - p[k])).toBeLessThan(1e-6);
    expect(Math.abs(c.group.position[k] - p[k])).toBeLessThan(1e-6);
  }
  expect(c.fleeing).toBe(false);
  expect(c.cooldown).toBe(0);
  expect([c.anchor.x, c.anchor.z, c.anchorHome.x, c.anchorHome.z]).toEqual([p.x, p.z, p.x, p.z]);
});

it('in flight the wings beat, gliding over the last 30%; slower and smaller under reduced motion', () => {
  const id = 'pigeon-1';
  const dt = 1 / 240;
  for (const reducedMotion of [false, true]) {
    const live = liveFlock({ reducedMotion });
    const i = live.index(id);
    const b = live.bird(id);
    const cat = flushSpot(live, id, 2);
    const [flock, wings] = live.flock.meshes;
    const bm = new THREE.Matrix4();
    const wm = new THREE.Matrix4();
    // wing w's span, in its bird's frame: its angle up from level
    const up = (w) => {
      flock.getMatrixAt(i, bm);
      wings.getMatrixAt(w, wm);
      const span = new THREE.Vector3(1, 0, 0).transformDirection(wm).transformDirection(bm.clone().invert());
      return Math.atan2(span.y, Math.abs(span.x));
    };
    live.step(dt, cat);
    expect(b.flying).toBe(true);
    const from = I.get(b.at);
    const plan = flightPlan(from, I.get(b.to), G.links.get(from.id).find((l) => l.to === b.to).shape);
    const beat = [];
    const glide = [];
    let s = dt / plan.time;
    let changes = 0;
    let last = 0;
    while (b.flying) {
      const a = up(2 * i);
      expect(up(2 * i + 1)).toBeCloseTo(a, 5); // the right wing mirrors the left
      if (s > 1 - WINGBEAT.glide + 1e-6) glide.push(a);
      else {
        beat.push(a);
        if (last !== 0 && Math.sign(a) !== Math.sign(last)) changes++;
        last = a;
      }
      live.step(dt, cat);
      s += dt / plan.time;
    }
    const k = reducedMotion ? WINGBEAT.reduced : WINGBEAT;
    const most = Math.max(...beat.map(Math.abs));
    expect(most).toBeGreaterThan(k.amp - 0.05);
    expect(most).toBeLessThanOrEqual(k.amp + 1e-4);
    // its rate: two sign changes a beat, over the flapping part
    const rate = changes / 2 / (beat.length * dt);
    expect(rate).toBeGreaterThan(k.hz * 0.75);
    expect(rate).toBeLessThan(k.hz * 1.25);
    // the glide: held spread, a little up
    expect(glide.length).toBeGreaterThan(5);
    for (const a of glide) expect(a).toBeCloseTo(WINGBEAT.glideAngle, 4);
    // landed: folded along its side again
    flock.getMatrixAt(i, bm);
    wings.getMatrixAt(2 * i, wm);
    const tip = new THREE.Vector3(0.2, 0, -0.08).applyMatrix4(wm).applyMatrix4(bm.clone().invert());
    expect(Math.abs(tip.x)).toBeLessThan(0.1);
  }
});

it('with nowhere to go it flutters where it is: up 0.4 m and back in 0.8 s, wings beating', () => {
  const live = liveFlock();
  const id = 'pigeon-1';
  const b = live.bird(id);
  const p = I.get(b.at);
  // she stands right by it: every flight would pass within 1.5 m of her
  const cat = new THREE.Vector3(p.x, p.y, p.z + 0.8);
  expect(live.flightFor(id, cat)).toBe(null);
  const dt = 1 / 120;
  live.step(dt, cat);
  expect(b.flying).toBe(true);
  expect(b.to).toBe(b.at);
  let top = 0;
  let n = 1;
  while (b.flying) {
    top = Math.max(top, b.pos.y - p.y);
    expect([b.pos.x, b.pos.z]).toEqual([p.x, p.z]);
    live.step(dt, cat);
    n++;
  }
  expect(top).toBeGreaterThan(FLUTTER.up - 0.01);
  expect(top).toBeLessThanOrEqual(FLUTTER.up + 1e-9);
  expect(n * dt).toBeCloseTo(FLUTTER.time, 1);
  expect(b.pos).toEqual({ x: p.x, y: p.y, z: p.z });
  expect(b.flights).toBe(0);
});

describe('the guide pigeon', () => {
  const guideAt = (live) => live.bird(GUIDE.bird);
  // her spot 2 m behind the guide, away from where it goes next, at its height
  const behind = (g, next) => {
    const p = I.get(g.at);
    const dx = p.x - next.x;
    const dz = p.z - next.z;
    const d = Math.hypot(dx, dz);
    return new THREE.Vector3(p.x + (2 * dx) / d, p.y, p.z + (2 * dz) / d);
  };

  it('until she has crossed plank-3 it waits in the alley, then leads stop by stop to plank-3\'s far end', () => {
    const live = liveFlock({ visits: 0 });
    const g = guideAt(live);
    expect(g.at).toBe(GUIDE.start);
    expect(g.guideStep).toBe(0);
    const start = I.get(GUIDE.start);
    expect(g.pos).toEqual({ x: start.x, y: start.y, z: start.z });
    expect(posOf(live.proxy(GUIDE.bird))).toEqual(g.pos);
    // she comes within 2 m of it, each time from behind: it flies to each stop in turn
    GUIDE.route.forEach((stop, k) => {
      const next = I.get(stop);
      const cat = behind(g, next);
      const r = untilLanded(live, GUIDE.bird, cat, 4);
      expect(r.landed, stop).toBe(true);
      expect(I.get(g.at), stop).toBe(next);
      expect(g.guideStep).toBe(k + 1 < GUIDE.route.length ? k + 1 : -1);
    });
    // then a pigeon like any other: flushed, it flies where chooseFlight sends it
    expect(g.guideStep).toBe(-1);
    const cat = flushSpot(live, GUIDE.bird, 2);
    const want = live.flightFor(GUIDE.bird, cat);
    const r = untilLanded(live, GUIDE.bird, cat, 4);
    expect(r.landed).toBe(true);
    expect(r.to.id).toBe(want.to);
    expect(g.guideStep).toBe(-1);
  });

  it('it waits in the alley on every walk until she has crossed; retired, it starts at its home', async () => {
    const home = I.get(ROOFS_BIRDS.find((b) => b.id === GUIDE.bird).home);
    const startOf = (o) => {
      const f = createRoofsBirds(area, { scene: new THREE.Scene(), ...o });
      const g = f.birds.find((b) => b.id === GUIDE.bird);
      const out = [g.at, g.guideStep];
      f.dispose();
      return out;
    };
    // the store says she has crossed: at its home
    expect(startOf({ visits: 0, guideStore: memStore(GUIDE_CROSSED) })).toEqual([home.id, -1]);
    expect(startOf({ visits: 3, guideStore: memStore(GUIDE_CROSSED) })).toEqual([home.id, -1]);
    // a later walk, not crossed yet: in the alley again
    expect(startOf({ visits: 1, guideStore: memStore() })).toEqual([GUIDE.start, 0]);
    expect(startOf({ visits: 7, guideStore: memStore('something else') })).toEqual([GUIDE.start, 0]);
    // no storage: the spec's rule, the first walk only
    expect(startOf({ visits: 0, guideStore: memStore(null, { throws: true }) })).toEqual([GUIDE.start, 0]);
    expect(startOf({ visits: 1, guideStore: memStore(null, { throws: true }) })).toEqual([home.id, -1]);
    expect(startOf({ visits: 1, guideStore: null })).toEqual([home.id, -1]);
    // the device's own store is window.localStorage (absent in Node: the visits rule)
    expect(globalThis.window).toBeUndefined();
    expect(startOf({ visits: 0 })).toEqual([GUIDE.start, 0]);
    expect(startOf({ visits: 1 })).toEqual([home.id, -1]);
    const storage = memStorage();
    globalThis.window = { localStorage: storage };
    try {
      expect(startOf({ visits: 4 })).toEqual([GUIDE.start, 0]);
      storage.setItem(GUIDE_KEY, GUIDE_CROSSED);
      expect(startOf({ visits: 0 })).toEqual([home.id, -1]);
      // storage that throws when touched
      Object.defineProperty(globalThis.window, 'localStorage', { get() { throw new Error('SecurityError'); } });
      expect(startOf({ visits: 0 })).toEqual([GUIDE.start, 0]);
      expect(startOf({ visits: 2 })).toEqual([home.id, -1]);
    } finally {
      delete globalThis.window;
    }
    // the life hands the flock the context's store where it has one (the picture pages')
    const { createRoofsLife } = await import('../src/roofslife.js');
    const guideAt = (guideStore, visits) => {
      const scene = new THREE.Scene();
      const life = createRoofsLife(area)({ scene, sun: { intensity: 1 }, fill: { intensity: 1 }, visits, guideStore });
      const flock = scene.children.find((o) => o.name === 'roofsFlock');
      const p = pose(flock, ROOFS_BIRDS.findIndex((b) => b.id === GUIDE.bird));
      life.dispose();
      return I.get(GUIDE.start).x === p.x ? GUIDE.start : home.x === p.x ? home.id : null;
    };
    expect(guideAt(memStore(GUIDE_CROSSED), 0)).toBe(home.id);
    expect(guideAt(memStore(), 5)).toBe(GUIDE.start);
    expect(guideAt(undefined, 1)).toBe(home.id); // the device's: none in Node, so the visits rule
  });

  it('walking plank-3 end to end remembers she crossed; half-way and back does not', () => {
    const rail = ROOFS_TRAVERSAL.crossings.find((c) => c.id === 'plank-3').points;
    // her spot at share u of the rail, at its height
    const lens = rail.slice(1).map((q, k) => Math.hypot(q.x - rail[k].x, q.z - rail[k].z));
    const total = lens.reduce((a, b) => a + b, 0);
    const onRail = (u) => {
      let left = u * total;
      for (let k = 0; k < lens.length; k++) {
        if (left <= lens[k] || k === lens.length - 1) {
          const t = Math.min(1, left / lens[k]);
          const [a, b] = [rail[k], rail[k + 1]];
          return new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
        }
        left -= lens[k];
      }
      return null;
    };
    const walkPlank = (store, us) => {
      const f = createRoofsBirds(area, { scene: new THREE.Scene(), visits: 0, guideStore: store });
      for (const u of us) f.update(1 / 30, onRail(u), null);
      const g = f.birds.find((b) => b.id === GUIDE.bird);
      const out = [g.at, g.guideStep];
      f.dispose();
      return out;
    };
    const steps = (a, b, n = 60) => Array.from({ length: n + 1 }, (_, k) => a + ((b - a) * k) / n);
    // from the shed over to ext-10: remembered; and in that walk nothing changes for the guide
    const there = memStore();
    expect(walkPlank(there, steps(0, 1))).toEqual([GUIDE.start, 0]);
    expect(there.value()).toBe(GUIDE_CROSSED);
    // the other way too
    const back = memStore();
    walkPlank(back, steps(1, 0));
    expect(back.value()).toBe(GUIDE_CROSSED);
    // half-way and back, and three quarters and back: not crossed
    const half = memStore();
    walkPlank(half, [...steps(0, 0.5), ...steps(0.5, 0)]);
    walkPlank(half, [...steps(0, 0.8), ...steps(0.8, 0)]);
    expect(half.value()).toBe(null);
    // off the plank on the way (round it, 1 m to the side): not crossed
    const round = memStore();
    const f = createRoofsBirds(area, { scene: new THREE.Scene(), visits: 0, guideStore: round });
    for (const u of steps(0, 1)) {
      const p = onRail(u);
      if (u > 0.4 && u < 0.6) p.x += 1;
      f.update(1 / 30, p, null);
    }
    f.dispose();
    expect(round.value()).toBe(null);
    // a store that throws: no harm
    expect(() => walkPlank(memStore(null, { throws: true }), steps(0, 1))).not.toThrow();
    // the next walk: retired
    const g = createRoofsBirds(area, { scene: new THREE.Scene(), visits: 0, guideStore: there });
    expect(g.birds.find((b) => b.id === GUIDE.bird).guideStep).toBe(-1);
    g.dispose();
  });
});

it('pigeons that reach the loft rest there, and are back home only where she cannot see', () => {
  const id = 'pigeon-1';
  const home = I.get(ROOFS_BIRDS.find((b) => b.id === id).home);
  const loft = I.get('loft:2');
  expect(loft.kind).toBe('loft');
  const camera = (at, look) => {
    const c = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 400);
    c.position.set(at.x, at.y + 2, at.z);
    c.lookAt(look.x, look.y, look.z);
    c.updateMatrixWorld();
    return c;
  };
  const onLoft = () => {
    const live = liveFlock({ guideStore: memStore(GUIDE_CROSSED) });
    putOn(live, id, loft);
    return live;
  };
  // she is 12 m off on the warehouse roof: 200 s on, it is still on the loft
  {
    const live = onLoft();
    const x = loft.x + 12;
    const cat = new THREE.Vector3(x, area.ground.y(x, loft.z), loft.z);
    live.run(200, cat, { camera: camera(cat, loft) });
    expect(live.bird(id).at).toBe('loft:2');
  }
  // far from both, the camera looking away from both (east): home by LOFT_REST + 1 s
  const far = new THREE.Vector3(30, area.ground.y(30, -30), -30);
  expect(d3(far, loft)).toBeGreaterThan(OUT_OF_SIGHT);
  expect(d3(far, home)).toBeGreaterThan(OUT_OF_SIGHT);
  {
    const live = onLoft();
    const away = camera(far, { x: 60, y: far.y, z: -30 });
    let back = null;
    live.run(LOFT_REST + 1, far, { camera: away, each: () => { if (back === null && live.bird(id).at !== 'loft:2') back = live.time(); } });
    expect(back).not.toBe(null);
    expect(back).toBeGreaterThanOrEqual(LOFT_REST - 1e-6);
    expect(back).toBeLessThanOrEqual(LOFT_REST + 1);
    const b = live.bird(id);
    expect(I.get(b.at)).toBe(home);
    expect(b.pos).toEqual({ x: home.x, y: home.y, z: home.z });
    expect(posOf(live.proxy(id))).toEqual(b.pos);
  }
  // the camera looking at its home: still on the loft
  {
    const live = onLoft();
    live.run(LOFT_REST + 30, far, { camera: camera(far, home) });
    expect(live.bird(id).at).toBe('loft:2');
  }
  // or at the loft itself: still there
  {
    const live = onLoft();
    live.run(LOFT_REST + 30, far, { camera: camera(far, loft) });
    expect(live.bird(id).at).toBe('loft:2');
  }
  // she within 30 m of its home, the camera away: still there
  {
    const live = onLoft();
    const near = new THREE.Vector3(home.x + 20, area.ground.y(home.x + 20, home.z - 10), home.z - 10);
    expect(d3(near, loft)).toBeGreaterThan(OUT_OF_SIGHT);
    live.run(LOFT_REST + 30, near, { camera: camera(near, { x: near.x + 30, y: near.y, z: near.z }) });
    expect(live.bird(id).at).toBe('loft:2');
  }
});

it('flying them draws on no random number and reads no clock', () => {
  const live = liveFlock();
  const real = [Math.random, Date.now, performance.now];
  let calls = 0;
  const update = live.flock.update;
  live.flock.update = (...a) => {
    Math.random = () => { calls++; return real[0](); };
    Date.now = () => { calls++; return real[1](); };
    performance.now = () => { calls++; return real[2].call(performance); };
    try { return update(...a); } finally { [Math.random, Date.now, performance.now] = real; }
  };
  // she walks past four birds in turn, standing by each
  for (const id of ['pigeon-1', 'pigeon-2', 'sparrow-3', 'gull-1']) {
    const b = live.bird(id);
    const cat = new THREE.Vector3(b.pos.x + 1.2, b.pos.y, b.pos.z + 1.2);
    live.run(6, cat);
    expect(live.bird(id).flights + (live.bird(id).flying ? 1 : 0), id).toBeGreaterThan(0);
  }
  expect(calls).toBe(0);
});

it('without critters (the picture pages) no bird is ever flushed', () => {
  const f = createRoofsBirds(area, { scene: new THREE.Scene(), guideStore: memStore() });
  const b = f.birds.find((o) => o.id === 'pigeon-1');
  const at = b.at;
  for (let k = 0; k < 300; k++) f.update(1 / 30, { x: b.pos.x + 0.5, y: b.pos.y, z: b.pos.z }, null);
  expect(f.birds.every((o) => !o.flying)).toBe(true);
  expect(b.at).toBe(at);
  f.dispose();
});

describe('in a real walk', () => {
  const areas = createAreaLoader();
  let stream = null;
  let doc = null;
  beforeAll(() => areas.ensureAll(['park', 'neighborhood', 'roofs']));
  beforeEach(() => {
    doc = globalThis.document;
    globalThis.document = { body: fakeEl(), createElement: fakeEl, getElementById: () => null, addEventListener() {}, removeEventListener() {} };
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-21T15:00:00Z') });
    stream = mulberry32(20261121);
    vi.spyOn(Math, 'random').mockImplementation(() => stream());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.document = doc;
    setRoofs(null);
    vi.useRealTimers();
  });

  it('in a real walk the roof birds are the walk\'s critters, drawn as one flock', () => {
    const life = lifecycle({ areas });
    life.w.startWalk({ duskMode: false, areaOverride: 'roofs' });
    const s = life.getSession();
    expect(s.areaId).toBe('roofs');
    const mine = s.critters.list.filter((c) => c.def.roofBird);
    expect(mine).toHaveLength(14);
    expect(mine.map((c) => c.def.roofBird).sort()).toEqual(ROOFS_BIRDS.map((b) => b.id).sort());
    for (const c of mine) {
      expect(c.type).toBe(BIRD_KINDS[ROOFS_BIRDS.find((b) => b.id === c.def.roofBird).kind].critter);
      expect(c.group.visible).toBe(true); // its contact shadow follows it
      c.group.traverse((o) => { if (o !== c.group) expect(o.visible, c.def.roofBird).toBe(false); });
    }
    const named = (n) => { const out = []; s.scene.traverse((o) => { if (o.name === n) out.push(o); }); return out; };
    expect(named('roofsFlock')).toHaveLength(1);
    expect(named('roofsFlockWings')).toHaveLength(1);
    const [flock] = named('roofsFlock');
    const camera = new THREE.PerspectiveCamera();
    s.areaLife.update(1 / 30, 1, s.cat.position, camera);
    for (const c of mine) {
      const i = ROOFS_BIRDS.findIndex((b) => b.id === c.def.roofBird);
      const p = pose(flock, i);
      expect(c.group.position.x).toBeCloseTo(p.x, 4);
      expect(c.group.position.y).toBeCloseTo(p.y, 4);
      expect(c.group.position.z).toBeCloseTo(p.z, 4);
    }
    life.w.endWalk();
    expect(named('roofsFlock')).toHaveLength(0);
    // the guide's memory is per device (window.localStorage): Node has none, so nothing was read or left
    expect(globalThis.window).toBeUndefined();
  });
});

describe('following the guide', () => {
  const DT = 1 / 30;
  // the real player on the built place, the walk's critters and the flock (her first walk)
  // (fleeScale 0.5: the bell, which lets her nearer the birds; the guide on its route keeps its distance)
  const walkWithFlock = (store = memStore(), fleeScale = 1) => {
    const w = yardWalk({ area, at: [ROOFS_SPAWN.x, ROOFS_SPAWN.z], face: [0, -1], colliders: area.colliders });
    const live = liveFlock({ visits: 0, guideStore: store, fleeScale });
    return { w, live, frame: () => { w.frame(DT); live.step(DT, w.cat.position); } };
  };

  it.each([['', 1], [', with the bell on', 0.5]])('following the guide pigeon%s, she is on a roof within a minute and over the first plank within ninety seconds', { timeout: 90000 }, (_, fleeScale) => {
    const { w, live, frame } = walkWithFlock(memStore(), fleeScale);
    const g = live.bird(GUIDE.bird);
    let roofAt = null;
    let ext10At = null;
    const stops = [];
    for (let f = 0; f < 90 / DT && ext10At === null; f++) {
      followBird(w, () => g, area, DT);
      frame();
      const t = (f + 1) * DT;
      const p = w.cat.position;
      if (roofAt === null && area.ground.y(p.x, p.z) >= LEVELS.SHED) roofAt = t;
      if (ext10At === null && Math.abs(p.y - LEVELS.EXTENSION) < 0.05 && area.ground.y(p.x, p.z) === LEVELS.EXTENSION && p.x >= 14.5 && p.x <= 17.5 && p.z < 20) ext10At = t;
      if (!g.flying && stops.at(-1) !== g.at) stops.push(g.at);
    }
    expect(roofAt).not.toBe(null);
    expect(roofAt).toBeLessThanOrEqual(60);
    expect(ext10At).not.toBe(null);
    expect(ext10At).toBeLessThanOrEqual(90);
    // it led her the whole way: every stop of its route, in order
    expect(stops.slice(0, GUIDE.route.length + 1)).toEqual([GUIDE.start, ...GUIDE.route]);
  });

  it.each([['', 1], [', with the bell on', 0.5]])('the birds tour (the film)%s: the guide is waiting at plank-3\'s far end before she gets there', { timeout: 90000 }, (_, fleeScale) => {
    const store = memStore();
    const { w, live, frame } = walkWithFlock(store, fleeScale);
    const g = live.bird(GUIDE.bird);
    const pilot = createYardPilot(ROOFS_TOURS.birds);
    const far = I.get('plank-3:1');
    let landedFar = null;
    let below21 = null;
    let r;
    let frames = 0;
    do {
      r = pilot.step(DT, w);
      frame();
      frames++;
      const t = frames * DT;
      if (landedFar === null && !g.flying && I.get(g.at) === far) landedFar = t;
      if (below21 === null && w.cat.position.z < 21) below21 = t;
    } while (!r.done && frames < 45 / DT);
    expect(r.done).toBe(true);
    expect(r.failed ?? null).toBeNull();
    expect(frames * DT).toBeLessThan(45);
    expect(landedFar).not.toBe(null);
    expect(below21).not.toBe(null);
    expect(landedFar).toBeLessThan(below21);
    // she walked plank-3 end to end: the guide is retired from her next walk
    expect(store.value()).toBe(GUIDE_CROSSED);
    const p = w.cat.position;
    expect(area.ground.y(p.x, p.z)).toBe(LEVELS.EXTENSION);
  });
});
