// The Reef, milestone R8 (wing C: the Sunken Boat, the Old Anchor and the Glow Cave). The wing's plan (hull, anchor, cleft, the third chain of air pockets), that
// everything in it is walkable and reached from the spawn on foot with no skills, the three finds live with their real positions and the 12-paw rule, the boat's
// golden mouse reachable, the two word sets, the plankton (tiers, reduced motion), determinism and the source rules.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { floodFrom } from './helpers/flood.js';
import { GOLD_MICE } from '../src/goldmice.js';
import { isWalkableAt } from '../src/player.js';

stubCanvasDocument();
const { build } = await import('../src/world/reef.js');
const D = await import('../src/world/reefdeep.js');
const Q = await import('../src/world/reeffindsplan.js');
const P = await import('../src/world/reefplan.js');
const S = await import('../src/world/reefstory.js');
const F = await import('../src/world/reeffinds.js');
const { drawDeep } = await import('../src/world/reefdeepparts.js');
const { createReefDeepLife, planktonShare } = await import('../src/world/reefdeeplife.js');
const { LINES } = await import('../src/world/reefdeepwords.js');
const { createKit, reefMaterials, paint, T3 } = await import('../src/world/reefparts.js');
const W = await import('../src/world/reefwreckdeep.js');
const { phrase, hasPhrase } = await import('../src/clanphrases.js');
const { createProgression } = await import('../src/progression.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');

const read = (f) => readFileSync(f, 'utf8');
const B = P.REEF_BOUNDS;
const inB = (x, z, m = 1) => x >= B.minX + m && x <= B.maxX - m && z >= B.minZ + m && z <= B.maxZ - m;
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const area = build(new THREE.Scene());
const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));

describe('the plan (reefdeep.js)', () => {
  it('is pure and seeded: the same plankton, beads and colliders twice', () => {
    expect(D.planktonSeeds()).toEqual(D.planktonSeeds());
    expect(D.glowBeads()).toEqual(D.glowBeads());
    expect(D.deepColliders()).toEqual(D.deepColliders());
    expect(D.planktonSeeds()).toHaveLength(D.PLANKTON_COUNT.cave + D.PLANKTON_COUNT.open);
  });
  it('everything stands inside the walk and the Deep zone; the colliders are in the area record', () => {
    for (const c of D.deepColliders()) {
      expect(inB(c.x, c.z, 0.5), JSON.stringify(c)).toBe(true);
      expect(area.colliders.some((a) => a.x === c.x && a.z === c.z && a.r === c.r), JSON.stringify(c)).toBe(true);
      expect(near(c, P.REEF_SPAWN)).toBeGreaterThan(30);
    }
    for (const p of [D.BOAT, D.ANCHOR, D.GLOW, ...D.DEEP_POCKETS, ...D.DEEP_SCENICS]) expect(inB(p.x ?? p.mouthX, p.z ?? p.floorZ, 2)).toBe(true);
    expect(P.zoneAt(D.BOAT.x, D.BOAT.z)).toBe('deep');
  });
  it('the floors are open: the boat\'s stern door and the cleft are each at least 2.2 m clear between their colliders', () => {
    expect(D.sternClear()).toBeGreaterThanOrEqual(2.2);
    expect(D.caveClear()).toBeGreaterThanOrEqual(2.2);
    const cols = D.deepColliders();
    // measured against the real colliders: the nearest pair either side of the cleft's axis, and either side of the stern door
    const side = (pred) => cols.filter(pred);
    const north = side((c) => c.x < D.GLOW.mouthX && c.x > D.GLOW.backX && c.z < D.GLOW.floorZ);
    const south = side((c) => c.x < D.GLOW.mouthX && c.x > D.GLOW.backX && c.z > D.GLOW.floorZ);
    for (const a of north) for (const b of south) if (Math.abs(a.x - b.x) < 0.5) expect(near(a, b) - a.r - b.r).toBeGreaterThanOrEqual(2.2);
    const pair = D.boatColliders().slice(-2); // the stern-most station's two sides
    expect(pair).toHaveLength(2);
    expect(near(pair[0], pair[1]) - pair[0].r - pair[1].r).toBeGreaterThanOrEqual(2.2);
  });
  it('nothing in the older wings grows through the new places (no coral, kelp or clump on a collider, a pocket, a scenic spot or the mouse)', async () => {
    const W = await import('../src/world/reefwing.js');
    const old = [...P.scatterCoral(), ...P.scatterKelp().map((k) => ({ ...k, s: 0.3 })), ...W.scatterWing()];
    for (const c of D.deepColliders()) for (const k of old) expect(near(c, k), `${JSON.stringify(c)} vs ${k.x},${k.z}`).toBeGreaterThan(c.r + k.s);
    for (const p of [...D.DEEP_POCKETS, ...D.DEEP_SCENICS, GOLD_MICE.reef[0]]) for (const k of old) expect(near(p, k), JSON.stringify(p)).toBeGreaterThan(k.s + 0.8);
  });
  it('the story\'s pocket list ends with the third chain, each clear of every collider by 0.8 m', () => {
    expect(S.POCKETS.slice(-D.DEEP_POCKETS.length).map((p) => ({ x: p.x, z: p.z }))).toEqual(D.DEEP_POCKETS.map((p) => ({ x: p.x, z: p.z })));
    for (const p of D.DEEP_POCKETS) for (const c of area.colliders) expect(near(p, c), JSON.stringify(p)).toBeGreaterThan(c.r + 0.8);
    // a chain: no gap bigger than 12 m from the Sandy Flats' middle out to the cleft's mouth
    const chain = [{ x: -8, z: -14 }, ...D.DEEP_POCKETS];
    for (let i = 1; i < chain.length; i++) if (i < chain.length - 1) expect(near(chain[i - 1], chain[i])).toBeLessThan(12);
    expect(near(D.DEEP_POCKETS.at(-1), { x: D.GLOW.mouthX, z: D.GLOW.floorZ })).toBeLessThan(2);
  });
});

