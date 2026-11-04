import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';

// The Moor's dressing (polish-rivermoor Task 4): a rolling ground tint, two
// sheep paths, clitter round the tors, scattered boulders, a rocky lake shore,
// wind-bent moor grass and far tors past the bounds. All of it is looks only:
// nothing here may move gameplay data, stand on a path or a find, or stand
// taller than its class. The rules below are restated as plain distances.

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

const moor = await import('../src/world/moor.js');
const D = await import('../src/world/moordress.js');
const { waterGap } = await import('../src/world/builder.js');
const { DISCS } = await import('../src/rivalclans.js');
const { WIND_DIR } = await import('../src/render/grass.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');

const {
  build, SPAWN, MOOR_WATERS, MOOR_PATHS, MOOR_TRAIL, MOOR_GORGE_TRAIL, MOOR_KEEP_CLEAR, MOOR_DECKS,
  MOOR_LAKE, MOOR_RIVER_MOUTH, HIGH_TOR, MOOR_CHAIN_ROCKS, TORS, moorTrunks, moorReeds,
} = moor;
const { SHEEP_PATHS, FAR_TORS, moorClitter, moorBoulders, moorGrass, moorShoreStones, moorGroundTint } = D;

const segDist = (x, z, [x1, z1, x2, z2]) => {
  const dx = x2 - x1, dz = z2 - z1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz));
};
const rectDist = (d, x, z) => Math.hypot(Math.max(d.minX - x, 0, x - d.maxX), Math.max(d.minZ - z, 0, z - d.maxZ));
const OPEN = MOOR_WATERS.map((w) => ({ ...w, decks: [] }));
const waterDist = (x, z) => Math.min(...OPEN.map((w) => waterGap(w, x, z)));
const inBounds = (x, z) => x >= -50 && x <= 50 && z >= -50 && z <= 50;
const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const cm = (v) => Math.round(v * 100) / 100 === v;
const TRAILS = [...MOOR_TRAIL, ...MOOR_GORGE_TRAIL];
// The four scenery tors, the High Tor's pillar and the two chain boulders.
const ROCKS = [...TORS, HIGH_TOR, ...MOOR_CHAIN_ROCKS];

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
  boulder: { water: 1.0, deck: 3, path: 2.0, trail: 1.8, clear: 2.5, spawn: 5, tor: 0.8, trunk: 1.2, camp: 1 },
  grass: { water: 0.4, deck: 2, path: 1.9, trail: 1.4, clear: 1.5, spawn: 3, tor: 0.2, trunk: 0.6, camp: 0 },
};

function expectClear(list, rule, what) {
  for (const p of list) {
    const at = `${what} ${p.x},${p.z}`;
    expect(inBounds(p.x, p.z), at).toBe(true);
    expect(cm(p.x) && cm(p.z), at).toBe(true);
    expect(waterDist(p.x, p.z), at).toBeGreaterThanOrEqual(rule.water);
    for (const d of MOOR_DECKS) expect(rectDist(d, p.x, p.z), at).toBeGreaterThanOrEqual(rule.deck);
    for (const s of MOOR_PATHS) expect(segDist(p.x, p.z, s), at).toBeGreaterThanOrEqual(rule.path);
    for (const s of TRAILS) expect(segDist(p.x, p.z, s), at).toBeGreaterThanOrEqual(rule.trail);
    for (const [cx, cz] of MOOR_KEEP_CLEAR) expect(Math.hypot(p.x - cx, p.z - cz), at).toBeGreaterThanOrEqual(rule.clear);
    expect(Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z), at).toBeGreaterThanOrEqual(rule.spawn);
    for (const t of ROCKS) expect(Math.hypot(p.x - t.x, p.z - t.z), at).toBeGreaterThanOrEqual(t.r + rule.tor);
    for (const t of moorTrunks()) expect(Math.hypot(p.x - t.x, p.z - t.z), at).toBeGreaterThanOrEqual(rule.trunk * t.scale);
    const disc = DISCS.moor;
    expect(Math.hypot(p.x - disc.cx, p.z - disc.cz), at).toBeGreaterThanOrEqual(disc.r + rule.camp);
  }
}

const GAMEPLAY = (area) => JSON.stringify({
  colliders: area.colliders, perches: area.perches, spawn: area.spawn, bounds: area.bounds,
  waters: area.waters, pois: area.pois, collectibles: area.collectibles, scenics: area.scenics,
  critterSpawns: area.critterSpawns, puddles: area.puddles, boxes: area.boxes, moments: area.moments,
});

const scene = new THREE.Scene();
const area = build(scene);

