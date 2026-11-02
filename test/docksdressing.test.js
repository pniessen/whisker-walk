import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// polish-docks: the harbour dressing (src/world/docksdressing.js). Clusters of
// crates, barrels, nets, rope and lobster pots along the map edges and tucked
// against the buildings — scenery only. These cases hold the three things it
// must never do: move a Math.random draw (every THREE object draws four for its
// uuid, and the flat trace seeds Math.random per area), add a record the game
// reads, or stand on anything a cat needs to reach or walk along.

// Same headless stub every world test uses (see test/docks.test.js).
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

const WORLDS = {
  neighborhood: await import('../src/world/neighborhood.js'),
  park: await import('../src/world/park.js'),
  seaside: await import('../src/world/seaside.js'),
  docks: await import('../src/world/docks.js'),
};
const { mulberry32 } = await import('../src/rng.js');
const { buildCat } = await import('../src/cat/model.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { propsFor } = await import('../src/propsets.js');
const { DISCS } = await import('../src/rivalclans.js');
const dressing = await import('../src/world/docksdressing.js');

// waterlooks.test.js's drawsOf: the cat and the contact shadows warm the
// shared caches first, uncounted.
function drawsOf(world) {
  const scene = new THREE.Scene();
  createContactShadows(scene);
  buildCat('tabby');
  const real = Math.random;
  const seeded = mulberry32(12345);
  let draws = 0;
  Math.random = () => { draws++; return seeded(); };
  try {
    world.build(scene);
  } finally {
    Math.random = real;
  }
  return draws;
}

// The same docks build a second time in a row (warm caches), measured on the
// build before the dressing existed.
const SECOND_BUILD_DRAWS = 6540;

const dressingOf = (scene) => scene.children.filter((c) => c.userData.dressing);
const trisOf = (geo) => (geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3);

describe('docks dressing', () => {
  it('keeps the Docks build at 6916 Math.random draws', () => {
    // waterlooks' order: the counts depend on what earlier builds cached.
    for (const id of ['neighborhood', 'park', 'seaside']) drawsOf(WORLDS[id]);
    expect(drawsOf(WORLDS.docks)).toBe(6916);
    // A second build in a row, warm caches: measured on the build before the
    // dressing existed. The dressing makes nothing a later build can reuse.
    expect(drawsOf(WORLDS.docks)).toBe(SECOND_BUILD_DRAWS);
  }, 120_000);

  it('adds dressing meshes last, all tagged dressing + noCast, none castShadow', () => {
    const scene = new THREE.Scene();
    const area = WORLDS.docks.build(scene);
    const meshes = dressingOf(scene);
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.length).toBeLessThanOrEqual(2);
    expect(scene.children.slice(-meshes.length)).toEqual(meshes);
    for (const m of meshes) {
      expect(m.isMesh).toBe(true);
      expect(m.userData.dressing).toBe(true);
      expect(m.userData.noCast).toBe(true);
      expect(m.castShadow).toBe(false);
    }
    // dressDocks hands back what it adds: same count, same geometry sizes.
    const again = new THREE.Scene();
    const out = dressing.dressDocks(again, area);
    expect(out.length).toBe(meshes.length);
    expect(again.children).toEqual(out);
    out.forEach((m, i) => {
      expect(m.geometry.attributes.position.count).toBe(meshes[i].geometry.attributes.position.count);
    });
  }, 120_000);

  it('adds no record to the area', () => {
    const area = WORLDS.docks.build(new THREE.Scene());
    expect(Object.keys(area).sort()).toEqual([
      'bounds', 'boxes', 'collectibles', 'colliders', 'critterSpawns', 'groundBounce', 'moments',
      'name', 'perches', 'pois', 'puddles', 'scenics', 'skyDusk', 'spawn', 'tippables', 'waterFx', 'waters',
    ]);
    const lengths = {};
    for (const [k, v] of Object.entries(area)) if (Array.isArray(v)) lengths[k] = v.length;
    expect(lengths).toEqual({
      colliders: 39, perches: 26, pois: 8, collectibles: 5, scenics: 3, critterSpawns: 17,
      tippables: 12, puddles: 4, boxes: 3, moments: 2, waters: 1, waterFx: 1,
    });
  }, 120_000);

  it('keeps every in-bounds item off gameplay points and paths, or inside an existing collider', () => {
    const area = WORLDS.docks.build(new THREE.Scene());
    const points = [];
    const add = (p) => { if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) points.push({ x: p.x, z: p.z }); };
    for (const key of ['collectibles', 'pois', 'scenics', 'tippables', 'perches', 'boxes', 'puddles']) {
      for (const p of area[key]) add(p);
    }
    for (const c of area.critterSpawns) {
      add(c);
      if (c.x2 !== undefined) add({ x: c.x2, z: c.z2 });
    }
    for (const m of area.moments) { add(m); add(m.from); }
    add(area.spawn);
    for (const g of GOLD_MICE.docks) add(g);
    const props = propsFor('docks');
    for (const list of Object.values(props)) {
      if (!Array.isArray(list)) continue;
      for (const p of list) { add(p); add(p.fallTo); }
    }
    expect(points.length).toBeGreaterThan(100);
    const discs = [DISCS.docks].map((d) => ({ x: d.cx, z: d.cz, r: d.r }));
    // The dog's yard is a lawn the dog runs about on: keep it clear too.
    discs.push({ x: props.dogYard.x, z: props.dogYard.z, r: props.dogYard.r });
    expect(discs[0]).toEqual({ x: -30.5, z: -9.5, r: 5 });

    const rects = [
      { minX: -36, maxX: 36, minZ: 4.5, maxZ: 8.5 }, { minX: -36, maxX: 36, minZ: -8.5, maxZ: -4.5 }, // quays
      { minX: -1.5, maxX: 1.5, minZ: 6.5, maxZ: 36 }, { minX: -1.5, maxX: 1.5, minZ: -36, maxZ: -6.5 }, // roads
      { minX: -36, maxX: 36, minZ: 8.4, maxZ: 9.6 }, { minX: -36, maxX: 36, minZ: -9.6, maxZ: -8.4 }, // sidewalks
      ...area.waters[0].decks,
    ];
    const hitsRect = (it, r) => {
      const cx = Math.min(Math.max(it.x, r.minX), r.maxX);
      const cz = Math.min(Math.max(it.z, r.minZ), r.maxZ);
      return Math.hypot(it.x - cx, it.z - cz) < it.r;
    };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

    const items = dressing.itemsOf();
    expect(items.length).toBeGreaterThan(0);
    const bad = [];
    for (const it of items) {
      expect(it.r).toBeGreaterThan(0);
      if (Math.abs(it.z) < 3.5 && Math.abs(it.x) <= 45 && it.what !== 'boat') bad.push(`${it.what} in the canal at ${it.x},${it.z}`);
      if (Math.abs(it.x) > 38 || Math.abs(it.z) > 40) continue;
      if (['boat', 'gull', 'glint'].includes(it.what)) continue;
      if (area.colliders.some((c) => dist(it, c) + it.r <= c.r)) continue;
      for (const p of points) if (dist(it, p) < it.r + 1.0) bad.push(`${it.what} at ${it.x},${it.z} covers ${p.x},${p.z}`);
      for (const d of discs) if (dist(it, d) < it.r + d.r) bad.push(`${it.what} at ${it.x},${it.z} in disc ${d.x},${d.z}`);
      for (const r of rects) if (hitsRect(it, r)) bad.push(`${it.what} at ${it.x},${it.z} on path ${JSON.stringify(r)}`);
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it('stays within the triangle budget', () => {
    const scene = new THREE.Scene();
    WORLDS.docks.build(scene);
    const tris = dressingOf(scene).reduce((s, m) => s + trisOf(m.geometry), 0);
    expect(tris).toBeGreaterThan(0);
    expect(tris).toBeLessThanOrEqual(20_000);
  }, 120_000);
});
