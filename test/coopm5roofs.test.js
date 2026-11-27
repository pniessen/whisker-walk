import { describe, it, expect, afterEach, vi } from 'vitest';
import { joined, pad, set, reset, newSession, createRemoteCats, THREE, PAD_BUTTONS } from './helpers/couchrig.js';
import { stubCanvasDocument } from './helpers/canvas.js';
import { stickFor } from './helpers/couchroute.js';

// Couch play M5(f): the Rooftops. Real roofs world and plan ground (levels, stairs, ledges), real traversal runtime for cat
// one (the leaps, drops, climbs and crossings), real player code for both cats, real progression; fake pads. Cat two walks
// the levels on foot, follows cat one along the roof routes, and a trot that gets nowhere hops it to its friend, onto the
// friend own level and never onto the street below or a roof under a crossing. A crossing is cat one alone, with cat two
// waiting at its start. The sleepers and the finds of the roofs stay with cat one.
stubCanvasDocument({ pointerLock: true, measureText: 10 });
const { build } = await import('../src/world/roofs.js');
const { ROOFS_TRAVERSAL, ROOFS_SLEEPERS, ROOFS_PLACES, LEVELS } = await import('../src/world/roofsplan.js');
const { createTraversalLive } = await import('../src/traversallive.js');
const { BASE_ABILITIES } = await import('../src/traversal.js');
const { createRoofsLife } = await import('../src/roofslife.js');
const { isWalkableAt } = await import('../src/player.js');
const { COOP_READY } = await import('../src/coop/table.js');
const { DPAD_DOWN } = await import('../src/coop/rules.js');

afterEach(reset);
const world = new THREE.Scene();
const record = build(world);
const ground = record.ground;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const levelAt = (p) => ground.y(p.x, p.z);

function roofsSession(at = record.spawn) {
  const s = newSession('roofs', { ground });
  s.scene = world;
  s.remotes = createRemoteCats(world, { ground });
  world.add(s.cat);
  s.areaData = { collectibles: [], waters: [], perches: [], ...record };
  s.collectibleMeshes = new Map();
  s.traversal = createTraversalLive(record.traversal, { ground, abilities: () => BASE_ABILITIES });
  s.cat.position.set(at.x, ground.y(at.x, at.z), at.z);
  return s;
}
function roofsJoined(at) {
  const r = joined();
  const s = roofsSession(at);
  r.player.setAvatar(s.cat, 3.5);
  r.player.setGround(ground);
  r.player.enable(); r.player.setTouchEngaged(true);
  r.setSession(s); r.tick(2);
  return { r, s };
}
/** Cat two put at (x, z), as a hop or a long walk would leave it. */
const putTwo = (r, p) => { const b = r.h.mover.body; b.position.set(p.x, ground.y(p.x, p.z), p.z); };
/** Cat one put on a roof: where a leap or a climb left it. */
const putOne = (s, p) => { s.cat.position.set(p.x, ground.y(p.x, p.z), p.z); };
const climbSpots = Object.values(ROOFS_PLACES).filter((p) => isWalkableAt(record, p.x, p.z)); // the named standing spots, from the shed to the top of the tower

describe('couch play M5(f): the Rooftops row', () => {
  it('the Rooftops are ready, with this file green', () => { expect(COOP_READY.roofs).toBe(true); });
});

