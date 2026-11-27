import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';

// Couch play M5(b): the Market Square. Cat two takes part in the six missions from its own spot and its own mouth
// (mouse, glove, pigeons, bell, stray, fiddler), through the same step machines, keys and pays as cat one: a mission is
// the household's, done once and paid once; the save is a solo walk's. Real Market plan and mission code, real discovery
// log and progression; the pictures, the bell's awnings (cat two does not climb) and the pads are cat one's or M6's.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { createErrands } = await import('../src/world/marketerrandlive.js');
const { ERRAND, ERRAND_IDS, errandKey, musicianSpot } = await import('../src/world/marketerrands.js');
const { marketArea } = await import('../src/world/marketplan.js');
const { createFinds, FISH_HEAD_ID } = await import('../src/coop/finds.js');
const { createMover } = await import('../src/coop/second.js');
const { COOP_READY } = await import('../src/coop/table.js');
const { createProgression } = await import('../src/progression.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { createCarryables } = await import('../src/carryables.js');
const { createMouth, pick: pickUp } = await import('../src/carry.js');
const { FLAT_GROUND } = await import('../src/ground.js');
const { isWalkableAt } = await import('../src/player.js');

const DT = 1 / 30;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const FAR = { x: -19, z: 21 }; // cat one's parking spot: nowhere near a mission

function walk({ follower = false } = {}) {
  const scene = new THREE.Scene();
  const area = marketArea();
  const progression = createProgression(memoryStorage());
  const log = createDiscoveryLog(progression);
  log.startWalk();
  if (follower) progression.state.journal = { ...(progression.state.journal ?? {}), mkstray: 1 }; // fed on an earlier walk: he follows from the start
  const errands = createErrands({ scene, ground: FLAT_GROUND, area, log, progression });
  const items = createCarryables(scene, area.carryables ?? [{ id: ERRAND.GLOVE_ID, kind: 'glove', x: 6.5, z: -2.8 }]);
  const session = {
    areaId: 'market', scene, ground: FLAT_GROUND, areaData: { ...area, collectibles: [] }, collectibleMeshes: new Map(),
    walk: { carried: 0, carryCap: 5 }, fx: { burst() {} }, goldMice: { checkFind: () => null, nearestUnfound: () => null, remove() {} },
    carry: { mouth: createMouth(), items }, scent: null, perched: null, rest: null,
    areaLife: { second: (p, s) => errands.second(p, s) },
  };
  const pick = { key: 'siamese', breed: 'siamese', name: 'Siamese', look: null };
  const mover = createMover({ ground: FLAT_GROUND, state: progression.state, pick, at: { x: 0, z: 20 } });
  const finds = createFinds({ ctx: { progression, log, audio: {} }, drawn: () => new THREE.Group(), pick: () => pick });
  const one = { x: FAR.x, z: FAR.z };
  let t = 0;
  const w = { scene, area, errands, progression, log, session, mover, finds, items, one, t: () => t };
  // one frame of the walk: cat one's update, then cat two's frame (the order main.js and coop.late take)
  w.tick = (n = 1, speed = 0) => {
    for (let i = 0; i < n; i++) {
      t += DT;
      errands.update(DT, t, { x: one.x, y: 0, z: one.z }, session);
      mover.player.speed; // (headless: the mover's speed is its own; a standing cat reads 0)
      finds.frame(DT, session, mover, mover.body, false);
    }
    return speed;
  };
  w.two = (p) => { mover.body.position.set(p.x, 0, p.z); };
  w.press = () => finds.interact(session, mover, mover.body);
  w.save = () => JSON.stringify(progression.state);
  w.stray = () => scene.getObjectByName('marketStray');
  return w;
}
const paid = (w, id) => w.log.count(errandKey(id));

describe('couch play M5(b): the Market row', () => {
  it('the Market is ready, with this file green', () => {
    expect(COOP_READY.market).toBe(true);
    expect(FISH_HEAD_ID).toBe(ERRAND.FISH_HEAD_ID);
  });
});

describe('couch play M5(b): no stuck spots', () => {
  it('every mission\'s spot can be reached on foot from the gate', () => {
    const area = marketArea();
    const b = area.bounds, step = 0.5;
    const key = (x, z) => `${Math.round(x / step)},${Math.round(z / step)}`;
    const seen = new Set([key(area.spawn.x, area.spawn.z)]);
    const queue = [[area.spawn.x, area.spawn.z]];
    while (queue.length) {
      const [x, z] = queue.pop();
      for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < b.minX || nx > b.maxX || nz < b.minZ || nz > b.maxZ || seen.has(key(nx, nz)) || !isWalkableAt(area, nx, nz)) continue;
        seen.add(key(nx, nz));
        queue.push([nx, nz]);
      }
    }
    const reach = (p, r) => { for (let a = 0; a < 16; a++) for (const k of [0.4, 0.7, 1]) if (seen.has(key(p.x + Math.sin(a * Math.PI / 8) * r * k, p.z + Math.cos(a * Math.PI / 8) * r * k))) return true; return false; };
    for (const p of ERRAND.MOUSE_SPOTS) expect(reach(p, ERRAND.MOUSE_FLEE), 'a mouse spot').toBe(true);
    expect(reach(ERRAND.GLOVE_OWNER, ERRAND.GLOVE_R)).toBe(true);
    for (const p of ERRAND.TABLES) expect(reach(p, ERRAND.PIGEON_R), 'a cafe table').toBe(true);
    expect(reach(ERRAND.STRAY_SPOT, ERRAND.STRAY_SEE)).toBe(true);
    expect(reach(ERRAND.FISH_HEAD_SPOT, 1.2)).toBe(true);
    expect(reach(musicianSpot, ERRAND.SONG_R)).toBe(true);
  });
});

