import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub, buildRiver, trianglesOf } from './helpers/growriver.js';
import { floodFrom } from './helpers/flood.js';
import { bannedIn, withOffWords } from './helpers/offwords.js';

// Bigger areas, step 3 (docs/superpowers/specs/2026-11-19-bigger-areas-riversouth.md):
// the River's south strip, behind the switch in src/grow.js, beside the west
// strip (test/riverwest.test.js, which builds the River with both strips on
// and so also proves the core did not move with the south strip there).
//
// Proved here: the grown River is 140 x 140 m and closed at its new edges;
// the strip's ground, hills and water reach them with no seam; the strip is
// sound (the same on every device, dry, reachable, a collider under every
// trunk and bank); it has something to find; and the most the whole grown
// River (core, west and south) puts on screen at once is under the
// territories' 70,000 triangles.

vi.stubGlobal('document', canvasStub);

const river = await import('../src/world/river.js');
const west = await import('../src/world/riverwest.js');
const south = await import('../src/world/riversouth.js');
const b = await import('../src/world/builder.js');
const { setGrow } = await import('../src/grow.js');
const rig = await import('../src/render/rig.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { createStripTiles } = await import('../src/render/striptiles.js');
const { LAYERS, FRAME_TRIANGLES, CHECK_EVERY, tileDistance, BUILT, ABSENT } = await import('../src/world/strips.js');
const { measureStreams, worstSpot, ALL_LAYERS } = await import('./helpers/growbudget.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { findPath } = await import('../src/pathfind.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { buildGrassMask } = await import('../src/render/grass.js');
const { buildMapLayer } = await import('../src/ui/minimap.js');
const { segDist } = await import('../src/segdist.js');
const { createRests } = await import('../src/rests.js');
const { createWind } = await import('../src/render/wind.js');
const { createContactShadows } = await import('../src/render/contactshadows.js');
const { findOccluders } = await import('../src/fightcam.js');
const { createTreeFade } = await import('../src/treefade.js');

buildRiver(river, setGrow, false); // the process's first build makes the shared textures
const OFF = buildRiver(river, setGrow, false);
const ON = buildRiver(river, setGrow, true);
const GROWN = { minX: -90, maxX: 50, minZ: -50, maxZ: 90 };
const stripKids = (id) => ON.scene.children.filter((o) => o.userData.strip === id);
const POOL = south.SAND_POOL;

// What each strip added to an area list: the core's, then the west strip's,
// then the south strip's.
const westCount = {
  colliders: west.westTreeColliders().length + west.WEST_COLLIDERS.length,
  perches: west.westTreePerches().length + west.WEST_PERCHES.length,
  collectibles: west.westCollectibles().length,
  scenics: west.westScenics().length,
};
const added = (key) => ON.area[key].slice(OFF.area[key].length + (westCount[key] ?? 0));

describe('the grown River', () => {
  it('is 140 x 140 m with the switch on, the core and two strips, and streams the south strip last', () => {
    expect(ON.area.bounds).toEqual(GROWN);
    expect(ON.area.core).toEqual({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
    expect(ON.area.strips.map((s) => s.id)).toEqual(['core', 'core-fine', 'west', 'south']);
    expect(ON.area.strips[3]).toBe(south.SOUTH_STRIP);
    expect(south.SOUTH).toMatchObject({ minX: -90, maxX: 50, minZ: 50, maxZ: 90 });
    expect(south.SOUTH_TILES.length).toBe(14);
    // and with it off, the 100 m square, with nothing of the strip
    expect(OFF.area.bounds).toEqual(ON.area.core);
    expect(OFF.scene.children.some((o) => o.userData.strip !== undefined)).toBe(false);
    expect(OFF.area.waters.some((w) => w.id === POOL.id)).toBe(false);
  });

  it('adds its things after the core\'s and the west strip\'s, in every list and in the scene', () => {
    const kids = ON.scene.children;
    const firstSouth = kids.findIndex((o) => o.userData.strip === 'south');
    expect(firstSouth).toBeGreaterThan(kids.findLastIndex((o) => o.userData.strip === 'west'));
    expect(kids.slice(firstSouth).every((o) => o.userData.strip === 'south')).toBe(true);
    const trees = south.southTrees();
    expect(added('colliders')).toEqual([...south.southTreeColliders(), ...south.SOUTH_COLLIDERS].map((c) => ({ x: c.x, z: c.z, r: c.r })));
    expect(added('perches')).toEqual([...south.southTreePerches(), ...south.SOUTH_PERCHES]);
    expect(added('collectibles').map((c) => c.id)).toEqual(['river-find-10', 'river-find-11', 'river-find-12', 'river-find-13']);
    expect(added('scenics').map((c) => c.id)).toEqual(['river-sand-bank']);
    expect(ON.area.rests.map((r) => r.id)).toEqual(['river-nap-1', 'river-drink-1', 'river-nap-2', 'river-drink-2']);
    expect(ON.area.waters.map((w) => w.id).slice(-2)).toEqual(['pool-west', 'pool-south']);
    expect(ON.area.waterFx.length).toBe(OFF.area.waterFx.length + 2);
    expect(trees.length).toBeGreaterThan(5);
    // every id is new
    for (const key of ['collectibles', 'scenics']) {
      const ids = ON.area[key].map((c) => c.id);
      expect(new Set(ids).size, key).toBe(ids.length);
    }
  });

  it('the cat, the map, the grass and the path finder use the grown bounds; the new edge closes it', () => {
    expect(isWalkableAt(ON.area, 30, 80)).toBe(true);
    expect(isWalkableAt(OFF.area, 30, 80)).toBe(false);
    for (let x = -88; x <= 48; x += 4) {
      expect(isWalkableAt(ON.area, x, 90.5), `${x}`).toBe(false);
      expect(isWalkableAt(ON.area, x, 89.6) || !b.inWater(ON.area.waters, x, 89.6), `${x}`).toBe(true);
    }
    expect(isWalkableAt(ON.area, 50.5, 70)).toBe(false);
    expect(isWalkableAt(ON.area, -90.5, 70)).toBe(false);
    expect(buildMapLayer(ON.area, ON.scene).edge).toEqual(GROWN);
    const mask = buildGrassMask(ON.area, []);
    expect(mask.at(30, 86)).toBe(1);
    expect(mask.at(30, 95)).toBe(0);
  });
});

describe('the ground, the hills and the water reach the new edge', () => {
  const core = ON.scene.children.find((c) => c.userData.ground && c.geometry.parameters?.width === 120);
  const westPatch = stripKids('west').find((c) => c.name === 'stripGround');
  const patch = stripKids('south').find((c) => c.name === 'stripGround');
  // a mesh's world vertices on a line, by position along it
  const onLine = (mesh, axis, value) => {
    mesh.updateMatrixWorld(true);
    const m = new Map();
    const pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color, uv = mesh.geometry.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (Math.abs(v[axis] - value) > 1e-6) continue;
      m.set(Math.round((axis === 'z' ? v.x : v.z) * 100), [col.getX(i), col.getY(i), col.getZ(i), uv.getX(i), uv.getY(i)]);
    }
    return m;
  };
  // the edges of a mesh's triangles that lie on a line, as "from:to" in cm along it
  const seamEdges = (mesh, axis, value) => {
    mesh.updateMatrixWorld(true);
    const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index;
    const w = (i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    const out = new Set();
    for (let t = 0; t < idx.count; t += 3) {
      const vs = [0, 1, 2].map((k) => w(idx.getX(t + k)));
      for (let k = 0; k < 3; k++) {
        const p = vs[k], q = vs[(k + 1) % 3];
        if (Math.abs(p[axis] - value) > 1e-6 || Math.abs(q[axis] - value) > 1e-6) continue;
        const a = Math.round((axis === 'z' ? p.x : p.z) * 100), c = Math.round((axis === 'z' ? q.x : q.z) * 100);
        out.add(`${Math.min(a, c)}:${Math.max(a, c)}`);
      }
    }
    return out;
  };

  it('is more of the same plane: same material, and no seam where it meets the core\'s and the west strip\'s', () => {
    expect(patch.material).toBe(core.material);
    expect(patch.userData.ground).toBe(true);
    const a = onLine(core, 'z', 60), w = onLine(westPatch, 'z', 60), s = onLine(patch, 'z', 60);
    expect(a.size).toBe(49); // x -60..60 on the plane's 2.5 m grid
    expect(w.size).toBe(17); // x -100..-60
    expect(s.size).toBe(65); // x -100..60
    for (const [x, va] of [...a, ...w]) va.forEach((n, k) => expect(s.get(x)[k], `x ${x / 100} component ${k}`).toBeCloseTo(n, 5));
    const box = new THREE.Box3().setFromObject(patch);
    expect([box.min.x, box.max.x, box.min.z, box.max.z].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-100, 60, 60, 100]);
  });

  it('is drawn on a 5 m grid, but the seams are watertight: every 2.5 m edge of the neighbours along them is the strip\'s too', () => {
    // along z 60: the core's plane (x -60..60) and the west patch (x -100..-60)
    const s = seamEdges(patch, 'z', 60);
    const theirs = new Set([...seamEdges(core, 'z', 60), ...seamEdges(westPatch, 'z', 60)]);
    expect(theirs.size).toBe(64);
    expect(s).toEqual(theirs);
    // the west patch along the core's plane (x -60, z -60..60) likewise
    expect(seamEdges(westPatch, 'x', -60)).toEqual(seamEdges(core, 'x', -60));
    expect(seamEdges(core, 'x', -60).size).toBe(48);
    // every triangle faces up, and the two patches cost a third of a 2.5 m grid
    for (const m of [patch, westPatch]) {
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld).toNonIndexed();
      g.computeVertexNormals();
      const n = g.attributes.normal;
      for (let v = 0; v < n.count; v++) expect(n.getY(v)).toBeGreaterThan(0.999);
    }
    expect(trianglesOf(patch)).toBe(608);
    expect(trianglesOf(westPatch)).toBe(478);
    // and the strip's tint carries the core's on: wet round the pool
    const tint = south.southGroundTint;
    expect(tint(POOL.x + POOL.r + 0.5, POOL.z)[0]).toBeLessThan(tint(30, 80)[0]);
  });

  const outside = (bd, x, z) => Math.max(x - bd.maxX, bd.minX - x, z - bd.maxZ, bd.minZ - z);
  const band = () => ON.scene.children.find((c) => c.name === 'horizonBand');

  it('the hills ring the grown ground: their inner rim is 6 m outside the new bounds all round', () => {
    const pos = band().geometry.attributes.position;
    let nearest = Infinity;
    for (let v = 0; v < pos.count; v++) nearest = Math.min(nearest, outside(GROWN, pos.getX(v), pos.getZ(v)));
    expect(nearest).toBeCloseTo(6, 6);
    for (let v = 0; v < pos.count; v++) {
      if (outside(GROWN, pos.getX(v), pos.getZ(v)) <= 15) expect(pos.getY(v)).toBeLessThan(0.31);
    }
    const box = new THREE.Box3().setFromBufferAttribute(pos);
    expect(box.max.z).toBeCloseTo(156, 5);
    expect(box.min.z).toBeCloseTo(-116, 5);
    expect(box.max.y).toBeGreaterThan(2);
  });

  it('the edge\'s reeds and trees moved out with it: none is left standing where the old south edge was', () => {
    const horizon = { ...river.RIVER_HORIZON, rect: south.GROWN_BAND_RECT };
    const spots = b.edgeSpots({ ...horizon.edge, rect: horizon.rect, avoid: ON.area.waters }, horizon.salt, ON.area.waters);
    expect(spots.length).toBeGreaterThan(140);
    for (const s of spots) expect(outside(GROWN, s.x, s.z), `${s.kind} at ${s.x.toFixed(1)},${s.z.toFixed(1)}`).toBeGreaterThanOrEqual(4.5);
    const southSide = spots.filter((s) => s.kind !== 'tree' && s.oz === 1).map((s) => s.x).sort((p, q) => p - q);
    expect(southSide.length).toBeGreaterThan(30);
    for (let i = 1; i < southSide.length; i++) expect(southSide[i] - southSide[i - 1]).toBeLessThan(4.5);
    const edge = band().children.find((c) => c.name === 'horizonEdge');
    const pos = edge.geometry.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      const out = outside(GROWN, x, z);
      expect(out, `vertex at ${x.toFixed(1)},${z.toFixed(1)}`).toBeGreaterThan(8);
      if (out <= 11) expect(y).toBeLessThanOrEqual(1.6);
    }
  });

  it('the pool is water like the core\'s pools, with its mist sheet, and a cat cannot walk on it but can wade its edge', () => {
    expect(POOL).toMatchObject({ kind: 'circle', shallow: 1.0 });
    expect(stripKids('south').some((c) => c.name === 'water:pool-south')).toBe(true);
    expect(b.inWater(ON.area.waters, POOL.x, POOL.z)).toBe(true);
    expect(isWalkableAt(ON.area, POOL.x, POOL.z)).toBe(false);
    const mist = new THREE.Box3().setFromObject(ON.scene.children.find((c) => c.name === 'marshMist'));
    expect(mist.max.z).toBeGreaterThanOrEqual(POOL.z + POOL.r - 0.01);
  });
});

describe('the strip\'s scatter', () => {
  const tiles = south.SOUTH_TILES;
  const all = tiles.map((t) => south.southTileContent(t.index));
  const trees = south.southTrees();
  const lows = all.flatMap((c) => Object.values(c.small).flat());
  const waterGap = (x, z) => b.waterClearance(ON.area.waters, x, z);
  const trailGap = (x, z) => Math.min(...south.SOUTH_TRAIL.map((s) => segDist(x, z, ...s)));
  const bankGap = (x, z) => Math.min(...south.SOUTH_COLLIDERS.map((c) => Math.hypot(x - c.x, z - c.z) - c.r));

  it('is the same on every device: a tile\'s content is a pure function of its index', async () => {
    const before = JSON.stringify(all);
    vi.resetModules();
    vi.stubGlobal('document', canvasStub);
    const again = await import('../src/world/riversouth.js');
    expect(again.southTileContent).not.toBe(south.southTileContent);
    const fresh = [...tiles].reverse().map((t) => again.southTileContent(t.index)).reverse();
    expect(JSON.stringify(fresh)).toBe(before);
    expect(south.southTileContent(5)).toBe(south.southTileContent(5));
  });

  it('every thing stands on its own tile, dry, off the trail and off the bank', () => {
    tiles.forEach((t, i) => {
      for (const p of [...all[i].trees, ...Object.values(all[i].small).flat()]) {
        expect(p.x >= t.minX && p.x <= t.maxX && p.z >= t.minZ && p.z <= t.maxZ, `${p.x},${p.z} on tile ${i}`).toBe(true);
      }
    });
    for (const p of lows) {
      expect(waterGap(p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(0.2);
      expect(trailGap(p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(1.1);
      expect(bankGap(p.x, p.z), `${p.x},${p.z}`).toBeGreaterThan(0);
    }
    for (const t of trees) {
      expect(waterGap(t.x, t.z)).toBeGreaterThanOrEqual(3);
      expect(trailGap(t.x, t.z)).toBeGreaterThanOrEqual(south.SOUTH_TRAIL_W / 2 + 1.6 * t.scale + 0.5);
      expect(bankGap(t.x, t.z)).toBeGreaterThan(3);
    }
  });

  it('no two trees crowd, in a tile or across two, nor a strip tree and a core or west strip tree', () => {
    const core = river.riverTrees();
    const others = [...core.willows, ...core.alders, ...core.pines, ...west.westTrees()];
    trees.forEach((t, i) => {
      for (const u of trees.slice(i + 1)) expect(Math.hypot(t.x - u.x, t.z - u.z)).toBeGreaterThanOrEqual(4);
      for (const u of others) expect(Math.hypot(t.x - u.x, t.z - u.z)).toBeGreaterThanOrEqual(2.5);
    });
  });

  it('is the River\'s own kinds, about half the core\'s trees outside the open meadow, thinner toward the rim', () => {
    expect(new Set(trees.map((t) => t.kind))).toEqual(new Set(['willow', 'alder']));
    for (const t of trees) expect(t.kind === 'willow').toBe(waterGap(t.x, t.z) < 10);
    // the open meadow between the old edge and the bank has none
    const open = (p) => p.z < 70 && p.x < 12;
    expect(trees.filter(open)).toEqual([]);
    const coreTrees = river.riverTrees();
    const coreDensity = (coreTrees.willows.length + coreTrees.alders.length + coreTrees.pines.length) / 10000;
    const wooded = trees.length / (140 * 40 - 102 * 20);
    expect(wooded).toBeLessThan(coreDensity * 0.75);
    expect(wooded).toBeGreaterThan(coreDensity * 0.4);
    // near half (outside the meadow) against the far half, per square metre
    const near = trees.filter((p) => p.z < 70).length / (38 * 20);
    const far = trees.filter((p) => p.z >= 70).length / (140 * 20);
    expect(near).toBeGreaterThan(far);
    const perArea = (list) => [list.filter((p) => p.z < 70).length, list.filter((p) => p.z >= 70).length];
    const [tn, tf] = perArea(all.flatMap((c) => c.small.tussock));
    expect(tn).toBeGreaterThan(1.3 * tf);
    for (const kind of ['reed', 'tussock', 'cattail', 'marigold', 'stone']) {
      expect(all.reduce((n, c) => n + c.small[kind].length, 0), kind).toBeGreaterThan(8);
    }
    // no stretch is bare: every tile has low things on it
    for (const c of all) expect(Object.values(c.small).flat().length).toBeGreaterThanOrEqual(12);
    // the reeds stand in the damp hollow and round the pool's north half
    for (const r of all.flatMap((c) => c.small.reed)) {
      const hollow = Math.hypot((r.x - south.SOUTH_HOLLOW.x) / south.SOUTH_HOLLOW.rx, (r.z - south.SOUTH_HOLLOW.z) / south.SOUTH_HOLLOW.rz) < 1;
      const rim = Math.hypot(r.x - POOL.x, r.z - POOL.z) < POOL.r + 1 && r.z < POOL.z;
      expect(hollow || rim, `${r.x},${r.z}`).toBe(true);
    }
  });

  it('every tree has its collider and its Sure Claws fork from the start of a walk', () => {
    const tail = added('colliders');
    trees.forEach((t, i) => {
      expect(tail[i]).toEqual({ x: t.x, z: t.z, r: t.r });
      expect(t.r).toBe(Math.round(0.5 * t.scale * 100) / 100);
    });
    const forks = added('perches').slice(0, trees.length);
    trees.forEach((t, i) => expect(forks[i]).toMatchObject({ x: t.x, z: t.z, kind: 'tree' }));
  });
});

describe('something to find', () => {
  const walkable = (x, z) => isWalkableAt(ON.area, x, z);
  const flood = floodFrom(ON.area, ON.area.spawn, walkable);

  it('every spot of the strip a cat can stand on is reached from the spawn on foot', () => {
    let standable = 0;
    for (let x = -90; x <= 50; x += 0.5) {
      for (let z = 50; z <= 90; z += 0.5) {
        if (!walkable(x, z)) continue;
        standable++;
        expect(flood.reaches(x, z), `${x},${z}`).toBe(true);
      }
    }
    expect(standable).toBeGreaterThan(0.9 * 281 * 81);
  });

  it('the path finder finds its way from the spawn to each find, each rest and every tile', () => {
    const nearestWalkable = (p) => {
      for (let r = 0; r < 6; r += 0.5) {
        for (let a = 0; a < Math.PI * 2; a += 0.3) {
          const q = { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r };
          if (walkable(q.x, q.z)) return q;
        }
      }
      return p;
    };
    const targets = [
      ...added('collectibles').filter((c) => c.y === undefined), ...added('scenics'), ...ON.area.rests.slice(2),
      ...south.SOUTH_TILES.map((t) => nearestWalkable({ x: (t.minX + t.maxX) / 2, z: (t.minZ + t.maxZ) / 2 })),
    ];
    expect(targets.length).toBe(3 + 1 + 2 + 14);
    for (const t of targets) {
      const way = findPath(walkable, ON.area.bounds, ON.area.spawn, t);
      expect(way, `${t.x},${t.z}`).not.toBeNull();
      const end = way[way.length - 1];
      expect(Math.hypot(end.x - t.x, end.z - t.z), `${t.x},${t.z}`).toBeLessThan(2.5);
    }
  });

  it('nothing to find or to stand on is under water, and the trail is dry and clear of every trunk and the bank', () => {
    const spots = [...added('collectibles'), ...added('scenics'), ...ON.area.rests.slice(2), ...added('perches'), ...south.southTrees()];
    for (const p of spots) expect(b.waterClearance(ON.area.waters, p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(CAT_RADIUS);
    for (const [x1, z1, x2, z2] of south.SOUTH_TRAIL) {
      for (let k = 0; k <= 30; k++) {
        const x = x1 + ((x2 - x1) * k) / 30, z = z1 + ((z2 - z1) * k) / 30;
        expect(b.waterClearance(ON.area.waters, x, z)).toBeGreaterThanOrEqual(south.SOUTH_TRAIL_W / 2);
        expect(ON.area.colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + CAT_RADIUS), `trail at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
      }
    }
  });

  it('the trail leaves the long path where the pond path does and ends by the pool, short of the bank', () => {
    const [x0, z0] = south.SOUTH_TRAIL[0];
    expect([x0, z0]).toEqual([28, 40]);
    expect(river.RIVER_PATHS.filter((s) => (s[0] === x0 && s[1] === z0) || (s[2] === x0 && s[3] === z0)).length).toBe(3);
    south.SOUTH_TRAIL.forEach((s, i) => { if (i) expect([s[0], s[1]]).toEqual([south.SOUTH_TRAIL[i - 1][2], south.SOUTH_TRAIL[i - 1][3]]); });
    const end = south.SOUTH_TRAIL[south.SOUTH_TRAIL.length - 1];
    const [ex, ez] = [end[2], end[3]];
    expect(ez).toBeGreaterThan(south.SOUTH.minZ + 10);
    expect(Math.hypot(ex - POOL.x, ez - POOL.z)).toBeLessThan(POOL.r + 6);
    expect(Math.min(...south.SOUTH_COLLIDERS.map((c) => Math.hypot(ex - c.x, ez - c.z) - c.r))).toBeGreaterThan(3);
    const kids = stripKids('south');
    expect(kids.find((c) => c.name === 'pathTrail').userData.trail.length).toBe(south.SOUTH_TRAIL.length);
    expect(kids.filter((c) => c.name === 'path' && c.visible === false).length).toBe(south.SOUTH_TRAIL.length);
  });

  it('the sand bank is a climb: four perches, each in reach of the last and higher, the first from the grass, the last the lookout', () => {
    const chain = south.SOUTH_PERCHES;
    expect(chain.length).toBe(4);
    expect(added('perches').slice(-4)).toEqual([...chain]);
    chain.forEach((p, i) => {
      expect(p.kind).toBe('stone');
      expect(p.y).toBeGreaterThan(1);
      if (i) {
        expect(p.y).toBeGreaterThan(chain[i - 1].y);
        expect(canReach(p, chain[i - 1], chain[i - 1].y, BASE_CLIMB_BUDGET)).toBe(true);
      }
    });
    const low = chain[0];
    let from = null;
    for (let r = 1.2; r < 2.6 && !from; r += 0.2) {
      for (let a = 0; a < Math.PI * 2 && !from; a += 0.2) {
        const p = { x: low.x + Math.cos(a) * r, z: low.z + Math.sin(a) * r };
        if (walkable(p.x, p.z) && flood.reachesWithin(p.x, p.z, 0.6)) from = p;
      }
    }
    expect(from).not.toBeNull();
    expect(canReach(low, from, 0, BASE_CLIMB_BUDGET)).toBe(true);
    // the top is too high to reach from the grass: the chain is the way up
    const top = chain[3];
    expect(top.y).toBeGreaterThan(BASE_CLIMB_BUDGET.climb);
    expect(top.vantage).toBe(true);
    expect(top.label).toBe('sand bank lookout');
    expect(added('collectibles')[0]).toMatchObject({ id: 'river-find-10', x: top.x, z: top.z, y: top.y });
    // the bank is solid under the perches, and its top is where the mesh's crest is
    for (const p of chain) {
      expect(walkable(p.x, p.z)).toBe(false);
      const ray = new THREE.Raycaster(new THREE.Vector3(p.x, 5, p.z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(stripKids('south').find((c) => c.name === 'sandBank'), true)[0];
      expect(hit, `${p.x},${p.z}`).toBeTruthy();
      expect(Math.abs(hit.point.y - p.y), `${p.x},${p.z}`).toBeLessThan(0.15);
    }
  });

  it('two spots to rest: a sandy hollow to nap in and a stone to drink from, both on dry ground a cat can reach', () => {
    const rests = ON.area.rests.slice(2);
    expect(rests.map((r) => `${r.id}:${r.kind}:${r.mesh}`)).toEqual(['river-nap-2:nap:false', 'river-drink-2:drink:false']);
    for (const r of rests) {
      expect(walkable(r.x, r.z), r.id).toBe(true);
      expect(flood.reachesWithin(r.x, r.z, 0.8), r.id).toBe(true);
    }
    expect(b.waterClearance(ON.area.waters, rests[1].x, rests[1].z)).toBeLessThan(1);
    const scene = new THREE.Scene();
    const all = createRests(scene, []);
    all.add(ON.area.rests);
    expect(scene.children.length).toBe(0);
    expect(all.nearest({ x: rests[1].x, z: rests[1].z - 0.5 }, 1.2)).toMatchObject({ id: 'river-drink-2', kind: 'drink' });
    expect(all.nearest({ x: rests[0].x + 0.4, z: rests[0].z }, 1.2)).toMatchObject({ id: 'river-nap-2', kind: 'nap' });
  });

  it('the sand bank is one mesh that casts, stands on the ground and rises to about 2 m', () => {
    const g = stripKids('south').find((c) => c.name === 'sandBank');
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBe(1);
    const box = new THREE.Box3().setFromObject(g);
    expect(rig.castsFromBox(box)).toBe(true);
    expect(box.min.y).toBeLessThan(0.02);
    expect(box.min.y).toBeGreaterThan(-0.1);
    expect(box.max.y).toBeGreaterThan(1.9);
    expect(box.max.y).toBeLessThan(2.6);
    expect(trianglesOf(g)).toBeLessThan(800);
    // every collider of the bank stands under the bank's mesh
    for (const c of south.SOUTH_COLLIDERS) {
      const ray = new THREE.Raycaster(new THREE.Vector3(c.x, 5, c.z), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(g, true).length, `${c.x},${c.z}`).toBeGreaterThan(0);
    }
  });

  it('every new line on screen is plain words, the same in both word sets', () => {
    const lines = () => [...added('collectibles').map((c) => c.label), ...added('scenics').map((c) => c.label), south.SOUTH_PERCHES[3].label];
    const on = lines();
    const off = withOffWords(lines);
    expect(on.length).toBe(6);
    expect(off).toEqual(on);
    for (const s of on) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(8);
      expect(s.length).toBeLessThanOrEqual(48);
      expect(bannedIn(s), s).toBeNull();
    }
    const everyLabel = [...ON.area.collectibles, ...ON.area.scenics].map((c) => c.label);
    expect(new Set(everyLabel).size).toBe(everyLabel.length);
  });
});

// ---------------------------------------------------------------------------
// The budget with both strips (test/helpers/growbudget.js, counted as
// test/budget.test.js counts): at the worst place a cat can stand on the
// whole grown River, everything always drawn, every slot within its layer's
// `hide` range in full and the stand-ins of every other.
//
//                                   meshes  casters  triangles
//   the River today (switch off)       170      133     63,778
//   step 2, core + west, (-35, 0)      205      147     68,745
//   step 3, core + west + south,
//     at its worst spot, (-35, 0)      212      148     69,5xx
//
// The worst spot is still by the reedbed. The south strip's share there is
// what is always drawn (its ground, pool, paint, trail and sand bank: 7 meshes
// of which 2 are hidden data strips) and its far stand-ins; none of its trees
// is in range. To fit, the strips' ground is drawn on a 5 m grid (-2,500
// triangles over both), the hills a little coarser (-470 on step 2's) and
// the west strip's tussocks fewer and bigger (-1,000): the numbers are in
// docs/superpowers/specs/2026-11-19-bigger-areas-riversouth.md.
// ---------------------------------------------------------------------------
describe('the budget, switch on: the most the grown River puts on screen at once', () => {
  const CEILING = { meshes: 222, casters: 155, triangles: 70000 };
  const built = buildRiver(river, setGrow, true);
  mergeStaticProps(built.scene);
  rig.assignShadowCasters(built.scene);
  const tiles = createStripTiles(built.scene, { strips: built.area.strips.map((s) => ({ ...s, layers: ALL_LAYERS })) });
  tiles.settle(0, 0);
  const m = measureStreams(built.scene, tiles, built.area.strips, rig);
  const worst = worstSpot(m, LAYERS, built.area.bounds, 5);

  it(`at the worst spot stays under ${CEILING.meshes} meshes, ${CEILING.casters} casters and ${CEILING.triangles} triangles`, () => {
    if (process.env.BUDGET_LOG) console.log('south budget', JSON.stringify({ fixed: m.fixed, always: m.always, worst }));
    expect(worst.meshes).toBeLessThanOrEqual(CEILING.meshes);
    expect(worst.casters).toBeLessThanOrEqual(CEILING.casters);
    expect(worst.triangles).toBeLessThanOrEqual(CEILING.triangles);
    expect(worst.meshes).toBeGreaterThan(CEILING.meshes * 0.92);
    expect(worst.casters).toBeGreaterThan(CEILING.casters * 0.92);
    expect(worst.triangles).toBeGreaterThan(CEILING.triangles * 0.95);
  });

  it('anywhere in the south strip it is well under: the strip is never the busiest place', () => {
    let most = 0;
    for (let x = -90; x <= 50; x += 5) for (let z = 50; z <= 90; z += 5) most = Math.max(most, m.at(x, z, LAYERS).triangles);
    expect(most).toBeLessThan(CEILING.triangles * 0.85);
  });

  it('from the spawn, in the east, the River costs less than today', () => {
    const here = m.at(river.SPAWN.x, river.SPAWN.z, LAYERS);
    expect(here.triangles).toBeLessThan(63778);
    expect(here.meshes).toBeLessThan(170);
  });

  it('the south strip\'s stand-ins are cheap beside what they stand in for', () => {
    const standIn = [...m.standIn].filter(([k]) => k.startsWith('south|')).reduce((n, [, c]) => n + c, 0);
    const full = [...m.cost].filter(([k]) => k.startsWith('south|')).reduce((n, [, c]) => n + c.triangles, 0);
    expect(standIn).toBeGreaterThan(500);
    expect(standIn).toBeLessThan(0.35 * full);
  });
});

// ---------------------------------------------------------------------------
// A walk along the trail to the bank, west along the strip to the corner, up
// into the west strip and back, at the zoomies, with the walk's own wind,
// decals, tree fade and caster rule, as test/striptiles.test.js walks the west.
// ---------------------------------------------------------------------------
const ZOOMIES = 8;
const DT = 1 / 60;
const ROUTE = [[44, 40], [28, 40], [8, 57], [-6.5, 68.5], [-6, 84], [-40, 86], [-84, 80], [-84, 55], [-80, 20], [-30, 52], [44, 40]];
function* walkRoute(speed) {
  for (let i = 1; i < ROUTE.length; i++) {
    const [x0, z0] = ROUTE[i - 1], [x1, z1] = ROUTE[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (speed * DT)));
    for (let k = 1; k <= n; k++) yield [x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n];
  }
}

describe('a walk round the south strip and back, at the zoomies', () => {
  const wind = createWind({});
  const { scene, area } = buildRiver(river, setGrow, true, { wind });
  const decals = createContactShadows(scene);
  mergeStaticProps(scene);
  rig.assignShadowCasters(scene);
  const occluders = findOccluders(scene);
  const fade = createTreeFade([...occluders]);
  const tiles = createStripTiles(scene, { strips: area.strips, wind, decals, occluders, treeFade: () => fade });
  const isSouth = (o) => o.userData.stripTile !== undefined && o.userData.strip === 'south';
  const si = area.strips.findIndex((s) => s.id === 'south');
  const streamer = tiles.streamers[si];
  const allSlots = tiles.streamers.flatMap((st, i) => st.slots.map((sl) => ({ sl, key: `${area.strips[i].id}|${sl.tile.index}|${sl.layer.id}` })))
    .filter(({ key }) => tiles.standIns.has(key));
  const sinceInRange = new Map(streamer.slots.map((s) => [s, 0]));
  let gap = null, wrongState = null, worstUnbuilt = 0, peakTrees = 0;
  const made = new Set();
  let freed = 0;
  for (const [x, z] of walkRoute(ZOOMIES)) {
    tiles.update(DT, x, z);
    for (const s of streamer.slots) {
      const d = tileDistance(s.tile, x, z);
      const t = d < s.layer.show ? sinceInRange.get(s) + DT : 0;
      sinceInRange.set(s, t);
      if (s.state !== BUILT && t > worstUnbuilt) worstUnbuilt = t;
      if (d > s.layer.hide + ZOOMIES * (CHECK_EVERY + DT) && s.state !== ABSENT) wrongState = `${s.layer.id}:${s.tile.index} at ${x.toFixed(1)},${z.toFixed(1)}`;
    }
    for (const { sl, key } of allSlots) {
      if (sl.state !== BUILT && !tiles.standIns.shown(key) && !gap) gap = `${key} at ${x.toFixed(1)},${z.toFixed(1)}`;
      if (sl.state === BUILT && tiles.standIns.shown(key) && !gap) gap = `${key} doubled at ${x.toFixed(1)},${z.toFixed(1)}`;
    }
    const now = scene.children.filter(isSouth);
    peakTrees = Math.max(peakTrees, now.filter((o) => o.userData.occluder).length);
    for (const o of now) {
      o.traverse((q) => {
        if (!q.isMesh || made.has(q.geometry)) return;
        made.add(q.geometry);
        q.geometry.addEventListener('dispose', () => { freed++; });
      });
    }
  }

  it('draws every south tree on the way and never leaves a slot undrawn or drawn twice', () => {
    expect(peakTrees).toBe(south.southTrees().length);
    expect(gap).toBeNull();
    expect(wrongState).toBeNull();
  });

  it('keeps to the frame budget and draws a tile in range within half a second', () => {
    expect(streamer.stats.maxFrameTriangles).toBeGreaterThan(0);
    expect(streamer.stats.maxFrameTriangles).toBeLessThanOrEqual(FRAME_TRIANGLES);
    expect(worstUnbuilt).toBeGreaterThan(0);
    expect(worstUnbuilt).toBeLessThanOrEqual(0.5);
  });

  it('frees everything it made once the strip tiles go', () => {
    expect(made.size).toBeGreaterThan(20);
    tiles.dispose();
    expect(freed).toBe(made.size);
    expect(scene.children.filter(isSouth)).toEqual([]);
  });
});