describe('reached from the spawn on foot, no skills', () => {
  it('the hull\'s inside, beside it and over the stern; the anchor; the cleft\'s floor to its back; every pocket and both scenic spots', () => {
    const inside = D.boatPoint(0.8, 0);
    expect(D.insideBoat(inside.x, inside.z)).toBe(true);
    expect(flood.reachesWithin(inside.x, inside.z, 0.6), 'inside the hull').toBe(true);
    for (const v of [-3.4, 3.4]) { const p = D.boatPoint(0, v); expect(flood.reachesWithin(p.x, p.z, 0.6), `beside the hull ${v}`).toBe(true); }
    const bow = D.boatPoint(-3.75 - 1.2, 0);
    expect(flood.reachesWithin(bow.x, bow.z, 0.6), 'past the bow').toBe(true);
    expect(flood.reachesWithin(D.ANCHOR.x, D.ANCHOR.z, D.ANCHOR.r + 1.0)).toBe(true);
    for (const x of [D.GLOW.mouthX - 0.5, -42, D.GLOW.backX + 0.9]) expect(flood.reaches(x, D.GLOW.floorZ), `cleft floor at ${x}`).toBe(true);
    expect(D.insideCave(-42, D.GLOW.floorZ)).toBe(true);
    for (const p of [...D.DEEP_POCKETS, ...D.DEEP_SCENICS]) expect(flood.reachesWithin(p.x, p.z, 0.5), JSON.stringify(p)).toBe(true);
  });
  it('every find\'s ring is reached: she can stand inside it on foot', () => {
    for (const id of ['boat', 'anchor', 'cave']) {
      const z = Q.REEF_FIND_ZONES[id][0];
      expect(flood.reachesWithin(z.x, z.z, z.r - 0.3), id).toBe(true);
    }
  });
  it('the hull is solid: no standing in its sides, the middle of its keel is a collider-free floor', () => {
    const v = D.hullHalf(0) - D.HULL_WALL;
    for (const s of [-1, 1]) { const p = D.boatPoint(0.8, s * v); expect(isWalkableAt(area, p.x, p.z), `side ${s}`).toBe(false); }
    const mid = D.boatPoint(0.8, 0);
    expect(isWalkableAt(area, mid.x, mid.z)).toBe(true);
  });
});