describe('the Moor dressing', () => {
  it('gameplay data is byte-identical', () => {
    expect(createHash('sha256').update(GAMEPLAY(area)).digest('hex'))
      .toBe('f7f0bd41dcd7c7e0476f14e7324e84d5b6e032b0e334df4a4fa2167703fdd9f6');
  });

  it('the exported records are the ones the Moor is built from', () => {
    const decks = MOOR_WATERS.flatMap((w) => w.decks ?? []);
    expect(MOOR_DECKS).toHaveLength(decks.length);
    for (const d of decks) expect(MOOR_DECKS).toContain(d);
    expect(MOOR_LAKE).toBe(MOOR_WATERS.find((w) => w.id === 'lake'));
    expect(MOOR_RIVER_MOUTH).toBe(MOOR_WATERS.find((w) => w.id === 'river-mouth'));
    expect(scene.getObjectByName('highTor').position.x).toBe(HIGH_TOR.x);
    expect(MOOR_CHAIN_ROCKS.find((r) => r.name === 'highTorRock')).toBeTruthy();
  });

  it('boulders lie in small groups, clear of paths, finds, decks, spawn, tors, trunks and the camp', () => {
    const list = moorBoulders();
    expect(list.length).toBeGreaterThanOrEqual(15);
    expect(list.length).toBeLessThanOrEqual(30);
    expectClear(list, RULES.boulder, 'boulder');
    for (const p of list) {
      const mates = list.filter((q) => q !== p && Math.hypot(q.x - p.x, q.z - p.z) < 1.8).length;
      expect(mates, `${p.x},${p.z}`).toBeGreaterThanOrEqual(1);
      expect(p.h).toBeLessThanOrEqual(0.35);
      expect(p.r).toBeGreaterThanOrEqual(0.2);
      expect(p.r).toBeLessThanOrEqual(0.7);
    }
  });

  it('moor grass keeps off paths, finds, decks, spawn, tors, trunks and the camp', () => {
    const list = moorGrass();
    expect(list.length).toBeGreaterThan(300);
    expect(list.length).toBeLessThanOrEqual(450);
    expectClear(list, RULES.grass, 'grass');
    for (const g of list) {
      expect(g.h).toBeGreaterThanOrEqual(0.25);
      expect(g.h).toBeLessThanOrEqual(0.5);
      expect(['straw', 'olive', 'rust']).toContain(g.tone);
    }
  });

  it('clitter rings each tor and the High Tor, off every path and trail', () => {
    const list = moorClitter();
    const tors = [...TORS, HIGH_TOR];
    const per = tors.map(() => 0);
    for (const c of list) {
      const at = `${c.x},${c.z}`;
      expect(cm(c.x) && cm(c.z), at).toBe(true);
      const i = tors.reduce((best, t, k) => (Math.hypot(c.x - t.x, c.z - t.z) < Math.hypot(c.x - tors[best].x, c.z - tors[best].z) ? k : best), 0);
      const t = tors[i];
      per[i]++;
      const d = Math.hypot(c.x - t.x, c.z - t.z);
      expect(d, at).toBeGreaterThanOrEqual(t.r * 0.7 - 1e-6);
      expect(d, at).toBeLessThanOrEqual(t.r * 1.05 + 1e-6);
      expect(c.r).toBeGreaterThanOrEqual(0.18);
      expect(c.r).toBeLessThanOrEqual(0.45);
      expect(c.h).toBeLessThanOrEqual(0.35);
      for (const s of MOOR_PATHS) expect(segDist(c.x, c.z, s) - 1.5, at).toBeGreaterThanOrEqual(1.2);
      for (const s of TRAILS) expect(segDist(c.x, c.z, s) - 1, at).toBeGreaterThanOrEqual(1.2);
      // the High Tor's chain boulder stays free to hop onto
      for (const r of MOOR_CHAIN_ROCKS) expect(Math.hypot(c.x - r.x, c.z - r.z), at).toBeGreaterThanOrEqual(1.2);
      expect(waterDist(c.x, c.z), at).toBeGreaterThanOrEqual(1);
      // every find, but the High Tor's own perch and golden mouse on its pillar
      for (const [px, pz] of MOOR_KEEP_CLEAR) {
        if (Math.hypot(px - HIGH_TOR.x, pz - HIGH_TOR.z) <= HIGH_TOR.r) continue;
        expect(Math.hypot(c.x - px, c.z - pz), at).toBeGreaterThanOrEqual(1.5);
      }
      for (const d of MOOR_DECKS) expect(rectDist(d, c.x, c.z), at).toBeGreaterThanOrEqual(3);
      expect(Math.hypot(c.x - DISCS.moor.cx, c.z - DISCS.moor.cz), at).toBeGreaterThanOrEqual(DISCS.moor.r + 1);
      expect(Math.hypot(c.x - SPAWN.x, c.z - SPAWN.z), at).toBeGreaterThanOrEqual(5);
    }
    for (const n of per) {
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(9);
    }
  });

  it('shore stones straddle the lake waterline, never in the river mouth, off the reeds', () => {
    const list = moorShoreStones();
    expect(list.length).toBeGreaterThanOrEqual(50);
    expect(list.length).toBeLessThanOrEqual(70);
    const reeds = moorReeds();
    for (const s of list) {
      const at = `${s.x},${s.z}`;
      expect(cm(s.x) && cm(s.z), at).toBe(true);
      expect(inBounds(s.x, s.z), at).toBe(true);
      expect(Math.abs(waterGap(MOOR_LAKE, s.x, s.z)), at).toBeLessThanOrEqual(0.7);
      expect(waterGap(MOOR_RIVER_MOUTH, s.x, s.z), at).toBeGreaterThanOrEqual(0.4);
      for (const r of reeds) expect(Math.hypot(s.x - r.x, s.z - r.z), at).toBeGreaterThanOrEqual(1.0);
      for (const d of MOOR_DECKS) expect(rectDist(d, s.x, s.z), at).toBeGreaterThanOrEqual(1.5);
      expect(s.h).toBeLessThanOrEqual(0.22);
    }
  });

  it('far tors stand outside the bounds, off every water', () => {
    expect(FAR_TORS).toHaveLength(5);
    for (const t of FAR_TORS) {
      const at = `${t.x},${t.z}`;
      const out = Math.max(Math.abs(t.x), Math.abs(t.z));
      expect(out, at).toBeGreaterThanOrEqual(52.5);
      expect(out, at).toBeLessThanOrEqual(55);
      expect(out - t.r, at).toBeGreaterThan(50);
      expect(t.h).toBeGreaterThanOrEqual(2.5);
      expect(t.h).toBeLessThanOrEqual(4);
      expect(t.r).toBeGreaterThanOrEqual(1.8);
      expect(t.r).toBeLessThanOrEqual(2.6);
      expect(waterDist(t.x, t.z), at).toBeGreaterThanOrEqual(t.r + 2);
    }
  });

  it('the sheep paths wind through the bounds, 2 m off every water', () => {
    expect(SHEEP_PATHS).toHaveLength(2);
    const lines = D.sheepPathLines();
    expect(lines).toHaveLength(2);
    lines.forEach((pts, i) => {
      expect(pts[0]).toEqual(SHEEP_PATHS[i][0]);
      expect(pts[pts.length - 1]).toEqual(SHEEP_PATHS[i][SHEEP_PATHS[i].length - 1]);
      for (const [x, z] of pts) {
        expect(inBounds(x, z), `${x},${z}`).toBe(true);
        expect(waterDist(x, z), `${x},${z}`).toBeGreaterThanOrEqual(2);
      }
    });
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
    expect(triCount(dress.geometry) + triCount(paint.geometry)).toBeLessThanOrEqual(5500);
    const p = paint.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBe(Math.fround(0.005));
    expect(dress.material.side).toBe(THREE.DoubleSide);
    expect(dress.material.customProgramCacheKey()).toBe('dressing-both-sides-v1');
    const stats = budgetStats(scene);
    expect(stats.triangles).toBeLessThanOrEqual(59400);
    expect(stats.meshes).toBe(85 + 2 + 1); // +1: polish-paths' one pathTrail mesh (the hidden path strips were already counted)
    expect(stats.casters).toBe(48);
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

  it('nothing in the bounds stands taller than its class', () => {
    const pos = scene.getObjectByName('dressing').geometry.attributes.position;
    const grass = moorGrass();
    let rockVerts = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (!inBounds(x, z)) continue;
      const at = `${x},${y},${z}`;
      // grass at most 0.45 m, the constraints' low-prop ceiling
      expect(y, at).toBeLessThanOrEqual(0.45);
      const nearGrass = grass.some((g) => Math.hypot(g.x - x, g.z - z) < 0.6);
      if (!nearGrass) {
        rockVerts++;
        expect(y, at).toBeLessThanOrEqual(0.35);
      }
    }
    expect(rockVerts).toBeGreaterThan(100);
  }, 120_000);

  it('the grass leans along the wind', () => {
    expect(D.MOOR_WIND).toEqual(WIND_DIR);
  });

  it('the ground is tinted: lighter crests, darker hollows, greener by the water', () => {
    const all = [];
    for (let x = -48; x <= 48; x += 4) for (let z = -48; z <= 48; z += 4) all.push(moorGroundTint(x, z));
    for (const m of all) for (const v of m) {
      expect(v).toBeGreaterThan(0.6);
      expect(v).toBeLessThan(1.25);
    }
    const g = all.map((m) => m[1]);
    expect(Math.max(...g) - Math.min(...g)).toBeGreaterThan(0.12);
    const ground = scene.children.find((c) => c.userData.ground);
    const col = ground.geometry.attributes.color;
    const seen = new Set();
    for (let i = 0; i < col.count; i += 37) seen.add(col.getX(i).toFixed(2));
    expect(seen.size).toBeGreaterThan(5);
  });
});
