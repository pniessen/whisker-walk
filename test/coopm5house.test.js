import { describe, it, expect, afterEach } from 'vitest';
import { joined, pad, set, reset, newSession, createRemoteCats, THREE } from './helpers/couchrig.js';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { routeFrom, stickFor } from './helpers/couchroute.js';

// Couch play M5(d): the Old House. Real house build, real plan ground (levels, stairs, ledges), real house life, real
// player code for both cats, real discovery log and progression; fake pads. Cat two walks the stairs, the dollhouse
// walls sink and the levels are drawn for BOTH cats (inside the worst-spot ceiling), the east wing's zones draw where
// either cat is, the finds are the household's, and the save is a solo walk's. The furniture climbs (ledge tops) stay cat one's.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
await (await import('../src/world/housestages.js')).loadHouseStages(); // the wing's lazy stage fills the house's wing slots
const { build } = await import('../src/world/house.js');
const { HOUSE_ROOMS, HOUSE_LEVELS } = await import('../src/world/houseplan.js');
const { HOUSE_FINDS } = await import('../src/world/housethings.js');
const { COOP_READY } = await import('../src/coop/table.js');
const { createFinds } = await import('../src/coop/finds.js');
const { createMover } = await import('../src/coop/second.js');
const { isWalkableAt } = await import('../src/player.js');
const { createProgression } = await import('../src/progression.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { endsFor, liveEndsFor } = await import('../src/gateways.js');
const { CATALOG } = await import('../src/progression.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');
const { measureHouse, houseWorstSpot, houseWalkThings, withCats } = await import('./helpers/housebudget.js');
const { GOLD_MICE } = await import('../src/goldmice.js');

afterEach(reset);
const DT = 1 / 30;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const centre = (r) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });
const room = (id) => centre(HOUSE_ROOMS.find((r) => r.id === id));

const world = new THREE.Scene();
const record = build(world, { gateEnds: endsFor('house') });
const ground = record.ground;
const FLOOR = (p) => record.cameraGround.y(p.x, p.z); // the floor under a spot (the house's own, no furniture tops)

function houseSession(at = record.spawn) {
  const s = newSession('house', { ground });
  s.scene = world;
  s.remotes = createRemoteCats(world, { ground });
  world.add(s.cat);
  s.areaData = { collectibles: [], waters: [], perches: [], ...record };
  s.collectibleMeshes = new Map();
  s.cat.position.set(at.x, ground.y(at.x, at.z), at.z);
  return s;
}
function houseJoined(at) {
  const r = joined();
  const s = houseSession(at);
  r.player.setAvatar(s.cat, 3.5);
  r.player.setGround(ground);
  r.player.setCameraGround(record.cameraGround);
  r.player.enable(); r.player.setTouchEngaged(true);
  r.setSession(s); r.tick(2);
  return { r, s };
}

describe('couch play M5(d): the Old House row', () => {
  it('the Old House is ready, with this file green', () => { expect(COOP_READY.house).toBe(true); });
});

describe('couch play M5(d): cat two in the house\'s levels', () => {
  it('joins beside cat one on every level and in the wing, on clear floor, never through a wall or on another floor', () => {
    for (const id of ['hall', 'bedroom', 'attic', 'cellar', 'livingroom', 'kids']) {
      const at = room(id);
      const { r, s } = houseJoined(at);
      const g = r.two().group.position;
      expect(isWalkableAt(s.areaData, g.x, g.z), id).toBe(true);
      expect(Math.abs(ground.y(g.x, g.z) - ground.y(at.x, at.z)), `${id}: another floor`).toBeLessThan(0.5);
      expect(ground.canStep(at.x, at.z, g.x, g.z), `${id}: no way from one cat to the other`).toBe(true);
      reset();
    }
  });

  it('cat one walks up both stairs (ground to bedroom to attic) with cat two idle; cat two follows up and is on the attic floor', () => {
    const { r, s } = houseJoined(room('hall'));
    const target = room('attic');
    const route = routeFrom(record, s.cat.position, target);
    expect(route, 'a way up on foot').not.toBeNull();
    let i = 1;
    for (let f = 0; f < 60 * 120 && !(i >= route.length && dist(r.two().group.position, s.cat.position) < 3.5); f++) {
      const p = s.cat.position;
      while (i < route.length && dist(p, route[i]) < 0.45) i++;
      const t = route[Math.min(i, route.length - 1)];
      set(r, pad(0, [], i >= route.length ? [0, 0, 0, 0] : stickFor(r, t.x - p.x, t.z - p.z)), pad(1));
      r.tick(1);
    }
    const one = s.cat.position, two = r.two().group.position;
    expect(dist(one, target), 'cat one reached the attic').toBeLessThan(2);
    expect(dist(one, two), 'cat two was left on the stairs below').toBeLessThan(4);
    expect(Math.abs(ground.y(two.x, two.z) - ground.y(one.x, one.z))).toBeLessThan(0.5);
    expect(ground.y(two.x, two.z)).toBeGreaterThan(3);
  }, 120_000);

  it('the camera keeps off the floors (the house\'s own camera ground) with both cats upstairs', () => {
    const { r } = houseJoined(room('bedroom'));
    r.tick(150);
    const cam = r.camera.position;
    expect(cam.y).toBeGreaterThan(record.cameraGround.y(cam.x, cam.z));
  });
});

