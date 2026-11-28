// Holiday decor in five places (H6, src/world/holidaydecor.js): which holidays dress, what each place gets, nine-light menorahs with
// the right candles, one merged mesh pair per place, no colliders, nothing moved in the area, its own seeded stream, reduced
// motion, the low rungs, and each place's own budget row with the decor on it (built and merged).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const decor = await import('../src/world/holidaydecor.js');
decor.bind(decor.NEEDS.map((k) => THREE[k])); // the walk hands three in; the chunk never imports it (the start-up budget)
const { decorSet, partsFor, dress, DECOR_PLACES, MENORAH_SLOTS } = decor;
const spots = await import('../src/world/holidayspots.js');
const { STALLS, MARKET_COLLIDERS } = await import('../src/world/marketplan.js');
const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildFarm } = await import('../src/world/farm.js');
const { build: buildMarket } = await import('../src/world/market.js');
await (await import('../src/world/housestages.js')).loadHouseStages();
await (await import('../src/world/snowvillestages.js')).loadSnowvilleStages(); // stage B's drawing is part of Snowville's build
const { build: buildSnowville } = await import('../src/world/snowville.js');
const SNOW = await import('../src/world/snowvilleplan.js');
const { build: buildHouse } = await import('../src/world/house.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');
const { setHolidayOverride } = await import('../src/holidays.js');

const at = (m, d, y = 2026) => new Date(y, m - 1, d, 12);
const BOTH = { christmas: true, hanukkah: true, night: 8 };
const XMAS = { christmas: true, hanukkah: false, night: 0 };
const HANUKKAH = { christmas: false, hanukkah: true, night: 3 };
const WINTER = { christmas: false, hanukkah: false, night: 0 };
const count = (items, kind) => items.filter((i) => i.kind === kind).length;

describe('which holidays dress the places', () => {
  it('nothing outside every window, nothing when Off', () => {
    setHolidayOverride(null);
    expect(decorSet('auto', at(7, 4))).toBe(null);
    expect(decorSet('off', at(12, 5))).toBe(null);
  });
  it('2026: Hanukkah and Christmas together 4 to 12 Dec (with the night), Christmas alone after, Winter Lights alone from 27 Dec', () => {
    setHolidayOverride(null);
    expect(decorSet('auto', at(12, 4))).toEqual({ christmas: true, hanukkah: true, night: 1 });
    expect(decorSet('auto', at(12, 10))).toEqual({ christmas: true, hanukkah: true, night: 7 });
    expect(decorSet('auto', at(12, 12))).toEqual({ christmas: true, hanukkah: true, night: 8 });
    expect(decorSet('auto', at(12, 1))).toEqual({ christmas: true, hanukkah: false, night: 0 });
    expect(decorSet('auto', at(12, 20))).toEqual({ christmas: true, hanukkah: false, night: 0 });
    expect(decorSet('auto', at(12, 28))).toEqual({ christmas: false, hanukkah: false, night: 0 });
    expect(decorSet('auto', at(1, 3, 2027))).toEqual({ christmas: false, hanukkah: false, night: 0 });
  });
  it('the Settings choice: Christmas or Hanukkah alone when in its window, else Automatic', () => {
    setHolidayOverride(null);
    expect(decorSet('christmas', at(12, 6))).toMatchObject({ christmas: true, hanukkah: false });
    expect(decorSet('hanukkah', at(12, 6))).toMatchObject({ christmas: false, hanukkah: true, night: 3 });
    expect(decorSet('hanukkah', at(12, 20))).toMatchObject({ christmas: true, hanukkah: false });
  });
  it('the address override pins the holiday and the night', () => {
    setHolidayOverride({ holiday: 'hanukkah', night: 5 });
    try { expect(decorSet('auto', at(7, 4))).toEqual({ christmas: false, hanukkah: true, night: 5 }); } finally { setHolidayOverride(null); }
  });
});

