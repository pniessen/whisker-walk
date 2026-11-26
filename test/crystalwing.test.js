// The Crystal Cave, milestone C5: wing B. The Blue Pool and its stepping crystals, the Gold Gallery and its nook, the Heart Crystal, the sky and gold spark stones,
// steps 3 to 7 of the pure machine, the light show (a pure function of one start time), the pay once, the co-walk credit, every walk ending, and reach on foot
// with no skills.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as M from '../src/crystalmission.js';
import * as S from '../src/world/crystalstory.js';
import * as P from '../src/world/crystalplan.js';
import * as W from '../src/world/crystalwingplan.js';
import { showAt, SHOW } from '../src/world/crystalshow.js';
import { build } from '../src/world/crystal.js';
import { createProgression } from '../src/progression.js';
import { canReach, BASE_CLIMB_BUDGET } from '../src/climbing.js';
import { bus } from '../src/events.js';
import { memoryStorage } from './helpers/storage.js';
import { GOLD_MICE } from '../src/goldmice.js';

const B = P.CRYSTAL_BOUNDS;
const rec = (step, sparks = M.SPARKS_AT[step]) => ({ step, sparks, album: 0 });

describe('steps 3 to 7 of the pure machine', () => {
  it('the sky stone, the gold stone, the passages, the Heart waking and the show\'s pay, strictly in order; the other keys come back untouched', () => {
    let r = M.apply(rec(2), { kind: 'bring', stone: 2 });
    expect(r.changed).toBe(false); // gold before sky
    r = M.apply(rec(2), { kind: 'bring', stone: 1 });
    expect(r).toMatchObject({ changed: true, effect: 'sky' });
    expect(r.crystal).toEqual({ step: 3, sparks: 3, album: 0 });
    expect(M.apply(r.crystal, { kind: 'lit' }).changed).toBe(false); // not yet
    r = M.apply(r.crystal, { kind: 'bring', stone: 2 });
    expect(r).toMatchObject({ effect: 'gold' });
    expect(r.crystal).toEqual({ step: 4, sparks: 7, album: 0 });
    expect(M.apply(r.crystal, { kind: 'wake' }).changed).toBe(false);
    r = M.apply(r.crystal, { kind: 'lit' });
    expect(r).toMatchObject({ changed: true, effect: 'lit' });
    expect(r.crystal.step).toBe(5);
    expect(M.apply(r.crystal, { kind: 'done' }).changed).toBe(false); // the show has not begun
    r = M.apply(r.crystal, { kind: 'wake' });
    expect(r).toMatchObject({ effect: 'wake' });
    expect(r.crystal.step).toBe(6);
    r = M.apply(r.crystal, { kind: 'done' });
    expect(r).toMatchObject({ effect: 'done' });
    expect(r.crystal).toEqual({ step: 7, sparks: 7, album: 0 });
    for (const k of ['lit', 'wake', 'done']) expect(M.apply(r.crystal, { kind: k }).changed).toBe(false);
  });
  it('credit takes every step before it, in order, from any earlier step', () => {
    for (let s = 0; s <= 6; s++) {
      const c = M.credit(rec(s), { kind: 'done' });
      expect(c.crystal.step, `from ${s}`).toBe(7); // the ladder starts at her hello, so even a first-time visitor is taken up in order
    }
    expect(M.credit(rec(5), { kind: 'wake' }).crystal.step).toBe(6);
    expect(M.credit(rec(7), { kind: 'wake' }).changed).toBe(false);
  });
  it('no step goes down, and no event can fail her', () => {
    for (const ev of [{ kind: 'lit' }, { kind: 'wake' }, { kind: 'done' }, { kind: 'bring', stone: 1 }, { kind: 'x' }, null]) {
      for (let s = 0; s <= 7; s++) expect(M.apply(rec(s), ev).crystal.step).toBeGreaterThanOrEqual(s);
    }
  });
  it('the next goal walks the stones, then the Heart, then rests', () => {
    expect(M.nextGoal(rec(2))).toMatchObject({ kind: 'stone', stone: 1 });
    expect(M.nextGoal(rec(2), 1)).toMatchObject({ kind: 'deliver', stone: 1 });
    expect(M.nextGoal(rec(4))).toMatchObject({ kind: 'heart' });
    expect(M.nextGoal(rec(5))).toMatchObject({ kind: 'heart' });
    expect(M.nextGoal(rec(7))).toMatchObject({ kind: 'rest' });
  });
});

