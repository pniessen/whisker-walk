// The Jungle lodge, round two: placement clearance (the props, the foliage, the trees' shapes, the four jungle strays), the strays' keep-out of the river, bridge and stones, their tiers, their
// words in both sets, and the tree shapes' variety. The never-stuck and reachability tests of jungleworld.test.js stay the judge of the walk itself.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

stubCanvasDocument({ measureText: 10 });

const P = await import('../src/world/jungleplan.js');
const { PROPS, propColliders, propParts } = await import('../src/world/jungleprops.js');
const { foliagePlan, KINDS, clumpParts, FOLIAGE_COUNT } = await import('../src/world/junglefoliage.js');
const S = await import('../src/world/junglestrays.js');
const W = await import('../src/world/junglestraywords.js');
const { phrase } = await import('../src/clanphrases.js');
const { keepOutPoint } = await import('../src/keepout.js');
const { strayBreed } = await import('../src/straynames.js');
const { build } = await import('../src/world/jungle.js');
const { loadJungleStages } = await import('../src/world/junglestages.js');
await loadJungleStages();

const B = P.JUNGLE_BOUNDS;
const inB = (x, z, m) => x >= B.minX + m && x <= B.maxX - m && z >= B.minZ + m && z <= B.maxZ - m;

describe('the lived-in props stand in the clear', () => {
  const cols = P.jungleColliders();
  it('every prop is inside the walk, off the river, the bridge, the stones, the story\'s places and the lodge, and clear of every tree, stone and post', () => {
    expect(PROPS.length).toBeGreaterThanOrEqual(12);
    for (const p of PROPS) {
      const id = JSON.stringify(p);
      expect(inB(p.x, p.z, 2.5), id).toBe(true);
      expect(P.riverDist(p.x, p.z), id).toBeGreaterThan(P.RIVER_W + 1 + p.r);
      for (const [kx, kz, kr] of P.KEEP_OUT) expect(Math.hypot(p.x - kx, p.z - kz), id).toBeGreaterThan(kr + p.r);
      for (const l of P.LEAVES) expect(Math.hypot(p.x - l.x, p.z - l.z), id).toBeGreaterThan(1.8 + p.r);
      for (const s of P.STEPPING) expect(Math.hypot(p.x - s.x, p.z - s.z), id).toBeGreaterThan(1.5 + p.r);
      expect(p.x > P.LODGE.x0 - 1 && p.x < P.LODGE.x1 + 1 && p.z > P.LODGE.z0 - 1 && p.z < P.LODGE.z1 + P.LODGE.skirt, id).toBe(false);
      for (const c of cols) expect(Math.hypot(p.x - c.x, p.z - c.z), id).toBeGreaterThan(c.r + p.r * 0.8);
    }
    for (let i = 0; i < PROPS.length; i++) for (let j = i + 1; j < PROPS.length; j++) expect(Math.hypot(PROPS[i].x - PROPS[j].x, PROPS[i].z - PROPS[j].z), `${i}/${j}`).toBeGreaterThan(0.6);
  });
  it('the solid ones are small colliders in the built area, and the kinds are all drawn', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    for (const c of propColliders()) expect(area.colliders.some((a) => a.x === c.x && a.z === c.z && a.r === c.r)).toBe(true);
    for (const c of propColliders()) expect(c.r).toBeLessThanOrEqual(0.6);
    for (const k of new Set(PROPS.map((p) => p.kind))) expect(propParts({ kind: k, r: 1.8 }).length, k).toBeGreaterThan(0);
    expect(new Set(PROPS.map((p) => p.kind))).toEqual(new Set(['barrel', 'crates', 'basket', 'rack', 'hammock', 'pots']));
  });
});

