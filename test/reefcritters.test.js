// The Reef, milestone R4: its creatures and its sound. One fish draw, a pure function of time, tiers, reduced motion, a muted sound that asks for nothing.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as C from '../src/world/reefcritters.js';
import * as S from '../src/world/reefsound.js';
import * as P from '../src/world/reefplan.js';
import { withLocalUuids } from '../src/world/localuuids.js';
import { createReefLife } from '../src/world/reeflife.js';

const HIGH = { name: 'high', rung: 0, shadows: true };
const LOW = { name: 'low', rung: 3, shadows: true };
const LITE = { name: 'low', rung: 5, shadows: false };
const make = (tier, reducedMotion = false) => { const scene = new THREE.Scene(); return { scene, c: withLocalUuids('t', () => C.createReefCritters({ scene, tier, reducedMotion })) }; };
const tris = (o) => { const g = o.geometry; return ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1); };
const fakeAudio = (muted) => {
  const log = { ctx: 0, osc: 0 };
  const node = () => ({ connect() {}, start() {}, stop() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, value: 0 }, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 } });
  const ac = { currentTime: 0, destination: {}, createGain: node, createOscillator: () => { log.osc++; return node(); } };
  return { log, isMuted: () => muted.v, getContext: () => { log.ctx++; return ac; } };
};

describe('the school', () => {
  it('is one InstancedMesh (one draw) and a pure function of time', () => {
    const { scene, c } = make(HIGH);
    const inst = scene.children.filter((o) => o.isInstancedMesh && o.name === 'reef:fish');
    expect(inst.length).toBe(1);
    expect(inst[0].count).toBe(C.fishCount('high').total);
    const t = C.fishTable('high');
    const a = C.fishPose(t[3], 12.5, {}); const b = C.fishPose(t[3], 12.5, {});
    expect(a).toEqual(b);
    expect(C.fishPose(t[3], 13.5, {})).not.toEqual(a);
    c.update(1); const m1 = inst[0].instanceMatrix.array.slice(); c.update(0);
    const s2 = make(HIGH); s2.c.update(1);
    expect([...s2.scene.children.find((o) => o.name === 'reef:fish').instanceMatrix.array]).toEqual([...m1]);
  });
  it('keeps every fish above the sand and inside the walk, whatever the time', () => {
    for (const rung of ['high', 'low', 'lite']) for (const f of C.fishTable(rung)) for (let t = 0; t < 400; t += 7.3) {
      const p = C.fishPose(f, t, {});
      expect(p.y).toBeGreaterThan(P.reefY(p.x, p.z) + 0.8);
      expect(Math.abs(p.x)).toBeLessThan(60); expect(Math.abs(p.z)).toBeLessThan(60);
    }
  });
  it('has fewer fish on LOW and none of the small ones on LITE', () => {
    const h = C.fishCount(C.reefTier(HIGH)); const l = C.fishCount(C.reefTier(LOW)); const li = C.fishCount(C.reefTier(LITE));
    expect(C.reefTier(LOW)).toBe('low'); expect(C.reefTier(LITE)).toBe('lite');
    expect(l.total).toBeLessThan(h.total); expect(li.small).toBe(0); expect(li.big).toBeGreaterThan(0);
    expect(make(LITE).c.counts.fish).toBe(li.total);
    expect(make(LOW).c.counts.fish).toBe(l.total);
  });
});

