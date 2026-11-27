import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub, fingerprint, trianglesOf } from './helpers/growriver.js';

// The headless document stub every world test uses (test/flattrace.test.js).
vi.stubGlobal('document', canvasStub);

await (await import('../src/world/housestages.js')).loadHouseStages(); // the wing's lazy stage (housestagewing.js) fills the house's wing slots
const { build, HOUSE_SKY_DUSK, HOUSE_DUSK_LIGHT, HOUSE_GROUND_BOUNCE } = await import('../src/world/house.js');
const { build: buildDen } = await import('../src/world/den.js');
const {
  HOUSE_BOUNDS, HOUSE_ROOMS, HOUSE_STAIRS, HOUSE_LEVELS, HOUSE_FRONT_DOOR, HOUSE_FURNITURE, fades, LEDGE_FADE_OVER, LAWN_Y, roomAt, levelAt, houseSections,
  houseColliders, HOUSE_ZONES, HOUSE_LAMPS, zoneOfRoom,
} = await import('../src/world/houseplan.js');
// the zone a wall section is drawn with: the wing's rooms and stair name theirs, every old one is its level's
const zoneOfSection = (s) => (s.owner === 'wing' ? 'sun' : s.owner === 'wonderstair' ? 'wonder' : zoneOfRoom(HOUSE_ROOMS.find((r) => r.id === s.owner) ?? { level: s.level }));
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { createLevelDrawing } = await import('../src/houselevels.js');
const { HOUSE_ATLAS_CELLS, createHouseAtlas, furnitureMesh } = await import('../src/world/houseparts.js');
const { findFadeOccluders } = await import('../src/treefade.js');
const { applyDusk, duskLook, createLampPools, DUSK, LAMP_LOOK } = await import('../src/render/dusk.js');
const { createSun, createFill } = await import('../src/render/rig.js');
const { words } = await import('../src/wordset.js');
const clanWords = await import('../src/clanwords.js');
const { withOffWords, offWords } = await import('./helpers/offwords.js');

// =============================================================================
// The Old House, the shell (Old House step 1, Task 4): the walls in sinkable
// sections, floors, stairs, windows, lamps and the garden, by day and at dusk.
// =============================================================================

function drawsDuring(fn) {
  const real = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return real(); };
  try {
    fn();
  } finally {
    Math.random = real;
  }
  return draws;
}

const scene = new THREE.Scene();
const area = build(scene);
scene.updateMatrixWorld(true);

const levelY = (id) => HOUSE_LEVELS.find((l) => l.id === id).y;
const inBounds = (x, z, pad = 0) => x >= HOUSE_BOUNDS.minX - pad && x <= HOUSE_BOUNDS.maxX + pad
  && z >= HOUSE_BOUNDS.minZ - pad && z <= HOUSE_BOUNDS.maxZ + pad;
const xz = (v) => [v.x, v.z];
const lamps = () => {
  const out = [];
  scene.traverse((o) => { if (o.userData?.lampGlobeY > 0) out.push(o); });
  return out;
};
const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
function hitY(objs, x, z, from = 20) {
  ray.set(new THREE.Vector3(x, from, z), down);
  const hits = ray.intersectObjects(objs, true);
  return hits.length ? hits[0].point.y : null;
}

