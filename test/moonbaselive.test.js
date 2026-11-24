// The Moon, milestone 2: the base on a walk (world/moonbaselive.js) on the real area, a real progression and a real discovery log.
// Pip wakes and follows, the cells, the Core and its wake-up beat, the gold ring, the saves, the finds, co-walk credit, the real
// pounce-and-climb to the Ridge cell, reduced motion, and the walk's end.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import { build } from '../src/world/moon.js';
import { createProgression, SAVE_KEY } from '../src/progression.js';
import { createDiscoveryLog, createDiscoveryLog as _unused } from '../src/discoveries.js';
import { discoveryText } from '../src/ui/hud.js';
import { bus } from '../src/events.js';
import { phrase } from '../src/clanphrases.js';
import { createInteractions } from '../src/game/interactions.js';
import { mem } from './helpers/lighthouselife.js';
import { canvasDocument } from './helpers/canvas.js';
import { PIP, pushOut } from '../src/world/moonpip.js';
import { BEAT, RING, REACH } from '../src/world/moonbaselive.js';
import * as M from '../src/world/moonmission.js';

void _unused;
const gy = (x, z) => P.moonY(x, z);
function rig({ storage = mem(), progression = createProgression(storage), reducedMotion = false, audio = null } = {}) {
  const scene = new THREE.Scene();
  const area = build(scene);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const life = area.life({ scene, ground: area.ground, audio, log, progression, reducedMotion, tier: { name: 'high' } });
  const camera = new THREE.PerspectiveCamera();
  const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat: { rotation: { y: 0 } } };
  const events = [];
  const off = bus.on('discovery', (e) => events.push(e));
  const cat = { x: 0, y: 0, z: 45 };
  let t = 0;
  const at = (x, z, y = gy(x, z)) => { cat.x = x; cat.y = y; cat.z = z; return cat; };
  const step = (secs, where) => { if (where) Object.assign(cat, where); for (let i = 0; i < Math.round(secs * 30); i++) { t += 1 / 30; life.update(1 / 30, t, cat, camera, session); } };
  const prompt = () => life.promptAt(cat);
  return { scene, area, progression, log, life, session, events, off, cat, at, step, prompt, camera, storage, dispose() { off(); life.dispose(); } };
}
const lines = (events) => events.map((e) => e.label);

afterEach(() => vi.unstubAllGlobals());

