// The Treehouse village, milestone T2: Nutmeg and chapter one. The pure step machine (steps 0 to 2 and the ladder beyond), the sanitiser/merge/table pins, the story's places
// (clear of every collider, inside the walk, the Bakery up on its deck), Nutmeg's turn, and the real life on a bare THREE.Scene: meet, pick up, carry (never saved), post the
// letter from the deck, the meow's ring, the partner's credit and the `th-` wire, reduced motion, the one-light rule and both word sets.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as M from '../src/world/treehousemission.js';
import * as S from '../src/world/treehousestory.js';
import * as P from '../src/world/treehouseplan.js';
import { createNutmeg, createTreehousePrompts, nutmegGeometry } from '../src/world/treehouselife.js';
import { build } from '../src/world/treehouse.js';
import { NAMES, LINES } from '../src/world/treehousewords.js';
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
  it('starts unmet; meeting is step 1; the first letter at the Bakery is step 2 with letters bit 0', () => {
    expect(M.normalize(null)).toEqual({ step: 0, letters: 0 });
    const a = M.apply({ step: 0, letters: 0 }, { kind: 'meet' });
    expect(a).toMatchObject({ changed: true, effect: 'met', treehouse: { step: 1, letters: 0 } });
    const b = M.apply(a.treehouse, { kind: 'deliver', letter: 0 });
    expect(b).toMatchObject({ changed: true, effect: 'first', treehouse: { step: 2, letters: 1 } });
    expect(M.chapterOneDone(b.treehouse)).toBe(true);
  });
  it('a letter before Nutmeg is met, out of order, twice, or a made-up event changes nothing; the other save keys come back as they were', () => {
    const rec = { step: 0, letters: 0, album: 5 };
    expect(M.apply(rec, { kind: 'deliver', letter: 0 }).changed).toBe(false);
    expect(M.apply({ step: 1, letters: 0 }, { kind: 'deliver', letter: 1 }).changed).toBe(false);
    expect(M.apply({ step: 2, letters: 1 }, { kind: 'deliver', letter: 0 }).changed).toBe(false);
    expect(M.apply({ step: 2, letters: 1 }, { kind: 'meet' }).changed).toBe(false);
    for (const ev of [null, 3, 'meet', {}, { kind: 'fail' }, { kind: 'deliver', letter: 7 }, { kind: '__proto__' }]) expect(M.apply(rec, ev).changed).toBe(false);
    expect(M.apply(rec, { kind: 'meet' }).treehouse.album).toBe(5);
  });
  it('never lowers a step, never raises one past 7, and repairs hostile input (idempotent)', () => {
    for (const bad of [undefined, null, 7, 'x', [], { step: -3 }, { step: 99, letters: 99 }, { step: 1.5 }, { step: NaN }, { letters: 1 }, { letters: 7 }]) {
      const n = M.normalize(bad);
      expect(n.step).toBeGreaterThanOrEqual(0);
      expect(n.step).toBeLessThanOrEqual(7);
      expect(M.normalize(n)).toEqual(n);
    }
    expect(M.normalize({ letters: 1 }).step).toBe(2);
    expect(M.normalize({ letters: 7 })).toEqual({ step: 4, letters: 7 });
    expect(M.normalize({ step: 5 }).letters).toBe(7);
  });
  it('credit takes the steps before it in order', () => {
    expect(M.credit({ step: 0, letters: 0 }, { kind: 'deliver', letter: 0 }).treehouse).toMatchObject({ step: 2, letters: 1 });
    expect(M.credit({ step: 2, letters: 1 }, { kind: 'meet' }).changed).toBe(false);
  });
  it('the goal always answers, with a picture, and walks the whole chapter', () => {
    expect(M.nextGoal({ step: 0 })).toMatchObject({ kind: 'nutmeg', icon: 'letter' });
    expect(M.nextGoal({ step: 1 })).toMatchObject({ kind: 'letter', letter: 0 });
    expect(M.nextGoal({ step: 1 }, 0)).toMatchObject({ kind: 'deliver', letter: 0, icon: 'house' });
    expect(M.nextGoal({ step: 2, letters: 1 })).toMatchObject({ kind: 'letter', letter: 1 });
    expect(M.nextGoal({ step: 7 }).kind).toBe('rest');
    expect(M.canPick({ step: 1 }, 0)).toBe(true);
    expect(M.canPick({ step: 1 }, 0, 0)).toBe(false);
    expect(M.canPick({ step: 0 }, 0)).toBe(false);
  });
  it('the wire form is read only for `th-` events', () => {
    expect(M.toStep(M.wire({ kind: 'meet' }))).toEqual({ kind: 'meet' });
    expect(M.toStep(M.wire({ kind: 'deliver', letter: 1 }))).toEqual({ kind: 'deliver', letter: 1 });
    for (const ev of [null, {}, { kind: 'sv-meet' }, { kind: 'sv-light', candle: 0 }, { kind: 'th-deliver', letter: 9 }, { kind: 'th-nope' }, { kind: 3 }]) expect(M.toStep(ev)).toBe(null);
  });
});

