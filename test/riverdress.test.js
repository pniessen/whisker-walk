import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';

// The River's marsh dressing (polish-rivermoor Task 2): mud banks, tussocks,
// cattails, osier clumps, flowering lilies, the mossy log and stones. All of
// it is looks only: nothing here may move gameplay data, stand on a path or a
// find, or stand taller than its class.

// The same headless canvas stub every world test uses (see test/budget.test.js).
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

const river = await import('../src/world/river.js');
const D = await import('../src/world/riverdress.js');
const { inWater, waterGap } = await import('../src/world/builder.js');
const { DISCS } = await import('../src/rivalclans.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');

const {
  build, SPAWN, RIVER_WATERS, RIVER_PATHS, RIVER_KEEP_CLEAR, RIVER_DECKS, RIVER_MEADOW,
  RIVER_FALLEN_LOG, riverTrees,
} = river;
const { riverTussocks, riverCattails, riverShrubs, riverExtraPads, riverFlowers } = D;

const segDist = (x, z, [x1, z1, x2, z2]) => {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
};
const rectDist = (d, x, z) => Math.hypot(Math.max(d.minX - x, 0, x - d.maxX), Math.max(d.minZ - z, 0, z - d.maxZ));
const waterDist = (x, z) => Math.min(...RIVER_WATERS.map((w) => waterGap(w, x, z)));
const OPEN = RIVER_WATERS.map((w) => ({ ...w, decks: [] }));
const inBounds = (x, z) => x >= -50 && x <= 50 && z >= -50 && z <= 50;
const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const cm = (v) => Math.round(v * 100) / 100 === v;

// test/budget.test.js's budgetStats, copied.
function budgetStats(scene) {
  let meshes = 0, casters = 0, triangles = 0;
  const box = new THREE.Box3();
  for (const child of scene.children) {
    box.setFromObject(child);
    const eligible = castsFromBox(box);
    child.traverse((obj) => {
      if (!obj.isMesh) return;
      meshes++;
      triangles += triCount(obj.geometry);
      if (eligible && !isTransparentMat(obj.material) && !obj.userData.noCast) casters++;
    });
  }
  return { meshes, casters, triangles: Math.round(triangles) };
}

const RULES = {
  tussock: { water: 0.3, deck: 2, path: 1.9, clear: 1.5, meadow: true },
  cattail: { water: 0.2, deck: 2, path: 2.3, clear: 3, meadow: false },
  shrub: { water: 1.0, deck: 4, path: 2.8, clear: 3, meadow: false },
};
const TREES = (() => { const t = riverTrees(); return [...t.willows, ...t.alders, ...t.pines]; })();

function expectLow(list, rule, what) {
  for (const p of list) {
    const at = `${what} ${p.x},${p.z}`;
    expect(inBounds(p.x, p.z), at).toBe(true);
    expect(cm(p.x) && cm(p.z), at).toBe(true);
    expect(waterDist(p.x, p.z), at).toBeGreaterThanOrEqual(rule.water);
    for (const d of RIVER_DECKS) expect(rectDist(d, p.x, p.z), at).toBeGreaterThanOrEqual(rule.deck);
    for (const s of RIVER_PATHS) expect(segDist(p.x, p.z, s), at).toBeGreaterThanOrEqual(rule.path);
    for (const [cx, cz] of RIVER_KEEP_CLEAR) expect(Math.hypot(p.x - cx, p.z - cz), at).toBeGreaterThanOrEqual(rule.clear);
    expect(Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z), at).toBeGreaterThanOrEqual(4);
    const disc = DISCS.river;
    expect(Math.hypot(p.x - disc.cx, p.z - disc.cz), at).toBeGreaterThanOrEqual(disc.r + 1);
    expect(segDist(p.x, p.z, RIVER_FALLEN_LOG), at).toBeGreaterThanOrEqual(1.5);
    for (const t of TREES) expect(Math.hypot(p.x - t.x, p.z - t.z), at).toBeGreaterThanOrEqual(0.8 * t.scale);
    if (!rule.meadow) {
      expect(Math.hypot(p.x - RIVER_MEADOW.x, p.z - RIVER_MEADOW.z), at).toBeGreaterThanOrEqual(RIVER_MEADOW.r);
    }
  }
}