describe('the record', () => {
  it('returns every key the den returns except its furniture', () => {
    const denKeys = Object.keys(buildDen(new THREE.Scene())).filter((k) => k !== 'furniture');
    expect(Object.keys(area)).toEqual(expect.arrayContaining(denKeys));
  });

  it('is indoors and empty of life but its mice: no strays, no people, and named from the word tables', () => {
    expect(area.strays).toBe(false);
    // step 2 (D18, ruling D10): mice in the kitchen and the cellar, and nothing else
    expect(area.critterSpawns.length).toBeGreaterThan(0);
    expect(area.critterSpawns.every((c) => c.type === 'mouse')).toBe(true);
    // step 2 (D18, ruling D13): three special places
    expect(area.scenics.map((c) => c.id)).toEqual(['clock', 'fireside', 'attic-window', 'sunroom', 'bunks']); // + the east wing's two
    for (const k of ['pois', 'collectibles', 'moments', 'puddles', 'tippables']) {
      expect(area[k], k).toEqual([]);
    }
    // the east wing's three boxes she can sit in: the kids' blanket fort, the bathroom's laundry basket and the wonder room's cardboard castle
    expect(area.boxes).toHaveLength(3);
    // step 2 (D18, ruling D4): the knock-over pieces' tops are perches
    expect(area.perches.map((p) => p.kind)).toEqual(Array(11).fill('furniture')); // the old seven and the east wing's four
    expect(typeof area.life).toBe('function'); // house life (Task 6): the walls sink and the levels are drawn
    expect(area.groundBounce).toBe(HOUSE_GROUND_BOUNCE);
    expect(area.skyDusk).toBe(HOUSE_SKY_DUSK);
    expect(area.duskLight).toBe(HOUSE_DUSK_LIGHT);
    // the name is the word set's, in each set: the family's and the everyday one
    expect(area.name).toBe(words().PLACE_WORDS.house);
    expect(area.name).toBe(clanWords.PLACE_WORDS.house);
    const everyday = withOffWords(() => build(new THREE.Scene()).name);
    expect(everyday).toBe(offWords.PLACE_WORDS.house);
    expect(everyday).not.toBe(area.name);
  });

  it('hands the walk the plan: ground, bounds, spawn and the house block', () => {
    expect(area.bounds).toEqual({ ...HOUSE_BOUNDS });
    expect(area.spawn).toEqual({ x: HOUSE_FRONT_DOOR.arrive.x, z: HOUSE_FRONT_DOOR.arrive.z });
    expect(area.ground.y(0, 7)).toBeCloseTo(0, 6);
    expect(area.ground.y(25, -5)).toBeCloseTo(-1.8, 6);
    const H = area.house;
    expect(H.start).toBe('ground');
    expect(H.levels.map((l) => l.id)).toEqual(HOUSE_LEVELS.map((l) => l.id));
    expect(H.links.length).toBe(HOUSE_STAIRS.length - 2); // the wing's two stairs join zones by position (houselevels.js), not a level link
    expect(H.sections).toEqual(houseSections());
    expect(H.sectionMeshes.size).toBe(H.sections.length);
    expect(H.panes).toBeInstanceOf(Map);
  });
});

describe('determinism', () => {
  it('takes no Math.random draws and builds the same twice', () => {
    const fresh = new THREE.Scene(); // made outside: a Scene's own uuid is 4 draws
    expect(drawsDuring(() => build(fresh))).toBe(0);
    const sceneA = new THREE.Scene();
    const sceneB = new THREE.Scene();
    build(sceneA);
    build(sceneB);
    expect(fingerprint(sceneA)).toEqual(fingerprint(sceneB));
  });

  // Step 4 (W7): only a house-town end changes the door. Its two leaves are then
  // their own meshes on pivots in the two sections (houselife.js swings them):
  // the same triangles, two more meshes, and the rest of the scene as it was.
  it('only a house-town gate end changes the scene: the front door\'s leaves come out of the wall onto pivots', () => {
    const plain = new THREE.Scene();
    build(plain);
    for (const gateEnds of [[], [{ id: 'town-house', area: 'neighborhood' }]]) {
      const other = new THREE.Scene();
      const r = build(other, { gateEnds });
      expect(fingerprint(other)).toEqual(fingerprint(plain));
      expect(r.house.parts.frontDoor).toBeNull();
    }
    const gated = new THREE.Scene();
    const r = build(gated, { gateEnds: [{ id: 'house-town', area: 'house' }] });
    expect(r.house.parts.frontDoor).toBeTruthy();
    expect(trianglesOf(gated)).toBe(trianglesOf(plain));
    const meshes = (sc) => { let n = 0; sc.traverse((o) => { if (o.isMesh) n++; }); return n; };
    expect(meshes(gated)).toBe(meshes(plain) + 2);
    const was = new Set(fingerprint(plain));
    expect(fingerprint(gated).filter((f) => !was.has(f))).toHaveLength(4); // the two hall sections, and the two leaves
  });

  it('builds the atlas the same every time: 512 x 512 RGBA, forty-two named cells', () => {
    const a = createHouseAtlas();
    const b = createHouseAtlas();
    expect(a.isDataTexture).toBe(true);
    expect(a.image.width).toBe(512);
    expect(a.image.height).toBe(512);
    expect(a.image.data.length).toBe(512 * 512 * 4);
    expect(Buffer.from(a.image.data).equals(Buffer.from(b.image.data))).toBe(true);
    const ids = Object.values(HOUSE_ATLAS_CELLS);
    expect(new Set(ids).size).toBe(43); // the east wing adds four wallpapers and a bathroom floor, the wonder room a fifth paper
    for (const r of HOUSE_ROOMS) expect(HOUSE_ATLAS_CELLS[r.id], r.id).toBeGreaterThanOrEqual(0);
    for (const k of ['brick', 'oak', 'pine', 'stone', 'lightWood', 'darkWood', 'plaster']) expect(ids).toContain(HOUSE_ATLAS_CELLS[k]);
  });
});