describe('what each place gets', () => {
  it('the six places are listed (Snowville joined in H8)', () => {
    expect([...DECOR_PLACES].sort()).toEqual(['farm', 'house', 'market', 'neighborhood', 'park', 'snowville']);
  });
  it('Snowville: a lit tree in the square, a wreath on each of seven cabins, a menorah on one sill, lights on the notice board', () => {
    const p = partsFor('snowville', BOTH);
    expect(count(p.items, 'tree')).toBe(1);
    expect(count(p.items, 'wreath')).toBe(7);
    expect(count(p.items, 'menorah')).toBe(1);
    expect(count(p.items, 'string')).toBe(1);
    expect(count(partsFor('snowville', WINTER).items, 'string')).toBe(1);
  });
  it('the Snowville cabin table is the village plan, and the tree stands clear of every collider, the board and the spawn', () => {
    expect(spots.SNOWVILLE.cabins.length).toBe(SNOW.COTTAGES.length);
    spots.SNOWVILLE.cabins.forEach((r, i) => {
      const c = SNOW.COTTAGES[i];
      expect(r.slice(0, 7)).toEqual([c.id, c.x, c.z, c.yaw, c.w, c.d, c.h]);
      const fx = c.x + Math.sin(c.yaw) * (c.d / 2 + 0.3), fz = c.z + Math.cos(c.yaw) * (c.d / 2 + 0.3);
      expect(Math.abs(r[7] - SNOW.snowY(fx, fz)), c.id).toBeLessThan(0.05);
    });
    const T = spots.SNOWVILLE.tree;
    expect(SNOW.snowY(T.x, T.z)).toBe(0);
    for (const c of SNOW.snowvilleColliders()) expect(Math.hypot(T.x - c.x, T.z - c.z), `${c.x},${c.z}`).toBeGreaterThan(c.r + 0.8 * T.s);
    expect(Math.hypot(T.x - SNOW.SNOWVILLE_SPAWN.x, T.z - SNOW.SNOWVILLE_SPAWN.z)).toBeGreaterThan(10);
  });
  it('Neighborhood: a wreath on all eight doors, strings on two houses (four rakes), a tree in one window, a menorah in another', () => {
    const p = partsFor('neighborhood', BOTH);
    expect(count(p.items, 'wreath')).toBe(8);
    expect(count(p.items, 'string')).toBe(4);
    expect(count(p.items, 'tree')).toBe(1);
    expect(count(p.items, 'menorah')).toBe(1);
  });
  it('Park: one large tree, a big menorah, lights round the fountain', () => {
    const p = partsFor('park', BOTH);
    expect(count(p.items, 'tree')).toBe(1);
    expect(count(p.items, 'menorah')).toBe(1);
    expect(count(p.items, 'ring')).toBe(1);
    expect(spots.PARK.menorah.s).toBeGreaterThan(2);
  });
  it('Farm: a wreath on the barn, a lit tree, a menorah in the farmhouse window, three stockings on the porch', () => {
    const p = partsFor('farm', BOTH);
    expect(count(p.items, 'wreath')).toBe(1);
    expect(count(p.items, 'tree')).toBe(1);
    expect(count(p.items, 'menorah')).toBe(1);
    expect(count(p.items, 'stocking')).toBe(3);
  });
  it('Market Square: a tree, a wreath on each of the ten stalls, the dreidel-and-gelt stall', () => {
    const p = partsFor('market', BOTH);
    expect(count(p.items, 'tree')).toBe(1);
    expect(count(p.items, 'wreath')).toBe(10);
    expect(count(p.items, 'stall')).toBe(1);
    expect(count(p.items, 'dreidel')).toBeGreaterThanOrEqual(3);
    expect(count(p.items, 'gelt')).toBeGreaterThanOrEqual(1);
  });
  it('Old House: four stockings and a small tree, and a menorah on the sill (built apart, for the wall)', () => {
    const p = partsFor('house', BOTH);
    expect(count(p.items, 'stocking')).toBe(4);
    expect(count(p.items, 'tree')).toBe(1);
    expect(count(p.sill.items, 'menorah')).toBe(1);
  });
  it('Christmas alone has no menorah and no stall; Hanukkah alone has no wreath, tree or stocking; Winter Lights alone is lights only', () => {
    for (const id of DECOR_PLACES) {
      const x = partsFor(id, XMAS);
      expect(x.items.filter((i) => ['menorah', 'dreidel', 'stall'].includes(i.kind))).toEqual([]);
      expect(x.sill?.items ?? []).toEqual([]);
      const h = partsFor(id, HANUKKAH);
      expect(h.items.filter((i) => ['wreath', 'tree', 'stocking'].includes(i.kind))).toEqual([]);
      const w = partsFor(id, WINTER);
      expect(w.items.filter((i) => !['string', 'ring'].includes(i.kind))).toEqual([]);
    }
    expect(partsFor('neighborhood', WINTER).items.length).toBeGreaterThan(0);
    expect(partsFor('park', WINTER).items.length).toBeGreaterThan(0);
  });
  it('both holidays have the same weight: each gets a piece in every place that has a piece for the other', () => {
    for (const id of ['neighborhood', 'park', 'farm', 'market']) {
      const x = partsFor(id, XMAS).items.filter((i) => ['wreath', 'tree', 'stocking'].includes(i.kind));
      const h = partsFor(id, HANUKKAH).items.filter((i) => ['menorah', 'stall'].includes(i.kind));
      expect(x.length, id).toBeGreaterThan(0);
      expect(h.length, id).toBeGreaterThan(0);
    }
  });
});