describe('the light show is a pure function of one start time', () => {
  it('is finite for any input, inactive outside 0..20 s, and the same answer twice', () => {
    for (const k of [NaN, -5, -0.01, Infinity, 1e9, 0, 3, 10.99, 11, 19.99, 20, 20.01]) {
      const p = showAt(k);
      expect(JSON.stringify(p)).not.toMatch(/null|NaN|Infinity/);
      expect(showAt(k)).toEqual(p);
    }
    expect(showAt(-1).active).toBe(false);
    expect(showAt(5).active).toBe(true);
    expect(showAt(20.5).active).toBe(false);
    expect(showAt(10.9).pay).toBe(false);
    expect(showAt(SHOW.payAt).pay).toBe(true);
    expect(showAt(5).motes).toHaveLength(SHOW.motes);
    expect(showAt(0).heart).toBe(0);
    expect(showAt(4).heart).toBe(1);
  });
  it('the waves run blue, gold, rose, then the Heart', () => {
    const peak = (h) => { let best = 0; let at = 0; for (let k = 0; k <= 20; k += 0.05) { const w = showAt(k).waves[h]; if (w > best) { best = w; at = k; } } return at; };
    expect(peak('blue')).toBeLessThan(peak('gold'));
    expect(peak('gold')).toBeLessThan(peak('rose'));
    expect(peak('rose')).toBeLessThan(peak('heart'));
  });
});

describe('the wing\'s places', () => {
  const area = build(new THREE.Scene());
  it('every plan coordinate is inside the bounds and clear of the walk\'s solid things', () => {
    const inb = (x, z) => x > B.minX + 1 && x < B.maxX - 1 && z > B.minZ + 1 && z < B.maxZ - 1;
    const pts = [W.POOL, W.BLUE_GREAT, W.GOLD_GREAT, W.HEART_GREAT, W.SKY_STONE, W.GOLD_STONE, ...W.STEPPING, ...W.VEIN_SLABS, ...W.NOOK.rocks, ...W.HEART_RING, ...W.POOL_RING, ...W.GOLD_ROW, ...W.PASSAGES.flatMap((p) => p.lamps)];
    for (const p of pts) expect(inb(p.x, p.z), JSON.stringify(p)).toBe(true);
    for (const s of S.STONES) for (const c of area.colliders) expect(Math.hypot(s.x - c.x, s.z - c.z), `stone ${s.id} vs ${JSON.stringify(c)}`).toBeGreaterThan(c.r + 0.6);
    for (const m of GOLD_MICE.crystal) for (const c of area.colliders) expect(Math.hypot(m.x - c.x, m.z - c.z), m.id).toBeGreaterThan(c.r + 0.8);
  });
  it('the pool is where the plan puts the Blue Pool zone, the Gold Gallery holds the nook and the vein, the Heart is in its own zone', () => {
    expect(P.zoneAt(W.POOL.x, W.POOL.z)).toBe('pool');
    expect(P.zoneAt(W.SKY_STONE.x, W.SKY_STONE.z)).toBe('pool');
    expect(P.zoneAt(W.BLUE_GREAT.x, W.BLUE_GREAT.z)).toBe('pool');
    expect(P.zoneAt(W.NOOK.x, W.NOOK.z)).toBe('gold');
    expect(P.zoneAt(W.GOLD_GREAT.x, W.GOLD_GREAT.z)).toBe('gold');
    expect(P.zoneAt(W.HEART_GREAT.x, W.HEART_GREAT.z)).toBe('heart');
    // the sky stone lies across the water from the Blue crystal
    expect(Math.hypot(W.SKY_STONE.x - W.BLUE_GREAT.x, W.SKY_STONE.z - W.BLUE_GREAT.z)).toBeGreaterThan(2 * W.POOL.r);
  });
  it('the nook is ringed by nine glints and open to the south', () => {
    const life = area.life({ scene: new THREE.Scene(), progression: createProgression(memoryStorage()), reducedMotion: false });
    expect(W.NOOK.glints).toBe(9);
    life.dispose();
    const gap = Math.hypot(W.NOOK.rocks[0].x - W.NOOK.rocks[1].x, W.NOOK.rocks[0].z - W.NOOK.rocks[1].z) - W.NOOK.rocks[0].r - W.NOOK.rocks[1].r;
    expect(gap).toBeGreaterThan(1.4);
  });
  it('the scene holds the pool, the dormant Heart and the lamps; exactly one PointLight in the whole place, and none added by the life', () => {
    const scene = new THREE.Scene();
    build(scene);
    for (const n of ['crystal:pool', 'crystal:heartgreat', 'crystal:lamps']) expect(scene.getObjectByName(n), n).toBeTruthy();
    expect(scene.getObjectByName('crystal:heartgreat').material.color.r).toBeLessThan(0.5);
    let lights = 0;
    scene.traverse((o) => { if (o.isPointLight) lights++; });
    expect(lights).toBe(1);
  });
});