describe('the three finds are live, with their real positions', () => {
  it('boat, anchor and cave: active, in the zone the wing names, finding by place and stillness', () => {
    const Z = Q.REEF_FIND_ZONES;
    for (const [id, still] of [['boat', 0], ['anchor', 1], ['cave', 0]]) {
      const z = Z[id][0];
      expect(z.active, id).toBe(true);
      expect(z.still, id).toBe(still);
      expect({ x: z.x, z: z.z, r: z.r }).toEqual({ x: D.DEEP_FIND_ZONES[id].x, z: D.DEEP_FIND_ZONES[id].z, r: D.DEEP_FIND_ZONES[id].r });
      expect(P.zoneAt(z.x, z.z), id).toBe('deep');
      expect(F.findAt({ x: z.x, z: z.z, still: 5 }), id).toBe(id);
      expect(Q.REEF_FIND_MARKS[id], `${id} glow mark`).toBeTruthy();
    }
    expect(F.findAt({ x: 0, z: 36, still: 9 })).toBe(null);
  });
  it('the six rings never overlap, and none holds the golden mice, a shell or a found-outfit spot', () => {
    const ids = Q.REEF_FIND_IDS;
    for (const a of ids) for (const b of ids) if (a < b) expect(near(Q.REEF_FIND_ZONES[a][0], Q.REEF_FIND_ZONES[b][0]), `${a}/${b}`).toBeGreaterThan(Q.REEF_FIND_ZONES[a][0].r + Q.REEF_FIND_ZONES[b][0].r);
    for (const m of GOLD_MICE.reef) for (const id of ids) expect(near(m, Q.REEF_FIND_ZONES[id][0]), `${m.id} vs ${id}`).toBeGreaterThan(Math.max(2, Q.REEF_FIND_ZONES[id][0].r + 1));
    for (const k of area.collectibles) for (const id of ids) expect(near(k, Q.REEF_FIND_ZONES[id][0]), `${k.id} vs ${id}`).toBeGreaterThan(Q.REEF_FIND_ZONES[id][0].r);
  });
  it('each pays 12 the first time ever and counts on its page once', () => {
    const progression = createProgression(memoryStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    for (const id of ['boat', 'anchor', 'cave']) {
      expect(F.noteReefFind(id, { log, progression })).toEqual({ fresh: true, first: true, points: 12 });
      expect(F.noteReefFind(id, { log, progression }).fresh).toBe(false);
      expect(progression.state.journal[`rf${id}`]).toBe(1);
    }
    expect(progression.state.points).toBe(36);
  });
});

describe('the boat\'s golden mouse', () => {
  const m = GOLD_MICE.reef[0];
  it('lies on the sand west of the hull, near it (within 4.5 m of its middle), clear of every collider and ring, and reached on foot', () => {
    expect(m.y).toBe(0);
    expect(near(m, D.BOAT)).toBeLessThan(4.5);
    for (const c of area.colliders) expect(near(m, c), JSON.stringify(c)).toBeGreaterThan(c.r + 0.5);
    expect(flood.reachesWithin(m.x, m.z, 0.9)).toBe(true);
    expect(Q.REEF_GOLD[0]).toEqual(m);
  });
  it('the hull stands between it and the way she comes in: the stern door is on the far side, so it is "behind the boat"', () => {
    const toMouse = { x: m.x - D.BOAT.x, z: m.z - D.BOAT.z };
    const toDoor = { x: D.BOAT_STERN.x - D.BOAT.x, z: D.BOAT_STERN.z - D.BOAT.z };
    expect(toMouse.x * toDoor.x + toMouse.z * toDoor.z).toBeLessThan(near(m, D.BOAT) * near(D.BOAT_STERN, D.BOAT) * 0.5);
  });
});

describe('the drawing', () => {
  const count = () => {
    const kit = createKit('t');
    drawDeep(kit, reefMaterials());
    let tris = 0;
    const meshes = kit.meshes();
    for (const mm of meshes) tris += mm.geometry.attributes.position.count / 3;
    return { names: meshes.map((x) => x.name).sort(), tris };
  };
  it('goes into the two buckets only (paint and glow): no mesh more than the place had, the same twice', () => {
    const a = count();
    expect(a.names).toEqual(['t:glow', 't:paint']);
    expect(count()).toEqual(a);
    expect(a.tris).toBeGreaterThan(500);
    expect(a.tris).toBeLessThan(4000);
  });
  it('the cleft glows: beads in the unlit bucket on both walls, none under the floor', () => {
    const beads = D.glowBeads();
    expect(beads.length).toBeGreaterThanOrEqual(12);
    expect(beads.some((b) => b.z < D.GLOW.floorZ) && beads.some((b) => b.z > D.GLOW.floorZ)).toBe(true);
    for (const b of beads) { expect(b.y).toBeGreaterThan(0.2); expect(D.insideCave(b.x, b.z) || b.x < D.GLOW.mouthX).toBe(true); }
  });
  it('the built place still holds one InstancedMesh each for kelp and spires and no new named mesh but the plankton in the life', () => {
    const scene = new THREE.Scene();
    build(scene);
    expect(scene.getObjectByName('reef:plankton')).toBeUndefined(); // the plankton is the walk's life, made after the sweeps
  });
});

describe('the Sunken Boat and the Old Anchor are each one connected thing (reefwreckdeep.js)', () => {
  const env = { THREE: T3, paint, reefY: P.reefY, D }; // (the Reef's kit three, as the stage gets it)
  const box = (p) => new THREE.Box3().setFromBufferAttribute(p.geo.attributes.position);
  const gap = (a, b) => { const A = box(a); const Bx = box(b); const dx = Math.max(0, A.min.x - Bx.max.x, Bx.min.x - A.max.x); const dy = Math.max(0, A.min.y - Bx.max.y, Bx.min.y - A.max.y); const dz = Math.max(0, A.min.z - Bx.max.z, Bx.min.z - A.max.z); return Math.hypot(dx, dy, dz); };
  const byName = (list) => Object.fromEntries(list.map((p) => [p.name, p]));
  const EPS = 0.05;

  it('the boat: the strakes meet seam to seam from rail to rail, the keel carries the middle two, the stem meets the keel, the rails sit on the outer two, every rib, thwart, the mast and its parts touch their neighbours', () => {
    const list = boatPieces();
    const b = byName(list);
    for (let j = 0; j < W.BOAT_M - 1; j++) expect(gap(b[`strake${j}`], b[`strake${j + 1}`]), `strake ${j} to ${j + 1}`).toBeLessThan(EPS);
    expect(gap(b.strake3, b.keel)).toBeLessThan(EPS); expect(gap(b.strake4, b.keel)).toBeLessThan(EPS);
    expect(gap(b.stem, b.keel)).toBeLessThan(EPS);
    expect(gap(b.stem, b.strake3)).toBeLessThan(EPS);
    expect(gap(b.railL, b.strake0)).toBeLessThan(EPS); expect(gap(b.railR, b.strake7)).toBeLessThan(EPS);
    for (const n of Object.keys(b).filter((k) => k.startsWith('rib'))) {
      expect(gap(b[n], b.keel), n).toBeLessThan(EPS); // a rib's middle rests on the keel's top and its ends reach the rails' planking
      expect(gap(b[n], b.strake0) + gap(b[n], b.strake7), n).toBeLessThan(EPS * 2);
    }
    for (const n of ['thwart0', 'thwart1']) expect(Math.min(gap(b[n], b.strake1), gap(b[n], b.strake0), gap(b[n], b.strake2)), n).toBeLessThan(EPS);
    for (const n of ['thwart0', 'thwart1']) expect(Math.min(gap(b[n], b.strake6), gap(b[n], b.strake7), gap(b[n], b.strake5)), n).toBeLessThan(EPS);
    expect(gap(b.mastStep, b.keel)).toBeLessThan(EPS);
    expect(gap(b.mast, b.mastStep)).toBeLessThan(EPS);
    for (const k of [0, 1, 2]) expect(gap(b[`splinter${k}`], b.mast)).toBeLessThan(EPS);
    expect(gap(b.mastTop, b.mast)).toBeLessThan(EPS);
    expect(gap(b.mastTop, b.railR)).toBeLessThan(EPS); // the broken top lies on the rail
    for (const n of Object.keys(b).filter((k) => k.startsWith('coral'))) expect(Math.min(gap(b[n], b.railL), gap(b[n], b.railR)), n).toBeLessThan(EPS);
    // one boat: every piece is joined to the hull through some chain of touching pieces
    const seen = new Set(['strake0']); const todo = ['strake0'];
    while (todo.length) { const a = todo.pop(); for (const n of Object.keys(b)) if (!seen.has(n) && gap(b[a], b[n]) < EPS) { seen.add(n); todo.push(n); } }
    expect([...seen].sort()).toEqual(Object.keys(b).sort());
  });
  const boatPieces = () => W.boatPieces(env);

  it('the boat\'s keel runs the length of the hull and curves up toward the open stern (the broken edge is ragged: the strakes stop at different stations)', () => {
    const b = byName(boatPieces());
    const kb = box(b.keel);
    expect(kb.max.x - kb.min.x + kb.max.z - kb.min.z).toBeGreaterThan(D.BOAT.length * 0.85);
    const tops = Array.from({ length: W.BOAT_M }, (_, j) => box(b[`strake${j}`]).max.y);
    expect(new Set(tops.map((y) => y.toFixed(2))).size).toBeGreaterThan(2);
  });

  it('the strakes share their seams exactly: every vertex on the seam between two planks is a vertex of both', () => {
    const b = byName(boatPieces());
    const verts = (p) => { const a = p.geo.attributes.position; return Array.from({ length: a.count }, (_, i) => [a.getX(i), a.getY(i), a.getZ(i)]); };
    for (let j = 0; j < W.BOAT_M - 1; j++) {
      const A = verts(b[`strake${j}`]); const Bv = verts(b[`strake${j + 1}`]);
      const shared = A.filter((p) => Bv.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.001)).length;
      expect(shared, `seam ${j}/${j + 1}`).toBeGreaterThanOrEqual(14); // (at least the seven stations nearest the bow are shared by every pair, two triangles' vertices a station)
    }
  });

  it('the anchor: ring on the shank, stock through it, crown at the far end, arms from the crown, each fluke on its arm\'s tip, the first link through the ring and the rest chained to the sand', () => {
    const list = W.anchorPieces(env);
    const a = byName(list);
    const pairs = [['shank', 'ring'], ['shank', 'stock'], ['shank', 'crown'], ['stock', 'stockKnobA'], ['stock', 'stockKnobB'], ['shank', 'shankRust'], ['crown', 'armL'], ['crown', 'armR'], ['armL', 'flukeL'], ['armR', 'flukeR'], ['ring', 'chain0']];
    for (const [x, y] of pairs) expect(gap(a[x], a[y]), `${x} to ${y}`).toBeLessThan(EPS);
    for (let k = 0; k < W.ANCHOR_LINKS - 1; k++) expect(gap(a[`chain${k}`], a[`chain${k + 1}`]), `link ${k}`).toBeLessThan(EPS);
    // the flukes' bases are on the arms' tips: the nearest point of the fluke's box to the arm's box is touching, and the arm's far end is the fluke's
    for (const s of ['L', 'R']) {
      const arm = box(a[`arm${s}`]); const f = box(a[`fluke${s}`]); expect(f.intersectsBox(arm.clone().expandByScalar(0.03))).toBe(true);
      // the arm's tip is the end of its tube that is farthest from the crown; the fluke's base middle is exactly there
      const ap = a[`arm${s}`].geo.attributes.position; const cr = box(a.crown).getCenter(new THREE.Vector3());
      let far = null; for (let i = 0; i < ap.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(ap, i); if (!far || v.distanceTo(cr) > far.d) far = { v, d: v.distanceTo(cr) }; }
      expect(box(a[`fluke${s}`]).distanceToPoint(far.v)).toBeLessThan(0.05);
    }
    // the chain hangs to the sand: its last link is on the ground
    const last = box(a[`chain${W.ANCHOR_LINKS - 1}`]);
    const g = P.reefY((last.min.x + last.max.x) / 2, (last.min.z + last.max.z) / 2);
    expect(last.min.y).toBeLessThan(g + 0.1);
    expect(last.min.y).toBeGreaterThan(g - 0.1);
    // one anchor: everything is joined through touching pieces
    const seen = new Set(['shank']); const todo = ['shank'];
    while (todo.length) { const q = todo.pop(); for (const n of Object.keys(a)) if (!seen.has(n) && gap(a[q], a[n]) < EPS) { seen.add(n); todo.push(n); } }
    expect([...seen].sort()).toEqual(Object.keys(a).sort());
    // it lies on its side: no piece but the stock's end and the arms' top rises more than a metre over the dune, and the shank is near the ground
    const all = list.reduce((bb, p) => bb.union(box(p)), new THREE.Box3());
    expect(all.max.y - P.reefY(D.ANCHOR.x, D.ANCHOR.z)).toBeLessThan(1.4);
  });
});

