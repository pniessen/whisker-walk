// The Treehouse village, milestone T1: the tree world. The plan (reach with no skills, hop limits, camera spike), the build (one light, flat ground, no `ceil`, seeded),
// the entry (catalog row, region, map place, the Farm's north signpost), the zoom cap, the light's tiers and the two stage slots.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { bannedIn } from './helpers/offwords.js';

stubCanvasDocument();

const P = await import('../src/world/treehouseplan.js');
const { build } = await import('../src/world/treehouse.js');
const { createTreehouseLight, isLowTier } = await import('../src/world/treehouselight.js');
const { ST, loadTreehouseStages, TREEHOUSE_STAGE_MODULES } = await import('../src/world/treehousestages.js');
const { CATALOG, JOURNAL_TYPES } = await import('../src/progression.js');
const { regionOf } = await import('../src/regions.js');
const { treehouseOn, setTreehouse } = await import('../src/treehouseflag.js');
const { areaShown } = await import('../src/edition.js');
const { endById, endsFor, liveEndsFor, arrivalFor, GATE_REACH } = await import('../src/gateways.js');
const { maxZoomStep, ZOOM_CAPPED_AREAS, ZOOM_STEPS } = await import('../src/camzoom.js');
const { AREA_LOADERS, AREA_ENTRY_MODULES } = await import('../src/world/areas.js');
const { BASE_CLIMB_BUDGET, canReach } = await import('../src/climbing.js');
const { isWalkableAt } = await import('../src/player.js');
const { groundOf, FLAT_GROUND } = await import('../src/ground.js');
const { TELE_ENDS } = await import('../src/teleport.js');
const { GOLD_MICE } = await import('../src/goldmice.js');

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const FILES = ['src/world/treehouseplan.js', 'src/world/treehouseparts.js', 'src/world/treehouselight.js', 'src/world/treehouse.js', 'src/world/treehousestages.js', 'src/world/treehousestagebranches.js', 'src/world/treehousestagelift.js', 'src/treehouseflag.js'];

describe('the plan: the climb', () => {
  const area = build(new THREE.Scene());
  const flood = P.groundFlood(area.colliders, area.bounds, area.spawn);

  it('the spawn is on open ground and the flood from it covers the roots', () => {
    expect(isWalkableAt(area, area.spawn.x, area.spawn.z)).toBe(true);
    expect(flood.length).toBeGreaterThan(2000);
  });

  it('an ordinary cat (no skills) reaches every deck, bridge and landing, and every hop is within the plan', () => {
    const r = P.reachReport({ ground: flood });
    expect(r.missing).toEqual([]);
    expect(r.reached).toHaveLength(P.TREEHOUSE_PERCHES.length);
    expect(r.maxHop).toBeLessThanOrEqual(P.HOP_MAX + 1e-9);
    expect(r.maxSpan).toBeLessThanOrEqual(P.HOP_SPAN + 1e-9);
    // the baseline allows more than the plan uses, so a tuned number never makes a hop impossible
    expect(P.HOP_MAX).toBeLessThan(BASE_CLIMB_BUDGET.climb);
    expect(P.HOP_SPAN).toBeLessThan(BASE_CLIMB_BUDGET.reachHigh);
  });

  it('"down" is always a hop to the deck below: every perch steps down, without climbing, to the lowest deck', () => {
    expect(P.reachReport({ ground: flood }).down).toEqual([]);
  });

  it('every deck has a perch on it and every named anchor is a perch or open ground', () => {
    for (const k of P.DECKS) {
      const on = P.TREEHOUSE_PERCHES.filter((p) => Math.abs(p.x - k.x) <= k.w / 2 && Math.abs(p.z - k.z) <= k.d / 2 && Math.abs(p.y - k.y) < 1e-9);
      expect(on.length, k.id).toBeGreaterThanOrEqual(1);
    }
    for (const [id, a] of Object.entries(P.ANCHORS)) {
      if (a.y > 0) expect(P.TREEHOUSE_PERCHES.some((p) => p.x === a.x && p.z === a.z && p.y === a.y), id).toBe(true);
      else expect(isWalkableAt(area, a.x, a.z), id).toBe(true);
    }
    const r = P.reachReport({ ground: flood });
    for (const a of Object.values(P.ANCHORS).filter((v) => v.y > 0)) {
      const p = P.TREEHOUSE_PERCHES.find((q) => q.x === a.x && q.z === a.z);
      expect(r.hops[p.id], p.id).toBeGreaterThan(0);
    }
  });

  it('the levels climb in steps of 1.4 and the crown is the highest', () => {
    expect(P.LEVELS.slice(1).map((y, i) => +(y - P.LEVELS[i]).toFixed(9))).toEqual([1.4, 1.4, 1.4, 1.4]);
    expect(Math.max(...P.TREEHOUSE_PERCHES.map((p) => p.y))).toBe(5.6);
    for (const p of P.TREEHOUSE_PERCHES) expect(P.LEVELS, p.id).toContain(p.y);
    // each perch is a roof-kind (smooth: no claw lift), and nothing is gated behind a skill
    for (const p of area.perches) { expect(p.kind).toBe('roof'); expect(p.requires).toBeUndefined(); }
  });

  it('a skill never makes it worse, and a hop only the no-skills budget could not do does not exist', () => {
    // the highest single gain in the whole plan is the baseline's 1.6 less 0.2
    for (const p of P.TREEHOUSE_PERCHES) for (const q of P.TREEHOUSE_PERCHES) {
      if (p === q) continue;
      if (canReach(q, p, p.y, BASE_CLIMB_BUDGET)) expect(q.y - p.y).toBeLessThanOrEqual(BASE_CLIMB_BUDGET.climb);
    }
  });

  it('the colliders are circles inside the bounds (the oak, each deck\'s stilts, the friend trees) and no perch stands inside one at ground level', () => {
    expect(area.colliders[0]).toMatchObject({ x: 0, z: -6, r: 3 });
    for (const c of area.colliders) {
      expect(c.x).toBeGreaterThan(P.TREEHOUSE_BOUNDS.minX); expect(c.x).toBeLessThan(P.TREEHOUSE_BOUNDS.maxX);
      expect(c.z).toBeGreaterThan(P.TREEHOUSE_BOUNDS.minZ); expect(c.z).toBeLessThan(P.TREEHOUSE_BOUNDS.maxZ);
    }
    expect(area.colliders).toHaveLength(1 + P.DECKS.length * 4 + P.FRIEND_TREES.length);
    for (const poi of area.pois) expect(isWalkableAt(area, poi.x, poi.z)).toBe(true);
    expect(area.pois.length).toBeGreaterThanOrEqual(10);
  });
});