describe('everything is reachable on foot with no skills', () => {
  const area = build(new THREE.Scene());
  const g = area.ground;
  const step = 0.5;
  const nx = Math.round((B.maxX - B.minX) / step) + 1;
  const nz = Math.round((B.maxZ - B.minZ) / step) + 1;
  const key = (i, j) => j * nx + i;
  const free = (i, j) => { const x = B.minX + i * step; const z = B.minZ + j * step; return !area.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.3); };
  const seen = new Set();
  const start = [Math.round((P.CRYSTAL_SPAWN.x - B.minX) / step), Math.round((P.CRYSTAL_SPAWN.z - B.minZ) / step)];
  seen.add(key(...start));
  const queue = [start];
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di; const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz || seen.has(key(a, b)) || !free(a, b)) continue;
      if (!g.canStep(B.minX + i * step, B.minZ + j * step, B.minX + a * step, B.minZ + b * step)) continue;
      seen.add(key(a, b)); queue.push([a, b]);
    }
  }
  const within = (x, z, r) => {
    for (let dx = -r; dx <= r; dx += step) for (let dz = -r; dz <= r; dz += step) {
      if (Math.hypot(dx, dz) > r) continue;
      if (seen.has(key(Math.round((x + dx - B.minX) / step), Math.round((z + dz - B.minZ) / step)))) return true;
    }
    return false;
  };
  it('each stone, each great crystal and the Heart is within reach of a floor cell she can walk to from the spawn (no stepping crystal needed)', () => {
    for (const s of S.STONES) expect(within(s.x, s.z, s.reach - 0.3), `stone ${s.id}`).toBe(true);
    for (const c of S.CRYSTALS) expect(within(c.x, c.z, c.reach - 0.3), c.id).toBe(true);
    expect(within(S.HEART.x, S.HEART.z, S.HEART.reach - 0.3)).toBe(true);
    expect(within(W.NOOK.x, W.NOOK.z, 0.5)).toBe(true);
    expect(seen.has(key(Math.round((W.POOL.x - B.minX) / step), Math.round((W.POOL.z - B.minZ) / step)))).toBe(true); // the pool is a floor she can wade across
    for (const m of GOLD_MICE.crystal) expect(within(m.x, m.z, 0.5), m.id).toBe(true);
    for (const l of W.PASSAGES.flatMap((p) => p.lamps)) expect(within(l.x, l.z, 1.2)).toBe(true);
  });
  it('the stepping crystals are an optional climb: each hop is within reach with no skills, from the floor and on up the row', () => {
    const perches = area.perches;
    expect(perches).toHaveLength(6);
    const floorAt = (p) => P.crystalY(p.x, p.z);
    // from the floor beside the first one, up the row, with the base climb budget only
    const first = perches[0];
    expect(canReach(first, { x: first.x - 0.9, z: first.z }, floorAt(first), BASE_CLIMB_BUDGET)).toBe(true);
    for (let i = 1; i < perches.length; i++) expect(canReach(perches[i], perches[i - 1], perches[i - 1].y, BASE_CLIMB_BUDGET), `hop ${i}`).toBe(true);
    const last = perches[perches.length - 1];
    expect(canReach({ x: last.x + 1.2, z: last.z, y: floorAt({ x: last.x + 1.2, z: last.z }) }, last, last.y, BASE_CLIMB_BUDGET)).toBe(true); // down is always allowed
    for (const p of perches) { expect(p.kind).toBe('stone'); expect(p.requires).toBeUndefined(); }
  });
});

