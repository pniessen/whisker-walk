// Snowville, milestone V2: Tilly and chapter one. The pure step machine (steps 0 to 2 and the ladder beyond), the sanitiser/merge/table pins, the story's places (clear of
// every collider, inside the plan's keep-out circles), Tilly's shy follow, and the real life on a bare THREE.Scene: meet, pick up, carry (never saved), light the lantern,
// the meow's ring, the partner's credit and the `sv-` wire, reduced motion, the one-light rule and both word sets.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as M from '../src/world/snowvillemission.js';
import * as S from '../src/world/snowvillestory.js';
import * as P from '../src/world/snowvilleplan.js';
import { createTilly, createSnowvillePrompts, tillyGeometry } from '../src/world/snowvillelife.js';
import { build } from '../src/world/snowville.js';
import { NAMES, LINES } from '../src/world/snowvillewords.js';
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
const at = (x, z) => ({ x, z, y: P.snowY(x, z) });

describe('the step machine', () => {
  it('starts unmet; meeting is step 1; the first candle in its lantern is step 2 with candle bit 0', () => {
    expect(M.normalize(null)).toEqual({ step: 0, candles: 0 });
    const a = M.apply({ step: 0, candles: 0 }, { kind: 'meet' });
    expect(a).toMatchObject({ changed: true, effect: 'met', snowville: { step: 1, candles: 0 } });
    const b = M.apply(a.snowville, { kind: 'light', candle: 0 });
    expect(b).toMatchObject({ changed: true, effect: 'first', snowville: { step: 2, candles: 1 } });
    expect(M.chapterOneDone(b.snowville)).toBe(true);
  });
  it('a candle before Tilly is met, out of order, twice, or a made-up event changes nothing; the other save keys come back as they were', () => {
    const rec = { step: 0, candles: 0, album: 5 };
    expect(M.apply(rec, { kind: 'light', candle: 0 }).changed).toBe(false);
    expect(M.apply({ step: 1, candles: 0 }, { kind: 'light', candle: 1 }).changed).toBe(false);
    expect(M.apply({ step: 2, candles: 1 }, { kind: 'light', candle: 0 }).changed).toBe(false);
    expect(M.apply({ step: 2, candles: 1 }, { kind: 'meet' }).changed).toBe(false);
    for (const ev of [null, 3, 'meet', {}, { kind: 'fail' }, { kind: 'light', candle: 7 }, { kind: '__proto__' }]) expect(M.apply(rec, ev).changed).toBe(false);
    expect(M.apply(rec, { kind: 'meet' }).snowville.album).toBe(5);
  });
  it('never lowers a step, never raises one past 7, and repairs hostile input (idempotent)', () => {
    for (const bad of [undefined, null, 7, 'x', [], { step: -3 }, { step: 99, candles: 99 }, { step: 1.5 }, { step: NaN }, { candles: 1 }, { candles: 7 }]) {
      const n = M.normalize(bad);
      expect(n.step).toBeGreaterThanOrEqual(0);
      expect(n.step).toBeLessThanOrEqual(7);
      expect(M.normalize(n)).toEqual(n);
    }
    expect(M.normalize({ candles: 1 }).step).toBe(2); // a bit with no step is the step it implies
    expect(M.normalize({ candles: 7 })).toEqual({ step: 4, candles: 7 });
    expect(M.normalize({ step: 5 }).candles).toBe(7);
  });
  it('credit takes the steps before it in order', () => {
    const r = M.credit({ step: 0, candles: 0 }, { kind: 'light', candle: 0 });
    expect(r.snowville).toMatchObject({ step: 2, candles: 1 });
    expect(M.credit({ step: 2, candles: 1 }, { kind: 'meet' }).changed).toBe(false);
  });
  it('the goal always answers, with a picture, and walks the whole chapter', () => {
    expect(M.nextGoal({ step: 0 })).toMatchObject({ kind: 'tilly', icon: 'lantern' });
    expect(M.nextGoal({ step: 1 })).toMatchObject({ kind: 'candle', candle: 0 });
    expect(M.nextGoal({ step: 1 }, 0)).toMatchObject({ kind: 'deliver', candle: 0 });
    expect(M.nextGoal({ step: 2, candles: 1 })).toMatchObject({ kind: 'candle', candle: 1 });
    expect(M.nextGoal({ step: 7 }).kind).toBe('rest');
    expect(M.canPick({ step: 1 }, 0)).toBe(true);
    expect(M.canPick({ step: 1 }, 0, 0)).toBe(false);
    expect(M.canPick({ step: 0 }, 0)).toBe(false);
  });
  it('the wire form is read only for `sv-` events', () => {
    expect(M.toStep(M.wire({ kind: 'meet' }))).toEqual({ kind: 'meet' });
    expect(M.toStep(M.wire({ kind: 'light', candle: 1 }))).toEqual({ kind: 'light', candle: 1 });
    for (const ev of [null, {}, { kind: 'wc-forge' }, { kind: 'sv-light', candle: 9 }, { kind: 'sv-nope' }, { kind: 3 }]) expect(M.toStep(ev)).toBe(null);
  });
});

