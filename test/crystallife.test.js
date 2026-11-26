// The Crystal Cave, milestone C2: Lumi and chapter one running on a walk. The stone is the story's own item: carried in her mouth, never saved, never in the walk's
// mouth, so every way a walk can end with a stone in her mouth leaves it back at its spot and sends nothing to the den.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createLumi, humNote } from '../src/world/crystallife.js';
import { build } from '../src/world/crystal.js';
import * as S from '../src/world/crystalstory.js';
import * as P from '../src/world/crystalplan.js';
import { createProgression } from '../src/progression.js';
import { createMouth, walkEndMarks } from '../src/carry.js';
import { bus } from '../src/events.js';
import { memoryStorage } from './helpers/storage.js';

const sess = () => ({ cat: { rotation: { y: 0 } } });
const rigged = (rec = null) => {
  const storage = memoryStorage();
  const progression = createProgression(storage);
  if (rec) { progression.state.crystal = { ...progression.state.crystal, ...rec }; progression.addPoints(0); }
  const scene = new THREE.Scene();
  const heard = [];
  const off = bus.on('discovery', (e) => heard.push(e));
  const lum = createLumi({ scene, progression, reducedMotion: false });
  return { storage, progression, scene, lum, heard, off };
};
const at = (x, z) => ({ x, z, y: P.crystalY(x, z) });
const tick = (r, cat, n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) r.lum.update(dt, i * dt, cat, null, sess()); };
const press = (r, cat) => { tick(r, cat, 1); const line = r.lum.promptAt(cat); const k = line ? r.lum.interact() : null; return { line, k }; };
const rose = S.CRYSTALS[0];
const stone = S.STONES[0];

describe('chapter one on a walk', () => {
  it('says hello (step 1), takes the rose stone (step 2 when set on the Rose crystal), and never saves what she carries', () => {
    const r = rigged();
    expect(r.lum.promptAt(at(0, 28))).toBe(null);
    const l = r.lum.lumi;
    expect(press(r, at(l.x + 1.2, l.z)).k).toBe('meet');
    expect(r.progression.state.crystal.step).toBe(1);
    expect(press(r, at(stone.x + 4, stone.z)).k).toBe(null); // too far to pick
    expect(press(r, at(stone.x + 0.8, stone.z)).k).toBe('pick');
    expect(r.lum.state.carrying).toBe(0);
    expect(r.lum.state.stoneModes[0]).toBe('carried');
    expect(r.progression.state.crystal.sparks).toBe(0); // carrying is never saved
    expect(press(r, at(stone.x + 0.8, stone.z)).k).toBe(null); // a second pick is not offered with a full mouth
    expect(press(r, at(rose.x + 10, rose.z)).k).toBe(null);
    expect(r.lum.state.glow).toBe(0);
    expect(press(r, at(rose.x + 2, rose.z + 1.5)).k).toBe('give');
    expect(r.progression.state.crystal).toMatchObject({ step: 2, sparks: 1 });
    expect(r.lum.state.carrying).toBe(null);
    expect(r.lum.state.stoneModes).toEqual(['given']);
    tick(r, at(rose.x + 2, rose.z + 1.5), 40);
    expect(r.lum.state.glow).toBeGreaterThan(0.9);
    // chapter one is done: nothing else is offered, nothing can go wrong
    expect(r.lum.promptAt(at(stone.x, stone.z))).toBe(null);
    r.lum.dispose(); r.off();
  });
  it('the Rose crystal lights, the one real light turns up, a note plays unless muted, and the tail turns pink', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    expect(area).toBeTruthy();
    const progression = createProgression(memoryStorage());
    progression.state.crystal = { ...progression.state.crystal, step: 1, sparks: 0 };
    const notes = [];
    const audio = { isMuted: () => false, getContext: () => ({ currentTime: 0, createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }), createOscillator: () => { notes.push(1); return { frequency: {}, connect() {}, start() {}, stop() {} }; }, destination: {} }), chime() {} };
    const life = area.life({ scene, progression, audio, reducedMotion: false, tier: { name: 'high', shadows: true } });
    const light = scene.getObjectByName('crystal:light');
    expect(light.intensity).toBe(0);
    const tailBefore = scene.getObjectByName('crystal:lumi').userData.tail.material.color.getHex();
    life.update(0.05, 0, at(stone.x + 0.8, stone.z), null, sess());
    expect(life.promptAt(at(stone.x + 0.8, stone.z))).toMatch(/spark stone/i);
    life.interact();
    life.update(0.05, 0.1, at(rose.x + 2, rose.z + 1.5), null, sess());
    expect(life.promptAt(at(rose.x + 2, rose.z + 1.5))).toMatch(/crystal/i);
    life.interact();
    expect(notes.length).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) life.update(0.05, i * 0.05, at(rose.x + 2, rose.z + 1.5), null, sess());
    expect(light.intensity).toBeGreaterThan(0.5);
    const tailAfter = scene.getObjectByName('crystal:lumi').userData.tail.material.color.getHex();
    expect(tailAfter).not.toBe(tailBefore);
    expect(tailAfter).toBe(0xff6fa8);
    const lights = []; scene.traverse((o) => { if (o.isPointLight) lights.push(o); });
    expect(lights).toHaveLength(1);
    life.dispose();
    expect(light.intensity).toBe(0);
  });
  it('is silent when muted: no context is asked for', () => {
    let asked = 0;
    expect(humNote({ isMuted: () => true, getContext: () => { asked++; return null; } })).toBe(false);
    expect(humNote(null)).toBe(false);
    expect(asked).toBe(0);
  });
  it('the meow calls Lumi: a picture of a spark or a heart (no text) and a ring toward the goal; it never fails', () => {
    for (const rec of [{ step: 0, sparks: 0 }, { step: 1, sparks: 0 }, { step: 2, sparks: 1 }]) {
      const r = rigged(rec);
      tick(r, at(0, 28), 2);
      bus.emit('tip:did', { id: 'call' }); tick(r, at(0, 28), 2);
      expect(['spark', 'heart']).toContain(r.lum.bubble.icon);
      expect(r.scene.getObjectByName('crystal:meowRing').visible).toBe(true);
      r.lum.dispose(); r.off();
    }
  });
  it('the goal of the ring is the stone, then the Rose crystal, with the stone in her mouth', () => {
    const r = rigged({ step: 1, sparks: 0 });
    expect(r.lum.goalNow()).toMatchObject({ x: stone.x, z: stone.z, g: { kind: 'stone', icon: 'spark' } });
    press(r, at(stone.x + 0.8, stone.z));
    expect(r.lum.goalNow()).toMatchObject({ x: rose.x, z: rose.z, g: { kind: 'deliver' } });
    r.lum.dispose(); r.off();
  });
});

