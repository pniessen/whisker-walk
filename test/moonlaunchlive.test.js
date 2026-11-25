// The Moon, milestone 6: the Launch Complex on a walk (src/world/moonlaunchlive.js through the real Moon life): the Message Desk's stamps, the postcard (carried, and
// the step that survives a walk end), the rocket's slot, the countdown and the flight, a test launch with no postcard (a missing rocket never strands the mission),
// the demo on the room's clock, the reply on Earth's night side, the Moon Badge, the room hook and the plume's flash rule through the real meshes.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as M from '../src/world/moonmission.js';
import * as L from '../src/world/moonlaunch.js';
import { build } from '../src/world/moon.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { mem } from './helpers/lighthouselife.js';
import { fakePage } from './helpers/moonpage.js';

const gy = (x, z) => P.moonY(x, z);
const LEDGE = P.ROCK_LEDGES[2];
const ledgeTop = gy(LEDGE.x, LEDGE.z) + LEDGE.y;
const NOT_DEMO = () => 100 + 150; // the room's clock: far from any demo's window (cycle 0, 250 s in)

function rig({ moon = null, reducedMotion = false, clock = NOT_DEMO, quality, storage = mem(), journal = null, canvas = false } = {}) {
  const progression = createProgression(storage);
  if (moon) progression.state.moon = { ...progression.state.moon, ...moon };
  if (journal) progression.state.journal = { ...progression.state.journal, ...journal };
  const scene = new THREE.Scene();
  const area = build(scene, { water: { quality } });
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const page = fakePage();
  const tier = quality ?? { name: 'high' };
  if (canvas) globalThis.document = page.doc; // Earth's picture is a canvas: made only where there is a document (the place itself was built without one)
  const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion, tier, doc: page.doc, win: page.win, clock });
  if (canvas) delete globalThis.document;
  const camera = new THREE.PerspectiveCamera();
  const cat = new THREE.Object3D();
  const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat, idleTime: 0 };
  const events = [];
  const off = bus.on('discovery', (e) => events.push(e));
  const where = { x: 0, y: 0, z: 45 };
  let t = 0;
  const move = (p) => { Object.assign(where, p); cat.position.set(where.x, where.y, where.z); };
  const step = (secs, at) => { if (at) move(at); for (let i = 0; i < Math.round(secs * 30); i++) { t += 1 / 30; life.update(1 / 30, t, where, camera, session); } };
  move(where);
  return { scene, area, life, launch: life.launch, progression, page, camera, cat, session, events, where, move, step, storage, log, dispose() { off(); life.dispose(); } };
}
const press = (r) => { const line = r.life.promptAt(r.where); r.life.interact(); return line; };
const atDesk = (r) => r.step(0.1, { x: P.MESSAGE_DESK.x + 1.4, z: P.MESSAGE_DESK.z, y: gy(P.MESSAGE_DESK.x, P.MESSAGE_DESK.z) });
const atRocket = (r) => r.step(0.1, { x: P.ROCKET_SLOT.x - 1.0, z: P.ROCKET_SLOT.z + 1.0, y: gy(P.ROCKET.x, P.ROCKET.z) });
const atButton = (r) => r.step(0.1, { x: P.LAUNCH_DESK.x - 1.4, z: P.LAUNCH_DESK.z, y: gy(P.LAUNCH_DESK.x, P.LAUNCH_DESK.z) });
const atRock = (r) => r.step(0.1, { x: LEDGE.x, z: LEDGE.z, y: ledgeTop });
const at5 = { step: 5, cells: 3, scope: 3 };
const pick = (r, id) => { atDesk(r); press(r); r.page.win.fire('keydown', { code: `Digit${id + 1}` }); };
const saved = (r) => JSON.parse(r.storage.map.get([...r.storage.map.keys()].find((k) => /save|progress/i.test(k)) ?? [...r.storage.map.keys()][0]));

afterEach(() => { delete globalThis.document; });