describe('the save', () => {
  it('the sanitiser table matches the mission table and fills the candles a step implies', () => {
    for (let s = 0; s <= 7; s++) expect(sanitizeSave({ version: 4, snowville: { step: s } }).snowville).toEqual({ step: s, candles: M.CANDLES_AT[s], album: 0 });
    expect(sanitizeSave({ version: 4, snowville: { step: 1, candles: 99, album: 99999 } }).snowville).toEqual({ step: 1, candles: 7, album: 4095 });
  });
  it('the merge keeps the further step and the union of the candle bits', () => {
    const L = { snowville: { step: 3, candles: 3, album: 1 } };
    const C = { snowville: { step: 2, candles: 1, album: 2 } };
    const out = mergeSaves({ local: { version: 4, ...L }, cloud: { version: 4, ...C } }).save;
    expect(out.snowville).toEqual({ step: 3, candles: 3, album: 3 });
  });
});

describe('the places', () => {
  const colliders = P.snowvilleColliders();
  it('Tilly, the candle and the lantern stand inside the walk, clear of every collider, on level snow, inside the plan\'s keep-out circles', () => {
    const spots = [S.TILLY.start, ...S.CANDLES, ...S.LANTERNS];
    for (const p of spots) {
      expect(p.x).toBeGreaterThan(P.SNOWVILLE_BOUNDS.minX + 2);
      expect(p.x).toBeLessThan(P.SNOWVILLE_BOUNDS.maxX - 2);
      for (const c of colliders) expect(Math.hypot(p.x - c.x, p.z - c.z), JSON.stringify(p)).toBeGreaterThan(c.r + 0.6);
      expect(P.KEEP_OUT.some(([kx, kz, kr]) => Math.hypot(p.x - kx, p.z - kz) < kr), JSON.stringify(p)).toBe(true);
    }
    for (const l of S.LANTERNS) expect(Math.hypot(l.x - S.CANDLES[0].x, l.z - S.CANDLES[0].z)).toBeGreaterThan(l.reach + S.CANDLES[0].reach); // a carry, not a step
  });
  it('is a short walk on foot from the spawn: Tilly, the candle, the lantern', () => {
    const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    expect(d(P.SNOWVILLE_SPAWN, S.TILLY.start) + d(S.TILLY.start, S.CANDLES[0]) + d(S.CANDLES[0], S.LANTERNS[0])).toBeLessThan(60);
  });
  it('Tilly follows shyly: hurries when far, stops when near, backs off when crowded, never leaves the walk, never moves unmet', () => {
    const m = { x: 0, z: 0, yaw: 0, moving: false, chasing: false };
    S.tillyStep(m, { x: 10, z: 0 }, 0.1, { follow: false });
    expect(m).toMatchObject({ x: 0, moving: false });
    for (let i = 0; i < 40; i++) S.tillyStep(m, { x: 10, z: 0 }, 0.1, { colliders: [] });
    expect(m.x).toBeGreaterThan(5);
    expect(Math.hypot(10 - m.x, m.z)).toBeLessThan(S.TILLY.far);
    const c = { x: 5, z: 0, yaw: 0, moving: false, chasing: false };
    S.tillyStep(c, { x: 5.5, z: 0 }, 0.1, { colliders: [] });
    expect(c.x).toBeLessThan(5);
    const e = { x: 39.9, z: 0, yaw: 0, moving: false, chasing: false };
    for (let i = 0; i < 30; i++) S.tillyStep(e, { x: 100, z: 0 }, 0.1, { colliders: [] });
    expect(e.x).toBeLessThanOrEqual(P.SNOWVILLE_BOUNDS.maxX - 0.5);
    S.tillyStep(m, { x: 20, z: 0 }, NaN);
    S.tillyStep(m, null, 0.1);
  });
});