describe('the foliage: clumps of different sizes and leaf shapes', () => {
  const plan = foliagePlan();
  it('is seeded and the same every time', () => { expect(foliagePlan()).toEqual(plan); });
  it('has every kind, three sizes, the counted clumps and the overhead leaves and vines', () => {
    expect(plan.clumps.length).toBeGreaterThanOrEqual(FOLIAGE_COUNT.clumps - 6);
    expect(new Set(plan.clumps.map((c) => c.kind)).size).toBe(KINDS.length);
    expect(new Set(plan.clumps.map((c) => c.size)).size).toBe(3);
    expect(Math.max(...plan.clumps.map((c) => c.s))).toBeGreaterThan(1.4);
    expect(Math.min(...plan.clumps.map((c) => c.s))).toBeLessThan(0.8);
    expect(plan.overhead.length).toBe(FOLIAGE_COUNT.overhead);
    expect(plan.vines.length).toBeGreaterThan(20);
    expect(new Set(plan.vines.map((v) => Math.round(v.len * 4))).size).toBeGreaterThan(5); // different lengths
    for (const k of KINDS) expect(clumpParts({ kind: k, size: 1, s: 1, x: 1, z: 1, yaw: 0, zone: 'ring' }).length, k).toBeGreaterThan(2);
  });
  it('every clump stands on clear ground (never on the river, the story\'s places, the lodge, a leaf or a stone) and apart from the others', () => {
    for (const c of plan.clumps) {
      expect(P.clearOf(c.x, c.z, c.s * 0.9 + 0.3), JSON.stringify(c)).toBe(true);
      for (const o of P.jungleColliders()) expect(Math.hypot(c.x - o.x, c.z - o.z), JSON.stringify(c)).toBeGreaterThan(o.r + c.s * 0.3);
    }
    for (let i = 0; i < plan.clumps.length; i++) for (let j = i + 1; j < plan.clumps.length; j++) expect(Math.hypot(plan.clumps[i].x - plan.clumps[j].x, plan.clumps[i].z - plan.clumps[j].z)).toBeGreaterThan(2.2);
  });
  it('the hanging vines end above the ground, never lower than 0.2 m over it', () => {
    for (const v of plan.vines) expect(v.y - v.len, JSON.stringify(v)).toBeGreaterThan(P.jungleY(v.x, v.z) + 0.2);
  });
});

describe('the trees take several shapes and heights', () => {
  const trees = P.scatterTrees().filter((k) => !k.rim);
  it('has emergents, leaning trunks, forked limbs, dead snags and both palms, in different heights; the green wall stays plain', () => {
    const shapes = new Set(trees.map((k) => k.shape));
    for (const s of ['broad', 'emergent', 'lean', 'fork', 'snag', 'palm']) expect(shapes.has(s), s).toBe(true);
    expect(trees.filter((k) => k.shape === 'snag').length).toBeGreaterThanOrEqual(2);
    expect(new Set(trees.filter((k) => k.shape === 'palm').map((k) => k.variant)).size).toBe(2);
    expect(new Set(trees.map((k) => Math.round(k.top))).size).toBeGreaterThan(8);
    expect(Math.max(...trees.map((k) => k.top))).toBeGreaterThan(Math.min(...trees.filter((k) => k.shape === 'broad').map((k) => k.top)) + 3);
    expect(P.scatterTrees().filter((k) => k.rim).every((k) => !k.shape)).toBe(true);
    for (const k of trees) expect(k.top, JSON.stringify(k)).toBeGreaterThan(3);
  });
  it('the layout did not move: the same trees at the same spots as the plan\'s colliders say', () => {
    expect(P.treeColliders().length).toBe(trees.length);
  });
});

