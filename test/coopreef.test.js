import { describe, it, expect, afterEach } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';
import { joined, pad, set, reset, newSession, createRemoteCats, PAD_BUTTONS, THREE } from './helpers/couchrig.js';

// Couch play in the Reef: the float (cat two kicks up and sinks like cat one, drawn up in the water), the camera that keeps both
// in frame whatever their depth, A is the kick and never a hop, the Reef's pace, and a long run that never throws or tunnels.
// Fake pads over the real player and the real built Reef; the shared place checks are in test/coopm5reef.test.js.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
await (await import('../src/world/reefstages.js')).loadReefStages();
const { build } = await import('../src/world/reef.js');
const { placeFloat, placePace } = await import('../src/placephysics.js');
const { isWadeableAt } = await import('../src/player.js');
const { COOP_READY } = await import('../src/coop/table.js');
const { A } = PAD_BUTTONS;
afterEach(reset);

const world = new THREE.Scene();
const record = build(world);
const ground = record.ground;

function start() {
  const r = joined();
  const s = newSession('reef', { ground });
  s.scene = world; s.remotes = createRemoteCats(world, { ground }); world.add(s.cat);
  s.areaData = { collectibles: [], waters: [], perches: [], ...record, ground };
  s.cat.position.set(record.spawn.x, ground.y(record.spawn.x, record.spawn.z), record.spawn.z);
  r.player.setAvatar(s.cat, placePace(3.5, 'reef'));
  r.player.setFloat(placeFloat('reef'));
  r.player.setGround(ground);
  r.player.enable(); r.player.setTouchEngaged(true);
  r.setSession(s); r.tick(2);
  return { r, s };
}
const inView = (r, p) => { const v = new THREE.Vector3(p.x, p.y + 0.5, p.z).project(r.camera); return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z <= 1; };

describe('couch play in the Reef', () => {
  it('the row is open', () => { expect(COOP_READY.reef).toBe(true); });

  it('cat two floats: A held kicks it up to the place\'s limit, let go it sinks back to the sand, and it is drawn up in the water', () => {
    const { r } = start();
    const m = r.h.mover.player;
    expect(m.canFloat).toBe(true);
    set(r, pad(0), pad(1, [A])); r.tick(180);
    expect(m.floatY).toBeGreaterThan(1.5);
    expect(m.floatY).toBeLessThanOrEqual(placeFloat('reef').floatMax + 1e-6);
    const drawn = r.two().group.position.y;
    expect(drawn).toBeGreaterThan(1.5);
    set(r, pad(0), pad(1)); r.tick(60 * 8);
    expect(m.floatY).toBe(0);
  });

  it('A is the kick, never a pounce hop, for cat two', () => {
    const { r } = start();
    set(r, pad(0), pad(1, [A])); r.tick(2);
    set(r, pad(0), pad(1)); r.tick(2);
    expect(r.h.mover.player.hopY).toBe(0);
  });

  it('cat two walks at the Reef\'s pace (slower than the same cat on dry sand)', () => {
    const { r } = start();
    const p0 = r.two().group.position.clone();
    set(r, pad(0), pad(1, [], [0, -1, 0, 0])); r.tick(60);
    const reefStep = r.two().group.position.distanceTo(p0);
    expect(reefStep).toBeGreaterThan(0.5);
    expect(reefStep).toBeLessThan(3.5 * 0.9);
  });

  it('the camera keeps both cats in frame while one floats high and the other rests, and while they swim apart', () => {
    const { r, s } = start();
    const m = r.h.mover.player;
    for (const holdOne of [false, true]) {
      set(r, pad(0, holdOne ? [A] : []), pad(1, holdOne ? [] : [A], [1, 0, 0, 0])); r.tick(240);
      set(r, pad(0, [], [-1, 0, 0, 0]), pad(1, [A])); r.tick(240);
      expect(inView(r, s.cat.position), 'cat one out of frame').toBe(true);
      expect(inView(r, r.two().group.position), 'cat two out of frame').toBe(true);
    }
    expect(m.floatY).toBeGreaterThan(0);
  });

  it('a long run of both cats kicking, sinking and swimming about never throws, never leaves the bounds, never ends inside a collider, never writes the save', () => {
    const { r, s } = start();
    const before = JSON.stringify(r.progression.state);
    const b = record.bounds;
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
    const slack = (record.colliders ?? []).map((c) => ({ ...c, r: c.r - 1e-6 }));
    for (let i = 0; i < 160; i++) {
      const d = dirs[i % 8], e = dirs[(i * 3 + 1) % 8];
      set(r, pad(0, i % 3 === 0 ? [A] : [], [d[0], d[1], 0, 0]), pad(1, i % 4 < 2 ? [A] : [], [e[0], e[1], 0, 0]));
      for (let f = 0; f < 30; f++) {
        r.tick(1);
        for (const g of [s.cat.position, r.two().group.position]) {
          expect(Number.isFinite(g.x + g.y + g.z)).toBe(true);
          expect(g.x).toBeGreaterThanOrEqual(b.minX - 1e-3); expect(g.x).toBeLessThanOrEqual(b.maxX + 1e-3);
          expect(g.z).toBeGreaterThanOrEqual(b.minZ - 1e-3); expect(g.z).toBeLessThanOrEqual(b.maxZ + 1e-3);
        }
        const t = r.h.mover.body.position;
        expect(isWadeableAt({ ...s.areaData, colliders: slack }, t.x, t.z), `cat two inside something at ${t.x},${t.z}`).toBe(true);
      }
      expect(r.h.state.apart).toBeLessThan(r.h.state.leash + 3);
    }
    expect(JSON.stringify(r.progression.state)).toBe(before);
  }, 120_000);
});