function rig({ rec = null, reducedMotion = false, send = null, remote = false } = {}) {
  const storage = memoryStorage();
  const progression = createProgression(storage);
  if (rec) { progression.state.snowville = { ...progression.state.snowville, ...rec }; progression.addPoints(0); }
  const scene = new THREE.Scene();
  const sent = [];
  const tilly = createTilly({ scene, progression, reducedMotion, send: send ?? ((ev) => sent.push(ev)) });
  return { storage, progression, scene, tilly, sent };
}
const tick = (r, cat, n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) r.tilly.update(dt, i * dt, cat, null, sess()); };
const press = (r, cat) => { tick(r, cat, 1); const l = r.tilly.promptAt(cat); return l ? { line: l, k: r.tilly.interact() } : { line: null, k: null }; };
const nearTilly = (r) => at(r.tilly.tilly.x + 1.6, r.tilly.tilly.z);

describe('Tilly on a walk (the real life, no WebGL)', () => {
  it('plays chapter one with the cat\'s feet only: hello, pick up the candle, carry it, light the lantern', () => {
    const r = rig();
    const lines = [];
    const off = bus.on('discovery', (e) => lines.push(e.key));
    expect(press(r, at(-30, -30)).k).toBe(null);
    expect(press(r, nearTilly(r))).toMatchObject({ k: 'meet', line: phrase('snowville.tilly.prompt') });
    expect(r.progression.state.snowville.step).toBe(1);
    expect(r.tilly.goalNow().g).toMatchObject({ kind: 'candle', candle: 0 });
    const c = S.CANDLES[0];
    expect(press(r, at(c.x + 0.8, c.z)).k).toBe('pick');
    expect(r.tilly.state.candleModes[0]).toBe('carried');
    expect(r.progression.state.snowville.candles).toBe(0); // a carried candle is never saved
    expect(JSON.stringify(JSON.parse(r.storage.getItem('whisker-walk-save') ?? '{}').snowville ?? {})).not.toMatch(/carry/);
    expect(r.tilly.goalNow().g.kind).toBe('deliver');
    expect(press(r, at(c.x + 0.8, c.z)).k, 'with the candle in her mouth there is nothing more to pick up').not.toBe('pick');
    const l = S.LANTERNS[0];
    expect(press(r, at(l.x + 2, l.z + 1)).k).toBe('give');
    expect(r.progression.state.snowville).toMatchObject({ step: 2, candles: 1 });
    expect(r.tilly.state.candleModes[0]).toBe('given');
    expect(r.sent).toEqual([{ kind: 'sv-meet' }, { kind: 'sv-light', candle: 0 }]);
    tick(r, at(l.x + 2, l.z), 80);
    expect(r.tilly.state.lit[0]).toBe(1);
    expect(r.tilly.halos[0].visible).toBe(true);
    expect(press(r, at(l.x + 2, l.z)).k).toBe(null); // chapter one is done: nothing more to press here until stage B
    for (const k of ['snowville-tilly-met', 'snowville-candle-got', 'snowville-lantern-lit']) expect(lines).toContain(k);
    off();
    r.tilly.dispose();
  });
  it('a candle in her mouth is gone when the walk ends: the next walk finds it at its own spot', () => {
    const r = rig({ rec: { step: 1 } });
    const c = S.CANDLES[0];
    press(r, at(c.x + 0.8, c.z));
    expect(r.tilly.state.carrying).toBe(0);
    r.tilly.dispose();
    const again = createTilly({ scene: new THREE.Scene(), progression: r.progression, reducedMotion: false });
    expect(again.state.carrying).toBe(null);
    expect(again.state.candleModes[0]).toBe('home');
    again.dispose();
  });
  it('the meow shows the next picture and a ring of sparkles; the glint hangs over the wanted candle only', () => {
    const r = rig({ rec: { step: 1 } });
    tick(r, at(0, 30), 2);
    expect(r.tilly.goalNow()).toMatchObject({ x: S.CANDLES[0].x, z: S.CANDLES[0].z });
    const ring = r.scene.getObjectByName('snowville:meowRing');
    expect(ring.visible).toBe(false);
    bus.emit('tip:did', { id: 'call' });
    tick(r, at(0, 30), 2);
    expect(ring.visible).toBe(true);
    expect(r.tilly.bubble.icon).toBe('spark');
    expect(r.scene.getObjectByName('snowville:candle:glint').visible).toBe(true);
    tick(r, at(0, 30), 200);
    expect(ring.visible).toBe(false);
    r.progression.state.snowville = { step: 2, candles: 1, album: 0 };
    tick(r, at(0, 30), 2);
    expect(r.scene.getObjectByName('snowville:candle:glint').visible).toBe(false);
    r.tilly.dispose();
  });
  it('a partner\'s step is credited the same way (in order), a hostile one is nothing, and her own mouth is cleared if it was the one lit', () => {
    const r = rig();
    expect(r.tilly.credit({ kind: 'wc-forge' })).toBe(null);
    expect(r.tilly.credit({ kind: 'sv-light', candle: 5 })).toBe(null);
    expect(r.tilly.credit({ kind: 'sv-light', candle: 0 })).toBe('first');
    expect(r.progression.state.snowville).toMatchObject({ step: 2, candles: 1 });
    expect(r.sent).toEqual([]); // a credited step is not sent back
    expect(r.tilly.credit({ kind: 'sv-meet' })).toBe(null);
    const q = rig({ rec: { step: 1 } });
    press(q, at(S.CANDLES[0].x + 0.8, S.CANDLES[0].z));
    q.tilly.credit({ kind: 'sv-light', candle: 0 });
    expect(q.tilly.state.carrying).toBe(null);
    r.tilly.dispose(); q.tilly.dispose();
  });
  it('Tilly follows once met, hops, and stands still in reduced motion; the lantern lights at once in reduced motion', () => {
    const r = rig({ rec: { step: 1 } });
    const cat = at(8, 10);
    let top = 0;
    for (let i = 0; i < 100; i++) { r.tilly.update(0.05, i * 0.05, cat, null, sess()); top = Math.max(top, r.tilly.group.position.y - P.snowY(r.tilly.tilly.x, r.tilly.tilly.z)); }
    expect(Math.hypot(cat.x - r.tilly.tilly.x, cat.z - r.tilly.tilly.z)).toBeLessThan(S.TILLY.far + 1);
    expect(top).toBeGreaterThan(0.02);
    const q = rig({ rec: { step: 1 }, reducedMotion: true });
    let still = 0;
    for (let i = 0; i < 100; i++) { q.tilly.update(0.05, i * 0.05, cat, null, sess()); still = Math.max(still, q.tilly.group.position.y - P.snowY(q.tilly.tilly.x, q.tilly.tilly.z)); }
    expect(still).toBe(0);
    q.tilly.credit({ kind: 'sv-light', candle: 0 });
    q.tilly.update(0.016, 0, cat, null, sess());
    expect(q.tilly.state.lit[0]).toBe(1);
    r.tilly.dispose(); q.tilly.dispose();
  });
  it('a save at step 2 or more shows the lantern lit from the first frame, and unmet Tilly does not follow', () => {
    const r = rig({ rec: { step: 2, candles: 1 } });
    expect(r.tilly.state.lit[0]).toBe(1);
    r.tilly.dispose();
    const u = rig();
    const x0 = u.tilly.tilly.x;
    tick(u, at(20, 20), 100);
    expect(u.tilly.tilly.x).toBe(x0);
    u.tilly.dispose();
  });
  it('is drawn cheaply: a handful of meshes, one merged body, no light of its own', () => {
    const r = rig();
    let lights = 0; let meshes = 0;
    r.scene.traverse((o) => { if (o.isLight) lights++; if (o.isMesh) meshes++; });
    expect(lights).toBe(0);
    expect(meshes).toBeLessThan(12);
    expect(tillyGeometry().attributes.position.count / 3).toBeLessThan(1500);
    r.tilly.dispose();
  });
  it('dispose takes everything out of the scene', () => {
    const r = rig();
    r.tilly.dispose();
    expect(r.scene.children).toHaveLength(0);
    r.tilly.dispose();
  });
});

