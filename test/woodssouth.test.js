import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub, buildRiver as buildArea, fingerprint, budgetOf, trianglesOf } from './helpers/growriver.js';
import { floodFrom } from './helpers/flood.js';
import { bannedIn, withOffWords } from './helpers/offwords.js';

// Bigger areas, step 3 (docs/superpowers/specs/2026-11-19-bigger-areas-woods.md):
// the Woods' south strip, behind the switch in src/grow.js.
//
// Three things are proved here, as test/riverwest.test.js proves them for the
// River:
//   * with the switch off the Woods is today's (the rest of the suite, which
//     runs with it off and is untouched, is the larger half of that proof);
//   * with it on, the old 100 x 100 m core did not move by a bit: every
//     object the core builds is byte-identical, in the same order, on the
//     same Math.random draws, apart from the two that are meant to reach the
//     strip (the ground's apron past the old edge, the hills);
//   * the strip itself is sound: the same on every device, dry, reachable,
//     with a collider under every trunk and something to find.

vi.stubGlobal('document', canvasStub);

const woods = await import('../src/world/woods.js');
const south = await import('../src/world/woodssouth.js');
const b = await import('../src/world/builder.js');
const { setGrow } = await import('../src/grow.js');
const rig = await import('../src/render/rig.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { findPath } = await import('../src/pathfind.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { rainPuddleSpots } = await import('../src/weather.js');
const { roamHomes } = await import('../src/clancast.js');
const { clanWalkableFor } = await import('../src/world/clanground.js');
const { buildGrassMask, flatFootprints } = await import('../src/render/grass.js');
const { buildMapLayer } = await import('../src/ui/minimap.js');
const { mulberry32 } = await import('../src/rng.js');
const { segDist } = await import('../src/segdist.js');
const { createRests } = await import('../src/rests.js');

// The first build of a process makes the shared surface textures (and draws
// their uuids); every later one does not. Throw one away so the counts compare.
buildArea(woods, setGrow, false);
const OFF = buildArea(woods, setGrow, false);
const ON = buildArea(woods, setGrow, true);
const CORE = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
const GROWN = { minX: -50, maxX: 50, minZ: -50, maxZ: 90 };
const isStrip = (o) => o.userData.strip !== undefined;
const coreKids = ON.scene.children.filter((c) => !isStrip(c));
const stripKids = ON.scene.children.filter(isStrip);
// The two core objects that are meant to reach the strip: the ground (its
// apron past the old edge wears the strip's floor) and the hills.
const isGround = (c) => c.userData.ground === true && c.geometry?.parameters?.width === 120;
const REACHING = ['ground', 'horizonBand'];
const nameOf = (c) => (isGround(c) ? 'ground' : c.name);

describe('the switch', () => {
  it('off: the Woods is the 100 m square it was, with no strip in its data', () => {
    expect(OFF.area.bounds).toEqual(CORE);
    expect(OFF.area.core).toBeUndefined();
    expect(OFF.area.strips).toBeUndefined();
    expect(OFF.area.rests).toBeUndefined();
    expect(OFF.area.waters).toBe(woods.WOODS_WATERS);
    expect(OFF.scene.children.some(isStrip)).toBe(false);
    expect(OFF.scene.children.filter((o) => o.userData.stream !== undefined)).toEqual([]);
  });

  it('on: the walkable bounds are the core and the south strip, z -50..90, the core\'s streams first', () => {
    expect(ON.area.bounds).toEqual(GROWN);
    expect(ON.area.core).toEqual(CORE);
    expect(ON.area.strips.map((s) => s.id)).toEqual(['core', 'core-fine', 'south']);
    expect(ON.area.strips[2]).toBe(south.SOUTH_STRIP);
    // the core's streams cover the grown rectangle: the strip's own ferns,
    // brambles and floor ride them
    expect(ON.area.strips[0].rect).toEqual(GROWN);
    expect(south.SOUTH).toMatchObject({ minX: -50, maxX: 50, minZ: 50, maxZ: 90 });
    expect(south.SOUTH_TILES.length).toBe(10);
  });
});

describe('with the switch on, the core did not move', () => {
  it('the build takes exactly the same Math.random draws', () => {
    expect(ON.draws).toBe(OFF.draws);
  });

  it('the core\'s objects are the same, in the same order, and the strip\'s come after them', () => {
    expect(coreKids.length).toBe(OFF.scene.children.length);
    expect(ON.scene.children.slice(0, coreKids.length)).toEqual(coreKids);
    expect(coreKids.map((c) => `${c.type}:${c.name}`)).toEqual(OFF.scene.children.map((c) => `${c.type}:${c.name}`));
  });

  it('every core object is byte-identical, but for the ground and the hills', () => {
    const differing = [];
    OFF.scene.children.forEach((c, i) => {
      if (fingerprint(c).join('\n') !== fingerprint(coreKids[i]).join('\n')) differing.push(nameOf(c));
    });
    expect(differing).toEqual(REACHING);
  });

  it('the ground is today\'s up to the old edge: only its apron past z 50 is tinted anew', () => {
    const off = OFF.scene.children.find(isGround), on = coreKids.find(isGround);
    for (const name of ['position', 'normal', 'uv']) {
      expect(on.geometry.attributes[name].array).toEqual(off.geometry.attributes[name].array);
    }
    off.updateMatrixWorld(true);
    const pos = off.geometry.attributes.position, ca = off.geometry.attributes.color, cb = on.geometry.attributes.color;
    const v = new THREE.Vector3();
    let inner = 0, apron = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(off.matrixWorld);
      const same = ca.getX(i) === cb.getX(i) && ca.getY(i) === cb.getY(i) && ca.getZ(i) === cb.getZ(i);
      if (v.z <= 50 + 1e-6) { expect(same, `${v.x},${v.z}`).toBe(true); inner++; } else if (!same) apron++;
    }
    expect(inner).toBeGreaterThan(2000);
    expect(apron).toBeGreaterThan(50);
    // and the grass reads the same tint the core's ground does, up to the old edge
    const tint = woods.GRASS_HOOKS.tint;
    for (const [x, z] of [[0, 0], [-30, 40], [44, 50], [10, -45]]) expect(tint(x, z)).toEqual(woods.woodsGroundTint(x, z));
  });

  it('the hills keep today\'s cottages and their lit windows, standing where they stood', () => {
    const off = OFF.scene.children.find((c) => c.name === 'horizonBand');
    const on = coreKids.find((c) => c.name === 'horizonBand');
    // the same mesh the square band was built as (same order in the scene, so
    // the same draws), its material as it was
    expect(coreKids.indexOf(on)).toBe(OFF.scene.children.indexOf(off));
    expect(on.material.color.getHex()).toBe(off.material.color.getHex());
    const RING = 152 * 13;
    const pOff = off.geometry.attributes.position.array, pOn = on.geometry.attributes.position.array;
    const houses = pOff.length - RING * 3;
    expect(houses).toBeGreaterThan(300);
    // the cottages are the tail of both: the same vertices, after a longer ring
    expect(Array.from(pOn.slice(pOn.length - houses))).toEqual(Array.from(pOff.slice(RING * 3)));
    const kids = (m) => m.children.map((c) => c.name);
    expect(kids(on)).toEqual(kids(off));
    const lights = (m) => m.children.find((c) => c.name !== 'horizonEdge');
    expect(fingerprint(lights(on))).toEqual(fingerprint(lights(off)));
  });

  it('the scatter lists are what they were', () => {
    const lists = () => JSON.stringify([woods.woodsTreeSpots(), woods.woodsUndergrowth(), woods.woodsFloor()]);
    setGrow(false);
    const off = lists();
    setGrow(true);
    const on = lists();
    setGrow(null);
    expect(on).toBe(off);
  });

  it('the area\'s lists start with the core\'s own, unchanged', () => {
    const plain = (list) => list.map((p) => JSON.stringify(p));
    const { area: a } = OFF;
    const { area: g } = ON;
    expect(plain(g.colliders.slice(0, a.colliders.length))).toEqual(plain(a.colliders));
    expect(plain(g.perches.slice(0, a.perches.length))).toEqual(plain(a.perches));
    expect(plain(g.collectibles.slice(0, a.collectibles.length))).toEqual(plain(a.collectibles));
    expect(plain(g.scenics.slice(0, a.scenics.length))).toEqual(plain(a.scenics));
    for (const key of ['pois', 'critterSpawns', 'moments', 'puddles', 'spawn', 'boxes', 'tippables', 'groundBounce', 'skyDusk']) {
      expect(JSON.stringify(g[key]), key).toBe(JSON.stringify(a[key]));
    }
    // the waters keep theirs, and the spring comes after them
    expect(g.waters.slice(0, a.waters.length)).toEqual([...a.waters]);
    for (const [i, w] of a.waters.entries()) expect(g.waters[i]).toBe(w);
    expect(g.waters[a.waters.length]).toBe(south.SPRING);
  });

  it('the core is as many meshes and casters as today, and its triangles differ only in the hills', () => {
    const offScene = buildArea(woods, setGrow, false).scene;
    const onScene = buildArea(woods, setGrow, true).scene;
    const built = budgetOf(offScene.children, rig);
    const core = (scene) => scene.children.filter((c) => !isStrip(c));
    const same = (scene) => core(scene).filter((c) => c.name !== 'horizonBand');
    expect(budgetOf(same(onScene), rig)).toEqual(budgetOf(same(offScene), rig));
    mergeStaticProps(offScene);
    mergeStaticProps(onScene);
    const off = budgetOf(offScene.children, rig);
    const on = budgetOf(core(onScene), rig);
    // today's Woods, as test/budget.test.js counts it
    expect(built.triangles).toBe(68810);
    expect(off).toEqual({ meshes: 182, casters: 152, triangles: 68810 });
    expect(on.meshes).toBe(off.meshes);
    expect(on.casters).toBe(off.casters);
    const band = (scene) => trianglesOf(scene.children.find((c) => c.name === 'horizonBand'));
    expect(on.triangles - off.triangles).toBe(band(onScene) - band(offScene));
    expect(on.triangles - off.triangles).toBeLessThanOrEqual(2500);
  });
});

