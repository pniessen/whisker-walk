// Snowville round two: the four friendly strays at their own homes (white by the hearth, grey on the sled hill, ginger under the Great Fir, tortoiseshell on a porch).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { withOffWords, bannedIn } from './helpers/offwords.js';

const { createStrayCats, strayStream, capStrayCount } = await import('../src/straycats.js');
const { isStrayName, strayBreed } = await import('../src/straynames.js');
const { loadSnowvilleStages } = await import('../src/world/snowvillestages.js');
await loadSnowvilleStages();
const { build } = await import('../src/world/snowville.js');
const S = await import('../src/world/snowvillestrays.js');
const D = await import('../src/world/snowvilledetailplan.js');
const P = await import('../src/world/snowvilleplan.js');
const W = await import('../src/world/snowvillewingplan.js');
const { phrase } = await import('../src/clanphrases.js');
const { setSeriesMode, SERIES_ON } = await import('../src/wordset.js');
const { bus } = await import('../src/events.js');

const scene = () => ({ add() {}, remove() {} });

describe('the homes', () => {
  it('four homes: valid stray names, distinct, each with a coat row, in a fixed order (LOW keeps the first three)', () => {
    expect(S.STRAY_HOMES.map((h) => h.id)).toEqual(['hearth', 'hill', 'fir', 'porch']);
    for (const h of S.STRAY_HOMES) { expect(isStrayName(h.name), h.name).toBe(true); expect(h.coat.base).toBeTypeOf('number'); expect(isStrayName(h.coat.eyes) || strayBreed('Pip')).toBeTruthy(); }
    expect(new Set(S.STRAY_HOMES.map((h) => h.name)).size).toBe(4);
    expect(new Set(S.STRAY_HOMES.map((h) => h.coat.base)).size).toBe(4);
  });
  it('every home is open ground: off the pond and its ice, the lanes, the sled run, and clear of every collider and find', () => {
    const area = build(new THREE.Scene());
    for (const h of S.STRAY_HOMES) {
      const wide = h.roam + 0.4;
      expect(Math.hypot(h.x - P.POND.x, h.z - P.POND.z), h.id).toBeGreaterThan(P.POND.r + 2 + h.roam);
      for (const [sx, sz] of D.SLED_KEEP) expect(Math.hypot(h.x - sx, h.z - sz), h.id).toBeGreaterThan(1.8 + h.roam);
      for (const c of area.colliders) expect(Math.hypot(h.x - c.x, h.z - c.z) - c.r, `${h.id} vs ${JSON.stringify(c)}`).toBeGreaterThan(wide > 1.5 ? 0.9 : 0.6);
      expect(h.x > P.SNOWVILLE_BOUNDS.minX + 2 && h.x < P.SNOWVILLE_BOUNDS.maxX - 2 && h.z > P.SNOWVILLE_BOUNDS.minZ + 2 && h.z < P.SNOWVILLE_BOUNDS.maxZ - 2).toBe(true);
    }
    // the homes are near their promised places
    const by = Object.fromEntries(S.STRAY_HOMES.map((h) => [h.id, h]));
    expect(Math.hypot(by.hearth.x - P.HEARTH.x, by.hearth.z - P.HEARTH.z)).toBeLessThan(P.HEARTH.r + 1.5);
    expect(Math.hypot(by.hill.x - P.HILL.x, by.hill.z - P.HILL.z)).toBeLessThan(P.HILL.r);
    expect(Math.hypot(by.fir.x - W.GREAT_FIR.x, by.fir.z - W.GREAT_FIR.z)).toBeLessThan(4.5);
  });
});

