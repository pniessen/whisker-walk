import { test, expect } from 'vitest';
import { rivalFor, isTrespassing, borderMarks, patrolPath } from '../src/rivalclans.js';
import { CLAN_SUFFIX, DENIED_NAMES } from '../src/clanwords.js';
import { GOLD_MICE } from '../src/goldmice.js';
import { SPAWN as NEIGH_SPAWN } from '../src/world/neighborhood.js';
import { SPAWN as PARK_SPAWN } from '../src/world/park.js';
import { SPAWN as SEA_SPAWN } from '../src/world/seaside.js';
import { SPAWN as DOCKS_SPAWN } from '../src/world/docks.js';

const AREAS = ['neighborhood', 'park', 'seaside', 'docks'];
const SPAWNS = { neighborhood: NEIGH_SPAWN, park: PARK_SPAWN, seaside: SEA_SPAWN, docks: DOCKS_SPAWN };

test('each of the four areas has one rival clan with a usable name', () => {
  for (const a of AREAS) {
    const r = rivalFor(a);
    expect(r).not.toBeNull();
    expect(r.name.endsWith(CLAN_SUFFIX)).toBe(true);
    expect(DENIED_NAMES.has(r.name)).toBe(false);
    expect(r.r).toBeGreaterThan(0);
  }
});

test('the four rival clans have four different names', () => {
  expect(new Set(AREAS.map((a) => rivalFor(a).name)).size).toBe(4);
});

test('territory, marks and patrol are identical on a second call', () => {
  for (const a of AREAS) {
    expect(rivalFor(a)).toEqual(rivalFor(a));
    expect(borderMarks(a)).toEqual(borderMarks(a));
    expect(patrolPath(a)).toEqual(patrolPath(a));
  }
});

test('border marks sit on the border, not scattered through the area', () => {
  for (const a of AREAS) {
    const { cx, cz, r } = rivalFor(a);
    for (const m of borderMarks(a)) {
      expect(Math.abs(Math.hypot(m.x - cx, m.z - cz) - r)).toBeLessThan(1.0);
    }
  }
});

test('trespassing is inside the disc and nowhere else', () => {
  for (const a of AREAS) {
    const { cx, cz, r } = rivalFor(a);
    expect(isTrespassing(a, cx, cz)).toBe(true);
    expect(isTrespassing(a, cx + r * 2, cz)).toBe(false);
  }
});

// No golden mouse may sit behind a gate. docks.js's invariant is that the
// Docks stays playable without Sea Legs; the same reasoning applies here.
test('no golden mouse is inside a rival territory', () => {
  for (const a of AREAS) {
    for (const m of GOLD_MICE[a]) expect(isTrespassing(a, m.x, m.z)).toBe(false);
  }
});

// R19: the cat must not start a walk already trespassing.
test('each area\'s player spawn point is outside its rival disc', () => {
  for (const a of AREAS) {
    expect(isTrespassing(a, SPAWNS[a].x, SPAWNS[a].z)).toBe(false);
  }
});

test('each disc is modest: roughly 5 to 9 metres', () => {
  for (const a of AREAS) {
    expect(rivalFor(a).r).toBeGreaterThanOrEqual(5);
    expect(rivalFor(a).r).toBeLessThanOrEqual(9);
  }
});

// Review Focus 2 — the den, and the fifth area Stream 6 adds.
test.each(['den', 'future-area', '', null, undefined, 42, {}, '__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
  'an unknown area has no rival rather than throwing: %p', (bad) => {
    expect(rivalFor(bad)).toBeNull();
    expect(borderMarks(bad)).toEqual([]);
    expect(patrolPath(bad)).toEqual([]);
    expect(isTrespassing(bad, 0, 0)).toBe(false);
  });

test.each([NaN, Infinity, -Infinity, '0', null, undefined])(
  'a non-finite position is not trespassing: %p', (bad) => {
    expect(isTrespassing('park', bad, 0)).toBe(false);
    expect(isTrespassing('park', 0, bad)).toBe(false);
  });

test('the mark count is bounded, so the decal budget is bounded', () => {
  for (const a of AREAS) expect(borderMarks(a).length).toBeLessThanOrEqual(16);
});

test('marks and the patrol are non-empty ordered rings of finite points', () => {
  for (const a of AREAS) {
    expect(borderMarks(a).length).toBeGreaterThanOrEqual(4);
    const p = patrolPath(a);
    expect(p.length).toBeGreaterThanOrEqual(4);
    for (const pt of p) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.z)).toBe(true);
    }
  }
});

test('results are fresh: mutating one call cannot corrupt the next', () => {
  for (const a of AREAS) {
    const r0 = rivalFor(a); const m0 = borderMarks(a); const p0 = patrolPath(a);
    const r = rivalFor(a); r.cx = 999; r.name = 'x';
    const m = borderMarks(a); m[0].x = 999; m.length = 0;
    const p = patrolPath(a); p[0].z = 999; p.length = 0;
    expect(rivalFor(a)).toEqual(r0);
    expect(borderMarks(a)).toEqual(m0);
    expect(patrolPath(a)).toEqual(p0);
  }
});

test('the start of the marks depends on the area id, not on chance', () => {
  const starts = AREAS.map((a) => {
    const { cx, cz } = rivalFor(a);
    const m = borderMarks(a)[0];
    return Math.atan2(m.z - cz, m.x - cx).toFixed(6);
  });
  expect(new Set(starts).size).toBeGreaterThan(1);
});