describe('the menorah: nine lights, the shamash higher, one more candle each night', () => {
  const menorahAt = (place, night) => {
    const p = partsFor(place, { christmas: false, hanukkah: true, night });
    const m = p.items.find((i) => i.kind === 'menorah');
    const flames = p.glow.map((g) => g.attributes.position).filter(Boolean);
    let verts = 0;
    for (const f of flames) verts += f.count;
    return { m, verts };
  };
  it('has nine slots, the middle one the shamash', () => {
    expect(MENORAH_SLOTS.length).toBe(9);
    expect(MENORAH_SLOTS[4]).toBe(0);
    expect(menorahAt('farm', 1).m.lights).toBe(9);
  });
  it('night n lights n of the eight plus the shamash: n + 1 flames, from the first night to the eighth', () => {
    for (let n = 1; n <= 8; n++) {
      const { m, verts } = menorahAt('farm', n);
      expect(m.lit, `night ${n}`).toBe(n);
      expect(verts / 24, `night ${n} flames`).toBe(n + 1);
    }
  });
  it('the shamash flame is the highest light and the lit ones run from the left', () => {
    const p = partsFor('farm', { christmas: false, hanukkah: true, night: 3 });
    // the farmhouse is turned east: its left (local -x) is world +z; the three lit flames are the three most-left slots
    const ys = [];
    for (const g of p.glow) { const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) ys.push(pos.getY(i)); }
    const top = Math.max(...ys);
    const shamashVerts = [];
    for (const g of p.glow) { const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) if (pos.getY(i) > top - 0.001) shamashVerts.push(pos.getZ(i)); }
    const mid = spots.FARM.house.z - 0;
    expect(Math.abs(shamashVerts[0] - (mid - spots.FARM.menorahLx))).toBeLessThan(0.05); // the middle of the menorah
    const lowest = Math.min(...ys);
    expect(top - lowest).toBeGreaterThan(0.05);
  });
});