const GAMEPLAY = (area) => JSON.stringify({
  colliders: area.colliders, perches: area.perches, spawn: area.spawn, bounds: area.bounds,
  waters: area.waters, pois: area.pois, collectibles: area.collectibles, scenics: area.scenics,
  critterSpawns: area.critterSpawns, puddles: area.puddles, boxes: area.boxes, moments: area.moments,
});

const scene = new THREE.Scene();
const area = build(scene);

describe('the River marsh dressing', () => {
  it('gameplay data is byte-identical', () => {
    expect(createHash('sha256').update(GAMEPLAY(area)).digest('hex'))
      .toBe('2e9113dcf19895e95233d2ad9cbe63492506334e47f4ab0b8bd96796b2910599');
  });

  it('every tussock, cattail and shrub keeps off paths, finds, decks, spawn and the camp', () => {
    const t = riverTussocks(), c = riverCattails(), s = riverShrubs();
    expect(t.length).toBeGreaterThan(300);
    expect(t.length).toBeLessThanOrEqual(400);
    expect(c.length).toBeGreaterThan(30);
    expect(c.length).toBeLessThanOrEqual(80);
    expect(s.length).toBeGreaterThan(5);
    expect(s.length).toBeLessThanOrEqual(12);
    expectLow(t, RULES.tussock, 'tussock');
    expectLow(c, RULES.cattail, 'cattail');
    expectLow(s, RULES.shrub, 'shrub');
  });

  it('cattails stand on a bank, in clumps', () => {
    for (const p of riverCattails()) {
      const d = waterDist(p.x, p.z);
      expect(d, `${p.x},${p.z}`).toBeGreaterThanOrEqual(0.2);
      expect(d, `${p.x},${p.z}`).toBeLessThanOrEqual(0.9);
      expect(inWater(OPEN, p.x, p.z)).toBe(false);
      const near = riverCattails().filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.8).length;
      expect(near, `${p.x},${p.z}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('extra pads float in water, off the decks, in bounds', () => {
    const pads = riverExtraPads();
    expect(pads.length).toBeGreaterThan(15);
    expect(pads.length).toBeLessThanOrEqual(45);
    for (const p of pads) {
      const at = `${p.x},${p.z}`;
      expect(cm(p.x) && cm(p.z) && cm(p.r), at).toBe(true);
      expect(inBounds(p.x, p.z), at).toBe(true);
      expect(inWater(OPEN, p.x, p.z), at).toBe(true);
      for (const d of RIVER_DECKS) expect(rectDist(d, p.x, p.z), at).toBeGreaterThanOrEqual(3);
      const depth = -waterDist(p.x, p.z);
      expect(depth, at).toBeGreaterThanOrEqual(0.4 - 1e-9);
    }
  });

  it('flowers sit on about a third of the pads, pink or white', () => {
    const pads = [...river.riverLilyPads(), ...riverExtraPads()];
    const f = riverFlowers();
    expect(f.length).toBeGreaterThan(pads.length * 0.15);
    expect(f.length).toBeLessThan(pads.length * 0.45);
    for (const fl of f) {
      expect([0xf0a0c0, 0xf4f0e6]).toContain(fl.color);
      expect(pads.some((p) => Math.hypot(p.x - fl.x, p.z - fl.z) < p.r)).toBe(true);
    }
  });

  it('the dressing is two noCast meshes inside the triangle allowance', () => {
    const dress = scene.getObjectByName('dressing');
    const paint = scene.getObjectByName('groundPaint');
    expect(dress?.isMesh).toBe(true);
    expect(paint?.isMesh).toBe(true);
    for (const m of [dress, paint]) {
      expect(m.userData.noCast).toBe(true);
      expect(m.castShadow).toBe(false);
    }
    expect(triCount(dress.geometry) + triCount(paint.geometry)).toBeLessThanOrEqual(7300);
    const p = paint.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBe(Math.fround(0.005));
    // blades seen from behind are lit like their front, not flipped dark
    expect(dress.material.side).toBe(THREE.DoubleSide);
    expect(dress.material.customProgramCacheKey()).toBe('dressing-both-sides-v1');
    const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader, vertexShader: '', uniforms: {} };
    dress.material.onBeforeCompile(shader);
    expect(shader.fragmentShader).not.toContain('#include <normal_fragment_begin>');
    expect(shader.fragmentShader).not.toContain('normal *= faceDirection;');
    const stats = budgetStats(scene);
    // Task 3's mist and dragonflies keep their room under the 62,100 cap
    const life = ['marshMist', 'dragonflies']
      .map((n) => scene.getObjectByName(n))
      .reduce((sum, m) => sum + (m ? triCount(m.geometry) : 0), 0);
    // polish-brambles: the camp's bramble mounds cost 2,604 more triangles (+2,700)
    expect(stats.triangles - life).toBeLessThanOrEqual(60600);
    expect(stats.triangles).toBeLessThanOrEqual(62100);
  }, 120_000);

  it('the flower cups are lit from the side the camera sees (inside, from above)', () => {
    const g = scene.getObjectByName('dressing').geometry;
    const pos = g.attributes.position, nrm = g.attributes.normal;
    const flowers = riverFlowers();
    let rim = 0;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < 0.135 || y > 0.145) continue; // the cups' rim ring at 0.14 (the hearts top out at 0.12)
      const f = flowers.find((fl) => Math.abs(Math.hypot(pos.getX(i) - fl.x, pos.getZ(i) - fl.z) - 0.09) < 0.005);
      if (!f) continue;
      rim++;
      expect(nrm.getY(i), `${f.x},${f.z}`).toBeGreaterThan(0);
      // and inward, toward the cup's middle
      const out = (pos.getX(i) - f.x) * nrm.getX(i) + (pos.getZ(i) - f.z) * nrm.getZ(i);
      expect(out).toBeLessThan(0);
    }
    expect(rim).toBeGreaterThanOrEqual(flowers.length * 5);
  }, 120_000);

  it('the dressing is the same every build', () => {
    const again = new THREE.Scene();
    build(again);
    for (const name of ['dressing', 'groundPaint']) {
      const a = scene.getObjectByName(name).geometry.attributes;
      const b2 = again.getObjectByName(name).geometry.attributes;
      expect(Array.from(b2.position.array)).toEqual(Array.from(a.position.array));
      expect(Array.from(b2.color.array)).toEqual(Array.from(a.color.array));
    }
  }, 120_000);

  it('no prop is taller than its class', () => {
    for (const t of riverTussocks()) expect(t.h).toBeLessThanOrEqual(0.45);
    for (const c of riverCattails()) expect(c.h).toBeLessThanOrEqual(1.3);
    for (const s of riverShrubs()) expect(s.r).toBeLessThanOrEqual(0.6);
    const pos = scene.getObjectByName('dressing').geometry.attributes.position;
    const cats = riverCattails();
    const shrubs = riverShrubs();
    const tussocks = riverTussocks();
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      maxY = Math.max(maxY, y);
      // anything inside the bounds that is not a cattail is at most 0.9 tall,
      // and a tussock's blades at most 0.45
      if (!inBounds(x, z)) continue;
      const nearCattail = cats.some((c) => Math.hypot(c.x - x, c.z - z) < 0.4);
      if (!nearCattail) expect(y, `${x},${y},${z}`).toBeLessThanOrEqual(0.9);
      const nearTall = nearCattail || shrubs.some((s) => Math.hypot(s.x - x, s.z - z) < 1.2);
      const nearTussock = tussocks.some((t) => Math.hypot(t.x - x, t.z - z) < 0.5);
      if (nearTussock && !nearTall && y > 0.2) {
        // the log bridge's moss and stubs stand by the log, not a tussock
        expect(y, `${x},${y},${z}`).toBeLessThanOrEqual(0.45);
      }
    }
    expect(maxY).toBeLessThanOrEqual(1.3);
  }, 120_000);

  it('the ground is tinted, and stays a green marsh', () => {
    const wet = D.riverGroundTint(-30, 12 + 3.5 + 0.5); // at a pool's edge
    const far = D.riverGroundTint(30, 30);
    for (const m of [wet, far]) {
      for (const v of m) {
        expect(v).toBeGreaterThan(0.6);
        expect(v).toBeLessThan(1.2);
      }
    }
    expect(wet[0]).toBeLessThan(0.95);
    const ground = scene.children.find((c) => c.userData.ground);
    const col = ground.geometry.attributes.color;
    const seen = new Set();
    for (let i = 0; i < col.count; i += 37) seen.add(col.getX(i).toFixed(2));
    expect(seen.size).toBeGreaterThan(5);
  });
});