describe('Pip', () => {
  it('sleeps by the lander on a fresh save: a prompt beside him, none far off, and a first-time hint', () => {
    const r = rig();
    expect(r.life.base.pip.state).toBe('asleep');
    expect(r.life.base.pip.lantern).toBeLessThan(0.3);
    r.at(P.PIP_SLEEP.x - 1.2, P.PIP_SLEEP.z + 1);
    expect(r.prompt()).toBe(phrase('moon.pip.prompt'));
    r.at(0, 20);
    expect(r.prompt()).toBe(null);
    r.at(0, 45);
    r.step(4);
    expect(lines(r.events)).toContain(phrase('moon.pip.hint'));
    expect(lines(r.events)).toContain(phrase('moon.arrive'));
    r.dispose();
  });
  it('wakes on Interact: a beep line, step 1 saved, the lantern up, then he rolls ahead to the airlock and follows her', () => {
    const r = rig();
    r.at(P.PIP_SLEEP.x - 1.2, P.PIP_SLEEP.z + 1);
    r.prompt();
    expect(r.life.interact()).toBe('wake');
    expect(r.progression.state.moon.step).toBe(1);
    expect(lines(r.events)).toContain(phrase('moon.pip.wake'));
    r.step(1.5);
    expect(r.life.base.pip.state).toBe('leading');
    expect(r.life.base.pip.lantern).toBeGreaterThan(0.8);
    expect(r.prompt()).toBe(null); // nothing left to wake
    // she follows him toward the dome: he reaches the airlock's front and then follows
    const front = P.PIP_LEAD[P.PIP_LEAD.length - 1];
    let guard = 0;
    while (r.life.base.pip.state === 'leading' && guard++ < 60) {
      const p = r.life.base.pip.position;
      r.step(1, { x: p.x + 0.5, z: p.z + 1.5, y: 0 });
    }
    expect(r.life.base.pip.state).toBe('following');
    expect(Math.hypot(r.life.base.pip.position.x - front.x, r.life.base.pip.position.z - front.z)).toBeLessThan(2);
    expect(lines(r.events)).toContain(phrase('moon.pip.goal'));
    r.dispose();
  });
  it('waits for her while he leads and she lags behind, and never runs off', () => {
    const r = rig();
    r.at(P.PIP_SLEEP.x - 1.2, P.PIP_SLEEP.z + 1);
    r.prompt(); r.life.interact();
    r.step(2, { x: 0, z: 45, y: 0 });
    const was = { ...r.life.base.pip.position };
    r.step(8, { x: 45, z: 45, y: 0 }); // she is more than 12 m away
    const now = r.life.base.pip.position;
    expect(Math.hypot(now.x - was.x, now.z - was.z)).toBeLessThan(0.5);
    r.dispose();
  });
  it('follows on her footprints at a gap, hurries when she runs, waits when she climbs, and is never inside a collider over a long walk round the lander, the ring and through the airlock', () => {
    const r = rig();
    r.life.base.pip.setAwake();
    const path = [[0, 45], [4.5, 40], [3, 34], [-4, 34], [-14, 33], [-19.6, 26], [-24, 26], [-29, 26], [-31, 30], [-37, 30], [-37, 22], [-31, 22], [-29, 26], [-20, 26], [-10, 30], [0, 33], [8, 28], [9, 41], [-2, 46]];
    // she WALKS it (3.5 m/s, a footprint every 0.6 m): a straight line between two of her steps is open ground, as it is in the game
    let worst = 0;
    let far = 0;
    let at = path[0];
    r.step(0.1, { x: at[0], z: at[1], y: gy(at[0], at[1]) });
    for (const to of path.slice(1)) {
      const n = Math.ceil(Math.hypot(to[0] - at[0], to[1] - at[1]) / 0.117);
      for (let k = 1; k <= n; k++) {
        const x = at[0] + ((to[0] - at[0]) * k) / n; const z = at[1] + ((to[1] - at[1]) * k) / n;
        for (const c of r.area.colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + 0.35) throw new Error(`the test's own path crosses a collider at ${x.toFixed(1)},${z.toFixed(1)}`);
        r.step(1 / 30, { x, z, y: gy(x, z) });
        const p = r.life.base.pip.position;
        for (const c of r.area.colliders) worst = Math.max(worst, c.r + PIP.radius - Math.hypot(p.x - c.x, p.z - c.z));
        far = Math.max(far, Math.hypot(p.x - x, p.z - z));
      }
      at = to;
    }
    expect(far).toBeLessThan(12); // he keeps up (the gap is 2 m of her path; he hurries when she runs)
    expect(worst).toBeLessThan(0.05); // never pressed into a collider beyond a hair
    r.step(3);
    const p = r.life.base.pip.position;
    expect(Math.hypot(p.x - r.cat.x, p.z - r.cat.z)).toBeLessThan(3.2); // and he comes to her side when she stops
    // she climbs onto a pillar: he waits at her feet's end of the path and adds no footprints
    r.at(P.SKIP[0].x, P.SKIP[0].z, gy(P.SKIP[0].x, P.SKIP[0].z) + P.SKIP[0].y);
    r.session.perched = { y: P.SKIP[0].y };
    const n = r.life.base.pip.crumbs.length;
    r.step(3);
    expect(r.life.base.pip.crumbs.length).toBe(n);
    r.dispose();
  });
  it('pushOut leaves a point alone that is clear, moves one that is inside to just outside, and stays in the bounds', () => {
    const cs = [{ x: 0, z: 0, r: 2 }];
    const a = { x: 10, z: 10 };
    expect(pushOut(a, cs)).toBe(false);
    const b = { x: 0.5, z: 0 };
    expect(pushOut(b, cs)).toBe(true);
    expect(Math.hypot(b.x, b.z)).toBeCloseTo(2 + PIP.radius, 6);
    const c = { x: 0, z: 0 };
    pushOut(c, cs);
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(2 + PIP.radius, 6);
    const d = { x: 500, z: -500 };
    pushOut(d, []);
    expect(d.x).toBeLessThanOrEqual(P.MOON_BOUNDS.maxX);
    expect(d.z).toBeGreaterThanOrEqual(P.MOON_BOUNDS.minZ);
  });
  it('is not a collider (she walks through him; he can never block a route) and adds none to the area', () => {
    const r = rig();
    expect(r.area.colliders.length).toBe(P.MOON_COLLIDERS.length);
    expect(r.life.base.pip.group.userData.collider).toBeUndefined();
    r.dispose();
  });
  it('on a save with Pip awake he is awake at the start, lantern up, and follows without a wake-up', () => {
    const rr = rig();
    rr.progression.state.moon = { ...rr.progression.state.moon, step: 1 };
    const r2 = rig({ progression: rr.progression });
    expect(r2.life.base.pip.state).toBe('following');
    expect(r2.at(P.PIP_SLEEP.x, P.PIP_SLEEP.z + 1) && r2.prompt()).toBe(null);
    rr.dispose(); r2.dispose();
  });
});

