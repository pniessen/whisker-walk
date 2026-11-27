// The Jungle village, milestone T2: Mossy and chapter one. The pure step machine (steps 0 to 2 and the ladder beyond), the sanitiser/merge/table pins, the story's places
// (clear of every collider, inside the walk, the table up on the veranda), Mossy's turn, and the real life on a bare THREE.Scene: meet, pick up, carry (never saved), post the
// fruit from the deck, the meow's ring, the partner's credit and the `jl-` wire, reduced motion, the one-light rule and both word sets.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as M from '../src/world/junglemission.js';
import * as S from '../src/world/junglestory.js';
import * as P from '../src/world/jungleplan.js';
import { createMossy, createJunglePrompts, mossyGeometry } from '../src/world/junglelife.js';
import { build } from '../src/world/jungle.js';
import { NAMES, LINES } from '../src/world/junglewords.js';
import { createProgression, sanitizeSave, CATALOG } from '../src/progression.js';
import { mergeSaves, useSaveTools } from '../src/catmerge.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';
import { bus } from '../src/events.js';
import { phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { memoryStorage } from './helpers/storage.js';

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const sess = () => ({ cat: { rotation: { y: 0 } } });
const at = (x, z, y = 0) => ({ x, z, y });

describe('the step machine', () => {
  it('starts unmet; meeting is step 1; the first mango at the table is step 2 with fruit bit 0', () => {
    expect(M.normalize(null)).toEqual({ step: 0, fruit: 0 });
    const a = M.apply({ step: 0, fruit: 0 }, { kind: 'meet' });
    expect(a).toMatchObject({ changed: true, effect: 'met', jungle: { step: 1, fruit: 0 } });
    const b = M.apply(a.jungle, { kind: 'deliver', fruit: 0 });
    expect(b).toMatchObject({ changed: true, effect: 'first', jungle: { step: 2, fruit: 1 } });
    expect(M.chapterOneDone(b.jungle)).toBe(true);
  });
  it('a fruit before Mossy is met, out of order, twice, or a made-up event changes nothing; the other save keys come back as they were', () => {
    const rec = { step: 0, fruit: 0, album: 5 };
    expect(M.apply(rec, { kind: 'deliver', fruit: 0 }).changed).toBe(false);
    expect(M.apply({ step: 1, fruit: 0 }, { kind: 'deliver', fruit: 1 }).changed).toBe(false);
    expect(M.apply({ step: 2, fruit: 1 }, { kind: 'deliver', fruit: 0 }).changed).toBe(false);
    expect(M.apply({ step: 2, fruit: 1 }, { kind: 'meet' }).changed).toBe(false);
    for (const ev of [null, 3, 'meet', {}, { kind: 'fail' }, { kind: 'deliver', fruit: 7 }, { kind: '__proto__' }]) expect(M.apply(rec, ev).changed).toBe(false);
    expect(M.apply(rec, { kind: 'meet' }).jungle.album).toBe(5);
  });
  it('never lowers a step, never raises one past 7, and repairs hostile input (idempotent)', () => {
    for (const bad of [undefined, null, 7, 'x', [], { step: -3 }, { step: 99, fruit: 99 }, { step: 1.5 }, { step: NaN }, { fruit: 1 }, { fruit: 7 }]) {
      const n = M.normalize(bad);
      expect(n.step).toBeGreaterThanOrEqual(0);
      expect(n.step).toBeLessThanOrEqual(7);
      expect(M.normalize(n)).toEqual(n);
    }
    expect(M.normalize({ fruit: 1 }).step).toBe(2);
    expect(M.normalize({ fruit: 7 })).toEqual({ step: 4, fruit: 7 });
    expect(M.normalize({ step: 5 }).fruit).toBe(7);
  });
  it('credit takes the steps before it in order', () => {
    expect(M.credit({ step: 0, fruit: 0 }, { kind: 'deliver', fruit: 0 }).jungle).toMatchObject({ step: 2, fruit: 1 });
    expect(M.credit({ step: 2, fruit: 1 }, { kind: 'meet' }).changed).toBe(false);
  });
  it('the goal always answers, with a picture, and walks the whole chapter', () => {
    expect(M.nextGoal({ step: 0 })).toMatchObject({ kind: 'mossy', icon: 'fruit' });
    expect(M.nextGoal({ step: 1 })).toMatchObject({ kind: 'fruit', fruit: 0 });
    expect(M.nextGoal({ step: 1 }, 0)).toMatchObject({ kind: 'deliver', fruit: 0, icon: 'table' });
    expect(M.nextGoal({ step: 2, fruit: 1 })).toMatchObject({ kind: 'fruit', fruit: 1 });
    expect(M.nextGoal({ step: 7 }).kind).toBe('rest');
    expect(M.canPick({ step: 1 }, 0)).toBe(true);
    expect(M.canPick({ step: 1 }, 0, 0)).toBe(false);
    expect(M.canPick({ step: 0 }, 0)).toBe(false);
  });
  it('the wire form is read only for `jl-` events', () => {
    expect(M.toStep(M.wire({ kind: 'meet' }))).toEqual({ kind: 'meet' });
    expect(M.toStep(M.wire({ kind: 'deliver', fruit: 1 }))).toEqual({ kind: 'deliver', fruit: 1 });
    for (const ev of [null, {}, { kind: 'sv-meet' }, { kind: 'sv-light', candle: 0 }, { kind: 'th-deliver', letter: 0 }, { kind: 'jl-deliver', fruit: 9 }, { kind: 'jl-nope' }, { kind: 3 }]) expect(M.toStep(ev)).toBe(null);
  });
});

describe('the save', () => {
  it('the sanitiser table matches the mission table and fills the fruit a step implies', () => {
    for (let s = 0; s <= 7; s++) expect(sanitizeSave({ version: 4, jungle: { step: s } }).jungle).toEqual({ step: s, fruit: M.FRUIT_AT[s], album: 0 });
    expect(sanitizeSave({ version: 4, jungle: { step: 1, fruit: 99, album: 99999 } }).jungle).toEqual({ step: 1, fruit: 7, album: 4095 });
  });
  it('the merge keeps the further step and the union of the fruit bits', () => {
    const L = { jungle: { step: 3, fruit: 3, album: 1 } };
    const C = { jungle: { step: 2, fruit: 1, album: 2 } };
    expect(mergeSaves({ local: { version: 4, ...L }, cloud: { version: 4, ...C } }).save.jungle).toEqual({ step: 3, fruit: 3, album: 3 });
  });
  it('the sanitiser\'s fruit table is the mission\'s', () => {
    expect(read('src/progression.js')).toContain(`const JUNGLE_FRUIT_AT = [${M.FRUIT_AT.join(', ')}]`);
  });
});

describe('the places', () => {
  const colliders = P.jungleColliders();
  const solid = (p, pad) => colliders.every((c) => Math.hypot(p.x - c.x, p.z - c.z) > c.r + pad);
  it('Mossy, the mango and the table stand inside the walk, clear of every other collider; the table is up on the veranda, the mango is a carry from the grove', () => {
    expect(solid(S.FRUITS[0], 0.3)).toBe(true);
    const others = (p, skip) => colliders.filter((c) => !skip.some((k) => k.x === c.x && k.z === c.z));
    for (const [p, own, pad] of [[S.MOSSY.start, P.MOSSY_SPOT, 0.9], [S.TABLE, P.KITCHEN_TABLE, 1.0], [S.FRUITS[0], null, 0.3]]) {
      expect(p.x).toBeGreaterThan(P.JUNGLE_BOUNDS.minX + 2);
      expect(p.x).toBeLessThan(P.JUNGLE_BOUNDS.maxX - 2);
      for (const c of others(p, own ? [own] : [])) expect(Math.hypot(p.x - c.x, p.z - c.z), JSON.stringify(p)).toBeGreaterThan(c.r + pad - (own === P.KITCHEN_TABLE && c.r === P.MOSSY_SPOT.r ? 0.4 : 0));
    }
    expect(S.TABLE.y).toBeCloseTo(P.jungleY(S.TABLE.x, S.TABLE.z), 6); // the table stands on the deck
    expect(P.VERANDA.x0 < S.TABLE.x && S.TABLE.x < P.VERANDA.x1 && P.VERANDA.z0 < S.TABLE.z && S.TABLE.z < P.VERANDA.z1).toBe(true);
    expect(P.sheltered(S.TABLE.x, S.TABLE.z)).toBe(true);
    expect(Math.hypot(S.TABLE.x - S.FRUITS[0].x, S.TABLE.z - S.FRUITS[0].z)).toBeGreaterThan(S.TABLE.reach + S.FRUITS[0].reach); // a carry, not a step
    for (const q of S.TABLE.slots) expect(Math.hypot(q.x - S.TABLE.x, q.z - S.TABLE.z)).toBeLessThan(0.6);
    expect(P.jungleY(S.FRUITS[0].x, S.FRUITS[0].z)).toBeLessThan(0.3);
  });
  it('the mango tree is solid and the mango lies in the grove, a short walk from the spawn: Mossy, the tree, the table', () => {
    const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    expect(d(P.MANGO_TREE, P.GROVE)).toBeLessThan(P.GROVE.r);
    expect(d(S.FRUITS[0], P.GROVE)).toBeLessThan(P.GROVE.r);
    expect(colliders.some((c) => c === P.MANGO_TREE || (c.x === P.MANGO_TREE.x && c.z === P.MANGO_TREE.z))).toBe(true);
    expect(d(P.JUNGLE_SPAWN, S.MOSSY.start) + d(S.MOSSY.start, S.FRUITS[0]) + d(S.FRUITS[0], S.TABLE)).toBeLessThan(110);
  });
  it('Mossy stays where she is and turns by the short way to face a cat near her; far away or a bad dt does nothing', () => {
    const m = { x: 0, z: 0, yaw: 0, moving: false };
    S.mossyStep(m, { x: 0, z: 30 }, 0.1);
    S.mossyStep(m, { x: 5, z: 0 }, NaN);
    S.mossyStep(m, null, 0.1);
    expect(m.yaw).toBe(0);
    for (let i = 0; i < 60; i++) S.mossyStep(m, { x: 5, z: 0 }, 0.1);
    expect(m.yaw).toBeCloseTo(Math.PI / 2, 5);
    expect([m.x, m.z, m.moving]).toEqual([0, 0, false]);
    const w = { x: 0, z: 0, yaw: 3.0, moving: false };
    for (let i = 0; i < 60; i++) S.mossyStep(w, { x: 0, z: -5 }, 0.1); // behind her: the short way round
    expect(Math.abs(Math.abs(w.yaw) - Math.PI)).toBeLessThan(0.01);
  });
});

function rig({ rec = null, reducedMotion = false, tier = null, send = null } = {}) {
  const storage = memoryStorage();
  const progression = createProgression(storage);
  if (rec) { progression.state.jungle = { ...progression.state.jungle, ...rec }; progression.addPoints(0); }
  const scene = new THREE.Scene();
  const sent = [];
  const mossy = createMossy({ scene, progression, reducedMotion, tier, send: send ?? ((ev) => sent.push(ev)) });
  return { storage, progression, scene, mossy, sent };
}
const tick = (r, cat, n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) r.mossy.update(dt, i * dt, cat, null, sess()); };
const press = (r, cat) => { tick(r, cat, 1); const l = r.mossy.promptAt(cat); return l ? { line: l, k: r.mossy.interact() } : { line: null, k: null }; };
const nearMossy = (r) => at(r.mossy.mossy.x - 1.6, r.mossy.mossy.z);
const onDeck = () => at(S.TABLE.x + 1.2, S.TABLE.z + 0.8, S.TABLE.y);
const fruit0 = () => at(S.FRUITS[0].x + 0.8, S.FRUITS[0].z, 0);

