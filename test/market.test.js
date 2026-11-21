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
const { build, setMarketDusk, MARKET_COBBLE } = marketModule;
const { createMarketLife } = await import('../src/world/marketlife.js');
const { buildAppleCrate } = await import('../src/world/marketfruit.js');
const {
  MARKET_BOUNDS, MARKET_SPAWN, MARKET_COLLIDERS, MARKET_KEEPOUT, MARKET_POIS, MARKET_COLLECTIBLES, STALLS, TREAT_STALLS, CAFE,
  stallById, toStall, MARKET_LAMPS,
} = await import('../src/world/marketplan.js');
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
const MEASURED_BUILT = { meshes: 102, casters: 27, triangles: 38053 };
const MEASURED_MERGED = { meshes: 99, casters: 24, triangles: 38053 };
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
    expect(area.perches).toEqual([]);
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
    // two birds only (the pigeons are step 3), on open cobbles out of every counter's zone
    expect(area.critterSpawns.map((c) => c.type)).toEqual(['bird', 'bird']);
    for (const c of area.critterSpawns) {
      expect(clearOf(c.x, c.z, area.colliders), `${c.x},${c.z}`).toBeGreaterThan(1);
      expect(keepOutPoint(area, c.x, c.z)).toEqual({ x: c.x, z: c.z });
    }
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
      expect(b.max.z, s.id).toBeLessThan(s.d / 2 + 0.7);
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
    expect(withKeeper).toHaveLength(6);
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
    // the hook is the market's life now (step 3): the look's own hook is gone
    expect(marketModule.createMarketLook).toBeUndefined();
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
    expect(c?.r).toBeCloseTo(0.3, 9);
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
      } else expect([c.id, a.visible, a.castShadow]).toEqual([c.id, false, false]);
      const b = boxOf(a);
      expect(qualifies(b), c.id).toBe(true);
      expect(b.containsPoint(new THREE.Vector3(c.x, Math.min(0.3, b.max.y / 2), c.z)), c.id).toBe(true);
    }
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

  it('the built counts are pinned, within the aim (180 / 110 / 45,000)', () => {
    const built = budgetStats(scene);
    const mergedScene = new THREE.Scene();
    build(mergedScene);
    mergeStaticProps(mergedScene);
    const merged = budgetStats(mergedScene);
    expect(built).toEqual(MEASURED_BUILT);
    expect(merged).toEqual(MEASURED_MERGED);
    expect(built.meshes).toBeLessThanOrEqual(180);
    expect(built.casters).toBeLessThanOrEqual(110);
    expect(built.triangles).toBeLessThanOrEqual(45000);
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
    expect(MARKET_HIDES_COUNT).toBe(7);
    expect(ps.rests.map((r) => r.kind).sort()).toEqual(['drink', 'nap']);
    expect(ps.knockables.map((k) => k.id).sort()).toEqual(['market-bucket-1', 'market-cup-1']);
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
  const NAMES = ['spawn', 'fountain', 'fish', 'baker', 'cheese', 'milk', 'cafe', 'overview', 'phone', 'card'];
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

  it('the card picture is shipped (a JPEG, about the size of the others)', async () => {
    const { readFileSync } = await import('node:fs');
    const jpg = readFileSync(new URL('../public/places/market.jpg', import.meta.url));
    expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8]);
    expect(jpg.length).toBeGreaterThan(5000);
    expect(jpg.length).toBeLessThan(60000);
  });
});
