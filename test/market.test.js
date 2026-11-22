import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (test/roofs.test.js):
// the ground's and the lamp posts' tiles paint on a canvas.
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

const marketModule = await import('../src/world/market.js');
const marketParts = await import('../src/world/marketparts.js');
const { build, setMarketDusk, MARKET_COBBLE } = marketModule;
const { createMarketLife } = await import('../src/world/marketlife.js');
const { buildAppleCrate } = await import('../src/world/marketfruit.js');
const {
  MARKET_BOUNDS, MARKET_SPAWN, MARKET_COLLIDERS, MARKET_KEEPOUT, MARKET_POIS, MARKET_COLLECTIBLES, STALLS, TREAT_STALLS, CAFE,
  stallById, toStall, MARKET_LAMPS, FRUIT_CRATE, MARKET_PERCHES, stallClimb, RIM_PERCHES, MARKET_REGISTRATION,
  PIGEON_PATCH,
} = await import('../src/world/marketplan.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { spotsIn } = await import('../src/foundwear/spots/index.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { findFadeOccluders } = await import('../src/treefade.js');
const { keepOutPoint } = await import('../src/keepout.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const MARKET_HIDES_COUNT = (await import('../src/world/marketplan.js')).MARKET_HIDES.length;

// =============================================================================
// The Market Square drawn (step 1, Task 3): the square, day and dusk, inside
// the Farm's ceilings. Every position is the plan's (marketplan.js).
// =============================================================================

const scene = new THREE.Scene();
const area = build(scene);
scene.updateMatrixWorld(true);

const meshes = [];
scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
const boxOf = (o) => new THREE.Box3().setFromObject(o, true);
const yawOf = (o) => new THREE.Euler().setFromQuaternion(o.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
const angleGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
// the height of the first drawn thing straight down from 0.3 m over (x, y, z), or null
const shownAll = (o) => { for (let q = o; q; q = q.parent) if (q.visible === false) return false; return true; };
function drawnUnder(x, y, z) {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, y + 0.3, z), new THREE.Vector3(0, -1, 0), 0, 1.3);
  const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.isMesh && shownAll(h.object));
  return hit ? hit.point.y : null;
}
const clearOf = (x, z, colliders) => Math.min(...colliders.map((c) => Math.hypot(x - c.x, z - c.z) - c.r));

// Measured 2026-11-21 (Task 3), as test/budget.test.js counts it: the six
// stalls 26 meshes (paint, awning, atlas, metal, cloth; 12 casters), the
// fountain 9 (5 casters: its stone, merged at walk time, and its mast), four
// lamp posts 8 (8 casters), the five treats 17, the café 5 (its front's awning
// casts), one mesh a side for the shop
// fronts (4 casters), the lit windows, the lanterns, the bunting, the baskets 2, the packing-up
// 2, the cobbles, the flagstones and the far town (6,346 triangles of the
// 27,113). The build runs inside withLocalUuids: no Math.random draw.
// Fix round (2026-11-21): +1 mesh, the dusk-lit windows (noCast); the crates,
// sacks, barrels and handcarts in buckets the square had: +5,892 triangles.
// Task 6 (2026-11-21): the shop fronts cast nothing (market.js WHAT CASTS):
// -4 casters, built and merged.
// Task 6's rework (controller's ruling, 2026-11-21): the square drawn in to 42 x 44
// m, the clutter (15 things, each its own child: +27 meshes, the noticeboard
// the one caster), the milk cart on spoked wheels, finer cobbles: +3,292 triangles
// (106 / 27 / 36,297; merged 103 / 24). The review's follow-up: five more things
// in the open middle (20 in all); all but the noticeboard drawn into one kit, two
// meshes for them all, casting nothing, each with an invisible box for its
// contact shadow (19 meshes that draw nothing, 228 triangles never drawn); the
// noticeboard, the one caster, its own child; the bicycle inside the bounds.
// Step 3, Task 1 (2026-11-21): the fruit stall's hide trestle (a trestle, its cloth
// and two baskets of apples): +1 mesh, +124 triangles; the lamps only moved.
// Step 3, Task 2 (2026-11-21): the apples' crate is a tippable (made by the walk, not
// the build), so the fruit stall's mesh loses its box and its apples' quad: -14 triangles.
// Step 3, Task 3 (2026-11-21): the six climbing stacks (three crates each, drawn into the
// clutter's kit, casting nothing) and each one's invisible contact-shadow box: +6 meshes
// that draw nothing, +288 triangles (216 drawn).
// Step 3, Task 6 (2026-11-21): the bicycle is its own child (two meshes, never merged,
// casting nothing) so the life can rock it, and needs no invisible box: +1 mesh,
// -12 triangles (the box's, never drawn).
// Step 3, Task 8 (2026-11-21, V11): the café's painted front (+1 mesh, its paint, casting
// nothing; its awning, valance, sign, windows, boards and door +370 triangles, its panes
// in the lit windows' mesh +6), its A-frame chalkboard in the clutter's kit (+50) with its
// invisible contact-shadow box (+1 mesh, 12 triangles never drawn), the seven flower tubs'
// stems and blooms (a lighter clump of leaves, -60 in all, and 5-7 flowers a tub, +628):
// +2 meshes, no caster, +1,006 triangles; merged 108 / 24.
// Step 3, Task 9 (2026-11-21, picture pass): the baker's two low flour sacks where the nap is
// (the nap had nothing drawn at its spot), in the stall's own kit: +160 triangles.
// 2026-11-22 (the four new stalls, toys / plants / bric / butcher): +30 meshes, +8 casters, +7,339 triangles (was 111 / 27 / 39,495; merged 108 / 24)
const MEASURED_BUILT = { meshes: 141, casters: 35, triangles: 46834 };
const MEASURED_MERGED = { meshes: 138, casters: 32, triangles: 46834 };
const MEASURED_DRAWS = 0;

function budgetStats(s) {
  let n = 0;
  let casters = 0;
  let triangles = 0;
  const box = new THREE.Box3();
  for (const child of s.children) {
    box.setFromObject(child);
    const eligible = castsFromBox(box);
    child.traverse((obj) => {
      if (!obj.isMesh) return;
      n++;
      const geo = obj.geometry;
      triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      if (eligible && !isTransparentMat(obj.material) && !obj.userData.noCast) casters++;
    });
  }
  return { meshes: n, casters, triangles: Math.round(triangles) };
}

const DRAWN_STALLS = STALLS.filter((s) => s.w > 0);

