// The hints on a walk (src/game/tips.js): the facts, the bus, the real clock.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createTips, walkFacts, HINT_PICS } from '../src/game/tips.js';
import { HINT_IDS } from '../src/hints.js';
import { createProgression } from '../src/progression.js';
import { bus } from '../src/events.js';

function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
const at = (x, z) => ({ group: { position: { x, y: 0, z } } });
function walk(over = {}) {
  return {
    areaId: 'neighborhood', cat: { position: { x: 0, y: 0, z: 0 } },
    areaData: { perches: [], boxes: [] }, critters: { list: [] }, strayCats: { strays: [] },
    toy: { active: false }, batCount: 0, boxTime: 0, idleTime: 0, prompt: null, perched: null, cameraMode: false,
    carry: { mouth: { held: null } }, quest: null, questGiver: null, clanFight: { uiShowing: null }, net: undefined,
    ...over,
  };
}
function rig({ tips = true, walks = 1, touch = true } = {}) {
  let clock = 0;
  let yaw = 0;
  const lines = [];
  const hud = { setHint: (text, pic) => lines.push(text ? { text, pic } : null) };
  const player = { viewYaw: () => yaw, forward: () => ({ x: 0, y: 0, z: -1 }), stalking: false, speed: 0, inWater: false, swimming: false, perchY: 0 };
  const progression = createProgression(memStorage({ 'whisker-walk-save': JSON.stringify({ version: 4, walks: { neighborhood: walks } }) }));
  const settings = { get: (k) => (k === 'showTips' ? tips : undefined) };
  const t = createTips({ player, progression, settings, hud, getIsTouch: () => touch, now: () => clock });
  // one played frame, `ms` of real time later
  const frame = (session, ms = 16) => { clock += ms; t.update(session, 0.016); };
  const play = (session, seconds, ms = 250) => { for (let i = 0; i < (seconds * 1000) / ms; i++) frame(session, ms); };
  return { t, hud, player, progression, lines, frame, play, up: () => lines.at(-1) ?? null, turn: (r) => { yaw += r; } };
}
const live = [];
const start = (r, s) => { r.t.begin(s); live.push(r); return s; };
afterEach(() => { while (live.length) live.pop().t.end(); });

describe('walkFacts', () => {
  const player = { forward: () => ({ x: 0, y: 0, z: -1 }), stalking: false, speed: 0, inWater: false, swimming: false, perchY: 0 };
  const state = createProgression(memStorage()).state;
  const facts = (over, p = player) => walkFacts(walk(over), { player: p, state });

  it('a quiet walk has nothing to say', () => {
    const f = facts({});
    expect(f).toMatchObject({ room: false, stalking: false, perched: false, camera: false, inWater: false, carrying: false, toy: false, inBox: false, canJump: false, critterNear: false, strayFar: false, nearBox: false, helpInView: false, challenge: false, idleOpen: 0 });
  });

  it('an animal close and ahead is "near"; one behind or far is not', () => {
    const bird = (x, z, extra = {}) => ({ type: 'bird', ...at(x, z), ...extra });
    expect(facts({ critters: { list: [bird(1, -6)] } }).critterNear).toBe(true);
    expect(facts({ critters: { list: [bird(0, 6)] } }).critterNear).toBe(false); // behind the view
    expect(facts({ critters: { list: [bird(0, -20)] } }).critterNear).toBe(false);
    expect(facts({ critters: { list: [bird(1, -6, { hidden: true })] } }).critterNear).toBe(false);
    expect(facts({ critters: { list: [{ type: 'villager', ...at(1, -6) }] } }).critterNear).toBe(false);
  });

  it('a stray 10 to 18 metres off counts only when none is in reach', () => {
    expect(facts({ strayCats: { strays: [at(0, -14)] } }).strayFar).toBe(true);
    expect(facts({ strayCats: { strays: [at(0, -14), at(2, 0)] } }).strayFar).toBe(false);
    expect(facts({ strayCats: { strays: [at(0, -30)] } }).strayFar).toBe(false);
  });

  it('a box within two metres; standing still in the open; the rest', () => {
    expect(facts({ areaData: { perches: [], boxes: [{ x: 1.5, z: 0 }] } }).nearBox).toBe(true);
    expect(facts({ areaData: { perches: [], boxes: [{ x: 3, z: 0 }] } }).nearBox).toBe(false);
    expect(facts({ idleTime: 6 }).idleOpen).toBe(6);
    expect(facts({ idleTime: 6, prompt: { kind: 'stray' } }).idleOpen).toBe(0); // next to something: not "in the open"
    expect(facts({ boxTime: 1 }).inBox).toBe(true);
    expect(facts({ toy: { active: true }, batCount: 2 })).toMatchObject({ toy: true, bats: 2 });
    expect(facts({ cameraMode: true }).camera).toBe(true);
    expect(facts({ carry: { mouth: { held: { kind: 'stick' } } } }).carrying).toBe(true);
    expect(facts({}, { ...player, inWater: true }).inWater).toBe(true);
    expect(facts({ net: {}, remotes: { list: [{}] } }).room).toBe(true);
    expect(facts({ net: {}, remotes: { list: [] } }).room).toBe(false); // alone in a room: nobody to chat to
  });
});