describe('the place wires it in', () => {
  it('the built area\'s life carries Tilly, one arbiter, a credit, and still one light in the whole place', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const progression = createProgression(memoryStorage());
    const life = area.life({ scene, progression, reducedMotion: false, tier: null, sendEvent: () => {} });
    expect(typeof life.promptAt).toBe('function');
    expect(typeof life.credit).toBe('function');
    expect(life.promptAt(nearTilly({ tilly: life.tilly }))).toBe(phrase('snowville.tilly.prompt'));
    expect(life.interact()).toBe('meet');
    expect(life.credit({ kind: 'sv-light', candle: 0 })).toBe('first');
    let lights = 0;
    scene.traverse((o) => { if (o.isLight && o.isPointLight) lights++; });
    expect(lights).toBe(1);
    life.update(0.05, 0, at(0, 30), null, sess());
    life.dispose();
  });
  it('the prompt arbiter asks Tilly first and then the stage slots (which answer nothing yet)', () => {
    const fake = { promptAt: () => 'x', interact: () => 'did' };
    const a = createSnowvillePrompts(fake);
    expect(a.promptAt({ x: 0, z: 0 })).toBe('x');
    expect(a.interact()).toBe('did');
    const none = createSnowvillePrompts({ promptAt: () => null, interact: () => null });
    expect(none.promptAt({ x: 0, z: 0 })).toBe(null);
    expect(none.interact()).toBe(null);
  });
});