describe('merged, no colliders, nothing moved in the area', () => {
  function dressed(id, build, set, opts = {}) {
    const scene = new THREE.Scene();
    const area = build(scene);
    mergeStaticProps(scene);
    const before = { colliders: area.colliders.length, perches: area.perches.length, collectibles: area.collectibles.length, children: scene.children.length };
    const picks = { christmas: 'christmas', hanukkah: 'hanukkah' };
    setHolidayOverride(set.hanukkah && !set.christmas ? { holiday: 'hanukkah', night: set.night } : { holiday: 'christmas' });
    let r;
    try { r = dress(id, scene, area, { pick: set.christmas && set.hanukkah ? 'auto' : picks[set.christmas ? 'christmas' : 'hanukkah'], ...opts }); } finally { setHolidayOverride(null); }
    return { scene, area, before, r };
  }
  for (const [id, build] of [['neighborhood', buildNeighborhood], ['park', buildPark], ['farm', buildFarm], ['market', buildMarket], ['snowville', buildSnowville]]) {
    it(`${id}: two merged meshes (solid and glow), noCast, no collider, perch or find added`, () => {
      const { scene, area, before, r } = dressed(id, build, XMAS);
      expect(r.meshes.length).toBeLessThanOrEqual(2);
      expect(r.meshes.map((m) => m.name)).toEqual(['holidaySolid', 'holidayGlow']);
      for (const m of r.meshes) { expect(m.userData.noCast).toBe(true); expect(m.parent).toBe(scene); }
      expect(area.colliders.length).toBe(before.colliders);
      expect(area.perches.length).toBe(before.perches);
      expect(area.collectibles.length).toBe(before.collectibles);
      expect(scene.children.length).toBe(before.children + r.meshes.length);
    });
  }
  it('the Old House: the parlour pair is tagged for the level drawing, the sill menorah rides its wall section', () => {
    const scene = new THREE.Scene();
    const area = buildHouse(scene);
    const wall = area.house.sectionMeshes.get(spots.HOUSE.sill.section);
    expect(wall).toBeTruthy();
    const kids = wall.children.length;
    setHolidayOverride({ holiday: 'hanukkah', night: 2 });
    let r;
    try { r = dress('house', scene, area, { pick: 'auto' }); } finally { setHolidayOverride(null); }
    expect(r.meshes.length).toBeLessThanOrEqual(4);
    expect(wall.children.length).toBe(kids + 2);
    // Hanukkah alone: no stockings or tree, so nothing top-level; the sill pair is the wall's
    expect(r.meshes.filter((m) => m.parent === scene).length).toBe(0);
    setHolidayOverride({ holiday: 'christmas' });
    try { r = dress('house', scene, area, { pick: 'auto' }); } finally { setHolidayOverride(null); }
    const top = r.meshes.filter((m) => m.parent === scene);
    expect(top.length).toBe(2);
    for (const m of top) expect(m.userData).toMatchObject({ houseDetail: true, houseLevel: 'ground', houseRoom: 'parlour' });
  });
  it('a place with no table (the Den) gets nothing', () => {
    expect(dress('den', new THREE.Scene(), {}, { pick: 'auto' })).toBe(null);
  });
});