describe('the cells and the Core', () => {
  function awakeRig(over) {
    const r = rig(over);
    r.progression.state.moon = { ...r.progression.state.moon, step: Math.max(1, r.progression.state.moon.step) };
    return r;
  }
  const top = P.SKIP[1];
  const atTop = (r) => r.at(top.x, top.z, gy(top.x, top.z) + top.y);
  const atRover = (r) => r.at(P.ROVER_CELL.x - 1, P.ROVER_CELL.z + 0.5);
  const atCore = (r) => r.at(P.CORE.x + 1.6, P.CORE.z);

  it('a cell cannot be picked up until Pip is awake', () => {
    const r = rig();
    atTop(r);
    expect(r.prompt()).toBe(null);
    atRover(r);
    expect(r.prompt()).toBe(null);
    r.dispose();
  });
  it('the Ridge cell: picked up on the top pillar (E), carried in front of her, plugged into socket 0; the Rover cell likewise into socket 1; the second wakes the base', () => {
    const audio = { fanfare: vi.fn(), stopAmbient: vi.fn(), isMuted: () => true };
    const r = awakeRig({ audio });
    r.life.base.pip.setAwake();
    atTop(r);
    expect(r.prompt()).toBe(phrase('moon.cell.prompt'));
    expect(r.life.interact()).toBe('pick');
    expect(r.life.base.state.carrying).toBe(0);
    expect(lines(r.events)).toContain(phrase('moon.cell.got'));
    expect(r.prompt()).toBe(null); // one thing at a time: no second pick while she carries
    // carried: the cell is in front of her, off its pillar
    r.step(0.2, { x: top.x + 4, z: top.z + 4, y: 0 });
    const cell0 = r.life.base.cells[0];
    expect(Math.hypot(cell0.position.x - r.cat.x, cell0.position.z - r.cat.z)).toBeLessThan(1);
    // the Core
    atCore(r);
    expect(r.prompt()).toBe(phrase('moon.core.prompt'));
    expect(r.life.interact()).toBe('plug');
    expect(r.progression.state.moon).toMatchObject({ step: 2, cells: 1 });
    expect(r.life.base.state.carrying).toBe(null);
    r.step(0.1);
    const s0 = P.SOCKETS[0];
    expect(cell0.position.x).toBeCloseTo(s0.x, 3);
    expect(cell0.position.z).toBeCloseTo(s0.z, 3);
    expect(lines(r.events)).toContain(phrase('moon.core.plug1'));
    // the Rover cell
    atRover(r);
    expect(r.prompt()).toBe(phrase('moon.cell.prompt'));
    r.life.interact();
    atCore(r);
    r.prompt();
    r.life.interact();
    expect(r.progression.state.moon).toMatchObject({ step: 3, cells: 3 });
    expect(audio.fanfare).toHaveBeenCalledTimes(1);
    r.dispose();
  });
  it('the Rover cell first works as well (either order)', () => {
    const r = awakeRig();
    r.life.base.pip.setAwake();
    atRover(r); r.prompt(); r.life.interact();
    atCore(r); r.prompt(); r.life.interact();
    expect(r.progression.state.moon).toMatchObject({ step: 2, cells: 2 });
    atTop(r); r.prompt(); r.life.interact();
    atCore(r); r.prompt(); r.life.interact();
    expect(r.progression.state.moon).toMatchObject({ step: 3, cells: 3 });
    r.dispose();
  });
  it('the wake-up beat: the lamps and the Core come up, the glass warms, the base is awake (step 4) and saved at the end, with the lines and Pip\'s dance', () => {
    const r = awakeRig();
    r.life.base.pip.setAwake();
    r.progression.state.moon = { step: 2, cells: 1, stamp: -1, scope: 0, jump: {} };
    const lamp = r.scene.getObjectByName('moon:lamp');
    const glass = r.scene.getObjectByName('moon:glass');
    const before = { lamp: lamp.material.color.getHex(), op: glass.material.opacity };
    r.life.base.pip.setAwake();
    r.step(0.1);
    atRover(r); r.prompt(); r.life.interact();
    atCore(r); r.prompt(); r.life.interact();
    r.step(BEAT.rise / 2);
    const mid = lamp.material.color.getHex();
    r.step(BEAT.total);
    const after = lamp.material.color.getHex();
    expect(before.lamp).not.toBe(after);
    expect(mid).not.toBe(before.lamp);
    expect(glass.material.opacity).toBeGreaterThan(before.op);
    expect(r.progression.state.moon.step).toBe(4);
    expect(lines(r.events)).toContain(phrase('moon.core.on'));
    expect(lines(r.events)).toContain(phrase('moon.earth'));
    expect(r.life.base.state.power).toBe(1);
    r.dispose();
  });
  it('a walk that opens on a woken base is lit from the first frame (no beat), with both cells in their sockets', () => {
    const a = rig();
    a.progression.state.moon = { step: 4, cells: 3, stamp: -1, scope: 0, jump: {} };
    const r = rig({ progression: a.progression });
    expect(r.life.base.state.power).toBe(1);
    expect(r.life.base.state.cellMode).toEqual(['plugged', 'plugged']);
    expect(r.scene.getObjectByName('moon:lamp').material.color.getHex()).toBe(0xfff0c4);
    r.step(0.2, { x: 0, z: 45, y: 0 });
    expect(lines(r.events)).not.toContain(phrase('moon.core.on'));
    a.dispose(); r.dispose();
  });
  it('step 3 saved unseen (both cells in when the walk ended) plays the beat when she comes near the dome, once', () => {
    const a = rig();
    a.progression.state.moon = { step: 3, cells: 3, stamp: -1, scope: 0, jump: {} };
    const r = rig({ progression: a.progression });
    r.step(2, { x: 0, z: 45, y: 0 });
    expect(r.life.base.state.beat).toBe(false);
    r.step(1, { x: P.DOME.x + 12, z: P.DOME.z, y: 0 });
    expect(r.life.base.state.beat).toBe(true);
    r.step(BEAT.total + 1);
    expect(r.progression.state.moon.step).toBe(4);
    const n = lines(r.events).filter((l) => l === phrase('moon.core.on')).length;
    r.step(3, { x: P.DOME.x + 12, z: P.DOME.z, y: 0 });
    expect(lines(r.events).filter((l) => l === phrase('moon.core.on')).length).toBe(n);
    a.dispose(); r.dispose();
  });
  it('a cell she is carrying when the walk ends is not saved: the next walk finds it at its own spot, and nothing is a den keepsake', () => {
    const r = awakeRig();
    r.life.base.pip.setAwake();
    atTop(r); r.prompt(); r.life.interact();
    expect(r.life.base.state.carrying).toBe(0);
    const saved = JSON.stringify(r.progression.state.moon);
    r.dispose();
    const r2 = rig({ progression: r.progression });
    expect(JSON.stringify(r2.progression.state.moon)).toBe(saved);
    expect(r2.life.base.state.cellMode).toEqual(['home', 'home']);
    expect(r2.life.base.state.carrying).toBe(null);
    const c = r2.life.base.cells[0];
    expect(c.position.x).toBeCloseTo(P.RIDGE_CELL.x, 2);
    expect(c.position.z).toBeCloseTo(P.RIDGE_CELL.z, 2);
    r2.dispose();
  });
  it('the save survives a reload (the record is on the persisted save, not only in memory)', () => {
    const storage = mem();
    const r = awakeRig({ storage });
    r.life.base.pip.setAwake();
    atRover(r); r.prompt(); r.life.interact();
    atCore(r); r.prompt(); r.life.interact();
    const again = createProgression(storage);
    expect(again.state.moon).toMatchObject({ step: 2, cells: 2 });
    r.dispose();
  });
  it('reaching the Ridge cell is the real pounce-and-climb: two presses from the dust take her to the pillar and the top, on the Moon, by the walk\'s own code; on Earth\'s place id nothing moves her', () => {
    const r = rig();
    const climb = (areaId) => {
      const cat = new THREE.Vector3(P.SKIP[0].x - 2.3, 0, P.SKIP[0].z + 0.5);
      cat.y = gy(cat.x, cat.z);
      const session = { areaId, areaData: { perches: r.area.perches }, ground: r.area.ground, cat: { position: cat }, perched: null, pounceCooldown: 0, pounceTime: 0, perchHold: null, fx: { burst() {} }, reducedMotion: false };
      const player = { perchY: 0, inputActive: false, speedFactor: 1, halt() {}, pounce() {} };
      const { doPounceOrClimb } = createInteractions({
        MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null, getSession: () => session, getIsTouch: () => false,
        player, progression: r.progression, log: r.log, hud: { toast() {} }, audio: { trill() {}, pounceWhoosh() {} },
        catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
      });
      doPounceOrClimb();
      const first = session.perched;
      if (first) doPounceOrClimb();
      return { first, second: session.perched, y: session.cat.position.y };
    };
    const moon = climb('moon');
    expect(moon.first?.y).toBe(P.SKIP[0].y);
    expect(moon.second?.y).toBe(P.SKIP[1].y);
    expect(moon.y).toBeCloseTo(gy(top.x, top.z) + P.SKIP[1].y, 6);
    const earth = climb('neighborhood');
    expect(earth.first).toBe(null);
    r.dispose();
  });
});