// ---- the whole story on a walk -----------------------------------------------------------------------------------------------------------------
const sess = () => ({ cat: { rotation: { y: 0 } } });
const at = (x, z) => ({ x, z, y: P.crystalY(x, z) });
function walk(step = 2, { reducedMotion = false, sent = [] } = {}) {
  const storage = memoryStorage();
  const progression = createProgression(storage);
  progression.state.crystal = { ...progression.state.crystal, step, sparks: M.SPARKS_AT[step] };
  progression.addPoints(0);
  const scene = new THREE.Scene();
  const area = build(scene);
  const awards = [];
  const seenKeys = new Set();
  const log = { awardOnce: (type, k, label) => { if (seenKeys.has(k)) return 0; seenKeys.add(k); awards.push({ type, k, label }); return 40; }, count: () => 0, mark: () => {} };
  const heard = [];
  const off = bus.on('discovery', (e) => heard.push(e));
  const life = area.life({ scene, progression, reducedMotion, log, audio: null, sendEvent: (e) => sent.push(e) });
  const tick = (cat, n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) life.update(dt, i * dt, cat, new THREE.PerspectiveCamera(), sess()); };
  const press = (cat) => { tick(cat); const line = life.promptAt(cat); return { line, k: line ? life.interact() : null }; };
  return { storage, progression, scene, area, life, awards, heard, off, tick, press, sent };
}
const sky = S.STONES[1]; const gold = S.STONES[2];
const blue = S.CRYSTALS[1]; const goldC = S.CRYSTALS[2];