describe('Sela, the crabs, the bubbles', () => {
  it('Sela stays on the Sandy Flats, moves slowly and smoothly, and is the same at the same time', () => {
    const f = P.ZONES.find((z) => z.id === 'flats');
    for (const w of C.SELA_WAYPOINTS) expect(Math.hypot(w.x - f.x, w.z - f.z)).toBeLessThan(f.r);
    let prev = C.selaPose(0, {});
    for (let t = 0.5; t < 300; t += 0.5) {
      const p = C.selaPose(t, {});
      expect(Math.hypot(p.x - f.x, p.z - f.z)).toBeLessThan(f.r + 2);
      expect(Math.hypot(p.x - prev.x, p.z - prev.z) / 0.5).toBeLessThan(1.2);
      prev = p;
    }
    expect(C.selaPose(41, {})).toEqual(C.selaPose(41, {}));
  });
  it('crabs stay within a metre of their holes', () => {
    for (const h of C.CRAB_HOMES) for (let t = 0; t < 200; t += 3.1) { const p = C.crabPose(h, t, {}); expect(Math.hypot(p.x - h.x, p.z - h.z)).toBeLessThanOrEqual(1.001); }
  });
  it('bubbles: 60, 20 in reduced motion (one Points each), rising and deterministic', () => {
    const a = make(HIGH); const r = make(HIGH, true);
    expect(a.c.counts.bubbles).toBe(60); expect(r.c.counts.bubbles).toBe(20);
    expect(a.scene.children.filter((o) => o.isPoints).length).toBe(1);
    expect(C.bubblePos(5, 10, {})).toEqual(C.bubblePos(5, 10, {}));
    for (let i = 0; i < 60; i++) for (let t = 0; t < 60; t += 4.3) { const p = C.bubblePos(i, t, {}); expect(p.y).toBeLessThan(P.SURFACE_Y); expect(p.y).toBeGreaterThan(P.reefY(p.x, p.z) - 0.5); }
  });
  it('reduced motion poses everything once and never moves it', () => {
    const { scene, c } = make(HIGH, true);
    c.update(0.1);
    const snap = [...scene.getObjectByName('reef:fish').instanceMatrix.array, ...scene.getObjectByName('reef:bubbles').geometry.attributes.position.array, scene.getObjectByName('reef:sela').position.x];
    c.update(5); c.update(5);
    expect([...scene.getObjectByName('reef:fish').instanceMatrix.array, ...scene.getObjectByName('reef:bubbles').geometry.attributes.position.array, scene.getObjectByName('reef:sela').position.x]).toEqual(snap);
  });
  it('fits the planning life budget (about 8 meshes, 0 casters, 3,000 triangles), and disposes', () => {
    const { scene, c } = make(HIGH);
    let meshes = 0; let tri = 0; let casters = 0;
    scene.traverse((o) => { if (o.isMesh || o.isPoints) { meshes++; if (o.isMesh) tri += tris(o); } if (o.castShadow) casters++; });
    // measured 2026-11-26: 6 meshes (fish, Sela's three, crabs, bubbles), 1,412 triangles counting every instance, 42 fish, 7 crabs
    expect([meshes, tri, c.counts.fish, c.counts.crabs]).toEqual([6, 1412, 42, 7]);
    expect(meshes).toBeLessThanOrEqual(8); expect(casters).toBe(0); expect(tri).toBeLessThanOrEqual(3000);
    c.dispose();
    expect(scene.children.length).toBe(0);
  });
});

describe('the sound', () => {
  it('muted: no context is requested and no node is made', () => {
    const au = fakeAudio({ v: true }); const s = S.createReefSound({ audio: au });
    for (let i = 0; i < 400; i++) s.update(0.1);
    expect(au.log.ctx).toBe(0); expect(au.log.osc).toBe(0); expect(s.humming).toBe(false);
  });
  it('unmuted: a hum and hashed blips; muting later stops the hum and asks for nothing more', () => {
    const m = { v: false }; const au = fakeAudio(m); const s = S.createReefSound({ audio: au });
    for (let i = 0; i < 300; i++) s.update(0.1);
    expect(s.humming).toBe(true); expect(s.blips).toBeGreaterThan(3);
    const m2 = { v: false }; const au2 = fakeAudio(m2); const s2 = S.createReefSound({ audio: au2 });
    for (let i = 0; i < 300; i++) s2.update(0.1);
    expect(s2.blips).toBe(s.blips); // the same walk clock, the same blips
    m.v = true; const ctx = au.log.ctx; s.update(0.1);
    expect(s.humming).toBe(false); expect(au.log.ctx).toBe(ctx);
  });
  it('no audio at all is silent too', () => { const s = S.createReefSound({ audio: undefined }); s.update(1); expect(s.blips).toBe(0); });
});

describe('the rules of the make', () => {
  it('has distinct salts', () => {
    const all = [...Object.values(C.SALTS), ...Object.values(S.SOUND_SALTS)];
    expect(new Set(all).size).toBe(all.length);
  });
  it('draws no Math.random and reads no clock', () => {
    for (const f of ['reefcritters.js', 'reefsound.js']) {
      const code = readFileSync(new URL(`../src/world/${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
      expect(code).not.toMatch(/\bfloatY\b/);
    }
  });
  it('has no player-facing words (none to put in the word sets)', () => {
    const code = readFileSync(new URL('../src/world/reefcritters.js', import.meta.url), 'utf8');
    expect(code).not.toMatch(/phrase\(|textContent/);
  });
  it('the life makes the creatures and takes them away again', () => {
    const scene = new THREE.Scene();
    const au = fakeAudio({ v: true });
    const life = withLocalUuids('t2', () => createReefLife({ scene, tier: HIGH, audio: au, doc: null }));
    expect(scene.getObjectByName('reef:fish')).toBeTruthy();
    life.update(0.1, 0.1, new THREE.Vector3(0, 0, 36), new THREE.PerspectiveCamera(), null);
    expect(au.log.ctx).toBe(0);
    life.dispose();
    expect(scene.getObjectByName('reef:fish')).toBeUndefined();
  });
});