describe('the life: plankton and three soft lines', () => {
  const make = (o = {}) => {
    const scene = new THREE.Scene();
    const said = [];
    const life = createReefDeepLife({ scene, say: (t) => said.push(t), ...o });
    return { scene, said, life };
  };
  it('one Points of lights, fewer on the low rungs, still under reduced motion, removed on dispose', () => {
    const full = make().life.plankton.geometry.attributes.position.count;
    expect(full).toBe(D.PLANKTON_COUNT.cave + D.PLANKTON_COUNT.open);
    const low = make({ tier: { name: 'low', rung: 3, shadows: false } }).life.plankton.geometry.attributes.position.count;
    const lite = make({ tier: { name: 'lite', rung: 4 } }).life.plankton.geometry.attributes.position.count;
    expect(lite).toBeLessThan(low); expect(low).toBeLessThan(full);
    expect(planktonShare(null)).toBe(1);
    const m = make();
    const p0 = [...m.life.plankton.geometry.attributes.position.array];
    m.life.update(1, 0, null); m.life.update(1, 0, null);
    expect([...m.life.plankton.geometry.attributes.position.array]).not.toEqual(p0);
    const r = make({ reducedMotion: true });
    const q0 = [...r.life.plankton.geometry.attributes.position.array];
    r.life.update(2, 0, null);
    expect([...r.life.plankton.geometry.attributes.position.array]).toEqual(q0);
    expect(r.scene.getObjectByName('reef:plankton')).toBeTruthy();
    r.life.dispose();
    expect(r.scene.getObjectByName('reef:plankton')).toBeUndefined();
  });
  it('says the arrival line once, the boat line once inside the hull, the cleft line once inside the cleft', () => {
    const { life, said } = make();
    life.update(0.1, 0, { x: 0, y: 0, z: 36 });
    expect(said).toEqual([]);
    life.update(0.1, 0, { x: -33, y: 0, z: -27 });
    life.update(0.1, 0, { x: -33, y: 0, z: -27 });
    expect(said).toEqual([phrase('reef.deep.arrive')]);
    const b = D.boatPoint(0.8, 0);
    life.update(0.1, 0, { x: b.x, y: 0, z: b.z });
    life.update(0.1, 0, { x: b.x, y: 0, z: b.z });
    life.update(0.1, 0, { x: -42, y: 0, z: D.GLOW.floorZ });
    life.update(0.1, 0, { x: -42, y: 0, z: D.GLOW.floorZ });
    expect(said).toEqual([phrase('reef.deep.arrive'), phrase('reef.deep.boat'), phrase('reef.deep.cave')]);
  });
});