describe('the four jungle strays', () => {
  it('have the four coats, each a breed the walk can draw, each on clear dry ground away from the river, bridge and stones', () => {
    expect(S.STRAY_CAST.map((c) => c.coat)).toEqual(['spotted', 'sooty', 'tawny', 'striped']);
    expect(new Set(S.STRAY_CAST.map((c) => c.name)).size).toBe(4);
    for (const c of S.STRAY_CAST) {
      expect(strayBreed(c.name), c.name).toBe(S.COAT_BREED[c.coat]);
      expect(inB(c.x, c.z, 3), c.coat).toBe(true);
      expect(P.riverDist(c.x, c.z), c.coat).toBeGreaterThan(P.RIVER_W + 3);
      for (const k of P.jungleColliders()) expect(Math.hypot(c.x - k.x, c.z - k.z), c.coat).toBeGreaterThan(k.r + 1.5);
      for (const [kx, kz, kr] of P.KEEP_OUT) expect(Math.hypot(c.x - kx, c.z - kz), c.coat).toBeGreaterThan(kr);
    }
  });
  it('the keep-out covers the river shallows, the log bridge and every stepping stone, and leaves the spots where they are', () => {
    const area = S.strayArea([]);
    const push = (x, z) => keepOutPoint(area, x, z);
    for (const [x, z] of [...P.RIVER_PATH, [10, -6], [10, -9], [10, -3], ...P.STEPPING.map((s) => [s.x, s.z])]) {
      const q = push(x, z);
      expect(Math.hypot(q.x - x, q.z - z), `${x},${z}`).toBeGreaterThan(0.5); // pushed out
    }
    for (const c of S.STRAY_CAST) { const q = push(c.x, c.z); expect(q.x).toBeCloseTo(c.x, 6); expect(q.z).toBeCloseTo(c.z, 6); }
  });
  it('the count: four on the high rung, three on low, two on lite', () => {
    expect(S.strayCount(null)).toBe(4);
    expect(S.strayCount({ name: 'high', rung: 0 })).toBe(4);
    expect(S.strayCount({ name: 'low' })).toBe(3);
    expect(S.strayCount({ shadows: false })).toBe(2);
  });
  it('are made by the walk\'s stray system, friendly, and wander for two minutes without ever standing on the shallows, the bridge or the stones', async () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const life = S.createJungleStrays({ scene, ground: area.ground, tier: null, roomSeed: undefined, colliders: area.colliders });
    expect(life).toBeTruthy();
    await life.ready;
    expect(life.strays.length).toBe(4);
    expect(life.strays.every((s) => s.personality === 'bold')).toBe(true);
    expect(life.strays.map((s) => s.jungleCoat).sort()).toEqual(['sooty', 'spotted', 'striped', 'tawny']);
    const cat = new THREE.Vector3(0, 0, 30);
    let worst = 1e9;
    for (let i = 0; i < 1200; i++) {
      life.update(0.1, i * 0.1, cat);
      for (const s of life.strays) {
        const { x, z } = s.group.position;
        worst = Math.min(worst, P.riverDist(x, z));
        expect(inB(x, z, 0), `${s.name} left the place`).toBe(true);
      }
    }
    expect(worst).toBeGreaterThan(P.RIVER_W - 0.4); // never in the water's width
    life.dispose();
  });
  it('offers a prompt when she is near one and answers it with that cat\'s line; nothing when she is far', async () => {
    const scene = new THREE.Scene();
    const life = S.createJungleStrays({ scene, tier: null, colliders: P.jungleColliders() });
    await life.ready;
    expect(life.promptAt(new THREE.Vector3(0, 0, 32))).toBeNull();
    const s = life.strays[0];
    const near = s.group.position.clone().add(new THREE.Vector3(1, 0, 0));
    expect(life.promptAt(near)).toMatch(/hello|Greet/);
    expect(life.interact()).toBeNull();
    life.dispose();
    expect(scene.children.length).toBe(0);
  });
  it('the lower rungs build fewer', async () => {
    const mk = async (tier) => { const l = S.createJungleStrays({ scene: new THREE.Scene(), tier, colliders: P.jungleColliders() }); await l.ready; return l.strays.length; };
    expect([await mk(null), await mk({ name: 'low' }), await mk({ shadows: false })]).toEqual([4, 3, 2]);
  });
  it('has one prompt and one line per coat in both word sets, no banned word, no series word in the everyday set', () => {
    for (const coat of W.COATS) for (const kind of ['prompt', 'line']) {
      const id = `jungle.stray.${kind}.${coat}`;
      const clan = phrase(id);
      const plain = withOffWords(() => phrase(id));
      expect(clan, id).toMatch(/\S/); expect(plain, id).toMatch(/\S/);
      expect(clan, id).not.toBe(plain);
      for (const t of [clan, plain]) {
        expect(withOffWords(() => bannedIn(t)), id).toBeNull();
        expect(t, id).not.toMatch(/\b(dark|lost forever|trapped|stuck|collapse|scary)\b/i);
        expect(t.length, id).toBeLessThan(110);
      }
      expect(plain, id).not.toMatch(/\b(Clan|clan|warrior|river cat|Kit)\b/);
    }
  });
});