describe('a carried stone is never lost and never sent to the den, however the walk ends', () => {
  const carry = () => {
    const r = rigged({ step: 1, sparks: 0 });
    expect(press(r, at(stone.x + 0.8, stone.z)).k).toBe('pick');
    expect(r.lum.state.carrying).toBe(0);
    return r;
  };
  const before = (r) => JSON.stringify(r.progression.state);
  it('a walk ends (leaving, a teleport, a room left, the app closed: all dispose) with the stone carried: nothing saved, the next walk finds it at its spot', () => {
    const r = carry();
    const snap = before(r);
    r.lum.dispose();
    expect(before(r)).toBe(snap);
    expect(r.progression.state.crystal).toMatchObject({ step: 1, sparks: 0 });
    const next = createProgression(r.storage); // a reload from the saved game
    expect(next.state.crystal).toMatchObject({ step: 1, sparks: 0 });
    const scene2 = new THREE.Scene();
    const l2 = createLumi({ scene: scene2, progression: next });
    expect(l2.state.carrying).toBe(null);
    expect(l2.state.stoneModes[0]).toBe('home');
    l2.update(0.05, 0, at(0, 28), null, sess());
    const st = scene2.getObjectByName('crystal:stone:rose');
    expect(st.position.x).toBeCloseTo(stone.x, 6); expect(st.position.z).toBeCloseTo(stone.z, 6);
    expect(l2.promptAt(at(stone.x + 0.8, stone.z))).toMatch(/spark stone/i); // and it can be taken again at once
    l2.dispose(); r.off();
  });
  it('it never touches the walk\'s mouth: the walk-end marks are empty, and no source of the story names the carry module', () => {
    const mouth = createMouth();
    const r = carry();
    expect(mouth.held).toBe(null);
    expect(walkEndMarks(mouth, 'crystal', 1)).toEqual([]);
    for (const f of ['src/world/crystallife.js', 'src/world/crystalstory.js', 'src/crystalmission.js']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/carry\.js|createMouth|walkEndMarks/);
    r.lum.dispose(); r.off();
  });
  it('the room finishing the step, a resume (a new life), and a stone carried and then given elsewhere: never saved wrong', () => {
    const r = carry();
    expect(r.lum.credit({ kind: 'bring', stone: 0 })).toBe('rose');
    expect(r.lum.state.carrying).toBe(null);
    expect(r.progression.state.crystal).toMatchObject({ step: 2, sparks: 1 });
    expect(r.lum.credit({ kind: 'bring', stone: 0 })).toBe(null);
    r.lum.dispose();
    const again = createLumi({ scene: new THREE.Scene(), progression: r.progression });
    expect(again.state.carrying).toBe(null);
    expect(again.state.stoneModes[0]).toBe('given');
    again.dispose(); r.off();
  });
  it('disposing twice, or with no cat ever seen, is safe; and a dispose removes every object it added', () => {
    const r = rigged();
    expect(r.scene.children.length).toBeGreaterThan(0);
    r.lum.dispose(); r.lum.dispose();
    expect(r.scene.children).toHaveLength(0);
    r.off();
    const r2 = rigged(); r2.lum.update(0.1, 0, null, null, null); r2.lum.dispose(); r2.off();
  });
  it('the whole life: a built cave, a walk ended with the stone carried leaves the saved record and the scene whole', () => {
    const progression = createProgression(memoryStorage());
    progression.state.crystal = { ...progression.state.crystal, step: 1, sparks: 0 };
    const scene = new THREE.Scene();
    const area = build(scene);
    const kids = scene.children.length;
    const life = area.life({ scene, progression, reducedMotion: false });
    expect(typeof life.promptAt).toBe('function');
    const cat = at(stone.x + 0.8, stone.z);
    life.update(0.05, 0, cat, new THREE.PerspectiveCamera(), sess());
    expect(life.promptAt(cat)).toMatch(/stone/i);
    life.interact();
    expect(life.lumi.state.carrying).toBe(0);
    const snap = JSON.stringify(progression.state);
    life.dispose();
    expect(JSON.stringify(progression.state)).toBe(snap);
    expect(scene.children.length).toBe(kids);
  });
});

describe('the draw budget', () => {
  it('Lumi\'s whole life adds a few drawn objects, none a shadow caster', () => {
    const r = rigged();
    let drawn = 0;
    r.scene.traverse((o) => { if (o.isMesh || o.isSprite || o.isPoints) { drawn++; expect(o.castShadow).toBeFalsy(); } });
    expect(drawn).toBeLessThanOrEqual(16);
    r.lum.dispose(); r.off();
  });
});
