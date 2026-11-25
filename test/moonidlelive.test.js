// The Moon's idle ring on a walk (world/moonlife.js hook + world/moonidle.js schedule) through the real Moon life and a fake clock: the gold ring shows by itself after ~30 s without
// progress at each stage's goal, the same ring and picture a meow lights; it resets on progress, holds when a page or the count is up, and never points at a goal that is not there.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as J from '../src/world/moonjob.js';
import * as M from '../src/world/moonmission.js';
import { build } from '../src/world/moon.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { phrase } from '../src/clanphrases.js';
import { mem } from './helpers/lighthouselife.js';
import { fakePage } from './helpers/moonpage.js';
import { RING } from '../src/world/moonbaselive.js';

const gy = (x, z) => P.moonY(x, z);
const AWAKE = { step: 4, cells: 3 };
const AT5 = { step: 5, cells: 3, scope: 3 };
const DONE = { step: 8, cells: 3, stamp: 0, scope: 3 };
const NOT_DEMO = () => 250;

function rig({ moon = null, restore = null, reducedMotion = false, visits = 0 } = {}) {
  const progression = createProgression(mem());
  if (moon) progression.state.moon = { ...progression.state.moon, ...moon };
  const scene = new THREE.Scene();
  const area = build(scene);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  if (restore) log.restore(restore);
  const page = fakePage();
  const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion, tier: { name: 'high' }, doc: page.doc, win: page.win, clock: NOT_DEMO, visits, roomSeed: undefined, boundOn: true });
  const camera = new THREE.PerspectiveCamera();
  const cat = new THREE.Object3D();
  const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat, idleTime: 0, collectibleMeshes: new Map() };
  const events = [];
  const off = bus.on('discovery', (e) => events.push(e));
  const where = { x: 0, y: 0, z: 45 };
  let t = 0;
  const move = (p) => { Object.assign(where, p); cat.position.set(where.x, where.y, where.z); };
  const step = (secs, at) => { if (at) move(at); for (let i = 0; i < Math.round(secs * 30); i++) { t += 1 / 30; life.update(1 / 30, t, where, camera, session); } };
  const press = () => { const line = life.promptAt(where); life.interact(); return line; };
  const ring = () => ({ vis: life.base.ringing, x: life.base.ring.position.x, z: life.base.ring.position.z });
  const lines = () => events.filter((e) => e.type === 'greenhousenote').map((e) => e.label);
  move(where);
  return { scene, life, progression, page, session, events, where, move, step, press, ring, lines, log, cat, dispose() { off(); life.dispose(); } };
}
const FAR = { x: -30, z: 60, y: 0 }; // nowhere near any goal
const FAR2 = { x: 0, z: 80, y: 0 };
const near = (g, p, tol = 1.2) => Math.hypot(g.x - p.x, g.z - p.z) < tol;
const idleFor = (r, secs) => r.step(secs, { ...FAR, y: gy(FAR.x, FAR.z) });

afterEach(() => { delete globalThis.document; });

