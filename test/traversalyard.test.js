import { describe, it, expect } from 'vitest';

const Y = await import('../src/world/traversalyard.js');
const { validateGround } = await import('../src/ground.js');
const { validateTraversal, BASE_ABILITIES, GAP_MAX, DROP_MAX } = await import('../src/traversal.js');
const { floodTraversal } = await import('./helpers/traversalflood.js');
const area = Y.yardArea();

describe('the test yard', () => {
  it('the yard’s ground and moves pass their rules', () => {
    expect(validateGround(Y.YARD_GROUND)).toEqual([]);
    expect(validateTraversal(Y.YARD_TRAVERSAL, { ground: area.ground, bounds: area.bounds })).toEqual([]);
  });
  it('has what step 1 promised: planks, a ridge, a washing line, three gaps, two raised levels joined by drops in steps', () => {
    const kinds = area.traversal.crossings.map((c) => c.kind);
    expect(kinds.filter((k) => k === 'plank').length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain('ridge');
    expect(kinds).toContain('line');
    const gaps = area.traversal.hops.filter((h) => h.kind === 'leap');
    expect(gaps).toHaveLength(3);
    expect(gaps.filter((g) => g.dist > GAP_MAX)).toHaveLength(1);
    const drops = area.traversal.hops.filter((h) => h.kind === 'drop');
    expect(drops.every((d) => -d.dy <= DROP_MAX)).toBe(true);
    expect(drops.map((d) => d.id)).toEqual(expect.arrayContaining(['drop-1', 'drop-4']));
  });

  const all = floodTraversal(area, { abilities: { ...BASE_ABILITIES, longLeap: true } });
  const base = floodTraversal(area);
  const yard = base.regionAt(Y.YARD_SPAWN.x, Y.YARD_SPAWN.z);

  it('is never stuck: from every place she can get to, there is a way back to the yard without Long Leap', () => {
    const visitable = all.reachable(all.regionAt(Y.YARD_SPAWN.x, Y.YARD_SPAWN.z));
    const stuck = [...visitable].filter((r) => !base.reachable(r).has(yard)).map((r) => base.levelOf(r));
    expect(stuck).toEqual([]);
  });
  it('every roof but lowS can be reached without Long Leap; lowS only with it', () => {
    const got = base.reachable(yard);
    const places = { west: [-12, -10], east: [3, -10], east2: [3, 0], lowE: [14, 0], chimney: [13.4, -11], tank: [-14, -3.5], shed: [-12, 2] };
    for (const [name, [x, z]] of Object.entries(places)) expect([name, got.has(base.regionAt(x, z))]).toEqual([name, true]);
    const lowS = base.regionAt(14, 10);
    expect(got.has(lowS)).toBe(false);
    expect(all.reachable(all.regionAt(Y.YARD_SPAWN.x, Y.YARD_SPAWN.z)).has(lowS)).toBe(true);
  });
  it('a plank over the yard leaves the yard walkable under it', () => {
    expect(area.ground.y(-5, -13)).toBe(0);
    expect(area.ground.canStep(-5, -14, -5, -12)).toBe(true);
  });
});