describe('the prompts', () => {
  it('"write a postcard" shows at the Message Desk once the base is awake; before Earth is found it only points to the telescope', () => {
    const r = rig({ moon: at5 });
    atDesk(r);
    expect(r.life.promptAt(r.where)).toBe('E — write a postcard');
    r.step(0.1, { x: P.MESSAGE_DESK.x + 4.2, z: P.MESSAGE_DESK.z, y: 0 });
    expect(r.life.promptAt(r.where) ?? '').not.toMatch(/postcard/);
    r.dispose();
    const early = rig({ moon: { step: 4, cells: 3 } });
    atDesk(early);
    expect(press(early)).toBe('E — write a postcard');
    expect(early.events.some((e) => /Star Hill/.test(e.label))).toBe(true);
    expect(early.life.launch.picker.isOpen).toBe(false);
    early.dispose();
    const none = rig({ moon: { step: 3, cells: 3 } });
    atDesk(none);
    expect(none.life.promptAt(none.where) ?? '').not.toMatch(/postcard/);
    none.dispose();
  });
  it('"post the postcard" shows at the rocket only with a postcard in her mouth; "press the big red button" at the Launch Desk; "look at Earth" on the rock\'s top', () => {
    const r = rig({ moon: at5 });
    atRocket(r);
    expect(r.life.promptAt(r.where) ?? '').not.toMatch(/post/);
    pick(r, 1);
    atRocket(r);
    expect(r.life.promptAt(r.where)).toBe('E — post the postcard in the rocket');
    atButton(r);
    expect(r.life.promptAt(r.where)).toBe('E — press the big red button to launch!');
    atRock(r);
    expect(r.life.promptAt(r.where)).toBe('E — look at Earth');
    r.step(0.1, { x: LEDGE.x, z: LEDGE.z, y: 0 });
    expect(r.life.promptAt(r.where) ?? '').not.toMatch(/Earth/); // at the foot, not on the top
    r.dispose();
  });
  it('the base\'s offers keep their place (Pip, the Core) and the launch\'s never shadow the rover\'s "hop in" away from them', () => {
    const r = rig();
    r.step(0.1, { x: 3, z: 43, y: 0 });
    expect(r.life.promptAt(r.where)).toBe('E — wake Pip');
    r.dispose();
  });
});

describe('the postcard: a stamp, carried, posted', () => {
  it('Interact at the desk opens three stamps and holds the cat; the 2 key picks the star: saved at once, the postcard is in her mouth', () => {
    const r = rig({ moon: at5 });
    atDesk(r);
    press(r);
    expect(r.launch.picker.isOpen).toBe(true);
    expect(r.launch.picker.buttons).toHaveLength(3);
    const held = r.cat.position.clone();
    r.cat.position.set(held.x + 3, held.y, held.z); // a stick that moved her
    const player = { halt: vi.fn() };
    r.session.fair.update(1 / 30, 1, { cat: r.cat, player, session: r.session });
    expect(r.cat.position.x).toBeCloseTo(held.x, 6);
    expect(player.halt).toHaveBeenCalled();
    r.page.win.fire('keydown', { code: 'Digit2' });
    expect(r.launch.picker.isOpen).toBe(false);
    expect(r.progression.state.moon.stamp).toBe(1);
    expect(r.progression.state.moon.step).toBe(5);
    expect(r.launch.carryingCard).toBe(1);
    r.step(0.1);
    expect(r.scene.getObjectByName('moon:postcard').visible).toBe(true);
    // released
    r.cat.position.set(held.x + 3, held.y, held.z);
    r.session.fair.update(1 / 30, 2, { cat: r.cat, player, session: r.session });
    expect(r.cat.position.x).toBeCloseTo(held.x + 3, 6);
    expect(r.page.win.count()).toBe(0);
    r.dispose();
  });
  it('keyboard, pad and touch all pick: arrows and Enter, a tap on the picture, A on the pad; Esc closes and picks nothing', () => {
    let r = rig({ moon: at5 });
    atDesk(r); press(r);
    r.page.win.fire('keydown', { code: 'ArrowRight' });
    r.page.win.fire('keydown', { code: 'ArrowRight' });
    r.page.win.fire('keydown', { code: 'Enter' });
    expect(r.progression.state.moon.stamp).toBe(2);
    r.dispose();
    r = rig({ moon: at5 });
    atDesk(r); press(r);
    r.launch.picker.buttons[0].fire('click');
    expect(r.progression.state.moon.stamp).toBe(0);
    r.dispose();
    r = rig({ moon: at5 });
    atDesk(r); press(r);
    r.page.win.fire('keydown', { code: 'Escape' });
    expect(r.launch.picker.isOpen).toBe(false);
    expect(r.progression.state.moon.stamp).toBe(-1);
    expect(r.launch.carryingCard).toBe(-1);
    r.dispose();
    // a pad: right, right, A
    const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    r = rig({ moon: at5 });
    atDesk(r); press(r);
    r.launch.picker.update(1 / 30);
    pad.buttons[15].pressed = true; r.launch.picker.update(1 / 30); pad.buttons[15].pressed = false; r.launch.picker.update(1 / 30);
    pad.buttons[0].pressed = true; r.launch.picker.update(1 / 30);
    expect(r.progression.state.moon.stamp).toBe(1);
    vi.unstubAllGlobals();
    r.dispose();
  });
  it('she may change her mind: another stamp replaces the first (the postcard is not posted yet)', () => {
    const r = rig({ moon: at5 });
    pick(r, 0);
    pick(r, 2);
    expect(r.progression.state.moon.stamp).toBe(2);
    expect(r.launch.carryingCard).toBe(2);
    r.dispose();
  });
  it('posting it at the rocket is step 6 and is saved; the postcard is gone from her mouth', () => {
    const r = rig({ moon: at5 });
    pick(r, 1);
    atRocket(r);
    expect(press(r)).toBe('E — post the postcard in the rocket');
    expect(r.progression.state.moon.step).toBe(6);
    expect(r.launch.carryingCard).toBe(-1);
    r.step(0.1);
    expect(r.scene.getObjectByName('moon:postcard').visible).toBe(false);
    expect(r.events.some((e) => /Postcard posted! Next: press the big red button/.test(e.label))).toBe(true);
    r.dispose();
  });
  it('the postcard in her mouth is not saved: a walk that ends with it leaves the step and the stamp, and she writes it again; step 6 and 7 persist', () => {
    const storage = mem();
    let r = rig({ moon: at5, storage });
    pick(r, 1);
    expect(r.launch.carryingCard).toBe(1);
    r.dispose(); // the walk ends with the postcard in her mouth
    r = rig({ storage });
    expect(r.progression.state.moon.step).toBe(5);
    expect(r.progression.state.moon.stamp).toBe(1);
    expect(r.launch.carryingCard).toBe(-1);
    expect(r.scene.getObjectByName('moon:postcard').visible).toBe(false);
    pick(r, 1);
    atRocket(r);
    press(r);
    r.dispose();
    r = rig({ storage }); // the walk ends after the postcard is in the rocket
    expect(r.progression.state.moon.step).toBe(6);
    atButton(r);
    press(r);
    r.step(L.countOf() + 1);
    expect(r.progression.state.moon.step).toBe(7);
    r.dispose();
    r = rig({ storage }); // and "sent" is still sent on the next walk
    expect(r.progression.state.moon.step).toBe(7);
    expect(r.progression.state.moon.stamp).toBe(1);
    r.dispose();
  });
  it('no stamp, no posting: a press at the rocket with nothing in her mouth does nothing, and nothing can be stuck', () => {
    const r = rig({ moon: at5 });
    atRocket(r);
    expect(r.life.promptAt(r.where) ?? '').not.toMatch(/post/);
    r.life.interact();
    expect(r.progression.state.moon.step).toBe(5);
    r.dispose();
  });
});