describe('the save', () => {
  it('the sanitiser table matches the mission table and fills the letters a step implies', () => {
    for (let s = 0; s <= 7; s++) expect(sanitizeSave({ version: 4, treehouse: { step: s } }).treehouse).toEqual({ step: s, letters: M.LETTERS_AT[s], album: 0 });
    expect(sanitizeSave({ version: 4, treehouse: { step: 1, letters: 99, album: 99999 } }).treehouse).toEqual({ step: 1, letters: 7, album: 4095 });
  });
  it('the merge keeps the further step and the union of the letter bits', () => {
    const L = { treehouse: { step: 3, letters: 3, album: 1 } };
    const C = { treehouse: { step: 2, letters: 1, album: 2 } };
    expect(mergeSaves({ local: { version: 4, ...L }, cloud: { version: 4, ...C } }).save.treehouse).toEqual({ step: 3, letters: 3, album: 3 });
  });
  it('the sanitiser\'s letter table is the mission\'s', () => {
    expect(read('src/progression.js')).toContain(`const TREEHOUSE_LETTERS_AT = [${M.LETTERS_AT.join(', ')}]`);
  });
});

describe('the places', () => {
  const colliders = P.treehouseColliders();
  it('Nutmeg and the post box stand inside the walk, clear of every collider; the Bakery house is on its deck, the letter is a carry up the stair', () => {
    for (const p of [S.NUTMEG.start, S.LETTERS[0]]) {
      expect(p.x).toBeGreaterThan(P.TREEHOUSE_BOUNDS.minX + 2);
      expect(p.x).toBeLessThan(P.TREEHOUSE_BOUNDS.maxX - 2);
      expect(p.z).toBeLessThan(P.TREEHOUSE_BOUNDS.maxZ - 2);
      for (const c of colliders) expect(Math.hypot(p.x - c.x, p.z - c.z), JSON.stringify(p)).toBeGreaterThan(c.r + (p === S.LETTERS[0] ? 0.3 : 0.6));
    }
    const h = S.HOUSES[0];
    expect(h.y).toBe(1.4);
    expect(P.TREEHOUSE_PERCHES.some((q) => Math.hypot(q.x - h.x, q.z - h.z) < 0.5 && q.y === h.y)).toBe(true); // the house is a perch the cat can stand on
    expect(Math.hypot(h.x - S.LETTERS[0].x, h.z - S.LETTERS[0].z)).toBeGreaterThan(h.reach + S.LETTERS[0].reach); // a carry, not a step
    expect(Math.hypot(h.sill.x - h.x, h.sill.z - h.z)).toBeLessThan(5);
  });
  it('is a short walk on foot from the spawn: Nutmeg, the box, the Bakery', () => {
    const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    expect(d(P.TREEHOUSE_SPAWN, S.NUTMEG.start) + d(S.NUTMEG.start, S.LETTERS[0]) + d(S.LETTERS[0], S.HOUSES[0])).toBeLessThan(60);
  });
  it('Nutmeg stays where she is and turns by the short way to face a cat near her; far away or a bad dt does nothing', () => {
    const m = { x: 0, z: 0, yaw: 0, moving: false };
    S.nutmegStep(m, { x: 0, z: 30 }, 0.1);
    S.nutmegStep(m, { x: 5, z: 0 }, NaN);
    S.nutmegStep(m, null, 0.1);
    expect(m.yaw).toBe(0);
    for (let i = 0; i < 40; i++) S.nutmegStep(m, { x: 5, z: 0 }, 0.1);
    expect(m.yaw).toBeCloseTo(Math.PI / 2, 5);
    expect([m.x, m.z, m.moving]).toEqual([0, 0, false]);
    const w = { x: 0, z: 0, yaw: 3.0, moving: false };
    for (let i = 0; i < 40; i++) S.nutmegStep(w, { x: 0, z: -5 }, 0.1); // behind her: the short way round
    expect(Math.abs(Math.abs(w.yaw) - Math.PI)).toBeLessThan(0.01);
  });
});