describe('couch play M5(d): the dollhouse follows both cats', () => {
  function lifeWith({ local }) {
    const scene = new THREE.Scene();
    const rec = build(scene, { gateEnds: endsFor('house') });
    const real = createDiscoveryLog({ addPoints() {}, recordFeat() {} });
    real.startWalk();
    const life = rec.life({ scene, reducedMotion: true, log: real, audio: null, toy: null, dusk: false, now: () => new Date(2026, 10, 21, 15, 0) });
    const group = new THREE.Group();
    const tag = new THREE.Sprite(new THREE.SpriteMaterial());
    group.add(tag); scene.add(group);
    const list = [{ group, tag, h: 0, local }];
    const session = { remotes: { list } };
    const cat = new THREE.Vector3();
    const camera = new THREE.PerspectiveCamera();
    const fl = (x, z) => rec.cameraGround.y(x, z);
    let t = 0;
    const put = (a, b) => { cat.set(a.x, fl(a.x, a.z), a.z); group.position.set(b.x, fl(b.x, b.z), b.z); camera.position.set(cat.x, cat.y + 2.2, cat.z + 3.4); camera.lookAt(cat); camera.updateMatrixWorld(true); };
    const frames = (n) => { for (let i = 0; i < n; i++) { t += DT; life.update(DT, t, cat, camera, session); } };
    return { life, put, frames, rec, scene };
  }

  it('cat two on the attic, cat one in the hall: the attic is drawn too (and cat one\'s stair-linked levels stay solo\'s otherwise)', () => {
    const solo = lifeWith({ local: false });
    solo.put(room('hall'), room('attic')); solo.frames(5);
    expect([...solo.life.drawing.full].sort()).toEqual(['cellar', 'ground', 'upstairs']); // a net partner changes no drawing
    const two = lifeWith({ local: true });
    two.put(room('hall'), room('attic')); two.frames(5);
    expect(two.life.drawing.full.has('ground')).toBe(true);
    expect(two.life.drawing.full.has('attic')).toBe(true);
    two.put(room('hall'), room('bedroom')); two.frames(5); // one stair away: already drawn for cat one, nothing added
    expect([...two.life.drawing.full].sort()).toEqual(['cellar', 'ground', 'upstairs']);
  });

  it('cat two in the east wing: its zone is drawn while cat one is in the hall', () => {
    const w = lifeWith({ local: true });
    w.put(room('hall'), room('solarium')); w.frames(5);
    expect(w.life.drawing.full.has('sun')).toBe(true);
    expect(w.life.drawing.full.has('ground')).toBe(true);
    w.put(room('hall'), room('hall')); w.frames(5);
    expect(w.life.drawing.full.has('sun')).toBe(false);
  });

  it('a wall between the camera and cat two sinks for cat two, though cat one stands clear of it', () => {
    const down = (local) => {
      const w = lifeWith({ local });
      w.put({ x: 0, z: 10 }, { x: 9, z: -3 }); // cat one in the hall, cat two behind the kitchen's walls from this camera
      w.frames(60);
      return w.rec.house.sections.filter((s) => w.life.sink.isDown(s.id)).map((s) => s.id);
    };
    const alone = down(false), both = down(true);
    expect(both.length).toBeGreaterThan(alone.length);
  });

  it('the cellar\'s lid is out of the way for cat two on the cellar stair, as for cat one', () => {
    const w = lifeWith({ local: true });
    w.put(room('hall'), room('cellar')); w.frames(40);
    expect(w.life.lid.wanted).toBe(true);
    const solo = lifeWith({ local: false });
    solo.put(room('hall'), room('cellar')); solo.frames(40);
    expect(solo.life.lid.wanted).toBe(false);
  });
});