describe('Mossy on a walk (the real life, no WebGL)', () => {
  it('plays chapter one with the cat\'s feet only: hello, pick up the mango, carry it up, set it on the table from the deck', () => {
    const r = rig();
    const lines = [];
    const off = bus.on('discovery', (e) => lines.push(e.key));
    expect(press(r, at(-30, -30)).k).toBe(null);
    expect(press(r, nearMossy(r))).toMatchObject({ k: 'meet', line: phrase('jungle.mossy.prompt') });
    expect(r.progression.state.jungle.step).toBe(1);
    expect(r.mossy.goalNow().g).toMatchObject({ kind: 'fruit', fruit: 0 });
    expect(press(r, fruit0()).k).toBe('pick');
    expect(r.mossy.state.fruitModes[0]).toBe('carried');
    expect(r.progression.state.jungle.fruit).toBe(0); // a carried fruit is never saved
    expect(r.mossy.goalNow().g.kind).toBe('deliver');
    expect(press(r, fruit0()).k, 'with the fruit in her mouth there is nothing more to pick up').not.toBe('pick');
    expect(press(r, at(S.TABLE.x + 1.2, S.TABLE.z + 0.8, 0)).k, 'on the ground below the deck is not at the table').toBe(null);
    expect(press(r, onDeck()).k).toBe('give');
    expect(r.progression.state.jungle).toMatchObject({ step: 2, fruit: 1 });
    expect(r.mossy.state.fruitModes[0]).toBe('posted');
    expect(r.sent).toEqual([{ kind: 'jl-meet' }, { kind: 'jl-deliver', fruit: 0 }]);
    tick(r, onDeck(), 80);
    expect(r.mossy.state.lit).toBe(1);
    expect(r.mossy.halo.visible).toBe(true);
    expect(press(r, onDeck()).k).toBe(null); // chapter one is done: nothing more to press here until stage B
    for (const k of ['jungle-mossy-met', 'jungle-fruit-got', 'jungle-table-delivered']) expect(lines).toContain(k);
    off();
    r.mossy.dispose();
  });
  it('a fruit in her mouth is gone when the walk ends: the next walk finds it under the tree', () => {
    const r = rig({ rec: { step: 1 } });
    press(r, fruit0());
    expect(r.mossy.state.carrying).toBe(0);
    r.mossy.dispose();
    const again = createMossy({ scene: new THREE.Scene(), progression: r.progression, reducedMotion: false });
    expect(again.state.carrying).toBe(null);
    expect(again.state.fruitModes[0]).toBe('home');
    again.dispose();
  });
  it('the meow shows the next picture and a ring of sparkles; the glint hangs over the wanted fruit only', () => {
    const r = rig({ rec: { step: 1 } });
    tick(r, at(0, 30), 2);
    expect(r.mossy.goalNow()).toMatchObject({ x: S.FRUITS[0].x, z: S.FRUITS[0].z });
    const ring = r.scene.getObjectByName('jungle:meowRing');
    expect(ring.visible).toBe(false);
    bus.emit('tip:did', { id: 'call' });
    tick(r, at(0, 30), 2);
    expect(ring.visible).toBe(true);
    expect(r.mossy.bubble.icon).toBe('fruit');
    expect(r.scene.getObjectByName('jungle:fruit:glint').visible).toBe(true);
    tick(r, at(0, 30), 200);
    expect(ring.visible).toBe(false);
    r.progression.state.jungle = { step: 2, fruit: 1, album: 0 };
    tick(r, at(0, 30), 2);
    expect(r.scene.getObjectByName('jungle:fruit:glint').visible).toBe(false);
    r.mossy.dispose();
  });
  it('a partner\'s step is credited the same way (in order), a hostile one is nothing, and her own mouth is cleared if it was the one posted', () => {
    const r = rig();
    expect(r.mossy.credit({ kind: 'sv-light', candle: 0 })).toBe(null);
    expect(r.mossy.credit({ kind: 'jl-deliver', fruit: 5 })).toBe(null);
    expect(r.mossy.credit({ kind: 'jl-deliver', fruit: 0 })).toBe('first');
    expect(r.progression.state.jungle).toMatchObject({ step: 2, fruit: 1 });
    expect(r.sent).toEqual([]); // a credited step is not sent back
    expect(r.mossy.credit({ kind: 'jl-meet' })).toBe(null);
    const q = rig({ rec: { step: 1 } });
    press(q, fruit0());
    q.mossy.credit({ kind: 'jl-deliver', fruit: 0 });
    expect(q.mossy.state.carrying).toBe(null);
    r.mossy.dispose(); q.mossy.dispose();
  });
  it('Mossy breathes and turns; in reduced motion she holds still and the table lights at once', () => {
    const r = rig({ rec: { step: 1 } });
    const cat = at(2, 19);
    const sy = [];
    for (let i = 0; i < 60; i++) { r.mossy.update(0.05, i * 0.05, cat, null, sess()); sy.push(r.mossy.group.userData.body.scale.y); }
    expect(new Set(sy.map((v) => v.toFixed(4))).size).toBeGreaterThan(3);
    expect(r.mossy.mossy.yaw).not.toBe(Math.PI);
    const q = rig({ rec: { step: 1 }, reducedMotion: true });
    for (let i = 0; i < 60; i++) q.mossy.update(0.05, i * 0.05, cat, null, sess());
    expect(q.mossy.group.userData.body.scale.y).toBeCloseTo(1.3, 6);
    q.mossy.credit({ kind: 'jl-deliver', fruit: 0 });
    q.mossy.update(0.016, 0, cat, null, sess());
    expect(q.mossy.state.lit).toBe(1);
    r.mossy.dispose(); q.mossy.dispose();
  });
  it('a save at step 2 or more shows the table lit from the first frame, and Mossy never walks off', () => {
    const r = rig({ rec: { step: 2, fruit: 1 } });
    expect(r.mossy.state.lit).toBe(1);
    expect(r.mossy.state.fruitModes[0]).toBe('posted');
    r.mossy.dispose();
    const u = rig();
    const [x0, z0] = [u.mossy.mossy.x, u.mossy.mossy.z];
    tick(u, at(20, 20), 100);
    expect([u.mossy.mossy.x, u.mossy.mossy.z]).toEqual([x0, z0]);
    u.mossy.dispose();
  });
  it('is drawn cheaply: a handful of meshes, one merged body, no light of its own', () => {
    const r = rig();
    let lights = 0; let meshes = 0;
    r.scene.traverse((o) => { if (o.isLight) lights++; if (o.isMesh) meshes++; });
    expect(lights).toBe(0);
    expect(meshes).toBeLessThan(8);
    expect(mossyGeometry().attributes.position.count / 3).toBeLessThan(1500);
    r.mossy.dispose();
  });
  it('dispose takes everything out of the scene', () => {
    const r = rig();
    r.mossy.dispose();
    expect(r.scene.children).toHaveLength(0);
    r.mossy.dispose();
  });
});