const top = P.SKIP[1];

describe('the call (meow) and the board: a gold ring to the next goal, a picture from Pip, no text, no fail', () => {
  const ringAt = (r) => ({ x: r.life.base.ring.position.x, z: r.life.base.ring.position.z, vis: r.life.base.ring.visible });
  it('the meow lights a ring at the next goal: Pip asleep, then the Ridge cell, then the Core when she carries one; it fades and is gone', () => {
    const r = rig();
    r.step(0.1);
    bus.emit('tip:did', { id: 'call' });
    r.step(0.5);
    let g = ringAt(r);
    expect(g.vis).toBe(true);
    expect(Math.hypot(g.x - P.PIP_SLEEP.x, g.z - P.PIP_SLEEP.z)).toBeLessThan(1);
    r.step(RING.secs + 1);
    expect(ringAt(r).vis).toBe(false);
    r.progression.state.moon = { ...r.progression.state.moon, step: 1 };
    r.life.base.pip.setAwake();
    bus.emit('tip:did', { id: 'call' });
    r.step(0.5);
    g = ringAt(r);
    expect(Math.hypot(g.x - P.RIDGE_CELL.x, g.z - P.RIDGE_CELL.z)).toBeLessThan(0.1);
    // carrying: the Core
    r.step(RING.secs + 1);
    r.at(top.x, top.z, gy(top.x, top.z) + top.y);
    r.prompt(); r.life.interact();
    bus.emit('tip:did', { id: 'call' });
    r.step(0.5);
    g = ringAt(r);
    expect(Math.hypot(g.x - P.CORE.x, g.z - P.CORE.z)).toBeLessThan(0.1);
    r.dispose();
  });
  it('another tip (not the call) does nothing; a call after the walk is over (disposed) does nothing', () => {
    const r = rig();
    bus.emit('tip:did', { id: 'jump' });
    r.step(0.5);
    expect(ringAt(r).vis).toBe(false);
    r.dispose();
    expect(() => bus.emit('tip:did', { id: 'call' })).not.toThrow();
  });
  it('the board: a prompt in front of it; E reads the next goal aloud and shows the ring', () => {
    const r = rig();
    r.at(P.BOARD.x + 1.6, P.BOARD.z);
    expect(r.prompt()).toBe(phrase('moon.board.prompt'));
    expect(r.life.interact()).toBe('board');
    expect(lines(r.events)).toContain(phrase('moon.goal.pip'));
    r.step(0.3);
    expect(ringAt(r).vis).toBe(true);
    r.dispose();
  });
  it('the whole toast set is whole sentences the start-up toast leaves alone (the greenhouse note type), none empty', () => {
    const r = rig();
    r.at(P.BOARD.x + 1.6, P.BOARD.z);
    r.prompt(); r.life.interact();
    r.step(5);
    for (const e of r.events) {
      expect(e.type).toBe('greenhousenote');
      expect(e.points).toBe(0);
      expect(discoveryText(e)).toBe(e.label);
      expect(e.label).toMatch(/\S/);
    }
    r.dispose();
  });
});