describe('each early stage: nothing before 30 s, then the ring at the next goal by itself', () => {
  it('Pip asleep: the ring points at Pip, with the one hint line (the meow line, reused) and nothing before 30 s', () => {
    const r = rig();
    idleFor(r, 29);
    expect(r.ring().vis).toBe(false);
    expect(r.lines()).not.toContain(phrase('moon.meow.hint'));
    r.step(2);
    expect(r.ring().vis).toBe(true);
    expect(near(r.ring(), r.life.base.pip.position)).toBe(true);
    expect(r.lines().filter((l) => l === phrase('moon.meow.hint'))).toHaveLength(1);
    expect(r.life.base.state.clock).toBeGreaterThan(30);
    r.dispose();
  });
  it('the ring shows about 7 s like a meow, then re-arms for 60 s: the second ring comes 60 s after the first, the third 90 s after that, no more hint lines', () => {
    const r = rig();
    idleFor(r, 31);
    expect(r.ring().vis).toBe(true);
    r.step(RING.secs + 1);
    expect(r.ring().vis).toBe(false);
    r.step(50); // 58 s after the first
    expect(r.ring().vis).toBe(false);
    r.step(5); // 63 s after: the second
    expect(r.ring().vis).toBe(true);
    r.step(RING.secs + 1);
    expect(r.ring().vis).toBe(false);
    r.step(70);
    expect(r.ring().vis).toBe(false);
    r.step(10);
    expect(r.ring().vis).toBe(true);
    expect(r.lines().filter((l) => l === phrase('moon.meow.hint'))).toHaveLength(1);
    r.dispose();
  });
  it('Pip awake, no cells: the Ridge cell; then the Rover cell once the Ridge cell is in', () => {
    let r = rig({ moon: { step: 1, cells: 0 } });
    idleFor(r, 31);
    expect(near(r.ring(), P.RIDGE_CELL, 0.2)).toBe(true);
    r.dispose();
    r = rig({ moon: { step: 2, cells: 1 } });
    idleFor(r, 31);
    expect(near(r.ring(), P.ROVER_CELL, 0.2)).toBe(true);
    r.dispose();
  });
  it('a cell in her mouth: the Core', () => {
    const r = rig({ moon: { step: 2, cells: 1 } });
    const c = P.ROVER_CELL;
    r.step(0.3, { x: c.x + 0.5, z: c.z, y: c.y });
    expect(r.press()).toBe(phrase('moon.cell.prompt'));
    expect(r.life.base.state.carrying).toBe(1);
    r.step(31, { ...FAR, y: gy(FAR.x, FAR.z) });
    expect(near(r.ring(), P.CORE, 0.2)).toBe(true);
    r.dispose();
  });
  it('the base awake: Star Hill\'s ramp mouth (the telescope)', () => {
    const r = rig({ moon: AWAKE });
    idleFor(r, 31);
    const m = P.rampPoint(0.04, 0);
    expect(near(r.ring(), m, 0.2)).toBe(true);
    r.dispose();
  });
  it('Earth found: the Message Desk; a postcard in her mouth: the rocket\'s slot; posted: the red button; sent: the foot of Earthrise Rock; replied: the cave', () => {
    const goals = [
      [AT5, P.MESSAGE_DESK],
      [{ ...AT5, step: 6, stamp: 1 }, P.LAUNCH_DESK],
      [{ ...AT5, step: 7, stamp: 1 }, P.ROCK_LEDGES[0]],
    ];
    for (const [moon, p] of goals) {
      const r = rig({ moon });
      idleFor(r, 31);
      expect(near(r.ring(), p, 0.2), JSON.stringify(moon)).toBe(true);
      r.dispose();
    }
    const r = rig({ moon: AT5 });
    r.step(0.1, { x: P.MESSAGE_DESK.x + 1.4, z: P.MESSAGE_DESK.z, y: gy(P.MESSAGE_DESK.x, P.MESSAGE_DESK.z) });
    r.press();
    r.page.win.fire('keydown', { code: 'Digit2' });
    expect(r.life.launch.carryingCard).toBe(1);
    idleFor(r, 31);
    expect(near(r.ring(), P.ROCKET_SLOT, 0.2)).toBe(true);
    r.dispose();
  });
  it('the story told with the Deep Cell still in the cave and the errand done: the cave\'s mouth; the cell plugged and the errand done: nothing, ever', () => {
    const done = [[J.JOB_KEY, 1]];
    let r = rig({ moon: DONE, restore: done });
    idleFor(r, 31);
    expect(near(r.ring(), P.MOUTH_FRONT, 0.2)).toBe(true);
    r.dispose();
    r = rig({ moon: { ...DONE, cells: 7 }, restore: done });
    expect(M.nextGoal(r.progression.state.moon).kind).toBe('done');
    idleFor(r, 700);
    expect(r.ring().vis).toBe(false);
    expect(r.lines()).not.toContain(phrase('moon.meow.hint'));
    r.dispose();
  });
  it('the story told, the cell plugged, today\'s errand offered: the errand\'s spot (one ring; Pip\'s errand is a goal too)', () => {
    const r = rig({ moon: { ...DONE, cells: 7 } });
    const g = r.life.job.goal();
    expect(g).not.toBeNull();
    idleFor(r, 31);
    expect(near(r.ring(), g, 0.2)).toBe(true);
    r.dispose();
  });
});

describe('progress resets it', () => {
  it('a meow or the board press uses the same ring (no second ring, no doubling) and starts the waits over', () => {
    const r = rig();
    idleFor(r, 25);
    bus.emit('tip:did', { id: 'call' });
    r.step(0.5);
    expect(r.ring().vis).toBe(true); // her own meow's ring
    r.step(RING.secs + 0.5);
    expect(r.ring().vis).toBe(false);
    r.step(20); // 25 s after the meow: the old 30 s mark is long past, no auto ring yet
    expect(r.ring().vis).toBe(false);
    r.step(6);
    expect(r.ring().vis).toBe(true); // 30 s after the meow
    r.dispose();
  });
  it('a meow while the auto ring shows does not show a second one: still one ring mesh, one visible', () => {
    const r = rig();
    idleFor(r, 31);
    expect(r.ring().vis).toBe(true);
    bus.emit('tip:did', { id: 'call' });
    r.step(0.5);
    const rings = [];
    r.scene.traverse((o) => { if (o.name === 'moon:goalring') rings.push(o); });
    expect(rings).toHaveLength(1);
    expect(rings[0].visible).toBe(true);
    r.dispose();
  });
  it('waking Pip is progress: no ring until 30 s after it, and then at the first cell', () => {
    const r = rig();
    idleFor(r, 20);
    r.step(0.3, { x: P.PIP_SLEEP.x - 1.2, z: P.PIP_SLEEP.z + 1, y: gy(P.PIP_SLEEP.x, P.PIP_SLEEP.z) });
    expect(r.press()).toBe(phrase('moon.pip.prompt'));
    expect(r.progression.state.moon.step).toBe(1);
    idleFor(r, 28);
    expect(r.ring().vis).toBe(false);
    r.step(4);
    expect(r.ring().vis).toBe(true);
    expect(near(r.ring(), P.RIDGE_CELL, 0.2)).toBe(true);
    r.dispose();
  });
  it('picking up a cell, plugging it, a find, and reaching the goal each reset it', () => {
    const r = rig({ moon: { step: 2, cells: 1 } });
    const c = P.ROVER_CELL;
    idleFor(r, 20);
    r.step(0.3, { x: c.x + 0.5, z: c.z, y: c.y }); // reaching the goal
    r.press(); // picking the cell up
    idleFor(r, 29);
    expect(r.ring().vis).toBe(false);
    bus.emit('discovery', { type: 'moonfind', key: 'x', label: 'x', points: 0, repeat: false }); // a find
    idleFor(r, 29);
    expect(r.ring().vis).toBe(false);
    r.step(3);
    expect(r.ring().vis).toBe(true);
    r.dispose();
  });
  it('a toast line (the walk\'s own talking) is not progress', () => {
    const r = rig();
    idleFor(r, 20);
    bus.emit('discovery', { type: 'greenhousenote', key: 'k', label: 'hello', points: 0, repeat: false });
    r.step(11);
    expect(r.ring().vis).toBe(true);
    r.dispose();
  });
});

