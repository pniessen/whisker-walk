// Guidance in plain words: Snowville's candle hints, the Reef's lantern coral order (next colour named, ring in its colour, a nudge out of order),
// the Sealab's hatch hint after the first shell, and the Greenhouse's arrival line and thirsty-pot hint. Each is said once a walk, never saved, in both word sets.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { bus } from '../src/events.js';
import * as M from '../src/reefmission.js';
import * as P from '../src/world/reefplan.js';
import * as W from '../src/world/reefwing.js';
import * as S from '../src/world/reefstory.js';
import * as SS from '../src/world/snowvillestory.js';
import { createMarlo } from '../src/world/reefmarlo.js';
import { createHousewarming } from '../src/world/reefhouse.js';
import { goalWords } from '../src/world/reefguide.js';
import { createTilly } from '../src/world/snowvillelife.js';
import { snowY } from '../src/world/snowvilleplan.js';
import { createProgression } from '../src/progression.js';
import { phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { memoryStorage } from './helpers/storage.js';
import '../src/world/reefwords.js';
import '../src/world/snowvillewords.js';

stubCanvasDocument();
const { build } = await import('../src/world/greenhouse.js');
const GP = await import('../src/world/greenhouseplan.js');
await import('../src/world/greenhousewords.js');

let heard;
let off;
beforeEach(() => { heard = []; off = bus.on('discovery', (e) => heard.push(e)); });
afterEach(() => { off(); });
const keys = () => heard.map((e) => e.key);
const sess = () => ({ cat: { rotation: { y: 0 } } });

describe('Snowville: the candle in plain words', () => {
  const at = (x, z) => ({ x, z, y: snowY(x, z) });
  const rig = () => {
    const progression = createProgression(memoryStorage());
    progression.state.snowville = { ...progression.state.snowville, step: 1 };
    progression.addPoints(0);
    return { progression, tilly: createTilly({ scene: new THREE.Scene(), progression, reducedMotion: false, send: () => {} }) };
  };
  const tick = (r, cat, n, dt = 0.5) => { for (let i = 0; i < n; i++) r.tilly.update(dt, i * dt, cat, null, sess()); };
  it('says what the spark is after a few seconds, and only once', () => {
    const r = rig();
    tick(r, at(0, 30), 20);
    expect(keys().filter((k) => k === 'snowville-hint-spark0')).toHaveLength(1);
    expect(phrase('snowville.hint.spark')).toMatch(/spark/);
    r.tilly.dispose();
  });
  it('says to carry it, and to press the button at the lantern, once each', () => {
    const r = rig();
    const c = SS.CANDLES[0];
    tick(r, at(c.x + 0.8, c.z), 1);
    r.tilly.promptAt(at(c.x + 0.8, c.z));
    expect(r.tilly.interact()).toBe('pick');
    tick(r, at(0, 30), 20);
    expect(keys().filter((k) => k === 'snowville-hint-carry0')).toHaveLength(1);
    const l = SS.allLanterns()[0];
    tick(r, at(l.x + 1, l.z), 4);
    expect(keys().filter((k) => k === 'snowville-hint-near0')).toHaveLength(1);
    tick(r, at(l.x + 1, l.z), 10);
    expect(keys().filter((k) => k === 'snowville-hint-near0')).toHaveLength(1);
    r.tilly.dispose();
  });
});

describe('Reef: lantern corals by colour', () => {
  const at = (x, z) => ({ x, z, y: P.reefY(x, z) });
  const rig = () => {
    const progression = createProgression(memoryStorage());
    progression.state.reef = { ...progression.state.reef, step: M.STEP.tried };
    progression.addPoints(0);
    const scene = new THREE.Scene();
    const mar = createMarlo({ scene, progression, reducedMotion: false, pocket: () => true });
    const house = createHousewarming({ scene, marlo: mar, progression, log: null, reducedMotion: false, send: () => {} });
    return { progression, scene, mar, house };
  };
  const tick = (r, cat, n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) { r.mar.update(dt, i * dt, cat, null, sess(), 0); r.house.update(dt, i * dt, cat, null, sess()); } };
  it('the banner names the next colour, in both word sets', () => {
    const line = (n) => goalWords({ goal: { g: { kind: 'lantern', lantern: n }, x: 0, z: 0 } });
    expect(line(0)).toMatch(/pink coral first \(0 of 3\)/);
    expect(line(1)).toMatch(/gold.*\(1 of 3\)/);
    expect(line(2)).toMatch(/blue.*\(2 of 3\)/);
    withOffWords(() => { for (const n of [0, 1, 2]) expect(bannedIn(line(n))).toBeNull(); });
  });
  it('the goal ring takes the next coral\'s own colour', () => {
    const r = rig();
    tick(r, at(P.REEF_SPAWN.x, P.REEF_SPAWN.z), 2);
    bus.emit('tip:did', { id: 'call' });
    tick(r, at(P.REEF_SPAWN.x, P.REEF_SPAWN.z), 3);
    const ring = r.scene.getObjectByName('reef:meowRing');
    expect(ring.material.color.getHex()).toBe(W.LANTERN_COLORS[0]);
    const l = W.LANTERNS[0];
    tick(r, at(l.x + 1.2, l.z), 3);
    bus.emit('tip:did', { id: 'call' });
    tick(r, at(P.REEF_SPAWN.x, P.REEF_SPAWN.z), 3);
    expect(ring.material.color.getHex()).toBe(W.LANTERN_COLORS[1]);
  });
  it('touching a later coral first only nudges: a line, a flicker, nothing lost', () => {
    const r = rig();
    const l2 = W.LANTERNS[2];
    tick(r, at(l2.x + 1.2, l2.z), 4);
    expect(keys()).toContain('reef-lantern-try0');
    expect(r.mar.lit).toBe(0);
    expect(M.normalize(r.progression.state.reef).step).toBe(M.STEP.tried);
    tick(r, at(l2.x + 1.2, l2.z), 200); // standing there says it again only after a while
    expect(keys().filter((k) => k === 'reef-lantern-try0').length).toBeLessThanOrEqual(2);
    const l0 = W.LANTERNS[0];
    tick(r, at(l0.x + 1.2, l0.z), 3);
    expect(r.mar.lit).toBe(1);
  });
  it('the Sealab hatch is pointed out once, after the first shell is given', () => {
    const progression = createProgression(memoryStorage());
    progression.state.reef = { ...progression.state.reef, step: M.STEP.met };
    progression.addPoints(0);
    const mar = createMarlo({ scene: new THREE.Scene(), progression, reducedMotion: false, pocket: () => true });
    const s = S.STORY_SHELLS[0];
    const cat = (x, z) => ({ x, z, y: P.reefY(x, z) });
    const up = (c, n) => { for (let i = 0; i < n; i++) mar.update(0.1, i * 0.1, c, null, sess(), 0); };
    up(cat(s.x + 0.7, s.z), 1); mar.promptAt(cat(s.x + 0.7, s.z), 0); expect(mar.interact()).toBe('pick');
    const m = cat(mar.marlo.x + 1.2, mar.marlo.z);
    up(m, 40); mar.promptAt(m, 0); expect(mar.interact()).toBe('give');
    expect(keys()).not.toContain('reef-hatch-hint');
    up(m, 100);
    expect(keys().filter((k) => k === 'reef-hatch-hint')).toHaveLength(1);
    expect(phrase('reef.hatch.hint')).toMatch(/Sunken Boat/);
  });
});