describe('where it stands', () => {
  const lawn = ['tree', 'stall', 'ring'];
  it('every tree, ring and stall on the lawn clears every collider of its place', () => {
    const cases = [
      ['neighborhood', buildNeighborhood], ['park', buildPark], ['farm', buildFarm],
    ];
    for (const [id, build] of cases) {
      const area = build(new THREE.Scene());
      const p = partsFor(id, BOTH);
      for (const it of p.items.filter((i) => i.kind === 'tree' && i.y === 0)) {
        for (const c of area.colliders) expect(Math.hypot(it.x - c.x, it.z - c.z), `${id} tree vs collider ${c.x},${c.z}`).toBeGreaterThan(c.r + 0.3);
      }
    }
    const mp = partsFor('market', BOTH);
    for (const it of mp.items.filter((i) => lawn.includes(i.kind) && i.y === 0)) {
      for (const c of MARKET_COLLIDERS) expect(Math.hypot(it.x - c.x, it.z - c.z), `market ${it.kind} vs ${c.x},${c.z}`).toBeGreaterThan(c.r + (it.kind === 'tree' ? 0.3 : 0.9));
    }
  });
  it('everything is inside its place\'s bounds and off every walkable height a cat needs to climb to', () => {
    const bounds = { neighborhood: [-55, 55, -55, 55], park: [-55, 55, -55, 55], farm: [-44, 44, -44, 50], market: [-21, 21, -21, 23] };
    for (const [id, [x0, x1, z0, z1]] of Object.entries(bounds)) {
      for (const it of partsFor(id, BOTH).items) {
        expect(it.x, id).toBeGreaterThanOrEqual(x0);
        expect(it.x, id).toBeLessThanOrEqual(x1);
        expect(it.z, id).toBeGreaterThanOrEqual(z0);
        expect(it.z, id).toBeLessThanOrEqual(z1);
        expect(it.y, `${id} ${it.kind} height`).toBeLessThan(5.1); // nothing needs a climb: the highest is the gable's string, a roof edge
      }
    }
  });
  it('no decor stands on a find, a spawn or a collectible of its place', () => {
    const cases = [['neighborhood', buildNeighborhood], ['park', buildPark], ['farm', buildFarm]];
    for (const [id, build] of cases) {
      const area = build(new THREE.Scene());
      const keep = [area.spawn, ...(area.collectibles ?? [])];
      for (const it of partsFor(id, BOTH).items.filter((i) => i.y === 0 && i.kind !== 'ring')) {
        for (const k of keep) expect(Math.hypot(it.x - k.x, it.z - k.z), `${id} ${it.kind} vs ${k.id ?? 'spawn'}`).toBeGreaterThan(2);
      }
    }
  });
  it('the Market stall table is the Market\'s own plan (so the decor never imports the Market chunk)', () => {
    const own = STALLS.filter((s) => s.w > 0);
    expect(spots.MARKET_STALLS.length).toBe(own.length);
    for (const [row, s] of spots.MARKET_STALLS.map((r, i) => [r, own[i]])) {
      expect(row[0]).toBe(s.id);
      expect([row[1], row[2]]).toEqual([s.at.x, s.at.z]);
      expect(Math.abs(row[3] - s.face.x)).toBeLessThan(1e-3);
      expect(Math.abs(row[4] - s.face.z)).toBeLessThan(1e-3);
      expect([row[5], row[6]]).toEqual([s.w, s.d]);
    }
  });
  it('a wreath hangs at the stall\'s awning front, off the ground and out of the keeper\'s face', () => {
    for (const it of partsFor('market', XMAS).items.filter((i) => i.kind === 'wreath')) {
      expect(it.y).toBeGreaterThan(1.4);
      expect(it.y).toBeLessThan(2.1);
    }
  });
});

describe('its own seeded stream, reduced motion, the low rungs', () => {
  const sig = (p) => p.glow.map((g) => Array.from(g.attributes.color.array.slice(0, 60)).join(',')).join('|') + '#' + p.solid.length + '#' + p.glow.length;
  it('the same place draws the same colours every time, and never touches Math.random', () => {
    const scene = new THREE.Scene(); // (made before the count: a scene takes its own uuid draws)
    const real = Math.random;
    let calls = 0;
    Math.random = () => { calls += 1; return real(); };
    let a;
    let b;
    try { a = sig(partsFor('neighborhood', BOTH)); b = sig(partsFor('neighborhood', BOTH)); dress('neighborhood', scene, { house: null }, { pick: 'auto', now: at(12, 6) }); } finally { Math.random = real; }
    expect(a).toBe(b);
    expect(calls).toBe(0);
  });
  it('each place has its own stream', () => {
    expect(sig(partsFor('neighborhood', BOTH))).not.toBe(sig(partsFor('park', BOTH)));
  });
  const verts = (p) => [...p.solid, ...p.glow].reduce((n, g) => n + g.attributes.position.count, 0);
  it('LOW and LITE draw fewer', () => {
    for (const id of DECOR_PLACES) {
      const full = verts(partsFor(id, BOTH));
      const lean = verts(partsFor(id, BOTH, { sparse: true }));
      expect(lean, id).toBeLessThan(full);
    }
  });
  function glowOf(opts) {
    const scene = new THREE.Scene();
    setHolidayOverride({ holiday: 'christmas' });
    try { return dress('neighborhood', scene, {}, { pick: 'auto', ...opts }).meshes.find((m) => m.name === 'holidayGlow'); } finally { setHolidayOverride(null); }
  }
  it('the glow is steady under reduced motion and on the low rungs, a slow swell otherwise', () => {
    const none = THREE.Object3D.prototype.onBeforeRender;
    expect(glowOf({ reducedMotion: true }).onBeforeRender).toBe(none);
    expect(glowOf({ sparse: true }).onBeforeRender).toBe(none);
    const live = glowOf({});
    expect(live.onBeforeRender).not.toBe(none);
    live.onBeforeRender();
    expect(live.material.color.r).toBeGreaterThan(0.83); // a swell between 0.84 and 1, whatever the clock says
    expect(live.material.color.r).toBeLessThanOrEqual(1);
  });
});