describe('the Market Square drawn', () => {
  it('the record has every key an area has', () => {
    const keys = [
      'name', 'colliders', 'bounds', 'spawn', 'boxes', 'waters', 'waterFx', 'pois', 'collectibles', 'scenics',
      'critterSpawns', 'moments', 'puddles', 'groundBounce', 'skyDusk', 'tippables', 'perches',
      'keepOut', 'treatMeshes', 'keepers', 'anchors', 'life',
    ];
    for (const k of keys) expect(area, k).toHaveProperty(k);
    expect(area.name).toBe('The Market Square');
    // U5: strays are allowed, kept off the counters by the plan's keepOut
    expect(area).not.toHaveProperty('strays');
    expect(area.keepOut).toBe(MARKET_KEEPOUT);
    expect(area.waters).toEqual([]);
    expect(area.waterFx).toEqual([]);
    expect(area.moments).toEqual([]);
    expect(area.perches).toEqual(MARKET_PERCHES);
    // the walk's own copy (walk.js pushes into areaData.perches on some places), as roofs.js gives
    expect(area.perches).not.toBe(MARKET_PERCHES);
    expect(Object.isFrozen(area.perches)).toBe(false);
    area.perches.forEach((p, i) => expect(p, `perch ${i}`).not.toBe(MARKET_PERCHES[i]));
    for (const k of ['boxes', 'pois', 'collectibles', 'scenics', 'puddles', 'tippables', 'perches', 'colliders', 'critterSpawns']) {
      expect(Array.isArray(area[k]), k).toBe(true);
    }
    expect(area.bounds).toEqual({ ...MARKET_BOUNDS });
    expect(area.spawn).toEqual({ ...MARKET_SPAWN });
    expect(area.pois).toEqual(MARKET_POIS.map((p) => ({ ...p })));
    expect(area.collectibles).toEqual(MARKET_COLLECTIBLES.map((c) => ({ ...c })));
    expect(area.skyDusk).toEqual({ top: 0x2a3358, horizon: 0xa86e62 });
    expect(area.groundBounce).toBe(MARKET_COBBLE);
    expect(typeof area.life).toBe('function');
    // two birds and (step 3) five pigeons, on open cobbles out of every counter's zone
    expect(area.critterSpawns.map((c) => c.type)).toEqual(['bird', 'bird', 'bird', 'bird', 'bird', 'bird', 'bird']);
    expect(area.critterSpawns.map((c) => c.labelAs ?? null)).toEqual([null, null, 'pigeon', 'pigeon', 'pigeon', 'pigeon', 'pigeon']);
    for (const c of area.critterSpawns) {
      expect(clearOf(c.x, c.z, area.colliders), `${c.x},${c.z}`).toBeGreaterThan(1);
      expect(keepOutPoint(area, c.x, c.z)).toEqual({ x: c.x, z: c.z });
    }
    // the pigeons peck inside their patch, 1.5 m and more from every golden
    // mouse and found-outfit spot, 1 m apart from none of each other
    const pigeons = area.critterSpawns.filter((c) => c.labelAs === 'pigeon');
    for (const c of pigeons) {
      expect(Math.hypot(c.x - PIGEON_PATCH.x, c.z - PIGEON_PATCH.z), `${c.x},${c.z}`).toBeLessThanOrEqual(PIGEON_PATCH.r - 0.3);
      for (const q of [...GOLD_MICE.market, ...spotsIn('market')]) {
        expect(Math.hypot(c.x - q.x, c.z - q.z), `${c.x},${c.z} by ${q.id}`).toBeGreaterThanOrEqual(1.5);
      }
    }
    expect(new Set(pigeons.map((c) => `${c.x},${c.z}`)).size).toBe(5);
    // every scenic is a spot she can stand on
    for (const s of area.scenics) expect(isWalkableAt(area, s.x, s.z), s.id).toBe(true);
  });

  it('each stall is drawn at its plan spot, facing its way', () => {
    const groups = [];
    scene.traverse((o) => { if (o.userData.stall) groups.push(o); });
    expect(groups.map((g) => g.userData.stall).sort()).toEqual(DRAWN_STALLS.map((s) => s.id).sort());
    for (const g of groups) {
      const s = stallById(g.userData.stall);
      const p = g.getWorldPosition(new THREE.Vector3());
      expect(Math.hypot(p.x - s.at.x, p.z - s.at.z), s.id).toBeLessThan(0.05);
      expect(angleGap(yawOf(g), Math.atan2(s.face.x, s.face.z)), s.id).toBeLessThan(0.02);
      // the drawn counter is the plan's: the stall's meshes reach the counter's
      // four corners and stay within half a metre of them, the awning's overhang aside
      const b = new THREE.Box3();
      g.traverse((o) => {
        if (!o.isMesh || o.userData.awning || o.userData.bunting) return;
        o.geometry.computeBoundingBox();
        b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrix)); // the kit's meshes are the group's own children
      });
      // local frame of the group: x is across the counter (three's, mirrored from the plan's), z along its face
      expect(b.max.x - b.min.x, s.id).toBeGreaterThanOrEqual(s.w - 0.01);
      expect(b.max.z - b.min.z, s.id).toBeGreaterThanOrEqual(s.d - 0.01);
      // (the butcher's rail crates stand 1 m in front of the counter, under the sausage string)
      expect(b.max.z, s.id).toBeLessThan(s.d / 2 + (s.id === 'butcher' ? 1.6 : 0.7));
      expect(b.min.z, s.id).toBeGreaterThan(-s.d / 2 - 0.5);
    }
  });

  it("the colliders are the plan's: each treat's stand, the apples' crate and the lamp posts are solid", () => {
    expect(area.colliders).toEqual(MARKET_COLLIDERS);
    for (const id of TREAT_STALLS) {
      const t = stallById(id).treat;
      const c = area.colliders.find((q) => Math.hypot(q.x - t.x, q.z - t.z) < 0.05);
      expect(c, id).toBeTruthy();
      // a cat's centre still comes within reach of the treat (TREAT_REACH 0.8)
      expect(c.r + CAT_RADIUS, id).toBeLessThan(0.8);
    }
    const crate = area.colliders.find((q) => Math.hypot(q.x - area.anchors.apples.x, q.z - area.anchors.apples.z) < 0.05);
    expect(crate).toBeTruthy();
    for (const f of findFadeOccluders(scene)) {
      const c = area.colliders.find((q) => Math.hypot(q.x - f.x, q.z - f.z) < 0.05);
      expect(c?.r).toBeLessThanOrEqual(0.15);
    }
  });

  it('every treat is drawn at its spot and casts nothing', () => {
    const ids = [...TREAT_STALLS, 'cafe'];
    expect(Object.keys(area.treatMeshes).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const t = stallById(id).treat;
      const m = area.treatMeshes[id];
      expect(m.isObject3D, id).toBe(true);
      expect(m.parent, id).toBe(scene); // its own top-level child: never merged, so step 2 can hide it
      expect(m.userData.noMerge, id).toBe(true);
      const p = m.getWorldPosition(new THREE.Vector3());
      expect(Math.hypot(p.x - t.x, p.z - t.z), id).toBeLessThan(0.01);
      expect(Math.abs(p.y - t.y), id).toBeLessThan(0.01);
      m.traverse((o) => {
        if (!o.isMesh) return;
        expect(o.castShadow, id).toBe(false);
        expect(o.userData.noCast, id).toBe(true);
      });
      // small: under 0.25 m
      const b = boxOf(m);
      expect(Math.max(b.max.x - b.min.x, b.max.z - b.min.z), id).toBeLessThan(0.25);
    }
    // the café's crumbs lie on the cobbles under table 0, clear of its foot
    const crumbs = area.treatMeshes.cafe.getWorldPosition(new THREE.Vector3());
    expect([crumbs.x, crumbs.z]).toEqual([CAFE.crumbs.x, CAFE.crumbs.z]);
    const tables = [];
    scene.traverse((o) => { if (o.userData.cafeTable !== undefined) tables.push(o); });
    expect(tables).toHaveLength(CAFE.tables.length);
    const t0 = tables.find((t) => t.userData.cafeTable === 0).getWorldPosition(new THREE.Vector3());
    const off = Math.hypot(t0.x - crumbs.x, t0.z - crumbs.z);
    expect(off).toBeGreaterThan(0.2 + 0.1); // past the foot (r 0.2) and the crumbs' spread
    expect(off).toBeLessThan(0.4 - 0.05); // still under the top (r 0.4)
    for (const t of tables) {
      const p = t.getWorldPosition(new THREE.Vector3());
      const plan = CAFE.tables[t.userData.cafeTable];
      expect(Math.hypot(p.x - plan.x, p.z - plan.z)).toBeLessThan(0.05);
    }
  });

  it('the keepers stand where the plan puts them, facing front', () => {
    const withKeeper = STALLS.filter((s) => s.keeper);
    expect(withKeeper).toHaveLength(10);
    expect(Object.keys(area.keepers).sort()).toEqual(withKeeper.map((s) => s.id).sort());
    for (const s of withKeeper) {
      const k = area.keepers[s.id];
      expect(k.x).toBeCloseTo(s.keeper.x, 9);
      expect(k.z).toBeCloseTo(s.keeper.z, 9);
      expect(angleGap(k.yaw, Math.atan2(s.face.x, s.face.z))).toBeLessThan(1e-9);
    }
  });

  it('the anchors for step 3 are free spots in the square', () => {
    expect(Object.keys(area.anchors).sort()).toEqual(['apples', 'basket', 'bench', 'flourSacks']);
    for (const [k, a] of Object.entries(area.anchors)) {
      expect(Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(a.y), k).toBe(true);
      expect(a.x > MARKET_BOUNDS.minX && a.x < MARKET_BOUNDS.maxX && a.z > MARKET_BOUNDS.minZ && a.z < MARKET_BOUNDS.maxZ, k).toBe(true);
      // the apples are on their crate, which is solid; the rest are free spots
      if (k !== 'apples') expect(clearOf(a.x, a.z, area.colliders), k).toBeGreaterThan(0.3);
      expect(a.y, k).toBeGreaterThan(0.2);
      expect(a.y, k).toBeLessThan(1.2);
    }
    // the basket is the drawn bicycle's: inside its box, near its front, at basket height
    const bike = scene.getObjectByName('marketClutter:bicycle');
    const bb = boxOf(bike);
    const bk = area.anchors.basket;
    expect(bb.containsPoint(new THREE.Vector3(bk.x, bk.y, bk.z))).toBe(true);
    expect(bb.max.x - bk.x).toBeLessThan(0.4);
    // the flour sacks are beside the baker, the apples at the fruit stall's end
    const baker = stallById('baker');
    const fruit = stallById('fruit');
    expect(Math.hypot(area.anchors.flourSacks.x - baker.at.x, area.anchors.flourSacks.z - baker.at.z)).toBeLessThan(3);
    const ap = toStall(fruit, area.anchors.apples.x, area.anchors.apples.z);
    expect(Math.abs(ap.lx)).toBeGreaterThan(fruit.w / 2);
    expect(Math.abs(ap.lx)).toBeLessThan(fruit.w / 2 + 1);
  });

  it("the fruit stall's trestle is drawn over its hide", () => {
    // a plank top at about 0.75 m, under the hide's spot, in the stall's own meshes
    const planks = (id) => {
      const hide = stallById(id).hide;
      let n = 0;
      scene.traverse((o) => {
        if (o.userData.stall !== id) return;
        o.traverse((m) => {
          if (!m.isMesh) return;
          const pos = m.geometry.attributes.position;
          const v = new THREE.Vector3();
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
            if (v.y > 0.7 && v.y < 0.8 && Math.hypot(v.x - hide.x, v.z - hide.z) < 0.9) n++;
          }
        });
      });
      return n;
    };
    expect(planks('flowers')).toBeGreaterThan(0);
    expect(planks('fruit')).toBeGreaterThan(0);
    // on the side away from the crate
    const fruit = stallById('fruit');
    expect(toStall(fruit, fruit.hide.x, fruit.hide.z).lx).toBeLessThan(0);
  });

  it('dusk lights the lanterns and packs up, and the treats stay', () => {
    const lantern = scene.getObjectByName('marketLanterns');
    const packing = scene.getObjectByName('marketPacking');
    const baskets = scene.getObjectByName('marketBaskets');
    const windows = scene.getObjectByName('marketWindowsLit');
    expect(windows.isMesh).toBe(true);
    expect(windows.parent).toBe(scene);
    expect(windows.userData.noCast).toBe(true);
    expect(windows.userData.window).toBeUndefined();
    expect(windows.material.emissiveIntensity).toBe(0);
    expect(windows.geometry.index.count / 6).toBeGreaterThan(40); // a good share of the panes
    expect(lantern.isMesh).toBe(true);
    expect(lantern.material.emissiveIntensity).toBe(0);
    expect(packing.visible).toBe(false);
    expect(baskets.visible).toBe(true);
    for (const o of [lantern, packing, baskets]) expect(o.parent).toBe(scene);
    for (const o of [packing, baskets]) expect(o.userData.noMerge).toBe(true);
    setMarketDusk(area, 1);
    expect(lantern.material.emissiveIntensity).toBeCloseTo(1.6, 9);
    expect(windows.material.emissiveIntensity).toBeGreaterThan(0.5);
    expect(packing.visible).toBe(true);
    expect(baskets.visible).toBe(false);
    for (const m of Object.values(area.treatMeshes)) expect(m.visible).toBe(true);
    setMarketDusk(area, 1); // idempotent
    expect(lantern.material.emissiveIntensity).toBeCloseTo(1.6, 9);
    expect(packing.visible).toBe(true);
    setMarketDusk(area, 0.25);
    expect(lantern.material.emissiveIntensity).toBeCloseTo(0.4, 9);
    expect(packing.visible).toBe(false);
    expect(baskets.visible).toBe(true);
    setMarketDusk(area, 0);
    expect(lantern.material.emissiveIntensity).toBe(0);
    expect(windows.material.emissiveIntensity).toBe(0);
    expect(packing.visible).toBe(false);
    expect(baskets.visible).toBe(true);
    for (const m of Object.values(area.treatMeshes)) expect(m.visible).toBe(true);
    // the packing-up things are really there, inside the stalls
    let cloth = 0;
    packing.traverse((o) => { if (o.isMesh) cloth += o.geometry.attributes.position.count; });
    expect(cloth).toBeGreaterThan(0);
  });

  it('the look hook lights the lanterns on a dusk walk only', () => {
    const lantern = scene.getObjectByName('marketLanterns');
    const packing = scene.getObjectByName('marketPacking');
    const ctx = (dusk) => ({ scene, sun: new THREE.DirectionalLight(), fill: new THREE.HemisphereLight(), dusk, reducedMotion: false, visits: 0 });
    const day = area.life(ctx(false));
    expect(typeof day.update).toBe('function');
    expect(typeof day.dispose).toBe('function');
    expect(lantern.material.emissiveIntensity).toBe(0);
    expect(packing.visible).toBe(false);
    day.update(0.016);
    day.dispose();
    const dusk = area.life(ctx(true));
    expect(lantern.material.emissiveIntensity).toBeCloseTo(1.6, 9);
    expect(packing.visible).toBe(true);
    const before = scene.children.length;
    for (let i = 0; i < 50; i++) dusk.update(0.016);
    expect(scene.children.length).toBe(before);
    dusk.dispose();
    const again = createMarketLife(area, { scene, dusk: false });
    expect(lantern.material.emissiveIntensity).toBe(0);
    expect(packing.visible).toBe(false);
    again.update(0.016, 0, null, null, null); // no session yet: nothing to watch, nothing breaks
    again.dispose();
    const back = createMarketLife(area, { scene, dusk: true });
    expect(lantern.material.emissiveIntensity).toBeCloseTo(1.6, 9);
    back.dispose();
    setMarketDusk(area, 0);
  });

  it('the apple crate is a tippable, still solid, and no longer in the fruit stall\'s own mesh', () => {
    expect(area.tippables).toHaveLength(1);
    const [t] = area.tippables;
    expect(t.kind).toBe('applecrate');
    expect(t.x).toBe(area.anchors.apples.x);
    expect(t.z).toBe(area.anchors.apples.z);
    expect(t.build).toBe(buildAppleCrate);
    // still solid where it stands
    const c = area.colliders.find((q) => Math.hypot(q.x - t.x, q.z - t.z) < 0.05);
    expect(c?.r).toBeCloseTo(0.4, 9);
    // the anchor's y is the drawn crate's height
    expect(area.anchors.apples.y).toBe(FRUIT_CRATE.h);
    const g = buildAppleCrate();
    const top = new THREE.Box3().setFromObject(g).max.y;
    expect(top).toBeGreaterThanOrEqual(FRUIT_CRATE.h);
    expect(top).toBeLessThan(FRUIT_CRATE.h + 0.06); // the heap just over the rim
    // the fruit stall draws nothing where the crate stands
    let n = 0;
    const v = new THREE.Vector3();
    scene.traverse((o) => {
      if (o.userData.stall !== 'fruit') return;
      o.traverse((m) => {
        if (!m.isMesh) return;
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          if (Math.hypot(v.x - t.x, v.z - t.z) < 0.22 && v.y > 0.02) n++;
        }
      });
    });
    expect(n).toBe(0);
  });

  it('the shop fronts close the square outside its bounds, with a gap behind the spawn', () => {
    const fronts = meshes.filter((m) => m.userData.shopFront);
    expect(fronts.map((m) => m.userData.shopFront).sort()).toEqual(['east', 'north', 'south', 'west']);
    for (const m of fronts) {
      expect(m.parent).toBe(scene); // one mesh a side
      // Task 6: no long row shadow across the square for the shadow box to cut off
      expect([m.userData.shopFront, m.castShadow, m.userData.noCast]).toEqual([m.userData.shopFront, false, true]);
      const pos = m.geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        const outside = v.x < MARKET_BOUNDS.minX || v.x > MARKET_BOUNDS.maxX || v.z < MARKET_BOUNDS.minZ || v.z > MARKET_BOUNDS.maxZ;
        expect(outside, `${m.userData.shopFront} ${v.x.toFixed(2)},${v.z.toFixed(2)}`).toBe(true);
        // U3: step 4's gateway goes through a 3.2 m gap in the south row at x = 0
        if (m.userData.shopFront === 'south') expect(Math.abs(v.x), `${v.x}`).toBeGreaterThanOrEqual(1.6 - 1e-6);
      }
    }
    // and nothing at all stands in that gap's lane (the ground and the far band aside)
    const v = new THREE.Vector3();
    for (const m of meshes) {
      if (m.userData.ground || m.name === 'horizonBand') continue;
      const pos = m.geometry.attributes.position;
      let inLane = 0;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (v.z > MARKET_BOUNDS.maxZ && v.z < MARKET_BOUNDS.maxZ + 8 && Math.abs(v.x) < 1.6) inLane++;
      }
      expect(inLane, m.name || m.parent?.name).toBe(0);
    }
  });

  it('the far town is one band casting nothing, and the bunting casts nothing', () => {
    const band = meshes.filter((m) => m.name === 'horizonBand');
    expect(band).toHaveLength(1);
    expect(band[0].parent).toBe(scene);
    expect(band[0].userData.noCast).toBe(true);
    const bunting = scene.getObjectByName('marketBunting');
    expect(bunting.isMesh).toBe(true);
    expect(bunting.userData.noCast).toBe(true);
    // the bunting hangs above the chase camera's second zoom step (3.8 m)
    expect(boxOf(bunting).min.y).toBeGreaterThan(3.8);
  });

  it('the clutter is two meshes for the whole square, casting nothing, and each thing still gets its contact shadow', async () => {
    const { MARKET_CLUTTER } = await import('../src/world/marketplan.js');
    const { qualifies } = await import('../src/render/contactshadows.js');
    const kit = scene.getObjectByName('marketClutter');
    const drawn = kit.children.filter((o) => o.isMesh);
    expect(drawn.length).toBeLessThanOrEqual(2);
    for (const m of drawn) expect([m.name, m.castShadow, m.userData.noCast]).toEqual([m.name, false, true]);
    // and still none after the walk's merge (it joins meshes by material)
    const merged = new THREE.Scene();
    build(merged);
    mergeStaticProps(merged);
    merged.getObjectByName('marketClutter').traverse((o) => { if (o.isMesh) expect(o.castShadow, o.name).toBe(false); });
    for (const c of MARKET_CLUTTER) {
      const a = scene.getObjectByName(`marketClutter:${c.id}`);
      expect(a.parent, c.id).toBe(scene);
      if (c.kind === 'board') {
        // the one that casts: its own child, drawn
        a.traverse((o) => { if (o.isMesh) expect(o.castShadow, c.id).toBe(true); });
      } else if (c.kind === 'bicycle') {
        // step 3 (V8): its own child, drawn, casting nothing, never merged (the life rocks it)
        expect(a.visible).toBe(true);
        expect(a.userData.noMerge).toBe(true);
        expect(area.bicycle).toBe(a);
        let n = 0;
        a.traverse((o) => { if (o.isMesh) { n++; expect([o.castShadow, o.userData.noCast]).toEqual([false, true]); } });
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThanOrEqual(2);
        expect(merged.getObjectByName('marketClutter:bicycle').children.filter((o) => o.isMesh)).toHaveLength(n);
      } else expect([c.id, a.visible, a.castShadow]).toEqual([c.id, false, false]);
      const b = boxOf(a);
      expect(qualifies(b), c.id).toBe(true);
      expect(b.containsPoint(new THREE.Vector3(c.x, Math.min(0.3, b.max.y / 2), c.z)), c.id).toBe(true);
    }
  });

  // ---- Step 3, Task 8 (V11): the café front, the flower tubs and the cobbles ----
  // world-space vertices of a mesh (the square's kits are drawn in place, under groups at the origin)
  const vertsOf = (m) => {
    const p = m.geometry.attributes.position;
    const c = m.geometry.attributes.color;
    const uv = m.geometry.attributes.uv;
    return Array.from({ length: p.count }, (_, i) => ({
      ...new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m.matrixWorld),
      col: c ? [c.getX(i), c.getY(i), c.getZ(i)] : null,
      u: uv ? uv.getX(i) : null,
      v: uv ? uv.getY(i) : null,
    }));
  };
  // the triangles of a mesh whose middles lie within r of (x, z), across the ground
  const trisNear = (m, x, z, r) => {
    const p = m.geometry.attributes.position;
    const idx = m.geometry.index ? m.geometry.index.array : Array.from({ length: p.count }, (_, i) => i);
    let n = 0;
    for (let t = 0; t < idx.length; t += 3) {
      let cx = 0; let cz = 0;
      for (let k = 0; k < 3; k++) { cx += p.getX(idx[t + k]) / 3; cz += p.getZ(idx[t + k]) / 3; }
      if (Math.hypot(cx - x, cz - z) < r) n++;
    }
    return n;
  };
  const inCellUV = (q, cell) => {
    const { atlasCell } = marketParts;
    const b = atlasCell(cell);
    return q.u >= b.u0 && q.u <= b.u1 && q.v >= b.v0 && q.v <= b.v1;
  };

  it('the café has its awning, window boards and a chalkboard of pictures, casting nothing', async () => {
    const { MARKET_CLUTTER } = await import('../src/world/marketplan.js');
    const front = scene.getObjectByName('marketCafeFront');
    const fm = front.children.filter((o) => o.isMesh);
    // its striped awning (which casts, as it did), the atlas (its sign and window boards)
    // and its painted front: nothing new casts
    expect(fm.length).toBeLessThanOrEqual(3);
    for (const m of fm) expect([m.name, m.castShadow]).toEqual([m.name, !!m.userData.awning]);
    for (const m of fm.filter((q) => !q.userData.awning)) expect(m.userData.noCast, m.name).toBe(true);
    // the awning slopes from high on the wall down over the cobbles, to a scalloped valance
    const awn = fm.find((m) => m.userData.awning);
    const ab = boxOf(awn);
    expect(ab.max.y).toBeGreaterThan(3.0);
    expect(ab.min.y).toBeLessThan(2.3);
    expect(ab.min.z).toBeLessThan(MARKET_BOUNDS.maxZ - 1.0);
    const low = vertsOf(awn).filter((q) => q.y < ab.min.y + 0.015).map((q) => q.x).sort((p, q) => p - q);
    let tips = low.length ? 1 : 0;
    for (let i = 1; i < low.length; i++) if (low[i] - low[i - 1] > 0.12) tips++;
    expect(tips, 'scallops along the valance').toBeGreaterThanOrEqual(12);
    // the window boards: painted boards (atlas cell 17) low on the front, under its windows
    const atlasMesh = fm.find((m) => m.material.map && !m.userData.awning);
    const boards = vertsOf(atlasMesh).filter((q) => inCellUV(q, 17));
    expect(boards.length).toBeGreaterThan(0);
    for (const q of boards) {
      expect(q.y).toBeGreaterThanOrEqual(0);
      expect(q.y).toBeLessThan(0.8);
      expect(q.z).toBeGreaterThan(MARKET_BOUNDS.maxZ);
    }
    // the chalkboard (below) stands beside the window boards, never in front of one:
    // it covers at most 0.2 m of any board's width (the final review: it hid half of one)
    const chalkAt = MARKET_CLUTTER.find((c) => c.kind === 'chalkboard');
    const xs = boards.map((q) => q.x).sort((p, q) => p - q);
    const spans = [[xs[0], xs[0]]];
    for (const x of xs) { const last = spans[spans.length - 1]; if (x - last[1] > 0.9) spans.push([x, x]); else last[1] = x; }
    expect(spans.length).toBeGreaterThanOrEqual(2);
    const half = 0.28; // its half-width across (marketplan.js CLUTTER_HALF.chalkboard)
    for (const [x0, x1] of spans) {
      const covered = Math.max(0, Math.min(x1, chalkAt.x + half) - Math.max(x0, chalkAt.x - half));
      expect(covered, `the chalkboard at x ${chalkAt.x} covers ${covered.toFixed(2)} m of the board ${x0.toFixed(2)}..${x1.toFixed(2)}`).toBeLessThanOrEqual(0.2);
    }
    // the chalkboard: an A-frame on the cobbles by the café's door, solid, out of every
    // counter's view lane, its board the chalk pictures' cell (no letters: M12)
    const chalk = MARKET_CLUTTER.find((c) => c.kind === 'chalkboard');
    expect(chalk).toBeTruthy();
    expect(chalk.solid).toEqual([{ x: chalk.x, z: chalk.z, r: 0.25 }]);
    expect(area.colliders).toContainEqual({ x: chalk.x, z: chalk.z, r: 0.25 });
    expect(isWalkableAt(area, chalk.x, chalk.z)).toBe(false);
    const fb = boxOf(front);
    expect(chalk.x).toBeGreaterThan(fb.min.x);
    expect(chalk.x).toBeLessThan(fb.max.x);
    expect(MARKET_BOUNDS.maxZ + 0.8 - chalk.z).toBeLessThan(1.5);
    for (const s of DRAWN_STALLS) {
      for (const [dx, dz] of [[0, 0], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
        const { lx, lz } = toStall(s, chalk.x + dx, chalk.z + dz);
        expect(lz > s.d / 2 - 0.5 && lz < s.d / 2 + 9 && Math.abs(lx) < s.w / 2 + 1.6, `in front of ${s.id}'s counter`).toBe(false);
      }
    }
    const kit = scene.getObjectByName('marketClutter');
    const kitAtlas = kit.children.find((m) => m.isMesh && m.material.map);
    const face = vertsOf(kitAtlas).filter((q) => inCellUV(q, 16));
    expect(face.length).toBeGreaterThan(0);
    for (const q of face) {
      expect(Math.hypot(q.x - chalk.x, q.z - chalk.z)).toBeLessThan(0.45);
      expect(q.y).toBeGreaterThan(0.05);
      expect(q.y).toBeLessThan(1.1);
    }
    const anchor = scene.getObjectByName(`marketClutter:${chalk.id}`);
    expect([anchor.visible, anchor.castShadow]).toEqual([false, false]);
    // the café front and its chalkboard together: at most 1,500 triangles more than the
    // front's 68 (its awning, valance and sign before)
    const tri = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    const boardTris = kit.children.filter((m) => m.isMesh).reduce((n, m) => n + trisNear(m, chalk.x, chalk.z, 0.5), 0);
    expect(fm.reduce((n, m) => n + tri(m), 0) + boardTris).toBeLessThanOrEqual(68 + 1500);
  });

  it('every flower tub has stems and blooms, and the clutter is still two meshes', async () => {
    const { MARKET_CLUTTER } = await import('../src/world/marketplan.js');
    const kit = scene.getObjectByName('marketClutter');
    const drawn = kit.children.filter((o) => o.isMesh);
    expect(drawn.length).toBeLessThanOrEqual(2);
    const paintMesh = drawn.find((m) => m.material.vertexColors);
    const verts = vertsOf(paintMesh);
    const tubs = MARKET_CLUTTER.filter((c) => c.kind === 'tub');
    expect(tubs).toHaveLength(7);
    const green = (c) => c[1] > c[0] * 1.15 && c[1] > c[2] * 1.15;
    for (const t of tubs) {
      const over = (q) => Math.hypot(q.x - t.x, q.z - t.z) < 0.48 && q.y > 0.62;
      const up = verts.filter(over);
      // green stems rise out of the leaves
      expect(up.filter((q) => green(q.col)).length, `${t.id}: stems`).toBeGreaterThan(0);
      // 5 to 7 blooms over them, in more than one colour: each bloom one piece, its petal
      // triangles joined at their corners (one stem or bloom never shares a corner with another)
      const key = (q) => `${q.x.toFixed(4)},${q.y.toFixed(4)},${q.z.toFixed(4)}`;
      const idx = paintMesh.geometry.index.array;
      const parent = new Map();
      const find = (k) => { while (parent.get(k) !== k) k = parent.get(k); return k; };
      for (let i = 0; i < idx.length; i += 3) {
        const tri = [verts[idx[i]], verts[idx[i + 1]], verts[idx[i + 2]]];
        if (!tri.every(over) || tri.every((q) => green(q.col))) continue;
        const ks = tri.map(key);
        for (const k of ks) if (!parent.has(k)) parent.set(k, k);
        for (const k of ks.slice(1)) parent.set(find(k), find(ks[0]));
      }
      const groups = new Map();
      for (const q of up) {
        if (!parent.has(key(q)) || green(q.col)) continue;
        const r = find(key(q));
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(q);
      }
      const heads = [...groups.values()];
      expect(heads.length, `${t.id}: blooms`).toBeGreaterThanOrEqual(5);
      expect(heads.length, `${t.id}: blooms`).toBeLessThanOrEqual(7);
      const tops = heads.map((h) => Math.max(...h.map((p) => p.y)));
      for (const y of tops) { expect(y).toBeGreaterThan(0.66); expect(y).toBeLessThan(1.1); }
      const colours = new Set(heads.map((h) => h.map((p) => p.col.map((v) => v.toFixed(2)).join(',')).sort()[0]));
      expect(colours.size, `${t.id}: colours`).toBeGreaterThan(1);
      // and cheap: at most 140 triangles over the barrel, its hoops and its leaves (224 before)
      const n = drawn.reduce((s, m) => s + trisNear(m, t.x, t.z, 0.48), 0);
      expect(n, t.id).toBeLessThanOrEqual(224 + 140);
    }
  });

  it("the ground uses the square's own cobbles", () => {
    const ground = scene.getObjectByName('marketCobbles');
    const map = ground.material.map;
    expect(map.isDataTexture).toBe(true);
    expect([map.image.width, map.image.height]).toEqual([128, 128]);
    expect(Array.from(map.image.data)).toEqual(Array.from(marketParts.createCobbleTexture().image.data));
    expect([map.wrapS, map.wrapT]).toEqual([THREE.RepeatWrapping, THREE.RepeatWrapping]);
    // one tile to 0.6 m across the whole ground
    const size = boxOf(ground).getSize(new THREE.Vector3());
    expect(map.repeat.x * 0.6).toBeCloseTo(size.x, 3);
    expect(map.repeat.y * 0.6).toBeCloseTo(size.z, 3);
    // its own picture, freed with the walk (no 'surface:' name), no shared relief that would not
    // match its stones, and the ground's gentle tone steps still on top
    expect(map.name.startsWith('surface:')).toBe(false);
    expect(ground.material.normalMap ?? null).toBeNull();
    expect(ground.material.vertexColors).toBe(true);
  });

  it('nothing in the square fades but its four lamp posts', () => {
    expect(meshes.filter((m) => m.userData.window)).toEqual([]);
    const found = findFadeOccluders(scene);
    expect(found).toHaveLength(4);
    for (const f of found) expect(f.obj.userData.lampGlobeY).toBeGreaterThan(0);
    // at the plan's posts (MARKET_LAMPS), none other
    const key = (x, z) => `${x.toFixed(2)},${z.toFixed(2)}`;
    const spots = found.map((f) => key(f.x, f.z)).sort();
    expect(spots).toEqual(MARKET_LAMPS.map((l) => key(l.x, l.z)).sort());
  });

  // Step 3, Task 3 (V5): the perches, read off the plan, each standing on something drawn
  it("the record's perches are the plan's, each on something drawn", () => {
    expect(area.perches).toEqual(MARKET_PERCHES);
    for (const p of area.perches) {
      const under = drawnUnder(p.x, p.y, p.z);
      expect(under, `${p.x},${p.z}: nothing under it`).not.toBeNull();
      // an awning's sheet within 3 cm; the crates, tables, trestle and rims within 2 cm;
      // the bicycle basket (she sits in it, the fruit in it 8 cm over its middle) within 10
      const tol = p.kind === 'roof' ? 0.03 : Math.hypot(p.x - area.anchors.basket.x, p.z - area.anchors.basket.z) < 0.05 ? 0.1 : 0.02;
      expect(Math.abs(under - p.y), `${p.x},${p.z}: ${under.toFixed(3)} under a perch at ${p.y}`).toBeLessThan(tol);
    }
  });

  it("three golden mice on the square's own spots, reached as the plan says", () => {
    const mice = MARKET_REGISTRATION.goldMice;
    expect(mice.map((m) => m.id)).toEqual(['gm-market-1', 'gm-market-2', 'gm-market-3']);
    const [m1, m2, m3] = mice;
    const hd = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
    // gm-market-1 on the cheese stall's awning: crates, then the awning (two hops)
    const { crate, roof } = stallClimb('cheese');
    expect(Math.abs(m1.y - roof.y)).toBeLessThan(0.1);
    expect(hd(m1, roof)).toBeLessThan(1.0);
    expect(canReach(roof, crate, crate.y, BASE_CLIMB_BUDGET)).toBe(true);
    // gm-market-2 on a crate stack's top (stack-e's), one hop off the cobbles
    const rim = RIM_PERCHES[1];
    expect(Math.abs(m2.y - rim.y)).toBeLessThan(0.1);
    expect(hd(m2, rim)).toBeLessThan(1.0);
    // the two up high lie on what is drawn there, not in the air
    for (const m of [m1, m2]) expect(Math.abs(drawnUnder(m.x, m.y, m.z) - m.y), m.id).toBeLessThan(0.03);
    // gm-market-3 on the ground, in a nook by the west shop fronts: clear of every collider
    expect(m3.y).toBe(0);
    expect(isWalkableAt(area, m3.x, m3.z)).toBe(true);
    expect(m3.x).toBeLessThan(MARKET_BOUNDS.minX + 1.5);
    // none beside a find spot, a collectible or a discovery anchor (the fountain's drink and the nap too)
    const anchors = [...Object.values(area.anchors), ...MARKET_REGISTRATION.propSet.rests, ...area.scenics];
    for (const m of mice) {
      for (const q of [...spotsIn('market'), ...area.collectibles, ...anchors]) {
        expect(hd(m, q), `${m.id} by ${q.id ?? `${q.x},${q.z}`}`).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it("the gold rows are the registration's", () => {
    expect(GOLD_MICE.market).toEqual(JSON.parse(JSON.stringify(MARKET_REGISTRATION.goldMice)));
  });

  it('the built counts are pinned, within the ceilings (280 / 210 / 62,000)', () => {
    const built = budgetStats(scene);
    const mergedScene = new THREE.Scene();
    build(mergedScene);
    mergeStaticProps(mergedScene);
    const merged = budgetStats(mergedScene);
    expect(built).toEqual(MEASURED_BUILT);
    expect(merged).toEqual(MEASURED_MERGED);
    // (the old aim, 180 / 110 / 45,000, was the six stalls'; the four new ones are held to the ceilings, never raised)
    expect(built.meshes).toBeLessThanOrEqual(280);
    expect(built.casters).toBeLessThanOrEqual(210);
    expect(built.triangles).toBeLessThanOrEqual(62000);
    // and the walk's merge keeps what step 2 and the dusk need, as they were
    for (const name of ['marketLanterns', 'marketPacking', 'marketBaskets', 'marketBunting']) {
      expect(mergedScene.getObjectByName(name), name).toBeTruthy();
    }
  });

  it(`the build is the same twice, inside withLocalUuids, drawing on Math.random ${MEASURED_DRAWS} times`, () => {
    const stats = budgetStats(scene);
    const s2 = new THREE.Scene(); // its own uuid, before the count starts
    const real = Math.random;
    const [realNow, realPerf] = [Date.now, performance.now];
    let draws = 0;
    let clocks = 0;
    Math.random = () => { draws++; return real(); };
    Date.now = () => { clocks++; return realNow(); };
    performance.now = () => { clocks++; return realPerf.call(performance); };
    let again;
    let a2;
    try {
      a2 = build(s2);
      again = budgetStats(s2);
    } finally {
      Math.random = real;
      Date.now = realNow;
      performance.now = realPerf;
    }
    expect(draws).toBe(MEASURED_DRAWS);
    expect(clocks).toBe(0);
    expect(again).toEqual(stats);
    expect(a2.colliders).toEqual(area.colliders);
    expect(a2.keepers).toEqual(area.keepers);
    expect(a2.anchors).toEqual(area.anchors);
    // the square's own models are named from a local stream: the same uuids and the same vertices
    for (const name of ['marketLanterns', 'marketBunting', 'marketBaskets']) {
      const p = scene.getObjectByName(name);
      const q = s2.getObjectByName(name);
      expect(q.uuid, name).toBe(p.uuid);
    }
    const fa = meshes.find((m) => m.userData.shopFront === 'north');
    let fb = null;
    s2.traverse((o) => { if (o.isMesh && o.userData.shopFront === 'north') fb = o; });
    expect(Array.from(fb.geometry.attributes.position.array)).toEqual(Array.from(fa.geometry.attributes.position.array));
  });
});

// =============================================================================
// Task 5: registered in every per-area list a street area is in. MARKET_REGISTRATION
// holds each row in its table's shape; each table holds exactly that row.
// =============================================================================
describe('The Market: registered in every per-area list', async () => {
  const { MARKET_REGISTRATION: REG } = await import('../src/world/marketplan.js');
  const { MARK_AREAS, emptyMarks } = await import('../src/marks.js');
  const { propsFor, isPropId, KNOCK_KINDS, CARRY_KINDS, REST_KINDS } = await import('../src/propsets.js');
  const { ambientKind } = await import('../src/render/ambient.js');
  const { CLOUD_AREAS, AREA_SKY } = await import('../src/render/clouds.js');
  const { AREA_RULES } = await import('../src/render/pawprints.js');
  const { COLONY_AREAS } = await import('../src/colony.js');
  const { createProgression } = await import('../src/progression.js');
  const plain = (v) => JSON.parse(JSON.stringify(v));

  it('each registration row is in its table', () => {
    expect(plain(propsFor('market'))).toEqual(plain(REG.propSet));
    expect(ambientKind('market')).toBe(REG.ambient);
    expect(ambientKind('market', { dusk: true })).toBe(REG.ambient);
    expect(CLOUD_AREAS).toContain('market');
    expect(plain(AREA_SKY.market)).toEqual(plain(REG.clouds));
    expect(AREA_SKY.market).toEqual({ clouds: 8, banks: 2 });
    expect(plain(AREA_RULES.market)).toEqual(plain(REG.pawprints));
    expect(MARK_AREAS).toContain('market');
    expect(emptyMarks().market).toEqual([]);
    expect(propsFor('market').hides.length).toBe(MARKET_HIDES_COUNT);
    // step 3's rows: two of each kind but the hides (seven now, the fruit stall's joins)
    const ps = propsFor('market');
    expect(MARKET_HIDES_COUNT).toBe(11);
    expect(ps.rests.map((r) => r.kind).sort()).toEqual(['drink', 'nap']);
    expect(ps.knockables.map((k) => k.id).sort()).toEqual(['market-bones-1', 'market-bucket-1', 'market-crock-1', 'market-crock-2', 'market-crock-3', 'market-cup-1', 'market-pot-1', 'market-pot-2', 'market-pot-3']);
    for (const k of ps.knockables) expect(isPropId(k.id), k.id).toBe(true);
    expect(ps.markables).toHaveLength(2);
    expect(ps.carryables).toHaveLength(2);
    expect(KNOCK_KINDS).toContain('bucket');
    for (const c of ps.carryables) expect(CARRY_KINDS).toContain(c.kind);
    for (const r of ps.rests) expect(REST_KINDS).toContain(r.kind);
  });

  it('an old save loads with marks.market []', () => {
    const store = {};
    const ls = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
    const first = createProgression(ls);
    const saved = JSON.parse(JSON.stringify(first.state));
    delete saved.marks.market;
    const old = createProgression({ getItem: () => JSON.stringify(saved), setItem: () => {}, removeItem: () => {} });
    expect(old.state.marks.market).toEqual([]);
    expect(old.state.marks.park).toEqual([]);
  });

  it('not a colony area, no dog yard', () => {
    expect(REG.colony).toBe(false);
    expect(COLONY_AREAS).not.toContain('market');
    expect(propsFor('market').dogYard).toBeNull();
  });
});

// =============================================================================
// Task 6: the picture views (verify-market.html's __shot, the card picture).
// =============================================================================
describe('The Market: its picture views', async () => {
  const { MARKET_SHOTS, MARKET_REGISTRATION: REG } = await import('../src/world/marketplan.js');
  const NAMES = ['spawn', 'fountain', 'fish', 'baker', 'cheese', 'milk', 'toys', 'plants', 'bric', 'butcher', 'cafe', 'overview', 'phone', 'card'];
  const inside = (x, z, m = 0) => x >= MARKET_BOUNDS.minX - m && x <= MARKET_BOUNDS.maxX + m && z >= MARKET_BOUNDS.minZ - m && z <= MARKET_BOUNDS.maxZ + m;

  it('every shot is inside the square, above the ground and looks at it', () => {
    expect(Object.isFrozen(MARKET_SHOTS)).toBe(true);
    expect(Object.keys(MARKET_SHOTS)).toEqual(NAMES);
    for (const [name, v] of Object.entries(MARKET_SHOTS)) {
      const n = v.split(',').map(Number);
      expect([name, n.length, n.every(Number.isFinite)]).toEqual([name, 6, true]);
      const [px, py, pz, lx, ly, lz] = n;
      expect([name, 'eye', inside(px, pz, 15)]).toEqual([name, 'eye', true]);
      expect([name, 'eye height', py >= 0.3 && py <= 30]).toEqual([name, 'eye height', true]);
      expect([name, 'look', inside(lx, lz)]).toEqual([name, 'look', true]);
      expect([name, 'looks somewhere', Math.hypot(lx - px, ly - py, lz - pz) > 1]).toEqual([name, 'looks somewhere', true]);
    }
    expect(MARKET_SHOTS.phone).toBe(MARKET_SHOTS.spawn);
    expect(REG.view).toBe(MARKET_SHOTS.card);
  });

  it('each counter shot is 3 m in front of its counter, at a cat\'s height, looking at it', () => {
    for (const id of TREAT_STALLS) {
      const s = stallById(id);
      const [px, py, pz, lx, , lz] = MARKET_SHOTS[id].split(',').map(Number);
      const eye = toStall(s, px, pz);
      expect([id, Math.abs(eye.lz - (s.d / 2 + 3)) < 0.05, Math.abs(eye.lx) < 0.05]).toEqual([id, true, true]);
      expect([id, py <= 0.8]).toEqual([id, true]);
      const at = toStall(s, lx, lz);
      expect([id, Math.abs(at.lx) < 0.05, at.lz <= s.d / 2 + 0.05]).toEqual([id, true, true]);
    }
  });

  it('has its moment views, each six numbers and a walk second, inside the square', async () => {
    const { MARKET_MOMENT_SHOTS } = await import('../src/world/marketplan.js');
    expect(Object.isFrozen(MARKET_MOMENT_SHOTS)).toBe(true);
    expect(Object.keys(MARKET_MOMENT_SHOTS)).toEqual(['lookup', 'cafe', 'tubs', 'cobbles', 'fruit', 'apples', 'flowers', 'petals', 'awning', 'fountain', 'pigeons', 'sacks', 'musician', 'basket', 'mice']);
    for (const [name, m] of Object.entries(MARKET_MOMENT_SHOTS)) {
      const n = m.view.split(',').map(Number);
      expect([name, n.length, n.every(Number.isFinite)]).toEqual([name, 6, true]);
      const [px, py, pz, lx, ly, lz] = n;
      expect([name, 'eye', inside(px, pz, 15)]).toEqual([name, 'eye', true]);
      expect([name, 'eye height', py >= 0.3 && py <= 30]).toEqual([name, 'eye height', true]);
      expect([name, 'look', inside(lx, lz)]).toEqual([name, 'look', true]);
      expect([name, 'looks somewhere', Math.hypot(lx - px, ly - py, lz - pz) > 1]).toEqual([name, 'looks somewhere', true]);
      expect([name, 'a walk second', Number.isFinite(m.t) && m.t >= 0 && m.t <= 10]).toEqual([name, 'a walk second', true]);
    }
  });

  it('the card picture is shipped (a JPEG, about the size of the others)', async () => {
    const { readFileSync } = await import('node:fs');
    const jpg = readFileSync(new URL('../public/places/market.jpg', import.meta.url));
    expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8]);
    expect(jpg.length).toBeGreaterThan(5000);
    expect(jpg.length).toBeLessThan(60000);
  });
});