describe('couch play M5(d): the worst spot with two cats', () => {
  const rig = { castsFromBox, isTransparentMat };
  const ids = HOUSE_LEVELS.map((l) => l.id);
  const zones = [['cellar', 'cellar'], ['hall', 'ground'], ['bedroom', 'upstairs'], ['attic', 'attic'], ['livingroom', 'living'], ['solarium', 'sun'], ['kids', 'kids'], ['bath', 'bath'], ['wonder', 'wonder']];

  async function pairs(dressed) {
    const scene = new THREE.Scene();
    const rec = build(scene, { gateEnds: liveEndsFor('house', CATALOG) });
    mergeStaticProps(scene);
    const dispose = await houseWalkThings(scene, rec, { cats: 0 });
    const added = await withCats(scene, 2, { dressed, tag: true });
    const m = measureHouse(scene, rig);
    const life = rec.life({ scene, reducedMotion: true, log: null, audio: null, toy: null, dusk: false });
    const group = new THREE.Group(); scene.add(group);
    const session = { remotes: { list: [{ group, local: true }] } };
    const cat = new THREE.Vector3(), camera = new THREE.PerspectiveCamera();
    const fl = (p) => rec.cameraGround.y(p.x, p.z);
    let worst = { triangles: 0 };
    let t = 0;
    for (const [ra, za] of zones) for (const [rb, zb] of zones) {
      const a = room(ra), b = room(rb);
      cat.set(a.x, fl(a), a.z); group.position.set(b.x, fl(b), b.z);
      camera.position.set(cat.x, cat.y + 2.2, cat.z + 3.4); camera.lookAt(cat); camera.updateMatrixWorld(true);
      for (let k = 0; k < 3; k++) { t += DT; life.update(DT, t, cat, camera, session); }
      if (life.drawing.near.size) continue; // standing at a wing doorway: the partial draw, measured by housebudget's wing rows
      const at = m.atFull(life.drawing.full);
      if (at.triangles > worst.triangles) worst = { ...at, a: za, b: zb, full: [...life.drawing.full].join('+') };
    }
    const solo = houseWorstSpot(m, ids);
    life.dispose?.(); dispose();
    for (const o of added) scene.remove(o);
    return { worst, solo };
  }

  it('two plain cats and the partner\'s tag: every pair of floors, either cat on any, is drawn under 70,000 triangles, 450 meshes, 380 casters', async () => {
    const { worst, solo } = await pairs(false);
    console.info(`house, two plain cats, worst pair ${worst.a}+${worst.b} (${worst.full}): ${worst.triangles} triangles, ${worst.meshes} meshes, ${worst.casters} casters (one cat's worst level: ${solo.triangles})`);
    expect(worst.triangles).toBeLessThanOrEqual(70000);
    expect(worst.meshes).toBeLessThanOrEqual(450);
    expect(worst.casters).toBeLessThanOrEqual(380);
  }, 120_000);

  it('two fully dressed cats: reported, and no pair is worse than the one-floor worst plus the wonder room\'s own zone (ruling P-10 holds the 70,000 for plain cats)', async () => {
    const { worst, solo } = await pairs(true);
    console.info(`house, two fully dressed cats, worst pair ${worst.a}+${worst.b}: ${worst.triangles} triangles (one level's worst: ${solo.triangles}); ${worst.meshes} meshes, ${worst.casters} casters`);
    expect(worst.meshes).toBeLessThanOrEqual(450);
    expect(worst.casters).toBeLessThanOrEqual(380);
    expect(worst.triangles).toBeLessThanOrEqual(solo.triangles + 1500);
  }, 120_000);
});