describe('the place wires it in', () => {
  function placed(tier) {
    const scene = new THREE.Scene();
    const area = build(scene);
    const progression = createProgression(memoryStorage());
    const life = area.life({ scene, progression, reducedMotion: false, tier, sendEvent: () => {} });
    return { scene, life, progression };
  }
  it('the built area\'s life carries Mossy, one arbiter, a credit, and still exactly one PointLight in the whole place, the veranda lantern, untouched', () => {
    const { scene, life } = placed(null);
    expect(typeof life.promptAt).toBe('function');
    expect(typeof life.credit).toBe('function');
    expect(life.promptAt(nearMossy({ mossy: life.mossy }))).toBe(phrase('jungle.mossy.prompt'));
    expect(life.interact()).toBe('meet');
    expect(life.credit({ kind: 'jl-deliver', fruit: 0 })).toBe('first');
    for (let i = 0; i < 60; i++) life.update(0.05, i * 0.05, at(0, 25), null, sess());
    const lights = [];
    scene.traverse((o) => { if (o.isLight && o.isPointLight) lights.push(o); });
    expect(lights).toHaveLength(1);
    expect(lights[0].intensity).toBeGreaterThan(0.5);
    expect(Math.hypot(lights[0].position.x - P.LANTERN.x, lights[0].position.z - P.LANTERN.z)).toBeLessThan(1);
    life.dispose();
    expect(scene.getObjectByName('jungle:mossy')).toBeUndefined();
  });
  it('on the low rungs the table still glows (a sprite) and the place still has its one light', () => {
    const { scene, life } = placed({ name: 'low', shadows: false });
    life.credit({ kind: 'jl-deliver', fruit: 0 });
    for (let i = 0; i < 60; i++) life.update(0.05, i * 0.05, at(0, 25), null, sess());
    let n = 0;
    scene.traverse((o) => { if (o.isPointLight) n++; });
    expect(n).toBe(1);
    expect(life.mossy.halo.visible).toBe(true);
    life.dispose();
  });
  it('the prompt arbiter asks Mossy first and then the stage slots (which answer nothing yet)', () => {
    const fake = { promptAt: () => 'x', interact: () => 'did' };
    const a = createJunglePrompts(fake);
    expect(a.promptAt({ x: 0, z: 0 })).toBe('x');
    expect(a.interact()).toBe('did');
    const none = createJunglePrompts({ promptAt: () => null, interact: () => null });
    expect(none.promptAt({ x: 0, z: 0 })).toBe(null);
    expect(none.interact()).toBe(null);
  });
});