describe('couch play M5(b): cat two does the missions, cat one nowhere near', () => {
  it('the mouse: four near passes by cat two send it home, paid once', () => {
    const w = walk();
    for (const p of [...ERRAND.MOUSE_SPOTS]) { w.two(p); w.tick(1); w.tick(20); } // (it darts between spots over ~0.45 s)
    for (let i = 0; i < 3 && paid(w, 'mouse') === 0; i++) { w.two(ERRAND.MOUSE_SPOTS[3]); w.tick(20); }
    expect(w.errands.state.mouse.n).toBe(4);
    expect(paid(w, 'mouse')).toBe(1);
  });

  it('the pigeons: cat two at each cafe table sends them up; paid once, by the same key', () => {
    const w = walk();
    for (const tb of ERRAND.TABLES) { w.two({ x: tb.x + 0.5, z: tb.z }); w.tick(5); }
    expect(w.errands.state.pigeons.bits).toBe(7);
    expect(paid(w, 'pigeons')).toBe(1);
  });

  it('the glove: picked up with cat two\'s own mouth (cat one\'s stays free) and handed to its owner', () => {
    const w = walk();
    const g = w.items.list.find((i) => i.id === ERRAND.GLOVE_ID);
    w.two({ x: g.homeX, z: g.homeZ });
    expect(w.finds.reach(w.session, w.mover, w.mover.body)).toMatchObject({ kind: 'carry', label: 'glove' });
    w.press(); w.tick(2);
    expect(w.finds.held?.id).toBe(ERRAND.GLOVE_ID);
    expect(w.session.carry.mouth.held).toBeNull();
    expect(w.errands.state.glove.stage).toBe(1);
    w.two({ x: ERRAND.GLOVE_OWNER.x, z: ERRAND.GLOVE_OWNER.z });
    w.tick(3);
    expect(w.errands.state.glove.stage).toBe(2);
    expect(w.finds.held).toBeNull(); // handed over: nothing left in its mouth
    expect(paid(w, 'glove')).toBe(1);
  });

  it('the stray: met, fed the fish head by cat two, follows the nearer cat', () => {
    const w = walk();
    w.two({ x: ERRAND.STRAY_SPOT.x + 2, z: ERRAND.STRAY_SPOT.z });
    w.tick(3);
    expect(w.errands.state.stray.stage).toBe(1);
    const head = w.items.list.find((i) => i.id === ERRAND.FISH_HEAD_ID);
    expect(head, 'the fish head is out once the stray is met').toBeTruthy();
    w.two({ x: ERRAND.FISH_HEAD_SPOT.x, z: ERRAND.FISH_HEAD_SPOT.z });
    expect(w.finds.reach(w.session, w.mover, w.mover.body)).toMatchObject({ kind: 'carry' });
    w.press(); w.tick(2);
    expect(w.finds.held?.id).toBe(ERRAND.FISH_HEAD_ID);
    w.two({ x: ERRAND.STRAY_SPOT.x + 1, z: ERRAND.STRAY_SPOT.z });
    w.tick(3);
    expect(w.errands.state.stray.stage).toBe(2);
    expect(w.finds.held).toBeNull();
    expect(paid(w, 'stray')).toBe(1);
  });

  it('a stray fed on an earlier walk follows the nearer cat: cat two when cat one is parked far away', () => {
    const w = walk({ follower: true });
    w.one.x = 0; w.one.z = 10; // he appears beside cat one...
    w.two({ x: 3, z: 6 });
    w.tick(2);
    w.one.x = FAR.x; w.one.z = FAR.z; // ...which then goes far off, and cat two is the nearer
    const before = dist(w.stray().position, w.mover.body.position);
    w.tick(120);
    expect(dist(w.stray().position, w.mover.body.position)).toBeLessThan(before);
    expect(dist(w.stray().position, w.mover.body.position)).toBeLessThan(dist(w.stray().position, w.one) - 5);
  });

  it('the fiddler\'s song: cat two sitting still beside him is heard, once, by the household', () => {
    const w = walk();
    w.two({ x: musicianSpot.x + 1, z: musicianSpot.z });
    w.tick(Math.ceil((ERRAND.SONG_S + 2) / DT));
    expect(paid(w, 'fiddle')).toBe(1);
  });

  it('cat two does not need to climb: the bell\'s awnings stay cat one\'s, and nothing of cat two can unpay a mission', () => {
    const w = walk();
    w.tick(10);
    expect(w.errands.state.bell).toEqual({ t: -1, seen: 0 });
    expect(ERRAND_IDS).toHaveLength(6);
  });
});

