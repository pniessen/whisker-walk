import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { CATALOG } = await import('../src/progression.js');
const { setTele } = await import('../src/teleflag.js');
const { arrivalFor, GATE_REACH } = await import('../src/gateways.js');
const { isWalkableAt } = await import('../src/player.js');
const { floodFrom } = await import('./helpers/flood.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { LOOK_BUDGET, buildTeleGate, addTeleGates, teleSolids } = await import('../src/world/telegate.js');
const docks = await import('../src/world/docks.js');
const { teleKit } = await import('./helpers/tele.js');
const T = await teleKit();

// The Crystal Cave's way in (C6): a grotto in the rock at the Old Docks' far edge, awake after 2 Docks walks, free, both editions, no suit;
// the cave's own arch is the way home. The Reef's cleft look drawn with no ladder and no buoy.
afterEach(() => setTele(null));
const DC = T.TELE_ENDS.docks[0];
const CD = T.TELE_ENDS.crystal[0];

describe('the gate table', () => {
  it('is one pair: the Docks grotto (no suit, awake after 2 Docks walks, both editions) and the cave\'s own return arch', () => {
    expect(DC).toMatchObject({ id: 'docks-crystal', to: 'crystal', twin: 'crystal-docks', look: 'grotto', suit: null, placement: 'inside', edition: 'all', needWalks: 2, own: false, kind: 'tele' });
    expect(CD).toMatchObject({ id: 'crystal-docks', to: 'docks', twin: 'docks-crystal', look: 'grotto', suit: null, edition: 'all', needWalks: 0, own: true, x: 0, z: 31, faces: 'north' });
    expect(T.CRYSTAL_NEED_WALKS).toBe(CATALOG.areas.crystal.requires.walks);
    expect(DC.needWalks).toBe(CATALOG.areas.crystal.requires.walks);
  });
  it('she lands 3.6 m out from the twin, facing it, both ways', () => {
    const there = arrivalFor('docks-crystal', T.TELE_ENDS);
    const back = arrivalFor('crystal-docks', T.TELE_ENDS);
    expect(there).toMatchObject({ areaId: 'crystal', x: 0, z: 34.6, yaw: 0 });
    expect(back.areaId).toBe('docks');
    expect(Math.hypot(back.x - DC.x, back.z - DC.z)).toBeCloseTo(3.6, 9);
  });
  it('the cave\'s arch is its own (draws nothing here); the grotto is drawn at the Docks with three solids', () => {
    setTele(true);
    expect(T.liveTeleEnds('crystal', CATALOG)).toEqual([CD]);
    expect(addTeleGates(new THREE.Scene(), T.liveTeleEnds('crystal', CATALOG).filter((e) => !e.own)).colliders).toEqual([]);
    expect(T.liveTeleEnds('docks', CATALOG)).toContainEqual(DC);
    expect(addTeleGates(new THREE.Scene(), [DC]).colliders).toHaveLength(3);
    expect(teleSolids(DC)).toHaveLength(3);
  });
});

describe('where the grotto stands', () => {
  const area = docks.build(new THREE.Scene());
  it('is clear of every collider and golden mouse, inside the bounds, and her landing spot is open and reached on foot', () => {
    for (const c of area.colliders) expect(Math.hypot(c.x - DC.x, c.z - DC.z) - (c.r ?? 0), `collider (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(2.2);
    const things = [...(area.pois ?? []), ...(area.collectibles ?? []), ...(area.scenics ?? []), ...(area.perches ?? []), ...(GOLD_MICE.docks ?? [])];
    expect(things.length).toBeGreaterThan(3);
    for (const t of things) expect(Math.hypot(t.x - DC.x, t.z - DC.z), `thing at (${t.x}, ${t.z})`).toBeGreaterThanOrEqual(4);
    const reachable = floodFrom(area, docks.SPAWN, (x, z) => isWalkableAt(area, x, z));
    expect(isWalkableAt(area, DC.arrive.x, DC.arrive.z)).toBe(true);
    expect(reachable.reaches(DC.arrive.x, DC.arrive.z)).toBe(true);
    expect(reachable.reaches(DC.x, DC.z + 1.5)).toBe(true);
    expect(Math.hypot(DC.arrive.x - DC.x, DC.arrive.z - DC.z)).toBeGreaterThan(GATE_REACH + 1);
  });
  it('the look fits the gate allowance: 3 meshes, 1 transparent draw, no ladder (fewer triangles than the cleft)', () => {
    const count = (end) => { const g = buildTeleGate(end, { calm: true }); let n = 0; const m = []; g.traverse((o) => { if (o.isMesh) { m.push(o); n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); return { g, n, m }; };
    const a = count(DC);
    expect(a.m).toHaveLength(3);
    expect(a.n).toBeLessThanOrEqual(LOOK_BUDGET.triangles);
    expect(a.m.filter((x) => x.material.transparent)).toHaveLength(LOOK_BUDGET.transparent);
    expect(a.g.userData.look).toBe('grotto');
  });
});

describe('the Seaside gate (live bug fixed in C6)', () => {
  it('the cleft look draws rocks with the ladder and buoy, not the stone ring; the grotto has neither', () => {
    const SR = T.TELE_ENDS.seaside[0];
    const verts = (end) => buildTeleGate(end, { calm: true }).getObjectByName('teleBody').geometry.attributes.position.count;
    expect(verts(SR)).not.toBe(verts({ ...SR, look: 'stonering' }));
    expect(verts({ ...SR, look: 'grotto' })).not.toBe(verts(SR));
  });
});