describe('couch play M5(f): cat two on the roof levels', () => {
  it('joins beside cat one on clear floor of the same level, in the alley and on a sample of roofs from the garages to the tower', () => {
    const spots = [record.spawn, ...climbSpots];
    expect(spots.length).toBeGreaterThan(8);
    const levels = new Set();
    for (const at of spots) {
      const { r, s } = roofsJoined(at);
      const g = r.two().group.position;
      expect(isWalkableAt(s.areaData, g.x, g.z), `${at.x},${at.z}`).toBe(true);
      expect(Math.abs(levelAt(g) - levelAt(at)), `${at.x},${at.z}: another level`).toBeLessThan(0.5);
      expect(ground.canStep(at.x, at.z, g.x, g.z), `${at.x},${at.z}: no way from one cat to the other`).toBe(true);
      levels.add(levelAt(at));
      reset();
    }
    expect(levels.size).toBeGreaterThan(3);
  });

  it('cat one walks up the alley stair to the garages with cat two idle at first; cat two follows up onto the same level', () => {
    const garage = ROOFS_PLACES.garages;
    const { r, s } = roofsJoined(record.spawn);
    // the alley west to the foot of the stair (a flight 1 m wide at x = -30.5, 0 to 2.8 over 9 m), up it, then east along the garages
    const way = [[-31, 41], [-30.5, 39.5], [-30.5, 29.5], [-28, 30], [garage.x, garage.z]];
    const route = [{ x: record.spawn.x, z: record.spawn.z }];
    for (const [x, z] of way) { const l = route.at(-1); const n = Math.max(1, Math.ceil(dist(l, { x, z }) / 0.3)); for (let k = 1; k <= n; k++) route.push({ x: l.x + (x - l.x) * k / n, z: l.z + (z - l.z) * k / n }); }
    expect(route.length).toBeGreaterThan(100);
    let i = 1;
    for (let f = 0; f < 60 * 120 && !(i >= route.length && dist(r.two().group.position, s.cat.position) < 3.5); f++) {
      const p = s.cat.position;
      while (i < route.length && dist(p, route[i]) < 0.3) i++;
      const t = route[Math.min(i, route.length - 1)];
      set(r, pad(0, [], i >= route.length ? [0, 0, 0, 0] : stickFor(r, t.x - p.x, t.z - p.z)), pad(1));
      r.tick(1);
    }
    const one = s.cat.position, two = r.two().group.position;
    expect(dist(one, garage)).toBeLessThan(2);
    expect(dist(one, two), 'cat two was left in the alley').toBeLessThan(4);
    expect(Math.abs(levelAt(two) - levelAt(one))).toBeLessThan(0.5);
    expect(levelAt(two)).toBeGreaterThan(LEVELS.GROUND + 1);
  }, 120_000);
});

describe('couch play M5(f): a trot that gets nowhere hops to the friend, on the friend\'s own level', () => {
  const roofs = climbSpots.filter((p) => levelAt(p) >= LEVELS.EXTENSION - 0.01);

  it('cat one up on a roof, cat two in the alley: the idle cat trots, is stopped by the wall, and hops beside its friend on the roof, never in the street', () => {
    const roof = roofs.find((p) => levelAt(p) === LEVELS.EXTENSION) ?? roofs[0];
    const { r, s } = roofsJoined(record.spawn);
    putOne(s, roof);
    r.tick(2);
    let hopped = false;
    for (let f = 0; f < 60 * 30; f++) {
      set(r, pad(0), pad(1));
      r.tick(1);
      const g = r.two().group.position;
      expect(levelAt(g), 'never in the street below').toBeGreaterThan(LEVELS.STREET + 1);
      if (dist(g, s.cat.position) < 3.2 && Math.abs(levelAt(g) - levelAt(roof)) < 0.5) { hopped = true; break; }
    }
    expect(hopped, 'cat two reached its friend').toBe(true);
    const g = r.two().group.position;
    expect(ground.canStep(s.cat.position.x, s.cat.position.z, g.x, g.z)).toBe(true);
    expect(isWalkableAt(s.areaData, g.x, g.z)).toBe(true);
  }, 60_000);

  it('hop to my friend (hold D-pad Down) from the alley lands on the friend\'s level on every roof of the sample', () => {
    for (const roof of roofs.filter((_, i) => i % Math.ceil(roofs.length / 10) === 0)) {
      const { r, s } = roofsJoined(record.spawn);
      putOne(s, roof);
      r.tick(2);
      set(r, pad(0), pad(1, [DPAD_DOWN])); r.tick(70); // held past 0.8 s
      set(r, pad(0), pad(1)); r.tick(2);
      const g = r.two().group.position;
      expect(Math.abs(levelAt(g) - levelAt(roof)), `${roof.x},${roof.z}`).toBeLessThan(0.5);
      expect(dist(g, s.cat.position), `${roof.x},${roof.z}`).toBeLessThan(4);
      expect(isWalkableAt(s.areaData, g.x, g.z)).toBe(true);
      reset();
    }
  }, 120_000);
});