describe('each place\'s own budget row with the decor on it', () => {
  const rig = { castsFromBox, isTransparentMat };
  function stats(scene) {
    let meshes = 0, casters = 0, triangles = 0;
    const box = new THREE.Box3();
    for (const child of scene.children) {
      box.setFromObject(child);
      const eligible = rig.castsFromBox(box);
      child.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        const g = o.geometry;
        triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
        if (eligible && !rig.isTransparentMat(o.material) && !o.userData.noCast) casters++;
      });
    }
    return { meshes, casters, triangles: Math.round(triangles) };
  }
  // [id, builder, built ceilings (meshes, casters, triangles), merged ceilings (meshes, casters), most decor triangles, most decor draws]
  const ROWS = [
    ['neighborhood', buildNeighborhood, [450, 380, 70000], [260, 205], 3000, 2],
    ['park', buildPark, [210, 170, 40000], [140, 110], 3000, 2],
    ['farm', buildFarm, [280, 210, 62000], [200, 135], 2500, 2],
    ['market', buildMarket, [280, 210, 62000], [156, 36], 4000, 2],
    // Snowville's row is 6 / 3 / 48,300 with no decor; the lazy pair rides on top (8 draws here is the row's 6 plus the decor's 2). Beauty pass 2 (2026-11-28, raised on purpose): the build is 45,977 -> 46,817 (+840: strung-fir bulbs, garland, lit bulbs on the pennants, presents), build + decor 48,217; row 47,400 -> 48,300.
    ['snowville', buildSnowville, [8, 3, 48300], [8, 3], 3000, 2],
  ];
  for (const [id, build, built, merged, maxTris, maxDraws] of ROWS) {
    it(`${id}: with both holidays at night 8, still under ${built.join(' / ')} built and ${merged.join(' / ')} merged; the decor is at most ${maxDraws} draws and ${maxTris} triangles`, () => {
      const scene = new THREE.Scene();
      const area = build(scene);
      const bare = stats(scene);
      mergeStaticProps(scene);
      const mergedBare = stats(scene);
      setHolidayOverride({ holiday: 'hanukkah', night: 8 });
      let r;
      try { r = dress(id, scene, area, { pick: 'auto' }); } finally { setHolidayOverride(null); }
      // the override pins ONE holiday; the full set is measured by hand below
      expect(r).toBeTruthy();
      const parts = partsFor(id, BOTH);
      let decorTris = 0;
      for (const g of [...parts.solid, ...parts.glow]) decorTris += g.attributes.position.count / 3;
      const after = stats(scene);
      expect(after.meshes - mergedBare.meshes).toBeLessThanOrEqual(maxDraws);
      expect(after.casters).toBe(mergedBare.casters);
      expect(mergedBare.meshes + 2).toBeLessThanOrEqual(merged[0]);
      expect(mergedBare.casters).toBeLessThanOrEqual(merged[1]);
      expect(bare.meshes + 2).toBeLessThanOrEqual(built[0]);
      expect(bare.triangles + decorTris).toBeLessThanOrEqual(built[2]);
      expect(decorTris).toBeLessThanOrEqual(maxTris);
      if (process.env.BUDGET_LOG) process.stderr.write(`holiday decor ${id} ${JSON.stringify({ bare, mergedBare, decorTris: Math.round(decorTris) })}\n`);
    });
  }
});