describe('the words, in both sets', () => {
  const ids = Object.keys(LINES);
  const scary = /\b(drown\w*|die|dies|dead|hurt\w*|panic\w*|gasp\w*|choke\w*|scared|scary|afraid|danger\w*|dark|lonely|fail\w*)\b/i;
  it('three lines, present in the phrase table, short and kind, the same plain base in the everyday set with no series word', () => {
    expect(ids).toEqual(['reef.deep.arrive', 'reef.deep.boat', 'reef.deep.cave']);
    for (const id of ids) {
      expect(hasPhrase(id), id).toBe(true);
      const s = phrase(id);
      expect(s, id).toMatch(/\S/); expect(s.length, id).toBeLessThanOrEqual(90); expect(s, id).not.toMatch(scary);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id).length).toBeLessThanOrEqual(90); });
    }
    withOffWords(() => { expect(phrase('reef.deep.arrive')).toBe('It is calm and quiet out here. Tiny lights drift by.'); });
    expect(phrase('reef.deep.arrive')).toMatch(/stars/);
  });
  it('every phrase(...) call in the wing\'s files has a literal id in the lines table', () => {
    for (const f of ['src/world/reefdeeplife.js', 'src/world/reefdeepparts.js', 'src/world/reefdeep.js']) {
      for (const m of read(f).replace(/\/\/.*$/gm, '').matchAll(/\bphrase\(([^)]*)\)/g)) {
        expect(m[1], `${f}: phrase(${m[1]})`).toMatch(/^'[a-z0-9.]+'$/);
        expect(ids, f).toContain(m[1].slice(1, -1));
      }
    }
  });
  it('the scenic labels are plain nouns, the same in both sets', () => {
    for (const s of D.DEEP_SCENICS) { expect(s.label).toMatch(/^the [A-Z][a-z]+ [A-Z][a-z]+$/); withOffWords(() => expect(bannedIn(s.label)).toBeNull()); }
  });
});

describe('the source rules', () => {
  it('the pure plan and its drawing draw no random number, read no clock and never name floatY; the plan imports no THREE', () => {
    for (const f of ['src/world/reefdeep.js', 'src/world/reefdeepparts.js', 'src/world/reefdeeplife.js', 'src/world/reefdeepwords.js']) {
      const src = read(f).replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
      expect(src, f).not.toMatch(/\bfloatY\b/);
    }
    expect(read('src/world/reefdeep.js')).not.toMatch(/from 'three'/);
    expect(globSync('src/world/reefdeep*.js')).toHaveLength(4);
  });
});