describe('the camera spike (plan 2.6)', () => {
  it('at zoom steps 0 to 2 the camera stays under the leaves, and step 3 would not', () => {
    const rows = P.cameraSpike(3);
    for (const r of rows.filter((x) => x.step <= 2)) expect(r.clear, `step ${r.step}`).toBeGreaterThan(0);
    expect(rows[3].clear).toBeLessThan(0);
    expect(rows[2].cameraY).toBeCloseTo(5.6 + ZOOM_STEPS[2].height, 9);
  });
  it('the camera never stands inside a deck\'s slab, at any step up to 2', () => {
    for (const r of P.cameraSpike(2)) expect(r.inside, `step ${r.step}`).toBe(0);
  });
  it('the leaf canopy is above CANOPY_MIN_Y everywhere, and the rim trees are outside the walk', () => {
    for (const c of P.scatterCanopy()) {
      expect(c.y - c.s * 0.55, `${c.x},${c.z}`).toBeGreaterThanOrEqual(P.CANOPY_MIN_Y);
      expect(c.y + c.s * 0.55).toBeLessThanOrEqual(P.CANOPY_MAX_Y + 6);
    }
    const B = P.TREEHOUSE_BOUNDS;
    for (const t of P.scatterRim()) expect(t.x < B.minX || t.x > B.maxX || t.z < B.minZ || t.z > B.maxZ, `${t.x},${t.z}`).toBe(true);
  });
  it('zoom stops at step 2 here, the way the cave does, and nothing else changes', () => {
    expect(maxZoomStep('treehouse')).toBe(2);
    expect(ZOOM_CAPPED_AREAS).toEqual({ den: 1, crystal: 2, treehouse: 2 });
    expect(maxZoomStep('farm')).toBe(3);
  });
  it('the walk has no ceiling: the record has no ground (the walk\'s flat ground), so no `ceil` ever pulls the camera in', () => {
    const area = build(new THREE.Scene());
    expect(Object.hasOwn(area, 'ground')).toBe(false);
    expect(groundOf(area)).toBe(FLAT_GROUND);
    expect(groundOf(area).ceil(0, 0)).toBe(Infinity);
    expect(P.TREEHOUSE_GROUND).toBeNull();
  });
});

