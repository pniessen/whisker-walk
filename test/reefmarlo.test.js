// The Reef, milestone R2: Marlo and chapter one running on a walk. The shell is the story's own item: carried in her mouth in front of her, never
// saved, never in the walk's mouth, so every way a walk can end with a shell in her mouth leaves it back at its spot and sends nothing to the den.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createMarlo } from '../src/world/reefmarlo.js';
import { createReefStoryLife as createReefLife } from '../src/world/reefstorylife.js';
import { build } from '../src/world/reef.js';
import * as S from '../src/world/reefstory.js';
import * as P from '../src/world/reefplan.js';
import { createProgression, SAVE_KEY } from '../src/progression.js';
import { createMouth, walkEndMarks } from '../src/carry.js';
import { bus } from '../src/events.js';
import { memoryStorage } from './helpers/storage.js';

const sess = () => ({ cat: { rotation: { y: 0 } } });
const rigged = (reef = null) => {
  const storage = memoryStorage();
  const progression = createProgression(storage);
  if (reef) { progression.state.reef = { ...progression.state.reef, ...reef }; progression.addPoints(0); }
  const scene = new THREE.Scene();
  const heard = [];
  const off = bus.on('discovery', (e) => heard.push(e));
  let pockets = 0;
  const mar = createMarlo({ scene, progression, reducedMotion: false, pocket: () => { pockets++; return true; } });
  return { storage, progression, scene, mar, heard, off, pockets: () => pockets };
};
const at = (x, z) => ({ x, z, y: P.reefY(x, z) });
const tick = (r, cat, n = 1, lift = 0, dt = 0.05) => { for (let i = 0; i < n; i++) r.mar.update(dt, i * dt, cat, null, sess(), lift); };
const press = (r, cat, lift = 0) => { tick(r, cat, 1, lift); const line = r.mar.promptAt(cat, lift); const k = line ? r.mar.interact() : null; return { line, k }; };
const meet = (r) => { const m = r.mar.marlo; tick(r, at(m.x + 1.2, m.z)); return press(r, at(m.x + 1.2, m.z)); };

