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
      // Boats float in it, and a gull may ride a barge roof or a boat (the
      // gull case below pins exactly where).
      if (Math.abs(it.z) < 3.5 && Math.abs(it.x) <= 45 && !['boat', 'gull'].includes(it.what)) {
        bad.push(`${it.what} in the canal at ${it.x},${it.z}`);
      }
      // Skipped only when the whole footprint is outside the bounds.
      if (Math.abs(it.x) - it.r > 38 || Math.abs(it.z) - it.r > 40) continue;
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

  it('keeps every part of a cluster inside its footprint radius', () => {
    // itemsOf() is what the keep-out case walks, so it must be a true bound.
    for (const c of dressing.CLUSTERS) {
      const r = dressing.itemsOf().find((it) => it.x === c.x && it.z === c.z).r;
      let far = 0;
      for (const g of dressing.partsOf(c)) {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) far = Math.max(far, Math.hypot(p.getX(i) - c.x, p.getZ(i) - c.z));
      }
      expect(far, `${c.kind} at ${c.x},${c.z}`).toBeLessThanOrEqual(r);
    }
  });

  it('never lets one barrel stand inside another', () => {
    for (const c of dressing.CLUSTERS.filter((k) => k.kind === 'barrels')) {
      const drums = dressing.barrelsOf(c);
      expect(drums.length).toBeGreaterThanOrEqual(3);
      expect(drums.length).toBeLessThanOrEqual(5);
      for (let i = 0; i < drums.length; i++) {
        for (let j = i + 1; j < drums.length; j++) {
          const a = drums[i], b = drums[j];
          // only drums at the same level can collide side by side
          if (Math.abs(a.y - b.y) > 0.1) continue;
          expect(Math.hypot(a.x - b.x, a.z - b.z), `${c.x},${c.z} drums ${i},${j}`).toBeGreaterThanOrEqual(a.r + b.r);
        }
      }
    }
  });

  it('stacks crates at least two high, so a cluster reads from across the yard', () => {
    for (const c of dressing.CLUSTERS.filter((k) => k.kind === 'crates')) {
      let top = 0;
      for (const g of dressing.partsOf(c)) {
        g.computeBoundingBox();
        top = Math.max(top, g.boundingBox.max.y);
      }
      expect(top / (c.s ?? 1), `crates at ${c.x},${c.z}`).toBeGreaterThanOrEqual(1.25);
    }
  });

  it('dresses the open yards: 12 to 18 clusters wholly in bounds, standing free of every collider and prop', () => {
    const scene = new THREE.Scene();
    const area = WORLDS.docks.build(scene);
    const inside = dressing.itemsOf().filter((it) => dressing.CLUSTERS.some((c) => c.x === it.x && c.z === it.z)
      && Math.abs(it.x) + it.r <= 38 && Math.abs(it.z) + it.r <= 40);
    const free = inside.filter((it) => !area.colliders.some((c) => Math.hypot(it.x - c.x, it.z - c.z) + it.r <= c.r));
    expect(free.length).toBeGreaterThanOrEqual(12);
    expect(free.length).toBeLessThanOrEqual(18);
    // Standing free means touching nothing: no collider, and no bounding box
    // of anything the area already built that stands off the ground.
    const boxes = [];
    for (const ch of scene.children) {
      if (ch.userData.dressing) continue;
      const b = new THREE.Box3().setFromObject(ch);
      if (b.isEmpty() || b.max.y - b.min.y < 0.08 || b.max.x - b.min.x > 30 || b.max.z - b.min.z > 30) continue;
      boxes.push(b);
    }
    const bad = [];
    for (const it of free) {
      for (const c of area.colliders) if (Math.hypot(it.x - c.x, it.z - c.z) < it.r + c.r) bad.push(`${it.what} at ${it.x},${it.z} touches collider ${c.x},${c.z}`);
      for (const b of boxes) {
        const cx = Math.min(Math.max(it.x, b.min.x), b.max.x), cz = Math.min(Math.max(it.z, b.min.z), b.max.z);
        if (Math.hypot(it.x - cx, it.z - cz) < it.r + 0.2) bad.push(`${it.what} at ${it.x},${it.z} touches a prop at ${cx.toFixed(1)},${cz.toFixed(1)}`);
      }
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it('perches gulls only on bollards that are not perches or props', () => {
    const BOLLARDS = [[-30, 4.2], [-18, 4.2], [-6, 4.2], [6, 4.2], [18, 4.2], [30, 4.2],
      [-30, -4.2], [-18, -4.2], [-6, -4.2], [6, -4.2], [18, -4.2], [30, -4.2]];
    const TAKEN = [[-18, 4.2], [6, 4.2], [-6, -4.2], [18, -4.2], // perches
      [-30, -4.2], [30, 4.2], [-6, 4.2]]; // propsets
    const at = (g, [x, z], tol = 0.05) => Math.abs(g.x - x) <= tol && Math.abs(g.z - z) <= tol;
    // barge cabin roofs: b.barge at x ±14 turned a quarter (rotY PI/2) puts
    // its cabin at x bx-3.7..bx-0.7, |z| <= 1.1, roof y 1.75, and its stack at
    // x bx-2.8.
    const onRoof = (g) => Math.abs(g.y - 1.75) < 0.05 && Math.abs(g.z) <= 0.9 && [14, -14].some((bx) =>
      g.x >= bx - 3.5 && g.x <= bx - 0.9 && Math.hypot(g.x - (bx - 2.8), g.z) >= 0.4);
    const onBow = (g) => dressing.BOATS.some((b) => {
      const dx = g.x - b.x, dz = g.z - b.z;
      const along = dx * Math.cos(b.rot) - dz * Math.sin(b.rot);
      const across = dx * Math.sin(b.rot) + dz * Math.cos(b.rot);
      return along > 0 && along < b.len / 2 && Math.abs(across) < 0.4 && g.y > 0.2 && g.y < 0.7;
    });
    let onBollards = 0, onRoofs = 0;
    for (const g of dressing.GULL_SPOTS) {
      if (g.y >= 0.55 && g.y < 1) {
        expect(BOLLARDS.some((b) => at(g, b)), `gull at ${g.x},${g.z}`).toBe(true);
        expect(TAKEN.some((b) => at(g, b, 0.5)), `gull at ${g.x},${g.z} on a taken bollard`).toBe(false);
        onBollards++;
      } else if (onRoof(g)) onRoofs++;
      else expect(onBow(g), `gull at ${g.x},${g.y},${g.z}`).toBe(true);
    }
    expect(onBollards).toBe(5);
    expect(onRoofs).toBe(2);
    expect(dressing.itemsOf().filter((it) => it.what === 'gull').length).toBe(dressing.GULL_SPOTS.length);
  });

  it('floats every boat in the canal, clear of the bridges, barges and duck circles', () => {
    expect(dressing.BOATS.length).toBeGreaterThanOrEqual(6);
    expect(dressing.BOATS.length).toBeLessThanOrEqual(8);
    const decks = [{ minX: -2.5, maxX: 2.5, minZ: -6.5, maxZ: 6.5 }, { minX: -25.1, maxX: -22.9, minZ: -5.5, maxZ: 5.5 }];
    const barges = [{ minX: 9.5, maxX: 18.5, minZ: -1.7, maxZ: 1.7 }, { minX: -18.5, maxX: -9.5, minZ: -1.7, maxZ: 1.7 }];
    const ducks = [{ x: 5, z: 0, r: 2.5 }, { x: -8, z: 0, r: 2.5 }];
    const inRect = (x, z, r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
    const bad = [];
    for (const b of dressing.BOATS) {
      expect(b.len).toBeGreaterThanOrEqual(3);
      expect(b.len).toBeLessThanOrEqual(4.5);
      // sample the hull rectangle every 5 cm
      for (let u = -b.len / 2; u <= b.len / 2 + 1e-9; u += 0.05) {
        for (let v = -0.65; v <= 0.65 + 1e-9; v += 0.05) {
          const x = b.x + u * Math.cos(b.rot) + v * Math.sin(b.rot);
          const z = b.z - u * Math.sin(b.rot) + v * Math.cos(b.rot);
          const where = `boat at ${b.x},${b.z} (${x.toFixed(2)},${z.toFixed(2)})`;
          if (Math.abs(z) > 3.3 || Math.abs(x) > 45) bad.push(`${where} out of the canal`);
          if ([...decks, ...barges].some((r) => inRect(x, z, r))) bad.push(`${where} on a deck or barge`);
          if (ducks.some((d) => Math.hypot(x - d.x, z - d.z) < d.r)) bad.push(`${where} in a duck circle`);
        }
      }
    }
    expect([...new Set(bad.map((s) => s.split(' (')[0]))]).toEqual([]);
    expect(dressing.itemsOf().filter((it) => it.what === 'boat').length).toBe(dressing.BOATS.length);
  });

  it('adds nothing that moves', () => {
    const scene = new THREE.Scene();
    const area = WORLDS.docks.build(scene);
    expect(area.waterFx.length).toBe(1);
    for (const m of dressingOf(scene)) {
      expect(Object.prototype.hasOwnProperty.call(m, 'onBeforeRender')).toBe(false);
      expect(m.onBeforeRender).toBe(THREE.Object3D.prototype.onBeforeRender);
      expect(m.userData.update).toBeUndefined();
    }
  }, 120_000);
});