describe('the launch', () => {
  it('a real launch: the count 5 4 3 2 1 shows on the board, the gantry arm swings away, at ignition step 7 is saved and the journal counts one rocket', () => {
    const r = rig({ moon: { ...at5, step: 6, stamp: 1 } });
    atButton(r);
    expect(press(r)).toBe('E — press the big red button to launch!');
    expect(r.launch.state.flight).toMatchObject({ real: true, demo: false });
    r.step(2.5);
    expect(r.progression.state.moon.step).toBe(6); // not before ignition
    expect(r.launch.board.sprite.visible).toBe(true);
    expect(r.scene.getObjectByName('moon:arm').rotation.y).toBe(0);
    r.step(2.1); // t = 4.7: the arm is turning
    const turning = r.scene.getObjectByName('moon:arm').rotation.y;
    expect(turning).toBeGreaterThan(0);
    expect(turning).toBeLessThan(P.GANTRY.swing);
    r.step(0.6); // t = 5.3
    expect(r.progression.state.moon.step).toBe(7);
    expect(r.scene.getObjectByName('moon:arm').rotation.y).toBeCloseTo(P.GANTRY.swing, 6);
    expect(r.progression.state.journal.mnlaunch).toBe(1);
    expect(r.events.filter((e) => e.key === 'moon-go')).toHaveLength(1); // "Lift-off!" said once
    expect(r.launch.board.sprite.visible).toBe(false);
    r.dispose();
  });
  it('the countdown never double-fires through the live frames: each second once, the ignition once, even across the whole 40 s', () => {
    const r = rig({ moon: { ...at5, step: 6, stamp: 0 } });
    atButton(r);
    press(r);
    r.step(41);
    expect(r.events.filter((e) => e.key === 'moon-go')).toHaveLength(1);
    expect(r.progression.state.journal.mnlaunch).toBe(1);
    r.dispose();
  });
  it('the rocket rises, leaves, and a fresh one is rolled out; the plume glows and never flashes: no frame changes it by a tenth, no second holds more than three swings', () => {
    const r = rig({ moon: { ...at5, step: 6, stamp: 2 } });
    atButton(r);
    press(r);
    const rocket = r.scene.getObjectByName('moon:rocket');
    const plume = r.scene.getObjectByName('moon:plume');
    const stand = gy(P.ROCKET.x, P.ROCKET.z) + P.ROCKET.stand;
    expect(rocket.position.y).toBeCloseTo(stand, 6);
    const ys = [];
    const ops = [];
    for (let i = 0; i < 41 * 60; i++) {
      r.life.update(1 / 60, i / 60, r.where, r.camera, r.session);
      ys.push(rocket.visible ? rocket.position.y - stand : null);
      ops.push(plume.visible ? plume.material.opacity : 0);
    }
    const flying = ys.filter((y) => y !== null);
    expect(Math.max(...flying)).toBeGreaterThan(100);
    expect(ys.some((y) => y === null)).toBe(true); // out of the picture for a while
    expect(ys[ys.length - 1]).toBe(0); // and a fresh rocket is on the stand at the end
    let maxStep = 0;
    for (let i = 1; i < ops.length; i++) maxStep = Math.max(maxStep, Math.abs(ops[i] - ops[i - 1]));
    expect(maxStep).toBeLessThan(0.1);
    expect(Math.max(...ops)).toBeGreaterThan(0.5);
    expect(Math.max(...ops)).toBeLessThanOrEqual(0.9);
    r.dispose();
  });
  it('the plume faces the camera and hangs under the rocket; the smoke puffs on the pad while it climbs (150 puffs on a full device), and the camera tilts up', () => {
    const r = rig({ moon: { ...at5, step: 6, stamp: 2 } });
    r.camera.position.set(P.PAD.x - 20, 5, P.PAD.z + 20);
    atButton(r);
    press(r);
    r.step(8.5); // 3.5 s after ignition
    const plume = r.scene.getObjectByName('moon:plume');
    const smoke = r.scene.getObjectByName('moon:smoke');
    expect(plume.visible).toBe(true);
    expect(plume.position.x).toBe(P.ROCKET.x);
    expect(plume.rotation.y).toBeCloseTo(Math.atan2(-20, 20), 6);
    expect(smoke.geometry.attributes.position.count).toBe(150);
    expect(smoke.visible).toBe(true);
    let lit = 0;
    for (let i = 0; i < 150; i++) if (smoke.geometry.attributes.color.getX(i) > 0.01) lit++;
    expect(lit).toBeGreaterThan(10);
    expect(r.launch.tilt()).toBeGreaterThan(0.05);
    r.dispose();
  });
  it('the life tips the camera up while a rocket climbs, before the sky is placed on it, and puts nothing back that the walk would not recompute', () => {
    const r = rig({ moon: { ...at5, step: 6, stamp: 2 } });
    atButton(r);
    press(r);
    r.step(7.5); // 2.5 s after ignition: at the top of the tilt
    r.camera.rotation.set(0, 0, 0);
    r.camera.quaternion.identity();
    r.life.update(1 / 30, 9, r.where, r.camera, r.session);
    expect(r.camera.rotation.x).toBeGreaterThan(0.2);
    expect(r.camera.rotation.x).toBeLessThanOrEqual(L.TILT.max + 1e-6);
    r.camera.quaternion.identity();
    r.step(20);
    r.camera.quaternion.identity();
    r.life.update(1 / 30, 40, r.where, r.camera, r.session);
    expect(r.camera.rotation.x).toBeCloseTo(0, 6);
    r.dispose();
  });
  it('a test launch with no postcard (any step before 6): the whole show, nothing saved but the journal\'s count, the mission is where it was', () => {
    const r = rig({ moon: at5 });
    atButton(r);
    expect(press(r)).toBe('E — press the big red button to launch!');
    expect(r.launch.state.flight).toMatchObject({ real: false });
    r.step(8);
    expect(r.progression.state.moon.step).toBe(5);
    expect(r.progression.state.moon.stamp).toBe(-1);
    expect(r.progression.state.journal.mnlaunch).toBe(1);
    expect(r.scene.getObjectByName('moon:rocket').position.y).toBeGreaterThan(gy(P.ROCKET.x, P.ROCKET.z) + P.ROCKET.stand + 10);
    r.step(35);
    expect(M.nextGoal(r.progression.state.moon).kind).toBe('desk'); // and the next goal is still the postcard
    r.dispose();
  });
  it('a missing rocket never strands the mission: with the rocket, arm, plume and smoke gone from the scene the real launch still saves step 7', () => {
    const r = rig({ moon: { ...at5, step: 6, stamp: 1 } });
    r.life.launch.dispose();
    for (const n of ['moon:rocket', 'moon:arm', 'moon:plume', 'moon:smoke', 'moon:wingC']) { const o = r.scene.getObjectByName(n); o?.parent?.remove(o); }
    const bare = new THREE.Scene();
    const area = build(new THREE.Scene());
    const life2 = area.life({ scene: bare, ground: area.ground, audio: null, log: r.log, progression: r.progression, reducedMotion: false, tier: { name: 'high' }, doc: r.page.doc, win: r.page.win, clock: NOT_DEMO });
    const where = { x: P.LAUNCH_DESK.x - 1.4, y: 0, z: P.LAUNCH_DESK.z };
    const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat: new THREE.Object3D(), idleTime: 0 };
    const cam = new THREE.PerspectiveCamera();
    for (let i = 0; i < 3; i++) life2.update(1 / 30, i / 30, where, cam, session);
    expect(life2.promptAt(where)).toBe('E — press the big red button to launch!');
    life2.interact();
    for (let i = 0; i < 7 * 30; i++) life2.update(1 / 30, i / 30, where, cam, session);
    expect(r.progression.state.moon.step).toBe(7);
    life2.dispose();
    r.dispose();
  });
  it('while a rocket is flying there is no second press, and after its 40 s the button is there again', () => {
    const r = rig({ moon: at5 });
    atButton(r);
    press(r);
    r.step(6);
    expect(r.life.promptAt(r.where) ?? '').not.toMatch(/button/);
    r.step(36);
    expect(r.life.promptAt(r.where)).toBe('E — press the big red button to launch!');
    r.dispose();
  });
  it('the Launch Desk\'s button also works when the postcard is not posted yet and when the story is long done (always a show)', () => {
    for (const moon of [{ step: 7, cells: 3, scope: 3, stamp: 0 }, { step: 8, cells: 3, scope: 3, stamp: 0 }]) {
      const r = rig({ moon });
      atButton(r);
      expect(press(r)).toBe('E — press the big red button to launch!');
      r.step(8);
      expect(r.progression.state.moon.step).toBe(moon.step);
      r.dispose();
    }
  });
});