describe('what a walk reads from the bounds', () => {
  it('the walk\'s seeded spots stay on the core: rain puddles and the clan\'s roam homes are today\'s', () => {
    expect(rainPuddleSpots(ON.area, mulberry32(5))).toEqual(rainPuddleSpots(OFF.area, mulberry32(5)));
    for (const s of rainPuddleSpots(ON.area, mulberry32(9), 40)) expect(s.z).toBeLessThanOrEqual(50);
    const homes = (area) => {
      const clanArea = { ...area, colliders: Object.freeze(area.colliders.map((c) => ({ ...c }))) };
      return roamHomes('woods', clanArea, clanWalkableFor(clanArea, 'woods'));
    };
    expect(homes(ON.area)).toEqual(homes(OFF.area));
    expect(homes(ON.area).length).toBeGreaterThan(0);
  });

  it('the cat, the map, the grass and the path finder use the grown bounds', () => {
    expect(isWalkableAt(ON.area, 30, 84)).toBe(true);
    expect(isWalkableAt(OFF.area, 30, 84)).toBe(false);
    expect(isWalkableAt(ON.area, 30, 90.5)).toBe(false);
    expect(buildMapLayer(ON.area, ON.scene).edge).toEqual(GROWN);
    const mask = buildGrassMask(ON.area, flatFootprints(ON.scene));
    expect(mask.at(30, 84)).toBe(1);
    expect(mask.at(30, 95)).toBe(0);
    // no grass on the hollow's sand
    expect(mask.at(south.HOLLOW.x, south.HOLLOW.z)).toBe(0);
    expect(mask.at(south.HOLLOW.x + 3, south.HOLLOW.z + 1)).toBe(0);
    const walkable = (x, z) => isWalkableAt(ON.area, x, z);
    const way = findPath(walkable, ON.area.bounds, ON.area.spawn, { x: -41, z: 85 });
    expect(way).not.toBeNull();
    expect(way[way.length - 1].z).toBeGreaterThan(83);
  });
});

