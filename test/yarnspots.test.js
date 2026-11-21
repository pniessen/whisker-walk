import { describe, test, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// The found yarn ball's spots (src/propsets.js yarnSpotsFor, controls review
// 2026-11-19), checked against the REAL built areas with the carryables' own
// rules (test/propsets.test.js) and a few of their own: the ball must be
// somewhere a cat can walk up to and bat it, on level ground (it rolls), away
// from water (it floats ashore, main.js), and never where it would be mistaken
// for something else (a find, a POI) or sit inside another prop's prompt.
vi.stubGlobal('document', canvasStub);
const { isWalkableAt, CAT_RADIUS } = await import('../src/player.js');
const { waterClearance, onAnyDeck } = await import('../src/world/builder.js');
const { groundOf } = await import('../src/ground.js');
const { propsFor, yarnSpotsFor, yarnSpotFor } = await import('../src/propsets.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { DISCS } = await import('../src/rivalclans.js');
const { CATALOG } = await import('../src/progression.js');

// and the Market Square, behind ?market=1 until its step 4 (no CATALOG row yet)
const AREAS = [...Object.keys(CATALOG.areas), 'den', 'market'];
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const MARGIN = 0.3;     // propsets.test's clearance for anything a cat walks up to
const PROMPT_GAP = 2.5; // propsets.test's gap between two walk-up props
const CROWD = 2;        // propsets.test's distance from a spawn, find, scenic or POI
const WATER_GAP = 1.5;  // a batted ball should not head straight for the water
const LEVEL = 0.25;     // the ground within 1.5 m rises or falls at most this

const built = {};
async function area(a) {
  if (!built[a]) {
    const w = await import(`../src/world/${a}.js`);
    built[a] = a === 'den' ? w.build(new THREE.Scene(), { placed: {} }) : w.build(new THREE.Scene());
  }
  return built[a];
}

test('every area the game can walk in has two spots, the den too', () => {
  expect(AREAS).toEqual(expect.arrayContaining(['neighborhood', 'park', 'seaside', 'docks', 'woods', 'river', 'moor', 'pines', 'gorge', 'farm', 'fair', 'den']));
  for (const a of AREAS) {
    const spots = yarnSpotsFor(a);
    expect(spots, a).toHaveLength(2);
    for (const p of spots) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.z), a).toBe(true);
      expect(typeof p.where).toBe('string');
      expect(p.where.length).toBeGreaterThan(3);
      expect(p.where).not.toMatch(/[.!]$/); // it finishes a sentence: "The yarn ball is {where}."
      // ...of at most nine words (tutorialwords.test's rule), four of them "The yarn ball is"
      expect(p.where.split(/\s+/).length, p.where).toBeLessThanOrEqual(5);
    }
    expect(d2(spots[0], spots[1]), a).toBeGreaterThan(a === 'den' ? 3 : 5); // the den is a 16 m room
  }
});

describe.each(AREAS)('%s', (a) => {
  test('both spots stand clear, level and away from everything else', async () => {
    const ar = await area(a);
    const g = groundOf(ar);
    const s = propsFor(a);
    const walkUps = [...s.carryables, ...s.rests, ...s.markables, ...(s.dogYard ? [s.dogYard.kennel] : [])];
    const anchors = [ar.spawn, ...(GOLD_MICE[a] ?? []), ...(ar.collectibles ?? []), ...(ar.scenics ?? []), ...(ar.pois ?? [])];
    for (const p of yarnSpotsFor(a)) {
      const at = `${a} ${p.x},${p.z}`;
      expect(isWalkableAt(ar, p.x, p.z), at).toBe(true);
      for (const c of ar.colliders) expect(d2(p, c), `${at} vs collider ${c.x},${c.z}`).toBeGreaterThanOrEqual(c.r + CAT_RADIUS + MARGIN);
      expect(waterClearance(ar.waters, p.x, p.z), at).toBeGreaterThanOrEqual(WATER_GAP);
      expect(onAnyDeck(ar.waters, p.x, p.z), at).toBe(false);
      for (const q of walkUps) expect(d2(p, q), `${at} vs ${q.id ?? 'kennel'}`).toBeGreaterThanOrEqual(PROMPT_GAP);
      for (const k of s.knockables) expect(d2(p, k.fallTo), `${at} vs ${k.id} landed`).toBeGreaterThanOrEqual(1.5);
      for (const f of s.flaps) expect(d2(p, f), `${at} vs ${f.id}`).toBeGreaterThanOrEqual(PROMPT_GAP);
      for (const q of anchors) expect(d2(p, q), `${at} vs ${q.id ?? q.label ?? 'anchor'} at ${q.x},${q.z}`).toBeGreaterThanOrEqual(CROWD);
      if (DISCS[a]) expect(Math.hypot(p.x - DISCS[a].cx, p.z - DISCS[a].cz), `${at} on the rival's land`).toBeGreaterThanOrEqual(DISCS[a].r + 2);
      if (s.dogYard) expect(d2(p, s.dogYard), `${at} in the dog's yard`).toBeGreaterThanOrEqual(s.dogYard.r + 1.5);
      if (!g.flat) {
        const y = g.y(p.x, p.z);
        for (let k = 0; k < 8; k++) {
          const t = (k * Math.PI) / 4;
          expect(Math.abs(g.y(p.x + Math.cos(t) * 1.5, p.z + Math.sin(t) * 1.5) - y), `${at} is on a slope or a rim`).toBeLessThanOrEqual(LEVEL);
        }
      }
    }
  });
});

test('the spot of the day is one of the two, the same for the same key, and both come up', () => {
  for (const a of AREAS) {
    const spots = yarnSpotsFor(a);
    const seen = new Set();
    for (let d = 1; d <= 28; d++) {
      const key = `2026-11-${String(d).padStart(2, '0')}`;
      const p = yarnSpotFor(a, key);
      expect(spots).toContainEqual(p);
      expect(yarnSpotFor(a, key)).toEqual(p);
      seen.add(`${p.x},${p.z}`);
    }
    expect(seen.size, a).toBe(2);
    // a room's seed is a number; both players hash the same one
    expect(yarnSpotFor(a, 123456789)).toEqual(yarnSpotFor(a, 123456789));
  }
  expect(yarnSpotFor('nowhere', 'x')).toBeNull();
  expect(yarnSpotFor('__proto__', 'x')).toBeNull();
  expect(yarnSpotsFor(42)).toEqual([]);
});

test('the spots are frozen and handed out as copies', () => {
  const a = yarnSpotsFor('park');
  a[0].x = 999;
  expect(yarnSpotsFor('park')[0].x).not.toBe(999);
});