describe('Greenhouse: the jobs and the cloud, in words', () => {
  const make = () => { const scene = new THREE.Scene(); const area = build(scene); return { scene, life: area.life({ reducedMotion: false, visits: 0 }) }; };
  const tick = (life, pos, n = 1) => { for (let i = 0; i < n; i++) life.update(0.05, i * 0.05, pos, null, sess()); };
  it('arriving away from the bench says both jobs once', () => {
    const { life } = make();
    tick(life, { x: GP.POTTING.x + 40, y: 0, z: GP.POTTING.z + 40 }, 5);
    expect(keys().filter((k) => k === 'greenhouse-arrive')).toHaveLength(1);
    const line = phrase('greenhouse.arrive');
    expect(line).toMatch(/seed packets/);
    expect(line).toMatch(/thirsty/);
    life.dispose?.();
  });
  it('the thirst cloud carries a blue drop', async () => {
    const { thirstCloud } = await import('../src/world/greenhouseparts.js');
    const cols = thirstCloud().geometry.attributes.color;
    let blue = 0;
    for (let i = 0; i < cols.count; i++) if (cols.getZ(i) > cols.getX(i) + 0.2) blue++;
    expect(blue).toBeGreaterThan(0);
  });
  it('picking up the can says what a cloud means; both word sets, no series word', () => {
    expect(phrase('greenhouse.can.hint')).toBe('A cloud means a thirsty pot. Carry the can to it.');
    withOffWords(() => { for (const k of ['greenhouse.can.hint', 'greenhouse.arrive', 'snowville.hint.spark', 'snowville.hint.carry', 'snowville.hint.near', 'reef.hatch.hint', 'reef.lantern.try.0', 'reef.guide.lantern.1']) expect(bannedIn(phrase(k))).toBeNull(); });
  });
});