describe('co-walk credit (a step done by anyone in the room counts here)', () => {
  it('a partner\'s wake wakes Pip here and saves; a partner\'s plug puts the cell in its socket and clears the one she carried', () => {
    const r = rig();
    expect(r.life.credit({ kind: 'wake' })).toBe('wake');
    expect(r.progression.state.moon.step).toBe(1);
    expect(r.life.base.pip.state).toBe('waking');
    r.life.base.pip.setAwake();
    r.at(top.x, top.z, gy(top.x, top.z) + top.y);
    r.prompt(); r.life.interact();
    expect(r.life.base.state.carrying).toBe(0);
    expect(r.life.credit({ kind: 'plug', cell: 0 })).toBe('plug');
    expect(r.life.base.state.carrying).toBe(null);
    expect(r.life.base.state.cellMode[0]).toBe('plugged');
    expect(r.life.credit({ kind: 'plug', cell: 1 })).toBe('both');
    r.step(0.2);
    expect(r.life.base.state.beat).toBe(true);
    r.step(BEAT.total + 0.5);
    expect(r.progression.state.moon.step).toBe(4);
    r.dispose();
  });
  it('a hostile or repeated event changes nothing and says nothing', () => {
    const r = rig();
    const n = r.events.length;
    for (const ev of [null, { kind: 'beat' }, { kind: 'plug', cell: 7 }, { kind: 'plug', cell: 0 }, { kind: 'x' }]) expect(r.life.credit(ev), JSON.stringify(ev)).toBe(null);
    expect(r.progression.state.moon).toMatchObject({ step: 0, cells: 0 });
    expect(r.events.length).toBe(n);
    r.dispose();
  });
});