describe('the ground and the hills reach the new edge', () => {
  const ground = () => coreKids.find(isGround);
  const patch = () => stripKids.find((c) => c.name === 'stripGround');

  it('the strip\'s ground is more of the same plane: same material, and no seam where they meet', () => {
    const g = ground(), p = patch();
    expect(p.material).toBe(g.material);
    expect(p.userData.ground).toBe(true);
    g.updateMatrixWorld(true); p.updateMatrixWorld(true);
    const at = (mesh) => {
      const m = new Map();
      const pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color, uv = mesh.geometry.attributes.uv;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        if (Math.abs(v.z - 60) > 1e-6) continue;
        expect(Math.abs(v.y)).toBeLessThan(1e-9);
        m.set(Math.round(v.x * 100), [col.getX(i), col.getY(i), col.getZ(i), uv.getX(i), uv.getY(i)]);
      }
      return m;
    };
    const a = at(g), c = at(p);
    expect(a.size).toBe(49); // the plane's 2.5 m grid, x -60..60
    expect([...c.keys()].sort()).toEqual([...a.keys()].sort());
    for (const [x, va] of a) va.forEach((n, k) => expect(c.get(x)[k], `x ${x / 100} component ${k}`).toBeCloseTo(n, 5));
    const box = new THREE.Box3().setFromObject(p);
    expect(box.min.x).toBeCloseTo(-60, 6);
    expect(box.max.x).toBeCloseTo(60, 6);
    expect(box.min.z).toBeCloseTo(60, 6);
    expect(box.max.z).toBeCloseTo(100, 6);
  });

  it('the ground\'s tint meets the core\'s at the old edge, and is plain again at the grown ground\'s edge', () => {
    const t = woods.woodsGroundTint;
    for (let x = -48; x <= 48; x += 4) {
      const core = t(x, 50), past = t(x, 50.01);
      core.forEach((n, k) => expect(past[k]).toBeCloseTo(n, 2));
    }
    for (let x = -60; x <= 60; x += 5) expect(t(x, 100)).toEqual([1, 1, 1]);
    for (let z = 60; z <= 100; z += 5) { expect(t(60, z)).toEqual([1, 1, 1]); expect(t(-60, z)).toEqual([1, 1, 1]); }
  });

  const outside = (bd, x, z) => Math.max(x - bd.maxX, bd.minX - x, z - bd.maxZ, bd.minZ - z);
  const band = () => coreKids.find((c) => c.name === 'horizonBand');

  it('the hills ring the grown ground: their inner rim is 6 m outside the bounds all round', () => {
    const pos = band().geometry.attributes.position;
    const RING = 184 * 13;
    let nearest = Infinity;
    for (let v = 0; v < RING; v++) nearest = Math.min(nearest, outside(GROWN, pos.getX(v), pos.getZ(v)));
    expect(nearest).toBeCloseTo(6, 6);
    for (let v = 0; v < RING; v++) {
      if (outside(GROWN, pos.getX(v), pos.getZ(v)) <= 15) expect(pos.getY(v)).toBeLessThan(0.31);
    }
    // nothing of the band, cottages included, stands on the walkable ground
    for (let v = 0; v < pos.count; v++) expect(outside(GROWN, pos.getX(v), pos.getZ(v))).toBeGreaterThan(5.9);
    const box = new THREE.Box3().setFromBufferAttribute(pos);
    expect(box.max.z).toBeCloseTo(156, 5);
    expect(box.min.z).toBeCloseTo(-116, 5);
  });

  it('the edge\'s scrub and trees moved out with it: none is left standing where the old edge was', () => {
    const edge = band().children.find((c) => c.name === 'horizonEdge');
    const pos = edge.geometry.attributes.position;
    expect(pos.count).toBeGreaterThan(1000);
    let south = 0;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      const out = outside(GROWN, x, z);
      expect(out, `vertex at ${x.toFixed(1)},${z.toFixed(1)}`).toBeGreaterThan(8);
      if (out <= 11) expect(y).toBeLessThanOrEqual(1.6);
      if (z > 95) south++;
      expect(z < 50 || z > 95 || Math.abs(x) > 55, `vertex at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
    }
    expect(south).toBeGreaterThan(200);
  });
});

describe('the strip\'s scatter', () => {
  const tiles = south.SOUTH_TILES;
  const all = tiles.map((t) => south.southTileContent(t.index));
  const trees = south.southTrees();
  const waterGap = (x, z) => b.waterClearance(ON.area.waters, x, z);
  const lows = all.flatMap((c) => Object.values(c.small).flat());
  const trailGap = (x, z) => Math.min(...south.SOUTH_TRAIL.map((s) => segDist(x, z, ...s)));

  it('is the same on every device: a tile\'s content is a pure function of its index', async () => {
    const before = JSON.stringify([all, south.southFerns(), south.southBrambles(), south.southFloor()]);
    vi.resetModules();
    vi.stubGlobal('document', canvasStub);
    const again = await import('../src/world/woodssouth.js');
    expect(again.southTileContent).not.toBe(south.southTileContent);
    // asked for in another order, so one tile cannot lean on another's stream
    const fresh = [...tiles].reverse().map((t) => again.southTileContent(t.index)).reverse();
    expect(JSON.stringify([fresh, again.southFerns(), again.southBrambles(), again.southFloor()])).toBe(before);
    expect(south.southTileContent(3)).toBe(south.southTileContent(3));
  });

  it('every thing stands on its own tile, dry, off the trail, off the hollow\'s floor and bank', () => {
    tiles.forEach((t, i) => {
      for (const p of [...all[i].trees, ...Object.values(all[i].small).flat()]) {
        expect(p.x >= t.minX && p.x <= t.maxX && p.z >= t.minZ && p.z <= t.maxZ, `${p.x},${p.z} on tile ${i}`).toBe(true);
      }
    });
    const bank = south.SOUTH_COLLIDERS;
    for (const p of [...lows, ...south.southFerns(), ...south.southBrambles()]) {
      expect(waterGap(p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(0.3);
      expect(trailGap(p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(1.0);
      expect(Math.hypot((p.x - south.HOLLOW.x) / south.HOLLOW.rx, (p.z - south.HOLLOW.z) / south.HOLLOW.rz), `${p.x},${p.z}`).toBeGreaterThan(1.2);
    }
    for (const t of trees) {
      expect(waterGap(t.x, t.z)).toBeGreaterThanOrEqual(3);
      expect(trailGap(t.x, t.z)).toBeGreaterThanOrEqual(south.SOUTH_TRAIL_W / 2 + 1.6 * t.scale + 0.5);
      for (const c of bank) expect(Math.hypot(t.x - c.x, t.z - c.z)).toBeGreaterThan(2.5 + c.r);
    }
  });

  it('no two trees crowd, in a tile or across two, nor a strip tree and a core tree', () => {
    const core = woods.woodsTreeSpots();
    trees.forEach((t, i) => {
      for (const u of trees.slice(i + 1)) expect(Math.hypot(t.x - u.x, t.z - u.z)).toBeGreaterThanOrEqual(4);
      for (const u of core) expect(Math.hypot(t.x - u.x, t.z - u.z)).toBeGreaterThanOrEqual(4);
    });
  });

  it('is the Woods\' own kinds, thinner than the core and thinner again toward the rim', () => {
    expect(new Set(trees.map((t) => t.kind))).toEqual(new Set(['oak', 'round', 'birch']));
    for (const t of trees) expect(t.kind).toBe(b.canopyKind(t.x, t.z));
    const ratio = (n, core) => (n / 4000) / (core / 10000);
    const core = woods.woodsTreeSpots().length;
    const u = woods.woodsUndergrowth();
    expect(ratio(trees.length, core)).toBeLessThan(0.75);
    expect(ratio(trees.length, core)).toBeGreaterThan(0.4);
    expect(ratio(south.southFerns().length, u.ferns.length)).toBeLessThan(0.75);
    expect(ratio(south.southFerns().length, u.ferns.length)).toBeGreaterThan(0.4);
    expect(ratio(south.southBrambles().length, u.brambles.length)).toBeLessThan(0.75);
    const near = (list) => list.filter((p) => p.z < 70).length;
    expect(near(trees)).toBeGreaterThan(trees.length - near(trees));
    expect(near(south.southFerns())).toBeGreaterThan(south.southFerns().length - near(south.southFerns()));
    for (const kind of ['tussock', 'stone', 'marigold']) {
      expect(all.reduce((n, c) => n + c.small[kind].length, 0), kind).toBeGreaterThan(5);
    }
    const floor = south.southFloor();
    expect(floor.leaves.length).toBeGreaterThan(200);
    expect(floor.bluebells.length).toBeGreaterThan(50);
    // the bluebells are the glade's
    for (const p of floor.bluebells) expect(Math.hypot(p.x - south.GLADE.x, p.z - south.GLADE.z)).toBeLessThanOrEqual(south.GLADE.r + 1);
    // no tile is bare: every tile has low things or undergrowth on it
    tiles.forEach((t, i) => {
      const on = (p) => p.x >= t.minX && p.x < t.maxX && p.z >= t.minZ && p.z < t.maxZ;
      const n = Object.values(all[i].small).flat().length + south.southFerns().filter(on).length;
      expect(n, `tile ${i}`).toBeGreaterThanOrEqual(8);
    });
  });

  it('every tree has its collider and its Sure Claws fork from the start of a walk', () => {
    const tail = ON.area.colliders.slice(OFF.area.colliders.length);
    expect(tail.length).toBe(trees.length + south.SOUTH_COLLIDERS.length);
    trees.forEach((t, i) => {
      expect(tail[i]).toEqual({ x: t.x, z: t.z, r: t.r });
      expect(t.r).toBe(Math.round(0.5 * t.scale * 100) / 100); // the core's rule
    });
    const forks = ON.area.perches.slice(OFF.area.perches.length, OFF.area.perches.length + trees.length);
    trees.forEach((t, i) => expect(forks[i]).toMatchObject({ x: t.x, z: t.z, kind: 'tree' }));
  });
});

describe('something to find', () => {
  const walkable = (x, z) => isWalkableAt(ON.area, x, z);
  const flood = floodFrom(ON.area, ON.area.spawn, walkable);
  const added = (key) => ON.area[key].slice(OFF.area[key].length);

  it('every spot of the strip a cat can stand on is reached from the spawn on foot, the hollow\'s floor too', () => {
    let standable = 0;
    for (let x = -50; x <= 50; x += 0.5) {
      for (let z = 50; z <= 90; z += 0.5) {
        if (!walkable(x, z)) continue;
        standable++;
        expect(flood.reaches(x, z), `${x},${z}`).toBe(true);
      }
    }
    expect(standable).toBeGreaterThan(0.9 * 201 * 81);
    expect(flood.reaches(south.HOLLOW.x, south.HOLLOW.z)).toBe(true);
  });

  it('the hollow\'s bank is closed but for its two gaps: the floor is reached through them and nowhere else', () => {
    const inside = (x, z) => Math.hypot((x - south.HOLLOW.x) / 6.5, (z - south.HOLLOW.z) / 5.6) < 0.85;
    // walking only within the bank's oval (and 2 m past it), the floor joins
    // the outside at the north gap and the south-east gap
    const ring = (x, z) => Math.hypot((x - south.HOLLOW.x) / 6.5, (z - south.HOLLOW.z) / 5.6);
    const ways = [];
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      let open = true;
      for (let t = 0.6; t <= 1.35; t += 0.02) {
        const x = south.HOLLOW.x + Math.cos(a) * 6.5 * t, z = south.HOLLOW.z + Math.sin(a) * 5.6 * t;
        if (!walkable(x, z)) { open = false; break; }
      }
      if (open) ways.push(a);
    }
    expect(ways.length).toBeGreaterThan(4);
    const near = (a, g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.32;
    for (const a of ways) expect(near(a, -Math.PI / 2) || near(a, 0.7), `open at ${a.toFixed(2)}`).toBe(true);
    expect(ways.some((a) => near(a, -Math.PI / 2))).toBe(true);
    expect(ways.some((a) => near(a, 0.7))).toBe(true);
    expect(inside(south.HOLLOW.x, south.HOLLOW.z) && ring(south.HOLLOW.x, south.HOLLOW.z) === 0).toBe(true);
  });

  it('the path finder finds its way from the core to each find, each rest and every tile', () => {
    const targets = [
      ...added('collectibles').filter((c) => c.y === undefined), ...added('scenics'), ...ON.area.rests,
      ...south.SOUTH_TILES.map((t) => ({ x: (t.minX + t.maxX) / 2, z: (t.minZ + t.maxZ) / 2 })),
    ];
    expect(targets.length).toBe(3 + 1 + 2 + 10);
    for (const t of targets) {
      const way = findPath(walkable, ON.area.bounds, ON.area.spawn, t);
      expect(way, `${t.x},${t.z}`).not.toBeNull();
      const end = way[way.length - 1];
      expect(Math.hypot(end.x - t.x, end.z - t.z), `${t.x},${t.z}`).toBeLessThan(2.5);
    }
  });

  it('nothing to find or to stand on is under water, and the trail is clear of every trunk', () => {
    const spots = [...added('collectibles'), ...added('scenics'), ...ON.area.rests, ...added('perches'), ...south.southTrees()];
    for (const p of spots) expect(b.waterClearance(ON.area.waters, p.x, p.z), `${p.x},${p.z}`).toBeGreaterThanOrEqual(CAT_RADIUS);
    for (const [x1, z1, x2, z2] of south.SOUTH_TRAIL) {
      for (let k = 0; k <= 20; k++) {
        const x = x1 + ((x2 - x1) * k) / 20, z = z1 + ((z2 - z1) * k) / 20;
        expect(b.waterClearance(ON.area.waters, x, z)).toBeGreaterThanOrEqual(south.SOUTH_TRAIL_W / 2);
        expect(ON.area.colliders.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + CAT_RADIUS), `trail at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
      }
    }
  });

  it('the trail leaves the long path at its bend and ends in the hollow\'s north gap', () => {
    const [x0, z0] = south.SOUTH_TRAIL[0];
    expect(woods.WOODS_PATHS.some((s) => (s[0] === x0 && s[1] === z0) || (s[2] === x0 && s[3] === z0))).toBe(true);
    south.SOUTH_TRAIL.forEach((s, i) => { if (i) expect([s[0], s[1]]).toEqual([south.SOUTH_TRAIL[i - 1][2], south.SOUTH_TRAIL[i - 1][3]]); });
    const end = south.SOUTH_TRAIL[south.SOUTH_TRAIL.length - 1];
    expect(Math.hypot(end[2] - south.HOLLOW.x, end[3] - south.HOLLOW.z)).toBeLessThan(south.HOLLOW.rz + 0.5);
    const mesh = stripKids.find((c) => c.name === 'pathTrail');
    expect(mesh.userData.trail.length).toBeGreaterThanOrEqual(south.SOUTH_TRAIL.length);
    expect(stripKids.filter((c) => c.name === 'path' && c.visible === false).length).toBe(south.SOUTH_TRAIL.length);
  });

  it('the old stump is a climb: up its great root to the shelf, the lookout, which plain claws cannot jump to from the grass', () => {
    const [knuckle, shelf] = south.SOUTH_PERCHES;
    expect(added('perches').slice(-2)).toEqual([knuckle, shelf]);
    expect(knuckle.kind).toBe('tree');
    expect(shelf.kind).toBe('tree');
    expect(shelf.vantage).toBe(true);
    expect(shelf.label).toBe('old stump lookout');
    expect(canReach(shelf, knuckle, knuckle.y, BASE_CLIMB_BUDGET)).toBe(true);
    // from the sand beside the knuckle
    let from = null;
    for (let a = 0; a < Math.PI * 2 && !from; a += 0.2) {
      const p = { x: knuckle.x + Math.cos(a) * 0.8, z: knuckle.z + Math.sin(a) * 0.8 };
      if (walkable(p.x, p.z) && flood.reachesWithin(p.x, p.z, 0.6)) from = p;
    }
    expect(from).not.toBeNull();
    expect(canReach(knuckle, from, 0, BASE_CLIMB_BUDGET)).toBe(true);
    // no grass spot reaches the shelf in one jump
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      for (const d of [1.6, 2, 2.5]) {
        const p = { x: shelf.x + Math.cos(a) * d, z: shelf.z + Math.sin(a) * d };
        if (walkable(p.x, p.z)) expect(canReach(shelf, p, 0, BASE_CLIMB_BUDGET)).toBe(false);
      }
    }
    // the seed lies on the shelf, and the stump is solid under both perches
    expect(added('collectibles')[0]).toMatchObject({ id: 'woods-find-6', x: shelf.x, z: shelf.z, y: shelf.y });
    for (const p of [knuckle, shelf]) expect(walkable(p.x, p.z)).toBe(false);
    // the stump's mesh reaches the shelf and no higher than the camera can see over
    const g = stripKids.find((c) => c.name === 'sandyHollow');
    const box = new THREE.Box3().setFromObject(g);
    expect(box.max.y).toBeGreaterThan(shelf.y);
    expect(box.max.y).toBeLessThan(shelf.y + 0.7);
  });

  it('two spots to rest: a sunny patch of sand to nap on and the spring to drink from, both on dry ground a cat can reach', () => {
    expect(ON.area.rests.map((r) => `${r.id}:${r.kind}:${r.mesh}`)).toEqual(['woods-nap-1:nap:false', 'woods-drink-1:drink:false']);
    for (const r of ON.area.rests) {
      expect(walkable(r.x, r.z), r.id).toBe(true);
      expect(flood.reaches(Math.round(r.x * 2) / 2, Math.round(r.z * 2) / 2) || flood.reachesWithin(r.x, r.z, 0.8), r.id).toBe(true);
    }
    const [nap, drink] = ON.area.rests;
    expect(Math.hypot((nap.x - south.HOLLOW.x) / south.HOLLOW.rx, (nap.z - south.HOLLOW.z) / south.HOLLOW.rz)).toBeLessThan(0.5);
    expect(b.waterClearance(ON.area.waters, drink.x, drink.z)).toBeLessThan(1);
    const scene = new THREE.Scene();
    const rests = createRests(scene, []);
    rests.add(ON.area.rests);
    expect(scene.children.length).toBe(0);
    expect(rests.colliders).toEqual([]);
    expect(rests.nearest({ x: drink.x + 0.3, z: drink.z + 0.3 }, 1.2)).toMatchObject({ id: 'woods-drink-1', kind: 'drink' });
    expect(rests.nearest({ x: nap.x, z: nap.z + 0.4 }, 1.2)).toMatchObject({ id: 'woods-nap-1', kind: 'nap' });
  });

  it('the hollow is one mesh that casts and sits on the ground; the spring is water like the core\'s pond', () => {
    const g = stripKids.find((c) => c.name === 'sandyHollow');
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes.length).toBe(1);
    const box = new THREE.Box3().setFromObject(g);
    expect(rig.castsFromBox(box)).toBe(true);
    expect(box.min.y).toBeLessThan(0.05);
    const spring = ON.area.waters[ON.area.waters.length - 1];
    expect(spring).toBe(south.SPRING);
    expect(spring.shallow).toBeGreaterThan(0);
    expect(ON.area.waterFx.length).toBe(OFF.area.waterFx.length + 1);
    expect(stripKids.some((c) => c.name === 'water:spring-south')).toBe(true);
    // the sand is a flat disc the grass keeps off
    const sand = stripKids.find((c) => c.name === 'hollowSand');
    expect(sand.geometry.type).toBe('CircleGeometry');
  });

  it('every new line on screen is plain words; the everyday set names the hollow its own way', () => {
    const lines = () => [
      ...added('collectibles').map((c) => c.label), ...added('scenics').map((c) => c.label), south.SOUTH_PERCHES[1].label,
    ];
    const on = lines();
    const off = withOffWords(lines);
    expect(on.length).toBe(6);
    expect(on[4]).toBe('the training hollow');
    expect(off[4]).toBe('the sandy hollow');
    expect(off.filter((s, i) => i !== 4)).toEqual(on.filter((s, i) => i !== 4));
    for (const s of [...on, ...off]) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(8);
      expect(s.length).toBeLessThanOrEqual(48);
    }
    for (const s of off) expect(bannedIn(s), s).toBeNull();
    expect(new Set(on).size).toBe(6);
  });
});