describe('the build', () => {
  it('is the same every time (seeded streams, no clock): two builds give identical meshes and records', () => {
    const sig = (scene) => scene.children.map((o) => [o.name, o.type, o.geometry?.attributes?.position?.count ?? 0].join(':')).join('|');
    const a = new THREE.Scene(); const b = new THREE.Scene();
    const ra = build(a); const rb = build(b);
    expect(sig(a)).toBe(sig(b));
    expect(JSON.stringify([ra.colliders, ra.perches, ra.pois, ra.scenics])).toBe(JSON.stringify([rb.colliders, rb.perches, rb.pois, rb.scenics]));
  });
  it('makes ONE PointLight, at intensity 0, a few merged meshes, no water and (before the branches stage is in) no collectible', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const lights = []; scene.traverse((o) => { if (o.isLight) lights.push(o); });
    expect(lights).toHaveLength(1);
    expect(lights[0].isPointLight).toBe(true);
    expect(lights[0].intensity).toBe(0);
    expect(scene.children.filter((o) => o.isMesh).length).toBeLessThanOrEqual(8);
    expect(area).toMatchObject({ name: 'Treehouse Village', waters: [], collectibles: [], tippables: [], boxes: [], critterSpawns: [], moments: [], strays: false });
    expect(area.goalTypes.length).toBeGreaterThanOrEqual(3);
    expect(area.evening).toBeUndefined();
    expect(area.bounds).toEqual({ minX: -32, maxX: 32, minZ: -32, maxZ: 32 });
    expect(area.spawn).toEqual({ x: 0, z: 25 });
  });
  it('the leaves cast no shadow, the lanterns glow in their own mesh, and every mesh is merged by material', () => {
    const scene = new THREE.Scene();
    build(scene);
    const by = (n) => scene.getObjectByName(n);
    expect(by('treehouse:leaves').castShadow).toBe(false);
    expect(by('treehouse:glow').castShadow).toBe(false);
    expect(by('treehouse:paint').castShadow).toBe(true);
    expect(by('treehouse:glow').material.isMeshBasicMaterial).toBe(true);
  });
  it('draws no random number and reads no clock, and no file names a series word or a banned word', () => {
    for (const f of FILES) {
      const src = read(f).replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, ''); // (the code, not its comments)
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date\(/);
      expect(src, f).not.toMatch(/\bClan\b/);
      const strings = [...src.matchAll(/'([^'\n]{4,})'/g)].map((m) => m[1]).filter((t) => /\s/.test(t) && !/^(src|\.\.?\/)/.test(t));
      for (const t of strings) expect(bannedIn(t), `${f}: ${t}`).toBeNull();
    }
    const scenic = P.TREEHOUSE_SCENICS.map((s) => s.label).join(' ');
    expect(bannedIn(scenic)).toBeNull();
  });
});

describe('the light', () => {
  const lowTier = { name: 'low', shadows: false };
  it('a full tier gets the dapple; a low or lite tier gets none; the rain is kept off either way', () => {
    for (const [tier, dapple] of [[null, true], [{ name: 'high', rung: 0 }, true], [lowTier, false], [{ name: 'lite' }, false], [{ rung: 3 }, false]]) {
      const scene = new THREE.Scene(); build(scene);
      let sheltered = null;
      const l = createTreehouseLight({ scene, tier, weather: { setSheltered: (v) => { sheltered = v; } } });
      expect(!!l.dapple, JSON.stringify(tier)).toBe(dapple);
      expect(sheltered).toBe(true);
      l.dispose();
      expect(sheltered).toBe(false);
    }
    expect(isLowTier(lowTier)).toBe(true);
  });
  it('the dapple drifts, and reduced motion freezes it where it is drawn', () => {
    const moving = (reducedMotion) => {
      const scene = new THREE.Scene(); build(scene);
      const l = createTreehouseLight({ scene, tier: null, reducedMotion });
      const o0 = l.dapple.material.map.offset.clone();
      l.update(0.1, 50);
      const o1 = l.dapple.material.map.offset.clone();
      l.dispose();
      return o0.distanceTo(o1);
    };
    expect(moving(false)).toBeGreaterThan(0);
    expect(moving(true)).toBe(0);
  });
  it('the one real light moves to a lit house on request and never becomes a second', () => {
    const scene = new THREE.Scene(); build(scene);
    const l = createTreehouseLight({ scene });
    l.setGlow(1, 2, 3, 0.8);
    const lights = []; scene.traverse((o) => { if (o.isLight) lights.push(o); });
    expect(lights).toHaveLength(1);
    expect(lights[0].position.toArray()).toEqual([1, 2, 3]);
    expect(lights[0].intensity).toBe(0.8);
    l.dispose();
    expect(lights[0].intensity).toBe(0);
  });
});