describe('the finds', () => {
  it('the First Flag, the Old Dish and the Star Garden: found by standing still, 12 paws each the first time ever, one journal count a walk, nothing paid again', () => {
    const r = rig();
    const f = P.FLAG;
    r.step(0.5, { x: f.x - 1.4, z: f.z, y: 0 });
    expect(r.progression.state.journal.mnflag ?? 0).toBe(0); // not still yet
    r.step(1.2);
    expect(r.progression.state.journal.mnflag).toBe(1);
    expect(r.events.filter((e) => e.type === 'moonfind' && e.points === 12)).toHaveLength(1);
    const shown = r.events.find((e) => e.type === 'moonfind');
    expect(discoveryText(shown)).toBe(`You spotted ${phrase('moon.find.flag')}`);
    r.step(3);
    expect(r.progression.state.journal.mnflag).toBe(1); // once a walk
    const d = P.OLD_DISH;
    r.step(2, { x: d.x + 1.5, z: d.z, y: 0 });
    expect(r.progression.state.journal.mndish).toBe(1);
    const pl = P.PLANTERS[2];
    r.step(2, { x: pl.x + 1.2, z: pl.z, y: 0 });
    expect(r.progression.state.journal.mngarden).toBe(1);
    expect(r.events.filter((e) => e.type === 'moonfind' && e.points === 12)).toHaveLength(3); // each find pays 12 the first time ever (the Lighthouse's rule)
    // a later walk: the page counts again, nothing is paid
    const r2 = rig({ progression: r.progression });
    const before = r.progression.state.points;
    r2.step(2, { x: f.x - 1.4, z: f.z, y: 0 });
    expect(r2.progression.state.journal.mnflag).toBe(2);
    expect(r2.progression.state.points).toBe(before);
    r.dispose(); r2.dispose();
  });
  it('walking past is not a find: the spot is passed at speed', () => {
    const r = rig();
    for (let i = 0; i < 60; i++) r.step(1 / 30, { x: P.FLAG.x - 3 + i * 0.1, z: P.FLAG.z, y: 0 });
    expect(r.progression.state.journal.mnflag ?? 0).toBe(0);
    r.dispose();
  });
});

