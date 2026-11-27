import { describe, it, expect, afterEach } from 'vitest';
import { coop, joined, pad, set, reset, newSession, createRemoteCats, THREE } from './helpers/couchrig.js';
import { stubCanvasDocument } from './helpers/canvas.js';
import { routeFrom as route, stickFor } from './helpers/couchroute.js';
import { memoryStorage } from './helpers/storage.js';

// Couch play M5(c): the Gorge and its three deep caves. Real Gorge world, real ground (rock walls, ceilings, ledges), real
// player code for both cats, real discovery log and progression; fake pads. Cat two walks the same ground cat one does, is
// never left outside a cave (a stuck trot hops it to its friend, onto the friend's own level), the camera keeps out of the
// rock and under the roof, the caves' light follows the deeper cat, and the finds on the ground are the household's.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { build } = await import('../src/world/gorge.js');
const { GORGE_CAVES, GORGE_DENS } = await import('../src/world/gorgeshape.js');
const { createGorgeLife } = await import('../src/gorgelife.js');
const { isWalkableAt } = await import('../src/player.js');
const { COOP_READY } = await import('../src/coop/table.js');
const { createFinds } = await import('../src/coop/finds.js');
const { createMover } = await import('../src/coop/second.js');
const { createProgression } = await import('../src/progression.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { underCeiling } = await import('../src/caves.js');
const { MIN_CAMERA_Y } = await import('../src/camzoom.js');
const { GOLD_MICE } = await import('../src/goldmice.js');

afterEach(reset);
const world = new THREE.Scene();
const area = build(world);
const ground = area.ground;
const pathOf = (c) => c.path.map(([x, z]) => ({ x, z })); // a cave's walking line as points
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function gorgeSession(at = area.spawn) {
  const s = newSession('gorge', { ground });
  s.scene = world;
  s.remotes = createRemoteCats(world, { ground });
  world.add(s.cat);
  s.areaData = { collectibles: [], waters: [], perches: [], ...area };
  s.collectibleMeshes = new Map();
  s.cat.position.set(at.x, ground.y(at.x, at.z), at.z);
  return s;
}
function gorgeJoined(at) {
  const r = joined();
  const s = gorgeSession(at);
  r.player.setAvatar(s.cat, 3.5); // cat one's player now walks the Gorge session's cat, on the Gorge's ground
  r.player.setGround(ground);
  r.player.enable(); r.player.setTouchEngaged(true);
  r.setSession(s); r.tick(2);
  return { r, s };
}
const routeFrom = (start, target) => route(area, start, target);
const routeTo = (target) => routeFrom(area.spawn, target);

describe('couch play M5(c): the Gorge row', () => {
  it('the Gorge is ready, with this file green', () => { expect(COOP_READY.gorge).toBe(true); });
});

describe('couch play M5(c): cat two on the Gorge\'s real ground', () => {
  it('joins beside cat one on the same level, on the floor, in every cave and in the dens', () => {
    const spots = [area.spawn, ...GORGE_CAVES.map((c) => pathOf(c).at(-1)), ...GORGE_DENS.map((d) => d.mouth)];
    for (const at of spots) {
      const { r, s } = gorgeJoined(at);
      const g = r.two().group.position;
      expect(isWalkableAt(s.areaData, g.x, g.z), JSON.stringify(at)).toBe(true);
      expect(Math.abs(ground.y(g.x, g.z) - ground.y(at.x, at.z)), `${JSON.stringify(at)}: cat two landed on another level`).toBeLessThan(0.5);
      expect(ground.canStep(at.x, at.z, g.x, g.z), `${JSON.stringify(at)}: no way from one cat to the other`).toBe(true);
      reset();
    }
  });

  it('cat two walks on its own stick from the spawn, and ends only on ground a cat can stand on', () => {
    const { r, s } = gorgeJoined();
    const start = r.two().group.position.clone();
    let far = 0;
    for (const axes of [[1, 0, 0, 0], [0, 1, 0, 0], [-1, 0, 0, 0], [0, -1, 0, 0]]) {
      set(r, pad(0), pad(1, [], axes)); r.tick(40);
      const g = r.two().group.position;
      far = Math.max(far, dist(g, start));
      expect(isWalkableAt(s.areaData, g.x, g.z)).toBe(true);
    }
    expect(far).toBeGreaterThan(1.5);
  });

  for (const cave of GORGE_CAVES) {
    it(`${cave.id}: a cat two left outside is brought in (a stuck trot hops to its friend, on the friend's level)`, () => {
      // both stand at the cave's mouth; cat one walks the cave's path to the chamber while cat two sits (no stick)
      const { r, s } = gorgeJoined(cave.mouth);
      const end = pathOf(cave).at(-1);
      const route = routeFrom(cave.mouth, end);
      expect(route, 'a way in on foot').not.toBeNull();
      let i = 1;
      for (let f = 0; f < 60 * 80 && !(i >= route.length && dist(r.two().group.position, s.cat.position) < 3.5); f++) {
        const p = s.cat.position;
        while (i < route.length && dist(p, route[i]) < 0.45) i++;
        const t = route[Math.min(i, route.length - 1)];
        set(r, pad(0, [], i >= route.length ? [0, 0, 0, 0] : stickFor(r, t.x - p.x, t.z - p.z)), pad(1));
        r.tick(1);
      }
      const one = s.cat.position, two = r.two().group.position;
      expect(dist(one, end), 'cat one reached the chamber').toBeLessThan(3);
      expect(dist(one, two), 'cat two was left outside').toBeLessThan(4);
      expect(Math.abs(ground.y(two.x, two.z) - ground.y(one.x, one.z)), 'cat two is on another level').toBeLessThan(0.5);
      expect(isWalkableAt(s.areaData, two.x, two.z)).toBe(true);
    }, 60_000);
  }
});

describe('couch play M5(c): the camera in the caves is the tight-place rule, and keeps out of the rock', () => {
  for (const cave of GORGE_CAVES) {
    it(`${cave.id}: both cats in the chamber, the camera stays under the roof, above the floor, and the cats are held`, () => {
      const end = pathOf(cave).at(-1);
      const { r, s } = gorgeJoined(end);
      r.tick(120);
      const cam = r.camera.position;
      const floor = ground.y(cam.x, cam.z);
      expect(cam.y).toBeGreaterThanOrEqual(floor + MIN_CAMERA_Y - 1e-6);
      expect(cam.y).toBeLessThan(ground.ceil(cam.x, cam.z));
      expect(r.h.state.tight).toBe(true);
      // the leash holds the pair no farther apart than they are: push cat two away, it does not leave the frame
      const before = r.h.state.apart;
      set(r, pad(0), pad(1, [], [1, 0, 0, 0])); r.tick(90);
      expect(r.h.state.apart).toBeLessThanOrEqual(Math.max(before, 2) + 0.6);
      expect(underCeiling(ground, s.cat.position.x, s.cat.position.y, s.cat.position.z)).toBe(true);
    });
  }

  it('in the open on the floor the camera is not pulled in (the tight rule is for rock and roofs)', () => {
    const { r } = gorgeJoined();
    r.tick(200);
    expect(r.h.state.pull).toBeGreaterThan(0.6);
  });
});

describe('couch play M5(c): the caves\' light follows the deeper cat', () => {
  it('cat one in the open, cat two deep in a cave: the dark, the glow and the crystals are cat two\'s', () => {
    const cave = GORGE_CAVES[0];
    const sun = new THREE.DirectionalLight(0xffffff, 2), fill = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    const sc = new THREE.Scene();
    const life = createGorgeLife({ scene: sc, sun, fill, ground, reducedMotion: true, caves: GORGE_CAVES, interiors: [] });
    const out = { x: -44, y: 0, z: -11 };
    const deep = new THREE.Object3D();
    const end = pathOf(cave).at(-1);
    deep.position.set(end.x, ground.y(end.x, end.z), end.z);
    const alone = { remotes: { list: [] } }, couch = { remotes: { list: [{ local: true, group: deep }] } };
    for (let i = 0; i < 400; i++) life.update(1 / 30, i / 30, out, null, alone);
    const lit = life.depth;
    for (let i = 0; i < 400; i++) life.update(1 / 30, i / 30, out, null, couch);
    expect(lit).toBe(0);
    expect(life.depth).toBeGreaterThan(0.5);
    for (let i = 0; i < 400; i++) life.update(1 / 30, i / 30, out, null, alone);
    expect(life.depth).toBe(0); // and solo play is as it was: cat one's own depth alone
    life.dispose();
  });
});

describe('couch play M5(c): no stuck spots, and the finds on the ground are the household\'s', () => {
  // the finds a cat with no skills reaches on foot: the ground ones (the chain-top mouse stays cat one's, as in the Woods)
  const groundFinds = [...area.collectibles, ...GOLD_MICE.gorge.filter((g) => g.y === 0)];

  it('every ground find has a route on foot from the spawn (cat two has the same ground and walls as cat one)', () => {
    for (const f of groundFinds) expect(routeTo(f), f.id).not.toBeNull();
  }, 120_000);

  it('cat two\'s own headless player walks the route to a cave\'s find and the den\'s mouse, and ends in reach', () => {
    const pick = { key: 'siamese', breed: 'siamese', name: 'Siamese', look: null };
    const progression = createProgression(memoryStorage());
    for (const f of [groundFinds.find((x) => x.id === 'gorge-find-1'), groundFinds.find((x) => x.id === 'gm-gorge-3')]) {
      const route = routeTo(f);
      const m = createMover({ ground, state: progression.state, pick, at: { x: area.spawn.x, z: area.spawn.z } });
      let i = 1;
      for (let n = 0; n < 30 * 400 && i < route.length; n++) {
        const p = m.body.position;
        while (i < route.length && dist(p, route[i]) < 0.5) i++;
        const t = route[Math.min(i, route.length - 1)];
        const y = 0, dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz) || 1;
        m.player.setTouchMove({ x: dx / d, z: dz / d, mag: 1 });
        m.player.update(1 / 30, area.colliders, area.bounds, area.waters);
        void y;
      }
      expect(dist(m.body.position, f), f.id).toBeLessThan(1.2);
    }
  }, 120_000);

  it('cat two collecting every ground find writes the same save as cat one collecting them, and each pays once', () => {
    const run = (who) => {
      const progression = createProgression(memoryStorage());
      const log = createDiscoveryLog(progression);
      log.startWalk();
      const meshes = new Map(area.collectibles.map((c) => [c.id, new THREE.Group()]));
      for (const m of meshes.values()) world.add(m);
      const mice = new Map(GOLD_MICE.gorge.map((g) => [g.id, g]));
      const s = {
        areaId: 'gorge', scene: world, ground, areaData: { ...area, collectibles: area.collectibles.map((c) => ({ ...c })) }, collectibleMeshes: meshes,
        walk: { carried: 0, carryCap: 5 }, fx: { burst() {} },
        goldMice: { checkFind: (p) => [...mice.values()].find((g) => g.y === 0 && dist(g, p) < 1) ?? null, nearestUnfound: () => null, remove: (id) => mice.delete(id) },
      };
      const pick = { key: 'siamese', breed: 'siamese', name: 'Siamese', look: null };
      const audio = new Proxy({}, { get: () => () => {} });
      const finds = createFinds({ ctx: { progression, log, audio }, drawn: () => new THREE.Group(), pick: () => pick });
      const mover = createMover({ ground, state: progression.state, pick, at: area.spawn });
      for (const f of groundFinds) {
        mover.body.position.set(f.x, ground.y(f.x, f.z), f.z);
        if (who === 'two') {
          if (area.collectibles.some((c) => c.id === f.id)) { expect(finds.reach(s, mover, mover.body)).toMatchObject({ kind: 'collect' }); finds.interact(s, mover, mover.body); }
          else finds.frame(1 / 30, s, mover, mover.body, false);
        } else if (area.collectibles.some((c) => c.id === f.id)) { // cat one's own collect rule (game/interactions.js): the pocket, the log's key
          s.scene.remove(meshes.get(f.id)); meshes.delete(f.id); s.walk.carried++; log.awardOnce('collectible', `col-${f.id}`, f.label);
        } else if (progression.recordGolden(f.id)) { log.awardOnce('legend', f.id, 'a GOLDEN MOUSE! 🥇'); mice.delete(f.id); }
      }
      return { save: JSON.stringify(progression.state), s, progression };
    };
    const two = run('two'), one = run('one');
    expect(two.save).toBe(one.save);
    expect(two.s.walk.carried).toBe(one.s.walk.carried);
    expect(two.s.walk.carried).toBe(area.collectibles.length);
    expect(two.progression.state.golden.length).toBeGreaterThan(0);
  });

  it('the save has no key of couch play after a walk with both cats in the caves', () => {
    const { r } = gorgeJoined(GORGE_CAVES[0].mouth);
    const keys = Object.keys(r.progression.state);
    set(r, pad(0), pad(1, [], [1, 0, 0, 0])); r.tick(120);
    expect(Object.keys(r.progression.state)).toEqual(keys);
    expect(coop.poll).toBeTypeOf('function');
  });
});
