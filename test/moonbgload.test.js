// The Moon's background loading: stage A alone is the landing and is playable; each late stage is absent (and its places shut by rings of invisible colliders, so nothing is walked
// into that is not there) until it arrives; arrival adds the stage, fades it in (reduced motion: at once) and opens the place; a stage that does not come keeps its place shut with
// one friendly line. With every stage in (every other test) nothing here is on the path: the build and the life are byte for byte the one-chunk Moon's.
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import { build } from '../src/world/moon.js';
import { HELD, STAGE_ORDER, stageReady } from '../src/world/moonstages.js';
import { startMoonStages, resetMoonStages, arrive, STAGE_LINES } from '../src/world/moonlate.js';
import { REGIONS, ringFor, nearRegion, RING_R } from '../src/world/moonregions.js';
import { FADE_TIME } from '../src/world/moonfade.js';
import { AREA_LOADERS } from '../src/world/areas.js';
import { bus } from '../src/events.js';
import { phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

const never = () => new Promise(() => {});
const hold = (ids, imports = {}) => {
  for (const id of ids) HELD.add(id);
  startMoonStages({ imports: Object.fromEntries(STAGE_ORDER.map((id) => [id, imports[id] ?? never])) }); // the real fetch is held off: the tests decide what arrives
};
afterEach(() => resetMoonStages());

const setup = async (ids, { reducedMotion = false, imports } = {}) => {
  hold(ids, imports);
  const scene = new THREE.Scene();
  const area = build(scene);
  const life = area.life({ scene, ground: area.ground, progression: { state: {} }, reducedMotion, tier: {} });
  await life.lateReady;
  const cam = new THREE.PerspectiveCamera();
  const session = { pounceTime: 0, perched: null, hopLift: 0, fx: { burst() {} }, collectibleMeshes: new Map() };
  const at = new THREE.Vector3(0, 0, 45);
  const frame = (dt = 1 / 60, p = at) => life.update(dt, 1, p, cam, session);
  return { scene, area, life, frame, at };
};
const rings = (area) => area.colliders.filter((c) => c.moonRing && !c.station); // (the Old Relay Station's own ring is counted in moonstation.test.js)
const planKey = (c) => `${c.x},${c.z},${c.r}`;
const names = (scene) => { const n = new Set(); scene.traverse((o) => n.add(o.name)); return n; };

describe('stage A alone: the landing builds and is playable', () => {
  it('builds and runs with no late stage in; none of them is drawn, the whole plan is still solid, and the places are shut', async () => {
    const { scene, area, life, frame } = await setup(STAGE_ORDER);
    expect(STAGE_ORDER.every((id) => !stageReady(id))).toBe(true);
    const n = names(scene);
    for (const absent of ['moon:wing', 'moon:wingfar', 'moon:rocket', 'moon:massif', 'moon:cavefill', 'moon:beacon']) expect(n.has(absent), absent).toBe(false);
    expect(n.has('moon:doorL')).toBe(true); // the landing's own
    // no collider of the plan is missing: the plan is stage A's (a late stage only draws and wakes what the plan already holds)
    const have = new Set(area.colliders.map(planKey));
    for (const c of P.MOON_COLLIDERS) expect(have.has(planKey(c)), planKey(c)).toBe(true);
    expect(rings(area).length).toBeGreaterThan(100);
    for (let i = 0; i < 90; i++) frame();
    expect(life.promptAt({ x: 0, z: 45, y: 0 }) ?? null).not.toBeUndefined();
    expect(life.star.state.open).toBe(false);
    expect(life.rover.riding).toBe(false);
    expect(life.launch.carryingCard).toBe(-1);
    expect(life.bound.lift).toBe(0);
    expect(life.spottable).toEqual([]);
    expect(life.job.goal()).toBeNull();
    expect(() => life.dispose()).not.toThrow();
    expect(rings(area)).toEqual([]);
  });
  it('the spawn is outside every shut place, and the loader waits for stage A only', () => {
    for (const id of STAGE_ORDER) for (const d of REGIONS[id]) expect(Math.hypot(d.x - P.MOON_SPAWN.x, d.z - P.MOON_SPAWN.z), id).toBeGreaterThan(d.r + 8);
    expect(String(AREA_LOADERS.moon)).not.toMatch(/loadMoonStages|moonstage/);
  });
});

describe('each late stage absent: its places are shut and nothing in them is reachable', () => {
  const points = {
    hill: [P.STAR_HILL, P.STAR_TABLE, ...P.STAR_COLLIDERS],
    launch: [P.ROCKET, P.GANTRY, P.LAUNCH_DESK, P.MESSAGE_DESK, P.BINOCULARS, P.COUNT_BOARD, ...P.LAUNCH_COLLIDERS, ...P.BEAMS],
    rover: [P.DEPOT, P.DOT_PARK, P.ROVER_CELL, P.FAR_BEACON, P.SHED, P.DISH_LEDGE, P.MOUTH, P.DEEP_CELL, ...P.LAVA_COLLIDERS],
  };
  for (const id of STAGE_ORDER) {
    it(`${id}: the stage's own things are inside its rings, and the rings leave no gap a cat fits through`, async () => {
      const { area } = await setup([id]);
      const mine = rings(area);
      expect(mine.length).toBeGreaterThan(20);
      for (const p of points[id]) {
        const d = REGIONS[id].find((q) => Math.hypot(p.x - q.x, p.z - q.z) <= q.r - 1.2);
        expect(d, `${id} ${JSON.stringify(p)}`).toBeTruthy();
      }
      for (const d of REGIONS[id]) { // neighbours on a ring are closer than a cat (0.4 m across) can pass between
        const ring = ringFor(d);
        for (let i = 0; i < ring.length; i++) { const a = ring[i]; const b = ring[(i + 1) % ring.length]; expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(2 * (RING_R + 0.4)); }
      }
      // the other stages' places are open, and the rings keep clear of the plan's own finds (nothing the walk seeded sits inside a ring's circle)
      for (const q of area.pois) expect(mine.some((c) => Math.hypot(q.x - c.x, q.z - c.z) < c.r), JSON.stringify(q)).toBe(false);
      for (const other of STAGE_ORDER.filter((o) => o !== id)) expect(nearRegion(P.MOON_SPAWN.x, P.MOON_SPAWN.z, [other], 0)).toBeNull();
    });
  }
});

describe('arrival adds the stage', () => {
  it('hill: its drawing is added, faded in over a second, its life wakes in the stand-in, its rings come out', async () => {
    const { scene, area, life, frame } = await setup(['hill']);
    expect(scene.getObjectByName('moon:wing')).toBeFalsy();
    const before = rings(area).length;
    expect(before).toBeGreaterThan(0);
    HELD.delete('hill');
    arrive('hill');
    frame(); // one stage a frame
    expect(scene.getObjectByName('moonLate:hill')).toBeTruthy();
    expect(scene.getObjectByName('moon:wing')).toBeTruthy();
    expect(rings(area).length).toBe(0);
    const mats = new Set();
    scene.getObjectByName('moonLate:hill').traverse((o) => { for (const m of [].concat(o.material ?? [])) mats.add(m); });
    expect([...mats].every((m) => m.transparent)).toBe(true); // fading in
    for (let i = 0; i < 20; i++) frame(FADE_TIME / 10);
    expect([...mats].filter((m) => m.transparent).length).toBeLessThan(mats.size); // done: put back as they were
    expect(typeof life.star.promptAt).toBe('function');
    expect(life.spottable.length).toBeGreaterThan(0); // the robots are the hill's
  });
  it('rover then launch: each wakes its own lives, and the errands wait for all three', async () => {
    const { area, life, frame } = await setup(['rover', 'launch']);
    expect(rings(area).length).toBeGreaterThan(0);
    HELD.delete('rover'); arrive('rover'); frame();
    const roverRing = REGIONS.rover.flatMap(ringFor).map(planKey);
    expect(rings(area).some((c) => roverRing.includes(planKey(c)))).toBe(false);
    expect(rings(area).length).toBeGreaterThan(0); // the launch's are still shut
    HELD.delete('launch'); arrive('launch'); frame();
    expect(rings(area).length).toBe(0);
    expect(life.job.state).toBeTruthy();
    for (let i = 0; i < 60; i++) frame();
  });
  it('reduced motion: the stage appears at once (nothing is made transparent)', async () => {
    const { scene, frame } = await setup(['launch'], { reducedMotion: true });
    HELD.delete('launch'); arrive('launch'); frame();
    const g = scene.getObjectByName('moonLate:launch');
    expect(g).toBeTruthy();
    let fading = 0;
    g.traverse((o) => { for (const m of [].concat(o.material ?? [])) if (m.onBeforeCompile.toString().includes('uMoonFade')) fading++; });
    expect(fading).toBe(0);
  });
  it('the fade is on in motion: a material of the arriving stage carries the shared alpha until the second is up', async () => {
    const { scene, frame } = await setup(['launch']);
    HELD.delete('launch'); arrive('launch'); frame();
    let fading = 0;
    scene.getObjectByName('moonLate:launch').traverse((o) => { for (const m of [].concat(o.material ?? [])) if (m.onBeforeCompile.toString().includes('uMoonFade')) fading++; });
    expect(fading).toBeGreaterThan(0);
    for (let i = 0; i < 12; i++) frame(FADE_TIME / 10);
    let still = 0;
    scene.getObjectByName('moonLate:launch').traverse((o) => { for (const m of [].concat(o.material ?? [])) if (m.onBeforeCompile.toString().includes('uMoonFade')) still++; });
    expect(still).toBe(0);
  });
});

describe('a stage that does not come', () => {
  it('is tried twice, then the place stays shut with one friendly line, in both word sets, and the walk plays on', async () => {
    let tries = 0;
    const { area, life, frame } = await setup(['hill'], { imports: { hill: async () => { tries++; throw new Error('offline'); } } });
    await new Promise((r) => setTimeout(r, 20));
    expect(tries).toBe(2);
    const said = [];
    const off = bus.on('discovery', (e) => { if (e?.type === 'greenhousenote') said.push(e.label); });
    const spot = REGIONS.hill[0];
    for (let i = 0; i < 30; i++) frame(1 / 60, new THREE.Vector3(spot.x + spot.r + 1.5, 0, spot.z));
    off();
    expect(said).toContain(phrase('moon.stage.wait'));
    expect(said.filter((s) => s === phrase('moon.stage.wait'))).toHaveLength(1);
    expect(rings(area).length).toBeGreaterThan(0);
    expect(life.pending).toBeUndefined();
    const line = STAGE_LINES['moon.stage.wait'];
    expect(line).toMatch(/waking up/);
    expect(line).not.toMatch(/\b(dark|trapped|stuck|scary|lost forever|error|failed)\b/i);
    expect(phrase('moon.stage.wait')).toBe(line);
    withOffWords(() => { expect(phrase('moon.stage.wait')).toBe(line); expect(bannedIn(phrase('moon.stage.wait'))).toBeNull(); });
    expect(() => life.dispose()).not.toThrow();
    expect(rings(area)).toEqual([]);
  });
  it('is fetched in the order nearest-needed first, all at once, and a stage that fails does not hold the others', async () => {
    resetMoonStages();
    const order = [];
    const imports = { rover: async () => { order.push('rover'); }, hill: async () => { order.push('hill'); throw new Error('x'); }, launch: async () => { order.push('launch'); } };
    HELD.add('rover'); HELD.add('hill'); HELD.add('launch');
    const seen = [];
    const { onStage } = await import('../src/world/moonstages.js');
    const off = onStage((id, ok) => seen.push([id, ok]));
    await startMoonStages({ imports });
    off();
    expect(order.slice(0, 3)).toEqual(['rover', 'hill', 'launch']);
    expect(seen).toContainEqual(['rover', true]);
    expect(seen).toContainEqual(['launch', true]);
    expect(seen).toContainEqual(['hill', false]);
  });
});
