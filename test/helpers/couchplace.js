// The checks every place gets for couch play (M5d), run against the REAL built place: cat two joins clear and on the friend own
// level, can walk off, follows cat one along the longest way on foot (up every stair and ramp the place has), is hopped to the
// friend own level by a stuck trot and never to another one, and writes nothing to the save. Fake pads, real player code.
import { describe, it, expect, afterEach } from 'vitest';
import { joined, pad, set, reset, newSession, createRemoteCats, FLAT_GROUND, THREE } from './couchrig.js';
import { reachFrom, walkRoute } from './couchroute.js';
import { isWalkableAt, isWadeableAt } from '../../src/player.js';
import { COOP_READY } from '../../src/coop/table.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** opts: { id, build(scene) -> record, session(s, record) extra wiring }. Returns the pieces a place file adds its own tests to. */
export function placeSuite({ id, build, wire = null, ready = true, joinSpots = null }) {
  afterEach(reset);
  const world = new THREE.Scene();
  const record = build(world);
  const ground = record.ground ?? FLAT_GROUND;
  const area = { ...record, ground };
  const slack = { ...area, colliders: (record.colliders ?? []).map((c) => ({ ...c, r: c.r - 1e-6 })) }; // a cat pushed out of a collider stands on its rim to the last bit of a float
  const levelAt = (p) => ground.y(p.x, p.z);
  const same = (a, b) => (ground.flat ? true : Math.abs(levelAt(a) - levelAt(b)) < 0.5 + dist(a, b) / 3); // the same floor: a slope of the place can carry the two cats a little apart in height (1 in 3 at most)

  function makeSession(at = record.spawn) {
    const s = newSession(id, { ground });
    s.scene = world;
    s.remotes = createRemoteCats(world, { ground });
    world.add(s.cat);
    s.areaData = { collectibles: [], waters: [], perches: [], ...record, ground };
    s.collectibleMeshes = new Map();
    wire?.(s, record);
    s.cat.position.set(at.x, ground.flat ? 0 : ground.y(at.x, at.z), at.z);
    return s;
  }
  function start(at) {
    const r = joined();
    const s = makeSession(at);
    r.player.setAvatar(s.cat, 3.5);
    r.player.setGround(ground);
    if (record.cameraGround) r.player.setCameraGround(record.cameraGround);
    r.player.enable(); r.player.setTouchEngaged(true);
    r.setSession(s); r.tick(2);
    return { r, s };
  }
  const reach = reachFrom(area, record.spawn);
  const cells = reach.cells;
  // far spots: the farthest, the highest and the lowest reachable, and a spread in between
  const byY = [...cells].sort((a, b) => levelAt(a) - levelAt(b));
  const far = cells[cells.length - 1];
  const spots = joinSpots ?? [record.spawn, far, byY[0], byY.at(-1), cells[Math.floor(cells.length / 3)], cells[Math.floor(cells.length * 2 / 3)]];

  describe(`couch play M5d: ${id}`, () => {
    it('is ready, with this file green', () => { expect(COOP_READY[id]).toBe(ready); });

    it('has a real way on foot (the checks below are not empty)', () => { expect(cells.length).toBeGreaterThan(400); });

    it('cat two joins beside cat one on clear floor of the same level, from the spawn and a spread of spots', () => {
      for (const at of spots) {
        const { r, s } = start(at);
        const g = r.two().group.position;
        expect(isWalkableAt(s.areaData, g.x, g.z), `${at.x},${at.z}`).toBe(true);
        expect(same(g, at), `${at.x},${at.z}: another level`).toBe(true);
        expect(dist(g, at), `${at.x},${at.z}: far apart`).toBeLessThan(5);
        reset();
      }
    });

    it('cat two can walk away from where it stands, and stays on walkable ground of its own level', () => {
      for (const at of [record.spawn, far]) {
        const { r, s } = start(at);
        const p0 = r.two().group.position.clone();
        let farD = 0;
        for (const axes of [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, -1, 0, 0]]) {
          set(r, pad(0), pad(1, [], axes));
          for (let f = 0; f < 45; f++) {
            r.tick(1);
            const g = r.two().group.position;
            expect(isWadeableAt({ ...s.areaData, colliders: slack.colliders }, g.x, g.z), `${id}: cat two inside something at ${g.x},${g.z}`).toBe(true);
          }
          farD = Math.max(farD, dist(r.two().group.position, p0));
        }
        expect(farD).toBeGreaterThan(1.5);
        reset();
      }
    });

    it('cat one walks the longest way on foot with cat two idle: cat two follows, ends beside her on her own level', () => {
      const route = reach.pathTo(far);
      const { r, s } = start(record.spawn);
      const done = walkRoute(r, s, route, { frames: 60 * 240, set, pad });
      expect(done || Math.abs(s.cat.position.y - levelAt(s.cat.position)) > 1, 'cat one got there, or climbed a stair of the place on her own').toBe(true);
      set(r, pad(0), pad(1)); r.tick(60 * 30);
      const one = s.cat.position, two = r.two().group.position;
      expect(dist(one, two), 'cat two was left behind').toBeLessThan(9);
      if (done) { expect(same(one, two), 'cat two on another level').toBe(true); }
      expect(isWadeableAt({ ...s.areaData, colliders: slack.colliders }, two.x, two.z)).toBe(true);
    }, 120_000);

    it('a stuck trot hops cat two only to the friend own level: cat one on another level within the leash, cat two never ends on another level', () => {
      // a pair of spots 5 to 11 m apart on different levels, the way a leash lets two cats stand
      const pairs = [];
      for (let i = 0; i < cells.length && pairs.length < 3; i += 37) {
        const a = cells[i];
        const b = cells.find((c) => Math.abs(levelAt(c) - levelAt(a)) > 1 && dist(a, c) > 5 && dist(a, c) < 11);
        if (b) pairs.push([a, b]);
      }
      if (ground.flat || pairs.length === 0) return; // a flat place has one level
      for (const [a, b] of pairs) {
        const { r, s } = start(a);
        s.cat.position.set(b.x, ground.y(b.x, b.z), b.z);
        set(r, pad(0), pad(1));
        for (let f = 0; f < 60 * 60; f++) {
          r.tick(1);
          const g = r.two().group.position;
          expect(isWadeableAt({ ...s.areaData, colliders: slack.colliders }, g.x, g.z), `${id}: cat two inside something at ${g.x},${g.z}`).toBe(true);
        }
        const one = s.cat.position, two = r.two().group.position;
        expect(same(one, two), `cat two on another level than cat one (${a.x},${a.z},y${levelAt(a)} to ${b.x},${b.z},y${levelAt(b)}; ended one ${one.x.toFixed(1)},${one.y.toFixed(1)},${one.z.toFixed(1)} two ${two.x.toFixed(1)},${two.y.toFixed(1)},${two.z.toFixed(1)})`).toBe(true);
        reset();
      }
    }, 120_000);

    it('a ride carries cat one far off (fair.riding set): nothing holds her back or drags cat two; when it ends cat one stays where the ride set her down for a moment, and the idle pair meet on one floor', () => {
      const end = cells.find((c) => dist(c, record.spawn) > 30 && dist(c, record.spawn) < 45 && Math.abs(levelAt(c) - levelAt(record.spawn)) < 0.5) ?? far;
      const { r, s } = start(record.spawn);
      s.fair = { ...(s.fair ?? {}), riding: { id: 'a-ride' } };
      const a = { x: s.cat.position.x, z: s.cat.position.z };
      set(r, pad(0), pad(1));
      for (let f = 1; f <= 180; f++) { // a ride: three seconds, a straight carry
        const k = f / 180;
        s.cat.position.set(a.x + (end.x - a.x) * k, levelAt({ x: a.x + (end.x - a.x) * k, z: a.z + (end.z - a.z) * k }), a.z + (end.z - a.z) * k);
        r.tick(1);
      }
      expect(dist(s.cat.position, end), 'the leash held the ridden cat back').toBeLessThan(0.1);
      s.fair.riding = null;
      r.tick(60);
      expect(dist(s.cat.position, end), 'cat one was pulled off the spot the ride left her on').toBeLessThan(1.5);
      r.tick(60 * 40);
      const one = s.cat.position, two = r.two().group.position;
      expect(dist(one, two), 'cat two did not come along').toBeLessThan(10);
      expect(same(one, two)).toBe(true);
    }, 60_000);

    it('cat two writes no save: the progression state is the same after a long walk of both cats', () => {
      const { r } = start(record.spawn);
      const before = JSON.stringify(r.progression.state);
      set(r, pad(0), pad(1, [], [1, 0, 0, 0])); r.tick(120);
      set(r, pad(0, [], [0, 1, 0, 0]), pad(1)); r.tick(120);
      set(r, pad(0), pad(1)); r.tick(600);
      expect(JSON.stringify(r.progression.state)).toBe(before);
    });
  });
  return { record, ground, world, makeSession, start, spots, cells, far, byY, reach, same };
}