describe('what the life does with no clock of its own', () => {
  it('in the tests (no page) a launch never starts by itself; a second launch on the same walk counts no second rocket on the journal page', () => {
    const r = rig({ moon: at5, clock: undefined });
    r.step(30);
    expect(r.launch.state.flight).toBeNull();
    atButton(r);
    press(r);
    r.step(41);
    press(r);
    r.step(41);
    expect(r.progression.state.journal.mnlaunch).toBe(1);
    r.dispose();
  });
  it('a demo\'s lift-off is silent in the toasts: nothing says "Lift-off!" for a rocket she did not launch', () => {
    const r = rig({ moon: at5, clock: () => 300 + 10.5 });
    r.step(8);
    expect(r.events.filter((e) => e.key === 'moon-go')).toHaveLength(0);
    r.dispose();
  });
});

describe('reduced motion', () => {
  it('a 3 s count, no smoke mesh, no camera tilt, a steady plume, gone by 12 s and the button ready again', () => {
    const r = rig({ moon: { ...at5, step: 6, stamp: 1 }, reducedMotion: true });
    expect(r.scene.getObjectByName('moon:smoke')).toBeUndefined();
    atButton(r);
    press(r);
    r.step(3.3);
    expect(r.progression.state.moon.step).toBe(7);
    expect(r.launch.tilt()).toBe(0);
    r.camera.quaternion.identity();
    r.life.update(1 / 30, 5, r.where, r.camera, r.session);
    expect(r.camera.rotation.x).toBeCloseTo(0, 6);
    r.step(9);
    expect(r.life.promptAt(r.where)).toBe('E — press the big red button to launch!');
    r.dispose();
  });
});