describe('chapters two and three on a walk', () => {
  it('the sky stone across the pool, the Blue crystal; the gold stone from the nook, the Gold crystal; then the passages light by themselves', () => {
    const w = walk(2);
    expect(w.press(at(sky.x + 0.8, sky.z)).k).toBe('pick');
    expect(w.life.lumi.state.carrying).toBe(1);
    expect(w.progression.state.crystal.sparks).toBe(1); // never saved while carried
    expect(w.press(at(blue.x + 2, blue.z + 1)).k).toBe('give');
    expect(w.progression.state.crystal).toMatchObject({ step: 3, sparks: 3 });
    w.tick(at(blue.x + 2, blue.z + 1), 40);
    expect(w.life.lumi.halos[1].visible).toBe(true);
    expect(w.press(at(gold.x, gold.z + 1)).k).toBe('pick');
    expect(w.press(at(goldC.x + 2, goldC.z + 1)).k).toBe('give');
    expect(w.progression.state.crystal).toMatchObject({ step: 4, sparks: 7 });
    w.tick(at(goldC.x, goldC.z + 3), 20, 0.05); // 1 s: not yet
    expect(w.progression.state.crystal.step).toBe(4);
    w.tick(at(goldC.x, goldC.z + 3), 20, 0.05);
    expect(w.progression.state.crystal.step).toBe(5);
    const lamps = w.scene.getObjectByName('crystal:lamps');
    w.tick(at(goldC.x, goldC.z + 3), 60);
    expect(lamps.visible).toBe(true);
    expect(lamps.material.opacity).toBeGreaterThan(0.7);
    w.life.dispose(); w.off();
  });
  it('a stone carried when any walk ends is not saved and is home on the next walk', () => {
    const w = walk(2);
    expect(w.press(at(sky.x + 0.8, sky.z)).k).toBe('pick');
    const snap = JSON.stringify(w.progression.state);
    w.life.dispose();
    expect(JSON.stringify(w.progression.state)).toBe(snap);
    const again = createProgression(w.storage);
    expect(again.state.crystal).toMatchObject({ step: 2, sparks: 1 });
    const w2 = walk(2);
    expect(w2.life.lumi.state.carrying).toBe(null);
    expect(w2.life.lumi.state.stoneModes[1]).toBe('home');
    w2.life.dispose(); w2.off(); w.off();
    const src = readFileSync('src/world/crystalwing.js', 'utf8') + readFileSync('src/world/crystallife.js', 'utf8');
    expect(src).not.toMatch(/state\.crystal\.carrying|carrying:/);
  });
  it('the Heart sleeps until step 6, the action button wakes it from step 5, the show pays crystalstory once and gives the gem, a replay pays nothing', () => {
    const sent = [];
    const w = walk(5, { sent });
    const heart = w.scene.getObjectByName('crystal:heartgreat');
    const near = at(S.HEART.x - 2.5, S.HEART.z + 1);
    w.tick(near, 20);
    expect(heart.material.color.r).toBeLessThan(0.5);
    const far = at(S.HEART.x - 14, S.HEART.z);
    expect(w.life.promptAt(far)).toBe(null);
    const p = w.press(near);
    expect(p.k).toBe('wake');
    expect(w.progression.state.crystal.step).toBe(6);
    expect(sent).toEqual([{ kind: 'show', elapsed: 0 }]);
    expect(w.life.wing.showOn()).toBe(true);
    expect(w.life.promptAt(near)).toBe(null); // not offered while it is on
    w.tick(near, 100); // 5 s
    expect(w.awards).toHaveLength(0);
    expect(w.progression.state.crystal.step).toBe(6);
    expect(w.scene.getObjectByName('crystal:motes').visible).toBe(true);
    expect(heart.material.color.r).toBeGreaterThan(0.9);
    w.tick(near, 140); // to 12 s: past the pay moment
    expect(w.progression.state.crystal.step).toBe(7);
    expect(w.awards.map((a) => a.type)).toEqual(['crystalstory']);
    expect(w.progression.state.unlocked.accessories).toContain('glimmercollar');
    w.tick(near, 260); // the show ends
    expect(w.life.wing.showOn()).toBe(false);
    expect(w.scene.getObjectByName('crystal:motes').visible).toBe(false);
    // replay: offered, nothing more is paid
    const again = w.press(near);
    expect(again.k).toBe('replay');
    w.tick(near, 300);
    expect(w.awards).toHaveLength(1);
    w.life.dispose(); w.off();
  });
  it('a partner\'s show starts ours at the same second, takes the steps in order, and pays our own save once', () => {
    const sent = [];
    const w = walk(3, { sent });
    expect(w.life.credit({ kind: 'show', elapsed: 4 })).toBe('show-start');
    expect(w.progression.state.crystal.step).toBe(6);
    expect(w.life.wing.state.show.k).toBeCloseTo(4, 5);
    expect(sent).toEqual([]); // a credited show is not sent back
    expect(w.life.credit({ kind: 'show', elapsed: 2 })).toBe(null); // one at a time
    w.tick(at(0, 28), 150); // k goes past 11
    expect(w.progression.state.crystal.step).toBe(7);
    expect(w.awards).toHaveLength(1);
    expect(w.life.credit({ kind: 'bring', stone: 0 })).toBe(null);
    expect(w.life.credit({ kind: 'show', elapsed: NaN })).toBe(null);
    w.life.dispose(); w.off();
  });
  it('reduced motion: a still glow, no motes, the same pay moment, the same save', () => {
    const w = walk(5, { reducedMotion: true });
    const near = at(S.HEART.x - 2.5, S.HEART.z + 1);
    expect(w.press(near).k).toBe('wake');
    w.tick(near, 100);
    const motes = w.scene.getObjectByName('crystal:motes');
    expect(motes.visible).toBe(false);
    const a = w.life.wing.heartHalo.material.opacity;
    w.tick(near, 20);
    expect(w.life.wing.heartHalo.material.opacity).toBeCloseTo(a, 5);
    w.tick(near, 200);
    expect(w.progression.state.crystal.step).toBe(7);
    expect(w.awards).toHaveLength(1);
    w.life.dispose(); w.off();
  });
  it('the cave\'s one light stays one, follows the lit crystal, and goes to the Heart for the show; dispose leaves it at home', () => {
    const w = walk(5);
    const light = w.scene.getObjectByName('crystal:light');
    const home = light.position.clone();
    const near = at(S.HEART.x - 2.5, S.HEART.z + 1);
    w.tick(at(blue.x + 3, blue.z), 60);
    expect(light.intensity).toBeGreaterThan(0.5);
    w.press(near);
    w.tick(near, 80);
    expect(Math.hypot(light.position.x - S.HEART.x, light.position.z - S.HEART.z)).toBeLessThan(4);
    let lights = 0;
    w.scene.traverse((o) => { if (o.isPointLight) lights++; });
    expect(lights).toBe(1);
    w.life.dispose();
    expect(light.intensity).toBe(0);
    expect(light.position.distanceTo(home)).toBeLessThan(1e-6);
    expect(w.scene.getObjectByName('crystal:heart:halo')).toBeFalsy();
    w.off();
  });
});

describe('the wing\'s words', () => {
  it('every new line is read by a literal phrase id (the cave\'s phrase test lists crystalwingwords.js)', () => {
    const t = readFileSync('test/crystalmission.test.js', 'utf8');
    expect(t).toContain('crystalwingwords.js');
  });
});
