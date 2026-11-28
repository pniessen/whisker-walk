// The Fairground's beauty pass 5 (src/fairpals.js): the copied spots agree with the place, the one wind and beat, the beds' blend, and the creatures' pools.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SPOTS, WIND, BEAT, PALS, bedWeights, createFairPals, syncToBeat } from '../src/fairpals.js';
import { BALE_SEATS, MGR_AT, GATE_AT, GATE_HALF } from '../src/world/fair.js';
import { FERRIS } from '../src/world/fairrides.js';
import { TUNE } from '../src/fairlive.js';
import { FAIR_CLOCK, setFairClock } from '../src/world/fairkit.js';
import { createFairAlive } from '../src/fairalive.js';

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
});