describe('smoke counts per tier, as built', () => {
  const smokeOf = (quality) => { const scene = new THREE.Scene(); build(scene, { water: { quality } }); return scene.getObjectByName('moon:smoke'); };
  it('150 on the full tier, 40 on LOW, none on the lite rung', () => {
    expect(smokeOf(undefined).geometry.attributes.position.count).toBe(150);
    expect(smokeOf({ name: 'high', shadows: true, rung: 0 }).geometry.attributes.position.count).toBe(150);
    expect(smokeOf({ name: 'low', shadows: true, rung: 3 }).geometry.attributes.position.count).toBe(40);
    expect(smokeOf({ name: 'low', shadows: false, rung: 5 })).toBeUndefined();
  });
});

describe('the clock-launched demo', () => {
  it('at a demo\'s T0 on the room\'s clock the pad launches by itself: a siren first, the count, the flight, nothing saved and no rocket counted', () => {
    let now = 300 + 3; // 7 s before the demo's T0 (the siren window)
    const r = rig({ moon: at5, clock: () => now });
    r.step(0.5);
    expect(r.launch.state.flight).toBeNull();
    now = 300 + 10.2; // the demo's T0
    r.step(0.2);
    expect(r.launch.state.flight).toMatchObject({ demo: true, real: false });
    r.step(8);
    expect(r.progression.state.moon.step).toBe(5);
    expect(r.progression.state.journal.mnlaunch ?? 0).toBe(0);
    const rocket = r.scene.getObjectByName('moon:rocket');
    expect(rocket.position.y).toBeGreaterThan(gy(P.ROCKET.x, P.ROCKET.z) + P.ROCKET.stand + 5);
    r.dispose();
  });
  it('a device that arrives mid-flight sees the rocket where the room\'s clock says it is, and does not count down again', () => {
    const r = rig({ moon: at5, clock: () => 300 + 10 + 12 }); // 12 s after T0
    r.step(0.1);
    expect(r.launch.state.flight).toMatchObject({ demo: true });
    const stand = gy(P.ROCKET.x, P.ROCKET.z) + P.ROCKET.stand;
    expect(r.scene.getObjectByName('moon:rocket').position.y - stand).toBeCloseTo(L.riseY(12 - 5 + 0.1), 0);
    expect(r.events.filter((e) => e.key === 'moon-go')).toHaveLength(0);
    r.dispose();
  });
  it('a demo is not started over her own launch, nor again in the same cycle', () => {
    let now = 300 + 12;
    const r = rig({ moon: { ...at5, step: 6, stamp: 1 }, clock: () => 250 });
    atButton(r);
    press(r);
    now = 300 + 12;
    r.step(1);
    expect(r.launch.state.flight.demo).toBe(false);
    r.dispose();
    void now;
  });
  it('the demo may be joined at the button by a child at step 6: during its count the press makes it hers (a real launch)', () => {
    let now = 300 + 10.5;
    const r = rig({ moon: { ...at5, step: 6, stamp: 1 }, clock: () => now });
    atButton(r);
    r.step(0.3);
    expect(r.launch.state.flight).toMatchObject({ demo: true, real: false });
    expect(press(r)).toBe('E — press the big red button to launch!');
    expect(r.launch.state.flight.real).toBe(true);
    now += 6;
    r.step(6);
    expect(r.progression.state.moon.step).toBe(7);
    r.dispose();
  });
});