describe('the words', () => {
  it('"Mossy" is spelled in ONE table: nowhere else in the new code', () => {
    expect(NAMES.mossy).toBe('Mossy');
    for (const f of ['junglemission.js', 'junglestory.js', 'junglelife.js']) expect(read(`src/world/${f}`).replace(/\/\/.*$/gm, ''), f).not.toMatch(/(['"`])[^'"`\n]*Mossy[^'"`\n]*\1/);
    expect(phrase('jungle.mossy.prompt')).toContain(NAMES.mossy);
  });
  it('every line reads the same in the everyday set and holds no series word or banned word; none is a bare placeholder', () => {
    const on = Object.keys(LINES).map((k) => [k, phrase(k)]);
    withOffWords(() => { for (const [k, v] of on) { expect(phrase(k), k).toBe(v); expect(bannedIn(phrase(k)), k).toBeNull(); } });
    for (const [k, v] of on) expect(v.length, k).toBeGreaterThan(8);
  });
  it('no literal Clan outside the words files, and none of the area\'s banned words in the new code\'s lines', () => {
    for (const f of ['junglemission.js', 'junglestory.js', 'junglelife.js', 'junglewords.js']) expect(read(`src/world/${f}`), f).not.toMatch(/Clan/);
    for (const v of Object.values(LINES)) expect(v).not.toMatch(/\b(dark|lost forever|trapped|stuck|collapse|scary)\b/i);
  });
  it('no Math.random and no clock in the new code', () => {
    for (const f of ['junglemission.js', 'junglestory.js', 'junglelife.js']) expect(read(`src/world/${f}`).replace(/\/\/.*$/gm, ''), f).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});