describe('couch play M5(d): no stuck spots, and the finds are the household\'s', () => {
  // what a cat with no skills reaches on foot, shut doors shut: the hall's clock, the parlour's cushion, the attic's toys, the cellar's mouse
  const SPOTS = ['clock', 'cushion', 'toys'].map((id) => HOUSE_FINDS.find((f) => f.id === id));
  const CELLAR_MOUSE = GOLD_MICE.house.find((g) => g.id === 'gm-house-3');

  it('every one has a route on foot from the front door (cat two has the same floors and walls as cat one)', () => {
    for (const f of [...SPOTS, CELLAR_MOUSE]) expect(routeFrom(record, record.spawn, f), f.id).not.toBeNull();
  });

  it('cat two\'s own headless player walks up the back stair to the attic\'s toys and down the cellar stair to the mouse', () => {
    const pick = { key: 'siamese', breed: 'siamese', name: 'Siamese', look: null };
    const progression = createProgression(memoryStorage());
    for (const f of [SPOTS.find((x) => x.id === 'toys'), CELLAR_MOUSE]) {
      const route = routeFrom(record, record.spawn, f);
      const m = createMover({ ground, state: progression.state, pick, at: record.spawn });
      let i = 1;
      for (let n = 0; n < 30 * 400 && i < route.length; n++) {
        const p = m.body.position;
        while (i < route.length && dist(p, route[i]) < 0.5) i++;
        const t = route[Math.min(i, route.length - 1)];
        const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz) || 1;
        m.player.setTouchMove({ x: dx / d, z: dz / d, mag: 1 });
        m.player.update(DT, record.colliders, record.bounds, record.waters ?? []);
      }
      expect(dist(m.body.position, f), f.id).toBeLessThan(1.2);
    }
  }, 120_000);

  function walk() {
    const progression = createProgression(memoryStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const mice = new Map([[CELLAR_MOUSE.id, CELLAR_MOUSE]]);
    const s = {
      areaId: 'house', scene: world, ground, areaData: { ...record, collectibles: [] }, collectibleMeshes: new Map(), walk: { carried: 0, carryCap: 5 }, fx: { burst() {} },
      goldMice: { checkFind: (p) => [...mice.values()].find((g) => dist(g, p) < 1) ?? null, nearestUnfound: () => null, remove: (id) => mice.delete(id) },
    };
    const pick = { key: 'siamese', breed: 'siamese', name: 'Siamese', look: null };
    const audio = new Proxy({}, { get: () => () => {} });
    const mover = createMover({ ground, state: progression.state, pick, at: record.spawn });
    const mk = () => createFinds({ ctx: { progression, log, audio }, drawn: () => new THREE.Group(), pick: () => pick });
    return { progression, log, s, mover, mk, save: () => JSON.stringify(progression.state) };
  }

  it('the cellar\'s golden mouse found by cat two writes the same save as cat one finding it, and it counts once', () => {
    const two = walk();
    two.mover.body.position.set(CELLAR_MOUSE.x, ground.y(CELLAR_MOUSE.x, CELLAR_MOUSE.z), CELLAR_MOUSE.z);
    const finds = two.mk(), finds2 = two.mk(); // both cats at the mouse in one frame: the household finds it once
    finds.frame(DT, two.s, two.mover, two.mover.body, false);
    finds2.frame(DT, two.s, two.mover, two.mover.body, false);
    expect(two.progression.state.golden).toEqual([CELLAR_MOUSE.id]);
    expect(two.log.count(CELLAR_MOUSE.id)).toBeLessThanOrEqual(1);
    const one = walk();
    if (one.progression.recordGolden(CELLAR_MOUSE.id)) one.log.awardOnce('legend', CELLAR_MOUSE.id, 'a GOLDEN MOUSE! 🥇');
    expect(two.save()).toBe(one.save());
  });

  it('no key of couch play in the save after a walk with both cats in the house', () => {
    const { r } = houseJoined(room('hall'));
    const keys = Object.keys(r.progression.state);
    set(r, pad(0), pad(1, [], [1, 0, 0, 0])); r.tick(120);
    expect(Object.keys(r.progression.state)).toEqual(keys);
    expect(FLOOR(record.spawn)).toBeTypeOf('number');
  });
});