describe('chapter one on a walk', () => {
  it('says hello (step 1), takes shell one on the sand (step 2 when given), shell two only by floating (step 3)', () => {
    const r = rigged();
    expect(r.mar.promptAt(at(0, 20))).toBe(null);
    expect(meet(r).k).toBe('meet');
    expect(r.progression.state.reef.step).toBe(1);
    // the ledge shell is not offered yet (Marlo wants shell one)
    expect(r.mar.promptAt(at(S.SHELLS[1].x - 1.5, S.SHELLS[1].z), 1.4)).toBe(null);
    const s0 = S.SHELLS[0];
    expect(press(r, at(s0.x + 3, s0.z)).k).toBe(null); // too far to pick
    expect(press(r, at(s0.x + 0.8, s0.z)).k).toBe('pick');
    expect(r.mar.state.carrying).toBe(0);
    expect(r.mar.state.shellModes[0]).toBe('carried');
    expect(r.progression.state.reef.shells).toBe(0); // carrying is never saved
    // walk back: Marlo comes close for a shell in her mouth, then it is given
    const cat = at(-3, 31);
    tick(r, cat, 200);
    expect(press(r, cat).k).toBe('give');
    expect(r.progression.state.reef).toMatchObject({ step: 2, shells: 1 });
    expect(r.mar.state.carrying).toBe(null);
    expect(r.mar.state.shellModes).toEqual(['given', 'home']);
    // shell two: on the sand beside the ledge she cannot reach it; floating at 1.1 she can
    const s1 = S.SHELLS[1];
    const beside = at(s1.x - 1.8, s1.z);
    expect(r.mar.promptAt(beside, 0)).toBe(null);
    expect(r.mar.promptAt(beside, 0.5)).toBe(null);
    expect(r.mar.promptAt(beside, 1.1)).toMatch(/shell/i);
    expect(press(r, beside, 1.1).k).toBe('pick');
    tick(r, at(-3, 31), 200);
    expect(press(r, at(-3, 31)).k).toBe('give');
    expect(r.progression.state.reef).toMatchObject({ step: 3, shells: 3 });
    expect(r.mar.promptAt(beside, 1.1)).toBe(null); // chapter one is done; nothing more to take
    r.mar.dispose(); r.off();
  });
  it('saves by step and shells to the real save, and the next walk starts from it', () => {
    const r = rigged();
    meet(r);
    const stored = JSON.parse(r.storage.getItem(SAVE_KEY) ?? '{}');
    expect(stored.reef?.step).toBe(1);
    const next = createProgression(r.storage);
    expect(next.state.reef.step).toBe(1);
    r.mar.dispose(); r.off();
  });
  it('picture bubbles (a shell, a question mark, a heart; never text) and the meow ring show the next goal', () => {
    const r = rigged();
    const cat = at(-2, 31);
    tick(r, cat, 2);
    bus.emit('tip:did', { id: 'call' });
    tick(r, cat, 2);
    expect(r.mar.bubble.icon).toBe('question'); // not met: the question mark
    expect(r.mar.bubble.sprite.visible).toBe(true);
    const ring = r.scene.getObjectByName('reef:meowRing');
    expect(ring.visible).toBe(true);
    tick(r, cat, 200); // the ring and the picture fade out by themselves
    expect(ring.visible).toBe(false); expect(r.mar.bubble.sprite.visible).toBe(false);
    meet(r);
    bus.emit('tip:did', { id: 'call' }); tick(r, cat, 2);
    expect(r.mar.bubble.icon).toBe('shell');
    const g = r.mar.goalNow();
    expect(g).toMatchObject({ x: S.SHELLS[0].x, z: S.SHELLS[0].z });
    const pos = ring.geometry.attributes.position;
    for (let i = 0; i < pos.count * 3; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
    r.mar.dispose(); r.off();
  });
  it('a meow with nothing to find is still a gentle answer (no stuck state, no fail): every step has a picture', () => {
    for (const reef of [{ step: 0 }, { step: 1 }, { step: 2, shells: 1 }, { step: 3, shells: 3 }, { step: 7, shells: 7 }]) {
      const r = rigged(reef);
      bus.emit('tip:did', { id: 'call' }); tick(r, at(0, 30), 2);
      expect(['question', 'shell', 'heart']).toContain(r.mar.bubble.icon);
      r.mar.dispose(); r.off();
    }
  });
});

describe('a carried shell is never lost and never sent to the den, however the walk ends', () => {
  const carryShellOne = () => {
    const r = rigged({ step: 1, shells: 0 });
    const s0 = S.SHELLS[0];
    expect(press(r, at(s0.x + 0.8, s0.z)).k).toBe('pick');
    expect(r.mar.state.carrying).toBe(0);
    return r;
  };
  const before = (r) => JSON.stringify(r.progression.state);
  it('the walk ends (dispose) with the shell in her mouth: nothing saved, nothing to the den, the next walk finds it at its spot', () => {
    const r = carryShellOne();
    const snap = before(r);
    r.mar.dispose();
    expect(before(r)).toBe(snap);
    expect(r.progression.state.reef).toMatchObject({ step: 1, shells: 0 });
    const next = createProgression(r.storage);
    expect(next.state.reef).toMatchObject({ step: 1, shells: 0 });
    const scene2 = new THREE.Scene();
    const m2 = createMarlo({ scene: scene2, progression: next, pocket: () => true });
    expect(m2.state.carrying).toBe(null);
    expect(m2.state.shellModes[0]).toBe('home');
    m2.update(0.05, 0, at(0, 30), null, sess(), 0);
    const sh = scene2.getObjectByName('reef:shellgroup0');
    expect(sh.position.x).toBeCloseTo(S.SHELLS[0].x, 6); expect(sh.position.z).toBeCloseTo(S.SHELLS[0].z, 6);
    m2.dispose(); r.off();
  });
  it('it never touches the walk\'s mouth: the walk-end marks are empty, and no source of the story names the carry module', () => {
    const mouth = createMouth();
    const r = carryShellOne();
    expect(mouth.held).toBe(null);
    expect(walkEndMarks(mouth, 'reef', 1)).toEqual([]);
    for (const f of ['src/world/reefmarlo.js', 'src/world/reefstory.js', 'src/reefmission.js', 'src/world/reefstorylife.js']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/carry\.js|createMouth|walkEndMarks/);
    r.mar.dispose(); r.off();
  });
  it('a warm bubble\'s lift, a resume (a new life), and the room finishing the step: the shell stays hers, goes home, or is simply gone, never saved wrong', () => {
    // the lift: the shell keeps following her to the ladder
    const r = carryShellOne();
    tick(r, at(S.POCKETS[0].x, S.POCKETS[0].z + 20), 3);
    tick(r, at(3.2, 34.4), 3);
    expect(r.mar.state.carrying).toBe(0);
    // someone else in the room gives that very shell: it is no longer in her mouth, and the step is credited once
    expect(r.mar.credit({ kind: 'bring', shell: 0 })).toBe('small');
    expect(r.mar.state.carrying).toBe(null);
    expect(r.progression.state.reef).toMatchObject({ step: 2, shells: 1 });
    expect(r.mar.credit({ kind: 'bring', shell: 0 })).toBe(null);
    r.mar.dispose();
    // a resume mid-walk is a new life: the shell is home again
    const again = createMarlo({ scene: new THREE.Scene(), progression: r.progression, pocket: () => true });
    expect(again.state.carrying).toBe(null);
    again.dispose(); r.off();
  });
  it('disposing twice, or with no cat ever seen, is safe', () => {
    const r = rigged();
    r.mar.dispose(); r.mar.dispose(); r.off();
    const r2 = rigged(); r2.mar.update(0.1, 0, null, null, null, 0); r2.mar.dispose(); r2.off();
  });
  it('the whole life: the saved record, the scene and the gauge stay whole when a walk ends with a shell carried', () => {
    const progression = createProgression(memoryStorage());
    progression.state.reef = { ...progression.state.reef, step: 1, shells: 0 };
    const scene = new THREE.Scene();
    build(scene);
    const kids = scene.children.length;
    const life = createReefLife({ scene, doc: null, progression, player: { floatY: 0, halt() {}, clearFloat() {} } });
    const s0 = S.SHELLS[0];
    const cat = at(s0.x + 0.8, s0.z);
    life.update(0.05, 0, cat, new THREE.PerspectiveCamera(), sess());
    expect(life.promptAt(cat)).toMatch(/shell/i);
    life.interact();
    expect(life.marlo.state.carrying).toBe(0);
    const snap = JSON.stringify(progression.state);
    life.dispose();
    expect(JSON.stringify(progression.state)).toBe(snap);
    expect(scene.children.length).toBeLessThanOrEqual(kids + 8);
  });
});

describe('the draw budget', () => {
  it('Marlo\'s whole life adds at most twelve drawn objects, none a shadow caster, and disposing removes them all', () => {
    const r = rigged();
    let drawn = 0;
    r.scene.traverse((o) => { if (o.isMesh || o.isSprite || o.isPoints) { drawn++; expect(o.castShadow).toBeFalsy(); } });
    expect(drawn).toBeLessThanOrEqual(12);
    r.mar.dispose();
    expect(r.scene.children).toHaveLength(0);
    r.off();
  });
});

describe('the first air pockets', () => {
  it('swimming into a pocket calls the life once, then it rests for a while and gives its air again', () => {
    const r = rigged();
    const p = S.POCKETS[0];
    tick(r, at(p.x + 5, p.z), 2);
    expect(r.pockets()).toBe(0);
    tick(r, at(p.x + 0.4, p.z), 3);
    expect(r.pockets()).toBe(1); // used; the next frames do not call again
    expect(r.mar.state.pocketLeft[0]).toBeGreaterThan(0);
    tick(r, at(p.x + 0.4, p.z), 40);
    expect(r.pockets()).toBe(1);
    tick(r, at(p.x + 0.4, p.z), 300); // 15 s later it has air again and, with her still in it, gives it
    expect(r.pockets()).toBeGreaterThanOrEqual(2);
    r.mar.dispose(); r.off();
  });
  it('in the real life a pocket refills the gauge and a full gauge keeps the pocket\'s air', () => {
    const progression = createProgression(memoryStorage());
    const scene = new THREE.Scene(); build(scene);
    const life = createReefLife({ scene, doc: null, progression, player: { floatY: 0, halt() {}, clearFloat() {} } });
    const p = S.POCKETS[0];
    const cat = at(p.x, p.z);
    life.update(0.05, 0, cat, new THREE.PerspectiveCamera(), sess());
    expect(life.marlo.state.pocketLeft[0]).toBe(0); // the gauge is full: nothing to fill, the pocket keeps its air
    life.air.t = 30; life.air.used = 60;
    life.update(0.05, 0.1, cat, new THREE.PerspectiveCamera(), sess());
    expect(life.air.used).toBeLessThan(0.1);
    expect(life.marlo.state.pocketLeft[0]).toBeGreaterThan(0);
    life.dispose();
  });
});
