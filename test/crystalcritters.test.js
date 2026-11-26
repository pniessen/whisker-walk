// The Crystal Cave, milestone C4: glow-bugs, dust, drips and soft sound. Pure of time, tiered, still under reduced motion, silent when muted, three draws.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import * as C from '../src/world/crystalcritters.js';
import * as S from '../src/world/crystalsound.js';
import * as P from '../src/world/crystalplan.js';
import { withLocalUuids } from '../src/world/localuuids.js';

const HIGH = { name: 'high', rung: 0, shadows: true };
const LOW = { name: 'low', rung: 3, shadows: true };
const LITE = { name: 'low', rung: 5, shadows: false };
const make = (tier, reducedMotion = false) => { const scene = new THREE.Scene(); return { scene, c: withLocalUuids('t', () => C.createCrystalCritters({ scene, tier, reducedMotion })) }; };
const fakeAudio = (muted) => {
  const log = { ctx: 0, osc: 0 };
  const node = () => ({ connect() {}, start() {}, stop() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, value: 0 }, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 } });
  const ac = { currentTime: 0, destination: {}, createGain: node, createOscillator: () => { log.osc++; return node(); } };
  return { log, isMuted: () => muted.v, getContext: () => { log.ctx++; return ac; } };
};

describe('the small life', () => {
  it('is three draws: one bug Points, one dust Points, one drip InstancedMesh', () => {
    const { scene, c } = make(HIGH);
    expect(scene.children.length).toBe(3);
    expect(c.counts.draws).toBe(3);
    expect(scene.children.filter((o) => o.isPoints).length).toBe(2);
    expect(scene.children.filter((o) => o.isInstancedMesh).length).toBe(1);
  });
  it('has fewer bugs on LOW and LITE than on HIGH', () => {
    const h = make(HIGH).c.counts; const l = make(LOW).c.counts; const li = make(LITE).c.counts;
    expect(h.bugs).toBe(40); expect(l.bugs).toBe(20); expect(li.bugs).toBe(14);
    expect(l.dust).toBeLessThan(h.dust);
  });
  it('is a pure function of time and keeps every mote in the cave, above the floor', () => {
    const a = C.bugPos(5, 12.5, {}); const b = C.bugPos(5, 12.5, {});
    expect(a).toEqual(b);
    expect(C.bugPos(5, 13.5, {})).not.toEqual(a);
    for (let i = 0; i < C.BUG_COUNT.high; i++) for (let t = 0; t < 300; t += 11.3) {
      const p = C.bugPos(i, t, {});
      expect(p.x).toBeGreaterThan(P.CRYSTAL_BOUNDS.minX); expect(p.x).toBeLessThan(P.CRYSTAL_BOUNDS.maxX);
      expect(p.z).toBeGreaterThan(P.CRYSTAL_BOUNDS.minZ); expect(p.z).toBeLessThan(P.CRYSTAL_BOUNDS.maxZ);
      expect(p.y).toBeGreaterThan(P.crystalY(p.x, p.z) + 0.5);
    }
    for (let i = 0; i < C.DUST_COUNT.high; i++) { const p = C.dustPos(i, 40, {}); expect(Math.abs(p.x)).toBeLessThan(36); expect(p.z).toBeLessThan(32); }
  });
  it('moves with the clock, and stands still under reduced motion', () => {
    const m = make(HIGH); m.c.update(1); const a = [...m.c.bugs.pts.geometry.attributes.position.array]; m.c.update(5);
    expect([...m.c.bugs.pts.geometry.attributes.position.array]).not.toEqual(a);
    const r = make(HIGH, true); r.c.update(1); const b = [...r.c.bugs.pts.geometry.attributes.position.array]; r.c.update(30);
    expect([...r.c.bugs.pts.geometry.attributes.position.array]).toEqual(b);
    expect(r.c.counts.bugs).toBe(C.BUG_COUNT.high); // still there
    expect(b.some((v) => v !== 0)).toBe(true);
  });
  it('drips on the pool and in the Rose hall, on a schedule that is pure', () => {
    const near = (z, s) => P.zoneAt(s.x, s.z) === z;
    expect(C.DRIP_SITES.filter((s) => near('pool', s)).length).toBe(2);
    expect(C.DRIP_SITES.filter((s) => near('rose', s)).length).toBe(1);
    let drops = 0;
    for (let n = 0; n < 100; n++) { const a = C.dripIn(0, n); expect(a).toEqual(C.dripIn(0, n)); if (a !== null) { drops++; expect(a).toBeGreaterThanOrEqual(n * C.DRIP.slot); expect(a + C.DRIP.life).toBeLessThanOrEqual((n + 1) * C.DRIP.slot + 1e-9); } }
    expect(drops).toBeGreaterThan(40); expect(drops).toBeLessThan(95);
  });
});

describe('the sound', () => {
  const cat = { x: 12, z: -3 };
  it('asks for nothing when muted', () => {
    const muted = { v: true }; const a = fakeAudio(muted); const s = S.createCrystalSound({ audio: a });
    for (let i = 0; i < 600; i++) s.update(0.1, cat);
    expect(a.log.ctx).toBe(0); expect(a.log.osc).toBe(0); expect(s.humming).toBe(false); expect(s.plinks + s.notes).toBe(0);
  });
  it('hums, plinks near a drip, and goes quiet again when muted', () => {
    const muted = { v: false }; const a = fakeAudio(muted); const s = S.createCrystalSound({ audio: a });
    for (let i = 0; i < 300; i++) s.update(0.1, cat);
    expect(s.humming).toBe(true); expect(s.plinks).toBeGreaterThan(3);
    muted.v = true; s.update(0.1, cat); expect(s.humming).toBe(false);
    const was = s.plinks; for (let i = 0; i < 300; i++) s.update(0.1, cat); expect(s.plinks).toBe(was);
  });
  it('is silent for drips far away', () => {
    const a = fakeAudio({ v: false }); const s = S.createCrystalSound({ audio: a });
    for (let i = 0; i < 600; i++) s.update(0.1, { x: -30, z: -28 });
    expect(s.plinks).toBe(0);
  });
  it('sings a great crystal once on arriving, and again only after she has been away', () => {
    const a = fakeAudio({ v: false }); const s = S.createCrystalSound({ audio: a });
    const at = { x: P.ROSE_GREAT.x + 1.5, z: P.ROSE_GREAT.z };
    for (let i = 0; i < 400; i++) s.update(0.1, at);
    expect(s.notes).toBe(1);
    for (let i = 0; i < 100; i++) s.update(0.1, { x: 0, z: 20 });
    for (let i = 0; i < 20; i++) s.update(0.1, at);
    expect(s.notes).toBe(2);
  });
});