describe('couch play M5(f): a crossing is cat one alone, with cat two waiting at its start', () => {
  const plank = ROOFS_TRAVERSAL.crossings.find((c) => c.id === 'plank-1');
  const start = plank.points[0], end = plank.points[plank.points.length - 1];

  function mountPlank() {
    const { r, s } = roofsJoined({ x: start.x, z: start.z + 1.2 });
    for (let f = 0; f < 60 * 8 && !s.traversal.busy; f++) { set(r, pad(0, [], stickFor(r, end.x - start.x, end.z - start.z)), pad(1)); r.tick(1); }
    return { r, s };
  }

  it('cat one steps onto the plank over the back yard and crosses it; the leash does not hold it and cat two does not follow it on', () => {
    const { r, s } = mountPlank();
    expect(s.traversal.busy, 'cat one is on the plank').toBe(true);
    const two0 = r.two().group.position.clone();
    for (let f = 0; f < 60 * 20 && s.traversal.busy; f++) { set(r, pad(0, [], stickFor(r, end.x - start.x, end.z - start.z)), pad(1)); r.tick(1); }
    expect(s.traversal.busy).toBe(false);
    expect(dist(s.cat.position, end), 'across').toBeLessThan(2.5);
    expect(levelAt(s.cat.position)).toBeGreaterThan(LEVELS.GARAGE + 0.5); // on the extension roof
    expect(dist(r.two().group.position, two0), 'cat two waited').toBeLessThan(3);
  }, 60_000);

  it('a hop pressed while cat one is on the plank does nothing; once across, it lands beside cat one on the extension roof', () => {
    const { r, s } = mountPlank();
    expect(s.traversal.busy).toBe(true);
    const before = r.two().group.position.clone();
    set(r, pad(0, [], stickFor(r, end.x - start.x, end.z - start.z)), pad(1, [DPAD_DOWN])); r.tick(70);
    expect(dist(r.two().group.position, before), 'no landing on a plank or in the yard under it').toBeLessThan(2);
    for (let f = 0; f < 60 * 20 && s.traversal.busy; f++) { set(r, pad(0, [], stickFor(r, end.x - start.x, end.z - start.z)), pad(1)); r.tick(1); }
    set(r, pad(0), pad(1, [DPAD_DOWN])); r.tick(70); set(r, pad(0), pad(1)); r.tick(2);
    const g = r.two().group.position;
    expect(Math.abs(levelAt(g) - levelAt(s.cat.position))).toBeLessThan(0.5);
    expect(dist(g, s.cat.position)).toBeLessThan(4);
  }, 60_000);
});

describe('couch play M5(f): the sleepers and the finds stay with cat one; the save is a solo walk\'s', () => {
  function life(log) {
    const sleepers = ROOFS_SLEEPERS.map((s) => { const o = new THREE.Object3D(); o.position.set(s.x, s.y, s.z); o.rotation.y = s.yaw; return o; });
    const bg = { isTexture: true, dispose: vi.fn() };
    const l = createRoofsLife({ skySunset: { top: 1, horizon: 2 }, skyDusk: { top: 3, horizon: 4 }, sleepers })({ scene: { background: bg, fog: null }, sun: { intensity: 1 }, fill: { intensity: 1 }, reducedMotion: false, log });
    return l;
  }
  const near = (s) => ({ x: s.x + 0.8, y: s.y, z: s.z + 0.4 });

  it('a sleeper stirs for cat one at its sill and not for cat two there; the life is handed cat one only', () => {
    const sleeper = ROOFS_SLEEPERS[0];
    const marks = new Set();
    const log = { count: (k) => (marks.has(k) ? 1 : 0), mark: (k) => marks.add(k) };
    const l = life(log);
    const { r, s } = roofsJoined(sleeper);
    putOne(s, { x: sleeper.x + 20, z: sleeper.z });
    putTwo(r, near(sleeper));
    for (let i = 0; i < 400; i++) { r.tick(1); l.update(0.05, 0, s.cat.position); } // cat one far, cat two on the sill
    expect(marks.size).toBe(0);
    const l2 = life(log);
    for (let i = 0; i < 400; i++) l2.update(0.05, 0, near(sleeper));
    expect(marks.size).toBeGreaterThan(0); // the own nose of cat one stirs it, as in a solo walk
  });

  it('cat two walking, hopping and being left behind writes nothing: progression is as before', () => {
    const roof = climbSpots.find((p) => levelAt(p) >= LEVELS.EXTENSION - 0.01);
    const { r, s } = roofsJoined(record.spawn);
    const before = JSON.stringify(r.progression.state);
    putOne(s, roof);
    for (let f = 0; f < 60 * 15; f++) { set(r, pad(0), pad(1)); r.tick(1); }
    expect(JSON.stringify(r.progression.state)).toBe(before);
  }, 60_000);
});