describe('it holds while she is not walking free', () => {
  it('a page open (the stamp picker): no ring however long, and it picks up afterwards', () => {
    const r = rig({ moon: AT5 });
    r.step(0.1, { x: P.MESSAGE_DESK.x + 1.4, z: P.MESSAGE_DESK.z, y: gy(P.MESSAGE_DESK.x, P.MESSAGE_DESK.z) });
    r.press();
    expect(r.life.launch.picker.isOpen).toBe(true);
    r.step(120);
    expect(r.ring().vis).toBe(false);
    r.page.win.fire('keydown', { code: 'Escape' });
    expect(r.life.launch.picker.isOpen).toBe(false);
    idleFor(r, 31);
    expect(r.ring().vis).toBe(true);
    r.dispose();
  });
  it('the telescope open: no ring', () => {
    const O = P.OBSERVATORY;
    const r = rig({ moon: AWAKE });
    r.step(0.1, { x: O.x + 1.5, z: O.z + 1.5, y: gy(O.x, O.z) });
    r.press();
    expect(r.life.star.scope.isOpen).toBe(true);
    r.step(120);
    expect(r.ring().vis).toBe(false);
    r.dispose();
  });
  it('the launch count and flight: no ring; the idle clock was held, not reset by it', () => {
    const r = rig({ moon: { ...AT5, step: 6, stamp: 1 } });
    r.step(0.1, { x: P.LAUNCH_DESK.x - 1.4, z: P.LAUNCH_DESK.z, y: gy(P.LAUNCH_DESK.x, P.LAUNCH_DESK.z) });
    r.press();
    expect(r.life.launch.state.flight).not.toBeNull();
    expect(r.ring().vis).toBe(false);
    r.step(3); // during the count
    expect(r.ring().vis).toBe(false);
    r.dispose();
  });
  it('the Core\'s wake beat: no ring', () => {
    const r = rig({ moon: { step: 3, cells: 3 } });
    r.step(0.5, { x: P.DOME.x + 3, z: P.DOME.z, y: gy(P.DOME.x, P.DOME.z) });
    expect(r.life.base.state.beat).toBe(true);
    r.step(5);
    expect(r.ring().vis).toBe(false);
    r.dispose();
  });
  it('riding Dot: no ring while the goal is a Ridge cell or the Core; a ring when the goal is one Dot can reach', () => {
    let r = rig({ moon: { step: 1, cells: 0 } });
    Object.defineProperty(r.life.rover, 'riding', { get: () => true, configurable: true });
    idleFor(r, 120);
    expect(r.ring().vis).toBe(false);
    r.dispose();
    r = rig({ moon: AWAKE });
    Object.defineProperty(r.life.rover, 'riding', { get: () => true, configurable: true });
    idleFor(r, 31);
    expect(r.ring().vis).toBe(true);
    r.dispose();
  });
});

describe('it changes nothing else', () => {
  it('saves nothing of its own: the record is the same after a long idle as before', () => {
    const r = rig();
    const before = JSON.stringify(r.progression.state.moon);
    idleFor(r, 200);
    expect(JSON.stringify(r.progression.state.moon)).toBe(before);
    r.dispose();
  });
  it('is in the reduced-motion walk too (the ring is the same ring, steady)', () => {
    const r = rig({ reducedMotion: true });
    idleFor(r, 31);
    expect(r.ring().vis).toBe(true);
    r.dispose();
  });
  it('a disposed walk takes its listener off: nothing counts after it', () => {
    const r = rig();
    r.dispose();
    expect(() => bus.emit('discovery', { type: 'moonfind', key: 'x', label: 'x', points: 0, repeat: false })).not.toThrow();
  });
});