describe('the walls', () => {
  it('builds every section as one mesh in its level\'s walls group, its base at local 0', () => {
    for (const s of area.house.sections) {
      const m = area.house.sectionMeshes.get(s.id);
      expect(m, s.id).toBeTruthy();
      expect(m.isMesh).toBe(true);
      expect(m.userData.houseSection).toBe(s.id);
      expect(m.parent.parent).toBe(scene);
      expect(m.parent.userData.noMerge).toBe(true);
      expect(m.parent.userData.houseWalls).toBe(zoneOfSection(s));
      m.geometry.computeBoundingBox();
      expect(m.geometry.boundingBox.min.y, s.id).toBeCloseTo(0, 6);
      expect(m.geometry.boundingBox.max.y, s.id).toBeLessThanOrEqual(s.height + 0.08);
      expect(m.position.y).toBe(s.base);
    }
    const groups = scene.children.filter((c) => c.userData?.houseWalls);
    expect(groups.map((g) => g.userData.houseWalls).sort()).toEqual(HOUSE_ZONES.map((z) => z.id).sort());
  });

  it('shares one atlas material across walls, floors, stairs and skirts', () => {
    const mats = new Set();
    for (const m of area.house.sectionMeshes.values()) mats.add(Array.isArray(m.material) ? m.material[0] : m.material); // [wall, dressing clone]: the clone is hidden by the sink (houselife)
    for (const c of scene.children) if (c.isMesh && /^house(Floor|Stair|Skirt)/.test(c.name)) mats.add(c.material);
    expect(mats.size).toBe(1);
    const [mat] = mats;
    expect(mat.map?.isDataTexture).toBe(true);
    expect(mat.color.getHex()).toBe(0xffffff);
  });

  it('draws the front door shut as a double door, one leaf in each section beside it', () => {
    const d = HOUSE_FRONT_DOOR;
    const halls = area.house.sections.filter((s) => s.owner === 'hall' && s.side === 's'
      && Math.min(s.x0, s.x1) <= d.x + 1e-9 && Math.max(s.x0, s.x1) >= d.x - 1e-9);
    expect(halls.length).toBe(2);
    const leaves = halls.map((s) => area.house.sectionMeshes.get(s.id).userData.doorLeaf);
    for (const [i, leaf] of leaves.entries()) {
      expect(leaf, halls[i].id).toBeTruthy();
      expect(leaf.x0).toBeGreaterThanOrEqual(Math.min(halls[i].x0, halls[i].x1) - 1e-9);
      expect(leaf.x1).toBeLessThanOrEqual(Math.max(halls[i].x0, halls[i].x1) + 1e-9);
    }
    // the two leaves meet at the door's x
    const edges = leaves.flatMap((l) => [l.x0, l.x1]);
    expect(edges.filter((x) => Math.abs(x - d.x) < 1e-9).length).toBe(2);
    // and the door is shut: a ray across the doorway hits a leaf in a section mesh
    ray.set(new THREE.Vector3(d.x - 0.2, 1.0, d.z + 3), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObjects([...area.house.sectionMeshes.values()], false)[0];
    expect(hit?.object.userData.houseSection).toBe(halls.find((s) => Math.min(s.x0, s.x1) < d.x).id);
    expect(hit.point.z).toBeGreaterThan(d.z - 0.1);
  });

  it('keeps window panes top-level, so the tree fade never takes a floor of the house for a building', () => {
    const panes = [];
    const at = new THREE.Vector3();
    scene.traverse((o) => { if (o.isMesh && o.userData?.window && inBounds(...xz(o.getWorldPosition(at)))) panes.push(o); });
    const windowed = area.house.sections.filter((s) => s.window);
    expect(panes.length).toBe(windowed.length);
    for (const p of panes) {
      expect(p.parent).toBe(scene);
      const s = area.house.sections.find((q) => q.id === p.userData.houseSection);
      expect(s?.window, p.name).toBeTruthy();
    }
    for (const s of windowed) expect(area.house.panes.get(s.id)?.length, s.id).toBe(1);
    for (const e of findFadeOccluders(scene)) {
      if (!e.box) continue;
      const apart = e.box.maxX < HOUSE_BOUNDS.minX || e.box.minX > HOUSE_BOUNDS.maxX
        || e.box.maxZ < HOUSE_BOUNDS.minZ || e.box.minZ > HOUSE_BOUNDS.maxZ;
      expect(apart, e.obj.name).toBe(true);
    }
  });
});

describe('floors, stairs and the lawn', () => {
  const solid = scene.children.filter((c) => c.isMesh && /^house(Floor|Stair|Skirt|Lawn)/.test(c.name));

  it('lays a floor at every room\'s level and the lawn round it, with the cellar a hole', () => {
    for (const r of HOUSE_ROOMS) {
      const y = hitY(solid, (r.minX + r.maxX) / 2 + 0.13, (r.minZ + r.maxZ) / 2 + 0.17);
      expect(y, r.id).toBeCloseTo(levelY(r.level), 3);
    }
    // the courtyard and the front garden are lawn
    expect(hitY(solid, -8, -2)).toBeCloseTo(LAWN_Y, 3);
    expect(hitY(solid, 0, 16)).toBeCloseTo(LAWN_Y, 3);
  });

  it('builds each stair as a wedge whose treads straddle the ramp', () => {
    for (const s of HOUSE_STAIRS) {
      const L = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
      const rise = Math.abs(levelY(s.to) - levelY(s.from));
      for (let i = 1; i < 40; i++) {
        const t = i / 40;
        const x = s.x0 + (s.x1 - s.x0) * t + 0.11;
        const z = s.z0 + (s.z1 - s.z0) * t + 0.07;
        const y = hitY(solid, x, z);
        const want = area.ground.y(x, z);
        // a tread is at most half a step from the ramp; steps are about 0.4 m
        expect(Math.abs(y - want), `${s.id} ${t}`).toBeLessThanOrEqual((rise / Math.round(L / 0.4)) / 2 + 1e-3 + 0.004); // + the runner's lift (round 2)
      }
    }
  });

  it('skirts the raised rooms down to the lawn', () => {
    for (const r of HOUSE_ROOMS.filter((q) => levelY(q.level) > LAWN_Y)) {
      const skirt = scene.children.find((c) => c.name === `houseSkirt:${r.id}`);
      expect(skirt, r.id).toBeTruthy();
      const box = new THREE.Box3().setFromObject(skirt);
      expect(box.min.y).toBeCloseTo(LAWN_Y, 6);
      expect(box.max.y).toBeCloseTo(levelY(r.level), 6);
    }
  });
});

describe('the light', () => {
  it('lights every room with a lamp, the cellar with two, and is never pitch-dark at dusk', () => {
    expect(duskLook(area).hemiIntensity).toBeGreaterThanOrEqual(DUSK.hemiIntensity);
    expect(duskLook(area).hemiIntensity).toBeGreaterThanOrEqual(0.7);
    const per = new Map();
    for (const g of lamps()) {
      const p = g.getWorldPosition(new THREE.Vector3());
      const r = roomAt(p.x, p.z);
      expect(r, g.name).toBeTruthy();
      per.set(r, (per.get(r) ?? 0) + 1);
      // standing on her floor, the globe above it
      const room = HOUSE_ROOMS.find((q) => q.id === r);
      expect(p.y).toBeCloseTo(levelY(room.level), 6);
      let globes = 0;
      g.traverse((o) => { if (o.userData?.lampGlobe) { globes++; expect(o.userData.noMerge).toBe(true); } });
      expect(globes).toBe(1);
    }
    // the wing's raised rooms (kids, bath) are lit by sconces, the wonder room by its string lights: a 3.4 m lamp pool needs a room 7 m wide
    for (const r of HOUSE_ROOMS.filter((q) => q.id !== 'kids' && q.id !== 'bath' && q.id !== 'wonder')) expect(per.get(r.id) ?? 0, r.id).toBeGreaterThanOrEqual(r.id === 'cellar' ? 2 : 1);

    const s2 = new THREE.Scene();
    const a2 = build(s2);
    applyDusk({ scene: s2, sun: createSun(), fill: createFill(a2.groundBounce), areaData: a2 });
    let globes = 0;
    s2.traverse((o) => {
      if (!o.userData?.lampGlobe) return;
      globes++;
      expect(o.material.emissive.getHex()).not.toBe(0);
    });
    expect(globes).toBeGreaterThanOrEqual(HOUSE_LAMPS.length);
    const pools = createLampPools(s2);
    expect(pools?.isMesh).toBe(true);
  });

  // Owner's fix A: "Keep the light inside." Every lamp's dusk pool stays in its
  // own room, on its own floor, on every level: no glow on the lawn, through a
  // wall or into the next room.
  it('keeps every lamp\'s dusk pool inside its own room', () => {
    const s3 = new THREE.Scene();
    const a3 = build(s3);
    applyDusk({ scene: s3, sun: createSun(), fill: createFill(a3.groundBounce), areaData: a3 });
    const own = new Map(); // lamp group → its pool, built alone
    s3.updateMatrixWorld(true);
    s3.traverse((o) => { if (o.userData?.lampGlobeY > 0) own.set(o, null); });
    expect(own.size).toBe(HOUSE_LAMPS.length);
    const EPS = 0.03;
    const covered = new Set();
    for (const g of own.keys()) {
      const alone = new THREE.Scene();
      const copy = g.clone();
      copy.userData = { ...g.userData };
      alone.add(copy);
      const pool = createLampPools(alone);
      const p = g.getWorldPosition(new THREE.Vector3());
      const room = HOUSE_ROOMS.find((r) => r.id === roomAt(p.x, p.z));
      const inner = { minX: room.minX + 0.1, maxX: room.maxX - 0.1, minZ: room.minZ + 0.1, maxZ: room.maxZ - 0.1 };
      const pos = pool.geometry.getAttribute('position');
      expect(pos.count, g.name).toBeGreaterThan(0);
      for (let i = 0; i < pos.count; i++) {
        const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
        const at = `${g.name}: (${x.toFixed(2)}, ${z.toFixed(2)})`;
        expect(x >= inner.minX - EPS && x <= inner.maxX + EPS && z >= inner.minZ - EPS && z <= inner.maxZ + EPS, at).toBe(true);
        expect(y, at).toBeCloseTo(levelY(room.level) + LAMP_LOOK.poolLift, 3);
      }
      covered.add(room.id);
    }
    expect([...covered].sort()).toEqual(HOUSE_ROOMS.filter((r) => HOUSE_LAMPS.some((l) => l.room === r.id)).map((r) => r.id).sort());
    // the walk's one mesh of every pool: each triangle in a single room, the light still bright under each lamp
    const pools = createLampPools(s3);
    const pos = pools.geometry.getAttribute('position');
    const col = pools.geometry.getAttribute('color');
    const ix = pools.geometry.index;
    const v = new THREE.Vector3();
    for (let k = 0; k < ix.count; k += 3) {
      const rooms = new Set();
      for (let j = 0; j < 3; j++) {
        v.fromBufferAttribute(pos, ix.getX(k + j));
        const r = HOUSE_ROOMS.find((q) => v.x >= q.minX && v.x <= q.maxX && v.z >= q.minZ && v.z <= q.maxZ
          && Math.abs(v.y - levelY(q.level) - LAMP_LOOK.poolLift) < 1e-3);
        expect(r, `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`).toBeTruthy();
        rooms.add(r.id);
      }
      expect(rooms.size).toBe(1);
    }
    let brightest = 0;
    for (let i = 0; i < col.count; i++) brightest = Math.max(brightest, col.getX(i));
    expect(brightest).toBeGreaterThan(0.5);
  });
});

describe('outside', () => {
  it('keeps the hedge, the neighbours and the trees at least 8 m outside the house\'s bounds', () => {
    const outside = scene.children.filter((c) => /^house(Hedge|Neighbour|Tree)/.test(c.name));
    expect(outside.filter((c) => c.name.startsWith('houseNeighbour')).length).toBe(3);
    expect(outside.filter((c) => c.name.startsWith('houseTree')).length).toBe(4);
    expect(outside.filter((c) => c.name.startsWith('houseHedge')).length).toBe(1);
    const v = new THREE.Vector3();
    for (const c of outside) {
      c.traverse((o) => {
        if (!o.isMesh) return;
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          if (inBounds(v.x, v.z, 8)) throw new Error(`${c.name} reaches (${v.x.toFixed(2)}, ${v.z.toFixed(2)})`);
        }
      });
    }
  });

  it('stays within the budget for the whole shell (logged for the report)', () => {
    // the shell: everything but the levels' furniture and stand-ins (test/housebudget.test.js measures those)
    let meshes = 0, casters = 0, triangles = 0;
    for (const c of scene.children) {
      if (c.userData?.houseDetail || c.userData?.houseSimple) continue;
      c.traverse((o) => { if (o.isMesh) { meshes++; if (!o.userData.noCast) casters++; } });
      triangles += trianglesOf(c);
    }
    triangles = Math.round(triangles);
    if (process.env.BUDGET_LOG) console.log('house shell', JSON.stringify({ meshes, casters, triangles }));
    expect(meshes).toBeLessThanOrEqual(300);
    expect(casters).toBeLessThanOrEqual(200);
    expect(triangles).toBeLessThanOrEqual(55000);
  });
});

