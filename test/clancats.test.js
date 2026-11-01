import { describe, it, test, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  createClanCats, CLAN_WANDER_SALT, BUDDY_TIME, PATROL_MIN, BUDDY_GIVE_UP, BUDDY_EDGE, buddyEnded,
} from '../src/clancats.js';
import { castFor, clanCountFor, lonersFor, roamHomes, RANK_SCALE, CLAN_COATS, ROAM_SLOTS, ROAM_RADIUS } from '../src/clancast.js';
import { campLayout } from '../src/world/camp.js';
import { RANK_KEYS } from '../src/clanwords.js';
import { createStrayCats, strayStream, CAT_NAMES } from '../src/straycats.js';
import { buildCat } from '../src/cat/model.js';

// Clan Life Part 1, Task 3: the territory's clan, in the walk. Headless THREE,
// as test/straycats.test.js runs it: no document, so makeNameTag returns null
// unless a test stubs one.

function fakeScene() {
  const objects = new Set();
  return { objects, add: (o) => objects.add(o), remove: (o) => objects.delete(o) };
}

const AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, colliders: [] };
const OPEN = () => true;
const K = RANK_KEYS;
const CAMP_RANKS = new Set([K.leader, K.deputy, K.elder, K.kit]);

function spawn({
  areaId = 'woods', count = 16, showNames = true, roomSeed = 42, reducedMotion = false,
  isWalkable = OPEN, homes, area = AREA, scene = fakeScene(), onBuddyEnd = () => {},
} = {}) {
  const cast = castFor(areaId).slice(0, count);
  return createClanCats(scene, area, cast, {
    campLayout: campLayout(areaId),
    roamHomes: homes ?? roamHomes(areaId, area, isWalkable),
    isWalkable,
    roomSeed,
    showNames,
    reducedMotion,
    areaId,
    onBuddyEnd,
  });
}

const run = (cats, secs, catPos = new THREE.Vector3(999, 0, 999), each = () => {}) => {
  const dt = 1 / 30;
  for (let i = 0; i < Math.round(secs / dt); i++) {
    cats.update(dt, i * dt, catPos);
    each(i);
  }
};