function rig({ rec = null, reducedMotion = false, tier = null, send = null } = {}) {
  const storage = memoryStorage();
  const progression = createProgression(storage);
  if (rec) { progression.state.treehouse = { ...progression.state.treehouse, ...rec }; progression.addPoints(0); }
  const scene = new THREE.Scene();
  const sent = [];
  const nutmeg = createNutmeg({ scene, progression, reducedMotion, tier, send: send ?? ((ev) => sent.push(ev)) });
  return { storage, progression, scene, nutmeg, sent };
}
const tick = (r, cat, n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) r.nutmeg.update(dt, i * dt, cat, null, sess()); };
const press = (r, cat) => { tick(r, cat, 1); const l = r.nutmeg.promptAt(cat); return l ? { line: l, k: r.nutmeg.interact() } : { line: null, k: null }; };
const nearNutmeg = (r) => at(r.nutmeg.nutmeg.x - 1.6, r.nutmeg.nutmeg.z);
const onDeck = () => at(S.HOUSES[0].x + 1, S.HOUSES[0].z, S.HOUSES[0].y);

describe('Nutmeg on a walk (the real life, no WebGL)', () => {
  it('plays chapter one with the cat\'s feet only: hello, pick up the letter, carry it up, post it from the deck', () => {
    const r = rig();
    const lines = [];
    const off = bus.on('discovery', (e) => lines.push(e.key));
    expect(press(r, at(-30, -30)).k).toBe(null);
    expect(press(r, nearNutmeg(r))).toMatchObject({ k: 'meet', line: phrase('treehouse.nutmeg.prompt') });
    expect(r.progression.state.treehouse.step).toBe(1);
    expect(r.nutmeg.goalNow().g).toMatchObject({ kind: 'letter', letter: 0 });
    const l = S.LETTERS[0];
    expect(press(r, at(l.x + 0.8, l.z)).k).toBe('pick');
    expect(r.nutmeg.state.letterModes[0]).toBe('carried');
    expect(r.progression.state.treehouse.letters).toBe(0); // a carried letter is never saved
    expect(r.nutmeg.goalNow().g.kind).toBe('deliver');
    expect(press(r, at(l.x + 0.8, l.z)).k, 'with the letter in her mouth there is nothing more to pick up').not.toBe('pick');
    const h = S.HOUSES[0];
    expect(press(r, at(h.x + 1, h.z, 0)).k, 'on the ground under the deck is not the Bakery').toBe(null);
    expect(press(r, onDeck()).k).toBe('give');
    expect(r.progression.state.treehouse).toMatchObject({ step: 2, letters: 1 });
    expect(r.nutmeg.state.letterModes[0]).toBe('posted');
    expect(r.sent).toEqual([{ kind: 'th-meet' }, { kind: 'th-deliver', letter: 0 }]);
    tick(r, onDeck(), 80);
    expect(r.nutmeg.state.lit[0]).toBe(1);
    expect(r.nutmeg.halos[0].visible).toBe(true);
    expect(press(r, onDeck()).k).toBe(null); // chapter one is done: nothing more to press here until stage B
    for (const k of ['treehouse-nutmeg-met', 'treehouse-letter-got', 'treehouse-bakery-delivered']) expect(lines).toContain(k);
    off();
    r.nutmeg.dispose();
  });
  it('a letter in her mouth is gone when the walk ends: the next walk finds it in the box', () => {
    const r = rig({ rec: { step: 1 } });
    const l = S.LETTERS[0];
    press(r, at(l.x + 0.8, l.z));
    expect(r.nutmeg.state.carrying).toBe(0);
    r.nutmeg.dispose();
    const again = createNutmeg({ scene: new THREE.Scene(), progression: r.progression, reducedMotion: false });
    expect(again.state.carrying).toBe(null);
    expect(again.state.letterModes[0]).toBe('home');
    again.dispose();
  });
  it('the meow shows the next picture and a ring of sparkles; the glint hangs over the wanted letter only', () => {
    const r = rig({ rec: { step: 1 } });
    tick(r, at(0, 30), 2);
    expect(r.nutmeg.goalNow()).toMatchObject({ x: S.LETTERS[0].x, z: S.LETTERS[0].z });
    const ring = r.scene.getObjectByName('treehouse:meowRing');
    expect(ring.visible).toBe(false);
    bus.emit('tip:did', { id: 'call' });
    tick(r, at(0, 30), 2);
    expect(ring.visible).toBe(true);
    expect(r.nutmeg.bubble.icon).toBe('letter');
    expect(r.scene.getObjectByName('treehouse:letter:glint').visible).toBe(true);
    tick(r, at(0, 30), 200);
    expect(ring.visible).toBe(false);
    r.progression.state.treehouse = { step: 2, letters: 1, album: 0 };
    tick(r, at(0, 30), 2);
    expect(r.scene.getObjectByName('treehouse:letter:glint').visible).toBe(false);
    r.nutmeg.dispose();
  });
  it('a partner\'s step is credited the same way (in order), a hostile one is nothing, and her own mouth is cleared if it was the one posted', () => {
    const r = rig();
    expect(r.nutmeg.credit({ kind: 'sv-light', candle: 0 })).toBe(null);
    expect(r.nutmeg.credit({ kind: 'th-deliver', letter: 5 })).toBe(null);
    expect(r.nutmeg.credit({ kind: 'th-deliver', letter: 0 })).toBe('first');
    expect(r.progression.state.treehouse).toMatchObject({ step: 2, letters: 1 });
    expect(r.sent).toEqual([]); // a credited step is not sent back
    expect(r.nutmeg.credit({ kind: 'th-meet' })).toBe(null);
    const q = rig({ rec: { step: 1 } });
    press(q, at(S.LETTERS[0].x + 0.8, S.LETTERS[0].z));
    q.nutmeg.credit({ kind: 'th-deliver', letter: 0 });
    expect(q.nutmeg.state.carrying).toBe(null);
    r.nutmeg.dispose(); q.nutmeg.dispose();
  });
  it('Nutmeg breathes and turns; in reduced motion she holds still and the window lights at once', () => {
    const r = rig({ rec: { step: 1 } });
    const cat = at(8, 20);
    const sy = [];
    for (let i = 0; i < 60; i++) { r.nutmeg.update(0.05, i * 0.05, cat, null, sess()); sy.push(r.nutmeg.group.userData.body.scale.y); }
    expect(new Set(sy.map((v) => v.toFixed(4))).size).toBeGreaterThan(3);
    expect(r.nutmeg.nutmeg.yaw).not.toBe(Math.PI);
    const q = rig({ rec: { step: 1 }, reducedMotion: true });
    for (let i = 0; i < 60; i++) q.nutmeg.update(0.05, i * 0.05, cat, null, sess());
    expect(q.nutmeg.group.userData.body.scale.y).toBeCloseTo(1.15, 6);
    q.nutmeg.credit({ kind: 'th-deliver', letter: 0 });
    q.nutmeg.update(0.016, 0, cat, null, sess());
    expect(q.nutmeg.state.lit[0]).toBe(1);
    r.nutmeg.dispose(); q.nutmeg.dispose();
  });
  it('a save at step 2 or more shows the window lit from the first frame, and Nutmeg never walks off', () => {
    const r = rig({ rec: { step: 2, letters: 1 } });
    expect(r.nutmeg.state.lit[0]).toBe(1);
    expect(r.nutmeg.state.letterModes[0]).toBe('posted');
    r.nutmeg.dispose();
    const u = rig();
    const [x0, z0] = [u.nutmeg.nutmeg.x, u.nutmeg.nutmeg.z];
    tick(u, at(20, 20), 100);
    expect([u.nutmeg.nutmeg.x, u.nutmeg.nutmeg.z]).toEqual([x0, z0]);
    u.nutmeg.dispose();
  });
  it('is drawn cheaply: a handful of meshes, one merged body, no light of its own', () => {
    const r = rig();
    let lights = 0; let meshes = 0;
    r.scene.traverse((o) => { if (o.isLight) lights++; if (o.isMesh) meshes++; });
    expect(lights).toBe(0);
    expect(meshes).toBeLessThan(6);
    expect(nutmegGeometry().attributes.position.count / 3).toBeLessThan(1500);
    r.nutmeg.dispose();
  });
  it('dispose takes everything out of the scene', () => {
    const r = rig();
    r.nutmeg.dispose();
    expect(r.scene.children).toHaveLength(0);
    r.nutmeg.dispose();
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
  it('the built area\'s life carries Nutmeg, one arbiter, a credit, and still exactly one PointLight in the whole place, moved to the lit window', () => {
    const { scene, life } = placed(null);
    expect(typeof life.promptAt).toBe('function');
    expect(typeof life.credit).toBe('function');
    expect(life.promptAt(nearNutmeg({ nutmeg: life.nutmeg }))).toBe(phrase('treehouse.nutmeg.prompt'));
    expect(life.interact()).toBe('meet');
    expect(life.credit({ kind: 'th-deliver', letter: 0 })).toBe('first');
    for (let i = 0; i < 60; i++) life.update(0.05, i * 0.05, at(0, 25), null, sess());
    const lights = [];
    scene.traverse((o) => { if (o.isLight && o.isPointLight) lights.push(o); });
    expect(lights).toHaveLength(1);
    expect(lights[0].intensity).toBeGreaterThan(0.5);
    expect(Math.hypot(lights[0].position.x - S.HOUSES[0].glow.x, lights[0].position.z - S.HOUSES[0].glow.z)).toBeLessThan(2);
    life.dispose();
    expect(lights[0].intensity).toBe(0);
  });
  it('on the low rungs the light stays off (the glow sprite is enough)', () => {
    const { scene, life } = placed({ name: 'low', shadows: false });
    life.credit({ kind: 'th-deliver', letter: 0 });
    for (let i = 0; i < 60; i++) life.update(0.05, i * 0.05, at(0, 25), null, sess());
    expect(scene.getObjectByName('treehouse:light').intensity).toBe(0);
    expect(life.nutmeg.halos[0].visible).toBe(true);
    life.dispose();
  });
  it('the prompt arbiter asks Nutmeg first and then the stage slots (which answer nothing yet)', () => {
    const fake = { promptAt: () => 'x', interact: () => 'did' };
    const a = createTreehousePrompts(fake);
    expect(a.promptAt({ x: 0, z: 0 })).toBe('x');
    expect(a.interact()).toBe('did');
    const none = createTreehousePrompts({ promptAt: () => null, interact: () => null });
    expect(none.promptAt({ x: 0, z: 0 })).toBe(null);
    expect(none.interact()).toBe(null);
  });
});

describe('the words', () => {
  it('"Nutmeg" is spelled in ONE table: nowhere else in the new code', () => {
    expect(NAMES.nutmeg).toBe('Nutmeg');
    for (const f of ['treehousemission.js', 'treehousestory.js', 'treehouselife.js']) expect(read(`src/world/${f}`).replace(/\/\/.*$/gm, ''), f).not.toMatch(/(['"`])[^'"`\n]*Nutmeg[^'"`\n]*\1/);
    expect(phrase('treehouse.nutmeg.prompt')).toContain(NAMES.nutmeg);
  });
  it('every line reads the same in the everyday set and holds no series word or banned word; none is a bare placeholder', () => {
    const on = Object.keys(LINES).map((k) => [k, phrase(k)]);
    withOffWords(() => { for (const [k, v] of on) { expect(phrase(k), k).toBe(v); expect(bannedIn(phrase(k)), k).toBeNull(); } });
    for (const [k, v] of on) expect(v.length, k).toBeGreaterThan(8);
  });
  it('no literal Clan outside the words files, and none of the area\'s banned words in the new code\'s lines', () => {
    for (const f of ['treehousemission.js', 'treehousestory.js', 'treehouselife.js', 'treehousewords.js']) expect(read(`src/world/${f}`), f).not.toMatch(/Clan/);
    for (const v of Object.values(LINES)) expect(v).not.toMatch(/\b(dark|lost forever|trapped|stuck|collapse|scary)\b/i);
  });
  it('no Math.random and no clock in the new code', () => {
    for (const f of ['treehousemission.js', 'treehousestory.js', 'treehouselife.js']) expect(read(`src/world/${f}`).replace(/\/\/.*$/gm, ''), f).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});