describe('createTips', () => {
  it('every hint has a picture', () => {
    for (const id of HINT_IDS) expect(typeof HINT_PICS[id]).toBe('string');
  });

  it('a thing that happens goes up as its line, in the touch or the keyboard form, and is counted on the save', () => {
    const r = rig({ touch: true });
    start(r, walk());
    bus.emit('tip', { id: 'creep', name: 'Pepper' });
    expect(r.up()).toEqual({ text: 'Pepper is shy. Push the circle gently to creep.', pic: '🐾' });
    expect(r.progression.state.tutorial.hints).toEqual({ creep: 1 });
    const k = rig({ touch: false });
    r.t.end();
    start(k, walk());
    bus.emit('tip', { id: 'creep', name: 'Pepper' });
    expect(k.up().text).toBe('Pepper is shy. Hold Shift to creep.');
  });

  it('the twelve seconds and the minute are real time, however slowly the walk runs', () => {
    const r = rig({ walks: 0 }); // walk one: no "walk two" hint takes the slot
    const s = start(r, walk());
    bus.emit('tip', { id: 'dog' });
    r.play(s, 11); // 11 real seconds in 44 slow frames
    expect(r.up()).not.toBe(null);
    r.play(s, 1.5);
    expect(r.up()).toBe(null);
    bus.emit('tip', { id: 'hiss', name: 'Pepper' }); // inside the minute: not shown, not counted
    expect(r.up()).toBe(null);
    expect(r.progression.state.tutorial.hints.hiss).toBeUndefined();
    r.play(s, 48);
    bus.emit('tip', { id: 'hiss', name: 'Pepper' });
    expect(r.up().text).toBe('Pepper is cross today. Try again next time.');
  });

  it('a pause is not play: the card being up does not use up a hint\'s time', () => {
    const r = rig();
    const s = start(r, walk());
    bus.emit('tip', { id: 'dog' });
    r.frame(s, 120000); // two minutes behind the pause card, then one frame
    expect(r.up()).not.toBe(null);
  });

  it('"Show tips" off shows none and counts none', () => {
    const r = rig({ tips: false });
    const s = start(r, walk({ boxTime: 0, areaData: { perches: [], boxes: [{ x: 1, z: 0 }] } }));
    bus.emit('tip', { id: 'dog' });
    r.play(s, 5);
    expect(r.lines.filter(Boolean)).toEqual([]);
    expect(r.progression.state.tutorial.hints).toEqual({});
  });

  it('turning the view once means the look hint is never needed', () => {
    const r = rig({ walks: 1 });
    const s = start(r, walk());
    r.frame(s);
    r.turn(0.9);
    r.frame(s);
    expect(r.progression.state.tutorial.hints.look).toBe(3);
    r.play(s, 30);
    expect(r.lines.filter(Boolean)).toEqual([]);
  });

  it('walk two, 15 seconds in, never turned the view: the look hint', () => {
    const r = rig({ walks: 1 });
    const s = start(r, walk());
    r.play(s, 14);
    expect(r.up()).toBe(null);
    r.play(s, 1.5);
    expect(r.up().text).toBe('Drag here to look around.');
  });

  it('the den has no hints, and a walk that ends leaves nothing on screen', () => {
    const r = rig();
    start(r, walk({ areaId: 'den' }));
    bus.emit('tip', { id: 'dog' });
    expect(r.lines.filter(Boolean)).toEqual([]);
    const s = walk();
    r.t.begin(s);
    expect(typeof s.hints.setBlocked).toBe('function'); // the guided walk's handle
    bus.emit('tip', { id: 'dog' });
    r.t.end();
    expect(r.up()).toBe(null);
    bus.emit('tip', { id: 'hiss', name: 'x' }); // no walk: ignored
    expect(r.up()).toBe(null);
  });
});