describe('couch play M5(b): shared goals count once, and the save is a solo walk\'s', () => {
  const script = (who) => {
    const w = walk();
    const at = (p, n = 3) => {
      if (who === 'two') w.two(p); else { w.one.x = p.x; w.one.z = p.z; }
      w.tick(n);
      // (cat one's frame reads the parked spot; cat two's reads the mover: the same numbers either way)
      if (who === 'two') { w.one.x = FAR.x; w.one.z = FAR.z; }
    };
    const take = (id) => {
      const it = w.items.list.find((i) => i.id === id);
      if (who === 'two') { w.press(); } else { pickUp(w.session.carry.mouth, it); w.items.hold(id, new THREE.Group()); }
      w.tick(2);
    };
    for (const tb of ERRAND.TABLES) at({ x: tb.x + 0.5, z: tb.z }, 5);
    for (const p of ERRAND.MOUSE_SPOTS) { at(p, 20); }
    at(ERRAND.MOUSE_SPOTS[3], 30);
    const g = w.items.list.find((i) => i.id === ERRAND.GLOVE_ID);
    at({ x: g.homeX, z: g.homeZ }); take(ERRAND.GLOVE_ID);
    at(ERRAND.GLOVE_OWNER, 4);
    at({ x: ERRAND.STRAY_SPOT.x + 2, z: ERRAND.STRAY_SPOT.z }, 4);
    at(ERRAND.FISH_HEAD_SPOT, 2); take(ERRAND.FISH_HEAD_ID);
    at({ x: ERRAND.STRAY_SPOT.x + 1, z: ERRAND.STRAY_SPOT.z }, 4);
    at({ x: musicianSpot.x + 1, z: musicianSpot.z }, Math.ceil((ERRAND.SONG_S + 2) / DT));
    return w;
  };

  it('cat two doing the missions writes the same save as cat one doing them, and pays each of the five it can once', () => {
    const two = script('two');
    const one = script('one');
    for (const id of ['mouse', 'glove', 'pigeons', 'stray', 'fiddle']) { expect(paid(two, id), id).toBe(1); expect(paid(one, id), id).toBe(1); }
    expect(two.save()).toBe(one.save());
  });

  it('both cats at the pigeons and the mouse together: still one pay each', () => {
    const w = walk();
    const tb = ERRAND.TABLES[0];
    w.one.x = tb.x; w.one.z = tb.z;
    w.two({ x: tb.x + 0.4, z: tb.z });
    w.tick(10);
    for (const t2 of ERRAND.TABLES.slice(1)) { w.one.x = t2.x; w.one.z = t2.z; w.two({ x: t2.x + 0.3, z: t2.z }); w.tick(10); }
    expect(paid(w, 'pigeons')).toBe(1);
    const before = w.save();
    w.tick(60);
    expect(w.save()).toBe(before);
  });

  it('no key and no field of couch play in the save', () => {
    const w = walk();
    const keys = Object.keys(w.progression.state);
    w.two(ERRAND.TABLES[0]); w.tick(10);
    expect(Object.keys(w.progression.state)).toEqual(keys);
  });

  it('a cat two that has gone (no more frames) is forgotten after a moment: the stray follows cat one again', () => {
    const w = walk();
    w.two({ x: ERRAND.STRAY_SPOT.x + 2, z: ERRAND.STRAY_SPOT.z }); w.tick(3);
    w.errands.second(null);
    w.one.x = ERRAND.STRAY_SPOT.x - 1; w.one.z = ERRAND.STRAY_SPOT.z;
    w.tick(2);
    expect(w.errands.state.stray.stage).toBeGreaterThanOrEqual(1);
  });
});