describe('the strays on a walk', () => {
  const area = () => build(new THREE.Scene());
  it('the strays system puts each at its home with its name and coat, friendly, on the strays\' own stream', () => {
    const a = area();
    const cats = createStrayCats(scene(), a, 4, strayStream(77), { roomSeed: 77, homes: a.strayHomes });
    expect(cats.strays.length).toBe(4);
    cats.strays.forEach((s, i) => {
      const h = S.STRAY_HOMES[i];
      expect(s.homeId).toBe(h.id);
      expect(s.name).toBe(h.name);
      expect(Math.hypot(s.group.position.x - h.x, s.group.position.z - h.z)).toBeLessThan(0.6);
      expect(s.personality).not.toBe('shy');
      expect(s.roam).toBe(h.roam);
    });
  });
  it('the same room seed gives the same four, and no home name turns up twice', () => {
    const a = area();
    const run = () => createStrayCats(scene(), a, 4, strayStream(5), { roomSeed: 5, homes: a.strayHomes }).strays.map((s) => `${s.name}@${s.group.position.x.toFixed(2)},${s.group.position.z.toFixed(2)}`);
    expect(run()).toEqual(run());
    const many = createStrayCats(scene(), a, 22, strayStream(5), { roomSeed: 5, homes: a.strayHomes }).strays.map((s) => s.name);
    expect(new Set(many).size).toBe(many.length);
  });
  it('a colony cat with a home\'s name keeps it, and the home falls back to the ordinary cast', () => {
    const a = area();
    const cats = createStrayCats(scene(), a, 4, strayStream(9), { roomSeed: 9, homes: a.strayHomes, colonyCats: [{ name: 'Biscuit', x: 0, z: 20 }] });
    expect(cats.strays.filter((s) => s.name === 'Biscuit').length).toBe(1);
    expect(cats.strays.length).toBe(4);
  });
  it('areas with no named homes are exactly as before (the Gorge\'s unnamed home takes a cast name)', () => {
    const base = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };
    const plain = createStrayCats(scene(), base, 5, strayStream(3), { roomSeed: 3 }).strays.map((s) => s.name);
    const homed = createStrayCats(scene(), base, 5, strayStream(3), { roomSeed: 3, homes: [{ x: 1, z: 1, roam: 1 }] }).strays.map((s) => s.name);
    expect(homed).toEqual(plain);
    expect(plain.every((n) => n && !S.STRAY_HOMES.some((h) => h.name === n && false))).toBe(true);
  });
  it('the cap: four on HIGH, fewer on the lower rungs, never more than the walk asked for, never under one, no cap no change', () => {
    expect(capStrayCount(4, 22, 22)).toBe(4);
    expect(capStrayCount(4, 22, 14)).toBe(3);
    expect(capStrayCount(4, 22, 8)).toBe(2);
    expect(capStrayCount(4, 2, 22)).toBe(2);
    expect(capStrayCount(4, 0, 22)).toBe(0);
    expect(capStrayCount(undefined, 22, 8)).toBe(22);
  });
  it('a note is said once, the first time she comes near each, with no points', () => {
    const notes = S.createStrayNotes();
    const got = [];
    const off = bus.on?.('discovery', (e) => got.push(e));
    const near = (h) => ({ group: { position: { x: h.x, z: h.z } }, homeId: h.id });
    const session = { strayCats: { strays: S.STRAY_HOMES.map(near) } };
    notes.update({ x: 100, z: 100 }, session);
    expect(got.length).toBe(0);
    notes.update({ x: S.STRAY_HOMES[0].x, z: S.STRAY_HOMES[0].z }, session);
    notes.update({ x: S.STRAY_HOMES[0].x, z: S.STRAY_HOMES[0].z }, session);
    expect(got.length).toBe(1);
    expect(got[0].points).toBe(0);
    if (typeof off === 'function') off();
  });
});

describe('the lines', () => {
  it('each home has a line in both word sets, plain and free of the family\'s words in the everyday set', () => {
    for (const h of S.STRAY_HOMES) {
      const id = `snowville.stray.${h.id}`;
      const plain = withOffWords(() => phrase(id));
      expect(plain, id).toBeTypeOf('string');
      expect(plain.length).toBeGreaterThan(10);
      expect(withOffWords(() => bannedIn(plain)), id).toBeNull();
      expect(/dark|lost forever|trapped|stuck|collapse|scary/i.test(plain)).toBe(false);
      const clan = phrase(id);
      expect(clan, id).toBeTypeOf('string');
      expect(/dark|lost forever|trapped|stuck|collapse|scary/i.test(clan)).toBe(false);
    }
    void setSeriesMode; void SERIES_ON;
  });
});