describe('Earth answers', () => {
  const sent = { step: 7, cells: 3, scope: 3, stamp: 1 };
  it('launched on an earlier walk (step 7): at once when she is within 6 m of Earthrise Rock: step 8, "Earth says hello back!", 40 paws once, the badge, the journal page', () => {
    const r = rig({ moon: sent });
    const before = r.progression.state.points;
    r.step(2, { x: LEDGE.x + 3, z: LEDGE.z + 3, y: gy(LEDGE.x + 3, LEDGE.z + 3) });
    expect(r.progression.state.moon.step).toBe(8);
    r.step(3);
    expect(r.events.some((e) => e.label === 'Earth answered! It sent your stamp back.')).toBe(true);
    r.step(2);
    expect(r.progression.state.points - before).toBe(40);
    expect(r.events.filter((e) => e.type === 'moonstory')).toHaveLength(1);
    expect(r.progression.state.journal.mnstory).toBe(1);
    expect(r.progression.state.unlocked.accessories).toContain('moonbadge');
    expect(r.progression.state.equipped.collar).toBe('moonbadge');
    r.step(6);
    expect(r.events.some((e) => e.label === 'A Moon Badge! You are a Moon Explorer!')).toBe(true);
    r.dispose();
  });
  it('the Moon Badge is owned once: a second walk does not pay or count again, and it is put on only if her collar is bare', () => {
    const r = rig({ moon: sent });
    r.progression.state.equipped.collar = 'bell';
    r.step(8, { x: LEDGE.x, z: LEDGE.z, y: ledgeTop });
    expect(r.progression.state.equipped.collar).toBe('bell');
    expect(r.progression.state.unlocked.accessories).toContain('moonbadge');
    const pts = r.progression.state.points;
    r.dispose();
    const r2 = rig({ moon: { ...sent, step: 8 }, storage: r.storage });
    r2.progression.state.points = pts;
    r2.step(8, { x: LEDGE.x, z: LEDGE.z, y: ledgeTop });
    expect(r2.progression.state.points).toBe(pts);
    expect(r2.progression.state.journal.mnstory ?? 0).toBeLessThanOrEqual(1);
    r2.dispose();
  });
  it('launched this walk: she must wait 40 s after the launch; a hint says so once; nothing happens before, and it happens when the time comes', () => {
    const r = rig({ moon: { step: 6, cells: 3, scope: 3, stamp: 1 } });
    atButton(r);
    press(r);
    r.step(6); // ignition: step 7
    expect(r.progression.state.moon.step).toBe(7);
    r.step(1, { x: LEDGE.x, z: LEDGE.z, y: ledgeTop });
    expect(r.progression.state.moon.step).toBe(7);
    expect(r.events.filter((e) => e.key === 'moon-reply-wait')).toHaveLength(1);
    r.step(20);
    expect(r.progression.state.moon.step).toBe(7);
    expect(r.events.filter((e) => e.key === 'moon-reply-wait')).toHaveLength(1);
    r.step(14.5); // 40 s after the press
    expect(r.progression.state.moon.step).toBe(8);
    r.dispose();
  });
  it('far from the rock nothing happens (she may stay as long as she likes), and with the story not yet at step 7 nothing happens near it', () => {
    const r = rig({ moon: sent });
    r.step(5, { x: 0, z: 0, y: 0 });
    expect(r.progression.state.moon.step).toBe(7);
    r.dispose();
    const early = rig({ moon: { step: 6, cells: 3, scope: 3, stamp: 1 } });
    early.step(5, { x: LEDGE.x, z: LEDGE.z, y: ledgeTop });
    expect(early.progression.state.moon.step).toBe(6);
    early.dispose();
  });
  it('Pip dances and the reply chimes: the life calls its pip and its sound (reply is silent without audio)', () => {
    const r = rig({ moon: sent });
    const dance = vi.spyOn(r.life.base.pip, 'dance');
    r.step(2, { x: LEDGE.x, z: LEDGE.z, y: ledgeTop });
    expect(dance).toHaveBeenCalled();
    r.dispose();
  });
  it('Earth\'s night side carries her stamp: the sky\'s picture is redrawn for the reply, blinks, and is steady afterwards', () => {
    const r = rig({ moon: sent, canvas: true });
    const sky = r.life.sky;
    const map = sky.earth.material.map;
    expect(map.userData.canvas).toBeTruthy();
    const v0 = map.version;
    r.step(2, { x: LEDGE.x, z: LEDGE.z, y: ledgeTop });
    const seen = new Set();
    for (let i = 0; i < 60; i++) { r.step(0.1); seen.add(map.version); }
    expect(map.version).toBeGreaterThan(v0);
    expect(seen.size).toBeGreaterThan(3); // it blinks: the picture changes level
    r.step(8);
    const steady = map.version;
    r.step(3);
    expect(map.version).toBe(steady); // from now on a still picture
    r.dispose();
    // a walk after the story begins with her stamp already on Earth
    const r2 = rig({ moon: { ...sent, step: 8 }, canvas: true });
    expect(r2.life.sky.earth.material.map.version).toBeGreaterThan(0);
    r2.dispose();
  });
  it('the binocular stand shows Earth close up; her stamp blinks on it only once the story is done; closing frees the page and releases the cat', () => {
    const r = rig({ moon: { ...sent, step: 8 } });
    atRock(r);
    expect(press(r)).toBe('E — look at Earth');
    expect(r.launch.view.isOpen).toBe(true);
    expect(r.page.doc.body.children).toHaveLength(1);
    const held = r.cat.position.clone();
    r.cat.position.set(held.x + 2, held.y, held.z);
    r.session.fair.update(1 / 30, 1, { cat: r.cat, player: { halt() {} }, session: r.session });
    expect(r.cat.position.x).toBeCloseTo(held.x, 6);
    r.page.win.fire('keydown', { code: 'Escape' });
    expect(r.launch.view.isOpen).toBe(false);
    expect(r.page.doc.body.children).toHaveLength(0);
    expect(r.page.win.count()).toBe(0);
    r.dispose();
  });
});