function withFakeDocument(fn) {
  const prev = globalThis.document;
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  try { return fn(); } finally {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
}

afterEach(() => vi.restoreAllMocks());

describe('createClanCats', () => {
  test('the cast agrees across tiers as a prefix, and across editions exactly', () => {
    const pose = (c) => [c.id, c.group.position.x, c.group.position.z, c.group.rotation.y];
    const high = spawn({ count: 16, showNames: true, roomSeed: 42 });
    const low = spawn({ count: 9, showNames: true, roomSeed: 42 });
    const legacy = spawn({ count: 16, showNames: false, roomSeed: 42 });
    expect(high.list).toHaveLength(16);
    expect(low.list).toHaveLength(9);
    expect(high.list.slice(0, 9).map(pose)).toEqual(low.list.map(pose));
    expect(legacy.list.map(pose)).toEqual(high.list.map(pose));
    expect(legacy.list.every((c) => c.tag === null)).toBe(true); // Legacy: no tag at all
  });

  test('a clan cat carries the documented fields, in slot order', () => {
    const cats = spawn();
    cats.list.forEach((c, i) => {
      expect(c.slot).toBe(i);
      expect(c.clan).toBe('woods');
      expect(c.home).toBeInstanceOf(THREE.Vector3);
      expect([c.greeted, c.booped, c.patrolled, c.buddy]).toEqual([false, false, false, null]);
      expect(c.name).toBe(castFor('woods')[i].name);
      expect(c.rank).toBe(castFor('woods')[i].rank);
    });
  });

  test('a clan reads as one family: every cat wears a row of its own clan\'s palette', () => {
    for (const areaId of ['woods', 'river', 'moor', 'pines']) {
      const bases = CLAN_COATS[areaId].map((r) => new THREE.Color(r.base).getHex());
      const others = Object.entries(CLAN_COATS).filter(([id]) => id !== areaId)
        .flatMap(([, rows]) => rows.map((r) => new THREE.Color(r.base).getHex()));
      for (const c of spawn({ areaId }).list) {
        const ear = c.group.userData.parts.earL.material.color.getHex();
        expect(bases, `${c.id}`).toContain(ear);
        expect(others).not.toContain(ear);
      }
    }
  });

  test('camp cats sit at their seats, facing the camp\'s centre', () => {
    const L = campLayout('woods');
    const cats = spawn();
    const at = (slot) => cats.list[slot].group.position;
    expect([at(0).x, at(0).y, at(0).z]).toEqual([L.seats.leader.x, L.seats.leader.y, L.seats.leader.z]);
    expect([at(9).x, at(9).z]).toEqual([L.seats.deputy.x, L.seats.deputy.z]);
    expect([at(1).x, at(1).z]).toEqual([L.seats.elders[0].x, L.seats.elders[0].z]);
    expect([at(10).x, at(10).z]).toEqual([L.seats.elders[1].x, L.seats.elders[1].z]);
    expect([2, 3, 11, 12].map((s) => [at(s).x, at(s).z])).toEqual(L.seats.kits.map((k) => [k.x, k.z]));
    for (const c of cats.list.filter((c) => CAMP_RANKS.has(c.rank))) {
      const p = c.group.position;
      const want = Math.atan2(L.cx - p.x, L.cz - p.z) + Math.PI;
      expect(c.group.rotation.y).toBeCloseTo(want, 9);
    }
  });

  test('roamers stand at the roaming homes, slots 4-8 then 13-15', () => {
    const homes = roamHomes('woods', AREA, OPEN);
    const cats = spawn();
    ROAM_SLOTS.forEach((slot, i) => {
      expect(cats.list[slot].home.x).toBe(homes[i].x);
      expect(cats.list[slot].home.z).toBe(homes[i].z);
      expect(cats.list[slot].group.position.x).toBe(homes[i].x);
    });
  });

  test('fed colony cats stay visible: 8 fed cats on HIGH give 8 loners and 13 clan cats', () => {
    expect(lonersFor('woods', 22, 8)).toBe(8);
    expect(castFor('woods').slice(0, clanCountFor(22, 8)).length).toBe(13);
    expect(lonersFor('woods', 22, 8) + clanCountFor(22, 8) + 1).toBe(22);
    const colonyCats = CAT_NAMES.slice(0, 8).map((name, i) => ({ name, x: -20 + i * 4, z: 12 }));
    const strays = createStrayCats(fakeScene(), AREA, lonersFor('woods', 22, 8), strayStream(7), { roomSeed: 7, colonyCats });
    expect(strays.strays).toHaveLength(8);
    colonyCats.forEach((c, i) => {
      expect(strays.strays[i].name).toBe(c.name);
      expect([strays.strays[i].group.position.x, strays.strays[i].group.position.z]).toEqual([c.x, c.z]);
    });
  });

  test('co-walkers on one roomSeed stay in step for 60 s of wander', () => {
    const a = spawn({ roomSeed: 42 });
    const b = spawn({ roomSeed: 42 });
    const dt = 1 / 30;
    const far = new THREE.Vector3(999, 0, 999);
    for (let i = 0; i < 1800; i++) {
      a.update(dt, i * dt, far);
      b.update(dt, i * dt, far);
    }
    const pose = (c) => [c.group.position.x, c.group.position.y, c.group.position.z, c.group.rotation.y];
    expect(a.list.map(pose)).toEqual(b.list.map(pose));
    // ...and they did move: the roamers are not standing at home.
    expect(a.list.filter((c) => c.group.position.distanceTo(c.home) > 0.5).length).toBeGreaterThan(0);
  });

  test('different room seeds wander differently', () => {
    const a = spawn({ roomSeed: 42 });
    const b = spawn({ roomSeed: 43 });
    run(a, 30);
    run(b, 30);
    const xs = (s) => s.list.map((c) => c.group.position.x);
    expect(xs(a)).not.toEqual(xs(b));
  });

  // THREE itself calls Math.random for every object's uuid, so the count is
  // measured against building the same cats with buildCat alone: the clan
  // adds no draw of its own at spawn, and none at all while it wanders.
  test('spawning draws nothing from Math.random when a roomSeed is given', () => {
    const cast = castFor('woods');
    const spy = vi.spyOn(Math, 'random');
    for (const m of cast) buildCat(m.breed, undefined, { simple: true, style: m.style });
    const baseline = spy.mock.calls.length;
    spy.mockClear();
    const cats = spawn({ roomSeed: 42 });
    expect(spy.mock.calls.length).toBe(baseline);
    spy.mockClear();
    run(cats, 20);
    expect(spy).not.toHaveBeenCalled();
  });

  test('without a roomSeed it draws one random base, once', () => {
    const spy = vi.spyOn(Math, 'random');
    spawn({ roomSeed: 42 });
    const seeded = spy.mock.calls.length;
    spy.mockClear();
    // (spawn() defaults the seed, so the solo case is built by hand.)
    createClanCats(fakeScene(), AREA, castFor('woods'), {
      campLayout: campLayout('woods'), roamHomes: roamHomes('woods', AREA, OPEN), isWalkable: OPEN,
    });
    expect(spy.mock.calls.length).toBe(seeded + 1);
  });

  test('the wander salt is its own', () => {
    expect(CLAN_WANDER_SALT).toBe(0xc1a9ca75);
  });

  test('camp cats keep their posts; roamers stay within 6.5 m of home and on walkable ground', () => {
    const blocked = (x, z) => x <= 3 && Math.abs(z) < 50;
    const homes = roamHomes('woods', AREA, blocked);
    expect(homes.length).toBe(8);
    const L = campLayout('woods');
    const cats = spawn({ isWalkable: blocked, homes });
    const kitSeats = L.seats.kits;
    const posts = new Map(cats.list.filter((c) => c.rank !== K.kit && CAMP_RANKS.has(c.rank))
      .map((c) => [c.id, c.group.position.clone()]));
    const roamers = cats.list.filter((c) => !CAMP_RANKS.has(c.rank));
    expect(roamers).toHaveLength(8);
    let kitMoved = false;
    run(cats, 120, undefined, () => {
      for (const c of cats.list) {
        const p = c.group.position;
        if (posts.has(c.id)) {
          expect(p.distanceTo(posts.get(c.id))).toBe(0);
        } else if (c.rank === K.kit) {
          const nearSeat = Math.min(...kitSeats.map((s) => Math.hypot(p.x - s.x, p.z - s.z)));
          expect(nearSeat).toBeLessThan(1);
          if (Math.hypot(p.x - c.home.x, p.z - c.home.z) > 0.05) kitMoved = true;
        } else {
          expect(Math.hypot(p.x - c.home.x, p.z - c.home.z)).toBeLessThanOrEqual(6.5);
          expect(blocked(p.x, p.z)).toBe(true);
        }
      }
    });
    expect(kitMoved).toBe(true);
    expect(roamers.filter((c) => c.group.position.distanceTo(c.home) > 0.5).length).toBeGreaterThan(0);
  });

  test('a roamer with no home is left out, deterministically, and nothing throws', () => {
    const homes = roamHomes('woods', AREA, OPEN).slice(0, 3);
    const a = spawn({ homes });
    const b = spawn({ homes });
    // nine camp cats (leader, deputy, two elders, four kits... on HIGH) + three roamers
    expect(a.list.map((c) => c.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 9, 10, 11, 12]);
    expect(a.list.map((c) => c.id)).toEqual(b.list.map((c) => c.id));
    expect(() => run(a, 5)).not.toThrow();
    expect(spawn({ homes: [] }).list.every((c) => CAMP_RANKS.has(c.rank))).toBe(true);
    expect(() => spawn({ homes: undefined, isWalkable: () => false })).not.toThrow();
  });

  test('kits are small, the leader tall, and kits sit still under reduced motion', () => {
    const cats = spawn({ reducedMotion: true });
    for (const c of cats.list) expect(c.group.scale.x).toBeCloseTo(RANK_SCALE[c.rank], 9);
    expect(cats.list[0].group.scale.x).toBeCloseTo(0.95, 9);
    expect(cats.list[2].group.scale.x).toBeCloseTo(0.5, 9);
    const kits = cats.list.filter((c) => c.rank === K.kit);
    const before = kits.map((c) => c.group.position.toArray());
    run(cats, 30);
    expect(kits.map((c) => c.group.position.toArray())).toEqual(before);
  });

  test('tags read the same size on every rank (counter-scaled by 1 / RANK_SCALE)', () => {
    withFakeDocument(() => {
      const cats = spawn({ showNames: true });
      const sizes = cats.list.map((c) => {
        expect(c.tag).toBeTruthy();
        expect(c.tag.parent).toBe(c.group);
        return [c.group.scale.x * c.tag.scale.x, c.group.scale.y * c.tag.scale.y].map((v) => +v.toFixed(9));
      });
      expect(new Set(sizes.map(String)).size).toBe(1);
      expect(cats.list[0].tag.userData.sub).toMatch(/ of /);
      // shown only within the reveal range
      const c = cats.list[4];
      cats.update(1 / 30, 0, c.group.position.clone().add(new THREE.Vector3(1, 0, 0)));
      expect(c.tag.visible).toBe(true);
      cats.update(1 / 30, 0, new THREE.Vector3(999, 0, 999));
      expect(c.tag.visible).toBe(false);
    });
  });

  test('camp-seated cats are noCast; roamers are not', () => {
    for (const c of spawn().list) {
      const flags = [];
      c.group.traverse((o) => { if (o.isMesh) flags.push(o.userData.noCast === true); });
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.every((f) => f === CAMP_RANKS.has(c.rank)), c.id).toBe(true);
    }
  });

  test('the wander asks only the isWalkable it was given', () => {
    const area = { bounds: AREA.bounds, colliders: [] };
    const isWalkable = vi.fn(() => true);
    const homes = roamHomes('woods', area, OPEN);
    const a = spawn({ area, isWalkable, homes });
    const b = spawn({ area: { bounds: AREA.bounds, colliders: [] }, isWalkable: () => true, homes });
    // A device's own scratch post lands on top of every roamer's home.
    for (const h of homes) area.colliders.push({ x: h.x, z: h.z, r: 5 });
    run(a, 60);
    run(b, 60);
    expect(a.list.map((c) => c.group.position.toArray())).toEqual(b.list.map((c) => c.group.position.toArray()));
    expect(isWalkable).toHaveBeenCalled();
  });

  test('nearest, greet and boop', () => {
    const cats = spawn();
    const c = cats.list[5];
    const from = c.group.position.clone().add(new THREE.Vector3(1, 0, 0));
    expect(cats.nearest(from, 2)).toBe(c);
    expect(cats.nearest(from, 2, { where: (x) => x !== c })).not.toBe(c);
    expect(cats.nearest(new THREE.Vector3(999, 0, 999), 2)).toBe(null);
    cats.greet(c, from);
    expect(c.greeted).toBe(true);
    expect(c.group.rotation.y).toBeCloseTo(Math.atan2(1, 0) + Math.PI, 9);
    const pos = c.group.position.clone();
    run(cats, 2.9);
    expect(c.group.position.toArray()).toEqual(pos.toArray()); // held for 3 s
    cats.boop(c, from);
    expect(c.booped).toBe(true);
    // A camp cat goes back to its post's facing after a greet.
    const leader = cats.list[0];
    const face = leader.group.rotation.y;
    cats.greet(leader, leader.group.position.clone().add(new THREE.Vector3(0, 0, 3)));
    run(cats, 3.5);
    expect(leader.group.rotation.y).toBeCloseTo(face, 9);
  });

  test('dispose removes every group', () => {
    const scene = fakeScene();
    const cats = spawn({ scene });
    expect(scene.objects.size).toBe(16);
    cats.dispose();
    expect(scene.objects.size).toBe(0);
  });

  test('clancats.js imports nothing that stores progress', () => {
    const src = readFileSync('src/clancats.js', 'utf8');
    const specs = [...src.matchAll(/^\s*import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    // clanwords.js is a leaf of words (RANK_KEYS, for comparing ranks).
    // rivalclans.js is a leaf too (the camp disc, for a patrol's end).
    const allowed = [
      'three', './cat/model.js', './cat/animator.js', './nametag.js', './rng.js', './clancast.js', './clanwords.js',
      './rivalclans.js',
    ];
    for (const s of specs) expect(allowed).toContain(s);
  });
});

describe('the roaming radius', () => {
  it('matches clancast.js ROAM_RADIUS', () => {
    expect(ROAM_RADIUS).toBe(6);
  });
});

// Clan Life Part 1, Task 6: patrol together. A warrior or apprentice walks
// beside a target (my cat, or a co-walker's) for up to a minute.
describe('patrol together (the buddy)', () => {
  const DT = 1 / 30;
  const ROAMERS = new Set([K.warrior, K.apprentice]);

  function buddyWorld(opts = {}) {
    const ends = [];
    const cats = spawn({ ...opts, onBuddyEnd: (cat, reason, secs) => ends.push([cat.id, reason, secs]) });
    const cat = cats.list.find((c) => c.rank === K.warrior);
    const target = new THREE.Object3D();
    return { cats, cat, target, ends };
  }

  // Steps the world, moving the target with move(t) before each update.
  function step(cats, target, secs, move = () => {}, each = () => {}, t0 = 0) {
    const n = Math.round(secs / DT);
    for (let i = 0; i < n; i++) {
      const t = t0 + (i + 1) * DT;
      move(t);
      cats.update(DT, t, target.position);
      each(t);
    }
    return t0 + n * DT;
  }

  it('the numbers', () => {
    expect([BUDDY_TIME, PATROL_MIN, BUDDY_GIVE_UP, BUDDY_EDGE]).toEqual([60, 30, 12, 4]);
  });

  it('only a warrior or apprentice with no buddy can patrol', () => {
    const { cats, target } = buddyWorld();
    for (const c of cats.list) {
      expect(cats.startBuddy(c, target)).toBe(ROAMERS.has(c.rank));
      if (ROAMERS.has(c.rank)) {
        expect(c.buddy).not.toBe(null);
        expect(cats.startBuddy(c, new THREE.Object3D())).toBe(false); // already has one
      } else {
        expect(c.buddy).toBe(null);
      }
    }
  });

  it('follows a moving target within 2 m for 50 s, then ends with time at 60 s', () => {
    const { cats, cat, target, ends } = buddyWorld();
    // A circle of radius 8 round (-20, 10): far from the woods camp and the edges.
    const at = (t) => {
      const a = (t * 1.5) / 8;
      target.position.set(-20 + Math.sin(a) * 8, 0, 10 + Math.cos(a) * 8);
      target.rotation.y = Math.atan2(Math.cos(a), -Math.sin(a)) + Math.PI;
    };
    at(0);
    cat.group.position.copy(target.position);
    expect(cats.startBuddy(cat, target)).toBe(true);
    let worst = 0;
    const t = step(cats, target, 50, at, (tt) => {
      if (tt > 2) worst = Math.max(worst, cat.group.position.distanceTo(target.position));
    });
    expect(worst).toBeLessThan(2);
    expect(ends).toEqual([]);
    step(cats, target, 10.5, at, () => {}, t);
    expect(ends).toHaveLength(1);
    expect(ends[0][0]).toBe(cat.id);
    expect(ends[0][1]).toBe('time');
    expect(ends[0][2]).toBeGreaterThanOrEqual(BUDDY_TIME);
    expect(ends[0][2]).toBeLessThan(BUDDY_TIME + 0.1);
    expect(cat.buddy).toBe(null);
  });

  it("ends with 'camp' when the target steps into the camp disc", () => {
    const { cats, cat, target, ends } = buddyWorld();
    target.position.set(2, 0, -28);
    cat.group.position.set(3, 0, -28);
    cats.startBuddy(cat, target);
    step(cats, target, 12, (t) => target.position.set(2, 0, -28 - t * 1.5));
    expect(ends.map((e) => e[1])).toEqual(['camp']);
  });

  it("starting inside the camp disc does not end at once: 'camp' needs the target to come back in", () => {
    const { cats, cat, target, ends } = buddyWorld();
    target.position.set(2, 0, -43);
    cat.group.position.set(3, 0, -43);
    cats.startBuddy(cat, target);
    step(cats, target, 1);
    expect(ends).toEqual([]);
  });

  it("ends with 'edge' within BUDDY_EDGE of the map's bounds", () => {
    const { cats, cat, target, ends } = buddyWorld();
    target.position.set(-20, 0, 30);
    cat.group.position.set(-19, 0, 30);
    cats.startBuddy(cat, target);
    step(cats, target, 20, (t) => target.position.set(-20, 0, 30 + t * 1.5));
    expect(ends.map((e) => e[1])).toEqual(['edge']);
    expect(target.position.z).toBeGreaterThan(50 - BUDDY_EDGE - 0.5);
  });

  it("ends with 'far' when the target teleports 15 m", () => {
    const { cats, cat, target, ends } = buddyWorld();
    target.position.set(-20, 0, 10);
    cat.group.position.set(-19, 0, 10);
    cats.startBuddy(cat, target);
    let t = step(cats, target, 2);
    target.position.set(-20 + 15, 0, 10);
    step(cats, target, 2 * DT, () => {}, () => {}, t);
    expect(ends.map((e) => e[1])).toEqual(['far']);
  });

  it('never follows onto ground its clan rejects (water): it stalls there and ends far behind', () => {
    const dry = (x) => x < 0;
    const { cats, cat, target, ends } = buddyWorld({ isWalkable: (x) => dry(x) });
    target.position.set(-6, 0, 10);
    cat.group.position.set(-6, 0, 11);
    cats.startBuddy(cat, target);
    let maxX = -Infinity;
    step(cats, target, 20, (t) => target.position.set(-6 + t * 1.5, 0, 10), () => {
      maxX = Math.max(maxX, cat.group.position.x);
    });
    expect(maxX).toBeLessThan(0);
    expect(ends.map((e) => e[1])).toEqual(['far']);
  });

  it('buddyEnded reads the target and the clock', () => {
    const bounds = AREA.bounds;
    const at = (x, z) => ({ position: new THREE.Vector3(x, 0, z) });
    const cat = (tx, tz, seconds = 5, cx = tx + 1, cz = tz) => ({
      group: { position: new THREE.Vector3(cx, 0, cz) },
      buddy: { target: at(tx, tz), seconds, armed: { camp: true, edge: true } },
    });
    expect(buddyEnded(cat(-20, 10), { areaId: 'woods', bounds })).toBe(null);
    expect(buddyEnded(cat(-20, 10, 60), { areaId: 'woods', bounds })).toBe('time');
    expect(buddyEnded(cat(2, -43), { areaId: 'woods', bounds })).toBe('camp');
    expect(buddyEnded(cat(-48, 10), { areaId: 'woods', bounds })).toBe('edge');
    expect(buddyEnded(cat(-20, 10, 5, -20, 23), { areaId: 'woods', bounds })).toBe('far');
    expect(buddyEnded({ buddy: null }, { areaId: 'woods', bounds })).toBe(null);
  });

  it('endBuddy says goodbye and walks it home', () => {
    const { cats, cat, target, ends } = buddyWorld();
    const home = cat.home.clone();
    target.position.copy(home);
    cat.group.position.copy(home).add(new THREE.Vector3(1, 0, 0));
    cats.startBuddy(cat, target);
    const t = step(cats, target, 8, (tt) => target.position.set(home.x + Math.min(tt, 6), 0, home.z));
    const away = cat.group.position.distanceTo(home);
    expect(away).toBeGreaterThan(4);
    const { seconds } = cats.endBuddy(cat);
    expect(seconds).toBeCloseTo(8, 1);
    expect(cat.buddy).toBe(null);
    expect(cats.endBuddy(cat)).toEqual({ seconds: 0 }); // no buddy: a no-op
    step(cats, target, 30, () => {}, () => {}, t);
    expect(cat.group.position.distanceTo(home)).toBeLessThan(6.5); // home, then its usual 2-6 m wander
    expect(ends).toEqual([]); // endBuddy itself reports nothing: the caller does
  });

  it('markBeside: it stops a second where it stands, then catches up', () => {
    const { cats, cat, target } = buddyWorld();
    target.position.set(-20, 0, 10);
    cat.group.position.set(-19, 0, 10);
    cats.startBuddy(cat, target);
    let t = step(cats, target, 1);
    const at = cat.group.position.clone();
    cats.markBeside(cat);
    t = step(cats, target, 0.5, (tt) => target.position.set(-20 + (tt - 1) * 2, 0, 10), () => {}, t);
    expect(cat.group.position.distanceTo(at)).toBeLessThan(1e-9);
    step(cats, target, 1.5, () => {}, () => {}, t);
    expect(cat.group.position.distanceTo(at)).toBeGreaterThan(0.5);
    expect(cat.buddy).not.toBe(null);
  });
});