describe('the words', () => {
  it('"Tilly" is spelled in ONE table: nowhere else in the new code', () => {
    expect(NAMES.tilly).toBe('Tilly');
    for (const f of ['snowvillemission.js', 'snowvillestory.js', 'snowvillelife.js']) expect(read(`src/world/${f}`).replace(/\/\/.*$/gm, ''), f).not.toMatch(/(['"`])[^'"`\n]*Tilly[^'"`\n]*\1/); // (no string literal names her)
    expect(phrase('snowville.tilly.prompt')).toContain(NAMES.tilly);
  });
  it('every line reads the same in the everyday set and holds no series word or banned word; none is a bare placeholder', () => {
    const on = Object.keys(LINES).map((k) => [k, phrase(k)]);
    withOffWords(() => { for (const [k, v] of on) { expect(phrase(k), k).toBe(v); expect(bannedIn(phrase(k)), k).toBeNull(); } });
    for (const [k, v] of on) expect(v.length, k).toBeGreaterThan(8);
  });
  it('no literal Clan outside the words files, and none of the area\'s banned words in the new code\'s lines', () => {
    for (const f of ['snowvillemission.js', 'snowvillestory.js', 'snowvillelife.js', 'snowvillewords.js']) expect(read(`src/world/${f}`), f).not.toMatch(/Clan/);
    for (const v of Object.values(LINES)) expect(v).not.toMatch(/\b(dark|lost forever|trapped|stuck|collapse|scary)\b/i);
  });
  it('the sanitiser\'s candle table is the mission\'s', () => {
    expect(read('src/progression.js')).toContain(`const SNOWVILLE_CANDLES_AT = [${M.CANDLES_AT.join(', ')}]`);
  });
});