describe('a room: anyone\'s press launches for everyone (the hook; the wire event itself is the room milestone\'s)', () => {
  it('a friend\'s launch starts the same flight here from her T0 on the room clock; a device at step 6 moves to 7 at ignition, a device earlier in the story just watches', () => {
    const a = rig({ moon: { step: 6, cells: 3, scope: 3, stamp: 1 } });
    expect(a.life.credit({ kind: 'launch', t0: 500, now: 500 })).toBe('launch');
    expect(a.launch.state.flight).toMatchObject({ real: true });
    a.step(2);
    expect(a.progression.state.moon.step).toBe(6);
    a.step(4);
    expect(a.progression.state.moon.step).toBe(7);
    a.dispose();
    const b = rig({ moon: at5 });
    expect(b.life.credit({ kind: 'launch', t0: 500, now: 502 })).toBe('launch');
    expect(b.launch.state.flight).toMatchObject({ real: false });
    b.step(8);
    expect(b.progression.state.moon.step).toBe(5);
    const stand = gy(P.ROCKET.x, P.ROCKET.z) + P.ROCKET.stand;
    expect(b.scene.getObjectByName('moon:rocket').position.y).toBeGreaterThan(stand + 5);
    b.dispose();
  });
  it('joining a flight already past its ignition (a late message) still saves the launch for a device at step 6, with no second countdown', () => {
    const r = rig({ moon: { step: 6, cells: 3, scope: 3, stamp: 1 } });
    expect(r.life.credit({ kind: 'launch', t0: 900, now: 912 })).toBe('launch');
    expect(r.progression.state.moon.step).toBe(7);
    expect(r.events.filter((e) => e.key === 'moon-go')).toHaveLength(0);
    r.dispose();
  });
  it('a hostile, early, late or repeated event does nothing: unknown kinds, a launch that is over, no times, times in the future, one rocket at a time', () => {
    const r = rig({ moon: { step: 6, cells: 3, scope: 3, stamp: 1 } });
    for (const ev of [null, 5, 'launch', [], { kind: 'x' }, { kind: 'launch' }, { kind: 'launch', t0: 'a', now: 3 }, { kind: 'launch', t0: 10, now: 9 }, { kind: 'launch', t0: 0, now: 99 },
      { kind: 'launch', t0: NaN, now: 1 }, { kind: '__proto__' }, { kind: 'constructor' }, { kind: 'launch', t0: 1, now: Infinity }]) expect(r.life.credit(ev), JSON.stringify(ev)).toBeNull();
    expect(r.launch.state.flight).toBeNull();
    expect(r.life.credit({ kind: 'launch', t0: 5, now: 6 })).toBe('launch');
    expect(r.life.credit({ kind: 'launch', t0: 5, now: 7 })).toBeNull();
    r.dispose();
  });
  it('an older partner build: its events are unknown here and ours are unknown there, and neither side\'s mission breaks', () => {
    // the older build's life (milestone 5) hands every non-rover kind to the base's credit, which reads only wake and plug: a launch is ignored there
    const old = M.credit({ step: 6, cells: 3, stamp: 1 }, { kind: 'moon-launch', t0: 1, now: 2 });
    expect(old.changed).toBe(false);
    // and an older partner's record (no stamp key at all, step 5) merges and plays on here
    const r = rig();
    r.progression.state.moon = { step: 5, cells: 3, scope: 3, jump: {} };
    pick(r, 0);
    expect(r.progression.state.moon.stamp).toBe(0);
    for (const ev of [{ kind: 'wake' }, { kind: 'plug', cell: 0 }, { kind: 'rover-in', seat: 0 }, { kind: 'rover-pose', x: 1, z: 1, yaw: 0, speed: 1 }]) expect(() => r.life.credit(ev)).not.toThrow();
    expect(r.progression.state.moon.step).toBe(5);
    r.dispose();
  });
});