describe('the way in: a catalog row after the Farm, a region, a map place, the Farm\'s north signpost', () => {
  afterEach(() => setTreehouse(null));
  it('is an ordinary free place opened by two Farm walks, in both editions, behind its own switch', () => {
    expect(CATALOG.areas.treehouse).toEqual({ name: 'Treehouse Village', price: 0, requires: { area: 'farm', walks: 2 }, flag: 'treehouse' });
    expect(CATALOG.areas.treehouse.edition).toBeUndefined();
    expect(CATALOG.areas.treehouse.gate).toBeUndefined();
    expect(treehouseOn()).toBe(false);
    for (const edition of ['canon', 'legacy']) {
      expect(areaShown(CATALOG.areas.treehouse, edition)).toBe(false);
      setTreehouse(true);
      expect(areaShown(CATALOG.areas.treehouse, edition)).toBe(true);
      setTreehouse(null);
    }
  });
  it('is in the Suburban and rural region and in no teleport pair', () => {
    expect(regionOf('treehouse')).toBe('suburban');
    expect(Object.keys(TELE_ENDS)).not.toContain('treehouse');
    expect(JSON.stringify(TELE_ENDS)).not.toMatch(/treehouse/);
  });
  it('has a loader and its own chunk, and the two stage modules are listed', () => {
    expect(typeof AREA_LOADERS.treehouse).toBe('function');
    expect(AREA_ENTRY_MODULES.treehouse).toEqual(['src/world/treehouse.js']);
    expect(TREEHOUSE_STAGE_MODULES).toEqual(['src/world/treehousestagebranches.js', 'src/world/treehousestagelift.js']);
  });
  it('the Farm\'s north signpost and the village\'s own are twins, live only while the switch is on', () => {
    const out = endById('farm-treehouse');
    const back = endById('treehouse-farm');
    expect(out.areaId).toBe('farm'); expect(back.areaId).toBe('treehouse');
    expect(out.end).toMatchObject({ faces: 'north', to: 'treehouse', twin: 'treehouse-farm', look: 'signpost', sign: true, placement: 'edge' });
    expect(back.end).toMatchObject({ faces: 'south', to: 'farm', twin: 'farm-treehouse', look: 'signpost', placement: 'edge' });
    expect(endsFor('farm').map((e) => e.id)).toEqual(['farm-park', 'farm-treehouse']);
    expect(liveEndsFor('farm', CATALOG).map((e) => e.id)).toEqual(['farm-park']);
    expect(liveEndsFor('treehouse', CATALOG).map((e) => e.id)).toEqual(['treehouse-farm']); // (the way back is always there: the Farm is always on the map)
    setTreehouse(true);
    expect(liveEndsFor('farm', CATALOG).map((e) => e.id)).toEqual(['farm-park', 'farm-treehouse']);
  });
  it('she lands 3.6 m inside the village\'s signpost, facing in, on open ground beside the spawn; and 3.6 m inside the Farm\'s', () => {
    const area = build(new THREE.Scene());
    const a = arrivalFor('farm-treehouse');
    expect(a).toMatchObject({ areaId: 'treehouse', x: 0, yaw: 0 });
    expect(a.z).toBeCloseTo(25.9, 9);
    expect(isWalkableAt(area, a.x, a.z)).toBe(true);
    expect(Math.hypot(a.x - area.spawn.x, a.z - area.spawn.z)).toBeLessThan(GATE_REACH);
    expect(arrivalFor('treehouse-farm')).toMatchObject({ areaId: 'farm', x: 30 });
  });
  it('the journal ids stay the 17 N0 placeholders (T3 only made six of them live, test/treehousefinds.test.js) and the three golden mice are the finds\' (milestone T3)', () => {
    expect(GOLD_MICE.treehouse.map((m) => m.id)).toEqual(['gm-treehouse-1', 'gm-treehouse-2', 'gm-treehouse-3']);
    expect(JOURNAL_TYPES.filter((t) => /^(th|tl)\d/.test(t))).toHaveLength(17);
  });
});

describe('the two stage slots', () => {
  it('load together, once, and fill ST.branches (the finds, T3; the bridge and supper come with T5) and ST.lift (empty, valid)', async () => {
    const a = loadTreehouseStages();
    expect(loadTreehouseStages()).toBe(a);
    expect(await a).toBe(ST);
    expect(Object.keys(ST.branches)).toEqual(['finds']);
    expect(ST.lift).toEqual({});
    const area = build(new THREE.Scene());
    expect(area.perches).toHaveLength(P.TREEHOUSE_PERCHES.length);
  });
});