describe('reduced motion and the end of the walk', () => {
  it('reduced motion: no hop, no bob, no spin, no pulse on Pip or the cells; he still comes and goes and the lantern still comes up', () => {
    const r = rig({ reducedMotion: true });
    r.at(P.PIP_SLEEP.x - 1.2, P.PIP_SLEEP.z + 1);
    r.prompt(); r.life.interact();
    const lifts = [];
    for (let i = 0; i < 40; i++) { r.step(1 / 30); lifts.push(r.life.base.pip.group.children[0].position.y); }
    expect(Math.max(...lifts)).toBe(0);
    r.step(1.5);
    expect(r.life.base.pip.lantern).toBeGreaterThan(0.8);
    expect(r.life.base.cells[0].getObjectByName('spin').rotation.y).toBe(0);
    r.dispose();
  });
  it('motion allowed: the wake hops him up', () => {
    const r = rig();
    r.at(P.PIP_SLEEP.x - 1.2, P.PIP_SLEEP.z + 1);
    r.prompt(); r.life.interact();
    let max = 0;
    for (let i = 0; i < 40; i++) { r.step(1 / 30); max = Math.max(max, r.life.base.pip.group.children[0].position.y); }
    expect(max).toBeGreaterThan(0.05);
    r.dispose();
  });
  it('dispose takes every mesh the base made out of the scene, restores the doors, and a second dispose is harmless', () => {
    const r = rig();
    const before = r.scene.children.length;
    r.step(0.2);
    r.life.dispose();
    r.life.dispose();
    for (const n of ['pip', 'moon:cell0', 'moon:cell1', 'moon:goalring', 'moon:goalshaft', 'pip:bubble']) expect(r.scene.getObjectByName(n), n).toBeUndefined();
    expect(r.scene.children.length).toBeLessThan(before);
    expect(r.scene.getObjectByName('moon:doorL').position.z).toBe(0);
    r.off();
  });
  it('a hostile save (a step far beyond, cells out of range) builds and runs a walk', () => {
    const a = rig();
    a.progression.state.moon = { step: 9, cells: 7, stamp: -1, scope: 0, jump: {} };
    const r = rig({ progression: a.progression });
    r.step(2, { x: 0, z: 45, y: 0 });
    expect(r.life.base.state.power).toBe(1);
    a.dispose(); r.dispose();
  });
  it('with a document (the board\'s picture and Pip\'s bubble are drawn) and with a call, the whole thing runs', () => {
    vi.stubGlobal('document', { ...canvasDocument(), getElementById: () => null });
    const r = rig();
    r.step(0.5);
    bus.emit('tip:did', { id: 'call' });
    r.step(1);
    expect(r.scene.getObjectByName('pip:bubble').visible).toBe(true);
    r.dispose();
  });
  it('REACH is what the plan says (so a prompt never appears across a wall)', () => {
    expect(REACH.core).toBeLessThan(3.6);
    expect(REACH.pip).toBeLessThan(3);
  });
  it('the mission machine is the only writer of step and cells: the life never writes anything else onto the moon record', () => {
    const r = rig();
    r.progression.state.moon = { step: 0, cells: 0, stamp: 1, scope: 5, jump: { a: 20 } };
    r.life.credit({ kind: 'wake' });
    expect(r.progression.state.moon).toMatchObject({ step: 1, cells: 0, stamp: 1, scope: 5, jump: { a: 20 } });
    expect(M.normalize(r.progression.state.moon).step).toBe(1);
    r.dispose();
  });
});