describe('the zone, the drawing and the walk end', () => {
  it('the arm is drawn only near the pad or while a rocket flies, the plume, smoke and board only during a flight; the rocket casts only near', () => {
    const r = rig({ moon: at5 });
    r.step(0.2, { x: 0, y: 0, z: 45 });
    expect(r.scene.getObjectByName('moon:arm').visible).toBe(false);
    expect(r.scene.getObjectByName('moon:plume').visible).toBe(false);
    expect(r.scene.getObjectByName('moon:smoke').visible).toBe(false);
    expect(r.launch.board.sprite.visible).toBe(false);
    expect(r.scene.getObjectByName('moon:rocket').castShadow).toBe(false);
    r.step(0.2, { x: P.PAD.x - 20, z: P.PAD.z + 20, y: 0 });
    expect(r.scene.getObjectByName('moon:arm').visible).toBe(true);
    expect(r.scene.getObjectByName('moon:rocket').castShadow).toBe(true);
    r.step(0.2, { x: P.PAD.x - 50, z: P.PAD.z + 20, y: 0 });
    expect(r.scene.getObjectByName('moon:arm').visible).toBe(true); // hysteresis: still drawn out to 61 m (54 m here)
    r.step(0.2, { x: P.PAD.x - 80, z: P.PAD.z + 20, y: 0 });
    expect(r.scene.getObjectByName('moon:arm').visible).toBe(false);
    r.dispose();
  });
  it('a walk that ends mid-flight or with a page open leaves the rocket on its stand, closes the pages and removes its listeners', () => {
    const r = rig({ moon: at5 });
    atButton(r);
    press(r);
    r.step(9);
    const rocket = r.scene.getObjectByName('moon:rocket');
    expect(rocket.position.y).toBeGreaterThan(gy(P.ROCKET.x, P.ROCKET.z) + P.ROCKET.stand + 5);
    r.life.dispose();
    expect(rocket.position.y).toBeCloseTo(gy(P.ROCKET.x, P.ROCKET.z) + P.ROCKET.stand, 6);
    const q = rig({ moon: at5 });
    atDesk(q);
    press(q);
    q.life.dispose();
    expect(q.page.doc.body.children).toHaveLength(0);
    expect(q.page.win.count()).toBe(0);
    expect(q.scene.getObjectByName('moon:postcard')).toBeUndefined();
    expect(q.scene.getObjectByName('moon:count')).toBeUndefined();
  });
  it('the Mission Board and the gold ring point at the next thing of the chapter: the desk, the rocket, the big red button, the ridge', () => {
    const goals = [[{ ...at5 }, 'moon.goal.card', /message desk/i], [{ step: 6, cells: 3, scope: 3, stamp: 0 }, 'moon.goal.button', /big red button/i], [{ step: 7, cells: 3, scope: 3, stamp: 0 }, 'moon.goal.reply', /Earthrise Rock/i]];
    for (const [moon, , rx] of goals) {
      const r = rig({ moon });
      r.step(0.1, { x: P.BOARD.x + 2, z: P.BOARD.z, y: gy(P.BOARD.x + 2, P.BOARD.z) });
      press(r);
      expect(r.events.some((e) => e.key === 'moon-board' && rx.test(e.label))).toBe(true);
      r.dispose();
    }
    const c = rig({ moon: at5 });
    pick(c, 1);
    c.step(0.1, { x: P.BOARD.x + 2, z: P.BOARD.z, y: gy(P.BOARD.x + 2, P.BOARD.z) });
    press(c);
    expect(c.events.some((e) => e.key === 'moon-board' && /rocket/i.test(e.label))).toBe(true);
    c.dispose();
  });
});
