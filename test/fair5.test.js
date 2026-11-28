// The Fairground's beauty pass 5 (src/fairpals.js): the copied spots agree with the place, the one wind and beat, the beds' blend, and the creatures' pools.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SPOTS, WIND, BEAT, PALS, bedWeights, createFairPals, syncToBeat } from '../src/fairpals.js';
import { BALE_SEATS, MGR_AT, GATE_AT, GATE_HALF } from '../src/world/fair.js';
import { FERRIS } from '../src/world/fairrides.js';
import { TUNE } from '../src/fairlive.js';
import { FAIR_CLOCK, setFairClock } from '../src/world/fairkit.js';
import { createFairAlive } from '../src/fairalive.js';

const STRAY_TRIS = 468; // measured 2026-11-28 (both tail frames)

describe('fair beauty pass 5', () => {
  it('the copied spots are the place\'s', () => {
    expect(SPOTS.gateZ).toBe(GATE_AT.z); expect(SPOTS.gateHalf).toBe(GATE_HALF); expect(SPOTS.mgr).toEqual({ x: MGR_AT.x, z: MGR_AT.z }); expect(SPOTS.wheelR).toBe(FERRIS.R);
    BALE_SEATS.forEach((b, i) => expect(SPOTS.bales[i]).toEqual({ x: b.x, z: b.z, yaw: b.yaw }));
    expect(BEAT.note).toBe(TUNE.NOTE); expect(BEAT.bar).toBeCloseTo(3 * TUNE.NOTE, 9);
    expect(Math.hypot(WIND.x, WIND.z)).toBeCloseTo(1, 1);
  });
  it('the sound beds blend with where she stands, and the carousel takes its share', () => {
    const mid = bedWeights(0, 30, 0); const far = bedWeights(60, -60, 0);
    expect(mid.hawkers).toBeGreaterThan(0.9); expect(far.hawkers + far.sizzle + far.birds + far.farm).toBe(0);
    expect(bedWeights(0, 30, 1).hawkers).toBeCloseTo(mid.hawkers * 0.5, 6);
    let prev = bedWeights(5.7, 40, 0).sizzle; // walking away from a stall fades smoothly
    for (let z = 40; z > 20; z -= 0.5) { const w = bedWeights(5.7, z, 0).sizzle; expect(Math.abs(w - prev)).toBeLessThan(0.2); prev = w; }
  });
  it('the pennants and the lights keep the calliope\'s bar', () => {
    setFairClock(1000, false); const a = FAIR_CLOCK.flutterA.value; syncToBeat(1000);
    expect(FAIR_CLOCK.flutterA.value).not.toBeNaN();
    syncToBeat(1000 + 2 * BEAT.bar); expect(FAIR_CLOCK.flutterA.value).toBeCloseTo(((1000 / (2 * BEAT.bar)) % 1) * Math.PI * 2, 4); void a;
  });
  it('birds startle when she runs up, and come home; the gate rings once; reduced motion draws no bird', () => {
    const sc = new THREE.Scene(); const ev = [];
    const al = createFairAlive({ scene: sc, onEvent: (e) => ev.push(e) });
    const birds = sc.getObjectByName('fair:birds'); const h = PALS.homes[0];
    for (let i = 0; i < 20; i++) al.update(1 / 30, 100 + i / 30, { x: h[0] - 8, z: h[1] }, 0, 0);
    expect(birds.geometry.attributes.position.array[1]).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) al.update(1 / 30, 101 + i / 30, { x: h[0] - 1, z: h[1] }, 0, 4);
    expect(birds.geometry.attributes.position.array[1]).toBeGreaterThan(0.5); // up in the air or gone
    for (let i = 0; i < 40; i++) al.update(1 / 30, 200 + i / 30, { x: 0, z: 46 - i * 0.05 }, 0, 2);
    expect(ev.filter((e) => e.type === 'arrive').length).toBe(1);
    expect(ev.some((e) => e.type === 'bed')).toBe(true);
    const rm = createFairAlive({ scene: new THREE.Scene(), reducedMotion: true });
    expect(rm.counts.pals.birds).toBe(0); expect(rm.counts.pals.moths).toBe(0);
    const lite = createFairPals({ scene: new THREE.Scene(), scale: 0.25, makePoints: (n) => ({ pts: new THREE.Points(), geo: new THREE.BufferGeometry(), pos: new Float32Array(n * 3), col: new Float32Array(n * 3) }) });
    expect(lite.counts.birds).toBeLessThan(PALS.birds);
  });
  describe('the stray is a real 3D cat (2026-11-28)', () => {
    const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
    const make = (o = {}) => { const sc = new THREE.Scene(); const al = createFairAlive({ scene: sc, ...o }); return { sc, al, cat: sc.getObjectByName('fair:stray') }; };
    it('is one mesh that casts nothing, takes no collider, in the Treehouse cats\' model, with a ginger coat and a pale chest', () => {
      const { sc, cat } = make();
      expect(cat.isMesh).toBe(true); expect(sc.children.filter((o) => o.name === 'fair:stray').length).toBe(1);
      expect(cat.castShadow).toBe(false); expect(cat.userData.noCast).toBe(true); expect(cat.userData.perch).toBeUndefined(); expect(cat.userData.collider).toBeUndefined();
      expect(PALS.stray.look.base).toBe(0xe08a36); expect(PALS.stray.look.belly).toBe(0xfbefd8);
      // its triangles are what the Fair row grows by (place 71,511 + show + this): pinned so a change is on purpose
      expect(tris(cat.geometry)).toBe(STRAY_TRIS);
    });
    it('sits facing the carousel, flicks its tail now and then, edges off when she comes near, hides when she is close', () => {
      const { al, cat } = make(); const S = PALS.stray;
      al.update(1 / 30, 0.5, null, 0, 0);
      const still = cat.geometry;
      expect(cat.visible).toBe(true);
      expect(cat.position.x).toBeCloseTo(S.x, 6); expect(cat.position.z).toBeCloseTo(S.z, 6);
      expect(cat.rotation.y).toBeCloseTo(Math.atan2(S.x, S.z), 6); // the model looks down -z; this turns it to the origin
      let flicked = false;
      for (let t = 0; t < 20; t += 0.05) { al.update(0.05, t, null, 0, 0); if (cat.geometry !== still) flicked = true; }
      expect(flicked).toBe(true);
      for (let i = 0; i < 200; i++) al.update(1 / 30, 30 + i / 30, { x: S.x - 2.5, z: S.z }, 0, 0);
      expect(cat.position.x).toBeGreaterThan(S.x + 0.5); // edged off, away from her
      al.update(1 / 30, 40, { x: cat.position.x - 0.5, z: cat.position.z }, 0, 0);
      expect(cat.visible).toBe(false);
    });
    it('the same walk gives the same cat (no random number), and reduced motion holds it still and visible', () => {
      const run = () => { const { al, cat } = make(); for (let i = 0; i < 300; i++) al.update(1 / 30, 3 + i / 30, { x: 3, z: 4 + (i % 7) * 0.1 }, 0, 1); return [cat.position.x, cat.position.z, cat.rotation.y, cat.visible]; };
      expect(run()).toEqual(run());
      const { al, cat } = make({ reducedMotion: true }); const still = cat.geometry;
      for (let t = 0; t < 30; t += 0.1) al.update(0.1, t, { x: 6, z: 5 }, 0, 0);
      expect(cat.visible).toBe(true); expect(cat.geometry).toBe(still); expect(cat.position.x).toBeCloseTo(PALS.stray.x, 6);
    });
    it('is freed with the life', () => {
      const { sc, al } = make(); al.dispose?.();
      expect(sc.getObjectByName('fair:stray')).toBeUndefined();
    });
  });
});