describe('the furniture', () => {
  const levelIds = HOUSE_ZONES.map((z) => z.id); // the old levels and the east wing's zones
  const zoneOf = (id) => zoneOfRoom(HOUSE_ROOMS.find((r) => r.id === id));

  // Step 2, Task 6: the clocks' faces are on their fronts, not inside the case or the chimney
  // breast. Looked at straight on (in the piece's own frame, its front +z), the first thing at
  // the face's middle is the face, in front of what it hangs on.
  it('the grandfather clock\'s dial and the mantel clock\'s face are on their fronts', () => {
    const material = new THREE.MeshBasicMaterial();
    const ray = new THREE.Raycaster();
    const frontAt = (id, y) => {
      const mesh = furnitureMesh(HOUSE_FURNITURE.find((f) => f.id === id), material);
      ray.set(new THREE.Vector3(0, y, 5), new THREE.Vector3(0, 0, -1));
      return ray.intersectObject(mesh)[0].point.z;
    };
    // the grandfather clock: its hood's front is at d/2 - 0.02, the face's front 0.016 past it
    const clock = HOUSE_FURNITURE.find((f) => f.id === 'hall-clock');
    expect(frontAt('hall-clock', 1.65)).toBeCloseTo(clock.d / 2 - 0.02 + 0.016, 4);
    // the mantel clock: its case's front is at -d/2 + 0.23, the face 0.006 past it
    const fire = HOUSE_FURNITURE.find((f) => f.id === 'parlour-fire');
    expect(frontAt('parlour-fire', 1.3 + 0.075)).toBeCloseTo(-fire.d / 2 + 0.23 + 0.006, 4);
  });
  // every piece that fades: the tall ones (H8), and since step 2 the four low ledge pieces the
  // camera can come down inside (ruling S2-4: the piano, its keys, the library steps, the big books)
  const tall = HOUSE_FURNITURE.filter(fades);

  it('makes every tall piece a fade occluder, and tags every detail object with a level', () => {
    const shapes = findFadeOccluders(scene).filter((e) => !e.box);
    // step 2 (D9): and the secret bookcase, a tall ground-level piece of its own (test/housesecret.test.js)
    expect(shapes.length).toBe(tall.length + 2); // + the kids' wardrobe's leaf, the wonder stair's (milestone 3)
    expect(shapes.filter((e) => e.obj.parent?.userData.secretBookcase).length).toBe(1);
    expect(shapes.filter((e) => e.obj.parent?.userData.wardrobe).length).toBe(1);
    for (const f of tall) {
      const e = shapes.find((q) => Math.abs(q.x - f.x) < 1e-6 && Math.abs(q.z - f.z) < 1e-6);
      expect(e, f.id).toBeTruthy();
      expect(e.obj.parent).toBe(scene);
      expect(e.obj.userData.houseDetail).toBe(true);
      expect(e.obj.userData.houseLevel).toBe(zoneOf(f.room));
      const [cyl] = e.obj.userData.fadeOccluder;
      // it reaches LEDGE_FADE_OVER above its top: a ledge piece's since step 2 (ruling S2-4),
      // every fading piece's since the Task 10 review (a line grazing a tall piece's top)
      expect(cyl).toEqual({ t: 'cyl', r: Math.hypot(f.w, f.d) / 2, y0: 0, y1: f.h + LEDGE_FADE_OVER });
      expect(e.shapes[0].y0).toBeCloseTo(levelY(f.level), 6);
    }
    // every houseDetail object is top-level and has a level; one top-level furniture group per room
    let nested = 0;
    for (const c of scene.children) c.traverse((o) => { if (o !== c && (o.userData?.houseDetail || o.userData?.houseSimple)) nested++; });
    expect(nested).toBe(0);
    const details = scene.children.filter((c) => c.userData?.houseDetail);
    for (const d of details) expect(levelIds, d.name).toContain(d.userData.houseLevel);
    const rooms = details.filter((d) => d.userData.houseRoom);
    expect(rooms.map((d) => d.userData.houseRoom).sort()).toEqual(HOUSE_ROOMS.map((r) => r.id).sort());
    for (const d of rooms) expect(d.userData.houseLevel).toBe(zoneOf(d.userData.houseRoom));
    // exactly one stand-in mesh per level, cast-free
    const simples = scene.children.filter((c) => c.userData?.houseSimple);
    expect(simples.map((c) => c.userData.houseSimple).sort()).toEqual([...levelIds].sort());
    for (const s of simples) {
      expect(s.isMesh, s.name).toBe(true);
      expect(s.userData.noCast).toBe(true);
      expect(s.castShadow).toBe(false);
    }
  });

  it('keeps its tags, its levels and its cast-free flat pieces through the prop merge', () => {
    const s = new THREE.Scene();
    build(s);
    const before = s.children.length;
    mergeStaticProps(s);
    expect(s.children.length).toBe(before);
    const tagged = s.children.filter((c) => c.userData?.houseDetail);
    // + the secret bookcase (step 2, D9) and the paw prints at the take-offs, one mesh per level with any (step 2, D2)
    const marked = new Set(area.traversal.hops.map((h) => zoneOf(roomAt(h.x0, h.z0))));
    // + the beauty pass's warm glow, one mesh per level (house.js drawGlow)
    // + the wing's zone details: four wall groups, two lamps, four floors, two brick skirts and the stair
    // + the solarium's one decal mesh of sunny slots (the wing's milestone 2)
    // + the wonder room's own (milestone 3): its wall group, floor, brick skirt and stair, the kids' wardrobe, the feather wand, the string lights, the skylight's pool and the light under the wardrobe's doors
    expect(tagged.length).toBe(tall.length + HOUSE_ROOMS.length + 1 + marked.size + levelIds.length + 4 + 2 + 4 + 2 + 1 + 1 + 8);
    for (const c of tagged) {
      expect(levelIds).toContain(c.userData.houseLevel);
      let meshes = 0;
      c.traverse((o) => { if (o.isMesh) meshes++; });
      expect(meshes, c.name).toBeGreaterThanOrEqual(1);
    }
    // the rugs, the runner and the cobwebs stay their own meshes, cast-free
    for (const c of tagged.filter((q) => q.userData.houseRoom)) {
      const flats = [];
      c.traverse((o) => { if (o.isMesh && o.userData.houseFlat) flats.push(o); });
      const want = HOUSE_FURNITURE.some((f) => f.room === c.userData.houseRoom && f.r === 0);
      expect(flats.length, c.name).toBe(want ? 1 : 0);
      for (const m of flats) expect(m.userData.noCast).toBe(true);
    }
    // and the level drawing finds them: on the ground, the attic is its stand-in
    const drawing = createLevelDrawing(s, { levels: HOUSE_LEVELS, links: area.house.links, start: 'ground' });
    expect([...drawing.full].sort()).toEqual(['cellar', 'ground', 'upstairs']);
    for (const c of s.children) {
      // the east wing's zones are far from the ground (the hall): their walls and furniture hidden, their boxes shown
      const far = (id) => id === 'attic' || HOUSE_ZONES.find((z) => z.id === id).wing;
      if (c.userData?.houseDetail) expect(c.visible, c.name).toBe(!far(c.userData.houseLevel));
      if (c.userData?.houseSimple) expect(c.visible, c.name).toBe(far(c.userData.houseSimple));
    }
  });

  it('draws each stand-in as a box per solid piece at its footprint, 0.9 of its height', () => {
    for (const l of HOUSE_LEVELS) {
      const m = scene.children.find((c) => c.userData?.houseSimple === l.id);
      m.geometry.computeBoundingBox();
      const pieces = HOUSE_FURNITURE.filter((f) => f.level === l.id && f.r > 0 && !HOUSE_ROOMS.find((r) => r.id === f.room).zone); // (a wing room has its own far look)
      const top = Math.max(...pieces.map((f) => f.h));
      expect(m.geometry.boundingBox.max.y + m.position.y, l.id).toBeCloseTo(levelY(l.id) + 0.9 * top, 3);
      expect(m.geometry.boundingBox.min.y + m.position.y, l.id).toBeCloseTo(levelY(l.id), 3);
      expect(m.geometry.attributes.color, l.id).toBeTruthy();
    }
  });

  it('hands the walk the plan\'s colliders, the furniture and the lamps among them', () => {
    expect(area.colliders).toEqual(houseColliders());
  });

  // Step 4 (Task 9): the world map's place card shows the hall (verify-house.html?shot=card).
  it('the card picture is shipped (a JPEG, about the size of the others)', async () => {
    const { readFileSync } = await import('node:fs');
    const jpg = readFileSync(new URL('../public/places/house.jpg', import.meta.url));
    expect([jpg[0], jpg[1]]).toEqual([0xff, 0xd8]);
    expect(jpg.length).toBeGreaterThan(5000);
    expect(jpg.length).toBeLessThan(60000);
  });
});
